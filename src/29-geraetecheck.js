/* =====================================================================
   Gerätecheck (Einstellungen › Konto & Cloud) + Versions-Prüfung.
   Zeigt je Gerät: laufende App-Version vs. Version auf dem Server, Fenster/Zoom, PC-Ansicht, Prognose-Kartenbreite → sichtbare Tage,
   Startseite-Reihenfolge (lokal vs. letzter Cloud-Stand), letzter erfolgreicher Abgleich. „App neu laden“ leert Service-Worker-Cache und lädt frisch.
   Läuft eine ältere Version als auf dem Server (z. B. lange offener PC-Tab), fragt die App einmal je Version, ob sie neu laden soll.
   ===================================================================== */
const APP_V = (() => { try { return Number(((document.querySelector('script[src*="app.js?v="]') || {}).src || '').split('v=')[1]) || 0; } catch (e) { return 0; } })();
var srvV = null, srvVAsked = 0;
async function srvVersion() {
  try { const r = await fetch('/?vcheck=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; const m = (await r.text()).match(/app\.js\?v=(\d+)/); srvV = m ? Number(m[1]) : null; } catch (e) { }
  return srvV;
}
async function appHardReload() {
  try { const rs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((rs || []).map(r => r.update().catch(() => { }))); } catch (e) { }
  try { const ks = await caches.keys(); await Promise.all(ks.filter(k => !/share/.test(k)).map(k => caches.delete(k))); } catch (e) { }   // Teilen-Ablage behalten
  location.reload();
}
async function versionCheck() {
  const v = await srvVersion(); if (!v || !APP_V || v <= APP_V || srvVAsked === v) return; srvVAsked = v;
  if (await ask(`Auf diesem Gerät läuft noch v${APP_V}, aktuell ist v${v}. Jetzt neu laden?`, { title: 'Neue Version', ok: 'Neu laden', cancel: 'Später' })) appHardReload();
}
function diagRows() {
  const st = getSettings(), base = load('enyaq.setBase', {}) || {}, ord = (o) => (o && o.order ? o.order : DASH_W.map(w => w[0])).map(id => (DASH_W.find(w => w[0] === id) || [id, id])[1].split(' ')[0]).join(' › ');
  const card = $('wxo-card'), vis = [...document.querySelectorAll('#wxo-days > div')].filter(d => d.offsetWidth > 0).length, ok = load('enyaq.syncOk', 0);
  return [
    ['App', 'v' + APP_V + (srvV ? (srvV > APP_V ? ' – Server hat v' + srvV + ' (neu laden!)' : ' – aktuell') : '')],
    ['Fenster', innerWidth + ' × ' + innerHeight + ' px · Zoom ' + Math.round(devicePixelRatio * 100) + ' % · ' + (isDesk() ? 'PC-Ansicht' : 'Handy-Ansicht (unter 1280 px)')],
    ['Prognose', card && card.clientWidth ? 'Karte ' + card.clientWidth + ' px → ' + vis + ' Tage sichtbar' : window.wxoW ? 'Karte zuletzt ' + window.wxoW + ' px → ' + $('wxo-days').dataset.n + ' Tage' : 'Karte noch nicht angezeigt'],
    ['Startseite', ord(st.dash) + (st.dash && st.dash.off && st.dash.off.length ? ' · aus: ' + st.dash.off.length : '') + (st.dashStart ? ' · ★ ' + st.dashStart.replace('-card', '') : '') + ' (nur dieses Gerät' + (st.dashT ? ', gespeichert ' + new Date(st.dashT).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + ')'],
    ['Speicher', 'lokal seit ' + (Number(localStorage.getItem('enyaq.devBorn')) ? new Date(Number(localStorage.getItem('enyaq.devBorn'))).toLocaleDateString('de-DE') : '?') + ' · ' + (window.storePersist === true ? 'dauerhaft (Browser löscht nicht von selbst)' : window.storePersist === false ? 'nicht dauerhaft – Browser darf Daten löschen' : 'unbekannt')],
    ['Cloud', (window.cloud?.isSignedIn?.() ? 'angemeldet' : 'nicht angemeldet') + (ok ? ' · zuletzt abgeglichen ' + new Date(ok).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')],
    ['Browser', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140)]];
}
function renderDiag() {
  const el = $('diag-list'); if (!el) return; $('diag-ver').textContent = 'v' + APP_V;
  el.innerHTML = diagRows().map(([k, v]) => `<p><b class="text-slate-800 dark:text-slate-100">${esc(k)}:</b> ${esc(v)}</p>`).join('');
}
$('diag-copy').addEventListener('click', async () => { const ok = await errCopy('EnyaqStrom Gerätecheck · ' + new Date().toLocaleString('de-DE') + '\n' + diagRows().map(([k, v]) => k + ': ' + v).join('\n')); appNote(ok ? '✓ Gerätecheck kopiert' : 'Kopieren nicht möglich'); });
$('diag-reload').addEventListener('click', () => appHardReload());
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') { try { renderDiag(); } catch (e) { } srvVersion().then(() => { try { renderDiag(); } catch (e) { } }); } return r; }; }
setTimeout(versionCheck, 8000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) versionCheck(); });
