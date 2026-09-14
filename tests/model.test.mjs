import test from 'node:test';
import assert from 'node:assert/strict';
import { numberPlaces, groupMapPlaces, filterPlaces, initialSelection, navigationUrl, validateData, safeLink } from '../assets/trip-model.mjs';
import { encryptText, decryptText } from '../scripts/crypto.mjs';
import { randomBytes } from 'node:crypto';
const place = (id, extra = {}) => ({ id, city: 'tokyo', name: 'Plats ' + id, category: 'activity', date: '2026-10-08', sequence: 1, lat: 35.6, lon: 139.7, description_sv: 'Promenad', address: 'Tokyo, Japan', status: 'Planerat', ...extra });
const base = { schema: 1, updatedAt: '2026-09-14T00:00:00Z', cities: [{ id: 'tokyo', name: 'Tokyo', notes: { '2026-10-12': 'Avresa' } }], places: [] };
test('numbering is stable under filtering and separate per category and city', () => {
  const numbered = numberPlaces([place('b', { sequence: 2 }), place('a'), place('lunch', { category: 'food' }), place('extra', { status: 'Valfritt' }), place('cake', { category: 'sweet' }), place('seoul', { city: 'seoul' })]);
  assert.equal(numbered.find(p => p.id === 'a').label, '1');
  assert.equal(numbered.find(p => p.id === 'b').label, '2');
  assert.equal(numbered.find(p => p.id === 'extra').label, 'V1');
  assert.equal(numbered.find(p => p.id === 'lunch').label, 'M1');
  assert.equal(numbered.find(p => p.id === 'cake').label, 'S1');
  assert.equal(numbered.find(p => p.id === 'seoul').label, '1');
  assert.equal(filterPlaces(numbered, { city: 'tokyo', day: '', categories: ['activity'], optional: true, query: 'Plats b' })[0].label, '2');
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
  assert.deepEqual(groups[0].places.map(p => p.label), Array.from({ length: 12 }, (_, i) => String(i + 1)));
  assert.deepEqual(groups.slice(1).map(g => g.places.map(p => p.label)), [['V1'], ['M1'], ['S1']]);
  assert.deepEqual(groupMapPlaces(places.filter(p => p.category === 'food')).map(g => g.id), ['food']);
  assert.deepEqual(groupMapPlaces([]), []);
  assert.deepEqual(places.map(p => p.id), originalOrder);
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
  assert.match(navigationUrl(place('x', { name: 'A & B' })), /A%20%26%20B/);
});
test('encrypted datasets authenticate changes and require the correct key', () => {
  const key = randomBytes(32), encrypted = encryptText('private dataset', key);
  assert.equal(decryptText(encrypted, key), 'private dataset');
  assert.throws(() => decryptText(encrypted, randomBytes(32)));
  assert.notEqual(encryptText('private dataset', key).iv, encrypted.iv);
});
