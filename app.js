// All stand data is loaded from Supabase. Retain favorites from the former examples.
const legacyStandIds={
  'example-anne-frank':'20288ed3-2b71-520c-b98b-ba928e3011ac',
  'example-goethe':'0ad76c3b-8c2b-51d2-897b-cb2ae1417d27',
  'example-beethoven':'943afd79-7ef8-5146-bcfd-7358a2edeba6'
};
let stands=[];
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
const geocodingReport=document.createElement('details');
geocodingReport.className='admin-manual-entry geocoding-report';
geocodingReport.innerHTML='<summary id="geocodingReportHeading">Geocodierung: Fehlerbericht</summary><p>Veröffentlichte Stände ohne genaue Kartenposition. Laufende und noch ausstehende Suchen sind gesondert gekennzeichnet.</p><p id="geocodingReportSummary" role="status"></p><button class="secondary-button" type="button" data-geocode-all>Alle erneut versuchen</button><p id="geocodingReportMessage" role="status"></p><div id="geocodingReportList"></div>';
$('#adminDashboard .admin-manage-entry').before(geocodingReport);
function hasStandPosition(stand){return Number.isFinite(stand.lat)&&Number.isFinite(stand.lng)&&Math.abs(stand.lat)<=90&&Math.abs(stand.lng)<=180&&(stand.geocodingSource!=='maps-co'||stand.geocodingExpiresAt>Date.now())}
function renderGeocodingReport(){
  const host=$('#geocodingReportList');
  if($('#adminDashboard').hidden){host.replaceChildren();return}
  const unresolved=stands.filter(stand=>!hasStandPosition(stand)).sort((a,b)=>streetAddress(a.address).localeCompare(streetAddress(b.address),'de',{numeric:true}));
  $('#geocodingReportHeading').textContent=`Geocodierung: Fehlerbericht (${unresolved.length})`;
  const explanations={LOOKUP_RUNNING:'Suche läuft …',PENDING:'Eine andere Anfrage ermittelt die Position bereits.',ZERO_RESULTS:'Keine passende Adresse gefunden.',INEXACT_RESULT:'Nur eine ungenaue Position gefunden; kein Haus-Pin gesetzt.',OUTSIDE_TOWN:'Ergebnis liegt außerhalb von 67373 Dudenhofen.',OVER_QUERY_LIMIT:'Anfragelimit des Geocodierungsdienstes erreicht.',UNAVAILABLE:'Geocodierungsdienst oder Verbindung derzeit nicht verfügbar.',NOT_CONFIGURED:'Geocodierung ist nicht eingerichtet oder deaktiviert.',REQUEST_DENIED:'Der Geocodierungsdienst hat die Anfrage abgelehnt. Freischaltung oder Dienstkonfiguration prüfen.',NOT_PUBLISHED:'Stand ist für die Positionssuche nicht als veröffentlicht verfügbar.',INVALID_RESULT:'Der Dienst hat keine verwendbare genaue Position geliefert.'};
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

const countdownTimer=$('#countdownTimer');
let marketDay=new Date(2027,8,1,0,0,0);
let marketDayEnd=new Date(2027,8,2,0,0,0);
const marketDateLabel=$('.countdown-content small');
function setMarketDate(value){
  const [year,month,day]=value.split('-').map(Number);
  if(!year||!month||!day)return false;
  marketDay=new Date(year,month-1,day,0,0,0);
  marketDayEnd=new Date(year,month-1,day+1,0,0,0);
  const formatted=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(marketDay);
  marketDateLabel.textContent=`NÄCHSTER DORFFLOHMARKT · ${formatted}`;
  $('.countdown-badge').setAttribute('aria-label',`Countdown bis zum Dorfflohmarkt am ${new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long',year:'numeric'}).format(marketDay)}`);
  const dateInput=$('#eventDateInput');
  if(dateInput)dateInput.value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  updateCountdown();
  return true;
}
function updateCountdown(){
  const now=new Date();
  if(now>=marketDay&&now<marketDayEnd){countdownTimer.textContent='Heute ist Dorfflohmarkt!';return}
  if(now>=marketDayEnd){countdownTimer.textContent='Der Dorfflohmarkt ist vorbei.';return}
  const seconds=Math.floor((marketDay-now)/1000);
  const days=Math.floor(seconds/86400);
  const hours=Math.floor(seconds%86400/3600);
  const minutes=Math.floor(seconds%3600/60);
  const remainingSeconds=seconds%60;
  countdownTimer.textContent=`${days} Tage · ${String(hours).padStart(2,'0')} Std · ${String(minutes).padStart(2,'0')} Min · ${String(remainingSeconds).padStart(2,'0')} Sek`;
}
updateCountdown();
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
function card(s,expanded=false){
  const liked=favorites.includes(s.id),heading=streetAddress(s.address);
  return `<article class="stand-card"><div class="stand-card-top"><h3>${escapeHtml(heading)}</h3><button class="favorite-toggle ${liked?'active':''}" data-fav="${escapeHtml(s.id)}" aria-label="${liked?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}: ${escapeHtml(heading)}">${liked?'★':'☆'}</button></div><div class="tag-row">${(s.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>${s.food_available==='Ja'&&s.food_description?`<p class="card-desc"><strong>Verpflegung:</strong> ${escapeHtml(s.food_description)}</p>`:''}<details class="stand-public-details" data-stand-id="${escapeHtml(s.id)}" ${expanded?'open':''}><summary>Standdetails</summary><dl><dt>Alle Angebote</dt><dd>${(s.categories||[]).length?`<ul>${s.categories.map(category=>`<li>${escapeHtml(category)}</li>`).join('')}</ul>`:'Keine Angaben.'}</dd><dt>Verpflegung</dt><dd>${s.food_available==='Ja'?escapeHtml(s.food_description||'Verpflegung wird angeboten.'):'Keine Verpflegung.'}</dd></dl></details></article>`;
}
function renderStands(){
  const expanded=new Set($$('.stand-public-details[open]').map(element=>element.dataset.standId));
  const visible=stands.filter(matches).sort(compareStandAddresses);
  $('#standGrid').innerHTML=visible.map(stand=>card(stand,expanded.has(stand.id))).join('');
  $('#noStands').hidden=visible.length>0;
  $('#noStands').textContent=stands.length?'Keine Stände für diese Auswahl gefunden.':'Noch keine Stände angemeldet.';
  $('#resultCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;
  const favs=favorites.map(id=>stands.find(s=>s.id===id)).filter(Boolean);
  $('#favoritesGrid').innerHTML=[...favs].sort(compareStandAddresses).map(stand=>card(stand,expanded.has(stand.id))).join('');
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
    const hasPosition=stand=>Number.isFinite(stand.lat)&&Number.isFinite(stand.lng)&&
      (stand.geocodingSource!=='maps-co'||stand.geocodingExpiresAt>Date.now());
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
function showPage(name){const page=['karte','anmeldung','favoriten','hinweise','admin'].includes(name)?name:'karte';$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===page));closeDrawer();window.scrollTo({top:0,behavior:'smooth'});if(page==='karte'&&townMap)setTimeout(()=>townMap.invalidateSize(),80);if(page==='admin')refreshAdmin();if(page==='anmeldung')loadEventSettings();location.hash=page}
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
  if(registrationOpen!==true&&!(registrationOpen===false&&lateRegistrationToken)){toast(registrationOpen===false?'Bitte zuerst einen gültigen Nachzügler-Token eingeben.':'Die Anmeldung ist gerade nicht verfügbar. Bitte später erneut versuchen.');return}
  const data=new FormData(form);
  const categories=data.getAll('category');
  const otherOffer=data.get('otherOffer')?.trim();
  if(otherOffer)categories.push(`Sonstiges: ${otherOffer}`);
  if(!categories.length){const firstGroup=$('.category-group');if(firstGroup){firstGroup.open=true;firstGroup.querySelector('summary').focus();firstGroup.scrollIntoView({behavior:'smooth',block:'center'})}toast('Bitte wähle mindestens ein Verkaufsangebot aus.');return}
  const application={first_name:data.get('firstName'),last_name:data.get('lastName'),email:data.get('email'),address:localStandAddress(data.get('address')),categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||'',status:'pending'};
  if(registrationOpen===false)application.late_registration_token=lateRegistrationToken;
  const submitButton=form.querySelector('.submit-button');
  form.dataset.submitting='true';submitButton.disabled=true;
  let error;
  try{({error}=await supabaseClient.from('stand_registrations').insert(application))}
  catch{error={message:'unavailable'}}
  finally{form.dataset.submitting='false';submitButton.disabled=false}
  if(error){
    if(error.message?.includes('late_token_invalid_or_used')){lateRegistrationToken='';renderRegistrationAvailability();$('#lateTokenMessage').textContent='Der Token ist ungültig oder wurde bereits verwendet. Bitte einen neuen Token beim Ortsverein anfragen.';toast('Der Token ist ungültig oder bereits verwendet.')}
    else if(error.message?.includes('late_tokens_closed_only')){await loadEventSettings();toast('Die Anmeldung ist wieder geöffnet. Bitte erneut absenden.')}
    else if(error.message?.includes('registrations_closed')){await loadEventSettings();toast('Zurzeit werden Anmeldungen nur mit Nachzügler-Token angenommen.')}
    else toast('Die Anmeldung konnte nicht gesendet werden. Bitte versuche es später erneut.');
    return;
  }
  registrationSubmitted=true;
  lateRegistrationToken='';$('#lateTokenInput').value='';
  renderRegistrationAvailability();
  refreshPendingApplicationCount();
  const name=escapeHtml(application.first_name);
  form.innerHTML=`<div class="success-state"><span class="success-icon">✓</span><p class="eyebrow">ANMELDUNG EINGEGANGEN</p><h2>Danke, ${name}!</h2><p>Deine Anmeldung wurde an den Ortsverein übermittelt. Sobald ein Admin sie geprüft und freigegeben hat, erscheint dein Stand in der Karte.</p><button class="secondary-button" type="button" id="backToMap">Zur Karte <span>↗</span></button></div>`;
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
window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(['karte','anmeldung','favoriten','hinweise','admin'].includes(name)){$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===name));if(name==='karte'&&townMap)setTimeout(()=>townMap.invalidateSize(),80);if(name==='admin')refreshAdmin();if(name==='anmeldung')loadEventSettings()}});
if(['#anmeldung','#favoriten','#hinweise','#admin'].includes(location.hash)){const p=location.hash.slice(1);$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${p}`))}
let townMap=null;
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
      if(stand)Object.assign(stand,{lat:location.lat,lng:location.lng,geocodingSource:'maps-co',geocodingExpiresAt:location.expiresAt});
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
  townMap=L.map('mapCanvas').setView([49.3186,8.3886],15);
  if('ResizeObserver' in window){
    let mapResizeFrame=0;
    const mapResizeObserver=new ResizeObserver(()=>{
      cancelAnimationFrame(mapResizeFrame);
      mapResizeFrame=requestAnimationFrame(()=>{if($('#mapCanvas').clientWidth&&$('#mapCanvas').clientHeight)townMap.invalidateSize({pan:false})});
    });
    mapResizeObserver.observe($('#mapCanvas'));
  }
  const streetLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(townMap);
  const aerialLayer=L.tileLayer.wms('https://geo4.service24.rlp.de/wms/rp_dop20.fcgi',{
    layers:'rp_dop20',format:'image/png',transparent:false,version:'1.1.1',maxZoom:19,
    bounds:[[48.897996,6.037773],[51.000893,8.617703]],
    attribution:`&copy; <a href="https://lvermgeo.rlp.de/geodaten-geoshop/open-data" target="_blank" rel="noopener noreferrer">GeoBasis-DE / LVermGeoRP ${new Date().getFullYear()}</a>, <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener noreferrer">dl-de/by-2-0</a> [Daten bearbeitet]`
  });
  let currentBasemap='street';
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
function refreshStandPins(){
  if(!townMap||!makeMapPin){updateMapStandCount();return}
  standPinMarkers.forEach(marker=>townMap.removeLayer(marker));
  standPinMarkers.length=0;
  const visible=stands.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&
    (s.geocodingSource!=='maps-co'||s.geocodingExpiresAt>Date.now())&&matches(s));
  // Share the normal map attribution; no separate provider label over the image.
  const positionAttribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  if(visible.some(s=>s.geocodingSource==='maps-co')){
    if(!geocodingPositionAttribution){townMap.attributionControl.addAttribution(positionAttribution);geocodingPositionAttribution=true}
  }else if(geocodingPositionAttribution){townMap.attributionControl.removeAttribution(positionAttribution);geocodingPositionAttribution=false}
  visible.forEach(s=>{
    const favorite=favorites.includes(s.id),food=s.food_available==='Ja';
    const features=[favorite?'Favorit':'',food?'Mit Verpflegung':''].filter(Boolean);
    const label=[s.address,...features].join(' · ');
    const marker=L.marker([s.lat,s.lng],{icon:makeMapPin({favorite,food}),title:label}).addTo(townMap);
    marker.getElement()?.setAttribute('aria-label',label);
    marker.bindPopup(`<strong>${escapeHtml(streetAddress(s.address))}</strong>${features.length?`<p class="map-popup-features">${escapeHtml(features.join(' · '))}</p>`:''}${food&&s.food_description?`<p class="map-popup-food">${escapeHtml(s.food_description)}</p>`:''}`);
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
          .select('id,created_at,address,categories,food_available,food_description,description,lat,lng',{count:'exact'})
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
    const cached=saved?.address===row.address&&saved.geocodingSource==='maps-co'&&saved.geocodingExpiresAt>Date.now()&&
      (!Number.isFinite(row.lat)||!Number.isFinite(row.lng));
    return {...row,title:'Flohmarktstand',...(cached?{lat:saved.lat,lng:saved.lng,geocodingSource:saved.geocodingSource,geocodingExpiresAt:saved.geocodingExpiresAt}:{})};
  });
  favorites=favorites.filter(id=>stands.some(s=>s.id===id));
  publishedStandListReady=true;
  for(const [id,issue] of geocodingDiagnostics)if(!stands.some(stand=>stand.id===id&&stand.address===issue.address))geocodingDiagnostics.delete(id);
  renderGeocodingReport();
  saveFavs();
  if(!$('#adminDashboard').hidden)renderAdminPublishedStands(stands);
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
  const refreshIfStale=()=>{if(Date.now()-lastStandRefreshAt>3000)loadPublishedStands()};
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
  notice.textContent=tokenAccess?'Dein Nachzügler-Token ist freigeschaltet. Er wird erst beim erfolgreichen Absenden verbraucht.':registrationOpen===false?'Die reguläre Anmeldung ist geschlossen. Mit einem Nachzügler-Token vom Ortsverein kannst du dich noch einmalig anmelden.':'Die Anmeldung ist gerade nicht verfügbar. Bitte später erneut versuchen.';
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
  const message=$('#lateTokenMessage');message.textContent='Token wird geprüft …';
  try{
    await loadEventSettings();
    if(registrationOpen!==false){message.textContent='Die reguläre Anmeldung ist geöffnet; du benötigst keinen Token.';return}
    const token=$('#lateTokenInput').value.trim().toUpperCase();
    const {data,error}=await supabaseClient.rpc('validate_late_registration_token',{p_token:token});
    if(error){message.textContent='Der Token konnte gerade nicht geprüft werden. Bitte erneut versuchen.';return}
    if(data!==true){message.textContent='Der Token ist ungültig oder wurde bereits verwendet.';return}
    lateRegistrationToken=token;message.textContent='';renderRegistrationAvailability();
    $('#registrationForm').querySelector('input').focus();
  }catch{message.textContent='Der Token konnte gerade nicht geprüft werden. Bitte erneut versuchen.'}
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
      else toast('Der Token konnte nicht erzeugt werden. Bitte Adminzugriff und Verbindung prüfen.');
      return;
    }
    $('#generatedLateToken').value=data;$('#lateTokenOutput').hidden=false;
    toast('Einmaligen Token erzeugt. Bitte jetzt kopieren.');
  }catch{toast('Der Token konnte gerade nicht erzeugt werden.')}
  finally{lateTokenCreating=false;renderRegistrationAvailability()}
});
$('#copyLateToken').addEventListener('click',async()=>{
  const field=$('#generatedLateToken');
  try{await navigator.clipboard.writeText(field.value);toast('Token kopiert.')}
  catch{field.focus();field.select();toast('Bitte den markierten Token kopieren.')}
});
function applyEventSettings(settings){
  if(settings?.event_date)setMarketDate(settings.event_date);
  registrationOpen=typeof settings?.registrations_open==='boolean'?settings.registrations_open:null;
  renderRegistrationAvailability();
}
function adminStatus(target,message){target.textContent=message}
async function loadEventSettings(){
  const sequence=++eventSettingsSequence;
  if(!supabaseClient){applyEventSettings(null);return}
  try{
    const {data,error}=await supabaseClient.from('event_settings').select('event_date,registrations_open').eq('id',true).maybeSingle();
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
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)loadEventSettings()},5000);
registrationToggle.addEventListener('click',async()=>{
  if(registrationSaving||registrationOpen===null||!supabaseClient)return;
  const next=!registrationOpen;
  registrationSaving=true;renderRegistrationAvailability();
  try{
    const {data,error}=await supabaseClient.from('event_settings').update({registrations_open:next}).eq('id',true).select('event_date,registrations_open').maybeSingle();
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
  if(error){adminStatus(eventDateMessage,'Speichern fehlgeschlagen. Bitte prüfen, ob supabase-event-settings.sql ausgeführt wurde.');return}
  setMarketDate(value);
  eventSettingsBroadcast?.postMessage({changed:true});
  adminStatus(eventDateMessage,'Termin gespeichert. Countdown und Startseite wurden aktualisiert.');
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
    const located=atAddress.length>0&&atAddress.every(stand=>Number.isFinite(stand.lat)&&Number.isFinite(stand.lng)&&
      (stand.geocodingSource!=='maps-co'||stand.geocodingExpiresAt>Date.now()));
    adminStatus(adminManualStatus,located
      ?townMap?'Stand in Supabase gespeichert, geocodiert und auf der Karte eingetragen.':'Stand in Supabase gespeichert und geocodiert. Die Kartenansicht ist gerade nicht verfügbar.'
      :'Stand in Supabase gespeichert und veröffentlicht. Eine genaue Hausposition konnte noch nicht ermittelt werden; der Stand bleibt in der Liste. Bitte Adresse prüfen oder später „Aktualisieren“ verwenden. Nicht erneut anlegen.');
  }catch(error){console.warn('Manueller Stand konnte nicht vollständig verarbeitet werden.',error);adminStatus(adminManualStatus,published
    ?'Der Stand ist in Supabase gespeichert und veröffentlicht. Die Kartenposition oder Anzeige konnte noch nicht aktualisiert werden. Bitte aktualisieren und nicht erneut anlegen.'
    :savedRegistration?'Der Eintrag ist in Supabase gespeichert. Bitte offene Anmeldungen und veröffentlichte Stände prüfen, bevor du ihn erneut anlegst.'
      :'Das Speichern konnte nicht bestätigt werden. Bitte Verbindung sowie offene und veröffentlichte Stände prüfen, bevor du es erneut versuchst.')}
  finally{manualStandGeocodingAddress=null;submitButton.disabled=false}
});
async function refreshAdmin(){
  if(!supabaseClient){adminStatus(adminLoginMessage,'Supabase ist noch nicht eingerichtet.');return}
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(adminSessionId!==(session?.user.id||null)){adminSessionId=session?.user.id||null;adminSessionVersion++;pendingCountSequence++;$('#generatedLateToken').value='';$('#lateTokenOutput').hidden=true;}
  adminLoginForm.hidden=Boolean(session);adminDashboard.hidden=!session;
  renderGeocodingReport();
  if(session){loadApplications();loadAdminPublishedStands();loadEventSettings()}
  else{setPendingApplicationCount(null);adminApplications.innerHTML='';$('#generatedLateToken').value='';$('#lateTokenOutput').hidden=true}
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
async function loadApplications(){
  const sessionVersion=adminSessionVersion;
  adminStatus(adminMessage,'Anmeldungen werden geladen …');
  const {data,error,count}=await supabaseClient.from('stand_registrations').select('*',{count:'exact'}).eq('status','pending').order('created_at',{ascending:true});
  if(sessionVersion!==adminSessionVersion||adminDashboard.hidden)return;
  if(error){setPendingApplicationCount(null);adminStatus(adminMessage,'Kein Adminzugriff. Bitte den Benutzer in Supabase als Admin freischalten.');return}
  const pendingCount=count??data.length;
  setPendingApplicationCount(pendingCount);
  adminStatus(adminMessage,`${pendingCount} offene ${pendingCount===1?'Anmeldung':'Anmeldungen'}`);
  adminApplications.innerHTML=data.map(r=>`<article class="admin-application"><div class="admin-toolbar"><div><h3>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</h3><p>${escapeHtml(r.address)}, 67373 Dudenhofen · <a href="mailto:${encodeURIComponent(r.email)}">${escapeHtml(r.email)}</a></p></div><span class="admin-pending">Offen</span></div><div class="tag-row">${(r.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>${r.description?`<p>${escapeHtml(r.description)}</p>`:''}${r.food_available==='Ja'?`<p><strong>Verpflegung:</strong> ${escapeHtml(r.food_description||'Ja')}</p>`:''}<div class="admin-actions"><button class="primary-button" data-approve="${escapeHtml(r.id)}">Freigeben</button><button class="secondary-button" data-reject="${escapeHtml(r.id)}">Ablehnen</button></div></article>`).join('')||'<p class="empty-inline">Keine offenen Anmeldungen.</p>';
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
  adminPublishedStands.innerHTML=sorted.map(stand=>`<article class="admin-application admin-published-stand"><details ${opened.has(stand.id)?'open':''}><summary>${escapeHtml(streetAddress(stand.address))}</summary><form class="admin-stand-edit" data-stand-id="${escapeHtml(stand.id)}"><label>Straße und Hausnummer<input name="address" required maxlength="120" value="${escapeHtml(streetAddress(stand.address,''))}"></label><label>Warengruppen, durch Komma getrennt<input name="categories" required value="${escapeHtml((stand.categories||[]).join(', '))}"></label><label>Verpflegung<select name="foodAvailable"><option value="Nein" ${stand.food_available==='Nein'?'selected':''}>Nein</option><option value="Ja" ${stand.food_available==='Ja'?'selected':''}>Ja</option></select></label><label>Angaben zur Verpflegung<textarea name="foodDescription" maxlength="500">${escapeHtml(stand.food_description||'')}</textarea></label><label>Beschreibung<textarea name="description" maxlength="1000">${escapeHtml(stand.description||'')}</textarea></label><div class="admin-actions"><button class="primary-button" type="submit">Änderungen speichern</button><button class="secondary-button danger-button" type="button" data-delete-stand="${escapeHtml(stand.id)}">Stand löschen</button></div></form></details></article>`).join('')||'<p class="empty-inline">Noch keine veröffentlichten Stände.</p>';
  adminPublishedStands.querySelectorAll('.admin-stand-edit').forEach(form=>form.addEventListener('submit',savePublishedStand));
  adminPublishedStands.querySelectorAll('[data-delete-stand]').forEach(button=>button.addEventListener('click',()=>deletePublishedStand(button.dataset.deleteStand)));
}
async function savePublishedStand(event){
  event.preventDefault();
  const form=event.currentTarget,data=new FormData(form),id=form.dataset.standId;
  const categories=data.get('categories').split(',').map(value=>value.trim()).filter(Boolean);
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
  const {error}=await supabaseClient.rpc(action==='approve'?'approve_stand_registration':'reject_stand_registration',{registration_id:id});
  if(error){adminStatus(adminMessage,'Aktion fehlgeschlagen. Bitte Datenbankeinrichtung und Adminrechte prüfen.');return}
  adminStatus(adminMessage,action==='approve'?'Stand freigegeben und veröffentlicht.':'Anmeldung abgelehnt.');
  await Promise.all([loadApplications(),loadPublishedStands()]);
}

function setPendingApplicationCount(count){
  const badge=$('#drawerAdminCount');
  badge.hidden=count===null;
  badge.textContent=count??'';
  if(count!==null)badge.setAttribute('aria-label',`${count} offene ${count===1?'Anmeldung':'Anmeldungen'}`);
  else badge.removeAttribute('aria-label');
}
let pendingCountSequence=0;
async function refreshPendingApplicationCount(){
  const sequence=++pendingCountSequence;
  if(!supabaseClient){setPendingApplicationCount(null);return}
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(sequence!==pendingCountSequence)return;
    if(!session){setPendingApplicationCount(null);return}
    const {count,error}=await supabaseClient.from('stand_registrations').select('id',{count:'exact',head:true}).eq('status','pending');
    if(sequence!==pendingCountSequence)return;
    setPendingApplicationCount(error?null:count);
  }catch{if(sequence===pendingCountSequence)setPendingApplicationCount(null)}
}
setInterval(()=>{if(document.visibilityState==='visible')refreshPendingApplicationCount()},60000);
$('#refreshStands').addEventListener('click',async event=>{
  const button=event.currentTarget;
  if(button.disabled)return;
  button.disabled=true;button.classList.add('is-refreshing');button.setAttribute('aria-busy','true');
  try{
    const loaded=await loadPublishedStands({retryGeocoding:true});
    if(loaded===false){toast(navigator.onLine===false?'Du bist offline. Vorhandene Standdaten bleiben sichtbar; bei Netzrückkehr wird automatisch aktualisiert.':'Standdaten sind gerade nicht erreichbar. Vorhandene Daten bleiben sichtbar; die App versucht es automatisch erneut.');return}
    const tasks=[refreshPendingApplicationCount(),loadEventSettings()];
    if(!adminDashboard.hidden)tasks.push(loadApplications());
    const additional=await Promise.allSettled(tasks);
    toast(loaded===null?'Standdaten werden bereits aktualisiert.':additional.some(result=>result.status==='rejected')?'Standdaten aktualisiert. Zusätzliche Informationen konnten noch nicht vollständig geladen werden.':'Standdaten aktualisiert.');
  }catch{toast('Standdaten konnten nicht geladen werden. Bitte erneut versuchen.')}
  finally{button.disabled=false;button.classList.remove('is-refreshing');button.setAttribute('aria-busy','false')}
});

if(location.hash==='#admin')refreshAdmin();
