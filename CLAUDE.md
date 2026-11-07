# EnyaqStrom – Hinweise für die Arbeit am Code

- Eine Datei: `index.html` (App), `sw.js` (Service Worker), `api/` (Vercel-Funktionen).
- **Tailwind ist vorab gebaut** (kein CDN mehr): nach jeder Änderung an Klassen in `index.html`
  `npm install` (einmalig) und `npm run css` ausführen und `app.css` mit einchecken.
  Danach in `index.html` (`/app.css?v=…`) und `sw.js` (`SAME_ORIGIN_ASSETS`, `CACHE_VERSION`) die Version erhöhen.
- Klassen nur als vollständige Wörter schreiben (nicht per String zusammensetzen), sonst findet Tailwind sie nicht.
- `CACHE_VERSION` in `sw.js` bei jeder Auslieferung erhöhen.
