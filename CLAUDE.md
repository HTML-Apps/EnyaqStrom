# EnyaqStrom – Hinweise für die Arbeit am Code

- Eine Datei: `index.html` (App), `sw.js` (Service Worker), `api/` (Vercel-Funktionen).
- **Tailwind ist vorab gebaut** (kein CDN mehr): nach jeder Änderung an Klassen in `index.html`
  `npm install` (einmalig) und `npm run css` ausführen und `app.css` mit einchecken.
  Danach in `index.html` (`/app.css?v=…`) und `sw.js` (`SAME_ORIGIN_ASSETS`, `CACHE_VERSION`) die Version erhöhen.
- Klassen nur als vollständige Wörter schreiben (nicht per String zusammensetzen), sonst findet Tailwind sie nicht.
- `CACHE_VERSION` in `sw.js` bei jeder Auslieferung erhöhen.
- Karussell-Bilder auf Start: vorab aufbereitet in `Bilder/hero/` (weißer Rand entfernt, zugeschnitten, WebP 1100 px).
  Werte `aspect`/`extra` stehen in `HERO_IMGS` in `index.html`. Bei neuen Bildern beides neu erzeugen; Bild 1 steht zusätzlich direkt im HTML und wird vorgeladen.
- Maßbilder (Enyaq7–9, Originale in `Bilder/`): mit `python3 tools/hero_masse.py` freistellen und Bemaßung hell umfärben → `Bilder/hero/7–9.webp`.
