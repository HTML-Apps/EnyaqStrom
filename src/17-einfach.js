/* =====================================================================
   Einfache Ansicht (Einstellungen → Fahrzeug & Kauf → Ansicht „Einfach“; Einstellung „ui“, wird mitsynchronisiert)
   Gedacht für Mitfahrer ohne Technik-Ehrgeiz (Papa-Modus). Es wird nur ausgeblendet und anders angeordnet, Daten bleiben gleich:
   - Start: Karussell, darunter wischbar Langzeitverbrauch ↔ Fahrzeugstatus (Standard) ↔ Akkupflege (nimmt deren Höhe an), dann Kacheln + Liste zum Auswerten
   - Verbräuche & Effizienz und Trends stehen nicht auf Start, sondern auf eigenen Seiten (view-eff / view-trends): die Blöcke
     #eff-block und #trends-block werden beim Umschalten dorthin verschoben und in der vollen Ansicht wieder zurück
   - Handy: kein Seitenmenü und kein Menü-Knopf (alles über Kacheln, Glocke, Zahnrad und Fußleiste)
   - Akku: ohne „Mehrkonsum“ (Akku-Temperatur wird nicht notiert) und ohne Ladekurve
   - unten statt fünf Reitern: Start · Erfassen (Auswahl-Blatt) · Auswerten (eigene Seite mit denselben Kacheln)
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
  euro: '<path d="M17 6.5a7 7 0 1 0 0 11"/><path d="M4.5 10h9M4.5 14h9"/>', chev: '<path d="M9 6l6 6-6 6"/>'
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
function renderEasy() {
  $('simple-start').innerHTML = easyEvalHtml(); $('simple-eval').innerHTML = easyEvalHtml();
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
