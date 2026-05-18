# Changelog

All notable changes to this project will be documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
This project uses [Semantic Versioning](https://semver.org/).

---

## [0.2.1] - 2026-05-18

### Fixed
- **Share button on Past tab** – clicking ⤴️ on past trips now resolves the trip object across all visible datasets (upcoming, past, orphaned) instead of only checking upcoming trips.
- **Share link robustness for future trips** – `ctxRecon` resolution now handles multiple detail response shapes and falls back to order detail (`auftrag`) when reiseketten detail does not provide it.
- **Raw JSON export completeness** – `reiseketteDetail` is now fetched for all `fromReiseketten` trips with a `uuid`, even when base `reisekette` data is already present.

## [0.2.0] – 2026-05-13

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
