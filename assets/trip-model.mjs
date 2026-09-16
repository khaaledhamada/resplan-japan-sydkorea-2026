// Shared, DOM-free rules for both the map and the day plan.
export const CATEGORIES = {
  activity: { name: 'Aktiviteter', singular: 'Aktivitet', color: '#1a73e8' },
  food: { name: 'Mat', singular: 'Restaurang', color: '#c4443f' },
  cafe: { name: 'Kaféer', singular: 'Kafé', color: '#8b5e34' },
  sweet: { name: 'Sötsaker', singular: 'Sötsaker & fika', color: '#8657b0' },
};

export const CAFE_TYPES = { matcha: 'Matcha', tea: 'Te', coffee: 'Kaffe', bakery: 'Bagerikafé' };
export function cafeOptions(places, city) {
  return Object.entries(CAFE_TYPES).map(([id, label]) => ({id, label, count: places.filter(p => p.city === city && p.category === 'cafe' && p.cafe_tags?.includes(id)).length})).filter(o => o.count);
}

export const FOOD_TYPES = {
  sushi: 'Sushi', ramen: 'Ramen', meat: 'Kött', bbq: 'Grillat / yakiniku',
  noodles: 'Soba & andra nudlar', dumplings: 'Gyoza', streetfood: 'Gatumat',
  seafood: 'Fisk & skaldjur', japanese: 'Japanskt & kaiseki', soup: 'Soppor',
  bibimbap: 'Bibimbap', tofu: 'Tofu', curry: 'Japansk curry',
  tonkatsu: 'Tonkatsu', okonomiyaki: 'Okonomiyaki',
};
export function foodTypeLabel(type, city) {
  const korean = { bbq: 'Koreansk BBQ', noodles: 'Nudlar / kalguksu', dumplings: 'Mandu', soup: 'Soppor / gukbap' };
  return (city === 'seoul' && korean[type]) || FOOD_TYPES[type] || '';
}
export function foodOptions(places, city) {
  const priority = city === 'seoul'
    ? ['bbq', 'meat', 'soup', 'noodles', 'dumplings', 'bibimbap', 'streetfood', 'seafood']
    : ['sushi', 'ramen', 'meat', 'bbq', 'tonkatsu', 'noodles', 'dumplings', 'seafood', 'streetfood', 'okonomiyaki', 'tofu', 'curry', 'japanese'];
  return [...new Set([...priority, ...Object.keys(FOOD_TYPES)])].map(id => ({
    id, label: foodTypeLabel(id, city), count: places.filter(p => p.city === city && p.category === 'food' && p.food_tags?.includes(id)).length,
  })).filter(option => option.count);
}

export function validateData(data) {
  const validDay = day => /^2026-10-(0[1-9]|[12]\d|3[01])$/.test(day);
  if (data.schema !== 1 || !Array.isArray(data.cities) || !data.cities.length || !Array.isArray(data.places) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) throw Error('Ogiltigt dataformat');
  const cityIds = new Set();
  for (const c of data.cities) {
    if (!/^[a-z][a-z0-9-]*$/.test(c.id) || cityIds.has(c.id) || typeof c.name !== 'string' || !c.name.trim() ||
      (c.notes && (typeof c.notes !== 'object' || Array.isArray(c.notes) || Object.entries(c.notes).some(([day, note]) => !validDay(day) || typeof note !== 'string')))) throw Error('Ogiltig stad');
    cityIds.add(c.id);
  }
  const cities = new Set(data.cities.map(c => c.id)), ids = new Set();
  for (const p of data.places) {
    if (!p.id || ids.has(p.id) || !cities.has(p.city) || !CATEGORIES[p.category] ||
        !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180 ||
        typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.sequence) ||
        typeof p.date !== 'string' || (p.date && !validDay(p.date)) ||
        typeof p.description_sv !== 'string' || typeof p.address !== 'string' ||
        (p.recommendation_sv !== undefined && typeof p.recommendation_sv !== 'string') ||
        (p.article_sources !== undefined && (!Array.isArray(p.article_sources) || p.article_sources.some(s => !s || typeof s.title !== 'string' || !s.title.trim() || !safeLink(s.url)?.startsWith('https:')))) ||
        (p.cafe_tags !== undefined && (!Array.isArray(p.cafe_tags) || p.category !== 'cafe' || !p.cafe_tags.length || new Set(p.cafe_tags).size !== p.cafe_tags.length || p.cafe_tags.some(tag => !Object.hasOwn(CAFE_TYPES, tag)))) ||
        (p.food_tags !== undefined && (!Array.isArray(p.food_tags) || p.category !== 'food' || !p.food_tags.length || new Set(p.food_tags).size !== p.food_tags.length || p.food_tags.some(tag => !Object.hasOwn(FOOD_TYPES, tag)))) ||
        (p.photos !== undefined && (!Array.isArray(p.photos) || p.photos.some(photo => !photo || !safeLink(photo.src)?.startsWith('https:') || !safeLink(photo.source) || typeof photo.alt !== 'string' || typeof photo.credit !== 'string' || (photo.original_src !== undefined && !safeLink(photo.original_src)?.startsWith('https:')) || ['width', 'height'].some(key => photo[key] !== undefined && (!Number.isInteger(photo[key]) || photo[key] < 1 || photo[key] > 10000)))))) throw Error('Ogiltig plats: ' + p.id);
    ids.add(p.id);
  }
  return data;
}

export function orderedPlaces(places) {
  const categoryOrder = { activity: 0, food: 1, cafe: 2, sweet: 3 };
  return [...places].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.sequence - b.sequence || categoryOrder[a.category] - categoryOrder[b.category] || a.name.localeCompare(b.name, 'sv'));
}

export function numberPlaces(places) {
  const counters = {};
  return orderedPlaces(places).map(p => {
    if (p.status === 'Boende' || p.status === 'Transport') return { ...p, label: '' };
    const prefix = p.category === 'food' ? 'M' : p.category === 'cafe' ? 'K' : p.category === 'sweet' ? 'S' : p.status === 'Valfritt' ? 'V' : '';
    const dated = p.category === 'activity' && p.date;
    const key = p.city + ':' + prefix + (dated ? ':' + p.date : '');
    counters[key] = (counters[key] || 0) + 1;
    return { ...p, label: (dated ? Number(p.date.slice(-2)) + '.' : '') + prefix + counters[key] };
  });
}

export function groupMapPlaces(places) {
  const ordered = orderedPlaces(places).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'sv', { numeric: true }));
  return [
    { id: 'activity', title: 'Aktiviteter', matches: p => p.category === 'activity' && p.status !== 'Valfritt' },
    { id: 'optional', title: 'Valfria aktiviteter', matches: p => p.category === 'activity' && p.status === 'Valfritt' },
    { id: 'food', title: 'Mat', matches: p => p.category === 'food' },
    { id: 'cafe', title: 'Kaféer', matches: p => p.category === 'cafe' },
    { id: 'sweet', title: 'Sötsaker', matches: p => p.category === 'sweet' },
  ].map(({ id, title, matches }) => ({ id, title, places: ordered.filter(matches) })).filter(group => group.places.length);
}

export function fold(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv');
}

export function filterPlaces(places, state) {
  const query = fold(state.query || '');
  return places.filter(p => p.city === state.city && (!state.day || !p.date || p.date === state.day) &&
    state.categories.includes(p.category) && (state.optional || p.category !== 'activity' || p.status !== 'Valfritt') &&
    (p.category !== 'food' || !state.foodType || state.foodType === 'all' || p.food_tags?.includes(state.foodType)) &&
    (p.category !== 'cafe' || !state.cafeType || p.cafe_tags?.includes(state.cafeType)) &&
    (!query || fold([p.name, p.area, p.address, p.description_sv, p.recommendation_sv, p.label, ...(p.food_tags || []).map(tag => foodTypeLabel(tag, p.city)), ...(p.cafe_tags || []).map(tag => CAFE_TYPES[tag])].join(' ')).includes(query)));
}

// Dagsplan is deliberately an activity-only view.  Restaurants, cafés and
// sweets stay discoverable on Karta, where the category and food filters live.
export function planPlaces(places, state) {
  return places.filter(p => p.city === state.city && p.category === 'activity' &&
    (!state.day || !p.date || p.date === state.day) &&
    (state.optional || p.status !== 'Valfritt'));
}

export function daysForCity(data, city) {
  const c = data.cities.find(c => c.id === city);
  return [...new Set([...data.places.filter(p => p.city === city).map(p => p.date).filter(Boolean), ...Object.keys(c?.notes || {})])].sort();
}

// The itinerary has a few dates where more than one city contains a note
// (arrival, excursion or transfer).  Keep the normal city picker as the
// explicit override, but make the first visit to the root URL land on the
// city that matches the current local travel date.  Transfer day 17 October
// changes city after the planned Kyoto departure around 14:00 (Japan time).
const DATE_CITY_OVERRIDES = {
  '2026-10-07': 'tokyo',
  '2026-10-11': 'tokyo',
  '2026-10-12': 'hakone',
  '2026-10-13': 'hakone',
  '2026-10-14': 'kyoto',
};

function dateParts(now, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function cityForDate(data, now = new Date()) {
  const tokyoParts = dateParts(now, 'Asia/Tokyo');
  const tokyoDay = `${tokyoParts.year}-${tokyoParts.month}-${tokyoParts.day}`;
  const candidates = data.cities.filter(c => {
    const local = dateParts(now, c.id === 'seoul' ? 'Asia/Seoul' : 'Asia/Tokyo');
    return daysForCity(data, c.id).includes(`${local.year}-${local.month}-${local.day}`);
  });
  if (!candidates.length) return null;
  const byId = new Map(candidates.map(c => [c.id, c]));
  if (tokyoDay === '2026-10-17') {
    const transferCity = Number(tokyoParts.hour) >= 14 ? 'osaka' : 'kyoto';
    if (byId.has(transferCity)) return byId.get(transferCity);
  }
  const override = DATE_CITY_OVERRIDES[tokyoDay];
  if (override && byId.has(override)) return byId.get(override);
  const routeOrder = ['seoul', 'tokyo', 'fuji', 'hakone', 'kyoto', 'osaka'];
  return candidates.slice().sort((a, b) => routeOrder.indexOf(a.id) - routeOrder.indexOf(b.id))[0];
}

export function dayText(day, weekday = false) {
  if (!day) return 'Valfri dag';
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', ...(weekday ? { weekday: 'long' } : {}), timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
}

export function parsePreferences(value) {
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value;
    if (!p || p.version !== 1) return {};
    const categories = Array.isArray(p.categories) && p.categories.every(c => Object.hasOwn(CATEGORIES, c)) ? [...new Set(p.categories)] : undefined;
    const cityFilters = Object.fromEntries(Object.entries(p.cityFilters || {}).filter(([id, f]) => /^[a-z][a-z0-9-]*$/.test(id) && f && typeof f === 'object').map(([id, f]) => [id, {
      foodType: typeof f.foodType === 'string' ? f.foodType : '', cafeType: typeof f.cafeType === 'string' ? f.cafeType : '', day: typeof f.day === 'string' ? f.day : undefined,
    }]));
    return { version: 1, city: typeof p.city === 'string' ? p.city : undefined, view: ['map', 'plan', 'details'].includes(p.view) ? p.view : undefined, categories, optional: typeof p.optional === 'boolean' ? p.optional : undefined, cityFilters };
  } catch { return {}; }
}

export function selectionPreferences(previous, state) {
  const saved = parsePreferences(previous);
  return { version: 1, city: state.city, view: state.view, categories: [...state.categories], optional: state.optional,
    cityFilters: { ...saved.cityFilters, [state.city]: { foodType: state.foodType, cafeType: state.cafeType || '', day: state.view === 'plan' ? state.day : saved.cityFilters?.[state.city]?.day } } };
}

export function initialSelection(data, params, now = new Date(), preferences = {}) {
  const saved = parsePreferences(preferences);
  // Stable place links keep working when an excursion moves to another city.
  const linkedPlace = data.places.find(p => p.id === params.get('place'));
  // `autocity=1` is written by the app after an automatic selection.  It lets
  // a bookmarked URL recalculate tomorrow's city instead of freezing the city
  // that happened to be active when the bookmark was created.  A normal city
  // query remains an explicit manual/shared-link choice.
  const autoCityParam = params.get('autocity') === '1';
  const explicitCity = linkedPlace?.city || (!autoCityParam && params.get('city'));
  const autoEligible = !linkedPlace && (!params.has('city') || autoCityParam);
  let city = data.cities.find(c => c.id === explicitCity);
  let automaticCity = autoEligible;
  // A URL city/place is intentional.  Otherwise the current travel date wins
  // over a stale saved city, so the page follows the itinerary on a new day.
  if (!city && (!params.has('city') || autoCityParam)) {
    const datedCity = cityForDate(data, now);
    if (datedCity) city = datedCity;
  }
  if (!city) city = data.cities.find(c => c.id === saved.city);
  if (!city) {
    const datedCity = cityForDate(data, now);
    if (datedCity) city = datedCity;
  }
  if (!city) city = data.cities[0];
  const localDay = c => {
    const parts = dateParts(now, c.id === 'seoul' ? 'Asia/Seoul' : 'Asia/Tokyo');
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const cityFilter = saved.cityFilters?.[city.id] || {};
  const days = daysForCity(data, city.id), requestedDay = params.get('day');
  const view = ['map', 'plan', 'details'].includes(params.get('view')) ? params.get('view') : params.has('view') || linkedPlace ? 'map' : saved.view || 'map';
  // The city map always includes every day, including links made before that change.
  const day = view === 'map' ? '' : params.has('day') ? (days.includes(requestedDay) ? requestedDay : '') : cityFilter.day === '' || days.includes(cityFilter.day) ? cityFilter.day : (days.includes(localDay(city)) ? localDay(city) : days[0] || '');
  const requestedFood = params.has('food') ? params.get('food') : cityFilter.foodType;
  let foodType = requestedFood === 'all' || foodOptions(data.places, city.id).some(o => o.id === requestedFood) ? requestedFood : '';
  const requestedCafe = params.has('cafe') ? params.get('cafe') : cityFilter.cafeType;
  let cafeType = cafeOptions(data.places, city.id).some(o => o.id === requestedCafe) ? requestedCafe : '';
  const requestedCategories = params.has('categories') ? params.get('categories').split(',').filter(c => Object.hasOwn(CATEGORIES, c)) : null;
  const categories = requestedCategories || (params.has('food') && foodType ? ['food'] : params.has('cafe') && cafeType ? ['cafe'] : saved.categories || Object.keys(CATEGORIES));
  let optional = params.has('optional') ? params.get('optional') !== '0' : saved.optional ?? true;
  // Opening a shared place link must not silently hide that place behind saved filters.
  if (linkedPlace) {
    if (!params.has('categories') && !categories.includes(linkedPlace.category)) categories.push(linkedPlace.category);
    if (!params.has('optional') && linkedPlace.status === 'Valfritt') optional = true;
    if (!params.has('cafe') && linkedPlace.category === 'cafe' && !linkedPlace.cafe_tags?.includes(cafeType)) cafeType = '';
    if (!params.has('food') && linkedPlace.category === 'food' && !linkedPlace.food_tags?.includes(foodType)) foodType = '';
  }
  return { city: city.id, day, query: '', categories, foodType, cafeType, optional, view, selected: params.get('place') || null, autoCity: automaticCity };
}

export function googleMapsUrl(p) {
  // Search by name/address preserves venue identity; coordinates remain the map's location fallback.
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name.split(' – ')[0] + ', ' + p.address);
}

export function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
