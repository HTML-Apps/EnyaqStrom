/* =====================================================================
   Netto-Akkukapazität (geschätzt) – Langzeitwert in den Berichten (Tab „Akku“)
   Messgröße: Steckdosen-kWh je 100 % Akku, K = Σ kWh ÷ Σ (Akku-Hub/100). Summe über Summe statt Mittel der Einzelwerte, damit große Ladehübe stärker zählen
   (der Rundungsfehler des Akku-% von ±0,5 je Ende wiegt bei 60 % Hub halb so schwer wie bei 30 %). Sinkt K bei gleichem Ladeverlust, fasst der Akku weniger.
   Verwendet nur Wechselstrom-Ladungen Zuhause und Bosch (gleiche Ladetechnik, Zähler bzw. Wallbox), mit Akku-Start/-Ende, Hub ≥ 30 %, Ende < 99 %
   (Zellausgleich und Ladekurve verfälschen die letzten Prozent) und gemessener kWh-Angabe. Ausreißer werden robust (MAD) ausgeschlossen.
   Unsicherheit: größerer Wert aus (a) der tatsächlichen Streuung der Ladungen (Ratio-Schätzer) und (b) dem reinen Rundungsfehler; 95-%-Bereich mit t-Faktor.
   Trend erst ab 12 Monaten und nur als Vergleich desselben Zeitraums im Vorjahr (Kälte senkt im Winter Wirkungsgrad und nutzbare Kapazität); „Hinweis“ nur,
   wenn der Unterschied größer ist als die kombinierte 95-%-Unsicherheit. Absolutwert (nutzbare kWh) = K × Ladewirkungsgrad 93 %: grobe Umrechnung.
   ===================================================================== */
const BAT = { hub: 30, endMax: 98, minN: 10, minHub: 400, eta: 0.93, win: 91, day: 864e5 };
let batChart = null;
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tCrit = (df) => df < 1 ? Infinity : df <= 15 ? [0, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13][df] : df <= 20 ? 2.09 : df <= 30 ? 2.04 : 1.96;
function batRows() {
  return getReadings().filter(r => (placeOf(r) === 'home' || placeOf(r) === 'bosch') && Number.isFinite(r.socStart) && Number.isFinite(r.socEnd) && r.socEnd - r.socStart >= BAT.hub && r.socEnd <= BAT.endMax && r.consumedSinceLast > 0)
    .map(r => { const hub = r.socEnd - r.socStart; return { t: Date.parse(r.date), hub, e: r.consumedSinceLast, k: r.consumedSinceLast / (hub / 100), bt: Number.isFinite(r.battTemp) ? r.battTemp : null, km: Number(r.odometerKm) > 0 ? Number(r.odometerKm) : null }; })
    .filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
}
function batFit(rows) {
  if (rows.length < 3) return null;
  let use = rows;
  if (rows.length >= 8) { const med = median(rows.map(x => x.k)), mad = median(rows.map(x => Math.abs(x.k - med))), lim = Math.max(3 * 1.4826 * mad, 0.04 * med); use = rows.filter(x => Math.abs(x.k - med) <= lim); }
  const n = use.length; if (n < 3) return null;
  const sumE = use.reduce((a, x) => a + x.e, 0), sumD = use.reduce((a, x) => a + x.hub / 100, 0), K = sumE / sumD;
  const ss = use.reduce((a, x) => a + Math.pow(x.e - K * x.hub / 100, 2), 0) * n / (n - 1);
  const se = Math.max(Math.sqrt(ss) / sumD, K * 0.41 * Math.sqrt(n) / (sumD * 100));
  return { n, out: rows.length - n, K, se, ci: tCrit(n - 1) * se, sumHub: sumD * 100, use, drop: rows.filter(x => !use.includes(x)) };
}
function batTrend(rows, now) {
  const months = (now - rows[0].t) / (30.44 * BAT.day);
  if (months < 12) return { state: 'short', months };
  for (const w of [91, 182]) {
    const a = batFit(rows.filter(x => x.t > now - w * BAT.day)), b = batFit(rows.filter(x => x.t > now - (365 + w) * BAT.day && x.t <= now - 365 * BAT.day));
    if (a && b && a.n >= 8 && b.n >= 8) { const d = (a.K / b.K - 1) * 100, se = Math.sqrt(Math.pow(a.se / a.K, 2) + Math.pow(b.se / b.K, 2)) * 100; return { state: 'ok', w, d, se, crit: tCrit(Math.min(a.n, b.n) - 1), a, b }; }
  }
  return { state: 'few', months };
}
/* =====================================================================
   Akku-Schonung-Score (Berichte → Akku): alle Ladungen der letzten 90 Tage mit Akku-Start und -Ende.
   100 − 50 × Anteil Ladeende über 80 % − 40 × min(1, 3 × Anteil Start unter 10 %) − 10 × Anteil Vollladungen (≥ 98 %).
   ===================================================================== */
let careMode = '90';                                                     // '90' = letzte 90 Tage, 'kauf' = seit Kauf
function batCare(now = Date.now(), mode = '90') {
  const from = mode === 'kauf' ? Date.parse(purchaseDay() + 'T00:00:00') : now - 90 * 864e5;
  const rs = getReadings().filter(r => Number.isFinite(r.socStart) && Number.isFinite(r.socEnd) && r.socEnd > r.socStart && Date.parse(r.date) >= from && Date.parse(r.date) <= now);   // bis „now“: auch für Rückblicke (Wochencheck)
  const n = rs.length; if (n < 5) return { n };
  const hi = rs.filter(r => r.socEnd > 80).length, lo = rs.filter(r => r.socStart < 10).length, full = rs.filter(r => r.socEnd >= 98).length;
  const score = Math.max(0, Math.min(100, Math.round(100 - 50 * hi / n - 40 * Math.min(1, 3 * lo / n) - 10 * full / n)));
  const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / n;
  return { n, score, ok80: (n - hi) / n, lo, full, s0: avg('socStart'), s1: avg('socEnd') };
}
function renderCare() {
  const c = batCare(Date.now(), careMode), el = $('care-body'); if (!el) return;
  document.querySelectorAll('.care-btn').forEach(b => { const on = b.dataset.care === careMode; b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-600', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-slate-500', !on); });
  const span = careMode === 'kauf' ? 'seit Kauf' : 'der letzten 90 Tage';
  if (c.score == null) { el.innerHTML = '<p class="mt-1 text-xl font-semibold">Noch zu wenige Daten</p><p class="text-sm mt-1 text-slate-600 dark:text-slate-300">Die Bewertung braucht mindestens 5 Ladungen ' + span + ' mit Akku-Start und -Ende (bisher ' + c.n + ').</p>'; return; }
  const lvl = c.score >= 90 ? ['Sehr gut', 'Dein Akku wird schonend behandelt.', '#10b981'] : c.score >= 75 ? ['Gut', 'Kleine Verbesserungen sind möglich.', '#22c55e'] : c.score >= 60 ? ['Okay', 'Mit zwei Gewohnheiten holst du mehr heraus.', '#f59e0b'] : ['Verbesserbar', 'Der Akku wird öfter stark gefordert.', '#ef4444'];
  const len = 97.4, dash = (c.score / 100 * len).toFixed(1);
  const tip = (1 - c.ok80) > 0.3 ? 'Lade im Alltag bis 80 % – 100 % nur vor langen Fahrten. Das spart Zellstress und kaum Reichweite.'
    : c.lo ? 'Vermeide es, unter 10 % zu fahren – lieber etwas früher anstecken.'
    : c.full ? 'Deine ' + (c.full === 1 ? 'Vollladung' : c.full + ' Vollladungen') + ' ' + (careMode === 'kauf' ? 'seit Kauf' : 'in den letzten 90 Tagen') + ' ' + (c.full === 1 ? 'ist' : 'sind') + ' in Ordnung, solange du danach bald losfährst.'
    : 'Weiter so – zwischen 20 und 80 % fühlt sich der Akku am wohlsten.';
  const bar = (w, col) => `<div class="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.round(w * 100)}%;background:${col}"></div></div>`;
  el.innerHTML = `<div class="mt-3 flex items-center gap-4">
      <div class="relative h-24 w-24 shrink-0"><svg viewBox="0 0 36 36" class="h-24 w-24 -rotate-90" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-width="3.5"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${lvl[2]}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash} ${len}"/></svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="font-barlow text-[34px] font-bold leading-none">${c.score}</span><span class="text-[10px] text-slate-500 dark:text-slate-400">von 100</span></div></div>
      <div><p class="text-lg font-semibold" style="color:${lvl[2]}">${lvl[0]}</p><p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${lvl[1]}</p><p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${c.n} Ladungen</p></div></div>
    <div class="mt-4 space-y-2.5 text-sm">
      <div><div class="flex justify-between"><span class="text-slate-600 dark:text-slate-300">Ladeende bis 80 %</span><span>${Math.round(c.ok80 * 100)} %</span></div>${bar(c.ok80, '#10b981')}</div>
      <div><div class="flex justify-between"><span class="text-slate-600 dark:text-slate-300">Nicht unter 10 %</span><span>${c.lo ? c.lo + ' × darunter' : 'nie darunter'}</span></div>${bar(1 - Math.min(1, 3 * c.lo / c.n), c.lo ? '#f59e0b' : '#10b981')}</div>
      ${(() => { const o = acdcSplit(careMode === 'kauf' ? Date.parse(purchaseDay() + 'T00:00:00') : Date.now() - 90 * 864e5); return o.dcP == null ? '' : `<div><div class="flex justify-between"><span class="text-slate-600 dark:text-slate-300">AC-Anteil (Energie)</span><span>${fmt(100 - o.dcP, 0)} % AC · ${fmt(o.dcP, 0)} % DC</span></div>${bar((100 - o.dcP) / 100, o.dcP > 40 ? '#f59e0b' : '#10b981')}</div>`; })()}
      <div><div class="flex justify-between"><span class="text-slate-600 dark:text-slate-300">Ø Ladebereich</span><span>${Math.round(c.s0)} → ${Math.round(c.s1)} %</span></div><div class="relative mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"><div class="absolute h-full rounded-full bg-sky-500" style="left:${c.s0}%;width:${Math.max(2, c.s1 - c.s0)}%"></div></div></div>
    </div>
    <div class="mt-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300"><b class="text-slate-900 dark:text-white">Tipp:</b> ${tip}</div>`;
}

/* =====================================================================
   AC/DC-Laden (Berichte → Akku): Energieanteil AC (Zuhause + Bosch) und DC (Unterwegs) – letzte 90 Tage, seit Kauf (je Monat) und seit Zulassung.
   Seit Zulassung: geladene kWh AC/DC vor dem Kauf laut Akku-Zertifikat (Einstellungen → Laden & Akku) plus die eigenen Ladungen seit Kauf.
   ===================================================================== */
let acdcMode = '90';
const ACDC_C = { ac: '#10b981', dc: '#f59e0b' };
function acdcSplit(from, to = Infinity) {
  const o = { ac: 0, dc: 0, nAc: 0, nDc: 0 };
  getReadings().forEach(r => { const t = Date.parse(r.date), e = Number(r.consumedSinceLast) || 0; if (!(t >= from && t < to) || e <= 0) return; if (placeOf(r) === 'away') { o.dc += e; o.nDc++; } else { o.ac += e; o.nAc++; } });
  o.tot = o.ac + o.dc; o.dcP = o.tot ? o.dc / o.tot * 100 : null; return o;
}
function acdcCert() {
  const st = getSettings(), A = Number(st.certAcKwh), D = Number(st.certDcKwh); if (!(Number.isFinite(A) && Number.isFinite(D) && A + D > 0)) return null;
  const km = Number(st.certKm) > 0 ? Number(st.certKm) : Number(st.purchaseKm) > 0 ? Number(st.purchaseKm) : null;
  return { ac: A / (A + D) * 100, dcP: D / (A + D) * 100, acK: A, dcK: D, kwh: A + D, km };
}
const acdcLvl = (p) => p == null ? ['', ''] : p <= 20 ? ['Sehr schonend', '#10b981'] : p <= 40 ? ['Ausgewogen', '#22c55e'] : p <= 60 ? ['Viel Schnellladen', '#f59e0b'] : ['Überwiegend DC', '#ef4444'];
function acdcBar(label, o, sub) {
  const p = o.dcP == null ? 0 : o.dcP, a = 100 - p;
  return `<div><div class="flex justify-between gap-2 text-sm"><span class="min-w-0 truncate text-slate-600 dark:text-slate-300">${label}</span><span class="shrink-0 tabular-nums"><b style="color:${ACDC_C.ac}">${fmt(a, 0)} %</b> · <b style="color:${ACDC_C.dc}">${fmt(p, 0)} %</b></span></div>
    <div class="mt-1 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div style="width:${a}%;background:${ACDC_C.ac}"></div><div style="width:${p}%;background:${ACDC_C.dc}"></div></div>${sub ? `<p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 text-left">${sub}</p>` : ''}</div>`;
}
function renderAcdc() {
  const el = $('acdc-body'); if (!el) return;
  document.querySelectorAll('.acdc-btn').forEach(b => { const on = b.dataset.acdc === acdcMode; b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-600', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-slate-500', !on); });
  const now = Date.now(), P0 = Date.parse(purchaseDay() + 'T00:00:00'), leg = `<div class="mt-3 flex gap-4 text-xs text-slate-500 dark:text-slate-400"><span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" style="background:${ACDC_C.ac}"></span>AC (Zuhause, Bosch)</span><span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" style="background:${ACDC_C.dc}"></span>DC (Unterwegs)</span></div>`;
  const head = (p, sub) => { const l = acdcLvl(p); return `<div class="mt-2 flex items-end justify-between gap-3"><div><p class="font-barlow text-[40px] font-bold leading-none" style="color:${ACDC_C.dc}">${p == null ? '–' : fmt(p, 0) + ' %'}<span class="ml-1.5 font-sans text-sm font-medium text-slate-500 dark:text-slate-400">DC-Anteil</span></p><p class="mt-1 text-xs text-slate-500 dark:text-slate-400 text-left">${sub}</p></div>${l[0] ? `<span class="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold" style="color:${l[1]};background:${l[1]}22">${l[0]}</span>` : ''}</div>`; };
  if (acdcMode === 'zul') {
    const c = acdcCert(), app = acdcSplit(P0);
    if (!c) { el.innerHTML = `<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">Für „Seit Zulassung“ fehlt das AC/DC-Verhältnis aus deinem Akku-Zertifikat.</p><button type="button" data-acdc-set class="mt-3 w-full rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-semibold active:scale-95 transition">In den Einstellungen eintragen</button>`; return; }
    const pre = { dcP: c.dcP, ac: c.acK, dc: c.dcK };
    const tot = c.kwh ? { ac: pre.ac + app.ac, dc: pre.dc + app.dc } : null; if (tot) { tot.tot = tot.ac + tot.dc; tot.dcP = tot.tot ? tot.dc / tot.tot * 100 : null; }
    el.innerHTML = head(tot ? tot.dcP : c.dcP, tot ? 'gesamt seit Zulassung · ' + fmt(tot.tot, 0) + ' kWh, davon ' + fmt(c.kwh, 0) + ' kWh vor dem Kauf laut Zertifikat' : '')
      + `<div class="mt-4 space-y-3">${acdcBar('Vor dem Kauf (Zertifikat)', pre, 'AC ' + fmt(c.acK, 0) + ' kWh · DC ' + fmt(c.dcK, 0) + ' kWh' + (c.km ? ' bis ' + fmt(c.km, 0) + ' km' : ''))}${app.tot ? acdcBar('Seit Kauf (deine Ladungen)', app, fmt(app.tot, 0) + ' kWh in ' + (app.nAc + app.nDc) + ' Ladungen') : ''}${tot ? acdcBar('Gesamt seit Zulassung', tot, '') : ''}</div>` + leg
      + (tot && app.dcP != null ? `<p class="mt-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300 text-left">${app.dcP < c.dcP - 2 ? 'Seit dem Kauf lädst du anteilig weniger per DC als der Vorbesitzer – gut für den Akku.' : app.dcP > c.dcP + 2 ? 'Seit dem Kauf lädst du anteilig mehr per DC als der Vorbesitzer. Gelegentliches Schnellladen ist unbedenklich, im Alltag ist AC schonender.' : 'Dein Ladeverhalten entspricht in etwa dem des Vorbesitzers.'}</p>` : '');
    return;
  }
  const from = acdcMode === 'kauf' ? P0 : now - 90 * 864e5, o = acdcSplit(from);
  if (!o.tot) { el.innerHTML = '<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine Ladungen mit kWh in diesem Zeitraum.</p>'; return; }
  /* Monatsbalken (gestapelt, kWh) */
  const d0 = new Date(from), months = []; for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d.getTime() <= now; d.setMonth(d.getMonth() + 1)) { const a = Math.max(from, d.getTime()), e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); months.push({ l: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''), ...acdcSplit(a, e) }); }
  const mx = Math.max(1, ...months.map(m => m.tot));
  const bars = `<div class="mt-4 flex items-end gap-1.5 h-28">${months.map(m => `<div class="flex min-w-0 flex-1 flex-col items-center gap-1"><div class="flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-md" style="height:${Math.max(2, m.tot / mx * 92)}px" title="${m.l}: AC ${fmt(m.ac, 0)} kWh, DC ${fmt(m.dc, 0)} kWh"><div style="height:${m.tot ? m.dc / m.tot * 100 : 0}%;background:${ACDC_C.dc}"></div><div style="flex:1;background:${ACDC_C.ac}"></div></div><span class="text-[10px] text-slate-500 dark:text-slate-400">${m.l}</span></div>`).join('')}</div>`;
  const c = acdcCert(), cmp = c ? `<p class="mt-3 text-xs text-slate-500 dark:text-slate-400 text-left">Zum Vergleich laut Akku-Zertifikat vor dem Kauf: ${fmt(c.dcP, 0)} % DC.</p>` : '';
  el.innerHTML = head(o.dcP, fmt(o.tot, 0) + ' kWh · ' + o.nAc + ' × AC, ' + o.nDc + ' × DC') + bars + leg + cmp;
}
$('acdc-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-acdc]'); if (b && b.dataset.acdc !== acdcMode) { acdcMode = b.dataset.acdc; renderAcdc(); } });
$('acdc-body').addEventListener('click', (e) => { if (e.target.closest('[data-acdc-set]')) { openSettings('laden'); setTimeout(() => { const f = $('set-cert-ac'); f.scrollIntoView({ block: 'center' }); }, 200); } });
function certRatioHint() { const n = (id) => { const t = $(id).value.trim(); if (!t) return NaN; return Number((/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '') : t).replace(',', '.')); }, a = n('set-cert-ac'), d = n('set-cert-dc');
  $('set-cert-ratio').textContent = Number.isFinite(a) && Number.isFinite(d) && a + d > 0 ? 'Verhältnis: ' + fmt(a / (a + d) * 100, 0) + ' % AC · ' + fmt(d / (a + d) * 100, 0) + ' % DC (' + fmt(a + d, 0) + ' kWh gesamt)' : ''; }
['set-cert-ac', 'set-cert-dc'].forEach(id => $(id).addEventListener('input', certRatioHint));
$('care-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-care]'); if (b && b.dataset.care !== careMode) { careMode = b.dataset.care; renderCare(); } });
/* =====================================================================
   Akku-Temperatur (Berichte → Akku): Auswertung der optional erfassten Temperatur beim Anstecken (ab 10 Ladungen).
   1) Strom an der Steckdose je 100 % Akku: warm (≥ 15 °C) gegen kalt (< 15 °C), je mind. 3 passende Ladungen. Kapazität und Verluste
      lassen sich dabei nicht trennen – der Mehrbedarf bei Kälte ist v. a. Heizung/Verlust, deshalb wird er so (und nicht als Kapazität) beschriftet.  2) Ø Ladeverlust nach Temperaturbereich (Zuhause/Bosch)
   ===================================================================== */
const TEMP_MIN_N = 10, TEMP_SPLIT = 15;
function renderTempCard() {
  const rs = getReadings(), withT = rs.filter(r => Number.isFinite(r.battTemp)), el = $('temp-body'); if (!el) return;
  if (withT.length < TEMP_MIN_N) {
    el.innerHTML = `<p class="mt-1 text-xl font-semibold">Noch ${TEMP_MIN_N - withT.length} ${TEMP_MIN_N - withT.length === 1 ? 'Ladung' : 'Ladungen'} bis zur Auswertung</p>
      <p class="text-sm mt-1 text-slate-600 dark:text-slate-300">Trage beim Erfassen einer Ladung die Akku-Temperatur ein, die das Infotainment beim Anstecken zeigt. Ab ${TEMP_MIN_N} Ladungen zeigt diese Karte, wie Kälte die nutzbare Kapazität und die Ladeverluste beeinflusst.</p>
      <div class="mt-3"><p class="text-xs text-slate-500 dark:text-slate-400">${withT.length} von ${TEMP_MIN_N} Ladungen mit Temperatur</p><div class="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-2 rounded-full bg-emerald-500" style="width:${Math.round(withT.length / TEMP_MIN_N * 100)}%"></div></div></div>`;
    return;
  }
  const rows = batRows().filter(x => x.bt != null), warm = batFit(rows.filter(x => x.bt >= TEMP_SPLIT)), cold = batFit(rows.filter(x => x.bt < TEMP_SPLIT));
  let cap = '';
  if (warm && cold) { const d = (cold.K / warm.K - 1) * 100; cap = `<p class="mt-3 text-sm font-medium">Strom je 100 % Akku nach Akku-Temperatur</p><div class="mt-2 grid grid-cols-2 gap-2 text-center">
      <div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-xs text-slate-500 dark:text-slate-400">Akku ≥ ${TEMP_SPLIT} °C</p><p class="text-lg font-semibold tabular-nums">${fmt(warm.K, 1)} kWh</p><p class="text-[11px] text-slate-500 dark:text-slate-400">${warm.n} Ladungen</p></div>
      <div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-xs text-slate-500 dark:text-slate-400">Akku &lt; ${TEMP_SPLIT} °C</p><p class="text-lg font-semibold tabular-nums">${fmt(cold.K, 1)} kWh</p><p class="text-[11px] text-slate-500 dark:text-slate-400">${cold.n} Ladungen</p></div></div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Strom an der Steckdose je 100 % Akku. ${Math.abs(d) < 2 ? 'Kaum Unterschied zwischen warmem und kaltem Akku.' : d > 0 ? 'Mit kaltem Akku brauchst du ' + fmt(d, 1) + ' % mehr Strom für dieselbe Akkufüllung – das Auto heizt beim Laden mit. Das ist normal und kein Zeichen von Alterung.' : 'Mit kaltem Akku lädst du ' + fmt(-d, 1) + ' % weniger Strom je 100 % – kalte Zellen zeigen oft etwas weniger nutzbare Kapazität an; im Sommer gleicht sich das wieder aus.'}</p>`; }
  else cap = `<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Für den Vergleich warm/kalt braucht es je mindestens 3 Ladungen mit Akku-Start und -Ende über 30 % Hub (bisher ${rows.filter(x => x.bt >= TEMP_SPLIT).length} warm, ${rows.filter(x => x.bt < TEMP_SPLIT).length} kalt).</p>`;
  const bins = [['< 10 °C', -99, 10], ['10–20 °C', 10, 20], ['≥ 20 °C', 20, 99]].map(([l, a, b]) => { const v = []; rs.forEach((r, i) => { if (!Number.isFinite(r.battTemp) || r.battTemp < a || r.battTemp >= b) return; const st = entryStats(rs, i); if (st.loss != null && st.loss >= 0 && st.loss < 40) v.push(st.loss); }); return { l, n: v.length, m: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null }; });
  const mx = Math.max(10, ...bins.map(b => b.m || 0));
  const loss = bins.some(b => b.n) ? `<p class="mt-4 text-sm font-medium">Ø Ladeverlust nach Akku-Temperatur</p><div class="mt-2 space-y-2">${bins.map(b => `<div class="flex items-center gap-2 text-sm"><span class="w-16 shrink-0 text-slate-600 dark:text-slate-300">${b.l}</span><div class="h-2.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-sky-500" style="width:${b.m != null ? Math.round(b.m / mx * 100) : 0}%"></div></div><span class="w-20 shrink-0 text-right tabular-nums">${b.m != null ? fmt(b.m, 1) + ' %' : '–'}<span class="text-[11px] text-slate-500 dark:text-slate-400"> (${b.n})</span></span></div>`).join('')}</div><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Verlust aus Zähler-kWh und Akku-%; bei kaltem Akku heizt das Auto beim Laden mit.</p>` : '';
  el.innerHTML = `<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${withT.length} Ladungen mit Temperatur · Ø ${fmt(withT.reduce((a, r) => a + r.battTemp, 0) / withT.length, 0)} °C</p>` + cap + loss;
}
/* =====================================================================
   Mehrverbrauch nach Temperatur (Berichte → Akku): Fahrverbrauch je Strecke zwischen zwei Ladungen aus Akku-% × Kapazität (ohne Ladeverluste),
   gruppiert nach der Akku-Temperatur beim Anstecken (Ende der Strecke) bzw. der Ø Außentemperatur der Tage dieser Strecke.
   Referenz = einstellbarer Bereich (Standard 15 bis unter 22 °C); darunter und darüber 5-°C-Bereiche. Verbrauch je Bereich = Σ kWh ÷ Σ km.
   Hochrechnung: km je Bereich × (Verbrauch − Referenz), in Steckdosen-kWh (÷ Ø Wirkungsgrad) und € (× Ø Strompreis).
   ===================================================================== */
let tcMode = 'akku', tcTok = 0;
const TC_MIN_KM = 150, TC_MIN_REF = 3;
function tcRange() { const s = getSettings(), lo = Number(s.refLo), hi = Number(s.refHi); return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : [15, 22]; }
function tcBins(lo, hi) {
  const f = (v) => String(v).replace('-', '−');
  return [{ k: 'h3', a: hi + 10, b: 99, l: '≥ ' + f(hi + 10) + ' °C' }, { k: 'h2', a: hi + 5, b: hi + 10, l: f(hi + 5) + '–' + f(hi + 10) + ' °C' }, { k: 'h1', a: hi, b: hi + 5, l: f(hi) + '–' + f(hi + 5) + ' °C' },
    { k: 'ref', a: lo, b: hi, l: f(lo) + '–' + f(hi) + ' °C' },
    { k: 'c1', a: lo - 5, b: lo, l: f(lo - 5) + '–' + f(lo) + ' °C' }, { k: 'c2', a: lo - 10, b: lo - 5, l: f(lo - 10) + '–' + f(lo - 5) + ' °C' }, { k: 'c3', a: lo - 15, b: lo - 10, l: f(lo - 15) + '–' + f(lo - 10) + ' °C' }, { k: 'c4', a: -99, b: lo - 15, l: '< ' + f(lo - 15) + ' °C' }];
}
function tcSegments() {
  const rs = getReadings(), out = [];
  rs.forEach((r, i) => { if (i < 1) return; const s = entryStats(rs, i); if (s.method !== 'soc' || s.rough || !(s.usedBat > 0) || !(s.km >= 10)) return; out.push({ i, km: s.km, bat: s.usedBat, bt: Number.isFinite(r.battTemp) ? r.battTemp : null, a: wxIso(new Date(rs[i - 1].date)), b: wxIso(new Date(r.date)) }); });
  return out;
}
async function renderTcCard() {
  const tok = ++tcTok, el = $('tc-body'); if (!el) return;
  document.querySelectorAll('.tc-btn').forEach(b => { const on = b.dataset.tc === tcMode; b.classList.toggle('bg-white', on); b.classList.toggle('dark:bg-slate-600', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-slate-500', !on); });
  const [lo, hi] = tcRange(), bins = tcBins(lo, hi), segs = tcSegments(); let pts = [];
  if (tcMode === 'akku') pts = segs.filter(x => x.bt != null).map(x => ({ ...x, t: x.bt }));
  else {
    const l = wxLoc(); if (!l) { el.innerHTML = '<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Für die Außentemperatur bitte in den Einstellungen unter „Wetter“ einen Standort eintragen.</p>'; return; }
    if (!segs.length) { el.innerHTML = '<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Noch keine Strecken mit Akku-Start/-Ende und km-Stand.</p>'; return; }
    el.innerHTML = '<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Temperaturen werden geladen …</p>';
    let days = {}; try { days = await wxTemps(l, segs.reduce((m, x) => x.a < m ? x.a : m, segs[0].a), segs.reduce((m, x) => x.b > m ? x.b : m, segs[0].b)); } catch (e) { }
    if (tok !== tcTok) return;
    segs.forEach(x => { let sum = 0, n = 0; for (let t = Date.parse(x.a + 'T12:00:00'), e = Date.parse(x.b + 'T12:00:00'); t <= e; t += 864e5) { const v = days[wxIso(new Date(t))]; if (v != null) { sum += v; n++; } } if (n) pts.push({ ...x, t: sum / n }); });
  }
  bins.forEach(b => { b.km = 0; b.bat = 0; b.n = 0; });
  pts.forEach(x => { const b = bins.find(y => x.t >= y.a && x.t < y.b); if (b) { b.km += x.km; b.bat += x.bat; b.n++; } });
  bins.forEach(b => { b.rate = b.km > 0 ? b.bat / b.km * 100 : null; });
  const ref = bins.find(b => b.k === 'ref'), src = tcMode === 'akku' ? 'Akku-Temperatur' : 'Außentemperatur';
  if (ref.n < TC_MIN_REF) {
    el.innerHTML = `<p class="mt-2 text-xl font-semibold">Noch zu wenige Referenz-Strecken</p><p class="text-sm mt-1 text-slate-600 dark:text-slate-300">Für die Referenz braucht es mindestens ${TC_MIN_REF} Strecken mit ${src} zwischen ${String(lo).replace('-', '−')} und ${String(hi).replace('-', '−')} °C (bisher ${ref.n}). Gezählt werden Strecken zwischen zwei Ladungen mit Akku-Start/-Ende und km-Stand${tcMode === 'akku' ? ' und eingetragener Akku-Temperatur' : ''}.</p>`;
    return;
  }
  bins.forEach(b => { b.pct = b.rate != null && b.k !== 'ref' ? (b.rate / ref.rate - 1) * 100 : null; });
  const span = Math.max(25, ...bins.filter(b => b.pct != null).map(b => Math.abs(b.pct)));
  const eta = (v => v >= 0.75 && v <= 0.98 ? v : BAT.eta)(avgEff(getReadings())), rsAll = getReadings(); let e = 0, c = 0; rsAll.forEach(r => { if (r.consumedSinceLast > 0 && r.cost > 0) { e += r.consumedSinceLast; c += r.cost; } }); const price = e > 0 ? c / e : Number(getSettings().price) || 0;
  const extra = (ks) => bins.filter(b => ks.includes(b.k[0]) && b.rate != null).reduce((a, b) => a + b.km * (b.rate - ref.rate) / 100, 0) / eta;
  const xc = extra(['c']), xh = extra(['h']), fx = (v) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 0) + ' kWh · ' + (v >= 0 ? '' : '−') + eur(Math.abs(v) * price).replace(/,\d\d\s?€/, ' €');
  const row = (b) => {
    if (b.k === 'ref') return `<div class="grid items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-600/10 py-0.5" style="grid-template-columns:64px 1fr 96px"><span class="pl-1 text-emerald-700 dark:text-emerald-300 font-semibold">${b.l}</span><div class="relative h-4"><div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-emerald-500"></div></div><span class="text-right text-emerald-700 dark:text-emerald-300 font-semibold">Referenz</span></div>`;
    const weak = b.km < TC_MIN_KM, w = b.pct != null ? Math.min(50, Math.abs(b.pct) / span * 50) : 0, cold = b.k[0] === 'c', col = cold ? ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0369a1'][+b.k[1] - 1] : ['#fdba74', '#fb923c', '#ea580c'][+b.k[1] - 1];
    const bar = b.pct != null ? `<div class="absolute top-0.5 bottom-0.5 ${b.pct >= 0 ? 'rounded-r' : 'rounded-l'}" style="${b.pct >= 0 ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%;background:${col};${weak ? 'opacity:.45' : ''}"></div>` : '';
    return `<div class="grid items-center gap-2" style="grid-template-columns:64px 1fr 96px"><span class="pl-1 text-slate-600 dark:text-slate-300">${b.l}</span><div class="relative h-4"><div class="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 dark:bg-slate-600"></div>${bar}</div><span class="text-right tabular-nums">${b.pct != null ? (b.pct >= 0 ? '+' : '−') + fmt(Math.abs(b.pct), 0) + ' %' + (weak ? '*' : '') : '–'} <span class="text-[11px] text-slate-500 dark:text-slate-400">(${b.n})</span></span></div>`;
  };
  el.innerHTML = `<div class="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 dark:bg-emerald-600/15 p-3"><div><p class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Referenz · ${src.split('-')[0] === 'Akku' ? 'Akku' : 'außen'} ${ref.l}</p><p class="text-left text-[11px] text-slate-500 dark:text-slate-400">${ref.n} Strecken · ${fmt(ref.km, 0)} km · ohne Ladeverluste</p></div><p class="text-2xl font-bold tabular-nums">${fmt(ref.rate, 1)}<span class="text-xs font-medium text-slate-500 dark:text-slate-400"> kWh/100</span></p></div>
    <div class="mt-3 space-y-1.5 text-[13px]">${bins.map(row).join('')}</div>
    <p class="mt-2 text-left text-[11px] text-slate-500 dark:text-slate-400">(n) = Strecken · * unsicher, unter ${TC_MIN_KM} km Datenbasis · Balken nach rechts = Mehrverbrauch</p>
    <div class="mt-3 grid grid-cols-2 gap-2 text-center"><div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-[11px] text-slate-500 dark:text-slate-400">Mehrverbrauch Kälte</p><p class="font-semibold tabular-nums">${fx(xc)}</p></div><div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-[11px] text-slate-500 dark:text-slate-400">Mehrverbrauch Hitze</p><p class="font-semibold tabular-nums">${fx(xh)}</p></div></div>
    <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Hochrechnung über alle erfassten Strecken: km je Bereich × (Verbrauch − Referenz), an der Steckdose (Ø Wirkungsgrad ${fmt(eta * 100, 0)} %) × Ø Strompreis ${fmt(price, 3)} €/kWh. Referenzbereich änderbar unter Einstellungen → Laden &amp; Akku.</p>`;
}
$('tc-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-tc]'); if (b && b.dataset.tc !== tcMode) { tcMode = b.dataset.tc; renderTcCard(); } });

/* =====================================================================
   Alterung im Vergleich (Berichte → Akku): Aviloo-Benchmark Enyaq iV (FLASH-Tests, n = 20.303), Median-SoH 95,14 % / 92,67 % / 91,04 %
   bei 50.000 / 100.000 / 150.000 km. Bis 50.000 km Potenzkurve (Verlust ∝ km^0,6, früher Abfall), danach linear zwischen den Stützpunkten,
   über 150.000 km mit der letzten Steigung fortgeschrieben. Eigener SoH = nutzbare kWh (K × η) ÷ Werksangabe netto aus dem Fahrzeugprofil; Garantie ebenso.
   Benchmark-Kurve nur für den Enyaq iV (Profil av), sonst nur eigene Schätzung + Garantie.
   ===================================================================== */
const AVILOO = { n: 20303, pts: [[0, 100], [50000, 95.14], [100000, 92.67], [150000, 91.04]], get nom() { return carProf().net; }, get warr() { const c = carProf(); return { yrs: c.wYrs, km: c.wKm, soh: c.wSoh }; } };
function avSoh(km) {
  const P = AVILOO.pts; if (!(km > 0)) return 100;
  if (km <= P[1][0]) return 100 - (100 - P[1][1]) * Math.pow(km / P[1][0], 0.6);
  for (let i = 1; i < P.length - 1; i++) if (km <= P[i + 1][0]) return P[i][1] + (P[i + 1][1] - P[i][1]) * (km - P[i][0]) / (P[i + 1][0] - P[i][0]);
  const a = P[P.length - 2], b = P[P.length - 1]; return b[1] + (b[1] - a[1]) * (km - b[0]) / (b[0] - a[0]);
}
function avPoints(rows) {                                                       // eigene Messpunkte je Quartal (mind. 6 Ladungen) + Gesamt
  const out = [], by = new Map();
  rows.forEach(x => { if (x.km == null) return; const d = new Date(x.t), q = d.getFullYear() + '-' + Math.floor(d.getMonth() / 3); if (!by.has(q)) by.set(q, []); by.get(q).push(x); });
  [...by.values()].forEach(g => { const f = batFit(g); if (!f || f.n < 6) return; const kms = g.map(x => x.km).sort((a, b) => a - b); out.push({ km: kms[Math.floor(kms.length / 2)], soh: f.K * BAT.eta / AVILOO.nom * 100, ci: f.ci * BAT.eta / AVILOO.nom * 100, n: f.n }); });
  return out.sort((a, b) => a.km - b.km);
}
function renderAviloo(rows, fit, ok) {
  const el = $('av-body'); if (!el) return;
  const km = lastKnownKm(), mySoh = ok ? fit.K * BAT.eta / AVILOO.nom * 100 : null, myCi = ok ? fit.ci * BAT.eta / AVILOO.nom * 100 : null, exp = km ? avSoh(km) : null;
  if (!carProf().av) {                                                          // kein Benchmark für dieses Modell: eigene Schätzung + Garantie
    const c = carProf(), w = AVILOO.warr;
    el.innerHTML = `<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">Für den ${esc(c.name)} gibt es noch keine Vergleichskurve (Aviloo). ${mySoh != null ? 'Dein Akku (Schätzung): <b class="text-emerald-600 dark:text-emerald-400">' + fmt(mySoh, 1) + ' %</b> von ' + fmt(c.net, 1) + ' kWh netto.' : 'Deine eigene Schätzung erscheint, sobald genug Ladungen vorliegen.'}</p>`
      + `<p class="mt-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300 text-left"><b class="text-slate-900 dark:text-white">Garantie:</b> ${w.yrs} Jahre bzw. ${fmt(w.km, 0)} km, Mindestkapazität laut Garantiebedingungen (üblich ${w.soh} %).</p>`;
    return;
  }
  const pts = avPoints(rows); if (ok && km && !pts.length) pts.push({ km, soh: mySoh, ci: myCi, n: fit.n });
  /* Diagramm (SVG): x 0–160.000 km, y 86–100 % */
  const W = 320, H = 170, L = 34, R = 10, T = 10, B = 26, X = (k) => L + k / 160000 * (W - L - R), Y = (v) => T + (100 - Math.max(86, Math.min(100, v))) / 14 * (H - T - B);
  let curve = ''; for (let k = 0; k <= 160000; k += 4000) curve += (k ? ' L' : 'M') + X(k).toFixed(1) + ' ' + Y(avSoh(k)).toFixed(1);
  const grid = [100, 96, 92, 88].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800" stroke-width="1"/><text x="${L - 5}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="currentColor" class="text-slate-400">${v}</text>`).join('')
    + [0, 50000, 100000, 150000].map(k => `<text x="${X(k)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="currentColor" class="text-slate-400">${k ? k / 1000 + 'k' : '0'}</text>`).join('');
  const bench = AVILOO.pts.slice(1).map(([k, v]) => `<circle cx="${X(k)}" cy="${Y(v)}" r="3.2" fill="#0ea5e9"/><text x="${X(k)}" y="${Y(v) - 7}" text-anchor="middle" font-size="9.5" fill="#0ea5e9">${fmt(v, 1)}</text>`).join('');
  const mine = pts.map(p => `<line x1="${X(p.km)}" x2="${X(p.km)}" y1="${Y(p.soh + p.ci)}" y2="${Y(p.soh - p.ci)}" stroke="#10b981" stroke-width="1.5" opacity=".6"/><circle cx="${X(p.km)}" cy="${Y(p.soh)}" r="4" fill="#10b981" stroke="#0f172a" stroke-width="1.5"><title>${fmt(p.km, 0)} km: ${fmt(p.soh, 1)} % (± ${fmt(p.ci, 1)})</title></circle>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="mt-3 w-full" role="img" aria-label="Akkugesundheit über km: Aviloo-Median gegen deine Messung">${grid}<path d="${curve}" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-dasharray="1 0"/>${bench}${mine}</svg>
    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400"><span class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded bg-sky-500"></span>Aviloo-Median Enyaq iV</span><span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Deine Schätzung (± Unsicherheit)</span></div>`;
  const head = mySoh != null && exp != null ? `<div class="mt-2 grid grid-cols-2 gap-2 text-center">
      <div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-xs text-center text-slate-500 dark:text-slate-400">Typisch bei ${fmt(km, 0)} km</p><p class="text-lg font-semibold tabular-nums text-sky-600 dark:text-sky-400">${fmt(exp, 1)} %</p></div>
      <div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-xs text-center text-slate-500 dark:text-slate-400">Dein Akku (Schätzung)</p><p class="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">${fmt(mySoh, 1)} %</p></div></div>`
    : `<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">${exp != null ? 'Typisch bei ' + fmt(km, 0) + ' km: ' + fmt(exp, 1) + ' %. ' : ''}Deine eigene Schätzung erscheint, sobald genug Ladungen vorliegen.</p>`;
  /* Prognose (Median) in kWh und Reichweite */
  let k100 = null; try { const rs = getReadings(), t = rs.length ? consumptionTotals(rs, rs.map((_, i) => i)) : null; k100 = t && t.km ? t.kwh100 * BAT.eta : null; } catch (e) { }
  const prog = [50000, 100000, 150000].filter(k => !km || k > km - 5000).map(k => { const v = avSoh(k), kwh = v / 100 * AVILOO.nom; return `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="py-1.5 text-left">${fmt(k, 0)} km</td><td class="py-1.5 text-right tabular-nums">${fmt(v, 1)} %</td><td class="py-1.5 text-right tabular-nums">${fmt(kwh, 1)} kWh</td><td class="py-1.5 text-right tabular-nums">${k100 ? 'ca. ' + fmt(Math.round(kwh / k100 * 100 / 5) * 5, 0) + ' km' : '–'}</td></tr>`; }).join('');
  const w = AVILOO.warr, atW = avSoh(w.km);
  el.innerHTML = head + svg
    + `<p class="mt-4 text-sm font-medium text-left">Prognose (typischer Verlauf)</p><table class="mt-1 w-full text-sm"><thead><tr class="text-xs text-slate-500 dark:text-slate-400"><th class="text-left font-normal">bei</th><th class="text-right font-normal">SoH</th><th class="text-right font-normal">netto</th><th class="text-right font-normal">Reichweite</th></tr></thead><tbody>${prog}</tbody></table>`
    + `<p class="mt-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300 text-left"><b class="text-slate-900 dark:text-white">Garantie:</b> ${w.yrs} Jahre bzw. ${fmt(w.km, 0)} km, Mindestkapazität laut Garantiebedingungen (üblich ${w.soh} %). Ein typischer Enyaq liegt bei ${fmt(w.km, 0)} km noch bei etwa ${fmt(atW, 0)} %, also rund ${fmt(atW - w.soh, 0)} Punkte darüber.</p>`
    + `<p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-left">Benchmark: Aviloo FLASH-Tests, ${fmt(AVILOO.n, 0)} Enyaq iV, Median ${AVILOO.pts.slice(1).map(p => fmt(p[1], 2) + ' % bei ' + fmt(p[0] / 1000, 0) + '.000 km').join(', ')}. Deine Schätzung = nutzbare kWh (η ${Math.round(BAT.eta * 100)} %) ÷ ${AVILOO.nom} kWh Werksangabe und deshalb nur grob vergleichbar. Aussagekräftiger ist, ob deine Punkte über die Jahre der Kurve folgen. Reichweite mit deinem Ø-Verbrauch.</p>`;
}
/* Berichte → Akku → mehr: Komfortenergie der laufenden Heizsaison (ab 1. Oktober): Summe, Kosten, je Vorheizen nach Außentemperatur,
   Verbrauch/100 km nur Fahren (ab Akku ÷ Wirkungsgrad) gegen mit Vorheizen. */
let cfTok = 0;
async function renderCfCard() {
  const el = $('cf-body'), tok = ++cfTok; if (!el) return;
  const rs = getReadings(), now = new Date(), y0 = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1, from = new Date(y0, 9, 1), lab = 'Winter ' + y0 + '/' + String(y0 + 1).slice(2);
  const idx = rs.map((r, i) => i).filter(i => new Date(rs[i].date) >= from), cf = idx.filter(i => comfortOf(rs[i]) > 0); $('cf-season').textContent = lab;
  if (!cf.length) { el.innerHTML = `<p class="mt-2 text-sm text-left text-slate-600 dark:text-slate-300">Noch nichts eingetragen. Wenn du am Kabel vorheizt, trag die Komfortenergie aus der MyŠkoda-App in der Historie beim Bearbeiten der Ladung ein (Feld „🔥 Komfort kWh“).</p>`; return; }
  const kwh = cf.reduce((a, i) => a + comfortOf(rs[i]), 0), eurS = cf.reduce((a, i) => a + comfortOf(rs[i]) * (unitOf(rs[i]) ?? getSettings().price), 0), days = new Set(cf.map(i => wxIso(new Date(rs[i].date)))).size;
  let km = 0, wall = 0; idx.forEach(i => { const st = entryStats(rs, i); if (st.method === 'soc' && st.usedWall > 0) { km += st.km; wall += st.usedWall; } });
  const big = (v, u, sub, cls = '') => `<div><p class="font-barlow text-[34px] font-bold leading-none ${cls}">${v}<span class="text-[15px]"> ${u}</span></p><p class="mt-1 text-left text-xs text-slate-500 dark:text-slate-400">${sub}</p></div>`;
  const head = `<div class="mt-2 flex gap-6">${big(fmt(kwh, 1), 'kWh', 'an ' + days + (days === 1 ? ' Tag' : ' Tagen') + ' am Kabel geheizt', 'text-amber-600 dark:text-amber-300')}${big(fmt(eurS, 2), '€', 'Ø ' + eur(eurS / cf.length) + ' je Vorheizen')}</div>`;
  const cons = km >= 50 ? `<p class="mt-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-xs text-left text-slate-600 dark:text-slate-300">Verbrauch/100 km in dieser Saison: <b>Fahren ${fmt(wall / km * 100, 1)} kWh</b> · mit Vorheizen ${fmt((wall + kwh) / km * 100, 1)} kWh</p>` : '';
  const note = '<p class="mt-2 text-[11px] text-left text-slate-500 dark:text-slate-400">Kosten bleiben in deinen Ladekosten enthalten. Ladeverlust, Wirkungsgrad und Prognose rechnen ohne Komfortenergie.</p>';
  el.innerHTML = head + '<div id="cf-bars"></div>' + cons + note;
  const l = wxLoc(); if (!l) return;
  let t = {}; try { t = await wxTemps(l, wxIso(new Date(rs[cf[0]].date)), wxIso(new Date(rs[cf[cf.length - 1]].date))); } catch (e) { }
  if (tok !== cfTok || !$('cf-bars')) return;
  const bins = [['< −3°', -99, -3], ['−3–0°', -3, 0], ['0–3°', 0, 3], ['3–6°', 3, 6], ['≥ 6°', 6, 99]].map(([lb, a, b]) => { const v = cf.map(i => ({ T: t[wxIso(new Date(rs[i].date))], k: comfortOf(rs[i]) })).filter(x => Number.isFinite(x.T) && x.T >= a && x.T < b); return { lb, n: v.length, avg: v.length ? v.reduce((s2, x) => s2 + x.k, 0) / v.length : 0 }; }).filter(x => x.n);
  if (!bins.length) return; const mx = Math.max(...bins.map(x => x.avg), 0.1);
  $('cf-bars').innerHTML = `<div class="mt-4 flex h-[86px] items-end gap-1.5">${bins.map(x => `<div class="flex h-full flex-1 flex-col items-center justify-end gap-0.5"><span class="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">${fmt(x.avg, 1)}</span><span class="w-full rounded-t bg-amber-500" style="height:${Math.max(4, x.avg / mx * 60).toFixed(0)}px" title="${x.n}× · Ø ${fmt(x.avg, 1)} kWh"></span></div>`).join('')}</div>
    <div class="mt-1 flex gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">${bins.map(x => `<span class="flex-1 text-center">${x.lb}</span>`).join('')}</div><p class="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">Ø kWh je Vorheizen nach Tagesmittel außen</p>`;
}
function renderBattery() {
  try { renderCfCard(); } catch (e) { console.error(e); }
  try { renderTcCard(); } catch (e) { console.error(e); }
  try { renderTempCard(); } catch (e) { console.error(e); }
  try { renderCare(); } catch (e) { console.error(e); }
  try { renderAcdc(); } catch (e) { console.error(e); }
  try { renderCurve(); } catch (e) { console.error(e); }
  const rows = batRows(), fit = batFit(rows), now = Date.now(), ok = !!fit && fit.n >= BAT.minN && fit.sumHub >= BAT.minHub;
  $('bat-value').classList.toggle('hidden', !ok); $('bat-few').classList.toggle('hidden', ok);
  const hubSum = rows.reduce((a, x) => a + x.hub, 0);
  $('bat-p1').style.width = Math.min(100, rows.length / BAT.minN * 100) + '%'; $('bat-p2').style.width = Math.min(100, hubSum / BAT.minHub * 100) + '%';
  $('bat-p1t').textContent = rows.length + ' von ' + BAT.minN + ' passenden Ladungen'; $('bat-p2t').textContent = fmt(hubSum, 0) + ' von ' + BAT.minHub + ' %-Punkten Akku-Hub';
  if (ok) {
    $('bat-net').textContent = fmt(fit.K * BAT.eta, 1);
    $('bat-k').textContent = fmt(fit.K, 1); $('bat-ci').textContent = '± ' + fmt(fit.ci, 1);
    const eta = '<span style="font-family:system-ui,Roboto,\'Noto Sans\',\'Segoe UI\',\'DejaVu Sans\',\'Times New Roman\',serif" title="Ladewirkungsgrad">η</span>';
    $('bat-c').innerHTML = 'bei ' + eta + ' = ' + Math.round(BAT.eta * 100) + ' %';
    $('bat-basis').textContent = 'Basis: ' + fit.n + ' Ladungen Zuhause/Bosch · ' + fmtDate(new Date(fit.use[0].t).toISOString()) + ' bis ' + fmtDate(new Date(fit.use[fit.use.length - 1].t).toISOString()) + (fit.out ? ' · ' + fit.out + (fit.out === 1 ? ' Ausreißer' : ' Ausreißer') + ' ausgeschlossen' : '');
  }
  try { renderAviloo(rows, fit, ok); } catch (e) { console.error(e); }
  /* Trend */
  const tr = rows.length ? batTrend(rows, now) : { state: 'none' }, h = $('bat-trend-h'), t = $('bat-trend-t');
  h.className = 'mt-1 text-xl font-semibold'; t.className = 'text-sm mt-1 text-slate-600 dark:text-slate-300';
  if (!ok) { h.textContent = 'Noch nicht bewertbar'; t.textContent = 'Der Trend folgt, sobald genug Ladungen für einen Ausgangswert vorliegen und mindestens 12 Monate Daten vorhanden sind.'; }
  else if (tr.state === 'short') { h.textContent = 'Ausgangswert festgehalten'; t.textContent = 'Ein Trend ist erst nach 12 Monaten sinnvoll, weil Kälte den Wert im Winter senkt (aktuell ' + fmt(tr.months, 1) + ' Monate Daten). Dein Ausgangswert: ' + fmt(fit.K, 1) + ' kWh je 100 %.'; }
  else if (tr.state === 'few') { h.textContent = 'Zu wenige Vergleichsdaten'; t.textContent = 'Im selben Zeitraum vor einem Jahr liegen weniger als 8 passende Ladungen vor – ein Vergleich wäre nicht aussagekräftig.'; }
  else {
    const per = tr.w === 91 ? 'den letzten 3 Monaten' : 'den letzten 6 Monaten', sig = Math.abs(tr.d) > tr.crit * tr.se, val = (tr.d > 0 ? '+' : '−') + fmt(Math.abs(tr.d), 1) + ' % (± ' + fmt(tr.crit * tr.se, 1) + ' %)';
    h.textContent = sig ? (tr.d < 0 ? 'Hinweis auf geringere Kapazität: ' : 'Höhere Werte: ') + val : 'Kein erkennbarer Unterschied: ' + val;
    h.className += sig ? (tr.d < 0 ? ' text-amber-600 dark:text-amber-400' : ' text-sky-600 dark:text-sky-400') : ' text-emerald-600 dark:text-emerald-400';
    t.textContent = 'Vergleich von ' + per + ' (' + fmt(tr.a.K, 1) + ' kWh je 100 %, ' + tr.a.n + ' Ladungen) mit demselben Zeitraum im Vorjahr (' + fmt(tr.b.K, 1) + ', ' + tr.b.n + ' Ladungen). '
      + (sig ? (tr.d < 0 ? 'Der Unterschied ist größer als die Messunsicherheit. Er kann auf Akkualterung hindeuten, aber auch auf höhere Ladeverluste (Kabel, Wallbox, Heizung) – prüfe das mit einer Diagnose per OBD.' : 'Ein Anstieg ist bei einem Akku ungewöhnlich – prüfe Zählerstände, Akku-Angaben und Ladeverluste.') : 'Die Differenz liegt innerhalb der Messunsicherheit.');
  }
  /* Verlauf: Einzelwerte und gleitender Wert (letzte 3 Monate, ab 6 Ladungen) */
  const draw = rows.length >= 3, day = BAT.day;
  $('bat-chart-card').classList.toggle('hidden', !draw);
  if (batChart) { batChart.destroy(); batChart = null; }
  if (!draw) return;
  const roll = [];
  rows.forEach(r => { const w = rows.filter(x => x.t > r.t - BAT.win * day && x.t <= r.t); if (w.length >= 6) { const f = batFit(w); if (f) roll.push({ x: r.t, y: f.K }); } });
  const use = fit ? fit.use : rows, drop = fit ? fit.drop : [], t0 = rows[0].t - 3 * day, t1 = Math.max(now, rows[rows.length - 1].t) + 3 * day;
  const dark = isDark(), text = dark ? '#cbd5e1' : '#475569', grid = dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)', yrs = (t1 - t0) > 300 * day;
  const ds = [{ type: 'scatter', label: 'Einzelne Ladung', data: use.map(x => ({ x: x.t, y: +x.k.toFixed(2) })), backgroundColor: '#94a3b8', pointRadius: 3.5 }];
  if (drop.length) ds.push({ type: 'scatter', label: 'Ausreißer', data: drop.map(x => ({ x: x.t, y: +x.k.toFixed(2) })), backgroundColor: '#ef4444', pointRadius: 3.5 });
  if (roll.length >= 2) ds.push({ type: 'line', label: 'Gleitend (3 Monate)', data: roll, borderColor: '#10b981', backgroundColor: '#10b981', pointRadius: 0, tension: .25, borderWidth: 2.5 });
  if (ok) ds.push({ type: 'line', label: 'Gesamt ± 95 %', data: [{ x: t0, y: fit.K + fit.ci }, { x: t1, y: fit.K + fit.ci }], borderColor: '#0ea5e9', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.2 }, { type: 'line', label: 'untere Grenze', data: [{ x: t0, y: fit.K - fit.ci }, { x: t1, y: fit.K - fit.ci }], borderColor: '#0ea5e9', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.2 });
  batChart = new Chart($('bat-chart'), {
    data: { datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: text, filter: (i) => i.text !== 'untere Grenze' } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.parsed.y, 1) + ' kWh · ' + new Date(c.parsed.x).toLocaleDateString('de-DE') } } },
      scales: { x: { type: 'linear', min: t0, max: t1, ticks: { color: text, maxTicksLimit: 5, callback: (v) => new Date(v).toLocaleDateString('de-DE', yrs ? { month: 'short', year: '2-digit' } : { day: '2-digit', month: 'short' }) }, grid: { display: false } },
        y: { title: { display: true, text: 'kWh je 100 % Akku', color: text }, ticks: { color: text }, grid: { color: grid } } } }
  });
  $('bat-chart-note').textContent = 'Jeder Punkt ist eine Ladung (Steckdosen-kWh ÷ Akku-Hub). Einzelwerte streuen durch die %-Rundung, Temperatur und Ladeleistung – deshalb zählt nur der gewichtete Gesamt- und Trendwert.';
}

/* =====================================================================
   Statistik (Berichte → Tab „Statistik“, Einstieg auch über „Statistik ›“ auf der Start-Seite)
   km: aus den erfassten km-Ständen (Stand vor dem Zeitraum bis letzter Stand darin). Verbrauch: wie auf Start inkl. Ladeverluste, Extremwerte je Ladung ohne grob geschätzte
   (Akku-Entnahme unter 3 kWh). Kosten pro km, Tag und Monat beziehen sich auf die Ladekosten (Strom); Einnahmen und sonstige Kosten stehen im Kosten-Tab.
   Ø pro Tag/Monat: Laufleistung vom ersten bis zum letzten km-Stand, Ladekosten vom ersten Eintrag bis heute.
   ===================================================================== */
/* =====================================================================
   Abzeichen (eigene Seite über Start → „Abzeichen“ und das Schnellmenü; 36 Stück): werden aus den vorhandenen Daten berechnet. Freigeschaltet-Datum lokal in enyaq.badges = { <id>: ISO }.
   Erster Lauf (noch nichts gespeichert): alle bereits verdienten still eintragen. Danach: neues Abzeichen → Pop-up mit Konfetti (eins nach dem anderen).
   ===================================================================== */
const KEY_BADGES = 'enyaq.badges';
const ICE = { l100: 7.5, co2PerL: 2.37, eurPerL: 2.0, homeCo2: 0, gridCo2: 0.363 };   // Vergleichs-Benziner; Strom kg CO₂/kWh: Zuhause Ökostrom (0), Bosch/unterwegs Strommix 2024
function bdgCtx() {
  const rs = getReadings(), charges = rs.filter((r, i) => isCharge(rs, i)), kwh = charges.reduce((a, r) => a + (r.consumedSinceLast > 0 ? r.consumedSinceLast : 0), 0);
  const pk = Number(getSettings().purchaseKm), od = rs.filter(r => r.odometerKm > 0), last = lastKnownKm(), base = pk > 0 ? pk : od.length ? od[0].odometerKm : null;
  const km = last != null && base != null ? Math.max(0, last - base) : 0;
  /* Monatswerte (mind. 300 km): bester Verbrauch und beste Kosten je 100 km */
  const byM = {}; rs.forEach((r, i) => { const k = String(r.date).slice(0, 7); (byM[k] = byM[k] || []).push(i); });
  let best100 = null, bestC100 = null;
  Object.values(byM).forEach(idx => { try { const t = consumptionTotals(rs, idx); if (t && t.km >= 300) { if (t.kwh100 != null) best100 = Math.min(best100 ?? 99, t.kwh100); if (t.cost100 != null) bestC100 = Math.min(bestC100 ?? 99, t.cost100); } } catch (e) { } });
  /* Winter: Ladungen im Dezember, Januar und Februar derselben Saison */
  const seasons = {}; charges.forEach(r => { const d = new Date(r.date), m = d.getMonth(); if (m === 11 || m <= 1) { const k = m === 11 ? d.getFullYear() : d.getFullYear() - 1; (seasons[k] = seasons[k] || new Set()).add(m); } });
  const winter = Object.values(seasons).some(x => x.size === 3), winterPart = Math.max(0, ...Object.values(seasons).map(x => x.size)) / 3;
  const provs = new Set(rs.filter(r => placeOf(r) === 'away' && r.provider).map(r => r.provider.toLowerCase())); if (rs.some(r => placeOf(r) === 'bosch')) provs.add('bosch');
  const [py, pm, pd] = purchaseDay().split('-').map(Number), years = (Date.now() - new Date(py, pm - 1, pd).getTime()) / (365.25 * 864e5);
  let care = null; try { care = batCare().score ?? null; } catch (e) { }
  let work = 0; try { const ys = taxYears(); work = Math.max(0, ...ys.map(y => taxData(y).days.length)); } catch (e) { }
  /* Vergleich mit einem Benziner (Hyundai Tucson 1.6 T-GDi, real 7,5 l/100 km): 2,37 kg CO₂ je Liter → 178 g/km; Super 2,00 €/l.
     Strom: Zuhause Ökostrom = 0 g/kWh, Bosch und unterwegs deutscher Strommix 2024 (UBA) 363 g/kWh */
  const cost = charges.reduce((a, r) => a + (r.cost > 0 ? r.cost : 0), 0);
  const evCo2 = charges.reduce((a, r) => a + (r.consumedSinceLast > 0 ? r.consumedSinceLast : 0) * (isHome(r) ? ICE.homeCo2 : ICE.gridCo2), 0);
  const co2 = Math.max(0, km * ICE.l100 / 100 * ICE.co2PerL - evCo2), saved = km * ICE.l100 / 100 * ICE.eurPerL - cost;
  /* Sommer: Ladungen im Juni, Juli und August desselben Jahres */
  const summ = {}; charges.forEach(r => { const d = new Date(r.date), m = d.getMonth(); if (m >= 5 && m <= 7) (summ[d.getFullYear()] = summ[d.getFullYear()] || new Set()).add(m); });
  const summer = Object.values(summ).some(x => x.size === 3), summerPart = Math.max(0, ...Object.values(summ).map(x => x.size)) / 3;
  /* Anteil Zuhause (kWh) im besten Kalenderjahr mit mind. 1.000 kWh */
  const yk = {}; charges.forEach(r => { const y = new Date(r.date).getFullYear(), o = yk[y] = yk[y] || { h: 0, t: 0 }, e = r.consumedSinceLast > 0 ? r.consumedSinceLast : 0; o.t += e; if (isHome(r)) o.h += e; });
  const homeShare = Math.max(0, ...Object.values(yk).filter(o => o.t >= 1000).map(o => o.h / o.t));
  const away = charges.filter(r => placeOf(r) === 'away').length;
  let maint = 0; try { getReminders().forEach(r => { maint += remLog(r).length; }); } catch (e) { }
  const maxTrip = getTrips().reduce((a, t) => Math.max(a, t.km || 0), 0);
  return { n: charges.length, kwh, km, best100, bestC100, winter, winterPart, provs: provs.size, years, care, work, co2, saved, summer, summerPart, homeShare, away, maint, maxTrip };
}
const BADGES = [
  { id: 'c1', e: '🔌', t: 'Erste Ladung', g: 'from-emerald-400 to-teal-600', v: c => c.n / 1, txt: 'Die erste Ladung ist erfasst.' },
  { id: 'c10', e: '⚡', t: '10 Ladungen', g: 'from-amber-300 to-orange-500', v: c => c.n / 10, txt: '10 Ladungen erfasst.' },
  { id: 'c50', e: '⚡', t: '50 Ladungen', g: 'from-amber-400 to-orange-600', v: c => c.n / 50, txt: '50 Ladungen erfasst.' },
  { id: 'c100', e: '🔋', t: '100 Ladungen', g: 'from-orange-400 to-red-600', v: c => c.n / 100, txt: '100 Ladungen erfasst.' },
  { id: 'c250', e: '🏆', t: '250 Ladungen', g: 'from-yellow-300 to-amber-600', v: c => c.n / 250, txt: '250 Ladungen erfasst.' },
  { id: 'e1000', e: '🔆', t: '1 MWh geladen', g: 'from-lime-300 to-green-600', v: c => c.kwh / 1000, txt: '1.000 kWh geladen.' },
  { id: 'k1000', e: '🚗', t: '1.000 km', g: 'from-sky-300 to-sky-600', v: c => c.km / 1000, txt: '1.000 km elektrisch gefahren.' },
  { id: 'k5000', e: '🛣️', t: '5.000 km', g: 'from-sky-400 to-blue-600', v: c => c.km / 5000, txt: '5.000 km elektrisch gefahren.' },
  { id: 'k10000', e: '🛣️', t: '10.000 km', g: 'from-emerald-400 to-teal-600', v: c => c.km / 10000, txt: '10.000 km elektrisch gefahren.', next: 'Nächstes Ziel: 25.000 km' },
  { id: 'k25000', e: '🗺️', t: '25.000 km', g: 'from-teal-400 to-cyan-700', v: c => c.km / 25000, txt: '25.000 km elektrisch gefahren.', next: 'Nächstes Ziel: einmal um die Erde' },
  { id: 'earth', e: '🌍', t: 'Erdumrundung', g: 'from-blue-400 to-indigo-700', v: c => c.km / 40075, txt: '40.075 km – einmal um den Äquator.' },
  { id: 'winter', e: '❄️', t: 'Winterheld', g: 'from-sky-400 to-indigo-600', v: c => c.winter ? 1 : c.winterPart, txt: 'Einen ganzen Winter (Dez–Feb) elektrisch gefahren.' },
  { id: 'eco', e: '🦊', t: '< 15 kWh/100km', g: 'from-fuchsia-400 to-purple-600', v: c => c.best100 == null ? 0 : c.best100 < 15 ? 1 : Math.max(0, Math.min(0.95, 15 / c.best100)), txt: 'Ein Monat unter 15 kWh/100 km (inkl. Ladeverluste).' },
  { id: 'cheap', e: '💶', t: '< 5€/100km', g: 'from-green-300 to-emerald-700', v: c => c.bestC100 == null ? 0 : c.bestC100 < 5 ? 1 : Math.max(0, Math.min(0.95, 5 / c.bestC100)), txt: 'Ein Monat mit Ladekosten unter 5 € je 100 km.' },
  { id: 'care', e: '🛡️', t: 'Akku-Profi 90+', g: 'from-emerald-300 to-green-700', v: c => c.care == null ? 0 : c.care >= 90 ? 1 : c.care / 90, txt: 'Akku-Pflege-Wert von 90 oder mehr.' },
  { id: 'prov', e: '🧭', t: '3 Ladeanbieter', g: 'from-violet-400 to-indigo-600', v: c => c.provs / 3, txt: 'Bei drei verschiedenen Anbietern geladen.' },
  { id: 'work', e: '💼', t: '100 Arbeitstage', g: 'from-slate-300 to-slate-600', v: c => c.work / 100, txt: '100 Arbeitstage in einem Jahr mit dem Enyaq.' },
  { id: 'y1', e: '🎂', t: '1 Jahr', g: 'from-rose-400 to-red-600', v: c => c.years / 1, txt: 'Ein Jahr gemeinsam unterwegs.' },
  /* ---- Langfristige Ziele ---- */
  { id: 'c500', e: '🎖️', t: '500 Ladungen', g: 'from-amber-300 to-yellow-600', v: c => c.n / 500, txt: '500 Ladungen erfasst.' },
  { id: 'e5000', e: '💡', t: '5 MWh geladen', g: 'from-lime-400 to-emerald-700', v: c => c.kwh / 5000, txt: '5.000 kWh geladen.' },
  { id: 'e10000', e: '🌩️', t: '10 MWh geladen', g: 'from-yellow-300 to-lime-700', v: c => c.kwh / 10000, txt: '10.000 kWh geladen.' },
  { id: 'k50000', e: '🏁', t: '50.000 km', g: 'from-cyan-400 to-blue-700', v: c => c.km / 50000, txt: '50.000 km elektrisch gefahren.', next: 'Nächstes Ziel: 2× Erdumrundung' },
  { id: 'earth2', e: '🛰️', t: '2× Erdumrundung', g: 'from-indigo-400 to-violet-700', v: c => c.km / 80150, txt: '80.150 km – zweimal um den Äquator.' },
  { id: 'k100000', e: '💯', t: '100.000 km', g: 'from-blue-500 to-indigo-800', v: c => c.km / 100000, txt: '100.000 km elektrisch gefahren.' },
  { id: 'y3', e: '🎉', t: '3 Jahre', g: 'from-pink-400 to-rose-600', v: c => c.years / 3, txt: 'Drei Jahre gemeinsam unterwegs.' },
  { id: 'y5', e: '🏅', t: '5 Jahre', g: 'from-amber-400 to-rose-600', v: c => c.years / 5, txt: 'Fünf Jahre gemeinsam unterwegs.' },
  { id: 'co1', e: '🌳', t: '1 t CO₂ gespart', g: 'from-green-400 to-emerald-700', v: c => c.co2 / 1000, txt: '1 Tonne CO₂ weniger als mit einem Benziner (Tucson 1.6, 7,5 l/100 km; Zuhause Ökostrom, sonst Strommix 363 g/kWh).' },
  { id: 'co5', e: '🌲', t: '5 t CO₂ gespart', g: 'from-emerald-500 to-green-800', v: c => c.co2 / 5000, txt: '5 Tonnen CO₂ weniger als mit einem Benziner.' },
  { id: 'co10', e: '🏔️', t: '10 t CO₂ gespart', g: 'from-teal-500 to-slate-700', v: c => c.co2 / 10000, txt: '10 Tonnen CO₂ weniger als mit einem Benziner.' },
  { id: 'eur1', e: '💰', t: '1.000 € gespart', g: 'from-yellow-300 to-amber-600', v: c => c.saved / 1000, txt: '1.000 € weniger als Tanken (Tucson 1.6, 7,5 l/100 km, 2,00 €/l) – Ladekosten abgezogen.' },
  { id: 'eur5', e: '🤑', t: '5.000 € gespart', g: 'from-amber-400 to-orange-700', v: c => c.saved / 5000, txt: '5.000 € weniger als Tanken – Ladekosten abgezogen.' },
  { id: 'summer', e: '🏖️', t: 'Sommerheld', g: 'from-yellow-300 to-orange-500', v: c => c.summer ? 1 : c.summerPart, txt: 'Einen ganzen Sommer (Jun–Aug) elektrisch gefahren.' },
  { id: 'home90', e: '🏠', t: '90 % Zuhause', g: 'from-yellow-300 to-yellow-600', v: c => c.homeShare >= 0.9 ? 1 : c.homeShare / 0.9, txt: 'Ein Kalenderjahr mit mindestens 90 % der kWh an der eigenen Wallbox (ab 1.000 kWh im Jahr).' },
  { id: 'away25', e: '🚀', t: '25× unterwegs', g: 'from-violet-400 to-fuchsia-700', v: c => c.away / 25, txt: '25 Ladungen unterwegs.' },
  { id: 'maint10', e: '🔧', t: '10× Wartung', g: 'from-slate-400 to-zinc-700', v: c => c.maint / 10, txt: '10 erledigte Erinnerungen (Wartung, Service, Reifen …).' },
  { id: 'trip300', e: '🧳', t: '≥ 300 km Fahrt', g: 'from-sky-400 to-cyan-700', v: c => c.maxTrip / 300, txt: 'Eine einzelne Fahrt mit mindestens 300 km im Fahrtenbuch.' }
];
let bdgQueue = [], bdgSel = null;
function bdgState() { const c = bdgCtx(); return BADGES.map(b => { const v = Math.max(0, Math.min(1, b.v(c) || 0)); return { b, v, done: v >= 1 }; }); }
function checkBadges(silent) {
  let st; try { st = bdgState(); } catch (e) { console.error(e); return; }
  const got = load(KEY_BADGES, null), first = !got || typeof got !== 'object', out = first ? {} : { ...got }, now = new Date().toISOString(), fresh = [];
  st.forEach(x => { if (x.done && !out[x.b.id]) { out[x.b.id] = now; if (!first && !silent) fresh.push(x.b); } });
  if (first || fresh.length || Object.keys(out).length !== Object.keys(got || {}).length) save(KEY_BADGES, out);
  bdgQueue.push(...fresh); showNextBadge(); renderBadgesCount(st);
}
function renderBadgesCount(st = bdgState()) { const n = st.filter(x => x.done).length; $('go-badges-n').textContent = ' · ' + n + ' von ' + BADGES.length; }
function showNextBadge() {
  if (!bdgQueue.length || !$('bdg-ov').classList.contains('hidden') || !$('bd-ov').classList.contains('hidden') || !$('wr-ov').classList.contains('hidden')) return;
  const b = bdgQueue.shift();
  $('bdg-ov-icon').className = 'mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-[32px] text-6xl shadow-lg bg-gradient-to-br ' + b.g; $('bdg-ov-icon').textContent = b.e;
  $('bdg-ov-h').textContent = b.t; $('bdg-ov-t').textContent = b.txt; $('bdg-ov-more').textContent = b.next || (bdgQueue.length ? 'Noch ' + bdgQueue.length + ' weitere' + (bdgQueue.length === 1 ? 's' : '') + ' …' : '');
  const box = $('bdg-conf'), cols = ['#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa', '#fb7185']; box.textContent = '';
  for (let i = 0; i < 40; i++) { const c = document.createElement('i'), r = Math.random; c.style.cssText = 'left:' + (r() * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + ';--d:' + (4.5 + r() * 4).toFixed(2) + 's;--w:' + (-r() * 8).toFixed(2) + 's;--x:' + ((r() - 0.5) * 120).toFixed(0) + 'px;--r:' + ((r() < 0.5 ? -1 : 1) * (360 + r() * 540)).toFixed(0) + 'deg;--y:' + (r() * 30).toFixed(0) + '%;' + (r() < 0.3 ? 'width:9px;height:9px;border-radius:50%;' : ''); box.appendChild(c); }
  $('bdg-ov').classList.remove('hidden'); document.body.style.overflow = 'hidden';
}
function hideBadgeOv() { $('bdg-ov').classList.add('hidden'); $('bdg-conf').textContent = ''; document.body.style.overflow = ''; setTimeout(showNextBadge, 350); }
$('bdg-ov-ok').addEventListener('click', hideBadgeOv);
$('bdg-ov').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.parentElement === e.currentTarget) hideBadgeOv(); });
function renderBadges() {
  const st = bdgState(), got = load(KEY_BADGES, {}) || {}, n = st.filter(x => x.done).length;
  $('bdg-count').textContent = n + ' von ' + BADGES.length;
  const order = st.slice().sort((a, b) => (b.done - a.done) || (a.done ? String(got[a.b.id] || '').localeCompare(String(got[b.b.id] || '')) : b.v - a.v));
  $('bdg-grid').innerHTML = order.map(x => x.done
    ? `<button type="button" data-bdg="${x.b.id}" class="rounded-2xl bg-gradient-to-br ${x.b.g} px-1.5 py-2.5 text-white shadow-sm active:scale-95 transition"><p class="text-2xl leading-8">${x.b.e}</p><p class="bdg-l mt-1 whitespace-nowrap text-[11px] font-semibold leading-tight tracking-tight [text-shadow:0_1px_2px_rgba(0,0,0,.35)]">${esc(x.b.t)}</p></button>`
    : `<button type="button" data-bdg="${x.b.id}" class="rounded-2xl bg-slate-100 dark:bg-slate-800 px-1.5 py-2.5 text-slate-500 dark:text-slate-400 active:scale-95 transition"><p class="text-2xl leading-8 grayscale opacity-40">${x.b.e}</p><p class="bdg-l mt-1 whitespace-nowrap text-[11px] font-semibold leading-tight tracking-tight">${esc(x.b.t)}</p><div class="mt-1.5 h-1 rounded-full bg-slate-300 dark:bg-slate-700"><div class="h-full rounded-full bg-slate-500 dark:bg-slate-400" style="width:${Math.round(x.v * 100)}%"></div></div></button>`).join('');
  if (bdgSel) bdgInfo(bdgSel);
  bdgFit();
}
/** Beschriftung der Abzeichen immer einzeilig: bei Bedarf schrittweise kleiner (bis 9 px). */
function bdgFit() { requestAnimationFrame(() => document.querySelectorAll('#bdg-grid .bdg-l').forEach(l => { let f = 11; l.style.fontSize = ''; while (l.scrollWidth > l.clientWidth + 0.5 && f > 9) { f -= 0.5; l.style.fontSize = f + 'px'; } })); }
window.addEventListener('resize', () => { if (!$('view-badges').classList.contains('hidden')) bdgFit(); });
function bdgInfo(id) {
  bdgSel = id; const x = bdgState().find(y => y.b.id === id), got = load(KEY_BADGES, {}) || {}; if (!x) return;
  $('bdg-info').innerHTML = '<b class="text-slate-900 dark:text-white">' + esc(x.b.t) + '</b> · ' + esc(x.b.txt) + ' ' + (x.done ? (got[id] ? 'Erreicht am ' + fmtDate(got[id]) + '.' : 'Erreicht.') : 'Noch ' + (100 - Math.round(x.v * 100)) + ' % bis zum Ziel.');
}
$('bdg-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-bdg]'); if (b) bdgInfo(b.dataset.bdg); });
$('go-badges').addEventListener('click', () => showView('badges'));
setTimeout(() => checkBadges(false), 2500);
function renderStat() {
  try { renderBadges(); } catch (e) { console.error(e); }
  const rs = getReadings(), now = new Date(), cy = now.getFullYear(), cm = now.getMonth(), D = 864e5, MON = 30.4375;
  const kmT = (v) => v != null ? fmt(v, 0) + ' km' : '–', pts = odoPts();
  const km = odoNow(), t = (y, m) => new Date(y, m, 1).getTime();   // neuester Stand aus allen Quellen
  $('st-odo').textContent = km != null ? fmt(km, 0) + ' km' : '–';
  $('st-km-year').textContent = kmT(heroKm(new Date(cy, 0, 1)));   // wie oben auf Start (mit km-Stand bei Kauf)
  $('st-km-month').textContent = kmT(rangeKm(t(cy, cm), t(cy, cm + 1)));
  $('st-km-lastyear').textContent = kmT(rangeKm(t(cy - 1, 0), t(cy, 0))); $('st-km-lastmonth').textContent = kmT(rangeKm(t(cy, cm - 1), t(cy, cm)));
  let perDay = null;
  if (pts.length > 1) { const days = (pts[pts.length - 1][0] - pts[0][0]) / D, dk = pts[pts.length - 1][1] - pts[0][1]; if (days >= 1 && dk > 0) perDay = dk / days; }
  $('st-km-day').textContent = kmT(perDay); $('st-km-mon').textContent = kmT(perDay != null ? perDay * MON : null);
  /* Verbrauch und Kosten pro km */
  const idx = rs.map((_, i) => i), tot = consumptionTotals(rs, idx), per = idx.map(i => entryStats(rs, i)).filter(x => x.kwh100 != null && !x.rough);
  const kw = per.map(x => x.kwh100), cp = per.filter(x => x.cost100 != null).map(x => x.cost100 / 100), mm = (a, f) => a.length ? f(...a) : null;
  $('st-kwh').textContent = tot.km ? fmt(tot.kwh100, 1) + ' kWh/100 km' : '–';
  $('st-kwh-min').textContent = kw.length ? fmt(mm(kw, Math.min), 1) + ' kWh/100 km' : '–'; $('st-kwh-max').textContent = kw.length ? fmt(mm(kw, Math.max), 1) + ' kWh/100 km' : '–';
  $('st-cpk').textContent = tot.cost100 != null ? fmt(tot.cost100 / 100, 3) + ' €/km' : '–';
  $('st-cpk-min').textContent = cp.length ? fmt(mm(cp, Math.min), 3) + ' €/km' : '–'; $('st-cpk-max').textContent = cp.length ? fmt(mm(cp, Math.max), 3) + ' €/km' : '–';
  /* Ladungen und Strompreise */
  const costs = rs.filter(r => r.cost > 0).map(r => r.cost), prices = rs.map(unitOf).filter(u => u != null && u > 0);
  $('st-chg-min').textContent = costs.length ? eur(mm(costs, Math.min)) : '–'; $('st-chg-max').textContent = costs.length ? eur(mm(costs, Math.max)) : '–';
  $('st-price-min').textContent = prices.length ? fmt(mm(prices, Math.min), 3) + ' €/kWh' : '–'; $('st-price-max').textContent = prices.length ? fmt(mm(prices, Math.max), 3) + ' €/kWh' : '–';
  /* Ladekosten pro Tag und Monat: erster Eintrag bis heute */
  const dts = rs.map(r => Date.parse(r.date)).filter(Number.isFinite), sum = costs.reduce((a, x) => a + x, 0), days = dts.length ? Math.max(1, (now.getTime() - Math.min(...dts)) / D) : 0;
  $('st-cpd').textContent = sum > 0 && days ? eur(sum / days) : '–'; $('st-cpm').textContent = sum > 0 && days ? eur(sum / (days / MON)) : '–';
  try { renderTempChart(); } catch (e) { /* Wetter-Modul noch nicht initialisiert */ }
  try { renderWrapList(); } catch (e) { /* Rückblick-Modul noch nicht initialisiert */ }
  try { renderHeat(); } catch (e) { /* Heatmap-Modul noch nicht initialisiert */ }
  /* TCO (Laden + Kosten − Einnahmen, wie „Kosten“ auf Start): laufendes Jahr, Ø pro Monat im laufenden Jahr, seit Kaufmonat. Der Monatsschnitt rechnet ab Jahresbeginn bzw. Kaufmonat/erstem Eintrag (was später liegt), mindestens 1 Monat. */
  const tcoSum = (from) => { let sum = 0; for (let y = from.getFullYear(), m = from.getMonth(); y < cy || (y === cy && m <= cm); m++) { if (m > 11) { m = 0; y++; if (y > cy) break; } sum += costTotals(y, m).total; } return sum; };
  const allD = dts.concat(getCosts().map(c => Date.parse(c.date))).filter(Number.isFinite), [pY, pM] = purchaseMonth().split('-').map(Number);
  const yFrom = new Date(cy, 0, 1), pFrom = new Date(pY, pM - 1, 1), inYear = allD.filter(x => x >= yFrom.getTime()), inSince = allD.filter(x => x >= pFrom.getTime());
  $('st-tco-title').textContent = 'Total Cost of Ownership (TCO) ' + cy; $('st-tco-mon-l').textContent = 'Ø pro Monat ' + cy; $('st-tco-since-l').textContent = 'Seit Kauf (' + purchaseLabel() + ')';
  const yTot = inYear.length ? tcoSum(yFrom) : null, avgFrom = inYear.length ? Math.min(Math.max(yFrom.getTime(), pFrom.getTime()), ...inYear) : 0;
  $('st-tco-year').textContent = yTot != null ? eur(yTot) : '–';
  $('st-tco-mon').textContent = yTot != null ? eur(yTot / Math.max(1, (now.getTime() - avgFrom) / D / MON)) : '–';
  $('st-tco-since').textContent = inSince.length ? eur(tcoSum(pFrom)) : '–';
  document.querySelectorAll('#rep-stat .st-v').forEach(el => {                                    // Einheit hinter der Zahl klein setzen
    const txt = el.textContent, i = txt.search(/[ \u00a0\u202f]/); if (i < 1 || el.querySelector('span')) return;
    el.textContent = txt.slice(0, i); const u = document.createElement('span'); u.className = 'st-u'; u.textContent = txt.slice(i + 1); el.appendChild(u);
  });
  $('st-note').textContent = 'Verbrauch inkl. Ladeverlusten (' + tot.n + ' Ladungen mit km-Stand' + (tot.approx ? ', grob ohne Akku-%' : '') + '). Kosten pro km, Tag und Monat sind reine Ladekosten – Einnahmen und sonstige Kosten findest du im Kosten-Tab.';
}
$('go-stat').addEventListener('click', () => { repMode = 'stat'; setDpTab('stat', false); showView('report'); });
$('go-akku').addEventListener('click', () => { repMode = 'akku'; showView('report'); });
/** Start-Button „Akku“: Netto-Kapazität (wie im Akku-Bericht) und Akku-Pflege der letzten 90 Tage, z. B. „Akku · 48,3 kWh (netto) · 73/100“. */
function renderAkkuBtn() {
  const parts = [];
  try { const fit = batFit(batRows()); if (fit && fit.n >= BAT.minN && fit.sumHub >= BAT.minHub) parts.push(fmt(fit.K * BAT.eta, 1) + ' kWh (netto)'); } catch (e) { }
  try { const c = batCare(); if (c.score != null) parts.push(c.score + '/100'); } catch (e) { }
  $('go-akku-n').textContent = parts.length ? ' · ' + parts.join(' · ') : ' · Kapazität & Pflege';
  /* Rückblick: laufender Zeitraum (wie die Vorschau), z. B. „08.06.2026 – heute“ */
  try { const { runStart } = wrPeriods(); $('go-wrap-n').textContent = ' · ' + fmtDate(new Date(runStart).toISOString()) + ' – heute'; } catch (e) { $('go-wrap-n').textContent = ''; }
  /* Ladeanbieter: Karten mit mindestens einer Ladung / alle Karten der Übersicht (Zuhause, Bosch, Anbieter-Liste) */
  try {
    const bn = pvBoschName(), keys = ['home', 'bosch'].concat(getProviders().filter(n => !pvSame(n, bn)));
    $('go-prov-n').textContent = ' · ' + keys.filter(k => pvStats(k).n > 0).length + ' von ' + keys.length;
  } catch (e) { $('go-prov-n').textContent = ''; }
  /* Fahrtenbuch: Datum des letzten Imports, sonst Datum der letzten Fahrt */
  try {
    const imp = load(KEY_TRIPS_IMP, null), tr = getTrips(), last = tr.reduce((a, t) => (t.s > a ? t.s : a), '');
    $('go-trips-n').textContent = imp && imp.at ? ' · Import ' + fmtDate(imp.at) : last ? ' · Fahrten bis ' + fmtDate(last) : ' · noch kein Import';
  } catch (e) { $('go-trips-n').textContent = ''; }
}          // Berichte → Akku
$('go-trips').addEventListener('click', () => { histFilter = 'fahrten'; tripDays = 21; showView('history'); });   // Historie → Fahrten

/* =====================================================================
   Ladeanbieter (Start → „Ladeanbieter“): Liste aller Anbieter aus den Einstellungen plus Stromanbieter Zuhause.
   Preise: aus der Historie (Ø €/kWh der Unterwegs-Ladungen mit diesem Anbieter, nach kWh gewichtet); eigene Angaben (AC, DC, Grundgebühr, Tarif)
   haben Vorrang und werden in enyaq.provInfo gespeichert (+ Cloud-Dokument settings/prefs). Zuhause: Preis immer aus den Einstellungen.
   provInfo = { home: { name }, bosch: { name?, tariff?, ac?, dc?, fee? }, p: { <Anbietername>: { tariff?, ac?, dc?, fee? } } }
   Bosch: alle Ladungen am Ort „Bosch“ gehören zum dort hinterlegten Anbieter (z. B. Lichtblick); gibt es denselben Namen auch in der Anbieter-Liste,
   zählen dessen Unterwegs-Ladungen mit und die Zeile erscheint nur einmal (als Bosch-Karte).
   ===================================================================== */
const KEY_PROVINFO = 'enyaq.provInfo';
const PV_COLORS = ['#2563eb', '#0e7490', '#7c3aed', '#db2777', '#ea580c', '#059669', '#4f46e5', '#b45309', '#0891b2', '#be123c', '#65a30d', '#475569'];
const getProvInfo = () => { const o = load(KEY_PROVINFO, {}); return { home: (o && o.home) || {}, bosch: (o && o.bosch) || {}, p: (o && o.p && typeof o.p === 'object') ? o.p : {} }; };
const pvBoschName = () => (getProvInfo().bosch.name || '').trim();
const pvSame = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
function setProvInfo(o) { save(KEY_PROVINFO, o); pushPrefs(); }
const pvHomeName = () => (getProvInfo().home.name || '').trim();
const pvEur = (v) => fmt(v, v < 1 && Math.round(v * 1000) % 10 ? 3 : 2) + ' €';
/** Kennzahlen aus der Historie: Zuhause (key 'home') oder ein Anbieter (Unterwegs). Gesamt und laufendes Jahr. */
function pvStats(key) {
  const rs = getReadings(), y0 = new Date(new Date().getFullYear(), 0, 1).getTime(), st = { n: 0, kwh: 0, cost: 0, yn: 0, ykwh: 0, ycost: 0, pk: 0, pc: 0, last: null };
  rs.forEach((r, i) => {
    const home = key === 'home', pl = placeOf(r);
    if (home ? !(isHome(r) && isCharge(rs, i)) : key === 'bosch' ? !(pl === 'bosch' || (pl === 'away' && pvSame(r.provider, pvBoschName()))) : !(pl === 'away' && r.provider === key)) return;
    const t = Date.parse(r.date), kwh = r.consumedSinceLast > 0 ? r.consumedSinceLast : 0, cost = r.cost > 0 ? r.cost : 0;
    st.n++; st.kwh += kwh; st.cost += cost;
    if (t >= y0) { st.yn++; st.ykwh += kwh; st.ycost += cost; }
    const unit = home ? (kwh > 0 ? cost / kwh : null) : (r.pricePerKwh > 0 ? r.pricePerKwh : (kwh > 0 && cost > 0 ? (cost - (r.fee || 0)) / kwh : null));
    if (unit > 0 && kwh > 0) { st.pk += kwh; st.pc += unit * kwh; }
    if (!st.last || t > st.last.t) st.last = { t, unit };
  });
  st.avg = st.pk > 0 ? Math.round(st.pc / st.pk * 100) / 100 : null;   // Ø €/kWh, auf Cent gerundet
  return st;
}
/** Preise eines Anbieters: eigene Angaben (ac/dc) vor Historie (hist). */
function pvPrices(name) { const I = getProvInfo(), i = (name === 'bosch' ? I.bosch : I.p[name]) || {}, st = pvStats(name); return { ac: i.ac > 0 ? i.ac : null, dc: i.dc > 0 ? i.dc : null, fee: i.fee > 0 ? i.fee : null, tariff: i.tariff || '', hist: st.avg, st }; }
const pvChip = (lbl, v, sub) => `<span class="whitespace-nowrap rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200">${lbl ? '<b>' + lbl + '</b> ' : ''}${pvEur(v)}${sub ? ' <span class="text-slate-500 dark:text-slate-400">' + sub + '</span>' : ''}</span>`;
const pvBadge = (name, color, dark) => `<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${dark ? 'text-slate-900' : 'text-white'}" style="background:${color}">${esc((name.trim()[0] || '?').toUpperCase())}</div>`;
function renderProvidersView() {
  const list = getProviders(), price = Number(getSettings().price) || 0, hn = pvHomeName();
  const rows = [`<li><button type="button" data-pv="home" class="flex w-full items-center gap-3 rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3.5 text-left active:scale-[0.99] transition">
      ${pvBadge(hn || 'Z', '#facc15', true)}
      <span class="min-w-0 flex-1"><span class="flex items-center gap-1.5"><span class="truncate font-semibold">${esc(hn || 'Stromanbieter')}</span><span class="shrink-0 rounded-md bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Zuhause</span></span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${hn ? 'Hausstrom · Wallbox' : 'Antippen, um den Namen einzutragen'}</span></span>
      <span class="flex flex-col items-end gap-1">${pvChip('AC', price)}</span></button></li>`];
  const bn = pvBoschName(), bp = pvPrices('bosch'), bchips = [];
  if (bp.ac) bchips.push(pvChip('AC', bp.ac)); if (bp.dc) bchips.push(pvChip('DC', bp.dc));
  if (!bchips.length && bp.hist) bchips.push(pvChip('', bp.hist, 'Ø'));
  if (!bchips.length) bchips.push('<span class="whitespace-nowrap rounded-lg bg-amber-100 dark:bg-amber-900/40 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">Preis eintragen</span>');
  rows.push(`<li><button type="button" data-pv="bosch" class="flex w-full items-center gap-3 rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3.5 text-left active:scale-[0.99] transition">
      ${pvBadge(bn || 'B', '#0284c7')}
      <span class="min-w-0 flex-1"><span class="flex items-center gap-1.5"><span class="truncate font-semibold">${esc(bn || 'Ladeanbieter')}</span><span class="shrink-0 rounded-md bg-sky-100 dark:bg-sky-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Bosch</span></span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(bn ? [bp.tariff, bp.fee ? pvEur(bp.fee) + '/Monat' : '', bp.st.n ? bp.st.n + (bp.st.n === 1 ? ' Ladung' : ' Ladungen') : 'noch keine Ladung'].filter(Boolean).join(' · ') : 'Antippen, um den Anbieter einzutragen')}</span></span>
      <span class="flex flex-col items-end gap-1">${bchips.join('')}</span></button></li>`);
  /* Reihenfolge: nach Preis (günstigster zuerst; eigener AC/DC-Preis, sonst Ø aus der Historie), Anbieter ohne Preis danach alphabetisch.
     Die Farbe bleibt an der Position in der Anbieter-Liste (ändert sich also nicht durch das Sortieren). */
  const sortKey = (n) => { const p = pvPrices(n), v = [p.ac, p.dc].filter(x => x > 0); return v.length ? Math.min(...v) : p.hist > 0 ? p.hist : null; };
  list.map((n, i) => ({ n, i, k: sortKey(n) })).sort((a, b) => a.k != null && b.k != null ? a.k - b.k || a.n.localeCompare(b.n, 'de') : a.k != null ? -1 : b.k != null ? 1 : a.n.localeCompare(b.n, 'de', { sensitivity: 'base' }))
    .forEach(({ n, i }) => {
    if (pvSame(n, bn)) return;                                            // gleicher Anbieter wie bei Bosch: nur als Bosch-Karte
    const p = pvPrices(n), chips = [];
    if (p.ac) chips.push(pvChip('AC', p.ac)); if (p.dc) chips.push(pvChip('DC', p.dc));
    if (!chips.length && p.hist) chips.push(pvChip('', p.hist, 'Ø'));
    if (!chips.length) chips.push('<span class="whitespace-nowrap rounded-lg bg-amber-100 dark:bg-amber-900/40 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">Preis eintragen</span>');
    const sub = [p.tariff, p.fee ? pvEur(p.fee) + '/Monat' : '', p.st.n ? p.st.n + (p.st.n === 1 ? ' Ladung' : ' Ladungen') : 'noch keine Ladung'].filter(Boolean).join(' · ');
    rows.push(`<li><button type="button" data-pv="${esc(n)}" class="flex w-full items-center gap-3 rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3.5 text-left active:scale-[0.99] transition">
      ${pvBadge(n, PV_COLORS[i % PV_COLORS.length])}
      <span class="min-w-0 flex-1"><span class="block truncate font-semibold">${esc(n)}</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(sub)}</span></span>
      <span class="flex flex-col items-end gap-1">${chips.join('')}</span></button></li>`);
  });
  if (!list.filter(n => !pvSame(n, bn)).length) rows.push('<li class="px-1 py-2 text-sm text-slate-500 dark:text-slate-400">Noch keine Ladeanbieter für unterwegs. Lege sie mit „+ Neu“ an.</li>');
  $('pv-list').innerHTML = rows.join('');
  /* Günstigste Karte unterwegs: AC und DC; ohne eigene Angaben zählt der Ø-Preis aus der Historie für beide */
  const best = (k) => { let b = null; list.filter(n => !pvSame(n, bn)).forEach(n => { const p = pvPrices(n), v = p[k] ?? (p.ac == null && p.dc == null ? p.hist : null); if (v > 0 && (!b || v < b.v)) b = { n, v, h: p[k] == null }; }); return b; };
  const bA = best('ac'), bD = best('dc'), tile = (lbl, b) => `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2.5"><p class="text-xs text-slate-500 dark:text-slate-400">${lbl}</p><p class="truncate font-semibold">${b ? esc(b.n) : '–'}</p>${b ? '<p class="text-sm tabular-nums">' + pvEur(b.v) + '/kWh</p>' : ''}${b && b.h ? '<p class="text-[11px] text-slate-500 dark:text-slate-400">Ø aus Historie</p>' : ''}</div>`;
  $('pv-best').classList.toggle('hidden', !bA && !bD);
  $('pv-best-grid').innerHTML = tile('AC unterwegs', bA) + tile('DC unterwegs', bD);
}
/* ---- Detailkarte ---- */
let pvCur = null;                                                         // 'home' | Anbietername | '' (neu)
const pvNum = (id) => { const v = $(id).value.trim(); if (!v) return null; const n = parseNum(v); return isFinite(n) && n >= 0 && n < 100 ? n : NaN; };
function pvCardHtml(name, color, dark, label, big, sub) {
  return `<div class="flex items-start justify-between gap-2"><span class="min-w-0 truncate text-lg font-bold">${esc(name)}</span>${dark ? '<svg class="h-6 w-6 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>' : '<svg class="h-6 w-6 shrink-0 opacity-80" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z"/></svg>'}</div>
    <div class="mt-auto"><p class="text-xs font-semibold uppercase tracking-wider ${dark ? 'text-slate-700' : 'text-white/75'}">${label}</p><p class="font-barlow text-[40px] font-bold leading-none">${big}</p>${sub ? `<p class="mt-1 text-xs ${dark ? 'text-slate-700' : 'text-white/75'}">${sub}</p>` : ''}</div>`;
}
function openProv(key) {
  pvCur = key; const home = key === 'home', bosch = key === 'bosch', isNew = key === '', card = $('pv-card'), info = getProvInfo();
  $('pv-msg').classList.add('hidden'); $('pv-edit').classList.toggle('hidden', home);
  $('pv-name-wrap').classList.toggle('hidden', !home && !isNew && !bosch);
  $('pv-name-l').textContent = home ? 'Stromanbieter Zuhause' : bosch ? 'Ladeanbieter bei Bosch' : 'Name des Ladeanbieters';
  $('pv-name').placeholder = home ? 'z. B. Vattenfall' : bosch ? 'z. B. Lichtblick' : 'z. B. EnBW mobility+';
  $('pv-name').value = home ? pvHomeName() : bosch ? pvBoschName() : '';
  const dl = (rows) => rows.filter(Boolean).map(([k, v, cls]) => `<div class="flex items-baseline justify-between gap-3 py-2"><dt class="text-slate-500 dark:text-slate-400">${k}</dt><dd class="text-right tabular-nums ${cls || ''}">${v}</dd></div>`).join('');
  const yr = new Date().getFullYear();
  if (home) {
    const price = Number(getSettings().price) || 0, st = pvStats('home');
    card.style.background = 'linear-gradient(135deg,#fde047,#eab308)'; card.className = card.className.replace(/text-\S+/g, '') + ' text-slate-900';
    card.innerHTML = pvCardHtml(pvHomeName() || 'Stromanbieter', '', true, 'Zuhause · AC', fmt(price, 3) + ' <span class="text-lg">€/kWh</span>', 'Strompreis aus den Einstellungen');
    $('pv-stats').innerHTML = dl([['Preis AC', pvEur(price) + '/kWh'], ['Genutzt ' + yr, st.yn + ' × · ' + fmt(st.ykwh, 0) + ' kWh'], ['Kosten ' + yr, eur(st.ycost), 'font-semibold text-emerald-600 dark:text-emerald-400'], ['Gesamt', st.n + ' × · ' + fmt(st.kwh, 0) + ' kWh · ' + eur(st.cost)]]);
  } else if (isNew) {
    card.style.background = 'linear-gradient(135deg,#334155,#0f172a)'; card.className = card.className.replace(/text-\S+/g, '') + ' text-white';
    card.innerHTML = pvCardHtml('Neue Ladekarte', '', false, 'Unterwegs', '– <span class="text-lg">€/kWh</span>', '');
    $('pv-stats').innerHTML = ''; ['pv-tariff', 'pv-ac', 'pv-dc', 'pv-fee'].forEach(id => { $(id).value = ''; });
    $('pv-hint').textContent = 'Preise sind optional. Ohne Angabe nimmt die App den Ø-Preis aus deinen Ladungen mit diesem Anbieter.';
  } else {
    const i = getProviders().indexOf(key), c = bosch ? '#0284c7' : PV_COLORS[(i < 0 ? 0 : i) % PV_COLORS.length], p = pvPrices(key), st = p.st, v = p.dc ?? p.ac ?? p.hist;
    card.style.background = 'linear-gradient(135deg,' + c + ',#0f172a)'; card.className = card.className.replace(/text-\S+/g, '') + ' text-white';
    const wo = bosch ? 'Bosch' : 'Unterwegs', lab = p.dc != null ? wo + ' · DC' : p.ac != null ? wo + ' · AC' : p.hist ? wo + ' · Ø aus Historie' : wo;
    card.innerHTML = pvCardHtml(bosch ? (pvBoschName() || 'Ladeanbieter Bosch') : key, c, false, lab, (v ? fmt(v, 2) : '–') + ' <span class="text-lg">€/kWh</span>', [p.tariff, p.fee ? pvEur(p.fee) + '/Monat' : ''].filter(Boolean).join(' · '));
    $('pv-stats').innerHTML = dl([p.ac != null ? ['Preis AC', pvEur(p.ac) + '/kWh'] : null, p.dc != null ? ['Preis DC', pvEur(p.dc) + '/kWh'] : null, ['Ø Preis aus Historie', p.hist ? pvEur(p.hist) + '/kWh' : 'noch keine Daten'],
      st.last ? ['Letzte Ladung', fmtDate(new Date(st.last.t).toISOString()) + (st.last.unit ? ' · ' + pvEur(st.last.unit) + '/kWh' : '')] : null,
      ['Genutzt ' + yr, st.yn + ' × · ' + fmt(st.ykwh, 0) + ' kWh'], ['Kosten ' + yr, eur(st.ycost), 'font-semibold text-emerald-600 dark:text-emerald-400'], st.n > st.yn ? ['Gesamt', st.n + ' × · ' + fmt(st.kwh, 0) + ' kWh · ' + eur(st.cost)] : null]);
    const inf = (bosch ? info.bosch : info.p[key]) || {}, f = (x) => x > 0 ? String(x).replace('.', ',') : '';
    $('pv-tariff').value = inf.tariff || ''; $('pv-ac').value = f(inf.ac); $('pv-dc').value = f(inf.dc); $('pv-fee').value = f(inf.fee);
    if (bosch) $('pv-hint').textContent = 'Alle Ladungen am Ort „Bosch“ zählen zu diesem Anbieter – auch die bisherigen. ' + (p.hist ? 'Leere Preisfelder: Ø-Preis aus deinen Ladungen (' + pvEur(p.hist) + '/kWh).' : '');
    else $('pv-hint').textContent = p.hist ? 'Leere Preisfelder: Die App nimmt den Ø-Preis aus deinen Ladungen (' + pvEur(p.hist) + '/kWh).' : 'Noch keine Ladung mit Preis bei diesem Anbieter – trage die Preise hier ein.';
  }
  $('pv-dialog').classList.remove('hidden');
}
function pvErr(t) { $('pv-msg').textContent = t; $('pv-msg').classList.remove('hidden'); }
$('pv-save').addEventListener('click', () => {
  const info = getProvInfo();
  if (pvCur === 'home') { const n = $('pv-name').value.trim().replace(/\s+/g, ' ').slice(0, 30); info.home = n ? { name: n } : {}; setProvInfo(info); }
  else {
    const ac = pvNum('pv-ac'), dc = pvNum('pv-dc'), fee = pvNum('pv-fee');
    if ([ac, dc, fee].some(Number.isNaN)) { pvErr('Bitte die Preise prüfen (z. B. 0,59).'); return; }
    let name = pvCur;
    if (pvCur === 'bosch') {
      const bnm = $('pv-name').value.trim().replace(/\s+/g, ' ').slice(0, 30), o = { ...(bnm ? { name: bnm } : {}) }, tariff = $('pv-tariff').value.trim().replace(/\s+/g, ' ').slice(0, 30);
      if (tariff) o.tariff = tariff; if (ac > 0) o.ac = ac; if (dc > 0) o.dc = dc; if (fee > 0) o.fee = fee;
      info.bosch = o; setProvInfo(info); $('pv-dialog').classList.add('hidden'); renderProvidersView(); return;
    }
    if (pvCur === '') {
      name = $('pv-name').value.trim().replace(/\s+/g, ' ').slice(0, 30); const l = getProviders();
      if (!name) { pvErr('Bitte einen Namen eingeben.'); return; }
      if (l.some(n => n.toLowerCase() === name.toLowerCase())) { pvErr('„' + name + '“ gibt es schon.'); return; }
      if (l.length >= 20) { pvErr('Maximal 20 Anbieter.'); return; }
      setProviders(l.concat(name));
    }
    const o = {}, tariff = $('pv-tariff').value.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (tariff) o.tariff = tariff; if (ac > 0) o.ac = ac; if (dc > 0) o.dc = dc; if (fee > 0) o.fee = fee;
    if (Object.keys(o).length) info.p[name] = o; else delete info.p[name];
    setProvInfo(info);
  }
  $('pv-dialog').classList.add('hidden'); renderProvidersView();
});
$('pv-cancel').addEventListener('click', () => $('pv-dialog').classList.add('hidden'));
$('pv-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
$('pv-list').addEventListener('click', (e) => { const b = e.target.closest('[data-pv]'); if (b) openProv(b.dataset.pv); });
$('pv-add').addEventListener('click', () => openProv(''));
$('go-prov').addEventListener('click', () => showView('providers'));
