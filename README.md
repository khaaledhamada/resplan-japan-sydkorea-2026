# Resekartan

Private travel map and day plan on the existing GitHub Pages sites. Vanilla JavaScript, no build server or account migration.

## One source for both sites

`data/trip-shared.enc.json` contains the common cities. Both sites load this exact URL. `data/trip-extension.enc.json` contains the continuation of the longer trip. The shorter site's encrypted configuration only contains the shared dataset key.

Map markers, search results, place details and Dagsplan all render from these records. Stable `id` values identify places; `date`, `sequence`, `category` and `status` determine presentation and numbering. Numbers are computed before filtering, so they stay consistent between views. City maps always include the entire stay, including old links with a day parameter. Their lists show activities 1, 2, 3, then optional activities V1, V2, food M1, M2 and sweets S1, S2. Day selection remains available in Dagsplan.

The original code gates are retained. Dataset keys and the original logistics document are inside their encrypted payloads, never in public application code. Original checklist IDs and local-storage namespaces are retained. The Resedetaljer iframe displays the original bookings, checklists and practical information, with duplicate activity/restaurant sections removed from its displayed document.

## Update places

Use Node.js 22+ and supply the existing long-site code through `TRIP_BUILD_CODE_LONG` in your private environment. Do not put it in a tracked file.

```sh
node scripts/trip-data.mjs export /absolute/private/path/trip.json
# Edit that private JSON, preserving existing place IDs.
node scripts/trip-data.mjs import /absolute/private/path/trip.json
node scripts/trip-data.mjs check
node --test tests/model.test.mjs
```

Publish both changed encrypted data files in one commit to this repository. The two websites receive shared changes on reload; no new KML import or second copy of the common itinerary is needed. Data is revalidated on reload. For a code/CSS update, update the asset version query in both encrypted shells as well as the module import. Keep the existing salt/iterations and use a fresh IV when updating the outer encrypted shell, as `replaceGate()` does.

Bookings and practical notes are separate from the map's place records. If changing a reservation, update the relevant original logistics document within the encrypted configuration as well as any affected place description. Checkboxes are saved on each device; they are not collaborative checkmarks.

## Map and navigation

- MapLibre GL JS 5.6.1, pinned CDN files with SRI.
- OpenFreeMap Liberty vector map, with visible OpenMapTiles/OpenStreetMap attribution.
- Google Maps directions open when the visitor chooses Navigera. No Google account, Maps API key or import is required for the website.
- The map needs internet. If its library or tiles fail, the place list, Dagsplan and directions links remain usable. If the encrypted dataset cannot load, the original document is available as a recovery option.
- The page reads device location only after the visitor presses the map's location control.

## Design

Desktop: 80px navigation rail, 384px place panel, remaining width for the map. Mobile: full viewport map behind floating search, city/category filters, a collapsed list bar and bottom navigation. The list expands on demand; selected places open a detail card. Camera padding accounts for overlays and rotation. White panels, light dividers, restrained shadows, rounded search field and colored numbered pins follow the Maps-inspired concepts. Real map geography replaces the illustrative concept geography. Marker wrappers must stay absolutely positioned; their visible tips remain fixed when selected.

Tokens: primary `#1a73e8`, food `#c4443f`, sweets `#8657b0`, text `#18202f`, secondary text `#637086`, borders `#e2e7ed`. Controls use system sans fonts. Components: navigation rail, search, city/day selects, category chips, optional activity toggle, numbered place row, map marker, place detail panel, daily plan, preserved logistics iframe.

## Checks

Run `node --test tests/model.test.mjs` for category/date/search behavior, stable numbering, timezone/deep-link selection, invalid import rejection and authenticated encryption.

Browser QA covers both code gates, marker/list parity, search, category filters, map/plan parity, directions URLs, saved checklist persistence, mobile list/detail views, locking, recovery and the short site's restricted city list. Test previews and browser downloads belong outside these repositories and must not be published with private screenshots or decrypted data.
