/* =====================================================================
   Fehlerprotokoll (Einstellungen › Cloud-Sync): Das Früh-Skript im <head> sammelt unerwartete Fehler in enyaq.errs.
   Hier: Anzeige, Kopieren, Leeren und – wenn angemeldet – Melden an /api/errlog (jeder Eintrag einmal, bei Wiederholung erneut mit Anzahl).
   Das Entwickler-Konto sieht unter „Alle Geräte“ die Meldungen aller Konten.
   ===================================================================== */
const errsGet = () => { try { return JSON.parse(localStorage.getItem('enyaq.errs') || '[]'); } catch (e) { return []; } };
const errsSet = (a) => { try { localStorage.setItem('enyaq.errs', JSON.stringify(a)); } catch (e) { } };
let errAdmin = false, errAllShown = false;
function errRow(x, who) {
  const d = new Date(x.t), when = isNaN(d) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `<div class="rounded-xl bg-slate-100 px-2.5 py-2 text-left text-xs dark:bg-slate-800/70"><p class="font-medium text-slate-800 dark:text-slate-200 break-words">${esc(x.m)}${Number(x.n) > 1 ? ` <span class="text-slate-500 dark:text-slate-400">(${esc(String(x.n))}×)</span>` : ''}</p>
    <p class="mt-0.5 text-slate-500 dark:text-slate-400 break-all">${esc(when)}${x.v ? ' · v' + esc(x.v) : ''}${who ? ' · ' + esc(who) : ''}${x.s ? ' · ' + esc(x.s) : ''}</p></div>`;
}
function renderErrs() {
  const el = $('err-list'); if (!el) return; errAllShown = false;
  const a = errsGet().slice().reverse();
  $('err-count').textContent = a.length ? a.length + (a.length === 1 ? ' Eintrag' : ' Einträge') : 'keine Fehler';
  el.innerHTML = a.length ? a.slice(0, 8).map(x => errRow(x)).join('') + (a.length > 8 ? `<p class="text-xs text-slate-500 dark:text-slate-400">… und ${a.length - 8} ältere (beim Kopieren dabei)</p>` : '') : '';
  $('err-copy').disabled = !a.length; $('err-clear').disabled = !a.length; $('err-all').classList.toggle('hidden', !errAdmin);
}
function errText(a) {
  return 'EnyaqStrom Fehlerprotokoll · ' + new Date().toLocaleString('de-DE') + ' · ' + navigator.userAgent + '\n\n' +
    a.map(x => `[${x.t}] v${x.v || '?'} ${x.who ? x.who + ' ' + (x.ua || '') + ' ' : ''}${x.p || ''}\n${x.m}${Number(x.n) > 1 ? ' (' + x.n + '×)' : ''}\n${x.s || ''}${x.st ? '\n' + x.st : ''}`).join('\n\n');
}
async function errCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { }
  try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
}
$('err-copy').addEventListener('click', async () => { const ok = await errCopy(errText(errAllShown ? errAllShown : errsGet().slice().reverse())); $('err-msg').textContent = ok ? '✓ Kopiert – jetzt in den Chat einfügen.' : 'Kopieren ging nicht – bitte Bildschirmfoto machen.'; });
$('err-clear').addEventListener('click', async () => {
  if (errAllShown) {
    if (!(await ask('Alle gemeldeten Fehler aller Geräte auf dem Server löschen?', { title: 'Protokoll leeren?', ok: 'Löschen', danger: true }))) return;
    try { const r = await fetch('/api/errlog', { method: 'DELETE', headers: await authHeaders() }), j = await r.json().catch(() => ({})); $('err-msg').textContent = r.ok ? '✓ ' + j.n + ' Einträge auf dem Server gelöscht.' : 'Fehler: ' + (j.error || r.status); } catch (e) { $('err-msg').textContent = e.message; }
    renderErrs(); return;
  }
  const snap = errsGet(); errsSet([]); renderErrs(); $('err-msg').textContent = '';
  undoDel('Fehlerprotokoll geleert', () => { errsSet(snap); renderErrs(); });
});
$('err-all').addEventListener('click', async () => {
  $('err-msg').textContent = 'Lade …';
  try {
    const r = await fetch('/api/errlog', { headers: await authHeaders() }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Fehler: ' + (j.error || r.status));
    errAllShown = j.items || []; $('err-count').textContent = errAllShown.length + ' gemeldet (alle Geräte)';
    $('err-list').innerHTML = errAllShown.length ? errAllShown.slice(0, 30).map(x => errRow(x, x.who + ' ' + x.ua)).join('') : '<p class="text-xs text-slate-500 dark:text-slate-400">Keine Meldungen.</p>';
    $('err-copy').disabled = $('err-clear').disabled = !errAllShown.length; $('err-msg').textContent = '';
  } catch (e) { $('err-msg').textContent = e.message; }
});
/* Melden: nur angemeldet, höchstens 10 je Aufruf, gemeldete werden markiert (Wiederholung setzt up=false → mit neuer Anzahl erneut) */
let errUpBusy = false, errUpT = null;
async function errUpload() {
  if (errUpBusy || !window.cloud?.isSignedIn?.() || !navigator.onLine) return;
  const a = errsGet(), todo = a.filter(x => !x.up).slice(-10); if (!todo.length) return;
  errUpBusy = true;
  try {
    const r = await fetch('/api/errlog', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ items: todo.map(({ k, up, ...x }) => x) }) });
    if (r.ok) { const ks = new Set(todo.map(x => x.k + x.t)); const b = errsGet(); b.forEach(x => { if (ks.has(x.k + x.t)) x.up = true; }); errsSet(b); }
  } catch (e) { } finally { errUpBusy = false; }
}
window.addEventListener('enyaqerr', () => { if ($('err-list') && currentView === 'settings' && !errAllShown) renderErrs(); clearTimeout(errUpT); errUpT = setTimeout(errUpload, 8000); });
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') try { renderErrs(); } catch (e) { } return r; }; }
setTimeout(async () => {
  errUpload();
  try { if (window.cloud?.isSignedIn?.()) { const r = await fetch('/api/errlog?check=1', { headers: await authHeaders() }); if (r.ok) { errAdmin = !!(await r.json()).admin; renderErrs(); } } } catch (e) { }
}, 6000);
