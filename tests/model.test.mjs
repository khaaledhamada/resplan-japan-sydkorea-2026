import test from 'node:test';
import assert from 'node:assert/strict';
import { numberPlaces, filterPlaces, initialSelection, navigationUrl, validateData, safeLink } from '../assets/trip-model.mjs';
import { encryptText, decryptText } from '../scripts/crypto.mjs';
import { randomBytes } from 'node:crypto';
const place = (id, extra = {}) => ({ id, city: 'tokyo', name: 'Plats ' + id, category: 'activity', date: '2026-10-08', sequence: 1, lat: 35.6, lon: 139.7, description_sv: 'Promenad', address: 'Tokyo, Japan', status: 'Planerat', ...extra });
const base = { schema: 1, updatedAt: '2026-09-14T00:00:00Z', cities: [{ id: 'tokyo', name: 'Tokyo', notes: { '2026-10-12': 'Avresa' } }], places: [] };
test('numbering is stable under filtering and separate per category and city', () => {
  const numbered = numberPlaces([place('b', { sequence: 2 }), place('a'), place('lunch', { category: 'food' }), place('extra', { status: 'Valfritt' }), place('cake', { category: 'sweet' })]);
  assert.equal(numbered.find(p => p.id === 'b').label, '02');
  assert.equal(numbered.find(p => p.id === 'extra').label, 'V01');
  assert.equal(numbered.find(p => p.id === 'lunch').label, 'M01');
  assert.equal(numbered.find(p => p.id === 'cake').label, 'S01');
});
test('date, optional, category and accent-insensitive search combine', () => {
  const places = numberPlaces([place('a', { name: 'Sötsak', category: 'sweet' }), place('b', { date: '' }), place('c', { status: 'Valfritt' }), place('d', { date: '2026-10-09' })]);
  const state = { city: 'tokyo', day: '2026-10-08', categories: ['activity', 'sweet'], optional: false, query: '' };
  assert.deepEqual(filterPlaces(places, state).map(p => p.id), ['a', 'b']);
  assert.deepEqual(filterPlaces(places, { ...state, query: 'sotsak' }).map(p => p.id), ['a']);
  assert.equal(filterPlaces(places, { ...state, categories: [] }).length, 0);
});
test('day selection respects city timezone and valid explicit links', () => {
  const data = { ...base, places: [place('a')] };
  assert.equal(initialSelection(data, new URLSearchParams(), new Date('2026-10-07T22:00:00Z')).day, '2026-10-08');
  assert.equal(initialSelection(data, new URLSearchParams('day=&city=tokyo')).day, '');
  assert.equal(initialSelection(data, new URLSearchParams('day=2026-10-12&view=plan')).view, 'plan');
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
