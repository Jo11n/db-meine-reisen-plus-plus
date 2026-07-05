// ==UserScript==
// @name         DB Meine Reisen++
// @name:de      DB Meine Reisen++
// @namespace    db-meine-reisen-plus-plus
// @version      0.11.0
// @description  A userscript that enhances the Deutsche Bahn (bahn.de) travel overview page ("My trips"/"Meine Reisen") with a full trip view, filter options, exports, change tracking, and more. Works on both the German and international versions of the site. 
// @description:de  Ein Userscript, dass die DB-Seite "Meine Reisen" mit Vollansicht aller Reisen, Filtern, CSV/ICS-Export, Änderungsinfos, Ticket-PDF-Download und weiteren Komfortfunktionen erweitert. Funktioniert sowohl auf der deutschen als auch auf der internationalen Version der Seite.
// @match        https://www.bahn.de/*
// @match        https://int.bahn.de/*
// @homepageURL  https://github.com/Jo11n/db-meine-reisen-plus-plus
// @supportURL   https://github.com/Jo11n/db-meine-reisen-plus-plus/issues
// @downloadURL  https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js
// @updateURL    https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js
// @author       Jo11n
// @license      MIT
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 1) Configuration
    // =========================================================
    const SCRIPT_VERSION  = '0.11.0';
    const STORAGE_KEY      = 'dbmrpp.snapshot.v1';
    const SETTINGS_KEY     = 'dbmrpp.settings.v1';
    const FILTER_STATE_KEY = 'dbmrpp.filterState.v1';
    // Key kept as "reisekettenHistory" for backwards-compat; also stores auftrag history since 0.9.0.
    const REISEKETTEN_HISTORY_KEY = 'dbmrpp.reisekettenHistory.v1';
    const REISEKETTEN_HISTORY_SCHEMA_VERSION = 2;
    const LAST_VISIT_KEY   = 'dbmrpp.lastVisit';
    const KUNDENPROFIL_KEY = 'dbmrpp.kundenprofilId';
    const CUSTOM_TAG_DEFS_KEY        = 'dbmrpp.customTagDefs.v1';
    const CUSTOM_TAG_ASSIGNMENTS_KEY = 'dbmrpp.customTagAssignments.v1';
    const NOTES_KEY                  = 'dbmrpp.tripNotes.v1';
    const FGR_CLAIMS_KEY             = 'dbmrpp.fgrClaims.v1';
    const ENDPOINT_PATH    = '/web/api/reisebegleitung/reiseketten';
    const AUFTRAG_PATH     = '/web/api/buchung/auftrag/v2';
    const AUFTRAG_DETAIL_PATH = '/web/api/buchung/auftrag';
    const CHANGELOG_URL   = 'https://github.com/Jo11n/db-meine-reisen-plus-plus/blob/main/CHANGELOG.md';
    const PAGESIZE         = 100;
    const AUFTRAG_PAGESIZE = 100;
    const REISEKETTEN_HISTORY_MAX_ENTRIES = 2000;
    const CACHE_NOTIFICATIONS_MAX_ITEMS = 8;
    const CACHE_NOTIFICATION_TEXT_MAX_CHARS = 400;
    const RUN_DELAY_MS     = 800;
    const SNAPSHOT_COOLDOWN_MS = 30 * 60 * 1000; // freeze baseline for 30 min against quick reloads
    const DEBUG_LOG_KEY         = 'dbmrpp.debugLog.v1';
    const DEBUG_LOG_MAX_ENTRIES = 500;
    const RENDER_CACHE_KEY      = 'dbmrpp.renderCache.v3';
    const CHANGE_LOG_KEY         = 'dbmrpp.changeLog.v1';
    const CHANGE_LOG_MAX_ENTRIES = 500;
    const WEBDAV_CONFIG_KEY              = 'dbmrpp.webdavConfig.v1';
    const WEBDAV_SYNC_STATE_KEY          = 'dbmrpp.webdavSyncState.v1';
    const CALDAV_CONFIG_KEY              = 'dbmrpp.caldavConfig.v1';
    const CALDAV_SYNC_STATE_KEY          = 'dbmrpp.caldavSyncState.v1';
    const SETTINGS_UPDATED_AT_KEY        = 'dbmrpp.settingsUpdatedAt';
    const TAG_ASSIGNMENTS_UPDATED_AT_KEY = 'dbmrpp.tagAssignmentsUpdatedAt';
    const TRIP_NOTES_UPDATED_AT_KEY      = 'dbmrpp.tripNotesUpdatedAt';
    const FGR_CLAIMS_UPDATED_AT_KEY      = 'dbmrpp.fgrClaimsUpdatedAt';
    const DIFF_WATCHED     = ['zugbindung','status','relevanteAbweichung','alternativensuche',
                              'departure','arrival','departureRt','arrivalRt',
                              'departureTrack','departureTrackRt','arrivalTrack','arrivalTrackRt','zuege','seats',
                              'leistungsname','storniertStatus','auftragStatus',
                              'sitzplatzStorniert','stellplatzStorniert'];
    
    // Language: English on int.bahn.de, German otherwise
    const IS_INT      = location.hostname.startsWith('int.');
    const DATE_LOCALE = IS_INT ? 'en-GB' : 'de-DE';

    // =========================================================
    // 2) Translations
    // =========================================================
    const T = (() => {
        const en = {
            title:             'DB My Trips++',
            ttReload:          'Reload',
            ttIcsBulk:         'Download all visible trips as ICS',
            ttCsv:             'Download all visible trips as CSV',
            ttReset:           'Reset trips snapshot',
            ttSettings:        'Settings',
            ttClose:           'Close',
            ttReleaseLog:      'Open changelog',
            staleHint:         'refreshing…',
            ttStaleHint:       'Showing cached data — current data is being loaded',
            staleAsOf:         'as of',
            settingsTitle:     'Settings',
            settingsRememberFilter: 'Remember filters',
            settingsOpenOnLoad: 'Open panel on page load',
            settingsShowJsonButton: 'Show JSON download button {…}',
            settingsShowJsonButtonDesc: 'Shows a button on each trip card to download the complete raw API responses as a combined JSON file.',
            settingsShowGeoButton:  'Show geo export button 🛤️',
            settingsShowGeoButtonDesc: 'Shows a button on each trip card to export the route geometry as a GPX or GeoJSON file. The Bahn API only provides this for future trips.',
            settingsGeoFormat:      'Export format',
            settingsGeoFormatGpx:   'GPX',
            settingsGeoFormatGeojson: 'GeoJSON',
            settingsExportSnapshot: 'Export snapshot',
            settingsImportSnapshot: 'Import snapshot',
            settingsTrainLinksEnabled: 'Link train numbers externally',
            settingsTrainLinksDesc: 'Makes train numbers in the trip view clickable links to an external service. Zugfinder.net has data on delays. Bahn.expert has more real-time data and shows the historical delay data for specific past trips.',
            settingsTrainLinkProvider: 'Train link provider',
            settingsTrainProviderZugfinder: 'zugfinder.net',
            settingsTrainProviderBahnExpert: 'bahn.expert',
            settingsShowRoutingButton: 'Show external routing button 🧭',
            settingsShowRoutingButtonDesc: 'Shows a button on each trip card that opens the connection in an external routing service, offering different features. The routing links are generated based heuristically on the available trip data, some providers might not work for all trips or the generated connections might differ from the actual trip.',
            settingsRoutingLinkProvider: 'Route link provider',
            settingsRoutingProviderBahnExpert: 'bahn.expert',
            settingsRoutingProviderChuuchuu: 'chuuchuu',
            settingsRoutingProviderTransitous: 'transitous.org',
            settingsShowCancelledTrips: 'Show cancelled trips',
            settingsShowCancelledTripsDesc: 'If disabled, fully cancelled trips are hidden in both the upcoming and past view. Partially cancelled trips are always shown.',
            settingsGroupGeneral:       'General',
            settingsGroupPast:          'Past view',
            settingsGroupTripExports:        'Trip exports',
            settingsGroupExternalLinks: 'External data links',
            settingsGroupData:          'Snapshot Data',
            settingsGroupDev:           'Developer options',
            settingsDownloadBulkJson:   'Download bulk API JSON',
            bulkJsonStillLoading:       'Data is still loading - please try again in a moment.',
            settingsDebugLogging:       'Enable debug logging',
            settingsDebugLoggingDesc:   'Logs navigation, lifecycle, and API events to localStorage so you can read them after a reload.',
            settingsDebugLogCopy:       'Copy log',
            settingsDebugLogClear:      'Clear log',
            settingsDebugLogEntries:    n => `${n} entr${n === 1 ? 'y' : 'ies'} stored`,
            settingsUsePastCacheLabel:  'Enhance past view from cache 🗄️',
            settingsUsePastCacheDesc:   'Can display trip details from previous visits, including for trips no longer present in the past trips API response. Only works if panel was loaded at least once before the trip.',
            fromAll:           'From (all)',
            toAll:             'To (all)',
            dayAll:            'All',
            dayN:              n => `${n}D`,
            onlyIssues:        '⚠ Issues only',
            tabUpcoming:       'Upcoming',
            tabPast:           'Past',
            tabChanges:        'Changes',
            noTrips:           'No trips.',
            noTripsFilter:     'No trips for this filter.',
            changesSince:      d => `Changes since ${d}`,
            noChangesSince:    d => `No changes since ${d}`,
            changesNew:        n => `New (${n})`,
            changesRemoved:    'Removed',
            changeLogNew:      'New',
            changeLogEmpty:    'No tracked changes yet. Detected changes are collected here.',
            changeLogClear:    'Clear',
            ttChangeLogClear:  'Delete all collected changes',
            neverVisited:      'never',
            tagsLabel:         'Tags',
            panelLoading:      'Loading…',
            tagClass1:         '1st class',
            tagStorniert:         'Cancelled',
            tagTeilweiseStorniert:'Partially cancelled',
            tagAuftragStatusLabel: 'Order',
            tagZugbindung:     'Train binding lifted',
            tagNotRecon:       'Not reconstructable',
            tagGebrochen:      'Connection broken',
            tagBeingReplanned: 'Connection is being replanned',
            tagMustReroute:     'Connection not available',
            tagAltPossible:    'Alternatives available',
            tagDisruption:     'Disruption',
            tagSaved:          'Saved',
            tagWiederholend:   'Recurring',
            tagSeatCancelled:  'Seat cancelled',
            tagBikeCancelled:  'Bike spot cancelled',
            tagReservationOnly: 'Reservation only',
            tagPartFare:       'Part fare',
            tagRegionalTicket: 'Regional ticket',
            tagRerouted:       'Itinerary changed',
            tagReroutedByUser: 'Alternative chosen',
            tagReassigned:     'Seat reassigned',
            tagMuted:          '🔕 No alerts',
            tagAuftragStatus:  s => `Order: ${s}`,
            settingsCustomTags:       'Custom tags setup',
            customTagNamePlaceholder: 'Tag label',
            customTagAdd:             'Add',
            customTagColorInfo:       'Blue',
            customTagColorOk:         'Green',
            customTagColorWarn:       'Yellow',
            customTagColorBad:        'Red',
            customTagDeleteTt:        'Delete tag',
            customTagEditTt:          'Edit tag',
            customTagAssignTt:        'Assign custom tags',
            noteTt:                   'Edit note',
            notePlaceholder:          'Add a note…',
            cacheLabel:        '🗄️ Cache',
            cacheNotificationsLabel: 'Notifications',
            cacheDelayDeparture: 'Departure delay',
            cacheDelayArrival:   'Arrival delay',
            cacheCapturedAt:   d => `🕒 Captured on ${d}`,
            cacheMissing:      'ℹ️ No cached trip details available.',
            planChangedFrom:   'was',
            metaValidLabel:    'Valid:',
            metaPlatform:      'Pl.',
            metaPersons:       n => `${n} persons`,
            metaOrder:         nr => `Order #${nr}`,
            metaBooked:        d => `booked ${d}`,
            metaValidRange:    (a, b) => `Valid ${a}–${b}`,
            metaRecurringName: n => `Series: ${n}`,
            icsTooltip:        'Download ICS file',
            pdfTooltip:        'Download ticket PDF',
            shareTooltip:      'Share connection',
            routeTooltip:      'Open route externally',
            rawJsonTooltip:    'Download complete raw API JSON',
            gpxTooltip:        'Download GPX track',
            geojsonTooltip:    'Download GeoJSON track',
            deleteCachedTripTooltip: 'Delete trip from script cache',
            shareCopied:       '✓ Copied!',
            shareError:        'Share failed — see console.',
            routeError:        'External route link failed — see console.',
            rawJsonError:      'Raw JSON download failed — see console.',
            geoError:          'Geo data download failed — see console.',
            geoNoData:         'No route geometry available for geo data export.',
            abweichungTooltip: 'Show disruption details',
            abweichungNone:    'No current alerts.',
            abweichungError:   'Failed to load — see console.',
            fgrBtnTooltip:     'Passenger rights claim filed? (§)',
            fgrNone:           'No passenger rights claim filed.',
            fgrError:          'Failed to load — see console.',
            fgrClaim:          (date, ids) => `§ Claim filed ${date} · ${ids.join(', ')}`,
            fieldLabels: {
                zugbindung:          'Train binding',
                status:              'Status',
                relevanteAbweichung: 'Disruption',
                alternativensuche:   'Alternatives',
                departure:           'Departure',
                arrival:             'Arrival',
                departureRt:         'Departure (actual)',
                arrivalRt:           'Arrival (actual)',
                departureTrack:      'Departure platform',
                departureTrackRt:    'Departure platform (actual)',
                arrivalTrack:        'Arrival platform',
                arrivalTrackRt:      'Arrival platform (actual)',
                zuege:               'Trains',
                seats:               'Reservations',
                leistungsname:       'Fare',
                storniertStatus:     'Cancellation',
                auftragStatus:       'Order status',
                sitzplatzStorniert:  'Seat cancelled',
                stellplatzStorniert: 'Bike spot cancelled'
            },
            storno: {
                STORNIERT:           'Cancelled',
                TEILWEISE_STORNIERT: 'Partially cancelled'
            },
            // User-facing labels for raw API enum values in the change block,
            // keyed per diff field. Unmapped values fall back to the raw string.
            diffValues: {
                status: {
                    FAHRBAR:                          'OK',
                    ABGESCHLOSSEN:                    'Completed',
                    NICHT_REKONSTRUIERBAR:            'Not reconstructable',
                    GEBROCHEN:                        'Connection broken',
                    VORLAEUFIG_NICHT_REKONSTRUIERBAR: 'Connection is being replanned'
                },
                zugbindung: {
                    BESTEHT:    'in effect',
                    AUFGEHOBEN: 'lifted'
                },
                alternativensuche: {
                    ALTERNATIVEN_KEINE: 'not needed',
                    ALTERNATIVEN_KANN:  'Alternatives available',
                    ALTERNATIVEN_MUSS:  'Connection not available'
                },
                storniertStatus: {
                    NICHT_STORNIERT:     'Not cancelled',
                    STORNIERT:           'Cancelled',
                    TEILWEISE_STORNIERT: 'Partially cancelled'
                },
                auftragStatus: {
                    ABGESCHLOSSEN: 'Completed'
                }
            },
            settingsGroupSync:          'Sync',
            settingsWebDavEnabled:      'Enable WebDAV sync',
            settingsWebDavSyncDesc:     'Syncs history, tags, and notes to a WebDAV file (e.g. on Nextcloud). Enter the full URL to the sync file. Credentials are stored locally only and are never synced.',
            settingsWebDavUrl:          'File URL',
            settingsWebDavUsername:     'Username',
            settingsWebDavPassword:     'Password',
            settingsWebDavSave:         'Save',
            settingsWebDavSyncNow:      'Sync now',
            webDavStatusNever:          'Not synced yet.',
            webDavStatusSyncing:        'Syncing…',
            webDavStatusOk:             d => `Synced ${d}`,
            webDavStatusError:          e => `Sync error: ${e}`,
            settingsCalDavEnabled:      'Enable CalDAV push',
            settingsCalDavSyncDesc:     'Pushes trips as calendar events to a CalDAV calendar. Enter the full URL to the calendar collection. Events are only pushed from here to the calendar, never the other way around.',
            settingsCalDavUrl:          'Calendar URL',
            settingsCalDavUsername:     'Username',
            settingsCalDavPassword:     'Password',
            settingsCalDavSave:         'Save',
            settingsCalDavSyncNow:      'Push now',
            settingsCalDavIncludePast:  'Push past trips',
            settingsCalDavIncludePastDesc: 'Also pushes trips to the calendar that have already departed (up to ~14 months back, based on order history).',
            settingsCalDavIncludeLeistung: 'Push add-on tickets (e.g. bike day tickets)',
            settingsCalDavIncludeLeistungDesc: 'Pushes standalone add-on products (bike day tickets, etc.) as all-day calendar events on the date they are valid.',
            settingsCalDavIncludeCached: 'Include saved trips from cache',
            settingsCalDavIncludeCachedDesc: 'Also pushes trips to the calendar that are only available from the local cache (previously visited trips no longer returned by the DB API). Requires "Enhance past view from cache" to have been used before.',
            calDavStatusNever:          'Not pushed yet.',
            calDavStatusSyncing:        'Pushing…',
            calDavStatusOk:             d => `Pushed ${d}`,
            calDavStatusError:          e => `Push error: ${e}`,
            alertIcsNoAuftrag:   'ICS export not possible: order number or last name missing.',
            alertIcsUnknownType: 'Unknown trip type.',
            alertIcsFailed:      c => `ICS export failed (HTTP ${c}). See console for details.`,
            alertIcsNoSegs:      'No connections found in the detail response.',
            alertIcsBadFormat:   'Unexpected ICS response format — see console.',
            alertIcsError:       'ICS export failed — see console.',
            alertPdfNoId:        'PDF download not possible: bundle ID missing.',
            alertPdfError:       'PDF download failed — see console.',
            alertNoTripsExport:  'No trips to export.',
            alertResetConfirm:   'Delete snapshot? All trips will appear as new on next load.',
            alertChangeLogClearConfirm: 'Delete all collected changes? Cannot be undone.',
            alertDeleteCachedTripConfirm: 'Delete cached details for this trip? Only affects local script cache, not the website data. Cannot be undone.',
            alertImportMergeConfirm: 'Import snapshot and merge with local snapshot/settings (newest wins)?',
            alertImportInvalid:  'Invalid import file. Expected snapshot + settings export JSON.',
            alertImportError:    'Snapshot import failed — see console.',
            alertImportSuccess:  'Snapshot import completed.',
            alertExportError:    'Snapshot export failed — see console.',
            icsDescTrains:       t => `Trains: ${t}`,
            icsDescOrder:        n => `Order: ${n}`,
            icsDescSeat:         s => `Seat: ${s}`,
            icsDescZugbindung:   'Train binding lifted',
            icsDescLink:         url => `Details: ${url}`,
            csvHeaders: [
                'Date', 'Departure', 'Arrival', 'Departure (actual)', 'Arrival (actual)',
                'From', 'To', 'Departure platform', 'Arrival platform', 'Trains',
                'Fare', 'Class', 'Class (API)', 'Type',
                'Order number', 'Booked on', 'Booked by',
                'Train binding', 'Cancellation status', 'Order status', 'Status',
                'Seats', 'Seat available', 'Seat cancelled', 'Bike spot available', 'Bike spot cancelled', 'Reservation only',
                'CityTicket', 'Regional add-on', 'Regional code', 'Part fare',
                'Valid from', 'Valid until',
                'Disruption', 'Alternatives',
                'Travellers',
                'UUID', 'KundenwunschID', 'LeistungsbuendelID',
                'Notifications', 'Seat reassigned', 'Itinerary changed',
                'From (ID)', 'To (ID)',
                'Alert name', 'Recurring (days)', 'Recurring (until)',
                'Tags', 'Notes'
            ]
        };
        const de = {
            title:             'DB Meine Reisen++',
            ttReload:          'Neu laden',
            ttIcsBulk:         'Alle sichtbaren Reisen als ICS herunterladen',
            ttCsv:             'Alle sichtbaren Reisen als CSV herunterladen',
            ttReset:           'Reisen-Snapshot zurücksetzen',
            ttSettings:        'Einstellungen',
            ttClose:           'Schließen',
            ttReleaseLog:      'Changelog öffnen',
            staleHint:         'aktualisiere…',
            ttStaleHint:       'Zeigt zwischengespeicherte Daten – aktuelle Daten werden geladen',
            staleAsOf:         'Stand',
            settingsTitle:     'Einstellungen',
            settingsRememberFilter: 'Filter merken',
            settingsOpenOnLoad: 'Panel beim Laden öffnen',
            settingsShowJsonButton: 'JSON-Download-Button anzeigen {…}',
            settingsShowJsonButtonDesc: 'Zeigt bei jeder Reise einen Button, mit dem die vollständigen Bulk-API-Rohantworten als kombinierte JSON-Datei heruntergeladen werden kann.',
            settingsShowGeoButton:  'Geo-Export-Button anzeigen 🛤️',
            settingsShowGeoButtonDesc: 'Zeigt bei jeder Reise einen Button zum Export der Streckengeometrie als GPX- oder GeoJSON-Datei. Die Bahn-API liefert das nur für zukünftige Reisen aus.',
            settingsGeoFormat:      'Exportformat',
            settingsGeoFormatGpx:   'GPX',
            settingsGeoFormatGeojson: 'GeoJSON',
            settingsExportSnapshot: 'Snapshot exportieren',
            settingsImportSnapshot: 'Snapshot importieren',
            settingsTrainLinksEnabled: 'Zugnummern extern verlinken',
            settingsTrainLinksDesc: 'Macht Zugnummern in der Reiseansicht zu anklickbaren Links zu einem externen Dienst. Zugfinder.net hat Daten zu Verspätungen. Bahn.expert hat mehr Echtzeitdaten und zeigt auch historische Verspätungsdaten für spezifische vergangene Fahrten an.',
            settingsTrainLinkProvider: 'Anbieter für Zuglinks',
            settingsTrainProviderZugfinder: 'zugfinder.net',
            settingsTrainProviderBahnExpert: 'bahn.expert',
            settingsShowRoutingButton: 'Externen Routing-Button anzeigen 🧭',
            settingsShowRoutingButtonDesc: 'Zeigt bei jeder Reise einen Button, der die Verbindung in einem externen Routing-Dienst mit variierenden Funktionen öffnet. Die Routing-Links werden heuristisch mit den verfügbaren Reisedaten generiert. Es kann also sein, dass bei manchen Reisen nicht alle Anbieter funktionieren oder dass die generierten Verbindungen von der tatsächlichen Reise abweichen.',
            settingsRoutingLinkProvider: 'Anbieter für Routing-Links',
            settingsRoutingProviderBahnExpert: 'bahn.expert',
            settingsRoutingProviderChuuchuu: 'chuuchuu',
            settingsRoutingProviderTransitous: 'transitous.org',
            settingsShowCancelledTrips: 'Stornierte Reisen anzeigen',
            settingsShowCancelledTripsDesc: 'Wenn deaktiviert, werden vollständig stornierte Reisen weder in der bevorstehenden noch in der vergangenen Ansicht angezeigt. Teilweise stornierte Reisen werden immer angezeigt.',
            settingsGroupGeneral:       'Allgemein',
            settingsGroupPast:          'Vergangenheitsansicht',
            settingsGroupTripExports:        'Reisen-Exporte',
            settingsGroupExternalLinks: 'Externe Datenlinks',
            settingsGroupData:          'Snapshot-Daten',
            settingsGroupDev:           'Entwickleroptionen',
            settingsDownloadBulkJson:   'Bulk-API-JSON herunterladen',
            bulkJsonStillLoading:       'Daten werden noch geladen - bitte versuche es gleich nochmal.',
            settingsDebugLogging:       'Debug-Logging aktivieren',
            settingsDebugLoggingDesc:   'Protokolliert Navigation, Skript-Lebenszyklus und API-Aufrufe in localStorage, damit du sie auch nach einem Reload lesen kannst.',
            settingsDebugLogCopy:       'Log kopieren',
            settingsDebugLogClear:      'Log löschen',
            settingsDebugLogEntries:    n => `${n} Eintr${n === 1 ? 'ag' : 'äge'} gespeichert`,
            settingsUsePastCacheLabel:  'Vergangenheitsansicht mit Cache anreichern 🗄️',
            settingsUsePastCacheDesc:   'Kann Reisedetails aus vorherigen Besuchen anzeigen, auch für Reisen, die nicht mehr in der API-Antwort zu vergangenen Reisen enthalten sind. Funktioniert nur, wenn das Panel vor der Fahrt mindestens einmal geöffnet wurde.',
            fromAll:           'Von (alle)',
            toAll:             'Nach (alle)',
            dayAll:            'Alle',
            dayN:              n => `${n}T`,
            onlyIssues:        '⚠ Mit Problem',
            tabUpcoming:       'Bevorstehend',
            tabPast:           'Vergangen',
            tabChanges:        'Änderungen',
            noTrips:           'Keine Reisen.',
            noTripsFilter:     'Keine Reisen für diesen Filter.',
            changesSince:      d => `Änderungen seit ${d}`,
            noChangesSince:    d => `Keine Änderungen seit ${d}`,
            changesNew:        n => `Neu (${n})`,
            changesRemoved:    'Entfernt',
            changeLogNew:      'Neu',
            changeLogEmpty:    'Noch keine gesammelten Änderungen. Erkannte Änderungen werden hier gesammelt.',
            changeLogClear:    'Leeren',
            ttChangeLogClear:  'Alle gesammelten Änderungen löschen',
            neverVisited:      'noch nie',
            tagsLabel:         'Tags',
            panelLoading:      'Lade…',
            tagClass1:         '1. Klasse',
            tagStorniert:         'Storniert',
            tagTeilweiseStorniert:'Teilweise storniert',
            tagAuftragStatusLabel: 'Auftrag',
            tagZugbindung:     'Zugbindung aufgehoben',
            tagNotRecon:       'Nicht rekonstruierbar',
            tagGebrochen:      'Verbindung gebrochen',
            tagBeingReplanned: 'Verbindung wird umgeplant',
            tagMustReroute:     'Verbindung nicht möglich',
            tagAltPossible:    'Alternative möglich',
            tagDisruption:     'Abweichung',
            tagSaved:          'Gemerkt',
            tagWiederholend:   'Wiederholend',
            tagSeatCancelled:  'Sitzplatz storniert',
            tagBikeCancelled:  'Stellplatz storniert',
            tagReservationOnly: 'Nur Reservierung',
            tagPartFare:       'Teilpreis',
            tagRegionalTicket: 'Verbundticket',
            tagRerouted:       'Reiseplan geändert',
            tagReroutedByUser: 'Alternative gewählt',
            tagReassigned:     'Umplatziert',
            tagMuted:          '🔕 Keine Benachrichtigungen',
            tagAuftragStatus:  s => `Auftrag: ${s}`,
            settingsCustomTags:       'Eigene Tags definieren',
            customTagNamePlaceholder: 'Tag-Label',
            customTagAdd:             'Hinzufügen',
            customTagColorInfo:       'Blau',
            customTagColorOk:         'Grün',
            customTagColorWarn:       'Gelb',
            customTagColorBad:        'Rot',
            customTagDeleteTt:        'Tag löschen',
            customTagEditTt:          'Tag bearbeiten',
            customTagAssignTt:        'Eigene Tags zuweisen',
            noteTt:                   'Notiz bearbeiten',
            notePlaceholder:          'Notiz hinzufügen…',
            cacheLabel:        '🗄️ Cache',
            cacheNotificationsLabel: 'Benachrichtigungen',
            cacheDelayDeparture: 'Verspaetung Abfahrt',
            cacheDelayArrival:   'Verspaetung Ankunft',
            cacheCapturedAt:   d => `Erfasst am ${d}`,
            cacheMissing:      'Keine zwischengespeicherten Reisedetails verfügbar.',
            planChangedFrom:   'war',
            metaValidLabel:    'Gültig:',
            metaPlatform:      'Gl.',
            metaPersons:       n => `${n} Personen`,
            metaOrder:         nr => `Auftrag #${nr}`,
            metaBooked:        d => `gebucht ${d}`,
            metaValidRange:    (a, b) => `Gültig ${a}–${b}`,
            metaRecurringName: n => `Serie: ${n}`,
            icsTooltip:        'ICS-Datei herunterladen',
            pdfTooltip:        'Ticket-PDF herunterladen',
            shareTooltip:      'Verbindung teilen',
            routeTooltip:      'Route extern öffnen',
            rawJsonTooltip:    'Vollständiges Raw-API-JSON herunterladen',
            gpxTooltip:        'GPX-Track herunterladen',
            geojsonTooltip:    'GeoJSON-Track herunterladen',
            deleteCachedTripTooltip:     'Reise aus Skript-Cache löschen',
            shareCopied:       '✓ Link kopiert!',
            shareError:        'Teilen fehlgeschlagen — siehe Konsole.',
            routeError:        'Externer Routing-Link fehlgeschlagen — siehe Konsole.',
            rawJsonError:      'Raw-JSON-Download fehlgeschlagen — siehe Konsole.',
            geoError:          'Geo-Daten-Download fehlgeschlagen — siehe Konsole.',
            geoNoData:         'Keine Streckengeometrie für Geo-Daten-Export verfügbar.',
            abweichungTooltip: 'Abweichungsdetails anzeigen',
            abweichungNone:    'Keine aktuellen Meldungen.',
            abweichungError:   'Laden fehlgeschlagen — siehe Konsole.',
            fgrBtnTooltip:     'Fahrgastrechte-Antrag gestellt? (§)',
            fgrNone:           'Kein Fahrgastrechte-Antrag gestellt.',
            fgrError:          'Laden fehlgeschlagen — siehe Konsole.',
            fgrClaim:          (date, ids) => `§ Antrag vom ${date} · ${ids.join(', ')}`,
            fieldLabels: {
                zugbindung:          'Zugbindung',
                status:              'Status',
                relevanteAbweichung: 'Relevante Abweichung',
                alternativensuche:   'Alternativensuche',
                departure:           'Abfahrt',
                arrival:             'Ankunft',
                departureRt:         'Abfahrt (aktuell)',
                arrivalRt:           'Ankunft (aktuell)',
                departureTrack:      'Gleis Abfahrt',
                departureTrackRt:    'Gleis Abfahrt (aktuell)',
                arrivalTrack:        'Gleis Ankunft',
                arrivalTrackRt:      'Gleis Ankunft (aktuell)',
                zuege:               'Züge',
                seats:               'Reservierungen',
                leistungsname:       'Tarif',
                storniertStatus:     'Stornierungsstatus',
                auftragStatus:       'Auftragsstatus',
                sitzplatzStorniert:  'Sitzplatz storniert',
                stellplatzStorniert: 'Stellplatz storniert'
            },
            storno: {
                STORNIERT:           'Storniert',
                TEILWEISE_STORNIERT: 'Teilweise storniert'
            },
            diffValues: {
                status: {
                    FAHRBAR:                          'Fahrbar',
                    ABGESCHLOSSEN:                    'Abgeschlossen',
                    NICHT_REKONSTRUIERBAR:            'Nicht rekonstruierbar',
                    GEBROCHEN:                        'Verbindung gebrochen',
                    VORLAEUFIG_NICHT_REKONSTRUIERBAR: 'Verbindung wird umgeplant'
                },
                zugbindung: {
                    BESTEHT:    'besteht',
                    AUFGEHOBEN: 'aufgehoben'
                },
                alternativensuche: {
                    ALTERNATIVEN_KEINE: 'nicht nötig',
                    ALTERNATIVEN_KANN:  'Alternative möglich',
                    ALTERNATIVEN_MUSS:  'Verbindung nicht möglich'
                },
                storniertStatus: {
                    NICHT_STORNIERT:     'Nicht storniert',
                    STORNIERT:           'Storniert',
                    TEILWEISE_STORNIERT: 'Teilweise storniert'
                },
                auftragStatus: {
                    ABGESCHLOSSEN: 'Abgeschlossen'
                }
            },
            settingsGroupSync:          'Synchronisierung',
            settingsWebDavEnabled:      'WebDAV-Sync aktivieren',
            settingsWebDavSyncDesc:     'Synchronisiert Verlauf, Tags und Notizen mit einer WebDAV-Datei (z. B. auf Nextcloud). Die vollständige URL zur Sync-Datei angeben. Zugangsdaten werden nur lokal gespeichert und niemals synchronisiert.',
            settingsWebDavUrl:          'Datei-URL',
            settingsWebDavUsername:     'Benutzername',
            settingsWebDavPassword:     'Passwort',
            settingsWebDavSave:         'Speichern',
            settingsWebDavSyncNow:      'Jetzt synchronisieren',
            webDavStatusNever:          'Noch nicht synchronisiert.',
            webDavStatusSyncing:        'Synchronisiere…',
            webDavStatusOk:             d => `Synchronisiert ${d}`,
            webDavStatusError:          e => `Sync-Fehler: ${e}`,
            settingsCalDavEnabled:      'CalDAV-Push aktivieren',
            settingsCalDavSyncDesc:     'Überträgt Reisen als Kalendereinträge auf einen CalDAV-Kalender. Die vollständige URL zur Kalendersammlung angeben. Ereignisse werden nur von hier in den Kalender übertragen, niemals zurück.',
            settingsCalDavUrl:          'Kalender-URL',
            settingsCalDavUsername:     'Benutzername',
            settingsCalDavPassword:     'Passwort',
            settingsCalDavSave:         'Speichern',
            settingsCalDavSyncNow:      'Jetzt übertragen',
            settingsCalDavIncludePast:  'Vergangene Reisen in Kalender übertragen',
            settingsCalDavIncludePastDesc: 'Überträgt auch bereits absolvierte Reisen (bis zu ca. 14 Monate, basierend auf dem Auftragsverlauf).',
            settingsCalDavIncludeLeistung: 'Zusatztickets übertragen (z. B. Fahrradtageskarten)',
            settingsCalDavIncludeLeistungDesc: 'Überträgt eigenständige Zusatzprodukte (Fahrradtageskarten etc.) als ganztägige Kalendereinträge für den jeweiligen Gültigkeitstag.',
            settingsCalDavIncludeCached: 'Gespeicherte Reisen aus Cache einschließen',
            settingsCalDavIncludeCachedDesc: 'Überträgt auch Reisen in den Kalender, die nur im lokalen Cache verfügbar sind (früher besuchte Reisen, die von der DB-API nicht mehr zurückgegeben werden). Erfordert, dass zuvor die Option „Vergangenheitsansicht mit Cache anreichern" genutzt wurde.',
            calDavStatusNever:          'Noch nicht übertragen.',
            calDavStatusSyncing:        'Übertrage…',
            calDavStatusOk:             d => `Übertragen ${d}`,
            calDavStatusError:          e => `Übertragungs-Fehler: ${e}`,
            alertIcsNoAuftrag:   'ICS-Export nicht möglich: Auftragsnummer oder Nachname fehlt.',
            alertIcsUnknownType: 'Unbekannter Reisetyp.',
            alertIcsFailed:      c => `ICS-Export fehlgeschlagen (HTTP ${c}). Details in der Konsole.`,
            alertIcsNoSegs:      'Keine Zugverbindungen in der Detail-Antwort gefunden.',
            alertIcsBadFormat:   'ICS-Antwort hat unerwartetes Format – siehe Konsole.',
            alertIcsError:       'ICS-Export fehlgeschlagen – siehe Konsole.',
            alertPdfNoId:        'PDF-Download nicht möglich: leistungsbuendelId fehlt.',
            alertPdfError:       'PDF-Download fehlgeschlagen – siehe Konsole.',
            alertNoTripsExport:  'Keine Reisen zum Exportieren.',
            alertResetConfirm:   'Snapshot löschen? Beim nächsten Laden gelten alle Reisen als neu.',
            alertChangeLogClearConfirm: 'Alle gesammelten Änderungen löschen? Kann nicht rückgängig gemacht werden.',
            alertDeleteCachedTripConfirm: 'Zwischengespeicherte Details für diese Reise löschen? Betrifft nur den lokalen Skript-Cache, nicht die Daten der Webseite. Kann nicht rückgängig gemacht werden.',
            alertImportMergeConfirm: 'Snapshot importieren und mit lokalem Snapshot/Einstellungen zusammenfuehren (neuester Stand gewinnt)?',
            alertImportInvalid:  'Ungültige Import-Datei. Erwartet wird ein Snapshot+Settings-Export-JSON.',
            alertImportError:    'Snapshot-Import fehlgeschlagen — siehe Konsole.',
            alertImportSuccess:  'Snapshot-Import abgeschlossen.',
            alertExportError:    'Snapshot-Export fehlgeschlagen — siehe Konsole.',
            icsDescTrains:       t => `Züge: ${t}`,
            icsDescOrder:        n => `Auftrag: ${n}`,
            icsDescSeat:         s => `Sitzplatz: ${s}`,
            icsDescZugbindung:   'Zugbindung aufgehoben',
            icsDescLink:         url => `Details: ${url}`,
            csvHeaders: [
                'Datum', 'Abfahrt', 'Ankunft', 'Abfahrt aktuell', 'Ankunft aktuell',
                'Von', 'Nach', 'Gleis Abfahrt', 'Gleis Ankunft', 'Züge',
                'Tarif', 'Klasse', 'Klasse (API)', 'Typ',
                'Auftragsnummer', 'Gebucht am', 'Gebucht von',
                'Zugbindung', 'Stornierungsstatus', 'Auftragsstatus', 'Status',
                'Plätze', 'Sitzplatz vorhanden', 'Sitzplatz storniert',
                'Stellplatz vorhanden', 'Stellplatz storniert', 'Nur Reservierung',
                'CityTicket', 'Verbundticket', 'Verbund-Code', 'Teilpreis',
                'Gültig von', 'Gültig bis',
                'Relevante Abweichung', 'Alternativensuche',
                'Reisende',
                'UUID', 'KundenwunschID', 'LeistungsbuendelID',
                'Benachrichtigungen', 'Umplatziert', 'Reiseplan geändert',
                'Von (ID)', 'Nach (ID)',
                'Abo-Name', 'Wiederholung (Tage)', 'Wiederholung (bis)',
                'Tags', 'Notizen'
            ]
        };
        return IS_INT ? en : de;
    })();

    // =========================================================
    // 3) Module-level state
    // =========================================================
    let bearerToken    = null;
    let kundenprofilId = localStorage.getItem(KUNDENPROFIL_KEY) || null;
    let alreadyRan     = false;
    let runInProgress   = false;
    let runTimerId      = null;
    let lastRenderArgs  = null;
    let filterState     = { from: '', to: '', days: 0, onlyProblems: false, tags: [] };
    let uiSettings      = loadUiSettings();
    let settingsOpen    = false;
    let activeView      = 'current';
    let pastTrips       = null;
    let auftraegeCache  = null;
    let tripHistory = loadTripHistory();
    let customTagDefs        = loadCustomTagDefs();
    let customTagAssignments = loadCustomTagAssignments();
    let tripNotes            = loadTripNotes();
    let fgrClaims            = loadFgrClaims();
    let panelVisible    = !!uiSettings.openOnLoad;
    let dataIsStale     = false; // panel currently shows cached data; a refresh is pending
    let staleCachedAt   = null;  // cachedAt (ms) of the render cache currently on screen
    let rawReisekettenMap = new Map();
    let tokenSyncTimer  = null;
    let is401Recovering = false;
    let _debugBuffer    = [];
    let _debugFlushTimer = null;
    let webdavConfig    = loadWebDavConfig();
    let webdavSyncState = loadWebDavSyncState();
    let webdavSyncTimer = null;
    let caldavConfig    = loadCalDavConfig();
    let caldavSyncState = loadCalDavSyncState();
    let caldavSyncTimer = null;

    function loadUiSettings() { 
        const defaults = {
            rememberFilter: false,
            openOnLoad: false,
            usePastCache: false,
            showJsonButton: false,
            trainLinksEnabled: false,
            'traininfo-provider': 'bahn.expert',
            showRoutingButton: false,
            'routing-provider': 'bahn.expert',
            showGeoButton: false,
            'geo-format': 'gpx',
            debugLogging: false,
            showCancelledTrips: true
        };
        try {
            const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const rawProvider = parsed['traininfo-provider'] || parsed.trainLinkProvider;
            const provider = rawProvider === 'bahn.expert' || rawProvider === 'bahnexpert' ? 'bahn.expert' : 'zugfinder';
            const rawRoutingProvider = parsed['routing-provider'];
            const routingProvider = (rawRoutingProvider === 'chuuchuu' || rawRoutingProvider === 'transitous.org')
                ? rawRoutingProvider
                : 'bahn.expert';
            return {
                rememberFilter: !!parsed.rememberFilter,
                openOnLoad: !!parsed.openOnLoad,
                usePastCache: parsed.usePastCache === true,
                showJsonButton: parsed.showJsonButton !== false,
                trainLinksEnabled: !!parsed.trainLinksEnabled,
                'traininfo-provider': provider,
                showRoutingButton: parsed.showRoutingButton !== undefined
                    ? !!parsed.showRoutingButton
                    : !!parsed.routingLinksEnabled,
                'routing-provider': routingProvider,
                showGeoButton: parsed.showGeoButton !== false,
                'geo-format': parsed['geo-format'] === 'geojson' ? 'geojson' : 'gpx',
                debugLogging: !!parsed.debugLogging,
                showCancelledTrips: parsed.showCancelledTrips !== false
            };
        } catch (_) {
            return defaults;
        }
    }

    function saveUiSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(uiSettings));
            localStorage.setItem(SETTINGS_UPDATED_AT_KEY, new Date().toISOString());
        } catch (_) {}
    }

    function saveFilterState() {
        if (!uiSettings.rememberFilter) {
            try { localStorage.removeItem(FILTER_STATE_KEY); } catch (_) {}
            return;
        }
        try {
            localStorage.setItem(FILTER_STATE_KEY, JSON.stringify({
                from: filterState.from || '',
                to: filterState.to || '',
                days: Number(filterState.days) || 0,
                onlyProblems: !!filterState.onlyProblems,
                tags: Array.isArray(filterState.tags) ? filterState.tags.slice() : [],
                activeView
            }));
        } catch (_) {}
    }

    function loadFilterStateIfEnabled() {
        if (!uiSettings.rememberFilter) return;
        try {
            const parsed = JSON.parse(localStorage.getItem(FILTER_STATE_KEY) || '{}');
            filterState = {
                from: parsed.from || '',
                to: parsed.to || '',
                days: Number(parsed.days) || 0,
                onlyProblems: !!parsed.onlyProblems,
                tags: Array.isArray(parsed.tags) ? parsed.tags.slice() : []
            };
            if (['past', 'current', 'changes'].includes(parsed.activeView)) {
                activeView = parsed.activeView;
            }
        } catch (_) {}
    }

    function rememberUiState() {
        saveUiSettings();
        saveFilterState();
    }

    function loadCustomTagDefs() {
        try { return JSON.parse(localStorage.getItem(CUSTOM_TAG_DEFS_KEY) || '[]'); } catch (_) { return []; }
    }
    function saveCustomTagDefs() {
        try { localStorage.setItem(CUSTOM_TAG_DEFS_KEY, JSON.stringify(customTagDefs)); } catch (_) {}
    }
    function loadCustomTagAssignments() {
        try { return JSON.parse(localStorage.getItem(CUSTOM_TAG_ASSIGNMENTS_KEY) || '{}'); } catch (_) { return {}; }
    }
    function saveCustomTagAssignments() {
        try {
            localStorage.setItem(CUSTOM_TAG_ASSIGNMENTS_KEY, JSON.stringify(customTagAssignments));
            localStorage.setItem(TAG_ASSIGNMENTS_UPDATED_AT_KEY, new Date().toISOString());
        } catch (_) {}
    }
    function loadTripNotes() {
        try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch (_) { return {}; }
    }
    function saveTripNotes() {
        try {
            localStorage.setItem(NOTES_KEY, JSON.stringify(tripNotes));
            localStorage.setItem(TRIP_NOTES_UPDATED_AT_KEY, new Date().toISOString());
        } catch (_) {}
    }
    function loadFgrClaims() {
        try { return JSON.parse(localStorage.getItem(FGR_CLAIMS_KEY) || '{}'); } catch (_) { return {}; }
    }
    function saveFgrClaims() {
        try {
            localStorage.setItem(FGR_CLAIMS_KEY, JSON.stringify(fgrClaims));
            localStorage.setItem(FGR_CLAIMS_UPDATED_AT_KEY, new Date().toISOString());
        } catch (_) {}
    }
    function loadChangeLog() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CHANGE_LOG_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }
    function saveChangeLog(log) {
        try { localStorage.setItem(CHANGE_LOG_KEY, JSON.stringify(log)); } catch (_) {}
    }

    loadFilterStateIfEnabled();
    seedTripHistoryFromSnapshotStorage();

    // =========================================================
    // Debug logging (opt-in via settings)
    // =========================================================
    function dbLog(msg) {
        if (!uiSettings.debugLogging) return;
        const now = new Date();
        const t = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
        _debugBuffer.push(t + '  ' + msg);
        if (_debugFlushTimer === null) {
            _debugFlushTimer = setTimeout(flushDebugLog, 5000);
        }
    }

    function flushDebugLog() {
        _debugFlushTimer = null;
        if (!_debugBuffer.length) return;
        try {
            const existing = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || '[]');
            const combined = existing.concat(_debugBuffer);
            const trimmed = combined.length > DEBUG_LOG_MAX_ENTRIES
                ? combined.slice(combined.length - DEBUG_LOG_MAX_ENTRIES)
                : combined;
            localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(trimmed));
            _debugBuffer = [];
        } catch (_) {}
    }

    function clearDebugLog() {
        _debugBuffer = [];
        if (_debugFlushTimer !== null) { clearTimeout(_debugFlushTimer); _debugFlushTimer = null; }
        try { localStorage.removeItem(DEBUG_LOG_KEY); } catch (_) {}
    }

    // localStorage (not sessionStorage) so the panel can render instantly on a
    // fresh visit, long before the site's own JS has booted and a token exists.
    // Tagged with kundenprofilId so a cache written by another account is discarded.
    // No TTL: however old the data, it renders with the ⏳ stale hint (which
    // carries the cache timestamp) until the background refresh replaces it.
    function saveRenderCache(trips, orphans, changes, lastVisit) {
        try {
            localStorage.setItem(RENDER_CACHE_KEY, JSON.stringify({
                cachedAt: Date.now(),
                kundenprofilId,
                trips, orphans, changes, lastVisit
            }));
        } catch (_) {}
    }

    function loadRenderCache() {
        try {
            const raw = localStorage.getItem(RENDER_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.cachedAt) return null;
            if (parsed.kundenprofilId !== kundenprofilId) return null;
            return parsed;
        } catch (_) { return null; }
    }

    function clearRenderCache() {
        try { localStorage.removeItem(RENDER_CACHE_KEY); } catch (_) {}
    }

    // Cache for reiseketten (journey-chain) detail responses.
    // Share links and disruption details reuse the same endpoint.
    const detailCache = new Map(); // uuid → Promise<data>
    const auftragDetailCache = new Map(); // auftragsnummer -> Promise<data>

    // =========================================================
    // 4) Token-Capture
    // =========================================================
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            captureFromUrl(url);
            let headers;
            if (init && init.headers) headers = init.headers;
            else if (input && typeof input === 'object' && input.headers) headers = input.headers;
            captureFromHeaders(headers);
        } catch (_) {}
        const prom = origFetch(input, init);
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('/openid-connect/token')) {
                return prom.then(res => {
                    try {
                        res.clone().json().then(d => {
                            if (d && d.access_token) rememberToken('Bearer ' + d.access_token);
                        }).catch(() => {});
                    } catch (_) {}
                    return res;
                });
            }
            // Handle 401 responses to detect stale tokens
            return prom.then(res => {
                if (res.status === 401 && !url.includes('/openid-connect/token')) {
                    if (!is401Recovering) {
                        console.log('[DBMRPP] Detected 401 — token may be stale, attempting sync');
                        is401Recovering = true;
                        startTokenSync();
                    }
                }
                return res;
            });
        } catch (_) {}
        return prom;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        try { captureFromUrl(url); } catch (_) {}
        return origOpen.apply(this, arguments);
    };

    const origSetReqHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        try {
            if (name && name.toLowerCase() === 'authorization'
                && typeof value === 'string' && value.startsWith('Bearer ')) {
                rememberToken(value);
            }
        } catch (_) {}
        return origSetReqHeader.apply(this, arguments);
    };

    function captureFromUrl(url) {
        if (!url || typeof url !== 'string') return;
        const m = url.match(/[?&]kundenprofilId=([0-9a-fA-F-]+)/);
        if (m && m[1] && kundenprofilId !== m[1]) {
            if (kundenprofilId) clearRenderCache(); // account switch — cached render belongs to the old profile
            kundenprofilId = m[1];
            try { localStorage.setItem(KUNDENPROFIL_KEY, kundenprofilId); } catch (_) {}
        }
    }
     
    function captureFromHeaders(headers) {
        if (!headers) return;
        let auth = null;
        if (headers instanceof Headers) {
            auth = headers.get('authorization');
        } else if (Array.isArray(headers)) {
            const e = headers.find(h => Array.isArray(h) && h[0] && h[0].toLowerCase() === 'authorization');
            if (e) auth = e[1];
        } else if (typeof headers === 'object') {
            for (const k of Object.keys(headers)) {
                if (k.toLowerCase() === 'authorization') { auth = headers[k]; break; }
            }
        }
        if (auth && auth.startsWith('Bearer ')) rememberToken(auth);
    }

    function isTargetPath() {
        return location.pathname.includes('/buchung/reiseuebersicht');
    }

    function rememberToken(t) {
        if (bearerToken === t) return;
        bearerToken = t;
        is401Recovering = false;
        dbLog('token captured');
        // Only trigger run() when actually on the target page — @match now covers the
        // whole domain so token capture can happen on any bahn.de page.
        if (!alreadyRan && isTargetPath()) {
            alreadyRan = true;
            scheduleRun();
        }
    }

    // Attempt to synchronize the token from the website's current state.
    // The website may store the token in localStorage/sessionStorage or have it in memory.
    // This function observes incoming requests to capture any updated token.
    function startTokenSync() {
        if (tokenSyncTimer !== null) clearTimeout(tokenSyncTimer);
        // Wait 500ms then check if a new token has been captured from requests
        tokenSyncTimer = setTimeout(() => {
            tokenSyncTimer = null;
            is401Recovering = false;
        }, 500);
    }

    function scheduleRun() {
        if (!isTargetPath()) return;
        if (runTimerId !== null) clearTimeout(runTimerId);
        runTimerId = setTimeout(() => {
            runTimerId = null;
            run();
        }, RUN_DELAY_MS);
    }

    function cleanup() {
        dbLog('cleanup');
        flushDebugLog();
        panelVisible    = !!uiSettings.openOnLoad;
        settingsOpen    = false;
        runInProgress   = false;
        dataIsStale     = false;
        staleCachedAt   = null;
        if (runTimerId !== null) {
            clearTimeout(runTimerId);
            runTimerId = null;
        }
        if (tokenSyncTimer !== null) {
            clearTimeout(tokenSyncTimer);
            tokenSyncTimer = null;
        }
        is401Recovering = false;
        if (webdavSyncTimer !== null) { clearTimeout(webdavSyncTimer); webdavSyncTimer = null; }
        if (caldavSyncTimer  !== null) { clearTimeout(caldavSyncTimer);  caldavSyncTimer  = null; }
        lastRenderArgs  = null;
        pastTrips       = null;
        auftraegeCache  = null;
        rawReisekettenMap = new Map();
        detailCache.clear();
        auftragDetailCache.clear();
        filterState     = { from: '', to: '', days: 0, onlyProblems: false, tags: [] };
        activeView      = 'current';
        const root = document.getElementById('dbmrpp-root');
        if (root) root.remove();
        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.remove();
    }

    // Render the panel from the persistent cache as soon as we land on the target
    // page — needs no token, so the FAB is available long before the site's own JS
    // has booted and run() can refresh. The panel shows a "refreshing" hint until
    // run() replaces it with fresh data.
    function renderFromCacheEarly() {
        if (document.getElementById('dbmrpp-root')) return;
        const cache = loadRenderCache();
        if (!cache) return;
        dbLog('early render from cache (' + cache.trips.length + ' trips)');
        dataIsStale = true;
        staleCachedAt = cache.cachedAt;
        renderUI(cache.trips, cache.orphans, cache.changes, cache.lastVisit)
            .catch(err => dbLog('early render failed: ' + err.message));
    }

    function handleNavigation() {
        if (isTargetPath()) {
            dbLog('handleNavigation: on-target alreadyRan=' + alreadyRan + ' token=' + !!bearerToken);
            renderFromCacheEarly();
            // Token already captured (SPA nav from another page in same session) — trigger run
            if (!alreadyRan && bearerToken) {
                alreadyRan = true;
                scheduleRun();
            }
            // If !bearerToken: rememberToken() will fire when the page makes its first API call
        } else {
            dbLog('handleNavigation: off-target → cleanup (' + location.pathname + ')');
            // Navigated away — reset so the script re-runs on next visit to the target
            alreadyRan = false;
            cleanup();
        }
    }

    // Intercept SPA navigation (pushState / replaceState / popstate)
    const _origPush    = history.pushState.bind(history);
    const _origReplace = history.replaceState.bind(history);
    history.pushState = function (...args) { dbLog('pushState → ' + args[2]); _origPush(...args); handleNavigation(); };
    history.replaceState = function (...args) { dbLog('replaceState → ' + args[2]); _origReplace(...args); handleNavigation(); };
    window.addEventListener('popstate', () => { dbLog('popstate → ' + location.href); handleNavigation(); });
    window.addEventListener('beforeunload', () => { dbLog('beforeunload'); flushDebugLog(); });
    // Check immediately in case the script loads directly on the target URL
    // (token not captured yet — rememberToken will handle the actual run() trigger)
    handleNavigation();

    // =========================================================
    // 5) Authenticated fetch wrapper
    // =========================================================
    function dbFetch(url, init = {}) {
        const logUrl = url.split('?')[0];
        dbLog('fetch → ' + logUrl);
        const headers = Object.assign(
            { 'Authorization': bearerToken, 'Accept': 'application/json', ...(!IS_INT && { 'Accept-Language': 'de' }) },
            init.headers || {}
        );
        return origFetch(url, { ...init, headers, credentials: 'include' }).then(async res => {
            dbLog('fetch ← ' + res.status + ' ' + logUrl);
            // If we get a 401, the website has likely already refreshed its token.
            // Make a safe request to trigger token capture, then retry with updated token.
            if (res.status === 401 && !init._retried) {
                console.log('[DBMRPP] Got 401 — refreshing token from website state...');
                // Make a simple request to trigger the website to include/refresh the token
                try {
                    await origFetch('/web/api/kundenkonto/v2', { credentials: 'include' });
                } catch (_) {}
                // Wait briefly for any captured token to be processed
                await new Promise(resolve => setTimeout(resolve, 50));
                // Retry with the (hopefully) updated token
                const retryHeaders = Object.assign(
                    { 'Authorization': bearerToken, 'Accept': 'application/json' },
                    init.headers || {}
                );
                return origFetch(url, { ...init, headers: retryHeaders, credentials: 'include', _retried: true });
            }
            return res;
        });
    }

    // Cached JSON fetch: one in-flight/settled promise per key; evicted on
    // failure so the next call retries instead of returning the cached error.
    function cachedJsonFetch(cache, key, url) {
        if (!cache.has(key)) {
            const p = dbFetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                });
            p.catch(() => cache.delete(key));
            cache.set(key, p);
        }
        return cache.get(key);
    }

    // Cached detail fetch — share link and abweichung call the same endpoint;
    // cache avoids a redundant round-trip when both are used on the same trip.
    // Cache is cleared on each full refresh so stale data is never shown.
    function fetchDetail(uuid) {
        return cachedJsonFetch(detailCache, uuid, `/web/api/reisebegleitung/reiseketten/${encodeURIComponent(uuid)}`);
    }

    // On-demand cached fetch for single order details used by raw JSON export.
    function fetchAuftragDetail(auftragsnummer) {
        if (!auftragsnummer) return Promise.resolve(null);
        return cachedJsonFetch(auftragDetailCache, auftragsnummer, `${AUFTRAG_DETAIL_PATH}/${encodeURIComponent(auftragsnummer)}`);
    }

    // Detail APIs are not always shape-stable. These helpers normalize common wrappers
    // so features that depend on detail payloads (share/ICS/disruption) keep working.
    function getDetailRoot(data) {
        if (!data || typeof data !== 'object') return {};
        const candidates = [data, data.data, data.result, data.payload].filter(Boolean);
        const best = candidates.find(c =>
            c && typeof c === 'object' && (
                Array.isArray(c.trips) ||
                Array.isArray(c.reiseketten) ||
                c.trip ||
                c.ctxRecon ||
                c.hinfahrtRecon ||
                (c.verbindung && c.verbindung.ctxRecon)
            )
        );
        return best || data;
    }

    function getDetailTrip(data) {
        const root = getDetailRoot(data);
        if (Array.isArray(root.trips) && root.trips.length) return root.trips[0] || {};
        if (root.trip && typeof root.trip === 'object') return root.trip;
        if (Array.isArray(root.reiseketten) && root.reiseketten.length) return root.reiseketten[0] || {};
        return {};
    }

    function findDeepKey(obj, keyName, maxNodes = 2500) {
        if (!obj || typeof obj !== 'object') return null;
        const stack = [obj];
        const seen = new Set();
        let visited = 0;
        while (stack.length && visited < maxNodes) {
            const cur = stack.pop();
            if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
            seen.add(cur);
            visited++;
            if (Object.prototype.hasOwnProperty.call(cur, keyName) && cur[keyName]) return cur[keyName];
            const vals = Array.isArray(cur) ? cur : Object.values(cur);
            vals.forEach(v => {
                if (v && typeof v === 'object' && !seen.has(v)) stack.push(v);
            });
        }
        return null;
    }

    function extractCtxReconFromDetail(data) {
        const root = getDetailRoot(data);
        const trip = getDetailTrip(data);
        const direct = [
            trip.ctxRecon,
            trip.hinfahrtRecon,
            trip.verbindung && trip.verbindung.ctxRecon,
            root.ctxRecon,
            root.hinfahrtRecon,
            root.verbindung && root.verbindung.ctxRecon,
            root.gesamtangebot && root.gesamtangebot.hinfahrt &&
                root.gesamtangebot.hinfahrt.verbindung && root.gesamtangebot.hinfahrt.verbindung.ctxRecon
        ].find(Boolean);
        return direct || findDeepKey(root, 'ctxRecon');
    }

    function extractCtxReconFromAuftrag(auftrag) {
        return auftrag && auftrag.gesamtangebot &&
               auftrag.gesamtangebot.hinfahrt &&
               auftrag.gesamtangebot.hinfahrt.verbindung &&
               auftrag.gesamtangebot.hinfahrt.verbindung.ctxRecon;
    }

    // =========================================================
    // 6) Data fetching
    // =========================================================
    async function run() {
        if (!isTargetPath()) return;
        if (runInProgress) return;
        runInProgress = true;
        dbLog('run: start');
        // Instant render from cache only while no panel exists yet (fallback — normally
        // renderFromCacheEarly() has already done this at navigation time); re-rendering
        // an already visible panel would just rebuild identical content and destroy
        // transient button states (e.g. the ⏳ on the refresh button).
        const cache = document.getElementById('dbmrpp-root') ? null : loadRenderCache();
        if (cache) {
            dbLog('run: instant render from cache (' + cache.trips.length + ' trips)');
            dataIsStale = true;
            staleCachedAt = cache.cachedAt;
            try { await renderUI(cache.trips, cache.orphans, cache.changes, cache.lastVisit); } catch (_) {}
        }
        try {
            // Ensure kundenprofilId is available before fetching auftraege (orders).
            // URL-sniffing may not fire in time (or at all) on int.bahn.de due to
            // separate localStorage origin — fall back to kundenkonto/v2.
            if (!kundenprofilId) await fetchKundenprofil();

            rawReisekettenMap = new Map();
            const [reisekettenData, auftraege] = await Promise.all([
                fetchReiseketten(),
                fetchAllAuftraege()
            ]);
            if (!reisekettenData) return;

            detailCache.clear(); // invalidate on refresh
            auftragDetailCache.clear();
            (reisekettenData.reiseketten || []).forEach(r => {
                if (r && r.reisekettenUuid) rawReisekettenMap.set(r.reisekettenUuid, r);
            });

            const auftragMap = buildAuftragMap(auftraege);
            const trips = (reisekettenData.reiseketten || []).map(simplify);
            trips.forEach(t => mergeAuftrag(t, auftragMap[t.kundenwunschId]));
            upsertTripHistoryFromReiseketten(trips);
            upsertTripHistoryFromAuftraege(auftraege);

            auftraegeCache = auftraege;
            pastTrips = null;

            const matchedKeys = new Set();
            trips.forEach(t => getTripMatchKeys(t).forEach(k => matchedKeys.add(k)));
            trips.push(...buildCurrentSupplementalTrips(auftraege));
            trips.sort((a, b) => (a.departure || '').localeCompare(b.departure || ''));
            const orphans = buildOrphans(auftraege, matchedKeys);

            const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
            const lastVisitMs = lastVisit ? Date.parse(lastVisit) : 0;
            const shouldUpdateBaseline = !lastVisit || (Date.now() - lastVisitMs > SNAPSHOT_COOLDOWN_MS);

            const current = {};
            trips.forEach(t => current[t.uuid] = t);
            // Skip diff on first run — no previous snapshot means nothing meaningful to compare.
            const previous = lastVisit ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : null;
            const changes = previous ? diffSnapshots(previous, current) : { neu: [], entfernt: [], geaendert: [] };
            // Archive before renderUI so the "Changes" tab already includes
            // this run's findings; gated on the same condition as the baseline
            // write below to log each change exactly once.
            if (shouldUpdateBaseline) appendToChangeLog(changes);

            dataIsStale = false;
            staleCachedAt = null;
            await renderUI(trips, orphans, changes, lastVisit);
            saveRenderCache(trips, orphans, changes, lastVisit);
            dbLog('run: done (' + trips.length + ' trips)');

            if (shouldUpdateBaseline) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
                localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
            }
            scheduleWebDavSync();
            scheduleCalDavSync();
        } catch (err) {
            dbLog('run: error ' + err.message);
            console.error('[DBMRPP]', err);
        } finally {
            runInProgress = false;
        }
    }

    async function fetchReiseketten() {
        const all = [];
        let startIndex = 0;
        while (true) {
            const url = `${ENDPOINT_PATH}?startIndex=${startIndex}&pagesize=${PAGESIZE}&types%5B%5D=AUFTRAG&types%5B%5D=FREI&types%5B%5D=WIEDERHOLEND`;
            const res = await dbFetch(url);
            if (!res.ok) {
                console.warn('[DBMRPP] reiseketten HTTP', res.status);
                return all.length ? { reiseketten: all } : null;
            }
            const data = await res.json();
            const batch = data.reiseketten || [];
            all.push(...batch);

            // Prefer explicit hasMore flags when present, otherwise fall back to
            // the batch size heuristic to avoid endless loops.
            const hasMore = (typeof data.hasMoreReiseketten === 'boolean')
                ? data.hasMoreReiseketten
                : ((typeof data.hasMore === 'boolean') ? data.hasMore : (batch.length === PAGESIZE));
            if (!hasMore || batch.length === 0) break;

            startIndex += batch.length;
            if (all.length > 1000) break;
        }
        return { reiseketten: all };
    }

    // Fetches kundenprofilId from /web/api/kundenkonto/v2 when URL-sniffing has not
    // captured it yet (e.g. on int.bahn.de which has a separate localStorage origin).
    async function fetchKundenprofil() {
        try {
            const res = await dbFetch('/web/api/kundenkonto/v2');
            if (!res.ok) return;
            const data = await res.json();
            const id = data.kundenProfile && data.kundenProfile[0] && data.kundenProfile[0].id;
            if (id) {
                if (kundenprofilId && kundenprofilId !== id) clearRenderCache();
                kundenprofilId = id;
                try { localStorage.setItem(KUNDENPROFIL_KEY, id); } catch (_) {}
                console.log('[DBMRPP] kundenprofilId from kundenkonto/v2:', id);
            }
        } catch (_) {}
    }

    async function fetchAllAuftraege() {
        if (!kundenprofilId) {
            console.info('[DBMRPP] no kundenprofilId — skipping auftrag enrichment');
            return [];
        }
        const all = [];
        let startIndex = 0;
        const now = new Date();
        const stamp = new Date(now.getFullYear(), now.getMonth() - 15, 1).toISOString(); // the API seems to have a hard rolling window of 14 months for past trips
        while (true) {
            const url = `${AUFTRAG_PATH}?startIndex=${startIndex}`
                      + `&letzterGeltungszeitpunktNach=${encodeURIComponent(stamp)}`
                      + `&auftraegeReturnSize=${AUFTRAG_PAGESIZE}`
                      + `&auftragSortOrder=ASCENDING`
                      + `&kundenprofilId=${encodeURIComponent(kundenprofilId)}`;
            const res = await dbFetch(url);
            if (!res.ok) { console.warn('[DBMRPP] auftrag HTTP', res.status); break; }
            const data = await res.json();
            const batch = data.auftraege || [];
            all.push(...batch);
            if (!data.hasMoreAuftraege || batch.length === 0) break;
            startIndex += batch.length;
            if (all.length > 1000) break;
        }
        return all;
    }

    // =========================================================
    // 7) Auftrag helpers + trip history
    // =========================================================

    // Extract all trip-like items from an auftrag entry.
    // Besides regular hin/rueckfahrt legs, some products are exposed only as
    // katalogwunsch LEISTUNG entries (for example bike day tickets).
    function extractAuftragItems(a) {
        const items = [];
        if (a.gesamtreisen && a.gesamtreisen[0]) {
            if (a.gesamtreisen[0].hinfahrt) items.push(a.gesamtreisen[0].hinfahrt);
            if (a.gesamtreisen[0].rueckfahrt) items.push(a.gesamtreisen[0].rueckfahrt);
        }
        const leistung = normalizeKatalogwunschLeistung(a && a.katalogwunsch);
        if (leistung) items.push(leistung);
        return items;
    }

    function normalizeKatalogwunschLeistung(katalogwunsch) {
        if (!katalogwunsch || katalogwunsch.positionTyp !== 'LEISTUNG') return null;
        return {
            positionTyp: katalogwunsch.positionTyp,
            status: katalogwunsch.status || null,
            name: katalogwunsch.name || null,
            leistungsname: katalogwunsch.name || null,
            leistungsklasse: katalogwunsch.klasse || null,
            leistungsbuendelId: katalogwunsch.leistungsbuendelId || null,
            materialisierungsKanalNames: Array.isArray(katalogwunsch.materialisierungsKanalNames)
                ? katalogwunsch.materialisierungsKanalNames.slice()
                : [],
            abfahrt: katalogwunsch.ersterGeltungszeitpunkt || null,
            ankunft: katalogwunsch.letzterGeltungszeitpunkt || null,
            zeitlicheGueltigkeit: {
                ersterGeltungszeitpunkt: katalogwunsch.ersterGeltungszeitpunkt || null,
                letzterGeltungszeitpunkt: katalogwunsch.letzterGeltungszeitpunkt || null
            },
            reisende: []
        };
    }

    function isLeistungAuftragItem(item) {
        return !!(item && item.positionTyp === 'LEISTUNG');
    }

    // Identity helpers:
    // - Keep a stable, source-aware ids model on trips.
    // - Continue supporting legacy top-level fields for backward compatibility.
    function getTripIds(t) {
        const ids = (t && t.ids && typeof t.ids === 'object') ? t.ids : {};
        const kundenwunschId = ids.kundenwunschId || (t && t.kundenwunschId) || null;
        const auftragsnummer = ids.auftragsnummer || (t && t.auftragsnummer) || null;
        const reisekettenUuid = ids.reisekettenUuid || ((t && t.fromReiseketten) ? t.uuid : null) || null;
        const syntheticId = ids.syntheticId || null;
        return { reisekettenUuid, kundenwunschId, auftragsnummer, syntheticId };
    }

    function getTripMatchKeys(t) {
        const ids = getTripIds(t);
        const keys = [];
        if (ids.kundenwunschId) keys.push(`kw:${ids.kundenwunschId}`);
        if (ids.auftragsnummer) keys.push(`ao:${ids.auftragsnummer}`);
        if (ids.reisekettenUuid) keys.push(`rk:${ids.reisekettenUuid}`);
        return keys;
    }

    function loadTripHistory() {
        try {
            const parsed = JSON.parse(localStorage.getItem(REISEKETTEN_HISTORY_KEY) || '{}');
            if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
                return normalizeTripHistory(parsed);
            }
        } catch (_) {}
        return { entries: {} };
    }

    // cachedAt records when the trip was first cached and stays fixed across
    // updates; updatedAt bumps whenever the entry content changes and is the
    // timestamp sync conflict resolution has to use.
    function makeHistoryEntryShape(src, ids, cachedAt, updatedAt) {
        return {
            uuid: src.uuid || ids.reisekettenUuid || null,
            typ: src.typ || null,
            from: src.from || null,
            to: src.to || null,
            ids,
            fromExtId: src.fromExtId || null,
            toExtId: src.toExtId || null,
            departure: src.departure || null,
            arrival: src.arrival || null,
            departureTrack: src.departureTrack || null,
            departureTrackRt: src.departureTrackRt || null,
            arrivalTrack: src.arrivalTrack || null,
            arrivalTrackRt: src.arrivalTrackRt || null,
            departureRt: src.departureRt || null,
            arrivalRt: src.arrivalRt || null,
            zuege: src.zuege || '',
            seats: src.seats || '',
            zugbindung: src.zugbindung || null,
            status: src.status || null,
            relevanteAbweichung: !!src.relevanteAbweichung,
            alternativensuche: src.alternativensuche || null,
            ueberwacht: src.ueberwacht === undefined ? null : src.ueberwacht,
            ueberwachungName: src.ueberwachungName || null,
            wiederholung: src.wiederholung || null,
            umreserviert: !!src.umreserviert,
            letzterReiseplanBearbeiter: src.letzterReiseplanBearbeiter || null,
            notifications: normalizeNotificationEntries(src.notifications || []),
            cachedAt,
            updatedAt: updatedAt || null
        };
    }

    function normalizeHistoryEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const ids = getTripIds(entry);
        if (!ids.kundenwunschId && !ids.reisekettenUuid && !ids.auftragsnummer) return null;
        return makeHistoryEntryShape(entry, ids, entry.cachedAt || null, entry.updatedAt || null);
    }

    function normalizeTripHistory(raw) {
        const entriesRaw = (raw && raw.entries && typeof raw.entries === 'object') ? raw.entries : {};
        const normalizedEntries = {};
        Object.entries(entriesRaw).forEach(([key, entry]) => {
            const n = normalizeHistoryEntry(entry);
            if (n) normalizedEntries[key] = n;
        });
        return {
            schemaVersion: REISEKETTEN_HISTORY_SCHEMA_VERSION,
            entries: normalizedEntries
        };
    }

    function saveTripHistory() {
        try {
            const normalized = normalizeTripHistory(tripHistory);
            localStorage.setItem(REISEKETTEN_HISTORY_KEY, JSON.stringify(normalized));
            tripHistory = normalized;
        } catch (_) {}
    }

    function toNotificationText(m) {
        if (m === null || m === undefined) return '';
        const raw = typeof m === 'string'
            ? m
            : (m.text || m.meldungsText || m.kopfText || m.titel || m.title || '');
        const text = String(raw || '').trim().replace(/\s+/g, ' ');
        if (!text) return '';
        return text.slice(0, CACHE_NOTIFICATION_TEXT_MAX_CHARS);
    }

    function normalizeNotificationEntries(entries) {
        const seen = new Set();
        const out = [];
        (entries || []).forEach(m => {
            if (out.length >= CACHE_NOTIFICATIONS_MAX_ITEMS) return;
            const text = toNotificationText(m);
            if (!text || seen.has(text)) return;
            seen.add(text);
            out.push({ text });
        });
        return out;
    }

    function collectNotificationsFromTripShape(tripLike) {
        if (!tripLike || typeof tripLike !== 'object') return [];
        const abschnitte = Array.isArray(tripLike.verbindungsAbschnitte) ? tripLike.verbindungsAbschnitte : [];
        return normalizeNotificationEntries([
            ...(tripLike.himMeldungen || []),
            ...(tripLike.priorisierteMeldungen || []),
            ...(tripLike.risNotizen || []),
            ...abschnitte.flatMap(a => [
                ...((a && a.himMeldungen) || []),
                ...((a && a.priorisierteMeldungen) || []),
                ...((a && a.risNotizen) || [])
            ])
        ]);
    }

    function buildTripHistoryEntry(t, cachedAtOverride) {
        const ids = getTripIds(t);
        if (!ids.kundenwunschId && !ids.reisekettenUuid && !ids.auftragsnummer) return null;
        return makeHistoryEntryShape(t, ids, cachedAtOverride || new Date().toISOString());
    }

    // Compares entry payloads, ignoring the timestamps. Both sides come out of
    // makeHistoryEntryShape, so key order is stable and JSON compare is safe.
    function historyEntryContentEquals(a, b) {
        if (!a || !b) return false;
        const strip = e => {
            const { cachedAt, updatedAt, ...rest } = e;
            return rest;
        };
        return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
    }

    // Preserve updatedAt while the content is unchanged; bump it on any real
    // change so sync merges can order entry versions (cachedAt never moves).
    function stampHistoryEntryUpdatedAt(entry, prev) {
        if (prev && prev.updatedAt && historyEntryContentEquals(prev, entry)) {
            entry.updatedAt = prev.updatedAt;
        } else {
            entry.updatedAt = new Date().toISOString();
        }
        return entry;
    }

    function historyEntryPrimaryKey(entry) {
        if (!entry || !entry.ids) return null;
        if (entry.ids.kundenwunschId) return `kw:${entry.ids.kundenwunschId}`;
        if (entry.ids.reisekettenUuid) return `rk:${entry.ids.reisekettenUuid}`;
        if (entry.ids.auftragsnummer) return `ao:${entry.ids.auftragsnummer}:${entry.departure || ''}`;
        return null;
    }


    function deleteCachedTrip(trip) {
        if (!trip) return;

        const entry = findTripHistoryEntry(trip);
        if (!entry) return;

        const key = historyEntryPrimaryKey(entry);
        if (!key) return;

        delete tripHistory.entries[key];
        saveTripHistory();
        if (activeView === 'past' && auftraegeCache) {
            pastTrips = buildPastTrips(auftraegeCache);
        } else {
            pastTrips = null;
        }
        reRender();
    }


    function pruneTripHistory() {
        const entries = Object.entries(tripHistory.entries || {});
        if (entries.length <= REISEKETTEN_HISTORY_MAX_ENTRIES) return;
        entries.sort((a, b) => {
            const ta = Date.parse((a[1] && a[1].cachedAt) || 0) || 0;
            const tb = Date.parse((b[1] && b[1].cachedAt) || 0) || 0;
            return tb - ta;
        });
        tripHistory.entries = Object.fromEntries(entries.slice(0, REISEKETTEN_HISTORY_MAX_ENTRIES));
    }

    function upsertTripHistoryFromReiseketten(trips) {
        if (!tripHistory || !tripHistory.entries) tripHistory = { entries: {} };
        let changed = false;
        (trips || []).forEach(t => {
            if (!t || !t.fromReiseketten) return;
            const probe = buildTripHistoryEntry(t);
            if (!probe) return;
            const key = historyEntryPrimaryKey(probe);
            if (!key) return;
            const prev = tripHistory.entries[key] || null;
            const entry = buildTripHistoryEntry(t, prev && prev.cachedAt ? prev.cachedAt : null);
            if (!entry) return;
            stampHistoryEntryUpdatedAt(entry, prev);
            if (prev && prev.updatedAt === entry.updatedAt && historyEntryContentEquals(prev, entry)) return;
            tripHistory.entries[key] = entry;
            changed = true;
        });
        if (!changed) return;
        pruneTripHistory();
        saveTripHistory();
    }

    // Stores a baseline entry from the Auftraege API for trips not already covered
    // by a richer Reiseketten entry. Called after upsertTripHistoryFromReiseketten
    // so Reiseketten data always wins when both are available.
    function upsertTripHistoryFromAuftraege(auftraege) {
        if (!tripHistory || !tripHistory.entries) tripHistory = { entries: {} };
        let changed = false;
        (auftraege || []).forEach(a => {
            extractAuftragItems(a).forEach(fahrt => {
                if (!fahrt.abfahrt) return;
                const gs  = fahrt.gueltigkeitsstrecke || {};
                const ids = {
                    reisekettenUuid: null,
                    kundenwunschId:  fahrt.kundenwunschId || null,
                    auftragsnummer:  a.auftragsnummer    || null,
                    syntheticId:     null
                };
                if (!ids.kundenwunschId && !ids.auftragsnummer) return;
                const key  = historyEntryPrimaryKey({ ids });
                if (!key) return;
                const prev = tripHistory.entries[key] || null;
                // A Reiseketten entry for this trip already exists — don't overwrite it.
                if (prev && prev.ids && prev.ids.reisekettenUuid) return;
                const src = {
                    typ:       'AUFTRAG',
                    from:      fahrt.startort || gs.abgangsbahnhofName || null,
                    to:        fahrt.zielort  || gs.zielbahnhofName    || null,
                    departure: fahrt.abfahrt  || null,
                    arrival:   fahrt.ankunft  || null,
                };
                const entry = makeHistoryEntryShape(src, ids, (prev && prev.cachedAt) || new Date().toISOString());
                stampHistoryEntryUpdatedAt(entry, prev);
                if (prev && prev.updatedAt === entry.updatedAt && historyEntryContentEquals(prev, entry)) return;
                tripHistory.entries[key] = entry;
                changed = true;
            });
        });
        if (!changed) return;
        pruneTripHistory();
        saveTripHistory();
    }

    function seedTripHistoryFromSnapshot(snapshotObj) {
        if (!isPlainObject(snapshotObj)) return;
        const trips = Object.values(snapshotObj).filter(t =>
            !!t && (
                t.fromReiseketten === true ||
                t.source === 'reisekette' ||
                t.source === 'merged'
            )
        );
        if (!trips.length) return;
        upsertTripHistoryFromReiseketten(trips);
    }

    function seedTripHistoryFromSnapshotStorage() {
        try {
            const hasEntries = Object.keys((tripHistory && tripHistory.entries) || {}).length > 0;
            if (hasEntries) return;
            const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            seedTripHistoryFromSnapshot(snapshot);
        } catch (_) {}
    }

    function findTripHistoryEntry(trip) {
        const ids = getTripIds(trip);
        const entries = Object.values((tripHistory && tripHistory.entries) || {});
        if (!entries.length) return null;

        if (ids.kundenwunschId) {
            const byKw = entries.find(e => e && e.ids && e.ids.kundenwunschId === ids.kundenwunschId);
            if (byKw) return byKw;
        }
        if (ids.reisekettenUuid) {
            const byRk = entries.find(e => e && e.ids && e.ids.reisekettenUuid === ids.reisekettenUuid);
            if (byRk) return byRk;
        }
        if (!ids.auftragsnummer) return null;

        const depTs = trip && trip.departure ? Date.parse(trip.departure) : NaN;
        let best = null;
        let bestDelta = Infinity;
        entries.forEach(e => {
            if (!e || !e.ids || e.ids.auftragsnummer !== ids.auftragsnummer) return;
            if (!Number.isFinite(depTs) || !e.departure) {
                if (!best) best = e;
                return;
            }
            const eTs = Date.parse(e.departure);
            if (!Number.isFinite(eTs)) return;
            const delta = Math.abs(eTs - depTs);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = e;
            }
        });
        if (!best) return null;
        // Keep fallback strict enough to avoid cross-matching unrelated order legs.
        if (Number.isFinite(depTs) && best.departure && bestDelta > 36 * 3600 * 1000) return null;
        return best;
    }

    function mergeTripHistoryIntoPastTrip(trip, entry) {
        if (!trip || !entry) return trip;
        const fillIfMissing = ['fromExtId','toExtId','departureTrack','departureTrackRt','arrivalTrack','arrivalTrackRt','departureRt','arrivalRt','status',
            'alternativensuche','ueberwacht','ueberwachungName','wiederholung','letzterReiseplanBearbeiter','zugbindung'];
        fillIfMissing.forEach(f => {
            if (trip[f] === null || trip[f] === undefined || trip[f] === '') trip[f] = entry[f];
        });
        if (!trip.zuege && entry.zuege) trip.zuege = entry.zuege;
        if (!trip.seats && entry.seats) trip.seats = entry.seats;
        if ((!Array.isArray(trip.notifications) || !trip.notifications.length) && Array.isArray(entry.notifications) && entry.notifications.length) {
            trip.notifications = normalizeNotificationEntries(entry.notifications);
        }
        if (entry.relevanteAbweichung) trip.relevanteAbweichung = true;
        if (entry.umreserviert) trip.umreserviert = true;

        if (!trip.ids || typeof trip.ids !== 'object') trip.ids = {};
        if (!trip.ids.reisekettenUuid && entry.ids && entry.ids.reisekettenUuid) {
            trip.ids.reisekettenUuid = entry.ids.reisekettenUuid;
        }
        trip.cacheInfo = {
            departureRt: entry.departureRt || null,
            arrivalRt: entry.arrivalRt || null,
            departureTrack: entry.departureTrack || null,
            departureTrackRt: entry.departureTrackRt || null,
            arrivalTrack: entry.arrivalTrack || null,
            arrivalTrackRt: entry.arrivalTrackRt || null,
            zugbindung: entry.zugbindung || null,
            status: entry.status || null,
            relevanteAbweichung: !!entry.relevanteAbweichung,
            alternativensuche: entry.alternativensuche || null,
            zuege: entry.zuege || '',
            seats: entry.seats || '',
            notifications: normalizeNotificationEntries(entry.notifications || []),
            cachedAt: entry.cachedAt || null
        };
        trip.hasTripHistoryEntry = true;
        trip.source = 'merged';
        return trip;
    }

    // Builds the common base for synthetic trip objects (orphans + past trips).
    // Specific fields are supplied via overrides which are spread on top.
    function buildSyntheticTrip(a, fahrt, overrides = {}) {
        const kanals = fahrt.materialisierungsKanalNames || [];
        return {
            typ:                 'AUFTRAG',
            source:              'auftrag',
            fromReiseketten:     false,
            positionTyp:         fahrt.positionTyp || null,
            ids:                 {
                reisekettenUuid: null,
                kundenwunschId: fahrt.kundenwunschId || null,
                auftragsnummer: a.auftragsnummer || null,
                syntheticId: null
            },
            from:                fahrt.startort || null,
            to:                  fahrt.zielort  || null,
            departure:           fahrt.abfahrt  || null,
            arrival:             fahrt.ankunft  || null,
            leistungsname:       fahrt.leistungsname || fahrt.name || null,
            storniertStatus:     fahrt.storniertStatus || null,
            auftragStatus:       a.status || null,
            auftragsnummer:      a.auftragsnummer || null,
            kundenwunschId:      fahrt.kundenwunschId || null,
            leistungsbuendelId:  fahrt.leistungsbuendelId || null,
            anlagedatum:         a.anlagedatum || null,
            nachname:            (a.hauptadresse && a.hauptadresse.nachname) || null,
            pdfVerfuegbar:       !!(kanals.includes('WEB') || kanals.includes('BUCHUNG')),
            gueltigVon:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.ersterGeltungszeitpunkt || null,
            gueltigBis:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.letzterGeltungszeitpunkt || null,
            reisende:            fahrt.reisende || [],
            cityTicket:          fahrt.cityTicket
                                     ? `${fahrt.cityTicket.abgangsBahnhof || ''}/${fahrt.cityTicket.zielBahnhof || ''}`
                                     : null,
            teilpreis:           !!fahrt.isTeilpreis,
            sitzplatzStorniert:  !!fahrt.isSitzplatzReservierungsangebotStorniert,
            stellplatzStorniert: !!fahrt.isStellplatzReservierungsangebotStorniert,
            hasSitzplatz:        !!fahrt.hasSitzplatzReservierungsangebot,
            hasStellplatz:       !!fahrt.hasStellplatzReservierungsangebot,
            hasReiseangebot:     fahrt.hasReiseangebot !== false,
            klasse:              2,
            // Fields only present in reiseketten responses: safe defaults for display + diff.
            zuege: '', seats: '', zugbindung: null, status: null,
            relevanteAbweichung: false, alternativensuche: null,
            departureRt: null, arrivalRt: null, departureTrack: null, departureTrackRt: null, arrivalTrack: null, arrivalTrackRt: null,
            notifications: [],
            ueberwacht: null, umreserviert: false, letzterReiseplanBearbeiter: null,
            ...overrides
        };
    }

    function bookedZuegeFromFahrt(fahrt) {
        const segs = (fahrt.verbindung && fahrt.verbindung.verbindungsAbschnitte) || [];
        const names = segs
            .filter(s => s.verkehrsmittel && s.verkehrsmittel.typ !== 'WALK')
            .map(s => { const vm = s.verkehrsmittel || {}; return vm.mittelText || vm.name || ''; })
            .filter(Boolean);
        return names.length ? names.join(' → ') : null;
    }

    function buildAuftragMap(auftraege) {
        const map = {};
        auftraege.forEach(a => {
            extractAuftragItems(a).forEach(fahrt => {
                if (!fahrt.kundenwunschId) return;
                const kanals = fahrt.materialisierungsKanalNames || [];
                map[fahrt.kundenwunschId] = {
                    leistungsname:       fahrt.leistungsname || fahrt.name || null,
                    leistungsklasse:     fahrt.leistungsklasse || null,
                    storniertStatus:     fahrt.storniertStatus || null,
                    auftragStatus:       a.status || null,
                    sitzplatzStorniert:  !!fahrt.isSitzplatzReservierungsangebotStorniert,
                    stellplatzStorniert: !!fahrt.isStellplatzReservierungsangebotStorniert,
                    hasSitzplatz:        !!fahrt.hasSitzplatzReservierungsangebot,
                    hasStellplatz:       !!fahrt.hasStellplatzReservierungsangebot,
                    hasReiseangebot:     fahrt.hasReiseangebot !== false,
                    cityTicket:          fahrt.cityTicket
                                             ? `${fahrt.cityTicket.abgangsBahnhof || ''}/${fahrt.cityTicket.zielBahnhof || ''}`
                                             : null,
                    anlagedatum:         a.anlagedatum || null,
                    nachname:            (a.hauptadresse && a.hauptadresse.nachname) || null,
                    reisende:            fahrt.reisende || [],
                    pdfVerfuegbar:       !!(kanals.includes('WEB') || kanals.includes('BUCHUNG')),
                    teilpreis:           !!fahrt.isTeilpreis,
                    gueltigVon:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.ersterGeltungszeitpunkt || null,
                    gueltigBis:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.letzterGeltungszeitpunkt || null,
                    bookedDeparture:     fahrt.abfahrt || null,
                    bookedArrival:       fahrt.ankunft || null,
                    bookedZuege:         bookedZuegeFromFahrt(fahrt)
                };
            });
        });
        return map;
    }

    function buildCurrentSupplementalTrips(auftraege) {
        const now = Date.now();
        const result = [];
        auftraege.forEach(a => {
            extractAuftragItems(a).forEach((fahrt, idx) => {
                if (!isLeistungAuftragItem(fahrt)) return;
                const end = fahrt.ankunft ? new Date(fahrt.ankunft).getTime() : NaN;
                if (!Number.isFinite(end) || end <= now) return;
                const syntheticId = `${a.auftragsnummer}_leistung_${idx}`;
                result.push(buildSyntheticTrip(a, fahrt, {
                    uuid: syntheticId,
                    ids: {
                        reisekettenUuid: null,
                        kundenwunschId: null,
                        auftragsnummer: a.auftragsnummer || null,
                        syntheticId
                    },
                    leistungsklasse: fahrt.leistungsklasse || null,
                    klasse: fahrt.leistungsklasse === 'KLASSE_1' ? 1 : 2,
                    isLeistungTicket: true
                }));
            });
        });
        return result;
    }

    function buildOrphans(auftraege, matchedKeys) {
        const cutoff = Date.now() - 2 * 3600 * 1000;
        const result = [];
        auftraege.forEach(a => {
            extractAuftragItems(a).forEach(fahrt => {
                if (!fahrt.kundenwunschId) return;
                if (matchedKeys.has(`kw:${fahrt.kundenwunschId}`)) return;
                const dep = fahrt.abfahrt ? new Date(fahrt.abfahrt).getTime() : 0;
                if (dep <= cutoff) return;
                if (fahrt.storniertStatus === 'NICHT_STORNIERT') return;
                result.push(buildSyntheticTrip(a, fahrt, {
                    uuid:       fahrt.kundenwunschId,
                    ids: {
                        reisekettenUuid: null,
                        kundenwunschId: fahrt.kundenwunschId,
                        auftragsnummer: a.auftragsnummer || null,
                        syntheticId: null
                    },
                    isOrphaned: true
                }));
            });
        });
        result.sort((a, b) => (a.departure || '').localeCompare(b.departure || ''));
        return result;
    }

    function buildPastTrips(auftraege, includeHistoryCache = null) {
        const now = Date.now();
        const result = [];
        auftraege.forEach(a => {
            extractAuftragItems(a).forEach((fahrt, idx) => {
                if (!fahrt.abfahrt) return;
                if (new Date(fahrt.abfahrt).getTime() >= now) return;
                const isVerbundticket = !!fahrt.verbundCode;
                const gs = fahrt.gueltigkeitsstrecke || {};
                const kanals = fahrt.materialisierungsKanalNames || [];
                const syntheticId = isLeistungAuftragItem(fahrt)
                    ? `${a.auftragsnummer}_leistung_${idx}`
                    : `${a.auftragsnummer}_${idx}`;
                const tripUuid = fahrt.kundenwunschId || syntheticId;
                const trip = buildSyntheticTrip(a, fahrt, {
                    uuid:         tripUuid,
                    ids: {
                        reisekettenUuid: null,
                        kundenwunschId: fahrt.kundenwunschId || null,
                        auftragsnummer: a.auftragsnummer || null,
                        syntheticId
                    },
                    from:         fahrt.startort || gs.abgangsbahnhofName || null,
                    to:           fahrt.zielort  || gs.zielbahnhofName    || null,
                    pdfVerfuegbar: !isVerbundticket && !!(kanals.includes('WEB') || kanals.includes('BUCHUNG')),
                    leistungsklasse: fahrt.leistungsklasse || null,
                    klasse:       fahrt.leistungsklasse === 'KLASSE_1' ? 1 : 2,
                    isVerbundticket,
                    verbundCode:  fahrt.verbundCode || null,
                    isLeistungTicket: isLeistungAuftragItem(fahrt),
                    isPastTrip:   true
                });
                if (uiSettings.usePastCache) {
                    const cached = findTripHistoryEntry(trip);
                    result.push(mergeTripHistoryIntoPastTrip(trip, cached));
                } else {
                    result.push(trip);
                }
            });
        });
        // Add cached trips (any type) not already present in the result.
        // Trips from auftraege use kundenwunschId as uuid; history entries use
        // reisekettenUuid — so we track all known identifiers per trip to avoid
        // cross-scheme false misses or duplicates.
        const useCache = includeHistoryCache !== null ? includeHistoryCache : uiSettings.usePastCache;
        if (useCache && tripHistory && tripHistory.entries) {
            const now = Date.now();
            const existingIds = new Set();
            result.forEach(t => {
                const ids = getTripIds(t);
                if (t.uuid)              existingIds.add(t.uuid);
                if (ids.reisekettenUuid) existingIds.add(ids.reisekettenUuid);
                if (ids.kundenwunschId)  existingIds.add(ids.kundenwunschId);
                if (ids.auftragsnummer && t.departure) existingIds.add(`ao:${ids.auftragsnummer}:${t.departure}`);
            });
            Object.entries(tripHistory.entries).forEach(([entryKey, t]) => {
                if (!t) return;
                if (t.departure && new Date(t.departure).getTime() < now) {
                    const histIds = t.ids || {};
                    const rkUuid = histIds.reisekettenUuid || t.uuid || null;
                    const aoKey  = `ao:${histIds.auftragsnummer || ''}:${t.departure || ''}`;
                    if (
                        (rkUuid && existingIds.has(rkUuid)) ||
                        (histIds.kundenwunschId && existingIds.has(histIds.kundenwunschId)) ||
                        (t.uuid && existingIds.has(t.uuid)) ||
                        (histIds.auftragsnummer && existingIds.has(aoKey))
                    ) return;

                    // Clone the persisted entry so we do not mutate history records in-place.
                    const cachedTrip = {
                        ...t,
                        uuid: rkUuid || t.uuid || `hist:${entryKey}`,
                        fromReiseketten: !!rkUuid,
                        isPastTrip: true,
                        isFromHistoryCache: true,
                        hasTripHistoryEntry: true,
                        cacheInfo: {
                            departureRt: t.departureRt || null,
                            arrivalRt: t.arrivalRt || null,
                            departureTrack: t.departureTrack || null,
                            departureTrackRt: t.departureTrackRt || null,
                            arrivalTrack: t.arrivalTrack || null,
                            arrivalTrackRt: t.arrivalTrackRt || null,
                            zugbindung: t.zugbindung || null,
                            status: t.status || null,
                            relevanteAbweichung: !!t.relevanteAbweichung,
                            alternativensuche: t.alternativensuche || null,
                            zuege: t.zuege || '',
                            seats: t.seats || '',
                            notifications: normalizeNotificationEntries(t.notifications || []),
                            cachedAt: t.cachedAt || null
                        }
                    };
                    if (rkUuid) existingIds.add(rkUuid);
                    if (histIds.kundenwunschId) existingIds.add(histIds.kundenwunschId);
                    if (t.uuid) existingIds.add(t.uuid);
                    if (histIds.auftragsnummer) existingIds.add(aoKey);
                    result.push(cachedTrip);
                }
            });
        }
        result.sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));
        return result;
    }

    // =========================================================
    // 8) ICS download via /web/api/buchung/kalender
    // =========================================================
    async function downloadIcs(t) {
        try {
            if (!isIcsSupportedTrip(t)) {
                alert(T.alertIcsUnknownType);
                return;
            }
            let payload = null;
            if (t.typ === 'AUFTRAG') {
                if (!t.auftragsnummer || !t.nachname) { alert(T.alertIcsNoAuftrag); return; }
                payload = { auftragsnummer: t.auftragsnummer, nachname: t.nachname };
            } else if (t.typ === 'FREI' || t.typ === 'WIEDERHOLEND') {
                payload = await buildFreiKalenderPayload(t);
                if (!payload) return;
            } else {
                alert(T.alertIcsUnknownType);
                return;
            }

            const res = await dbFetch('/web/api/buchung/kalender', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/calendar, */*' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.error('[DBMRPP] Kalender HTTP', res.status, body);
                alert(T.alertIcsFailed(res.status));
                return;
            }

            const ct = (res.headers.get('content-type') || '').toLowerCase();
            const raw = await res.text();
            let ics = null;
            if (ct.includes('text/calendar') || raw.startsWith('BEGIN:VCALENDAR')) {
                ics = raw;
            } else {
                try {
                    const json = JSON.parse(raw);
                    ics = json.data || json.ics || json.calendar || json.content || null;
                    if (ics && /^[A-Za-z0-9+/=\s]+$/.test(ics) && !ics.includes('BEGIN:VCALENDAR')) {
                        try { ics = atob(ics.replace(/\s+/g, '')); } catch (_) {}
                    }
                } catch (_) { ics = raw; }
            }
            if (!ics || !ics.includes('BEGIN:VCALENDAR')) {
                console.error('[DBMRPP] Unerwartete Kalender-Antwort', { contentType: ct, raw });
                alert(T.alertIcsBadFormat);
                return;
            }

            const stableUid = (t.typ === 'AUFTRAG' && t.kundenwunschId)
                ? `${t.kundenwunschId}@db-meine-reisen-plus-plus`
                : `${t.uuid}@db-meine-reisen-plus-plus`;
            ics = ics.replace(/^UID:.*$/m, `UID:${stableUid}`);

            triggerDownload(
                new Blob([ics], { type: 'text/calendar;charset=utf-8' }),
                `DB_${t.departure ? t.departure.slice(0, 10) : ''}_${routeSlug(t)}_${t.auftragsnummer || (t.uuid || '').slice(0, 8)}.ics`
            );
        } catch (err) {
            console.error('[DBMRPP] ICS-Fehler', err);
            alert(T.alertIcsError);
        }
    }

    async function buildFreiKalenderPayload(t) {
        let data;
        try {
            data = await fetchDetail(t.uuid);
        } catch (err) {
            console.error('[DBMRPP] Detail fetch failed', err);
            alert(T.alertIcsFailed('?'));
            return null;
        }
        const trip = getDetailTrip(data);
        const segs = (trip.verbindungsAbschnitte || [])
            .filter(va => va.verkehrsmittel && va.verkehrsmittel.typ !== 'WALK')
            .map((va, idx) => {
                const vm = va.verkehrsmittel || {};
                return {
                    ankunftsOrt: { name: va.ankunftsOrt, externeBahnhofsId: va.externeBahnhofsinfoIdDestination, dateTime: va.ankunft && va.ankunft.sollzeit },
                    abfahrtsOrt: { name: va.abfahrtsOrt, externeBahnhofsId: va.externeBahnhofsinfoIdOrigin,      dateTime: va.abfahrt && va.abfahrt.sollzeit },
                    direction: vm.richtung, productMittelText: vm.mittelText,
                    produktLangText: vm.langText, durationInSeconds: va.abschnittsDauer,
                    number: String(idx)
                };
            });
        if (segs.length === 0) { alert(T.alertIcsNoSegs); return null; }
        if (t.departureTrack) segs[0].abfahrtsOrt.track = t.departureTrack;
        if (t.arrivalTrack)   segs[segs.length - 1].ankunftsOrt.track = t.arrivalTrack;
        return { hinfahrt: { verbindungsDauerInSeconds: trip.verbindungsDauerInSeconds, verbindungsAbschnitte: segs } };
    }

    // =========================================================
    // 9) PDF download via /web/api/buchung/ticket
    // =========================================================
    async function downloadPdf(t) {
        if (!t.leistungsbuendelId) { alert(T.alertPdfNoId); return; }
        for (const artId of ['2', '52']) {
            try {
                const res = await dbFetch('/web/api/buchung/ticket', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketMaterialisierungsInfo: { leistungsbuendelId: t.leistungsbuendelId, materialisierungsArtId: artId } })
                });
                if (!res.ok) { console.warn('[DBMRPP] ticket HTTP', res.status, '(artId', artId + ')'); continue; }
                const json = await res.json();
                const b64 = json && json.data;
                if (!b64) { console.warn('[DBMRPP] ticket: keine Daten (artId', artId + ')'); continue; }
                const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                triggerDownload(
                    new Blob([bytes], { type: 'application/pdf' }),
                    `DB_${t.departure ? t.departure.slice(0, 10) : ''}_${routeSlug(t)}_${t.auftragsnummer || t.leistungsbuendelId}.pdf`
                );
                return;
            } catch (err) {
                console.error('[DBMRPP] PDF-Fehler (artId', artId + ')', err);
            }
        }
        alert(T.alertPdfError);
    }

    async function downloadRawJson(t) {
        try {
            const assignedTagIds = customTagAssignments[t.uuid] || [];
            const resolvedCustomTags = customTagDefs.filter(d => assignedTagIds.includes(d.id));

            const endpoints = {
                reisekette: {
                    url: ENDPOINT_PATH,
                    data: null
                },
                reiseketteDetail: {
                    url: t.uuid ? `${ENDPOINT_PATH}/${encodeURIComponent(t.uuid)}` : ENDPOINT_PATH,
                    data: null
                },
                auftragListEntry: {
                    url: AUFTRAG_PATH,
                    data: null
                },
                auftrag: {
                    url: t.auftragsnummer ? `${AUFTRAG_DETAIL_PATH}/${encodeURIComponent(t.auftragsnummer)}` : AUFTRAG_DETAIL_PATH,
                    data: null
                }
            };

            const out = {
                exportedAt: new Date().toISOString(),
                dbmrppTripSummary: t,
                dbmrppCachedLiveState: findTripHistoryEntry(t) || null,
                customTags: resolvedCustomTags,
                endpoints
            };

            if (t.uuid && rawReisekettenMap.has(t.uuid)) {
                endpoints.reisekette.data = rawReisekettenMap.get(t.uuid);
            }

            if (t.fromReiseketten && t.uuid) {
                try {
                    endpoints.reiseketteDetail.data = await fetchDetail(t.uuid);
                } catch (err) {
                    console.warn('[DBMRPP] Raw JSON: reiseketten detail failed', err);
                }
            }

            if (t.auftragsnummer && auftraegeCache) {
                endpoints.auftragListEntry.data = auftraegeCache.find(a => a.auftragsnummer === t.auftragsnummer) || null;
            }

            if (t.auftragsnummer) {
                try {
                    endpoints.auftrag.data = await fetchAuftragDetail(t.auftragsnummer);
                } catch (err) {
                    console.warn('[DBMRPP] Raw JSON: auftrag detail failed', err);
                }
            }

            const filename = `DB_RAW_${t.departure ? t.departure.slice(0, 10) : 'trip'}_${routeSlug(t)}_${(t.uuid || t.auftragsnummer || 'data').replace(/[^a-z0-9_-]+/gi, '_')}.json`;
            triggerDownload(
                new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' }),
                filename
            );
        } catch (err) {
            console.error('[DBMRPP] Raw JSON-Fehler', err);
            alert(T.rawJsonError);
        }
    }

    function downloadBulkRawJson() {
        if (runInProgress) { alert(T.bulkJsonStillLoading); return; }
        try {
            const out = {
                exportedAt: new Date().toISOString(),
                endpoints: {
                    reiseketten: {
                        url: ENDPOINT_PATH,
                        data: Array.from(rawReisekettenMap.values())
                    },
                    auftraege: {
                        url: AUFTRAG_PATH,
                        data: auftraegeCache || []
                    }
                }
            };
            triggerDownload(
                new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' }),
                `DB_BULK_${new Date().toISOString().slice(0, 10)}.json`
            );
        } catch (err) {
            console.error('[DBMRPP] Bulk JSON error', err);
            alert(T.rawJsonError);
        }
    }

    // =========================================================
    // 10) Geo export (GPX + GeoJSON)
    // =========================================================
    // Works on any string carrying '@X=…@Y=…' fragments (halt ids, ctxRecon segments).
    function coordFromHaltId(id) {
        const s = String(id || '');
        const xm = /@X=(-?\d+(?:\.\d+)?)/.exec(s);
        const ym = /@Y=(-?\d+(?:\.\d+)?)/.exec(s);
        if (!xm || !ym) return null;
        const rawLon = Number(xm[1]);
        const rawLat = Number(ym[1]);
        if (!Number.isFinite(rawLon) || !Number.isFinite(rawLat)) return null;
        return {
            lon: Math.abs(rawLon) > 180 ? rawLon / 1e6 : rawLon,
            lat: Math.abs(rawLat) > 90  ? rawLat / 1e6 : rawLat
        };
    }

    function tripToGpx(data, t) {
        const trip = getDetailTrip(data);
        const abschnitte = trip.verbindungsAbschnitte || [];
        const xmlEsc = s => String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const from = t.from || '';
        const to   = t.to   || '';
        const title = xmlEsc(`${from} → ${to}`);

        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        gpx += `<gpx version="1.1" creator="DB Meine Reisen++" xmlns="http://www.topografix.com/GPX/1/1">\n`;
        gpx += `  <metadata><name>${title}</name><time>${xmlEsc(new Date().toISOString())}</time></metadata>\n`;

        // Waypoints — one per unique stop across all segments
        const seenStop = new Set();
        for (const abschnitt of abschnitte) {
            for (const halt of abschnitt.halte || []) {
                const key = halt.extId || halt.id;
                if (!key || seenStop.has(key)) continue;
                seenStop.add(key);
                const coord = coordFromHaltId(halt.id);
                if (!coord) continue;
                const time = halt.abfahrt?.sollzeit || halt.ankunft?.sollzeit || '';
                gpx += `  <wpt lat="${coord.lat}" lon="${coord.lon}">`;
                gpx += `<name>${xmlEsc(halt.name || '')}</name>`;
                if (time) gpx += `<time>${xmlEsc(time)}</time>`;
                gpx += `</wpt>\n`;
            }
        }

        // Track — one trk per Abschnitt, named with train and route
        for (const abschnitt of abschnitte) {
            const coords = (abschnitt.polylineGroup?.polylineDescriptions || [])
                .flatMap(d => d.coordinates || []);
            if (!coords.length) continue;

            const vm = abschnitt.verkehrsmittel || {};
            const trainName = vm.langText || vm.mittelText || vm.name || '';
            const origin = abschnitt.startHalt?.name || '';
            const dest   = abschnitt.zielHalt?.name  || '';
            const trkName = xmlEsc(`${trainName} ${origin} → ${dest}`);

            // Build ordered halt anchor list for timestamp matching
            const haltAnchors = [];
            for (const halt of abschnitt.halte || []) {
                const coord = coordFromHaltId(halt.id);
                const time  = halt.abfahrt?.sollzeit || halt.ankunft?.sollzeit;
                if (coord && time) haltAnchors.push({ lat: coord.lat, lon: coord.lon, time, used: false });
            }

            gpx += `  <trk><name>${trkName}</name>\n    <trkseg>\n`;
            for (const p of coords) {
                if (p == null || p.lat == null || p.lng == null) continue;
                // Stamp only the first trkpt within ~200 m of each halt (no interpolation)
                let matchTime = null;
                for (const h of haltAnchors) {
                    if (!h.used && Math.abs(p.lat - h.lat) < 0.002 && Math.abs(p.lng - h.lon) < 0.002) {
                        matchTime = h.time;
                        h.used = true;
                        break;
                    }
                }
                gpx += `      <trkpt lat="${p.lat}" lon="${p.lng}">`;
                if (matchTime) gpx += `<time>${xmlEsc(matchTime)}</time>`;
                gpx += `</trkpt>\n`;
            }
            gpx += `    </trkseg>\n  </trk>\n`;
        }

        gpx += `</gpx>`;
        return gpx;
    }

    function tripToGeoJson(data, t) {
        const trip = getDetailTrip(data);
        const abschnitte = trip.verbindungsAbschnitte || [];
        const from = t.from || '';
        const to   = t.to   || '';
        const features = [];
        const seenStop = new Set();

        for (const abschnitt of abschnitte) {
            // LineString per segment
            const coords = (abschnitt.polylineGroup?.polylineDescriptions || [])
                .flatMap(d => d.coordinates || [])
                .filter(p => p && p.lat != null && p.lng != null)
                .map(p => [p.lng, p.lat]);
            if (coords.length) {
                const vm = abschnitt.verkehrsmittel || {};
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: {
                        train:     vm.langText || vm.mittelText || vm.name || '',
                        trainType: vm.produktGattung || '',
                        operator:  (vm.zugattribute || []).find(a => a.key === 'BEF')?.value || '',
                        from:      abschnitt.startHalt?.name || '',
                        to:        abschnitt.zielHalt?.name  || '',
                        departure: abschnitt.startHalt?.abfahrt?.sollzeit || '',
                        arrival:   abschnitt.zielHalt?.ankunft?.sollzeit  || ''
                    }
                });
            }

            // Point per unique stop
            for (const halt of abschnitt.halte || []) {
                const key = halt.extId || halt.id;
                if (!key || seenStop.has(key)) continue;
                seenStop.add(key);
                const coord = coordFromHaltId(halt.id);
                if (!coord) continue;
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [coord.lon, coord.lat] },
                    properties: {
                        name:     halt.name || '',
                        time:     halt.abfahrt?.sollzeit || halt.ankunft?.sollzeit || '',
                        platform: halt.gleis || ''
                    }
                });
            }
        }

        return JSON.stringify({
            type: 'FeatureCollection',
            name: `${from} → ${to}`,
            features
        }, null, 2);
    }

    async function downloadGeo(t) {
        const isGeoJson = uiSettings['geo-format'] === 'geojson';
        try {
            const data = await fetchDetail(t.uuid);
            const trip = getDetailTrip(data);
            const hasGeometry = (trip.verbindungsAbschnitte || []).some(a =>
                (a.polylineGroup?.polylineDescriptions || []).some(d => d.coordinates?.length)
            );
            if (!hasGeometry) {
                alert(T.geoNoData);
                return;
            }
            const content  = isGeoJson ? tripToGeoJson(data, t) : tripToGpx(data, t);
            const mimeType = isGeoJson ? 'application/geo+json;charset=utf-8' : 'application/gpx+xml;charset=utf-8';
            const ext      = isGeoJson ? 'geojson' : 'gpx';
            const filename = `DB_${t.departure ? t.departure.slice(0, 10) : 'trip'}_${routeSlug(t)}.${ext}`;
            triggerDownload(new Blob([content], { type: mimeType }), filename);
        } catch (err) {
            console.error('[DBMRPP] Geo-Export-Fehler', err);
            alert(T.geoError);
        }
    }

    // =========================================================
    // 11) Share link generation
    // =========================================================
    async function getShareLink(t) {
        let ctxRecon = null;
        if (t.fromReiseketten) {
            try {
                const data = await fetchDetail(t.uuid);
                // The share endpoint expects this as "hinfahrtRecon".
                // Response shape can vary across account/ticket types, so resolve robustly.
                const trip0 = getDetailTrip(data);
                ctxRecon = extractCtxReconFromDetail(data);
                if (!ctxRecon) {
                    const root = getDetailRoot(data);
                    console.warn('[DBMRPP] getShareLink: ctxRecon missing in detail. root keys:',
                                 Object.keys(root || {}),
                                 'trip keys:', trip0 && typeof trip0 === 'object' ? Object.keys(trip0) : 'no trip');
                }
            } catch (err) {
                console.warn('[DBMRPP] getShareLink: detail fetch failed, trying auftrag fallback', err);
            }
        }

        // Fallback (and primary path for non-reiseketten trips): ctxRecon from auftrag detail.
        if (!ctxRecon && t.auftragsnummer) {
            const auftrag = await fetchAuftragDetail(t.auftragsnummer);
            ctxRecon = extractCtxReconFromAuftrag(auftrag) || null;
        }

        if (!ctxRecon) {
            throw new Error('ctxRecon not found in detail or auftrag response');
        }

        const payload = {
            startOrt:      t.from,
            zielOrt:       t.to,
            // departure is stored as local time string; new Date() treats no-tz as local → correct UTC
            hinfahrtDatum: t.departure ? new Date(t.departure).toISOString() : undefined,
            hinfahrtRecon: ctxRecon
        };
        // drop undefined fields
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        const shareRes = await dbFetch('/web/api/angebote/verbindung/teilen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!shareRes.ok) {
            let body = '';
            try { body = await shareRes.text(); } catch (_) {}
            console.error('[DBMRPP] share error body:', body);
            throw new Error(`Share HTTP ${shareRes.status}`);
        }
        const shareData = await shareRes.json();
        if (!shareData.vbid) throw new Error('No vbid in share response');
        return `https://www.bahn.de/buchung/start?vbid=${encodeURIComponent(shareData.vbid)}`;
    }

    // =========================================================
    // 12) Disruption detail — uses fetchDetail cache
    // =========================================================
    async function loadAbweichungMessages(t) {
        const data = await fetchDetail(t.uuid);
        const trip0 = getDetailTrip(data);
        const abschnitte = Array.isArray(trip0.verbindungsAbschnitte) ? trip0.verbindungsAbschnitte : [];
        const topMsgs = [
            ...(trip0.himMeldungen         || []),
            ...(trip0.priorisierteMeldungen || []),
            ...(trip0.risNotizen           || []),
        ];
        const segMsgs = abschnitte.flatMap(a => {
            if (!a) return [];
            const vm = a.verkehrsmittel || {};
            const label = vm.langText || vm.mittelText || vm.name || '';
            const raw = [
                ...((a.himMeldungen) || []),
                ...((a.priorisierteMeldungen) || []),
                ...((a.risNotizen) || [])
            ];
            if (!label || !raw.length) return raw;
            return raw.map(m => {
                const text = toNotificationText(m);
                return text ? { text: `${label}: ${text}` } : m;
            });
        });
        const normalized = normalizeNotificationEntries([...topMsgs, ...segMsgs]);
        if (t && normalized.length) {
            t.notifications = normalized;
            if (t.fromReiseketten) upsertTripHistoryFromReiseketten([t]);
        }
        return normalized;
    }

    // =========================================================
    // 13) Reiseketten (journey-chain) simplify / merge
    // =========================================================
    function mergeAuftrag(t, info) {
        if (!info) return;
        Object.assign(t, info);
    }

    // Realtime timestamps appear on travel day even when the train is on plan.
    // Keep them only when they actually differ from the schedule (mirrors the
    // rtTrack handling) so the mere arrival of realtime data is not a change.
    function normalizeRtTime(soll, rt) {
        return (rt && rt !== soll) ? rt : null;
    }

    function simplify(r) {
        const wiederholung = r.ueberwachung && r.ueberwachung.wiederholung;
        const notifications = collectNotificationsFromTripShape(r);
        return {
            uuid:                    r.reisekettenUuid,
            typ:                     r.typ,
            source:                  'reisekette',
            fromReiseketten:         true,
            ids:                     {
                reisekettenUuid: r.reisekettenUuid,
                kundenwunschId: r.auftrag && r.auftrag.kundenwunschId,
                auftragsnummer: r.auftrag && r.auftrag.auftragsnummer,
                syntheticId: null
            },
            from:                    r.origin      && r.origin.name,
            to:                      r.destination && r.destination.name,
            fromExtId:               r.origin      && r.origin.extId,
            toExtId:                 r.destination && r.destination.extId,
            departure:               r.origin      && r.origin.dateTime      && r.origin.dateTime.local,
            arrival:                 r.destination && r.destination.dateTime && r.destination.dateTime.local,
            departureTrack:          r.origin      && r.origin.track      || null,
            departureTrackRt:        r.origin      && r.origin.rtTrack && r.origin.rtTrack !== r.origin.track ? r.origin.rtTrack : null,
            arrivalTrack:            r.destination && r.destination.track || null,
            arrivalTrackRt:          r.destination && r.destination.rtTrack && r.destination.rtTrack !== r.destination.track ? r.destination.rtTrack : null,
            zugbindung:              r.auftrag && r.auftrag.zugbindung,
            auftragsnummer:          r.auftrag && r.auftrag.auftragsnummer,
            kundenwunschId:          r.auftrag && r.auftrag.kundenwunschId,
            leistungsbuendelId:      r.auftrag && r.auftrag.leistungsbuendelId,
            status:                  r.status,
            relevanteAbweichung:     !!r.relevanteAbweichung,
            alternativensuche:       r.alternativensuche,
            departureRt:             normalizeRtTime(r.origin && r.origin.dateTime && r.origin.dateTime.local,
                                                     r.origin && r.origin.rtDateTime && r.origin.rtDateTime.local),
            arrivalRt:               normalizeRtTime(r.destination && r.destination.dateTime && r.destination.dateTime.local,
                                                     r.destination && r.destination.rtDateTime && r.destination.rtDateTime.local),
            klasse:                  (r.einstiegsInformationen || []).some(e => e.leistungsKlasse === 'KLASSE_1') ? 1 : 2,
            zuege:                   (r.einstiegsInformationen || []).map(e => e.name).join(' → '),
            seats:                   collectSeats(r.einstiegsInformationen || []),
            notifications,
            ueberwacht:              r.ueberwacht !== undefined ? r.ueberwacht : null,
            ueberwachungName:        r.ueberwachung && r.ueberwachung.name || null,
            wiederholung:            wiederholung ? {
                                         wochentage: Array.isArray(wiederholung.wochentage) ? wiederholung.wochentage.slice() : [],
                                         aktivBis: wiederholung.aktivBis || null
                                     } : null,
            umreserviert:            (r.einstiegsInformationen || []).some(
                                         e => e.umreserviert && e.umreserviert !== 'KEINE_UMPLATZIERUNG'),
            letzterReiseplanBearbeiter: r.letzterReiseplanBearbeiter || null
        };
    }

    function collectSeats(eis) {
        const seats = [];
        eis.forEach(ei => {
            (ei.wagen || []).forEach(w => {
                const places = (w.zugeteiltePlaetze || []).map(p =>
                    (p.bisPlatz && p.bisPlatz !== p.vonPlatz) ? `${p.vonPlatz}–${p.bisPlatz}` : p.vonPlatz
                ).filter(Boolean);
                if (!places.length) return;
                const train = ei.name ? `${ei.name} ` : '';
                const wagon = w.wagennummer ? `W${w.wagennummer}` : 'W?';
                seats.push(`${train}${wagon}, Pl.${places.join(', ')}`);
            });
        });
        return seats.join('; ');
    }

    // Plan-equal rt times are stored as null (see normalizeRtTime), but older
    // snapshots and history-cache fills may still carry rt values identical to
    // the plan — normalize both sides here so those don't diff as changes.
    const DIFF_RT_PLAN_FIELD = { departureRt: 'departure', arrivalRt: 'arrival' };
    function diffFieldValue(t, f) {
        const v = t[f] ?? null;
        if (v && DIFF_RT_PLAN_FIELD[f] && v === t[DIFF_RT_PLAN_FIELD[f]]) return null;
        return v;
    }

    // All three categories share the { trip, changes? } shape so the change
    // block can render them through a single code path. Note that entfernt
    // trips are stale snapshot copies — they no longer exist in the current
    // trip pool, so uuid-based action handlers cannot resolve them.
    function diffSnapshots(prev, curr) {
        const out = { neu: [], entfernt: [], geaendert: [] };
        for (const uuid of Object.keys(curr)) {
            if (!prev[uuid]) {
                out.neu.push({ trip: curr[uuid] });
            } else {
                const c = curr[uuid], p = prev[uuid];
                const fld = DIFF_WATCHED
                    .filter(f => JSON.stringify(diffFieldValue(c, f)) !== JSON.stringify(diffFieldValue(p, f)))
                    .map(f => ({ field: f, old: diffFieldValue(p, f), new: diffFieldValue(c, f) }));
                if (fld.length) out.geaendert.push({ trip: c, changes: fld });
            }
        }
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const uuid of Object.keys(prev)) {
            if (!curr[uuid]) {
                const dep = prev[uuid].departure ? new Date(prev[uuid].departure).getTime() : 0;
                if (dep > cutoff) out.entfernt.push({ trip: prev[uuid] });
            }
        }
        return out;
    }

    // The change log only keeps what renderChangeLine and its action strip
    // read: route label, detail link, departure/arrival, and the routing
    // eligibility flags. Storing full trips (zuege, seats, …) would bloat
    // localStorage for no benefit.
    function slimTripForChangeLog(t) {
        return {
            uuid: t.uuid,
            auftragsnummer: t.auftragsnummer,
            ids: t.ids && t.ids.reisekettenUuid ? { reisekettenUuid: t.ids.reisekettenUuid } : undefined,
            from: t.from,
            to: t.to,
            fromExtId: t.fromExtId,
            toExtId: t.toExtId,
            leistungsname: t.leistungsname,
            name: t.name,
            departure: t.departure,
            arrival: t.arrival,
            fromReiseketten: t.fromReiseketten,
            isOrphaned: t.isOrphaned,
            isPastTrip: t.isPastTrip
        };
    }

    // Archive one diff result into the persistent change log. Called only at
    // baseline rotation: within the cooldown the same diff is recomputed
    // against the same baseline on every load, so appending there would log
    // duplicates — at rotation each change is captured exactly once.
    function appendToChangeLog(changes) {
        const detectedAt = new Date().toISOString();
        const entries = [
            ...changes.geaendert.map(c => ({ detectedAt, kind: 'geaendert', trip: slimTripForChangeLog(c.trip), changes: c.changes })),
            ...changes.neu.map(c => ({ detectedAt, kind: 'neu', trip: slimTripForChangeLog(c.trip) })),
            ...changes.entfernt.map(c => ({ detectedAt, kind: 'entfernt', trip: slimTripForChangeLog(c.trip) }))
        ];
        if (!entries.length) return;
        const log = loadChangeLog();
        log.push(...entries);
        if (log.length > CHANGE_LOG_MAX_ENTRIES) log.splice(0, log.length - CHANGE_LOG_MAX_ENTRIES);
        saveChangeLog(log);
    }

    // =========================================================
    // 14) Filter & export helpers
    // =========================================================
    const TRIP_TAG_DEFS = [
        { id: 'tagClass1',         cls: 'info', cond: t => t.klasse === 1,
          label: ()  => T.tagClass1 },
        { id: 'tagRegionalTicket', cls: 'ok',   cond: t => t.isVerbundticket,
          label: t  => `${esc(T.tagRegionalTicket)}${t.verbundCode ? ' ' + esc(t.verbundCode) : ''}` },
        { id: 'tagZugbindung',     cls: 'warn', cond: t => t.zugbindung === 'AUFGEHOBEN',
          label: ()  => T.tagZugbindung },
        { id: 'tagNotRecon',       cls: 'bad',  cond: t => t.status === 'NICHT_REKONSTRUIERBAR',
          label: ()  => T.tagNotRecon },
        { id: 'tagGebrochen',      cls: 'bad',  cond: t => t.status === 'GEBROCHEN',
          label: ()  => T.tagGebrochen },
        { id: 'tagBeingReplanned', cls: 'warn', cond: t => t.status === 'VORLAEUFIG_NICHT_REKONSTRUIERBAR',
          label: ()  => T.tagBeingReplanned },
        { id: 'tagMustReroute',    cls: 'bad',  cond: t => t.alternativensuche === 'ALTERNATIVEN_MUSS',
          label: ()  => T.tagMustReroute },
        { id: 'tagAltPossible',    cls: 'info', cond: t => t.alternativensuche === 'ALTERNATIVEN_KANN',
          label: ()  => T.tagAltPossible },
        { id: 'tagDisruption',     cls: 'warn', cond: t => t.relevanteAbweichung,
          label: ()  => T.tagDisruption },
        { id: 'tagRerouted',       cls: 'info', cond: t => t.letzterReiseplanBearbeiter === 'SYSTEM',
          label: ()  => T.tagRerouted },
        { id: 'tagReroutedByUser', cls: 'info', cond: t => t.letzterReiseplanBearbeiter === 'NUTZER',
          label: ()  => T.tagReroutedByUser },
        { id: 'tagReassigned',     cls: 'warn', cond: t => t.umreserviert,
          label: ()  => T.tagReassigned },
        { id: 'tagMuted',          cls: 'warn', cond: t => t.ueberwacht === false,
          label: ()  => T.tagMuted },
        { id: 'tagSaved',          cls: 'ok',   cond: t => t.typ === 'FREI' || (t.isFromHistoryCache && t.typ !== 'AUFTRAG'),
          label: ()  => T.tagSaved },
        { id: 'tagWiederholend',   cls: 'ok',   cond: t => t.typ === 'WIEDERHOLEND',
          label: ()  => T.tagWiederholend },
        { id: 'tagStorniert',          cls: 'bad',  cond: t => t.storniertStatus === 'STORNIERT',
          label: t  => esc(formatStorno(t.storniertStatus)) },
        { id: 'tagTeilweiseStorniert', cls: 'warn', cond: t => t.storniertStatus === 'TEILWEISE_STORNIERT',
          label: t  => esc(formatStorno(t.storniertStatus)) },
        { id: 'tagAuftragStatus',  cls: 'warn', cond: t => t.auftragStatus && t.auftragStatus !== 'ABGESCHLOSSEN' && t.typ === 'AUFTRAG',
          label: t  => esc(T.tagAuftragStatus(t.auftragStatus)) },
        { id: 'tagSeatCancelled',  cls: 'warn', cond: t => t.sitzplatzStorniert,
          label: ()  => T.tagSeatCancelled },
        { id: 'tagBikeCancelled',  cls: 'warn', cond: t => t.stellplatzStorniert,
          label: ()  => T.tagBikeCancelled },
        { id: 'tagPartFare',       cls: 'info', cond: t => t.teilpreis,
          label: ()  => T.tagPartFare },
        { id: 'tagReservationOnly', cls: 'info', cond: t => t.hasReiseangebot === false && (t.hasSitzplatz || t.hasStellplatz),
          label: ()  => T.tagReservationOnly },
    ];

    function getTripTagIds(t) {
        const ids = TRIP_TAG_DEFS.filter(d => d.cond(t)).map(d => d.id);
        (customTagAssignments[t.uuid] || []).forEach(id => {
            if (customTagDefs.some(d => d.id === id)) ids.push(id);
        });
        return ids;
    }

    function collectAvailableTags(trips) {
        const tags = new Set();
        trips.forEach(t => {
            getTripTagIds(t).forEach(id => tags.add(id));
        });
        return Array.from(tags).sort();
    }

    function getTagLabel(tagId) {
        const labels = {
            tagClass1: T.tagClass1,
            tagRegionalTicket: T.tagRegionalTicket,
            tagZugbindung: T.tagZugbindung,
            tagNotRecon: T.tagNotRecon,
            tagGebrochen: T.tagGebrochen,
            tagBeingReplanned: T.tagBeingReplanned,
            tagMustReroute: T.tagMustReroute,
            tagAltPossible: T.tagAltPossible,
            tagDisruption: T.tagDisruption,
            tagRerouted: T.tagRerouted,
            tagReroutedByUser: T.tagReroutedByUser,
            tagReassigned: T.tagReassigned,
            tagMuted: T.tagMuted,
            tagSaved: T.tagSaved,
            tagWiederholend: T.tagWiederholend,
            tagStorniert: T.tagStorniert,
            tagTeilweiseStorniert: T.tagTeilweiseStorniert,
            tagAuftragStatus: T.tagAuftragStatusLabel,
            tagSeatCancelled: T.tagSeatCancelled,
            tagBikeCancelled: T.tagBikeCancelled,
            tagReservationOnly: T.tagReservationOnly,
            tagPartFare: T.tagPartFare
        };
        const customDef = customTagDefs.find(d => d.id === tagId);
        if (customDef) return customDef.label;
        return labels[tagId] || tagId;
    }

    function filterTrips(trips, fs, pastView = false) {
        let result = trips;
        if (fs.from) result = result.filter(t => t.from === fs.from);
        if (fs.to)   result = result.filter(t => t.to   === fs.to);
        if (fs.days > 0) {
            if (pastView) {
                const cutoff = Date.now() - fs.days * 24 * 3600 * 1000;
                result = result.filter(t => !t.departure || new Date(t.departure).getTime() >= cutoff);
            } else {
                const cutoff = Date.now() + fs.days * 24 * 3600 * 1000;
                result = result.filter(t => !t.departure || new Date(t.departure).getTime() <= cutoff);
            }
        }
        if (fs.onlyProblems) {
            result = result.filter(t =>
                t.relevanteAbweichung ||
                t.zugbindung === 'AUFGEHOBEN' ||
                t.alternativensuche === 'ALTERNATIVEN_MUSS' ||
                (t.storniertStatus && t.storniertStatus !== 'NICHT_STORNIERT') ||
                t.status === 'NICHT_REKONSTRUIERBAR' ||
                t.status === 'GEBROCHEN' ||
                t.sitzplatzStorniert || t.stellplatzStorniert ||
                t.status === 'VORLAEUFIG_NICHT_REKONSTRUIERBAR'
            );
        }
        if (fs.tags && fs.tags.length > 0) {
            result = result.filter(t =>
                fs.tags.every(tagId => getTripTagIds(t).includes(tagId))
            );
        }
        if (!uiSettings.showCancelledTrips) {
            result = result.filter(t => t.storniertStatus !== 'STORNIERT');
        }
        return result;
    }

    function filterUpcomingTrips(trips) {
        const now = Date.now();
        return trips.filter(t => {
            const end = t.arrival   ? new Date(t.arrival).getTime()   + 2  * 3600 * 1000
                      : t.departure ? new Date(t.departure).getTime() + 12 * 3600 * 1000
                      : 0;
            return end > now;
        });
    }

    function reRender() {
        if (!lastRenderArgs) return;
        const { trips, orphans, changes, lastVisit } = lastRenderArgs;
        renderUI(trips, orphans, changes, lastVisit);
    }

    function formatReisende(reisende) {
        if (!reisende || !reisende.length) return '';
        return reisende.map(r => {
            const disc = r.ermaessigungen && r.ermaessigungen.length
                ? ` (${r.ermaessigungen.join(', ')})` : '';
            return `${r.anzahl}× ${r.typ}${disc}`;
        }).join('; ');
    }

    function exportCsv(trips) {
        const bool = v => v ? (IS_INT ? 'yes' : 'ja') : '';
        const rows = trips.map(t => [
            t.departure        ? t.departure.slice(0, 10)        : '',
            t.departure        ? formatDateTime(t.departure)     : '',
            t.arrival          ? formatDateTime(t.arrival)       : '',
            t.departureRt      ? formatDateTime(t.departureRt)   : '',
            t.arrivalRt        ? formatDateTime(t.arrivalRt)     : '',
            t.from             || '',
            t.to               || '',
            t.departureTrack   || '',
            t.arrivalTrack     || '',
            t.zuege            || '',
            t.leistungsname    || '',
            t.klasse           || '',
            t.leistungsklasse  || '',
            t.typ              || '',
            t.auftragsnummer   || '',
            t.anlagedatum      ? formatDate(t.anlagedatum)       : '',
            t.nachname         || '',
            t.zugbindung       || '',
            t.storniertStatus  || '',
            t.auftragStatus    || '',
            t.status           || '',
            t.seats            || '',
            bool(t.hasSitzplatz),
            bool(t.sitzplatzStorniert),
            bool(t.hasStellplatz),
            bool(t.stellplatzStorniert),
            t.hasReiseangebot === false ? 'TRUE' : '',
            t.cityTicket       || '',
            bool(t.isVerbundticket),
            t.verbundCode      || '',
            bool(t.teilpreis),
            t.gueltigVon       ? formatDate(t.gueltigVon)        : '',
            t.gueltigBis       ? formatDate(t.gueltigBis)        : '',
            bool(t.relevanteAbweichung),
            t.alternativensuche || '',
            formatReisende(t.reisende),
            t.uuid             || '',
            t.kundenwunschId   || '',
            t.leistungsbuendelId || '',
            t.ueberwacht === null ? '' : bool(t.ueberwacht),
            bool(t.umreserviert),
            t.letzterReiseplanBearbeiter || '',
            t.fromExtId || '',
            t.toExtId   || '', // bulk reiseketten API may return the train's terminus instead of the booked destination
            t.ueberwachungName || '',
            t.wiederholung ? (t.wiederholung.wochentage || []).join(', ') : '',
            t.wiederholung && t.wiederholung.aktivBis ? formatDate(t.wiederholung.aktivBis) : '',
            (customTagAssignments[t.uuid] || [])
                .map(id => { const d = customTagDefs.find(x => x.id === id); return d ? d.label : null; })
                .filter(Boolean)
                .join(', '),
            tripNotes[t.uuid] || ''
        ]);
        const q = v => '"' + String(v).replace(/"/g, '""') + '"';
        const csv = [T.csvHeaders.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n');
        triggerDownload(
            new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
            `db-reisen-${new Date().toISOString().slice(0, 10)}.csv`
        );
    }

    // =========================================================
    // 15) Bulk ICS (client-side, no API calls)
    // =========================================================
    function formatIcsDt(iso) { return iso.replace(/[-:]/g, '').slice(0, 15); }

    function icsEscape(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }

    function icsFold(line) {
        if (line.length <= 75) return line;
        let out = '';
        while (line.length > 75) { out += line.slice(0, 75) + '\r\n '; line = line.slice(75); }
        return out + line;
    }

    function buildBulkIcs(trips) {
        const dtstamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
        const events = trips.map(t => {
            if (!t.departure) return '';
            const uid = (t.typ === 'AUFTRAG' && t.kundenwunschId)
                ? `${t.kundenwunschId}@db-meine-reisen-plus-plus`
                : `${t.uuid}@db-meine-reisen-plus-plus`;
            const dtstart = formatIcsDt(t.departure);
            const dtend = t.arrival
                ? formatIcsDt(t.arrival)
                : formatIcsDt(new Date(new Date(t.departure).getTime() + 3600000).toISOString().slice(0, 19));
            const descParts = [];
            if (tripNotes[t.uuid])  descParts.push(tripNotes[t.uuid]);
            if (t.leistungsname)  descParts.push(t.leistungsname);
            if (t.zuege)          descParts.push(T.icsDescTrains(t.zuege));
            if (t.auftragsnummer) descParts.push(T.icsDescOrder(t.auftragsnummer));
            if (t.seats)          descParts.push(T.icsDescSeat(t.seats));
            if (t.zugbindung === 'AUFGEHOBEN') descParts.push(T.icsDescZugbindung);
            if (t.auftragsnummer || t.uuid) descParts.push(T.icsDescLink(buildDetailUrl(t)));
            return [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART;TZID=Europe/Berlin:${dtstart}`,
                `DTEND;TZID=Europe/Berlin:${dtend}`,
                `SUMMARY:${icsEscape(`${t.from || '?'} → ${t.to || '?'}`)}`,
                descParts.length ? `DESCRIPTION:${icsEscape(descParts.join('\n'))}` : '',
                t.from ? `LOCATION:${icsEscape(t.from)}` : '',
                'END:VEVENT'
            ].filter(Boolean).map(icsFold).join('\r\n');
        }).filter(Boolean);
        return [
            'BEGIN:VCALENDAR', 'VERSION:2.0',
            `PRODID:-//DB Meine Reisen++//${IS_INT ? 'EN' : 'DE'}`,
            'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            ...events,
            'END:VCALENDAR'
        ].join('\r\n');
    }

    // =========================================================
    // 16) Snapshot export / WebDAV / CalDAV sync
    // =========================================================
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function exportSnapshotBundle() {
        try {
            const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const history = JSON.parse(localStorage.getItem(REISEKETTEN_HISTORY_KEY) || '{}');
            const payload = {
                format: 'dbmrpp-snapshot-export-v1',
                exportedAt: new Date().toISOString(),
                snapshot: isPlainObject(snapshot) ? snapshot : {},
                lastVisit: localStorage.getItem(LAST_VISIT_KEY),
                settings: isPlainObject(settings) ? settings : {},
                tripHistory: isPlainObject(history) && isPlainObject(history.entries)
                    ? { entries: history.entries }
                    : { entries: {} },
                customTagDefs: customTagDefs.slice(),
                customTagAssignments: { ...customTagAssignments },
                customTagAssignmentsUpdatedAt: localStorage.getItem(TAG_ASSIGNMENTS_UPDATED_AT_KEY) || null,
                tripNotes: { ...tripNotes },
                tripNotesUpdatedAt: localStorage.getItem(TRIP_NOTES_UPDATED_AT_KEY) || null,
                fgrClaims: { ...fgrClaims },
                fgrClaimsUpdatedAt: localStorage.getItem(FGR_CLAIMS_UPDATED_AT_KEY) || null,
                settingsUpdatedAt: localStorage.getItem(SETTINGS_UPDATED_AT_KEY) || null
            };
            triggerDownload(
                new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
                `dbmrpp-snapshot-${new Date().toISOString().slice(0, 10)}.json`
            );
        } catch (err) {
            console.error('[DBMRPP] Snapshot-Export-Fehler', err);
            alert(T.alertExportError);
        }
    }

    function mergeObjects(localObj, importedObj, preferImported) {
        const localSafe = isPlainObject(localObj) ? localObj : {};
        const importedSafe = isPlainObject(importedObj) ? importedObj : {};
        return preferImported
            ? { ...localSafe, ...importedSafe }
            : { ...importedSafe, ...localSafe };
    }

    // Resolves by updatedAt (cachedAt is fixed at first-cache time and says
    // nothing about content freshness; legacy entries without updatedAt fall
    // back to it). Ties keep the local entry — it is refreshed from live data
    // on every run, so a remote copy with the same timestamp is never newer.
    function mergeHistoryEntriesNewestWins(localEntries, importedEntries) {
        const merged = { ...(isPlainObject(localEntries) ? localEntries : {}) };
        const entryTs = e => Date.parse((e && (e.updatedAt || e.cachedAt)) || 0) || 0;
        Object.entries(isPlainObject(importedEntries) ? importedEntries : {}).forEach(([key, importedEntry]) => {
            const localEntry = merged[key];
            if (!localEntry) {
                merged[key] = importedEntry;
                return;
            }
            if (entryTs(importedEntry) > entryTs(localEntry)) merged[key] = importedEntry;
        });
        return merged;
    }

    function buildHistoryEntriesFromSnapshot(snapshotObj, cachedAtOverride) {
        if (!isPlainObject(snapshotObj)) return {};
        const entries = {};
        const trips = Object.values(snapshotObj).filter(t =>
            !!t && (
                t.fromReiseketten === true ||
                t.source === 'reisekette' ||
                t.source === 'merged'
            )
        );
        trips.forEach(t => {
            const entry = buildTripHistoryEntry(t, cachedAtOverride || null);
            if (!entry) return;
            const key = historyEntryPrimaryKey(entry);
            if (!key) return;
            entry.updatedAt = entry.cachedAt;
            entries[key] = entry;
        });
        return entries;
    }

    async function importSnapshotBundle(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const looksLikeBundle = data && data.format === 'dbmrpp-snapshot-export-v1';
            const hasShape = isPlainObject(data && data.snapshot) && isPlainObject(data && data.settings);
            if (!looksLikeBundle || !hasShape) {
                alert(T.alertImportInvalid);
                return;
            }
            if (!confirm(T.alertImportMergeConfirm)) return;

            const localSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const localSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const localHistory = normalizeTripHistory(JSON.parse(localStorage.getItem(REISEKETTEN_HISTORY_KEY) || '{}'));

            const localLastVisit = localStorage.getItem(LAST_VISIT_KEY);
            const importedLastVisit = (typeof data.lastVisit === 'string' && data.lastVisit) ? data.lastVisit : null;
            const localTs = Date.parse(localLastVisit || 0) || 0;
            const importedTs = Date.parse(importedLastVisit || 0) || 0;
            const preferImported = importedTs >= localTs;

            const mergedSnapshot = mergeObjects(localSnapshot, data.snapshot, preferImported);
            const mergedSettings = mergeObjects(localSettings, data.settings, preferImported);

            localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedSnapshot));
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergedSettings));

            const chosenLastVisit = localTs >= importedTs ? localLastVisit : importedLastVisit;
            if (typeof chosenLastVisit === 'string' && chosenLastVisit) {
                localStorage.setItem(LAST_VISIT_KEY, chosenLastVisit);
            } else {
                localStorage.removeItem(LAST_VISIT_KEY);
            }

            const importedHistory = data && (data.tripHistory || data.reisekettenHistory);
            const hasHistoryShape = isPlainObject(importedHistory) && isPlainObject(importedHistory.entries);
            const normalizedImportedHistory = hasHistoryShape
                ? normalizeTripHistory(importedHistory)
                : normalizeTripHistory({
                    entries: buildHistoryEntriesFromSnapshot(data.snapshot, importedLastVisit)
                });
            const mergedHistory = normalizeTripHistory({
                entries: mergeHistoryEntriesNewestWins(localHistory.entries, normalizedImportedHistory.entries)
            });
            localStorage.setItem(REISEKETTEN_HISTORY_KEY, JSON.stringify(mergedHistory));
            tripHistory = mergedHistory;

            if (Array.isArray(data.customTagDefs)) {
                const mergedDefs = [...customTagDefs];
                const localIds = new Map(mergedDefs.map((d, i) => [d.id, i]));
                data.customTagDefs.forEach(def => {
                    if (!def || !def.id || !def.label) return;
                    const idx = localIds.get(def.id);
                    if (idx === undefined) { mergedDefs.push(def); localIds.set(def.id, mergedDefs.length - 1); }
                    else if (preferImported) mergedDefs[idx] = def;
                });
                customTagDefs = mergedDefs;
                saveCustomTagDefs();
            }
            if (isPlainObject(data.customTagAssignments)) {
                customTagAssignments = preferImported
                    ? { ...customTagAssignments, ...data.customTagAssignments }
                    : { ...data.customTagAssignments, ...customTagAssignments };
                saveCustomTagAssignments();
            }
            if (isPlainObject(data.tripNotes)) {
                tripNotes = preferImported
                    ? { ...tripNotes, ...data.tripNotes }
                    : { ...data.tripNotes, ...tripNotes };
                saveTripNotes();
            }
            if (isPlainObject(data.fgrClaims)) {
                fgrClaims = preferImported
                    ? { ...fgrClaims, ...data.fgrClaims }
                    : { ...data.fgrClaims, ...fgrClaims };
                saveFgrClaims();
            }

            uiSettings = loadUiSettings();
            filterState = { from: '', to: '', days: 0, onlyProblems: false, tags: [] };
            activeView = 'current';
            loadFilterStateIfEnabled();

            alert(T.alertImportSuccess);
            run();
        } catch (err) {
            console.error('[DBMRPP] Snapshot-Import-Fehler', err);
            alert(T.alertImportError);
        }
    }

    // =========================================================
    // WebDAV sync
    // =========================================================
    function loadWebDavConfig() {
        try {
            const raw = JSON.parse(localStorage.getItem(WEBDAV_CONFIG_KEY) || '{}');
            return {
                enabled:  !!raw.enabled,
                url:      typeof raw.url      === 'string' ? raw.url      : '',
                username: typeof raw.username === 'string' ? raw.username : '',
                password: typeof raw.password === 'string' ? raw.password : ''
            };
        } catch (_) {
            return { enabled: false, url: '', username: '', password: '' };
        }
    }

    function saveWebDavConfig() {
        try { localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(webdavConfig)); } catch (_) {}
    }

    function loadWebDavSyncState() {
        try {
            const raw = JSON.parse(localStorage.getItem(WEBDAV_SYNC_STATE_KEY) || '{}');
            return { lastSyncedAt: raw.lastSyncedAt || null, lastError: raw.lastError || null };
        } catch (_) {
            return { lastSyncedAt: null, lastError: null };
        }
    }

    function saveWebDavSyncState() {
        try { localStorage.setItem(WEBDAV_SYNC_STATE_KEY, JSON.stringify(webdavSyncState)); } catch (_) {}
    }

    function webdavSyncStatusText() {
        if (webdavSyncState.lastError) return T.webDavStatusError(webdavSyncState.lastError);
        if (webdavSyncState.lastSyncedAt) return T.webDavStatusOk(formatDateTime(webdavSyncState.lastSyncedAt));
        return T.webDavStatusNever;
    }

    function reRenderSyncStatus() {
        const el = document.getElementById('dbmrpp-webdav-status');
        if (el) el.textContent = webdavSyncStatusText();
    }

    function scheduleWebDavSync() {
        if (!webdavConfig.enabled || !webdavConfig.url) return;
        if (webdavSyncTimer !== null) clearTimeout(webdavSyncTimer);
        webdavSyncTimer = setTimeout(() => { webdavSyncTimer = null; webdavSync(); }, 2000);
    }

    function gmXhr(method, url, headers, body) {
        return new Promise((resolve, reject) => {
            const req = {
                method, url, headers, timeout: 15000,
                anonymous: true,
                onload:    r => resolve(r),
                onerror:   e => reject(new Error('Network error' + (e && e.error ? ': ' + e.error : ''))),
                ontimeout: () => reject(new Error('Timeout'))
            };
            if (body !== undefined) req.data = body;
            GM_xmlhttpRequest(req);
        });
    }

    function buildSyncBundle() {
        const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        const history  = JSON.parse(localStorage.getItem(REISEKETTEN_HISTORY_KEY) || '{}');
        return {
            format:     'dbmrpp-snapshot-export-v1',
            exportedAt: new Date().toISOString(),
            snapshot:   isPlainObject(snapshot) ? snapshot : {},
            lastVisit:  localStorage.getItem(LAST_VISIT_KEY),
            settings:   isPlainObject(settings) ? settings : {},
            settingsUpdatedAt: localStorage.getItem(SETTINGS_UPDATED_AT_KEY) || null,
            tripHistory: isPlainObject(history) && isPlainObject(history.entries)
                ? { entries: history.entries }
                : { entries: {} },
            customTagDefs: customTagDefs.slice(),
            customTagAssignments: { ...customTagAssignments },
            customTagAssignmentsUpdatedAt: localStorage.getItem(TAG_ASSIGNMENTS_UPDATED_AT_KEY) || null,
            tripNotes: { ...tripNotes },
            tripNotesUpdatedAt: localStorage.getItem(TRIP_NOTES_UPDATED_AT_KEY) || null,
            fgrClaims: { ...fgrClaims },
            fgrClaimsUpdatedAt: localStorage.getItem(FGR_CLAIMS_UPDATED_AT_KEY) || null
        };
    }

    function mergeBundles(local, remote) {
        const localVisitTs  = Date.parse(local.lastVisit  || 0) || 0;
        const remoteVisitTs = Date.parse(remote.lastVisit || 0) || 0;
        const preferRemoteSnapshot = remoteVisitTs > localVisitTs;

        const localSettingsTs  = Date.parse(local.settingsUpdatedAt  || 0) || 0;
        const remoteSettingsTs = Date.parse(remote.settingsUpdatedAt || 0) || 0;
        const preferRemoteSettings = remoteSettingsTs > localSettingsTs;

        const localTagTs  = Date.parse(local.customTagAssignmentsUpdatedAt  || 0) || 0;
        const remoteTagTs = Date.parse(remote.customTagAssignmentsUpdatedAt || 0) || 0;
        const preferRemoteTags = remoteTagTs > localTagTs;

        const localNotesTs  = Date.parse(local.tripNotesUpdatedAt  || 0) || 0;
        const remoteNotesTs = Date.parse(remote.tripNotesUpdatedAt || 0) || 0;
        const preferRemoteNotes = remoteNotesTs > localNotesTs;

        const localFgrTs  = Date.parse(local.fgrClaimsUpdatedAt  || 0) || 0;
        const remoteFgrTs = Date.parse(remote.fgrClaimsUpdatedAt || 0) || 0;
        const preferRemoteFgr = remoteFgrTs > localFgrTs;

        const mergedHistory = normalizeTripHistory({
            entries: mergeHistoryEntriesNewestWins(
                (local.tripHistory  && local.tripHistory.entries)  || {},
                (remote.tripHistory && remote.tripHistory.entries) || {}
            )
        });

        const mergedDefs = [...(local.customTagDefs || [])];
        const localDefIds = new Map(mergedDefs.map((d, i) => [d.id, i]));
        (remote.customTagDefs || []).forEach(def => {
            if (!def || !def.id || !def.label) return;
            const idx = localDefIds.get(def.id);
            if (idx === undefined) { mergedDefs.push(def); localDefIds.set(def.id, mergedDefs.length - 1); }
            else if (preferRemoteSettings) mergedDefs[idx] = def;
        });

        const localSnap  = isPlainObject(local.snapshot)  ? local.snapshot  : {};
        const remoteSnap = isPlainObject(remote.snapshot) ? remote.snapshot : {};
        const localSett  = isPlainObject(local.settings)  ? local.settings  : {};
        const remoteSett = isPlainObject(remote.settings) ? remote.settings : {};

        return {
            format:     'dbmrpp-snapshot-export-v1',
            exportedAt: new Date().toISOString(),
            snapshot:   preferRemoteSnapshot ? { ...localSnap,  ...remoteSnap  } : { ...remoteSnap,  ...localSnap  },
            lastVisit:  preferRemoteSnapshot
                ? (remote.lastVisit || local.lastVisit)
                : (local.lastVisit  || remote.lastVisit),
            settings:   preferRemoteSettings ? { ...localSett,  ...remoteSett  } : { ...remoteSett,  ...localSett  },
            settingsUpdatedAt: preferRemoteSettings
                ? (remote.settingsUpdatedAt || local.settingsUpdatedAt)
                : (local.settingsUpdatedAt  || remote.settingsUpdatedAt),
            tripHistory: mergedHistory,
            customTagDefs: mergedDefs,
            customTagAssignments: preferRemoteTags
                ? { ...(local.customTagAssignments  || {}), ...(remote.customTagAssignments || {}) }
                : { ...(remote.customTagAssignments || {}), ...(local.customTagAssignments  || {}) },
            customTagAssignmentsUpdatedAt: preferRemoteTags
                ? (remote.customTagAssignmentsUpdatedAt || local.customTagAssignmentsUpdatedAt)
                : (local.customTagAssignmentsUpdatedAt  || remote.customTagAssignmentsUpdatedAt),
            tripNotes: preferRemoteNotes
                ? { ...(local.tripNotes  || {}), ...(remote.tripNotes || {}) }
                : { ...(remote.tripNotes || {}), ...(local.tripNotes  || {}) },
            tripNotesUpdatedAt: preferRemoteNotes
                ? (remote.tripNotesUpdatedAt || local.tripNotesUpdatedAt)
                : (local.tripNotesUpdatedAt  || remote.tripNotesUpdatedAt),
            fgrClaims: preferRemoteFgr
                ? { ...(local.fgrClaims  || {}), ...(remote.fgrClaims || {}) }
                : { ...(remote.fgrClaims || {}), ...(local.fgrClaims  || {}) },
            fgrClaimsUpdatedAt: preferRemoteFgr
                ? (remote.fgrClaimsUpdatedAt || local.fgrClaimsUpdatedAt)
                : (local.fgrClaimsUpdatedAt  || remote.fgrClaimsUpdatedAt)
        };
    }

    function applyBundle(bundle) {
        if (!isPlainObject(bundle)) return;
        if (isPlainObject(bundle.snapshot)) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle.snapshot)); } catch (_) {}
        }
        if (typeof bundle.lastVisit === 'string' && bundle.lastVisit) {
            try { localStorage.setItem(LAST_VISIT_KEY, bundle.lastVisit); } catch (_) {}
        }
        if (isPlainObject(bundle.settings)) {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(bundle.settings));
                if (bundle.settingsUpdatedAt) localStorage.setItem(SETTINGS_UPDATED_AT_KEY, bundle.settingsUpdatedAt);
            } catch (_) {}
            uiSettings = loadUiSettings();
        }
        if (isPlainObject(bundle.tripHistory) && isPlainObject(bundle.tripHistory.entries)) {
            const normalized = normalizeTripHistory(bundle.tripHistory);
            try { localStorage.setItem(REISEKETTEN_HISTORY_KEY, JSON.stringify(normalized)); } catch (_) {}
            tripHistory = normalized;
        }
        if (Array.isArray(bundle.customTagDefs)) {
            customTagDefs = bundle.customTagDefs;
            saveCustomTagDefs();
        }
        if (isPlainObject(bundle.customTagAssignments)) {
            customTagAssignments = bundle.customTagAssignments;
            try {
                localStorage.setItem(CUSTOM_TAG_ASSIGNMENTS_KEY, JSON.stringify(customTagAssignments));
                if (bundle.customTagAssignmentsUpdatedAt) {
                    localStorage.setItem(TAG_ASSIGNMENTS_UPDATED_AT_KEY, bundle.customTagAssignmentsUpdatedAt);
                }
            } catch (_) {}
        }
        if (isPlainObject(bundle.tripNotes)) {
            tripNotes = bundle.tripNotes;
            try {
                localStorage.setItem(NOTES_KEY, JSON.stringify(tripNotes));
                if (bundle.tripNotesUpdatedAt) {
                    localStorage.setItem(TRIP_NOTES_UPDATED_AT_KEY, bundle.tripNotesUpdatedAt);
                }
            } catch (_) {}
        }
        if (isPlainObject(bundle.fgrClaims)) {
            fgrClaims = bundle.fgrClaims;
            try {
                localStorage.setItem(FGR_CLAIMS_KEY, JSON.stringify(fgrClaims));
                if (bundle.fgrClaimsUpdatedAt) {
                    localStorage.setItem(FGR_CLAIMS_UPDATED_AT_KEY, bundle.fgrClaimsUpdatedAt);
                }
            } catch (_) {}
        }
    }

    async function webdavSync() {
        if (!webdavConfig.enabled || !webdavConfig.url) return;
        const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(webdavConfig.username + ':' + webdavConfig.password)));
        const headers = { 'Authorization': authHeader };

        const statusEl = document.getElementById('dbmrpp-webdav-status');
        if (statusEl) statusEl.textContent = T.webDavStatusSyncing;
        dbLog('webdav: sync start → ' + webdavConfig.url);

        try {
            let remoteBundle = null;
            const getRes = await gmXhr('GET', webdavConfig.url, headers, undefined);
            dbLog('webdav: GET ' + getRes.status);
            if (getRes.status === 200 && getRes.responseText) {
                try {
                    const parsed = JSON.parse(getRes.responseText);
                    if (parsed && parsed.format === 'dbmrpp-snapshot-export-v1') remoteBundle = parsed;
                } catch (_) {}
            } else if (getRes.status !== 404) {
                dbLog('webdav: GET resp-hdrs: ' + (getRes.responseHeaders || '(none)').replace(/\r?\n/g, ' | '));
                throw new Error(`HTTP ${getRes.status}`);
            }

            const localBundle = buildSyncBundle();
            const merged = remoteBundle ? mergeBundles(localBundle, remoteBundle) : localBundle;
            dbLog('webdav: merged (remote=' + !!remoteBundle + ')');
            applyBundle(merged);

            const putRes = await gmXhr('PUT', webdavConfig.url,
                { ...headers, 'Content-Type': 'application/json' },
                JSON.stringify(merged, null, 2)
            );
            dbLog('webdav: PUT ' + putRes.status);
            if (putRes.status < 200 || putRes.status >= 300) {
                dbLog('webdav: PUT resp-hdrs: ' + (putRes.responseHeaders || '(none)').replace(/\r?\n/g, ' | '));
                dbLog('webdav: PUT resp-body: ' + (putRes.responseText || '(empty)').slice(0, 400));
                throw new Error(`HTTP ${putRes.status}`);
            }

            webdavSyncState = { lastSyncedAt: new Date().toISOString(), lastError: null };
            saveWebDavSyncState();
            reRenderSyncStatus();
            reRender();
            dbLog('webdav: sync done');
        } catch (err) {
            dbLog('webdav: sync error ' + (err.message || err));
            webdavSyncState = { ...webdavSyncState, lastError: err.message || String(err) };
            saveWebDavSyncState();
            reRenderSyncStatus();
            console.error('[DBMRPP] WebDAV sync error:', err);
        }
    }

    function routeSlug(t) {
        return (t.from || 'Reise').replace(/[^a-z0-9]+/gi, '_')
             + '-' + (t.to || '').replace(/[^a-z0-9]+/gi, '_');
    }

    // =========================================================
    // CalDAV push
    // =========================================================
    function loadCalDavConfig() {
        try {
            const raw = JSON.parse(localStorage.getItem(CALDAV_CONFIG_KEY) || '{}');
            return {
                enabled:             !!raw.enabled,
                url:                 typeof raw.url      === 'string' ? raw.url      : '',
                username:            typeof raw.username === 'string' ? raw.username : '',
                password:            typeof raw.password === 'string' ? raw.password : '',
                includePastTrips:       raw.includePastTrips !== false,
                includeCachedTrips:     !!raw.includeCachedTrips,
                includeLeistungTickets: !!raw.includeLeistungTickets
            };
        } catch (_) {
            return { enabled: false, url: '', username: '', password: '', includePastTrips: true, includeCachedTrips: false, includeLeistungTickets: false };
        }
    }

    function saveCalDavConfig() {
        try { localStorage.setItem(CALDAV_CONFIG_KEY, JSON.stringify(caldavConfig)); } catch (_) {}
    }

    function loadCalDavSyncState() {
        try {
            const raw = JSON.parse(localStorage.getItem(CALDAV_SYNC_STATE_KEY) || '{}');
            return {
                lastSyncedAt:       raw.lastSyncedAt || null,
                lastError:          raw.lastError    || null,
                pushedFingerprints: isPlainObject(raw.pushedFingerprints) ? raw.pushedFingerprints : {}
            };
        } catch (_) {
            return { lastSyncedAt: null, lastError: null, pushedFingerprints: {} };
        }
    }

    function saveCalDavSyncState() {
        try { localStorage.setItem(CALDAV_SYNC_STATE_KEY, JSON.stringify(caldavSyncState)); } catch (_) {}
    }

    function calDavSyncStatusText() {
        if (caldavSyncState.lastError) return T.calDavStatusError(caldavSyncState.lastError);
        if (caldavSyncState.lastSyncedAt) return T.calDavStatusOk(formatDateTime(caldavSyncState.lastSyncedAt));
        return T.calDavStatusNever;
    }

    function reRenderCalDavStatus() {
        const el = document.getElementById('dbmrpp-caldav-status');
        if (el) el.textContent = calDavSyncStatusText();
    }

    function scheduleCalDavSync() {
        if (!caldavConfig.enabled || !caldavConfig.url) return;
        if (caldavSyncTimer !== null) clearTimeout(caldavSyncTimer);
        caldavSyncTimer = setTimeout(() => { caldavSyncTimer = null; caldavSync(); }, 2000);
    }

    function caldavBerlinDate(iso) {
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })
            .format(new Date(iso));
        // dateStr is YYYY-MM-DD; add one day via noon-UTC trick to avoid DST edge cases
        const next = new Date(dateStr + 'T12:00:00Z');
        next.setUTCDate(next.getUTCDate() + 1);
        const nextStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' })
            .format(next);
        return { start: dateStr.replace(/-/g, ''), end: nextStr.replace(/-/g, '') };
    }

    function buildCalDavEventIcs(t) {
        const dtstamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
        const uid = caldavEventUid(t);

        let vevent;
        if (t.isLeistungTicket) {
            const { start, end } = caldavBerlinDate(t.departure);
            const descParts = [];
            if (tripNotes[t.uuid])  descParts.push(tripNotes[t.uuid]);
            if (t.auftragsnummer) descParts.push(T.icsDescOrder(t.auftragsnummer));
            if (t.auftragsnummer || t.uuid) descParts.push(T.icsDescLink(buildDetailUrl(t)));
            vevent = [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${icsEscape(t.leistungsname || 'Ticket')}`,
                descParts.length ? `DESCRIPTION:${icsEscape(descParts.join('\n'))}` : '',
                'END:VEVENT'
            ].filter(Boolean).map(icsFold).join('\r\n');
        } else {
        const dtstart = formatIcsDt(t.departure);
        const dtend = t.arrival
            ? formatIcsDt(t.arrival)
            : formatIcsDt(new Date(new Date(t.departure).getTime() + 3600000).toISOString().slice(0, 19));
        const descParts = [];
        if (tripNotes[t.uuid])  descParts.push(tripNotes[t.uuid]);
        if (t.leistungsname)  descParts.push(t.leistungsname);
        if (t.zuege)          descParts.push(T.icsDescTrains(t.zuege));
        if (t.auftragsnummer) descParts.push(T.icsDescOrder(t.auftragsnummer));
        if (t.seats)          descParts.push(T.icsDescSeat(t.seats));
        if (t.zugbindung === 'AUFGEHOBEN') descParts.push(T.icsDescZugbindung);
        if (t.auftragsnummer || t.uuid) descParts.push(T.icsDescLink(buildDetailUrl(t)));
        vevent = [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;TZID=Europe/Berlin:${dtstart}`,
            `DTEND;TZID=Europe/Berlin:${dtend}`,
            `SUMMARY:${icsEscape(`${t.from || '?'} → ${t.to || '?'}`)}`,
            descParts.length ? `DESCRIPTION:${icsEscape(descParts.join('\n'))}` : '',
            t.from ? `LOCATION:${icsEscape(t.from)}` : '',
            'END:VEVENT'
        ].filter(Boolean).map(icsFold).join('\r\n');
        }
        const needsTz = !t.isLeistungTicket;
        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            `PRODID:-//DB Meine Reisen++//${IS_INT ? 'EN' : 'DE'}`,
            'CALSCALE:GREGORIAN',
            needsTz ? [
                'BEGIN:VTIMEZONE',
                'TZID:Europe/Berlin',
                'BEGIN:STANDARD',
                'TZOFFSETFROM:+0200',
                'TZOFFSETTO:+0100',
                'TZNAME:CET',
                'DTSTART:19701025T030000',
                'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
                'END:STANDARD',
                'BEGIN:DAYLIGHT',
                'TZOFFSETFROM:+0100',
                'TZOFFSETTO:+0200',
                'TZNAME:CEST',
                'DTSTART:19700329T020000',
                'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
                'END:DAYLIGHT',
                'END:VTIMEZONE'
            ].join('\r\n') : null,
            vevent,
            'END:VCALENDAR'
        ].filter(Boolean).join('\r\n');
    }

    function caldavEventUid(t) {
        return (t.typ === 'AUFTRAG' && t.kundenwunschId)
            ? `${t.kundenwunschId}@db-meine-reisen-plus-plus`
            : `${t.uuid}@db-meine-reisen-plus-plus`;
    }

    function caldavEventFilename(t) {
        return caldavEventUid(t).replace(/[^a-zA-Z0-9@._-]/g, '_') + '.ics';
    }

    function caldavTripFingerprint(t) {
        if (t.isLeistungTicket) {
            return JSON.stringify({ dep: t.departure, name: t.leistungsname, order: t.auftragsnummer });
        }
        return JSON.stringify({
            dep: t.departure, arr: t.arrival, from: t.from, to: t.to,
            zuege: t.zuege, seats: t.seats, leistungsname: t.leistungsname,
            auftragsnummer: t.auftragsnummer, zugbindung: t.zugbindung
        });
    }

    async function caldavSync() {
        if (!caldavConfig.enabled || !caldavConfig.url) return;
        const trips = lastRenderArgs ? lastRenderArgs.trips : [];
        if (!trips.length) return;

        const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(caldavConfig.username + ':' + caldavConfig.password)));
        const headers = { 'Authorization': authHeader };
        const baseUrl = caldavConfig.url.endsWith('/') ? caldavConfig.url : caldavConfig.url + '/';

        const statusEl = document.getElementById('dbmrpp-caldav-status');
        if (statusEl) statusEl.textContent = T.calDavStatusSyncing;
        dbLog('caldav: push start → ' + baseUrl);

        let pushed = 0, failed = 0;
        try {
            const currentUids = new Set(trips.map(caldavEventUid));
            const pastTripsAll = (caldavConfig.includePastTrips && auftraegeCache)
                ? buildPastTrips(auftraegeCache, caldavConfig.includeCachedTrips)
                : [];
            const pastNew = pastTripsAll.filter(t => !currentUids.has(caldavEventUid(t)));
            const pushable = [...trips, ...pastNew].filter(t => {
                if (!t.departure || t.isVerbundticket) return false;
                if (t.storniertStatus === 'STORNIERT') return false;
                if (t.isLeistungTicket) return !!caldavConfig.includeLeistungTickets;
                return true;
            });

            const fingerprints = isPlainObject(caldavSyncState.pushedFingerprints)
                ? { ...caldavSyncState.pushedFingerprints }
                : {};
            let skipped = 0;
            for (const t of pushable) {
                const uid = caldavEventUid(t);
                const fp  = caldavTripFingerprint(t);
                if (fingerprints[uid] === fp) { skipped++; continue; }
                const filename = caldavEventFilename(t);
                const icsContent = buildCalDavEventIcs(t);
                try {
                    const putRes = await gmXhr('PUT', baseUrl + filename,
                        { ...headers, 'Content-Type': 'text/calendar; charset=utf-8' },
                        icsContent
                    );
                    dbLog('caldav: PUT ' + putRes.status + ' ' + filename);
                    if (putRes.status >= 200 && putRes.status < 300) {
                        fingerprints[uid] = fp;
                        pushed++;
                    } else {
                        dbLog('caldav: PUT err: ' + (putRes.responseText || '').slice(0, 300));
                        failed++;
                    }
                } catch (e) {
                    dbLog('caldav: PUT error ' + e.message);
                    failed++;
                }
            }
            caldavSyncState = {
                lastSyncedAt:       new Date().toISOString(),
                lastError:          failed > 0 ? `${failed} event(s) failed` : null,
                pushedFingerprints: fingerprints
            };
            saveCalDavSyncState();
            reRenderCalDavStatus();
            dbLog(`caldav: push done (${pushed} pushed, ${skipped} skipped, ${failed} failed)`);
        } catch (err) {
            dbLog('caldav: push error ' + (err.message || err));
            caldavSyncState = { ...caldavSyncState, lastError: err.message || String(err) };
            saveCalDavSyncState();
            reRenderCalDavStatus();
            console.error('[DBMRPP] CalDAV push error:', err);
        }
    }

    // =========================================================
    // 17) UI — FAB toggle + styles
    // =========================================================
    function showPanel() {
        dbLog('panel: open');
        panelVisible = true;
        let root = document.getElementById('dbmrpp-root');
        if (!root) {
            if (lastRenderArgs) {
                reRender(); // recreates root; renderUI will respect panelVisible
                return;     // renderUI handles display + FAB state
            }
            // Data still loading — show a stub; renderUI will replace it when ready
            injectStyles();
            root = document.createElement('div');
            root.id = 'dbmrpp-root';
            root.innerHTML = `<h2 style="margin:0;padding:10px 14px;background:#ec0016;color:#fff;font-size:14px"><span style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><span>${esc(T.title)} <a href="${CHANGELOG_URL}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,.92);font-weight:normal;font-size:11px;text-decoration:underline;margin-left:8px" title="${esc(T.ttReleaseLog)}">v${esc(SCRIPT_VERSION)}</a><span style="font-weight:normal;font-size:12px;margin-left:8px">${esc(T.panelLoading)}</span></span><button type="button" style="background:transparent;border:1px solid rgba(255,255,255,.6);color:#fff;padding:2px 8px;cursor:pointer;border-radius:3px;font-size:12px">×</button></span></h2>`;
            document.body.appendChild(root);
            const stubClose = root.querySelector('button');
            if (stubClose) stubClose.addEventListener('click', hidePanel);
        } else {
            root.style.display = '';
        }
        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.classList.add('active');
    }

    function hidePanel() {
        dbLog('panel: close');
        panelVisible = false;
        const root = document.getElementById('dbmrpp-root');
        if (root) root.style.display = 'none';
        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.classList.remove('active');
    }

    function togglePanel() { if (panelVisible) hidePanel(); else showPanel(); }

    function injectFab() {
        if (document.getElementById('dbmrpp-fab')) return;
        injectStyles();
        const fab = document.createElement('button');
        fab.id = 'dbmrpp-fab';
        fab.type = 'button';
        fab.title = T.title;
        fab.innerHTML = '<span class="dbmrpp-fab-icon" aria-hidden="true">🚆</span><span class="dbmrpp-fab-plus" aria-hidden="true">++</span>';
        fab.addEventListener('click', (ev) => {
            dbLog('FAB click');
            ev.preventDefault();
            ev.stopPropagation();
            togglePanel();
        });
        ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup'].forEach(type => {
            fab.addEventListener(type, ev => ev.stopPropagation(), { passive: true });
        });
        document.body.appendChild(fab);
    }

    function injectStyles() {
        if (document.getElementById('dbmrpp-styles')) return;
        const s = document.createElement('style');
        s.id = 'dbmrpp-styles';
                s.textContent = `
                    :root {
                        --dbmrpp-accent: #ec0016;
                        --dbmrpp-accent-hover: #c4000f;
                        --dbmrpp-accent-active: #880010;
                        --dbmrpp-text: #222;
                        --dbmrpp-text-muted: #666;
                        --dbmrpp-border: #ccc;
                        --dbmrpp-navy: #1a3a8a;
                        --dbmrpp-blue: #4a7cdc;
                        --dbmrpp-divider: #eee;
                    }

                    #dbmrpp-fab {
                        position: fixed;
                        bottom: 24px;
                        right: 24px;
                        width: 88px;
                        height: 52px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0;
                        border: none;
                        border-radius: 12px;
                        background: var(--dbmrpp-accent);
                        color: #fff;
                        cursor: pointer;
                        box-shadow: 0 2px 10px rgba(0,0,0,.3);
                        z-index: 99998;
                        transition: background .15s, transform .15s;
                    }

                    #dbmrpp-fab:hover { background: var(--dbmrpp-accent-hover); transform: scale(1.08); }
                    #dbmrpp-fab.active { background: var(--dbmrpp-accent-active); }
                    .dbmrpp-fab-icon { font-size: 22px; line-height: 1; }
                    .dbmrpp-fab-plus { font-size: 28px; line-height: 1; font-weight: 800; letter-spacing: 1px; }

                    #dbmrpp-root {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        width: min(400px, calc(100vw - 20px));
                        max-height: min(88vh, calc(100dvh - 20px));
                        overflow: auto;
                        background: #fff;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 8px;
                        box-shadow: 0 4px 24px rgba(0,0,0,.18);
                        z-index: 99999;
                        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
                        font-size: 13px;
                        color: var(--dbmrpp-text);
                    }

                    #dbmrpp-root h2 {
                        margin: 0;
                        padding: 10px 14px;
                        background: var(--dbmrpp-accent);
                        color: #fff;
                        font-size: 14px;
                        font-weight: 600;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .dbmrpp-header-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        gap: 12px;
                        flex-wrap: wrap;
                    }

                    .dbmrpp-header-actions {
                        display: flex;
                        justify-content: flex-start;
                        align-items: center;
                        gap: 4px;
                        flex-wrap: wrap;
                    }

                    .dbmrpp-title-wrap {
                        display: inline-flex;
                        align-items: baseline;
                        gap: 8px;
                        flex-wrap: wrap;
                    }

                    .dbmrpp-version-link {
                        color: rgba(255,255,255,.92);
                        font-size: 11px;
                        font-weight: 400;
                        text-decoration: underline;
                        text-underline-offset: 2px;
                        white-space: nowrap;
                    }

                    .dbmrpp-version-link:hover { color: #fff; }

                    .dbmrpp-stale-hint {
                        color: rgba(255,255,255,.85);
                        font-size: 11px;
                        font-weight: 400;
                        white-space: nowrap;
                    }

                    #dbmrpp-root h2 button {
                        background: transparent;
                        border: 1px solid rgba(255,255,255,.6);
                        color: #fff;
                        padding: 2px 8px;
                        cursor: pointer;
                        border-radius: 3px;
                        font-size: 12px;
                    }

                    #dbmrpp-root h2 button:hover { background: rgba(255,255,255,.15); }
                    #dbmrpp-root h3 { margin: 0 0 8px; font-size: 13px; color: var(--dbmrpp-accent); }
                    #dbmrpp-root h4 { margin: 10px 0 4px; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: .04em; }

                    .dbmrpp-section { padding: 10px 14px; border-bottom: 1px solid var(--dbmrpp-divider); }
                    .dbmrpp-changes { background: #fff5f5; }
                    .dbmrpp-changes-none { color: var(--dbmrpp-text-muted); font-style: italic; }
                    .dbmrpp-trip { padding: 6px 0; border-bottom: 1px dotted #e0e0e0; }
                    .dbmrpp-trip:last-child { border-bottom: none; }

                    .dbmrpp-route {
                        font-weight: 600;
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        gap: 2px;
                    }

                    .dbmrpp-route-link, .dbmrpp-train-link { color: var(--dbmrpp-navy); text-decoration: none; }
                    .dbmrpp-route-link:hover, .dbmrpp-train-link:hover { text-decoration: underline; }
                    .dbmrpp-route-link { word-break: break-word; overflow-wrap: break-word; }
                    .dbmrpp-route-cached { color: #000; font-weight: bold; cursor: default; }
                    .dbmrpp-route-cached:hover { text-decoration: none; }
                    button.dbmrpp-train-link { background: none; border: none; padding: 0; cursor: pointer; font: inherit; }

                    .dbmrpp-action-icon {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 1.25em;
                        height: 1.25em;
                        font-size: 12px;
                        line-height: 1;
                        opacity: 0.7;
                        text-decoration: none;
                    }

                    .dbmrpp-action-icon:hover { opacity: 1; }
                    a.dbmrpp-action-icon { cursor: pointer; }
                    button.dbmrpp-action-icon { background: transparent; border: none; cursor: pointer; padding: 0; }

                    .dbmrpp-abweichung-detail {
                        margin-top: 5px;
                        padding: 5px 10px;
                        background: #fff9e6;
                        border-left: 3px solid #f5a623;
                        border-radius: 2px;
                        font-size: 11.5px;
                        color: #555;
                    }

                    .dbmrpp-abweichung-msg, .dbmrpp-fgr-claim { margin: 2px 0; line-height: 1.4; }

                    .dbmrpp-fgr-detail, .dbmrpp-cache-block {
                        margin: 4px 0 2px 14px;
                        padding: 5px 10px;
                        background: #f0f4ff;
                        border-left: 3px solid var(--dbmrpp-blue);
                        border-radius: 2px;
                        color: #555;
                    }
                    .dbmrpp-fgr-detail { font-size: 11.5px; }
                    .dbmrpp-cache-block { font-size: 11px; line-height: 1.35; }

                    .dbmrpp-meta { color: var(--dbmrpp-text-muted); font-size: 11.5px; line-height: 1.4; }
                    .dbmrpp-meta-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #999; }
                    .dbmrpp-cache-inline {
                        margin: 4px 0 2px 14px;
                        color: var(--dbmrpp-text-muted);
                        font-size: 11px;
                        line-height: 1.35;
                    }
                    .dbmrpp-cached-trip {
                        background: #f5f9ff;
                        border-left: 4px solid var(--dbmrpp-blue);
                        padding-left: 8px;
                        border-radius: 4px;
                    }
                    .dbmrpp-cache-badge {
                        background: #e8f0ff;
                        color: var(--dbmrpp-navy);
                        padding: 2px 6px;
                        margin-right: 6px;
                        border-radius: 4px;
                        font-weight: 700;
                        font-size: 12px;
                    }
                    .dbmrpp-cache-label { font-weight: 600; color: #222; }
                    .dbmrpp-cache-msg { margin-top: 3px; padding-left: 2px; }
                    .dbmrpp-cache-missing { background: #f7f7f7; border-left-color: #9ca3af; color: #666; }
                    .dbmrpp-cache-tags { margin-top: 4px; }

                    .dbmrpp-tag {
                        display: inline-block;
                        padding: 1px 6px;
                        border-radius: 3px;
                        font-size: 10.5px;
                        margin: 2px 4px 0 0;
                        font-weight: 600;
                    }

                    .dbmrpp-tag-warn { background: #ffe9b3; color: #8a5a00; }
                    .dbmrpp-tag-bad  { background: #ffd0d0; color: #8a0000; }
                    .dbmrpp-tag-ok   { background: #d6f3d6; color: #265c26; }
                    .dbmrpp-tag-info { background: #dde8ff; color: var(--dbmrpp-navy); }

                    .dbmrpp-diff { margin: 0 0 0 12px; font-size: 11.5px; line-height: 1.4; color: #333; }
                    .dbmrpp-diff-old { color: #888; text-decoration: line-through; }
                    .dbmrpp-diff-new, .dbmrpp-delay { color: var(--dbmrpp-accent); font-weight: 600; }
                    .dbmrpp-early { color: #265c26; font-weight: 600; }
                    .dbmrpp-plan-change { color: #7a5c00; font-size: 11px; font-weight: 500; }

                    .dbmrpp-filter-bar {
                        display: grid;
                        gap: 6px;
                        padding: 6px 14px;
                        border-bottom: 1px solid var(--dbmrpp-divider);
                        background: #fafafa;
                    }

                    .dbmrpp-filter-row {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        flex-wrap: wrap;
                    }

                    .dbmrpp-settings-bar {
                        display: grid;
                        gap: 8px;
                        padding: 8px 14px;
                        border-bottom: 1px solid var(--dbmrpp-divider);
                        background: #f7f9ff;
                    }

                    .dbmrpp-settings-title {
                        font-size: 12px;
                        font-weight: 700;
                        color: #27408a;
                    }

                    .dbmrpp-settings-group {
                        border-top: 1px solid var(--dbmrpp-border);
                        margin: 0;
                        padding: 0;
                    }
                    .dbmrpp-settings-group > summary {
                        font-size: 11px;
                        font-weight: 700;
                        color: #27408a;
                        letter-spacing: .04em;
                        cursor: pointer;
                        padding: 5px 2px;
                        user-select: none;
                        list-style: none;
                    }
                    .dbmrpp-settings-group > summary::-webkit-details-marker { display: none; }
                    .dbmrpp-settings-group > summary::before { content: '▸ '; }
                    .dbmrpp-settings-group[open] > summary::before { content: '▾ '; }
                    .dbmrpp-settings-group-body {
                        display: grid;
                        gap: 6px;
                        padding: 2px 0 8px 0;
                        justify-items: start;
                    }
                    .dbmrpp-settings-sub { padding-left: 18px; }
                    .dbmrpp-settings-info-text {
                        font-size: 11px;
                        color: #666;
                        padding-left: 18px;
                        line-height: 1.4;
                    }

                    .dbmrpp-settings-toggle, .dbmrpp-settings-provider {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        color: #333;
                    }
                    .dbmrpp-settings-toggle { cursor: pointer; user-select: none; }
                    .dbmrpp-settings-toggle input { margin: 0; }

                    .dbmrpp-settings-provider select {
                        min-width: 140px;
                        padding: 2px 6px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        background: #fff;
                        font-size: 12px;
                    }

                    .dbmrpp-settings-provider select:disabled {
                        background: #f0f0f0;
                        color: #888;
                    }

                    .dbmrpp-webdav-row {
                        display: grid;
                        grid-template-columns: 90px 1fr;
                        align-items: center;
                        gap: 6px;
                        width: 100%;
                        font-size: 12px;
                        color: #333;
                    }
                    .dbmrpp-webdav-input {
                        padding: 2px 5px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        font-size: 12px;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .dbmrpp-webdav-input:disabled { background: #f0f0f0; color: #888; }

                    .dbmrpp-day-btn, .dbmrpp-changes-toggle, .dbmrpp-settings-reset {
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                        background: #fff;
                    }
                    .dbmrpp-day-btn { padding: 2px 7px; }
                    .dbmrpp-changes-toggle, .dbmrpp-settings-reset { padding: 2px 8px; }
                    .dbmrpp-changes-toggle { white-space: nowrap; }

                    .dbmrpp-settings-hidden { display: none; }

                    .dbmrpp-filter-row-top .dbmrpp-select {
                        flex: 1;
                        min-width: 80px;
                    }

                    .dbmrpp-filter-row-bottom { justify-content: flex-start; }

                    .dbmrpp-select {
                        min-width: 90px;
                        padding: 3px 6px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        font-size: 12px;
                        background: #fff;
                        cursor: pointer;
                    }

                    .dbmrpp-day-btns { display: flex; gap: 3px; }
                    .dbmrpp-day-btn.active { background: var(--dbmrpp-accent); color: #fff; border-color: var(--dbmrpp-accent); }
                    .dbmrpp-changes-toggle.active { background: #ffe9b3; border-color: #8a5a00; color: #8a5a00; }

                    .dbmrpp-selected-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

                    .dbmrpp-tag-filter { display: inline-flex; align-items: center; gap: 4px; background: #dde8ff; color: var(--dbmrpp-navy); padding: 2px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap; }

                    .dbmrpp-tag-remove { border: none; background: none; color: inherit; cursor: pointer; padding: 0; margin: 0; font-size: 14px; line-height: 1; }
                    .dbmrpp-tag-remove:hover { opacity: 0.7; }

                    .dbmrpp-view-tabs { display: flex; align-items: center; gap: 0; margin-bottom: 8px; border-bottom: 2px solid var(--dbmrpp-divider); }

                    .dbmrpp-view-tab {
                        background: transparent;
                        border: none;
                        padding: 5px 14px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 600;
                        color: #888;
                        border-bottom: 2px solid transparent;
                        margin-bottom: -2px;
                    }

                    .dbmrpp-view-tab.active { color: var(--dbmrpp-accent); border-bottom-color: var(--dbmrpp-accent); }
                    .dbmrpp-view-tab:hover:not(.active) { color: #444; }
                    .dbmrpp-view-count {
                        margin-left: auto;
                        font-size: 12px;
                        font-weight: 700;
                        color: var(--dbmrpp-accent);
                        padding-right: 2px;
                    }
                    .dbmrpp-changelog-clear {
                        margin-left: auto;
                        background: transparent;
                        border: 1px solid var(--dbmrpp-divider);
                        border-radius: 3px;
                        padding: 2px 8px;
                        margin-bottom: 3px;
                        font-size: 11px;
                        color: var(--dbmrpp-text-muted);
                        cursor: pointer;
                    }
                    .dbmrpp-changelog-clear:hover { color: var(--dbmrpp-accent); border-color: var(--dbmrpp-accent); }
                    .dbmrpp-orphan { opacity: 0.55; }
                    .dbmrpp-orphan .dbmrpp-route-link { text-decoration: line-through; color: #888; }

                    @media (max-width: 640px) {
                        #dbmrpp-root {
                            top: 0;
                            right: 0;
                            left: 0;
                            bottom: 0;
                            width: 100%;
                            max-height: 100dvh;
                            border-radius: 0;
                        }

                        #dbmrpp-fab { bottom: 16px; right: 16px; width: 80px; height: 46px; border-radius: 10px; }
                        .dbmrpp-fab-icon { font-size: 20px; }
                        .dbmrpp-fab-plus { font-size: 24px; }
                        .dbmrpp-action-icon { font-size: 16px; width: 1.35em; height: 1.35em; opacity: 0.8; }
                        .dbmrpp-select { min-width: 100px; }
                        .dbmrpp-filter-row-top .dbmrpp-select { min-width: 90px; }
                    }

                    .dbmrpp-custom-tag-details {
                        position: relative;
                        display: inline-block;
                    }
                    .dbmrpp-custom-tag-details > summary {
                        list-style: none;
                        cursor: pointer;
                    }
                    .dbmrpp-custom-tag-details > summary::-webkit-details-marker { display: none; }
                    .dbmrpp-custom-tag-assigned { color: #6600cc !important; opacity: 1 !important; }
                    .dbmrpp-custom-tag-picker {
                        position: absolute;
                        top: calc(100% + 2px);
                        left: 0;
                        z-index: 200;
                        background: #fff;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 4px;
                        box-shadow: 0 2px 8px rgba(0,0,0,.18);
                        padding: 4px;
                        min-width: 130px;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        white-space: nowrap;
                    }
                    .dbmrpp-custom-tag-toggle {
                        border: 1px solid transparent;
                        background: none;
                        cursor: pointer;
                        padding: 2px 6px;
                        text-align: left;
                        border-radius: 3px;
                        display: flex;
                        align-items: center;
                    }
                    .dbmrpp-custom-tag-toggle:hover { background: #f0f0f0; border-color: var(--dbmrpp-border); }
                    .dbmrpp-custom-tag-toggle.active { outline: 2px solid var(--dbmrpp-accent); outline-offset: -2px; }
                    .dbmrpp-custom-tag-def-row { display: flex; align-items: center; gap: 6px; }
                    .dbmrpp-custom-tag-create {
                        display: flex;
                        gap: 4px;
                        align-items: center;
                        flex-wrap: wrap;
                        margin-top: 6px;
                    }
                    .dbmrpp-custom-tag-create input,
                    .dbmrpp-custom-tag-create select {
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        font-size: 12px;
                    }
                    .dbmrpp-custom-tag-create input { padding: 2px 6px; min-width: 100px; max-width: 160px; }
                    .dbmrpp-custom-tag-create select { padding: 2px 4px; }

                    .dbmrpp-note, .dbmrpp-note-summary {
                        margin: 3px 0 0;
                        font-size: 11.5px;
                        color: #555;
                        font-style: italic;
                        padding: 0 0 0 6px;
                        border-left: 2px solid #ccc;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .dbmrpp-note-details { margin: 3px 0 0; }
                    .dbmrpp-note-details > .dbmrpp-note-summary {
                        margin: 0;
                        cursor: pointer;
                        list-style: none;
                    }
                    .dbmrpp-note-details > .dbmrpp-note-summary::-webkit-details-marker { display: none; }
                    .dbmrpp-note-details > .dbmrpp-note-summary::before { content: '▸ '; font-style: normal; font-size: 10px; }
                    .dbmrpp-note-details[open] > .dbmrpp-note-summary::before { content: '▾ '; }
                    .dbmrpp-note-body {
                        font-size: 11.5px;
                        color: #555;
                        font-style: italic;
                        padding: 2px 0 0 6px;
                        border-left: 2px solid #ccc;
                        white-space: pre-wrap;
                        word-break: break-word;
                        margin-top: 1px;
                    }
                    .dbmrpp-note-area { margin-top: 4px; }
                    .dbmrpp-note-edit {
                        display: block;
                        width: 100%;
                        font-size: 12px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        padding: 4px 6px;
                        font-family: inherit;
                        resize: vertical;
                        min-height: 38px;
                        box-sizing: border-box;
                    }
                    .dbmrpp-note-btn-active { opacity: 1 !important; color: #6600cc; }
                `;
        document.head.appendChild(s);
    }

    async function renderUI(trips, orphans, changes, lastVisit) {
        if (!document.body) {
            await new Promise(res => {
                const obs = new MutationObserver(() => { if (document.body) { obs.disconnect(); res(); } });
                obs.observe(document.documentElement, { childList: true });
            });
        }

        const root = initPanelDOM(trips, orphans, changes, lastVisit);
        bindSettingsHandlers(root, trips, orphans);
        bindTripActionHandlers(root, trips, orphans);
        bindFilterHandlers(root);
    }

    function initPanelDOM(trips, orphans, changes, lastVisit) {
        injectStyles();
        injectFab();
        lastRenderArgs = { trips, orphans, changes, lastVisit };

        const old = document.getElementById('dbmrpp-root');
        let settingsGroupStates = null;
        if (old) {
            settingsGroupStates = Array.from(old.querySelectorAll('.dbmrpp-settings-group')).map(el => el.open);
            old.remove();
        }

        const root = document.createElement('div');
        root.id = 'dbmrpp-root';
        root.innerHTML = buildHTML(trips, orphans, changes, lastVisit);
        if (settingsGroupStates) {
            root.querySelectorAll('.dbmrpp-settings-group').forEach((el, i) => {
                if (i < settingsGroupStates.length) el.open = settingsGroupStates[i];
            });
        }
        // Panel starts hidden; showPanel() / togglePanel() reveals it
        root.style.display = panelVisible ? '' : 'none';
        document.body.appendChild(root);

        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.classList.toggle('active', panelVisible);

        return root;
    }

    function bindSettingsHandlers(root, trips, orphans) {
        root.querySelector('.dbmrpp-close').addEventListener('click', hidePanel);
        const settingsBtn = root.querySelector('.dbmrpp-settings-btn');
        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            reRender();
        });

        const exportSnapshotBtn = root.querySelector('.dbmrpp-settings-export-snapshot');
        if (exportSnapshotBtn) exportSnapshotBtn.addEventListener('click', () => exportSnapshotBundle());

        const importSnapshotBtn = root.querySelector('.dbmrpp-settings-import-snapshot');
        if (importSnapshotBtn) importSnapshotBtn.addEventListener('click', () => {
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = '.json,application/json';
            picker.addEventListener('change', async () => {
                const file = picker.files && picker.files[0];
                if (file) await importSnapshotBundle(file);
            }, { once: true });
            picker.click();
        });

        const bulkJsonBtn = root.querySelector('.dbmrpp-settings-bulk-json');
        if (bulkJsonBtn) bulkJsonBtn.addEventListener('click', () => downloadBulkRawJson());

        root.querySelector('.dbmrpp-settings-reset-snapshot').addEventListener('click', () => {
            if (confirm(T.alertResetConfirm)) {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(LAST_VISIT_KEY);
                clearRenderCache(); // don't resurrect pre-reset changes on next visit
                hidePanel();
                run(); // re-fetch with clean snapshot so diff starts fresh
            }
        });

        bindTagHandlers(root, trips, orphans);
        bindWebDavHandlers(root);
        bindCalDavHandlers(root);

        const rememberFilterCb = root.querySelector('#dbmrpp-setting-remember-filter');
        if (rememberFilterCb) rememberFilterCb.addEventListener('change', e => {
            uiSettings.rememberFilter = !!e.target.checked;
            if (!uiSettings.rememberFilter) {
                try { localStorage.removeItem(FILTER_STATE_KEY); } catch (_) {}
            }
            rememberUiState();
        });

        const openOnLoadCb = root.querySelector('#dbmrpp-setting-open-on-load');
        if (openOnLoadCb) openOnLoadCb.addEventListener('change', e => {
            uiSettings.openOnLoad = !!e.target.checked;
            rememberUiState();
        });

        const showCancelledTripsCb = root.querySelector('#dbmrpp-setting-show-cancelled-trips');
        if (showCancelledTripsCb) showCancelledTripsCb.addEventListener('change', e => {
            uiSettings.showCancelledTrips = !!e.target.checked;
            rememberUiState();
            reRender();
        });

        const usePastCacheCb = root.querySelector('#dbmrpp-setting-use-past-cache');
        if (usePastCacheCb) usePastCacheCb.addEventListener('change', e => {
            uiSettings.usePastCache = !!e.target.checked;
            pastTrips = null;
            rememberUiState();
            reRender();
        });

        const showJsonButtonCb = root.querySelector('#dbmrpp-setting-show-json-button');
        if (showJsonButtonCb) showJsonButtonCb.addEventListener('change', e => {
            uiSettings.showJsonButton = !!e.target.checked;
            rememberUiState();
            reRender();
        });

        const debugLoggingCb = root.querySelector('#dbmrpp-setting-debug-logging');
        if (debugLoggingCb) debugLoggingCb.addEventListener('change', e => {
            uiSettings.debugLogging = !!e.target.checked;
            rememberUiState();
            reRender();
        });

        const debugLogCopyBtn = root.querySelector('.dbmrpp-debug-log-copy');
        if (debugLogCopyBtn) debugLogCopyBtn.addEventListener('click', () => {
            flushDebugLog();
            const lines = (() => { try { return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || '[]'); } catch(_) { return []; } })();
            const text = lines.join('\n');
            const doFallback = () => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch(_) {}
                ta.remove();
            };
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(doFallback);
            } else {
                doFallback();
            }
            const orig = debugLogCopyBtn.textContent;
            debugLogCopyBtn.textContent = '✓';
            setTimeout(() => { debugLogCopyBtn.textContent = orig; }, 1500);
        });

        const debugLogClearBtn = root.querySelector('.dbmrpp-debug-log-clear');
        if (debugLogClearBtn) debugLogClearBtn.addEventListener('click', () => {
            clearDebugLog();
            const countEl = root.querySelector('.dbmrpp-debug-log-count');
            if (countEl) countEl.textContent = T.settingsDebugLogEntries(0);
        });

        const showGeoButtonCb = root.querySelector('#dbmrpp-setting-show-geo-button');
        if (showGeoButtonCb) showGeoButtonCb.addEventListener('change', e => {
            uiSettings.showGeoButton = !!e.target.checked;
            const formatSel = root.querySelector('#dbmrpp-setting-geo-format');
            if (formatSel) formatSel.disabled = !uiSettings.showGeoButton;
            rememberUiState();
            reRender();
        });

        const geoFormatSel = root.querySelector('#dbmrpp-setting-geo-format');
        if (geoFormatSel) geoFormatSel.addEventListener('change', e => {
            uiSettings['geo-format'] = e.target.value === 'geojson' ? 'geojson' : 'gpx';
            rememberUiState();
            reRender();
        });

        const trainLinksCb = root.querySelector('#dbmrpp-setting-train-links');
        if (trainLinksCb) trainLinksCb.addEventListener('change', e => {
            uiSettings.trainLinksEnabled = !!e.target.checked;
            rememberUiState();
            reRender();
        });

        const routingLinksCb = root.querySelector('#dbmrpp-setting-show-routing-button');
        if (routingLinksCb) routingLinksCb.addEventListener('change', e => {
            uiSettings.showRoutingButton = !!e.target.checked;
            rememberUiState();
            reRender();
        });

        const trainProviderSel = root.querySelector('#dbmrpp-setting-traininfo-provider');
        if (trainProviderSel) trainProviderSel.addEventListener('change', e => {
            uiSettings['traininfo-provider'] = e.target.value === 'bahn.expert' ? 'bahn.expert' : 'zugfinder';
            rememberUiState();
            reRender();
        });

        const routingProviderSel = root.querySelector('#dbmrpp-setting-routing-provider');
        if (routingProviderSel) routingProviderSel.addEventListener('change', e => {
            const v = e.target.value;
            uiSettings['routing-provider'] = (v === 'chuuchuu' || v === 'transitous.org') ? v : 'bahn.expert';
            rememberUiState();
            reRender();
        });
    }

    function bindTagHandlers(root, trips, orphans) {
        const customTagAddBtn = root.querySelector('#dbmrpp-custom-tag-add');
        if (customTagAddBtn) customTagAddBtn.addEventListener('click', () => {
            const nameInput = root.querySelector('#dbmrpp-custom-tag-name');
            const colorSel  = root.querySelector('#dbmrpp-custom-tag-color');
            const label = nameInput ? nameInput.value.trim() : '';
            if (!label) return;
            const color = (colorSel && ['info','ok','warn','bad'].includes(colorSel.value)) ? colorSel.value : 'info';
            customTagDefs.push({ id: 'custom-' + Date.now(), label, color });
            saveCustomTagDefs();
            reRender();
        });

        root.querySelectorAll('.dbmrpp-custom-tag-edit').forEach(btn =>
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const def = customTagDefs.find(d => d.id === id);
                if (!def) return;
                const newLabel = prompt(T.customTagEditTt, def.label);
                if (newLabel === null) return;
                const trimmed = newLabel.trim();
                if (!trimmed) return;
                def.label = trimmed;
                saveCustomTagDefs();
                reRender();
            })
        );

        root.querySelectorAll('.dbmrpp-custom-tag-delete').forEach(btn =>
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                customTagDefs = customTagDefs.filter(d => d.id !== id);
                Object.keys(customTagAssignments).forEach(uuid => {
                    customTagAssignments[uuid] = (customTagAssignments[uuid] || []).filter(tid => tid !== id);
                    if (!customTagAssignments[uuid].length) delete customTagAssignments[uuid];
                });
                saveCustomTagDefs();
                saveCustomTagAssignments();
                reRender();
            })
        );

        root.addEventListener('click', ev => {
            const btn = ev.target.closest('.dbmrpp-custom-tag-toggle');
            if (!btn) return;
            const uuid  = btn.getAttribute('data-uuid');
            const tagId = btn.getAttribute('data-tagid');
            if (!uuid || !tagId) return;
            const assigned = customTagAssignments[uuid] || [];
            const isNowAssigned = !assigned.includes(tagId);
            customTagAssignments[uuid] = isNowAssigned
                ? [...assigned, tagId]
                : assigned.filter(id => id !== tagId);
            if (!customTagAssignments[uuid].length) delete customTagAssignments[uuid];
            saveCustomTagAssignments();
            scheduleWebDavSync();
            btn.classList.toggle('active', isNowAssigned);
            const tripDiv = btn.closest('.dbmrpp-trip');
            if (tripDiv) {
                const trip = trips.find(x => x.uuid === uuid) ||
                             (pastTrips || []).find(x => x.uuid === uuid) ||
                             orphans.find(x => x.uuid === uuid);
                if (trip) {
                    const newTagsHtml = buildTripTags(trip).join('');
                    const tagsDiv = tripDiv.querySelector('.dbmrpp-trip-tags');
                    if (tagsDiv) tagsDiv.innerHTML = newTagsHtml;
                    const cacheTagsDiv = tripDiv.querySelector('.dbmrpp-cache-tags');
                    if (cacheTagsDiv) cacheTagsDiv.innerHTML = newTagsHtml;
                    const summary = btn.closest('details') && btn.closest('details').querySelector('summary');
                    if (summary) {
                        const hasAny = (customTagAssignments[uuid] || []).some(id => customTagDefs.some(d => d.id === id));
                        summary.classList.toggle('dbmrpp-custom-tag-assigned', hasAny);
                    }
                }
            }
        });
    }

    function bindWebDavHandlers(root) {
        const webdavEnabledCb = root.querySelector('#dbmrpp-webdav-enabled');
        if (webdavEnabledCb) webdavEnabledCb.addEventListener('change', e => {
            webdavConfig.enabled = !!e.target.checked;
            saveWebDavConfig();
            reRender();
        });

        const webdavSaveBtn = root.querySelector('.dbmrpp-webdav-save');
        if (webdavSaveBtn) webdavSaveBtn.addEventListener('click', () => {
            const urlInput  = root.querySelector('#dbmrpp-webdav-url');
            const userInput = root.querySelector('#dbmrpp-webdav-username');
            const passInput = root.querySelector('#dbmrpp-webdav-password');
            webdavConfig.url      = urlInput  ? urlInput.value.trim()  : webdavConfig.url;
            webdavConfig.username = userInput ? userInput.value.trim() : webdavConfig.username;
            webdavConfig.password = passInput ? passInput.value        : webdavConfig.password;
            saveWebDavConfig();
            if (webdavConfig.enabled && webdavConfig.url) webdavSync();
        });

        const webdavSyncNowBtn = root.querySelector('.dbmrpp-webdav-sync-now');
        if (webdavSyncNowBtn) webdavSyncNowBtn.addEventListener('click', () => webdavSync());
    }

    function bindCalDavHandlers(root) {
        const caldavEnabledCb = root.querySelector('#dbmrpp-caldav-enabled');
        if (caldavEnabledCb) caldavEnabledCb.addEventListener('change', e => {
            caldavConfig.enabled = !!e.target.checked;
            saveCalDavConfig();
            reRender();
        });

        const caldavIncludePastCb   = root.querySelector('#dbmrpp-caldav-include-past');
        const caldavIncludeCachedCb = root.querySelector('#dbmrpp-caldav-include-cached');
        if (caldavIncludePastCb) caldavIncludePastCb.addEventListener('change', e => {
            caldavConfig.includePastTrips = !!e.target.checked;
            if (caldavIncludeCachedCb) caldavIncludeCachedCb.disabled = !caldavConfig.includePastTrips;
            saveCalDavConfig();
        });
        if (caldavIncludeCachedCb) caldavIncludeCachedCb.addEventListener('change', e => {
            caldavConfig.includeCachedTrips = !!e.target.checked;
            saveCalDavConfig();
        });

        const caldavIncludeLeistungCb = root.querySelector('#dbmrpp-caldav-include-leistung');
        if (caldavIncludeLeistungCb) caldavIncludeLeistungCb.addEventListener('change', e => {
            caldavConfig.includeLeistungTickets = !!e.target.checked;
            saveCalDavConfig();
        });

        const caldavSaveBtn = root.querySelector('.dbmrpp-caldav-save');
        if (caldavSaveBtn) caldavSaveBtn.addEventListener('click', () => {
            const urlInput  = root.querySelector('#dbmrpp-caldav-url');
            const userInput = root.querySelector('#dbmrpp-caldav-username');
            const passInput = root.querySelector('#dbmrpp-caldav-password');
            const pastCb    = root.querySelector('#dbmrpp-caldav-include-past');
            const cachedCb  = root.querySelector('#dbmrpp-caldav-include-cached');
            caldavConfig.url                = urlInput  ? urlInput.value.trim()  : caldavConfig.url;
            caldavConfig.username           = userInput ? userInput.value.trim() : caldavConfig.username;
            caldavConfig.password           = passInput ? passInput.value        : caldavConfig.password;
            caldavConfig.includePastTrips      = pastCb    ? !!pastCb.checked    : caldavConfig.includePastTrips;
            caldavConfig.includeCachedTrips    = cachedCb  ? !!cachedCb.checked  : caldavConfig.includeCachedTrips;
            const leistungCb = root.querySelector('#dbmrpp-caldav-include-leistung');
            caldavConfig.includeLeistungTickets = leistungCb ? !!leistungCb.checked : caldavConfig.includeLeistungTickets;
            saveCalDavConfig();
            if (caldavConfig.enabled && caldavConfig.url) caldavSync();
        });

        const caldavPushNowBtn = root.querySelector('.dbmrpp-caldav-push-now');
        if (caldavPushNowBtn) caldavPushNowBtn.addEventListener('click', () => caldavSync());
    }

    // Unified loading indicator for buttons whose click triggers an API call:
    // swap the icon for ⏳ while the action runs, restore it afterwards.
    async function withLoadingIcon(btn, action) {
        const origText = btn.textContent;
        btn.textContent = '⏳';
        btn.style.opacity = '1';
        btn.disabled = true;
        try {
            return await action();
        } finally {
            btn.textContent = origText;
            btn.style.opacity = '';
            btn.disabled = false;
        }
    }

    async function onRouteExtClick(btn, trip) {
        const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
        try {
            await withLoadingIcon(btn, async () => {
                const url = await getExternalRoutingUrl(trip);
                if (!url) throw new Error('No external routing URL available');
                if (!openExternalUrlInNewTab(url, popup)) throw new Error('Could not open external routing URL');
            });
        } catch (err) {
            console.error('[DBMRPP] Routing-Link-Fehler', err);
            alert(T.routeError);
        }
    }

    async function onShareClick(btn, trip) {
        const origTitle = btn.title;
        try {
            await withLoadingIcon(btn, async () => {
                await navigator.clipboard.writeText(await getShareLink(trip));
            });
            btn.textContent = '✓'; btn.title = T.shareCopied; btn.style.opacity = '1';
            setTimeout(() => { btn.textContent = '⤴️'; btn.title = origTitle; btn.style.opacity = ''; }, 2000);
        } catch (err) {
            console.error('[DBMRPP] Share-Fehler', err);
            alert(T.shareError);
        }
    }

    async function onFgrClick(btn, trip) {
        const tripDiv = btn.closest('.dbmrpp-trip');
        const existing = tripDiv.querySelector('.dbmrpp-fgr-detail');
        if (existing) { existing.remove(); return; }
        let resultText = null;
        try {
            await withLoadingIcon(btn, async () => {
                const auftrag = await fetchAuftragDetail(trip.auftragsnummer);
                const ga = auftrag && auftrag.gesamtangebot;
                const legs = ga ? [ga.hinfahrt, ga.rueckfahrt].filter(Boolean) : [];
                const leg = legs.find(l => l.kundenwunschId === trip.kundenwunschId) || legs[0];
                const submitted = (leg && leg.fahrgastrechte && leg.fahrgastrechte.submittedAntragList) || [];
                if (!submitted.length) {
                    // No claim found — evict cache so a re-click always fetches
                    // fresh data (the user might file a claim in the meantime).
                    auftragDetailCache.delete(trip.auftragsnummer);
                    resultText = T.fgrNone;
                    return;
                }
                fgrClaims[trip.auftragsnummer] = {
                    savedAt: new Date().toISOString(),
                    claims: submitted.map(a => ({ date: a.date || null, antragIds: a.antragIds || [] }))
                };
                saveFgrClaims();
                scheduleWebDavSync();
                // Re-render the trip div: the claim now appears permanently in the
                // meta area and the § button disappears (it has no further purpose).
                const tmpWrap = document.createElement('div');
                tmpWrap.innerHTML = renderTripLine(trip).trim();
                const newEl = tmpWrap.firstElementChild;
                if (newEl) tripDiv.replaceWith(newEl);
            });
        } catch (err) {
            console.error('[DBMRPP] FGR-Fehler', err);
            resultText = T.fgrError;
        }
        if (resultText) {
            const detailDiv = document.createElement('div');
            detailDiv.className = 'dbmrpp-fgr-detail';
            detailDiv.textContent = resultText;
            tripDiv.appendChild(detailDiv);
        }
    }

    async function onTrainNumClick(btn) {
        const uuid = btn.getAttribute('data-uuid');
        const trainNum = btn.getAttribute('data-train-num');
        const departure = btn.getAttribute('data-departure');
        if (!uuid || !trainNum) return;
        const provider = uiSettings['traininfo-provider'] === 'bahn.expert' ? 'bahn.expert' : 'zugfinder';
        const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
        try {
            await withLoadingIcon(btn, async () => {
                const detail = await fetchDetail(uuid);
                const letters = findLettersFromDetail(detail, trainNum);
                if (!letters) throw new Error(`No train type found for run number ${trainNum}`);
                let url;
                if (provider === 'zugfinder') {
                    url = `https://www.zugfinder.net/de/zug-${encodeURIComponent(letters)}_${encodeURIComponent(trainNum)}`;
                } else {
                    const dep = departure ? new Date(departure) : null;
                    const iso = dep && !isNaN(dep.getTime()) ? dep.toISOString() : null;
                    const trainId = encodeURIComponent(`${letters} ${trainNum}`);
                    url = iso
                        ? `https://bahn.expert/details/${trainId}/${encodeURIComponent(iso)}`
                        : `https://bahn.expert/details/${trainId}/`;
                }
                openExternalUrlInNewTab(url, popup);
            });
        } catch (err) {
            console.error('[DBMRPP] Train-Name-Lookup-Fehler', err);
            if (popup && !popup.closed) popup.close();
        }
    }

    function onNoteClick(btn) {
        const uuid = btn.getAttribute('data-uuid');
        const tripDiv = btn.closest('.dbmrpp-trip');
        if (!tripDiv) return;
        const existingArea = tripDiv.querySelector('.dbmrpp-note-area');
        if (existingArea) { existingArea.remove(); return; }
        const area = document.createElement('div');
        area.className = 'dbmrpp-note-area';
        const ta = document.createElement('textarea');
        ta.className = 'dbmrpp-note-edit';
        ta.placeholder = T.notePlaceholder;
        ta.value = tripNotes[uuid] || '';
        ta.rows = 2;
        ta.addEventListener('input', () => {
            const val = ta.value;
            if (val.trim()) {
                tripNotes[uuid] = val;
            } else {
                delete tripNotes[uuid];
            }
            saveTripNotes();
            scheduleWebDavSync();
            const existingDisplay = tripDiv.querySelector('.dbmrpp-note, .dbmrpp-note-details');
            if (existingDisplay) existingDisplay.remove();
            if (val.trim()) {
                const nd = document.createElement('div');
                nd.className = 'dbmrpp-note';
                nd.textContent = val;
                area.before(nd);
            }
            btn.classList.toggle('dbmrpp-note-btn-active', !!val.trim());
        });
        area.appendChild(ta);
        tripDiv.appendChild(area);
        ta.focus();
    }

    async function onAbweichungClick(btn, trip) {
        const tripDiv = btn.closest('.dbmrpp-trip');
        const existing = tripDiv.querySelector('.dbmrpp-abweichung-detail');
        if (existing) { existing.remove(); return; }
        const detailDiv = document.createElement('div');
        detailDiv.className = 'dbmrpp-abweichung-detail';
        try {
            await withLoadingIcon(btn, async () => {
                const msgs = await loadAbweichungMessages(trip);
                if (!msgs.length) {
                    detailDiv.textContent = T.abweichungNone;
                } else {
                    detailDiv.innerHTML = msgs.map(m =>
                        `<div class="dbmrpp-abweichung-msg">${esc((m && m.text) || '')}</div>`
                    ).join('');
                }
            });
        } catch (err) {
            console.error('[DBMRPP] Abweichung-Fehler', err);
            detailDiv.textContent = T.abweichungError;
        }
        tripDiv.appendChild(detailDiv);
    }

    // Delegated per-trip button actions: selector → handler(btn, trip).
    // Entries with needsTrip: false read their data from the button's
    // attributes instead of a resolved trip object.
    const TRIP_ACTIONS = [
        { selector: '.dbmrpp-ics-link',         handler: (btn, trip) => withLoadingIcon(btn, () => downloadIcs(trip)) },
        { selector: '.dbmrpp-pdf-link',         handler: (btn, trip) => withLoadingIcon(btn, () => downloadPdf(trip)) },
        { selector: '.dbmrpp-json-link',        handler: (btn, trip) => withLoadingIcon(btn, () => downloadRawJson(trip)) },
        { selector: '.dbmrpp-geo-link',         handler: (btn, trip) => withLoadingIcon(btn, () => downloadGeo(trip)) },
        { selector: '.dbmrpp-delete-cache-btn', handler: (btn, trip) => { if (confirm(T.alertDeleteCachedTripConfirm)) deleteCachedTrip(trip); } },
        { selector: '.dbmrpp-route-ext-btn',    handler: onRouteExtClick },
        { selector: '.dbmrpp-share-btn',        handler: onShareClick },
        { selector: '.dbmrpp-fgr-btn',          handler: onFgrClick },
        { selector: '.dbmrpp-train-num-link',   needsTrip: false, handler: onTrainNumClick },
        { selector: '.dbmrpp-note-btn',         needsTrip: false, handler: onNoteClick },
        { selector: '.dbmrpp-abweichung-btn',   handler: onAbweichungClick },
    ];

    function bindTripActionHandlers(root, trips, orphans) {
        const getFilteredPool = () => {
            const pool = activeView === 'past' ? (pastTrips || []) : [...filterUpcomingTrips(trips), ...orphans];
            return filterTrips(pool, filterState, activeView === 'past');
        };

        root.querySelector('.dbmrpp-ics-bulk').addEventListener('click', () => {
            const filtered = getFilteredPool();
            const icsTrips = filtered.filter(isIcsSupportedTrip);
            if (!icsTrips.length) { alert(T.alertNoTripsExport); return; }
            triggerDownload(
                new Blob([buildBulkIcs(icsTrips)], { type: 'text/calendar;charset=utf-8' }),
                `db-reisen-${new Date().toISOString().slice(0, 10)}.ics`
            );
        });
        root.querySelector('.dbmrpp-export').addEventListener('click', () => exportCsv(getFilteredPool()));
        root.querySelector('.dbmrpp-refresh').addEventListener('click', ev => withLoadingIcon(ev.currentTarget, () => run()));

        root.addEventListener('click', async (ev) => {
            const findTrip = uuid =>
                trips.find(x => x.uuid === uuid) ||
                (pastTrips || []).find(x => x.uuid === uuid) ||
                orphans.find(x => x.uuid === uuid);
            for (const action of TRIP_ACTIONS) {
                const btn = ev.target.closest(action.selector);
                if (!btn) continue;
                ev.preventDefault();
                if (action.needsTrip === false) {
                    await action.handler(btn);
                } else {
                    const trip = findTrip(btn.getAttribute('data-uuid'));
                    if (trip) await action.handler(btn, trip);
                }
                return;
            }
        });
    }

    function bindFilterHandlers(root) {
        const fromSel = root.querySelector('#dbmrpp-from-sel');
        if (fromSel) fromSel.addEventListener('change', e => { filterState.from = e.target.value; rememberUiState(); reRender(); });
        const toSel = root.querySelector('#dbmrpp-to-sel');
        if (toSel)   toSel.addEventListener('change',   e => { filterState.to   = e.target.value; rememberUiState(); reRender(); });
        root.querySelectorAll('.dbmrpp-day-btn').forEach(btn =>
            btn.addEventListener('click', () => { filterState.days = Number(btn.getAttribute('data-days')); rememberUiState(); reRender(); })
        );
        const tagSel = root.querySelector('#dbmrpp-tag-sel');
        if (tagSel) tagSel.addEventListener('change', e => {
            if (e.target.value) {
                if (!filterState.tags.includes(e.target.value)) {
                    filterState.tags.push(e.target.value);
                }
                e.target.value = '';
                rememberUiState();
                reRender();
            }
        });
        root.querySelectorAll('.dbmrpp-tag-remove').forEach(btn =>
            btn.addEventListener('click', () => {
                const tagId = btn.getAttribute('data-tag');
                filterState.tags = filterState.tags.filter(t => t !== tagId);
                rememberUiState();
                reRender();
            })
        );
        const changesToggle = root.querySelector('.dbmrpp-changes-toggle');
        if (changesToggle) changesToggle.addEventListener('click', () => { filterState.onlyProblems = !filterState.onlyProblems; rememberUiState(); reRender(); });
        const changeLogClear = root.querySelector('.dbmrpp-changelog-clear');
        if (changeLogClear) changeLogClear.addEventListener('click', () => {
            if (!confirm(T.alertChangeLogClearConfirm)) return;
            try { localStorage.removeItem(CHANGE_LOG_KEY); } catch (_) {}
            reRender();
        });
        root.querySelectorAll('.dbmrpp-view-tab').forEach(tab =>
            tab.addEventListener('click', () => {
                activeView = tab.getAttribute('data-view');
                if (activeView === 'past' && pastTrips === null && auftraegeCache) pastTrips = buildPastTrips(auftraegeCache);
                if (!uiSettings.rememberFilter) {
                    filterState.from = ''; filterState.to = ''; filterState.tags = []; filterState.days = 0;
                    if (activeView === 'past') filterState.onlyProblems = false;
                }
                rememberUiState();
                reRender();
            })
        );
    }

    // =========================================================
    // 18) HTML builders
    // =========================================================
    function buildHTML(trips, orphans, changes, lastVisit) {
        const isPast = activeView === 'past';
        const isChanges = activeView === 'changes';
        const rawPool    = isPast ? (pastTrips || []) : [...filterUpcomingTrips(trips), ...orphans];
        const sourcePool = uiSettings.showCancelledTrips ? rawPool : rawPool.filter(t => t.storniertStatus !== 'STORNIERT');
        const filtered    = filterTrips(sourcePool, filterState, isPast);
        const dayFiltered = filterTrips(sourcePool, { from: '', to: '', days: filterState.days, onlyProblems: false, tags: [] }, isPast);
        const availableTags = collectAvailableTags(filtered);
        const fromOptions = [...new Set(
            dayFiltered.filter(t => !filterState.to   || t.to   === filterState.to).map(t => t.from).filter(Boolean)
        )].sort();
        const toOptions = [...new Set(
            dayFiltered.filter(t => !filterState.from || t.from === filterState.from).map(t => t.to).filter(Boolean)
        )].sort();
        const lastVisitTxt = lastVisit ? new Date(lastVisit).toLocaleString(DATE_LOCALE) : T.neverVisited;

        return `
        <h2>
                    <span class="dbmrpp-header-top">
                        <span class="dbmrpp-title-wrap"><span>${T.title}</span><a class="dbmrpp-version-link" href="${CHANGELOG_URL}" target="_blank" rel="noopener noreferrer" title="${T.ttReleaseLog}">v${esc(SCRIPT_VERSION)}</a>${dataIsStale ? `<span class="dbmrpp-stale-hint" title="${T.ttStaleHint}${staleCachedAt ? ` (${T.staleAsOf} ${new Date(staleCachedAt).toLocaleString()})` : ''}">⏳ ${T.staleHint}</span>` : ''}</span>
                        <button class="dbmrpp-close" title="${T.ttClose}">×</button>
                    </span>
                    <span class="dbmrpp-header-actions">
                        <button class="dbmrpp-refresh" title="${T.ttReload}">↺</button>
                        <button class="dbmrpp-ics-bulk" title="${T.ttIcsBulk}">📅 ICS</button>
                        <button class="dbmrpp-export"   title="${T.ttCsv}">CSV</button>
                        <button class="dbmrpp-settings-btn" title="${T.ttSettings}">⚙️</button>
                    </span>
        </h2>
        <div class="dbmrpp-settings-bar${settingsOpen ? '' : ' dbmrpp-settings-hidden'}">
            <div class="dbmrpp-settings-title">${T.settingsTitle}</div>
            <details class="dbmrpp-settings-group" open>
                <summary>${T.settingsGroupGeneral}</summary>
                <div class="dbmrpp-settings-group-body">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-remember-filter"${uiSettings.rememberFilter ? ' checked' : ''}>
                        <span>${T.settingsRememberFilter}</span>
                    </label>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-open-on-load"${uiSettings.openOnLoad ? ' checked' : ''}>
                        <span>${T.settingsOpenOnLoad}</span>
                    </label>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-show-cancelled-trips"${uiSettings.showCancelledTrips !== false ? ' checked' : ''}>
                        <span>${T.settingsShowCancelledTrips}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsShowCancelledTripsDesc}</div>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-use-past-cache"${uiSettings.usePastCache ? ' checked' : ''}>
                        <span>${T.settingsUsePastCacheLabel}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsUsePastCacheDesc}</div>
                </div>
            </details>
            <details class="dbmrpp-settings-group" open>
                <summary>${T.settingsGroupTripExports}</summary>
                <div class="dbmrpp-settings-group-body">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-show-geo-button"${uiSettings.showGeoButton !== false ? ' checked' : ''}>
                        <span>${T.settingsShowGeoButton}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsShowGeoButtonDesc}</div>
                    <label class="dbmrpp-settings-provider dbmrpp-settings-sub">
                        <span>${T.settingsGeoFormat}</span>
                        <select id="dbmrpp-setting-geo-format"${uiSettings.showGeoButton !== false ? '' : ' disabled'}>
                            <option value="gpx"${uiSettings['geo-format'] === 'gpx' ? ' selected' : ''}>${T.settingsGeoFormatGpx}</option>
                            <option value="geojson"${uiSettings['geo-format'] === 'geojson' ? ' selected' : ''}>${T.settingsGeoFormatGeojson}</option>
                        </select>
                    </label>
                </div>
            </details>
            <details class="dbmrpp-settings-group">
                <summary>${T.settingsGroupExternalLinks}</summary>
                <div class="dbmrpp-settings-group-body">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-show-routing-button"${uiSettings.showRoutingButton ? ' checked' : ''}>
                        <span>${T.settingsShowRoutingButton}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsShowRoutingButtonDesc}</div>
                    <label class="dbmrpp-settings-provider dbmrpp-settings-sub">
                        <span>${T.settingsRoutingLinkProvider}</span>
                        <select id="dbmrpp-setting-routing-provider"${uiSettings.showRoutingButton ? '' : ' disabled'}>
                            <option value="bahn.expert"${uiSettings['routing-provider'] === 'bahn.expert' ? ' selected' : ''}>${T.settingsRoutingProviderBahnExpert}</option>
                            <option value="chuuchuu"${uiSettings['routing-provider'] === 'chuuchuu' ? ' selected' : ''}>${T.settingsRoutingProviderChuuchuu}</option>
                            <option value="transitous.org"${uiSettings['routing-provider'] === 'transitous.org' ? ' selected' : ''}>${T.settingsRoutingProviderTransitous}</option>
                        </select>
                    </label>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-train-links"${uiSettings.trainLinksEnabled ? ' checked' : ''}>
                        <span>${T.settingsTrainLinksEnabled}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsTrainLinksDesc}</div>
                    <label class="dbmrpp-settings-provider dbmrpp-settings-sub">
                        <span>${T.settingsTrainLinkProvider}</span>
                        <select id="dbmrpp-setting-traininfo-provider"${uiSettings.trainLinksEnabled ? '' : ' disabled'}>
                            <option value="zugfinder"${uiSettings['traininfo-provider'] === 'zugfinder' ? ' selected' : ''}>${T.settingsTrainProviderZugfinder}</option>
                            <option value="bahn.expert"${uiSettings['traininfo-provider'] === 'bahn.expert' ? ' selected' : ''}>${T.settingsTrainProviderBahnExpert}</option>
                        </select>
                    </label>
                </div>
            </details>
            <details class="dbmrpp-settings-group">
                <summary>${T.settingsGroupData}</summary>
                <div class="dbmrpp-settings-group-body">
                    <button class="dbmrpp-settings-export-snapshot dbmrpp-settings-reset">${T.settingsExportSnapshot}</button>
                    <button class="dbmrpp-settings-import-snapshot dbmrpp-settings-reset">${T.settingsImportSnapshot}</button>
                    <button class="dbmrpp-settings-reset dbmrpp-settings-reset-snapshot" title="${T.ttReset}">Reset Trips Snapshot</button>
                </div>
            </details>
            <details class="dbmrpp-settings-group">
                <summary>${esc(T.settingsGroupSync)}</summary>
                <div class="dbmrpp-settings-group-body">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-webdav-enabled"${webdavConfig.enabled ? ' checked' : ''}>
                        <span>${esc(T.settingsWebDavEnabled)}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${esc(T.settingsWebDavSyncDesc)}</div>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsWebDavUrl)}</span>
                        <input type="text" id="dbmrpp-webdav-url" class="dbmrpp-webdav-input" value="${esc(webdavConfig.url)}" placeholder="https://…/dbmrpp-sync.json"${webdavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsWebDavUsername)}</span>
                        <input type="text" id="dbmrpp-webdav-username" class="dbmrpp-webdav-input" value="${esc(webdavConfig.username)}" autocomplete="off"${webdavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsWebDavPassword)}</span>
                        <input type="password" id="dbmrpp-webdav-password" class="dbmrpp-webdav-input" value="${esc(webdavConfig.password)}" autocomplete="new-password"${webdavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
                        <button class="dbmrpp-settings-reset dbmrpp-webdav-save">${esc(T.settingsWebDavSave)}</button>
                        <button class="dbmrpp-settings-reset dbmrpp-webdav-sync-now"${webdavConfig.enabled && webdavConfig.url ? '' : ' disabled'}>${esc(T.settingsWebDavSyncNow)}</button>
                    </div>
                    <div id="dbmrpp-webdav-status" style="font-size:11px;color:var(--dbmrpp-text-muted)">${esc(webdavSyncStatusText())}</div>
                    <hr style="margin:10px 0;border:none;border-top:1px solid var(--dbmrpp-border)">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-caldav-enabled"${caldavConfig.enabled ? ' checked' : ''}>
                        <span>${esc(T.settingsCalDavEnabled)}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${esc(T.settingsCalDavSyncDesc)}</div>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsCalDavUrl)}</span>
                        <input type="text" id="dbmrpp-caldav-url" class="dbmrpp-webdav-input" value="${esc(caldavConfig.url)}" placeholder="https://…/dav/calendars/user/trips/"${caldavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsCalDavUsername)}</span>
                        <input type="text" id="dbmrpp-caldav-username" class="dbmrpp-webdav-input" value="${esc(caldavConfig.username)}" autocomplete="off"${caldavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <label class="dbmrpp-webdav-row">
                        <span>${esc(T.settingsCalDavPassword)}</span>
                        <input type="password" id="dbmrpp-caldav-password" class="dbmrpp-webdav-input" value="${esc(caldavConfig.password)}" autocomplete="new-password"${caldavConfig.enabled ? '' : ' disabled'}>
                    </label>
                    <label class="dbmrpp-settings-toggle" style="margin-top:4px">
                        <input type="checkbox" id="dbmrpp-caldav-include-past"${caldavConfig.includePastTrips ? ' checked' : ''}${caldavConfig.enabled ? '' : ' disabled'}>
                        <span>${esc(T.settingsCalDavIncludePast)}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${esc(T.settingsCalDavIncludePastDesc)}</div>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-caldav-include-cached"${caldavConfig.includeCachedTrips ? ' checked' : ''}${caldavConfig.enabled && caldavConfig.includePastTrips ? '' : ' disabled'}>
                        <span>${esc(T.settingsCalDavIncludeCached)}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${esc(T.settingsCalDavIncludeCachedDesc)}</div>
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-caldav-include-leistung"${caldavConfig.includeLeistungTickets ? ' checked' : ''}${caldavConfig.enabled ? '' : ' disabled'}>
                        <span>${esc(T.settingsCalDavIncludeLeistung)}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${esc(T.settingsCalDavIncludeLeistungDesc)}</div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
                        <button class="dbmrpp-settings-reset dbmrpp-caldav-save">${esc(T.settingsCalDavSave)}</button>
                        <button class="dbmrpp-settings-reset dbmrpp-caldav-push-now"${caldavConfig.enabled && caldavConfig.url ? '' : ' disabled'}>${esc(T.settingsCalDavSyncNow)}</button>
                    </div>
                    <div id="dbmrpp-caldav-status" style="font-size:11px;color:var(--dbmrpp-text-muted)">${esc(calDavSyncStatusText())}</div>
                </div>
            </details>
            <details class="dbmrpp-settings-group">
                <summary>${T.settingsGroupDev}</summary>
                <div class="dbmrpp-settings-group-body">
                    <label class="dbmrpp-settings-toggle">
                        <input type="checkbox" id="dbmrpp-setting-show-json-button"${uiSettings.showJsonButton !== false ? ' checked' : ''}>
                        <span>${T.settingsShowJsonButton}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsShowJsonButtonDesc}</div>
                    <button class="dbmrpp-settings-bulk-json dbmrpp-settings-reset">${T.settingsDownloadBulkJson}</button>
                    <label class="dbmrpp-settings-toggle" style="margin-top:8px">
                        <input type="checkbox" id="dbmrpp-setting-debug-logging"${uiSettings.debugLogging ? ' checked' : ''}>
                        <span>${T.settingsDebugLogging}</span>
                    </label>
                    <div class="dbmrpp-settings-info-text">${T.settingsDebugLoggingDesc}</div>
                    ${uiSettings.debugLogging ? `<div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
                        <button class="dbmrpp-debug-log-copy dbmrpp-settings-reset">${esc(T.settingsDebugLogCopy)}</button>
                        <button class="dbmrpp-debug-log-clear dbmrpp-settings-reset">${esc(T.settingsDebugLogClear)}</button>
                        <span class="dbmrpp-debug-log-count" style="font-size:11px;color:var(--dbmrpp-text-muted)">${esc(T.settingsDebugLogEntries((() => { try { return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || '[]').length + _debugBuffer.length; } catch(_) { return _debugBuffer.length; } })()))}</span>
                    </div>` : ''}
                </div>
            </details>
            <details class="dbmrpp-settings-group">
                <summary>${esc(T.settingsCustomTags)}</summary>
                <div class="dbmrpp-settings-group-body">
                    ${customTagDefs.map(def => `<div class="dbmrpp-custom-tag-def-row">
                        <span class="dbmrpp-tag dbmrpp-tag-${def.color}">${esc(def.label)}</span>
                        <button class="dbmrpp-custom-tag-edit dbmrpp-settings-reset" data-id="${esc(def.id)}" title="${esc(T.customTagEditTt)}">✎</button>
                        <button class="dbmrpp-custom-tag-delete dbmrpp-settings-reset" data-id="${esc(def.id)}" title="${esc(T.customTagDeleteTt)}">×</button>
                    </div>`).join('')}
                    <div class="dbmrpp-custom-tag-create">
                        <input type="text" id="dbmrpp-custom-tag-name" placeholder="${esc(T.customTagNamePlaceholder)}">
                        <select id="dbmrpp-custom-tag-color">
                            <option value="info">${esc(T.customTagColorInfo)}</option>
                            <option value="ok">${esc(T.customTagColorOk)}</option>
                            <option value="warn">${esc(T.customTagColorWarn)}</option>
                            <option value="bad">${esc(T.customTagColorBad)}</option>
                        </select>
                        <button id="dbmrpp-custom-tag-add" class="dbmrpp-settings-reset">${esc(T.customTagAdd)}</button>
                    </div>
                </div>
            </details>
        </div>
        ${isChanges ? '' : buildFilterBar(fromOptions, toOptions, availableTags, isPast)}
        ${isChanges ? '' : buildChangeBlock(changes, lastVisitTxt)}
        ${isChanges ? buildChangeLogSection() : buildTripSection(filtered, sourcePool, isPast)}`;
    }

    function buildFilterBar(fromOptions, toOptions, availableTags, isPast) {
        const opt = (val, options) => options.map(v =>
            `<option value="${esc(v)}"${filterState[val] === v ? ' selected' : ''}>${esc(v)}</option>`
        ).join('');
        return `
        <div class="dbmrpp-filter-bar">
                    <div class="dbmrpp-filter-row dbmrpp-filter-row-top">
                        <select class="dbmrpp-select" id="dbmrpp-from-sel">
                            <option value="">${T.fromAll}</option>${opt('from', fromOptions)}
                        </select>
                        <select class="dbmrpp-select" id="dbmrpp-to-sel">
                            <option value="">${T.toAll}</option>${opt('to', toOptions)}
                        </select>
                        <select class="dbmrpp-select" id="dbmrpp-tag-sel">
                            <option value="">${T.tagsLabel}</option>
                            ${availableTags.map(tagId => `<option value="${esc(tagId)}">${esc(getTagLabel(tagId))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="dbmrpp-filter-row dbmrpp-filter-row-bottom">
                        <div class="dbmrpp-day-btns">
                            ${[0, 7, 30, 90].map(d =>
                                    `<button class="dbmrpp-day-btn${filterState.days === d ? ' active' : ''}" data-days="${d}">${d === 0 ? T.dayAll : T.dayN(d)}</button>`
                            ).join('')}
                        </div>
                        ${filterState.tags.length > 0 ? `<div class="dbmrpp-selected-tags">${filterState.tags.map(t => `<span class="dbmrpp-tag-filter">${esc(getTagLabel(t))} <button class="dbmrpp-tag-remove" data-tag="${esc(t)}" style="border:none;background:none;color:inherit;cursor:pointer;padding:0;margin-left:4px;">×</button></span>`).join('')}</div>` : ''}
                        ${isPast ? '' : `<button class="dbmrpp-changes-toggle${filterState.onlyProblems ? ' active' : ''}">${T.onlyIssues}</button>`}
                    </div>
        </div>`;
    }

    function buildChangeBlock(changes, lastVisitTxt) {
        const hasChanges = changes.neu.length || changes.geaendert.length || changes.entfernt.length;
        if (!hasChanges) {
            return `<div class="dbmrpp-section dbmrpp-changes-none">${T.noChangesSince(esc(lastVisitTxt))}</div>`;
        }
        return `
        <div class="dbmrpp-section dbmrpp-changes">
            <h3>${T.changesSince(esc(lastVisitTxt))}</h3>
            ${changes.geaendert.map(c => renderChangeLine(c)).join('')}
            ${changes.neu.length    ? `<h4>${T.changesNew(changes.neu.length)}</h4>${changes.neu.map(c => renderChangeLine(c)).join('')}` : ''}
            ${changes.entfernt.length ? `<h4>${T.changesRemoved}</h4>${changes.entfernt.map(c => renderChangeLine(c, true)).join('')}` : ''}
        </div>`;
    }

    // Shared tab bar for the trip and change-log sections; rightHtml lands
    // right-aligned next to the tabs (trip count, clear button).
    function buildViewTabs(rightHtml = '') {
        return `
            <div class="dbmrpp-view-tabs">
                <button class="dbmrpp-view-tab${activeView === 'current' ? ' active' : ''}" data-view="current">${T.tabUpcoming}</button>
                <button class="dbmrpp-view-tab${activeView === 'past'    ? ' active' : ''}" data-view="past">${T.tabPast}</button>
                <button class="dbmrpp-view-tab${activeView === 'changes' ? ' active' : ''}" data-view="changes">${T.tabChanges}</button>
                ${rightHtml}
            </div>`;
    }

    function buildTripSection(filtered, sourcePool, isPast) {
        const count = `${filtered.length}/${sourcePool.length}`;
        const empty = filtered.length !== sourcePool.length ? T.noTripsFilter : T.noTrips;
        return `
        <div class="dbmrpp-section">
            ${buildViewTabs(`<span class="dbmrpp-view-count">${count}</span>`)}
            ${filtered.map(renderTripLine).join('') || `<em>${empty}</em>`}
        </div>`;
    }

    // Persistent "Changes" tab: the archived change log, newest run first,
    // grouped by detection time (all entries of one run share detectedAt).
    function buildChangeLogSection() {
        const log = loadChangeLog();
        if (!log.length) {
            return `
        <div class="dbmrpp-section">
            ${buildViewTabs()}
            <div class="dbmrpp-changes-none">${T.changeLogEmpty}</div>
        </div>`;
        }
        const groups = [];
        for (const e of log) {
            const last = groups[groups.length - 1];
            if (last && last.detectedAt === e.detectedAt) last.entries.push(e);
            else groups.push({ detectedAt: e.detectedAt, entries: [e] });
        }
        groups.reverse();
        const kindBadge = k =>
            k === 'neu'      ? `<span class="dbmrpp-tag dbmrpp-tag-ok">${T.changeLogNew}</span> ` :
            k === 'entfernt' ? `<span class="dbmrpp-tag dbmrpp-tag-bad">${T.changesRemoved}</span> ` : '';
        return `
        <div class="dbmrpp-section dbmrpp-changes">
            ${buildViewTabs(`<button class="dbmrpp-changelog-clear" title="${esc(T.ttChangeLogClear)}">${T.changeLogClear}</button>`)}
            ${groups.map(g => `
            <h4>${esc(formatDateTime(g.detectedAt))}</h4>
            ${g.entries.map(e => renderChangeLine(e, e.kind === 'entfernt', kindBadge(e.kind))).join('')}`).join('')}
        </div>`;
    }

    // =========================================================
    // 19) Trip rendering
    // =========================================================
    function buildDetailUrl(t) {
        const params = new URLSearchParams();
        if (t.auftragsnummer) params.set('auftragsnummer', t.auftragsnummer);
        const rkUuid = (t && t.ids && t.ids.reisekettenUuid) || t.uuid;
        if (rkUuid)           params.set('reisekettenuuid', rkUuid);
        const locale = location.pathname.match(/^(\/[a-z]{2})\//)?.[1] || '';
        return `${location.origin}${locale}/buchung/reise?${params.toString()}`;
    }

    function tripRouteLabel(t) {
        const fromLabel = t && (t.from || t.fromExtId) ? (t.from || t.fromExtId) : null;
        const toLabel = t && (t.to || t.toExtId) ? (t.to || t.toExtId) : null;
        return (fromLabel || toLabel)
            ? `${fromLabel || '?'} → ${toLabel || '?'}`
            : (t.leistungsname || t.name || '?');
    }

    function renderRouteLink(t) {
        const label = tripRouteLabel(t);
        if (t.isFromHistoryCache)
            return `<span class="dbmrpp-route-link dbmrpp-route-cached">${esc(label)}</span>`;
        return `<a class="dbmrpp-route-link" href="${esc(buildDetailUrl(t))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    }

    // Shared template for the per-trip action-icon buttons.
    function actionButton(cls, t, title, icon) {
        return ` <button type="button" class="${cls} dbmrpp-action-icon" data-uuid="${esc(t.uuid)}" title="${title}">${icon}</button>`;
    }

    function renderDeleteCacheBtn(t) {
        if (!t.isFromHistoryCache) return '';
        return actionButton('dbmrpp-delete-cache-btn', t, T.deleteCachedTripTooltip, '🗑️');
    }

    function renderShareLink(t) {
        if (t.fromReiseketten ? t.isOrphaned : (!t.auftragsnummer || !t.kundenwunschId)) return '';
        return actionButton('dbmrpp-share-btn', t, T.shareTooltip, '⤴️');
    }

    function isRoutingEligibleTrip(t) {
        if (!t || !t.fromReiseketten || t.isOrphaned || t.isPastTrip) return false;
        const now = Date.now();
        const end = t.arrival
            ? new Date(t.arrival).getTime() + 2 * 3600 * 1000
            : (t.departure ? new Date(t.departure).getTime() + 12 * 3600 * 1000 : NaN);
        return Number.isFinite(end) && end > now;
    }

    function renderExternalRouteLink(t) {
        if (!uiSettings.showRoutingButton) return '';
        if (!isRoutingEligibleTrip(t)) return '';
        return actionButton('dbmrpp-route-ext-btn', t, T.routeTooltip, '🧭');
    }

    function renderAbweichungBtn(t) {
        if (!t.relevanteAbweichung || !t.fromReiseketten) return '';
        return actionButton('dbmrpp-abweichung-btn', t, T.abweichungTooltip, '⚠️');
    }

    function renderIcsLink(t) {
        if (!isIcsSupportedTrip(t)) return '';
        return actionButton('dbmrpp-ics-link', t, T.icsTooltip, '📅');
    }

    function isIcsSupportedTrip(t) {
        if (!t || t.isVerbundticket) return false;
        // LEISTUNG-only products (for example many bike tickets) cannot be exported via kalender API.
        if (t.isLeistungTicket || t.positionTyp === 'LEISTUNG') return false;
        return (t.typ === 'AUFTRAG' && t.auftragsnummer && t.nachname)
            || t.typ === 'FREI'
            || t.typ === 'WIEDERHOLEND';
    }

    function renderPdfLink(t) {
        if (!t.pdfVerfuegbar || !t.leistungsbuendelId) return '';
        if (t.storniertStatus === 'STORNIERT') return '';
        return actionButton('dbmrpp-pdf-link', t, T.pdfTooltip, '🧾');
    }

    function renderRawJsonLink(t) {
        if (uiSettings.showJsonButton === false) return '';
        if (!t.uuid) return '';
        return actionButton('dbmrpp-json-link', t, T.rawJsonTooltip, '{…}');
    }

    function renderGeoLink(t) {
        if (!uiSettings.showGeoButton) return '';
        if (!t?.fromReiseketten || !t.uuid || t.isPastTrip) return '';
        const tooltip = uiSettings['geo-format'] === 'geojson' ? T.geojsonTooltip : T.gpxTooltip;
        return actionButton('dbmrpp-geo-link', t, tooltip, '🛤️');
    }

    function renderFahrgastrechteBtn(t) {
        if (!t.auftragsnummer || !t.isPastTrip) return '';
        // Once a claim is known it is rendered permanently in the meta area,
        // so the query button has no further purpose.
        const stored = fgrClaims[t.auftragsnummer];
        if (stored && stored.claims && stored.claims.length) return '';
        return actionButton('dbmrpp-fgr-btn', t, T.fgrBtnTooltip, '§');
    }

    function parseCtxReconStops(ctxRecon) {
        const text = String(ctxRecon || '');
        if (!text) return [];
        const stops = [];
        const nameRe = /@O=([^@$§¶]+)/g;
        let match;
        while ((match = nameRe.exec(text)) !== null) {
            const name = match[1] ? match[1].trim() : '';
            const segStart = match.index;
            const segEnd = (() => {
                const d = text.indexOf('$', segStart);
                const s = text.indexOf('§', segStart);
                const p = text.indexOf('¶', segStart);
                const candidates = [d, s, p].filter(i => i !== -1);
                return candidates.length ? Math.min(...candidates) : text.length;
            })();
            const segment = text.slice(segStart, segEnd);
            const lMatch = /@L=([^@$§¶]+)/.exec(segment);
            if (!lMatch) continue;
            const coord = coordFromHaltId(segment);
            if (!coord) continue;

            stops.push({
                name,
                lon: coord.lon,
                lat: coord.lat,
                id: String(lMatch[1] || '').trim()
            });
        }
        return stops;
    }

    function parseCtxReconCoordinates(ctxRecon) {
        const points = parseCtxReconStops(ctxRecon).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        if (!points.length) return null;
        return {
            from: points[0],
            to: points[points.length - 1]
        };
    }

    function extractRoutingEndpointsFromCtxRecon(ctxRecon, t) {
        const stops = parseCtxReconStops(ctxRecon);
        if (!stops.length) return null;
        const first = stops[0];
        const last = stops[stops.length - 1];
        return {
            fromId: first.id,
            toId: last.id,
            fromName: t && t.from ? t.from : first.name,
            toName: t && t.to ? t.to : last.name
        };
    }

    function getTimeZoneOffsetMinutes(timeZone, date) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'shortOffset',
            hour: '2-digit'
        }).formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        const raw = tzPart ? tzPart.value : 'GMT+0';
        const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(raw);
        if (!m) return 0;
        const sign = m[1] === '-' ? -1 : 1;
        const hh = Number(m[2]) || 0;
        const mm = Number(m[3]) || 0;
        return sign * (hh * 60 + mm);
    }

    function berlinLocalIsoToUtcIso(localIso) {
        const txt = String(localIso || '').trim();
        if (!txt) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(txt);
        if (!m) {
            const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(txt);
            if (compact) {
                const y = Number(compact[1]);
                const mo = Number(compact[2]);
                const d = Number(compact[3]);
                const h = Number(compact[4]);
                const mi = Number(compact[5]);
                const s = Number(compact[6] || 0);

                const guessUtc = Date.UTC(y, mo - 1, d, h, mi, s);
                const off1 = getTimeZoneOffsetMinutes('Europe/Berlin', new Date(guessUtc));
                const utc1 = guessUtc - off1 * 60000;
                const off2 = getTimeZoneOffsetMinutes('Europe/Berlin', new Date(utc1));
                const utc2 = guessUtc - off2 * 60000;
                return new Date(utc2).toISOString().replace('.000Z', 'Z');
            }
            const parsed = new Date(txt);
            return isNaN(parsed.getTime()) ? '' : parsed.toISOString().replace('.000Z', 'Z');
        }
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const h = Number(m[4]);
        const mi = Number(m[5]);
        const s = Number(m[6] || 0);

        const guessUtc = Date.UTC(y, mo - 1, d, h, mi, s);
        const off1 = getTimeZoneOffsetMinutes('Europe/Berlin', new Date(guessUtc));
        const utc1 = guessUtc - off1 * 60000;
        const off2 = getTimeZoneOffsetMinutes('Europe/Berlin', new Date(utc1));
        const utc2 = guessUtc - off2 * 60000;
        return new Date(utc2).toISOString().replace('.000Z', 'Z');
    }

    function logRoutingUrlUnavailable(reason, details = {}) {
        try {
            console.warn('[DBMRPP] routing unavailable:', reason, details);
        } catch (_) {}
    }

    function buildBahnExpertUrl(endpoints, t) {
        const utcIso = berlinLocalIsoToUtcIso(t.departure || '');
        if (!utcIso) {
            logRoutingUrlUnavailable('invalid-departure-time-bahn-expert', {
                uuid: t.uuid,
                typ: t.typ,
                status: t.status,
                isNichtRekonstruierbar: t.status === 'NICHT_REKONSTRUIERBAR',
                departure: t.departure
            });
            return null;
        }
        return `https://bahn.expert/routing/${encodeURIComponent(endpoints.fromId)}/${encodeURIComponent(endpoints.toId)}/${encodeURIComponent(utcIso)}/`;
    }

    function buildTransitousUrl(endpoints, routingCtxRecon, t) {
        const coords = parseCtxReconCoordinates(routingCtxRecon);
        if (!coords || !coords.from || !coords.to) {
            logRoutingUrlUnavailable('missing-coordinates-transitous', {
                uuid: t.uuid,
                typ: t.typ,
                status: t.status,
                isNichtRekonstruierbar: t.status === 'NICHT_REKONSTRUIERBAR',
                hasCtxRecon: !!routingCtxRecon,
                parsedStops: parseCtxReconStops(routingCtxRecon || '').length
            });
            return null;
        }

        const utcIso = berlinLocalIsoToUtcIso(t.departure || '');
        if (!utcIso) {
            logRoutingUrlUnavailable('invalid-departure-time-transitous', {
                uuid: t.uuid,
                typ: t.typ,
                status: t.status,
                isNichtRekonstruierbar: t.status === 'NICHT_REKONSTRUIERBAR',
                departure: t.departure
            });
            return null;
        }
        // We look for the connection based on the geographical coordinates, which will add some walking at the start. To compensate for that, we set the departure time a few minutes earlier than the actual train departure, so that the correct connection is more likely to be found.
        const departureTime = new Date(utcIso);
        departureTime.setMinutes(departureTime.getMinutes() - 5);
        const adjustedTime = departureTime.toISOString().replace('.000Z', 'Z');

        const params = new URLSearchParams();
        params.set('time', adjustedTime);
        params.set('fromPlace', `${coords.from.lat},${coords.from.lon}`);
        params.set('toPlace', `${coords.to.lat},${coords.to.lon}`);
        params.set('fromName', endpoints.fromName || '');
        params.set('toName', endpoints.toName || '');
        return `https://api.transitous.org/?${params.toString()}`;
    }

    function buildChuuchuuUrl(endpoints, t) {
        const localDateTime = String(t.departure).slice(0, 16);
        const params = new URLSearchParams();
        params.set('from', endpoints.fromId);
        params.set('to', endpoints.toId);
        params.set('fromName', encodeURIComponent(endpoints.fromName || ''));
        params.set('toName', encodeURIComponent(endpoints.toName || ''));
        params.set('date', localDateTime);
        return `https://chuuchuu.com/journeys?${params.toString()}`;
    }

    async function getExternalRoutingUrl(t) {
        if (!t || !t.uuid || !t.departure || !t.fromReiseketten) {
            logRoutingUrlUnavailable('invalid-trip-input', {
                hasTrip: !!t,
                uuid: t && t.uuid,
                departure: t && t.departure,
                fromReiseketten: !!(t && t.fromReiseketten)
            });
            return null;
        }
        // Always use the detail response for endpoint IDs: the bulk reiseketten
        // response often returns a wrong toExtId (e.g. the train's ultimate
        // terminus rather than the booked destination). fetchDetail is cached, so
        // repeated clicks cause no extra network round-trip.
        const detail = await fetchDetail(t.uuid);
        const detailCtxRecon = extractCtxReconFromDetail(detail);

        // Some NICHT_REKONSTRUIERBAR trips have no usable ctxRecon in reiseketten
        // detail. Reuse auftrag-detail fallback similar to share-link handling.
        let routingCtxRecon = detailCtxRecon;
        if (!routingCtxRecon && t.auftragsnummer) {
            try {
                const auftrag = await fetchAuftragDetail(t.auftragsnummer);
                routingCtxRecon = extractCtxReconFromAuftrag(auftrag) || null;
            } catch (err) {
                console.warn('[DBMRPP] routing: auftrag fallback failed', err);
            }
        }

        const endpoints = extractRoutingEndpointsFromCtxRecon(routingCtxRecon, t) || { fromId: '', toId: '', fromName: t.from || '', toName: t.to || '' };
        if (!endpoints.fromId || !endpoints.toId) {
            logRoutingUrlUnavailable('missing-routing-endpoints', {
                uuid: t.uuid,
                typ: t.typ,
                status: t.status,
                isNichtRekonstruierbar: t.status === 'NICHT_REKONSTRUIERBAR',
                fromId: endpoints.fromId || null,
                toId: endpoints.toId || null,
                hasCtxReconDetail: !!detailCtxRecon,
                hasCtxReconAuftragFallback: !!routingCtxRecon && !detailCtxRecon,
                parsedStops: parseCtxReconStops(routingCtxRecon || '').length
            });
            return null;
        }

        const provider = (uiSettings['routing-provider'] === 'chuuchuu' || uiSettings['routing-provider'] === 'transitous.org')
            ? uiSettings['routing-provider']
            : 'bahn.expert';
        if (provider === 'bahn.expert') return buildBahnExpertUrl(endpoints, t);
        if (provider === 'transitous.org') return buildTransitousUrl(endpoints, routingCtxRecon, t);
        return buildChuuchuuUrl(endpoints, t);
    }

    function openExternalUrlInNewTab(url, popupRef) {
        if (!url) return false;
        if (popupRef && !popupRef.closed) {
            try {
                popupRef.location.replace(url);
                return true;
            } catch (err) {
                console.warn('[DBMRPP] Could not reuse pre-opened tab', err);
            }
        }
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return true;
    }

    function parseTrainNames(zuege) {
        return String(zuege || '')
            .split('→')
            .map(s => s.trim())
            .filter(Boolean);
    }

    function isNumericOnlyTrainName(name) {
        if (!name) return false;
        return /^\d+$/.test(String(name).replace(/\s+/g, ''));
    }

    // Extract the letter prefix for a given numeric run number from a verkehrsmittel langText.
    // "RE4 (82034)" with num="82034" → "RE"
    function parseLangTextForNumber(langText, num) {
        const s = String(langText);
        const m1 = s.match(/^([A-Za-z]+)\d*\s+\((\d+)\)/);
        if (m1 && m1[2] === num) return m1[1];
        const m2 = s.match(/^([A-Za-z]+)\s+(\d+)$/);
        if (m2 && m2[2] === num) return m2[1];
        return null;
    }

    function findLettersFromDetail(detail, trainNum) {
        for (const trip of ((detail && detail.trips) || [])) {
            for (const ab of (trip.verbindungsAbschnitte || [])) {
                const lt = ab.verkehrsmittel && ab.verkehrsmittel.langText;
                if (!lt) continue;
                const letters = parseLangTextForNumber(lt, trainNum);
                if (letters) return letters;
            }
        }
        return null;
    }

    function getTrainExternalUrl(trainName, t) {
        if (!uiSettings.trainLinksEnabled) return null;
        const provider = uiSettings['traininfo-provider'] === 'bahn.expert' ? 'bahn.expert' : 'zugfinder';

        if (provider === 'zugfinder') {
            if (isNumericOnlyTrainName(trainName)) return null;
            const slug = String(trainName).trim().replace(/\s+/g, '_');
            return `https://www.zugfinder.net/de/zug-${encodeURIComponent(slug)}`;
        }

        if (!t || !t.departure) return null;
        const dep = new Date(t.departure);
        if (isNaN(dep.getTime())) return null;
        const iso = dep.toISOString();
        return `https://bahn.expert/details/${encodeURIComponent(String(trainName).trim())}/${encodeURIComponent(iso)}`;
    }

    function renderTrainList(t, linkContext) {
        const names = parseTrainNames(t && t.zuege);
        if (!names.length) return '';
        return names.map(name => {
            if (uiSettings.trainLinksEnabled && isNumericOnlyTrainName(name)) {
                const ctx = linkContext || t;
                if (ctx && ctx.uuid && ctx.fromReiseketten) {
                    return `<button type="button" class="dbmrpp-train-link dbmrpp-train-num-link" data-uuid="${esc(ctx.uuid)}" data-train-num="${esc(name)}" data-departure="${esc(ctx.departure || '')}">${esc(name)}</button>`;
                }
            }
            const url = getTrainExternalUrl(name, linkContext || t);
            if (!url) return esc(name);
            return `<a class="dbmrpp-train-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`;
        }).join(' → ');
    }

    function delayTag(soll, ist) {
        if (!soll || !ist || soll === ist) return '';
        const min = Math.round((new Date(ist) - new Date(soll)) / 60000);
        if (min === 0) return '';
        return min > 0 ? `<span class="dbmrpp-delay"> +${min}'</span>` : `<span class="dbmrpp-early"> ${min}'</span>`;
    }

    function trackChangedTag(rt) {
        if (!rt) return '';
        return `<span class="dbmrpp-delay"> → ${esc(rt)}</span>`;
    }

    function planChangeTag(t, field) {
        if (field === 'arrival') {
            if (!t || !t.bookedArrival || t.bookedArrival === t.arrival) return '';
            return `<span class="dbmrpp-plan-change" title="${esc(T.planChangedFrom + ' ' + formatDateTime(t.bookedArrival))}"> <s>${esc(formatTime(t.bookedArrival))}</s></span>`;
        }
        if (field === 'departure') {
            if (!t || !t.bookedDeparture || t.bookedDeparture === t.departure) return '';
            return `<span class="dbmrpp-plan-change" title="${esc(T.planChangedFrom + ' ' + formatDateTime(t.bookedDeparture))}"> <s>${esc(formatTime(t.bookedDeparture))}</s></span>`;
        }
        if (field === 'zuege') {
            if (!t || !t.bookedZuege || t.bookedZuege === t.zuege) return '';
            return `<br><span class="dbmrpp-plan-change">🚅 <s>${esc(t.bookedZuege)}</s></span>`;
        }
        return '';
    }

    function formatDelaySummary(label, soll, ist) {
        if (!soll || !ist || soll === ist) return '';
        const min = Math.round((new Date(ist) - new Date(soll)) / 60000);
        if (min === 0 || !Number.isFinite(min)) return '';
        const sign = min > 0 ? '+' : '';
        return `${label} ${sign}${min}'`;
    }

    function buildTripTags(t) {
        const tag = (cls, text) => `<span class="dbmrpp-tag ${cls}">${text}</span>`;
        const tags = TRIP_TAG_DEFS
            .filter(d => d.cond(t))
            .map(d => tag(`dbmrpp-tag-${d.cls}`, d.label(t)));
        (customTagAssignments[t.uuid] || []).forEach(cid => {
            const def = customTagDefs.find(d => d.id === cid);
            if (def) tags.push(tag(`dbmrpp-tag-${def.color}`, esc(def.label)));
        });
        return tags;
    }

    function renderCustomTagBtn(t) {
        if (customTagDefs.length === 0) return '';
        const assigned = customTagAssignments[t.uuid] || [];
        const hasAssigned = assigned.some(id => customTagDefs.some(d => d.id === id));
        const items = customTagDefs.map(def => {
            const isActive = assigned.includes(def.id);
            return `<button class="dbmrpp-custom-tag-toggle${isActive ? ' active' : ''}" data-uuid="${esc(t.uuid)}" data-tagid="${esc(def.id)}"><span class="dbmrpp-tag dbmrpp-tag-${def.color}">${esc(def.label)}</span></button>`;
        }).join('');
        return `<details class="dbmrpp-custom-tag-details"><summary class="dbmrpp-action-icon${hasAssigned ? ' dbmrpp-custom-tag-assigned' : ''}" title="${esc(T.customTagAssignTt)}">🔖</summary><div class="dbmrpp-custom-tag-picker">${items}</div></details>`;
    }

    function renderNoteDisplay(uuid) {
        const text = tripNotes[uuid];
        if (!text || !text.trim()) return '';
        if (!text.includes('\n')) {
            return `<div class="dbmrpp-note">${esc(text)}</div>`;
        }
        const firstLine = text.split('\n')[0] || text;
        return `<details class="dbmrpp-note-details"><summary class="dbmrpp-note-summary">${esc(firstLine)}</summary><div class="dbmrpp-note-body">${esc(text)}</div></details>`;
    }

    function renderNoteBtn(t) {
        const hasNote = !!(tripNotes[t.uuid] && tripNotes[t.uuid].trim());
        return actionButton(`dbmrpp-note-btn${hasNote ? ' dbmrpp-note-btn-active' : ''}`, t, esc(T.noteTt), '✏️');
    }

    // One "🚅 [platform] train list [platform]" meta line. `source` carries the
    // track/train data (the trip itself, or its cached live state), `t` is the
    // trip used for link context and the Verbundticket check.
    function trainMetaLine(source, t, showPlatforms) {
        const platform = (track, trackRt) =>
            showPlatforms && track && !t.isVerbundticket
                ? `${esc(T.metaPlatform)} ${esc(track)}${trackChangedTag(trackRt)}`
                : '';
        const dep = platform(source.departureTrack, source.departureTrackRt);
        const arr = platform(source.arrivalTrack, source.arrivalTrackRt);
        return `🚅 ${dep ? `${dep} ` : ''}${renderTrainList(source, t)}${arr ? ` ${arr}` : ''}`;
    }

    // Full per-trip action strip for the main trip list. Each renderer
    // decides for itself whether its button applies and returns '' if not.
    function renderTripActions(t) {
        return [
            renderExternalRouteLink(t),
            renderShareLink(t),
            renderAbweichungBtn(t),
            renderIcsLink(t),
            renderPdfLink(t),
            renderGeoLink(t),
            renderRawJsonLink(t),
            renderFahrgastrechteBtn(t),
            renderDeleteCacheBtn(t),
            renderCustomTagBtn(t),
            renderNoteBtn(t)
        ].join(' ');
    }

    // Slim strip for the change block: routing, tag, note. Removed trips are
    // stale snapshot copies that findTrip cannot resolve, so their routing
    // button would be dead — skip it; tag and note work purely off data-uuid.
    function renderChangeActions(t, removed) {
        return [
            removed ? '' : renderExternalRouteLink(t),
            renderCustomTagBtn(t),
            renderNoteBtn(t)
        ].join(' ');
    }

    function renderTripLine(t) {
        const d    = t.departure ? formatDateTime(t.departure) : '?';
        const sameDay = t.departure && t.arrival &&
            t.departure.slice(0, 10) === t.arrival.slice(0, 10);
        const a    = t.arrival ? (sameDay ? formatTime(t.arrival) : formatDateTime(t.arrival)) : '?';
        const showLeistungsnameMeta = !!t.leistungsname && !!(t.from || t.to);
        // Only suppress primary platform / train info when the trip is an
        // enriched past-trip that was merged from history — but keep original
        // behaviour for normal tickets. Use hasTripHistoryEntry to decide that.
        const showPrimaryPlatformInfo = !(t.isPastTrip && t.hasTripHistoryEntry && !t.isFromHistoryCache);
        const showPrimaryTrainInfo = !(t.isPastTrip && t.hasTripHistoryEntry && !t.isFromHistoryCache);
        // For reconstructed saved trips, avoid duplicate transport lines:
        // show them in cache details only when missing from the primary line.
        const showTransportInCacheBlock = !t.isFromHistoryCache || (!t.zuege && !t.seats);
        const tags = buildTripTags(t);
        const showCacheTagsInline = t.isPastTrip && t.hasTripHistoryEntry && tags.length > 0;
        const cacheTags = showCacheTagsInline ? `<div class="dbmrpp-cache-tags">${tags.join('')}</div>` : '';
        const recurrenceRule = formatWiederholungRule(t.wiederholung);
        return `
        <div class="dbmrpp-trip${t.isOrphaned ? ' dbmrpp-orphan' : ''}${(t.isPastTrip && t.isFromHistoryCache) ? ' dbmrpp-cached-trip' : ''}" data-uuid="${esc(t.uuid)}">
            <div class="dbmrpp-route">
                ${t.isFromHistoryCache ? `<span class="dbmrpp-cache-badge">${esc(T.cacheLabel)}</span> ` : ''}
                ${renderRouteLink(t)}
                ${renderTripActions(t)}
            </div>
            <div class="dbmrpp-meta">
                ${t.isVerbundticket ? `<span class="dbmrpp-meta-label">${T.metaValidLabel}</span> ` : ''}<strong>${esc(d)}</strong>${planChangeTag(t, 'departure')}${delayTag(t.departure, t.departureRt)} – <strong>${esc(a)}</strong>${planChangeTag(t, 'arrival')}${delayTag(t.arrival, t.arrivalRt)}
                ${showLeistungsnameMeta ? ` · <strong>${esc(t.leistungsname)}</strong>` : ''}
                ${t.cityTicket ? ` · CityTicket ${esc(t.cityTicket)}` : ''}
                ${t.reisende && t.reisende.length > 1 ? ` · ${T.metaPersons(t.reisende.length)}` : ''}
                ${showPrimaryTrainInfo && t.zuege ? `<br>${trainMetaLine(t, t, showPrimaryPlatformInfo)}${planChangeTag(t, 'zuege')}` : ''}
                ${showPrimaryTrainInfo && t.seats ? `<br>💺 ${esc(t.seats)}` : ''}
                ${t.auftragsnummer ? `<br>${T.metaOrder(esc(t.auftragsnummer))}` : ''}
                ${t.anlagedatum ? ` · ${T.metaBooked(esc(formatDate(t.anlagedatum)))}` : ''}
                ${t.ueberwachungName ? `<br>${esc(T.metaRecurringName(t.ueberwachungName))}` : ''}
                ${recurrenceRule ? `<br>${esc(recurrenceRule)}` : ''}
                ${t.gueltigVon && t.gueltigBis && !t.isVerbundticket ? `<br>${T.metaValidRange(esc(formatDate(t.gueltigVon)), esc(formatDate(t.gueltigBis)))}` : ''}
            </div>
            ${renderFgrClaimBlock(t)}
            ${renderCacheInfo(t, cacheTags, { showTransportLines: showTransportInCacheBlock })}
            ${renderNoteDisplay(t.uuid)}
            ${!showCacheTagsInline ? `<div class="dbmrpp-trip-tags">${tags.join('')}</div>` : ''}
        </div>`;
    }

    // Permanent notice for a known passenger-rights claim, styled like the
    // transient "no claim" answer so both kinds of result look the same.
    function renderFgrClaimBlock(t) {
        const rec = t.auftragsnummer ? fgrClaims[t.auftragsnummer] : null;
        if (!rec || !rec.claims || !rec.claims.length) return '';
        return `<div class="dbmrpp-fgr-detail">${rec.claims.map(a => {
            const date = a.date ? esc(formatDate(a.date)) : '?';
            const ids = (a.antragIds || []).map(esc);
            return `<div class="dbmrpp-fgr-claim">${T.fgrClaim(date, ids)}</div>`;
        }).join('')}</div>`;
    }

    function renderCacheInfo(t, tagsHtml, opts = {}) {
        if (!t) return '';
        if (!uiSettings.usePastCache) return '';
        const showTransportLines = opts.showTransportLines !== false;
        if (!t.hasTripHistoryEntry || !t.cacheInfo) {
            if (!t.isPastTrip) return '';
                if (t.isFromHistoryCache) return '';
            return `<div class="dbmrpp-cache-block dbmrpp-cache-missing"><span class="dbmrpp-cache-label">${esc(T.cacheLabel)}</span> ${esc(T.cacheMissing)}</div>`;
        }
        const c = t.cacheInfo;
        const facts = [];
        if (c.cachedAt) {
            const ts = formatDateTime(c.cachedAt);
            facts.push(esc(T.cacheCapturedAt(ts)));
        }
        if (c.departureRt || c.arrivalRt) {
            const dep = c.departureRt ? formatDateTime(c.departureRt) : '?';
            const arr = c.arrivalRt ? formatDateTime(c.arrivalRt) : '?';
            facts.push(`RT ${esc(dep)} → ${esc(arr)}`);
        }
        const depDelay = formatDelaySummary(T.cacheDelayDeparture, t.departure, c.departureRt);
        const arrDelay = formatDelaySummary(T.cacheDelayArrival, t.arrival, c.arrivalRt);
        if (depDelay) facts.push(esc(depDelay));
        if (arrDelay) facts.push(esc(arrDelay));

        const lines = [];
        if (facts.length) lines.push(facts.join(' · '));
        if (showTransportLines && c.zuege) lines.push(trainMetaLine(c, t, !t.isFromHistoryCache));
        if (showTransportLines && c.seats) lines.push(`💺 ${esc(c.seats)}`);

        const notifEntries = normalizeNotificationEntries(c.notifications || []);
        const notifBlock = notifEntries.length
            ? `<div class="dbmrpp-cache-msg"><strong>${esc(T.cacheNotificationsLabel)}:</strong><br>${notifEntries.map(n => `ℹ️ ${esc(n.text)}`).join('<br>')}</div>`
            : '';

        if (!lines.length && !notifBlock && !tagsHtml) return '';
        if (t.isFromHistoryCache) {
            return `<div class="dbmrpp-cache-inline">${lines.join('<br>')}${notifBlock}${tagsHtml || ''}</div>`;
        }
        return `<div class="dbmrpp-cache-block"><span class="dbmrpp-cache-label">${esc(T.cacheLabel)}</span> ${lines.join('<br>')}${notifBlock}${tagsHtml || ''}</div>`;
    }

    // One row in the change block, shared by all three categories. Removed
    // trips no longer exist in the account, so their route is rendered as
    // plain text instead of a link to a dead detail page.
    function renderChangeLine(c, removed = false, badge = '') {
        const t = c.trip;
        const route = removed
            ? `<span class="dbmrpp-route-link dbmrpp-route-cached">${esc(tripRouteLabel(t))}</span>`
            : renderRouteLink(t);
        return `
        <div class="dbmrpp-trip" data-uuid="${esc(t.uuid)}">
            <div class="dbmrpp-route">${badge}${route}${renderChangeActions(t, removed)}
                <span class="dbmrpp-meta">(<strong>${t.departure ? esc(formatDateTime(t.departure)) : '?'}</strong>)</span>
            </div>
            ${(c.changes || []).map(d => `
            <div class="dbmrpp-diff">
                <strong>${esc(T.fieldLabels[d.field] || d.field)}:</strong>
                <span class="dbmrpp-diff-old">${esc(formatVal(d.field, d.old))}</span>
                → <span class="dbmrpp-diff-new">${esc(formatVal(d.field, d.new))}</span>
            </div>`).join('')}
            ${renderNoteDisplay(t.uuid)}
        </div>`;
    }

    function formatStorno(s) { return T.storno[s] || s; }

    function formatVal(field, v) {
        if (v === null || v === undefined || v === '') return '–';
        if (['departure','arrival','departureRt','arrivalRt'].includes(field)) return formatDateTime(v);
        if (typeof v === 'boolean') return v ? (IS_INT ? 'yes' : 'ja') : (IS_INT ? 'no' : 'nein');
        const mapped = T.diffValues[field] && T.diffValues[field][v];
        return mapped || String(v);
    }

    function formatDateTime(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString(DATE_LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatTime(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatWeekdayLabels(days) {
        const labels = IS_INT
            ? { MO: 'Mon', DI: 'Tue', MI: 'Wed', DO: 'Thu', FR: 'Fri', SA: 'Sat', SO: 'Sun' }
            : { MO: 'Mo', DI: 'Di', MI: 'Mi', DO: 'Do', FR: 'Fr', SA: 'Sa', SO: 'So' };
        return (Array.isArray(days) ? days : []).map(d => labels[d] || d).join(', ');
    }

    function formatWiederholungRule(wiederholung) {
        if (!wiederholung || !Array.isArray(wiederholung.wochentage) || !wiederholung.wochentage.length) return '';
        const days = formatWeekdayLabels(wiederholung.wochentage);
        const untilWord = IS_INT ? ' until ' : ' bis ';
        const until = wiederholung.aktivBis ? `${untilWord}${formatDate(wiederholung.aktivBis)}` : '';
        return `${T.tagWiederholend}: ${days}${until}`;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
        );
    }
})();