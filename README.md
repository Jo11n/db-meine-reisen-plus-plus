# DB Meine Reisen++

A userscript that enhances Deutsche Bahn's "Meine Reisen" ("My Trips") page.

![Screenshot](screenshot.png)

## Features

**Full Trip Overview**
- Display complete journey list (future/past) without pagination
- View platform assignments, ticket category, and seat reservations without going to the detail page (if info available from bulk api call)
- Optional external train info links for train numbers (e.g. zugfinder.net, bahn.expert) *(experimental)*
- Optional external routing links for upcoming trips (e.g. bahn.expert, chuuchuu, transitous.org) *(experimental)*

**Change Tracking (alpha)**
- Automatic snapshot comparison across visits (delays, cancellations, reroutings, platform changes)
- Visual highlighting of what's changed

**Past Trip Cache (reiseketten history)**
- Optional: past trips can be enriched from locally cached reiseketten data captured on earlier visits.
- Cached enrichment currently includes key operational fields such as train binding, status/disruption indicators, train list, seats, RT times/delay summary, tracks, cached notifications and saved trips (when available)
- Cache data is browser-local (`localStorage`), capped and pruned over time, and only exists after prior successful captures.

**Data Export**
- Export trips to ICS format (with stable UIDs for deduplication)
- Maximalist bulk CSV export for spreadsheet analysis
- Download individual PDF tickets with one click
- Export routes as GPX or geoJSON-files
- Download raw API response JSON for individual trips (complete information at trip level)
- Import/export snapshot + settings bundle *(merge mode, newest wins, experimental)*

**Filtering**
- Filter by station (origin/destination)
- Filter by date range (all/7/30/90)
- Show only trips with issues
- Filter by labels & indicators
- Separate tabs for future and past trips

**Labels & Indicators**
- First class markers
- Rerouting required warnings
- Zugbindung: Train binding status
- Subscription indicators
- Seat/bike cancellation notices
- Disruption information
- Whether trip alerts are muted

**Bilingual Support**
- German on bahn.de
- English on int.bahn.de

## Installation

1. **Install a userscript manager, such as:**
   - [Tampermonkey](https://tampermonkey.net/)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. **Install the script:**
   - Click here: [Install DB Meine Reisen++](https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js)
   - Your userscript manager will prompt to confirm installation

3. **Visit your trips:**
   - Go to [https://www.bahn.de/meine-reisen](https://www.bahn.de/meine-reisen)
   - Open the script by clicking the floating button 🚆++ (lower right corner of the screen)

## Trust & Security

**Unofficial, use at your own risk.**

**Data Privacy**
- Runs entirely in your browser
- Uses only Deutsche Bahn APIs (the same ones the website uses)
- No data collection or tracking
- No third-party servers involved (Links to external pages do not rely on external API calls)
- All snapshots stored locally in your browser storage

**No Permissions Needed**
- Script runs with `@grant none` and requires no special browser permissions
- Only interacts with bahn.de

**Minimal API footprint**
- Uses the same API calls as the website itself
- Per-trip API calls are made only on user demand

## Limitations

- **Intentional: Does not modify bookings** - Only reads and displays data
- **Not guaranteed to catch all changes** - Only detects changes visible in the API (sometimes it wasn't entirely clear what caused the API to flag a trip with "relevant change", for example)
- **Dependent on DB API stability** - If Deutsche Bahn changes their backend APIs, the script may require updates
- **Browser/device bound** - Snapshots are stored locally per browser profile; changing browsers won't sync history
- **Subdomain-separated storage** - `localStorage` is origin-scoped, so `www.bahn.de` and `int.bahn.de` do not share snapshot/settings/history automatically; use snapshot export/import to transfer data.
- **Past cache is optional and opportunistic** - Enrichment for past trips is disabled by default and depends on previously captured reiseketten data; if no prior capture exists, only order-derived fields can be shown.
- **Script likely does not know all ticket/flag variants** - Since the API is undocumented, reverse engineering is based on a limited set of observed trips.
- **External link-building is somewhat unreliable** - There are many edge cases.
- **Not optimized for mobile yet** - The panel may look rough on smaller screens.

## Support & Feedback

- [Report issues or propose features/enhancements](https://github.com/Jo11n/db-meine-reisen-plus-plus/issues)

## License

[MIT License](LICENSE)