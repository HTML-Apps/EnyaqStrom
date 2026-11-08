/* =====================================================================
   Einfache Ansicht (Einstellungen → Fahrzeug & Kauf → Ansicht „Einfach“; Einstellung „ui“, wird mitsynchronisiert)
   Gedacht für Mitfahrer ohne Technik-Ehrgeiz (Papa-Modus). Es wird nur ausgeblendet und anders angeordnet, Daten bleiben gleich:
   - Start: Karussell, darunter wischbar Fahrzeugstatus (kompakt) ↔ Langzeitverbrauch, dann Kacheln + Liste zum Auswerten
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
/** Klasse an <html> setzen und alles, was davon abhängt, neu ordnen (Wisch-Karten, Fußleiste) */
function applyUi() {
  const on = isSimple(), was = document.documentElement.classList.contains('simple');
  document.documentElement.classList.toggle('simple', on);
  if (on !== was) { try { dashSwipeSync(); dashSwipeTo(dashDefaultIdx(), false); } catch (e) { } try { renderWxo(); } catch (e) { } }
  easyMark(currentView);
}
const EASY_EVAL_VIEWS = ['eval', 'report', 'history', 'recs', 'tires'];
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
  const n = e.target.closest('[data-easy-nav]'); if (!n) return;
  if (n.dataset.easyNav === 'add') easySheet(true); else showView(n.dataset.easyNav);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('easy-sheet').classList.contains('hidden')) easySheet(false); });
/* showView kennt die Fußleiste der einfachen Ansicht nicht: danach Markierung setzen */
const showViewFull = showView;
showView = function (name) { showViewFull(name); easyMark(name); };
renderEasy(); applyUi();
