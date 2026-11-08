/* =====================================================================
   Fahrtenbuch aus dem Teilen-Menü (Android, App auf dem Startbildschirm installiert)
   MyŠkoda → Fahrtenbuch → Export → Teilen → diese App. manifest.json („share_target“) schickt die CSV per POST an /share-target,
   der Service Worker legt sie im Cache „enyaq-share“ ab und öffnet /?go=fb-share. Hier wird sie abgeholt, wie über
   Einstellungen → Fahrtenbuch importiert (doppelte Fahrten werden übersprungen) und das Ergebnis unten auf Start gemeldet.
   ===================================================================== */
function fbToast(title, sub, ok, go) {
  const old = $('fb-toast'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'fb-toast'; el.setAttribute('role', 'status');
  el.className = 'fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-3 py-2.5 text-white shadow-2xl '
    + (ok ? 'border-emerald-600 bg-emerald-950' : 'border-amber-600 bg-amber-950');
  el.innerHTML = `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ok ? 'bg-emerald-600' : 'bg-amber-600'}"><svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${ok ? '<path d="M5 12.5l4.5 4.5L19 7"/>' : '<path d="M12 7v6M12 17h.01"/>'}</svg></span>
    <span class="min-w-0 flex-1"><span class="block truncate text-sm font-bold">${esc(title)}</span><span class="block truncate text-xs ${ok ? 'text-emerald-200' : 'text-amber-200'}">${esc(sub)}</span></span>
    ${go ? '<button type="button" data-fbt="go" class="shrink-0 px-1 text-[13px] font-semibold text-emerald-300 active:opacity-70">Ansehen</button>' : ''}<button type="button" data-fbt="x" aria-label="Schließen" class="shrink-0 px-1 text-lg leading-none opacity-70">×</button>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-fbt]'); if (!b) return; el.remove(); if (b.dataset.fbt === 'go') NAV_GO.trips(); });
  document.body.appendChild(el); setTimeout(() => { if (el.isConnected) el.remove(); }, 9000);
}
/** Fehlersuche: zeigen, was beim Teilen angekommen ist (Feldnamen, Dateityp, Größe), lesbar und kopierbar */
async function fbSwState() {
  try { const ks = (await caches.keys()).filter(k => /^enyaq-v/.test(k)).join(', '), r = await navigator.serviceWorker.getRegistration(), st = (w) => w ? w.state : '–';
    return 'App-Version: ' + ((document.querySelector('script[src^="/app.js"]') || {}).src || '').split('v=')[1] + ' · Hintergrund (Cache): ' + (ks || '–') + ' · aktiv: ' + st(r && r.active) + ', wartet: ' + st(r && r.waiting) + ', lädt: ' + st(r && r.installing);
  } catch (e) { return 'Status unbekannt'; }
}
/** Service Worker von Hand aktualisieren und Ergebnis bzw. Fehler anzeigen (Samsung Internet blieb auf einer alten Version stehen) */
async function fbSwUpdate(pre, btn) {
  btn.disabled = true; btn.textContent = 'Wird aktualisiert …'; const log = (t) => { pre.textContent += '\n' + t; pre.scrollTop = pre.scrollHeight; };
  try {
    const r = await navigator.serviceWorker.getRegistration(); if (!r) { log('Keine Registrierung gefunden'); return; }
    log('Script: ' + ((r.active || r.installing || r.waiting || {}).scriptURL || '–'));
    try { await r.update(); log('update() ausgeführt'); } catch (e) { log('update()-Fehler: ' + (e && e.message || e)); }
    const w = r.installing || r.waiting; if (w) { log('neue Version: ' + w.state); await new Promise(ok => { const t = setTimeout(ok, 8000); w.addEventListener('statechange', () => { log('→ ' + w.state); if (w.state === 'activated' || w.state === 'redundant') { clearTimeout(t); ok(); } }); }); }
    else log('keine neue Version gefunden');
    log(await fbSwState());
  } catch (e) { log('Fehler: ' + (e && e.message || e)); } finally { btn.disabled = false; btn.textContent = 'Hintergrund aktualisieren'; }
}
function fbShareDbg(dbg, sw) {
  const txt = (sw ? sw + '\n' : '') + (dbg ? ['Inhalt: ' + (dbg.ct || '–'), ...(dbg.keys && dbg.keys.length ? dbg.keys : ['keine Felder']), dbg.err ? 'Fehler: ' + dbg.err : '', dbg.body ? 'Daten: ' + dbg.body : ''].filter(Boolean).join('\n') : 'Keine Angaben vom Service Worker (alte Version aktiv? App einmal schließen und neu öffnen).');
  const el = document.createElement('div'); el.id = 'fb-dbg'; el.className = 'fixed inset-0 z-[90] flex items-end bg-black/60 p-3';
  el.innerHTML = `<div class="mx-auto w-full max-w-md rounded-3xl bg-slate-900 p-4 text-white shadow-2xl"><p class="text-base font-bold">Keine Datei angekommen</p><p class="mt-1 text-sm text-slate-300">Das hat das Teilen-Menü geschickt – bitte als Screenshot an Claude:</p>
    <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/50 p-2.5 text-left text-[11.5px] leading-snug text-amber-200">${esc(txt)}</pre>
    <button type="button" data-dbg="upd" class="mt-3 h-11 w-full rounded-2xl bg-sky-600 text-sm font-semibold">Hintergrund aktualisieren</button>
    <div class="mt-2 flex gap-2"><button type="button" data-dbg="copy" class="h-11 flex-1 rounded-2xl bg-slate-700 text-sm font-semibold">Kopieren</button><button type="button" data-dbg="x" class="h-11 flex-1 rounded-2xl bg-emerald-600 text-sm font-semibold">Schließen</button></div></div>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-dbg]'); if (!b) return; if (b.dataset.dbg === 'upd') { fbSwUpdate(el.querySelector('pre'), b); return; }
    if (b.dataset.dbg === 'copy') { try { navigator.clipboard.writeText(el.querySelector('pre').textContent); b.textContent = 'Kopiert ✓'; } catch (er) { } return; } el.remove(); });
  document.body.appendChild(el);
}
async function fbShareImport() {
  if (!window.fbSharePending) return; window.fbSharePending = false;
  let r = null; try { const c = await caches.open('enyaq-share'); r = await c.match('/share-file'); if (r) await c.delete('/share-file'); } catch (e) { }
  let dbg = null; try { const c = await caches.open('enyaq-share'), d = await c.match('/share-debug'); if (d) { dbg = await d.json(); localStorage.setItem('enyaq.lastShareDbg', JSON.stringify(dbg)); } } catch (e) { }
  if (!r) { fbShareDbg(dbg, await fbSwState()); try { const g = await navigator.serviceWorker.getRegistration(); if (g) g.update(); } catch (e) { } return; }
  const name = (() => { try { return decodeURIComponent(r.headers.get('x-name') || '') || 'fahrtenbuch.csv'; } catch (e) { return 'fahrtenbuch.csv'; } })();
  const blob = await r.blob(), file = new File([blob], name, { type: blob.type || 'text/csv' });
  try { localStorage.setItem('enyaq.lastShare', JSON.stringify({ at: new Date().toISOString(), name, type: blob.type || '' })); } catch (e) { }   // Fehlersuche: Dateityp, den MyŠkoda liefert
  for (let i = 0; i < 10 && !(window.cloud && window.cloud.isSignedIn && window.cloud.isSignedIn()); i++) await new Promise(ok => setTimeout(ok, 200));   // kurz auf die Anmeldung warten, damit gleich in die Cloud geschrieben wird
  const res = await importTrips(file);
  if (!res || !res.ok) { fbToast('Fahrtenbuch nicht importiert', ((res && res.err) || name) + (blob.type ? ' (' + blob.type + ')' : ''), false); return; }
  const span = (() => { const ts = (res.parsed || []).map(t => Date.parse(t.s)).filter(Number.isFinite); if (!ts.length) return ''; const d = (x) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); return d(Math.min(...ts)) + ' – ' + d(Math.max(...ts)); })();
  if (!res.fresh && !res.changed) fbToast('Schon alles da', 'Alle ' + res.n + ' Fahrten aus ' + name + ' sind bereits importiert.', true, true);
  else fbToast(res.fresh + (res.fresh === 1 ? ' Fahrt' : ' Fahrten') + ' importiert', [span, res.changed ? res.changed + ' aktualisiert' : '', res.n - res.fresh - res.changed > 0 ? (res.n - res.fresh - res.changed) + ' doppelte übersprungen' : ''].filter(Boolean).join(' · '), true, true);
}
fbShareImport();
