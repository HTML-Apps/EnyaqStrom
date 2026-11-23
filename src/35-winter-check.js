/* =====================================================================
   Winter-Check beim ersten Frost (Variante A2): einmal pro Saison (Aug–Feb, Saison = Herbst-Jahr) erscheint beim Öffnen von Start ein
   Bottom-Sheet mit Spiegel-Foto und Checkliste, sobald für den Ort „Zuhause“ zwischen gestern und morgen 10 Uhr Luft ≤ 0 °C gemeldet ist.
   Zustand synchronisiert in settings.winter = {s: Saison, at: erstes Zeigen, d: {Punkt: Datum}, x: Karte ausgeblendet}.
   Offene Punkte → Karte #win-card auf Start. Abend-Push „erster Frost“ kommt vom Server (api/ice-push.js, kind 'win', /?go=winter).
   ===================================================================== */
const WIN_ITEMS = [
  { k: 'mir', t: 'Spiegel-Einklappen ausschalten', s: 'Fahrzeug › Einstellungen › Spiegel und Wischer', hl: true },
  { k: 'fs', t: 'Frostschutz in den Scheibenreiniger', s: 'bis mindestens −20 °C' },
  { k: 'plane', t: 'Frontscheibenplane in den Kofferraum', s: 'für Nächte mit Raureif' },
  { k: 'sonax', t: 'Scheibenenteiser Sonax ins Auto', s: 'griffbereit in der Türablage' },
  { k: 'pre', t: 'Vorklimatisieren in MySkoda', s: 'vor der Abfahrt – die App öffnet MySkoda direkt', app: true }
];
const winSeason = (d = new Date()) => { const m = d.getMonth(); return m >= 7 ? String(d.getFullYear()) : m <= 1 ? String(d.getFullYear() - 1) : null; };
function winState() { const w = getSettings().winter, sea = winSeason() || String(new Date().getFullYear());
  const o = w && typeof w === 'object' ? JSON.parse(JSON.stringify(w)) : {}; return o.s === sea ? o : { s: sea, d: {}, fresh: 1 }; }   // andere Saison → leer (fresh: noch nicht gespeichert)
const winSave = (w) => { delete w.fresh; if (!w.at) w.at = todayYMD(); setQuickSetting('winter', w); renderWinCard(); };
const winDoneN = (w) => WIN_ITEMS.filter(x => w.d && w.d[x.k]).length;
/** Tiefste Lufttemperatur von gestern bis morgen 10 Uhr am Ort „Zuhause“ (aus dem stündlichen Eis-Wetter, 1 h zwischengespeichert) */
async function winFrostMin() {
  const l = iceLoc(); if (!l) return null; const H = await iceHourly(l, iceSet()); if (!H || !H.time) return null;
  const now = new Date(), y = new Date(now.getTime() - 864e5), t = new Date(now.getTime() + 864e5), from = wxIso(y) + 'T00:00', to = wxIso(t) + 'T10:00';
  let min = Infinity; H.time.forEach((x, i) => { const v = Number(H.temperature_2m[i]); if (x >= from && x <= to && Number.isFinite(v)) min = Math.min(min, v); });
  return Number.isFinite(min) ? min : null;
}
async function winCheck(force) {
  try {
    if (window.winPending) { window.winPending = false; return winShow(null, true); }
    const sea = winSeason(); if (!force && !sea) return;
    const w = winState(); if (!force && !w.fresh) return;                                  // diese Saison schon gezeigt → nur noch die Karte
    if (!force && (document.hidden || liveHero || currentView !== 'dashboard')) return;
    if (!force && (iceMornBusy() || ($('icem-sheet') && !$('icem-sheet').classList.contains('hidden')))) { if ((winCheck.tries = (winCheck.tries || 0) + 1) <= 40) setTimeout(() => winCheck(), 4000); return; }
    const min = await winFrostMin(); if (!force && (min == null || min > 0)) return;
    winShow(min, force);
  } catch (e) { }
}
function winShow(min, preview) {
  const w = winState();
  if (!preview && w.fresh) winSave(w);                                                     // echtes erstes Zeigen startet die Saison (Push kommt dann nicht mehr)
  else if (w.x && !w.fresh) { delete w.x; winSave(w); }                                     // wieder geöffnet → Karte auf Start wieder zeigen
  let el = $('win-sheet');
  if (!el) { el = document.createElement('div'); el.id = 'win-sheet'; el.className = 'hidden fixed inset-0 z-50 bg-black/60 flex items-end justify-center'; document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-win-close]')) return winClose();
      if (e.target.closest('[data-win-app]')) { e.preventDefault(); e.stopPropagation(); iceMornOpenApp(); return; }
      const r = e.target.closest('[data-win-k]'); if (!r) return;
      const s = winState(); s.d = s.d || {}; const k = r.dataset.winK; if (s.d[k]) delete s.d[k]; else s.d[k] = todayYMD(); winSave(s); winPaint();
    }); }
  el.dataset.min = min == null ? '' : String(min);
  winPaint(); el.classList.remove('hidden'); try { history.pushState({ win: 1 }, ''); } catch (e) { }
}
function winPaint() {
  const el = $('win-sheet'); if (!el) return; const w = winState(), n = winDoneN(w), N = WIN_ITEMS.length, min = el.dataset.min === '' ? null : Number(el.dataset.min);
  const deg = min == null ? '' : ' · ' + (min < -0.4 ? 'heute Nacht −' + fmt(Math.abs(min), 0) : 'heute Nacht 0') + ' °C', L = 2 * Math.PI * 21;
  const box = (on) => `<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-sky-400' : 'ring-2 ring-inset ring-slate-600'}">${on ? '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="#04121f" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>' : ''}</span>`;
  const rows = WIN_ITEMS.map((x, i) => { const on = !!(w.d && w.d[x.k]);
    return `<div role="button" tabindex="0" data-win-k="${x.k}" class="flex cursor-pointer items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-slate-800' : ''} ${x.hl && !on ? 'bg-sky-950/70' : ''} active:bg-slate-800 transition">${box(on)}
      <span class="min-w-0 flex-1"><span class="block text-[13.5px] font-bold ${on ? 'text-slate-500 line-through' : 'text-white'}">${x.t}</span><span class="block text-[11px] ${x.hl && !on ? 'text-sky-300' : 'text-slate-500'}">${x.s}</span></span>
      ${x.app ? '<button type="button" data-win-app class="shrink-0 rounded-[10px] bg-[#78faae] px-2.5 py-1.5 text-[11px] font-extrabold text-[#0e3a2f] active:scale-95 transition">MySkoda ↗</button>' : ''}</div>`; }).join('');
  el.innerHTML = `<div class="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-slate-900 text-slate-100 shadow-2xl" role="dialog" aria-labelledby="win-h">
    <div class="relative h-[190px] shrink-0 overflow-hidden">
      <img src="/Bilder/Enyaq/spiegel.webp" alt="" class="absolute inset-0 h-full w-full object-cover" style="object-position:62% 45%;filter:saturate(.55) brightness(.85) hue-rotate(-8deg)">
      <div class="absolute inset-0" style="background:linear-gradient(180deg,rgba(14,165,233,.28),rgba(15,23,42,.05) 40%,#0f172a 96%)"></div>
      <svg class="absolute inset-0 h-full w-full opacity-40" aria-hidden="true"><defs><pattern id="win-fr" width="46" height="46" patternUnits="userSpaceOnUse"><g stroke="#e0f2fe" stroke-width="1.1" fill="none" opacity=".7"><path d="M23 8v30M10 15.5l26 15M10 30.5l26-15"/></g></pattern><radialGradient id="win-fm" cx=".5" cy=".3" r=".75"><stop offset=".45" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient><mask id="win-mk"><rect width="100%" height="100%" fill="url(#win-fm)"/></mask></defs><rect width="100%" height="100%" fill="url(#win-fr)" mask="url(#win-mk)"/></svg>
      <div class="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded bg-white/60"></div>
      <span class="absolute left-4 top-5 inline-flex items-center gap-1.5 rounded-full bg-sky-900/80 px-2.5 py-1 text-[11.5px] font-bold text-sky-50">❄ Erster Frost${deg}</span>
      <button type="button" data-win-close aria-label="Schließen" class="absolute right-3 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-lg text-white">×</button></div>
    <div class="relative -mt-11 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div class="flex items-end justify-between gap-3"><div><p class="text-[11px] font-extrabold tracking-[.14em] text-sky-300">WINTER-CHECK</p><p id="win-h" class="font-barlow text-[31px] font-bold leading-[1.02] text-white">Auto winterfest machen</p></div>
        <svg width="52" height="52" viewBox="0 0 52 52" class="shrink-0" aria-label="${n} von ${N} erledigt"><circle cx="26" cy="26" r="21" stroke="#1e293b" stroke-width="5" fill="none"/><circle cx="26" cy="26" r="21" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${(L * n / N).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 26 26)"/><text x="26" y="30.5" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">${n}/${N}</text></svg></div>
      <p class="mb-2.5 mt-1.5 text-[12.5px] leading-snug text-slate-400">Zum ersten Mal diesen Herbst Frost. Festgefrorene Spiegel können beim Klappen den Motor beschädigen – also zuerst das Einklappen aus.</p>
      <div class="overflow-hidden rounded-[18px] bg-[#111c33]">${rows}</div>
      <button type="button" data-win-close class="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-400 text-[15px] font-extrabold text-[#04121f] active:scale-[.98] transition">${n === N ? '✓ Alles erledigt – gute Fahrt!' : '✓ Fertig – später weiter'}</button>
      <p class="mt-2 text-center text-[11px] text-slate-500">${n === N ? 'Dein Enyaq ist winterfest.' : 'Offene Punkte bleiben als Karte auf Start.'}</p></div></div>`;
}
function winClose(fromPop) {
  const el = $('win-sheet'); if (!el || el.classList.contains('hidden')) return; el.classList.add('hidden'); renderWinCard();
  if (!fromPop) { try { if (history.state && history.state.win) history.back(); } catch (e) { } }
}
addEventListener('popstate', () => winClose(true));
addEventListener('keydown', (e) => { if (e.key === 'Escape') winClose(); });
/** Karte auf Start: solange in der laufenden Saison Punkte offen sind (ausblendbar) */
function renderWinCard() {
  const c = $('win-card'); if (!c) return; const w = winState(), sea = winSeason(), n = winDoneN(w), N = WIN_ITEMS.length;
  const show = !!sea && !w.fresh && n < N && !w.x; c.classList.toggle('hidden', !show); if (!show) { c.innerHTML = ''; return; }
  const next = WIN_ITEMS.find(x => !(w.d && w.d[x.k]));
  c.innerHTML = `<div class="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-sky-950 to-slate-900 px-3 py-2.5 text-sky-50 ring-1 ring-inset ring-sky-500/30">
    <button type="button" id="win-card-go" class="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-xl">❄</span>
      <span class="min-w-0"><span class="block text-[13.5px] font-bold">Winter-Check · ${n}/${N} erledigt</span><span class="block truncate text-[12px] text-sky-200/80">Als Nächstes: ${next ? next.t : ''}</span></span></button>
    <button type="button" id="win-card-x" aria-label="Ausblenden" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-sky-200/70 hover:bg-white/10 active:scale-95 transition">×</button></div>`;
  $('win-card-go').onclick = () => winShow(null, true);
  $('win-card-x').onclick = () => { const s = winState(); s.x = 1; winSave(s); appNote('Ausgeblendet – unter Einstellungen › Eis-Warnung › Winter-Check wieder öffnen.'); };
}
$('win-prev').addEventListener('click', async () => { let m = null; try { m = await winFrostMin(); } catch (e) { } winShow(m, true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => winCheck(), 2200); });
setTimeout(() => { renderWinCard(); winCheck(); }, 3200);
