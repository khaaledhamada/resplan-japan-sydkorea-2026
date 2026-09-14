// Shared, DOM-free rules for both the map and the day plan.
export const CATEGORIES = {
  activity: { name: 'Aktiviteter', singular: 'Aktivitet', color: '#1a73e8' },
  food: { name: 'Mat', singular: 'Restaurang', color: '#c4443f' },
  sweet: { name: 'Sötsaker', singular: 'Sötsaker & fika', color: '#8657b0' },
};

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
        typeof p.description_sv !== 'string' || typeof p.address !== 'string') throw Error('Ogiltig plats: ' + p.id);
    ids.add(p.id);
  }
  return data;
}

export function orderedPlaces(places) {
  const categoryOrder = { activity: 0, food: 1, sweet: 2 };
  return [...places].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.sequence - b.sequence || categoryOrder[a.category] - categoryOrder[b.category] || a.name.localeCompare(b.name, 'sv'));
}

export function numberPlaces(places) {
  const counters = {};
  return orderedPlaces(places).map(p => {
    const prefix = p.category === 'food' ? 'M' : p.category === 'sweet' ? 'S' : p.status === 'Valfritt' ? 'V' : '';
    const key = p.city + ':' + prefix;
    counters[key] = (counters[key] || 0) + 1;
    return { ...p, label: prefix + String(counters[key]).padStart(2, '0') };
  });
}

export function fold(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv');
}

export function filterPlaces(places, state) {
  const query = fold(state.query || '');
  return places.filter(p => p.city === state.city && (!state.day || !p.date || p.date === state.day) &&
    state.categories.includes(p.category) && (state.optional || p.category !== 'activity' || p.status !== 'Valfritt') &&
    (!query || fold([p.name, p.area, p.address, p.description_sv, p.label].join(' ')).includes(query)));
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
  const day = params.has('day') ? (days.includes(requestedDay) ? requestedDay : '') : (days.includes(localDay(city)) ? localDay(city) : days[0] || '');
  return { city: city.id, day, query: '', categories: Object.keys(CATEGORIES), optional: true, view: ['map', 'plan', 'details'].includes(params.get('view')) ? params.get('view') : 'map', selected: params.get('place') || null };
}

export function navigationUrl(p) {
  // Search by name/address preserves venue identity; coordinates remain the map's location fallback.
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.name.split(' – ')[0] + ', ' + p.address);
}

export function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
