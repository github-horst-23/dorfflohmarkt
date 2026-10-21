// All stand data is loaded from Supabase. Retain favorites from the former examples.
const legacyStandIds={
  'example-anne-frank':'20288ed3-2b71-520c-b98b-ba928e3011ac',
  'example-goethe':'0ad76c3b-8c2b-51d2-897b-cb2ae1417d27',
  'example-beethoven':'943afd79-7ef8-5146-bcfd-7358a2edeba6'
};
const SUPABASE_REFRESH_INTERVAL=5*60*1000;
const GEOCODING_PROVIDER='here';
const GEOCODING_MAX_AGE=29*24*60*60*1000;
let stands=[];
let appActive=null,appActivitySaving=false;
let manualStandGeocodingAddress=null;
const geocodingDiagnostics=new Map(),geocodingRetries=new Set();
let publishedStandListReady=false;
const supabaseConfig=window.DORFFLOHMARKT_SUPABASE||{};
const supabaseClient=window.supabase?.createClient&&supabaseConfig.url&&supabaseConfig.anonKey?window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey):null;
// Public stand reads must not depend on an expired admin session or its auth lock.
const publicStandClient=supabaseClient?window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'dorfflohmarkt-public-stands'}
}):null;
const getFavs=()=>{try{const saved=JSON.parse(localStorage.getItem('dorfflohmarkt-favs')||'[]');return Array.isArray(saved)?[...new Set(saved.filter(id=>typeof id==='string').map(id=>legacyStandIds[id]||id))]:[]}catch{return []}};
let favorites=getFavs(),activeFilter='Alle',search='';
const favoriteRouter=window.createFavoriteRouter();
const favoriteRouteState={signature:'',controller:null,busy:false};
const featureFilters={favorites:false,food:false};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const standAddressCollator=new Intl.Collator('de',{numeric:true,sensitivity:'base'});
function compareStandAddresses(a,b){return standAddressCollator.compare(streetAddress(a.address),streetAddress(b.address))||standAddressCollator.compare(String(a.id),String(b.id))}
const categoryKey=value=>String(value).replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLocaleLowerCase('de');
const configuredCategories=()=>new Map($$('#registrationForm input[name="category"]').map(input=>[categoryKey(input.value),input.value]));
function normalizeCategories(values){
  const parts=(Array.isArray(values)?values:[]).map(value=>String(value).trim()).filter(Boolean),known=configuredCategories(),result=[];
  for(let index=0;index<parts.length;){
    let match='',consumed=0;
    for(let length=Math.min(6,parts.length-index);length>0;length--){
      const candidate=parts.slice(index,index+length).join(', ');
      const canonical=known.get(categoryKey(candidate));
      if(canonical){match=canonical;consumed=length;break}
    }
    result.push(match||parts[index]);index+=consumed||1;
  }
  return result;
}
const geocodingReport=document.createElement('details');
geocodingReport.className='admin-manual-entry geocoding-report';
geocodingReport.innerHTML='<summary id="geocodingReportHeading">Geocodierung: Fehlerbericht <span id="geocodingReportCount" class="admin-count-badge" aria-label="Stände ohne Kartenposition">0</span></summary><p>Veröffentlichte Stände ohne genaue Kartenposition. Laufende und noch ausstehende Suchen sind gesondert gekennzeichnet.</p><p id="geocodingReportSummary" role="status"></p><button class="primary-button" type="button" data-geocode-all>Alle erneut versuchen</button><p id="geocodingReportMessage" role="status"></p><div id="geocodingReportList"></div>';
$('#adminDashboard .admin-manage-entry').after(geocodingReport);
function hasStandPosition(stand){return Number.isFinite(stand.lat)&&Number.isFinite(stand.lng)&&Math.abs(stand.lat)<=90&&Math.abs(stand.lng)<=180&&stand.geocodingSource===GEOCODING_PROVIDER&&stand.geocodingExpiresAt>Date.now()}
function renderGeocodingReport(){
  const host=$('#geocodingReportList');
  const unresolved=stands.filter(stand=>!hasStandPosition(stand)).sort((a,b)=>streetAddress(a.address).localeCompare(streetAddress(b.address),'de',{numeric:true}));
  $('#geocodingReportCount').textContent=String(unresolved.length);
  updateAdminTodoCount();
  if($('#adminDashboard').hidden){host.replaceChildren();return}
  const explanations={APP_STATUS_UNAVAILABLE:'Der Server kann den App-Status nicht lesen. Geocodierungsfunktion und Serverberechtigungen prüfen.',APP_INACTIVE:'Die App ist pausiert; die Positionssuche ist deaktiviert.',SERVICE_AUTH_ERROR:'Der Server hat den App-Zugriff abgewiesen. Funktionskonfiguration prüfen.',LOOKUP_RUNNING:'Suche läuft …',PENDING:'Eine andere Anfrage ermittelt die Position bereits.',ZERO_RESULTS:'Keine passende Adresse gefunden.',INEXACT_RESULT:'Nur eine ungenaue Position gefunden; kein Haus-Pin gesetzt.',OUTSIDE_TOWN:'Ergebnis liegt außerhalb von 67373 Dudenhofen.',OVER_QUERY_LIMIT:'Anfragelimit des Geocodierungsdienstes erreicht.',UNAVAILABLE:'Geocodierungsdienst oder Verbindung derzeit nicht verfügbar.',NOT_CONFIGURED:'Geocodierung ist nicht eingerichtet oder deaktiviert.',REQUEST_DENIED:'Der Geocodierungsdienst hat die Anfrage abgelehnt. Freischaltung oder Dienstkonfiguration prüfen.',NOT_PUBLISHED:'Stand ist für die Positionssuche nicht als veröffentlicht verfügbar.',INVALID_RESULT:'Der Dienst hat keine verwendbare genaue Position geliefert.'};
  $('#geocodingReportSummary').textContent=!publishedStandListReady?'Standdaten werden geladen …':unresolved.length?`${unresolved.length} von ${stands.length} veröffentlichten Ständen ohne genaue Kartenposition.`:'Alle veröffentlichten Stände haben eine Kartenposition.';
  const date=value=>new Date(value).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
  host.innerHTML=unresolved.map(stand=>{
    const diagnostic=geocodingDiagnostics.get(stand.id),issue=diagnostic?.address===stand.address?diagnostic:null;
    const running=issue?.code==='LOOKUP_RUNNING'||geocodingRetries.has(stand.id);
    const retryAt=Date.parse(issue?.retryAt);
    return `<article class="geocoding-issue"><h4>${escapeHtml(streetAddress(stand.address))}</h4><p>${escapeHtml(issue?explanations[issue.code]||'Die genaue Position konnte nicht ermittelt werden.':'Noch nicht geprüft oder bisher kein Ergebnis verfügbar.')}</p>${issue?`<small>Letzte Rückmeldung: ${date(issue.checkedAt)}${Number.isFinite(retryAt)&&retryAt>Date.now()?` · Erneuter Versuch frühestens ${date(retryAt)}`:''}</small>`:''}<div class="admin-actions"><button class="secondary-button" type="button" data-geocode-retry="${escapeHtml(stand.id)}" ${running?'disabled':''}>${running?'Suche läuft …':'Erneut versuchen'}</button><button class="secondary-button" type="button" data-geocode-edit="${escapeHtml(stand.id)}">Adresse bearbeiten</button></div></article>`;
  }).join('');
  $('[data-geocode-all]').disabled=!unresolved.length||geocodingRetries.size>0||!publishedStandListReady;
}
geocodingReport.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||$('#adminDashboard').hidden)return;
  if(button.hasAttribute('data-geocode-edit')){
    const form=$$('.admin-stand-edit').find(form=>form.dataset.standId===button.dataset.geocodeEdit);
    if(form){form.closest('details').open=true;$('#adminDashboard .admin-manage-entry').open=true;form.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('[name="address"]').focus({preventScroll:true})}
    return;
  }
  const selected=button.hasAttribute('data-geocode-all')?stands.filter(stand=>!hasStandPosition(stand)):stands.filter(stand=>stand.id===button.dataset.geocodeRetry);
  if(!selected.length||selected.some(stand=>geocodingRetries.has(stand.id)))return;
  selected.forEach(stand=>geocodingRetries.add(stand.id));renderGeocodingReport();
  $('#geocodingReportMessage').textContent='Positionssuche wird erneut angefragt. Serverseitige Wartezeiten bleiben wirksam.';
  try{await locateStandAddresses(selected,{retry:true});$('#geocodingReportMessage').textContent='Anfrage abgeschlossen. Erfolgreich zugeordnete Stände verschwinden aus dem Bericht; übrige Rückmeldungen stehen unten.'}
  catch{$('#geocodingReportMessage').textContent='Positionssuche konnte nicht abgeschlossen werden. Bitte später erneut versuchen.'}
  finally{selected.forEach(stand=>geocodingRetries.delete(stand.id));renderGeocodingReport()}
});
const adminManualForm=$('#registrationForm').cloneNode(true);
adminManualForm.id='adminManualForm';
adminManualForm.hidden=false;
adminManualForm.classList.add('admin-manual-form');
adminManualForm.querySelectorAll('[required]').forEach(field=>field.required=false);
adminManualForm.querySelectorAll('.required-note').forEach(note=>note.remove());
adminManualForm.querySelector('[name="address"]').required=true;
adminManualForm.querySelector('[name="consent"]').required=true;
const manualAddressNote=document.createElement('small');
manualAddressNote.className='required-note';manualAddressNote.textContent='Pflichtfeld';
adminManualForm.querySelector('[name="address"]').closest('label').querySelector('.field-label').append(' ',manualAddressNote);
adminManualForm.querySelector('.input-hint').textContent='Wähle passende Warengruppen aus.';
adminManualForm.querySelectorAll('.optional').forEach(note=>note.remove());
adminManualForm.querySelector('.rules-confirmation').remove();
adminManualForm.querySelector('.consent span').textContent='Einwilligung der teilnehmenden Person liegt vor.';
adminManualForm.querySelector('.privacy-note').remove();
adminManualForm.querySelector('.submit-button').innerHTML='Stand direkt veröffentlichen <span>→</span>';
adminManualForm.querySelectorAll('.category-group').forEach(group=>group.open=false);
adminManualForm.querySelectorAll('[id]').forEach(element=>{if(element!==adminManualForm)element.id=`admin-${element.id}`});
$('#adminManualFormHost').append(adminManualForm);
const adminManualStatus=document.createElement('p');
adminManualStatus.className='admin-message';adminManualStatus.setAttribute('role','status');
$('#adminManualFormHost').append(adminManualStatus);

let marketDay=new Date(2027,8,1,0,0,0);
let marketDayEnd=new Date(2027,8,2,0,0,0);
let countdownVisible=true,countdownSaving=false;
function renderCountdownVisibility(){
  $$('.countdown-badge').forEach(badge=>badge.hidden=countdownVisible!==true);
  const toggle=$('#countdownVisibilityToggle');
  if(!toggle)return;
  toggle.disabled=countdownSaving;
  toggle.setAttribute('aria-checked',String(countdownVisible===true));
  $('#countdownVisibilityStatus').textContent=countdownSaving?'Einstellung wird gespeichert …':countdownVisible?'Der Countdown wird an allen vorgesehenen Stellen angezeigt.':'Der Countdown ist an allen öffentlichen Stellen ausgeblendet.';
}
function setMarketDate(value){
  const [year,month,day]=value.split('-').map(Number);
  if(!year||!month||!day)return false;
  marketDay=new Date(year,month-1,day,0,0,0);
  marketDayEnd=new Date(year,month-1,day+1,0,0,0);
  const formatted=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(marketDay);
  $$('.countdown-date-label').forEach(label=>label.textContent=`NÄCHSTER DORFFLOHMARKT · ${formatted}`);
  $$('.countdown-badge').forEach(badge=>badge.setAttribute('aria-label',`Countdown bis zum Dorfflohmarkt am ${new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long',year:'numeric'}).format(marketDay)}`));
  const dateInput=$('#eventDateInput');
  if(dateInput)dateInput.value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  updateCountdown();
  return true;
}
function updateCountdown(){
  const now=new Date();
  let text='';
  if(now>=marketDay&&now<marketDayEnd)text='Heute ist Dorfflohmarkt!';
  else if(now>=marketDayEnd)text='Der Dorfflohmarkt ist vorbei.';
  else{
  const seconds=Math.floor((marketDay-now)/1000);
  const days=Math.floor(seconds/86400);
  const hours=Math.floor(seconds%86400/3600);
  const minutes=Math.floor(seconds%3600/60);
  const remainingSeconds=seconds%60;
    text=`${days} Tage · ${String(hours).padStart(2,'0')} Std · ${String(minutes).padStart(2,'0')} Min · ${String(remainingSeconds).padStart(2,'0')} Sek`;
  }
  $$('.countdown-timer').forEach(timer=>timer.textContent=text);
}
updateCountdown();
renderCountdownVisibility();
setInterval(updateCountdown,1000);
function saveFavs(){try{localStorage.setItem('dorfflohmarkt-favs',JSON.stringify(favorites))}catch{console.warn('Favoriten können derzeit nur im Arbeitsspeicher gehalten werden.')}renderCounts();renderStands();}
function renderCounts(){$('#drawerFavCount').textContent=favorites.length;$('#favoritesSummary').textContent=`${favorites.length} ${favorites.length===1?'Stand':'Stände'}`}
function mainCategory(category){
  const value=String(category).trim();
  if(/^Sonstiges(?:\s*:|$)/i.test(value))return 'Sonstiges';
  if(/Kleidung|Bekleidung/i.test(value))return 'Kleidung';
  if(/Fahrr|Roller|Dreirad|Dreiräder/i.test(value))return 'Fahrräder, etc.';
  if(/Spiel|Bücher|Buch|Musik|Film|Medien|Elektronik/i.test(value))return 'Spiele, Musik, Elektronik';
  return 'Sonstiges';
}
function matches(s){
  const cats=s.categories||[];
  const filterMatch=activeFilter==='Alle'||cats.some(category=>mainCategory(category)===activeFilter);
  return (!search||`${s.address||''} ${cats.join(' ')}`.toLowerCase().includes(search))&&filterMatch&&
    (!featureFilters.favorites||favorites.includes(s.id))&&(!featureFilters.food||s.food_available==='Ja');
}
function escapeHtml(value=''){return String(value).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function streetAddress(address,fallback='Standadresse folgt'){
  return String(address||'').split(',')[0].replace(/\s*\b\d{5}\b.*$/,'').trim()||fallback;
}
function localStandAddress(address){const street=streetAddress(address,'');return street?`${street}, 67373 Dudenhofen`:'67373 Dudenhofen'}
function card(s){
  const liked=favorites.includes(s.id),heading=streetAddress(s.address);
  return `<article class="stand-card"><div class="stand-card-top"><h3>${escapeHtml(heading)}</h3><button class="favorite-toggle ${liked?'active':''}" data-fav="${escapeHtml(s.id)}" aria-label="${liked?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}: ${escapeHtml(heading)}">${liked?'★':'☆'}</button></div><details class="stand-public-details"><summary>Standdetails</summary><dl><dt>Alle Angebote</dt><dd>${(s.categories||[]).length?`<ul>${s.categories.map(category=>`<li>${escapeHtml(category)}</li>`).join('')}</ul>`:'Keine Angaben.'}</dd><dt>Verpflegung</dt><dd>${s.food_available==='Ja'?escapeHtml(s.food_description||'Verpflegung wird angeboten.'):'Keine Verpflegung.'}</dd></dl></details></article>`;
}
const b39Divider=[[8.35,49.31555],[8.365,49.3153],[8.38,49.31475],[8.395,49.31425],[8.41,49.3139]];
function b39LatitudeAt(longitude){
  const lng=Number(longitude);
  if(!Number.isFinite(lng))return b39Divider[2][1];
  for(let index=1;index<b39Divider.length;index++){
    const [leftLng,leftLat]=b39Divider[index-1],[rightLng,rightLat]=b39Divider[index];
    if(lng<=rightLng){const ratio=Math.max(0,Math.min(1,(lng-leftLng)/(rightLng-leftLng)));return leftLat+(rightLat-leftLat)*ratio}
  }
  return b39Divider.at(-1)[1];
}
function standArea(stand){return Number(stand.lat)>=b39LatitudeAt(stand.lng)?'north':'south'}
function groupedStandCards(list,openAreas=null){
  return [['north','Dudenhofen Nord'],['south','Dudenhofen Süd']].map(([area,label])=>{
    const areaStands=list.filter(stand=>standArea(stand)===area);
    const open=openAreas===null||openAreas.has(area);
    return areaStands.length?`<details class="stand-area" data-area="${area}" ${open?'open':''}><summary class="stand-area-heading"><h2>${label}</h2><span>${areaStands.length} ${areaStands.length===1?'Stand':'Stände'}</span></summary><div class="stand-area-grid">${areaStands.map(card).join('')}</div></details>`:'';
  }).join('');
}
function renderStands(){
  const mapAreas=$$('#standGrid .stand-area'),favoriteAreas=$$('#favoritesGrid .stand-area');
  const openMapAreas=mapAreas.length?new Set(mapAreas.filter(area=>area.open).map(area=>area.dataset.area)):null;
  const openFavoriteAreas=favoriteAreas.length?new Set(favoriteAreas.filter(area=>area.open).map(area=>area.dataset.area)):null;
  const visible=stands.filter(matches).sort(compareStandAddresses);
  $('#standGrid').innerHTML=groupedStandCards(visible,openMapAreas);
  $('#noStands').hidden=visible.length>0;
  $('#noStands').textContent=stands.length?'Keine Stände für diese Auswahl gefunden.':'Noch keine Stände angemeldet.';
  $('#resultCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;
  const favs=favorites.map(id=>stands.find(s=>s.id===id)).filter(Boolean);
  $('#favoritesGrid').innerHTML=groupedStandCards([...favs].sort(compareStandAddresses),openFavoriteAreas);
  $('#emptyFavorites').classList.toggle('visible',favs.length===0);
  $('#favoritesGrid').style.display=favs.length?'grid':'none';
  renderFavoriteRoute(favs);
  $$('[data-fav]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.fav;
    favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
    saveFavs();
    toast(favorites.includes(id)?'Stand zu deinen Favoriten hinzugefügt.':'Stand aus deinen Favoriten entfernt.');
  }));
  renderCounts();refreshStandPins();
}
function currentRouteFavorites(){return favorites.map(id=>stands.find(stand=>stand.id===id)).filter(Boolean)}
function routeSignature(favs){return JSON.stringify(favs.map(stand=>[stand.id,stand.address]))}
function renderFavoriteRoute(favs){
  const button=$('#planFavoritesRoute'),message=$('#routePlannerMessage');
  const signature=routeSignature(favs);
  if(signature!==favoriteRouteState.signature){
    favoriteRouteState.controller?.abort();
    favoriteRouteState.controller=null;favoriteRouteState.busy=false;
    favoriteRouteState.signature=signature;
    $('#favoriteRouteResult').hidden=true;$('#favoriteRouteResult').replaceChildren();
    message.textContent=favs.length?'Die Reihenfolge wird ab deinem aktuellen Standort für Fußwege optimiert.':'Speichere Stände, um eine Route zu planen.';
    button.textContent='Route planen';
  }
  button.disabled=!favs.length||favoriteRouteState.busy;
  button.setAttribute('aria-busy',String(favoriteRouteState.busy));
}
function walkingTime(seconds){return `${Math.max(1,Math.ceil(seconds/60))} Min.`}
function walkingDistance(meters){return meters<1000?`${Math.round(meters/10)*10} m`:`${(meters/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km`}
function mapsWalkingURL(origin,stops){
  const url=new URL('https://www.google.com/maps/dir/');
  const coordinate=point=>`${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  url.searchParams.set('api','1');url.searchParams.set('travelmode','walking');
  url.searchParams.set('destination',coordinate(stops.at(-1)));
  if(origin)url.searchParams.set('origin',coordinate(origin));
  if(stops.length>1)url.searchParams.set('waypoints',stops.slice(0,-1).map(coordinate).join('|'));
  return url.toString();
}
function showFavoriteRoute(result){
  const host=$('#favoriteRouteResult'),{origin,legs,exact}=result;
  const time=new Date(origin.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  const precision=Number.isFinite(origin.accuracy)&&origin.accuracy>100?` Standortgenauigkeit: ca. ${Math.round(origin.accuracy)} m.`:'';
  // Each segment has at most three intermediate stops, including on mobile.
  // Individual navigation links remain available for every stop on all devices.
  const segments=[];
  for(let start=0;start<legs.length;start+=4){
    const portion=legs.slice(start,start+4),from=start?legs[start-1].stop:origin;
    const label=legs.length<=4?'Route in Google Maps öffnen':`Etappe ${segments.length+1}: Stopps ${start+1}–${start+portion.length}`;
    segments.push(`<a class="secondary-button" href="${escapeHtml(mapsWalkingURL(from,portion.map(leg=>leg.stop)))}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`);
  }
  host.innerHTML=`<h2>Deine Fußroute</h2><p class="route-total"><strong>${walkingDistance(result.distance)} · ca. ${walkingTime(result.duration)}</strong> reine Gehzeit</p><p>Start: dein Standort um ${time} Uhr.${precision} Ende am letzten Stand, ohne Rückweg.</p><p>${exact?'Die Reihenfolge hat die geringste berechnete Gehzeit für alle Favoriten.':'Die Reihenfolge wurde für alle Favoriten optimiert. Bei mehr als 16 Stopps ist sie eine Näherung, ohne Garantie auf das globale Optimum.'}</p><ol class="route-stop-list">${legs.map(leg=>`<li><div><strong>${escapeHtml(streetAddress(leg.stop.address))}</strong><small>${walkingDistance(leg.distance)} · ca. ${walkingTime(leg.duration)} ab dem vorherigen Stopp${leg===legs[0]?' (dein Standort)':''}</small></div><a href="${escapeHtml(mapsWalkingURL(null,[leg.stop]))}" target="_blank" rel="noopener noreferrer" aria-label="Zu ${escapeHtml(streetAddress(leg.stop.address))} in Google Maps navigieren">Navigieren <span aria-hidden="true">↗</span></a></li>`).join('')}</ol><div class="route-segments">${segments.join('')}</div><p class="route-navigation-note">Folge der angezeigten Reihenfolge. Google Maps kann Wege anders berechnen; falls Zwischenstopps dort fehlen, nutze „Navigieren“ am jeweiligen Stand. Mit „Neu planen“ startet die Berechnung an deinem dann aktuellen Standort.</p><p class="route-credit">Fußwege: <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">FOSSGIS / OSRM</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Karte verbessern</a></p>`;
  host.hidden=false;
}
$('#planFavoritesRoute').addEventListener('click',async()=>{
  if(favoriteRouteState.busy)return;
  const favs=currentRouteFavorites();if(!favs.length)return;
  const controller=new AbortController(),{signal}=controller;
  favoriteRouteState.controller=controller;favoriteRouteState.busy=true;
  const message=$('#routePlannerMessage'),button=$('#planFavoritesRoute');
  $('#favoriteRouteResult').hidden=true;$('#favoriteRouteResult').replaceChildren();
  button.textContent='Wird geplant …';renderFavoriteRoute(favs);
  const status=text=>{if(!signal.aborted)message.textContent=text};
  try{
    if(navigator.onLine===false)throw new Error('Die Routenplanung benötigt eine Internetverbindung.');
    if(favs.length>99)throw new Error('Bitte wähle höchstens 99 Favoriten für eine Route aus. Es werden keine Stopps automatisch ausgelassen.');
    status('Dein aktueller Standort wird angefragt …');
    const origin=await favoriteRouter.getLocation();signal.throwIfAborted();
    const hasPosition=hasStandPosition;
    if(favs.some(stand=>!hasPosition(stand))){
      status('Fehlende Standpositionen werden ermittelt …');
      // The map may already have a lookup running. Give its result time to arrive.
      const lookup=locateStandAddresses(favs,{retry:true});
      const deadline=Date.now()+20000;
      while(currentRouteFavorites().some(stand=>!hasPosition(stand))&&Date.now()<deadline){
        signal.throwIfAborted();
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      // The geocoder catches provider errors itself; do not block on a slow call.
      void lookup;
    }
    signal.throwIfAborted();
    const stops=currentRouteFavorites();
    const missing=stops.filter(stand=>!hasPosition(stand)||!streetAddress(stand.address,''));
    if(missing.length)throw new Error(`Für diese Favoriten fehlt eine genaue Standposition: ${missing.map(stand=>streetAddress(stand.address)).join(', ')}. Bitte aktualisieren und erneut planen. Es wurde kein Stand ausgelassen.`);
    const result=await favoriteRouter.plan({origin,stops:stops.map(stand=>({...stand})),signal,onProgress:status});
    signal.throwIfAborted();showFavoriteRoute(result);
    status(`${stops.length} ${stops.length===1?'Favorit':'Favoriten'} ab deinem aktuellen Standort eingeplant. Die Reihenfolge steht unten.`);
    button.textContent='Neu planen';
  }catch(error){
    if(!signal.aborted){status(error.message||'Die Route konnte nicht berechnet werden. Bitte erneut versuchen.');button.textContent='Erneut planen'}
  }finally{
    if(favoriteRouteState.controller===controller){favoriteRouteState.busy=false;favoriteRouteState.controller=null;renderFavoriteRoute(currentRouteFavorites())}
  }
});
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2600)}
function showPage(name){const page=['karte','anmeldung','favoriten','hinweise','admin'].includes(name)?name:'karte';$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===page));closeDrawer();window.scrollTo({top:0,behavior:'smooth'});if(page==='karte'&&townMap)setTimeout(()=>{townMap.invalidateSize({pan:false});applyStartupMapView()},80);if(page==='admin')refreshAdmin();if(page==='anmeldung')loadEventSettings();location.hash=page;renderAppActivity()}
const drawer=$('#drawer'),scrim=$('#scrim');function openDrawer(){drawer.classList.add('open');scrim.classList.add('show');drawer.setAttribute('aria-hidden','false');$('#menuButton').setAttribute('aria-expanded','true');refreshPendingApplicationCount()}function closeDrawer(){drawer.classList.remove('open');scrim.classList.remove('show');drawer.setAttribute('aria-hidden','true');$('#menuButton').setAttribute('aria-expanded','false')}
$('#menuButton').addEventListener('click',openDrawer);$('#closeMenu').addEventListener('click',closeDrawer);scrim.addEventListener('click',closeDrawer);$$('[data-page]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showPage(el.dataset.page)}));$$('.brand[href="#karte"],.hero .primary-button').forEach(el=>el.addEventListener('click',e=>{if(el.classList.contains('brand')){e.preventDefault();showPage('karte')}else{e.preventDefault();document.querySelector('#karte-map').scrollIntoView({behavior:'smooth'})}}));
$('#organizerHomepage').addEventListener('click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  window.open(event.currentTarget.href,'_blank','popup,noopener,noreferrer,width=1100,height=800');
  closeDrawer();
});
$('#filterButton').addEventListener('click',()=>{
  const expanded=$('#filters').classList.toggle('show');
  $('#filterButton').setAttribute('aria-expanded',String(expanded));
});
function renderFilterSelection(){
  $$('#filters [data-filter]').forEach(button=>{
    const selected=button.dataset.filter===activeFilter;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
  $$('#filters [data-feature]').forEach(button=>{
    const selected=featureFilters[button.dataset.feature];
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
}
$$('#filters [data-filter]').forEach(button=>button.addEventListener('click',()=>{
  activeFilter=button.dataset.filter;
  if(activeFilter==='Alle'){featureFilters.favorites=false;featureFilters.food=false;}
  renderFilterSelection();applyMapFilter();
}));
$$('#filters [data-feature]').forEach(button=>button.addEventListener('click',()=>{
  const feature=button.dataset.feature;
  featureFilters[feature]=!featureFilters[feature];
  renderFilterSelection();applyMapFilter();
}));
function applyMapFilter(){renderStands()}
$('#searchInput').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();$('#clearSearch').classList.toggle('visible',Boolean(search));applyMapFilter()});$('#clearSearch').addEventListener('click',()=>{$('#searchInput').value='';search='';$('#clearSearch').classList.remove('visible');applyMapFilter()});
$('#registrationForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(registrationSubmitted||form.dataset.submitting==='true')return;
  if(!form.reportValidity())return;
  if(!supabaseClient){toast('Die Anmeldung ist noch nicht verfügbar: Supabase ist nicht eingerichtet.');return}
  await loadEventSettings();
  if(registrationSubmitted||form.dataset.submitting==='true')return;
  if(registrationOpen!==true&&!(registrationOpen===false&&lateRegistrationToken)){toast(registrationOpen===false?'Bitte zuerst einen gültigen Anmeldecode eingeben.':'Die Anmeldung ist gerade nicht verfügbar. Bitte später erneut versuchen.');return}
  const data=new FormData(form);
  const categories=data.getAll('category');
  const otherOffer=data.get('otherOffer')?.trim();
  if(otherOffer)categories.push(`Sonstiges: ${otherOffer}`);
  if(!categories.length){const firstGroup=$('.category-group');if(firstGroup){firstGroup.open=true;firstGroup.querySelector('summary').focus();firstGroup.scrollIntoView({behavior:'smooth',block:'center'})}toast('Bitte wähle mindestens ein Verkaufsangebot aus.');return}
  const application={first_name:data.get('firstName'),last_name:data.get('lastName'),email:data.get('email'),address:localStandAddress(data.get('address')),categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||''};
  if(registrationOpen===false)application.late_registration_token=lateRegistrationToken;
  const submitButton=form.querySelector('.submit-button');
  form.dataset.submitting='true';submitButton.disabled=true;
  let error,receipt;
  try{({data:receipt,error}=await supabaseClient.rpc('register_with_phrase',{p_data:application}))}
  catch{error={message:'unavailable'}}
  finally{form.dataset.submitting='false';submitButton.disabled=false}
  if(error){
    const code=String(error.message||'');
    if(code.includes('app_inactive')){await loadEventSettings();toast('Die App ist derzeit pausiert. Bitte das Organisationsteam kontaktieren.')}
    else if(code.includes('late_token_invalid_or_used')){lateRegistrationToken='';renderRegistrationAvailability();$('#lateTokenMessage').textContent='Der Anmeldecode ist ungültig oder wurde bereits verwendet. Bitte einen neuen Anmeldecode beim Ortsverein anfragen.';toast('Der Anmeldecode ist ungültig oder bereits verwendet.')}
    else if(code.includes('registrations_closed')){await loadEventSettings();toast('Zurzeit werden Anmeldungen nur mit Anmeldecode angenommen.')}
    else toast('Die Anmeldung konnte nicht gesendet werden. Bitte versuche es später erneut.');
    return;
  }
  registrationSubmitted=true;
  lateRegistrationToken='';$('#lateTokenInput').value='';
  renderRegistrationAvailability();
  const name=escapeHtml(application.first_name);
  form.innerHTML=`<div class="success-state"><span class="success-icon">✓</span><p class="eyebrow">ANMELDUNG ÜBERMITTELT</p><h2>Danke, ${name}!</h2><p>Deine Anmeldung liegt jetzt dem Organisationsteam zur Prüfung vor. Erst nach der Freigabe erscheinen die Standdaten in der App.</p><button class="secondary-button" type="button" id="backToMap">Zur Karte <span>↗</span></button></div>`;
  const receiptInfo=document.createElement('div');
  receiptInfo.innerHTML=`<h3>Deine Anmeldebestätigung</h3><p>Bewahre diese Angaben für eine spätere Abmeldung sicher auf. Die persönliche Abmeldephrase wird nur jetzt angezeigt.</p><p>Anmeldenummer: <strong>${escapeHtml(receipt.registration_id)}</strong></p><p>Abmeldephrase: <strong>${escapeHtml(receipt.keyphrase)}</strong></p>`;
  const download=document.createElement('button');download.type='button';download.className='secondary-button';download.textContent='Anmeldebestätigung als PDF herunterladen';
  download.addEventListener('click',()=>downloadRegistrationPdf(application,receipt));receiptInfo.append(download);form.querySelector('.success-state').append(receiptInfo);
  form.querySelector('#backToMap').addEventListener('click',()=>showPage('karte'));
});

function syncFoodDetails(form){
  const showDescription=form.querySelector('[name="foodAvailable"]:checked')?.value==='Ja';
  const field=form.querySelector('[name="foodDescription"]');
  form.querySelector('.food-details').hidden=!showDescription;
  field.disabled=!showDescription;
  field.required=showDescription&&form.id==='registrationForm';
  if(field.required)field.pattern='.*\\S.*';
  else field.removeAttribute('pattern');
}
$$('[name="foodAvailable"]').forEach(radio=>radio.addEventListener('change',()=>syncFoodDetails(radio.closest('form'))));
syncFoodDetails($('#registrationForm'));syncFoodDetails(adminManualForm);
window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(['karte','anmeldung','favoriten','hinweise','admin'].includes(name)){$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===name));if(name==='karte'&&townMap)setTimeout(()=>{townMap.invalidateSize({pan:false});applyStartupMapView()},80);if(name==='admin')refreshAdmin();if(name==='anmeldung')loadEventSettings();renderAppActivity()}});
if(['#anmeldung','#favoriten','#hinweise','#admin'].includes(location.hash)){const p=location.hash.slice(1);$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${p}`))}
const defaultMapCenter=[49.3186,8.3886],defaultMapZoom=15;
let townMap=null,mapStartupViewPending=true;
function applyStartupMapView(){
  if(!townMap||!mapStartupViewPending||!$('#mapCanvas').clientWidth||!$('#mapCanvas').clientHeight)return;
  townMap.invalidateSize({pan:false});
  townMap.setView(defaultMapCenter,defaultMapZoom,{animate:false});
  mapStartupViewPending=false;
}
let makeMapPin=null;
const standPinMarkers=[];
let geocodingPositionAttribution=false;
const locateStandAddresses=window.createStandGeocoder({
  client:supabaseClient,
  config:window.DORFFLOHMARKT_GEOCODING,
  getStands:()=>stands,
  onCoordinates:coordinates=>{
    for(const location of coordinates){
      const stand=stands.find(value=>value.id===location.id&&value.address===location.address);
      if(stand)Object.assign(stand,{lat:location.lat,lng:location.lng,geocodingSource:GEOCODING_PROVIDER,geocodingExpiresAt:location.expiresAt});
    }
    refreshStandPins();renderGeocodingReport();
  },
  onDiagnostic:diagnostic=>{geocodingDiagnostics.set(diagnostic.id,diagnostic);renderGeocodingReport()},
  onStatus:message=>{
    const status=$('#mapLocationStatus');
    status.textContent=message;
    status.hidden=!message;
  }
});
if(window.L){
  townMap=L.map('mapCanvas').setView(defaultMapCenter,defaultMapZoom);
  if('ResizeObserver' in window){
    let mapResizeFrame=0;
    const mapResizeObserver=new ResizeObserver(()=>{
      cancelAnimationFrame(mapResizeFrame);
      mapResizeFrame=requestAnimationFrame(()=>{if($('#mapCanvas').clientWidth&&$('#mapCanvas').clientHeight){townMap.invalidateSize({pan:false});applyStartupMapView()}});
    });
    mapResizeObserver.observe($('#mapCanvas'));
  }
  const streetLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
  const aerialLayer=L.tileLayer.wms('https://geo4.service24.rlp.de/wms/rp_dop20.fcgi',{
    layers:'rp_dop20',format:'image/png',transparent:false,version:'1.1.1',maxZoom:19,
    bounds:[[48.897996,6.037773],[51.000893,8.617703]],
    attribution:`&copy; <a href="https://lvermgeo.rlp.de/geodaten-geoshop/open-data" target="_blank" rel="noopener noreferrer">GeoBasis-DE / LVermGeoRP ${new Date().getFullYear()}</a>, <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener noreferrer">dl-de/by-2-0</a> [Daten bearbeitet]`
  });
  let currentBasemap='street';
  streetLayer.addTo(townMap);
  $$('[data-basemap]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.basemap===currentBasemap)));
  applyStartupMapView();
  const basemapStatus=$('#basemapStatus');
  $$('[data-basemap]').forEach(button=>{
    button.disabled=false;
    button.addEventListener('click',()=>{
      const next=button.dataset.basemap;
      if(next===currentBasemap)return;
      townMap.removeLayer(currentBasemap==='aerial'?aerialLayer:streetLayer);
      currentBasemap=next;
      (next==='aerial'?aerialLayer:streetLayer).addTo(townMap);
      $$('[data-basemap]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.basemap===next)));
      basemapStatus.textContent='';basemapStatus.hidden=true;
    });
  });
  aerialLayer.on('tileerror',()=>{if(currentBasemap==='aerial'){basemapStatus.textContent='Luftbilder gerade nicht verfügbar. Bitte zur Straßenkarte wechseln oder später erneut versuchen.';basemapStatus.hidden=false}});
  makeMapPin=({favorite=false,food=false}={})=>L.divIcon({
    className:'market-map-marker',
    html:`<div class="market-map-pin" aria-hidden="true"><img src="./marker.png" alt="">${favorite?'<span class="map-pin-badge map-pin-badge--favorite"><img src="./marker-favorite.svg" alt=""></span>':''}${food?'<span class="map-pin-badge map-pin-badge--food"><img src="./marker-food.svg" alt=""></span>':''}</div>`,
    iconSize:[44,54],iconAnchor:[22,54],popupAnchor:[0,-50]
  });
}else{
  $('#mapCanvas').innerHTML='<div class="map-unavailable"><strong>Karte gerade nicht verfügbar</strong><span>Die Ortskarte braucht eine Internetverbindung.</span><a href="https://www.openstreetmap.org/?mlat=49.3186&mlon=8.3886#map=15/49.3186/8.3886" target="_blank" rel="noreferrer">Dudenhofen auf OpenStreetMap öffnen ↗</a></div>';
}
function updateMapStandCount(){
  const selection=stands.filter(matches);
  $('#standSelectionCount').textContent=String(selection.length);
  $('#standFoodCount').textContent=String(selection.filter(stand=>stand.food_available==='Ja').length);
  $('#standFavoriteSelectionCount').textContent=String(selection.filter(stand=>favorites.includes(stand.id)).length);
  const offers=new Map();
  for(const stand of selection){
    const counted=new Set();
    for(const category of stand.categories||[]){
      const label=String(category).trim().replace(/\s+/g,' '),key=label.toLocaleLowerCase('de');
      if(!label||counted.has(key))continue;
      counted.add(key);
      const entry=offers.get(key)||{label,count:0};
      entry.count++;offers.set(key,entry);
    }
  }
  const ranked=[...offers.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'de'));
  $('#standOffers').innerHTML=ranked.slice(0,6).map(offer=>`<li><span>${escapeHtml(offer.label)}</span><strong>${offer.count} ${offer.count===1?'Stand':'Stände'}</strong><span class="stand-offer-bar" aria-hidden="true"><i style="width:${Math.round(offer.count/selection.length*100)}%"></i></span></li>`).join('');
  const further=ranked.length>6?`${ranked.length-6} weitere ${ranked.length===7?'Warengruppe':'Warengruppen'}. `:'';
  $('#standOffersNote').textContent=ranked.length?`${further}Ein Stand kann mehrere Angebote haben.`:selection.length?'Für diese Stände sind noch keine Angebote eingetragen.':'Keine Angebote in dieser Auswahl.';
}
mapCanvas.addEventListener('click',event=>{
  const button=event.target.closest('[data-map-fav]');if(!button)return;
  const id=button.dataset.mapFav;if(!stands.some(stand=>stand.id===id))return;
  favorites=favorites.includes(id)?favorites.filter(value=>value!==id):[...favorites,id];
  saveFavs();
  standPinMarkers.find(marker=>marker.options.standId===id)?.openPopup();
  toast(favorites.includes(id)?'Stand zu deinen Favoriten hinzugefügt.':'Stand aus deinen Favoriten entfernt.');
});
function refreshStandPins(){
  if(!townMap||!makeMapPin){updateMapStandCount();return}
  standPinMarkers.forEach(marker=>townMap.removeLayer(marker));
  standPinMarkers.length=0;
  const visible=stands.filter(s=>hasStandPosition(s)&&matches(s));
  const positionAttribution='Positionsdaten &copy; <a href="https://www.here.com/">HERE</a>';
  if(visible.some(s=>s.geocodingSource===GEOCODING_PROVIDER)){
    if(!geocodingPositionAttribution){townMap.attributionControl.addAttribution(positionAttribution);geocodingPositionAttribution=true}
  }else if(geocodingPositionAttribution){townMap.attributionControl.removeAttribution(positionAttribution);geocodingPositionAttribution=false}
  visible.forEach(s=>{
    const favorite=favorites.includes(s.id),food=s.food_available==='Ja';
    const features=[favorite?'Favorit':'',food?'Mit Verpflegung':''].filter(Boolean);
    const label=[s.address,...features].join(' · ');
    const marker=L.marker([s.lat,s.lng],{icon:makeMapPin({favorite,food}),title:label,standId:s.id}).addTo(townMap);
    marker.getElement()?.setAttribute('aria-label',label);
    marker.bindPopup(`<strong>${escapeHtml(streetAddress(s.address))}</strong><div class="map-popup-categories">${(s.categories||[]).map(category=>`<span class="tag">${escapeHtml(category)}</span>`).join('')||'<span>Keine Kategorien angegeben.</span>'}</div><button type="button" class="map-popup-favorite secondary-button" data-map-fav="${escapeHtml(s.id)}" aria-pressed="${favorite}">${favorite?'★ Aus Favoriten entfernen':'☆ Als Favorit speichern'}</button>${features.length?`<p class="map-popup-features">${escapeHtml(features.join(' · '))}</p>`:''}${food&&s.food_description?`<p class="map-popup-food">${escapeHtml(s.food_description)}</p>`:''}`);
    standPinMarkers.push(marker);
  });
  updateMapStandCount();
}
renderCounts();renderStands();
if(townMap)locateStandAddresses(stands);
setInterval(()=>{if(townMap)locateStandAddresses(stands)},3600000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const banner=$('#appUpdateNotice'),applyButton=$('#applyAppUpdate'),updateNav=$('#openAppUpdate');
  let registration=null,hadController=Boolean(navigator.serviceWorker.controller);
  let applyRequested=false,reloading=false,controllerChanged=false,dismissedWorker=null,dismissedActive=false,lastCheckAt=0,checking=false;
  const reloadApp=()=>{if(!reloading){reloading=true;location.reload()}};
  function showAvailableUpdate(){
    const waiting=registration?.waiting;
    updateNav.hidden=!(waiting||controllerChanged);
    updateNav.disabled=applyRequested;
    if(applyRequested)return;
    if((waiting&&waiting!==dismissedWorker)||(controllerChanged&&!dismissedActive)){
      banner.hidden=false;applyButton.disabled=false;applyButton.textContent='Jetzt aktualisieren';
    }
  }
  updateNav.addEventListener('click',()=>{
    dismissedWorker=null;dismissedActive=false;
    closeDrawer();showAvailableUpdate();
    if(!banner.hidden)applyButton.focus({preventScroll:true});
  });
  $('#deferAppUpdate').addEventListener('click',()=>{
    dismissedWorker=registration?.waiting;dismissedActive=controllerChanged;banner.hidden=true;
  });
  applyButton.addEventListener('click',()=>{
    if(applyRequested)return;
    if(controllerChanged){reloadApp();return}
    const waiting=registration?.waiting;
    if(!waiting){banner.hidden=true;return}
    applyRequested=true;applyButton.disabled=true;applyButton.textContent='Wird aktualisiert …';
    waiting.postMessage({type:'ACTIVATE_APP_UPDATE'});
    setTimeout(()=>{
      if(!reloading){applyRequested=false;showAvailableUpdate();applyButton.textContent='Erneut aktualisieren'}
    },15000);
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    const wasControlled=hadController;hadController=true;
    if(!wasControlled)return; // First installation is not an available update.
    if(applyRequested)reloadApp();
    else{controllerChanged=true;showAvailableUpdate()} // Another tab accepted the update.
  });
  async function checkForAppUpdate({remind=false}={}){
    if(remind){dismissedWorker=null;dismissedActive=false}
    showAvailableUpdate();
    if(!registration||checking||navigator.onLine===false||document.visibilityState==='hidden'||Date.now()-lastCheckAt<60000)return;
    checking=true;lastCheckAt=Date.now();
    try{await registration.update();showAvailableUpdate()}
    catch{console.warn('App-Updateprüfung derzeit nicht verfügbar.')}
    finally{checking=false}
  }
  function watchInstallingWorker(worker){
    if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed')setTimeout(showAvailableUpdate,0);
    });
  }
  async function registerAppWorker(){
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      registration.addEventListener('updatefound',()=>watchInstallingWorker(registration.installing));
      watchInstallingWorker(registration.installing);showAvailableUpdate();
      await checkForAppUpdate();
    }catch{console.warn('App-Updateprüfung derzeit nicht verfügbar.')}
  }
  if(document.readyState==='complete')registerAppWorker();
  else window.addEventListener('load',registerAppWorker,{once:true});
  window.addEventListener('online',()=>{lastCheckAt=0;checkForAppUpdate({remind:true})});
  window.addEventListener('pageshow',()=>checkForAppUpdate({remind:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForAppUpdate({remind:true})});
  setInterval(checkForAppUpdate,60000);
}

let installPrompt;
const installButton = $('#installButton');
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  toast('Die App wurde installiert. Viel Freude beim Entdecken!');
});

// Öffentliche Live-Liste und Moderation via Supabase Auth + Row Level Security.
let standRefreshSequence=0,lastStandRefreshAt=0;
let standRowsRequest=null,standRetryTimer=null,standReloadQueued=false;
async function readPublishedStandRows(){
  const rows=[];let offset=0;
  for(;;){
    let result=null;
    for(let attempt=0;attempt<3;attempt++){
      if(navigator.onLine===false)return null;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        result=await publicStandClient.from('published_stands')
          .select('id,created_at,address,categories,food_available,food_description,description,lat,lng,geocoding_provider,geocoded_at',{count:'exact'})
          .order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499).abortSignal(controller.signal);
      }catch{result={error:true,status:0}}
      finally{clearTimeout(timer)}
      if(!result.error)break;
      const transient=!result.status||[408,429].includes(result.status)||result.status>=500;
      if(!transient||attempt===2)return null;
      await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));
    }
    if(!Array.isArray(result?.data))return null;
    const {data:page,count}=result;
    rows.push(...page);offset+=page.length;
    if(!page.length||(Number.isFinite(count)&&offset>=count)||(!Number.isFinite(count)&&page.length<500))return rows;
  }
}
function fetchPublishedStandRows(){
  if(!standRowsRequest)standRowsRequest=readPublishedStandRows().catch(()=>null).finally(()=>{standRowsRequest=null});
  return standRowsRequest;
}
function scheduleStandRetry(){
  if(standRetryTimer)return;
  standRetryTimer=setTimeout(()=>{
    standRetryTimer=null;
    if(document.visibilityState==='visible'&&navigator.onLine!==false)loadPublishedStands();
  },30000);
}
async function loadPublishedStands({retryGeocoding=false,geocodeAddress=null}={}){
  if(!publicStandClient)return false;
  const sequence=++standRefreshSequence;
  const rows=await fetchPublishedStandRows();
  if(sequence!==standRefreshSequence)return null;
  if(rows===null){scheduleStandRetry();console.warn('Standdaten derzeit nicht erreichbar; vorhandene Daten bleiben erhalten.');return false}
  clearTimeout(standRetryTimer);standRetryTimer=null;
  lastStandRefreshAt=Date.now();
  const previous=new Map(stands.map(stand=>[stand.id,stand]));
  stands=[...new Map(rows.map(row=>[row.id,row])).values()].map(row=>{
    const saved=previous.get(row.id);
    const cached=saved?.address===row.address&&saved.geocodingSource===GEOCODING_PROVIDER&&saved.geocodingExpiresAt>Date.now()&&
      (!Number.isFinite(row.lat)||!Number.isFinite(row.lng));
    const geocodedAt=Date.parse(row.geocoded_at);
    const serverPosition=row.geocoding_provider===GEOCODING_PROVIDER&&Number.isFinite(geocodedAt)
      ?{geocodingSource:GEOCODING_PROVIDER,geocodingExpiresAt:geocodedAt+GEOCODING_MAX_AGE}
      :{geocodingSource:row.geocoding_provider||null,geocodingExpiresAt:0};
    return {...row,categories:normalizeCategories(row.categories),title:'Flohmarktstand',...serverPosition,...(cached?{lat:saved.lat,lng:saved.lng,geocodingSource:saved.geocodingSource,geocodingExpiresAt:saved.geocodingExpiresAt}:{})};
  });
  favorites=favorites.filter(id=>stands.some(s=>s.id===id));
  publishedStandListReady=true;
  for(const [id,issue] of geocodingDiagnostics)if(!stands.some(stand=>stand.id===id&&stand.address===issue.address))geocodingDiagnostics.delete(id);
  renderGeocodingReport();
  saveFavs();
  if(!$('#adminDashboard').hidden)renderAdminPublishedStands(stands);
  if(appActive===false)return true;
  try{
  const priorityAddress=geocodeAddress||manualStandGeocodingAddress;
  if(priorityAddress){
    // The saved address goes first; geocoding also runs if Leaflet is unavailable.
    await locateStandAddresses(stands.filter(stand=>stand.address===priorityAddress),{retry:retryGeocoding});
    void locateStandAddresses(stands);
  }else await locateStandAddresses(stands,{retry:retryGeocoding});
  }catch{console.warn('Standdaten geladen; Kartenpositionen konnten noch nicht vollständig aktualisiert werden.')}
  return true;
}
if(supabaseClient){
  loadPublishedStands();
  supabaseClient.channel('published-stands-live').on('postgres_changes',{event:'*',schema:'public',table:'published_stands'},()=>{
    if(standRowsRequest){
      if(!standReloadQueued){standReloadQueued=true;standRowsRequest.then(()=>{standReloadQueued=false;loadPublishedStands()})}
    }else loadPublishedStands();
  }).subscribe(status=>{if(status==='SUBSCRIBED')loadPublishedStands()});
  const refreshIfStale=()=>{if(Date.now()-lastStandRefreshAt>SUPABASE_REFRESH_INTERVAL)loadPublishedStands()};
  setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)loadPublishedStands()},SUPABASE_REFRESH_INTERVAL);
  window.addEventListener('pageshow',refreshIfStale);
  window.addEventListener('online',loadPublishedStands);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshIfStale()});
}
const adminLoginForm=$('#adminLoginForm');
const adminDashboard=$('#adminDashboard');
const adminLoginMessage=$('#adminLoginMessage');
const adminMessage=$('#adminMessage');
const adminApplications=$('#adminApplications');
const adminPublishedStands=$('#adminPublishedStands');
const adminManageMessage=$('#adminManageMessage');
let adminPublishedSignature='';
let adminSessionId=null,adminSessionVersion=0;
const eventDateForm=$('#eventDateForm');
const eventDateMessage=$('#eventDateMessage');
let registrationOpen=null,registrationSaving=false,registrationSubmitted=false,eventSettingsSequence=0;
let lateRegistrationToken='',lateTokenChecking=false,lateTokenCreating=false;
const registrationToggle=$('#registrationToggle');
function renderRegistrationAvailability(){
  const notice=$('#registrationAvailability'),form=$('#registrationForm');
  if(registrationOpen===true){lateRegistrationToken='';$('#lateTokenInput').value='';}
  const tokenAccess=registrationOpen===false&&Boolean(lateRegistrationToken);
  notice.hidden=registrationSubmitted||registrationOpen===true;
  notice.textContent=tokenAccess?'Dein Anmeldecode ist freigeschaltet. Er wird erst beim erfolgreichen Absenden verbraucht.':registrationOpen===false?'Die reguläre Anmeldung ist geschlossen. Für eine nachträgliche Anmeldung kontaktiere flohmarkt@dudenhofen.org. Deinen persönlichen Anmeldecode kannst du unten eingeben.':'Die Anmeldung ist gerade nicht verfügbar. Bitte später erneut versuchen.';
  form.hidden=!registrationSubmitted&&registrationOpen!==true&&!tokenAccess;
  $('#lateTokenForm').hidden=registrationSubmitted||registrationOpen!==false||tokenAccess;
  $('#createLateToken').disabled=lateTokenCreating||registrationOpen!==false;
  $('#lateTokenAdminStatus').textContent=lateTokenCreating?'Token wird erzeugt …':registrationOpen===false?'Einmalige Tokens können jetzt erzeugt werden.':'Tokens können nur bei geschlossener Anmeldung erzeugt werden.';
  registrationToggle.disabled=registrationSaving||registrationOpen===null;
  registrationToggle.setAttribute('aria-checked',String(registrationOpen===true));
  $('#registrationSettingsStatus').textContent=registrationSaving?'Einstellung wird gespeichert …':registrationOpen===null?'Die Einstellung konnte nicht geladen werden. Bitte aktualisieren.':registrationOpen?'Neue Anmeldungen werden angenommen.':'Die Annahme neuer Anmeldungen ist ausgeschaltet.';
}
$('#lateTokenForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(lateTokenChecking||!supabaseClient||!event.currentTarget.reportValidity())return;
  const button=event.currentTarget.querySelector('button');
  lateTokenChecking=true;button.disabled=true;
  const message=$('#lateTokenMessage');message.textContent='Anmeldecode wird geprüft …';
  try{
    await loadEventSettings();
    if(registrationOpen!==false){message.textContent='Die reguläre Anmeldung ist geöffnet; du benötigst keinen Token.';return}
    const token=$('#lateTokenInput').value.trim().toUpperCase();
    const {data,error}=await supabaseClient.rpc('validate_late_registration_token',{p_token:token});
    if(error){message.textContent='Der Anmeldecode konnte gerade nicht geprüft werden. Bitte erneut versuchen.';return}
    if(data!==true){message.textContent='Der Anmeldecode ist ungültig oder wurde bereits verwendet.';return}
    lateRegistrationToken=token;message.textContent='';renderRegistrationAvailability();
    $('#registrationPanel').open=true;
    $('#registrationForm').querySelector('input').focus();
  }catch{message.textContent='Der Anmeldecode konnte gerade nicht geprüft werden. Bitte erneut versuchen.'}
  finally{lateTokenChecking=false;button.disabled=false}
});
$('#createLateToken').addEventListener('click',async()=>{
  if(lateTokenCreating||registrationOpen!==false||!supabaseClient)return;
  lateTokenCreating=true;renderRegistrationAvailability();
  const sessionVersion=adminSessionVersion;
  try{
    const {data,error}=await supabaseClient.rpc('create_late_registration_token');
    if(sessionVersion!==adminSessionVersion||adminDashboard.hidden)return;
    if(error||typeof data!=='string'){
      if(error?.message?.includes('late_tokens_closed_only')){await loadEventSettings();toast('Tokens sind nur bei geschlossener Anmeldung verfügbar.')}
      else toast('Der Anmeldecode konnte nicht erzeugt werden. Bitte Adminzugriff und Verbindung prüfen.');
      return;
    }
    $('#generatedLateToken').value=data;$('#lateTokenOutput').hidden=false;
    toast('Einmaligen Token erzeugt. Bitte jetzt kopieren.');
  }catch{toast('Der Anmeldecode konnte gerade nicht erzeugt werden.')}
  finally{lateTokenCreating=false;renderRegistrationAvailability()}
});
$('#copyLateToken').addEventListener('click',async()=>{
  const field=$('#generatedLateToken');
  try{await navigator.clipboard.writeText(field.value);toast('Token kopiert.')}
  catch{field.focus();field.select();toast('Bitte den markierten Token kopieren.')}
});
function applyEventSettings(settings){
  const previousActive=appActive;
  appActive=typeof settings?.app_active==='boolean'?settings.app_active:null;
  if(settings?.event_date)setMarketDate(settings.event_date);
  countdownVisible=typeof settings?.countdown_visible==='boolean'?settings.countdown_visible:true;
  registrationOpen=typeof settings?.registrations_open==='boolean'?settings.registrations_open:null;
  renderCountdownVisibility();
  renderRegistrationAvailability();
  renderAppActivity();
  if(previousActive===false&&appActive===true)void loadPublishedStands();
}
function adminStatus(target,message){target.textContent=message}
async function loadEventSettings(){
  const sequence=++eventSettingsSequence;
  if(!supabaseClient){applyEventSettings(null);return}
  try{
    let {data,error}=await supabaseClient.from('event_settings').select('event_date,registrations_open,app_active,countdown_visible').eq('id',true).maybeSingle();
    if(error?.message?.includes('countdown_visible'))({data,error}=await supabaseClient.from('event_settings').select('event_date,registrations_open,app_active').eq('id',true).maybeSingle());
    if(sequence!==eventSettingsSequence)return;
    if(error||!data){applyEventSettings(null);return}
    applyEventSettings(data);
  }catch{if(sequence===eventSettingsSequence)applyEventSettings(null)}
}
loadEventSettings();
const eventSettingsBroadcast='BroadcastChannel' in window?new BroadcastChannel('dorfflohmarkt-event-settings'):null;
eventSettingsBroadcast?.addEventListener('message',()=>loadEventSettings());
supabaseClient?.channel('event-settings-live')
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'event_settings',filter:'id=eq.true'},payload=>{
    eventSettingsSequence++;applyEventSettings(payload.new);loadEventSettings();
  })
  .subscribe(status=>{
    if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))loadEventSettings();
  });
window.addEventListener('online',loadEventSettings);
window.addEventListener('pageshow',loadEventSettings);
window.addEventListener('focus',loadEventSettings);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadEventSettings()});
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)loadEventSettings()},SUPABASE_REFRESH_INTERVAL);
registrationToggle.addEventListener('click',async()=>{
  if(registrationSaving||registrationOpen===null||!supabaseClient)return;
  const next=!registrationOpen;
  registrationSaving=true;renderRegistrationAvailability();
  try{
    const {data,error}=await supabaseClient.from('event_settings').update({registrations_open:next}).eq('id',true).select('event_date,registrations_open,app_active,countdown_visible').maybeSingle();
    if(error||!data)throw new Error('Save failed');
    eventSettingsSequence++;applyEventSettings(data);
    eventSettingsBroadcast?.postMessage({changed:true});
    toast(next?'Anmeldungen sind jetzt geöffnet.':'Anmeldungen sind jetzt geschlossen.');
  }catch{toast('Die Einstellung konnte nicht gespeichert werden. Bitte Adminzugriff und Verbindung prüfen.')}
  finally{registrationSaving=false;renderRegistrationAvailability()}
});
eventDateForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const value=new FormData(eventDateForm).get('eventDate');
  if(!value||!supabaseClient){adminStatus(eventDateMessage,'Der Termin konnte nicht gespeichert werden.');return}
  adminStatus(eventDateMessage,'Termin wird gespeichert …');
  const {error}=await supabaseClient.from('event_settings').update({event_date:value}).eq('id',true);
  if(error){adminStatus(eventDateMessage,'Speichern fehlgeschlagen. Bitte Datenbankeinrichtung und Adminrechte prüfen.');return}
  setMarketDate(value);
  eventSettingsBroadcast?.postMessage({changed:true});
  adminStatus(eventDateMessage,'Termin gespeichert. Alle sichtbaren Countdown-Stellen wurden aktualisiert.');
});
$('#countdownVisibilityToggle').addEventListener('click',async()=>{
  if(countdownSaving||!supabaseClient)return;
  const next=!countdownVisible;
  countdownSaving=true;renderCountdownVisibility();
  try{
    const {data,error}=await supabaseClient.from('event_settings').update({countdown_visible:next}).eq('id',true).select('event_date,registrations_open,app_active,countdown_visible').maybeSingle();
    if(error||!data)throw new Error('save_failed');
    eventSettingsSequence++;applyEventSettings(data);
    eventSettingsBroadcast?.postMessage({changed:true});
    toast(next?'Countdown wird jetzt überall angezeigt.':'Countdown ist jetzt überall ausgeblendet.');
  }catch{toast('Countdown-Einstellung konnte nicht gespeichert werden. Bitte Datenbankerweiterung und Adminrechte prüfen.');}
  finally{countdownSaving=false;renderCountdownVisibility();}
});
adminManualForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!supabaseClient){adminStatus(adminMessage,'Das Speichern ist nicht verfügbar.');return}
  const submitButton=adminManualForm.querySelector('.submit-button');
  if(submitButton.disabled)return;
  submitButton.disabled=true;
  let savedRegistration=false,published=false;
  adminStatus(adminManualStatus,'Stand wird in Supabase gespeichert …');
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session){adminStatus(adminManualStatus,'Bitte zuerst als Admin anmelden.');return}
    const {data:admin,error:adminError}=await supabaseClient.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
    if(adminError||!admin){adminStatus(adminManualStatus,'Für diesen Zugang ist keine Adminfreigabe eingerichtet.');return}
    const data=new FormData(adminManualForm);
    if(!streetAddress(data.get('address'),'')){adminStatus(adminManualStatus,'Bitte Straße und Hausnummer für den Stand eingeben.');return}
    const categories=data.getAll('category');
    const otherOffer=data.get('otherOffer')?.trim();
    if(otherOffer)categories.push(`Sonstiges: ${otherOffer}`);
    if(!categories.length)categories.push('Sonstiges');
    const application={first_name:data.get('firstName').trim()||'Manuell',last_name:data.get('lastName').trim()||'erfasster Stand',email:data.get('email').trim()||'flohmarkt@dudenhofen.org',address:localStandAddress(data.get('address')),categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||'',status:'pending'};
    const {data:registration,error:insertError}=await supabaseClient.from('stand_registrations').insert(application).select('id').single();
    if(insertError){adminStatus(adminManualStatus,'Der Stand konnte nicht gespeichert werden. Bitte Eingaben und Datenbankzugriff prüfen.');return}
    savedRegistration=true;
    manualStandGeocodingAddress=application.address;
    const {error:publishError}=await supabaseClient.rpc('approve_stand_registration',{registration_id:registration.id});
    if(publishError){adminStatus(adminManualStatus,'Der Eintrag wurde in Supabase gespeichert, aber nicht veröffentlicht. Bitte bei den offenen Anmeldungen prüfen und nicht erneut anlegen.');await loadApplications();return}
    published=true;
    adminManualForm.reset();
    syncFoodDetails(adminManualForm);
    adminManualForm.querySelectorAll('.category-group').forEach(group=>group.open=false);
    adminStatus(adminManualStatus,'Stand in Supabase gespeichert und veröffentlicht. Kartenposition wird jetzt ermittelt …');
    let loaded=null;
    for(let attempt=0;attempt<3&&loaded===null;attempt++)loaded=await loadPublishedStands({retryGeocoding:true,geocodeAddress:application.address});
    await loadApplications();
    if(loaded!==true){adminStatus(adminManualStatus,'Der Stand ist in Supabase gespeichert und veröffentlicht. Die Anzeige konnte noch nicht aktualisiert werden. Bitte „Aktualisieren“ verwenden und den Stand nicht erneut anlegen.');return}
    const atAddress=stands.filter(stand=>stand.address===application.address);
    const located=atAddress.length>0&&atAddress.every(hasStandPosition);
    adminStatus(adminManualStatus,located
      ?townMap?'Stand in Supabase gespeichert, geocodiert und auf der Karte eingetragen.':'Stand in Supabase gespeichert und geocodiert. Die Kartenansicht ist gerade nicht verfügbar.'
      :'Stand in Supabase gespeichert und veröffentlicht. Eine genaue Hausposition konnte noch nicht ermittelt werden; der Stand bleibt in der Liste. Bitte Adresse prüfen oder später „Aktualisieren“ verwenden. Nicht erneut anlegen.');
  }catch(error){console.warn('Manueller Stand konnte nicht vollständig verarbeitet werden.',error);adminStatus(adminManualStatus,published
    ?'Der Stand ist in Supabase gespeichert und veröffentlicht. Die Kartenposition oder Anzeige konnte noch nicht aktualisiert werden. Bitte aktualisieren und nicht erneut anlegen.'
    :savedRegistration?'Der Eintrag ist in Supabase gespeichert. Bitte offene Anmeldungen und veröffentlichte Stände prüfen, bevor du ihn erneut anlegst.'
      :'Das Speichern konnte nicht bestätigt werden. Bitte Verbindung sowie offene und veröffentlichte Stände prüfen, bevor du es erneut versuchst.')}
  finally{manualStandGeocodingAddress=null;submitButton.disabled=false}
});
const ADMIN_SESSION_MAX_AGE=7*24*60*60*1000;
let adminExpiryTimer=null;
async function enforceAdminSessionAge(session){
  clearTimeout(adminExpiryTimer);
  if(!session)return false;
  let loginAt=0;
  try{
    const payload=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    loginAt=Math.min(...(payload.amr||[]).map(item=>Number(item.timestamp)*1000).filter(value=>Number.isFinite(value)&&value>0));
  }catch{}
  if(!Number.isFinite(loginAt)||!loginAt||Date.now()>=loginAt+ADMIN_SESSION_MAX_AGE){
    await supabaseClient.auth.signOut({scope:'local'});
    adminLoginMessage.textContent='Deine Admin-Anmeldung ist abgelaufen. Bitte erneut anmelden.';
    return false;
  }
  adminExpiryTimer=setTimeout(()=>refreshAdmin(),Math.max(1,loginAt+ADMIN_SESSION_MAX_AGE-Date.now()));
  return true;
}
window.addEventListener('focus',()=>{if(supabaseClient)void refreshAdmin()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&supabaseClient)void refreshAdmin()});
async function refreshAdmin(){
  if(!supabaseClient){adminStatus(adminLoginMessage,'Supabase ist noch nicht eingerichtet.');return}
  const {data:{session:storedSession}}=await supabaseClient.auth.getSession();
  const session=await enforceAdminSessionAge(storedSession)?storedSession:null;
  if(adminSessionId!==(session?.user.id||null)){adminSessionId=session?.user.id||null;adminSessionVersion++;pendingCountSequence++;$('#generatedLateToken').value='';$('#lateTokenOutput').hidden=true;clearDeleteConfirmation();}
  adminLoginForm.hidden=Boolean(session);adminDashboard.hidden=!session;
  renderGeocodingReport();
  if(session){loadApplications();loadAdminPublishedStands();loadEventSettings();loadWithdrawalRequests()}
  else{setPendingApplicationCount(null);adminApplications.innerHTML='';$('#withdrawalRequests').textContent='';$('#withdrawalCount').textContent='–';updateAdminTodoCount();$('#exportStatus').textContent='';$('#generatedLateToken').value='';$('#lateTokenOutput').hidden=true}
}
adminLoginForm.addEventListener('submit',async e=>{
  e.preventDefault();if(!supabaseClient){adminStatus(adminLoginMessage,'Supabase ist noch nicht eingerichtet.');return}
  const data=new FormData(e.currentTarget);
  adminStatus(adminLoginMessage,'Anmeldung läuft …');
  const {error}=await supabaseClient.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});
  if(error){adminStatus(adminLoginMessage,'Anmeldung fehlgeschlagen. Zugangsdaten oder Adminfreigabe prüfen.');return}
  await refreshAdmin();
});
$('#adminLogout').addEventListener('click',async()=>{await supabaseClient?.auth.signOut();await refreshAdmin()});
supabaseClient?.auth.onAuthStateChange(()=>setTimeout(refreshAdmin,0));
let bulkApprovalBusy=false;
function updateBulkApprovalButton(){
  const button=$('#approveAllPending');
  const count=Number($('#pendingRegistrationsCount').textContent);
  button.disabled=bulkApprovalBusy||!Number.isFinite(count)||count<1||adminDashboard.hidden;
  adminApplications.querySelectorAll('button').forEach(button=>button.disabled=bulkApprovalBusy);
}
$('#approveAllPending').addEventListener('click',async()=>{
  if(bulkApprovalBusy||adminDashboard.hidden)return;
  const version=adminSessionVersion,status=$('#bulkApprovalStatus');
  bulkApprovalBusy=true;updateBulkApprovalButton();status.textContent='Offene Anmeldungen werden ermittelt …';
  let approved=0,failed=0,attempted=0;
  try{
    const ids=[];
    for(let start=0;;start+=500){
      const {data,error}=await supabaseClient.from('stand_registrations').select('id').eq('status','pending').order('id').range(start,start+499);
      if(version!==adminSessionVersion||adminDashboard.hidden)return;
      if(error)throw error;
      ids.push(...data.map(row=>row.id));if(data.length<500)break;
    }
    if(!ids.length){status.textContent='Keine offenen Anmeldungen vorhanden.';return}
    if(!confirm(`${ids.length} offene Anmeldungen jetzt gemeinsam freigeben? Die Standadressen, Angebote und Verpflegung werden öffentlich sichtbar. Namen und E-Mail-Adressen bleiben im Adminbereich.`)){status.textContent='Sammelfreigabe abgebrochen.';return}
    for(const id of ids){
      if(version!==adminSessionVersion||adminDashboard.hidden)return;
      status.textContent=`Freigabe läuft: ${attempted} von ${ids.length} bearbeitet …`;
      const {error}=await supabaseClient.rpc('approve_stand_registration',{registration_id:id});
      if(version!==adminSessionVersion||adminDashboard.hidden)return;
      attempted++;if(error)failed++;else approved++;
      if(error?.code==='42501')throw error;
    }
    status.textContent=`${approved} Anmeldungen freigegeben.${failed?` ${failed} konnten nicht freigegeben werden; bitte die verbleibenden offenen Anmeldungen prüfen.`:''}`;
  }catch{
    if(version===adminSessionVersion&&!adminDashboard.hidden)status.textContent=`Sammelfreigabe unterbrochen. ${approved} Anmeldungen wurden freigegeben. Bitte die verbleibenden offenen Anmeldungen prüfen.`;
  }finally{
    bulkApprovalBusy=false;
    if(version===adminSessionVersion&&!adminDashboard.hidden)await Promise.allSettled([loadApplications(),loadPublishedStands(),loadWithdrawalRequests()]);
    updateBulkApprovalButton();
  }
});
async function loadApplications(){
  const sessionVersion=adminSessionVersion;
  adminStatus(adminMessage,'Anmeldungen werden geladen …');
  const {data,error,count}=await supabaseClient.from('stand_registrations').select('*',{count:'exact'}).eq('status','pending').order('created_at',{ascending:true});
  if(sessionVersion!==adminSessionVersion||adminDashboard.hidden)return;
  if(error){setPendingApplicationCount(null);adminStatus(adminMessage,'Kein Adminzugriff. Bitte den Benutzer in Supabase als Admin freischalten.');return}
  const pendingCount=count??data.length;
  setPendingApplicationCount(pendingCount);
  adminStatus(adminMessage,'');
  adminApplications.innerHTML=data.map(r=>`<article class="admin-application"><div class="admin-toolbar"><div><h3>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</h3><p>${escapeHtml(localStandAddress(r.address))} · <a href="mailto:${encodeURIComponent(r.email)}">${escapeHtml(r.email)}</a></p></div><span class="admin-pending">Offen</span></div><div class="tag-row">${(r.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>${r.description?`<p>${escapeHtml(r.description)}</p>`:''}${r.food_available==='Ja'?`<p><strong>Verpflegung:</strong> ${escapeHtml(r.food_description||'Ja')}</p>`:''}<div class="admin-actions"><button class="primary-button" data-approve="${escapeHtml(r.id)}">Freigeben</button><button class="secondary-button" data-reject="${escapeHtml(r.id)}">Ablehnen</button></div></article>`).join('');
  updateBulkApprovalButton();
  $$('[data-approve]').forEach(button=>button.addEventListener('click',()=>moderateRegistration(button.dataset.approve,'approve')));
  $$('[data-reject]').forEach(button=>button.addEventListener('click',()=>moderateRegistration(button.dataset.reject,'reject')));
}
async function loadAdminPublishedStands(){
  if(await loadPublishedStands()===false)adminStatus(adminManageMessage,'Veröffentlichte Stände konnten nicht geladen werden.');
}
function renderAdminPublishedStands(data){
  const opened=new Set([...adminPublishedStands.querySelectorAll('details[open] .admin-stand-edit')].map(form=>form.dataset.standId));
  const sorted=[...data].sort(compareStandAddresses);
  const signature=JSON.stringify(sorted.map(({id,address,categories,food_available,food_description,description})=>({id,address,categories,food_available,food_description,description})));
  if(signature===adminPublishedSignature)return;
  adminPublishedSignature=signature;
  adminPublishedStands.innerHTML=sorted.map(stand=>`<article class="admin-application admin-published-stand"><details ${opened.has(stand.id)?'open':''}><summary>${escapeHtml(streetAddress(stand.address))}</summary><form class="admin-stand-edit" data-stand-id="${escapeHtml(stand.id)}"><label>Straße und Hausnummer<input name="address" required maxlength="120" value="${escapeHtml(streetAddress(stand.address,''))}"></label><label>Warengruppen, eine pro Zeile<textarea name="categories" required>${escapeHtml((stand.categories||[]).join('\n'))}</textarea></label><label>Verpflegung<select name="foodAvailable"><option value="Nein" ${stand.food_available==='Nein'?'selected':''}>Nein</option><option value="Ja" ${stand.food_available==='Ja'?'selected':''}>Ja</option></select></label><label>Angaben zur Verpflegung<textarea name="foodDescription" maxlength="500">${escapeHtml(stand.food_description||'')}</textarea></label><label>Beschreibung<textarea name="description" maxlength="1000">${escapeHtml(stand.description||'')}</textarea></label><div class="admin-actions"><button class="primary-button" type="submit">Änderungen speichern</button><button class="secondary-button danger-button" type="button" data-delete-stand="${escapeHtml(stand.id)}">Stand löschen</button></div></form></details></article>`).join('')||'<p class="empty-inline">Noch keine veröffentlichten Stände.</p>';
  adminPublishedStands.querySelectorAll('.admin-stand-edit').forEach(form=>form.addEventListener('submit',savePublishedStand));
  adminPublishedStands.querySelectorAll('[data-delete-stand]').forEach(button=>button.addEventListener('click',()=>deletePublishedStand(button.dataset.deleteStand)));
}
async function savePublishedStand(event){
  event.preventDefault();
  const form=event.currentTarget,data=new FormData(form),id=form.dataset.standId;
  const categories=normalizeCategories(data.get('categories').split(/\r?\n/));
  if(!categories.length){adminStatus(adminManageMessage,'Bitte mindestens eine Warengruppe eintragen.');return}
  const address=localStandAddress(data.get('address'));
  const previousAddress=stands.find(stand=>stand.id===id)?.address;
  const locationUpdate=previousAddress!==address?{lat:null,lng:null}:{};
  const {data:saved,error}=await supabaseClient.from('published_stands').update({address,categories,food_available:data.get('foodAvailable'),food_description:data.get('foodDescription').trim(),description:data.get('description').trim(),...locationUpdate}).eq('id',id).select('id').maybeSingle();
  if(error||!saved){adminStatus(adminManageMessage,'Änderungen konnten nicht gespeichert werden.');return}
  adminStatus(adminManageMessage,'Änderungen gespeichert.');
  await loadPublishedStands();
}
async function deletePublishedStand(id){
  if(!window.confirm('Diesen Stand aus der öffentlichen Karte löschen?'))return;
  const {data:deleted,error}=await supabaseClient.from('published_stands').delete().eq('id',id).select('id').maybeSingle();
  if(error||!deleted){adminStatus(adminManageMessage,'Der Stand konnte nicht gelöscht werden.');return}
  adminStatus(adminManageMessage,'Stand aus der Karte gelöscht.');
  await loadPublishedStands();
}
async function moderateRegistration(id,action){
  if(bulkApprovalBusy)return;
  const {error}=await supabaseClient.rpc(action==='approve'?'approve_stand_registration':'reject_stand_registration',{registration_id:id});
  if(error){adminStatus(adminMessage,'Aktion fehlgeschlagen. Bitte Datenbankeinrichtung und Adminrechte prüfen.');return}
  adminStatus(adminMessage,action==='approve'?'Stand freigegeben und veröffentlicht.':'Anmeldung abgelehnt.');
  await Promise.all([loadApplications(),loadPublishedStands()]);
}

function updateAdminTodoCount(){
  const badge=$('#drawerAdminCount');
  const counts=['#pendingRegistrationsCount','#withdrawalCount','#geocodingReportCount'].map(selector=>$(selector).textContent.trim());
  const known=counts.every(value=>/^\d+$/.test(value));
  const total=counts.reduce((sum,value)=>sum+(Number(value)||0),0);
  badge.hidden=$('#pendingRegistrationsCount').textContent==='–';
  badge.textContent=known?String(total):'…';
  badge.setAttribute('aria-label',known?`${total} offene Aufgaben`:'Offene Aufgaben werden geladen');
}
function setPendingApplicationCount(count){
  $('#pendingRegistrationsCount').textContent=count===null?'–':String(count);
  updateAdminTodoCount();
  updateBulkApprovalButton();
}
let pendingCountSequence=0;
async function refreshPendingApplicationCount(){
  const sequence=++pendingCountSequence;
  if(!supabaseClient){setPendingApplicationCount(null);return}
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(sequence!==pendingCountSequence)return;
    if(!session){setPendingApplicationCount(null);return}
    const sessionVersion=adminSessionVersion;
    const [{count,error},withdrawals]=await Promise.all([
      supabaseClient.from('stand_registrations').select('id',{count:'exact',head:true}).eq('status','pending'),
      supabaseClient.rpc('admin_withdrawals')
    ]);
    if(sequence!==pendingCountSequence||sessionVersion!==adminSessionVersion)return;
    $('#withdrawalCount').textContent=withdrawals.error?'–':String((withdrawals.data||[]).length);
    setPendingApplicationCount(error?null:count);
  }catch{if(sequence===pendingCountSequence)setPendingApplicationCount(null)}
}
setInterval(()=>{if(document.visibilityState==='visible'){refreshPendingApplicationCount();if(!adminDashboard.hidden)loadWithdrawalRequests()}},SUPABASE_REFRESH_INTERVAL);
$('#refreshStands').addEventListener('click',async event=>{
  const button=event.currentTarget;
  if(button.disabled)return;
  button.disabled=true;button.classList.add('is-refreshing');button.setAttribute('aria-busy','true');
  try{
    const loaded=await loadPublishedStands({retryGeocoding:true});
    if(loaded===false){toast(navigator.onLine===false?'Du bist offline. Vorhandene Standdaten bleiben sichtbar; bei Netzrückkehr wird automatisch aktualisiert.':'Standdaten sind gerade nicht erreichbar. Vorhandene Daten bleiben sichtbar; die App versucht es automatisch erneut.');return}
    const tasks=[refreshPendingApplicationCount(),loadEventSettings()];
    if(!adminDashboard.hidden)tasks.push(loadApplications(),loadWithdrawalRequests());
    const additional=await Promise.allSettled(tasks);
    toast(loaded===null?'Standdaten werden bereits aktualisiert.':additional.some(result=>result.status==='rejected')?'Standdaten aktualisiert. Zusätzliche Informationen konnten noch nicht vollständig geladen werden.':'Standdaten aktualisiert.');
  }catch{toast('Standdaten konnten nicht geladen werden. Bitte erneut versuchen.')}
  finally{button.disabled=false;button.classList.remove('is-refreshing');button.setAttribute('aria-busy','false')}
});

if(location.hash==='#admin')refreshAdmin();

function downloadPrivateFile(content,type,name){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function createXlsxWorkbook(worksheets){
  const encoder=new TextEncoder();
  const xml=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const valueText=value=>Array.isArray(value)?value.join(', '):value&&typeof value==='object'?JSON.stringify(value):value;
  const columnName=index=>{let name='';for(let value=index;value;value=Math.floor((value-1)/26))name=String.fromCharCode(65+(value-1)%26)+name;return name};
  const sheetXml=(rows,preferred,headers)=>{
    const keys=[...preferred,...new Set(rows.flatMap(row=>Object.keys(row)).filter(key=>!preferred.includes(key)))];
    const rowXml=(values,rowNumber,header=false)=>`<row r="${rowNumber}">${values.map((value,index)=>`<c r="${columnName(index+1)}${rowNumber}" t="inlineStr"${header?' s="1"':''}><is><t xml:space="preserve">${xml(valueText(value))}</t></is></c>`).join('')}</row>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'+
      rowXml(keys.map(key=>headers[key]||key),1,true)+rows.map((row,index)=>rowXml(keys.map(key=>row[key]),index+2)).join('')+
      '</sheetData><autoFilter ref="A1:'+columnName(Math.max(keys.length,1))+(rows.length+1)+'"/></worksheet>';
  };
  const sheetNames=worksheets.map(sheet=>sheet.name);
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+worksheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+sheetNames.map((name,index)=>`<sheet name="${xml(name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')+'</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+worksheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')+`<Relationship Id="rId${worksheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  };
  worksheets.forEach((sheet,index)=>{files[`xl/worksheets/sheet${index+1}.xml`]=sheetXml(sheet.rows,sheet.preferred,sheet.headers)});
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0};
  const join=parts=>{const output=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length}return output};
  const header=(size,values)=>{const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);for(const [offset,value,width] of values)width===2?view.setUint16(offset,value,true):view.setUint32(offset,value,true);return bytes};
  const now=new Date(),dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  const local=[],central=[];let offset=0;
  for(const [name,content] of Object.entries(files)){
    const nameBytes=encoder.encode(name),data=encoder.encode(content),crc=crc32(data);
    const localHeader=header(30,[[0,0x04034b50,4],[4,20,2],[6,0,2],[8,0,2],[10,dosTime,2],[12,dosDate,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,nameBytes.length,2],[28,0,2]]);
    local.push(localHeader,nameBytes,data);
    const centralHeader=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0,2],[10,0,2],[12,dosTime,2],[14,dosDate,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,nameBytes.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,offset,4]]);
    central.push(centralHeader,nameBytes);offset+=localHeader.length+nameBytes.length+data.length;
  }
  const centralBytes=join(central),end=header(22,[[0,0x06054b50,4],[4,0,2],[6,0,2],[8,Object.keys(files).length,2],[10,Object.keys(files).length,2],[12,centralBytes.length,4],[16,offset,4],[20,0,2]]);
  return join([...local,centralBytes,end]);
}
function downloadRegistrationPdf(application,receipt){
  const ascii=value=>String(value).replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss').replace(/[^\x20-\x7e]/g,'?');
  const labels={first_name:'Vorname',last_name:'Nachname',email:'E-Mail',address:'Standort',categories:'Angebote',food_available:'Verpflegung',food_description:'Verpflegungsangebot',description:'Beschreibung'};
  const lines=['Dorfflohmarkt - Anmeldebestaetigung','Status: E-Mail-Bestaetigung ausstehend',...Object.entries(application).filter(([key])=>!['late_registration_token','status'].includes(key)).map(([k,v])=>`${labels[k]||k}: ${Array.isArray(v)?v.join(', '):v}`),'Sicher aufbewahren. Nicht oeffentlich weitergeben.','Abmeldung in der App unter Anmeldung anfragen.','Kontakt: flohmarkt@dudenhofen.org'].flatMap(line=>ascii(line).match(/.{1,85}(?:\s|$)|.{1,85}/g)||['']);
  const pages=[];for(let i=0;i<lines.length;i+=43)pages.push(lines.slice(i,i+43));
  const objects=['','<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>','<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>'];
  const kids=[];
  const pdfText=value=>ascii(value).replace(/[\\()]/g,'\\$&');
  const heading=(value,x,y,size=12,font='F2')=>`BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
  const phraseWords=String(receipt.keyphrase).trim().split(/\s+/);
  const credentialStream=[
    '0.09 0.20 0.37 rg',heading('Deine Anmeldebestaetigung',42,785,22),
    heading('Wichtig fuer eine spaetere Abmeldung',42,750,12,'F1'),
    '0.92 0.95 0.99 rg 42 622 511 96 re f',
    '0.09 0.20 0.37 rg',heading('ANMELDENUMMER',58,692,12),heading(receipt.registration_id,58,656,14),
    '0.92 0.95 0.99 rg 42 436 511 160 re f',
    '0.09 0.20 0.37 rg',heading('PERSOENLICHE ABMELDEPHRASE',58,570,12),
    ...phraseWords.map((word,i)=>heading(word,58,535-i*26,Math.min(13,Math.floor(470/(Math.max(1,word.length)*0.6))))),
    heading('Die beiden Woerter gehoeren zusammen.',58,454,10,'F1'),
    heading('Bitte sicher aufbewahren und nicht weitergeben.',42,395,12),
    heading('Unter Anmeldung > Meinen Stand abmelden brauchst du',42,366,11,'F1'),
    heading('die Anmeldenummer und beide Woerter der Abmeldephrase.',42,348,11,'F1'),
    heading('Deine Anmeldedaten folgen auf der naechsten Seite.',42,310,11,'F1'),
    heading('Die Anmeldung ist noch nicht freigegeben.',42,290,11,'F1'),
    heading('Kontakt: flohmarkt@dudenhofen.org',42,255,11,'F1')
  ].join('\n');
  const addPage=stream=>{const id=objects.length;kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)};
  addPage(credentialStream);
  for(const page of pages){const id=objects.length;const stream='BT /F1 10 Tf 42 800 Td 16 TL '+page.map((line,i)=>(i?'T* ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+' ET';kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)}
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
  const start=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  downloadPrivateFile(pdf,'application/pdf','Dorfflohmarkt-Anmeldebestaetigung.pdf');
}
const withdrawalPanel=document.createElement('details');withdrawalPanel.className='admin-manual-entry';
withdrawalPanel.innerHTML='<summary>Meinen Stand abmelden</summary><p>Dein Stand bleibt sichtbar, bis das Organisationsteam die Abmeldung bestätigt hat. Für ältere Anmeldungen ohne Abmeldephrase oder zur Löschung personenbezogener Daten schreibe an <a href="mailto:flohmarkt@dudenhofen.org">flohmarkt@dudenhofen.org</a>.</p><form id="withdrawalForm"><label>Anmeldenummer<input name="registrationId" required autocomplete="off"></label><label>Persönliche Abmeldephrase (zwei Wörter)<input name="phrase" required autocomplete="off" spellcheck="false"></label><label>Kommentar (optional)<textarea name="comment" maxlength="1000" rows="3" placeholder="Möchtest du dem Organisationsteam etwas mitteilen?"></textarea></label><button class="primary-button" type="submit">Abmeldung abschicken</button><p role="status"></p></form>';
$('#page-anmeldung .form-shell').append(withdrawalPanel);
$('#withdrawalForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button'),message=form.querySelector('[role="status"]');
  if(button.disabled||!form.reportValidity())return;
  if(!supabaseClient){message.textContent='Die Abmeldung ist gerade nicht verfügbar. Kontakt: flohmarkt@dudenhofen.org';return}
  const data=new FormData(form);
  const registrationId=String(data.get('registrationId')).trim().replace(/[\s\u200B-\u200D\uFEFF]/g,'');
  const phrase=String(data.get('phrase')).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  const comment=String(data.get('comment')||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationId)){
    message.textContent='Bitte die vollständige Anmeldenummer aus deiner Bestätigung eingeben.';return;
  }
  button.disabled=true;message.textContent='Abmeldung wird übermittelt …';
  try{
    let {data:accepted,error}=await supabaseClient.rpc('request_withdrawal',{p_id:registrationId,p_phrase:phrase,p_comment:comment});
    const missingFunction=issue=>issue?.code==='PGRST202'||issue?.code==='42883';
    // Older installations support requests without a comment. Never discard a comment.
    if(missingFunction(error)&&!comment){
      ({data:accepted,error}=await supabaseClient.rpc('request_withdrawal',{p_id:registrationId,p_phrase:phrase}));
    }
    if(error){
      if(error.message?.includes('app_inactive')){message.textContent='Die App ist derzeit pausiert. Kontakt: flohmarkt@dudenhofen.org';void loadEventSettings()}
      else if(missingFunction(error))message.textContent='Die Abmeldefunktion ist in der Datenbank noch nicht vollständig eingerichtet. Bitte das Organisationsteam unter flohmarkt@dudenhofen.org informieren'+(comment?' (Erweiterung für Kommentare fehlt).':'.');
      else if(['42501','PGRST301','PGRST302'].includes(error.code))message.textContent='Die Datenbank erlaubt die Abmeldung gerade nicht. Bitte das Organisationsteam unter flohmarkt@dudenhofen.org informieren.';
      else message.textContent='Die Abmeldung konnte wegen eines Verbindungs- oder Datenbankfehlers nicht übermittelt werden. Deine Eingaben bleiben erhalten. Bitte später erneut versuchen oder flohmarkt@dudenhofen.org kontaktieren.';
      return;
    }
    if(accepted===true){message.textContent='Deine Abmeldung wurde zur Prüfung übermittelt. Der Stand wird nach Bestätigung entfernt.';form.reset()}
    else message.textContent='Anmeldenummer und Abmeldephrase passen nicht zusammen oder die Prüfung ist vorübergehend gesperrt. Nach mehreren Fehlversuchen bitte 15 Minuten warten. Ältere Anmeldungen ohne Phrase: flohmarkt@dudenhofen.org.';
  }catch{message.textContent='Die Anfrage konnte nicht übermittelt werden. Bitte Verbindung prüfen und später erneut versuchen.'}
  finally{button.disabled=false}
});

let withdrawalRequestSequence=0;
async function loadWithdrawalRequests(){
  const sessionVersion=adminSessionVersion,sequence=++withdrawalRequestSequence;
  const host=$('#withdrawalRequests');const {data,error}=await supabaseClient.rpc('admin_withdrawals');
  if(sessionVersion!==adminSessionVersion||sequence!==withdrawalRequestSequence||adminDashboard.hidden)return;
  if(error){$('#withdrawalCount').textContent='–';updateAdminTodoCount();host.textContent='Abmeldungen können nicht geladen werden. Bitte Supabase-Erweiterung prüfen.';return}
  $('#withdrawalCount').textContent=String((data||[]).length);updateAdminTodoCount();
  host.innerHTML=(data||[]).map(request=>`<article class="admin-application"><h3>${escapeHtml(request.address)}</h3><p>${escapeHtml(request.name)}</p>${request.comment?`<p class="withdrawal-comment"><strong>Kommentar:</strong> ${escapeHtml(request.comment)}</p>`:''}<button type="button" data-withdraw-approve="${escapeHtml(request.id)}">Abmeldung bestätigen</button> <button type="button" data-withdraw-reject="${escapeHtml(request.id)}">Ablehnen</button></article>`).join('')||'Keine offenen Abmeldungen.';
  host.querySelectorAll('button').forEach(button=>button.addEventListener('click',async()=>{
    const approve=Boolean(button.dataset.withdrawApprove);if(approve&&!confirm('Abmeldung bestätigen und Stand aus der öffentlichen Ansicht entfernen?'))return;
    button.disabled=true;const {error}=await supabaseClient.rpc('moderate_withdrawal',{p_id:button.dataset.withdrawApprove||button.dataset.withdrawReject,p_approve:approve});
    if(error){toast('Abmeldung konnte nicht bearbeitet werden.');button.disabled=false;return}
    await Promise.all([loadWithdrawalRequests(),loadApplications(),loadPublishedStands(),loadAdminPublishedStands()]);
  }));
}
$('#exportStands').addEventListener('click',async event=>{
  const button=event.currentTarget,status=$('#exportStatus');
  if(!confirm('Vertrauliche Namen, E-Mail-Adressen und Standdaten exportieren? Speichere die Datei nur an einem geschützten Ort.'))return;
  const sessionVersion=adminSessionVersion;
  button.disabled=true;status.textContent='Export wird geladen …';
  try{
    const {data,error}=await supabaseClient.rpc('admin_export_stands');
    if(sessionVersion!==adminSessionVersion||adminDashboard.hidden)return;
    if(error)throw error;
    const headers={first_name:'Vorname',last_name:'Nachname',address:'Adresse',email:'E-Mail'};
    const workbook=createXlsxWorkbook([
      {name:'Anmeldungen',rows:data.registrations||[],preferred:['first_name','last_name','address','email'],headers},
      {name:'Veröffentlichte Stände',rows:data.published||[],preferred:['address'],headers}
    ]);
    downloadPrivateFile(workbook,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Dorfflohmarkt-Vertraulich.xlsx');status.textContent='Excel-Datei erstellt. Enthält vertrauliche Daten; nicht weiterveröffentlichen.';
  }catch{status.textContent='Export nicht verfügbar. Adminfreigabe und Supabase-Erweiterung prüfen.'}finally{button.disabled=false}
});

function renderAppActivity(){
  const paused=appActive!==true,isAdminPage=location.hash==='#admin';
  document.body.classList.toggle('app-paused',paused);
  $('#appUnavailable').hidden=!paused||isAdminPage;
  $('#appUnavailable h1').textContent=appActive===false?'Der Dorfflohmarkt ist derzeit nicht aktiv':'App-Status derzeit nicht verfügbar';
  const toggle=$('#appActivityToggle');toggle.disabled=appActive===null||appActivitySaving;
  toggle.setAttribute('aria-checked',String(appActive===true));
  if(!paused&&townMap)requestAnimationFrame(()=>{townMap.invalidateSize({pan:false});applyStartupMapView()});
  $('#appActivityStatus').textContent=appActivitySaving?'App-Status wird gespeichert …':appActive===true?'Die öffentlichen App-Funktionen sind aktiv.':appActive===false?'Die öffentlichen App-Funktionen sind pausiert. Der Adminbereich bleibt verfügbar.':'App-Status nicht verfügbar. Verbindung und Supabase-Erweiterung prüfen.';
}
$('#appActivityToggle').addEventListener('click',async()=>{
  if(appActivitySaving||appActive===null)return;
  const next=!appActive;
  if(!next&&!confirm('App für alle Besucher und Verkäufer pausieren? Daten und Adminzugang bleiben erhalten.'))return;
  appActivitySaving=true;renderAppActivity();
  try{
    const {data,error}=await supabaseClient.rpc('set_app_active',{p_active:next});
    if(error||typeof data!=='boolean')throw new Error('save_failed');
    appActive=data;eventSettingsBroadcast?.postMessage({changed:true});
    await loadEventSettings();if(next)await loadPublishedStands();toast(next?'App ist wieder aktiv.':'App ist jetzt pausiert.');
  }catch{toast('App-Status konnte nicht gespeichert werden. Adminrechte und Datenbankerweiterung prüfen.')}
  finally{appActivitySaving=false;renderAppActivity()}
});
function deleteFailureMessage(error){
  const message=String(error?.message||'');
  if(message.includes('data_changed_repeat_confirmation'))return 'Daten haben sich geändert. Bitte die Löschung mit neuer Vorschau erneut vorbereiten.';
  if(message.includes('confirmation_expired'))return 'Die Bestätigung ist abgelaufen. Bitte eine neue Löschvorschau laden.';
  if(error?.code==='PGRST202'||error?.code==='42883')return 'Die Supabase-Löschfunktion fehlt oder ist veraltet. Bitte die Datenbankerweiterung für die App-Verwaltung aktualisieren.';
  if(error?.code==='42501'||message.includes('admin_required'))return 'Keine Berechtigung zur Sammellöschung. Bitte erneut als freigeschalteter Admin anmelden.';
  return `Löschung nicht abgeschlossen. Fehlercode: ${String(error?.code||'VERBINDUNG')}. Bitte aktuelle Daten laden und die Servereinrichtung prüfen.`;
}
let deleteChallenge=null,deleteAllBusy=false;
function clearDeleteConfirmation(){
  deleteChallenge=null;
  const form=$('#deleteAllConfirmation');if(form){form.hidden=true;form.reset()}
  const preview=$('#deleteAllPreview');if(preview)preview.textContent='';
}
$('#cancelDeleteAll').addEventListener('click',()=>{clearDeleteConfirmation();$('#deleteAllStatus').textContent='Löschung abgebrochen.'});
$('#prepareDeleteAll').addEventListener('click',async()=>{
  if(deleteAllBusy)return;
  clearDeleteConfirmation();
  if(!confirm('Sicherheitsabfrage 1 von 2: Alle Stand- und Anmeldedaten endgültig löschen? Zuerst wird eine Vorschau geladen. Es wurde noch nichts gelöscht.'))return;
  const version=adminSessionVersion,button=$('#prepareDeleteAll'),status=$('#deleteAllStatus');
  deleteAllBusy=true;button.disabled=true;status.textContent='Löschvorschau wird geladen …';
  try{
    const {data,error}=await supabaseClient.rpc('prepare_delete_all_stand_data');
    if(version!==adminSessionVersion||adminDashboard.hidden)return;
    if(error)throw error;
    if(!data?.challenge||!data?.counts)throw new Error('invalid_preview');
    deleteChallenge={token:data.challenge,version};
    const c=data.counts;
    $('#deleteAllPreview').textContent=`Sicherheitsabfrage 2 von 2: ${c.published} veröffentlichte Stände, ${c.registrations} interne Anmeldungen, ${c.withdrawals} Abmeldungen, ${c.secrets} Abmeldephrasen, ${c.tokens} Anmeldecodes und ${c.positions} Standpositionen werden endgültig gelöscht. Bestätigung gilt höchstens fünf Minuten.`;
    $('#deleteAllConfirmation').hidden=false;$('#deleteAllConfirmation input').focus();status.textContent='Noch nichts gelöscht. Prüfe die Vorschau und bestätige die Texteingabe.';
  }catch(error){if(version===adminSessionVersion&&!adminDashboard.hidden)status.textContent=deleteFailureMessage(error)}
  finally{deleteAllBusy=false;button.disabled=false}
});
$('#deleteAllConfirmation').addEventListener('submit',async event=>{
  event.preventDefault();if(deleteAllBusy||!deleteChallenge)return;
  const form=event.currentTarget,phrase=new FormData(form).get('confirmation');
  if(phrase!=='ALLE STANDDATEN LÖSCHEN'){$('#deleteAllStatus').textContent='Bitte den Bestätigungstext exakt eingeben.';return}
  if(deleteChallenge.version!==adminSessionVersion){clearDeleteConfirmation();return}
  deleteAllBusy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);
  try{
    const {error}=await supabaseClient.rpc('delete_all_stand_data',{p_challenge:deleteChallenge.token,p_confirmation:phrase});
    if(error){
      $('#deleteAllStatus').textContent=deleteFailureMessage(error);
      clearDeleteConfirmation();return;
    }
    clearDeleteConfirmation();favorites=[];lateRegistrationToken='';renderRegistrationAvailability();saveFavs();geocodingDiagnostics.clear();
    $('#generatedLateToken').value='';$('#lateTokenOutput').hidden=true;
    $('#deleteAllStatus').textContent='Alle Stand- und Anmeldedaten wurden gelöscht. Adminzugänge und App-Einstellungen bleiben erhalten.';
    await Promise.allSettled([loadPublishedStands(),loadApplications(),loadWithdrawalRequests(),loadAdminPublishedStands()]);
  }catch{clearDeleteConfirmation();$('#deleteAllStatus').textContent='Ergebnis unklar. Bitte Standdaten aktualisieren, bevor du erneut löschst.'}
  finally{deleteAllBusy=false;form.querySelectorAll('button,input').forEach(el=>el.disabled=false)}
});
