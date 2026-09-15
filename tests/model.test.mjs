import test from 'node:test';
import assert from 'node:assert/strict';
import { numberPlaces, groupMapPlaces, filterPlaces, initialSelection, foodOptions, foodTypeLabel, googleMapsUrl, validateData, safeLink } from '../assets/trip-model.mjs';
import { encryptText, decryptText } from '../scripts/crypto.mjs';
import { randomBytes } from 'node:crypto';
const place = (id, extra = {}) => ({ id, city: 'tokyo', name: 'Plats ' + id, category: 'activity', date: '2026-10-08', sequence: 1, lat: 35.6, lon: 139.7, description_sv: 'Promenad', address: 'Tokyo, Japan', status: 'Planerat', ...extra });
const base = { schema: 1, updatedAt: '2026-09-14T00:00:00Z', cities: [{ id: 'tokyo', name: 'Tokyo', notes: { '2026-10-12': 'Avresa' } }], places: [] };
test('activity numbering starts with the date and restarts per day, city and optional group', () => {
  const numbered = numberPlaces([
    place('b', { sequence: 2 }), place('a'),
    place('next-day', { date: '2026-10-09' }),
    place('extra', { status: 'Valfritt' }),
    place('extra-next-day', { status: 'Valfritt', date: '2026-10-09' }),
    place('extra-undated', { status: 'Valfritt', date: '' }),
    place('seoul', { city: 'seoul', date: '2026-10-03' }),
    place('seoul-same-date', { city: 'seoul' }),
    place('lunch', { category: 'food' }),
    place('later-lunch', { category: 'food', date: '2026-10-09' }),
    place('cake', { category: 'sweet' }),
  ]);
  assert.deepEqual(Object.fromEntries(numbered.map(p => [p.id, p.label])), {
    seoul: '3.1', a: '8.1', 'seoul-same-date': '8.1', extra: '8.V1', lunch: 'M1', cake: 'S1', b: '8.2',
    'extra-next-day': '9.V1', 'next-day': '9.1', 'later-lunch': 'M2', 'extra-undated': 'V1',
  });
  const state = { city: 'tokyo', day: '', categories: ['activity'], optional: true, query: 'Plats b' };
  assert.equal(filterPlaces(numbered, state)[0].label, '8.2');
  assert.equal(filterPlaces(numbered, { ...state, query: '8.2' })[0].id, 'b');
  assert.deepEqual(filterPlaces(numbered, { ...state, day: '2026-10-09', optional: false, query: '' }).map(p => p.label), ['9.1']);
});
test('date, optional, category and accent-insensitive search combine', () => {
  const places = numberPlaces([place('a', { name: 'Sötsak', category: 'sweet' }), place('b', { date: '' }), place('c', { status: 'Valfritt' }), place('d', { date: '2026-10-09' })]);
  const state = { city: 'tokyo', day: '2026-10-08', categories: ['activity', 'sweet'], optional: false, query: '' };
  assert.deepEqual(filterPlaces(places, state).map(p => p.id), ['a', 'b']);
  assert.deepEqual(filterPlaces(places, { ...state, query: 'sotsak' }).map(p => p.id), ['a']);
  assert.equal(filterPlaces(places, { ...state, categories: [] }).length, 0);
});
test('city map opens all days and includes optional activities, even from an old dated link', () => {
  const data = { ...base, places: [place('a'), place('b', { date: '2026-10-09', status: 'Valfritt' })] };
  for (const query of ['', 'day=2026-10-08&city=tokyo', 'view=map&day=2026-10-08&city=tokyo', 'view=unknown&day=2026-10-08']) {
    const state = initialSelection(data, new URLSearchParams(query), new Date('2026-10-07T22:00:00Z'));
    assert.equal(state.view, 'map');
    assert.equal(state.day, '');
    assert.equal(state.optional, true);
    assert.deepEqual(filterPlaces(data.places, state).map(p => p.id), ['a', 'b']);
  }
});
test('plan day selection respects city timezone and valid explicit links', () => {
  const data = { ...base, places: [place('a')] };
  assert.equal(initialSelection(data, new URLSearchParams('view=plan'), new Date('2026-10-07T22:00:00Z')).day, '2026-10-08');
  assert.equal(initialSelection(data, new URLSearchParams('view=plan&day=&city=tokyo')).day, '');
  assert.equal(initialSelection(data, new URLSearchParams('day=2026-10-12&view=plan')).day, '2026-10-12');
  assert.equal(initialSelection(data, new URLSearchParams('day=2026-10-30&view=plan')).day, '');
});
test('a saved place link follows its new city after an itinerary move', () => {
  const data = { ...base, cities: [...base.cities, { id: 'kyoto', name: 'Kyoto' }], places: [
    place('other'), place('saved-excursion', { city: 'kyoto', date: '2026-10-16', status: 'Valfritt' }),
  ] };
  const state = initialSelection(data, new URLSearchParams('city=tokyo&place=saved-excursion'));
  assert.equal(state.city, 'kyoto');
  assert.equal(state.selected, 'saved-excursion');
  assert.deepEqual(filterPlaces(data.places, state).map(p => p.id), ['saved-excursion']);
  assert.equal(initialSelection(data, new URLSearchParams('city=tokyo&place=missing')).city, 'tokyo');
});
test('map groups put main activities before earlier optional stops and retain numeric order', () => {
  const places = numberPlaces([
    ...Array.from({ length: 12 }, (_, i) => place('main-' + (i + 1), { sequence: i + 1 })),
    place('extra', { status: 'Valfritt', date: '2026-10-07' }),
    place('lunch', { category: 'food', status: 'Valfritt', date: '' }),
    place('cake', { category: 'sweet', status: 'Valfritt', date: '' }),
  ]);
  const originalOrder = places.map(p => p.id);
  const groups = groupMapPlaces([...places].reverse());
  assert.deepEqual(groups.map(g => [g.id, g.title]), [['activity', 'Aktiviteter'], ['optional', 'Valfria aktiviteter'], ['food', 'Mat'], ['sweet', 'Sötsaker']]);
  assert.deepEqual(groups[0].places.map(p => p.label), Array.from({ length: 12 }, (_, i) => '8.' + (i + 1)));
  assert.deepEqual(groups.slice(1).map(g => g.places.map(p => p.label)), [['7.V1'], ['M1'], ['S1']]);
  assert.deepEqual(groupMapPlaces(places.filter(p => p.category === 'food')).map(g => g.id), ['food']);
  assert.deepEqual(groupMapPlaces([]), []);
  assert.deepEqual(places.map(p => p.id), originalOrder);
});
test('map group sorting handles both date and activity numbers numerically', () => {
  const numbered = numberPlaces([
    place('october-10', { date: '2026-10-10' }),
    ...Array.from({ length: 12 }, (_, i) => place('october-3-' + (i + 1), { date: '2026-10-03', sequence: i + 1 })),
    place('optional-10', { date: '2026-10-10', status: 'Valfritt' }),
    place('optional-3', { date: '2026-10-03', status: 'Valfritt' }),
    place('optional-any-day', { date: '', status: 'Valfritt' }),
  ]);
  const groups = groupMapPlaces([...numbered].reverse());
  assert.deepEqual(groups[0].places.map(p => p.label), [...Array.from({ length: 12 }, (_, i) => '3.' + (i + 1)), '10.1']);
  assert.deepEqual(groups[1].places.map(p => p.label), ['3.V1', '10.V1', 'V1']);
  assert.equal(numbered.find(p => p.id === 'october-3-2').label, '3.2');
});
test('hiding optional activities retains optional food and sweets', () => {
  const places = numberPlaces([place('a', { status: 'Valfritt' }), place('b', { category: 'food', status: 'Valfritt' }), place('c', { category: 'sweet', status: 'Valfritt' })]);
  assert.deepEqual(filterPlaces(places, { city: 'tokyo', day: '', query: '', categories: ['activity', 'food', 'sweet'], optional: false }).map(p => p.id), ['b', 'c']);
});
test('invalid coordinates, duplicate identities and unsafe links are rejected', () => {
  assert.throws(() => validateData({ ...base, places: [place('a'), place('a')] }));
  assert.throws(() => validateData({ ...base, places: [place('a', { lat: NaN })] }));
  assert.throws(() => validateData({ ...base, places: [place('a', { date: '2026-10-99' })] }));
  assert.throws(() => validateData({ ...base, updatedAt: null }));
  assert.throws(() => validateData({ ...base, cities: [...base.cities, ...base.cities] }));
  assert.equal(safeLink('javascript:alert(1)'), null);
});
test('Google Maps opens the named venue and address without starting directions', () => {
  const venue = place('x', { name: 'A & B – valfri middag', address: '1-2-3 東京, Japan' });
  const url = new URL(googleMapsUrl(venue));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), 'A & B, 1-2-3 東京, Japan');
  assert.deepEqual([...url.searchParams.keys()], ['api', 'query']);
});
test('cafes validate, filter, group and number independently from sweets and meals', () => {
  const data = validateData({ ...base, places: [place('coffee', { category: 'cafe', status: 'Valfritt', date: '' }), place('tea', { category: 'cafe', sequence: 2 }), place('cake', { category: 'sweet' }), place('meal', { category: 'food' })] });
  const numbered = numberPlaces(data.places);
  assert.equal(numbered.find(p => p.id === 'tea').label, 'K1');
  assert.equal(numbered.find(p => p.id === 'coffee').label, 'K2');
  assert.equal(numbered.find(p => p.id === 'cake').label, 'S1');
  const initial = initialSelection(data, new URLSearchParams());
  assert.ok(initial.categories.includes('cafe'));
  const filtered = filterPlaces(numbered, { ...initial, categories: ['cafe'], optional: false });
  assert.equal(filtered.length, 2);
  assert.deepEqual(groupMapPlaces(filtered).map(g => [g.id, g.title]), [['cafe', 'Kaféer']]);
  assert.equal(filterPlaces(numbered, { ...initial, categories: ['cafe'], query: 'K2' })[0].id, 'coffee');
});
test('food options use local names and count only tagged restaurants in the selected city', () => {
  const places = [
    place('tokyo-ramen', { category: 'food', food_tags: ['ramen'] }),
    place('tokyo-grill', { category: 'food', food_tags: ['bbq', 'meat'] }),
    place('tokyo-grill-2', { category: 'food', food_tags: ['bbq', 'meat'] }),
    place('seoul-grill', { city: 'seoul', category: 'food', food_tags: ['bbq', 'meat'] }),
    place('seoul-noodles', { city: 'seoul', category: 'food', food_tags: ['noodles', 'dumplings', 'soup'] }),
    place('coffee', { category: 'cafe' }),
  ];
  assert.deepEqual(foodOptions(places, 'tokyo'), [
    { id: 'ramen', label: 'Ramen', count: 1 },
    { id: 'meat', label: 'Kött', count: 2 },
    { id: 'bbq', label: 'Grillat / yakiniku', count: 2 },
  ]);
  assert.deepEqual(foodOptions(places, 'seoul'), [
    { id: 'bbq', label: 'Koreansk BBQ', count: 1 },
    { id: 'meat', label: 'Kött', count: 1 },
    { id: 'soup', label: 'Soppor / gukbap', count: 1 },
    { id: 'noodles', label: 'Nudlar / kalguksu', count: 1 },
    { id: 'dumplings', label: 'Mandu', count: 1 },
  ]);
  assert.equal(foodTypeLabel('dumplings', 'hakone'), 'Gyoza');
  assert.equal(foodTypeLabel('noodles', 'kyoto'), 'Soba & andra nudlar');
  assert.deepEqual(foodOptions(places, 'osaka'), []);
});
test('food type filtering narrows restaurants while preserving selected activities and cafes', () => {
  const numbered = numberPlaces([
    place('walk'),
    place('sushi', { category: 'food', food_tags: ['sushi'] }),
    place('grill', { category: 'food', food_tags: ['bbq', 'meat'], sequence: 2 }),
    place('ramen', { category: 'food', food_tags: ['ramen'], sequence: 3 }),
    place('undated-ramen', { category: 'food', food_tags: ['ramen'], date: '', status: 'Valfritt' }),
    place('coffee', { category: 'cafe' }),
  ]);
  const state = { city: 'tokyo', day: '2026-10-08', query: '', categories: ['activity', 'food', 'cafe'], optional: false, foodType: 'ramen' };
  assert.deepEqual(filterPlaces(numbered, state).map(p => p.id), ['walk', 'coffee', 'ramen', 'undated-ramen']);
  assert.deepEqual(filterPlaces(numbered, { ...state, categories: ['food'] }).map(p => p.label), ['M3', 'M4']);
  assert.equal(filterPlaces(numbered, { ...state, foodType: 'all' }).length, 6);
  assert.equal(filterPlaces(numbered, { ...state, foodType: '' }).length, 6);
  assert.deepEqual(filterPlaces(numbered, { ...state, foodType: '', query: 'kott' }).map(p => p.id), ['grill']);
  assert.deepEqual(filterPlaces(numbered, { ...state, query: 'M3' }).map(p => p.id), ['ramen']);
  assert.equal(numbered.find(p => p.id === 'ramen').label, 'M3');
});
test('shared filter URLs restore valid food types and categories without leaking filters across countries', () => {
  const data = { ...base, cities: [...base.cities, { id: 'seoul', name: 'Seoul' }], places: [
    place('ramen', { category: 'food', food_tags: ['ramen'] }),
    place('seoul-bbq', { city: 'seoul', category: 'food', food_tags: ['bbq'] }),
  ] };
  const selection = query => initialSelection(data, new URLSearchParams(query));
  const ramen = selection('city=tokyo&food=ramen');
  assert.equal(ramen.foodType, 'ramen');
  assert.deepEqual(ramen.categories, ['food']);
  const withActivities = selection('city=tokyo&food=ramen&categories=activity,food,unknown,__proto__');
  assert.deepEqual(withActivities.categories, ['activity', 'food']);
  assert.equal(withActivities.foodType, 'ramen');
  assert.equal(selection('city=tokyo&food=ramen&categories=activity').foodType, '');
  assert.deepEqual(selection('city=tokyo&categories=').categories, []);
  assert.equal(selection('city=seoul&food=ramen').foodType, '');
  assert.deepEqual(selection('city=seoul&food=ramen').categories, ['activity', 'food', 'cafe', 'sweet']);
  assert.equal(selection('city=seoul&food=bbq').foodType, 'bbq');
  assert.equal(selection('city=tokyo&food=constructor').foodType, '');
  assert.equal(selection('city=tokyo&food=all').foodType, 'all');
  assert.deepEqual(selection('city=tokyo&food=all').categories, ['food']);
});
test('food tags reject unknown, duplicate, empty and non-restaurant classifications', () => {
  assert.doesNotThrow(() => validateData({ ...base, places: [place('meal', { category: 'food', food_tags: ['sushi', 'seafood'] })] }));
  for (const food_tags of ['ramen', [], ['not-a-food'], ['ramen', 'ramen'], [null], ['constructor']]) {
    assert.throws(() => validateData({ ...base, places: [place('meal', { category: 'food', food_tags })] }), /Ogiltig plats/);
  }
  assert.throws(() => validateData({ ...base, places: [place('walk', { food_tags: ['ramen'] })] }), /Ogiltig plats/);
});
test('photos require HTTPS images, a safe source link and attribution metadata', () => {
  const photo = { src: 'https://example.com/venue.jpg', source: 'https://example.com/venue', alt: 'Restaurangens matsal', credit: 'Restaurangen' };
  const dataWith = photos => ({ ...base, places: [place('venue', { photos })] });
  assert.doesNotThrow(() => validateData(dataWith([photo])));
  assert.doesNotThrow(() => validateData(dataWith([])));
  for (const photos of [
    'https://example.com/venue.jpg', [null],
    [{ ...photo, src: 'http://example.com/venue.jpg' }],
    [{ ...photo, src: 'javascript:alert(1)' }],
    [{ ...photo, src: 'data:image/png;base64,AA==' }],
    [{ ...photo, source: 'javascript:alert(1)' }],
    [{ ...photo, source: undefined }],
    [{ ...photo, alt: undefined }],
    [{ ...photo, credit: undefined }],
  ]) assert.throws(() => validateData(dataWith(photos)), /Ogiltig plats/);
});
test('encrypted datasets authenticate changes and require the correct key', () => {
  const key = randomBytes(32), encrypted = encryptText('private dataset', key);
  assert.equal(decryptText(encrypted, key), 'private dataset');
  assert.throws(() => decryptText(encrypted, randomBytes(32)));
  assert.notEqual(encryptText('private dataset', key).iv, encrypted.iv);
});
