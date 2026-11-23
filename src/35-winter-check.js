/* =====================================================================
   Saison-Checks (Variante A2): Winter-Check beim ersten Frost im Herbst und Sommer-Check, wenn der Frost im Frühjahr vorbei ist.
   Je Check ein Bottom-Sheet mit Spiegel-Foto + Checkliste, Karte auf Start solange Punkte offen sind, Abend-Push vom Server
   (api/ice-push.js, kind 'win' / 'sum', Link /?go=winter bzw. /?go=sommer). Zustand synchronisiert in settings.winter / settings.summer
   = {s: Saison, at: erstes Zeigen, d: {Punkt: Datum}, x: Karte ausgeblendet}.
   Winter: Saison = Herbst-Jahr (Aug–Feb), Auslöser Luft ≤ 0 °C zwischen gestern und morgen 10 Uhr (stündliches Eis-Wetter).
   Sommer: Saison = Jahr (März–Juli sichtbar, Auslöser nur März–Mai): 14 Nächte ohne Frost und die nächsten 7 Tage frostfrei (Tagesminimum > 0 °C).
   ===================================================================== */
const SEASON_CK = {
  win: {
    key: 'winter', pend: 'winPending', label: 'WINTER-CHECK', name: 'Winter-Check', title: 'Auto winterfest machen', icon: '❄',
    season: (d = new Date()) => { const m = d.getMonth(); return m >= 7 ? String(d.getFullYear()) : m <= 1 ? String(d.getFullYear() - 1) : null; },
    trigger: (d = new Date()) => { const m = d.getMonth(); return m >= 7 || m <= 1; },
    intro: 'Zum ersten Mal diesen Herbst Frost. Festgefrorene Spiegel können beim Klappen den Motor beschädigen – also zuerst das Einklappen aus.',
    items: [
      { k: 'mir', t: 'Spiegel-Einklappen ausschalten', s: 'Fahrzeug › Einstellungen › Spiegel und Wischer', hl: true },
      { k: 'fs', t: 'Frostschutz in den Scheibenreiniger', s: 'bis mindestens −20 °C' },
      { k: 'plane', t: 'Frontscheibenplane in den Kofferraum', s: 'für Nächte mit Raureif' },
      { k: 'sonax', t: 'Scheibenenteiser Sonax ins Auto', s: 'griffbereit in der Türablage' },
      { k: 'pre', t: 'Vorklimatisieren in MySkoda', s: 'vor der Abfahrt – die App öffnet MySkoda direkt', app: true }],
    // Farben als vollständige Klassen (Tailwind findet sie nur so)
    c: { sheet: 'bg-slate-900', list: 'bg-[#111c33]', line: 'border-slate-800', hl: 'bg-sky-950/70', hlTxt: 'text-sky-300', tag: 'text-sky-300', pill: 'bg-sky-900/80 text-sky-50',
      btn: 'bg-sky-400 text-[#04121f]', box: 'bg-sky-400', boxOff: 'ring-slate-600', sub: 'text-slate-500', note: 'text-slate-400', ring: '#38bdf8', ringBg: '#1e293b', tick: '#04121f',
      card: 'from-sky-950 to-slate-900 text-sky-50 ring-sky-500/30', cardIc: 'bg-sky-500/20', cardSub: 'text-sky-200/80', cardX: 'text-sky-200/70' },
    photo: 'filter:saturate(.55) brightness(.85) hue-rotate(-8deg)', tint: 'linear-gradient(180deg,rgba(14,165,233,.28),rgba(15,23,42,.05) 40%,#0f172a 96%)', frost: true,
    badge: (m) => '❄ Erster Frost' + (m == null ? '' : ' · ' + (m < -0.4 ? 'heute Nacht −' + fmt(Math.abs(m), 0) : 'heute Nacht 0') + ' °C'),
    done: 'Dein Enyaq ist winterfest.'
  },
  sum: {
    key: 'summer', pend: 'sumPending', label: 'SOMMER-CHECK', name: 'Sommer-Check', title: 'Frost ist vorbei', icon: '☀',
    season: (d = new Date()) => { const m = d.getMonth(); return m >= 2 && m <= 6 ? String(d.getFullYear()) : null; },
    trigger: (d = new Date()) => { const m = d.getMonth(); return m >= 2 && m <= 4; },
    intro: 'Seit 14 Nächten kein Frost, die nächste Woche bleibt mild. Die Spiegel können wieder automatisch einklappen – das schützt sie beim Parken.',
    items: [
      { k: 'mir', t: 'Spiegel-Einklappen wieder einschalten', s: 'Fahrzeug › Einstellungen › Spiegel und Wischer', hl: true },
      { k: 'tire', t: 'Sommerreifen montieren', s: 'letzter Frost vorbei – Wechsel unter Reifen eintragen' },
      { k: 'ins', t: 'Sommer-Scheibenreiniger mit Insektenlöser', s: 'Frostschutz-Rest darf drin bleiben' },
      { k: 'plane', t: 'Frontscheibenplane aus dem Kofferraum', s: 'trocknen lassen, dann in den Keller' },
      { k: 'sun', t: 'Scheibenenteiser raus, Sonnenschutz rein', s: 'Sonax-Enteiser bis zum Herbst einlagern' }],
    c: { sheet: 'bg-[#17140c]', list: 'bg-[#1c1a12]', line: 'border-stone-800', hl: 'bg-amber-950/70', hlTxt: 'text-amber-300', tag: 'text-amber-300', pill: 'bg-amber-900/80 text-amber-50',
      btn: 'bg-amber-400 text-[#1c1204]', box: 'bg-amber-400', boxOff: 'ring-stone-600', sub: 'text-stone-500', note: 'text-stone-400', ring: '#fbbf24', ringBg: '#292524', tick: '#1c1204',
      card: 'from-amber-950 to-stone-900 text-amber-50 ring-amber-400/30', cardIc: 'bg-amber-400/20', cardSub: 'text-amber-200/80', cardX: 'text-amber-200/70' },
    photo: 'filter:saturate(1.1) brightness(1.02) sepia(.25)', tint: 'radial-gradient(90% 70% at 85% 0%,rgba(251,191,36,.55),transparent 60%),linear-gradient(180deg,rgba(251,146,60,.18),rgba(23,20,12,.05) 40%,#17140c 96%)', frost: false,
    badge: () => '☀ 14 Nächte ohne Frost',
    done: 'Dein Enyaq ist bereit für den Sommer.'
  }
};
const winSeason = (d) => SEASON_CK.win.season(d);
let ckOpen = 'win';
function ckState(m) {
  const C = SEASON_CK[m], w = getSettings()[C.key], sea = C.season() || String(new Date().getFullYear());
  const o = w && typeof w === 'object' ? JSON.parse(JSON.stringify(w)) : {}; return o.s === sea ? o : { s: sea, d: {}, fresh: 1 };   // andere Saison → leer (fresh: noch nicht gespeichert)
}
const ckSave = (m, w) => { delete w.fresh; if (!w.at) w.at = todayYMD(); setQuickSetting(SEASON_CK[m].key, w); renderWinCard(); };
const ckDoneN = (m, w) => SEASON_CK[m].items.filter(x => w.d && w.d[x.k]).length;
/** Winter: tiefste Lufttemperatur von gestern bis morgen 10 Uhr am Ort „Zuhause“ (stündliches Eis-Wetter, 1 h zwischengespeichert) */
async function winFrostMin() {
  const l = iceLoc(); if (!l) return null; const H = await iceHourly(l, iceSet()); if (!H || !H.time) return null;
  const now = new Date(), y = new Date(now.getTime() - 864e5), t = new Date(now.getTime() + 864e5), from = wxIso(y) + 'T00:00', to = wxIso(t) + 'T10:00';
  let min = Infinity; H.time.forEach((x, i) => { const v = Number(H.temperature_2m[i]); if (x >= from && x <= to && Number.isFinite(v)) min = Math.min(min, v); });
  return Number.isFinite(min) ? min : null;
}
/** Sommer: Tagesminima der letzten 14 und nächsten 7 Tage (einmal am Tag abgerufen) → frostfrei? */
async function sumFrostFree() {
  const l = iceLoc(); if (!l) return null; const sig = l.lat.toFixed(2) + '|' + l.lon.toFixed(2) + '|' + todayYMD(), c = load('enyaq.sumWx', null);
  let mins = c && c.sig === sig ? c.mins : null;
  if (!mins) { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&daily=temperature_2m_min&timezone=auto&past_days=14&forecast_days=8');
    if (!r.ok) return null; const D = (await r.json()).daily; mins = ((D && D.temperature_2m_min) || []).filter(v => Number.isFinite(v)); if (mins.length < 20) return null; save('enyaq.sumWx', { sig, mins }); }
  return mins.every(v => v > 0);
}
async function winCheck(force) {
  try {
    for (const m of ['win', 'sum']) { const C = SEASON_CK[m]; if (window[C.pend]) { window[C.pend] = false; return ckShow(m, null, true); } }
    if (!force && (document.hidden || liveHero || currentView !== 'dashboard')) return;
    for (const m of ['win', 'sum']) {
      const C = SEASON_CK[m]; if (!C.trigger() || !ckState(m).fresh) continue;                 // außerhalb des Auslöse-Zeitraums oder diese Saison schon gezeigt
      if (iceMornBusy() || ($('icem-sheet') && !$('icem-sheet').classList.contains('hidden'))) { if ((winCheck.tries = (winCheck.tries || 0) + 1) <= 40) setTimeout(() => winCheck(), 4000); return; }
      if (m === 'win') { const min = await winFrostMin(); if (min != null && min <= 0) return ckShow('win', min); }
      else if (await sumFrostFree()) return ckShow('sum');
    }
  } catch (e) { }
}
function ckShow(m, min, preview) {
  const w = ckState(m); ckOpen = m;
  if (!preview && w.fresh) ckSave(m, w);                                                    // echtes erstes Zeigen startet die Saison (Push kommt dann nicht mehr)
  else if (w.x && !w.fresh) { delete w.x; ckSave(m, w); }                                    // wieder geöffnet → Karte auf Start wieder zeigen
  let el = $('win-sheet');
  if (!el) { el = document.createElement('div'); el.id = 'win-sheet'; el.className = 'hidden fixed inset-0 z-50 bg-black/60 flex items-end justify-center'; document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-win-close]')) return winClose();
      if (e.target.closest('[data-win-app]')) { e.preventDefault(); e.stopPropagation(); iceMornOpenApp(); return; }
      const r = e.target.closest('[data-win-k]'); if (!r) return;
      const s = ckState(ckOpen); s.d = s.d || {}; const k = r.dataset.winK; if (s.d[k]) delete s.d[k]; else s.d[k] = todayYMD(); ckSave(ckOpen, s); winPaint();
    }); }
  el.dataset.min = min == null ? '' : String(min);
  winPaint(); el.classList.remove('hidden'); try { history.pushState({ win: 1 }, ''); } catch (e) { }
}
const winShow = (min, preview) => ckShow('win', min, preview);
function winPaint() {
  const el = $('win-sheet'); if (!el) return; const m = ckOpen, C = SEASON_CK[m], c = C.c, w = ckState(m), n = ckDoneN(m, w), N = C.items.length, min = el.dataset.min === '' ? null : Number(el.dataset.min), L = 2 * Math.PI * 21;
  const box = (on) => `<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${on ? c.box : 'ring-2 ring-inset ' + c.boxOff}">${on ? `<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="${c.tick}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>` : ''}</span>`;
  const rows = C.items.map((x, i) => { const on = !!(w.d && w.d[x.k]);
    return `<div role="button" tabindex="0" data-win-k="${x.k}" class="flex cursor-pointer items-center gap-3 px-3 py-2.5 ${i ? 'border-t ' + c.line : ''} ${x.hl && !on ? c.hl : ''} active:bg-white/5 transition">${box(on)}
      <span class="min-w-0 flex-1"><span class="block text-[13.5px] font-bold ${on ? c.sub + ' line-through' : 'text-white'}">${x.t}</span><span class="block text-[11px] ${x.hl && !on ? c.hlTxt : c.sub}">${x.s}</span></span>
      ${x.app ? '<button type="button" data-win-app class="shrink-0 rounded-[10px] bg-[#78faae] px-2.5 py-1.5 text-[11px] font-extrabold text-[#0e3a2f] active:scale-95 transition">MySkoda ↗</button>' : ''}</div>`; }).join('');
  const frost = C.frost ? `<svg class="absolute inset-0 h-full w-full opacity-40" aria-hidden="true"><defs><pattern id="win-fr" width="46" height="46" patternUnits="userSpaceOnUse"><g stroke="#e0f2fe" stroke-width="1.1" fill="none" opacity=".7"><path d="M23 8v30M10 15.5l26 15M10 30.5l26-15"/></g></pattern><radialGradient id="win-fm" cx=".5" cy=".3" r=".75"><stop offset=".45" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient><mask id="win-mk"><rect width="100%" height="100%" fill="url(#win-fm)"/></mask></defs><rect width="100%" height="100%" fill="url(#win-fr)" mask="url(#win-mk)"/></svg>` : '';
  el.innerHTML = `<div class="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] ${c.sheet} text-slate-100 shadow-2xl" role="dialog" aria-labelledby="win-h">
    <div class="relative h-[190px] shrink-0 overflow-hidden">
      <img src="/Bilder/Enyaq/spiegel.webp" alt="" class="absolute inset-0 h-full w-full object-cover" style="object-position:62% 45%;${C.photo}">
      <div class="absolute inset-0" style="background:${C.tint}"></div>${frost}
      <div class="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded bg-white/60"></div>
      <span class="absolute left-4 top-5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${c.pill}">${C.badge(min)}</span>
      <button type="button" data-win-close aria-label="Schließen" class="absolute right-3 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-lg text-white">×</button></div>
    <div class="relative -mt-11 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div class="flex items-end justify-between gap-3"><div><p class="text-[11px] font-extrabold tracking-[.14em] ${c.tag}">${C.label}</p><p id="win-h" class="font-barlow text-[31px] font-bold leading-[1.02] text-white">${C.title}</p></div>
        <svg width="52" height="52" viewBox="0 0 52 52" class="shrink-0" aria-label="${n} von ${N} erledigt"><circle cx="26" cy="26" r="21" stroke="${c.ringBg}" stroke-width="5" fill="none"/><circle cx="26" cy="26" r="21" stroke="${c.ring}" stroke-opacity="${n ? 1 : 0}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${(L * n / N).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 26 26)"/><text x="26" y="30.5" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">${n}/${N}</text></svg></div>
      <p class="mb-2.5 mt-1.5 text-[12.5px] leading-snug ${c.note}">${C.intro}</p>
      <div class="overflow-hidden rounded-[18px] ${c.list}">${rows}</div>
      <button type="button" data-win-close class="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold ${c.btn} active:scale-[.98] transition">${n === N ? '✓ Alles erledigt – gute Fahrt!' : '✓ Fertig – später weiter'}</button>
      <p class="mt-2 text-center text-[11px] ${c.sub}">${n === N ? C.done : 'Offene Punkte bleiben als Karte auf Start.'}</p></div></div>`;
}
function winClose(fromPop) {
  const el = $('win-sheet'); if (!el || el.classList.contains('hidden')) return; el.classList.add('hidden'); renderWinCard();
  if (!fromPop) { try { if (history.state && history.state.win) history.back(); } catch (e) { } }
}
addEventListener('popstate', () => winClose(true));
addEventListener('keydown', (e) => { if (e.key === 'Escape') winClose(); });
/** Karte auf Start: Check der laufenden Saison mit offenen Punkten (Sommer zuerst; die Saisons überschneiden sich nicht) */
function renderWinCard() {
  const el = $('win-card'); if (!el) return;
  const m = ['sum', 'win'].find(k => { const C = SEASON_CK[k], w = ckState(k); return !!C.season() && !w.fresh && ckDoneN(k, w) < C.items.length && !w.x; });
  el.classList.toggle('hidden', !m); if (!m) { el.innerHTML = ''; return; }
  const C = SEASON_CK[m], c = C.c, w = ckState(m), n = ckDoneN(m, w), next = C.items.find(x => !(w.d && w.d[x.k]));
  el.innerHTML = `<div class="flex items-center gap-3 rounded-2xl bg-gradient-to-br ${c.card} px-3 py-2.5 ring-1 ring-inset">
    <button type="button" id="win-card-go" class="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.cardIc} text-xl">${C.icon}</span>
      <span class="min-w-0"><span class="block text-[13.5px] font-bold">${C.name} · ${n}/${C.items.length} erledigt</span><span class="block truncate text-[12px] ${c.cardSub}">Als Nächstes: ${next ? next.t : ''}</span></span></button>
    <button type="button" id="win-card-x" aria-label="Ausblenden" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${c.cardX} hover:bg-white/10 active:scale-95 transition">×</button></div>`;
  $('win-card-go').onclick = () => ckShow(m, null, true);
  $('win-card-x').onclick = () => { const s = ckState(m); s.x = 1; ckSave(m, s); appNote('Ausgeblendet – unter Einstellungen › Eis-Warnung wieder öffnen.'); };
}
$('win-prev').addEventListener('click', async () => { let mn = null; try { mn = await winFrostMin(); } catch (e) { } ckShow('win', mn, true); });
$('sum-prev').addEventListener('click', () => ckShow('sum', null, true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => winCheck(), 2200); });
setTimeout(() => { renderWinCard(); winCheck(); }, 3200);
