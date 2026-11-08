/* =====================================================================
   Einfache Ansicht (Einstellungen → Fahrzeug & Kauf → Ansicht „Einfach“; Einstellung „ui“, wird mitsynchronisiert)
   Gedacht für Mitfahrer ohne Technik-Ehrgeiz (Papa-Modus). Es wird nur ausgeblendet und anders angeordnet, Daten bleiben gleich:
   - Start: Karussell, darunter wischbar Langzeitverbrauch ↔ Fahrzeugstatus (Standard) ↔ Akkupflege (nimmt deren Höhe an), dann Kacheln + Liste zum Auswerten
   - Verbräuche & Effizienz und Trends stehen nicht auf Start, sondern auf eigenen Seiten (view-eff / view-trends): die Blöcke
     #eff-block und #trends-block werden beim Umschalten dorthin verschoben und in der vollen Ansicht wieder zurück
   - Handy: kein Seitenmenü und kein Menü-Knopf (alles über Kacheln, Glocke, Zahnrad und Fußleiste)
   - Akku: ohne „Mehrkonsum“ (Akku-Temperatur wird nicht notiert) und ohne Ladekurve
   - unten statt fünf Reitern: Start · Erfassen (Auswahl-Blatt) · Auswerten („Mein Monat“ mit Vergleich und Ersparnis, darunter alle Auswertungen als Liste)
   - ausgeblendet per CSS (html.simple, siehe index.html): Wetter/Prognose, Akku °C, Zählerstand/Live, Bosch, Fahrtenbuch,
     Rekorde/Tempomat, Ladekurve, Akte/Checkheft/Ausstattung, Wissen, Ladekarten, Abzeichen, Wunschliste, Routenplaner, Sprache
   ===================================================================== */
const EASY_ICO = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  batt: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3M6 10v4M9.5 10v4"/>', cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  leaf: '<path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14z"/><path d="M5 19l8-8"/>', trend: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
  pie: '<path d="M12 3.5V12h8.5"/><circle cx="12" cy="12" r="8.5"/>', gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
  tire: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z"/>', map: '<path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
  euro: '<path d="M17 6.5a7 7 0 1 0 0 11"/><path d="M4.5 10h9M4.5 14h9"/>', bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', road: '<path d="M7 20l3-16M17 20l-3-16M12 6v2M12 11v2M12 16v2"/>', chev: '<path d="M9 6l6 6-6 6"/>'
};
const easyIco = (k, cls) => `<svg class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${EASY_ICO[k]}</svg>`;
/* Auswerten: die ersten sechs als Kacheln, der Rest als Liste darunter (Start und Seite „Auswerten“ gleich) */
const EASY_EVAL = [
  ['hist', 'Historie', 'alle Ladungen', 'clock'], ['rep', 'Berichte', 'Monat und Jahr', 'chart'], ['akku', 'Akku', 'Zustand, Garantie', 'batt'],
  ['wrap', 'Rückblick', 'Jahr in Zahlen', 'cal'], ['eff', 'Effizienz', 'Verbrauch, €/km', 'leaf'], ['trends', 'Trends', 'Verlauf je Monat', 'trend'],
  ['stat', 'Statistik', 'Fahrzeugdaten auf einen Blick', 'pie'], ['lt', 'Langzeitverbrauch', 'Verlauf seit Kauf', 'gauge'], ['tires', 'Reifen', 'Profiltiefe und Wechsel', 'tire']
];
const EASY_ADD = [
  ['cap-home', 'Zuhause geladen', 'Zählerstand der Wallbox – Foto oder Zahl', 'home', true], ['cap-away', 'Unterwegs geladen', 'kWh und Preis von der Ladesäule', 'map'],
  ['costs', 'Kosten', 'Werkstatt, Versicherung, Wäsche …', 'euro'], ['lt-in', 'Langzeitverbrauch', 'Wert vom Bordcomputer „Seit Kauf“', 'gauge']
];
const effGoFull = NAV_GO.eff, trendsGoFull = NAV_GO.trends, akkuGoFull = NAV_GO.akku;
let easyFrom = 'dashboard';                                              // Zurück-Pfeil auf Effizienz/Trends: dahin, woher man kam
NAV_GO.eff = () => { if (!isSimple()) return effGoFull(); easyFrom = currentView; showView('eff'); };
NAV_GO.trends = () => { if (!isSimple()) return trendsGoFull(); easyFrom = currentView; showView('trends'); };
NAV_GO.akku = () => { if (isSimple()) setBtTab('pflege', false); akkuGoFull(); };
NAV_GO.lt = () => { recRoute = 'lt'; showView('recs'); };
NAV_GO['lt-in'] = () => { showView('dashboard'); setTimeout(() => { try { dashSwipeTo(dashIdx('ltm-card')); $('dash-swipe').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { } }, 120); };
function easyEvalHtml() {
  const tile = ([k, t, s, i]) => `<button type="button" data-easy-go="${k}" class="flex min-h-[64px] items-center gap-2.5 rounded-[18px] bg-white dark:bg-slate-900 px-3 py-2.5 text-left shadow-sm active:scale-[0.98] transition">${easyIco(i, 'h-[26px] w-[26px] shrink-0 text-emerald-600 dark:text-emerald-400')}<span class="min-w-0"><span class="block truncate text-[15px] font-bold leading-tight">${t}</span><span class="mt-0.5 block truncate text-[11.5px] leading-tight text-slate-500 dark:text-slate-400">${s}</span></span></button>`;
  const row = ([k, t, s, i]) => `<button type="button" data-easy-go="${k}" class="flex w-full min-h-[56px] items-center gap-3 px-3.5 py-2 text-left active:bg-slate-100 dark:active:bg-slate-800 transition">${easyIco(i, 'h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400')}<span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-semibold">${t}</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${s}</span></span>${easyIco('chev', 'h-5 w-5 shrink-0 text-slate-400')}</button>`;
  return `<div class="grid grid-cols-2 gap-2">${EASY_EVAL.slice(0, 6).map(tile).join('')}</div>`
    + `<div class="mt-2 overflow-hidden rounded-[18px] bg-white dark:bg-slate-900 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">${EASY_EVAL.slice(6).map(row).join('')}</div>`;
}
/* Karte „Fahrzeug verbinden“ über den Kacheln: Konto ist freigegeben (SKODA_ACCOUNTS „allow“), aber VIN/Schlüssel fehlen noch; „Später“ blendet sie 14 Tage aus */
const KEY_VEH_LATER = 'enyaq.vehLater';
function easyVehCard() {
  if (typeof vehicle === 'undefined' || !vehicle.allowed || vehicle.ok || !(window.cloud && window.cloud.isSignedIn && window.cloud.isSignedIn())) return '';
  if (Date.now() < (Number(load(KEY_VEH_LATER, 0)) || 0)) return '';
  return `<div class="mb-2 flex items-center gap-3 rounded-[18px] bg-white dark:bg-slate-900 p-3.5 shadow-sm"><svg class="h-7 w-7 shrink-0 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M4 16h16v3H4z"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></svg>
    <div class="min-w-0 flex-1"><p class="text-[15px] font-bold leading-tight">Fahrzeug verbinden</p><p class="mt-0.5 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">Akku, Reichweite und Schloss direkt vom Auto</p></div>
    <div class="flex shrink-0 flex-col items-end gap-1"><button type="button" data-easy-veh="go" class="rounded-xl bg-sky-600 px-3 py-2 text-[13px] font-semibold text-white active:scale-95 transition">Verbinden</button><button type="button" data-easy-veh="later" class="px-1 text-xs text-slate-500 dark:text-slate-400">Später</button></div></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-easy-veh]'); if (!b) return;
  if (b.dataset.easyVeh === 'go') vehSheet(); else { save(KEY_VEH_LATER, Date.now() + 14 * 864e5); renderEasy(); }
});
function renderEasy() {
  $('simple-start').innerHTML = easyVehCard() + easyEvalHtml(); renderEvalMonth();
  $('easy-sheet-list').innerHTML = EASY_ADD.map(([k, t, s, i, prim]) => `<button type="button" data-easy-go="${k}" class="flex w-full items-center gap-3.5 rounded-[20px] px-4 py-3.5 text-left active:scale-[0.98] transition ${prim ? 'bg-emerald-700 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${easyIco(i, 'h-7 w-7 shrink-0 ' + (prim ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'))}<span class="min-w-0 flex-1"><span class="block text-[16.5px] font-bold">${t}</span><span class="mt-0.5 block text-[12.5px] ${prim ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}">${s}</span></span>${easyIco('chev', 'h-5 w-5 shrink-0 ' + (prim ? 'text-white' : 'text-slate-400'))}</button>`).join('');
}
/* Start-Karte „Akkupflege“: Schonungs-Wert der letzten 90 Tage (batCare) kurz und mit einem Tipp; Tipp auf die Karte → Akku › Pflege */
function renderCareSlide() {
  const el = $('care-slide'); if (!el) return;
  el.classList.toggle('hidden', !isSimple()); if (!isSimple()) return;
  const c = batCare(Date.now(), '90');
  const head = `<div class="flex items-baseline justify-between gap-2"><p class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Akkupflege</p><span class="shrink-0 text-xs font-semibold text-sky-700 dark:text-sky-300">Details ›</span></div>`;
  if (c.score == null) {
    el.innerHTML = head + `<div class="mt-3 flex items-center gap-3.5">${easyIco('batt', 'h-12 w-12 shrink-0 text-slate-300 dark:text-slate-600')}<div class="min-w-0"><p class="text-lg font-semibold">Noch zu wenige Ladungen</p><p class="mt-0.5 text-[13px] leading-snug text-slate-600 dark:text-slate-300">Die Bewertung startet ab 5 Ladungen mit Akku-% am Anfang und Ende (bisher ${c.n}).</p></div></div>`;
    return;
  }
  const lvl = c.score >= 90 ? ['Sehr gut', '#10b981'] : c.score >= 75 ? ['Gut', '#22c55e'] : c.score >= 60 ? ['Okay', '#f59e0b'] : ['Verbesserbar', '#ef4444'];
  const tip = (1 - c.ok80) > 0.3 ? 'Im Alltag bis 80 % laden, 100 % nur vor langen Fahrten.' : c.lo ? 'Nicht unter 10 % fahren – lieber früher anstecken.'
    : c.full ? 'Voll laden ist in Ordnung, wenn du danach bald losfährst.' : 'Weiter so – zwischen 20 und 80 % fühlt sich der Akku wohl.';
  const len = 97.4, dash = (c.score / 100 * len).toFixed(1);
  el.innerHTML = head + `<div class="mt-2 flex items-center gap-3">
      <div class="relative h-16 w-16 shrink-0"><svg viewBox="0 0 36 36" class="h-16 w-16 -rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-width="3.5"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${lvl[1]}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash} ${len}"/></svg>
        <span class="absolute inset-0 flex items-center justify-center font-barlow text-[26px] font-bold leading-none">${c.score}</span></div>
      <div class="min-w-0"><p class="text-[17px] font-semibold leading-6" style="color:${lvl[1]}">${lvl[0]}</p><p class="text-[13px] leading-[18px] text-slate-600 dark:text-slate-300">${tip}</p></div></div>
    <div class="min-h-1 flex-1"></div>
    <p class="truncate text-xs leading-4 text-slate-500 dark:text-slate-400">Bis 80 %: <b class="${c.ok80 >= 0.7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">${Math.round(c.ok80 * 100)} %</b> · unter 10 %: <b class="${c.lo ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${c.lo ? c.lo + ' ×' : 'nie'}</b> · 90 Tage</p>`;
}
$('care-slide').addEventListener('click', () => NAV_GO.akku());
$('care-slide').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NAV_GO.akku(); } });
/** Effizienz und Trends: in der einfachen Ansicht auf eigene Seiten, sonst zurück auf Start (unter die Überschriften) */
function easyMove(on) {
  const eb = $('eff-block'), tb = $('trends-block');
  if (on) { if (eb.parentElement.id !== 'eff-host') $('eff-host').appendChild(eb); if (tb.parentElement.id !== 'trends-host') $('trends-host').appendChild(tb); }
  else { if (eb.parentElement.id === 'eff-host') $('sec-eff').after(eb); if (tb.parentElement.id === 'trends-host') $('sec-trends').after(tb); }
}
/* =====================================================================
   Seite „Auswerten“: Mein Monat – Geladen, Stromkosten, Gefahren, Verbrauch mit Vergleich zum Vormonat, Ersparnis gegenüber dem
   Vergleichs-Benziner (Einstellungen → Fahrtenbuch, cmpCar) im Monat und seit Kauf; darunter alle Auswertungen als Liste.
   Standard ist der letzte abgeschlossene Monat; der laufende Monat ist erreichbar, dort ohne Vergleichspfeile (noch unvollständig).
   ===================================================================== */
let evalMon = null;                                                      // Monatsabstand zum aktuellen Monat (0 = laufend, −1 = Vormonat …)
function evalMonthStats(off) {
  const n = new Date(), t0 = new Date(n.getFullYear(), n.getMonth() + off, 1).getTime(), t1 = Math.min(new Date(n.getFullYear(), n.getMonth() + off + 1, 1).getTime() - 1, Date.now());
  return wrStats({ t0, t1 });
}
function renderEvalMonth() {
  const el = $('simple-eval'); if (!el) return;
  const n = new Date(), [py, pm] = purchaseDay().split('-').map(Number), minOff = (py - n.getFullYear()) * 12 + (pm - 1 - n.getMonth());
  if (evalMon == null) evalMon = Math.max(minOff, -1);
  evalMon = Math.min(0, Math.max(minOff, evalMon));
  const d = new Date(n.getFullYear(), n.getMonth() + evalMon, 1), mName = MONTHS_LONG[d.getMonth()], cur = evalMon === 0;
  const st = evalMonthStats(evalMon), pv = !cur && evalMon > minOff ? evalMonthStats(evalMon - 1) : null, pvName = MONTHS_LONG[new Date(d.getFullYear(), d.getMonth() - 1, 1).getMonth()];
  /* Pfeil: Veränderung zum Vormonat; good = 'down' (weniger ist besser), 'up' oder null (neutral) */
  const cmp = (a, b, dec, unit, good) => {
    if (!pv || a == null || b == null || !(b > 0) || !(a > 0)) return '<p class="mt-1 h-4 text-xs text-slate-500 dark:text-slate-400">' + (cur ? 'läuft noch' : '&nbsp;') + '</p>';
    const dv = a - b, r = Math.round(Math.abs(dv) * Math.pow(10, dec)) / Math.pow(10, dec);
    if (!r) return '<p class="mt-1 h-4 text-xs font-semibold text-slate-500 dark:text-slate-400">= wie im ' + pvName + '</p>';
    const ok = good == null ? null : (dv < 0) === (good === 'down'), cls = ok == null ? 'text-slate-500 dark:text-slate-400' : ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
    return `<p class="mt-1 h-4 text-xs font-semibold ${cls}">${dv > 0 ? '▲ +' : '▼ −'}${fmt(r, dec)} ${unit}</p>`;
  };
  const tile = (i, l, v, u, c) => `<div class="min-w-0 rounded-[18px] bg-white dark:bg-slate-900 px-3 py-2.5 shadow-sm"><p class="flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">${easyIco(i, 'h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400')}${l}</p>
      <p class="mt-1 flex items-baseline gap-1 whitespace-nowrap"><span class="font-barlow text-[32px] font-bold leading-none tabular-nums">${v}</span><span class="text-[13px] text-slate-500 dark:text-slate-400">${u}</span></p>${c}</div>`;
  const has = st.n > 0 || st.km > 0, k100 = st.kwh100;
  const cc = cmpCar(), sav = (x) => (x.km || 0) * cc.l / 100 * cc.eur - (x.laden || 0);
  const all = wrStats({ t0: new Date(py, pm - 1, Number(purchaseDay().split('-')[2])).getTime(), t1: Date.now() });
  const btn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 active:scale-95 transition disabled:opacity-30';
  el.innerHTML = `<div class="flex items-center gap-2"><button type="button" data-em="-1" aria-label="Vormonat" class="${btn}" ${evalMon <= minOff ? 'disabled' : ''}><svg class="h-5 w-5 rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${EASY_ICO.chev}</svg></button>
      <p class="min-w-0 flex-1 truncate text-center text-lg font-bold" aria-live="polite">${mName} ${d.getFullYear()}${cur ? ' <span class="text-sm font-normal text-slate-500 dark:text-slate-400">bis heute</span>' : ''}</p>
      <button type="button" data-em="1" aria-label="Nächster Monat" class="${btn}" ${cur ? 'disabled' : ''}><svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${EASY_ICO.chev}</svg></button></div>
    ${has ? `<div class="mt-2.5 grid grid-cols-2 gap-2">
      ${tile('bolt', 'Geladen', fmt(st.kwh, 0), 'kWh', cmp(st.kwh, pv && pv.kwh, 0, 'kWh', null))}
      ${tile('euro', 'Stromkosten', fmt(st.laden, 2), '€', cmp(st.laden, pv && pv.laden, 2, '€', 'down'))}
      ${tile('road', 'Gefahren', st.km > 0 ? fmt(st.km, 0) : '–', 'km', cmp(st.km, pv && pv.km, 0, 'km', null))}
      ${tile('gauge', 'Verbrauch', k100 != null ? fmt(k100, 1) : '–', 'kWh/100', cmp(k100, pv && pv.kwh100, 1, '', 'down'))}</div>
    ${pv ? `<p class="mt-1.5 px-1 text-left text-xs text-slate-500 dark:text-slate-400">Pfeile: Vergleich mit ${pvName}</p>` : ''}
    ${st.km > 0 ? `<div class="mt-2.5 rounded-[22px] bg-gradient-to-br from-emerald-800 to-emerald-700 px-3.5 py-3 text-white shadow-sm"><p class="flex items-center gap-2 text-[13px] text-emerald-100">${easyIco('leaf', 'h-[18px] w-[18px] shrink-0')}${sav(st) >= 0 ? 'Gespart' : 'Mehr bezahlt'} gegenüber Benziner</p>
      <div class="mt-1 flex items-end justify-between gap-3"><p class="whitespace-nowrap"><span class="font-barlow text-[40px] font-bold leading-none">${fmt(Math.abs(sav(st)), 0)} €</span><span class="ml-1.5 text-[13px] text-emerald-100">im ${mName}</span></p>
      ${all.km > 0 ? `<p class="text-right"><span class="block font-barlow text-[22px] font-bold leading-none">${fmt(sav(all), 0)} €</span><span class="text-[11.5px] text-emerald-100">seit Kauf</span></p>` : ''}</div>
      <p class="mt-1.5 text-left text-[11.5px] text-emerald-100/90">Vergleich: ${fmt(cc.l, 1)} l/100 km zu ${fmt(cc.eur, 2)} €/l Sprit</p></div>` : ''}`
    : `<div class="mt-2.5 rounded-[18px] bg-white dark:bg-slate-900 px-4 py-6 text-center shadow-sm"><p class="font-semibold">Im ${mName} wurde nichts erfasst</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Zum Erfassen unten auf das Plus tippen.</p></div>`}
    <p class="mb-1.5 mt-4 px-1 text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Mehr Details</p>
    <div class="overflow-hidden rounded-[18px] bg-white dark:bg-slate-900 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">${EASY_EVAL.map(([k, t, , i]) => `<button type="button" data-easy-go="${k}" class="flex w-full min-h-[50px] items-center gap-3 px-3.5 py-2 text-left active:bg-slate-100 dark:active:bg-slate-800 transition">${easyIco(i, 'h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400')}<span class="min-w-0 flex-1 truncate text-[15px] font-semibold">${t}</span>${easyIco('chev', 'h-5 w-5 shrink-0 text-slate-400')}</button>`).join('')}</div>`;
}
$('simple-eval').addEventListener('click', (e) => { const b = e.target.closest('[data-em]'); if (!b || b.disabled) return; evalMon += Number(b.dataset.em); renderEvalMonth(); });
/** Klasse an <html> setzen und alles, was davon abhängt, neu ordnen (Wisch-Karten, Fußleiste) */
function applyUi() {
  const on = isSimple(), was = document.documentElement.classList.contains('simple');
  document.documentElement.classList.toggle('simple', on); easyMove(on);
  if (on && (btTab === 'mehr' || btTab === 'kurve')) setBtTab('pflege', false);
  renderCareSlide();
  if (on !== was) { try { dashSwipeSync(); dashSwipeTo(dashDefaultIdx(), false); } catch (e) { } try { renderWxo(); } catch (e) { } }
  easyMark(currentView);
}
const EASY_EVAL_VIEWS = ['eval', 'report', 'history', 'recs', 'tires', 'eff', 'trends'];
function easyMark(name) {
  document.querySelectorAll('[data-easy-nav]').forEach(b => {
    const k = b.dataset.easyNav, on = k === 'dashboard' ? name === 'dashboard' : k === 'eval' ? EASY_EVAL_VIEWS.includes(name) : name === 'capture' || name === 'costs';
    b.classList.toggle('text-emerald-600', on); b.classList.toggle('dark:text-emerald-400', on); b.classList.toggle('text-slate-500', !on); b.classList.toggle('dark:text-slate-400', !on);
    if (k !== 'add') { if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  });
}
function easySheet(open) {
  const s = $('easy-sheet'); s.classList.toggle('hidden', !open);
  if (open) { document.body.style.overflow = 'hidden'; setTimeout(() => { const b = s.querySelector('[data-easy-go]'); if (b) b.focus(); }, 30); } else document.body.style.overflow = '';
}
const easyGo = (k) => { easySheet(false); const f = NAV_GO[k]; if (f) f(); };
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-easy-go]'); if (g) { easyGo(g.dataset.easyGo); return; }
  if (e.target.closest('[data-easy-close]')) { easySheet(false); return; }
  if (e.target.closest('[data-easy-menu]')) { openNavDrawer(); return; }
  if (e.target.closest('[data-easy-back]')) { showView(['eff', 'trends'].includes(easyFrom) ? 'dashboard' : easyFrom || 'dashboard'); return; }
  const n = e.target.closest('[data-easy-nav]'); if (!n) return;
  if (n.dataset.easyNav === 'add') easySheet(true); else showView(n.dataset.easyNav);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('easy-sheet').classList.contains('hidden')) easySheet(false); });
/* showView kennt die Fußleiste der einfachen Ansicht nicht: danach Markierung setzen */
const showViewFull = showView;
showView = function (name) {
  showViewFull(name); easyMark(name);
  if (name === 'eval') { try { renderEvalMonth(); } catch (e) { console.error(e); } }
  if (name === 'eff' || name === 'trends') { try { renderDashboard(); } catch (e) { } setTimeout(() => { ['chart', 'loss-chart'].forEach(id => { try { const ch = Chart.getChart($(id)); if (ch) ch.resize(); } catch (e) { } }); }, 30); window.scrollTo(0, 0); }
};
/* Handy: kein Seitenmenü (auch nicht per Wischen vom linken Rand oder Tastenkürzel); am PC bleibt es als Navigation stehen */
const openNavDrawerFull = openNavDrawer;
openNavDrawer = function () { if (isSimple() && !isDesk()) return; openNavDrawerFull(); };
/* Akku: Mehrkonsum und Kurve gibt es in der einfachen Ansicht nicht */
const setBtTabFull = setBtTab;
setBtTab = function (t, anim) { if (isSimple() && (t === 'mehr' || t === 'kurve')) t = 'pflege'; setBtTabFull(t, anim); };
/* Start neu gezeichnet (neue Ladung, Sync …): Akkupflege-Karte mitziehen */
const renderDashboardFull = renderDashboard;
renderDashboard = function () { const r = renderDashboardFull.apply(this, arguments); try { renderCareSlide(); } catch (e) { } return r; };
renderEasy(); applyUi();
