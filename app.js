// Real stand listings are added here by the organizer after registration; no demo addresses are shown.
let stands=[];
const supabaseConfig=window.DORFFLOHMARKT_SUPABASE||{};
const supabaseClient=window.supabase?.createClient&&supabaseConfig.url&&supabaseConfig.anonKey?window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey):null;
const getFavs=()=>{try{return JSON.parse(localStorage.getItem('dorfflohmarkt-favs')||'[]')}catch{return []}};
let favorites=getFavs(),activeFilter='Alle',search='';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const adminManualForm=$('#registrationForm').cloneNode(true);
adminManualForm.id='adminManualForm';
adminManualForm.classList.add('admin-manual-form');
adminManualForm.querySelectorAll('[required]').forEach(field=>field.required=false);
adminManualForm.querySelectorAll('.required-note').forEach(note=>note.remove());
adminManualForm.querySelector('.input-hint').textContent='Wähle passende Warengruppen aus.';
adminManualForm.querySelectorAll('.optional').forEach(note=>note.remove());
adminManualForm.querySelector('.consent span').textContent='Einwilligung der teilnehmenden Person liegt vor.';
adminManualForm.querySelector('.privacy-note').remove();
adminManualForm.querySelector('.submit-button').innerHTML='Stand direkt veröffentlichen <span>→</span>';
adminManualForm.querySelectorAll('.category-group').forEach(group=>group.open=false);
adminManualForm.querySelectorAll('[id]').forEach(element=>{if(element!==adminManualForm)element.id=`admin-${element.id}`});
$('#adminManualFormHost').append(adminManualForm);
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
function saveFavs(){localStorage.setItem('dorfflohmarkt-favs',JSON.stringify(favorites));renderCounts();renderStands();}
function renderCounts(){$('#favCount').textContent=favorites.length;$('#drawerFavCount').textContent=favorites.length;$('#favoritesSummary').textContent=`${favorites.length} ${favorites.length===1?'Stand':'Stände'}`}
function matches(s){const cats=s.categories||[];const filterMatch=activeFilter==='Alle'||cats.some(c=>activeFilter==='Kinder'?/Kinder|Teens/i.test(c):activeFilter==='Kleidung'?/Kleidung/i.test(c):activeFilter==='Haushalt'?/Haushalt|Möbel|Garten/i.test(c):c===activeFilter);return (!search||`${s.title||''} ${s.address||''} ${cats.join(' ')}`.toLowerCase().includes(search))&&filterMatch}
function escapeHtml(value=''){return String(value).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function card(s){const liked=favorites.includes(s.id);return `<article class="stand-card"><div class="stand-card-top"><span class="stand-number">STAND ${escapeHtml(String(s.id).slice(-4).toUpperCase())}</span><button class="favorite-toggle ${liked?'active':''}" data-fav="${escapeHtml(s.id)}" aria-label="${liked?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}">${liked?'★':'☆'}</button></div><h3>${escapeHtml(s.title||'Flohmarktstand')}</h3><p class="address">⌖ &nbsp;${escapeHtml(s.address)}</p><div class="tag-row">${(s.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div><p class="card-desc">${escapeHtml(s.description||'')}</p>${s.food_available==='Ja'&&s.food_description?`<p class="card-desc"><strong>Verpflegung:</strong> ${escapeHtml(s.food_description)}</p>`:''}</article>`}
function renderStands(){const visible=stands.filter(matches);$('#standGrid').innerHTML=visible.map(card).join('');$('#noStands').hidden=visible.length>0;$('#resultCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;$('#standCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;const favs=favorites.map(id=>stands.find(s=>s.id===id)).filter(Boolean);$('#favoritesGrid').innerHTML=favs.map(card).join('');$('#emptyFavorites').classList.toggle('visible',favs.length===0);$('#favoritesGrid').style.display=favs.length?'grid':'none';renderFavoriteRoute(favs);$$('[data-fav]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];saveFavs();toast(favorites.includes(id)?'Stand zu deinen Favoriten hinzugefügt.':'Stand aus deinen Favoriten entfernt.')}));renderCounts();refreshStandPins()}
function renderFavoriteRoute(favs){const link=$('#planFavoritesRoute'),message=$('#routePlannerMessage');const destinations=favs.map(stand=>String(stand.address||'').trim()).filter(Boolean).map(address=>`${address}, 67373 Dudenhofen`);if(!destinations.length){link.removeAttribute('href');link.setAttribute('aria-disabled','true');message.textContent=favs.length?'Für deine Favoriten ist keine Adresse verfügbar.':'Speichere Stände mit Adresse, um eine Route zu planen.';return}const destination=destinations.at(-1),waypoints=destinations.slice(0,-1),url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',destination);url.searchParams.set('travelmode','walking');if(waypoints.length)url.searchParams.set('waypoints',waypoints.join('|'));link.href=url.toString();link.setAttribute('aria-disabled','false');message.textContent=`${destinations.length} ${destinations.length===1?'Stand':'Stände'} in deiner gespeicherten Reihenfolge. Google Maps plant die Route zu Fuß.`}
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2600)}
function showPage(name){const page=['karte','anmeldung','favoriten','hinweise','admin'].includes(name)?name:'karte';$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===page));closeDrawer();window.scrollTo({top:0,behavior:'smooth'});if(page==='karte'&&townMap)setTimeout(()=>townMap.invalidateSize(),80);if(page==='admin')refreshAdmin();location.hash=page}
const drawer=$('#drawer'),scrim=$('#scrim');function openDrawer(){drawer.classList.add('open');scrim.classList.add('show');drawer.setAttribute('aria-hidden','false');$('#menuButton').setAttribute('aria-expanded','true')}function closeDrawer(){drawer.classList.remove('open');scrim.classList.remove('show');drawer.setAttribute('aria-hidden','true');$('#menuButton').setAttribute('aria-expanded','false')}
$('#menuButton').addEventListener('click',openDrawer);$('#closeMenu').addEventListener('click',closeDrawer);scrim.addEventListener('click',closeDrawer);$$('[data-page]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showPage(el.dataset.page)}));$$('.brand[href="#karte"],.hero .primary-button').forEach(el=>el.addEventListener('click',e=>{if(el.classList.contains('brand')){e.preventDefault();showPage('karte')}else{e.preventDefault();document.querySelector('#karte-map').scrollIntoView({behavior:'smooth'})}}));
$('#filterButton').addEventListener('click',()=>$('#filters').classList.toggle('show'));$$('.filter-chip').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter;$$('.filter-chip').forEach(x=>x.classList.toggle('selected',x===b));applyMapFilter()}));
function applyMapFilter(){renderStands()}
$('#searchInput').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();$('#clearSearch').classList.toggle('visible',Boolean(search));applyMapFilter()});$('#clearSearch').addEventListener('click',()=>{$('#searchInput').value='';search='';$('#clearSearch').classList.remove('visible');applyMapFilter()});
$('#registrationForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!e.currentTarget.reportValidity())return;
  if(!supabaseClient){toast('Die Anmeldung ist noch nicht verfügbar: Supabase ist nicht eingerichtet.');return}
  const data=new FormData(e.currentTarget);
  const categories=data.getAll('category');
  const otherOffer=data.get('otherOffer')?.trim();
  if(otherOffer)categories.push(`Sonstiges: ${otherOffer}`);
  if(!categories.length){const firstGroup=$('.category-group');if(firstGroup){firstGroup.open=true;firstGroup.querySelector('summary').focus();firstGroup.scrollIntoView({behavior:'smooth',block:'center'})}toast('Bitte wähle mindestens ein Verkaufsangebot aus.');return}
  const application={first_name:data.get('firstName'),last_name:data.get('lastName'),email:data.get('email'),address:data.get('address').trim(),categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||'',status:'pending'};
  const {error}=await supabaseClient.from('stand_registrations').insert(application);
  if(error){toast('Die Anmeldung konnte nicht gesendet werden. Bitte versuche es später erneut.');return}
  const name=escapeHtml(application.first_name);
  e.currentTarget.innerHTML=`<div class="success-state"><span class="success-icon">✓</span><p class="eyebrow">ANMELDUNG EINGEGANGEN</p><h2>Danke, ${name}!</h2><p>Deine Anmeldung wurde an den Ortsverein übermittelt. Sobald ein Admin sie geprüft und freigegeben hat, erscheint dein Stand in der Karte.</p><button class="secondary-button" type="button" id="backToMap">Zur Karte <span>↗</span></button></div>`;
  e.currentTarget.querySelector('#backToMap').addEventListener('click',()=>showPage('karte'));
});

$$('[name="foodAvailable"]').forEach(radio=>radio.addEventListener('change',()=>{
  const showDescription=radio.checked&&radio.value==='Ja';
  const form=radio.closest('form');
  form.querySelector('.food-details').hidden=!showDescription;
  form.querySelector('[name="foodDescription"]').required=showDescription;
}));
window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(['karte','anmeldung','favoriten','hinweise','admin'].includes(name)){$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===name));if(name==='karte'&&townMap)setTimeout(()=>townMap.invalidateSize(),80);if(name==='admin')refreshAdmin()}});
if(['#anmeldung','#favoriten','#hinweise','#admin'].includes(location.hash)){const p=location.hash.slice(1);$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${p}`))}
let townMap=null;
let standPinIcon=null;
const standPinMarkers=[];
if(window.L){
  townMap=L.map('mapCanvas').setView([49.3186,8.3886],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(townMap);
  const makeMapPin=(alt)=>L.divIcon({className:'market-map-marker',html:`<div class="market-map-pin"><img src="./marker.png" alt="${alt}"></div>`,iconSize:[44,54],iconAnchor:[22,54],popupAnchor:[0,-50]});
  standPinIcon=makeMapPin('Flohmarkt-Pin');
  const townIcon=makeMapPin('Marker für 67373 Dudenhofen');
  L.marker([49.3186,8.3886],{icon:townIcon}).addTo(townMap).bindPopup('<strong>67373 Dudenhofen</strong><br>Dorfflohmarkt im Ortsgebiet');
}else{
  $('#mapCanvas').innerHTML='<div class="map-unavailable"><strong>Karte gerade nicht verfügbar</strong><span>Die Ortskarte braucht eine Internetverbindung.</span><a href="https://www.openstreetmap.org/?mlat=49.3186&mlon=8.3886#map=15/49.3186/8.3886" target="_blank" rel="noreferrer">Dudenhofen auf OpenStreetMap öffnen ↗</a></div>';
}
function refreshStandPins(){
  if(!townMap||!standPinIcon)return;
  standPinMarkers.forEach(marker=>townMap.removeLayer(marker));
  standPinMarkers.length=0;
  stands.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&matches(s)).forEach(s=>{
    const marker=L.marker([s.lat,s.lng],{icon:standPinIcon}).addTo(townMap);
    marker.bindPopup(`<strong>${escapeHtml(s.title||'Flohmarktstand')}</strong><br>${escapeHtml(s.address)}`);
    standPinMarkers.push(marker);
  });
}
renderCounts();renderStands();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  let hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const firstController = !hadServiceWorkerController;
    hadServiceWorkerController = true;
    if (!firstController && !reloadingForUpdate) {
      reloadingForUpdate = true;
      location.reload();
    }
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch (error) {
      console.warn('App-Updateprüfung fehlgeschlagen.', error);
    }
  });
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
let standRefreshSequence=0;
let lastStandRefreshAt=0;
async function loadPublishedStands(){
  if(!supabaseClient)return;
  const sequence=++standRefreshSequence;
  lastStandRefreshAt=Date.now();
  const {data,error}=await supabaseClient.from('published_stands').select('id,created_at,address,categories,food_available,food_description,description,lat,lng').order('created_at',{ascending:true});
  if(sequence!==standRefreshSequence)return;
  if(error){console.warn('Freigegebene Stände konnten nicht geladen werden.');return}
  stands=(data||[]).map(row=>({...row,title:'Flohmarktstand'}));
  favorites=favorites.filter(id=>stands.some(s=>s.id===id));
  saveFavs();
}
if(supabaseClient){
  loadPublishedStands();
  supabaseClient.channel('published-stands-live').on('postgres_changes',{event:'*',schema:'public',table:'published_stands'},loadPublishedStands).subscribe();
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
const eventDateForm=$('#eventDateForm');
const eventDateMessage=$('#eventDateMessage');
function adminStatus(target,message){target.textContent=message}
async function loadEventDate(){
  if(!supabaseClient)return;
  const {data,error}=await supabaseClient.from('event_settings').select('event_date').eq('id',true).maybeSingle();
  if(error||!data?.event_date){adminStatus(eventDateMessage,'Die Termineinstellung ist noch nicht eingerichtet. Bitte supabase-event-settings.sql in Supabase ausführen.');return}
  setMarketDate(data.event_date);
}
loadEventDate();
supabaseClient?.channel('event-date-live').on('postgres_changes',{event:'UPDATE',schema:'public',table:'event_settings'},payload=>setMarketDate(payload.new.event_date)).subscribe();
eventDateForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const value=new FormData(eventDateForm).get('eventDate');
  if(!value||!supabaseClient){adminStatus(eventDateMessage,'Der Termin konnte nicht gespeichert werden.');return}
  adminStatus(eventDateMessage,'Termin wird gespeichert …');
  const {error}=await supabaseClient.from('event_settings').update({event_date:value}).eq('id',true);
  if(error){adminStatus(eventDateMessage,'Speichern fehlgeschlagen. Bitte prüfen, ob supabase-event-settings.sql ausgeführt wurde.');return}
  setMarketDate(value);
  adminStatus(eventDateMessage,'Termin gespeichert. Countdown und Startseite wurden aktualisiert.');
});
adminManualForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!supabaseClient){adminStatus(adminMessage,'Das Speichern ist nicht verfügbar.');return}
  const submitButton=adminManualForm.querySelector('.submit-button');
  submitButton.disabled=true;
  adminStatus(adminMessage,'Stand wird veröffentlicht …');
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session){adminStatus(adminMessage,'Bitte zuerst als Admin anmelden.');return}
    const {data:admin,error:adminError}=await supabaseClient.from('admin_users').select('user_id').eq('user_id',session.user.id).maybeSingle();
    if(adminError||!admin){adminStatus(adminMessage,'Für diesen Zugang ist keine Adminfreigabe eingerichtet.');return}
    const data=new FormData(adminManualForm);
    const categories=data.getAll('category');
    const otherOffer=data.get('otherOffer')?.trim();
    if(otherOffer)categories.push(`Sonstiges: ${otherOffer}`);
    if(!categories.length)categories.push('Sonstiges');
    const application={first_name:data.get('firstName').trim()||'Manuell',last_name:data.get('lastName').trim()||'erfasster Stand',email:data.get('email').trim()||'flohmarkt@dudenhofen.org',address:data.get('address').trim()||'67373 Dudenhofen',categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||'',status:'pending'};
    const {data:registration,error:insertError}=await supabaseClient.from('stand_registrations').insert(application).select('id').single();
    if(insertError){adminStatus(adminMessage,'Der Stand konnte nicht gespeichert werden. Bitte Eingaben und Datenbankzugriff prüfen.');return}
    const {error:publishError}=await supabaseClient.rpc('approve_stand_registration',{registration_id:registration.id});
    if(publishError){adminStatus(adminMessage,'Der Eintrag wurde gespeichert, aber nicht veröffentlicht. Er steht bei den offenen Anmeldungen zur Prüfung.');await loadApplications();return}
    adminManualForm.reset();
    adminManualForm.querySelector('.food-details').hidden=true;
    adminManualForm.querySelector('[name="foodDescription"]').required=false;
    adminManualForm.querySelectorAll('.category-group').forEach(group=>group.open=false);
    adminStatus(adminMessage,'Stand direkt veröffentlicht.');
    await Promise.all([loadPublishedStands(),loadApplications()]);
  }catch(error){console.warn('Manueller Stand konnte nicht veröffentlicht werden.',error);adminStatus(adminMessage,'Der Stand konnte nicht veröffentlicht werden. Bitte erneut versuchen.')}
  finally{submitButton.disabled=false}
});
async function refreshAdmin(){
  if(!supabaseClient){adminStatus(adminLoginMessage,'Supabase ist noch nicht eingerichtet.');return}
  const {data:{session}}=await supabaseClient.auth.getSession();
  adminLoginForm.hidden=Boolean(session);adminDashboard.hidden=!session;
  if(session){loadApplications();loadAdminPublishedStands();loadEventDate()}
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
  adminStatus(adminMessage,'Anmeldungen werden geladen …');
  const {data,error}=await supabaseClient.from('stand_registrations').select('*').eq('status','pending').order('created_at',{ascending:true});
  if(error){adminStatus(adminMessage,'Kein Adminzugriff. Bitte den Benutzer in Supabase als Admin freischalten.');return}
  adminStatus(adminMessage,`${data.length} offene ${data.length===1?'Anmeldung':'Anmeldungen'}`);
  adminApplications.innerHTML=data.map(r=>`<article class="admin-application"><div class="admin-toolbar"><div><h3>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</h3><p>${escapeHtml(r.address)}, 67373 Dudenhofen · <a href="mailto:${encodeURIComponent(r.email)}">${escapeHtml(r.email)}</a></p></div><span class="admin-pending">Offen</span></div><div class="tag-row">${(r.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>${r.description?`<p>${escapeHtml(r.description)}</p>`:''}${r.food_available==='Ja'?`<p><strong>Verpflegung:</strong> ${escapeHtml(r.food_description||'Ja')}</p>`:''}<div class="admin-actions"><button class="primary-button" data-approve="${escapeHtml(r.id)}">Freigeben</button><button class="secondary-button" data-reject="${escapeHtml(r.id)}">Ablehnen</button></div></article>`).join('')||'<p class="empty-inline">Keine offenen Anmeldungen.</p>';
  $$('[data-approve]').forEach(button=>button.addEventListener('click',()=>moderateRegistration(button.dataset.approve,'approve')));
  $$('[data-reject]').forEach(button=>button.addEventListener('click',()=>moderateRegistration(button.dataset.reject,'reject')));
}
async function loadAdminPublishedStands(){
  const {data,error}=await supabaseClient.from('published_stands').select('id,created_at,address,categories,food_available,food_description,description,lat,lng').order('created_at',{ascending:true});
  if(error){adminStatus(adminManageMessage,'Veröffentlichte Stände konnten nicht geladen werden. Adminzugriff prüfen.');return}
  adminPublishedStands.innerHTML=(data||[]).map(stand=>`<article class="admin-application admin-published-stand"><details><summary>${escapeHtml(stand.address)}</summary><form class="admin-stand-edit" data-stand-id="${escapeHtml(stand.id)}"><label>Adresse<input name="address" required maxlength="120" value="${escapeHtml(stand.address)}"></label><label>Warengruppen, durch Komma getrennt<input name="categories" required value="${escapeHtml((stand.categories||[]).join(', '))}"></label><label>Verpflegung<select name="foodAvailable"><option value="Nein" ${stand.food_available==='Nein'?'selected':''}>Nein</option><option value="Ja" ${stand.food_available==='Ja'?'selected':''}>Ja</option></select></label><label>Angaben zur Verpflegung<textarea name="foodDescription" maxlength="500">${escapeHtml(stand.food_description||'')}</textarea></label><label>Beschreibung<textarea name="description" maxlength="1000">${escapeHtml(stand.description||'')}</textarea></label><div class="admin-actions"><button class="primary-button" type="submit">Änderungen speichern</button><button class="secondary-button danger-button" type="button" data-delete-stand="${escapeHtml(stand.id)}">Stand löschen</button></div></form></details></article>`).join('')||'<p class="empty-inline">Noch keine veröffentlichten Stände.</p>';
  adminPublishedStands.querySelectorAll('.admin-stand-edit').forEach(form=>form.addEventListener('submit',savePublishedStand));
  adminPublishedStands.querySelectorAll('[data-delete-stand]').forEach(button=>button.addEventListener('click',()=>deletePublishedStand(button.dataset.deleteStand)));
}
async function savePublishedStand(event){
  event.preventDefault();
  const form=event.currentTarget,data=new FormData(form),id=form.dataset.standId;
  const categories=data.get('categories').split(',').map(value=>value.trim()).filter(Boolean);
  if(!categories.length){adminStatus(adminManageMessage,'Bitte mindestens eine Warengruppe eintragen.');return}
  const {error}=await supabaseClient.from('published_stands').update({address:data.get('address').trim(),categories,food_available:data.get('foodAvailable'),food_description:data.get('foodDescription').trim(),description:data.get('description').trim()}).eq('id',id);
  if(error){adminStatus(adminManageMessage,'Änderungen konnten nicht gespeichert werden.');return}
  adminStatus(adminManageMessage,'Änderungen gespeichert.');
  await Promise.all([loadAdminPublishedStands(),loadPublishedStands()]);
}
async function deletePublishedStand(id){
  if(!window.confirm('Diesen Stand aus der öffentlichen Karte löschen?'))return;
  const {error}=await supabaseClient.from('published_stands').delete().eq('id',id);
  if(error){adminStatus(adminManageMessage,'Der Stand konnte nicht gelöscht werden.');return}
  adminStatus(adminManageMessage,'Stand aus der Karte gelöscht.');
  await Promise.all([loadAdminPublishedStands(),loadPublishedStands()]);
}
async function moderateRegistration(id,action){
  const {error}=await supabaseClient.rpc(action==='approve'?'approve_stand_registration':'reject_stand_registration',{registration_id:id});
  if(error){adminStatus(adminMessage,'Aktion fehlgeschlagen. Bitte Datenbankeinrichtung und Adminrechte prüfen.');return}
  adminStatus(adminMessage,action==='approve'?'Stand freigegeben und veröffentlicht.':'Anmeldung abgelehnt.');
  loadApplications();
}

if(location.hash==='#admin')refreshAdmin();
