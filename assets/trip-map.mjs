import { CATEGORIES, foodOptions, foodTypeLabel, validateData, numberPlaces, groupMapPlaces, filterPlaces, daysForCity, dayText, initialSelection, googleMapsUrl, safeLink } from './trip-model.mjs?v=20260914.4';

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
const badge = p => `<span class="number${isOptionalActivity(p) ? ' optional' : ''}${p.label.length > 4 ? ' long-number' : ''}" style="${catStyle(p)}">${esc(p.label)}</span>`;
const external = (url, label, cls = '') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const assetUrl = path => new URL(path, import.meta.url).href;
const mobile = () => matchMedia('(max-width: 700px), (max-width: 1000px) and (max-height: 500px)').matches;
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
        <div class="search-row"><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="Sök bland resans platser" aria-label="Sök platser i vald stad" autocomplete="off"><button class="search-clear" id="clear-search" aria-label="Rensa sökning" hidden>×</button></label><button class="mobile-lock" data-lock aria-label="Lås sidan">${icon('lock')}</button></div>
        <header class="identity"><div><h1>Resekartan</h1><p>${esc(config.subtitle)}</p></div></header>
        <div class="selects"><label class="select-box"><span>Stad</span><select id="city" aria-label="Stad"></select></label><label class="select-box day-filter"><span>Dag</span><select id="day" aria-label="Dag"></select></label></div>
        <div class="chips" role="group" aria-label="Visa kategorier">${Object.entries(CATEGORIES).map(([key, c]) => `<button class="chip" style="--cat:${c.color}" data-category="${key}" aria-pressed="true"><span class="tick" aria-hidden="true">✓</span>${c.name}</button>`).join('')}</div>
        <label class="food-filter"><span id="food-filter-label">Matfilter</span><select id="food-type" aria-labelledby="food-filter-label"></select></label>
        <label class="optional-toggle"><input id="optional" type="checkbox" checked>Visa även valfria aktiviteter (V)</label>
      </div>
      <section class="places-panel" aria-label="Platslista">
        <div class="list-heading"><div class="list-summary"><h2 id="list-title"></h2><span class="list-count" id="list-count" role="status"></span></div><p>Aktiviteter i nummerordning, sedan valfria stopp.</p><button class="sheet-toggle" id="sheet-toggle" aria-expanded="false" aria-controls="place-list">Visa lista ↑</button></div>
        <div class="place-list" id="place-list"></div>
      </section>
    </aside>
    <main class="workspace" id="workspace">
      <section class="map-view" id="map-view" aria-label="Interaktiv resekarta">
        <div class="map-canvas" id="map" aria-label="Karta över resans platser"></div>
        <div class="map-tools"><button class="floating-button" id="fit-map">${icon('list')}Visa alla</button></div>
        <div class="map-help">3.1 = 3 okt, aktivitet 1 · V = valfritt<br>M = mat · K = kaféer · S = sött</div>
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
    state.city = $('city').value; state.day = state.view === 'map' ? '' : daysForCity(data, state.city)[0] || ''; state.query = ''; state.foodType = state.foodType ? 'all' : ''; $('search').value = ''; updateDays(); refresh();
  });
  $('food-type').addEventListener('change', () => {
    state.foodType = $('food-type').value;
    state.categories = state.foodType ? ['food'] : Object.keys(CATEGORIES);
    refresh();
  });
  $('day').addEventListener('change', () => { state.day = $('day').value; refresh(); });
  $('search').addEventListener('input', () => { state.query = $('search').value; refresh(); });
  $('clear-search').addEventListener('click', () => { state.query = ''; $('search').value = ''; refresh(); $('search').focus(); });
  $('optional').addEventListener('change', () => { state.optional = $('optional').checked; refresh(); });
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.category;
    state.categories = state.categories.includes(category) ? state.categories.filter(c => c !== category) : [...state.categories, category];
    if (!state.categories.includes('food')) state.foodType = '';
    refresh();
  }));
  document.querySelectorAll('.nav-button[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
  document.querySelectorAll('[data-lock]').forEach(button => button.addEventListener('click', () => {
    try { localStorage.removeItem(config.storageKey); } catch { /* Lock by navigation even if storage is disabled. */ }
    location.reload();
  }));
  $('fit-map').addEventListener('click', () => { closeDetail(); fitMap(); if (!map) toast('Kartunderlaget är inte tillgängligt. Platslistan och Google Maps fungerar fortfarande.'); });
  $('sheet-toggle').addEventListener('click', () => {
    const expanded = $('app').classList.toggle('sheet-open');
    $('sheet-toggle').setAttribute('aria-expanded', String(expanded));
    $('sheet-toggle').textContent = expanded ? 'Visa karta ↓' : 'Visa lista ↑';
    if (!expanded) fitMap();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(true); });
  window.addEventListener('resize', () => requestAnimationFrame(() => {
    map?.resize();
    const selected = places.find(p => p.id === state.selected);
    if (selected) focusPlace(selected, false); else fitMap();
  }));
  window.addEventListener('popstate', () => {
    const restored = initialSelection(data, new URLSearchParams(location.search));
    closeDetail(false, false);
    $('app').classList.remove('sheet-open');
    $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
    state = restored;
    $('city').value = state.city; $('search').value = state.query; $('optional').checked = state.optional;
    updateDays(); refresh(false); changeView(state.view, false);
    if (state.selected && matching.some(p => p.id === state.selected)) selectPlace(state.selected);
    else closeDetail();
  });
}

function updateDays() {
  $('day').innerHTML = '<option value="">Alla dagar</option>' + daysForCity(data, state.city).map(d => `<option value="${d}">${dayText(d)}</option>`).join('');
  $('day').value = state.day;
}

function updateFoodOptions() {
  const count = places.filter(p => p.city === state.city && p.category === 'food').length;
  $('food-filter-label').textContent = 'Matfilter · ' + (state.city === 'seoul' ? 'Sydkorea' : 'Japan');
  $('food-type').innerHTML = '<option value="">Alla platser</option>' + `<option value="all">Alla matställen (${count})</option>` + foodOptions(places, state.city).map(o => `<option value="${o.id}">${esc(o.label)} (${o.count})</option>`).join('');
  $('food-type').value = state.foodType || '';
  document.querySelector('.food-filter').classList.toggle('is-active', Boolean(state.foodType));
}

function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.set('city', state.city); url.searchParams.set('view', state.view);
  if (state.view === 'map') url.searchParams.delete('day'); else url.searchParams.set('day', state.day);
  if (state.selected) url.searchParams.set('place', state.selected); else url.searchParams.delete('place');
  if (state.foodType) url.searchParams.set('food', state.foodType); else url.searchParams.delete('food');
  if (state.foodType || state.categories.length !== Object.keys(CATEGORIES).length) url.searchParams.set('categories', state.categories.join(',')); else url.searchParams.delete('categories');
  url.hash = '';
  history.replaceState(null, '', url);
}

function refresh(clear = true) {
  if (clear) closeDetail();
  if (state.view === 'map') { state.day = ''; state.optional = true; $('optional').checked = true; }
  updateFoodOptions();
  matching = filterPlaces(places, state);
  $('list-title').textContent = data.cities.find(c => c.id === state.city).name;
  $('list-count').textContent = matching.length + (matching.length === 1 ? ' plats' : ' platser') + (state.day ? ' · även alternativ utan fast dag' : '');
  $('clear-search').hidden = !state.query;
  document.querySelectorAll('[data-category]').forEach(b => {
    const selected = state.categories.includes(b.dataset.category);
    b.setAttribute('aria-pressed', String(selected)); b.querySelector('.tick').textContent = selected ? '✓' : '';
  });
  $('place-list').innerHTML = matching.length ? groupMapPlaces(matching).map(group => `<section class="map-place-group" data-group="${group.id}" aria-labelledby="group-${group.id}"><h3 id="group-${group.id}">${group.title}</h3>${group.places.map(p => `<button class="place-row" data-place="${esc(p.id)}" aria-pressed="${state.selected === p.id}">${badge(p)}<span class="row-text"><span class="row-title">${esc(p.name)}</span><span class="row-meta">${esc(p.area)}${p.category === 'food' ? ' · ' + esc((p.food_tags || []).map(tag => foodTypeLabel(tag, p.city)).join(' / ')) : ''} · ${esc(p.status === 'Valfritt' ? 'Valfritt' : CATEGORIES[p.category].singular)}</span></span><span class="row-chevron" aria-hidden="true">›</span></button>`).join('')}</section>`).join('') : '<div class="empty-state">Inga platser matchar ditt val.<br>Prova en annan sökning eller kategori.<br><button class="text-button" id="reset-filters">Visa alla platser i staden</button></div>';
  $('place-list').querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => selectPlace(b.dataset.place, b)));
  $('reset-filters')?.addEventListener('click', () => { state.day = ''; state.query = ''; state.foodType = ''; state.categories = Object.keys(CATEGORIES); state.optional = true; $('search').value = ''; $('optional').checked = true; updateDays(); refresh(); });
  renderPlan(); renderMarkers(); fitMap(); updateUrl();
}

function changeView(view, update = true) {
  const previous = state.view;
  if (previous === 'map' && view !== 'map') {
    closeDetail(); $('app').classList.remove('sheet-open');
    $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
  }
  state.view = view; $('app').dataset.view = view;
  for (const name of ['map', 'plan', 'details']) $(name + '-view').hidden = name !== view;
  document.querySelectorAll('.nav-button[data-view]').forEach(b => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (view === 'map') {
    state.day = ''; state.optional = true; updateDays();
    if (previous !== view) refresh(false);
    requestAnimationFrame(() => { map?.resize(); fitMap(); }); startMap();
  }
  if (view === 'details') showDetails();
  if (update) updateUrl();
}

function foodBadges(p) {
  return p.category === 'food' ? `<div class="food-badges">${(p.food_tags || []).map(tag => `<span>${esc(foodTypeLabel(tag, p.city))}</span>`).join('')}</div>` : '';
}

function photoGallery(p) {
  const photos = (p.photos || []).filter(photo => safeLink(photo.src)?.startsWith('https:') && safeLink(photo.source));
  return `<section class="place-photos" aria-label="Bilder på platsen"><div class="photo-strip">${photos.map((photo, i) => `<figure class="place-photo"><a href="${esc(photo.src)}" target="_blank" rel="noopener noreferrer" aria-label="Öppna bild: ${esc(photo.alt)}"><img src="${esc(photo.src)}" alt="${esc(photo.alt)}" decoding="async" referrerpolicy="no-referrer"${i ? ' loading="lazy"' : ''}></a><figcaption>${external(photo.source, esc(photo.credit))}</figcaption></figure>`).join('')}</div><p class="photo-fallback"${photos.length ? ' hidden' : ''}>Bilder visas inte här just nu. ${external(googleMapsUrl(p), 'Se platsens bilder i Google Maps ↗')}</p></section>`;
}

function bindPhotos(p) {
  const gallery = $('place-detail').querySelector('.place-photos');
  gallery.querySelectorAll('img').forEach(img => {
    const failed = () => {
      img.closest('figure').hidden = true;
      if (![...gallery.querySelectorAll('figure')].some(figure => !figure.hidden)) gallery.querySelector('.photo-fallback').hidden = false;
    };
    img.addEventListener('error', failed, { once: true });
    if (img.complete && !img.naturalWidth) failed();
  });
}

function selectPlace(id, origin) {
  const p = places.find(p => p.id === id); if (!p) return;
  detailOrigin = origin || document.activeElement; state.selected = id;
  if (state.view !== 'map') changeView('map');
  const city = data.cities.find(c => c.id === p.city);
  const sourceLinks = (p.source_urls || []).map(safeLink).filter(Boolean);
  $('place-detail').innerHTML = `<button class="detail-close" id="close-detail" aria-label="Stäng platsdetaljer">×</button><div class="detail-top">${badge(p)}<div><h2 id="detail-title" tabindex="-1">${esc(p.name)}</h2><p class="detail-meta">${esc(CATEGORIES[p.category].singular)} · ${esc(p.area)}<br>${dayText(p.date)}${p.status === 'Valfritt' ? ' · valfritt alternativ' : p.status === 'Boende' ? ' · ert boende' : ''}</p></div></div>${external(googleMapsUrl(p), icon('map') + 'Öppna Google Maps', 'primary-button')}<p class="detail-footnote">Välj Vägbeskrivning i Google Maps när ni vill ta er hit.</p>${photoGallery(p)}${foodBadges(p)}<p class="detail-description">${esc(p.description_sv)}</p><p class="detail-address">${esc(p.address)}</p><details class="detail-sources"><summary>Platsnotering och källor</summary><p>${esc(p.location_note || 'Kartpunkten visar platsens ungefärliga läge. Kontrollera rätt entré på plats.')}</p>${sourceLinks.map((u, i) => external(u, 'Källa ' + (i + 1))).join('')}<p>${esc(city.name)} · uppgifter från reseplanen. En markering är inte en bokning.</p></details>`;
  bindPhotos(p);
  $('place-detail').hidden = false; $('app').classList.add('has-selection'); $('app').classList.remove('sheet-open');
  $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
  $('close-detail').addEventListener('click', () => closeDetail(true));
  document.querySelectorAll('[data-place]').forEach(e => e.setAttribute('aria-pressed', String(e.dataset.place === id)));
  requestAnimationFrame(() => {
    focusPlace(p);
    $('detail-title').focus({ preventScroll: true });
  });
  updateUrl();
}

function closeDetail(restore = false, update = true) {
  if (!$('place-detail')) return;
  state.selected = null; $('place-detail').hidden = true; $('app').classList.remove('has-selection');
  document.querySelectorAll('[data-place][aria-pressed=true]').forEach(e => e.setAttribute('aria-pressed', 'false'));
  if (restore) {
    const origin = detailOrigin?.isConnected && detailOrigin.getClientRects().length ? detailOrigin : mobile() ? $('sheet-toggle') : $('fit-map');
    origin.focus({ preventScroll: true });
  }
  if (restore) fitMap();
  if (update) updateUrl();
}

function renderPlan() {
  const city = data.cities.find(c => c.id === state.city);
  const days = state.day ? [state.day] : daysForCity(data, state.city);
  function planPlace(p) {
    return `<article class="plan-place" data-plan-place="${esc(p.id)}">${badge(p)}<div><h4>${esc(p.name)}</h4><p>${esc(p.description_sv)}</p><div class="actions"><button data-show-place="${esc(p.id)}">Visa på kartan</button>${external(googleMapsUrl(p), 'Google Maps ↗')}</div></div></article>`;
  }
  let html = `<header class="plan-header"><span class="eyebrow">Samma platser som på kartan</span><h2>${esc(city.name)}${state.day ? ' · ' + dayText(state.day) : ''}</h2><p>Följ de blå aktivitetsnumren i ordning. Mat och sötsaker är förslag att välja bland, inte en lista där allt måste hinnas med. <strong>3.1</strong> betyder 3 oktober, aktivitet 1. <strong>3.V1</strong> är ett valfritt stopp den dagen; <strong>V1</strong> saknar fast datum. Bokade tider i era biljetter gäller alltid.</p></header>`;
  if (city.intro) html += `<div class="notice">${esc(city.intro)}</div>`;
  if (!matching.length && !days.some(d => city.notes?.[d])) html += '<p class="empty-state">Inga platser matchar filtren. Ändra ditt val ovan eller i sidopanelen.</p>';
  for (const day of days) {
    const stops = matching.filter(p => p.date === day);
    if (!stops.length && !city.notes?.[day] && !state.day) continue;
    html += `<section class="plan-day"><div class="plan-day-title"><h3>${dayText(day, true)}</h3><button class="text-button" data-map-day="${day}">Visa stadens karta</button></div>`;
    if (city.notes?.[day]) html += `<div class="notice">${esc(city.notes[day])}</div>`;
    const groups = [ ['Dagens ordning', p => p.category === 'activity' && p.status !== 'Valfritt'], ['Mat att välja bland', p => p.category === 'food'], ['Kaféer · kaffe och te', p => p.category === 'cafe'], ['Sötsaker', p => p.category === 'sweet'], ['Valfria aktiviteter · om ni har tid och lust', p => p.category === 'activity' && p.status === 'Valfritt'] ];
    for (const [heading, check] of groups) { const group = stops.filter(check); if (group.length) html += `<h4 class="plan-section-title">${heading}</h4>` + group.map(planPlace).join(''); }
    if (!stops.length) html += '<p class="row-meta">Inga extra stopp med de valda filtren den här dagen.</p>';
    html += '</section>';
  }
  const flexible = matching.filter(p => !p.date);
  if (flexible.length) html += '<section class="plan-day"><h3>Valfri dag under vistelsen</h3><p class="row-meta">Välj när det passar. Alla alternativ finns också på stadens karta.</p>' + flexible.map(planPlace).join('') + '</section>';
  html += `<footer class="data-version">Platslista uppdaterad ${esc(data.updatedAt.slice(0, 10))}. Ändringar i den gemensamma listan visas här och på kartan när sidan laddas om.<br>Kartan visar platser, inte en beräknad gångrutt. Kartunderlag: OpenFreeMap / OpenMapTiles / OpenStreetMap.<br><button class="reload-button" id="reload-data">↻ Hämta senaste planen</button></footer>`;
  $('plan-view').innerHTML = html;
  $('plan-view').querySelectorAll('[data-show-place]').forEach(b => b.addEventListener('click', () => selectPlace(b.dataset.showPlace, b)));
  $('plan-view').querySelectorAll('[data-map-day]').forEach(b => b.addEventListener('click', () => { closeDetail(); changeView('map'); }));
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
  const theme = legacy.createElement('link'); theme.rel = 'stylesheet'; theme.href = assetUrl('./trip-details.css?v=20260914.4'); legacy.head.append(theme);
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
    locationControl.on('error', () => toast('Din position kunde inte hämtas. Du kan fortfarande välja platser och öppna Google Maps.'));
    map.addControl(locationControl, 'bottom-right');
    map.on('error', () => mapMessage('Delar av kartunderlaget kunde inte laddas. Platslistan och Google Maps fungerar ändå. Prova att ladda om sidan när du har internet.'));
    map.on('load', () => { $('map-status').hidden = true; });
    const initialTimer = setTimeout(() => { if (!map.isStyleLoaded()) mapMessage('Kartunderlaget laddar långsamt. Du kan använda platslistan och Google Maps under tiden.'); }, 18000);
    map.once('idle', () => { clearTimeout(initialTimer); $('map-status').hidden = true; });
    map.getCanvas().setAttribute('aria-label', 'Interaktiv karta. Platslistan ger samma information utan karta.');
    renderMarkers(); fitMap();
    if (state.selected && matching.some(p => p.id === state.selected)) selectPlace(state.selected);
  } catch {
    mapMessage('Kartan kunde inte visas. Platslistan, Dagsplan och Google Maps fungerar fortfarande. Kontrollera internetanslutningen och ladda om sidan.');
  } finally { mapStarting = false; }
}

function renderMarkers() {
  if (!map) return;
  markers.forEach(m => m.remove()); markers = [];
  for (const p of matching) {
    const button = document.createElement('button');
    button.className = 'pin' + (isOptionalActivity(p) ? ' optional' : '') + (p.label.length > 4 ? ' long-label' : '');
    button.style.setProperty('--cat', CATEGORIES[p.category].color);
    button.dataset.place = p.id; button.setAttribute('aria-label', p.label + '. ' + p.name); button.setAttribute('aria-pressed', String(state.selected === p.id));
    button.innerHTML = `<span class="pin-shape"><span class="pin-label">${esc(p.label)}</span></span>`;
    button.addEventListener('click', event => { event.stopPropagation(); selectPlace(p.id, button); });
    markers.push(new window.maplibregl.Marker({ element: button, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map));
  }
}

function cameraPadding(detail = false) {
  const rect = $('map').getBoundingClientRect();
  if (!mobile()) return detail
    ? { top: 65, bottom: 50, left: 40, right: Math.min(400, Math.max(40, rect.width - 150)) }
    : { top: 85, right: 65, bottom: 65, left: 65 };
  const controls = document.querySelector('.controls').getBoundingClientRect();
  const top = Math.max(35, controls.bottom - rect.top + 38);
  // Use the collapsed target height, not an intermediate sheet-animation frame.
  const peek = parseFloat(getComputedStyle($('app')).getPropertyValue('--map-peek')) || 56;
  const overlayTop = detail ? $('place-detail').getBoundingClientRect().top : document.querySelector('.rail').getBoundingClientRect().top - peek - 14;
  const bottom = Math.max(40, rect.bottom - overlayTop + 24);
  // Leave room for a pin even on short screens or when rotating with details open.
  const scale = Math.min(1, Math.max(0, rect.height - 70) / (top + bottom));
  return { top: top * scale, bottom: bottom * scale, left: 35, right: 55 };
}

function focusPlace(p, zoom = true) {
  if (!map || state.view !== 'map') return;
  map.easeTo({ center: [p.lon, p.lat], zoom: zoom ? Math.max(map.getZoom(), 13) : map.getZoom(),
    padding: cameraPadding(true), duration: reduced() || !zoom ? 0 : 350 });
}

function fitMap() {
  if (!map || state.view !== 'map') return;
  map.resize();
  if ($('map').clientWidth < 160 || $('map').clientHeight < 160) return;
  // Detail panels set camera padding. Reset it before fitting, especially after
  // rotating a phone or changing between desktop and mobile layout.
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  const points = matching.length ? matching : places.filter(p => p.city === state.city);
  if (!points.length) return;
  const bounds = new window.maplibregl.LngLatBounds(); points.forEach(p => bounds.extend([p.lon, p.lat]));
  map.fitBounds(bounds, { padding: cameraPadding(), maxZoom: 14, duration: reduced() ? 0 : 300 });
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
