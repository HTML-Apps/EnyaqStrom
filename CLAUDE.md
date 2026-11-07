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
- Bilder je Auto in Unterordnern: `Bilder/Enyaq/` (alles Enyaq-spezifische inkl. `hero/`), `Bilder/Epiq/` (noch leer, siehe LIESMICH.md).
  Gemeinsame Bilder (Icons, Wetter `wx/`, Statistik, Fahrzeugakte, Shortcuts) bleiben direkt in `Bilder/`.
- Karussell-Bilder auf Start: vorab aufbereitet in `Bilder/Enyaq/hero/` (weißer Rand entfernt, zugeschnitten, WebP 1100 px).
  Werte `aspect`/`extra` stehen in `HERO_IMGS` (src/05-startseite-banner.js). Bild 1 steht zusätzlich direkt im HTML und wird vorgeladen.
- Maßbilder (Enyaq7–9, Originale in `Bilder/Enyaq/`): mit `python3 tools/hero_masse.py` freistellen und Bemaßung hell umfärben → `Bilder/Enyaq/hero/7–9.webp`.
- Škoda-API-Schlüssel: in der App ersetzbar (verschlüsselt in `enyaqStrom/<uid>/settings/skoda`, siehe `lib/fs.js`, `lib/auth.js`); VIN/Freischaltung in `SKODA_ACCOUNTS`.
