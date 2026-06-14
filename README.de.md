[English](README.md)

# DB Meine Reisen++

Ein Userscript, das die Deutsche-Bahn-Seite „Meine Reisen" mit einer besseren Übersicht, Änderungsverfolgung und Datenexport erweitert.

![Screenshot](screenshot.png)

## Funktionen

**Vollständige Reiseübersicht**
- Zeigt alle Reisen (bevorstehende und vergangene) in einer Liste ohne Seitenumbrüche
- Zeigt Gleis, Ticketkategorie und Sitzplatzreservierungen direkt in der Liste — ohne jede Fahrt einzeln öffnen zu müssen
- Optionale Links zu externen Zuginfo- und Routingseiten (z. B. zugfinder.net, bahn.expert)

**Änderungsverfolgung**
- Vergleicht Reisen zwischen Besuchen und hebt Änderungen hervor: Verspätungen, Ausfälle, Umleitungen, Gleisänderungen, Zugbindung

**Details vergangener Reisen**
- Reichert vergangene Reisen optional mit Informationen aus früheren Besuchen an (Betriebsstatus, Verspätungen, Sitzplatzinfos u. a.)
- Diese Daten werden nur im Browser gespeichert und bauen sich mit der Zeit auf

**Datenexport**
- Export als Kalenderformat (ICS)
- Export aller Reisen als CSV-Tabelle
- PDF-Tickets direkt herunterladen
- Routen als GPX oder GeoJSON exportieren
- Rohdaten einzelner Reisen als JSON herunterladen
- Einstellungen und Änderungsverlauf als Bundle exportieren/importieren

**Filtern**
- Nach Abfahrts- oder Zielbahnhof filtern
- Nach Zeitraum filtern (letzte 7 / 30 / 90 Tage oder alle)
- Nur Reisen mit Problemen anzeigen
- Nach Tags und Indikatoren filtern
- Getrennte Tabs für bevorstehende und vergangene Reisen

**Tags & Indikatoren**
- Erste Klasse
- Umstieg erforderlich
- Zugbindung
- Abo-Fahrten
- Stornierte Sitzplatz- oder Fahrradreservierungen
- Störungen
- Stummgeschaltete Reisewarnungen
- Eigene Tags

**Deutsch & Englisch**
- Deutsch auf bahn.de, Englisch auf int.bahn.de

---

## Installation

1. **Userscript-Manager installieren**, z. B. [Tampermonkey](https://tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/) oder [Greasemonkey](https://www.greasespot.net/)

2. **Script installieren:** [DB Meine Reisen++ installieren](https://raw.githubusercontent.com/Jo11n/db-meine-reisen-plus-plus/main/db-meine-reisen-plus-plus.user.js) — der Userscript-Manager fragt zur Bestätigung

3. **Öffnen:** [bahn.de/meine-reisen](https://www.bahn.de/meine-reisen) aufrufen und auf den schwebenden 🚆++-Button unten rechts klicken

---

## Datenschutz & Sicherheit

**Inoffiziell — Nutzung auf eigene Verantwortung.**

- Läuft vollständig im Browser; keine Daten verlassen das Gerät
- Nutzt ausschließlich die APIs der Deutschen Bahn (dieselben, die die Website selbst verwendet)
- Kein Tracking, keine Drittanbieter-Server
- Alle Snapshots und Einstellungen werden lokal im Browser gespeichert

---

## Einschränkungen

- **Nur lesend** — das Script nimmt keine Buchungen vor und ändert nichts am Konto
- **Änderungsverfolgung ohne Garantie** — es werden nur Änderungen erkannt, die die DB-API preisgibt; manche Änderungen können unbemerkt bleiben
- **Browserbezogen** — gespeicherte Daten bleiben im jeweiligen Browser; ein Browserwechsel beginnt von vorne. bahn.de und int.bahn.de teilen keine Daten automatisch (Export/Import-Bundle zur Übertragung nutzen)
- **Details vergangener Reisen bauen sich auf** — standardmäßig deaktiviert; zeigt nur Daten aus bereits gemachten Besuchen
- **Nicht alle Tickettypen oder Flags werden erkannt** — da die API undokumentiert ist, können ungewöhnliche Fälle übersehen werden
- **Externe Links haben Ausnahmen** — Zugnummer- und Routing-Links funktionieren nicht immer zuverlässig
- **Nicht für Mobilgeräte optimiert** — das Panel kann auf kleinen Bildschirmen unfertig wirken

---

## Feedback & Probleme

[Fehler melden oder Feature vorschlagen](https://github.com/Jo11n/db-meine-reisen-plus-plus/issues)

## Lizenz

[MIT-Lizenz](LICENSE)
