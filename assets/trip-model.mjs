// Shared, DOM-free rules for both the map and the day plan.
export const CATEGORIES = {
  activity: { name: 'Aktiviteter', singular: 'Aktivitet', color: '#1a73e8' },
  food: { name: 'Mat', singular: 'Restaurang', color: '#c4443f' },
  cafe: { name: 'Kaféer', singular: 'Kafé', color: '#8b5e34' },
  sweet: { name: 'Sötsaker', singular: 'Sötsaker & fika', color: '#8657b0' },
};

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
        (p.food_tags !== undefined && (!Array.isArray(p.food_tags) || p.category !== 'food' || !p.food_tags.length || new Set(p.food_tags).size !== p.food_tags.length || p.food_tags.some(tag => !Object.hasOwn(FOOD_TYPES, tag)))) ||
        (p.photos !== undefined && (!Array.isArray(p.photos) || p.photos.some(photo => !photo || !safeLink(photo.src)?.startsWith('https:') || !safeLink(photo.source) || typeof photo.alt !== 'string' || typeof photo.credit !== 'string')))) throw Error('Ogiltig plats: ' + p.id);
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
    (!query || fold([p.name, p.area, p.address, p.description_sv, p.label, ...(p.food_tags || []).map(tag => foodTypeLabel(tag, p.city))].join(' ')).includes(query)));
}

export function daysForCity(data, city) {
  const c = data.cities.find(c => c.id === city);
  return [...new Set([...data.places.filter(p => p.city === city).map(p => p.date).filter(Boolean), ...Object.keys(c?.notes || {})])].sort();
}

export function dayText(day, weekday = false) {
  if (!day) return 'Valfri dag';
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', ...(weekday ? { weekday: 'long' } : {}), timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
}

export function initialSelection(data, params, now = new Date()) {
  let city = data.cities.find(c => c.id === params.get('city'));
  const localDay = c => new Intl.DateTimeFormat('sv-SE', { timeZone: c.id === 'seoul' ? 'Asia/Seoul' : 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  // Fuji is a Tokyo day trip; select its dedicated map on the excursion day.
  if (!city) city = [...data.cities].reverse().find(c => daysForCity(data, c.id).includes(localDay(c))) || data.cities[0];
  const days = daysForCity(data, city.id), requestedDay = params.get('day');
  const view = ['map', 'plan', 'details'].includes(params.get('view')) ? params.get('view') : 'map';
  // The city map always includes every day, including links made before that change.
  const day = view === 'map' ? '' : params.has('day') ? (days.includes(requestedDay) ? requestedDay : '') : (days.includes(localDay(city)) ? localDay(city) : days[0] || '');
  const requestedFood = params.get('food');
  const foodType = requestedFood === 'all' || foodOptions(data.places, city.id).some(o => o.id === requestedFood) ? requestedFood : '';
  const requestedCategories = params.has('categories') ? params.get('categories').split(',').filter(c => Object.hasOwn(CATEGORIES, c)) : null;
  const categories = requestedCategories || (foodType ? ['food'] : Object.keys(CATEGORIES));
  return { city: city.id, day, query: '', categories, foodType: categories.includes('food') ? foodType : '', optional: true, view, selected: params.get('place') || null };
}

export function googleMapsUrl(p) {
  // Search by name/address preserves venue identity; coordinates remain the map's location fallback.
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name.split(' – ')[0] + ', ' + p.address);
}

export function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
