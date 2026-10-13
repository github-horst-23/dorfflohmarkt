# Dorfflohmarkt Dudenhofen

Installierbare Web-App für den Dorfflohmarkt in 67373 Dudenhofen. Die App wird als statische Website auf GitHub Pages veröffentlicht; HTTPS ist für die Installation als PWA erforderlich.

## Veröffentlichung auf GitHub Pages

1. Entpacke das ZIP und lade die enthaltenen Dateien in das Hauptverzeichnis eines GitHub-Repositories.
2. Öffne im Repository **Settings → Pages** und veröffentliche den Branch `main` aus dem Stammverzeichnis (`/root`).
3. Warte, bis GitHub Pages die Website unter `https://<account>.github.io/<repository>/` bereitgestellt hat.
4. Öffne die HTTPS-Adresse auf dem Smartphone. Android-Browser bieten „Installieren“ an; auf iPhone/iPad nutze im Teilen-Menü „Zum Home-Bildschirm“.

Die öffentliche Supabase-Projekt-URL und der Publishable Key sind in `supabase-config.js` eingetragen. Dieser Schlüssel ist für die Verwendung im Browser bestimmt. Füge dort niemals einen `service_role`-Key ein.

## Supabase einrichten

Für Anmeldungen und Freigaben muss das Supabase-Projekt erreichbar und eingerichtet sein:

1. Führe `supabase-setup.sql` einmal im Supabase SQL Editor aus. Bei einem bereits eingerichteten Projekt führe `supabase-event-settings.sql` und `supabase-privacy-hardening.sql` aus, damit der gemeinsame Veranstaltungstermin aktiviert und der öffentliche Datenzugriff auf Kartenfelder begrenzt wird.
2. Erstelle unter Supabase **Authentication → Users** einen Admin-Benutzer mit E-Mail und Passwort.
3. Erstelle aus `supabase-admin.sql` eine lokale Datei `supabase-admin.local.sql`, trage dort die Auth-UUID des Admins ein und führe diese lokale Datei im SQL Editor aus. `.gitignore` schließt die lokale Datei vom Git-Upload aus.
4. Trage die GitHub-Pages-URL in den URL-Einstellungen von Supabase Auth ein.

Anmeldungen landen zunächst privat im Status `pending`. Admins melden sich im App-Menü **Admin** an und geben Stände dort frei oder lehnen sie ab. Nur freigegebene Adresse und Angebotsdaten erscheinen öffentlich; Namen und E-Mail bleiben in der privaten Tabelle. Beim Start und wenn die App erneut geöffnet oder wieder online ist, lädt die App die aktuelle veröffentlichte Standliste aus Supabase. Zusätzlich werden Änderungen über Supabase Realtime sofort an geöffnete App-Instanzen übertragen. Beim Start prüft der Service Worker außerdem aktiv auf eine neue App-Version und lädt sie nach der Aktivierung neu.

Das Formular führt keine Geokodierung durch. Freigegebene Stände erscheinen deshalb in der Liste, erhalten jedoch erst dann einen eigenen Karten-Pin, wenn Koordinaten vorhanden sind.

## Lokal ansehen

Mit Python 3:

```sh
python3 -m http.server 8000
```

Dann `http://localhost:8000/` öffnen. Für Anmeldung und Adminbereich müssen Internetverbindung und eingerichtetes Supabase-Projekt verfügbar sein.
