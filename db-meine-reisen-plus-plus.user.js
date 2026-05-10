// ==UserScript==
// @name         DB Meine Reisen++
// @namespace    db-meine-reisen-plus-plus
// @version      1.6.1
// @description  A userscript that enhances the Deutsche Bahn (bahn.de) travel overview page ("My trips"/"Meine Reisen") with a full trip view, exports, change tracking, and more. Works on both the German and international versions of the site. 
// @match        https://www.bahn.de/*
// @match        https://int.bahn.de/*
// @homepageURL  https://github.com/Jo11n/db-meine-reisen-plus-plus
// @supportURL   https://github.com/Jo11n/db-meine-reisen-plus-plus/issues
// @downloadURL  https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js
// @updateURL    https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ----- Configuration -----
    const STORAGE_KEY      = 'dbMeineReisenPlusPlus.snapshot.v1';
    const LAST_VISIT_KEY   = 'dbMeineReisenPlusPlus.lastVisit';
    const KUNDENPROFIL_KEY = 'dbMeineReisenPlusPlus.kundenprofilId';
    const ENDPOINT_PATH    = '/web/api/reisebegleitung/reiseketten';
    const AUFTRAG_PATH     = '/web/api/buchung/auftrag/v2';
    const PAGESIZE         = 100;
    const AUFTRAG_PAGESIZE = 100;
    const RUN_DELAY_MS     = 800;
    const DIFF_WATCHED     = ['zugbindung','status','relevanteAbweichung','alternativensuche',
                              'departure','arrival','departureRt','arrivalRt',
                              'departureTrack','arrivalTrack','zuege','seats',
                              'leistungsname','storniertStatus','auftragStatus',
                              'sitzplatzStorniert','stellplatzStorniert'];

    // Language: English on int.bahn.de, German otherwise
    const IS_INT      = location.hostname.startsWith('int.');
    const DATE_LOCALE = IS_INT ? 'en-GB' : 'de-DE';

    // =========================================================
    // Translations
    // =========================================================
    const T = (() => {
        const en = {
            title:             'DB My Trips++',
            hasChanges:        ' · Changes!',
            ttReload:          'Reload',
            ttIcsBulk:         'Download all visible trips as ICS',
            ttCsv:             'Download all visible trips as CSV',
            ttReset:           'Reset snapshot',
            ttCollapse:        'Collapse',
            ttClose:           'Close',
            fromAll:           'From (all)',
            toAll:             'To (all)',
            dayAll:            'All',
            dayN:              n => `${n}D`,
            onlyIssues:        '⚠ Issues only',
            tabUpcoming:       'Upcoming',
            tabPast:           'Past',
            noTrips:           'No trips.',
            noTripsFilter:     'No trips for this filter.',
            changesSince:      d => `Changes since ${d}`,
            noChangesSince:    d => `No changes since ${d}`,
            changesNew:        n => `New (${n})`,
            changesRemoved:    'Removed',
            orphansSection:    n => `Cancelled / unmatched bookings (${n})`,
            neverVisited:      'never',
            tagClass1:         '1st cl.',
            tagZugbindung:     'Train binding lifted',
            tagNotRecon:       'Not reconstructable',
            tagMustRebook:     'Rebooking required',
            tagAltPossible:    'Alternatives available',
            tagDisruption:     'Disruption',
            tagSaved:          'Saved',
            tagAbo:            'Subscription',
            tagSeatCancelled:  'Seat cancelled',
            tagBikeCancelled:  'Bike spot cancelled',
            tagPartFare:       'Part fare',
            tagRegionalTicket: 'Regional ticket',
            tagRerouted:       'Rerouted',
            tagReassigned:     'Seat reassigned',
            tagMuted:          '🔕 No alerts',
            tagAuftragStatus:  s => `Order: ${s}`,
            metaValidLabel:    'Valid:',
            metaPlatform:      'Pl.',
            metaPersons:       n => `${n} persons`,
            metaOrder:         nr => `Order #${nr}`,
            metaBooked:        d => `booked ${d}`,
            metaValidRange:    (a, b) => `Valid ${a}–${b}`,
            icsTooltip:        'Download ICS file',
            pdfTooltip:        'Download ticket PDF',
            shareTooltip:      'Share connection',
            shareCopied:       '✓ Copied!',
            shareError:        'Share failed — see console.',
            abweichungTooltip: 'Show disruption details',
            abweichungLoading: 'Loading…',
            abweichungNone:    'No current alerts.',
            abweichungError:   'Failed to load — see console.',
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
                arrivalTrack:        'Arrival platform',
                zuege:               'Trains',
                seats:               'Reservations',
                leistungsname:       'Fare',
                storniertStatus:     'Cancellation',
                auftragStatus:       'Order status',
                sitzplatzStorniert:  'Seat cancelled',
                stellplatzStorniert: 'Bike spot cancelled'
            },
            storno: {
                STORNIERT:                  'Cancelled',
                STORNIERUNG_BEANTRAGT:      'Cancellation requested',
                STORNIERUNG_FEHLGESCHLAGEN: 'Cancellation failed'
            },
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
            icsDescTrains:       t => `Trains: ${t}`,
            icsDescOrder:        n => `Order: ${n}`,
            icsDescSeat:         s => `Seat: ${s}`,
            icsDescZugbindung:   'Train binding lifted',
            csvHeaders: [
                'Date', 'Departure', 'Arrival', 'Departure (actual)', 'Arrival (actual)',
                'From', 'To', 'Departure platform', 'Arrival platform', 'Trains',
                'Fare', 'Class', 'Class (API)', 'Type',
                'Order number', 'Booked on', 'Booked by',
                'Train binding', 'Cancellation status', 'Order status', 'Status',
                'Seats', 'Seat available', 'Seat cancelled', 'Bike spot available', 'Bike spot cancelled',
                'CityTicket', 'Regional add-on', 'Regional code', 'Part fare',
                'Valid from', 'Valid until',
                'Disruption', 'Alternatives',
                'Travellers',
                'UUID', 'WishID', 'BundleID',
                'Notifications', 'Seat reassigned', 'Rerouted'
            ]
        };
        const de = {
            title:             'DB Meine Reisen++',
            hasChanges:        ' · Änderungen!',
            ttReload:          'Neu laden',
            ttIcsBulk:         'Alle sichtbaren Reisen als ICS herunterladen',
            ttCsv:             'Alle sichtbaren Reisen als CSV herunterladen',
            ttReset:           'Snapshot zurücksetzen',
            ttCollapse:        'Einklappen',
            ttClose:           'Schließen',
            fromAll:           'Von (alle)',
            toAll:             'Nach (alle)',
            dayAll:            'Alle',
            dayN:              n => `${n}T`,
            onlyIssues:        '⚠ Mit Problem',
            tabUpcoming:       'Bevorstehend',
            tabPast:           'Vergangen',
            noTrips:           'Keine Reisen.',
            noTripsFilter:     'Keine Reisen für diesen Filter.',
            changesSince:      d => `Änderungen seit ${d}`,
            noChangesSince:    d => `Keine Änderungen seit ${d}`,
            changesNew:        n => `Neu (${n})`,
            changesRemoved:    'Entfernt',
            orphansSection:    n => `Stornierte / nicht zugeordnete Buchungen (${n})`,
            neverVisited:      'noch nie',
            tagClass1:         '1. Kl.',
            tagZugbindung:     'Zugbindung aufgehoben',
            tagNotRecon:       'Nicht rekonstruierbar',
            tagMustRebook:     'Umbuchung nötig',
            tagAltPossible:    'Alt. möglich',
            tagDisruption:     'Abweichung',
            tagSaved:          'Gemerkt',
            tagAbo:            'Abo',
            tagSeatCancelled:  'Sitzplatz storniert',
            tagBikeCancelled:  'Stellplatz storniert',
            tagPartFare:       'Teilpreis',
            tagRegionalTicket: 'Verbundticket',
            tagRerouted:       'Umgeleitet',
            tagReassigned:     'Umplatziert',
            tagMuted:          '🔕 Keine Benachrichtigungen',
            tagAuftragStatus:  s => `Auftrag: ${s}`,
            metaValidLabel:    'Gültig:',
            metaPlatform:      'Gl.',
            metaPersons:       n => `${n} Personen`,
            metaOrder:         nr => `Auftrag #${nr}`,
            metaBooked:        d => `gebucht ${d}`,
            metaValidRange:    (a, b) => `Gültig ${a}–${b}`,
            icsTooltip:        'ICS-Datei herunterladen',
            pdfTooltip:        'Ticket-PDF herunterladen',
            shareTooltip:      'Verbindung teilen',
            shareCopied:       '✓ Link kopiert!',
            shareError:        'Teilen fehlgeschlagen — siehe Konsole.',
            abweichungTooltip: 'Abweichungsdetails anzeigen',
            abweichungLoading: 'Lade…',
            abweichungNone:    'Keine aktuellen Meldungen.',
            abweichungError:   'Laden fehlgeschlagen — siehe Konsole.',
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
                arrivalTrack:        'Gleis Ankunft',
                zuege:               'Züge',
                seats:               'Reservierungen',
                leistungsname:       'Tarif',
                storniertStatus:     'Stornierungsstatus',
                auftragStatus:       'Auftragsstatus',
                sitzplatzStorniert:  'Sitzplatz storniert',
                stellplatzStorniert: 'Stellplatz storniert'
            },
            storno: {
                STORNIERT:                  'Storniert',
                STORNIERUNG_BEANTRAGT:      'Storno beantragt',
                STORNIERUNG_FEHLGESCHLAGEN: 'Storno fehlgeschlagen'
            },
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
            icsDescTrains:       t => `Züge: ${t}`,
            icsDescOrder:        n => `Auftrag: ${n}`,
            icsDescSeat:         s => `Sitzplatz: ${s}`,
            icsDescZugbindung:   'Zugbindung aufgehoben',
            csvHeaders: [
                'Datum', 'Abfahrt', 'Ankunft', 'Abfahrt aktuell', 'Ankunft aktuell',
                'Von', 'Nach', 'Gleis Abfahrt', 'Gleis Ankunft', 'Züge',
                'Tarif', 'Klasse', 'Klasse (API)', 'Typ',
                'Auftragsnummer', 'Gebucht am', 'Gebucht von',
                'Zugbindung', 'Stornierungsstatus', 'Auftragsstatus', 'Status',
                'Plätze', 'Sitzplatz vorhanden', 'Sitzplatz storniert',
                'Stellplatz vorhanden', 'Stellplatz storniert',
                'CityTicket', 'Verbundticket', 'Verbund-Code', 'Teilpreis',
                'Gültig von', 'Gültig bis',
                'Relevante Abweichung', 'Alternativensuche',
                'Reisende',
                'UUID', 'KundenwunschID', 'LeistungsbuendelID',
                'Benachrichtigungen', 'Umplatziert', 'Umgeleitet'
            ]
        };
        return IS_INT ? en : de;
    })();

    // =========================================================
    // Module-level state
    // =========================================================
    let bearerToken    = null;
    let kundenprofilId = localStorage.getItem(KUNDENPROFIL_KEY) || null;
    let alreadyRan     = false;
    let runInProgress   = false;
    let runTimerId      = null;
    let lastRenderArgs  = null;
    let filterState     = { from: '', to: '', days: 0, onlyChanges: false };
    let activeView      = 'current';
    let pastTrips       = null;
    let auftraegeCache  = null;
    let panelVisible    = false;

    // Cache for reiseketten (journey-chain) detail responses.
    // Share links and disruption details reuse the same endpoint.
    const detailCache = new Map(); // uuid → Promise<data>

    // =========================================================
    // 1) Token-Capture
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
        // Only trigger run() when actually on the target page — @match now covers the
        // whole domain so token capture can happen on any bahn.de page.
        if (!alreadyRan && isTargetPath()) {
            alreadyRan = true;
            scheduleRun();
        }
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
        panelVisible    = false;
        runInProgress   = false;
        if (runTimerId !== null) {
            clearTimeout(runTimerId);
            runTimerId = null;
        }
        lastRenderArgs  = null;
        pastTrips       = null;
        auftraegeCache  = null;
        detailCache.clear();
        filterState     = { from: '', to: '', days: 0, onlyChanges: false };
        activeView      = 'current';
        const root = document.getElementById('dbmrpp-root');
        if (root) root.remove();
        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.remove();
    }

    function handleNavigation() {
        if (isTargetPath()) {
            // Token already captured (SPA nav from another page in same session) — trigger run
            if (!alreadyRan && bearerToken) {
                alreadyRan = true;
                scheduleRun();
            }
            // If !bearerToken: rememberToken() will fire when the page makes its first API call
        } else {
            // Navigated away — reset so the script re-runs on next visit to the target
            alreadyRan = false;
            cleanup();
        }
    }

    // Intercept SPA navigation (pushState / replaceState / popstate)
    const _origPush    = history.pushState.bind(history);
    const _origReplace = history.replaceState.bind(history);
    history.pushState = function (...args) { _origPush(...args);    handleNavigation(); };
    history.replaceState = function (...args) { _origReplace(...args); handleNavigation(); };
    window.addEventListener('popstate', handleNavigation);
    // Check immediately in case the script loads directly on the target URL
    // (token not captured yet — rememberToken will handle the actual run() trigger)
    handleNavigation();

    // =========================================================
    // 2) Authenticated fetch wrapper
    // =========================================================
    function dbFetch(url, init = {}) {
        const headers = Object.assign(
            { 'Authorization': bearerToken, 'Accept': 'application/json' },
            init.headers || {}
        );
        return origFetch(url, { ...init, headers, credentials: 'include' });
    }

    // Cached detail fetch — share link and abweichung call the same endpoint;
    // cache avoids a redundant round-trip when both are used on the same trip.
    // Cache is cleared on each full refresh so stale data is never shown.
    function fetchDetail(uuid) {
        if (!detailCache.has(uuid)) {
            const p = dbFetch(`/web/api/reisebegleitung/reiseketten/${encodeURIComponent(uuid)}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                });
            p.catch(() => detailCache.delete(uuid));
            detailCache.set(uuid, p);
        }
        return detailCache.get(uuid);
    }

    // =========================================================
    // 3) Data fetching
    // =========================================================
    async function run() {
        if (!isTargetPath()) return;
        if (runInProgress) return;
        runInProgress = true;
        try {
            // Ensure kundenprofilId is available before fetching auftraege (orders).
            // URL-sniffing may not fire in time (or at all) on int.bahn.de due to
            // separate localStorage origin — fall back to kundenkonto/v2.
            if (!kundenprofilId) await fetchKundenprofil();

            const [reisekettenData, auftraege] = await Promise.all([
                fetchReiseketten(),
                fetchAllAuftraege()
            ]);
            if (!reisekettenData) return;

            detailCache.clear(); // invalidate on refresh

            const auftragMap = buildAuftragMap(auftraege);
            const trips = (reisekettenData.reiseketten || []).map(simplify);
            trips.forEach(t => mergeAuftrag(t, auftragMap[t.kundenwunschId]));
            trips.sort((a, b) => (a.departure || '').localeCompare(b.departure || ''));

            auftraegeCache = auftraege;
            pastTrips = null;

            const matchedIds = new Set(trips.map(t => t.kundenwunschId).filter(Boolean));
            const orphans = buildOrphans(auftraege, matchedIds);

            const lastVisit = localStorage.getItem(LAST_VISIT_KEY);

            const current = {};
            trips.forEach(t => current[t.uuid] = t);
            // Skip diff on first run — no previous snapshot means nothing meaningful to compare.
            const previous = lastVisit ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : null;
            const changes = previous ? diffSnapshots(previous, current) : { neu: [], entfernt: [], geaendert: [] };

            await renderUI(trips, orphans, changes, lastVisit);

            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
        } catch (err) {
            console.error('[DBMRPP]', err);
        } finally {
            runInProgress = false;
        }
    }

    async function fetchReiseketten() {
        const url = `${ENDPOINT_PATH}?pagesize=${PAGESIZE}&types%5B%5D=AUFTRAG&types%5B%5D=FREI&types%5B%5D=WIEDERHOLEND`;
        const res = await dbFetch(url);
        if (!res.ok) { console.warn('[DBMRPP] reiseketten HTTP', res.status); return null; }
        return res.json();
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
        const stamp = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
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
            if (all.length > 5000) break;
        }
        return all;
    }

    // =========================================================
    // 4) Auftrag (order) data helpers
    // =========================================================

    // Extract outbound and return legs from an auftrag entry.
    function extractLegs(a) {
        const legs = [];
        if (a.gesamtreisen && a.gesamtreisen[0]) {
            if (a.gesamtreisen[0].hinfahrt)  legs.push(a.gesamtreisen[0].hinfahrt);
            if (a.gesamtreisen[0].rueckfahrt) legs.push(a.gesamtreisen[0].rueckfahrt);
        }
        return legs;
    }

    // Builds the common base for synthetic trip objects (orphans + past trips).
    // Specific fields are supplied via overrides which are spread on top.
    function buildSyntheticTrip(a, fahrt, overrides = {}) {
        const kanals = fahrt.materialisierungsKanalNames || [];
        return {
            typ:                 'AUFTRAG',
            fromReiseketten:     false,
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
            klasse:              2,
            // Fields only present in reiseketten responses: safe defaults for display + diff.
            zuege: '', seats: '', zugbindung: null, status: null,
            relevanteAbweichung: false, alternativensuche: null,
            departureRt: null, arrivalRt: null, departureTrack: null, arrivalTrack: null,
            ueberwacht: null, umreserviert: false, letzterReiseplanBearbeiter: null,
            ...overrides
        };
    }

    function buildAuftragMap(auftraege) {
        const map = {};
        auftraege.forEach(a => {
            extractLegs(a).forEach(fahrt => {
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
                    cityTicket:          fahrt.cityTicket
                                             ? `${fahrt.cityTicket.abgangsBahnhof || ''}/${fahrt.cityTicket.zielBahnhof || ''}`
                                             : null,
                    anlagedatum:         a.anlagedatum || null,
                    nachname:            (a.hauptadresse && a.hauptadresse.nachname) || null,
                    reisende:            fahrt.reisende || [],
                    pdfVerfuegbar:       !!(kanals.includes('WEB') || kanals.includes('BUCHUNG')),
                    teilpreis:           !!fahrt.isTeilpreis,
                    gueltigVon:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.ersterGeltungszeitpunkt || null,
                    gueltigBis:          fahrt.zeitlicheGueltigkeit && fahrt.zeitlicheGueltigkeit.letzterGeltungszeitpunkt || null
                };
            });
        });
        return map;
    }

    function buildOrphans(auftraege, matchedIds) {
        const cutoff = Date.now() - 2 * 3600 * 1000;
        const result = [];
        auftraege.forEach(a => {
            extractLegs(a).forEach(fahrt => {
                if (!fahrt.kundenwunschId) return;
                if (matchedIds.has(fahrt.kundenwunschId)) return;
                const dep = fahrt.abfahrt ? new Date(fahrt.abfahrt).getTime() : 0;
                if (dep <= cutoff) return;
                if (fahrt.storniertStatus === 'NICHT_STORNIERT') return;
                result.push(buildSyntheticTrip(a, fahrt, {
                    uuid:       fahrt.kundenwunschId,
                    isOrphaned: true
                }));
            });
        });
        result.sort((a, b) => (a.departure || '').localeCompare(b.departure || ''));
        return result;
    }

    function buildPastTrips(auftraege) {
        const now = Date.now();
        const result = [];
        auftraege.forEach(a => {
            extractLegs(a).forEach((fahrt, idx) => {
                if (!fahrt.abfahrt) return;
                if (new Date(fahrt.abfahrt).getTime() >= now) return;
                if (fahrt.storniertStatus && fahrt.storniertStatus !== 'NICHT_STORNIERT') return;
                const isVerbundticket = !!fahrt.verbundCode;
                const gs = fahrt.gueltigkeitsstrecke || {};
                const kanals = fahrt.materialisierungsKanalNames || [];
                result.push(buildSyntheticTrip(a, fahrt, {
                    uuid:         fahrt.kundenwunschId || `${a.auftragsnummer}_${idx}`,
                    from:         fahrt.startort || gs.abgangsbahnhofName || null,
                    to:           fahrt.zielort  || gs.zielbahnhofName    || null,
                    pdfVerfuegbar: !isVerbundticket && !!(kanals.includes('WEB') || kanals.includes('BUCHUNG')),
                    leistungsklasse: fahrt.leistungsklasse || null,
                    klasse:       fahrt.leistungsklasse === 'KLASSE_1' ? 1 : 2,
                    isVerbundticket,
                    verbundCode:  fahrt.verbundCode || null
                }));
            });
        });
        result.sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));
        return result;
    }

    // =========================================================
    // 5) ICS download via /web/api/buchung/kalender
    // =========================================================
    async function downloadIcs(t) {
        try {
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
        const trip = (data.trips && data.trips[0]) || {};
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
    // 6) PDF download via /web/api/buchung/ticket
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

    // =========================================================
    // 7) Share link via /web/api/angebote/verbindung/teilen
    //    Uses fetchDetail cache — no duplicate round-trip if
    //    disruption details were already expanded for the same trip.
    // =========================================================
    async function getShareLink(t) {
        const data = await fetchDetail(t.uuid);
        // ctxRecon is at trips[0].ctxRecon in the detail response;
        // the share endpoint calls it "hinfahrtRecon" and also needs station names + departure (UTC)
        const trip0 = data.trips && data.trips[0];
        const ctxRecon = trip0 && trip0.ctxRecon;
        if (!ctxRecon) {
            console.error('[DBMRPP] getShareLink: root keys:', Object.keys(data),
                          'trips[0] keys:', trip0 ? Object.keys(trip0) : 'no trips');
            throw new Error('ctxRecon not found in detail response');
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
    // 8) Disruption detail — uses fetchDetail cache
    // =========================================================
    async function loadAbweichungMessages(t) {
        const data = await fetchDetail(t.uuid);
        const trip0 = (data.trips && data.trips[0]) || {};
        return [
            ...(trip0.himMeldungen         || []),
            ...(trip0.priorisierteMeldungen || []),
            ...(trip0.risNotizen           || [])
        ];
    }

    // =========================================================
    // 9) Reiseketten (journey-chain) simplify / merge
    // =========================================================
    function mergeAuftrag(t, info) {
        if (!info) return;
        Object.assign(t, info);
    }

    function simplify(r) {
        return {
            uuid:                    r.reisekettenUuid,
            typ:                     r.typ,
            fromReiseketten:         true,
            from:                    r.origin      && r.origin.name,
            to:                      r.destination && r.destination.name,
            departure:               r.origin      && r.origin.dateTime      && r.origin.dateTime.local,
            arrival:                 r.destination && r.destination.dateTime && r.destination.dateTime.local,
            departureTrack:          r.origin      && r.origin.track,
            arrivalTrack:            r.destination && r.destination.track,
            zugbindung:              r.auftrag && r.auftrag.zugbindung,
            auftragsnummer:          r.auftrag && r.auftrag.auftragsnummer,
            kundenwunschId:          r.auftrag && r.auftrag.kundenwunschId,
            leistungsbuendelId:      r.auftrag && r.auftrag.leistungsbuendelId,
            status:                  r.status,
            relevanteAbweichung:     !!r.relevanteAbweichung,
            alternativensuche:       r.alternativensuche,
            departureRt:             r.origin      && r.origin.rtDateTime      && r.origin.rtDateTime.local,
            arrivalRt:               r.destination && r.destination.rtDateTime && r.destination.rtDateTime.local,
            klasse:                  (r.einstiegsInformationen || []).some(e => e.leistungsKlasse === 'KLASSE_1') ? 1 : 2,
            zuege:                   (r.einstiegsInformationen || []).map(e => e.name).join(' → '),
            seats:                   collectSeats(r.einstiegsInformationen || []),
            ueberwacht:              r.ueberwacht !== undefined ? r.ueberwacht : null,
            umreserviert:            (r.einstiegsInformationen || []).some(
                                         e => e.umreserviert && e.umreserviert !== 'KEINE_UMPLATZIERUNG'),
            letzterReiseplanBearbeiter: r.letzterReiseplanBearbeiter || null
        };
    }

    function collectSeats(eis) {
        const seats = [];
        eis.forEach(ei => {
            (ei.wagen || []).forEach(w => {
                (w.zugeteiltePlaetze || []).forEach(p => {
                    const range = (p.bisPlatz && p.bisPlatz !== p.vonPlatz)
                        ? `${p.vonPlatz}–${p.bisPlatz}` : p.vonPlatz;
                    seats.push(`${ei.name} W${w.wagennummer} Pl.${range}`);
                });
            });
        });
        return seats.join('; ');
    }

    function diffSnapshots(prev, curr) {
        const out = { neu: [], entfernt: [], geaendert: [] };
        for (const uuid of Object.keys(curr)) {
            if (!prev[uuid]) {
                out.neu.push(curr[uuid]);
            } else {
                const c = curr[uuid], p = prev[uuid];
                const fld = DIFF_WATCHED
                    .filter(f => JSON.stringify(c[f]) !== JSON.stringify(p[f]))
                    .map(f => ({ field: f, old: p[f], new: c[f] }));
                if (fld.length) out.geaendert.push({ trip: c, changes: fld });
            }
        }
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const uuid of Object.keys(prev)) {
            if (!curr[uuid]) {
                const dep = prev[uuid].departure ? new Date(prev[uuid].departure).getTime() : 0;
                if (dep > cutoff) out.entfernt.push(prev[uuid]);
            }
        }
        return out;
    }

    // =========================================================
    // 10) Filter & export helpers
    // =========================================================
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
        if (fs.onlyChanges) {
            result = result.filter(t =>
                t.relevanteAbweichung ||
                t.alternativensuche === 'ALTERNATIVEN_MUSS' ||
                t.alternativensuche === 'ALTERNATIVEN_KANN' ||
                (t.storniertStatus && t.storniertStatus !== 'NICHT_STORNIERT') ||
                t.status === 'NICHT_REKONSTRUIERBAR' ||
                t.sitzplatzStorniert || t.stellplatzStorniert
            );
        }
        return result;
    }

    function currentUpcomingPool(trips) {
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
            t.letzterReiseplanBearbeiter || ''
        ]);
        const q = v => '"' + String(v).replace(/"/g, '""') + '"';
        const csv = [T.csvHeaders.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n');
        triggerDownload(
            new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
            `db-reisen-${new Date().toISOString().slice(0, 10)}.csv`
        );
    }

    // =========================================================
    // 11) Bulk ICS (client-side, no API calls)
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
            if (t.leistungsname)  descParts.push(t.leistungsname);
            if (t.zuege)          descParts.push(T.icsDescTrains(t.zuege));
            if (t.auftragsnummer) descParts.push(T.icsDescOrder(t.auftragsnummer));
            if (t.seats)          descParts.push(T.icsDescSeat(t.seats));
            if (t.zugbindung === 'AUFGEHOBEN') descParts.push(T.icsDescZugbindung);
            return [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART;TZID=Europe/Berlin:${dtstart}`,
                `DTEND;TZID=Europe/Berlin:${dtend}`,
                `SUMMARY:${icsEscape(`${t.from || '?'} → ${t.to || '?'}`)}`,
                descParts.length ? `DESCRIPTION:${icsEscape(descParts.join('\\n'))}` : '',
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
    // 12) Shared download helper
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

    function routeSlug(t) {
        return (t.from || 'Reise').replace(/[^a-z0-9]+/gi, '_')
             + '-' + (t.to || '').replace(/[^a-z0-9]+/gi, '_');
    }

    // =========================================================
    // 13) UI — FAB toggle + styles (injected once)
    // =========================================================
    function showPanel() {
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
            root.innerHTML = `<h2 style="margin:0;padding:10px 14px;background:#ec0016;color:#fff;font-size:14px">${esc(T.title)}<span style="font-weight:normal;font-size:12px;margin-left:8px">Loading…</span></h2>`;
            document.body.appendChild(root);
        } else {
            root.style.display = '';
        }
        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.classList.add('active');
    }

    function hidePanel() {
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
        fab.title = T.title;
        fab.innerHTML = '<span class="dbmrpp-fab-icon" aria-hidden="true">🚆</span><span class="dbmrpp-fab-plus" aria-hidden="true">++</span>';
        fab.addEventListener('click', togglePanel);
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
                        justify-content: space-between;
                        align-items: center;
                    }

                    #dbmrpp-root h2 button {
                        background: transparent;
                        border: 1px solid rgba(255,255,255,.6);
                        color: #fff;
                        padding: 2px 8px;
                        cursor: pointer;
                        border-radius: 3px;
                        margin-left: 4px;
                        font-size: 12px;
                    }

                    #dbmrpp-root h2 button:hover { background: rgba(255,255,255,.15); }
                    #dbmrpp-root h3 { margin: 0 0 8px; font-size: 13px; color: var(--dbmrpp-accent); }
                    #dbmrpp-root h4 { margin: 10px 0 4px; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: .04em; }

                    .dbmrpp-section { padding: 10px 14px; border-bottom: 1px solid #eee; }
                    .dbmrpp-changes { background: #fff5f5; }
                    .dbmrpp-changes-none { color: var(--dbmrpp-text-muted); font-style: italic; }
                    .dbmrpp-trip { padding: 6px 0; border-bottom: 1px dotted #e0e0e0; }
                    .dbmrpp-trip:last-child { border-bottom: none; }

                    .dbmrpp-route { font-weight: 600; }
                    .dbmrpp-route-link { color: #1a3a8a; text-decoration: none; }
                    .dbmrpp-route-link:hover { text-decoration: underline; }

                    .dbmrpp-action-icon {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 1.25em;
                        height: 1.25em;
                        margin-left: 2px;
                        font-size: 12px;
                        line-height: 1;
                        vertical-align: middle;
                        opacity: .6;
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

                    .dbmrpp-abweichung-msg { margin: 2px 0; line-height: 1.4; }
                    .dbmrpp-meta { color: var(--dbmrpp-text-muted); font-size: 11.5px; line-height: 1.4; }
                    .dbmrpp-meta-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #999; }

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
                    .dbmrpp-tag-info { background: #dde8ff; color: #1a3a8a; }

                    .dbmrpp-diff { margin: 2px 0 2px 12px; font-size: 11.5px; color: #333; }
                    .dbmrpp-diff-old { color: #888; text-decoration: line-through; }
                    .dbmrpp-diff-new { color: var(--dbmrpp-accent); font-weight: 600; }
                    .dbmrpp-delay { color: var(--dbmrpp-accent); font-weight: 600; }
                    .dbmrpp-early { color: #265c26; font-weight: 600; }

                    .dbmrpp-filter-bar {
                        display: grid;
                        gap: 6px;
                        padding: 6px 14px;
                        border-bottom: 1px solid #eee;
                        background: #fafafa;
                    }

                    .dbmrpp-filter-row {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }

                    .dbmrpp-filter-row-top .dbmrpp-select {
                        flex: 1;
                    }

                    .dbmrpp-filter-row-bottom {
                        justify-content: space-between;
                    }

                    .dbmrpp-select {
                        min-width: 110px;
                        padding: 3px 6px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        font-size: 12px;
                        background: #fff;
                        cursor: pointer;
                    }

                    .dbmrpp-day-btns { display: flex; gap: 3px; }

                    .dbmrpp-day-btn {
                        padding: 2px 7px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                        background: #fff;
                    }

                    .dbmrpp-day-btn.active { background: var(--dbmrpp-accent); color: #fff; border-color: var(--dbmrpp-accent); }

                    .dbmrpp-changes-toggle {
                        padding: 2px 8px;
                        border: 1px solid var(--dbmrpp-border);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                        background: #fff;
                        white-space: nowrap;
                    }

                    .dbmrpp-changes-toggle.active { background: #ffe9b3; border-color: #8a5a00; color: #8a5a00; }

                    .dbmrpp-view-tabs { display: flex; align-items: center; gap: 0; margin-bottom: 8px; border-bottom: 2px solid #eee; }

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
                    .dbmrpp-orphan { opacity: 0.55; }
                    .dbmrpp-orphan .dbmrpp-route-link { text-decoration: line-through; color: #888; }
                    .dbmrpp-orphans > summary { cursor: pointer; color: #888; font-size: 12px; margin-bottom: 4px; }

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
                        .dbmrpp-action-icon { font-size: 16px; width: 1.35em; height: 1.35em; opacity: .75; }
                        .dbmrpp-select { min-width: 130px; }
                        .dbmrpp-filter-row { flex-wrap: wrap; }
                        .dbmrpp-filter-row-top .dbmrpp-select { min-width: 120px; }
                        .dbmrpp-filter-row-bottom { justify-content: flex-start; }
                    }
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

        injectStyles();
        injectFab();
        lastRenderArgs = { trips, orphans, changes, lastVisit };

        const old = document.getElementById('dbmrpp-root');
        if (old) old.remove();

        const root = document.createElement('div');
        root.id = 'dbmrpp-root';
        root.innerHTML = buildHTML(trips, orphans, changes, lastVisit);
        // Panel starts hidden; showPanel() / togglePanel() reveals it
        root.style.display = panelVisible ? '' : 'none';
        document.body.appendChild(root);

        const fab = document.getElementById('dbmrpp-fab');
        if (fab) fab.classList.toggle('active', panelVisible);

        root.querySelector('.dbmrpp-close').addEventListener('click', hidePanel);
        root.querySelector('.dbmrpp-reset').addEventListener('click', () => {
            if (confirm(T.alertResetConfirm)) {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(LAST_VISIT_KEY);
                hidePanel();
                run(); // re-fetch with clean snapshot so diff starts fresh
            }
        });

        const getFilteredPool = () => {
            const pool = activeView === 'past' ? (pastTrips || []) : currentUpcomingPool(trips);
            return filterTrips(pool, filterState, activeView === 'past');
        };

        root.querySelector('.dbmrpp-ics-bulk').addEventListener('click', () => {
            const filtered = getFilteredPool();
            if (!filtered.length) { alert(T.alertNoTripsExport); return; }
            triggerDownload(
                new Blob([buildBulkIcs(filtered)], { type: 'text/calendar;charset=utf-8' }),
                `db-reisen-${new Date().toISOString().slice(0, 10)}.ics`
            );
        });
        root.querySelector('.dbmrpp-export').addEventListener('click', () => exportCsv(getFilteredPool()));
        root.querySelector('.dbmrpp-refresh').addEventListener('click', () => run());

        root.addEventListener('click', async (ev) => {
            const findTrip = uuid =>
                trips.find(x => x.uuid === uuid) ||
                (pastTrips || []).find(x => x.uuid === uuid) ||
                orphans.find(x => x.uuid === uuid);
            const icsLink = ev.target.closest('.dbmrpp-ics-link');
            if (icsLink) {
                ev.preventDefault();
                const trip = findTrip(icsLink.getAttribute('data-uuid'));
                if (trip) downloadIcs(trip);
                return;
            }
            const pdfLink = ev.target.closest('.dbmrpp-pdf-link');
            if (pdfLink) {
                ev.preventDefault();
                const trip = findTrip(pdfLink.getAttribute('data-uuid'));
                if (trip) downloadPdf(trip);
                return;
            }
            const shareBtn = ev.target.closest('.dbmrpp-share-btn');
            if (shareBtn) {
                ev.preventDefault();
                const trip = trips.find(x => x.uuid === shareBtn.getAttribute('data-uuid'));
                if (!trip) return;
                const origTitle = shareBtn.title;
                shareBtn.textContent = '⏳'; shareBtn.style.opacity = '1';
                try {
                    await navigator.clipboard.writeText(await getShareLink(trip));
                    shareBtn.textContent = '✓'; shareBtn.title = T.shareCopied;
                    setTimeout(() => { shareBtn.textContent = '⤴️'; shareBtn.title = origTitle; shareBtn.style.opacity = ''; }, 2000);
                } catch (err) {
                    console.error('[DBMRPP] Share-Fehler', err);
                    shareBtn.textContent = '⤴️'; shareBtn.style.opacity = '';
                    alert(T.shareError);
                }
                return;
            }
            const abwBtn = ev.target.closest('.dbmrpp-abweichung-btn');
            if (abwBtn) {
                ev.preventDefault();
                const trip = trips.find(x => x.uuid === abwBtn.getAttribute('data-uuid'));
                if (!trip) return;
                const tripDiv = abwBtn.closest('.dbmrpp-trip');
                const existing = tripDiv.querySelector('.dbmrpp-abweichung-detail');
                if (existing) { existing.remove(); return; }
                const detailDiv = document.createElement('div');
                detailDiv.className = 'dbmrpp-abweichung-detail';
                detailDiv.textContent = T.abweichungLoading;
                tripDiv.appendChild(detailDiv);
                try {
                    const msgs = await loadAbweichungMessages(trip);
                    if (!msgs.length) {
                        detailDiv.textContent = T.abweichungNone;
                    } else {
                        detailDiv.innerHTML = msgs.map(m =>
                            `<div class="dbmrpp-abweichung-msg">${esc(m.text || m.meldungsText || m.kopfText || JSON.stringify(m))}</div>`
                        ).join('');
                    }
                } catch (err) {
                    console.error('[DBMRPP] Abweichung-Fehler', err);
                    detailDiv.textContent = T.abweichungError;
                }
                return;
            }
        });

        const fromSel = root.querySelector('#dbmrpp-from-sel');
        if (fromSel) fromSel.addEventListener('change', e => { filterState.from = e.target.value; reRender(); });
        const toSel = root.querySelector('#dbmrpp-to-sel');
        if (toSel)   toSel.addEventListener('change',   e => { filterState.to   = e.target.value; reRender(); });
        root.querySelectorAll('.dbmrpp-day-btn').forEach(btn =>
            btn.addEventListener('click', () => { filterState.days = Number(btn.getAttribute('data-days')); reRender(); })
        );
        const changesToggle = root.querySelector('.dbmrpp-changes-toggle');
        if (changesToggle) changesToggle.addEventListener('click', () => { filterState.onlyChanges = !filterState.onlyChanges; reRender(); });
        root.querySelectorAll('.dbmrpp-view-tab').forEach(tab =>
            tab.addEventListener('click', () => {
                activeView = tab.getAttribute('data-view');
                if (activeView === 'past' && pastTrips === null && auftraegeCache) pastTrips = buildPastTrips(auftraegeCache);
                filterState.from = ''; filterState.to = '';
                reRender();
            })
        );
    }

    // =========================================================
    // 14) HTML builders
    // =========================================================
    function buildHTML(trips, orphans, changes, lastVisit) {
        const isPast = activeView === 'past';
        const sourcePool = isPast ? (pastTrips || []) : currentUpcomingPool(trips);
        const filtered    = filterTrips(sourcePool, filterState, isPast);
        const dayFiltered = filterTrips(sourcePool, { from: '', to: '', days: filterState.days, onlyChanges: false }, isPast);
        const fromOptions = [...new Set(
            dayFiltered.filter(t => !filterState.to   || t.to   === filterState.to).map(t => t.from).filter(Boolean)
        )].sort();
        const toOptions = [...new Set(
            dayFiltered.filter(t => !filterState.from || t.from === filterState.from).map(t => t.to).filter(Boolean)
        )].sort();
        const lastVisitTxt = lastVisit ? new Date(lastVisit).toLocaleString(DATE_LOCALE) : T.neverVisited;
        const hasChanges   = changes.neu.length || changes.geaendert.length || changes.entfernt.length;

        return `
        <h2>
          <span>${T.title}${hasChanges ? T.hasChanges : ''}</span>
          <span>
            <button class="dbmrpp-refresh" title="${T.ttReload}">↺</button>
            <button class="dbmrpp-ics-bulk" title="${T.ttIcsBulk}">📅 ICS</button>
            <button class="dbmrpp-export"   title="${T.ttCsv}">CSV</button>
            <button class="dbmrpp-reset"    title="${T.ttReset}">Reset</button>
            <button class="dbmrpp-close"    title="${T.ttClose}">×</button>
          </span>
        </h2>
        ${buildFilterBar(fromOptions, toOptions)}
        ${buildChangeBlock(changes, lastVisitTxt)}
        ${buildTripSection(filtered, sourcePool, orphans, isPast)}`;
    }

    function buildFilterBar(fromOptions, toOptions) {
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
          </div>
                    <div class="dbmrpp-filter-row dbmrpp-filter-row-bottom">
                        <div class="dbmrpp-day-btns">
                            ${[0, 7, 30, 90].map(d =>
                                    `<button class="dbmrpp-day-btn${filterState.days === d ? ' active' : ''}" data-days="${d}">${d === 0 ? T.dayAll : T.dayN(d)}</button>`
                            ).join('')}
                        </div>
                        <button class="dbmrpp-changes-toggle${filterState.onlyChanges ? ' active' : ''}">${T.onlyIssues}</button>
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
          ${changes.geaendert.map(renderChangedTrip).join('')}
          ${changes.neu.length    ? `<h4>${T.changesNew(changes.neu.length)}</h4>${changes.neu.map(renderTripLine).join('')}` : ''}
          ${changes.entfernt.length ? `<h4>${T.changesRemoved}</h4>${changes.entfernt.map(renderTripLine).join('')}` : ''}
        </div>`;
    }

    function buildTripSection(filtered, sourcePool, orphans, isPast) {
        const count = `${filtered.length}/${sourcePool.length}`;
        const empty = filtered.length !== sourcePool.length ? T.noTripsFilter : T.noTrips;
        return `
        <div class="dbmrpp-section">
          <div class="dbmrpp-view-tabs">
            <button class="dbmrpp-view-tab${!isPast ? ' active' : ''}" data-view="current">${T.tabUpcoming}</button>
            <button class="dbmrpp-view-tab${isPast  ? ' active' : ''}" data-view="past">${T.tabPast}</button>
            <span class="dbmrpp-view-count">${count}</span>
          </div>
          ${filtered.map(renderTripLine).join('') || `<em>${empty}</em>`}
        </div>
        ${orphans.length ? `
        <details class="dbmrpp-section dbmrpp-orphans">
          <summary>${T.orphansSection(orphans.length)}</summary>
          ${orphans.map(renderTripLine).join('')}
        </details>` : ''}`;
    }

    // =========================================================
    // 15) Trip rendering
    // =========================================================
    function buildDetailUrl(t) {
        const params = new URLSearchParams();
        if (t.auftragsnummer) params.set('auftragsnummer', t.auftragsnummer);
        if (t.uuid)           params.set('reisekettenuuid', t.uuid);
        const locale = location.pathname.match(/^(\/[a-z]{2})\//)?.[1] || '';
        return `${location.origin}${locale}/buchung/reise?${params.toString()}`;
    }

    function renderRouteLink(t) {
        return `<a class="dbmrpp-route-link" href="${esc(buildDetailUrl(t))}" target="_blank" rel="noopener noreferrer">${esc(t.from || '?')} → ${esc(t.to || '?')}</a>`;
    }

    function renderShareLink(t) {
        if (!t.fromReiseketten || t.isOrphaned) return '';
        return ` <a class="dbmrpp-share-btn dbmrpp-action-icon" href="#" data-uuid="${esc(t.uuid)}" title="${T.shareTooltip}">⤴️</a>`;
    }

    function renderAbweichungBtn(t) {
        if (!t.relevanteAbweichung || !t.fromReiseketten) return '';
        return ` <button class="dbmrpp-abweichung-btn dbmrpp-action-icon" data-uuid="${esc(t.uuid)}" title="${T.abweichungTooltip}">ℹ️</button>`;
    }

    function renderIcsLink(t) {
        if (t.isVerbundticket) return '';
        const ok = (t.typ === 'AUFTRAG' && t.auftragsnummer && t.nachname) || t.typ === 'FREI' || t.typ === 'WIEDERHOLEND';
        if (!ok) return '';
        return ` <a class="dbmrpp-ics-link dbmrpp-action-icon" href="#" data-uuid="${esc(t.uuid)}" title="${T.icsTooltip}">📅</a>`;
    }

    function renderPdfLink(t) {
        if (!t.pdfVerfuegbar || !t.leistungsbuendelId) return '';
        return ` <a class="dbmrpp-pdf-link dbmrpp-action-icon" href="#" data-uuid="${esc(t.uuid)}" title="${T.pdfTooltip}">🧾</a>`;
    }

    function delayTag(soll, ist) {
        if (!soll || !ist || soll === ist) return '';
        const min = Math.round((new Date(ist) - new Date(soll)) / 60000);
        if (min === 0) return '';
        return min > 0 ? `<span class="dbmrpp-delay"> +${min}'</span>` : `<span class="dbmrpp-early"> ${min}'</span>`;
    }

    function buildTripTags(t) {
        const tag = (cls, text) => `<span class="dbmrpp-tag ${cls}">${text}</span>`;
        const tags = [];
        if (t.klasse === 1)       tags.push(tag('dbmrpp-tag-info', T.tagClass1));
        if (t.isVerbundticket)    tags.push(tag('dbmrpp-tag-ok',   `${esc(T.tagRegionalTicket)}${t.verbundCode ? ' ' + esc(t.verbundCode) : ''}`));
        if (t.zugbindung === 'AUFGEHOBEN')               tags.push(tag('dbmrpp-tag-warn', T.tagZugbindung));
        if (t.status === 'NICHT_REKONSTRUIERBAR')        tags.push(tag('dbmrpp-tag-bad',  T.tagNotRecon));
        if (t.alternativensuche === 'ALTERNATIVEN_MUSS') tags.push(tag('dbmrpp-tag-bad',  T.tagMustRebook));
        if (t.alternativensuche === 'ALTERNATIVEN_KANN') tags.push(tag('dbmrpp-tag-info', T.tagAltPossible));
        if (t.relevanteAbweichung)                       tags.push(tag('dbmrpp-tag-warn', T.tagDisruption));
        if (t.letzterReiseplanBearbeiter === 'SYSTEM')   tags.push(tag('dbmrpp-tag-info', T.tagRerouted));
        if (t.umreserviert)                              tags.push(tag('dbmrpp-tag-warn', T.tagReassigned));
        if (t.ueberwacht === false)                      tags.push(tag('dbmrpp-tag-warn', T.tagMuted));
        if (t.typ === 'FREI')                            tags.push(tag('dbmrpp-tag-ok',   T.tagSaved));
        if (t.typ === 'WIEDERHOLEND')                    tags.push(tag('dbmrpp-tag-info', T.tagAbo));
        if (t.storniertStatus && t.storniertStatus !== 'NICHT_STORNIERT')
            tags.push(tag('dbmrpp-tag-bad',  esc(formatStorno(t.storniertStatus))));
        if (t.auftragStatus && t.auftragStatus !== 'ABGESCHLOSSEN' && t.typ === 'AUFTRAG')
            tags.push(tag('dbmrpp-tag-warn', esc(T.tagAuftragStatus(t.auftragStatus))));
        if (t.sitzplatzStorniert)  tags.push(tag('dbmrpp-tag-warn', T.tagSeatCancelled));
        if (t.stellplatzStorniert) tags.push(tag('dbmrpp-tag-warn', T.tagBikeCancelled));
        if (t.teilpreis)           tags.push(tag('dbmrpp-tag-info', T.tagPartFare));
        return tags;
    }

    function renderTripLine(t) {
        const d    = t.departure ? formatDateTime(t.departure) : '?';
        const a    = t.arrival   ? formatDateTime(t.arrival)   : '?';
        const tags = buildTripTags(t);
        return `
        <div class="dbmrpp-trip${t.isOrphaned ? ' dbmrpp-orphan' : ''}" data-uuid="${esc(t.uuid)}">
          <div class="dbmrpp-route">${renderRouteLink(t)}${renderShareLink(t)}${renderAbweichungBtn(t)}${renderIcsLink(t)}${renderPdfLink(t)}</div>
          <div class="dbmrpp-meta">
            ${t.isVerbundticket ? `<span class="dbmrpp-meta-label">${T.metaValidLabel}</span> ` : ''}${esc(d)}${delayTag(t.departure, t.departureRt)} – ${esc(a)}${delayTag(t.arrival, t.arrivalRt)}
            ${t.departureTrack && !t.isVerbundticket ? ` · ${T.metaPlatform} ${esc(t.departureTrack)}` : ''}
            ${t.leistungsname ? ` · <strong>${esc(t.leistungsname)}</strong>` : ''}
            ${t.cityTicket ? ` · CityTicket ${esc(t.cityTicket)}` : ''}
            ${t.reisende && t.reisende.length > 1 ? ` · ${T.metaPersons(t.reisende.length)}` : ''}
            ${t.zuege ? `<br>${esc(t.zuege)}` : ''}
            ${t.seats ? `<br>${esc(t.seats)}` : ''}
            ${t.auftragsnummer ? `<br>${T.metaOrder(esc(t.auftragsnummer))}` : ''}
            ${t.anlagedatum ? ` · ${T.metaBooked(esc(formatDate(t.anlagedatum)))}` : ''}
            ${t.gueltigVon && t.gueltigBis && !t.isVerbundticket ? `<br>${T.metaValidRange(esc(formatDate(t.gueltigVon)), esc(formatDate(t.gueltigBis)))}` : ''}
          </div>
          ${tags.length ? `<div>${tags.join('')}</div>` : ''}
        </div>`;
    }

    function renderChangedTrip(c) {
        const t = c.trip;
        return `
        <div class="dbmrpp-trip">
          <div class="dbmrpp-route">${renderRouteLink(t)}${renderIcsLink(t)}
            <span class="dbmrpp-meta">(${t.departure ? esc(formatDateTime(t.departure)) : '?'})</span>
          </div>
          ${c.changes.map(d => `
          <div class="dbmrpp-diff">
            <strong>${esc(T.fieldLabels[d.field] || d.field)}:</strong>
            <span class="dbmrpp-diff-old">${esc(formatVal(d.field, d.old))}</span>
            → <span class="dbmrpp-diff-new">${esc(formatVal(d.field, d.new))}</span>
          </div>`).join('')}
        </div>`;
    }

    function formatStorno(s) { return T.storno[s] || s; }

    function formatVal(field, v) {
        if (v === null || v === undefined || v === '') return '–';
        if (['departure','arrival','departureRt','arrivalRt'].includes(field)) return formatDateTime(v);
        if (typeof v === 'boolean') return v ? (IS_INT ? 'yes' : 'ja') : (IS_INT ? 'no' : 'nein');
        return String(v);
    }

    function formatDateTime(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString(DATE_LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
        );
    }
})();




