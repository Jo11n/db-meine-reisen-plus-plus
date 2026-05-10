# DB Meine Reisen++

A userscript that enhances Deutsche Bahn's "Meine Reisen" ("My Trips") page.

![Screenshot](screenshot.png)

## Features

**Full Trip Overview**
- Display complete journey list without pagination
- View platform assignments, real-time delays, and seat allocations

**Change Tracking**
- Automatic snapshot comparison across visits (delays, cancellations, rebookings, platform changes)
- Visual highlighting of what's changed

**Data Export**
- Export trips to **ICS format** (with stable UIDs for deduplication)
- Maximalist bulk CSV export for spreadsheet analysis
- Download individual PDF tickets

**Filtering**
- Filter by station (origin/destination)
- Filter by date range (all/7/30/90)
- Show only trips with issues
- Separate tabs for upcoming and past trips

**Labels & Indicators**
- First class markers
- Rebooking required warnings
- Zugbindung: Train binding status
- Subscription indicators
- Seat/bike cancellation notices
- Real-time disruption alerts
- Muted alerts per trip

**Bilingual Support**
- Full German support on bahn.de
- Full English support on int.bahn.de

## Installation

1. **Install a userscript manager, such as:**
   - [Tampermonkey](https://tampermonkey.net/) 
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. **Install the script:**
   - Click here: [Install DB Meine Reisen++](https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js)
   - Your userscript manager will prompt to confirm installation

3. **Visit your trips:**
   - Go to [https://www.bahn.de/meine-reisen](https://www.bahn.de/meine-reisen) or [https://int.bahn.de](https://int.bahn.de)
   - Open the script by clicking on the hover button 🚆++

## Trust & Security

**unofficial, use at your own risk**

**Data Privacy**
- Runs entirely in your browser
- Uses only public Deutsche Bahn APIs (the same ones the website uses)
- No data collection or tracking
- No third-party servers involved
- All snapshots stored locally in your browser storage

**No Permissions Needed**
- Script runs with `@grant none` - requires no special browser permissions
- Only interacts with bahn.de and int.bahn.de

**Minimal API footprint**
- uses API calls as the website itself
- per trip API calls only on demand by user

## Limitations

- **Does not modify bookings** - Only reads and displays data
- **Not guaranteed to catch all changes** - Only detects changes visible in the API (sometimes it wasn't entirely clear what caused the API to flag a trip with "relevant change", for example)
- **Dependent on DB API stability** - If Deutsche Bahn changes their backend APIs, the script may require updates
- **Browser/device bound** - Snapshots are stored locally per browser profile; changing browsers won't sync history
- **Script likely does not know all kinds of tickets/flags** - as the API is not documented, I could only rely on my own trips to reverse engineer. 


## Support & Feedback

-  [Report issues/Propose features/enhancments](https://github.com/Jo11n/db-meine-reisen-plus-plus/issues)


## License

MIT
