# EnyaqStrom – Hinweise für die Arbeit am Code

- Aufbau: `index.html` (HTML + kleine Früh-Skripte + Firebase-Modul), **App-Logik in `src/*.js`**, `sw.js` (Service Worker), `api/` + `lib/` (Vercel-Funktionen).
- **`app.js` ist generiert**: `src/*.js` werden in Namensreihenfolge unverändert zu einem Skript zusammengehängt (`npm run js`).
  Nie `app.js` direkt bearbeiten. Ein einziges Skript wie früher inline → Funktionen gelten dateiübergreifend, Reihenfolge = Dateiname.
- **Tailwind ist vorab gebaut** (`npm run css`, scannt `index.html` und `src/**/*.js`) → `app.css`.
- Nach Änderungen: `npm install` (einmalig), dann **`npm run make`** (js + css), `app.js`/`app.css` mit einchecken.
  Das Skript heißt bewusst nicht `build`: Vercel würde es sonst selbst ausführen und danach einen Ordner `public` erwarten → Deploy schlägt fehl.
  Danach in `index.html` (`/app.js?v=…`, `/app.css?v=…`) und `sw.js` (`SAME_ORIGIN_ASSETS`, `CACHE_VERSION`) die Version erhöhen.
- Klassen nur als vollständige Wörter schreiben (nicht per String zusammensetzen), sonst findet Tailwind sie nicht.
- `CACHE_VERSION` in `sw.js` bei jeder Auslieferung erhöhen.
- Bilder je Auto in Unterordnern: `Bilder/Enyaq/` (alles Enyaq-spezifische inkl. `hero/`), `Bilder/Epiq/` (Epiq1–2 + `hero/`, im Karussell beim Fahrzeugtyp Epiq über `CAR_HERO`; aufbereiten mit `python3 tools/epiq_bilder.py`, siehe LIESMICH.md).
  Gemeinsame Bilder (Icons, Wetter `wx/`, Statistik, Fahrzeugakte, Shortcuts) bleiben direkt in `Bilder/`.
- Karussell-Bilder auf Start: vorab aufbereitet in `Bilder/Enyaq/hero/` (weißer Rand entfernt, zugeschnitten, WebP 1100 px).
  Werte `aspect`/`extra` stehen in `HERO_IMGS` (src/05-startseite-banner.js). Bild 1 steht zusätzlich direkt im HTML und wird vorgeladen.
- Maßbilder (Enyaq7–9, Originale in `Bilder/Enyaq/`): mit `python3 tools/hero_masse.py` freistellen und Bemaßung hell umfärben → `Bilder/Enyaq/hero/7–9.webp`.
- Einfache Ansicht (Papa-Modus): Einstellung `ui: 'simple'` (Fahrzeug & Kauf → Ansicht), Logik in `src/17-einfach.js`, Ausblenden per CSS `html.simple …` in index.html; Drawer-Einträge mit `data-easy` bleiben sichtbar.
- Testkonto ohne Auto: in `SKODA_ACCOUNTS` `{"mail@gmail.com": {"demo": true}}` → `/api/vehicle` liefert feste Beispielwerte.
- Škoda-API-Schlüssel: in der App ersetzbar (verschlüsselt in `enyaqStrom/<uid>/settings/skoda`, siehe `lib/fs.js`, `lib/auth.js`); VIN/Freischaltung in `SKODA_ACCOUNTS`.
- Fahrtenbuch per Teilen-Menü (Android, installierte App): `share_target` in `manifest.json` → POST `/share-target` wird im `sw.js` abgefangen, Datei im Cache `enyaq-share` abgelegt, Weiterleitung auf `/?go=fb-share` → Import in `src/18-teilen.js`.
- Test-Screenshots nie im Repo-Ordner ablegen (Scratchpad nutzen).
- Voreinstellungen je Konto beim ersten Anmelden (Cloud noch leer): `USER_PRESETS` in `src/11-cloud-drive-sicherung.js`, Schlüssel = SHA-256 der E-Mail (Repo ist öffentlich, keine Adressen im Klartext).
- Onboarding beim allerersten Öffnen (Willkommen + Google-Anmeldung, 3 Fragen, Tour in der einfachen Ansicht): `src/19-onboarding.js`, Fortschritt in `enyaq.onb`. Einladungslink `/?auto=epiq` setzt das Auto schon vor der Anmeldung. Wer Daten hat, sieht es nicht.
