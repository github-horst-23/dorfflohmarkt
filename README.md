# Dorfflohmarkt Dudenhofen – Veröffentlichung

Dieses Paket enthält die direkt auslieferbare Web-App mit Manifest, Service Worker, Kartenassets, Supabase-Anbindung und Bedienungsanleitung. Ein Buildschritt ist nicht nötig.

## Auf GitHub Pages veröffentlichen

1. `Dorfflohmarkt-PWA-GitHub.zip` entpacken.
2. Alle enthaltenen Dateien in das Stammverzeichnis des vorhandenen GitHub-Repositories hochladen. `index.html`, `sw.js` und `manifest.webmanifest` müssen direkt im Stamm liegen.
3. Die Änderungen im Branch `main` übernehmen.
4. Unter **Settings → Pages** weiterhin **Deploy from a branch**, `main` und `/ (root)` verwenden.
5. Nach der Veröffentlichung die HTTPS-App öffnen und den angebotenen App-Stand aktualisieren.

Das ZIP selbst wird nicht als einzelne Datei veröffentlicht. Die versteckte Datei `.nojekyll` gehört ebenfalls in das Repository.

Dieses Paket verwendet den Service-Worker-Cache **dorfflohmarkt-v96**. Ein vollständig geladener neuer Stand erscheint in der App als Updatehinweis. **Jetzt aktualisieren** aktiviert ihn; **Später** lässt die bisherige Version geöffnet und hält den Menüpunkt **App aktualisieren** bereit.

## Datenbank und Backend

Das veröffentlichte Paket verwendet das bestehende Supabase-Projekt. SQL-Dateien und Edge-Function-Quellen sind bewusst nicht im öffentlichen ZIP enthalten.

Für eine vollständige Neueinrichtung dient im privaten Projektordner ausschließlich `supabase-setup.sql`. Die HERE-Geocodierung verwendet zusätzlich die bereitgestellte Edge Function `geocode-stands` und das Supabase-Secret `HERE_API_KEY`. Private Schlüssel, Adminzuordnungen und vertrauliche Exporte dürfen nie in das GitHub-Repository gelangen.

Vorhandene Koordinaten werden mit Anbieter und Zeitpunkt gespeichert. Gültige HERE-Treffer bleiben 29 Tage bestehen und werden erst danach erneuert. Die App lädt Standdaten und Einstellungen beim Start, bei Netzrückkehr, per Realtime und während sichtbarer Nutzung spätestens nach fünf Minuten erneut.

## Als App installieren

- **Android/Chrome:** HTTPS-App öffnen und **App installieren** wählen.
- **iPhone/iPad:** In Safari über **Teilen → Zum Home-Bildschirm** hinzufügen.
- **Computer:** Installationssymbol in Chrome oder Edge verwenden.

Eine per `file://` geöffnete Datei unterstützt Installation, Service Worker und Updates nicht vollständig.

## Prüfung nach der Veröffentlichung

1. Karte und Standliste öffnen und Daten aktualisieren.
2. Suche, Filter, Standdetails und Favoriten prüfen.
3. Im Adminbereich Einstellungen und Aufgabenzähler laden.
4. Bei pausierter App den Inaktiv-Hinweis und den Countdown-Schalter prüfen.
5. Keine echten Anmeldungen oder Löschungen allein für einen Funktionstest ausführen.

Die lokale Datei `TESTBERICHT.md` dokumentiert automatisierte und bereits ausgeführte Live-Prüfungen.
