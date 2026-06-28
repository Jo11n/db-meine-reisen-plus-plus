# Changelog

All notable changes to this project will be documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
This project uses [Semantic Versioning](https://semver.org/).


---
## [0.9.0]

### Added
- **show travel plan changes** - show inline how travel plans have changed based on a comparison of the reiseketten (travel plan) and auftrag (booking) response
- **note taking** - add notes to trips, these will also be exported in the CSV
- **commit auftrag responses to cache and render them** - this means that past bookings can be reconstructed from cache after they disappear from the API response 14 months after the trip

### Changed
- **omit link to detail page for trips rendered from cache** - the detail info gets stale quickly, 

---
## [0.8.1]

### Fixed
- **cleaned up settings section**  
- **show ticket download option for partly cancelled tickets** - never seen `TEILWEISE_STORNIERT` in the wild but if it exists, the ticket should be shown
- **minor cleanup in matchedKeys**
- **improved intelligibility of trip json export** - by including the resolved endpoint urls
- **added some overlooked info to trip json export** - bulk auftrag/v2 call, custom tags, and live state
- **csv now includes the custom tags as intended**


---
## [0.8.0] - "Reparatur an einer Weiche"

### Added
- **Added tagGebrochen** (cls: 'bad') for reisekette.status === 'GEBROCHEN' (connection operationally broken due to current events), with labels "Connection broken" / "Verbindung gebrochen" and onlyProblems filter
- **Added tagReroutedByUser** (cls: 'info') for letzterReiseplanBearbeiter === 'NUTZER' (user manually chose an alternative connection), with labels "Alternative chosen" / "Alternative gewählt"
- **Added tagTeilweiseStorniert** (yellow) for partially cancelled trips, distinct from full cancellation (red tagStorniert)
- **Option to hide fully cancelled trips**
- **Added dev options group in settings** - and moved some settings there
- **Debug logging** — opt-in setting (Developer options) that records navigation, lifecycle, and API events to localStorage; survives page reloads; Copy and Clear buttons in the settings panel
- **Added button to download bulk `reiseketten`and `auftrag/v2` json response data** - in dev options


### Changed
- **CSV export extended** — five new columns: origin/destination station IDs (`From (ID)` / `To (ID)`), alert subscription name, recurring weekdays, and recurring-until date. Note: `To (ID)` may reflect the train's ultimate terminus rather than the booked destination due to an API bug.
- **Reservation-only trips** — trips where only a seat or bike reservation was booked without an accompanying ticket (e.g. BahnCard 100 holders) are now correctly identified. Tagged as "Reservation only" / "Nur Reservierung" and exported as a CSV column. Also fixes a gap where past and orphan trips always had blank seat/bike availability columns.
- **extended lookback window** - the api seems to expose 14 months
- **Show cancelled trips inline** - deleted the counterintuitive "orphans" section

### Fixed
- **Removed two unconfirmed storniertStatus values** from the label map — not part of the actual API enum
- **fixed bug that hid past cancelled trips** - visible again
- **Redundant API refetch on mobile** — bahn.de's auth token sync navigates the page away and back ~1.5 s after load, causing the script to re-initialise and refetch. The render result is now cached in sessionStorage (60 s TTL): on the second load the FAB and panel appear instantly from cache while a background fetch silently updates the data.

---
## [0.7.1]

### Fixed
- **onlyProblems Filter** - more suitable var name and added status 'VORLAEUFIG_NICHT_REKONSTRUIERBAR' to filter reason
- **query deviation info symbol** -  "⚠️" is more intuitive 
- **track changes** - now picking up track changes at the bulk reiseketten level as intended (first departure)
- **cleaned up the change view** - simplified by omitting redundant buttons
- **cleaned up track info rendering** - now integrated with train info
- **ris-info fetch in German if applicable** - RIS sends messages depending on browser locale, so we fix it to German if the user chose to use the German site for consistency
- **disambiguate RIS notices** - add a train prefix to see which RIS info belongs to which train in the journey
- **added button symbols to some settings** - to clarify what is what
- **touch event caused reloads on mobile** - another attempt. last fix didn't solve this completely

---

## [0.7.0] - 2026-06-15 "Betriebsstabilisierung"

### Added
- **custom tags** - you can now define, assign and filter by custom tags in the settings and assign them to individual trips

### Changed
- **restructered and enhanced settings** - introduced collapsible settings sections and introduced setting descriptions

### Fixed
- **refactored history entry shape** - deduplicated code
- **refactored renderUI code** - introduced 4 helper functions to decompose the overly large function
- **refactored external routing code** - decomposed routing code such that providers get named sync functions, simplified endpoint extraction a bit
- **Unified trip tag definitions** - into a single TRIP_TAG_DEFS table, eliminating the parallel condition lists in getTripTagIds and buildTripTags; also fixes tagSaved not matching history-cache trips in the filter path.

---
## [0.6.0] - 2026-06-10 "defekte Tür"

### Added
- **GPX/GeoJSON download** - added option to download the route of the connection as segmented GPX/geoJSON file

### Changed
- **dropdown options greyed out if feature not activated** - deactivates dropdown options in the settings if the respective feature is deactivated (train links, routing, geo data) 
- **resolve train detail for regional train numbers** - get `reiseketten`detail if user clicks train link for number only trains to improve train link creation for bahn.expert and zugfinder.net

---
## [0.5.0] - 2026-06-10 "Längere Haltezeit am Bahnhof"

### Added

- **Being replanned tag** - `VORLAEUFIG_NICHT_REKONSTRUIERBAR` new status tag added
- **Delete cache button for saved trips in past view** - allows to delete saved trips that have been reconstructed from cache in the past view mimicking the option of bahn.de to delete saved trips, only affects cache

### Fixed

- **indentation** - throughout

---

## [0.4.1] - 2026-06-05

### Fixed

- **Terminology: `tagMustReroute` instead of `tagMustRebook`** - rebooking/Umbuchung is not what is meant with this: a new connection has to be chosen, because it is not available anymore, also fixed tag label
- **Cached info time stamp in past view** - now shows the time when info was first committed into the cache (not when last refreshed in the past view)
- **Show saved trips in past view** - now, saved trips (not part of the auftrag-api) are reconstructed from cache as intended. 

---

## [0.4.0] - 2026-06-02 "Warten auf Anschlussreisende"

### Added

- **`LEISTUNG` order-item support** - Added handling for `auftraege[].katalogwunsch.positionTyp === 'LEISTUNG'` products such as bicycle day tickets, including current/past list display and product-name rendering when no route exists.
- **Settings area in panel** - Added a dedicated settings section between header actions and the filter bar.
- **Settings toggle button in header** - Replaced the previous header reset button with a `⚙️` button that opens/closes the settings area.
- **Remember filters option** - Added optional persistence for filter state (`from`, `to`, day range, tags, issues toggle) and active view across panel reloads.
- **Open panel on page load option** - Added optional persistence for automatically showing the panel when the page is opened.
- **Dedicated settings storage** - UI settings are now stored separately (`dbmrpp.settings.v1`), and filter persistence uses its own key (`dbmrpp.filterState.v1`) to keep snapshot diff data clean.
- **External train info links (experimental)** - Added optional linking of train names in the trip meta line, configurable in Settings with provider selection (`zugfinder.net` or `bahn.expert`).
- **External routing links for upcoming trips (experimental)** - Added optional `🧭` action for upcoming trips with selectable provider (`bahn.expert`,  `chuuchuu`, or `transitous.org`).
- **Snapshot import/export (experimental)** - Added snapshot+settings bundle export and replace-mode import in Settings.
- **Optional past-view cache enhancement** - Added a optional setting to enrich the past view from locally cached reiseketten data

### Changed
- **Reset snapshot relocated** - Moved the reset action from header actions into the settings area.
- **View switch behavior with remembered filters** - Switching between Upcoming and Past no longer clears filters when "Remember filters" is enabled; legacy reset behavior remains when disabled.
- **Upcoming reiseketten pagination** - The reiseketten fetch now loads multiple pages, so upcoming trips are no longer limited to the first 100 API entries.
- **Button type normalization** – All action buttons (e.g., routing, share, PDF, ICS, JSON, disruption, passenger rights) now explicitly use `type="button"` to prevent accidental form submissions or navigation issues, improving compatibility across browsers and mobile environments.

### Fixed
- **Android Edge/Tampermonkey panel tap causing page reload** - The floating `DB Meine Reisen++` launch button (`#dbmrpp-fab`) now uses `type="button"` and prevents default/propagation on click, avoiding accidental host-page submit/navigation behavior on mobile.
- **Abweichung detail text cleanup** - The `ℹ️` disruption detail view now renders normalized, deduplicated message text and no longer falls back to raw JSON object dumps, reducing malformed and redundant output.

---

## [0.3.0] - 2026-05-22 "Verspaetung eines vorausfahrenden Zuges"

### Added
- **Tag filter dropdown** – new dropdown in filter bar displaying all tags present in the currently filtered trip list. Users can select multiple tags; only trips containing *all* selected tags are shown (AND logic). Selected tags are displayed as removable chips in the filter bar.
- **Auth token refresh recovery** – script now detects 401 Unauthorized responses. When detected, it triggers an authenticated request to capture the website's current (refreshed) token, then automatically retries the failed request.
- **Recurring trip series info & name in UI** – recurring trips are shown with weekdays and end date. If a recurring reisekette includes `ueberwachung.name`, the name is now shown in the trip meta area (e.g. as "Serie" / "Series") so custom recurrence names become visible in the panel.
- **Version link in panel header** – the panel now shows the current script version and links it directly to the changelog in the GitHub repository.

### Changed
- **Summary line train icon** – the train list in trip meta is now prefixed with `🚅` for quicker scanning.
- **Seat display compacted** – reservation output is now rendered as `💺 <Train> W<Wagen>, Pl.<seats>` with grouped seat numbers per wagon to avoid repetitive long strings.
- **Tag label "Umgeleitet" → "Reiseplan geändert"** – more accurate semantic meaning for trips where `letzterReiseplanBearbeiter === 'SYSTEM'`. Applies to both EN ("Itinerary changed") and DE labels, including CSV export.
- **Long route text wrapping** – when the route (from → to) is very long, both the route link and action icons (share, ICS, PDF, etc.) can wrap to multiple lines for better readability on narrow panels.
- **Translation consistency cleanup** – localized remaining mixed-language UI labels (tag filter labels and loading text) and normalized DE class tag text (`1. Klasse`).
- **Past-trip fetch window** – order enrichment now starts at the first day of the same month one year back, matching DB's month-based history window instead of using a rolling 365-day cutoff.
- **Changed selection criteria for the "with problem" filter** - more focused on real problems. "relevanteAbweichung" can be unknown before the trip has live info though. Might demote that in the future.
- **Fahrgastrechte cache not invalidated on empty result** – when the `§` button was clicked and no claim was found, the order detail response stayed in cache. A subsequent click would then show the stale "no claim" result even if the user had filed a claim in the meantime. The cache entry is now evicted when `submittedAntragList` is empty, so re-clicking always fetches fresh data.

### Fixed
- **Abweichung info details from `verbindungsAbschnitte`** – the `ℹ️` disruption details button now also reads `himMeldungen`, `priorisierteMeldungen`, and `risNotizen` from `trip.verbindungsAbschnitte[]` in reiseketten detail responses, so alerts are shown for payloads where messages are section-scoped.

---

## [0.2.1] - 2026-05-18

### Fixed
- **Share button on Past tab** – clicking ⤴️ on past trips now resolves the trip object across all visible datasets (upcoming, past, orphaned) instead of only checking upcoming trips.
- **Share link robustness for future trips** – `ctxRecon` resolution now handles multiple detail response shapes and falls back to order detail (`auftrag`) when reiseketten detail does not provide it.
- **Raw JSON export completeness** – `reiseketteDetail` is now fetched for all `fromReiseketten` trips with a `uuid`, even when base `reisekette` data is already present.

---

## [0.2.0] – 2026-05-13 "Keine Verspätungsbegründung"

### Added
- **Fahrgastrechte indicator** – past trips with an `auftragsnummer` now show a `§` button. Clicking it fetches the order detail on demand (cached) and displays any filed passenger-rights claims with date and claim ID, or a "no claim" message.
- **Per-trip raw JSON download** – each trip gets a `{ }` action icon that downloads a JSON file containing the full API data (`reisekette`, `reisekette detail`, `auftrag` detail) along with a `dbmrppTripSummary` snapshot. For debugging and research. Makes API calls as if user clicks on detail page.

### Fixed
- **PDF button hidden for cancelled tickets** – the 🧾 button is no longer rendered when `storniertStatus` is anything other than `NICHT_STORNIERT`, 
- **Filter bar overflow** – the filter row now wraps (`flex-wrap: wrap`) and select min-widths were reduced so the "With problems" button is never pushed off-screen on narrow panels.
- **Share link for AUFTRAG-only trips** – the share (⤴️) button is now also shown for past and orphaned trips that have an `auftragsnummer`. 

### Changed
- **Departure time is bold** in both the main trip list and the change-diff view for faster scanning.
- **"With problems" filter hidden on Past tab** – the toggle button is not rendered for past trips because the filter criteria (disruptions, rebooking alerts) never apply there.
- **changed some variable names**, this will break the diff once

### Removed
- Dead translation keys `hasChanges` and `ttCollapse` (were referenced nowhere).
- Header status suffix that was previously appended when `hasChanges` was set.

---

## [0.1.0] – initial release

- Initial public release.