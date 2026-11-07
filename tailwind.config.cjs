/* Tailwind wird nicht mehr im Browser erzeugt (CDN), sondern vorab als app.css gebaut:  npm run css
   Nach Änderungen an Klassen in index.html neu bauen und app.css mit einchecken. */
module.exports = { content: ['./index.html'], darkMode: 'media' };
