# Resekartan

Private travel map and day plan on the existing GitHub Pages sites. Vanilla JavaScript, no build server or account migration.

## One source for both sites

`data/trip-shared.enc.json` contains the common cities. Both sites load this exact URL. `data/trip-extension.enc.json` contains the continuation of the longer trip. The shorter site's encrypted configuration only contains the shared dataset key.

Map markers, search results, place details and Dagsplan all render from these records. Stable `id` values identify places; `date`, `sequence`, `category` and `status` determine presentation and numbering. Numbers are computed before filtering, so they stay consistent between views. Dated activities start with the October day: 3.1, 3.2, then 4.1 on the next day. Dated optional activities use 3.V1; undated options use V1. Lodging (`Boende`) uses an unnumbered house icon and does not consume an activity number. Food M1, cafes K1 and sweets S1 retain city-wide numbering. City maps can be filtered by day; an empty day keeps the full stay visible and a selected day also includes undated suggestions. Fuji och Kawaguchiko stays in the data for old links but is shown as a selectable 11 October alternative under Tokyo, not as a city in the picker. The same day selection is available in Dagsplan.

Cafe records use category `cafe` and brown markers (`#8b5e34`). Coffee/tea stops belong here; dessert-focused shops remain in `sweet`. Category checkboxes toggle independently. Double-clicking the same category restores all categories, optional activities and food/cafe subfilters; quick clicks on different categories remain independent toggles. Filters open in a compact panel on mobile, while the map retains its full viewport. New recommendations use an empty date and optional status, carry source URLs and a review date, and do not create bookings or change the planned activity order.

Food records carry curated `food_tags` using `FOOD_TYPES` in the model. The food selector shows only types present in the city, with counts and Korean/Japanese labels. Choosing a type shows matching restaurants; visitors can add other categories afterwards. Changing city resets the food type to all restaurants. Choosing “Alla platser” restores every category. Filter state is preserved in the URL. Types describe a venue's characteristic dishes, not dietary suitability or every ingredient.

Place photos use `photos: [{src, alt, credit, source}]` with verified HTTPS image/source URLs. They load only when a place is opened; the first image loads immediately and the remaining gallery images stay deferred until they approach the visible strip or are selected. Source hosts are preconnected when a gallery opens, and every image has source credits and opens at full size when selected. Failed or unavailable photos offer the place's Google Maps link. Keep pictures tied to the exact venue/branch; do not substitute generic cuisine imagery. Source sites control remote photo availability.

The original code gates are retained. Dataset keys and the original logistics document are inside their encrypted payloads, never in public application code. Original checklist IDs and local-storage namespaces are retained. The Resedetaljer iframe displays the original bookings, checklists and practical information, with duplicate activity/restaurant sections removed from its displayed document. `assets/trip-details.css` applies the map/day-plan theme without changing the original forms or scripts.

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
- “Öppna Google Maps” opens the place search by venue name/address, not a directions request. Visitors can view photos/reviews and choose directions inside Google Maps. No Google account, Maps API key or import is required for the website.
- The map needs internet. If its library or tiles fail, the place list, Dagsplan and directions links remain usable. If the encrypted dataset cannot load, the original document is available as a recovery option.
- The page reads device location only after the visitor presses the map's location control.
- Filters, marker clicks, closing details and resizing preserve the current camera. Selecting a place from the list or Dagsplan can pan it into view at the same zoom. Bounds are fitted on initial map load, city changes (including changes made while the map is hidden), or the explicit “Visa alla” map button. Wheel, trackpad and touch zoom use gentler rates, and drag release has lower inertia for smoother panning. Double-clicks and double taps on markers do not trigger map zoom. Transport points use train, bus, cable-car or boat pictograms and do not consume activity numbers.

## Design

Desktop: 80px navigation rail, 384px place panel, remaining width for the map. Mobile: full viewport map behind floating search, city/category filters, a collapsed list bar and bottom navigation. The list expands on demand; selected places open a detail card. Camera fitting and place-selection offsets account for overlays without leaving persistent detail-card padding. White panels, light dividers, restrained shadows, rounded search field and colored numbered pins follow the Maps-inspired concepts. Real map geography replaces the illustrative concept geography. Marker wrappers must stay absolutely positioned; their visible tips remain fixed when selected.

Tokens: primary `#1a73e8`, food `#c4443f`, sweets `#8657b0`, text `#18202f`, secondary text `#637086`, borders `#e2e7ed`. Controls use system sans fonts. Components: navigation rail, search, city/day selects, category chips, numbered place row, transport and lodging markers, map marker, place detail panel, daily plan, preserved logistics iframe.

## Checks

Run `node --test tests/model.test.mjs` for category/date/search behavior, stable numbering, timezone/deep-link selection, invalid import rejection and authenticated encryption.

Browser QA covers both code gates, marker/list parity, country-aware food/category filters, map/plan date-label parity, Google Maps place URLs, photo loading/fallback, saved checklist persistence, mobile list/detail views, locking, recovery and the short site's restricted city list. Test previews and browser downloads belong outside these repositories and must not be published with private screenshots or decrypted data.
