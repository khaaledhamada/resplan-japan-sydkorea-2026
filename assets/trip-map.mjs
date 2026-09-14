import { CATEGORIES, validateData, numberPlaces, filterPlaces, daysForCity, dayText, initialSelection, navigationUrl, safeLink } from './trip-model.mjs?v=20260914.1';

const config = JSON.parse(document.getElementById('trip-config').textContent);
const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  map: '<path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Z"/><path d="M9 2v17M15 5v17"/>',
  calendar: '<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',
  document: '<path d="M5 2h9l5 5v15H5V2Z"/><path d="M14 2v6h5M8 12h8M8 15h8M8 18h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  arrow: '<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="M8 15v-4h8m-3-3 3 3-3 3"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
const catStyle = p => `--cat:${CATEGORIES[p.category].color}`;
const isOptionalActivity = p => p.category === 'activity' && p.status === 'Valfritt';
const badge = p => `<span class="number${isOptionalActivity(p) ? ' optional' : ''}" style="${catStyle(p)}">${esc(p.label)}</span>`;
const external = (url, label, cls = '') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 700px)').matches;
let data, state, map, markers = [], places = [], matching = [], toastTimer, detailOrigin, loadedDetails = false, mapStarting = false;

async function readDataset(descriptor) {
  const response = await fetch(descriptor.url, { cache: 'no-cache', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Platslistan kunde inte hämtas (' + response.status + ')');
  const encrypted = await response.json();
  const key = await crypto.subtle.importKey('raw', bytes(descriptor.key), 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(encrypted.iv) }, key, bytes(encrypted.data));
  return validateData(JSON.parse(new TextDecoder().decode(plaintext)));
}

function layout() {
  $('app').outerHTML = `<div class="app" id="app" data-view="map">
    <nav class="rail" aria-label="Resans vyer">
      <div class="brand" title="Resekartan">${icon('pin')}</div>
      <button class="nav-button" data-view="map" aria-current="page">${icon('map')}<span>Karta</span></button>
      <button class="nav-button" data-view="plan">${icon('calendar')}<span>Dagsplan</span></button>
      <button class="nav-button" data-view="details">${icon('document')}<span>Resedetaljer</span></button>
      <button class="nav-button lock-button" data-lock>${icon('lock')}<span>Lås sidan</span></button>
    </nav>
    <aside class="sidebar" aria-label="Välj och hitta resans platser">
      <div class="controls">
        <label class="search-field">${icon('search')}<input id="search" type="search" placeholder="Sök bland resans platser" aria-label="Sök platser i vald stad" autocomplete="off"><button class="search-clear" id="clear-search" aria-label="Rensa sökning" hidden>×</button></label>
        <header class="identity"><div><h1>Resekartan</h1><p>${esc(config.subtitle)}</p></div><button class="mobile-lock" data-lock aria-label="Lås sidan">${icon('lock')}</button></header>
        <div class="selects"><label class="select-box"><span>Stad</span><select id="city" aria-label="Stad"></select></label><label class="select-box"><span>Dag</span><select id="day" aria-label="Dag"></select></label></div>
        <div class="chips" role="group" aria-label="Visa kategorier">${Object.entries(CATEGORIES).map(([key, c]) => `<button class="chip" style="--cat:${c.color}" data-category="${key}" aria-pressed="true"><span class="tick" aria-hidden="true">✓</span>${c.name}</button>`).join('')}</div>
        <label class="optional-toggle"><input id="optional" type="checkbox" checked>Visa även valfria aktiviteter (V)</label>
      </div>
      <section class="places-panel" aria-label="Platslista">
        <div class="list-heading"><h2 id="list-title"></h2><p>Börja vid dagens lägsta aktivitetsnummer.</p><span class="list-count" id="list-count" role="status"></span><button class="sheet-toggle" id="sheet-toggle" aria-expanded="false" aria-controls="place-list">Visa lista ↑</button></div>
        <div class="place-list" id="place-list"></div>
      </section>
    </aside>
    <main class="workspace" id="workspace">
      <section class="map-view" id="map-view" aria-label="Interaktiv resekarta">
        <div class="map-canvas" id="map" aria-label="Karta över resans platser"></div>
        <div class="map-tools"><button class="floating-button" id="fit-map">${icon('list')}Visa alla stopp</button></div>
        <div class="map-help">01 = aktiviteter · M = mat · S = sött<br>V = valfritt. Nålarna är inte en gångrutt.</div>
        <div class="map-status" id="map-status" role="status" hidden></div>
        <section class="place-detail" id="place-detail" aria-label="Platsdetaljer" hidden></section>
      </section>
      <section class="plan-view" id="plan-view" aria-label="Dagsplan" hidden></section>
      <section class="details-view" id="details-view" aria-label="Bokningar och praktiska resedetaljer" hidden><header class="details-header"><strong>Era resedetaljer</strong>Bokningar, checklistor och praktiskt från reseplanen. Aktuell besöksordning, mat och fika finns under Karta och Dagsplan.</header><iframe id="details-frame" class="details-frame" title="Resans bokningar och checklistor"></iframe></section>
    </main>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;
  $('city').innerHTML = data.cities.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('city').value = state.city;
  updateDays();
  new ResizeObserver(() => $('app').style.setProperty('--controls-height', document.querySelector('.controls').offsetHeight + 'px')).observe(document.querySelector('.controls'));
  $('city').addEventListener('change', () => {
    state.city = $('city').value; state.day = daysForCity(data, state.city)[0] || ''; state.query = ''; $('search').value = ''; updateDays(); refresh();
  });
  $('day').addEventListener('change', () => { state.day = $('day').value; refresh(); });
  $('search').addEventListener('input', () => { state.query = $('search').value; refresh(); });
  $('clear-search').addEventListener('click', () => { state.query = ''; $('search').value = ''; refresh(); $('search').focus(); });
  $('optional').addEventListener('change', () => { state.optional = $('optional').checked; refresh(); });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.category;
    state.categories = state.categories.includes(category) ? state.categories.filter(c => c !== category) : [...state.categories, category];
    refresh();
  }));
  document.querySelectorAll('.nav-button[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
  document.querySelectorAll('[data-lock]').forEach(button => button.addEventListener('click', () => {
    try { localStorage.removeItem(config.storageKey); } catch { /* Lock by navigation even if storage is disabled. */ }
    location.reload();
  }));
  $('fit-map').addEventListener('click', () => { closeDetail(); fitMap(); if (!map) toast('Kartunderlaget är inte tillgängligt. Platslistan och Navigera fungerar fortfarande.'); });
  $('sheet-toggle').addEventListener('click', () => {
    const expanded = $('app').classList.toggle('sheet-open');
    $('sheet-toggle').setAttribute('aria-expanded', String(expanded));
    $('sheet-toggle').textContent = expanded ? 'Visa karta ↓' : 'Visa lista ↑';
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(true); });
  window.addEventListener('resize', () => map?.resize());
  window.addEventListener('popstate', () => {
    state = initialSelection(data, new URLSearchParams(location.search));
    $('city').value = state.city; $('search').value = state.query; $('optional').checked = state.optional;
    updateDays(); refresh(false); changeView(state.view, false);
  });
}

function updateDays() {
  $('day').innerHTML = '<option value="">Alla dagar</option>' + daysForCity(data, state.city).map(d => `<option value="${d}">${dayText(d)}</option>`).join('');
  $('day').value = state.day;
}

function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.set('city', state.city); url.searchParams.set('day', state.day); url.searchParams.set('view', state.view);
  if (state.selected) url.searchParams.set('place', state.selected); else url.searchParams.delete('place');
  url.hash = '';
  history.replaceState(null, '', url);
}

function refresh(clear = true) {
  if (clear) closeDetail();
  matching = filterPlaces(places, state);
  $('list-title').textContent = state.day ? dayText(state.day, true) : data.cities.find(c => c.id === state.city).name + ' · alla dagar';
  $('list-count').textContent = matching.length + (matching.length === 1 ? ' plats' : ' platser') + (state.day ? ' · även alternativ utan fast dag' : '');
  $('clear-search').hidden = !state.query;
  document.querySelectorAll('[data-category]').forEach(b => {
    const selected = state.categories.includes(b.dataset.category);
    b.setAttribute('aria-pressed', String(selected)); b.querySelector('.tick').textContent = selected ? '✓' : '';
  });
  $('place-list').innerHTML = matching.length ? matching.map(p => `<button class="place-row" data-place="${esc(p.id)}" aria-pressed="${state.selected === p.id}">${badge(p)}<span class="row-text"><span class="row-title">${esc(p.name)}</span><span class="row-meta">${esc(p.area)} · ${esc(p.status === 'Valfritt' ? 'Valfritt' : CATEGORIES[p.category].singular)}${!state.day ? ' · ' + dayText(p.date) : !p.date ? ' · valfri dag' : ''}</span></span><span class="row-chevron" aria-hidden="true">›</span></button>`).join('') : '<div class="empty-state">Inga platser matchar ditt val.<br>Prova en annan dag eller kategori.<br><button class="text-button" id="reset-filters">Visa alla platser i staden</button></div>';
  $('place-list').querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => selectPlace(b.dataset.place, b)));
  $('reset-filters')?.addEventListener('click', () => { state.day = ''; state.query = ''; state.categories = Object.keys(CATEGORIES); state.optional = true; $('search').value = ''; $('optional').checked = true; updateDays(); refresh(); });
  renderPlan(); renderMarkers(); fitMap(); updateUrl();
}

function changeView(view, update = true) {
  state.view = view; $('app').dataset.view = view;
  for (const name of ['map', 'plan', 'details']) $(name + '-view').hidden = name !== view;
  document.querySelectorAll('.nav-button[data-view]').forEach(b => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (view === 'map') { requestAnimationFrame(() => { map?.resize(); fitMap(); }); startMap(); }
  if (view === 'details') showDetails();
  if (update) updateUrl();
}

function selectPlace(id, origin) {
  const p = places.find(p => p.id === id); if (!p) return;
  detailOrigin = origin || document.activeElement; state.selected = id;
  if (state.view !== 'map') changeView('map');
  const city = data.cities.find(c => c.id === p.city);
  const sourceLinks = (p.source_urls || []).map(safeLink).filter(Boolean);
  $('place-detail').innerHTML = `<button class="detail-close" id="close-detail" aria-label="Stäng platsdetaljer">×</button><div class="detail-top">${badge(p)}<div><h2 id="detail-title" tabindex="-1">${esc(p.name)}</h2><p class="detail-meta">${esc(CATEGORIES[p.category].singular)} · ${esc(p.area)}<br>${dayText(p.date)}${p.status === 'Valfritt' ? ' · valfritt alternativ' : p.status === 'Boende' ? ' · ert boende' : ''}</p></div></div><p class="detail-description">${esc(p.description_sv)}</p><p class="detail-address">${esc(p.address)}</p>${external(navigationUrl(p), icon('arrow') + 'Navigera', 'primary-button')}<p class="detail-footnote">Öppnas i Google Maps. Välj färdsätt där.</p><details class="detail-sources"><summary>Platsnotering och källor</summary><p>${esc(p.location_note || 'Kartpunkten visar platsens ungefärliga läge. Kontrollera rätt entré på plats.')}</p>${sourceLinks.map((u, i) => external(u, 'Källa ' + (i + 1))).join('')}<p>${esc(city.name)} · uppgifter från reseplanen. En markering är inte en bokning.</p></details>`;
  $('place-detail').hidden = false; $('app').classList.add('has-selection'); $('app').classList.remove('sheet-open');
  $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
  $('close-detail').addEventListener('click', () => closeDetail(true));
  document.querySelectorAll('[data-place]').forEach(e => e.setAttribute('aria-pressed', String(e.dataset.place === id)));
  requestAnimationFrame(() => {
    if (map) {
      const h = $('map').clientHeight, w = $('map').clientWidth;
      map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 13), duration: reduced() ? 0 : 350,
        padding: mobile() ? { top: 15, bottom: Math.min($('place-detail').offsetHeight + 20, Math.max(0, h - 120)), left: 30, right: 30 } : { top: 65, bottom: 50, left: 40, right: Math.min(400, Math.max(40, w - 150)) } });
    }
    $('detail-title').focus({ preventScroll: true });
  });
  updateUrl();
}

function closeDetail(restore = false) {
  if (!$('place-detail')) return;
  state.selected = null; $('place-detail').hidden = true; $('app').classList.remove('has-selection');
  document.querySelectorAll('[data-place][aria-pressed=true]').forEach(e => e.setAttribute('aria-pressed', 'false'));
  if (restore && detailOrigin?.isConnected) detailOrigin.focus({ preventScroll: true });
  if (restore) fitMap();
  updateUrl();
}

function renderPlan() {
  const city = data.cities.find(c => c.id === state.city);
  const days = state.day ? [state.day] : daysForCity(data, state.city);
  function planPlace(p) {
    return `<article class="plan-place" data-plan-place="${esc(p.id)}">${badge(p)}<div><h4>${esc(p.name)}</h4><p>${esc(p.description_sv)}</p><div class="actions"><button data-show-place="${esc(p.id)}">Visa på kartan</button>${external(navigationUrl(p), 'Navigera ↗')}</div></div></article>`;
  }
  let html = `<header class="plan-header"><span class="eyebrow">Samma platser som på kartan</span><h2>${esc(city.name)}${state.day ? ' · ' + dayText(state.day) : ''}</h2><p>Följ de blå aktivitetsnumren i ordning. Mat och sötsaker är förslag att välja bland, inte en lista där allt måste hinnas med. <strong>V</strong> betyder valfri aktivitet. Bokade tider i era biljetter gäller alltid.</p></header>`;
  if (city.intro) html += `<div class="notice">${esc(city.intro)}</div>`;
  if (!matching.length && !days.some(d => city.notes?.[d])) html += '<p class="empty-state">Inga platser matchar filtren. Ändra ditt val ovan eller i sidopanelen.</p>';
  for (const day of days) {
    const stops = matching.filter(p => p.date === day);
    if (!stops.length && !city.notes?.[day] && !state.day) continue;
    html += `<section class="plan-day"><div class="plan-day-title"><h3>${dayText(day, true)}</h3><button class="text-button" data-map-day="${day}">Visa dagens karta</button></div>`;
    if (city.notes?.[day]) html += `<div class="notice">${esc(city.notes[day])}</div>`;
    const groups = [ ['Dagens ordning', p => p.category === 'activity' && p.status !== 'Valfritt'], ['Mat att välja bland', p => p.category === 'food'], ['Sötsaker & fika', p => p.category === 'sweet'], ['Valfria aktiviteter · om ni har tid och lust', p => p.category === 'activity' && p.status === 'Valfritt'] ];
    for (const [heading, check] of groups) { const group = stops.filter(check); if (group.length) html += `<h4 class="plan-section-title">${heading}</h4>` + group.map(planPlace).join(''); }
    if (!stops.length) html += '<p class="row-meta">Inga extra stopp med de valda filtren den här dagen.</p>';
    html += '</section>';
  }
  const flexible = matching.filter(p => !p.date);
  if (flexible.length) html += '<section class="plan-day"><h3>Valfri dag under vistelsen</h3><p class="row-meta">Välj när det passar. Dessa alternativ återkommer i kartans dagsfilter.</p>' + flexible.map(planPlace).join('') + '</section>';
  html += `<footer class="data-version">Platslista uppdaterad ${esc(data.updatedAt.slice(0, 10))}. Ändringar i den gemensamma listan visas här och på kartan när sidan laddas om.<br>Kartan visar platser, inte en beräknad gångrutt. Kartunderlag: OpenFreeMap / OpenMapTiles / OpenStreetMap.<br><button class="reload-button" id="reload-data">↻ Hämta senaste planen</button></footer>`;
  $('plan-view').innerHTML = html;
  $('plan-view').querySelectorAll('[data-show-place]').forEach(b => b.addEventListener('click', () => selectPlace(b.dataset.showPlace, b)));
  $('plan-view').querySelectorAll('[data-map-day]').forEach(b => b.addEventListener('click', () => { state.day = b.dataset.mapDay; updateDays(); refresh(); changeView('map'); }));
  $('reload-data').addEventListener('click', () => location.reload());
}

function showDetails() {
  if (loadedDetails) return;
  const legacy = new DOMParser().parseFromString(config.legacyHtml, 'text/html');
  // Keep the original logistics/checklists and their saved checkbox IDs. All activity
  // order and restaurant lists now come solely from the shared dataset, not this snapshot.
  legacy.getElementById('dagforday')?.remove(); legacy.getElementById('mat')?.remove();
  legacy.querySelectorAll('a[href="#dagforday"],a[href="#mat"],a[href^="#dag-"]').forEach(a => a.remove());
  legacy.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  $('details-frame').srcdoc = '<!doctype html>\n' + legacy.documentElement.outerHTML;
  loadedDetails = true;
}

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

function mapMessage(message) { $('map-status').textContent = message; $('map-status').hidden = false; }

function loadMapLibrary() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js';
    script.integrity = 'sha256-taNOaTD/k327ue7IiSz/uAukc8zoiuXKjEZUQy9fDrw=';
    script.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(Error('Kartan tog för lång tid att ladda')), 25000);
    script.onload = () => { clearTimeout(timer); resolve(window.maplibregl); };
    script.onerror = () => { clearTimeout(timer); reject(Error('Kartbiblioteket kunde inte laddas')); };
    document.head.append(script);
  });
}

async function startMap() {
  if (map || mapStarting) return; mapStarting = true;
  try {
    const lib = await loadMapLibrary();
    if (!lib) throw Error('Kartbiblioteket saknas');
    const first = matching[0] || places.find(p => p.city === state.city);
    map = new lib.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', center: [first.lon, first.lat], zoom: 11, attributionControl: false, renderWorldCopies: false, localIdeographFontFamily: false });
    map.addControl(new lib.AttributionControl({ compact: false }), 'bottom-left');
    map.addControl(new lib.NavigationControl({ showCompass: false }), 'bottom-right');
    const locationControl = new lib.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false, showUserHeading: false });
    locationControl.on('error', () => toast('Din position kunde inte hämtas. Du kan fortfarande välja platser och öppna Navigera.'));
    map.addControl(locationControl, 'bottom-right');
    map.on('error', () => mapMessage('Delar av kartunderlaget kunde inte laddas. Platslistan och Navigera fungerar ändå. Prova att ladda om sidan när du har internet.'));
    map.on('load', () => { $('map-status').hidden = true; });
    const initialTimer = setTimeout(() => { if (!map.isStyleLoaded()) mapMessage('Kartunderlaget laddar långsamt. Du kan använda platslistan och Navigera under tiden.'); }, 18000);
    map.once('idle', () => { clearTimeout(initialTimer); $('map-status').hidden = true; });
    map.getCanvas().setAttribute('aria-label', 'Interaktiv karta. Platslistan ger samma information utan karta.');
    renderMarkers(); fitMap();
    if (state.selected && matching.some(p => p.id === state.selected)) selectPlace(state.selected);
  } catch {
    mapMessage('Kartan kunde inte visas. Platslistan, Dagsplan och Navigera fungerar fortfarande. Kontrollera internetanslutningen och ladda om sidan.');
  } finally { mapStarting = false; }
}

function renderMarkers() {
  if (!map) return;
  markers.forEach(m => m.remove()); markers = [];
  for (const p of matching) {
    const button = document.createElement('button');
    button.className = 'pin' + (isOptionalActivity(p) ? ' optional' : '');
    button.style.setProperty('--cat', CATEGORIES[p.category].color);
    button.dataset.place = p.id; button.setAttribute('aria-label', p.label + '. ' + p.name); button.setAttribute('aria-pressed', String(state.selected === p.id));
    button.innerHTML = `<span class="pin-shape"><span class="pin-label">${esc(p.label)}</span></span>`;
    button.addEventListener('click', event => { event.stopPropagation(); selectPlace(p.id, button); });
    markers.push(new window.maplibregl.Marker({ element: button, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map));
  }
}

function fitMap() {
  if (!map || state.view !== 'map') return;
  map.resize();
  const points = matching.length ? matching : places.filter(p => p.city === state.city);
  if (!points.length) return;
  const bounds = new window.maplibregl.LngLatBounds(); points.forEach(p => bounds.extend([p.lon, p.lat]));
  const sheetHeight = parseFloat(getComputedStyle($('app')).getPropertyValue('--sheet')) || 214;
  const bottom = mobile() ? Math.min(sheetHeight + 36, Math.max(35, $('map').clientHeight - 150)) : 65;
  map.fitBounds(bounds, { padding: { top: 85, right: mobile() ? 55 : 65, bottom, left: mobile() ? 40 : 65 }, maxZoom: 14, duration: reduced() ? 0 : 300 });
}

async function boot() {
  const sets = await Promise.all(config.datasets.map(readDataset));
  data = validateData({ schema: 1, cities: sets.flatMap(s => s.cities), places: sets.flatMap(s => s.places), updatedAt: sets.map(s => s.updatedAt).sort().at(-1) });
  places = numberPlaces(data.places);
  state = initialSelection(data, new URLSearchParams(location.search));
  layout(); refresh(false); changeView(state.view);
  const selected = state.selected;
  if (selected && matching.some(p => p.id === selected)) selectPlace(selected);
}

boot().catch(() => {
  $('app').innerHTML = '<div class="loading-screen"><h1>Planen kunde inte laddas</h1><p>Kontrollera internetanslutningen och försök igen. Era sparade checklistor är inte borttagna.</p><button class="primary-button" id="retry">Försök igen</button><p><button class="text-button" id="fallback-details">Visa befintliga bokningar och checklistor</button></p></div>';
  $('retry').addEventListener('click', () => location.reload());
  $('fallback-details').addEventListener('click', () => {
    const frame = document.createElement('iframe'); frame.title = 'Befintlig reseplan'; frame.style.cssText = 'border:0;width:100%;height:100dvh'; frame.srcdoc = config.legacyHtml; $('app').replaceChildren(frame);
  });
});
