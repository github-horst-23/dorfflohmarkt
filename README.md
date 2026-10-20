# Dorfflohmarkt Dudenhofen – Veröffentlichung und Installation

Dieses Paket enthält die aktuelle öffentliche Web-App einschließlich Manifest, Service Worker, Icons, Kartenpins und Supabase-Anbindung. Es ist direkt für GitHub Pages vorbereitet; ein Build oder ein eigener Webserver ist nicht nötig.

Das beiliegende `Dorfflohmarkt-Benutzerhandbuch.pdf` beschreibt alle Besucher-, Anmelde- und Adminfunktionen.

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

Das Paket verwendet das bereits eingerichtete Supabase-Projekt. Alle Standdaten einschließlich der manuell angelegten Stände liegen in Supabase. Die drei zuvor eingebauten Stände wurden in die gemeinsame Datenbank übernommen. Anmeldungen, Adminzugang, Veranstaltungstermin und Geocodierung bleiben darüber verbunden. `supabase-config.js` enthält die öffentliche Projekt-URL und den öffentlichen Publishable Key. Der private HERE-Schlüssel liegt ausschließlich als Supabase-Secret `HERE_API_KEY` vor. Für Karte, Geocodierung, Anmeldungen und aktuelle Standdaten wird eine Internetverbindung benötigt.

## Favoritenroute

„Route planen“ fragt den aktuellen Standort ab und optimiert alle favorisierten Stände anhand von Fußwegen des FOSSGIS-Dienstes `routing.openstreetmap.de`. Internet, HTTPS und Standortfreigabe sind erforderlich. `routing-client.js` muss mit veröffentlicht werden. Bis 16 Stopps wird exakt optimiert, darüber mit einer gekennzeichneten Näherung; maximal 99 Favoriten pro Planung. Das Ergebnis enthält alle Stopps und Navigationslinks. Gerätestandorte werden nicht in Supabase gespeichert. Für die Routenberechnung ist kein zusätzlicher API-Schlüssel erforderlich.

## Spätere Aktualisierungen

Unter **Admin → Neue Anmeldungen annehmen** lässt sich die öffentliche Anmeldung für alle Geräte öffnen und schließen. Bei geschlossener Anmeldung erscheint ein Hinweis. Admins können weiterhin Stände manuell anlegen. Die Einstellung und die Sperre beim Speichern werden in Supabase verwaltet.

Unter **Admin → Nachzügler-Tokens** werden bei geschlossener Anmeldung einmalige Tokens erzeugt. Der Empfänger gibt den Token im Anmeldebereich ein; erst eine erfolgreich gespeicherte Anmeldung verbraucht ihn. Der Anmeldestatus wird per Realtime übertragen, bei Wiederverbindung neu geladen und zusätzlich in sichtbaren Apps alle fünf Minuten abgefragt.

Der Überblick unter der Karte zeigt Stände, Verpflegung, Favoriten und die häufigsten Warengruppen für die aktuelle Suche und Filterauswahl.

Ersetze die geänderten App-Dateien im selben Repository und veröffentliche den Commit. Bei Änderungen an App-Dateien erhöhe die Versionsnummer von `CACHE_NAME` in `sw.js`, damit bereits installierte Apps den neuen Stand übernehmen. Dieses Paket verwendet Version `dorfflohmarkt-v87`.


Lade beim Aktualisieren sämtliche entpackten ZIP-Dateien in dasselbe Stammverzeichnis hoch, einschließlich `routing-client.js` und der versteckten Datei `.nojekyll`. Unter **Settings → Pages** bleibt die Quelle **Deploy from a branch**, Branch **main**, Ordner **/ (root)**. Das ZIP selbst ist kein Pages-Artefakt zum direkten Veröffentlichen.

Neue App-Versionen werden nach vollständigem Laden mit einem Hinweis angeboten: **Jetzt aktualisieren** aktiviert die Version und lädt die Seite neu, **Später** verschiebt dies. Die bisherige Version bleibt bis dahin aktiv. Standdaten werden unabhängig davon beim Start und bei Netzrückkehr automatisch aus Supabase geladen. Der Hinweis funktioniert auf der veröffentlichten HTTPS-Seite mit Service Worker, nicht bei `file://`. `app.js?update-notice=1` und `style.css?update-notice=1` in der HTML-Datei ermöglichen den Übergang von älteren App-Caches; im ZIP liegen die Dateien wie gewohnt ohne Fragezeichen im Namen. Bei älteren App-Versionen ohne diesen Hinweis kann einmaliges Schließen aller App-Fenster und erneutes Öffnen nötig sein.

Nach „Später“ bleibt bei verfügbarem Update im Hamburgermenü **App aktualisieren** mit einem gelben Punkt sichtbar. Dieser Eintrag öffnet den Update-Hinweis erneut; erst „Jetzt aktualisieren“ lädt neu.


## Voraussetzungen ab Version 72

Vor Veröffentlichung im bestehenden Supabase-Projekt `supabase-app-administration.sql` aus dem Projektordner nach den bisherigen Anmelde-, Token- und Abmelde-Erweiterungen ausführen. Das Script richtet die Aktiv-/Inaktiv-Steuerung und die zweistufige Sammellöschung ein; es führt keine Löschung aus. Danach die aktualisierte Edge Function `geocode-stands` bereitstellen, damit auch Positionsanfragen die Pausierung beachten. Die SQL-Dateien und Backendquellen sind bewusst nicht im öffentlichen ZIP enthalten.

Die Karte beginnt wieder in der Straßenansicht und bleibt beim Start auf Dudenhofen zentriert.


Die regelmäßigen Supabase-Abfragen für Einstellungen, Standdaten und Adminzähler erfolgen bei sichtbarer App alle fünf Minuten. Beim Start, Wiederverbinden und manuellen Aktualisieren werden Daten weiterhin sofort geladen. Realtime-Nachrichten übernehmen Änderungen weiterhin direkt. Bei der Sammellöschung werden fehlende Serverfunktionen, fehlende Adminrechte, geänderte Daten und abgelaufene Bestätigungen getrennt gemeldet.


## Korrektur der Sammellöschung ab Version 76

Bei „DELETE requires a WHERE clause“ einmal supabase-delete-all-where-fix.sql im Supabase SQL Editor ausführen. Es ersetzt nur die Serverfunktion und löscht beim Einspielen keine Daten. Keine Änderung an Edge Functions nötig.


## HERE-Geocodierung ab Version 81

Vor der App-Veröffentlichung im Supabase SQL Editor die aktuelle `supabase-geocoding.sql` ausführen. Danach das Secret `HERE_API_KEY` setzen und die beiden Dateien der Edge Function `geocode-stands` neu bereitstellen. Erst anschließend Version 81 veröffentlichen. Die frühere Migration für dauerhafte Koordinaten wird nicht mehr verwendet.

Bestehende Koordinaten anderer Anbieter werden beim Wechsel verworfen und automatisch durch genaue HERE-Hauspositionen ersetzt. Gültige Treffer werden nicht bei jedem Laden erneut gesucht. App und Server erneuern sie nach 29 Tagen als Sicherheitspuffer vor der 30-Tage-Grenze. Der Supabase-Cronjob `expire-here-stand-geocoding` bereinigt abgelaufene Werte; beim nächsten App-Start, bei Netzrückkehr oder beim Fünf-Minuten-Abgleich werden sie erneut angefragt.


## E-Mail-Bestätigung ab Version 87

Vor der Veröffentlichung zuerst `supabase-email-confirmation.sql` im Supabase SQL Editor ausführen. Danach die Edge Function `registration-email` aus `supabase/functions/registration-email/index.ts` bereitstellen. In den Supabase-Secrets `STRATO_SMTP_USER` auf `donotreply@dudenhofen.org`, `STRATO_SMTP_PASSWORD` auf das Postfachpasswort und `PUBLIC_APP_URL` auf `https://www.dorfflohmarkt-dudenhofen.de` setzen. Optional bleiben `STRATO_SMTP_HOST=smtp.strato.de` und `STRATO_SMTP_PORT=465`; ohne diese Secrets gelten diese sicheren Standardwerte. Das Passwort niemals in App-Dateien, SQL, GitHub oder dieses Dokument schreiben.

Neue öffentliche Anmeldungen erhalten zunächst den internen Status `awaiting_email`. Erst der gültige Einmallink macht sie als offene Anmeldung sichtbar. Unbestätigte Einträge werden nach fünf Tagen durch einen Supabase-Cronjob gelöscht. Die Migration sperrt ältere direkte Browseraufrufe, damit die Bestätigung nicht umgangen werden kann. Daher müssen Datenbankmigration, Edge Function und Version 87 gemeinsam veröffentlicht werden.
