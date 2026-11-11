/* =====================================================================
   Dashboard & Diagramme
   ===================================================================== */
let range = 'week', chart = null;
const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

/** Erzeugt die Zeiträume (Buckets) für Woche (8), Monat (12) bzw. Jahr (ab erstem Eintrag). */
function buildBuckets(kind, readings) {
  const now = new Date(), out = [];
  if (kind === 'week') {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) {
      const s = new Date(monday); s.setDate(s.getDate() - 7 * i);
      const e = new Date(s); e.setDate(e.getDate() + 7);
      out.push({ s, e, label: s.getDate() + '.' + (s.getMonth() + 1) + '.' });
    }
  } else if (kind === 'month') {
    for (let i = 11; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      out.push({ s, e, label: MONTHS[s.getMonth()] + ' ' + String(s.getFullYear()).slice(2) });
    }
  } else {
    const first = readings.length ? new Date(readings[0].date).getFullYear() : now.getFullYear();
    for (let y = first; y <= now.getFullYear(); y++) out.push({ s: new Date(y, 0, 1), e: new Date(y + 1, 0, 1), label: String(y) });
  }
  return out.map(b => ({ ...b, kwh: 0, cost: 0 }));
}

const RANGE_TXT = { week: 'der letzten 8 Wochen (Wochenbeginn)', month: 'der letzten 12 Monate', year: 'pro Jahr' };
function renderChart() {
  const readings = getReadings().filter(r => inView(r, dashPlace)), home = dashPlace === 'home';
  const buckets = buildBuckets(range, readings);
  readings.forEach(r => {                                  // Zuhause: Verbrauch am Zähler; Bosch/Unterwegs: eingetragene kWh – jeweils dem Zeitraum des Datums zuordnen
    const d = new Date(r.date), b = buckets.find(b => d >= b.s && d < b.e);
    if (b) { b.kwh += r.consumedSinceLast; b.cost += r.cost; }
  });
  const hasData = buckets.some(b => b.kwh > 0);
  $('chart-empty').textContent = home || dashPlace === 'all' ? 'Noch keine Daten. Erfasse mindestens zwei Zählerstände.' : 'Noch keine Ladungen mit kWh-Angabe bei „' + PLACES[dashPlace] + '“. Trage beim Erfassen die kWh laut Säule ein.';
  $('chart-empty').classList.toggle('hidden', hasData);
  $('chart').parentElement.classList.toggle('hidden', !hasData);
  $('chart-title').textContent = home ? 'Verbrauch ' + RANGE_TXT[range] : VIEWS[dashPlace] + ' · geladen ' + RANGE_TXT[range];

  document.querySelectorAll('.range-btn').forEach(b => {
    const on = b.dataset.range === range;
    b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-700', on); b.classList.toggle('shadow-sm', on);
  });
  if (chart) chart.destroy();
  if (!hasData) return;

  const dark = isDark();
  const text = dark ? '#cbd5e1' : '#475569', grid = dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)';
  chart = new Chart($('chart'), {
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        { type: 'bar',  label: 'kWh', data: buckets.map(b => +b.kwh.toFixed(1)), backgroundColor: '#10b981', borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: '€',   data: buckets.map(b => +b.cost.toFixed(2)), borderColor: '#0ea5e9', backgroundColor: '#0ea5e9', tension: .3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x:  { ticks: { color: text }, grid: { display: false } },
        y:  { beginAtZero: true, title: { display: true, text: 'kWh', color: text }, ticks: { color: text }, grid: { color: grid } },
        y1: { beginAtZero: true, position: 'right', title: { display: true, text: '€', color: text }, ticks: { color: text }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

/* =====================================================================
   Live-Modus (Simulation einer laufenden Ladung)
   Gespeichert wird nur ein Zeitstempel: { startedAt, baseReading, price }.
   Alle Live-Werte werden daraus berechnet -> stimmen auch nach Neuladen/Schließen der App.
   ===================================================================== */
const DEFAULT_CHARGE_POWER_KW = 7;                         // alter Standard (Enyaq); heute aus dem Fahrzeugprofil, einstellbar unter Einstellungen
const chargePowerKw = () => { const v = Number(getSettings().power); return v > 0 ? v : carProf().ac; };
const LIVE_POLL_MS = 6 * 60 * 1000;                        // Abgleich mit dem Auto alle 6 Minuten (Škoda-Limit: 20 Anfragen/Stunde)
const LIVE_SPEED = 1;            // 1 = Echtzeit. Zum Testen z. B. 60 setzen (1 Minute entspricht 1 Stunde Laden)
const KEY_LIVE = 'enyaq.live';
let liveTimer = null;

const getLive = () => load(KEY_LIVE, null);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });   // 04.10.2026
const pad2 = (n) => String(n).padStart(2, '0');

const hhmm = (ms) => { const t = new Date(ms); return pad2(t.getHours()) + ':' + pad2(t.getMinutes()); };
const fmtHM = (sec) => Math.floor(sec / 3600) + ':' + pad2(Math.floor(sec % 3600 / 60));
/** Bisher geladene kWh am Zähler; bei gesetztem Ziel am Zielwert gedeckelt. */
const livePower = (live) => live.power ?? chargePowerKw();            // beim Start eingefrorene Ladeleistung
const liveKwh = (live, now = Date.now()) => {                         // Anker (Zeit, kWh) + Leistung x Zeit seit dem Anker
  const raw = (live.anchorKwh ?? 0) + Math.max(0, now - (live.anchorT ?? live.startedAt)) / 3600000 * LIVE_SPEED * livePower(live);
  return live.kwhTarget != null ? Math.min(raw, live.kwhTarget) : raw;
};
/** Ladewirkungsgrad aus der Historie (gespeicherte Energie / Zählerenergie); ohne Daten Standardwert 90 %. */
function chargeEfficiency() {
  const rs = getReadings(); let chg = 0, st = 0;
  rs.forEach((r, i) => { const s = entryStats(rs, i); if (isHome(r) && s.stored !== undefined) { chg += r.consumedSinceLast; st += s.stored; } });
  return chg > 0 ? { eff: Math.min(1, Math.max(0.5, st / chg)), hist: true } : { eff: 0.9, hist: false };
}
/** Prognose für Start- und Ziel-%: Zähler-kWh = Batterieenergie / Wirkungsgrad; Dauer = kWh / 7 kW. */
function liveForecast(s0, s1) {
  const { eff, hist } = chargeEfficiency(), kwh = (s1 - s0) / 100 * batteryKwh() / eff;
  return { kwh, eff, hist, hours: kwh / chargePowerKw(), cost: kwh * getSettings().price };
}

function renderLive() {
  const live = getLive(), on = !!live, hasT = on && live.kwhTarget != null;
  const kwh = on ? liveKwh(live) : 0, done = hasT && kwh >= live.kwhTarget, charging = on && !done;
  if (charging && hasT && apiEnabled() && !document.hidden && Date.now() - (live.lastPollAt ?? live.startedAt) >= LIVE_POLL_MS) pollLive();   // alle 6 Minuten mit dem Auto abgleichen
  $('live-sync').textContent = hasT ? (live.syncNote || '') : '';
  const btn = $('btn-live');
  btn.classList.toggle('animate-pulse', charging);                                               // Button pulsiert nur während der Ladung
  ['bg-red-600', 'text-white'].forEach(c => btn.classList.toggle(c, on));
  ['bg-slate-200', 'dark:bg-slate-800'].forEach(c => btn.classList.toggle(c, !on));
  $('live-dot').classList.toggle('bg-white', on); $('live-dot').classList.toggle('bg-slate-400', !on);
  $('phase-leds').classList.toggle('live-on', charging);
  $('live-battery').classList.toggle('hidden', !hasT);
  $('dash-title').textContent = !on ? 'Aktueller Zählerstand' : done ? 'Ladung abgeschlossen' : 'Live-Simulation · ' + livePower(live) + ' kW';
  $('live-info').classList.toggle('hidden', !on);
  setLiveHero(on);                                                          // Live-Modus: statisches Ladebild statt Karussell
  /* Wallbox-Wächter: letzte Leistung laut Auto (höchstens 15 Min. alt) gegen den üblichen Wert; nicht kurz vor Ende (Leistung sinkt dort normal) */
  const smp = on && charging && live.powerSamples && live.powerSamples[live.powerSamples.length - 1], usual = smp ? wbUsualLive() : null;
  const slow = !!smp && Date.now() - smp[0] < 15 * 60000 && usual != null && smp[1] > 0.3 && smp[1] < usual * WB_SLOW && !(hasT && live.socTarget > 90 && kwh > live.kwhTarget * 0.85);
  $('live-warn').classList.toggle('hidden', !slow);
  if (slow) $('live-warn-t').innerHTML = 'Jetzt ' + fmt(smp[1], 1) + ' kW statt üblich ' + fmt(usual, 1) + ' kW' + (smp[1] < usual * 0.45 ? ' – typisch für <b>nur eine Phase</b>' : '') + '. Prüfe Sicherung, Kabel und die Ladestrom-Einstellung im Auto.';
  if (!on) return;

  const finishAt = hasT ? (live.anchorT ?? live.startedAt) + (live.kwhTarget - (live.anchorKwh ?? 0)) / livePower(live) * 3600000 / LIVE_SPEED : null;
  const elapsedMs = (done ? finishAt : Date.now()) - live.startedAt;
  $('dash-reading').textContent = (live.baseReading + kwh).toFixed(1).padStart(8, '0');
  $('dash-last-cost').textContent = eur(kwh * live.price);                                       // Kosten = kWh x Preis
  $('dash-last-kwh').textContent = fmt(kwh, 2) + ' kWh';
  $('dash-last-label').textContent = 'Kosten (' + fmtDate(live.startedAt) + ')';
  $('live-info').textContent = 'Start ' + hhmm(live.startedAt) + ' Uhr · Dauer ' + fmtHM(elapsedMs / 1000) + ':' + pad2(Math.floor(elapsedMs / 1000) % 60);

  if (hasT) {                                                                                    // Akku-Balken
    const soc = Math.min(live.socTarget, live.socStart + kwh * live.eff / live.battery * 100);
    $('batt-fill').style.width = soc + '%'; $('batt-target').style.left = live.socTarget + '%';
    $('batt-text').textContent = Math.floor(soc) + ' %';
    $('batt-note').textContent = done ? 'Ziel ' + live.socTarget + ' % erreicht um ' + hhmm(finishAt) + ' Uhr'
      : 'Ziel ' + live.socTarget + ' % · fertig ca. ' + hhmm(finishAt) + ' Uhr · noch ' + fmtHM(Math.max(0, (finishAt - Date.now()) / 1000)) + ' h · ca. ' + eur(live.kwhTarget * live.price);
  }
}

function tickLive() { renderLive(); if (!liveTimer) liveTimer = setInterval(renderLive, 1000); }

function startLive(socStart, socTarget, odometerKm = null) {
  const t0 = Date.now(), readings = getReadings(), last = lastHome(readings), f = liveForecast(socStart, socTarget);
  const state = { startedAt: t0, power: chargePowerKw(), anchorT: t0, anchorKwh: 0, lastPollAt: t0, syncNote: '',
                  lastCaptured: carData?.capturedAt ? (new Date(carData.capturedAt).getTime() || 0) : 0, baseReading: last ? last.totalReading : 0, price: getSettings().price,
                  socStart, socTarget, odometerKm, kwhTarget: f.kwh, eff: f.eff, battery: batteryKwh() };       // alles Nötige beim Start einfrieren
  if (save(KEY_LIVE, state)) { $('live-setup').classList.add('hidden'); tickLive(); }
}
/** Korrigiert die Simulation mit echten Autodaten. Der Ladestand ist ganzzahlig: liegt die Simulation innerhalb [Soc, Soc+1) bleibt sie unverändert. */
function applyCarSync(live, d, now) {
  if (d.soc == null) { live.syncNote = 'Abgleich ' + hhmm(now) + ' Uhr: Auto meldet keinen Ladestand'; return; }
  const parsed = d.capturedAt ? new Date(d.capturedAt).getTime() : NaN, tc = isFinite(parsed) ? parsed : now;
  if (tc <= (live.lastCaptured || 0)) { live.syncNote = 'Abgleich ' + hhmm(now) + ' Uhr: keine neuen Daten vom Auto (Stand ' + hhmm(tc) + ')'; return; }
  if (now - tc > 20 * 60000) { live.syncNote = 'Abgleich ' + hhmm(now) + ' Uhr: Autodaten veraltet (Stand ' + hhmm(tc) + ')'; return; }
  live.lastCaptured = tc;
  if (d.chargePowerKw != null) (live.powerSamples = live.powerSamples || []).push([tc, d.chargePowerKw]);   // Leistungsprotokoll für die Historie
  const kwhAt = liveKwh(live, tc);                                        // Simulation zum Zeitpunkt der Autodaten
  const socSim = live.socStart + kwhAt * live.eff / live.battery * 100, r = d.soc;
  const toKwh = (soc) => (soc - live.socStart) / 100 * live.battery / live.eff;     // Akku-% -> Zähler-kWh (inkl. Ladeverluste)
  let kwhNew = kwhAt, corrected = false;
  if (socSim < r) { kwhNew = toKwh(r); corrected = true; }
  else if (socSim >= r + 1) { kwhNew = toKwh(r + 0.99); corrected = true; }
  live.anchorT = tc; live.anchorKwh = Math.min(live.kwhTarget, Math.max(0, kwhNew));
  live.syncNote = 'Abgleich ' + hhmm(now) + ' Uhr: Auto ' + r + ' %' + (d.chargePowerKw != null ? ', ' + fmt(d.chargePowerKw, 1) + ' kW' : '') + (corrected ? ' · Simulation angepasst' : ' · passt');
}
let livePolling = false;
async function pollLive() {
  const live = getLive();
  if (!live || live.kwhTarget == null || livePolling) return;
  livePolling = true;
  const now = Date.now();
  try {
    if (!apiEnabled()) throw new Error('keine Fahrzeugdaten eingerichtet');
    const res = await fetch('/api/vehicle', { headers: await authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
    odoNote(d); applyCarSync(live, d, now);
  } catch (e) { live.syncNote = 'Abgleich ' + hhmm(now) + ' Uhr fehlgeschlagen (' + e.message + ') – Simulation läuft weiter'; }
  live.lastPollAt = now;                                                  // auch bei Fehlern: erst in 6 Minuten erneut versuchen
  const cur = getLive();
  if (cur && cur.startedAt === live.startedAt) save(KEY_LIVE, live);      // nur speichern, wenn die Live-Ladung nicht inzwischen beendet wurde
  livePolling = false; renderLive();
}
const liveFinishAt = (live) => (live.anchorT ?? live.startedAt) + (live.kwhTarget - (live.anchorKwh ?? 0)) / livePower(live) * 3600000 / LIVE_SPEED;
function stopLive(refresh = true) {
  localStorage.removeItem(KEY_LIVE);
  clearInterval(liveTimer); liveTimer = null;
  setLiveHero(false);                                   // oben wieder das Karussell
  if (refresh) {
    ['reading-input', 'km-input', 'soc0-input', 'soc1-input'].forEach(id => { if ($(id).dataset.live) { $(id).value = ''; delete $(id).dataset.live; } });   // nur vom Auto übernommene Werte
    updateCaptureDefaults();
    renderDashboard();                                  // alten Zählerstand und echte Werte wieder anzeigen
  }
}
const liveInputs = () => [optNum($('live-soc0').value), optNum($('live-soc1').value)];
const liveValid = ([a, b]) => a != null && b != null && isFinite(a) && isFinite(b) && a >= 0 && b <= 100 && b > a;
function updateLiveForecast() {
  const v = liveInputs();
  /* Kurzform, passt in eine Zeile: „~ 0:53 h · 6,2 kWh · ca. 1,91 € (η = 96 % historisch)“; η = Wirkungsgrad (Ersatzschriften, falls die Systemschrift kein η hat) */
  const ETA = '<span style="font-family:system-ui,Roboto,\'Noto Sans\',\'Segoe UI\',\'DejaVu Sans\',\'Times New Roman\',serif" title="Wirkungsgrad">η</span>';
  $('live-forecast').innerHTML = !liveValid(v) ? '' : (f => '~ ' + fmtHM(f.hours * 3600) + ' h · ' + fmt(f.kwh, 1) + ' kWh · ca. ' + eur(f.cost) +
    ' (' + ETA + ' = ' + Math.round(f.eff * 100) + ' % ' + (f.hist ? 'historisch' : 'Standard') + ')')(liveForecast(v[0], v[1]));
  const el = $('live-forecast'); el.style.whiteSpace = 'nowrap'; el.style.fontSize = '';                    // eine Zeile: bei Bedarf Schrift leicht verkleinern
  for (const fs of [11.5, 11, 10.5, 10]) { if (el.scrollWidth <= el.clientWidth) break; el.style.fontSize = fs + 'px'; }
  if (el.scrollWidth > el.clientWidth) { el.style.whiteSpace = ''; el.style.fontSize = ''; }               // sehr schmale Geräte: lieber umbrechen als abschneiden
}
/** Holt Akku-%, Ziel-% und km-Stand über die Vercel-Funktion /api/vehicle vom Škoda-Server und füllt das Live-Panel. */
let carData = null;
async function loadFromCar() {
  const note = $('live-car-note');
  carData = null;
  if (!apiEnabled()) { note.textContent = 'Manuelle Eingabe (keine Fahrzeugdaten verbunden).'; return; }
  note.textContent = 'Lade Fahrzeugdaten …';
  try {
    const res = await fetch('/api/vehicle', { headers: await authHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
    carData = d; odoNote(d);
    const ex = d.keyExpiresAt ? new Date(d.keyExpiresAt) : null;                   // Ablaufdatum aus der Škoda-Antwort übernehmen
    if (ex && !isNaN(ex) && ex.toISOString().slice(0, 10) !== keyExpiry()) { vehicle.expires = ex.toISOString().slice(0, 10); save(KEY_VEHICLE, vehicle); renderVehicleStatus(); }
    if (d.soc != null) { $('soc0-input').value = Math.round(d.soc); $('soc0-input').dataset.live = '1'; }               // Erfassen: Akku-Start = aktueller Ladestand des Autos
    if (d.odometerKm != null) { $('km-input').value = Math.round(d.odometerKm); $('km-input').dataset.live = '1'; }   // Erfassen: km-Trommeln
    paintBatt(); paintOdo(true);
    if (d.soc != null) $('live-soc0').value = Math.round(d.soc);
    if (d.targetSoc != null) $('live-soc1').value = Math.round(d.targetSoc);
    updateLiveForecast();
    note.textContent = d.soc == null && d.targetSoc == null ? 'Das Auto hat keine Ladedaten gemeldet – bitte manuell eingeben.'
      : 'Vom Auto: Akku ' + (d.soc ?? '?') + ' %, Ziel ' + (d.targetSoc ?? '?') + ' %' + (d.capturedAt ? ' (Stand ' + hhmm(new Date(d.capturedAt).getTime()) + ' Uhr)' : '');
  } catch (e) {
    note.textContent = 'Fahrzeugdaten nicht verfügbar (' + e.message + ') – bitte manuell eingeben.';
  }
}
$('btn-live').addEventListener('click', () => {
  if (getLive()) return stopLive();
  const panel = $('live-setup'); panel.classList.toggle('hidden'); updateLiveForecast();
  if (!panel.classList.contains('hidden')) loadFromCar();        // erst Start-/Ziel-% abfragen
});
$('live-cancel').addEventListener('click', () => $('live-setup').classList.add('hidden'));
$('live-go').addEventListener('click', () => {
  const v = liveInputs();
  if (!liveValid(v)) { $('live-forecast').textContent = 'Bitte Start- und Ziel-% prüfen (0–100, Ziel größer als Start).'; return; }
  startLive(v[0], v[1], carData?.odometerKm ?? null);
});
['live-soc0', 'live-soc1'].forEach(id => $(id).addEventListener('input', updateLiveForecast));
document.addEventListener('visibilitychange', () => { if (!document.hidden && getLive()) renderLive(); });

/* =====================================================================
   Statistik: Anzahl der Ladungen
   Eine Ladung = ein Eintrag mit geladenen kWh > 0 (der erste Eintrag ist nur der Startwert).
   Woche/Monat: Durchschnitt = Ladungen / verstrichene Wochen bzw. Monate seit dem ersten Eintrag (mind. 1).
   Jahr: Summe der Ladungen im laufenden Jahr, frühere Jahre als Hinweis.
   ===================================================================== */
let statRange = 'week';

function renderStats() {
  const readings = getReadings(), own = readings.filter(r => inView(r, dashPlace));
  const charges = readings.filter((r, i) => inView(r, dashPlace) && isCharge(readings, i));
  document.querySelectorAll('.stat-btn').forEach(b => {
    const on = b.dataset.stat === statRange;
    b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-700', on); b.classList.toggle('shadow-sm', on);
  });
  const label = $('stat-label'), value = $('stat-value'), note = $('stat-note');
  const names = { week: 'Woche', month: 'Monat' };
  label.textContent = statRange === 'year' ? 'Ladungen im Jahr ' + new Date().getFullYear() + ' (gesamt)' : 'Ø Ladungen pro ' + names[statRange];

  if (!charges.length) { value.textContent = '–'; note.textContent = 'Noch keine Ladungen' + whereTxt(dashPlace) + ' erfasst.'; return; }

  if (statRange === 'year') {
    const byYear = {};
    charges.forEach(r => { const y = new Date(r.date).getFullYear(); byYear[y] = (byYear[y] || 0) + 1; });
    const current = new Date().getFullYear();
    value.textContent = byYear[current] || 0;
    const earlier = Object.keys(byYear).filter(y => +y !== current).sort().reverse().map(y => y + ': ' + byYear[y]).join(' · ');
    note.textContent = earlier ? 'Frühere Jahre – ' + earlier : '';
  } else {
    const start = new Date(own[0].date);
    const days = (Date.now() - start.getTime()) / 86400000;
    const unitDays = statRange === 'week' ? 7 : 365.25 / 12;
    value.textContent = fmt(charges.length / Math.max(1, days / unitDays), 1);
    note.textContent = charges.length + ' Ladungen seit ' + start.toLocaleDateString('de-DE') + ' (' + Math.max(1, Math.round(days)) + ' Tage)' +
                       (days < unitDays ? ' – Zeitraum noch kürzer als ein' + (statRange === 'week' ? 'e Woche' : ' Monat') : '');
  }
}
document.querySelectorAll('.stat-btn').forEach(b => b.addEventListener('click', () => { statRange = b.dataset.stat; renderStats(); }));

function renderEfficiency() {                            // gewichteter Durchschnitt über die Einträge des gewählten Ladeorts
  const rs = getReadings(), idxs = rs.map((_, i) => i).filter(i => inView(rs[i], dashPlace));
  let chg = 0, stored = 0, nSoc = 0;
  idxs.forEach(i => {
    const s = entryStats(rs, i);
    if (s.stored !== undefined) { chg += rs[i].consumedSinceLast; stored += s.stored; nSoc++; }
  });
  const t = consumptionTotals(rs, idxs), nKm = t.n;
  $('eff-kwh').textContent = t.km ? fmt(t.kwh100, 1) : '–';
  $('eff-cost').textContent = t.cost100 != null ? eur(t.cost100) : '–';
  $('eff-loss').textContent = chg ? fmt(Math.max(0, (1 - stored / chg) * 100), 0) + ' %' : '–';
  const hint = dashPlace === 'home' ? '' : ' · €/100 km nur mit Preis, Ladeverlust nur mit kWh';
  $('eff-note').textContent = (nKm || nSoc) ? 'Basis: ' + nKm + ' Ladungen mit km-Stand' + (t.approx ? ' (grob, ohne Akku-%)' : '') + ', ' + nSoc + ' mit Akku-Stand' + hint
                                              : 'Erfasse km-Stand und Akku-% bei den Ladungen, um Werte zu sehen.';
}

/* =====================================================================
   Ladeverluste im Jahresverlauf: Zähler-kWh minus in der Batterie angekommene kWh (aus Akku-Start/-Ende x Nettokapazität).
   Pro Monat aufsummiert; Sommer = Apr–Sep, Winter = Okt–Mär. Ladungen ohne Akku-Start/-Ende fließen nicht ein.
   ===================================================================== */
let lossChart = null;
function renderLossChart() {
  const rs = getReadings(), byMonth = {}, season = { summer: { chg: 0, st: 0 }, winter: { chg: 0, st: 0 } };
  let chgAll = 0, stAll = 0, lossCost = 0, n = 0;
  rs.forEach((r, i) => {
    if (!inView(r, dashPlace)) return;
    const s = entryStats(rs, i); if (s.stored === undefined) return;       // nur Ladungen mit Start-/Ende-% und kWh
    const d = new Date(r.date), key = d.getFullYear() + '-' + d.getMonth(), m = (byMonth[key] = byMonth[key] || { chg: 0, st: 0 });
    m.chg += r.consumedSinceLast; m.st += s.stored;
    const sea = d.getMonth() >= 3 && d.getMonth() <= 8 ? season.summer : season.winter;
    sea.chg += r.consumedSinceLast; sea.st += s.stored;
    chgAll += r.consumedSinceLast; stAll += s.stored; n++;
    lossCost += (r.consumedSinceLast - s.stored) * (unitOf(r) ?? 0);           // Verlust-kWh x Preis dieser Ladung (ohne Preis: 0)
  });
  const pct = (o) => o.chg > 0 ? fmt(Math.max(0, (1 - o.st / o.chg) * 100), 1) + ' %' : '–';
  $('loss-summer').textContent = pct(season.summer); $('loss-winter').textContent = pct(season.winter);
  $('loss-cost').textContent = n ? eur(Math.max(0, lossCost)) : '–';

  const now = new Date(), labels = [], kwh = [], perc = [];
  for (let k = 11; k >= 0; k--) {                                          // letzte 12 Monate
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1), m = byMonth[d.getFullYear() + '-' + d.getMonth()];
    labels.push(MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
    kwh.push(m ? +Math.max(0, m.chg - m.st).toFixed(1) : null);
    perc.push(m && m.chg > 0 ? +Math.max(0, (1 - m.st / m.chg) * 100).toFixed(1) : null);
  }
  const has = kwh.some(v => v != null);
  $('loss-chart').parentElement.classList.toggle('hidden', !has); $('loss-empty').classList.toggle('hidden', has);
  $('loss-empty').textContent = dashPlace === 'home' || dashPlace === 'all' ? 'Noch keine Ladungen mit Akku-Start und -Ende erfasst.' : 'Noch keine Ladungen mit kWh und Akku-Start/-Ende bei „' + PLACES[dashPlace] + '“.';
  $('loss-note').textContent = n ? 'Basis: ' + n + ' Ladungen · Kapazität je Ladung gespeichert · enthält u. a. Batterieheizung und Wandlerverluste' : '';
  if (lossChart) lossChart.destroy();
  if (!has) return;
  const dark = isDark(), text = dark ? '#cbd5e1' : '#475569', grid = dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)';
  lossChart = new Chart($('loss-chart'), {
    data: { labels, datasets: [
      { type: 'bar', label: 'Verlust (kWh)', data: kwh, backgroundColor: '#f59e0b', borderRadius: 6, yAxisID: 'y' },
      { type: 'line', label: 'Verlust (%)', data: perc, borderColor: '#0ea5e9', backgroundColor: '#0ea5e9', tension: .3, spanGaps: true, yAxisID: 'y1' }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { display: false } },
        y: { beginAtZero: true, title: { display: true, text: 'kWh', color: text }, ticks: { color: text }, grid: { color: grid } },
        y1: { beginAtZero: true, position: 'right', title: { display: true, text: '%', color: text }, ticks: { color: text }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

/* =====================================================================
   Trends (Start): drei Karten zum Wischen – Laufleistung, Stromkosten, Gesamtkosten der letzten 8 Monate.
   „Letzter Monat“ = letzter abgeschlossener Monat, Ø = Durchschnitt der abgeschlossenen Monate mit Daten, Änderung = letzter Monat gegenüber Ø.
   Der laufende Monat steht hell rechts (Zwischenstand) und zählt nicht in Ø und Änderung.
   ===================================================================== */
const TREND_ICONS = { eff: '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Z"/><path d="M5 19l7-7"/>', km: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>', strom: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z"/>', ges: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5A4.5 4.5 0 0 0 8 10m0 4a4.5 4.5 0 0 0 7.5 1.5M7 11h6M7 13h6"/>' };
let trendIdx = 0;
function renderTrends() {
  const box = $('trends'); if (!box) return;
  const n = new Date(), months = [];
  for (let k = 7; k >= 0; k--) { const d = new Date(n.getFullYear(), n.getMonth() - k, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), cur: k === 0 }); }
  const defs = [
    { key: 'km', title: 'Monatliche Laufleistung', unit: 'km', dec: 0, val: (y, m) => kmDrivenIn(y, m) || 0, goodDown: null },
    { key: 'strom', title: 'Monatliche Kosten (Strom)', unit: '€', dec: 2, val: (y, m) => monthReport(y, m, 'all').cost || 0, goodDown: true },
    { key: 'ges', title: 'Monatliche Kosten (Gesamt)', unit: '€', dec: 2, val: (y, m) => Math.max(0, costTotals(y, m).total || 0), goodDown: true },
    { key: 'eff', title: 'Effizienz (ohne Ladeverluste)', unit: 'kWh/100 km', su: 'kWh/100', dec: 1, val: (y, m) => effM[y + '-' + m] || 0, goodDown: true, base: true,
      note: 'ab Akku wie der Bordcomputer' }];
  /* Effizienz je Monat: Σ Akku-kWh ÷ Σ km der genauen Strecken zwischen zwei Ladungen (ab 30 km im Monat) */
  const effM = {}; (() => { const rs = getReadings(), acc = {}; try { tcSegments().forEach(x => { const d = new Date(rs[x.i].date), k = d.getFullYear() + '-' + d.getMonth(), o = acc[k] = acc[k] || { km: 0, bat: 0 }; o.km += x.km; o.bat += x.bat; }); } catch (e) { }
    Object.keys(acc).forEach(k => { if (acc[k].km >= 30) effM[k] = acc[k].bat / acc[k].km * 100; }); })();
  box.innerHTML = defs.map(d => {
    const vals = months.map(mo => ({ ...mo, v: d.val(mo.y, mo.m) })), done = vals.filter(x => !x.cur && x.v > 0);
    const last = vals[vals.length - 2], avg = done.length ? done.reduce((a, x) => a + x.v, 0) / done.length : 0;
    const max0 = Math.max(...vals.map(x => x.v), avg, 1), pos = vals.filter(x => x.v > 0).map(x => x.v), lo = d.base && pos.length ? Math.max(0, Math.floor(Math.min(...pos) * 0.8)) : 0, max = (max0 - lo) * 1.12;   // Platz für die Werte über den Balken
    const ch = avg > 0 && last.v > 0 ? (last.v - avg) / avg * 100 : null, hp = (v) => v > 0 ? Math.max(0, (v - lo) / (max || 1) * 100) : 0;
    const chCls = ch == null || d.goodDown == null || Math.abs(ch) < 0.05 ? 'text-slate-700 dark:text-slate-200' : (ch < 0) === d.goodDown ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const num = (v) => v > 0 ? fmt(v, d.dec) : '–', ul = '<span class="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">' + (d.su || d.unit) + '</span>';
    const stat = (l, v, cls = '') => `<div><p class="text-xs text-slate-500 dark:text-slate-400">${l}</p><p class="text-lg font-semibold tabular-nums leading-tight whitespace-nowrap ${cls}">${v}</p></div>`;
    const empty = !vals.some(x => x.v > 0);
    return `<article class="snap-center snap-always shrink-0 w-full rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4" aria-label="${d.title}">
      <p class="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${TREND_ICONS[d.key]}</svg>${d.title}</p>
      ${empty ? '<p class="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Noch keine Daten in den letzten 8 Monaten.</p>' : `
      <div class="mt-4 flex gap-3">
        <div class="w-[31%] shrink-0 space-y-3">
          ${stat(MONTHS_LONG[last.m], num(last.v) + (last.v > 0 ? ul : ''))}
          ${stat('Durchschnitt', num(avg) + (avg > 0 ? ul : ''))}
          ${stat('Änderung', ch == null ? '–' : (ch >= 0.05 ? '+' : '') + fmt(Math.abs(ch) < 0.05 ? 0 : ch, 1) + ' %', chCls)}
        </div>
        <div class="min-w-0 flex-1 flex flex-col">
          <div class="relative flex-1 min-h-[150px] flex items-end gap-1">
            ${avg > 0 ? `<div class="absolute inset-x-0 border-t-2 border-dashed border-emerald-500/70 pointer-events-none" style="bottom:${hp(avg).toFixed(1)}%" title="Durchschnitt ${num(avg)} ${d.unit}"></div>` : ''}
            ${d.key === 'eff' ? (() => { try { return upList().filter(u => !u.base).map(u => { const t = new Date(u.inst + 'T12:00:00'), i = vals.findIndex(v => v.y === t.getFullYear() && v.m === t.getMonth()); if (i < 0) return '';
              const left = (i + (t.getDate() - 1) / new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()) / vals.length * 100;
              return `<button type="button" data-upmark="${esc(String(u.id))}" class="absolute top-0 bottom-0 z-10 w-4 -translate-x-1/2" style="left:${left.toFixed(1)}%" title="Software ${esc(u.ver || '')} – Vorher/Nachher"><span class="absolute inset-y-0 left-1/2 border-l-2 border-dashed border-sky-400"></span><span class="absolute bottom-1 ${left > 60 ? 'right-1/2 mr-0.5' : 'left-1/2 ml-0.5'} whitespace-nowrap rounded-md bg-white/90 dark:bg-slate-900/90 px-1 text-[10px] font-semibold text-sky-600 dark:text-sky-300">📡 ${esc(u.ver || '')}</span></button>`; }).join(''); } catch (e) { return ''; } })() : ''}
            ${vals.map(x => `<div class="relative flex-1 h-full flex items-end" title="${MONTHS_LONG[x.m]} ${x.y}: ${num(x.v)} ${d.unit}${x.cur ? ' (Zwischenstand)' : ''}"><div class="relative w-full rounded-t ${x.cur ? 'bg-emerald-300/80 dark:bg-emerald-300/70' : 'bg-emerald-600 dark:bg-emerald-500/80'}" style="height:${x.v > 0 ? Math.max(3, hp(x.v)).toFixed(1) : 1.5}%">${x.v > 0 ? `<span class="absolute inset-x-[-4px] bottom-full mb-0.5 text-center text-[10px] font-semibold leading-none tabular-nums text-slate-600 dark:text-slate-300">${x.v >= 1000 ? fmt(x.v / 1000, 1) + 'k' : fmt(x.v, d.key === 'eff' ? 1 : 0)}</span>` : ''}</div></div>`).join('')}
          </div>
          <div class="mt-1.5 flex gap-1 text-[10px] text-slate-500 dark:text-slate-400">${vals.map(x => `<span class="flex-1 text-center">${MONTHS[x.m]}</span>`).join('')}</div>
        </div>
      </div>
      <p class="mt-3 text-left text-[11px] text-slate-500 dark:text-slate-400">Letzte 8 Monate · heller Balken = ${MONTHS_LONG[n.getMonth()]} (Zwischenstand) · gestrichelt = Ø${d.base && lo > 0 ? ' · Achse ab ' + lo : ''}${d.note ? ' · ' + d.note : ''}${d.key === 'km' && avg > 0 ? ' | Hochrechnung auf 12 Monate = ' + fmt(Math.round(avg) * 12, 0) + ' km' : ''}</p>`}
    </article>`; }).join('');
  $('trends-dots').innerHTML = defs.map((_, i) => `<span data-tdot="${i}" class="block h-2 rounded-full transition-all ${i === trendIdx ? 'w-5 bg-emerald-500' : 'w-2 bg-slate-500/60'}"></span>`).join('');
  if (trendIdx) box.scrollLeft = trendIdx * (box.firstElementChild.offsetWidth + 16);
}
/* Desktop: Karussells mit der Maus ziehen (Touch scrollt nativ). Beim Loslassen rastet es auf die nächste Karte in Zugrichtung ein. */
function mouseSwipe(tr, gap) {
  let sx = 0, sl = 0, on = false, moved = false;
  tr.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; on = true; moved = false; sx = e.clientX; sl = tr.scrollLeft; });
  addEventListener('pointermove', (e) => { if (!on) return; const dx = e.clientX - sx; if (!moved && Math.abs(dx) < 6) return; if (!moved) { moved = true; tr.style.scrollSnapType = 'none'; tr.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; } tr.scrollLeft = sl - dx; });
  addEventListener('pointerup', (e) => {
    if (!on) return; on = false; if (!moved) return;
    const w = (tr.firstElementChild?.offsetWidth || tr.clientWidth) + gap, dx = e.clientX - sx, n = Math.max(1, Math.round(tr.scrollWidth / w)), i0 = Math.round(sl / w);
    const i = Math.max(0, Math.min(n - 1, Math.abs(dx) > 40 ? i0 + (dx < 0 ? 1 : -1) : i0));
    tr.style.cursor = ''; document.body.style.userSelect = '';
    tr.scrollTo({ left: i * w, behavior: 'smooth' }); setTimeout(() => { tr.style.scrollSnapType = ''; }, 450);
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; tr.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => tr.removeEventListener('click', stop, { capture: true }), 0);
  });
  tr.addEventListener('dragstart', (e) => e.preventDefault());
}
mouseSwipe($('trends'), 16);
$('trends').addEventListener('click', (e) => { const b = e.target.closest('[data-upmark]'); if (b) { e.stopPropagation(); openKb(b.dataset.upmark); } });
$('trends-dots').addEventListener('click', (e) => { const d = e.target.closest('[data-tdot]'); if (!d) return; const box = $('trends'); box.scrollTo({ left: Number(d.dataset.tdot) * (box.firstElementChild.offsetWidth + 16), behavior: 'smooth' }); });
$('trends').addEventListener('scroll', () => {
  const box = $('trends'), w = box.firstElementChild ? box.firstElementChild.offsetWidth + 16 : 1, i = Math.round(box.scrollLeft / w);
  if (i !== trendIdx) { trendIdx = i; [...$('trends-dots').children].forEach((d, k) => d.className = 'block h-2 rounded-full transition-all ' + (k === i ? 'w-5 bg-emerald-500' : 'w-2 bg-slate-500/60')); }
}, { passive: true });
function renderDashboard() {
  try { renderAkkuBtn(); } catch (e) { }                                   // Start-Button „Akku“ (auch nach Cloud-Abgleich aktuell)
  applyTitle(); renderSetupHint(); renderTrends();
  const readings = getReadings(), last = lastHome(readings);                   // Zählerstand und letzte Ladung: immer vom Zähler zuhause
  $('dash-reading').textContent = (last ? last.totalReading : 0).toFixed(1).padStart(8, '0');   // 6 Stellen + Komma + 1 Nachkommastelle
  $('dash-last-cost').textContent = last ? eur(last.cost) : '–';
  $('dash-last-kwh').textContent = last ? fmt(last.consumedSinceLast) + ' kWh' : '–';
  $('dash-last-label').textContent = last ? 'Kosten (' + fmtDate(last.date) + ')' : 'Kosten';
  segPaint('.dash-place-btn', dashPlace);
  renderLive();                                          // überschreibt die Werte, falls der Live-Modus läuft
  renderChart();
  renderHeroStats();
  renderStats();
  renderEfficiency();
  renderLossChart();
  renderKeyWarning();
  renderReportBanner(); renderTripsBanner();
}
document.querySelectorAll('.dash-place-btn').forEach(b => b.addEventListener('click', () => { dashPlace = b.dataset.place; renderDashboard(); }));
document.querySelectorAll('.range-btn').forEach(b => b.addEventListener('click', () => { range = b.dataset.range; renderChart(); }));

