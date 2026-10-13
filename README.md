# Dorfflohmarkt Dudenhofen – Veröffentlichung und Installation

Dieses Paket enthält die aktuelle öffentliche Web-App einschließlich Manifest, Service Worker, Icons, Kartenpins und Supabase-Anbindung. Es ist direkt für GitHub Pages vorbereitet; ein Build oder ein eigener Webserver ist nicht nötig.

## Auf GitHub veröffentlichen

1. Entpacke `Dorfflohmarkt-PWA-GitHub.zip`.
2. Lege ein GitHub-Repository an oder öffne das vorhandene Repository der App.
3. Lade die entpackten Dateien in das Stammverzeichnis des Branches `main` hoch. `index.html`, `sw.js` und `manifest.webmanifest` müssen dort direkt liegen. Lade die Dateien hoch, nicht das ZIP und nicht einen zusätzlichen übergeordneten Ordner. Übernimm die Änderungen mit einem Commit.
4. Öffne **Settings → Pages**. Wähle unter **Build and deployment** die Quelle **Deploy from a branch**, dann **main** und **/ (root)**. Klicke auf **Save**.
5. Warte auf die Veröffentlichung und öffne die unter **Settings → Pages** angezeigte HTTPS-Adresse. Für eine Projektseite lautet sie gewöhnlich `https://<github-name>.github.io/<repository>/`.

Die relative Startadresse und der relative Geltungsbereich im Manifest passen sich dem Repository-Pfad an. Die enthaltene `.nojekyll`-Datei erlaubt die Auslieferung als statische Website.

Offizielle Anleitung: [GitHub Pages konfigurieren](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Als PWA installieren

- **Android mit Chrome:** Öffne die veröffentlichte HTTPS-Adresse. Nutze „App installieren“ in der App, sobald der Browser den Knopf anbietet, oder die Installationsoption im Browsermenü.
- **iPhone/iPad:** Öffne die HTTPS-Adresse in Safari. Wähle im Teilen-Menü „Zum Home-Bildschirm“ und bestätige mit „Hinzufügen“. Falls „Als Web-App öffnen“ angeboten wird, aktiviere es. [Anleitung von Apple](https://support.apple.com/de-de/guide/iphone/iphea86e5236/ios).
- **Computer mit Chrome oder Edge:** Nutze das Installationssymbol in der Adressleiste beziehungsweise die Installationsoption im Browsermenü.

Die Installation erfolgt von der veröffentlichten HTTPS-Website. Eine lokal per `file://` geöffnete HTML-Datei bietet diesen Installationsweg nicht. Die App startet nach der Installation in einem eigenen Fenster. Die Darstellung der Installationsoption hängt vom Browser ab.

Weitere Informationen: [Installierbare PWAs bei MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Bestehende Datenanbindung

Das Paket verwendet das bereits eingerichtete Supabase-Projekt. Alle Standdaten einschließlich der manuell angelegten Stände liegen in Supabase. Die drei zuvor eingebauten Stände wurden in die gemeinsame Datenbank übernommen. Anmeldungen, Adminzugang, Veranstaltungstermin und Geocodierung bleiben darüber verbunden. `supabase-config.js` enthält die öffentliche Projekt-URL und den öffentlichen Publishable Key. Der private Schlüssel für geocode.maps.co liegt ausschließlich in Supabase. Für Karte, Geocodierung, Anmeldungen und aktuelle Standdaten wird eine Internetverbindung benötigt.

## Spätere Aktualisierungen

Ersetze die geänderten App-Dateien im selben Repository und veröffentliche den Commit. Bei Änderungen an App-Dateien erhöhe die Versionsnummer von `CACHE_NAME` in `sw.js`, damit bereits installierte Apps den neuen Stand übernehmen. Dieses Paket verwendet Version `dorfflohmarkt-v35`.
