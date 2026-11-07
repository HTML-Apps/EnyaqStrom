/* =====================================================================
   Konfiguration & Speicher
   ===================================================================== */
/* KI-Zählererkennung (Kamera + OpenAI): false = Karte unsichtbar, Kamera startet nicht. Zum Aktivieren auf true setzen. */
const ENABLE_AI_SCAN = false;
const KEY_READINGS = 'enyaq.readings';
const KEY_SETTINGS = 'enyaq.settings';
const KEY_COSTS = 'enyaq.costs';                // Kosten (lokal + Cloud-Sammlung enyaqStrom/<uid>/costs)
const KEY_RECUR = 'enyaq.recurring';            // wiederkehrende Kosten (lokal + Cloud-Sammlung enyaqStrom/<uid>/recurring)
const KEY_REMINDERS = 'enyaq.reminders';        // Erinnerungen (lokal + Cloud-Sammlung enyaqStrom/<uid>/reminders)
const KEY_CATEGORIES = 'enyaq.categories';      // Kosten-Kategorien (lokal + Cloud-Dokument enyaqStrom/<uid>/settings/categories)
const KEY_WXLOC = 'enyaq.wxLoc';                 // Wetter-Standort { lat, lon, label } (lokal + Cloud-Dokument enyaqStrom/<uid>/settings/prefs)
const KEY_WXCACHE = 'enyaq.wxCache';             // letzte Regen-Vorhersage (30 Min. gültig, offline als Notlösung)
const KEY_WRAP = 'enyaq.wrapSeen';               // Liste der Rückblick-IDs, die schon angesehen bzw. weggewischt wurden (nur lokal)
const KEY_TEMPS = 'enyaq.temps';                 // Tagesmittel-Temperaturen { loc, days:{ 'JJJJ-MM-TT': °C } } vom Standort (nur lokal)
const KEY_PROVIDERS = 'enyaq.providers';          // Ladeanbieter für "Unterwegs" (lokal + Cloud-Dokument enyaqStrom/<uid>/settings/providers)
const PROXY_URL = '/api/read-meter';   // Vercel-Funktion; der Prompt und der OpenAI-Key liegen dort

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 1) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const parseNum = (s) => parseFloat(String(s).trim().replace(',', '.'));

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { console.error('localStorage lesen fehlgeschlagen', e); return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.error('localStorage schreiben fehlgeschlagen', e); alert('Speichern im Browser nicht möglich (Speicher voll oder gesperrt).'); return false; }
}
const getReadings = () => load(KEY_READINGS, []);

/* =====================================================================
   Ladeorte: Zuhause (eigener Zähler) | Bosch | Unterwegs.
   Einträge ohne Feld "place" gelten als Zuhause (alte Daten bleiben gültig).
   Zuhause: totalReading/consumedSinceLast/cost kommen vom Zähler (Kette nur über Zuhause-Einträge).
   Bosch/Unterwegs: kein Zähler. consumedSinceLast = geladene kWh (0 = unbekannt), cost = kWh x pricePerKwh (0 = unbekannt),
   totalReading = letzter Zuhause-Stand (nur mitgeführt, damit ältere App-Versionen die Kette nicht zerlegen).
   Km- und Akku-Kette (Verbrauch/100 km) läuft dagegen über ALLE Einträge, weil das Auto durchgehend ist.
   ===================================================================== */
const PLACES = { home: 'Zuhause', bosch: 'Bosch', away: 'Unterwegs' };
const PLACE_KEYS = Object.keys(PLACES);
const VIEWS = { ...PLACES, all: 'Gesamt' };                         // Auswahl in Dashboard/Bericht: die drei Orte + Gesamt (Mix aus allen)
const inView = (r, p) => p === 'all' || placeOf(r) === p;           // gehört der Eintrag zur gewählten Ansicht?
const whereTxt = (p) => p === 'home' || p === 'all' ? '' : ' bei „' + PLACES[p] + '“';
const placeOf = (r) => PLACES[r?.place] ? r.place : 'home';
const isHome = (r) => placeOf(r) === 'home';
const prevHomeIdx = (rs, i) => { for (let j = i - 1; j >= 0; j--) if (isHome(rs[j])) return j; return -1; };   // Vorgänger am Zähler
const lastHome = (rs = getReadings()) => { const j = prevHomeIdx(rs, rs.length); return j >= 0 ? rs[j] : null; };
/** Erster Zuhause-Eintrag ohne Zähler-Reset = reiner Startwert ohne Ladung. */
const isStartRow = (rs, i) => isHome(rs[i]) && prevHomeIdx(rs, i) < 0 && !rs[i].meterReset;
/** Zählt der Eintrag als Ladung? Zuhause: geladene kWh > 0 (kein Startwert); Bosch/Unterwegs: jeder Eintrag. */
const isCharge = (rs, i) => isHome(rs[i]) ? !isStartRow(rs, i) && rs[i].consumedSinceLast > 0 : true;
/** Preis pro kWh dieses Eintrags: Zuhause aus den gespeicherten Werten (Einstellungen zum Zeitpunkt), sonst der eingetragene Preis (oder null). */
/** Komfortenergie einer Ladung (Heizen/Kühlen am Kabel laut MyŠkoda-App) in kWh: kam vom Zähler, aber nicht in den Akku */
const comfortOf = (r) => Number(r && r.comfort) > 0 ? Number(r.comfort) : 0;
const unitOf = (r) => isHome(r) ? (r.consumedSinceLast > 0 ? r.cost / r.consumedSinceLast : getSettings().price) : (r.pricePerKwh ?? null);
const PLACE_BADGE = { bosch: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', away: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200' };
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));   // Namen von Hand eingegeben -> vor innerHTML maskieren
const getProviders = () => { const l = load(KEY_PROVIDERS, []); return Array.isArray(l) ? l.filter(n => typeof n === 'string' && n.trim()) : []; };
const providerOptions = (selected) => {              // <option>-Liste: leer + Anbieter (ein nicht mehr gelistetes, aber gespeichertes Ziel bleibt wählbar)
  const list = getProviders(); if (selected && !list.includes(selected)) list.push(selected);
  return '<option value="">–</option>' + list.map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
};
/* Kosten: { id, date, title, amount (negativ = Einnahme), category, note?, odometerKm?, guid? (aus früherem Import, wird nur mitgeführt) } */
const DEFAULT_CATEGORIES = ['Service', 'Reparatur', 'TÜV', 'Wartung', 'Versicherung', 'Anmeldung', 'Fahrzeugwäsche', 'Parken', 'Maut', 'Strafzettel/Gebühren', 'Tuning', 'Sonstiges'];
const getCosts = () => { const l = load(KEY_COSTS, []); return Array.isArray(l) ? l : []; };
const getCategories = () => { const l = load(KEY_CATEGORIES, null); return Array.isArray(l) ? l.filter(n => typeof n === 'string' && n.trim()) : DEFAULT_CATEGORIES.slice(); };
const costAmt = (c) => Number(c.amount) || 0;
/* Checkheft-Arten: fest Service (planmäßig, Werkstatt), Reparatur (außerplanmäßig) und TÜV; erkannt am Namen der Kosten-Kategorie */
const KEY_CHCATS = 'enyaq.chCats';
const CH_TYPES = [
  { k: 'service', n: 'Service', bg: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', txt: 'text-sky-700 dark:text-sky-300' },
  { k: 'rep', n: 'Reparatur', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', txt: 'text-amber-700 dark:text-amber-300' },
  { k: 'tuev', n: 'TÜV', bg: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', txt: 'text-violet-700 dark:text-violet-300' }];
const chType = (cat) => { const c = String(cat || '').trim().toLowerCase(); return c === 'service' ? CH_TYPES[0] : c === 'reparatur' ? CH_TYPES[1] : (c === 'tüv' || c === 'tuev') ? CH_TYPES[2] : null; };
const catOptions = (selected) => {                    // <option>-Liste der Kategorien (eine nicht mehr gelistete, aber gespeicherte bleibt wählbar)
  const l = getCategories(); if (selected && !l.includes(selected)) l.push(selected);
  return '<option value="">Ohne Kategorie</option>' + l.map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
};
/** Hebt in einer Segment-Auswahl den aktiven Button hervor (key = Name des data-Attributs). */
function segPaintKey(sel, key, active) {
  document.querySelectorAll(sel).forEach(b => {
    const on = b.dataset[key] === active;
    b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-700', on); b.classList.toggle('shadow-sm', on);
  });
}
let capPlace = 'home', dashPlace = 'home', repPlace = 'home', repMode = 'laden', histFilter = 'all';      // gewählter Ladeort in Erfassen / Dashboard / Bericht
/** Hebt in einer Segment-Auswahl (Buttons mit data-place) den aktiven Ort hervor. */
function segPaint(sel, active) {
  document.querySelectorAll(sel).forEach(b => {
    const on = b.dataset.place === active;
    b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-700', on); b.classList.toggle('shadow-sm', on);
  });
}
const DEFAULT_BATTERY_KWH = 52;   // Standardwert (nutzbare Kapazität Enyaq iV 50); einstellbar unter Einstellungen
const batteryKwh = () => { const v = Number(getSettings().battery); return v > 0 ? v : DEFAULT_BATTERY_KWH; };
/** Vorbelegung: letzter bekannter km-Stand als grauer Hinweis (Platzhalter), Akku Ende standardmäßig 80 %. */
/* =====================================================================
   Erfassen-Optik: editierbare Segmentanzeige, Trommel-Kilometerzähler, Akku mit zwei Reglern.
   Die versteckten Felder km-Input, soc0-input und soc1-input bleiben die Datenquelle für das Speichern.
   ===================================================================== */
const odoCols = [];
(function buildOdo() {
  for (let i = 0; i < 6; i++) {
    const drum = document.createElement('div'), col = document.createElement('div');
    drum.className = 'odo-drum'; col.className = 'odo-col';
    col.innerHTML = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => '<div>' + n + '</div>').join('');   // 9 vorn und 0 hinten: Nachbarziffer lugt an den Rändern hervor
    drum.appendChild(col); $('odo').appendChild(drum); odoCols.push(col);
  }
})();

/** Trommeln auf den km-Stand drehen (reset = erst auf 0 zurücksetzen, damit die Drehung sichtbar wird). */
function paintOdo(reset) {
  $('btn-odo').classList.toggle('hidden', !apiEnabled());                // Update-Button nur mit Škoda-Anbindung
  const kmVal = optNum($('km-input').value), fromCar = kmVal != null && isFinite(kmVal);
  const withKm = getReadings().filter(r => r.odometerKm != null), last = withKm[withKm.length - 1];
  const shown = fromCar ? kmVal : (last ? last.odometerKm : 0);
  $('odo').classList.toggle('odo-dim', !fromCar);
  const manual = $('km-input').dataset.manual === $('km-input').value;                   // von Hand eingegeben (nicht vom Auto)
  const warn = fromCar && last && kmVal < last.odometerKm;                                  // kleiner als der letzte gespeicherte Stand
  $('odo-info').textContent = warn ? 'Kleiner als ' + fmt(last.odometerKm, 0) + ' – wird gespeichert'
    : fromCar ? (manual ? 'Von Hand' : 'Stand vom Auto') + ' – wird gespeichert' : (last ? 'Letzter Stand – keine Sicherung' : 'Kein Stand vorhanden – keine Sicherung');
  $('odo-info').classList.toggle('text-amber-600', !!warn); $('odo-info').classList.toggle('dark:text-amber-400', !!warn);
  if (reset) { odoCols.forEach(c => { c.style.transition = 'none'; c.style.transform = 'translateY(0)'; }); void $('odo').offsetWidth; }
  const t = String(Math.min(999999, Math.max(0, Math.round(shown)))).padStart(6, '0');
  odoCols.forEach((c, i) => { c.style.transition = ''; c.style.transitionDelay = (i * 90) + 'ms'; c.style.transform = 'translateY(calc(-2.4rem * ' + t[i] + '))'; });
}

/** Kilometerstand von Hand eingeben (Antippen der Trommeln oder Button "Eingeben"). Leeres Feld = kein km-Stand speichern. */
function openKmEdit() {
  const withKm = getReadings().filter(r => r.odometerKm != null), last = withKm[withKm.length - 1];
  $('km-edit').value = $('km-input').value !== '' ? $('km-input').value : (last ? Math.round(last.odometerKm) : '');
  $('km-edit-row').classList.remove('hidden'); $('km-edit').focus(); $('km-edit').select();
}
function closeKmEdit() { $('km-edit-row').classList.add('hidden'); }
function commitKmEdit() {
  const raw = $('km-edit').value.trim();
  if (raw === '') { $('km-input').value = ''; delete $('km-input').dataset.manual; delete $('km-input').dataset.live; closeKmEdit(); paintOdo(true); return; }
  const v = parseFloat(raw.replace(/[.\s]/g, '').replace(',', '.'));      // "42.310" = 42310 (Punkt als Tausendertrenner), Komma = Dezimalstelle
  if (!isFinite(v) || v < 0 || v > 999999) { $('odo-info').textContent = 'Ungültig – erlaubt: 0 bis 999999'; return; }
  const km = Math.round(v);
  $('km-input').value = km; $('km-input').dataset.manual = String(km); delete $('km-input').dataset.live;   // von Hand gesetzt: wird beim Verwerfen der Simulation nicht gelöscht
  closeKmEdit(); paintOdo(true);
}
$('btn-km-edit').addEventListener('click', openKmEdit);
$('odo').addEventListener('click', openKmEdit);
$('km-edit-ok').addEventListener('click', commitKmEdit);
$('km-edit-cancel').addEventListener('click', closeKmEdit);
$('km-edit').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitKmEdit(); } else if (e.key === 'Escape') closeKmEdit(); });

function paintReading() {
  const raw = $('reading-input').value, v = parseNum(raw), ok = raw.trim() !== '' && isFinite(v) && v >= 0;
  $('seg2-on').textContent = ok ? Math.min(v, 999999.9).toFixed(1).padStart(8, '0') : '';       // wie im Dashboard; leer = nur Geistersegmente
  const last = lastHome(), calc = $('reading-calc');
  const kwh = ok && last ? Math.round((v - last.totalReading) * 10) / 10 : null;
  $('reading-last').textContent = last ? 'Letzter Stand ' + fmt(last.totalReading) + ' kWh' : '';         // steht neben der Überschrift (spart Höhe)
  calc.className = 'text-sm text-right mt-1.5 ' + (kwh != null && kwh < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400');
  calc.classList.toggle('hidden', kwh == null);                                   // Rechenzeile nur, wenn ein Wert eingegeben ist
  calc.textContent = kwh == null ? ''
    : kwh >= 0 ? '+' + fmt(kwh) + ' kWh seit letztem Eintrag · ' + eur(kwh * getSettings().price) : 'Kleiner als der letzte Stand (' + fmt(last.totalReading) + ')';
}

function paintBatt() {
  const n0 = optNum($('soc0-input').value), n1 = optNum($('soc1-input').value);
  const has0 = n0 != null && isFinite(n0), has1 = n1 != null && isFinite(n1), a = has0 ? n0 : 0, b = has1 ? n1 : a;
  $('bt-a').style.width = a + '%';                                         // dunkelgrün: vorhandener Ladestand
  $('bt-b').style.left = a + '%'; $('bt-b').style.width = Math.max(0, b - a) + '%';   // hellgrün: hinzukommende Ladung
  $('bt-h0').style.left = a + '%'; $('bt-h1').style.left = b + '%';        // Griffe auf der Batterie
  $('bt-h0').setAttribute('aria-valuenow', a); $('bt-h1').setAttribute('aria-valuenow', b);
  const place = (id, pct) => { $(id).style.left = Math.min(88, Math.max(12, pct)) + '%'; };
  place('bt-lab0', Math.min(a, 64)); place('bt-lab1', Math.max(b, Math.min(a, 64) + 28));   // einzeilige Beschriftungen nicht übereinander
  $('bt-v0').textContent = has0 ? a + ' %' : '–'; $('bt-v1').textContent = has1 ? b + ' %' : '–';
  $('s0-val').textContent = has0 ? a + ' %' : '–'; $('s1-val').textContent = has1 ? b + ' %' : '–';
  const ad = $('batt-add'); ad.style.left = a + '%'; ad.style.width = Math.max(0, b - a) + '%';   // im hinzukommenden Teil der Batterie
  ad.textContent = has0 && has1 && b - a >= 12 ? '+' + (b - a) + ' %' + (b - a >= 40 ? ' ≈ ' + fmt((b - a) / 100 * batteryKwh(), 1) + ' kWh' : '') : '';
}
function paintCapture() { paintReading(); paintBatt(); paintBattTemp(); }
/* Akku-Temperatur (optional, Infotainment ab ME3.8): Stepper −/+ in 1-°C-Schritten. Leer zeigt grau den zuletzt gespeicherten Wert; Mitte antippen übernimmt ihn (bzw. leert), erster −/+ startet dort */
const BT_MIN = -30, BT_MAX = 60;
/** Zuletzt gespeicherte Akku-Temperatur: neuester Wert aus Ladungen (battTemp) und Rekorde → Akku °C */
function lastBattTemp() {
  let best = null; const take = (t, v) => { if (Number.isFinite(t) && Number.isFinite(v) && (!best || t > best.t)) best = { t, v }; };
  try { getReadings().forEach(r => take(Date.parse(r.date), r.battTemp)); } catch (e) { }
  try { const o = load(KEY_LAB, null); (o && o.bt || []).forEach(e => take(Date.parse(e.at), e.t)); } catch (e) { }
  return best;
}
function paintBattTemp() {
  const v = optNum($('bt-input').value), el = $('bt-val');
  if (v != null && !Number.isNaN(v)) { el.textContent = String(v).replace('-', '−') + ' °C'; el.className = 'font-medium'; return; }
  const l = lastBattTemp(); el.className = 'font-medium text-slate-400 dark:text-slate-500';
  el.textContent = l ? 'zuletzt ' + String(Math.round(l.v)).replace('-', '−') + ' °C · ' + (new Date(l.t).toDateString() === new Date().toDateString() ? 'heute ' + hhmm(l.t) : new Date(l.t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })) : '–';
}
(() => {
  const step = (d) => { const v = optNum($('bt-input').value); const n = v == null || Number.isNaN(v) ? (lastBattTemp() ? Math.round(lastBattTemp().v) : 20) : Math.max(BT_MIN, Math.min(BT_MAX, v + d)); $('bt-input').value = String(n); paintBattTemp(); };
  [['bt-minus', -1], ['bt-plus', 1]].forEach(([id, d]) => {
    const b = $(id); let t1 = 0, t2 = 0; const stop = () => { clearTimeout(t1); clearInterval(t2); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(d); t1 = setTimeout(() => { t2 = setInterval(() => step(d), 110); }, 450); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop)); b.addEventListener('contextmenu', e => e.preventDefault());
  });
  $('bt-clear').addEventListener('click', () => { const v = optNum($('bt-input').value), l = lastBattTemp(); $('bt-input').value = (v == null || Number.isNaN(v)) && l ? String(Math.round(l.v)) : ''; paintBattTemp(); });   // leer: letzten Wert übernehmen, sonst leeren
})();

$('reading-input').addEventListener('input', e => { delete e.target.dataset.live; paintReading(); });
/* =====================================================================
   Datenprüfung: findet auffällige Einträge. Ignorierte Hinweise werden lokal gemerkt (Eintrag-ID:Code).
   ===================================================================== */
const DQ_KEY = 'enyaq.dqIgnore';
function dataChecks(rs) {
  const out = [], add = (i, code, msg) => out.push({ i, code, id: rs[i].id, msg });
  let maxKm = null;
  rs.forEach((r, i) => {
    const s = entryStats(rs, i), home = isHome(r);
    if (home && !isStartRow(rs, i) && r.consumedSinceLast === 0) add(i, 'zero', 'Keine kWh seit dem letzten Eintrag – doppelt gespeichert oder der Zähler nicht abgelesen?');
    if (r.consumedSinceLast > capOf(r) * 1.3) add(i, 'big', fmt(r.consumedSinceLast) + (home ? ' kWh sind mehr als die Batteriekapazität – Zähler zurückgesetzt, aber nicht markiert?' : ' kWh sind mehr als die Batteriekapazität – kWh-Angabe prüfen.'));
    if (i > 0 && placeOf(r) === placeOf(rs[i - 1])) {
      const gap = Date.parse(r.date) - Date.parse(rs[i - 1].date);
      if (gap >= 0 && gap < 600000) add(i, 'dup', 'Weniger als 10 Minuten nach dem vorherigen Eintrag – doppelt erfasst?');
    }
    if (s.gap) add(i, 'gap', 'Akku-Start (' + r.socStart + ' %) liegt über dem Ende der letzten Ladung (' + rs[i - 1].socEnd + ' %) – dazwischen wurde vermutlich woanders geladen. Der Verbrauch dieser Strecke ist nicht berechenbar.');
    if (s.kwh100 != null && (s.kwh100 < 5 || s.kwh100 > 50)) add(i, 'kwh100', 'Verbrauch ' + fmt(s.kwh100, 1) + ' kWh/100 km ist ungewöhnlich – km-Stand oder Zählerstand prüfen.');
    if (s.loss != null && (s.loss < 0 || s.loss > 35)) add(i, 'loss', 'Ladeverlust ' + fmt(s.loss, 0) + ' % ist unplausibel – Akku-% oder Kapazität prüfen.');
    if (r.odometerKm != null) {
      if (maxKm != null && r.odometerKm < maxKm) add(i, 'km', 'Kilometerstand ist kleiner als bei einem früheren Eintrag (' + fmt(maxKm, 0) + ' km).');
      maxKm = Math.max(maxKm ?? 0, r.odometerKm);
    }
    const ms = realMsOf(r);
    if (home && ms && r.consumedSinceLast > 0) {
      const kw = r.consumedSinceLast / (ms / 3600000), ref = chargePowerKw();
      if (kw > ref * 1.3 || kw < ref * 0.6) add(i, 'power', 'Ø Leistung ' + fmt(kw, 1) + ' kW weicht stark von den eingestellten ' + fmt(ref, 1) + ' kW ab.');
    }
  });
  return out;
}
function renderDataCheck() {
  const rs = getReadings(), card = $('dq-card'), hide = editMode || rs.length < 2;
  card.classList.toggle('hidden', hide);
  if (hide) return;
  const ign = new Set(load(DQ_KEY, [])), all = dataChecks(rs), shown = all.filter(f => !ign.has(f.id + ':' + f.code));
  const hiddenCount = all.length - shown.length, sum = $('dq-summary');
  sum.textContent = shown.length ? shown.length + (shown.length === 1 ? ' Hinweis' : ' Hinweise') + ' ▾' : 'alles unauffällig ✓';
  sum.className = shown.length ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  $('dq-list').innerHTML = shown.map(f => `<li><p><span class="font-medium">${fmtDate(rs[f.i].date)}:</span> ${f.msg}</p>
      <div class="mt-1 flex gap-4 text-xs"><button type="button" data-act="goto" data-idx="${f.i}" class="underline text-sky-600 dark:text-sky-400">Anzeigen</button>
      <button type="button" data-act="ign" data-key="${f.id}:${f.code}" class="underline text-slate-500">Ignorieren</button></div></li>`).join('')
    + (hiddenCount ? `<li><button type="button" data-act="unign" class="underline text-xs text-slate-500">${hiddenCount} ignorierte wieder anzeigen</button></li>` : '');
}
$('dq-toggle').addEventListener('click', () => $('dq-list').classList.toggle('hidden'));
$('dq-list').addEventListener('click', (e) => {
  const act = e.target.dataset.act; if (!act) return;
  if (act === 'goto') {
    const li = document.querySelector('#history-list li[data-idx="' + e.target.dataset.idx + '"]');
    if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.add('ring-2', 'ring-amber-500'); setTimeout(() => li.classList.remove('ring-2', 'ring-amber-500'), 2500); }
  } else if (act === 'ign') { save(DQ_KEY, [...new Set([...load(DQ_KEY, []), e.target.dataset.key])]); renderDataCheck(); }
  else if (act === 'unign') { save(DQ_KEY, []); renderDataCheck(); }
});

function nudgeReading(delta) {                                           // Zählerstand in 0,1-Schritten korrigieren
  const raw = $('reading-input').value, v = parseNum(raw), last = lastHome();
  const base = raw.trim() !== '' && isFinite(v) ? v : (last ? last.totalReading : 0);
  $('reading-input').value = Math.max(0, Math.round((base + delta) * 10) / 10).toFixed(1);
  delete $('reading-input').dataset.live; paintReading();
}
[['rd-plus', 0.1], ['rd-minus', -0.1]].forEach(([id, delta]) => {        // Antippen = 0,1; gedrückt halten = schneller Lauf
  const btn = $(id); let t1 = null, t2 = null;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); nudgeReading(delta); t1 = setTimeout(() => { t2 = setInterval(() => nudgeReading(delta), 110); }, 450); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
/** Akku-Start / -Ende setzen. Start bleibt unter dem Ende, Ende über dem Start (mind. 1 % Abstand). */
function setSoc0(v) {
  v = Math.min(99, Math.max(0, Math.round(v))); const f1 = $('soc1-input');
  $('soc0-input').value = v; delete $('soc0-input').dataset.live;
  if (f1.value !== '' && +f1.value <= v) f1.value = Math.min(100, v + 1);
  paintBatt();
}
function setSoc1(v) {
  v = Math.min(100, Math.max(1, Math.round(v))); const f0 = $('soc0-input');
  $('soc1-input').value = v; delete $('soc1-input').dataset.live;
  if (f0.value !== '' && +f0.value >= v) f0.value = Math.max(0, v - 1);
  paintBatt();
}
const socNow = () => { const n0 = optNum($('soc0-input').value), n1 = optNum($('soc1-input').value); return [n0 != null && isFinite(n0) ? n0 : null, n1 != null && isFinite(n1) ? n1 : null]; };
(function initBattControls() {
  const track = $('bt-track'); let drag = null;                            // Griffe direkt auf der Batterie ziehen; Antippen der Batterie setzt den nächsten Griff dorthin
  const pct = (e) => { const r = $('bt-bar').getBoundingClientRect(); return Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100))); };
  const apply = (which, v) => which === 0 ? setSoc0(v) : setSoc1(v);
  track.addEventListener('pointerdown', e => {
    const [n0, n1] = socNow(), a = n0 ?? 0, p = pct(e);
    if (n1 == null) drag = p > a ? 1 : 0;
    else { const d0 = Math.abs(p - a), d1 = Math.abs(p - n1); drag = d0 < d1 || (d0 === d1 && p <= a) ? 0 : 1; }
    if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
    apply(drag, p); e.preventDefault();
  });
  track.addEventListener('pointermove', e => { if (drag != null) apply(drag, pct(e)); });
  ['pointerup', 'pointercancel'].forEach(ev => track.addEventListener(ev, () => { drag = null; }));
  [0, 1].forEach(n => $('bt-h' + n).addEventListener('keydown', e => {   // Tastatur: Pfeiltasten = 1 %
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]; if (!d) return;
    e.preventDefault(); const [n0, n1] = socNow(); n === 0 ? setSoc0((n0 ?? 0) + d) : setSoc1((n1 ?? 80) + d);
  }));
  [[0, -1], [0, 1], [1, -1], [1, 1]].forEach(([n, delta]) => {            // − / +: Antippen = 1 %, gedrückt halten = schneller Lauf
    const btn = $('s' + n + (delta < 0 ? '-minus' : '-plus')); let t1 = null, t2 = null;
    const step = () => { const [n0, n1] = socNow(); n === 0 ? setSoc0((n0 ?? 0) + delta) : setSoc1((n1 ?? 80) + delta); };
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); step(); t1 = setTimeout(() => { t2 = setInterval(step, 90); }, 450); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
})();
$('btn-odo').addEventListener('click', async () => {                      // km-Stand direkt vom Škoda-Server holen
  const info = $('odo-info');
  if (!apiEnabled()) { info.textContent = 'Keine Fahrzeugdaten eingerichtet'; return; }
  info.textContent = 'Lade …'; info.title = '';
  try {
    const res = await fetch('/api/vehicle', { headers: await authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
    if (d.odometerKm == null) throw new Error('Das Auto meldet keinen km-Stand');
    odoNote(d); $('km-input').value = Math.round(d.odometerKm); paintOdo(true);
  } catch (e) { info.textContent = 'Nicht verfügbar: ' + e.message; info.title = e.message; }
});

/* ↻ neben jedem km-Stand-Feld: aktuellen km-Stand vom Škoda-Server holen (30 s zwischengespeichert, damit mehrere Felder nicht mehrfach abfragen) */
let carKmCache = null;
async function fetchCarKm() {
  if (carKmCache && Date.now() - carKmCache.t < 30000) return carKmCache;
  const res = await fetch('/api/vehicle', { headers: await authHeaders() }), d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
  if (d.odometerKm == null) throw new Error('Das Auto meldet keinen km-Stand');
  odoNote(d); carKmCache = { t: Date.now(), km: Math.round(d.odometerKm), at: d.capturedAt || null }; return carKmCache;
}
function kmFetchNote(inp, text, ok) {
  const host = inp.parentElement; let n = host.querySelector(':scope > [data-kmnote]');
  if (!n) { n = document.createElement('p'); n.dataset.kmnote = ''; host.appendChild(n); }
  n.className = 'mt-1 text-[11px] leading-snug text-left ' + (ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'); n.textContent = text;
  clearTimeout(n._t); n._t = setTimeout(() => n.remove(), ok ? 3000 : 6000);
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kmfetch]'); if (!b) return; e.preventDefault(); e.stopPropagation();
  const inp = b.dataset.kmfor ? $(b.dataset.kmfor) : b.closest('[data-kmwrap]')?.querySelector('input'); if (!inp || b.disabled) return;
  if (!apiEnabled()) { kmFetchNote(inp, 'Keine Fahrzeugdaten eingerichtet (Einstellungen → Konto & Cloud).', false); return; }
  b.disabled = true; b.classList.add('animate-spin');
  try {
    const r = await fetchCarKm();
    inp.value = String(r.km);                                    // ohne Tausenderpunkt (optNum liest „18.500“ sonst als 18,5)
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    kmFetchNote(inp, '✓ vom Auto' + (r.at ? ' · Stand ' + new Date(r.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : ''), true);
  } catch (er) { kmFetchNote(inp, 'km-Stand nicht verfügbar: ' + ((er && er.message) || er), false); }
  finally { b.disabled = false; b.classList.remove('animate-spin'); }
}, true);
function updateCaptureDefaults() {
  const withKm = getReadings().filter(r => r.odometerKm != null), last = withKm[withKm.length - 1];
  $('km-input').placeholder = last ? String(last.odometerKm) : 'optional';
  if ($('soc1-input').value === '') $('soc1-input').value = '80';
  const live = capPlace === 'home' ? getLive() : null;    // laufende/beendete Live-Ladung (nur Zuhause): Felder vorbelegen (Zählerstand bitte gegenlesen)
  if (live?.kwhTarget != null) {
    const kwh = liveKwh(live);
    const done = kwh >= live.kwhTarget;
    if ($('soc0-input').value === '') { $('soc0-input').value = live.socStart; $('soc0-input').dataset.live = '1'; }
    if (['', '80'].includes($('soc1-input').value) || $('soc1-input').dataset.live) { $('soc1-input').value = done ? live.socTarget : Math.floor(live.socStart + kwh * live.eff / live.battery * 100); $('soc1-input').dataset.live = '1'; }   // fertig = Ziel-%
    if (live.odometerKm != null && $('km-input').value === '') { $('km-input').value = Math.round(live.odometerKm); $('km-input').dataset.live = '1'; }                              // km-Stand beim Live-Start
    if (done && $('reading-input').value === '') { $('reading-input').value = (live.baseReading + kwh).toFixed(1); $('reading-input').dataset.live = '1'; }   // erst nach Erreichen des Ziels (inkl. Ladeverluste), weiter editierbar
  }
  paintCapture(); paintOdo(true);                        // Anzeige (Segmente, Trommeln, Akku) an die Feldwerte angleichen
}
const LEGACY_CAPACITY_KWH = 50;                              // Kapazität für Einträge ohne gespeicherten Wert (ältere Ladungen)
const capOf = (r) => r.capacityKwh ?? LEGACY_CAPACITY_KWH;   // Kapazität, die zum Zeitpunkt dieser Ladung galt
const optNum = (s) => String(s).trim() === '' ? null : parseNum(s);      // leer -> null, ungültig -> NaN

/** Wirkungsgrad (in der Batterie angekommen / am Zähler gemessen) aus allen Ladungen mit Start-/Ende-%; ohne Daten 90 %. Je Datensatz zwischengespeichert. */
const effCache = new WeakMap();
function avgEff(rs) {
  if (effCache.has(rs)) return effCache.get(rs);
  let chg = 0, st = 0;
  rs.forEach(r => { const c = r.consumedSinceLast - comfortOf(r); if (isHome(r) && r.socStart != null && r.socEnd != null && r.socEnd > r.socStart && c > 0) { chg += c; st += (r.socEnd - r.socStart) / 100 * capOf(r); } });   // ohne Komfortenergie
  const eff = chg > 0 ? Math.min(1, Math.max(0.6, st / chg)) : 0.9;
  effCache.set(rs, eff); return eff;
}

/** Kennzahlen eines Eintrags.
 *  Verbrauch/100 km (genau, method 'soc'): Energie, die zwischen zwei Ladungen aus dem Akku entnommen wurde = (Ende-% der letzten Ladung − Start-% dieser Ladung) x Kapazität,
 *  geteilt durch den Wirkungsgrad = Verbrauch an der Steckdose. So spielt es keine Rolle, ob zuletzt auf 80 oder 90 % geladen wurde.
 *  Vorgänger ist immer der direkt davor erfasste Eintrag, egal wo geladen wurde (Zuhause, Bosch, Unterwegs): das Auto ist durchgehend.
 *  Fallback (method 'charge'): geladene kWh dieser Ladung / km – nur richtig, wenn jedes Mal auf denselben Stand geladen wird.
 *  Preis (unit): Zuhause aus dem Eintrag (Einstellungen), Bosch/Unterwegs der im Eintrag hinterlegte Preis; ohne Preis kein €/100 km. */
function entryStats(rs, i) {
  const r = rs[i], prev = i > 0 ? rs[i - 1] : null, s = {}, home = isHome(r), kwh = r.consumedSinceLast;
  const charge = home ? kwh > 0 : true;                                        // Zuhause zählt nur mit geladenen kWh; Bosch/Unterwegs ist jeder Eintrag eine Ladung
  if (prev && r.odometerKm != null && prev.odometerKm != null && r.odometerKm > prev.odometerKm && charge) {
    s.km = r.odometerKm - prev.odometerKm;
    if (prev.socEnd != null && r.socStart != null) {
      if (r.socStart <= prev.socEnd) {
        s.method = 'soc';
        s.usedBat = (prev.socEnd - r.socStart) / 100 * capOf(r);          // aus dem Akku entnommen
        s.usedWall = s.usedBat / avgEff(rs);                              // entspricht an der Steckdose (Wirkungsgrad aus den Zuhause-Ladungen)
        s.rough = s.usedBat < 3;                                          // 1 % Rundung ≈ 0,5 kWh -> bei kleinen Entnahmen ungenau
      } else s.gap = true;                                                // Akku höher als nach der letzten Ladung: dazwischen wurde woanders geladen
    } else if (kwh > 0) { s.method = 'charge'; s.usedWall = Math.max(0, kwh - comfortOf(r)); }
    if (s.usedWall != null) {
      s.kwh100 = s.usedWall / s.km * 100;
      s.unit = unitOf(r);
      s.cost100 = s.unit != null ? s.usedWall * s.unit / s.km * 100 : null;
    }
  }
  s.comfort = comfortOf(r);
  if (r.socStart != null && r.socEnd != null && r.socEnd > r.socStart && kwh - s.comfort > 0) {
    s.stored = (r.socEnd - r.socStart) / 100 * capOf(r);            // tatsächlich in der Batterie angekommene Energie
    s.loss = (1 - s.stored / (kwh - s.comfort)) * 100;              // Ladeverlust in % (Heizen am Kabel herausgerechnet)
  }
  return s;
}

/** Summiert den Verbrauch über Einträge: genaue Werte (Akku-%) werden bevorzugt, Näherungen nur, wenn es keine genauen gibt.
 *  €/100 km nur aus Strecken mit bekanntem Preis (kmC). */
function consumptionTotals(rs, idxs) {
  const acc = { soc: { km: 0, kwh: 0, cost: 0, kmC: 0, n: 0 }, charge: { km: 0, kwh: 0, cost: 0, kmC: 0, n: 0 } };
  idxs.forEach(i => {
    const s = entryStats(rs, i); if (s.usedWall == null) return;
    const a = acc[s.method]; a.km += s.km; a.kwh += s.usedWall; a.n++;
    if (s.unit != null) { a.cost += s.usedWall * s.unit; a.kmC += s.km; }
  });
  const use = acc.soc.n ? acc.soc : acc.charge;
  return { km: use.km, kwh: use.kwh, cost: use.cost, n: use.n, approx: !acc.soc.n && acc.charge.n > 0,
           kwh100: use.km ? use.kwh / use.km * 100 : null, cost100: use.kmC ? use.cost / use.kmC * 100 : null };
}

/** Einziger Schreibweg für Zählerstände: lokaler Cache (localStorage) + Firestore (falls angemeldet, nur Änderungen). */
function commitReadings(next) {
  const prev = getReadings();
  if (!save(KEY_READINGS, next)) return false;
  renderReminderBadges();                                                          // km-Stand kann sich geändert haben
  if (!window.cloud?.isSignedIn()) return Promise.resolve('local');             // nicht angemeldet -> nur lokal gespeichert
  return window.cloud.push(prev, next).then(() => 'cloud').catch(e => {          // Promise = true; liefert 'cloud' | 'local' | 'error:<Meldung>'
    console.error('Firestore-Schreibfehler', e);
    window.onCloudStatus?.({ error: e.code || e.message });
    return 'error:' + (e.code || e.message);
  });
}
/** Schreibweg für Kosten: lokaler Cache + Firestore (nur Änderungen). Liefert false | Promise('local' | 'cloud' | 'error:…'). */
function commitCosts(next) {
  const prev = getCosts();
  if (!save(KEY_COSTS, next)) return false;
  renderReminderBadges();
  if (!window.cloud?.isSignedIn()) return Promise.resolve('local');
  return window.cloud.pushCosts(prev, next).then(() => 'cloud').catch(e => {
    console.error('Firestore-Schreibfehler (Kosten)', e);
    window.onCloudStatus?.({ error: e.code || e.message });
    return 'error:' + (e.code || e.message);
  });
}
/* Škoda-Fahrzeugdaten: Ob für das angemeldete Konto ein Schlüssel hinterlegt ist, sagt der Server (SKODA_ACCOUNTS in Vercel). */
const KEY_VEHICLE = 'enyaq.vehicle';
let vehicle = load(KEY_VEHICLE, null) || { uid: null, ok: false, expires: null };   // zuletzt bekannter Stand (auch offline nutzbar)
let vehicleChecked = false;
const apiEnabled = () => !!vehicle.ok;
const keyExpiry = () => vehicle.expires ? String(vehicle.expires).slice(0, 10) : null;
async function authHeaders() {                                                      // Firebase-Token für /api/*
  const t = await window.cloud?.token?.();
  if (!t) throw new Error('nicht angemeldet');
  return { Authorization: 'Bearer ' + t };
}
function renderVehicleStatus() {
  paintUserBoxes();                                                              // „· Škoda-API verbunden“ in den Konto-Zeilen
  const el = $('vehicle-status'); if (!el) return;
  el.textContent = !window.cloud?.isSignedIn?.() ? '' : vehicle.ok
    ? 'Škoda-API verbunden' + (keyExpiry() ? ' · Schlüssel gültig bis ' + new Date(keyExpiry() + 'T12:00:00').toLocaleDateString('de-DE') : '')
    : 'Fahrzeugdaten: für dieses Konto nicht eingerichtet (manuelle Eingabe)';
  $('veh-key').classList.toggle('hidden', !(window.cloud?.isSignedIn?.() && vehicle.ok));
}
/* Neuen Škoda-API-Schlüssel direkt in der App hinterlegen: der Server prüft ihn beim Škoda-Server und speichert ihn verschlüsselt (kein Vercel, kein Deploy) */
$('veh-key').addEventListener('click', () => {
  $('au-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">Škoda-Schlüssel ersetzen</p>
    <ol class="list-decimal space-y-1 pl-5 text-left text-sm text-slate-600 dark:text-slate-300"><li>In der <b>MyŠkoda-App</b> einen neuen Schlüssel für die Schnittstelle erzeugen und kopieren.</li><li>Hier einfügen und auf „Prüfen &amp; speichern“ tippen.</li></ol>
    <input id="sk-new" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Neuer Schlüssel" class="w-full min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
    <p id="sk-msg" class="min-h-[1.25rem] text-left text-sm"></p>
    <p class="text-left text-xs text-slate-500 dark:text-slate-400">Der Schlüssel wird nur an deinen eigenen Server geschickt, dort beim Škoda-Server geprüft und verschlüsselt gespeichert. Die Gültigkeit übernimmt die App automatisch.</p>
    <button type="button" data-sk="save" class="h-12 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white active:scale-95 transition">Prüfen &amp; speichern</button>
    <button type="button" data-cc="close" class="h-12 w-full rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">Abbrechen</button>`;
  $('au-sheet').classList.remove('hidden'); setTimeout(() => $('sk-new')?.focus(), 80);
});
$('au-sheet').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sk="save"]'); if (!b) return;
  const k = ($('sk-new').value || '').trim(), msg = $('sk-msg'); if (!k) { msg.className = 'min-h-[1.25rem] text-left text-sm text-red-600 dark:text-red-400'; msg.textContent = 'Bitte den neuen Schlüssel einfügen.'; return; }
  b.disabled = true; b.textContent = 'Prüfe beim Škoda-Server …'; msg.textContent = '';
  try { const r = await fetch('/api/vehicle', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ newKey: k }) }), d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    if (d.expires) vehicle.expires = d.expires; save(KEY_VEHICLE, vehicle); renderVehicleStatus(); try { renderKeyWarning(); } catch (er) { }
    $('au-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">✓ Neuer Schlüssel aktiv</p><p class="text-left text-sm text-slate-600 dark:text-slate-300">Der Škoda-Server hat ihn akzeptiert.${d.expires ? ' Gültig bis <b>' + new Date(d.expires + 'T12:00:00').toLocaleDateString('de-DE') + '</b>.' : ''}</p><button type="button" data-cc="close" class="h-12 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white">Fertig</button>`;
  } catch (er) { msg.className = 'min-h-[1.25rem] text-left text-sm text-red-600 dark:text-red-400'; msg.textContent = er.message; b.disabled = false; b.textContent = 'Prüfen & speichern'; }
});
async function checkVehicle(uid) {                                                  // einmal nach der Anmeldung, ohne Škoda-Abfrage
  if (vehicle.uid !== uid) vehicle = { uid, ok: false, expires: null };             // anderes Konto: nichts vom vorherigen übernehmen
  try {
    const res = await fetch('/api/vehicle?check=1', { headers: await authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (res.ok) vehicle = { uid, ok: !!d.enabled, expires: d.keyExpires || null };
  } catch (e) { console.warn('Fahrzeug-Check fehlgeschlagen (offline?):', e.message); }   // dann bleibt der zuletzt bekannte Stand
  save(KEY_VEHICLE, vehicle); renderVehicleStatus(); refreshViews(); paintOdo(false);
  if (vehicle.ok && currentView === 'dashboard') try { renderWxo(); } catch (e) { }   // Restakku in der Prognose
}
const DEFAULT_TITLE = 'Skoda Enyaq | Ladekosten NK';
function applyTitle() { const t = getSettings().title || DEFAULT_TITLE; $('app-title').textContent = t.split('|')[0].trim() || t; document.title = t; }          // Start-Ansicht zeigt nur den Teil vor „|“
function renderSetupHint() { $('setup-hint').classList.toggle('hidden', !!localStorage.getItem(KEY_SETTINGS)); }   // Hinweis, bis die Einstellungen einmal gespeichert wurden
function renderKeyWarning() {                                   // Erinnerung ab 7 Tagen vor Ablauf, danach dauerhaft bis zur Erneuerung
  const el = $('key-warn'), ex = keyExpiry();
  if (!apiEnabled() || !ex) { el.classList.add('hidden'); return; }         // ohne Fahrzeugzugang keine Schlüssel-Erinnerung
  const end = new Date(ex + 'T23:59:59');
  const days = Math.ceil((end - Date.now()) / 86400000), date = end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  el.classList.toggle('hidden', !(days <= 7));
  if (days > 7) return;
  const urgent = days <= 2;                                       // rot ab 2 Tagen vor Ablauf, davor gelb
  el.className = 'rounded-2xl p-3 text-sm ' + (urgent ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200');
  el.textContent = (days < 0 ? 'Der Škoda-API-Schlüssel ist seit ' + date + ' abgelaufen.' : days === 0 ? 'Der Škoda-API-Schlüssel läuft heute ab (' + date + ').' : 'Der Škoda-API-Schlüssel läuft in ' + days + (days === 1 ? ' Tag' : ' Tagen') + ' ab (' + date + ').')
    + ' Neuen Schlüssel in der MyŠkoda-App erzeugen und unter Einstellungen → Konto & Cloud → „Škoda-Schlüssel ersetzen“ einfügen.';
}
const getSettings = () => ({ price: 0.35, pin: '', ...load(KEY_SETTINGS, {}) });

