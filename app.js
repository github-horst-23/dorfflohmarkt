// Real stand listings are added here by the organizer after registration; no demo addresses are shown.
let stands=[];
const supabaseConfig=window.DORFFLOHMARKT_SUPABASE||{};
const supabaseClient=window.supabase?.createClient&&supabaseConfig.url&&supabaseConfig.anonKey?window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey):null;
const getFavs=()=>{try{return JSON.parse(localStorage.getItem('dorfflohmarkt-favs')||'[]')}catch{return []}};
let favorites=getFavs(),activeFilter='Alle',search='';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const countdownTimer=$('#countdownTimer');
const marketDay=new Date(2027,8,1,0,0,0);
const marketDayEnd=new Date(2027,8,2,0,0,0);
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
function card(s){const liked=favorites.includes(s.id);return `<article class="stand-card"><div class="stand-card-top"><span class="stand-number">STAND ${escapeHtml(String(s.id).slice(-4).toUpperCase())}</span><button class="favorite-toggle ${liked?'active':''}" data-fav="${escapeHtml(s.id)}" aria-label="${liked?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'}">${liked?'♥':'♡'}</button></div><h3>${escapeHtml(s.title||'Flohmarktstand')}</h3><p class="address">⌖ &nbsp;${escapeHtml(s.address)}</p><div class="tag-row">${(s.categories||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div><p class="card-desc">${escapeHtml(s.description||'')}</p>${s.food_available==='Ja'&&s.food_description?`<p class="card-desc"><strong>Verpflegung:</strong> ${escapeHtml(s.food_description)}</p>`:''}</article>`}
function renderStands(){const visible=stands.filter(matches);$('#standGrid').innerHTML=visible.map(card).join('');$('#noStands').hidden=visible.length>0;$('#resultCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;$('#standCount').textContent=`${visible.length} ${visible.length===1?'Stand':'Stände'}`;const favs=stands.filter(s=>favorites.includes(s.id));$('#favoritesGrid').innerHTML=favs.map(card).join('');$('#emptyFavorites').classList.toggle('visible',favs.length===0);$('#favoritesGrid').style.display=favs.length?'grid':'none';$$('[data-fav]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];saveFavs();toast(favorites.includes(id)?'Stand zu deinen Favoriten hinzugefügt.':'Stand aus deinen Favoriten entfernt.')}));renderCounts();refreshStandPins()}
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
  if(!categories.length){toast('Bitte wähle mindestens ein Verkaufsangebot aus.');return}
  const application={first_name:data.get('firstName'),last_name:data.get('lastName'),email:data.get('email'),address:data.get('address').trim(),categories,food_available:data.get('foodAvailable')||'Nein',food_description:data.get('foodDescription')||'',description:data.get('description')||'',status:'pending'};
  const {error}=await supabaseClient.from('stand_registrations').insert(application);
  if(error){toast('Die Anmeldung konnte nicht gesendet werden. Bitte versuche es später erneut.');return}
  const name=escapeHtml(application.first_name);
  e.currentTarget.innerHTML=`<div class="success-state"><span class="success-icon">✓</span><p class="eyebrow">ANMELDUNG EINGEGANGEN</p><h2>Danke, ${name}!</h2><p>Deine Anmeldung wurde an den Ortsverein übermittelt. Sobald ein Admin sie geprüft und freigegeben hat, erscheint dein Stand in der Karte.</p><button class="secondary-button" type="button" id="backToMap">Zur Karte <span>↗</span></button></div>`;
  e.currentTarget.querySelector('#backToMap').addEventListener('click',()=>showPage('karte'));
});

$$('[name="foodAvailable"]').forEach(radio=>radio.addEventListener('change',()=>{
  const showDescription=radio.checked&&radio.value==='Ja';
  $('#foodDetails').hidden=!showDescription;
  $('#foodDescription').required=showDescription;
}));
window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(['karte','anmeldung','favoriten','hinweise','admin'].includes(name)){$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.dataset.page===name));if(name==='karte'&&townMap)setTimeout(()=>townMap.invalidateSize(),80);if(name==='admin')refreshAdmin()}});
if(['#anmeldung','#favoriten','#hinweise','#admin'].includes(location.hash)){const p=location.hash.slice(1);$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${p}`))}
let townMap=null;
let standPinIcon=null;
const standPinMarkers=[];
if(window.L){
  townMap=L.map('mapCanvas').setView([49.3186,8.3886],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(townMap);
  standPinIcon=L.icon({iconUrl:'./marker.png',iconSize:[42,42],iconAnchor:[21,39],popupAnchor:[0,-36],alt:'Flohmarkt-Pin'});
  const townIcon=L.icon({iconUrl:'./marker.png',iconSize:[42,42],iconAnchor:[21,39],popupAnchor:[0,-36],alt:'Marker für 67373 Dudenhofen'});
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
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Offline-Speicherung konnte nicht aktiviert werden.', error)));
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
async function loadPublishedStands(){
  if(!supabaseClient)return;
  const {data,error}=await supabaseClient.from('published_stands').select('*').order('created_at',{ascending:true});
  if(error){console.warn('Freigegebene Stände konnten nicht geladen werden.');return}
  stands=(data||[]).map(row=>({...row,title:'Flohmarktstand'}));
  favorites=favorites.filter(id=>stands.some(s=>s.id===id));
  saveFavs();
}
if(supabaseClient){
  loadPublishedStands();
  supabaseClient.channel('published-stands-live').on('postgres_changes',{event:'*',schema:'public',table:'published_stands'},loadPublishedStands).subscribe();
}
const adminLoginForm=$('#adminLoginForm');
const adminDashboard=$('#adminDashboard');
const adminLoginMessage=$('#adminLoginMessage');
const adminMessage=$('#adminMessage');
const adminApplications=$('#adminApplications');
function adminStatus(target,message){target.textContent=message}
async function refreshAdmin(){
  if(!supabaseClient){adminStatus(adminLoginMessage,'Supabase ist noch nicht eingerichtet.');return}
  const {data:{session}}=await supabaseClient.auth.getSession();
  adminLoginForm.hidden=Boolean(session);adminDashboard.hidden=!session;
  if(session)loadApplications();
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
async function moderateRegistration(id,action){
  const {error}=await supabaseClient.rpc(action==='approve'?'approve_stand_registration':'reject_stand_registration',{registration_id:id});
  if(error){adminStatus(adminMessage,'Aktion fehlgeschlagen. Bitte Datenbankeinrichtung und Adminrechte prüfen.');return}
  adminStatus(adminMessage,action==='approve'?'Stand freigegeben und veröffentlicht.':'Anmeldung abgelehnt.');
  loadApplications();
}

if(location.hash==='#admin')refreshAdmin();
