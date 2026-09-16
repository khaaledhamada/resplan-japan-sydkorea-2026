import { CATEGORIES, CAFE_TYPES, cafeOptions, foodOptions, foodTypeLabel, validateData, numberPlaces, groupMapPlaces, filterPlaces, planPlaces, daysForCity, dayText, initialSelection, parsePreferences, selectionPreferences, googleMapsUrl, safeLink } from './trip-model.mjs?v=20260916.6';

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
const isLodging = p => p.status === 'Boende';
const isTransport = p => p.status === 'Transport';
const transportKind = p => {
  const text = `${p.name} ${p.description_sv} ${p.address}`.toLocaleLowerCase('sv');
  if (/buss|bus|flygplats|airport/.test(text)) return 'bus';
  if (/båt|boat|sightseeingbåt/.test(text)) return 'boat';
  if (/linbana|ropeway|bergbanan|bergbana/.test(text)) return 'cable';
  return 'train';
};
const lodgingIcon = '<svg class="lodging-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 10 12 2l10 8v11H2Z"/><path d="M9 21v-7h6v7Z"/></svg>';
const lodgingMarker = '<svg class="pin-house" viewBox="0 0 44 44" aria-hidden="true"><path class="pin-house-fill" d="M3 18 22 3l19 15v23H3Z"/><path class="pin-house-door" d="M17 41V27h10v14Z"/></svg>';
const transportIcons = {
  train: '<rect x="7" y="4" width="30" height="28" rx="6"/><path d="M7 22h30M13 12h6m6 0h6M13 37l-4 4m22-4 4 4"/><circle cx="15" cy="27" r="2"/><circle cx="29" cy="27" r="2"/>',
  bus: '<rect x="6" y="5" width="32" height="29" rx="6"/><path d="M6 21h32M12 12h20M12 39l-3 2m23-2 3 2"/><circle cx="14" cy="28" r="2"/><circle cx="30" cy="28" r="2"/>',
  cable: '<path d="M4 9h36M22 9v7M10 9l8 11m14-11-8 11"/><rect x="12" y="20" width="20" height="13" rx="3"/><path d="M16 37h12"/>',
  boat: '<path d="M5 27h34l-4 8H9Z"/><path d="M10 27V15h24v12M16 15V9h12v6M5 39c3 2 5 2 8 0 3 2 5 2 8 0 3 2 5 2 8 0 3 2 5 2 8 0"/>',
};
const transportLabel = p => ({ train: 'Tåg', bus: 'Buss', cable: 'Linbana', boat: 'Båt' }[transportKind(p)]);
const transportBadge = p => `<span class="number transport transport-${transportKind(p)}" title="${transportLabel(p)}" aria-label="${transportLabel(p)}" style="${catStyle(p)}"><svg class="transport-icon" viewBox="0 0 44 44" aria-hidden="true">${transportIcons[transportKind(p)]}</svg></span>`;
const transportMarker = p => `<svg class="pin-transit pin-transit-${transportKind(p)}" viewBox="0 0 44 44" aria-hidden="true">${transportIcons[transportKind(p)]}</svg>`;
const badge = p => isLodging(p)
  ? `<span class="number lodging" title="Boende" aria-label="Boende" style="${catStyle(p)}">${lodgingIcon}</span>`
  : isTransport(p) ? transportBadge(p)
  : `<span class="number${isOptionalActivity(p) ? ' optional' : ''}${p.label.length > 4 ? ' long-number' : ''}" style="${catStyle(p)}">${esc(p.label)}</span>`;
const placeType = p => isTransport(p) ? transportLabel(p) : p.status === 'Valfritt' ? 'Valfritt' : CATEGORIES[p.category].singular;
const external = (url, label, cls = '') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const assetUrl = path => new URL(path, import.meta.url).href;
const mobile = () => matchMedia('(max-width: 700px), (max-width: 1000px) and (max-height: 500px)').matches;
const preferencesKey = 'resplan-map-preferences-v1';
let savedPreferences = {}, preferencesAvailable = true, lastSavedPreferences = '';
let data, state, map, markers = [], places = [], matching = [], toastTimer, detailOrigin, loadedDetails = false, mapStarting = false;
let cameraCity = null;

function readSavedPreferences() {
  try { return parsePreferences(localStorage.getItem(preferencesKey)); }
  catch { preferencesAvailable = false; return {}; }
}
function savePreferences() {
  savedPreferences = selectionPreferences(savedPreferences, state);
  const serialized = JSON.stringify(savedPreferences);
  try {
    if (serialized !== lastSavedPreferences) localStorage.setItem(preferencesKey, serialized);
    lastSavedPreferences = serialized;
  } catch { preferencesAvailable = false; }
  if ($('preferences-note')) $('preferences-note').textContent = preferencesAvailable
    ? 'Dina val sparas i den här webbläsaren.' : 'Valen gäller nu. Webbläsaren tillåter inte att de sparas.';
}
function closeFilters() {
  $('filter-panel').classList.remove('is-open');
  $('filters-toggle').setAttribute('aria-expanded', 'false');
}

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
        <div class="filter-panel" id="filter-panel">
          <button class="filters-toggle" id="filters-toggle" aria-expanded="false" aria-controls="filter-options">${icon('list')}<span id="filters-summary">Filter</span><span aria-hidden="true">⌄</span></button>
          <div class="filter-options" id="filter-options">
            <fieldset class="category-filters"><legend>Visa på kartan</legend><p class="filter-hint">Bocka i det ni vill se · dubbeltryck på en kategori för alla</p><div class="category-options">${Object.entries(CATEGORIES).map(([key, c]) => `<label class="category-option" data-category-option="${key}"><input type="checkbox" data-category="${key}" checked><span>${c.name}</span></label>`).join('')}</div></fieldset>
            <label class="food-filter"><span id="food-filter-label">Matfilter</span><select id="food-type" aria-labelledby="food-filter-label"></select></label>
            <label class="food-filter cafe-filter"><span id="cafe-filter-label">Kaféfilter</span><select id="cafe-type" aria-labelledby="cafe-filter-label"></select></label>
            <label class="optional-toggle"><input id="optional" type="checkbox" checked>Visa valfria aktiviteter (V)</label>
            <p class="preferences-note" id="preferences-note">Dina val sparas i den här webbläsaren.</p>
          </div>
        </div>
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
        <div class="map-help">3.1 = 3 okt, aktivitet 1 · V = valfritt<br>M = mat · K = kaféer · S = sött · rött hus = boende · blått tåg/buss = transport</div>
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
    state = initialSelection(data, new URLSearchParams({ city: $('city').value, view: state.view }), new Date(), savedPreferences);
    $('search').value = ''; updateDays(); refresh(true, true);
  });
  $('food-type').addEventListener('change', () => {
    state.foodType = $('food-type').value;
    if (!state.categories.includes('food')) state.categories.push('food');
    refresh();
  });
  $('cafe-type').addEventListener('change', () => {
    state.cafeType = $('cafe-type').value;
    if (!state.categories.includes('cafe')) state.categories.push('cafe');
    refresh();
  });
  $('day').addEventListener('change', () => { state.day = $('day').value; refresh(); });
  $('search').addEventListener('input', () => { state.query = $('search').value; refresh(); });
  $('clear-search').addEventListener('click', () => { state.query = ''; $('search').value = ''; refresh(); $('search').focus(); });
  $('optional').addEventListener('change', () => { state.optional = $('optional').checked; refresh(); });
  const categoryClicks = [];
  document.querySelectorAll('[data-category]').forEach(input => {
    // Listen on the input so label activation is counted once, not twice.
    input.addEventListener('click', () => {
      categoryClicks.push(input.dataset.category);
      if (categoryClicks.length > 2) categoryClicks.shift();
    });
    input.addEventListener('change', () => {
      const category = input.dataset.category;
      state.categories = input.checked ? [...new Set([...state.categories, category])] : state.categories.filter(c => c !== category);
      refresh();
    });
  });
  document.querySelectorAll('[data-category-option]').forEach(option => option.addEventListener('dblclick', event => {
    event.preventDefault();
    // Browsers may continue the click count after moving to another label.
    // Restoring all filters requires both activations on this same category.
    if (categoryClicks.length !== 2 || !categoryClicks.every(category => category === option.dataset.categoryOption)) return;
    categoryClicks.length = 0;
    // A double tap is a quick, discoverable "show everything" action. Clear
    // the food/café subfilters too, otherwise the category boxes would all be
    // checked while a hidden type filter still narrowed the map.
    state.categories = Object.keys(CATEGORIES);
    state.foodType = ''; state.cafeType = ''; state.optional = true;
    refresh();
  }));
  $('filters-toggle').addEventListener('click', () => {
    const open = $('filter-panel').classList.toggle('is-open');
    $('filters-toggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('#filter-panel')) closeFilters();
  });
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
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeFilters(); closeDetail(true); } });
  window.addEventListener('resize', () => requestAnimationFrame(() => {
    map?.resize();
  }));
  window.addEventListener('popstate', () => {
    const restored = initialSelection(data, new URLSearchParams(location.search), new Date(), readSavedPreferences());
    const cityChanged = restored.city !== state.city;
    closeDetail(false, false);
    $('app').classList.remove('sheet-open');
    $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
    state = restored;
    $('city').value = state.city; $('search').value = state.query; $('optional').checked = state.optional;
    updateDays(); refresh(false, cityChanged); changeView(state.view, false);
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
  $('food-type').innerHTML = `<option value="">Alla typer av mat (${count})</option>` + (state.foodType === 'all' ? `<option value="all">Alla typer av mat (${count})</option>` : '') + foodOptions(places, state.city).map(o => `<option value="${o.id}">${esc(o.label)} (${o.count})</option>`).join('');
  $('food-type').value = state.foodType || '';
  $('food-type').disabled = !state.categories.includes('food');
  document.querySelector('.food-filter').classList.toggle('is-active', Boolean(state.foodType));
  const cafeCount = places.filter(p => p.city === state.city && p.category === 'cafe').length;
  $('cafe-type').innerHTML = `<option value="">Alla kaféer (${cafeCount})</option>` + cafeOptions(places, state.city).map(o => `<option value="${o.id}">${esc(o.label)} (${o.count})</option>`).join('');
  $('cafe-type').value = state.cafeType || '';
  $('cafe-type').disabled = !state.categories.includes('cafe');
}

function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.set('city', state.city); url.searchParams.set('view', state.view);
  if (state.autoCity) url.searchParams.set('autocity', '1'); else url.searchParams.delete('autocity');
  if (state.view === 'map') url.searchParams.delete('day'); else url.searchParams.set('day', state.day);
  if (state.selected) url.searchParams.set('place', state.selected); else url.searchParams.delete('place');
  url.searchParams.set('food', state.foodType);
  url.searchParams.set('cafe', state.cafeType || '');
  url.searchParams.set('categories', state.categories.join(','));
  url.searchParams.set('optional', state.optional ? '1' : '0');
  url.hash = '';
  history.replaceState(null, '', url);
  savePreferences();
}

function refresh(clear = true, refit = false) {
  if (clear) closeDetail();
  if (state.view === 'map') state.day = '';
  $('optional').checked = state.optional;
  updateFoodOptions();
  matching = filterPlaces(places, state);
  $('list-title').textContent = data.cities.find(c => c.id === state.city).name;
  $('list-count').textContent = matching.length + (matching.length === 1 ? ' plats' : ' platser') + (state.day ? ' · även alternativ utan fast dag' : '');
  $('clear-search').hidden = !state.query;
  document.querySelectorAll('[data-category]').forEach(b => {
    b.checked = state.categories.includes(b.dataset.category);
  });
  $('filters-summary').textContent = 'Filter · ' + state.categories.length + ' valda';
  $('optional').disabled = !state.categories.includes('activity');
  $('place-list').innerHTML = matching.length ? groupMapPlaces(matching).map(group => `<section class="map-place-group" data-group="${group.id}" aria-labelledby="group-${group.id}"><h3 id="group-${group.id}">${group.title}</h3>${group.places.map(p => `<button class="place-row" data-place="${esc(p.id)}" aria-pressed="${state.selected === p.id}">${badge(p)}<span class="row-text"><span class="row-title">${esc(p.name)}</span><span class="row-meta">${esc(p.area)}${p.category === 'food' ? ' · ' + esc((p.food_tags || []).map(tag => foodTypeLabel(tag, p.city)).join(' / ')) : p.category === 'cafe' ? ' · ' + esc((p.cafe_tags || []).map(tag => CAFE_TYPES[tag]).join(' / ')) : ''} · ${esc(placeType(p))}</span></span><span class="row-chevron" aria-hidden="true">›</span></button>`).join('')}</section>`).join('') : '<div class="empty-state">Inga platser matchar ditt val.<br>Prova en annan sökning eller kategori.<br><button class="text-button" id="reset-filters">Visa alla platser i staden</button></div>';
  $('place-list').querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => selectPlace(b.dataset.place, b)));
  $('reset-filters')?.addEventListener('click', () => { state.day = ''; state.query = ''; state.foodType = ''; state.cafeType = ''; state.categories = Object.keys(CATEGORIES); state.optional = true; $('search').value = ''; $('optional').checked = true; updateDays(); refresh(); });
  renderPlan(); renderMarkers(); if (refit) fitMap(); updateUrl();
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
    state.day = ''; updateDays();
    if (previous !== view) refresh(false);
    requestAnimationFrame(() => { map?.resize(); if (cameraCity !== state.city) fitMap(); }); startMap();
  }
  if (view === 'details') showDetails();
  if (update) updateUrl();
}

function foodBadges(p) {
  if (p.category === 'cafe') return `<div class="food-badges cafe-badges">${(p.cafe_tags || []).map(tag => `<span>${esc(CAFE_TYPES[tag])}</span>`).join('')}</div>`;
  return p.category === 'food' ? `<div class="food-badges">${(p.food_tags || []).map(tag => `<span>${esc(foodTypeLabel(tag, p.city))}</span>`).join('')}</div>` : '';
}

function photoGallery(p) {
  const photos = (p.photos || []).filter(photo => safeLink(photo.src)?.startsWith('https:') && safeLink(photo.source));
  const origins = [...new Set(photos.map(photo => { try { return new URL(photo.src).origin; } catch { return ''; } }).filter(Boolean))];
  for (const origin of origins) {
    if (![...document.head.querySelectorAll('link[rel="preconnect"]')].some(link => link.href === origin || link.href === origin + '/')) {
      const link = document.createElement('link'); link.rel = 'preconnect'; link.href = origin; link.crossOrigin = 'anonymous'; document.head.append(link);
    }
  }
  const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  return `<section class="place-photos" aria-label="Bilder på platsen">
    <div class="photo-heading"><strong>Bilder <span class="photo-total">(${photos.length})</span></strong>${photos.length > 1 ? '<div class="photo-buttons"><button class="photo-prev" aria-label="Föregående bild">‹</button><button class="photo-next" aria-label="Nästa bild">›</button></div>' : ''}</div>
    <div class="photo-strip" tabindex="0" aria-label="Platsens bilder – svep för fler">${photos.map((photo, i) => `<figure class="place-photo"><a href="${esc(safeLink(photo.original_src) || photo.src)}" target="_blank" rel="noopener noreferrer" aria-label="Öppna stor bild: ${esc(photo.alt)}"><img src="${i ? placeholder : esc(photo.src)}"${i ? ` data-src="${esc(photo.src)}"` : ''} alt="${esc(photo.alt)}" width="${Number(photo.width) || 720}" height="${Number(photo.height) || 480}" decoding="async" referrerpolicy="no-referrer" loading="${i ? 'lazy' : 'eager'}" fetchpriority="${i ? 'low' : 'high'}"></a><figcaption>${external(photo.source, esc(photo.credit))}</figcaption></figure>`).join('')}</div>
    <p class="photo-fallback"${photos.length ? ' hidden' : ''}>Bilder visas inte här just nu. ${external(googleMapsUrl(p), 'Se platsens bilder i Google Maps ↗')}</p>
  </section>`;
}

function recommendation(p) {
  if (!p.recommendation_sv) return '';
  const articles = (p.article_sources || []).filter(s => safeLink(s.url));
  return `<section class="place-recommendation"><h3>Vårt tips</h3><p>${esc(p.recommendation_sv)}</p>${articles.length ? `<div class="article-links">${articles.map(s => external(s.url, esc(s.title) + ' ↗')).join('')}</div>` : ''}</section>`;
}

function bindPhotos() {
  const gallery = $('place-detail').querySelector('.place-photos');
  const strip = gallery.querySelector('.photo-strip');
  const visible = () => [...strip.querySelectorAll('figure')].filter(f => !f.hidden);
  const currentIndex = () => {
    const left = strip.getBoundingClientRect().left;
    const figures = visible();
    return figures.reduce((best, f, i) => Math.abs(f.getBoundingClientRect().left - left) < Math.abs(figures[best].getBoundingClientRect().left - left) ? i : best, 0);
  };
  const loadImage = img => {
    if (!img?.dataset.src) return;
    img.src = img.dataset.src;
    delete img.dataset.src;
  };
  const update = () => {
    const figures = visible(), index = currentIndex();
    gallery.querySelector('.photo-total').textContent = `(${figures.length})`;
    if (gallery.querySelector('.photo-prev')) {
      gallery.querySelector('.photo-prev').disabled = index === 0;
      gallery.querySelector('.photo-next').disabled = index >= figures.length - 1;
    }
    gallery.querySelector('.photo-fallback').hidden = figures.length > 0;
  };
  const step = direction => {
    const figures = visible(), target = figures[Math.max(0, Math.min(figures.length - 1, currentIndex() + direction))];
    if (target) {
      loadImage(target.querySelector('img'));
      strip.scrollBy({ left: target.getBoundingClientRect().left - strip.getBoundingClientRect().left, behavior: reduced() ? 'instant' : 'smooth' });
    }
  };
  gallery.querySelector('.photo-prev')?.addEventListener('click', () => step(-1));
  gallery.querySelector('.photo-next')?.addEventListener('click', () => step(1));
  strip.addEventListener('scroll', update, { passive: true });
  strip.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
  });
  gallery.querySelectorAll('img').forEach(img => {
    const failed = () => { img.closest('figure').hidden = true; update(); };
    img.addEventListener('error', failed, { once: true });
    if (img.complete && !img.naturalWidth) failed();
  });
  const deferred = [...strip.querySelectorAll('img[data-src]')];
  const loadVisible = () => {
    const bounds = strip.getBoundingClientRect();
    deferred.forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.left < bounds.right && rect.right > bounds.left) loadImage(img);
    });
  };
  // Do not let the browser's lazy-load heuristics fetch the next card merely
  // because a few pixels peek into the horizontal strip. Load it when the
  // visitor actually scrolls/swipes there (or presses the next button).
  strip.addEventListener('scroll', loadVisible, { passive: true });
  requestAnimationFrame(update);
}

function selectPlace(id, origin) {
  const p = places.find(p => p.id === id); if (!p) return;
  map?.stop();
  closeFilters();
  detailOrigin = origin || document.activeElement; state.selected = id;
  if (state.view !== 'map') changeView('map');
  const city = data.cities.find(c => c.id === p.city);
  const sourceLinks = (p.source_urls || []).map(safeLink).filter(Boolean);
  $('place-detail').innerHTML = `<button class="detail-close" id="close-detail" aria-label="Stäng platsdetaljer">×</button><div class="detail-top">${badge(p)}<div><h2 id="detail-title" tabindex="-1">${esc(p.name)}</h2><p class="detail-meta">${esc(placeType(p))} · ${esc(p.area)}<br>${dayText(p.date)}${p.status === 'Valfritt' ? ' · valfritt alternativ' : p.status === 'Boende' ? ' · ert boende' : ''}</p></div></div>${external(googleMapsUrl(p), icon('map') + 'Öppna Google Maps', 'primary-button')}<p class="detail-footnote">Välj Vägbeskrivning i Google Maps när ni vill ta er hit.</p>${photoGallery(p)}${foodBadges(p)}<p class="detail-description">${esc(p.description_sv)}</p>${recommendation(p)}<p class="detail-address">${esc(p.address)}</p><details class="detail-sources"><summary>Platsnotering och källor</summary><p>${esc(p.location_note || 'Kartpunkten visar platsens ungefärliga läge. Kontrollera rätt entré på plats.')}</p>${sourceLinks.map((u, i) => external(u, 'Källa ' + (i + 1))).join('')}<p>${esc(city.name)} · uppgifter från reseplanen. En markering är inte en bokning.</p></details>`;
  const closeBar = document.createElement('div');
  closeBar.className = 'detail-close-bar';
  const closeButton = $('close-detail');
  closeButton.before(closeBar); closeBar.append(closeButton);
  bindPhotos();
  $('place-detail').hidden = false; $('app').classList.add('has-selection'); $('app').classList.remove('sheet-open');
  $('sheet-toggle').textContent = 'Visa lista ↑'; $('sheet-toggle').setAttribute('aria-expanded', 'false');
  $('close-detail').addEventListener('click', () => closeDetail(true));
  document.querySelectorAll('[data-place]').forEach(e => e.setAttribute('aria-pressed', String(e.dataset.place === id)));
  requestAnimationFrame(() => {
    if (state.selected !== id || $('place-detail').hidden) return;
    // A marker click leaves the camera exactly where the visitor put it.
    // List/day-plan selections may reveal an off-screen place at the same zoom.
    if (!origin?.classList.contains('pin')) focusPlace(p);
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
  if (restore) map?.stop();
  if (update) updateUrl();
}

function renderPlan() {
  const city = data.cities.find(c => c.id === state.city);
  const days = state.day ? [state.day] : daysForCity(data, state.city);
  const planned = planPlaces(places, state);
  function planPlace(p) {
    return `<article class="plan-place" data-plan-place="${esc(p.id)}">${badge(p)}<div><h4>${esc(p.name)}</h4><p>${esc(p.description_sv)}</p><div class="actions"><button data-show-place="${esc(p.id)}">Visa på kartan</button>${external(googleMapsUrl(p), 'Google Maps ↗')}</div></div></article>`;
  }
  let html = `<header class="plan-header"><span class="eyebrow">Aktiviteter i reseordning</span><h2>${esc(city.name)}${state.day ? ' · ' + dayText(state.day) : ''}</h2><p>Här visas bara planeringen och aktiviteterna – mat, kaféer och sötsaker hittar ni under Karta. <strong>3.1</strong> betyder 3 oktober, aktivitet 1. <strong>3.V1</strong> är ett valfritt stopp den dagen; <strong>V1</strong> saknar fast datum. Bokade tider i era biljetter gäller alltid.</p></header>`;
  if (city.intro) html += `<div class="notice">${esc(city.intro)}</div>`;
  if (!planned.length && !days.some(d => city.notes?.[d])) html += '<p class="empty-state">Inga planerade aktiviteter den här dagen.</p>';
  for (const day of days) {
    const stops = planned.filter(p => p.date === day);
    if (!stops.length && !city.notes?.[day] && !state.day) continue;
    html += `<section class="plan-day"><div class="plan-day-title"><h3>${dayText(day, true)}</h3><button class="text-button" data-map-day="${day}">Visa stadens karta</button></div>`;
    if (city.notes?.[day]) html += `<div class="notice">${esc(city.notes[day])}</div>`;
    const groups = [ ['Dagens ordning', p => p.status !== 'Valfritt'], ['Valfria aktiviteter · om ni har tid och lust', p => p.status === 'Valfritt'] ];
    for (const [heading, check] of groups) { const group = stops.filter(check); if (group.length) html += `<h4 class="plan-section-title">${heading}</h4>` + group.map(planPlace).join(''); }
    if (!stops.length) html += '<p class="row-meta">Inga extra stopp med de valda filtren den här dagen.</p>';
    html += '</section>';
  }
  const flexible = planned.filter(p => !p.date);
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
    map = new lib.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', center: [first.lon, first.lat], zoom: 11, attributionControl: false, renderWorldCopies: false, localIdeographFontFamily: false,
      locale: { 'NavigationControl.ResetBearing': 'Återställ kartan mot norr', 'NavigationControl.ZoomIn': 'Zooma in', 'NavigationControl.ZoomOut': 'Zooma ut' } });
    // Keep wheel/trackpad zoom and the release momentum gentle enough for a
    // travel map. MapLibre's defaults are tuned for a desktop map with more
    // room; this page also has list and detail overlays around the canvas.
    map.scrollZoom.setWheelZoomRate(1 / 600);
    map.scrollZoom.setZoomRate(1 / 150);
    map.touchZoomRotate.setZoomRate(0.75);
    map.touchZoomRotate.setZoomThreshold(0.2);
    map.dragPan.enable({ linearity: 0.12, maxSpeed: 1100, deceleration: 3000 });
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.addControl(new lib.AttributionControl({ compact: false }), 'bottom-left');
    map.addControl(new lib.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
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
    button.className = 'pin' + (isOptionalActivity(p) ? ' optional' : '') + (isLodging(p) ? ' lodging' : '') + (isTransport(p) ? ' transport' : '') + (p.label.length > 4 ? ' long-label' : '');
    button.style.setProperty('--cat', CATEGORIES[p.category].color);
    button.dataset.place = p.id; button.setAttribute('aria-label', (isLodging(p) ? 'Boende' : isTransport(p) ? transportLabel(p) : p.label) + '. ' + p.name); button.setAttribute('aria-pressed', String(state.selected === p.id));
    button.innerHTML = isLodging(p) ? lodgingMarker : isTransport(p) ? transportMarker(p) : `<span class="pin-shape"><span class="pin-label">${esc(p.label)}</span></span>`;
    button.addEventListener('click', event => { event.stopPropagation(); selectPlace(p.id, button); });
    button.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); });
    // MapLibre also recognizes double taps before the synthesized click.
    for (const type of ['touchstart', 'touchend']) button.addEventListener(type, event => event.stopPropagation(), { passive: true });
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

function focusPlace(p) {
  if (!map || state.view !== 'map') return;
  const padding = cameraPadding(true);
  map.easeTo({ center: [p.lon, p.lat], zoom: map.getZoom(),
    offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2], duration: 0 });
}

function fitMap() {
  if (!map || state.view !== 'map') return;
  map.resize();
  if ($('map').clientWidth < 160 || $('map').clientHeight < 160) return;
  // Only explicit overview/city changes fit the camera to the visible places.
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  const points = matching.length ? matching : places.filter(p => p.city === state.city);
  if (!points.length) return;
  const bounds = new window.maplibregl.LngLatBounds(); points.forEach(p => bounds.extend([p.lon, p.lat]));
  map.fitBounds(bounds, { padding: cameraPadding(), maxZoom: 14, duration: reduced() ? 0 : 300 });
  cameraCity = state.city;
}

async function boot() {
  const sets = await Promise.all(config.datasets.map(readDataset));
  data = validateData({ schema: 1, cities: sets.flatMap(s => s.cities), places: sets.flatMap(s => s.places), updatedAt: sets.map(s => s.updatedAt).sort().at(-1) });
  places = numberPlaces(data.places);
  savedPreferences = readSavedPreferences();
  state = initialSelection(data, new URLSearchParams(location.search), new Date(), savedPreferences);
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
