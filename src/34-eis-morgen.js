/* =====================================================================
   Eis-Check am Morgen (Variante A, Bottom-Sheet): öffnet man morgens die App (Handy, Start), ist die Scheibe laut Prognose wahrscheinlich
   vereist (≥ 50 %) und steht die übliche Abfahrt noch bevor → Hinweis mit Startzeit-Empfehlung und Knopf „In MySkoda vorklimatisieren“.
   Abfahrt je Wochentag gelernt aus dem Fahrtenbuch (erste Fahrt des Tages 4–11 Uhr, Median der letzten 90 Tage, ≥ 3 Tage), sonst
   Einstellung „Abfahrt“ der Eis-Warnung (iceSet().dep). Höchstens einmal pro Tag (enyaq.iceMorn = Datum). Nicht am PC, nicht bei Garage.
   ===================================================================== */
const KEY_ICEM = 'enyaq.iceMorn';
const ICEM_MIN_P = 50;
/** MySkoda öffnen: Android per Intent (fehlt die App → Play Store), iPhone App-Store-Seite (zeigt „Öffnen“, wenn installiert) */
function iceMornLink() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'intent://#Intent;package=' + MYSKODA_PKG + ';S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=' + MYSKODA_PKG) + ';end';
  if (/iphone|ipad|ipod/i.test(ua)) return 'https://apps.apple.com/de/app/my%C5%A1koda/id1632202810';
  return 'https://www.skoda.de/myskoda';
}
/** MySkoda starten: Android Intent per location (in der installierten PWA zuverlässiger als ein Link-Klick); bleibt die App 1,5 s im
    Vordergrund (MySkoda nicht gefunden / Paketname falsch), öffnet sich die Play-Store-Seite. iPhone: App-Store-Seite (keine Möglichkeit, MySkoda direkt zu starten). */
const MYSKODA_PKG = 'cz.skodaauto.myskoda';
function iceMornOpenApp() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) {
    const store = 'https://play.google.com/store/apps/details?id=' + MYSKODA_PKG;   // Paketname vom Nutzer bestätigt (Play-Store-Link)
    let left = false; const onHide = () => { if (document.hidden) left = true; }; document.addEventListener('visibilitychange', onHide);
    setTimeout(() => { document.removeEventListener('visibilitychange', onHide); if (!left && !document.hidden) location.href = store; }, 1500);
    // Chrome startet aus dem Browser nur Activities mit BROWSABLE-Filter – der Start-Bildschirm (LAUNCHER) gehört nicht dazu.
    // MySkoda registriert das Schema myskoda:// (OAuth-Rückleitung myskoda://redirect/login/) → darüber geht die App auf.
    location.href = 'intent://redirect/login/#Intent;scheme=myskoda;package=' + MYSKODA_PKG + ';S.browser_fallback_url=' + encodeURIComponent(store) + ';end';
    return;
  }
  window.open(iceMornLink(), '_blank', 'noopener');
}
/** Übliche Abfahrt (Minuten nach Mitternacht) für den Wochentag von `d`: aus dem Fahrtenbuch gelernt, sonst Einstellung */
function iceMornDep(d) {
  const wd = d.getDay(), since = d.getTime() - 90 * 864e5, first = {};
  try { (load('enyaq.trips', []) || []).forEach(x => { const t = x && Date.parse(x.s); if (!Number.isFinite(t) || t < since) return; const s = new Date(t), h = s.getHours();
    if (s.getDay() !== wd || h < 4 || h >= 11) return; const k = wxIso(s), m = h * 60 + s.getMinutes(); if (first[k] == null || m < first[k]) first[k] = m; }); } catch (e) { }
  const v = Object.values(first).sort((a, b) => a - b);
  if (v.length >= 3) return { min: v[Math.floor(v.length / 2)], learned: true, n: v.length };
  const [h, m] = iceSet().dep.split(':').map(Number); return { min: h * 60 + m, learned: false, n: v.length };
}
const iceMornHM = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min % 60)).padStart(2, '0');
/** Ist gerade ein anderes Fenster/Pop-up offen? (Vollflächige Ebenen, die sichtbar sind) */
function iceMornBusy() {
  return [...document.querySelectorAll('body .fixed.inset-0, body [role=dialog]')].some(e => e.id !== 'icem-sheet' && !e.closest('#icem-sheet') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && getComputedStyle(e).pointerEvents !== 'none' && +getComputedStyle(e).opacity > 0.05);   // geschlossene Drawer liegen unsichtbar mit pointer-events: none darüber
}
/** Prüfen und ggf. zeigen (force: Vorschau unabhängig von Uhrzeit/Prognose/„schon gesehen“) */
async function iceMornCheck(force) {
  try {
    if (!force && (isDesk() || liveHero || document.hidden || currentView !== 'dashboard' || load(KEY_ICEM, '') === todayYMD())) return;
    if ($('icem-sheet') && !$('icem-sheet').classList.contains('hidden')) return;
    if (!force && iceMornBusy()) { if ((iceMornCheck.tries = (iceMornCheck.tries || 0) + 1) <= 40) setTimeout(() => iceMornCheck(), 4000); return; }   // anderes Fenster offen (z. B. Wochencheck) → danach
    const st = iceSet(); if (st.park === 'garage' && !force) return; const l = iceLoc(); if (!l) return;
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), dep = iceMornDep(now);
    if (!force && (now.getHours() < 4 || nowM > dep.min || nowM < dep.min - 180)) return;     // nur in den 3 Stunden vor der Abfahrt
    const r = iceEval(await iceHourly(l, st), todayYMD(), st); if (!r) return;
    if (!force && (r.p < ICEM_MIN_P || r.lvl < 1)) return;
    iceMornShow(r, dep, nowM, force);
  } catch (e) { }
}
function iceMornShow(r, dep, nowM, preview) {
  let el = $('icem-sheet');
  if (!el) { el = document.createElement('div'); el.id = 'icem-sheet'; el.className = 'hidden fixed inset-0 z-50 bg-black/60 flex items-end justify-center'; document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) iceMornClose('later'); const b = e.target.closest('[data-icem]'); if (b) iceMornClose(b.dataset.icem); }); }
  const tg = Math.round(r.minTg), dur = Math.max(10, Math.min(25, Math.round((10 + Math.max(0, -r.minTg) * 1.5 + (r.glaze ? 5 : 0)) / 5) * 5)), startBy = dep.min - dur;
  const why = r.glaze ? 'Nässe am Abend, danach Frost → <b class="text-white">Eisschicht</b> möglich, nicht nur Raureif.' : r.cc < 35 && r.ws < 3 ? 'Klar und windstill über Nacht → die Scheibe kühlt unter die Luft ab, <b class="text-white">Raureif</b>.' : 'Scheibe unter 0 °C und unter dem Taupunkt → <b class="text-white">Raureif</b>.';
  const when = nowM >= startBy ? 'am besten <b class="text-white">jetzt</b> starten' : 'starte bis <b class="text-white">' + iceMornHM(startBy) + '</b>';
  const t = (v) => fmt(v, 0).replace('-', '−'), frost = '<svg class="absolute inset-0 h-full w-full opacity-40" aria-hidden="true"><defs><pattern id="icem-fr" width="46" height="46" patternUnits="userSpaceOnUse"><g stroke="#e0f2fe" stroke-width="1.2" opacity=".6" fill="none"><path d="M23 6v34M8 15l30 16M8 31l30-16M23 10l-4-4M23 10l4-4M23 36l-4 4M23 36l4 4"/></g></pattern></defs><rect width="100%" height="100%" fill="url(#icem-fr)"/></svg>';
  const tile = (k, v, c) => `<div class="rounded-2xl bg-slate-800 px-2.5 py-2"><p class="text-[11px] text-slate-400">${k}</p><p class="font-barlow text-[26px] font-bold leading-tight ${c}">${v}</p></div>`;
  el.innerHTML = `<div class="w-full max-w-md overflow-hidden rounded-t-[28px] bg-slate-900 text-slate-100 shadow-2xl pb-[max(20px,env(safe-area-inset-bottom))]" role="dialog" aria-labelledby="icem-h">
    <div class="relative h-[150px] overflow-hidden bg-gradient-to-br from-sky-500 via-blue-800 to-slate-900">${frost}<div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
      <div class="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded bg-white/40"></div>
      <img src="/Bilder/wx/snow.svg" alt="" class="absolute -right-1 top-2 w-[120px]">
      <div class="absolute bottom-4 left-5"><p class="text-[11px] font-extrabold tracking-[.14em] text-sky-200">EIS-CHECK · ${iceMornHM(nowM)}${preview ? ' · VORSCHAU' : ''}</p>
        <p id="icem-h" class="font-barlow text-[34px] font-bold leading-[1.02] text-white">Scheibe vereist</p><p class="text-[13px] text-sky-50">${ICE_LVL[r.lvl]} – jetzt vorklimatisieren</p></div></div>
    <div class="px-5 pt-4">
      <div class="grid grid-cols-3 gap-2">${tile('Eis', r.p + ' %', r.p >= 80 ? 'text-red-400' : 'text-orange-400')}${tile('Scheibe', t(tg) + ' °C', 'text-white')}${tile(dep.learned ? 'Abfahrt (üblich)' : 'Abfahrt', iceMornHM(dep.min), 'text-white')}</div>
      <p class="mt-3 text-[13px] leading-relaxed text-slate-300">${why} Vorklimatisieren braucht bei ${t(tg)} °C etwa <b class="text-white">${dur} Min.</b> – ${when}.</p>
      <a href="${iceMornLink()}" data-icem="open" class="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#78faae] text-[15px] font-extrabold text-[#0e3a2f] active:scale-[.98] transition"><span class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0e3a2f] text-[12px] font-extrabold text-[#78faae]">Š</span>In MySkoda vorklimatisieren ↗</a>
      <div class="mt-2 flex gap-2"><button type="button" data-icem="running" class="h-11 flex-1 rounded-2xl border border-slate-700 text-[13px] font-semibold text-slate-300 active:scale-[.98] transition">Läuft schon ✓</button><button type="button" data-icem="skip" class="h-11 flex-1 rounded-2xl border border-slate-700 text-[13px] font-semibold text-slate-300 active:scale-[.98] transition">Heute nicht</button></div>
      <p class="mt-2.5 text-center text-[11px] text-slate-500">${dep.learned ? 'Abfahrt gelernt aus ' + dep.n + ' Fahrten an diesem Wochentag' : 'Abfahrt aus Einstellungen › Eis-Warnung'} · Eis-Prognose für deinen Stellplatz</p>
    </div></div>`;
  el.classList.remove('hidden'); if (!preview) save(KEY_ICEM, todayYMD());
  const a = el.querySelector('[data-icem=open]'); if (a) a.addEventListener('click', (e) => { e.preventDefault(); iceMornOpenApp(); });
  try { history.pushState({ icem: 1 }, ''); } catch (e) { }
}
function iceMornClose(how, fromPop) {
  const el = $('icem-sheet'); if (!el || el.classList.contains('hidden')) return; el.classList.add('hidden');
  if (how === 'running') appNote('Gute Fahrt – die Scheibe ist gleich frei 🚗');
  if (!fromPop) { try { if (history.state && history.state.icem) { if (how === 'open') history.replaceState(null, ''); else history.back(); } } catch (e) { } }   // „open“: Link soll ungestört aufgehen
}
addEventListener('popstate', () => iceMornClose('back', true));
addEventListener('keydown', (e) => { if (e.key === 'Escape') iceMornClose('later'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => iceMornCheck(), 1500); });
setTimeout(() => iceMornCheck(), 2500);
$('icem-prev').addEventListener('click', () => iceMornCheck(true).then(() => { if (!$('icem-sheet') || $('icem-sheet').classList.contains('hidden')) appNote('Keine Eis-Prognose verfügbar (Wetter-Standort fehlt oder Stellplatz Garage).'); }));
