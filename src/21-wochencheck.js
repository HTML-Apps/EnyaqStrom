/* =====================================================================
   Wochencheck Akku-Pflege: einmal pro Woche (ab Montag, beim ersten Öffnen von Start) eine Karte mit
   dem Akku-Pflege-Score (90 Tage, wie Berichte › Akku), der Änderung zur Vorwoche und der vergangenen Woche in drei Häkchen.
   Nur wenn in der Woche mit Akku-% (Start/Ende) geladen wurde. Gesehen-Markierung `nCare` = ISO-Woche (z. B. '2026-W45'),
   synchronisiert → auf allen Geräten nur einmal. Vorschau zum Testen: careWeekShow(true)
   ===================================================================== */
const KEY_CARE_SEEN = 'enyaq.careSeen';
let careShown = false;
/** Vergangene Woche (Mo 0:00 bis Mo 0:00) und ihr Schlüssel */
function careLastWeek(now = new Date()) {
  const dow = (now.getDay() + 6) % 7, mon1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow), mon0 = new Date(mon1.getFullYear(), mon1.getMonth(), mon1.getDate() - 7);
  const thu = new Date(mon0.getFullYear(), mon0.getMonth(), mon0.getDate() + 3), kw = isoWeek(mon0);
  return { t0: mon0.getTime(), t1: mon1.getTime(), kw, key: thu.getFullYear() + '-W' + String(kw).padStart(2, '0') };
}
function careWeekShow(force) {
  if (careShown && !force) return;
  const w = careLastWeek();
  if (!force) {
    if (currentView !== 'dashboard' || document.hidden) return;
    if (document.querySelector('#onb:not(.hidden), [role="dialog"][aria-modal="true"]:not(.hidden)')) return;   // Onboarding oder anderes Fenster offen
    if (maxStr(load(KEY_CARE_SEEN, ''), getSettings().nCare) >= w.key) return;
  }
  const rs = getReadings().filter(r => Number.isFinite(r.socStart) && Number.isFinite(r.socEnd) && r.socEnd > r.socStart && Date.parse(r.date) >= w.t0 && Date.parse(r.date) < w.t1);
  const c = batCare(w.t1 - 1), p = batCare(w.t1 - 1 - 7 * 864e5);   // Stand Ende der Woche vs. Ende der Vorwoche
  if (!force && (!rs.length || c.score == null)) return;
  careShown = true; save(KEY_CARE_SEEN, w.key); if (getSettings().nCare !== w.key) nagSet({ nCare: w.key });
  const n = rs.length, ok80 = rs.filter(r => r.socEnd <= 80).length, minS = n ? Math.min(...rs.map(r => r.socStart)) : null, full = rs.filter(r => r.socEnd >= 98).length;
  const sc = c.score == null ? 0 : c.score, lvl = sc >= 90 ? ['Sehr gut', '#10b981'] : sc >= 75 ? ['Gut', '#22c55e'] : sc >= 60 ? ['Okay', '#f59e0b'] : ['Verbesserbar', '#ef4444'];
  const d = c.score != null && p.score != null ? c.score - p.score : null;
  const dPill = d == null ? '' : d > 0 ? `<span class="mt-1.5 inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">▲ +${d} zur Vorwoche</span>`
    : d < 0 ? `<span class="mt-1.5 inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">▼ ${d} zur Vorwoche</span>`
    : '<span class="mt-1.5 inline-flex rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">± 0 zur Vorwoche</span>';
  const row = (good, label, val) => `<div class="flex items-center gap-2.5 border-t border-slate-200 py-2 text-[13.5px] dark:border-slate-800">
      <span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${good ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}">${good ? '✓' : '!'}</span>
      <span class="flex-1 text-slate-700 dark:text-slate-300">${label}</span><span class="font-bold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">${val}</span></div>`;
  const tip = !n ? 'Lade mit Akku-Prozenten (Start und Ende), dann bewertet der Wochencheck auch die Woche.'
    : ok80 < n ? 'Lade im Alltag bis 80 % – 100 % nur vor langen Fahrten. Das spart Zellstress und kaum Reichweite.'
    : minS < 10 ? 'Vermeide es, unter 10 % zu fahren – lieber etwas früher anstecken.'
    : full ? 'Eine Vollladung ist in Ordnung, solange du danach bald losfährst.'
    : 'Weiter so – zwischen 20 und 80 % fühlt sich der Akku am wohlsten.';
  const L = 97.4, dash = (sc / 100 * L).toFixed(1);
  const wrap = document.createElement('div');
  wrap.id = 'care-week'; wrap.className = 'fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3.5'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'cw-h');
  wrap.innerHTML = `<div class="w-full max-w-sm rounded-[26px] border border-slate-200 bg-white p-[18px] text-left text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <div class="flex items-center"><span class="flex-1 text-xs font-bold tracking-[0.08em] text-emerald-600 dark:text-emerald-400">WOCHENCHECK · KW ${w.kw}</span><button type="button" data-cw="x" aria-label="Schließen" class="-m-2 p-2 text-xl leading-none text-slate-400">×</button></div>
    <h2 id="cw-h" class="font-barlow text-2xl font-bold uppercase tracking-[0.06em]">Akku-Pflege</h2>
    <div class="mt-3 flex items-center gap-4">
      <div class="relative h-24 w-24 shrink-0"><svg viewBox="0 0 36 36" class="h-24 w-24 -rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-width="3.2"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${lvl[1]}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="${dash} ${L}"/></svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="font-barlow text-[34px] font-bold leading-none">${c.score == null ? '–' : c.score}</span><span class="text-[10px] text-slate-500 dark:text-slate-400">von 100</span></div></div>
      <div><p class="text-lg font-bold" style="color:${lvl[1]}">${lvl[0]}</p>${dPill}<p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Score der 90 Tage bis Sonntag</p></div></div>
    <p class="mt-4 text-xs font-bold tracking-[0.06em] text-slate-400">LETZTE WOCHE · ${n} ${n === 1 ? 'LADUNG' : 'LADUNGEN'}</p>
    <div class="mt-1">${n ? row(ok80 === n, 'Ladeende bis 80 %', ok80 + ' von ' + n) + row(minS >= 10, 'Nie unter 10 %', 'tiefster ' + Math.round(minS) + ' %') + row(!full, 'Keine Vollladung', full ? full + ' ×' : '–') : ''}</div>
    <div class="mt-2.5 rounded-2xl bg-slate-100 p-3 text-[12.5px] leading-snug text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"><b class="text-slate-900 dark:text-white">Tipp:</b> ${tip}</div>
    <div class="mt-3 flex gap-2"><button type="button" data-cw="go" class="h-12 flex-1 rounded-2xl bg-slate-100 text-sm font-semibold active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700">Details</button>
      <button type="button" data-cw="ok" class="h-12 flex-1 rounded-2xl bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700">${sc >= 75 ? 'Super, danke' : 'Verstanden'}</button></div></div>`;
  const close = () => { document.removeEventListener('keydown', key, true); wrap.remove(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) return close(); const b = e.target.closest('[data-cw]'); if (!b) return; close(); if (b.dataset.cw === 'go') NAV_GO.akku(); });
  document.addEventListener('keydown', key, true); document.body.appendChild(wrap); wrap.querySelector('[data-cw="ok"]').focus({ focusVisible: false });
}
/* Zeitpunkt: kurz nach dem Start (nach dem ersten Cloud-Abgleich, damit die Gesehen-Markierung anderer Geräte schon da ist) und beim Zurückkehren in die App */
(() => {
  const prev = window.onCloudPrefs; let synced = false;
  window.onCloudPrefs = function (d, first) { const r = prev && prev.apply(this, arguments); if (first && !synced) { synced = true; setTimeout(careWeekShow, 2500); } return r; };
  setTimeout(() => { if (!(window.cloud && window.cloud.isSignedIn && window.cloud.isSignedIn()) || synced) careWeekShow(); }, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(careWeekShow, 1500); });
})();
