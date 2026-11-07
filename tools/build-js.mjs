// Baut app.js aus den Quelldateien in src/ (in Namensreihenfolge, unverändert aneinandergehängt).
// Ein einziges Skript wie früher inline in index.html: Funktionsdeklarationen gelten dateiübergreifend, die Reihenfolge bleibt gleich.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const files = readdirSync('src').filter(f => f.endsWith('.js')).sort();
let out = '// GENERIERT aus src/*.js – nicht direkt bearbeiten, sondern src/ ändern und `npm run js` ausführen.\n';
for (const f of files) out += `\n// ───── src/${f} ─────\n` + readFileSync('src/' + f, 'utf8');
writeFileSync('app.js', out);
console.log('app.js aus ' + files.length + ' Dateien, ' + (out.length / 1024).toFixed(0) + ' KB');
