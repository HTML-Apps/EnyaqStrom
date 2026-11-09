/* =====================================================================
   Rückblick als teilbares Bild (Poster 4:5, ohne Zählerstand und ohne Standort): Canvas → Teilen-Dialog des Geräts, sonst PNG-Download
   ===================================================================== */
async function wrShare(btn) {
  /* Teilbares Bild = letzte Seite des Rückblicks („Alles auf einen Blick“ + 6–8 Kacheln): gleiche Farben, Schriften und Werte, auf 1080 × 1350 px hochskaliert */
  if (!wrCur) return; const { p, st } = wrCur, W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  try { await document.fonts.load('700 100px "Barlow Condensed"'); } catch (e) { }
  const g = cv.getContext('2d'), DF = "'Barlow Condensed','Arial Narrow',system-ui,sans-serif", SF = 'system-ui,-apple-system,"Segoe UI",sans-serif';
  const BG = '#0f172a', AC = '#6ee7b7', MU = '#cbd5e1', INK = '#ffffff', TILE = 'rgba(255,255,255,.08)';
  const txt = (s, x, y, size, wt, col, font = SF, al = 'left') => { g.font = wt + ' ' + size + 'px ' + font; g.fillStyle = col; g.textAlign = al; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); return g.measureText(s).width; };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fill(); };
  const tiles = [['Gefahren', fmt(st.km || 0, 0), 'km'], ['Geladen', fmt(st.kwh, 0), 'kWh'], ['Ø Verbrauch inkl. Verluste', st.kwh100 != null ? fmt(st.kwh100, 1) : '–', 'kWh/100 km'],
    ['Ladekosten', fmt(st.laden, 2), '€'], ['Ladungen', fmt(st.n, 0), ''], ['Ø Strompreis', st.kwh > 0 ? fmt(st.laden / st.kwh * 100, 1) : '–', 'ct/kWh']];
  if (st.km > 0) { const cc = cmpCar(), lit = st.km * cc.l / 100; const co = fmtCo2(cmpCo2(st.km, st.kwh).sav).split(' '); tiles.push(['Energiekostenersparnis', fmt(lit * cc.eur - st.laden, 0), '€'], ['CO₂ vermieden', co[0], co[1]]); }
  const ROWS = Math.ceil(tiles.length / 2);
  const S = 2.74, M = 72, GAP = Math.round(12 * S), TW = (W - 2 * M - GAP) / 2, PAD = Math.round(14 * S), LS = Math.round(12 * S), VS = Math.round(36 * S), US = Math.round(13 * S);
  const TH = PAD + LS + 10 + Math.round(VS * 1.05) + PAD, HEAD = Math.round(44 * S), SUB = Math.round(16 * S);
  g.font = '700 ' + HEAD + 'px ' + DF; const lines = []; 'Alles auf einen Blick'.split(' ').forEach(wd => { const l = lines.length ? lines[lines.length - 1] + ' ' + wd : wd; if (lines.length && g.measureText(l).width <= W - 2 * M) lines[lines.length - 1] = l; else lines.push(wd); });   // wie auf der Seite umbrechen, falls zu breit
  const LH = Math.round(HEAD * 0.98), headH = LH * (lines.length - 1) + HEAD;
  const blockH = headH + 18 + SUB + Math.round(20 * S) + ROWS * TH + (ROWS - 1) * GAP, top = Math.round((H - blockH) / 2);
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  lines.forEach((l, k) => txt(l, M, top + HEAD * 0.82 + k * LH, HEAD, 700, INK, DF));
  txt(p.label, M, top + headH + 18 + SUB * 0.8, SUB, 400, MU);
  const y0 = top + headH + 18 + SUB + Math.round(20 * S);
  tiles.forEach(([l, v, u], i) => {
    const x = M + (i % 2) * (TW + GAP), y = y0 + Math.floor(i / 2) * (TH + GAP);
    g.fillStyle = TILE; rr(x, y, TW, TH, Math.round(20 * S));
    g.font = '400 ' + LS + 'px ' + SF; const ls = Math.min(LS, Math.floor(LS * (TW - 2 * PAD) / Math.max(1, g.measureText(l).width)));   // lange Bezeichnung passend verkleinern
    txt(l, x + PAD, y + PAD + LS * 0.85, ls, 400, MU);
    g.font = '500 ' + US + 'px ' + SF; const uw = u ? g.measureText(u).width + Math.round(4 * S) : 0;
    g.font = '700 ' + VS + 'px ' + DF; let vs = VS; const vw = g.measureText(v).width, max = TW - 2 * PAD - uw; if (vw > max) vs = Math.floor(VS * max / vw);
    const by = y + PAD + LS + 10 + VS * 0.9, w = txt(v, x + PAD, by, vs, 700, AC, DF);
    if (u) txt(u, x + PAD + w + Math.round(4 * S), by, US, 500, MU);
  });
  cv.toBlob(async (blob) => {
    const old = btn ? btn.textContent : '', say = (m) => { if (btn) { btn.textContent = m; setTimeout(() => { if (btn.isConnected) btn.textContent = old; }, 2200); } };
    if (!blob) { say('Bild konnte nicht erstellt werden'); return; }
    const name = 'enyaq-rueckblick-' + p.id + '.png', file = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: wrTitle() }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); say('Bild gespeichert');
  }, 'image/png');
}

/* =====================================================================
   Lade-Heatmap (Statistik): Kalender der Ladetage (je dunkler, desto mehr kWh) + Ladungen nach Wochentag. Gezeichnet auf Canvas (Farben bleiben auf jedem Gerät erhalten).
   ===================================================================== */
function renderHeat() {
  const rs = getReadings(), days = new Map(), wdN = [0, 0, 0, 0, 0, 0, 0]; let nCh = 0, first = null;
  rs.forEach((r, i) => { if (!isCharge(rs, i)) return; const t = Date.parse(r.date); if (!Number.isFinite(t)) return; const k = wxIso(new Date(t)), o = days.get(k) || { n: 0, kwh: 0 }; o.n++; o.kwh += r.consumedSinceLast || 0; days.set(k, o); wdN[(new Date(t).getDay() + 6) % 7]++; nCh++; if (first == null || t < first) first = t; });
  $('st-heat-card').classList.toggle('hidden', nCh < 3); if (nCh < 3) return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches, text = dark ? '#cbd5e1' : '#475569', empty = dark ? '#1e293b' : '#e2e8f0', ramp = dark ? ['#065f46', '#059669', '#10b981', '#6ee7b7'] : ['#bbf7d0', '#6ee7b7', '#10b981', '#047857'];
  const mon = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }, today = new Date(), thisMon = mon(today);
  const N = Math.min(53, Math.max(16, Math.round((thisMon - mon(new Date(first))) / (7 * 864e5)) + 1)), start = new Date(thisMon); start.setDate(start.getDate() - 7 * (N - 1));
  const vals = [...days.values()].map(o => o.kwh).filter(v => v > 0).sort((a, b) => a - b), q = (f) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] : 0, lvl = (o) => o.kwh <= 0 ? 0 : o.kwh >= q(.75) ? 3 : o.kwh >= q(.5) ? 2 : o.kwh >= q(.25) ? 1 : 0;
  const dpr = window.devicePixelRatio || 1, P = 16, L = 26, T = 18, W = L + N * P, H = T + 7 * P + 30, cv = $('st-heat'), g = cv.getContext('2d');
  cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const cell = (x, y, col) => { g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(x, y, 13, 13, 3) : g.rect(x, y, 13, 13); g.fill(); };
  g.font = '11px system-ui, sans-serif'; g.fillStyle = text; g.textAlign = 'left';
  ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach((l, i) => g.fillText(l, 0, T + i * P + 11));   // alle sieben Wochentage
  let lastM = -1;
  for (let c = 0; c < N; c++) {
    const d0 = new Date(start); d0.setDate(d0.getDate() + c * 7); if (d0.getMonth() !== lastM) { lastM = d0.getMonth(); g.fillStyle = text; g.fillText(['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][lastM], L + c * P, 12); }
    for (let r = 0; r < 7; r++) {
      const d = new Date(start); d.setDate(d.getDate() + c * 7 + r); if (d > today) continue;
      const o = days.get(wxIso(d)), x = L + c * P, y = T + r * P; cell(x, y, o ? ramp[lvl(o)] : empty);
      if (wxIso(d) === wxIso(today)) { g.strokeStyle = dark ? '#e2e8f0' : '#0f172a'; g.lineWidth = 1.5; g.strokeRect(x + .75, y + .75, 11.5, 11.5); }
    }
  }
  const ly = T + 7 * P + 8; g.fillStyle = text; g.fillText('weniger', L, ly + 11); let lx = L + 48; cell(lx, ly, empty); ramp.forEach((col, i) => cell(lx + (i + 1) * P, ly, col)); g.fillStyle = text; g.fillText('mehr', lx + 5 * P + 4, ly + 11);
  $('st-heat-scroll').scrollLeft = 1e6;
  /* Wochentage */
  const wc = $('st-heat-wd'), cw = Math.max(200, wc.parentElement.clientWidth || 300), RH = 26, WH = 7 * RH + 4, wg = wc.getContext('2d'), mx = Math.max(...wdN), names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  wc.style.height = WH + 'px'; wc.width = Math.round(cw * dpr); wc.height = Math.round(WH * dpr); wg.setTransform(dpr, 0, 0, dpr, 0, 0); wg.clearRect(0, 0, cw, WH); wg.font = '13px system-ui, sans-serif'; wg.textBaseline = 'middle';
  wdN.forEach((n, i) => { const y = i * RH + RH / 2 + 2, bw = Math.max(n ? 4 : 0, n / mx * (cw - 34 - 46)); wg.fillStyle = text; wg.textAlign = 'left'; wg.fillText(names[i], 0, y);
    wg.fillStyle = n === mx ? '#10b981' : (dark ? '#475569' : '#94a3b8'); wg.beginPath(); wg.roundRect ? wg.roundRect(34, y - 8, bw, 16, 4) : wg.rect(34, y - 8, bw, 16); wg.fill(); wg.fillStyle = text; wg.fillText(String(n), 34 + bw + 8, y); });
  const keys = [...days.keys()].sort(), gaps = keys.slice(1).map((k, i) => (Date.parse(k + 'T12:00:00') - Date.parse(keys[i] + 'T12:00:00')) / 864e5), top = wdN.indexOf(mx), gmax = gaps.length ? Math.max(...gaps) : 0, gi = gaps.indexOf(gmax);
  $('st-heat-note').textContent = nCh + ' Ladungen an ' + keys.length + ' Tagen. Am häufigsten lädst du am ' + LONG[top] + ' (' + fmt(mx / nCh * 100, 0) + ' %).' + (gaps.length ? ' Ø Abstand ' + fmt(gaps.reduce((a, b) => a + b, 0) / gaps.length, 1) + ' Tage, längste Pause ' + fmt(gmax, 0) + ' Tage (' + wrDY(Date.parse(keys[gi] + 'T12:00:00')) + ' – ' + wrDY(Date.parse(keys[gi + 1] + 'T12:00:00')) + ').' : '');
}

/* =====================================================================
   Fahrzeugakte (PDF über den Druckdialog des Geräts, wie die Berichte): Eckdaten, Betrieb gesamt, Akku-Schätzung, km-Verlauf, Wartung und Service, Kosten nach Kategorie, Wartungsplan.
   Alles aus den eigenen Aufzeichnungen der App; kein Gutachten.
   ===================================================================== */
const AKTE_SERVICE = /service|wartung|inspektion|reifen|räder|werkstatt|tüv|\bhu\b|\bau\b|reparatur|bremse|garantie|ersatzteil|rückruf/i;
/* ---- Diagramm-Helfer: Canvas → PNG, damit die Grafiken im PDF scharf und farbtreu sind ---- */
const AK = { ink: '#334155', grid: '#e2e8f0', green: '#059669', sky: '#0284c7', amber: '#d97706', rose: '#e11d48', slate: '#94a3b8' };
const akNice = (lo, hi, n = 4) => { const span = Math.max(1e-9, hi - lo), s0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(s0))), r = s0 / mag, step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag, a = Math.floor(lo / step + 1e-9) * step, t = []; for (let v = a; v <= hi + step * .999; v += step) t.push(+v.toFixed(10)); return t.length > 1 ? t : [a, a + step]; };
const akDec = (yt) => { const st = yt[1] - yt[0]; return st >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(st) - 1e-9)); };   // Nachkommastellen der y-Achse (sonst stehen bei kleiner Spanne gleiche Zahlen mehrfach)
const akImg = (cv, alt) => '<div style="break-inside:avoid;margin:2px 0 12px;padding-bottom:10px;border-bottom:1px solid #cbd5e1"><img alt="' + alt + '" width="' + cv.width + '" height="' + cv.height + '" loading="eager" decoding="sync" src="' + cv.toDataURL('image/png') + '" style="display:block;width:100%;height:auto"></div>';
function akLegend(g, items, W) { g.font = '19px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; let x = 86; items.forEach(([col, lab]) => { g.fillStyle = col; g.fillRect(x, 12, 18, 18); g.fillStyle = AK.ink; g.fillText(lab, x + 26, 21); x += 26 + g.measureText(lab).width + 28; }); }
function akAxes(g, W, H, L, R, T, yt, Y, yFmt) { const dec = akDec(yt); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.font = '19px system-ui, sans-serif'; g.lineWidth = 1; g.strokeStyle = AK.grid; g.fillStyle = AK.ink; g.textAlign = 'right'; g.textBaseline = 'middle'; yt.forEach(v => { const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(yFmt(v, dec), L - 10, y); }); }
function akRef(g, ref, W, L, R, Y) { (ref || []).forEach(r => { const y = Y(r.y); g.save(); g.setLineDash([9, 7]); g.strokeStyle = r.color; g.lineWidth = 2.5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.restore(); g.font = 'bold 19px system-ui, sans-serif'; const tw = g.measureText(r.label).width; g.fillStyle = '#fff'; g.fillRect(W - R - tw - 14, y - 30, tw + 12, 26); g.fillStyle = r.color; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(r.label, W - R - 8, y - 6); }); }
/** Linien/Punkte-Diagramm: series = [{ kind: 'line'|'dots', pts: [[x, y]], color }], ref = [{ y, label, color }]; xTicks optional (sonst Anfang und Ende). */
function akXY(c) {
  const W = 1000, H = c.H || 330, L = 90, R = 24, T = c.legend ? 46 : 20, B = 50, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const ys = [].concat(...c.series.map(s => s.pts.map(q => q[1])), (c.ref || []).map(r => r.y)), yt = akNice(c.ymin != null ? c.ymin : Math.min(...ys), Math.max(...ys), 4), ylo = yt[0], yhi = yt[yt.length - 1], xhi = Math.max(c.xmax, c.xmin + 1e-9);
  const X = (x) => L + (x - c.xmin) / (xhi - c.xmin) * (W - L - R), Y = (y) => T + (1 - (y - ylo) / Math.max(1e-9, yhi - ylo)) * (H - T - B);
  akAxes(g, W, H, L, R, T, yt, Y, c.yFmt); g.textBaseline = 'alphabetic'; g.fillStyle = AK.ink;
  if (c.xTicks) { g.textAlign = 'center'; c.xTicks.forEach(x => g.fillText(c.xFmt(x), X(x), H - 16)); } else { g.textAlign = 'left'; g.fillText(c.xFmt(c.xmin), L, H - 16); g.textAlign = 'right'; g.fillText(c.xFmt(xhi), W - R, H - 16); }
  if (c.xTitle) { g.textAlign = 'center'; g.fillText(c.xTitle, (L + W - R) / 2, H - 16); }
  akRef(g, c.ref, W, L, R, Y);
  c.series.forEach(s => { if (s.kind === 'line') { g.strokeStyle = s.color; g.lineWidth = s.w || 4; g.beginPath(); s.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.stroke(); } else { g.fillStyle = s.color; s.pts.forEach(q => { g.beginPath(); g.arc(X(q[0]), Y(q[1]), s.r || 5, 0, 7); g.fill(); }); } });
  if (c.legend) akLegend(g, c.legend, W);
  return akImg(cv, c.alt || 'Diagramm');
}
/** Balkendiagramm (auch gestapelt): labels, stacks = [{ color, label, vals }], ref wie oben. */
function akBars(c) {
  const W = 1000, H = c.H || 330, L = 90, R = 24, T = 46, B = 56, n = c.labels.length, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const tot = c.labels.map((_, i) => c.stacks.reduce((a, s) => a + Math.max(0, s.vals[i] || 0), 0)), yt = akNice(0, Math.max(...tot, ...(c.ref || []).map(r => r.y), 1e-9), 4), yhi = yt[yt.length - 1];
  const Y = (v) => T + (1 - v / yhi) * (H - T - B), cx = (i) => L + (i + .5) * (W - L - R) / n, bw = Math.min(64, (W - L - R) / n * .64);
  akAxes(g, W, H, L, R, T, yt, Y, c.yFmt);
  c.labels.forEach((_, i) => { let acc = 0; c.stacks.forEach(s => { const v = Math.max(0, s.vals[i] || 0); if (v > 0) { g.fillStyle = s.color; g.fillRect(cx(i) - bw / 2, Y(acc + v), bw, Y(acc) - Y(acc + v)); acc += v; } }); });
  g.font = '18px system-ui, sans-serif'; g.fillStyle = AK.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; const st = Math.ceil(n / 12); c.labels.forEach((l, i) => { if (i % st === 0) g.fillText(l, cx(i), H - 20); });
  akRef(g, c.ref, W, L, R, Y); akLegend(g, c.stacks.map(s => [s.color, s.label]), W);
  return akImg(cv, c.alt || 'Diagramm');
}
/** Zwei gestapelte Balken (Energie, Anzahl): AC (grün) gegen DC (orange), je mit Prozentangabe. */
function akSplit(rows) {
  const W = 1000, H = 230, L = 250, R = 24, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); akLegend(g, [[AK.green, 'AC (Zuhause + Bosch)'], [AK.amber, 'DC (Unterwegs)']], W);
  rows.forEach(([lab, ac, dc, fmtV], i) => { const y = 70 + i * 74, tot = ac + dc, wA = tot > 0 ? (W - L - R) * ac / tot : 0, wD = (W - L - R) - wA; g.font = '20px system-ui, sans-serif'; g.fillStyle = AK.ink; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(lab, L - 16, y + 26);
    g.fillStyle = AK.green; g.fillRect(L, y, wA, 52); g.fillStyle = AK.amber; g.fillRect(L + wA, y, wD, 52); g.font = 'bold 20px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center';
    const put = (v, w, cx) => { const full = fmt(v / tot * 100, 0) + ' % · ' + fmtV(v), short = fmt(v / tot * 100, 0) + ' %'; if (tot > 0 && g.measureText(full).width <= w - 24) g.fillText(full, cx, y + 27); else if (tot > 0 && g.measureText(short).width <= w - 16) g.fillText(short, cx, y + 27); };   // lange Beschriftung nur, wenn sie ins Segment passt
    put(ac, wA, L + wA / 2); put(dc, wD, L + wA + wD / 2); });
  return akImg(cv, 'AC- und DC-Laden');
}
/** Monatsdaten ab dem ersten Eintrag bis heute: km, Ladungen, kWh, Ø Verbrauch, Ladekosten, sonstige Kosten, Einnahmen. */
function akMonths(rs, cs) {
  const ts = rs.map(r => Date.parse(r.date)).concat(cs.map(c => Date.parse(c.date))).filter(Number.isFinite); if (!ts.length) return [];
  const a = new Date(Math.min(...ts)), now = new Date(), out = [];
  for (let y = a.getFullYear(), m = a.getMonth(); y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()); m++) {
    if (m > 11) { m = 0; y++; if (y > now.getFullYear()) break; }
    const s0 = new Date(y, m, 1).getTime(), e0 = new Date(y, m + 1, 1).getTime(), idx = []; rs.forEach((r, i) => { const t = Date.parse(r.date); if (t >= s0 && t < e0 && !isStartRow(rs, i)) idx.push(i); });
    const mr = monthReport(y, m, 'all'), ct = costTotals(y, m), tot = idx.length ? consumptionTotals(rs, idx) : null;
    out.push({ y, m, label: MONTHS[m] + ' ' + String(y).slice(2), km: rangeKm(s0, e0) || 0, n: mr.charges.length, kwh: mr.kwh, k100: tot && tot.km ? tot.kwh100 : null, laden: ct.laden, other: ct.other, income: ct.income });
  }
  return out;
}
function akTempPts() {                                                                  // nur aus dem lokalen Temperatur-Cache (kein Netz nötig); leer, wenn Standort/Cache fehlen
  const l = wxLoc(), c = load(KEY_TEMPS, null); if (!l || !c || c.loc !== l.lat + ',' + l.lon) return []; const rs = getReadings(), pts = [];
  rs.forEach((r, i) => { if (i < 1) return; const s = entryStats(rs, i), a = Date.parse(rs[i - 1].date), b = Date.parse(r.date); if (s.method !== 'soc' || s.rough || !(s.kwh100 > 0) || s.km < 20 || !Number.isFinite(a) || !Number.isFinite(b)) return;
    let sum = 0, n = 0; for (let t = Date.parse(wxIso(new Date(a)) + 'T12:00:00'), e = Date.parse(wxIso(new Date(b)) + 'T12:00:00'); t <= e; t += 864e5) { const v = c.days[wxIso(new Date(t))]; if (v != null) { sum += v; n++; } } if (n) pts.push([sum / n, s.kwh100]); });
  return pts;
}
function akteHtml() {
  const rs = getReadings(), cs = getCosts(), set = getSettings(), now = Date.now(), name = (set.title || DEFAULT_TITLE).split('|')[0].trim() || 'Fahrzeug', D1 = (ms) => wrDY(ms), P0 = Date.parse(purchaseDay() + 'T12:00:00');
  const od = rs.filter(r => r.odometerKm > 0), km = lastKnownKm(), driven = od.length > 1 && km != null ? km - od[0].odometerKm : null, tot = rs.length ? consumptionTotals(rs, rs.map((_, i) => i)) : null, pk = set.purchaseKm != null ? Number(set.purchaseKm) : null, pp = set.purchasePrice != null ? Number(set.purchasePrice) : null;
  let kwh = 0, laden = 0, n = 0, chg = 0, stored = 0; const pl = { home: { n: 0, kwh: 0, cost: 0, ck: 0 }, bosch: { n: 0, kwh: 0, cost: 0, ck: 0 }, away: { n: 0, kwh: 0, cost: 0, ck: 0 } }, ent = [];
  rs.forEach((r, i) => { if (isStartRow(rs, i)) return; const c = r.consumedSinceLast || 0, st = entryStats(rs, i), o = pl[placeOf(r)]; kwh += c; laden += r.cost || 0; o.kwh += c; o.cost += r.cost || 0; if (c > 0 && r.cost > 0) o.ck += c; if (isCharge(rs, i)) { n++; o.n++; } if (st.stored !== undefined) { chg += c; stored += st.stored; } ent.push({ r, st, c, t: Date.parse(r.date), ch: isCharge(rs, i) }); });
  const other = cs.reduce((a, c) => a + Math.max(0, costAmt(c)), 0), income = -cs.reduce((a, c) => a + Math.min(0, costAmt(c)), 0), total = laden + other - income, loss = chg > 0 ? (1 - stored / chg) * 100 : null;
  const H2 = (t) => '<h2 style="font-size:15px;margin:22px 0 6px;padding-bottom:3px;border-bottom:2px solid #059669;break-after:avoid">' + t + '</h2>', CAP = (t) => '<p style="font-size:12px;font-weight:600;margin:10px 0 2px;break-after:avoid">' + t + '</p>', NOTE = (t) => '<p style="font-size:11px;color:#64748b;margin:2px 0 0">' + t + '</p>';
  const TD = 'padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px', TH = 'text-align:left;padding:4px 6px;border-bottom:2px solid #94a3b8;font-size:12px';
  const kv = (rows) => '<table style="width:100%;border-collapse:collapse">' + rows.filter(Boolean).map(([k, v]) => '<tr style="break-inside:avoid"><td style="' + TD + ';width:46%;color:#475569">' + k + '</td><td style="' + TD + ';font-weight:600">' + v + '</td></tr>').join('') + '</table>';
  const tbl = (head, rows, right = [], fs = 12) => (rows.length <= 14 ? '<div style="break-inside:avoid">' : '') + '<table style="width:100%;border-collapse:collapse"><thead><tr>' + head.map((h, i) => '<th style="' + TH + (right.includes(i) ? ';text-align:right' : '') + ';font-size:' + fs + 'px">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr style="break-inside:avoid' + (r.bold ? ';font-weight:700' : '') + '">' + r.map((c, i) => '<td style="' + TD + (right.includes(i) ? ';text-align:right' : '') + ';font-size:' + fs + 'px">' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>' + (rows.length <= 14 ? '</div>' : '');
  const kpi = (rows) => '<table style="width:100%;border-collapse:collapse;margin-top:12px;border-top:1px solid #cbd5e1">' + rows.map(r => '<tr style="break-inside:avoid">' + r.map(([l, v]) => '<td style="width:33%;padding:7px 8px 7px 0;border-bottom:1px solid #cbd5e1;vertical-align:top"><div style="font-size:10.5px;color:#64748b">' + l + '</div><div style="font-size:16px;font-weight:700;margin-top:1px">' + v + '</div></td>').join('') + '</tr>').join('') + '</table>';
  const fit = batFit(batRows()), batOk = !!fit && fit.n >= BAT.minN && fit.sumHub >= BAT.minHub, months = akMonths(rs, cs);
  let h = '<div style="max-width:720px;margin:0 auto;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;line-height:1.35"><h1 style="font-size:26px;margin:0">Fahrzeugakte</h1><p style="margin:2px 0 0;font-size:15px;color:#475569">' + esc(name) + ' · erstellt am ' + D1(now) + '</p>';
  h += kpi([[['Kilometerstand', km != null ? fmt(km, 0) + ' km' : '–'], ['Geladen', fmt(kwh, 0) + ' kWh'], ['Ø Verbrauch', tot && tot.km ? fmt(tot.kwh100, 1) + ' kWh/100 km' : '–']], [['Ø Strompreis', kwh > 0 ? fmt(laden / kwh * 100, 1) + ' ct/kWh' : '–'], ['Betriebskosten gesamt', eur(total)], ['Betriebskosten pro km', driven > 0 ? fmt(total / driven * 100, 1) + ' ct/km' : '–']]]);
  const yrs = (now - P0) / (365.25 * 864e5), sincePk = pk != null && km != null ? km - pk : null;
  const SV = getSettings(), mm = [SV.brand, SV.model].filter(Boolean).join(' ');
  h += H2('Fahrzeug') + kv([mm ? ['Fahrzeug', esc(mm)] : null, SV.year ? ['Baujahr', esc(SV.year)] : null, SV.plate ? ['Kennzeichen', esc(SV.plate)] : null, SV.vin ? ['Fahrgestellnummer (FIN)', esc(SV.vin)] : null, ['Kauftag', D1(P0)], ['Nutzungsdauer', fmt((now - P0) / 864e5 / 30.4375, 1) + ' Monate'], pk != null ? ['Kilometerstand bei Kauf', fmt(pk, 0) + ' km'] : null, pp != null ? ['Kaufpreis', eur(pp)] : null, ['Aktueller km-Stand', km != null ? fmt(km, 0) + ' km' : '–'], sincePk != null ? ['Gefahren seit Kauf', fmt(sincePk, 0) + ' km' + (yrs >= .25 ? ' (Ø ' + fmt(sincePk / yrs, 0) + ' km pro Jahr)' : '')] : null, driven != null ? ['Aufgezeichnet', fmt(driven, 0) + ' km seit ' + D1(Date.parse(od[0].date))] : null, ['Batterie (Nettokapazität laut Einstellung)', fmt(batteryKwh(), 0) + ' kWh'], rs.length ? ['Aufzeichnung', D1(Date.parse(rs[0].date)) + ' bis ' + D1(Date.parse(rs[rs.length - 1].date))] : null]);
  { const cc = getSettings().ccEnd; h += H2('Ausstattung') + kv(AUSST.pdf.map(([k, v]) => [k, esc(v)]).concat(/^\d{4}-\d{2}-\d{2}$/.test(cc || '') ? [['Care Connect bis', fmtYMD(cc)]] : []))
    + CAP('Technische Daten') + kv(AUSST.tech.flatMap(g => g[2]).map(([k, v]) => [esc(k), esc(v)]))
    + AUSST.groups.map(([name, , items]) => CAP(esc(name)) + tbl(['Code', 'Bezeichnung'], items.map(([c, t]) => [c || 'Serie', esc(t)]), [], 11)).join(''); }
  h += H2('Betrieb und Kosten gesamt') + kv([['Ladungen', fmt(n, 0)], ['Geladene Energie', fmt(kwh, 0) + ' kWh'], tot && tot.km ? ['Ø Verbrauch inkl. Ladeverluste', fmt(tot.kwh100, 1) + ' kWh/100 km (WLTP-Angabe ' + fmt(wltpVal(), 1) + ')'] : null, loss != null ? ['Ø Ladeverlust', fmt(loss, 1) + ' %'] : null, kwh > 0 ? ['Ø Strompreis', fmt(laden / kwh * 100, 1) + ' ct/kWh'] : null, ['Ladekosten', eur(laden)], ['Sonstige Kosten (Service, Reifen, …)', eur(other)], income ? ['Einnahmen und Erstattungen', eur(income)] : null, ['Betriebskosten gesamt (ohne Kaufpreis)', eur(total)], driven > 0 ? ['Betriebskosten pro km', fmt(total / driven * 100, 1) + ' ct/km'] : null]);
  const placeRows = PLACE_KEYS.filter(k => pl[k].kwh > 0 || pl[k].n > 0).map(k => [PLACES[k], fmt(pl[k].n, 0), fmt(pl[k].kwh, 0), kwh ? fmt(pl[k].kwh / kwh * 100, 0) + ' %' : '–', eur(pl[k].cost), pl[k].ck > 0 ? fmt(pl[k].cost / pl[k].ck * 100, 1) : '–']);
  if (placeRows.length) h += CAP('Ladeorte') + tbl(['Ort', 'Ladungen', 'kWh', 'Anteil', 'Kosten', 'ct/kWh'], placeRows, [1, 2, 3, 4, 5]);
  const ac = { n: pl.home.n + pl.bosch.n, kwh: pl.home.kwh + pl.bosch.kwh }, dc = pl.away, pc = (x, t) => t > 0 ? fmt(x / t * 100, 0) + ' %' : '–', noKwh = ent.filter(e => e.ch && !(e.c > 0)).length;
  if (n > 0) h += '<div style="break-inside:avoid">' + CAP('AC- und DC-Laden') + akSplit([['Energie (kWh)', ac.kwh, dc.kwh, (v) => fmt(v, 0) + ' kWh'], ['Ladungen (Anzahl)', ac.n, dc.n, (v) => fmt(v, 0) + (v === 1 ? ' Ladung' : ' Ladungen')]])
    + tbl(['Ladeart', 'Ladungen', 'Anteil', 'Energie (kWh)', 'Anteil'], [['AC-Laden (Zuhause + Bosch)', fmt(ac.n, 0), pc(ac.n, n), fmt(ac.kwh, 0), pc(ac.kwh, kwh)], ['davon Zuhause', fmt(pl.home.n, 0), pc(pl.home.n, n), fmt(pl.home.kwh, 0), pc(pl.home.kwh, kwh)], ['davon Bosch', fmt(pl.bosch.n, 0), pc(pl.bosch.n, n), fmt(pl.bosch.kwh, 0), pc(pl.bosch.kwh, kwh)], ['DC-Laden (Unterwegs)', fmt(dc.n, 0), pc(dc.n, n), fmt(dc.kwh, 0), pc(dc.kwh, kwh)], Object.assign(['Summe', fmt(n, 0), '100 %', fmt(kwh, 0), '100 %'], { bold: true })], [1, 2, 3, 4])
    + NOTE('AC = Zuhause und Bosch, DC = Unterwegs.' + (noKwh ? ' ' + noKwh + (noKwh === 1 ? ' Ladung ohne kWh-Angabe zählt' : ' Ladungen ohne kWh-Angabe zählen') + ' nur bei der Anzahl, nicht bei der Energie.' : '')) + '</div>';
  h += H2('Akku-Schätzung') + (batOk ? kv([['Nutzbar im Auto je 100 % Akku', fmt(fit.K * BAT.eta, 1) + ' kWh (bei ' + Math.round(BAT.eta * 100) + ' % Ladewirkungsgrad)'], ['Brutto an der Steckdose je 100 % Akku', fmt(fit.K, 1) + ' kWh (± ' + fmt(fit.ci, 1) + ', 95 %)'], ['Akkugesundheit (Schätzung)', fmt(fit.K * BAT.eta / AVILOO.nom * 100, 1) + ' % von ' + AVILOO.nom + ' kWh Werksangabe' + (lastKnownKm() ? ' · typisch bei ' + fmt(lastKnownKm(), 0) + ' km: ' + fmt(avSoh(lastKnownKm()), 1) + ' %' : '')], ['Typisch laut Aviloo-Benchmark', fmt(AVILOO.n, 0) + ' Enyaq iV: ' + AVILOO.pts.slice(1).map(q => fmt(q[1], 1) + ' % nach ' + fmt(q[0], 0) + ' km').join(', ')], ['Basis', fit.n + ' Ladungen, ' + D1(fit.use[0].t) + ' bis ' + D1(fit.use[fit.use.length - 1].t)]]) + NOTE('Schätzung aus eigenen Messungen der Ladungen, kein Gutachten und kein Wert des Herstellers.') : '<p style="font-size:12px;color:#475569;margin:0">Noch nicht genug passende Ladungen (Akku-Start/-Ende in % und gemessene kWh) für eine Schätzung.</p>');
  /* Diagramme */
  h += H2('Diagramme');
  const kmPts = rs.filter(r => r.odometerKm > 0).map(r => [Date.parse(r.date), r.odometerKm]).concat(cs.filter(c => c.odometerKm > 0).map(c => [Date.parse(c.date), c.odometerKm])).filter(q => Number.isFinite(q[0])).sort((a, b) => a[0] - b[0]);
  if (kmPts.length > 1) h += CAP('Kilometerstand im Zeitverlauf') + akXY({ series: [{ kind: 'line', pts: kmPts, color: AK.green }, { kind: 'dots', pts: kmPts, color: AK.green, r: 4 }], xmin: kmPts[0][0], xmax: kmPts[kmPts.length - 1][0], xFmt: D1, yFmt: (v, d) => fmt(v, d), alt: 'Kilometerstand im Zeitverlauf' });
  if (months.length > 1 && months.some(x => x.km > 0)) h += CAP('Gefahrene Kilometer je Monat') + akBars({ labels: months.map(x => x.label), stacks: [{ color: AK.sky, label: 'km je Monat', vals: months.map(x => x.km) }], yFmt: (v, d) => fmt(v, d), alt: 'Kilometer je Monat' });
  if (months.some(x => x.k100 != null)) h += CAP('Ø Verbrauch je Monat (kWh/100 km, inkl. Ladeverluste)') + akBars({ labels: months.map(x => x.label), stacks: [{ color: AK.green, label: 'Verbrauch', vals: months.map(x => x.k100 || 0) }], ref: [{ y: wltpVal(), label: 'WLTP ' + fmt(wltpVal(), 1), color: AK.amber }], yFmt: (v, d) => fmt(v, d), alt: 'Verbrauch je Monat' });
  if (months.some(x => x.laden + x.other > 0)) h += CAP('Kosten je Monat (Euro)') + akBars({ labels: months.map(x => x.label), stacks: [{ color: AK.green, label: 'Laden', vals: months.map(x => x.laden) }, { color: AK.amber, label: 'Sonstige Kosten', vals: months.map(x => x.other) }], yFmt: (v, d) => fmt(v, d), alt: 'Kosten je Monat' }) + NOTE('Einnahmen und Erstattungen sind nicht abgezogen.');
  const tp = akTempPts();
  if (tp.length >= 5) { const mxx = tp.reduce((a, q) => a + q[0], 0) / tp.length, myy = tp.reduce((a, q) => a + q[1], 0) / tp.length, sxx = tp.reduce((a, q) => a + (q[0] - mxx) ** 2, 0), sl = sxx > 0 ? tp.reduce((a, q) => a + (q[0] - mxx) * (q[1] - myy), 0) / sxx : 0, ic = myy - sl * mxx, xa = Math.min(...tp.map(q => q[0])), xb = Math.max(...tp.map(q => q[0]));
    h += CAP('Verbrauch je Außentemperatur (jeder Punkt = eine Ladung)') + akXY({ series: [{ kind: 'dots', pts: tp, color: AK.slate, r: 6 }].concat(xb - xa >= 6 ? [{ kind: 'line', pts: [[xa, ic + sl * xa], [xb, ic + sl * xb]], color: AK.green, w: 5 }] : []), xmin: Math.floor(xa), xmax: Math.ceil(xb), xFmt: (v) => fmt(v, 0) + ' °C', xTicks: akNice(xa, xb, 5), yFmt: (v, d) => fmt(v, d), alt: 'Verbrauch je Außentemperatur' }) + NOTE('Mittlere Tagestemperatur zwischen zwei Ladungen am Wetter-Standort (Open-Meteo), Verbrauch in kWh/100 km.'); }
  const br = batRows(); if (br.length >= 5) { const roll = []; br.forEach(r => { const w = br.filter(x => x.t > r.t - BAT.win * BAT.day && x.t <= r.t); if (w.length >= 6) { const f = batFit(w); if (f) roll.push([r.t, f.K]); } });
    h += CAP('Akku-Schätzung je Ladung (kWh an der Steckdose je 100 % Akku)') + akXY({ series: [{ kind: 'dots', pts: br.map(x => [x.t, x.k]), color: AK.slate, r: 5 }].concat(roll.length > 1 ? [{ kind: 'line', pts: roll, color: AK.green, w: 5 }] : []), ref: batOk ? [{ y: fit.K, label: 'Ø ' + fmt(fit.K, 1), color: AK.amber }] : [], xmin: br[0].t, xmax: br[br.length - 1].t, xFmt: D1, yFmt: (v, d) => fmt(v, d), legend: [[AK.slate, 'Einzelne Ladung'], [AK.green, 'Gleitender Wert (3 Monate)']], alt: 'Akku-Schätzung je Ladung' }) + NOTE('Einzelwerte streuen durch Rundung des Akku-% und Temperatur. Aussagekräftig ist die Veränderung über lange Zeit.'); }
  const pp2 = ent.filter(e => unitOf(e.r) > 0 && Number.isFinite(e.t)); if (pp2.length >= 3) { const col = { home: AK.green, bosch: AK.sky, away: AK.amber }, ser = PLACE_KEYS.map(k => ({ kind: 'dots', pts: pp2.filter(e => placeOf(e.r) === k).map(e => [e.t, unitOf(e.r) * 100]), color: col[k], r: 6 })).filter(x => x.pts.length);
    h += CAP('Strompreis je Ladung (ct/kWh)') + akXY({ series: ser, ref: kwh > 0 ? [{ y: laden / kwh * 100, label: 'Ø ' + fmt(laden / kwh * 100, 1), color: AK.rose }] : [], xmin: Math.min(...pp2.map(e => e.t)), xmax: Math.max(...pp2.map(e => e.t)), xFmt: D1, yFmt: (v, d) => fmt(v, d), legend: PLACE_KEYS.filter(k => pp2.some(e => placeOf(e.r) === k)).map(k => [col[k], PLACES[k]]), alt: 'Strompreis je Ladung' }); }
  /* Monatsübersicht */
  if (months.length) { const sum = months.reduce((a, x) => ({ km: a.km + x.km, n: a.n + x.n, kwh: a.kwh + x.kwh, laden: a.laden + x.laden, other: a.other + x.other, income: a.income + x.income }), { km: 0, n: 0, kwh: 0, laden: 0, other: 0, income: 0 });
    h += H2('Monatsübersicht') + tbl(['Monat', 'km', 'Ladungen', 'kWh', 'kWh/100 km', 'Laden', 'Sonstige', 'Einnahmen'], months.map(x => [x.label, x.km ? fmt(x.km, 0) : '–', fmt(x.n, 0), x.kwh ? fmt(x.kwh, 0) : '–', x.k100 != null ? fmt(x.k100, 1) : '–', eur(x.laden), eur(x.other), x.income ? eur(x.income) : '–']).concat([Object.assign(['Summe', fmt(sum.km, 0), fmt(sum.n, 0), fmt(sum.kwh, 0), tot && tot.km ? fmt(tot.kwh100, 1) : '–', eur(sum.laden), eur(sum.other), sum.income ? eur(sum.income) : '–'], { bold: true })]), [1, 2, 3, 4, 5, 6, 7], 11); }
  /* Rekorde */
  const withK = ent.filter(e => e.st.kwh100 != null && !e.st.rough), withC = ent.filter(e => e.c > 0 && e.r.cost > 0), rec = [];
  if (withK.length) { const lo = withK.reduce((a, e) => e.st.kwh100 < a.st.kwh100 ? e : a), hi = withK.reduce((a, e) => e.st.kwh100 > a.st.kwh100 ? e : a); rec.push(['Niedrigster Verbrauch', fmt(lo.st.kwh100, 1) + ' kWh/100 km', D1(lo.t)], ['Höchster Verbrauch', fmt(hi.st.kwh100, 1) + ' kWh/100 km', D1(hi.t)]); }
  if (withC.length) { const lo = withC.reduce((a, e) => e.r.cost / e.c < a.r.cost / a.c ? e : a), hi = withC.reduce((a, e) => e.r.cost / e.c > a.r.cost / a.c ? e : a), big = withC.reduce((a, e) => e.c > a.c ? e : a), cheap = withC.reduce((a, e) => e.r.cost < a.r.cost ? e : a), dear = withC.reduce((a, e) => e.r.cost > a.r.cost ? e : a);
    rec.push(['Günstigster Strompreis', fmt(lo.r.cost / lo.c * 100, 1) + ' ct/kWh', D1(lo.t)], ['Höchster Strompreis', fmt(hi.r.cost / hi.c * 100, 1) + ' ct/kWh', D1(hi.t)], ['Größte Ladung', fmt(big.c, 1) + ' kWh', D1(big.t)], ['Günstigste Ladung', eur(cheap.r.cost), D1(cheap.t)], ['Teuerste Ladung', eur(dear.r.cost), D1(dear.t)]); }
  const trs = getTrips().filter(tripVisible);
  if (trs.length) { const bm = tripsByMonth(trs), keys = Object.keys(bm).sort(), sumT = (l, g) => l.filter(t => !g || tripLabel(t).lab.id === g).reduce((a, t) => a + (t.km || 0), 0), labs = getTLabels().filter(lb => trs.some(t => tripLabel(t).lab.id === lb.id)), k100 = (l) => { const w = l.filter(t => t.kwh > 0 && t.km > 0), k = w.reduce((a, t) => a + t.km, 0); return k ? fmt(w.reduce((a, t) => a + t.kwh, 0) / k * 100, 1) : '–'; };
    h += H2('Fahrten (Fahrtenbuch der MyŠkoda-App)') + tbl(['Monat', 'Fahrten', 'km'].concat(labs.map(lb => esc(lb.name)), ['kWh/100 km']), keys.map(k => { const l = bm[k]; return [MONTHS[+k.slice(5) - 1] + ' ' + k.slice(2, 4), fmt(l.length, 0), fmt(sumT(l), 0)].concat(labs.map(lb => fmt(sumT(l, lb.id), 0)), [k100(l)]); })
      .concat([Object.assign(['Summe', fmt(trs.length, 0), fmt(sumT(trs), 0)].concat(labs.map(lb => fmt(sumT(trs, lb.id), 0)), [k100(trs)]), { bold: true })]), labs.map((_, i) => i + 3).concat([1, 2, labs.length + 3]), 11)
      + NOTE('Verbrauch laut Auto ohne Ladeverluste. Fahrten unter 1 km sind nicht enthalten.'); }
  if (rec.length) h += H2('Rekorde') + tbl(['Kennzahl', 'Wert', 'Datum'], rec, [1]);
  /* Wartung, Kosten, Plan */
  const svc = cs.filter(c => costAmt(c) > 0 && AKTE_SERVICE.test((c.category || '') + ' ' + (c.title || ''))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  h += H2('Wartung und Service') + (svc.length ? tbl(['Datum', 'km-Stand', 'Bezeichnung', 'Kategorie', 'Betrag', 'Beleg'], svc.map(c => [D1(Date.parse(c.date)), c.odometerKm > 0 ? fmt(c.odometerKm, 0) : '–', esc(c.title || ''), esc(c.category || '–'), eur(costAmt(c)), c.files && c.files.length ? 'ja (' + c.files.length + ')' : '–']).concat([Object.assign(['Summe', '', '', '', eur(svc.reduce((a, c) => a + costAmt(c), 0)), ''], { bold: true })]), [1, 4]) : '<p style="font-size:12px;color:#475569;margin:0">Keine Einträge in Kategorien wie Service, Wartung, Reifen oder Reparatur gefunden.</p>');
  const cat = new Map(); cs.forEach(c => { const a = costAmt(c); if (a <= 0) return; const k = c.category || 'Ohne Kategorie', o = cat.get(k) || { n: 0, s: 0 }; o.n++; o.s += a; cat.set(k, o); });
  if (cat.size || laden) h += H2('Kosten nach Kategorie') + tbl(['Kategorie', 'Anzahl', 'Summe'], [['Laden (Strom)', fmt(n, 0), eur(laden)]].concat([...cat.entries()].sort((a, b) => b[1].s - a[1].s).map(([k, o]) => [esc(k), fmt(o.n, 0), eur(o.s)])), [1, 2]);
  const runsP = getReminders().filter(r => r.kind === 'run').sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
  const rem = getReminders().filter(r => r.kind !== 'run').sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  if (rem.length) h += H2('Wartungsplan (Erinnerungen)') + tbl(['Titel', 'Fällig am', 'Fällig bei'], rem.map(r => [esc((r.title || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')), r.dueDate ? D1(Date.parse(r.dueDate + 'T12:00:00')) : '–', r.dueKm > 0 ? fmt(r.dueKm, 0) + ' km' : '–']));
  if (runsP.length) h += H2('Pflege und Laufzeiten') + tbl(['Was', 'Seit', 'Hält ca.', 'Läuft bis'], runsP.map(r => [esc((r.title || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')) + (r.note ? '<br><span style="color:#64748b">' + esc(r.note) + '</span>' : ''), r.startDate ? D1(Date.parse(r.startDate + 'T12:00:00')) : '–', r.lifeN ? esc(runLifeText(r)) : '–', r.dueDate ? D1(Date.parse(r.dueDate + 'T12:00:00')) : '–']));
  const hist = []; getReminders().forEach(r => remLog(r).forEach(e => hist.push({ t: Date.parse(e.at), title: (r.title || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, ''), km: e.km, cost: e.cost })));
  hist.sort((a, b) => b.t - a.t);
  if (hist.length) h += H2('Wartungsnachweis (erledigt)') + tbl(['Datum', 'Arbeit', 'km-Stand', 'Kosten'], hist.map(x => [D1(x.t), esc(x.title), x.km > 0 ? fmt(x.km, 0) + ' km' : '–', x.cost > 0 ? eur(x.cost) : '–']), [2, 3]);
  h += '<p style="font-size:11px;color:#64748b;margin:24px 0 0;border-top:1px solid #cbd5e1;padding-top:8px">Diese Akte wurde am ' + D1(now) + ' aus den eigenen Aufzeichnungen der App erzeugt. Kaufkilometer und Kaufpreis sind Angaben des Halters und fließen nicht in die Kostenrechnung ein. Die Akte ist kein Gutachten und ersetzt weder das Serviceheft noch Herstellernachweise.</p></div>';
  return h;
}
$('btn-akte').addEventListener('click', async () => {
  const btn = $('btn-akte'), box = $('akte-print'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Akte wird vorbereitet …';
  try {
    /* Akte als sichtbare Seite öffnen (nicht unsichtbar im Hintergrund): Nur was wirklich auf dem Bildschirm gezeichnet ist, landet zuverlässig im PDF.
       Zurück geht es über „Schließen“, nicht über afterprint (das feuert auf Android teils sofort und würde die Akte vor dem Druck wieder entfernen). */
    box.innerHTML = '<div id="akte-bar"><button type="button" data-akte="close" style="background:#e2e8f0;color:#0f172a">Schließen</button><button type="button" data-akte="print" style="background:#059669;color:#fff">Drucken / als PDF</button></div>' + akteHtml();
    akteOldTitle = document.title; document.body.classList.add('print-akte'); window.scrollTo(0, 0);
    document.title = 'Fahrzeugakte ' + ((getSettings().title || DEFAULT_TITLE).split('|')[0].trim() || '');
    await akteReady(box);                                                          // Druck startet erst über den Button „Drucken / als PDF“
  } finally { btn.disabled = false; btn.textContent = label; }
});
/* =====================================================================
   Digitales Checkheft (Berichte → Daten → Checkheft): alle Kosten der Kategorien Service, Reparatur und TÜV als Zeitleiste,
   Detailansicht mit Belegen (Google Drive) und „Checkheft als PDF“: Deckblatt mit Inhaltsverzeichnis + alle Belege chronologisch,
   jede Seite mit Kopfzeile (Art · Leistung · Datum · km) und Seitenzahl. Zusammengesetzt im Browser mit pdf-lib.
   ===================================================================== */
let chFilter = 'all', chSheetId = null; const chPend = [];
const chEntries = () => getCosts().filter(c => chType(c.category) && Number.isFinite(Date.parse(c.date)));
const chDY = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const chMY = (d) => String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
const chAddM = (ms, m) => { const d = new Date(ms); d.setMonth(d.getMonth() + m); return d; };
const CH_ICON = {
  service: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  rep: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  tuev: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const chSvg = (k, cls) => '<svg class="' + cls + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">' + CH_ICON[k] + '</svg>';
const CH_FILE_SVG = '<svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>';
const chIsPdf = (f) => /pdf/i.test(f.mime || '') || /\.pdf$/i.test(f.name || '');
const chFilesLabel = (f) => f.length ? (f.every(chIsPdf) ? f.length + ' PDF' : f.every(x => !chIsPdf(x)) ? f.length + (f.length === 1 ? ' Foto' : ' Fotos') : f.length + ' Belege') : '';
/** Nächste Fälligkeiten aus Einstellungen → Erinnerungen (Monat JJJJ-MM): HU und Service (inkl. Klimaservice, Reifenwechsel usw.). */
function chDue() {
  const st = getSettings(), m = (v) => /^(\d{4})-(\d{2})$/.exec(v || ''), out = [], hu = m(st.nextHu), sv = m(st.nextService);
  if (hu) out.push({ k: 'tuev', l: 'Nächste HU', d: new Date(Number(hu[1]), Number(hu[2]) - 1, 1) });
  if (sv) out.push({ k: 'service', l: 'Service', d: new Date(Number(sv[1]), Number(sv[2]) - 1, 1) });
  return out;
}
function renderCheckheft() {
  const all = chEntries().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), P0 = Date.parse(purchaseDay() + 'T00:00:00');
  const nF = all.reduce((a, c) => a + (c.files || []).length, 0), cnt = (k) => all.filter(c => chType(c.category).k === k).length;
  $('ch-count').textContent = all.length ? all.length + (all.length === 1 ? ' Eintrag' : ' Einträge') + ' · ' + nF + (nF === 1 ? ' Beleg' : ' Belege') : '';
  const chip = (k, label, cls) => '<button type="button" data-chf="' + k + '" class="h-8 rounded-full px-3 text-xs font-semibold ' + (chFilter === k ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700 ' + cls) + '">' + label + '</button>';
  $('ch-chips').innerHTML = all.length ? chip('all', 'Alle', '') + CH_TYPES.map(t => chip(t.k, t.n + ' ' + cnt(t.k), t.txt)).join('') : '';
  const due = chDue(), now = new Date(), mon0 = new Date(now.getFullYear(), now.getMonth(), 1);
  $('ch-due').classList.toggle('hidden', !due.length);
  $('ch-due').innerHTML = due.length ? '<div class="flex items-center gap-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">' + chSvg('tuev', 'h-[18px] w-[18px] shrink-0 text-violet-600 dark:text-violet-300') + '<span class="min-w-0 text-left">' + due.map(x => x.l + ' ' + (x === due[0] ? 'fällig ' : '') + '<b class="' + (x.d < mon0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100') + '">' + chMY(x.d) + (x.d < mon0 ? ' (überfällig)' : '') + '</b>').join(' · ') + '</span></div>' : '';
  const list = chFilter === 'all' ? all : all.filter(c => chType(c.category).k === chFilter);
  let html = '', divDone = false;
  const divider = () => '<li class="flex items-center gap-2 py-1.5 pl-11 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"><span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>Kauf ' + chDY(P0) + (getSettings().purchaseKm ? ' · ' + fmt(Number(getSettings().purchaseKm), 0) + ' km' : '') + '<span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span></li>';
  list.forEach(c => {
    const t = Date.parse(c.date), ty = chType(c.category), pre = t < P0, f = c.files || [], amt = costAmt(c);
    if (pre && !divDone) { html += divider(); divDone = true; }
    const sub = [chDY(t), c.odometerKm > 0 ? fmt(c.odometerKm, 0) + ' km' : '', c.note || ''].filter(Boolean).join(' · ');
    html += '<li><button type="button" data-chid="' + esc(String(c.id)) + '" class="relative flex w-full items-start gap-3 py-2 text-left active:opacity-70' + (pre ? ' opacity-80' : '') + '">'
      + '<span class="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + ty.bg + '">' + chSvg(ty.k, 'h-[18px] w-[18px]') + '</span>'
      + '<span class="min-w-0 flex-1"><span class="flex justify-between gap-2"><span class="truncate text-sm font-semibold">' + esc(c.title || ty.n) + '</span><span class="shrink-0 text-[13px] text-slate-600 dark:text-slate-300">' + (pre && !amt ? 'Vorbesitzer' : eur(amt)) + '</span></span>'
      + '<span class="block truncate text-xs text-slate-500 dark:text-slate-400">' + esc(sub) + '</span>'
      + (f.length ? '<span class="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">' + CH_FILE_SVG + chFilesLabel(f) + '</span>' : '') + '</span></button></li>';
  });
  if (list.length && !divDone && chFilter === 'all') html += divider();
  $('ch-list').innerHTML = list.length ? '<span class="pointer-events-none absolute bottom-5 left-[17px] top-5 w-0.5 bg-slate-200 dark:bg-slate-800" aria-hidden="true"></span>' + html : '';
  $('ch-empty').classList.toggle('hidden', all.length > 0);
  $('btn-ch-pdf').classList.toggle('hidden', !all.length);
  $('btn-ch-pdf-l').textContent = 'Checkheft als PDF' + (nF ? ' (' + nF + (nF === 1 ? ' Beleg)' : ' Belege)') : '');
}
$('ch-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-chf]'); if (b) { chFilter = b.dataset.chf; renderCheckheft(); } });
$('ch-list').addEventListener('click', (e) => { const b = e.target.closest('[data-chid]'); if (b) openChSheet(b.dataset.chid); });

/* ---- Detailansicht (Bottom-Sheet) ---- */
function openChSheet(id) { chSheetId = String(id); chPend.length = 0; renderChSheet(); $('ch-sheet').classList.remove('hidden'); }
function closeChSheet() { $('ch-sheet').classList.add('hidden'); chSheetId = null; chPend.length = 0; }
function renderChSheet(msg) {
  const c = getCosts().find(x => String(x.id) === chSheetId); if (!c) { closeChSheet(); return; }
  const ty = chType(c.category) || CH_TYPES[0], f = c.files || [], t = Date.parse(c.date), box = 'rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5';
  $('ch-sheet-box').innerHTML = '<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div>'
    + '<div class="flex items-center gap-3"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ' + ty.bg + '">' + chSvg(ty.k, 'h-[22px] w-[22px]') + '</span>'
    + '<div class="min-w-0 flex-1"><p class="text-[11px] font-bold uppercase tracking-[0.1em] ' + ty.txt + '">' + esc(ty.n) + '</p><p class="truncate text-lg font-bold">' + esc(c.title || ty.n) + '</p></div>'
    + '<button type="button" data-chs="close" aria-label="Schließen" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"><svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
    + '<div class="grid grid-cols-3 gap-2"><div class="' + box + '"><p class="text-[11px] text-slate-500 dark:text-slate-400">Datum</p><p class="text-[15px] font-semibold">' + chDY(t) + '</p></div>'
    + '<div class="' + box + '"><p class="text-[11px] text-slate-500 dark:text-slate-400">km-Stand</p><p class="text-[15px] font-semibold">' + (c.odometerKm > 0 ? fmt(c.odometerKm, 0) : '–') + '</p></div>'
    + '<div class="' + box + '"><p class="text-[11px] text-slate-500 dark:text-slate-400">Betrag</p><p class="text-[15px] font-semibold">' + eur(costAmt(c)) + '</p></div></div>'
    + (c.note ? '<p class="text-sm text-slate-600 dark:text-slate-300 text-left">Notiz: ' + esc(c.note) + '</p>' : '')
    + '<div class="space-y-2"><p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Belege in Google Drive</p>'
    + (f.length ? '<div class="grid grid-cols-2 gap-2.5">' + f.map(x => '<a href="' + dvLink(x.id) + '" target="_blank" rel="noopener" class="flex flex-col gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 p-2 active:opacity-70"><span class="flex h-24 items-center justify-center rounded-xl bg-white dark:bg-slate-950 text-slate-400"><svg class="h-9 w-9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">' + (chIsPdf(x) ? '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>' : '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>') + '</svg></span><span class="truncate text-xs font-semibold">' + esc(x.name) + '</span></a>').join('') + '</div><p class="text-[11px] text-slate-400 dark:text-slate-500 text-left">Antippen öffnet den Beleg in Google Drive.</p>' : '<p class="text-sm text-slate-500 dark:text-slate-400 text-left">Noch kein Beleg hinterlegt.</p>')
    + (chPend.length ? '<ul class="space-y-1">' + chPend.map((x, i) => '<li class="flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-xs"><span class="min-w-0 truncate">' + esc(x.name) + ' · ' + fmt(x.size / 1048576, 1) + ' MB · noch nicht hochgeladen</span><button type="button" data-chs="rm" data-i="' + i + '" aria-label="Entfernen" class="shrink-0 px-2 py-1 text-slate-500">✕</button></li>').join('') + '</ul>' : '')
    + '<p id="ch-sheet-msg" class="text-xs text-slate-500 dark:text-slate-400 text-left empty:hidden">' + esc(msg || '') + '</p></div>'
    + '<div class="grid grid-cols-2 gap-2.5"><button type="button" data-chs="edit" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold active:scale-95 transition">Bearbeiten</button>'
    + (chPend.length ? '<button type="button" data-chs="upload" class="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white active:scale-95 transition">Hochladen (' + chPend.length + ')</button>' : '<button type="button" data-chs="pick" class="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white active:scale-95 transition">Beleg hinzufügen</button>') + '</div>';
}
$('ch-sheet').addEventListener('click', async (e) => {
  if (e.target === $('ch-sheet')) { closeChSheet(); return; }
  const b = e.target.closest('[data-chs]'); if (!b) return; const act = b.dataset.chs;
  if (act === 'close') closeChSheet();
  else if (act === 'pick') $('ch-file').click();
  else if (act === 'rm') { chPend.splice(Number(b.dataset.i), 1); renderChSheet(); }
  else if (act === 'edit') {                                                     // Historie → Kosten im Bearbeiten-Modus, Eintrag in die Mitte scrollen
    const id = chSheetId; closeChSheet(); histFilter = 'kosten'; showView('history'); setEditMode(true);
    const j = getCosts().findIndex(c => String(c.id) === id), li = document.querySelector('#history-list li[data-cidx="' + j + '"]');
    if (li) setTimeout(() => { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 120);
  }
  else if (act === 'upload') {
    const c = getCosts().find(x => String(x.id) === chSheetId), msg = (t) => { const m = $('ch-sheet-msg'); if (m) m.textContent = t; };
    if (!c || !chPend.length) return;
    if (!window.cloud?.isSignedIn()) { msg('Belege brauchen die Anmeldung bei Google (Einstellungen).'); return; }
    const tokP = window.cloud.driveToken(); tokP.catch(() => { }); b.disabled = true; msg('Verbinde mit Google Drive …');
    try { const up = await dvUploadFor(c, chPend.slice(), tokP, (i, n) => msg('Lade hoch ' + i + ' von ' + n + ' …')); chPend.length = 0; await dvSetFiles(c.id, f => f.concat(up)); renderChSheet(up.length + (up.length === 1 ? ' Beleg' : ' Belege') + ' in Google Drive gespeichert.'); renderCheckheft(); }
    catch (err) { if (err && err.status === 401) window.cloud.driveForget(); b.disabled = false; msg('Upload fehlgeschlagen: ' + dvErrText(err)); }
  }
});
$('ch-file').addEventListener('change', (e) => {
  let big = ''; Array.from(e.target.files || []).forEach(f => { if (f.size > DV_MAX) big = '„' + f.name + '“ ist größer als 15 MB und wurde ausgelassen.'; else chPend.push(f); });
  e.target.value = ''; renderChSheet(big || (chPend.length ? 'Zum Speichern in Google Drive auf „Hochladen“ tippen.' : ''));
});

/* ---- Checkheft als PDF (pdf-lib, im Browser) ---- */
let chPdfLib = null;
function chLoadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!chPdfLib) chPdfLib = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'; sc.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib fehlt')); sc.onerror = () => { chPdfLib = null; rej(new Error('pdf-lib konnte nicht geladen werden (offline?)')); }; document.head.appendChild(sc); });
  return chPdfLib;
}
async function chImageBytes(buf, mime) {                                         // Fotos als JPEG/PNG einbetten; andere Formate (WebP, HEIC …) über ein Canvas zu JPEG
  if (/jpe?g/i.test(mime)) return { kind: 'jpg', bytes: buf };
  if (/png/i.test(mime)) return { kind: 'png', bytes: buf };
  const bmp = await createImageBitmap(new Blob([buf], { type: mime })); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
  const bl = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88)); return { kind: 'jpg', bytes: await bl.arrayBuffer() };
}
async function buildCheckheftPdf(onMsg, tokP) {
  const L = window.PDFLib, { PDFDocument, StandardFonts, rgb } = L, entries = chEntries().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const nFiles = entries.reduce((a, c) => a + (c.files || []).length, 0);
  const doc = await PDFDocument.create(), F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, ink = rgb(0.06, 0.09, 0.16), grey = rgb(0.39, 0.45, 0.55), line = rgb(0.89, 0.91, 0.94);
  const COL = { service: rgb(0.012, 0.412, 0.631), rep: rgb(0.706, 0.325, 0.035), tuev: rgb(0.427, 0.157, 0.851) }, TINT = { service: rgb(0.88, 0.95, 0.99), rep: rgb(1, 0.95, 0.86), tuev: rgb(0.93, 0.91, 1) };
  const safe = (f, s) => Array.from(String(s == null ? '' : s).replace(/[   ]/g, ' ')).map(ch => { try { f.encodeText(ch); return ch; } catch (e) { return '?'; } }).join('');
  const fit = (f, s, size, w) => { let t = safe(f, s); if (f.widthOfTextAtSize(t, size) <= w) return t; while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1); return t + '…'; };
  const txt = (pg, s, x, y, o = {}) => { const f = o.bold ? FB : F, size = o.size || 10, t = o.w ? fit(f, s, size, o.w) : safe(f, s); const xx = o.right ? x - f.widthOfTextAtSize(t, size) : x; pg.drawText(t, { x: xx, y, size, font: f, color: o.color || ink }); };
  const set = getSettings(), car = [set.brand, set.model].filter(Boolean).join(' ') || (set.title || DEFAULT_TITLE).split('|')[0].trim(), P0 = Date.parse(purchaseDay() + 'T00:00:00');
  /* Inhaltsverzeichnis: Zeilen = Einträge + Trennzeile „Kauf“; Seiten vorab anlegen, damit die Seitenzahlen der Belege feststehen */
  const rows = []; let kaufDone = false;
  entries.forEach(c => { if (!kaufDone && Date.parse(c.date) >= P0) { rows.push({ kauf: true }); kaufDone = true; } rows.push({ c }); });
  if (!kaufDone) rows.push({ kauf: true });
  const RH = 30, CAP1 = 15, CAPN = 23, nIdx = rows.length <= CAP1 ? 1 : 1 + Math.ceil((rows.length - CAP1) / CAPN), idx = []; for (let i = 0; i < nIdx; i++) idx.push(doc.addPage([W, H]));
  /* Belege */
  const startPage = new Map(); let tok = null, done = 0;
  for (const c of entries) {
    const f = c.files || [], ty = chType(c.category); if (!f.length) continue;
    startPage.set(c.id, doc.getPageCount() + 1);
    for (let i = 0; i < f.length; i++) {
      done++; onMsg('Lade Beleg ' + done + ' von ' + nFiles + ' …');
      const head = { ty, c, label: 'Beleg ' + (i + 1) + ' von ' + f.length }; let placed = 0, err = '';
      try {
        if (!tok) tok = await tokP;
        const buf = await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f[i].id) + '?alt=media')).arrayBuffer();
        if (chIsPdf(f[i])) {
          const src = await PDFDocument.load(buf, { ignoreEncryption: true }), n = src.getPageCount();
          const emb = await doc.embedPages(src.getPages());
          emb.forEach((ep, p) => { const pg = doc.addPage([W, H]); chDrawFit(pg, ep, true); chHead(pg, head, n > 1 ? ' · S. ' + (p + 1) + '/' + n : ''); placed++; });
        } else {
          const im = await chImageBytes(buf, f[i].mime || ''), img = im.kind === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
          const pg = doc.addPage([W, H]); chDrawFit(pg, img, false); chHead(pg, head, ''); placed++;
        }
      } catch (e) { if (e && e.status === 401) { window.cloud.driveForget(); throw e; } err = (e && e.message) || String(e); }
      if (!placed) {                                                              // Ersatzseite statt Abbruch (z. B. verschlüsseltes oder gelöschtes Dokument)
        const pg = doc.addPage([W, H]); chHead(pg, head, '');
        txt(pg, 'Beleg konnte nicht eingebunden werden', 60, 640, { bold: true, size: 16 }); txt(pg, f[i].name, 60, 612, { size: 11, w: 475 });
        txt(pg, err || 'Unbekannter Fehler', 60, 592, { size: 10, color: grey, w: 475 }); txt(pg, 'Original in Google Drive:', 60, 560, { size: 10, color: grey }); txt(pg, dvLink(f[i].id), 60, 544, { size: 9, color: COL.service, w: 475 });
      }
    }
  }
  function chDrawFit(pg, obj, isPage) {                                           // Beleg in den Bereich unter der Kopfzeile einpassen, zentriert
    const bx = 24, by = 30, bw = W - 48, bh = H - 34 - 40, ow = obj.width, oh = obj.height, k = Math.min(bw / ow, bh / oh), w = ow * k, h = oh * k, x = bx + (bw - w) / 2, y = by + (bh - h) / 2;
    if (isPage) pg.drawPage(obj, { x, y, width: w, height: h }); else pg.drawImage(obj, { x, y, width: w, height: h });
    pg.drawRectangle({ x, y, width: w, height: h, borderColor: line, borderWidth: 0.6 });
  }
  function chHead(pg, hd, extra) {
    const k = hd.ty.k, tag = safe(FB, hd.ty.n.toUpperCase()), tw = FB.widthOfTextAtSize(tag, 8.5) + 12;
    pg.drawRectangle({ x: 24, y: H - 30, width: tw, height: 15, color: TINT[k] }); pg.drawText(tag, { x: 30, y: H - 26, size: 8.5, font: FB, color: COL[k] });
    const meta = chDY(Date.parse(hd.c.date)) + (hd.c.odometerKm > 0 ? ' · ' + fmt(hd.c.odometerKm, 0) + ' km' : ''), right = hd.label + extra, rw = F.widthOfTextAtSize(safe(F, right), 9);
    const mw = F.widthOfTextAtSize(safe(F, meta), 9), titleW = W - 24 - rw - 14 - (24 + tw + 8) - mw - 10;
    const t = fit(FB, hd.c.title || hd.ty.n, 10, Math.max(40, titleW)); pg.drawText(t, { x: 24 + tw + 8, y: H - 26, size: 10, font: FB, color: ink });
    txt(pg, meta, 24 + tw + 8 + FB.widthOfTextAtSize(t, 10) + 8, H - 26, { size: 9, color: grey }); txt(pg, right, W - 24, H - 26, { size: 9, color: grey, right: true });
    pg.drawLine({ start: { x: 24, y: H - 36 }, end: { x: W - 24, y: H - 36 }, thickness: 0.6, color: rgb(0.8, 0.84, 0.88) });
  }
  /* Deckblatt + Inhaltsverzeichnis */
  const total = doc.getPageCount(), p1 = idx[0], sum = entries.reduce((a, c) => a + Math.max(0, costAmt(c)), 0);
  txt(p1, 'DIGITALES CHECKHEFT', 44, H - 82, { bold: true, size: 28 });
  txt(p1, car + (set.year ? ' · Erstzulassung ' + set.year : '') + (set.plate ? ' · ' + set.plate : ''), 44, H - 102, { size: 11, color: grey, w: 380 });
  txt(p1, 'erstellt am ' + chDY(Date.now()), W - 44, H - 82, { size: 9, color: grey, right: true }); txt(p1, total + ' Seiten', W - 44, H - 95, { size: 9, color: grey, right: true });
  p1.drawLine({ start: { x: 44, y: H - 114 }, end: { x: W - 44, y: H - 114 }, thickness: 1.6, color: ink });
  const tiles = CH_TYPES.map(t => [t.n.toUpperCase(), String(entries.filter(c => chType(c.category).k === t.k).length), COL[t.k]]).concat([['KOSTEN', eur(sum), grey]]), tW = (W - 88 - 30) / 4;
  tiles.forEach((t, i) => { const x = 44 + i * (tW + 10); p1.drawRectangle({ x, y: H - 182, width: tW, height: 50, borderColor: line, borderWidth: 1 }); txt(p1, t[0], x + 10, H - 148, { bold: true, size: 8, color: t[2] }); txt(p1, t[1], x + 10, H - 172, { bold: true, size: 18, w: tW - 20 }); });
  const X = { d: 44, a: 112, l: 176, km: 432, b: 492, s: W - 44 };
  let pi = 0, y = 0, onPage = 0;
  const startIdx = (pg, first) => { txt(pg, first ? 'INHALT' : 'INHALT (FORTSETZUNG)', 44, first ? H - 214 : H - 70, { bold: true, size: 13 }); y = first ? H - 238 : H - 94;
    [['DATUM', X.d], ['ART', X.a], ['LEISTUNG', X.l]].forEach(([t, x]) => txt(pg, t, x, y, { bold: true, size: 7.5, color: grey })); [['KM', X.km], ['BETRAG', X.b], ['SEITE', X.s]].forEach(([t, x]) => txt(pg, t, x, y, { bold: true, size: 7.5, color: grey, right: true }));
    pg.drawLine({ start: { x: 44, y: y - 6 }, end: { x: W - 44, y: y - 6 }, thickness: 0.8, color: rgb(0.8, 0.84, 0.88) }); y -= 24; onPage = 0; };
  startIdx(idx[0], true);
  rows.forEach(r => {
    if (onPage >= (pi === 0 ? CAP1 : CAPN)) { pi++; startIdx(idx[pi], false); }
    const pg = idx[pi];
    if (r.kauf) txt(pg, 'KAUF AM ' + chDY(P0) + (set.purchaseKm ? ' BEI ' + fmt(Number(set.purchaseKm), 0) + ' KM' : ''), X.d, y + 2, { bold: true, size: 7.5, color: grey });
    else {
      const c = r.c, ty = chType(c.category), f = c.files || [], sp = startPage.get(c.id), pre = Date.parse(c.date) < P0, amt = costAmt(c);
      txt(pg, chDY(Date.parse(c.date)), X.d, y + 4, { size: 9.5 }); txt(pg, ty.n, X.a, y + 4, { bold: true, size: 9.5, color: COL[ty.k] });
      txt(pg, c.title || ty.n, X.l, y + 4, { size: 9.5, w: X.km - X.l - 52 });
      txt(pg, [pre ? 'vor dem Kauf' : '', c.note || '', f.length ? f.length + (f.length === 1 ? ' Beleg' : ' Belege') : 'ohne Beleg'].filter(Boolean).join(' · '), X.l, y - 7, { size: 7.5, color: grey, w: X.km - X.l - 52 });
      txt(pg, c.odometerKm > 0 ? fmt(c.odometerKm, 0) : '–', X.km, y + 4, { size: 9.5, right: true }); txt(pg, pre && !amt ? '–' : eur(amt), X.b, y + 4, { size: 9.5, right: true });
      let pages = '–'; if (sp) { let end = total; for (const [id, s0] of startPage) if (s0 > sp && s0 - 1 < end) end = s0 - 1; pages = end > sp ? sp + '–' + end : String(sp); }
      txt(pg, pages, X.s, y + 4, { size: 9.5, right: true });
    }
    pg.drawLine({ start: { x: 44, y: y - 13 }, end: { x: W - 44, y: y - 13 }, thickness: 0.5, color: line });
    y -= RH; onPage++;
  });
  /* Fälligkeiten + Hinweis unten auf Seite 1 */
  const due = chDue();
  due.forEach((d, i) => { const bw = (W - 88 - 10) / 2, x = 44 + i * (bw + 10); p1.drawRectangle({ x, y: 92, width: bw, height: 38, color: TINT[d.k] }); txt(p1, d.l === 'Service' ? 'Nächster Service' : d.l, x + 10, 116, { bold: true, size: 9, color: COL[d.k] }); txt(p1, chMY(d.d), x + 10, 100, { size: 10 }); });
  p1.drawLine({ start: { x: 44, y: 76 }, end: { x: W - 44, y: 76 }, thickness: 0.5, color: line });
  txt(p1, 'Zusammengestellt aus den Belegen in EnyaqStrom. Die Belege folgen in zeitlicher Reihenfolge, jede Seite trägt oben Art, Datum und km-Stand.', 44, 62, { size: 7.5, color: grey, w: W - 88 });
  txt(p1, 'Die Mappe ersetzt keine Herstellernachweise.', 44, 52, { size: 7.5, color: grey });
  /* Fußzeile auf allen Seiten */
  doc.getPages().forEach((pg, i) => { txt(pg, 'Digitales Checkheft · ' + car, 24, 14, { size: 7.5, color: grey, w: 360 }); txt(pg, 'Seite ' + (i + 1) + ' von ' + total, W - 24, 14, { size: 7.5, color: grey, right: true }); });
  doc.setTitle('Digitales Checkheft ' + car); doc.setCreator('EnyaqStrom'); doc.setProducer('EnyaqStrom (pdf-lib)');
  return doc.save();
}
let chBusy = false;
$('btn-ch-pdf').addEventListener('click', async () => {
  if (chBusy) return; const msg = $('ch-msg'), nF = chEntries().reduce((a, c) => a + (c.files || []).length, 0);
  if (nF && !window.cloud?.isSignedIn()) { msg.textContent = 'Für die Belege bitte zuerst bei Google anmelden (Einstellungen).'; return; }
  chBusy = true; const btn = $('btn-ch-pdf'); btn.disabled = true; btn.classList.add('opacity-60');
  const tokWarm = nF ? window.cloud.driveToken() : null; if (tokWarm) tokWarm.catch(() => { });   // Google-Fenster direkt nach dem Tipp öffnen
  try {
    msg.textContent = 'Bereite das Checkheft vor …'; await chLoadPdfLib();
    const bytes = await buildCheckheftPdf((t) => { msg.textContent = t; }, tokWarm), blob = new Blob([bytes], { type: 'application/pdf' }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Checkheft ' + ((getSettings().model || 'Enyaq').trim()) + ' ' + wxIso(new Date()) + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    msg.textContent = 'Fertig: ' + fmt(blob.size / 1048576, 1) + ' MB · im Download-Ordner gespeichert.';
  } catch (e) { msg.textContent = 'Checkheft konnte nicht erstellt werden: ' + (e && e.status ? dvErrText(e) : (e && e.message) || e); }
  finally { chBusy = false; btn.disabled = false; btn.classList.remove('opacity-60'); }
});

let akteOldTitle = '';
async function akteReady(box) {                                                     // alle Diagramm-Bilder geladen, dekodiert und gezeichnet
  await Promise.all([...box.querySelectorAll('img')].map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = r; })).then(() => i.decode ? i.decode().catch(() => { }) : null)));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 400));
}
$('akte-print').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-akte]'); if (!b) return;
  if (b.dataset.akte === 'close') { document.body.classList.remove('print-akte'); $('akte-print').innerHTML = ''; if (akteOldTitle) document.title = akteOldTitle; window.scrollTo(0, 0); }
  else { await akteReady($('akte-print')); window.print(); }
});

/* =====================================================================
   Verbrauch je Außentemperatur (Statistik): Für jede Strecke zwischen zwei Ladungen (genaue Werte aus Akku-%) wird die mittlere Tagestemperatur am Wetter-Standort
   bestimmt (Open-Meteo: Archiv bis vor 7 Tagen, danach Vorhersage-Schnittstelle mit past_days). Nichts davon wird an den Ladungen gespeichert; nur die Tageswerte liegen lokal im Cache.
   ===================================================================== */
let stTempChart = null, stTempTok = 0;
async function wxTemps(l, fromIso, toIso) {
  const key = l.lat + ',' + l.lon; let c = load(KEY_TEMPS, null); if (!c || c.loc !== key) c = { loc: key, days: {} };
  const recent = wxIso(new Date(Date.now() - 3 * 864e5)), arch = wxIso(new Date(Date.now() - 7 * 864e5)); let need = false;
  c.rain = c.rain || {}; c.hum = c.hum || {};
  for (let t = Date.parse(fromIso + 'T12:00:00'), e = Date.parse(toIso + 'T12:00:00'); t <= e; t += 864e5) { const d = wxIso(new Date(t)); if (c.days[d] === undefined || c.rain[d] === undefined || c.hum[d] === undefined || d >= recent) { need = true; break; } }   // die letzten 3 Tage immer neu holen
  if (need) {
    const q = '&latitude=' + l.lat + '&longitude=' + l.lon + '&daily=temperature_2m_mean,precipitation_sum&hourly=temperature_2m,relative_humidity_2m&timezone=auto', put = (j) => { const hd = wxoHumDays(j); j.daily.time.forEach((d, i) => { const v = j.daily.temperature_2m_mean[i], p = (j.daily.precipitation_sum || [])[i]; if (v != null) c.days[d] = v; if (p != null) c.rain[d] = p; if (hd[d] != null) c.hum[d] = hd[d]; }); };
    try {
      if (fromIso <= arch) { const r = await fetch('https://archive-api.open-meteo.com/v1/archive?start_date=' + fromIso + '&end_date=' + (toIso < arch ? toIso : arch) + q); if (r.ok) put(await r.json()); }
      if (toIso > arch) { const r = await fetch('https://api.open-meteo.com/v1/forecast?past_days=10&forecast_days=1' + q); if (r.ok) put(await r.json()); }
      save(KEY_TEMPS, c);
    } catch (e) { /* offline: vorhandene Werte nutzen */ }
  }
  return c.days;
}
async function renderTempChart() {
  const tok = ++stTempTok, rs = getReadings(), l = wxLoc(), note = $('st-temp-note'), wrap = $('st-temp-wrap');
  if (stTempChart) { stTempChart.destroy(); stTempChart = null; } wrap.classList.add('hidden');
  const iv = [];                                                                       // nur genaue Strecken (Akku-%), ohne grobe Entnahmen unter 3 kWh und Kurzstrecken unter 20 km
  rs.forEach((r, i) => { if (i < 1) return; const s = entryStats(rs, i), a = Date.parse(rs[i - 1].date), b = Date.parse(r.date); if (s.method !== 'soc' || s.rough || !(s.kwh100 > 0) || s.km < 20 || !Number.isFinite(a) || !Number.isFinite(b)) return; iv.push({ a: wxIso(new Date(a)), b: wxIso(new Date(b)), y: s.kwh100 }); });
  if (!l) { note.textContent = 'Für diese Auswertung bitte in den Einstellungen einen Wetter-Standort eintragen.'; return; }
  if (iv.length < 3) { note.textContent = 'Noch zu wenige genaue Ladungen: Es braucht mindestens 3 Ladungen mit Akku-Start/-Ende in % und km-Stand.'; return; }
  note.textContent = 'Temperaturen werden geladen …';
  const days = await wxTemps(l, iv.reduce((m, x) => x.a < m ? x.a : m, iv[0].a), iv.reduce((m, x) => x.b > m ? x.b : m, iv[0].b)); if (tok !== stTempTok) return;
  const pts = [];
  iv.forEach(x => { let sum = 0, n = 0; for (let t = Date.parse(x.a + 'T12:00:00'), e = Date.parse(x.b + 'T12:00:00'); t <= e; t += 864e5) { const v = days[wxIso(new Date(t))]; if (v != null) { sum += v; n++; } } if (n) pts.push({ x: +(sum / n).toFixed(1), y: +x.y.toFixed(2) }); });
  if (pts.length < 3) { note.textContent = 'Keine Temperaturdaten verfügbar (offline?). Sobald eine Verbindung besteht, erscheint die Auswertung.'; return; }
  if (typeof Chart === 'undefined') { note.textContent = 'Diagramm nicht verfügbar (Chart.js nicht geladen).'; return; }
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n, sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const slope = sxx > 0 ? sxy / sxx : 0, icpt = my - slope * mx, xmin = Math.min(...pts.map(p => p.x)), xmax = Math.max(...pts.map(p => p.x)), trend = n >= 5 && xmax - xmin >= 6;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches, text = dark ? '#cbd5e1' : '#475569', grid = dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)';
  const ds = [{ type: 'scatter', data: pts, backgroundColor: '#94a3b8', pointRadius: 3.5 }];
  if (trend) ds.push({ type: 'line', data: [{ x: xmin, y: +(icpt + slope * xmin).toFixed(2) }, { x: xmax, y: +(icpt + slope * xmax).toFixed(2) }], borderColor: '#10b981', backgroundColor: '#10b981', pointRadius: 0, borderWidth: 2.5 });
  wrap.classList.remove('hidden');
  stTempChart = new Chart($('st-temp-chart'), { data: { datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { filter: (c) => c.datasetIndex === 0, callbacks: { label: (c) => fmt(c.parsed.y, 1) + ' kWh/100 km bei ' + fmt(c.parsed.x, 1) + ' °C' } } },
    scales: { x: { type: 'linear', title: { display: true, text: 'Ø Außentemperatur seit der letzten Ladung (°C)', color: text }, ticks: { color: text }, grid: { color: grid } }, y: { title: { display: true, text: 'kWh/100 km', color: text }, ticks: { color: text }, grid: { color: grid } } } } });
  const d10 = -slope * 10, parts = [n + ' Ladungen'];
  if (trend) { parts.push('Trend: je 10 °C kälter ' + (d10 >= 0 ? '+' : '−') + fmt(Math.abs(d10), 1) + ' kWh/100 km'); const a20 = icpt + slope * 20, a0 = icpt; if (xmin <= 5 && xmax >= 15 && a20 > 0 && a0 > 0) parts.push('bei 20 °C ≈ ' + fmt(a20, 1) + ', bei 0 °C ≈ ' + fmt(a0, 1) + ' kWh/100 km (' + (a0 >= a20 ? '+' : '−') + fmt(Math.abs((a0 / a20 - 1) * 100), 0) + ' %)'); }
  note.textContent = parts.join(' · ') + '. Jeder Punkt ist eine Ladung: der Verbrauch seit der vorherigen Ladung bei der Durchschnittstemperatur dieser Tage am Wetter-Standort.';
}

/* =====================================================================
   „<Titel> Wrapped“: Rückblick als Story mit 5 Seiten (Distanz, Energie, Durchschnittsverbrauch, Kosten, Überblick).
   Auslöser: jeder 01.01., der Jahrestag des Kauftags und alle 5.000 gefahrenen km (gezählt ab dem ersten km-Stand). Die Werte gelten für die abgelaufene Periode,
   z. B. 08.06.–31.12., 01.01.–07.06. bzw. die jeweiligen 5.000 km. Berechnet wird alles aus den vorhandenen Daten; gemerkt wird nur, welche Rückblicke schon gesehen wurden.
   ===================================================================== */
const WR_KM = 5000, WR_HOUSEHOLD = 1500, WR_F = "font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif";   // km je Rückblick; Jahresstrom Single-Haushalt (Richtwert, kWh)
const wltpVal = () => { const v = Number(getSettings().wltp); return v > 5 && v < 40 ? v : carProf().wltp; };
const wrD = (ms) => { const d = new Date(ms); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'; };
const wrDY = (ms) => wrD(ms) + new Date(ms).getFullYear();
const wrTitle = () => ((getSettings().title || DEFAULT_TITLE).split('|')[0].trim() || carShort()) + ' Wrapped';
/** Vergleichs-Benziner aus Einstellungen → Fahrtenbuch (Standard: 7,0 l/100 km, 1,75 €/l) */
const cmpCar = () => { const s = getSettings(), l = Number(s.cmpL), e = Number(s.cmpEur), g = Number(s.cmpCo2); return { name: (s.cmpCar || '').trim() || 'ein Benziner', l: l > 1 && l < 30 ? l : 7, eur: e > 0.5 && e < 5 ? e : 1.75, g: g >= 0 && g < 2000 ? g : 0 }; };
const CO2_L = 2.37;                                                                   // kg CO₂ je Liter Benzin (Verbrennung)
/** CO₂-Bilanz: Benziner (Liter × 2,37 kg) gegen geladenen Strom (kWh × g/kWh laut Einstellung, Ökostrom = 0) → kg */
const cmpCo2 = (km, kwh) => { const c = cmpCar(), fuel = km * c.l / 100 * CO2_L, el = (kwh || 0) * c.g / 1000; return { fuel, el, sav: fuel - el }; };
const fmtCo2 = (kg) => Math.abs(kg) >= 1000 ? fmt(kg / 1000, 1) + ' t' : fmt(kg, 0) + ' kg';
const wrSeen = () => { const l = load(KEY_WRAP, []); return Array.isArray(l) ? l : []; };

/** Kennzahlen einer Periode: km (aus den km-Ständen), geladene kWh, Kosten (Laden + Kosten − Einnahmen), Ø Verbrauch inkl. Ladeverluste, Zahl der Ladungen. */
function wrStats(p) {
  const rs = getReadings(), idx = []; let kwh = 0, laden = 0;
  rs.forEach((r, i) => { const t = Date.parse(r.date); if (!(t >= p.t0 && t <= p.t1) || isStartRow(rs, i)) return; idx.push(i); kwh += r.consumedSinceLast || 0; laden += r.cost || 0; });
  const other = getCosts().reduce((a, c) => { const t = Date.parse(c.date); return t >= p.t0 && t <= p.t1 ? a + costAmt(c) : a; }, 0), tot = idx.length ? consumptionTotals(rs, idx) : null;
  return { n: idx.length, km: rangeKm(p.t0, p.t1 + 1), kwh, laden, cost: laden + other, kwh100: tot && tot.km ? tot.kwh100 : null, days: Math.max(1, Math.round((Math.min(p.t1, Date.now()) - p.t0) / 864e5) + 1) };
}
/** Alle abgeschlossenen Perioden (neueste zuerst) + Beginn der laufenden Zeit-Periode. */
function wrPeriods() {
  const rs = getReadings().filter(r => Number.isFinite(Date.parse(r.date))), now = Date.now(), ty = new Date().getFullYear(), [py, pm, pd] = purchaseDay().split('-').map(Number), P = new Date(py, pm - 1, pd).getTime(), time = [], km = [];
  const bs = [...new Set([].concat(...Array.from({ length: Math.max(0, ty - py) }, (_, i) => [new Date(py + 1 + i, 0, 1).getTime(), new Date(py + 1 + i, pm - 1, pd).getTime()])))].filter(x => x > P && x <= now).sort((a, b) => a - b);
  let s = P; bs.forEach(x => { time.push({ kind: 't', id: 't' + wxIso(new Date(x)), t0: s, t1: x - 1, avail: x, label: wrDY(s) + ' – ' + wrDY(x - 1) }); s = x; });
  const od = rs.filter(r => r.odometerKm > 0);
  if (od.length > 1) { const base = od[0].odometerKm; let prev = od[0], k = 1;
    od.forEach(r => { const m = Math.floor((r.odometerKm - base) / WR_KM); if (m >= k) { const t1 = Date.parse(r.date);
      km.push({ kind: 'k', id: 'k' + m, t0: km.length ? Date.parse(prev.date) + 1 : Date.parse(prev.date), t1, avail: t1, label: k === 1 ? 'Die ersten ' + fmt(m * WR_KM, 0) + ' km' : fmt((k - 1) * WR_KM, 0) + ' – ' + fmt(m * WR_KM, 0) + ' km' }); prev = r; k = m + 1; } }); }
  [time, km].forEach(a => a.forEach((p, i) => { p.prev = a[i - 1] || null; }));
  const list = time.concat(km).map(p => ({ ...p, st: wrStats(p) })).filter(p => p.st.n >= 1 && p.st.km > 0).sort((a, b) => b.avail - a.avail);
  return { list, runStart: s, runPrev: time[time.length - 1] || null };
}
/* ---- Vergleiche ---- */
const WR_DEST = [[400, 'Paris'], [750, 'Berlin'], [900, 'Wien'], [1250, 'Rom'], [1600, 'Madrid'], [2200, 'Lissabon'], [2500, 'Istanbul'], [3300, 'zum Nordkap']];   // grobe Straßenentfernungen ab dem Saarland
/** Vergleich zur gefahrenen Strecke, abhängig von der Größe: Anteil bis Paris, ein Reiseziel samt Rest-km, Anteil an der Erde oder Erdumrundungen. */
function wrDist(km) {
  const EARTH = 40075, to = (n) => n.startsWith('zum') ? n : 'nach ' + n;
  if (km < 400) return { text: 'Schon ' + fmt(km / 400 * 100, 0) + ' % des Wegs nach Paris (ca. 400 km).', dest: 'Paris' };
  if (km >= EARTH) { const x = km / EARTH; return { text: 'Das sind ' + fmt(x, 1) + '-mal um die Erde (je 40.075 km).', dest: fmt(x, 1) + '× Erde' }; }
  /* Bestes Vielfaches: Ziel × 1 bis 5, das die Strecke gut trifft (kleiner Rest, möglichst wenige Wiederholungen); passt nichts auf 15 % genau, Anteil an der Erde */
  const WORD = ['', 'Einmal', 'Zweimal', 'Dreimal', 'Viermal', 'Fünfmal'];
  let best = null;
  WR_DEST.forEach(([d, name]) => { for (let n = 1; n <= 5; n++) { const rest = km - n * d; if (rest < 0) break; const score = rest + (n - 1) * km * 0.08;   // jedes weitere „mal“ kostet etwas: ein Ziel einmal ist schöner als ein nahes Ziel viermal
    if (!best || score < best.score || (score === best.score && d > best.d)) best = { d, name, n, rest, score }; } });
  if (best && best.rest > km * 0.15 && km < 4400) { const d1 = WR_DEST.filter(x => km >= x[0]).pop(); best = { d: d1[0], name: d1[1], n: 1, rest: km - d1[0], keep: true }; }   // kurze Strecken: einfach das nächste Ziel samt Rest
  if (!best || (!best.keep && best.rest > km * 0.15)) return { text: 'So viel wie ' + fmt(km / EARTH * 100, 0) + ' % einmal um die Erde (40.075 km).', dest: 'Erde' };   // kein Ziel passt gut
  const { d, name, n, rest } = best;
  return { text: WORD[n] + ' ' + to(name) + ' (' + (n > 1 ? 'je ' : '') + 'ca. ' + fmt(d, 0) + ' km)' + (rest >= 50 ? ' und noch ' + fmt(Math.round(rest / 10) * 10, 0) + ' km weiter.' : '.'), dest: (n > 1 ? n + '× ' : '') + name.replace(/^zum /, '') };
}
const wrDur = (days) => days < 14 ? fmt(days, 0) + ' Tage' : days < 70 ? fmt(days / 7, 0) + ' Wochen' : fmt(days / 30.4375, 1) + ' Monate';
const wrBar = (pct, ac) => '<div style="height:10px;border-radius:5px;background:rgba(255,255,255,.18);overflow:hidden"><div style="width:' + Math.max(2, Math.min(100, pct)) + '%;height:100%;background:' + ac + '"></div></div>';
const wrSmall = (t) => '<div style="font-size:13px;color:#cbd5e1;margin-top:6px">' + t + '</div>';

/** Die Seiten einer Periode (Strecke, Energie, Verbrauch, Kosten, Ersparnis vs. Benziner, Überblick). */
function wrPages(p) {
  const st = p.st || wrStats(p), pv = p.prev ? wrStats(p.prev) : null, w = wltpVal(), city = ((wxLoc() || {}).label || '').split(',')[0] || 'Zuhause', MU = '#cbd5e1';
  const page = (bg, ac, lead, big, unit, sub, vis, cmp, cmp2) => ({ bg, ac, body:
    '<div style="font-size:22px;color:' + MU + '">' + lead + '</div><div style="' + WR_F + ';font-size:min(34vw,150px);font-weight:700;line-height:.95;white-space:nowrap;color:' + ac + '">' + big + '</div>' +
    '<div style="' + WR_F + ';font-size:52px;font-weight:600;line-height:1;margin-top:4px">' + unit + '</div><div style="font-size:16px;color:' + MU + ';margin-top:8px">' + sub + '</div>' + (vis ? '<div style="margin-top:30px">' + vis + '</div>' : '') +
    (cmp ? '<div style="font-size:22px;line-height:1.3;margin-top:22px">' + cmp + '</div>' : '') + (cmp2 ? '<div style="font-size:15px;color:' + MU + ';margin-top:8px">' + cmp2 + '</div>' : '') });
  const per = esc(p.label), pages = [];
  // 1 Distanz
  const dc = wrDist(st.km || 0);
  pages.push(page('#022c22', '#6ee7b7', 'Du bist gefahren', fmt(st.km || 0, 0), 'Kilometer', per,
    '<div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:5px;background:#6ee7b7"></div><div style="flex:1;border-top:2px dashed #6ee7b7"></div><div style="width:10px;height:10px;border-radius:5px;background:#6ee7b7"></div></div><div style="display:flex;justify-content:space-between;font-size:13px;color:' + MU + ';margin-top:6px"><span>' + esc(city) + '</span><span>' + dc.dest + '</span></div>', dc.text, ''));
  // 2 Energie
  const pct = st.kwh / WR_HOUSEHOLD * 100;
  pages.push(page('#0c4a6e', '#7dd3fc', 'Du hast geladen', fmt(st.kwh, 0), 'kWh', per, wrBar(pct, '#7dd3fc') + wrSmall('Jahresstrom eines Single-Haushalts: ca. ' + fmt(WR_HOUSEHOLD, 0) + ' kWh'),
    'Das sind ' + fmt(pct, 0) + ' % des Jahresstroms eines Single-Haushalts.', 'Damit käme ein Single-Haushalt etwa ' + wrDur(st.kwh / (WR_HOUSEHOLD / 365)) + ' aus.'));
  // 3 Durchschnittsverbrauch vs. WLTP
  if (st.kwh100 != null) {
    const v = st.kwh100, lo = Math.min(w, v) * .85, hi = Math.max(w, v) * 1.15, pos = (x) => ((x - lo) / (hi - lo) * 100).toFixed(1), d = (v / w - 1) * 100;
    const cmp = Math.abs(d) < 1.5 ? 'Genau auf WLTP-Niveau.' : fmt(Math.abs(d), 0) + ' % ' + (d < 0 ? 'unter' : 'über') + ' dem WLTP-Wert von ' + fmt(w, 1) + ' kWh/100 km.';
    pages.push(page('#422006', '#fcd34d', 'Dein Durchschnittsverbrauch', fmt(v, 1), 'kWh/100 km', per,
      '<div style="position:relative;height:56px"><div style="position:absolute;left:0;right:0;top:26px;height:4px;border-radius:2px;background:rgba(255,255,255,.25)"></div><div style="position:absolute;left:' + pos(w) + '%;top:0;transform:translateX(-50%);font-size:13px;color:' + MU + ';white-space:nowrap">WLTP ' + fmt(w, 1) + '</div><div style="position:absolute;left:' + pos(w) + '%;top:20px;width:3px;height:16px;background:#fff;transform:translateX(-50%)"></div><div style="position:absolute;left:' + pos(v) + '%;top:19px;width:18px;height:18px;border-radius:9px;background:#fcd34d;transform:translateX(-50%)"></div><div style="position:absolute;left:' + pos(v) + '%;top:40px;transform:translateX(-50%);font-size:13px;font-weight:700;color:#fcd34d;white-space:nowrap">Du ' + fmt(v, 1) + '</div></div>',
      cmp, d < 0 ? 'Sparsamer als die Herstellerangabe.' : d <= 15 ? 'Nah an der Herstellerangabe.' : 'Kälte, Autobahn und Heizung kosten im Alltag Reichweite.'));
  } else pages.push(page('#422006', '#fcd34d', 'Dein Durchschnittsverbrauch', '–', 'kWh/100 km', per, '', 'Dafür fehlen in dieser Periode Ladungen mit Akku-Start/-Ende in %.', ''));
  // 4 Kosten
  const ck = st.km > 0 ? st.cost / st.km : null, pk = pv && pv.km > 0 && pv.cost > 0 ? pv.cost / pv.km : null; let c4 = '', c4b = '', vis4 = '';
  if (ck != null && pk != null) {
    const dd = (ck / pk - 1) * 100, mx = Math.max(ck, pk), row = (l, c, col) => '<div style="font-size:13px;color:' + MU + ';margin:10px 0 4px">' + l + ' · ' + fmt(c * 100, 1) + ' ct/km</div>' + wrBar(c / mx * 100, col);
    vis4 = row('Diese Periode', ck, '#fda4af') + row('Vorperiode', pk, 'rgba(255,255,255,.55)');
    c4 = Math.abs(dd) < 1 ? 'Pro Kilometer genauso teuer wie in der Vorperiode.' : 'Pro Kilometer ' + fmt(Math.abs(dd), 0) + ' % ' + (dd < 0 ? 'günstiger' : 'teurer') + ' als in der Vorperiode.';
    c4b = 'Vorperiode (' + wrD(p.prev.t0) + '–' + wrD(p.prev.t1) + '): ' + eur(pv.cost) + ' für ' + fmt(pv.km, 0) + ' km.';
  } else if (ck != null) { c4 = fmt(ck * 100, 2) + ' € pro 100 km.'; c4b = 'Das sind ' + eur(st.cost / st.days) + ' pro Tag.'; }
  pages.push(page('#4c0519', '#fda4af', 'Deine Kosten', fmt(st.cost, 2), '€', per, vis4, c4, c4b));
  // 5 Ersparnis gegenüber dem Vergleichs-Benziner (nur Energie: Sprit vs. Ladekosten)
  const cc = cmpCar(), lit = (st.km || 0) * cc.l / 100, fuel = lit * cc.eur, sav = fuel - st.laden;
  if (st.km > 0) { const mx = Math.max(fuel, st.laden, 0.01), row = (l, v, col) => '<div style="font-size:13px;color:' + MU + ';margin:10px 0 4px">' + l + ' · ' + fmt(v, 0) + ' €</div>' + wrBar(v / mx * 100, col);
    pages.push(page('#1e1b4b', '#c4b5fd', sav >= 0 ? 'Gegenüber dem Benziner gespart' : 'Gegenüber dem Benziner mehr bezahlt', fmt(Math.abs(sav), 0), '€', per,
      row('Sprit für ' + esc(cc.name), fuel, 'rgba(255,255,255,.55)') + row('Strom fürs Laden', st.laden, '#c4b5fd')
        + (() => { const c = cmpCo2(st.km, st.kwh); return '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding:10px 14px;border-radius:16px;background:rgba(134,239,172,.12)"><div style="font-size:24px">🌱</div><div style="min-width:0"><div style="font-size:18px;font-weight:700;color:#86efac">' + fmtCo2(c.sav) + ' CO₂ vermieden</div><div style="font-size:13px;color:' + MU + ';margin-top:2px">Benziner ' + fmtCo2(c.fuel) + ' · Laden ' + (cc.g ? fmtCo2(c.el) + ' (' + fmt(cc.g, 0) + ' g/kWh)' : '0 kg (Ökostrom)') + '</div></div></div>'; })(),
      'Statt ' + fmt(lit, 0) + ' l Sprit (' + fmt(cc.l, 1) + ' l/100 km · ' + fmt(cc.eur, 2) + ' €/l).',
      fmt(st.laden / st.km * 100, 1) + ' statt ' + fmt(fuel / st.km * 100, 1) + ' ct/km · nur Energiekosten')); }
  // 5 Überblick
  const tile = (l, v, u) => '<div style="background:rgba(255,255,255,.08);border-radius:20px;padding:14px 12px;min-width:0"><div style="font-size:' + (l.length > 16 ? 11 : 12) + 'px;line-height:1.3;color:' + MU + '">' + l + '</div><div style="' + WR_F + ';font-size:36px;font-weight:700;line-height:1.05;color:#6ee7b7">' + v + '<wbr><span style="font-family:system-ui,sans-serif;font-size:' + (u.length > 6 ? 11 : 12) + 'px;font-weight:500;color:' + MU + ';margin-left:4px;white-space:nowrap;display:inline-block">' + u + '</span></div></div>';
  pages.push({ bg: '#0f172a', ac: '#6ee7b7', body: '<div style="' + WR_F + ';font-size:44px;font-weight:700;line-height:1">Alles auf einen Blick</div><div style="font-size:16px;color:' + MU + ';margin:6px 0 20px">' + per + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    tile('Gefahren', fmt(st.km || 0, 0), 'km') + tile('Geladen', fmt(st.kwh, 0), 'kWh') + tile('Ø Verbrauch inkl. Verluste', st.kwh100 != null ? fmt(st.kwh100, 1) : '–', 'kWh/100 km') + tile('Ladekosten', fmt(st.laden, 2), '€') + tile('Ladungen', fmt(st.n, 0), '') + tile('Ø Strompreis', st.kwh > 0 ? fmt(st.laden / st.kwh * 100, 1) : '–', 'ct/kWh') + (st.km > 0 ? tile('Energiekostenersparnis', fmt(sav, 0), '€') + tile('CO₂ vermieden', fmtCo2(cmpCo2(st.km, st.kwh).sav).replace(/ (kg|t)$/, ''), / t$/.test(fmtCo2(cmpCo2(st.km, st.kwh).sav)) ? 't' : 'kg') : '') + '</div>' });
  return pages;
}

/* ---- Story-Anzeige ---- */
let wrCur = null, wrIdx = 0, wrCardP = null, wrSwiped = false;
const wrMarkAll = () => { const l = wrSeen(); wrPeriods().list.forEach(x => { if (!l.includes(x.id)) l.push(x.id); }); save(KEY_WRAP, l); };
function wrRender() {
  const pg = wrCur.pages[wrIdx], n = wrCur.pages.length, last = wrIdx === n - 1, bt = 'height:44px;padding:0 8px;border:0;background:transparent;font-size:15px;cursor:pointer;color:';
  const seg = wrCur.pages.map((_, k) => '<div style="flex:1;height:3px;border-radius:2px;background:' + (k <= wrIdx ? pg.ac : 'rgba(255,255,255,.28)') + '"></div>').join('');
  /* Von oben: tiefes Schwarz (passend zur schwarzen Statusleiste), das zügig in die Seitenfarbe übergeht */
  $('wr-ov').style.background = 'linear-gradient(180deg,#000 0,#000 env(safe-area-inset-top,0px),rgba(0,0,0,.55) calc(env(safe-area-inset-top,0px) + 80px),rgba(0,0,0,0) calc(env(safe-area-inset-top,0px) + 230px)),' + pg.bg;
  $('wr-page').innerHTML = '<div data-wr="prev" style="position:absolute;left:0;top:96px;bottom:84px;width:35%"></div><div data-wr="next" style="position:absolute;right:0;top:96px;bottom:84px;width:65%"></div>' +
    '<div style="position:relative;z-index:1"><div style="display:flex;gap:4px">' + seg + '</div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px"><div style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1">' + esc(wrCur.head) + '</div><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;margin-top:2px;color:#cbd5e1">' + esc(wrCur.period) + '</div></div>' +
    '<button data-wr="close" aria-label="Schließen" style="width:44px;height:44px;flex:none;border:0;background:transparent;color:#cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>' +
    '<div style="flex:1"></div><div style="position:relative;pointer-events:none">' + pg.body + '</div><div style="flex:1"></div>' +
    (last ? '<div style="position:relative;z-index:1;margin-bottom:10px"><button data-wr="share" style="width:100%;height:52px;border:0;border-radius:26px;background:#6ee7b7;color:#022c22;font-size:16px;font-weight:700;cursor:pointer">Als Bild teilen</button></div>' : '') +
    '<div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center"><button data-wr="prev" style="' + bt + '#cbd5e1;' + (wrIdx ? '' : 'visibility:hidden') + '">‹ Zurück</button><div style="font-size:13px;color:#cbd5e1">' + (wrIdx + 1) + ' von ' + n + '</div><button data-wr="next" style="' + bt + pg.ac + ';font-weight:700">' + (last ? 'Fertig' : 'Weiter ›') + '</button></div>';
}
function wrOpen(p) {
  wrCur = { head: wrTitle(), period: p.label, p, st: p.st || wrStats(p), pages: wrPages(p) }; wrIdx = 0; if (!p.preview) wrMarkAll();
  $('wr-ov').classList.remove('hidden'); wrRender(); $('wrap-card').classList.add('hidden');
}
function wrClose() { wrCur = null; $('wr-ov').classList.add('hidden'); try { renderWrapCard(); } catch (e) { } }
function wrGo(d) { if (!wrCur) return; const i = wrIdx + d; if (i < 0) return; if (i >= wrCur.pages.length) { wrClose(); return; } wrIdx = i; wrRender(); }
(() => {
  const ov = $('wr-ov'); let sx = 0, sy = 0, down = false;
  ov.addEventListener('click', e => { if (wrSwiped) { wrSwiped = false; return; } const a = e.target.closest('[data-wr]'); if (!a) return; const k = a.dataset.wr; if (k === 'close') wrClose(); else if (k === 'share') wrShare(a); else wrGo(k === 'next' ? 1 : -1); });
  ov.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; wrSwiped = false; });
  ov.addEventListener('pointerup', e => { if (!down) return; down = false; const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { wrSwiped = true; wrGo(dx < 0 ? 1 : -1); } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { wrSwiped = true; wrClose(); } });
  ov.addEventListener('pointercancel', () => { down = false; });
  document.addEventListener('keydown', e => { if (!wrCur) return; if (e.key === 'Escape') wrClose(); else if (e.key === 'ArrowRight') wrGo(1); else if (e.key === 'ArrowLeft') wrGo(-1); });
})();

/* ---- Karte auf Start (unter der Überschrift, wegwischbar) und Liste in Berichte → Statistik ---- */
function renderWrapCard() {
  const c = $('wrap-card'); if (!c || wrCur) return; const seen = wrSeen(), p = wrPeriods().list.find(x => !seen.includes(x.id)); wrCardP = p || null;
  c.classList.toggle('hidden', !p); if (p) $('wrap-card-s').textContent = wrTitle() + ' · ' + p.label;
}
(() => {
  const c = $('wrap-card'); let sx = 0, id = null, dx = 0, drag = false;
  c.addEventListener('pointerdown', e => { if (e.clientX < 40) return; id = e.pointerId; sx = e.clientX; dx = 0; drag = false; c.style.transition = 'none'; });
  c.addEventListener('pointermove', e => { if (e.pointerId !== id) return; dx = e.clientX - sx; if (!drag && Math.abs(dx) > 10) { drag = true; try { c.setPointerCapture(id); } catch (e) { } } if (drag) { c.style.transform = 'translateX(' + dx + 'px)'; c.style.opacity = String(Math.max(.3, 1 - Math.abs(dx) / 300)); } });
  const end = e => { if (e.pointerId !== id) return; id = null; if (!drag) return; drag = false; c.dataset.swiped = '1'; if (Math.abs(dx) > 90) { wrMarkAll(); c.classList.add('hidden'); } c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  $('wrap-open').addEventListener('click', () => { if (c.dataset.swiped) { delete c.dataset.swiped; return; } if (wrCardP) wrOpen(wrCardP); });
})();
function renderWrapList() {
  const box = $('st-wrap-list'), { list } = wrPeriods(); box.textContent = ''; $('st-wrap-title').textContent = wrTitle(); $('st-wrap-card').classList.toggle('hidden', !list.length);   // ohne fälligen Rückblick bleibt die Karte weg
  list.forEach(p => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'flex min-h-[56px] w-full items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 py-2 text-left';
    b.innerHTML = '<span class="min-w-0"><span class="block text-sm font-semibold">' + esc(p.kind === 'k' ? p.label : 'Rückblick ' + p.label) + '</span><span class="block text-xs text-slate-500 dark:text-slate-400">' + (p.kind === 'k' ? esc(wrDY(p.t0) + ' – ' + wrDY(p.t1)) : 'Zeitraum') + ' · ' + fmt(p.st.km, 0) + ' km</span></span><svg class="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    b.addEventListener('click', () => wrOpen(p)); box.appendChild(b);
  });
}
$('btn-wrap-preview').addEventListener('click', () => {
  const { runStart, runPrev } = wrPeriods(), p = { kind: 't', id: 'preview', preview: true, t0: runStart, t1: Date.now(), label: wrDY(runStart) + ' – heute', prev: runPrev }, st = wrStats(p);
  if (st.n < 1 || !(st.km > 0)) { appNote('Für die Vorschau fehlen im laufenden Zeitraum noch Ladungen mit km-Stand.'); return; }
  p.st = st; showView('dashboard'); wrOpen(p);
});
try { renderWrapCard(); } catch (e) { }

