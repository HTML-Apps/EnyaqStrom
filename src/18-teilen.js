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
async function fbShareImport() {
  if (!window.fbSharePending) return; window.fbSharePending = false;
  let r = null; try { const c = await caches.open('enyaq-share'); r = await c.match('/share-file'); if (r) await c.delete('/share-file'); } catch (e) { }
  if (!r) { fbToast('Keine Datei angekommen', 'Bitte in MyŠkoda erneut exportieren und teilen.', false); return; }
  const name = (() => { try { return decodeURIComponent(r.headers.get('x-name') || '') || 'fahrtenbuch.csv'; } catch (e) { return 'fahrtenbuch.csv'; } })();
  const blob = await r.blob(), file = new File([blob], name, { type: blob.type || 'text/csv' });
  for (let i = 0; i < 10 && !(window.cloud && window.cloud.isSignedIn && window.cloud.isSignedIn()); i++) await new Promise(ok => setTimeout(ok, 200));   // kurz auf die Anmeldung warten, damit gleich in die Cloud geschrieben wird
  const res = await importTrips(file);
  if (!res || !res.ok) { fbToast('Fahrtenbuch nicht importiert', (res && res.err) || name, false); return; }
  const span = (() => { const ts = (res.parsed || []).map(t => Date.parse(t.s)).filter(Number.isFinite); if (!ts.length) return ''; const d = (x) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); return d(Math.min(...ts)) + ' – ' + d(Math.max(...ts)); })();
  if (!res.fresh && !res.changed) fbToast('Schon alles da', 'Alle ' + res.n + ' Fahrten aus ' + name + ' sind bereits importiert.', true, true);
  else fbToast(res.fresh + (res.fresh === 1 ? ' Fahrt' : ' Fahrten') + ' importiert', [span, res.changed ? res.changed + ' aktualisiert' : '', res.n - res.fresh - res.changed > 0 ? (res.n - res.fresh - res.changed) + ' doppelte übersprungen' : ''].filter(Boolean).join(' · '), true, true);
}
fbShareImport();
