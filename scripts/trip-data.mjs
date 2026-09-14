// One canonical, encrypted dataset shared by both GitHub Pages sites.
// Usage: TRIP_BUILD_CODE_LONG=<code> node scripts/trip-data.mjs export /private/path/trip.json
// Edit that private file, then: ... node scripts/trip-data.mjs import /private/path/trip.json
// Publish the changed data/*.enc.json files in this repository. No second-site edit is needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGate, readConfig, decryptText, encryptText } from './crypto.mjs';
import { validateData } from '../assets/trip-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, privatePath] = process.argv.slice(2);
if (!['export', 'import', 'check'].includes(command) || (command !== 'check' && !privatePath) || !process.env.TRIP_BUILD_CODE_LONG) {
  console.error('Set TRIP_BUILD_CODE_LONG and run: node scripts/trip-data.mjs export|import <absolute private JSON path>, or check. Never commit the decrypted file or access code.');
  process.exit(1);
}
if (privatePath && (!path.isAbsolute(privatePath) || path.resolve(privatePath).startsWith(root + path.sep))) throw Error('Use an absolute private path outside the repository');
const config = readConfig(readGate(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), process.env.TRIP_BUILD_CODE_LONG).html);
const descriptors = config.datasets.map(d => ({ ...d, local: path.join(root, 'data', path.basename(d.url)) }));
const current = descriptors.map(d => validateData(JSON.parse(decryptText(JSON.parse(fs.readFileSync(d.local, 'utf8')), Buffer.from(d.key, 'base64')))));
const combined = validateData({ schema: 1, updatedAt: current.map(d => d.updatedAt).sort().at(-1), cities: current.flatMap(d => d.cities), places: current.flatMap(d => d.places) });
if (command === 'export') {
  fs.writeFileSync(privatePath, JSON.stringify(combined, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Exported private editable dataset. Preserve stable IDs; sequence/date control the displayed order.');
} else if (command === 'import') {
  const input = validateData(JSON.parse(fs.readFileSync(privatePath, 'utf8')));
  if (JSON.stringify(input.cities.map(c => c.id).sort()) !== JSON.stringify(combined.cities.map(c => c.id).sort())) throw Error('Adding/removing cities requires an explicit site configuration change');
  const writes = descriptors.map((d, i) => {
    const cityIds = new Set(current[i].cities.map(c => c.id));
    const next = validateData({ schema: 1, updatedAt: new Date().toISOString(), cities: input.cities.filter(c => cityIds.has(c.id)), places: input.places.filter(p => cityIds.has(p.city)) });
    return { path: d.local, content: JSON.stringify(encryptText(JSON.stringify(next), Buffer.from(d.key, 'base64'))) + '\n' };
  });
  // Validate all groups before replacing either one. Git publishes the pair atomically.
  for (const write of writes) fs.writeFileSync(write.path, write.content);
  console.log('Updated encrypted datasets. Publish this repository; both sites receive shared changes on reload.');
} else console.log(JSON.stringify({ valid: true, cities: combined.cities.length, places: combined.places.length }));
