/* =====================================================================
   Reifen › Historie: Reifensätze mit Bild, was war wann drauf, Profil über die Laufleistung, Rekorde, Wechsel-Protokoll.
   lab.tsets = [{ id, sea: 'so'|'aw'|'wi', name, size?, dot?, buy (JJJJ-MM-TT), buyKm?, price?, mnt (beim Kauf montiert, Standard ja), img? (Version des Bilds),
                  end?: { date, km?, why: 'worn'|'sold'|'gone'|'dmg', mm?, earn? } }]
   lab.tsw   = [{ id, date, km?, ts }]   Reifenwechsel: ab diesem Tag ist Satz ts montiert
   Messungen (lab.tires) gehören zum Satz m.ts, sonst zum Satz derselben Saison, dessen Zeitraum das Messdatum enthält.
   Bild: freigestellt (weißer Rand → transparent), 360 px WebP als Data-URL – je Satz eigenes Dokument settings/timg_<id> (prefs bleibt klein),
   Zwischenspeicher je Gerät `enyaq.timg.<id>` = {v, d}.
   ===================================================================== */
const TS_SEA = { so: ['#fb923c', 'Sommer'], aw: ['#34d399', 'Allwetter'], wi: ['#38bdf8', 'Winter'] };
const TS_WHY = { worn: ['abgefahren', '#f87171'], sold: ['verkauft', '#a78bfa'], gone: ['entsorgt', '#94a3b8'], dmg: ['beschädigt', '#f87171'] };
var tsEdit = null, tswEdit = null, tsImgNew = undefined, tsSlide = 0, tsFetching = {};
const tsAll = () => (getLab().tsets || []).filter(s => s && s.buy).slice().sort((a, b) => a.buy.localeCompare(b.buy));
const tsById = (id) => (getLab().tsets || []).find(s => s.id === id) || null;
const tsT = (iso) => Date.parse(iso + 'T12:00:00');
/** Satz einer Messung */
function tsOf(m) {
  const ss = tsAll(); if (m.ts) { const s = ss.find(x => x.id === m.ts); if (s) return s; }
  return ss.filter(s => s.sea === m.set && s.buy <= m.date && (!s.end || !s.end.date || m.date <= s.end.date)).pop() || null;
}
/** Aktueller (nicht ausgemusterter) Satz einer Saison */
const tsCur = (sea) => tsAll().filter(s => s.sea === sea && !s.end).pop() || null;
/** Saison-Tabs: nur Messungen des aktuellen Satzes (gibt es für die Saison keine Sätze, alle wie bisher) */
function tsKeep(m) { if (!tsAll().some(s => s.sea === m.set)) return true; const c = tsCur(m.set), o = tsOf(m); return !!c && !!o && o.id === c.id; }
const tsMs = (s) => (getLab().tires || []).filter(m => m.date && (tsOf(m) || {}).id === s.id).sort((a, b) => a.date.localeCompare(b.date));
const tsAvgM = (m) => { const v = TIRE_POS.flatMap(p => (m.v && m.v[p]) || []).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const tsOdo = (iso, km) => km > 0 ? km : (() => { try { return odoAt(tsT(iso)); } catch (e) { return null; } })();
const tsKmF = (n) => fmt(Math.round(n), 0) + ' km';
/** Ereignisse: neu montiert, Wechsel, ausgemustert → montierte Zeiträume */
function tsEvents() {
  const ev = [];
  tsAll().forEach(s => { ev.push({ k: 'new', date: s.buy, km: s.buyKm, ts: s.id, mnt: s.mnt !== false });
    if (s.end && s.end.date) ev.push({ k: 'end', date: s.end.date, km: s.end.km, ts: s.id }); });
  (getLab().tsw || []).forEach(w => { if (w.date && tsById(w.ts)) ev.push({ k: 'swap', date: w.date, km: w.km, ts: w.ts, id: w.id }); });
  const ord = { end: 0, new: 1, swap: 2 };
  return ev.sort((a, b) => a.date.localeCompare(b.date) || ord[a.k] - ord[b.k]);
}
function tsPeriods() {
  const ev = tsEvents(), per = []; let cur = null, from = null;
  const close = (e) => { if (cur && from && e.date >= from.date) per.push({ ts: cur, a: from.date, b: e.date, ka: tsOdo(from.date, from.km), kb: tsOdo(e.date, e.km) }); };
  ev.forEach(e => {
    if (e.k === 'end') { if (cur === e.ts) { close(e); cur = null; from = null; } return; }
    if (e.k === 'new' && !e.mnt) return;
    if (cur !== e.ts) { close(e); cur = e.ts; from = e; }
  });
  if (cur) { let kn = null; try { kn = odoNow(); } catch (e) { } const mk = Math.max(0, ...(getLab().tires || []).filter(m => m.km > 0 && (tsOf(m) || {}).id === cur).map(m => m.km)); if (!(kn >= mk)) kn = mk || kn;   // Stand vom Auto, sonst letzte Messung
    per.push({ ts: cur, a: from.date, b: null, ka: tsOdo(from.date, from.km), kb: kn, open: true }); }
  return per;
}
const tsMounted = () => { const p = tsPeriods().filter(x => x.open)[0]; return p ? tsById(p.ts) : null; };
/** Gefahrene km auf dem Satz bis zum Zeitpunkt (Messung mit km-Stand → genau) */
function tsKmAt(s, iso, kmAt) {
  let sum = 0; tsPeriods().filter(p => p.ts === s.id && p.a <= iso).forEach(p => {
    const end = p.b && p.b < iso ? p : null, kb = end ? p.kb : (kmAt > 0 ? kmAt : tsOdo(iso));
    if (p.ka != null && kb != null && kb > p.ka) sum += kb - p.ka; });
  return sum;
}
function tsStats(s) {
  const ms = tsMs(s), pts = ms.map(m => ({ km: tsKmAt(s, m.date, m.km), mm: tsAvgM(m), date: m.date })).filter(p => p.mm != null);
  const per = tsPeriods().filter(p => p.ts === s.id), km = per.reduce((a, p) => a + (p.ka != null && p.kb != null && p.kb > p.ka ? p.kb - p.ka : 0), 0);
  let wear = null; if (pts.length >= 2) { const f = pts[0], l = pts[pts.length - 1]; if (l.km - f.km >= 1000 && f.mm > l.mm) wear = (f.mm - l.mm) / (l.km - f.km) * 1e4; }
  const mmEnd = s.end && s.end.mm != null ? s.end.mm : pts.length ? pts[pts.length - 1].mm : null;
  const cost = s.price > 0 && km >= 2000 ? (s.price - ((s.end && s.end.earn) || 0)) / km * 1000 : null;
  return { ms, pts, km, wear, mmEnd, cost, per };
}
const tsMon = (iso) => new Date(tsT(iso)).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
const tsChip = (t, c) => `<span class="rounded-md px-1.5 py-px text-[10.5px] font-bold" style="background:${c}22;color:${c}">${esc(t)}</span>`;

/* ---- Bild ---- */
function tsImgSrc(s) {
  if (!s.img) return null; let c = null; try { c = load('enyaq.timg.' + s.id, null); } catch (e) { }
  if (c && c.v === s.img && c.d) return c.d;
  if (!tsFetching[s.id] && window.cloud && cloud.getTireImg && cloud.isSignedIn()) { tsFetching[s.id] = 1;
    cloud.getTireImg(s.id).then(d => { if (d && d.d) { try { save('enyaq.timg.' + s.id, { v: d.v || s.img, d: d.d }); } catch (e) { } if (tireSet === 'hist') renderTires(); } }).catch(() => { }); }
  return c && c.d ? c.d : null;
}
/** Reifen-Symbol (ohne Bild): Ring = Restprofil, Farbe = Saison */
function tsTireSvg(size, col, rem, dim) {
  const r = size / 2, c = 2 * Math.PI * (r - 4), f = Math.max(0.02, Math.min(1, rem == null ? 0.6 : rem)); let g = '';
  for (let i = 0; i < 18; i++) { const a = i * Math.PI / 9; g += `<line x1="${(r + (r - 2) * Math.cos(a)).toFixed(1)}" y1="${(r + (r - 2) * Math.sin(a)).toFixed(1)}" x2="${(r + (r - 7) * Math.cos(a)).toFixed(1)}" y2="${(r + (r - 7) * Math.sin(a)).toFixed(1)}" stroke="#0b0f17" stroke-width="2"/>`; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="shrink-0" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="${dim ? '#151b26' : '#1f2937'}"/>${g}<circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${r} ${r})" opacity="${dim ? 0.5 : 1}"/><circle cx="${r}" cy="${r}" r="${(r * 0.46).toFixed(1)}" fill="${dim ? '#232b38' : '#334155'}"/><circle cx="${r}" cy="${r}" r="${(r * 0.1).toFixed(1)}" fill="#64748b"/></svg>`;
}
function tsThumb(s, size, st) {
  const src = tsImgSrc(s), rem = st && st.mmEnd != null ? (st.mmEnd - 1.6) / 6.4 : null;
  return src ? `<img src="${src}" alt="" width="${size}" height="${size}" class="shrink-0 object-contain${s.end ? ' opacity-80' : ''}" style="width:${size}px;height:${size}px" draggable="false">` : tsTireSvg(size, TS_SEA[s.sea][0], rem, !!s.end);
}
/** Bild verkleinern, weißen Hintergrund von den Rändern her entfernen, zuschneiden → WebP-Data-URL */
async function tsPrepImg(file) {
  const bmp = await createImageBitmap(file), M = 360, sc = Math.min(1, M / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc)), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h), d = id.data, seen = new Uint8Array(w * h), q = [];
  const bg = (i) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3]; return a < 20 || (r > 228 && g > 228 && b > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18); };
  for (let x = 0; x < w; x++) { q.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { q.push(y * w, y * w + w - 1); }
  while (q.length) { const i = q.pop(); if (seen[i]) continue; seen[i] = 1; if (!bg(i)) continue; d[i * 4 + 3] = 0; const x = i % w, y = (i / w) | 0;
    if (x > 0) q.push(i - 1); if (x < w - 1) q.push(i + 1); if (y > 0) q.push(i - w); if (y < h - 1) q.push(i + w); }
  let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  cx.putImageData(id, 0, 0); if (x1 < 0) return cv.toDataURL('image/webp', 0.82);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, S = Math.max(cw, ch), o = document.createElement('canvas'); o.width = S; o.height = S;
  o.getContext('2d').drawImage(cv, x0, y0, cw, ch, (S - cw) / 2, (S - ch) / 2, cw, ch);
  let u = o.toDataURL('image/webp', 0.82); if (!u.startsWith('data:image/webp')) u = o.toDataURL('image/png'); return u;
}

/* ---- Wisch-Karten ---- */
const TS_SL = [['tl', 'Zeitstrahl'], ['pf', 'Profil'], ['rk', 'Rekorde'], ['wl', 'Wechsel']];
const tsCard = (title, sub, inner) => `<div class="w-full shrink-0 snap-start snap-always"><div class="h-[268px] overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-sm px-3.5 pb-2.5 pt-3.5"><div class="flex items-baseline justify-between gap-2"><p class="text-sm font-bold">${title}</p><span class="text-[11px] text-slate-500 dark:text-slate-400">${sub}</span></div>${inner}</div></div>`;
function tsTimeline(ss) {
  const per = tsPeriods(); if (!per.length) return tsCard('Was war wann drauf', '', '<p class="mt-3 text-[12px] text-slate-500 dark:text-slate-400 text-left">Noch keine montierten Zeiträume.</p>');
  const rows = ss.filter(s => per.some(p => p.ts === s.id)), now = Date.now(), t0 = Math.min(...per.map(p => tsT(p.a))), span = Math.max(30 * 864e5, now - t0);
  const W = 300, x0 = 4, x1 = W - 4, X = (t) => x0 + (t - t0) / span * (x1 - x0), RH = 46, H = rows.length * RH + 26;
  let g = ''; const y0 = new Date(t0).getFullYear(), yN = new Date(now).getFullYear();
  for (let y = y0 + 1; y <= yN; y++) { const x = X(Date.parse(y + '-01-01T00:00:00')); g += `<line x1="${x.toFixed(1)}" y1="2" x2="${x.toFixed(1)}" y2="${H - 18}" class="stroke-slate-200 dark:stroke-slate-800"/><text x="${x.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10.5" class="fill-slate-400 dark:fill-slate-500">${y}</text>`; }
  rows.forEach((s, i) => { const c = TS_SEA[s.sea][0], y = i * RH + 20;
    g += `<text x="4" y="${y - 6}" font-size="10.5" font-weight="700" fill="${c}">${esc(s.name || TS_SEA[s.sea][1])}</text>`;
    per.filter(p => p.ts === s.id).forEach(p => { const a = X(tsT(p.a)), b = X(p.b ? tsT(p.b) : now), w = Math.max(3, b - a - 1.5), km = p.ka != null && p.kb != null && p.kb > p.ka ? p.kb - p.ka : 0;
      g += `<rect x="${a.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="16" rx="5" fill="${c}" opacity="${p.open ? 1 : 0.8}"><title>${labD(p.a)} – ${p.b ? labD(p.b) : 'heute'}${km ? ' · ' + tsKmF(km) : ''}</title></rect>`;
      if (km && w > 38) g += `<text x="${(a + w / 2).toFixed(1)}" y="${y + 11.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#0b0f17">${fmt(Math.round(km / 100) * 100, 0)}</text>`; }); });
  g += `<line x1="${x1}" y1="0" x2="${x1}" y2="${H - 18}" stroke-dasharray="2 3" class="stroke-slate-500 dark:stroke-slate-300"/>`;
  return tsCard('Was war wann drauf', 'seit ' + tsMon(new Date(t0).toISOString().slice(0, 10)), `<div class="mt-1.5 max-h-[205px] overflow-y-auto"><svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:${H}px">${g}</svg></div><p class="text-[10.5px] text-slate-500 dark:text-slate-400 text-left">Balken = montiert · Zahl = km in dem Zeitraum</p>`);
}
function tsProfile(ss, mountedId) {
  const sr = ss.map(s => ({ s, st: tsStats(s) })).filter(x => x.st.pts.length);
  if (!sr.length) return tsCard('Profil über die Laufleistung', '', '<p class="mt-3 text-[12px] text-slate-500 dark:text-slate-400 text-left">Sobald Messungen zu einem Satz gehören, erscheint hier ihr Verlauf über die km.</p>');
  const mxK = Math.max(10000, ...sr.map(x => Math.max(...x.st.pts.map(p => p.km)))) * 1.08, W = 300, H = 196, X = (k) => 22 + k / mxK * (W - 28);
  const lo = 1.5, hi = Math.max(8.5, ...sr.flatMap(x => x.st.pts.map(p => p.mm))) , Y = (mm) => 10 + (hi - mm) / (hi - lo) * (H - 34);
  let g = '';
  for (let mm = 2; mm <= hi; mm += 2) g += `<line x1="22" y1="${Y(mm).toFixed(1)}" x2="${W - 4}" y2="${Y(mm).toFixed(1)}" class="stroke-slate-200 dark:stroke-slate-800"/><text x="16" y="${(Y(mm) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" class="fill-slate-400 dark:fill-slate-500">${mm}</text>`;
  const step = mxK > 60000 ? 20000 : 10000; for (let k = 0; k <= mxK; k += step) g += `<text x="${X(k).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" class="fill-slate-400 dark:fill-slate-500">${k / 1000}k</text>`;
  [[3, '#fb923c'], [4, '#38bdf8']].forEach(([mm, c]) => { g += `<line x1="22" y1="${Y(mm).toFixed(1)}" x2="${W - 4}" y2="${Y(mm).toFixed(1)}" stroke="${c}" stroke-dasharray="3 3" opacity=".55"/>`; });
  sr.forEach(({ s, st }) => { const c = TS_SEA[s.sea][0], on = s.id === mountedId || (!mountedId && !s.end), op = on ? 1 : 0.7, w = on ? 3 : 1.6;
    if (st.pts.length > 1) g += `<polyline points="${st.pts.map(p => X(p.km).toFixed(1) + ',' + Y(p.mm).toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" opacity="${op}" stroke-linejoin="round"/>`;
    g += st.pts.map(p => `<circle cx="${X(p.km).toFixed(1)}" cy="${Y(p.mm).toFixed(1)}" r="${on ? 3.2 : 2.2}" fill="${c}" opacity="${op}"><title>${esc(s.name || '')} · ${labD(p.date)} · ${tsKmF(p.km)} · ${fmt(p.mm, 1)} mm</title></circle>`).join('');
    if (!s.end && st.wear) { const l = st.pts[st.pts.length - 1], lim = tireLim(s.sea), kL = l.km + (l.mm - lim) / st.wear * 1e4;
      if (kL > l.km) g += `<line x1="${X(l.km).toFixed(1)}" y1="${Y(l.mm).toFixed(1)}" x2="${X(Math.min(kL, mxK)).toFixed(1)}" y2="${Y(kL <= mxK ? lim : l.mm - (mxK - l.km) * st.wear / 1e4).toFixed(1)}" stroke="${c}" stroke-width="2" stroke-dasharray="4 4"/>`; } });
  const leg = sr.slice(-4).map(({ s }) => `<span class="whitespace-nowrap"><span class="inline-block h-[3px] w-2.5 align-middle" style="background:${TS_SEA[s.sea][0]}"></span> ${esc((s.name || TS_SEA[s.sea][1]).split(' ').slice(0, 2).join(' '))}</span>`).join('');
  return tsCard('Profil über die Laufleistung', 'mm · Ø 4 Reifen', `<svg viewBox="0 0 ${W} ${H}" class="mt-1 w-full" style="height:${H}px">${g}</svg><div class="flex gap-2.5 overflow-hidden text-[10.5px] text-slate-500 dark:text-slate-400">${leg}</div>`);
}
function tsRecords(ss) {
  const st = ss.map(s => ({ s, st: tsStats(s) })), short = (s) => esc((s.name || TS_SEA[s.sea][1]).split(' ').slice(0, 2).join(' ')), t = [];
  const best = (arr, f, lo) => arr.reduce((a, x) => a == null || (lo ? f(x) < f(a) : f(x) > f(a)) ? x : a, null);
  const lng = best(st.filter(x => x.st.km > 0), x => x.st.km); if (lng) t.push(['Längste Laufleistung', fmt(Math.round(lng.st.km / 100) * 100, 0), 'km', short(lng.s) + (lng.s.end ? '' : ' (läuft)'), lng.s]);
  const wr = best(st.filter(x => x.st.wear), x => x.st.wear, true); if (wr) t.push(['Geringster Verschleiß', fmt(wr.st.wear, 1), 'mm/10.000 km', short(wr.s) + (wr.s.end ? '' : ' (bisher)'), wr.s]);
  const ch = best(st.filter(x => x.st.cost), x => x.st.cost, true); if (ch) t.push(['Günstigster Satz', fmt(ch.st.cost, 1), '€/1000 km', short(ch.s) + (ch.s.end ? '' : ' (bisher)'), ch.s]);
  const sd = best(st.filter(x => x.s.end && x.s.end.why === 'sold' && x.st.mmEnd != null), x => x.st.mmEnd); if (sd) t.push(['Rest beim Verkauf', fmt(sd.st.mmEnd, 1), 'mm', short(sd.s) + (sd.s.end.earn ? ' · ' + fmt(sd.s.end.earn, 0) + ' €' : ''), sd.s]);
  const tot = st.reduce((a, x) => a + x.st.km, 0);
  const inner = t.length ? `<div class="mt-2.5 grid grid-cols-2 gap-1.5">${t.map(([a, v, u, n, s]) => `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-2.5 text-left"><p class="text-[10.5px] text-slate-500 dark:text-slate-400">🏆 ${a}</p><p class="leading-tight"><span class="font-barlow text-[26px] font-bold">${v}</span> <span class="whitespace-nowrap text-[10.5px] text-slate-500 dark:text-slate-400">${u}</span></p><p class="truncate text-[11px] font-semibold" style="color:${TS_SEA[s.sea][0]}">${n}</p></div>`).join('')}</div>`
    : '<p class="mt-3 text-[12px] text-slate-500 dark:text-slate-400 text-left">Rekorde erscheinen, sobald Sätze km, Messungen und Preise haben.</p>';
  return tsCard('Rekorde', `${ss.length} ${ss.length === 1 ? 'Satz' : 'Sätze'}${tot ? ' · ' + tsKmF(tot) : ''}`, inner);
}
function tsLog() {
  const ev = tsEvents().slice().reverse(), per = tsPeriods(); let prevMounted = {};
  // vorher montierter Satz je Wechsel (für „A → B“)
  per.forEach((p, i) => { if (i > 0) prevMounted[p.a + '|' + p.ts] = per[i - 1].ts; });
  const nm = (id) => { const s = tsById(id); return s ? esc(s.name || TS_SEA[s.sea][1]) : '?'; };
  const rows = ev.map(e => { const s = tsById(e.ts); if (!s) return ''; const c = TS_SEA[s.sea][0], km = tsOdo(e.date, e.km);
    let t = e.k === 'new' ? (e.mnt ? 'Neu montiert: ' : 'Gekauft: ') + nm(e.ts) : e.k === 'end' ? nm(e.ts) + ' ' + (TS_WHY[s.end.why] || TS_WHY.worn)[0] + (s.end.mm != null ? ' (' + fmt(s.end.mm, 1) + ' mm)' : '') : (prevMounted[e.date + '|' + e.ts] ? nm(prevMounted[e.date + '|' + e.ts]) + ' → ' : 'Montiert: ') + nm(e.ts);
    return `<${e.k === 'swap' ? 'button type="button" data-tswe="' + esc(e.id) + '"' : 'div'} class="flex w-full items-start gap-2 py-1.5 text-left text-[12px] leading-snug"><span class="mt-1 h-2 w-2 shrink-0 rounded-full" style="background:${c}"></span><span class="w-[70px] shrink-0 text-slate-500 dark:text-slate-400">${labD(e.date)}</span><span class="min-w-0 flex-1">${t}${km ? ' <span class="text-slate-500 dark:text-slate-400">· ' + tsKmF(km) + '</span>' : ''}</span>${e.k === 'swap' ? '<span class="text-slate-400">›</span>' : ''}</${e.k === 'swap' ? 'button' : 'div'}>`; }).join('');
  return tsCard('Wechsel-Protokoll', ev.length + ' Einträge', `<div class="mt-1 max-h-[218px] overflow-y-auto">${rows || '<p class="mt-2 text-[12px] text-slate-500 dark:text-slate-400">Noch keine Einträge.</p>'}</div>`);
}

/* ---- Seite ---- */
function renderTireHist() {
  const el = $('tire-body'), ss = tsAll(), mo = tsMounted();
  const btn = 'rounded-2xl text-sm font-semibold active:scale-[0.98] transition';
  if (!ss.length) { el.innerHTML = `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-2 text-left"><p class="text-sm font-bold">Reifen-Historie</p><p class="text-sm text-slate-600 dark:text-slate-300">Lege deine Reifensätze an – mit Bild, Kaufdatum, km und Preis. Die App zeigt dann, was wann drauf war, wie schnell jeder Satz abnutzt und welcher am längsten hielt. Messungen der Saison-Tabs werden dem Satz nach Datum zugeordnet.</p></div>
    <button type="button" data-tsnew class="h-12 w-full ${btn} border border-dashed border-emerald-500/60 text-emerald-600 dark:text-emerald-400">+ Neuer Reifensatz</button>`; return; }
  let h = '';
  if (mo) { const st = tsStats(mo), c = TS_SEA[mo.sea][0], p = tsPeriods().find(x => x.open), last = st.ms[st.ms.length - 1];
    let fcT = ''; try { const fc = tireForecast(tireList(mo.sea), mo.sea); if (fc && fc.w && fc.w.date) fcT = 'neue Reifen ca. ' + tSeason(fc.w.date) + ' ›'; } catch (e) { }
    h += `<p class="px-1 text-[11px] font-bold tracking-[0.08em] text-emerald-600 dark:text-emerald-400 text-left">MONTIERT</p>
      <button type="button" data-tsed="${esc(mo.id)}" class="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-800 to-slate-900 p-3.5 text-left text-white shadow-sm active:scale-[0.99] transition">${tsThumb(mo, 84, st)}
        <div class="min-w-0 flex-1"><div class="flex flex-wrap gap-1">${tsChip(TS_SEA[mo.sea][1], c)}${tsChip('seit ' + tsMon(p.a), '#e2e8f0')}</div>
        <p class="mt-1 text-[15px] font-bold leading-tight">${esc(mo.name || TS_SEA[mo.sea][1] + 'reifen')}</p>${mo.size || mo.dot ? `<p class="text-[11.5px] text-emerald-100/80">${esc([mo.size, mo.dot ? 'DOT ' + mo.dot : ''].filter(Boolean).join(' · '))}</p>` : ''}
        <p class="mt-1 text-[12.5px]"><b>${tsKmF(st.km)}</b>${last ? ' · Ø <b>' + fmt(tsAvgM(last), 1) + ' mm</b>' : ''}</p>${fcT ? `<p class="text-[11.5px] text-emerald-100/80" data-tsgo="${mo.sea}">${fcT}</p>` : ''}</div></button>`; }
  const sl = [tsTimeline(ss), tsProfile(ss, mo && mo.id), tsRecords(ss), tsLog()];
  h += `<div class="flex gap-1.5 px-0.5 text-[11.5px] font-semibold" id="ts-chips">${TS_SL.map(([k, n], i) => `<button type="button" data-tsl="${i}" class="rounded-lg px-2.5 py-1 ${i === tsSlide ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400'}">${n}</button>`).join('')}</div>
    <div id="ts-swipe" class="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none]">${sl.join('')}</div>
    <div id="ts-dots" class="flex justify-center gap-1.5">${sl.map((_, i) => `<span class="h-1.5 rounded-full transition-all ${i === tsSlide ? 'w-4 bg-slate-500 dark:bg-slate-300' : 'w-1.5 bg-slate-300 dark:bg-slate-700'}"></span>`).join('')}</div>`;
  const others = ss.filter(s => !mo || s.id !== mo.id).sort((a, b) => (!!a.end - !!b.end) || ((b.end && b.end.date) || b.buy).localeCompare((a.end && a.end.date) || a.buy));
  if (others.length) { const tot = others.reduce((a, s) => a + tsStats(s).km, 0);
    h += `<div class="flex items-baseline justify-between px-1 pt-1"><p class="text-[11px] font-bold tracking-[0.08em] text-slate-500 dark:text-slate-400">WEITERE SÄTZE</p><span class="text-[11px] text-slate-400 dark:text-slate-500">${tot ? tsKmF(tot) : ''}</span></div>`
      + others.map(s => { const st = tsStats(s), c = TS_SEA[s.sea][0], w = s.end ? TS_WHY[s.end.why] || TS_WHY.worn : ['eingelagert', '#94a3b8'];
        return `<button type="button" data-tsed="${esc(s.id)}" class="flex w-full items-center gap-3 rounded-3xl bg-white dark:bg-slate-900 p-3 text-left shadow-sm active:scale-[0.99] transition">${tsThumb(s, 56, st)}
          <div class="min-w-0 flex-1"><div class="flex flex-wrap gap-1">${tsChip(TS_SEA[s.sea][1], c)}${tsChip(w[0], w[1])}</div><p class="mt-1 truncate text-[13.5px] font-semibold">${esc(s.name || TS_SEA[s.sea][1] + 'reifen')}</p>
          <p class="mt-0.5 flex gap-2.5 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400"><span>${tsMon(s.buy)}${s.end ? '–' + tsMon(s.end.date) : ''}</span>${st.km ? `<b class="text-slate-800 dark:text-slate-100">${tsKmF(st.km)}</b>` : ''}${st.cost ? `<span>${fmt(st.cost, 2)} €/1.000</span>` : st.mmEnd != null ? `<span>${fmt(st.mmEnd, 1)} mm</span>` : ''}</p></div><span class="text-lg text-slate-400">›</span></button>`; }).join(''); }
  h += `<div class="grid grid-cols-2 gap-2"><button type="button" data-tsnew class="h-11 ${btn} border border-dashed border-emerald-500/60 text-emerald-600 dark:text-emerald-400">+ Neuer Reifensatz</button><button type="button" data-tswnew class="h-11 ${btn} bg-white dark:bg-slate-900 shadow-sm">⇄ Reifenwechsel</button></div>`;
  el.innerHTML = h;
  const sc = $('ts-swipe'); if (sc) { const card = () => (sc.firstElementChild ? sc.firstElementChild.offsetWidth + 12 : sc.clientWidth);
    requestAnimationFrame(() => { sc.style.scrollBehavior = 'auto'; sc.scrollLeft = tsSlide * card(); sc.style.scrollBehavior = ''; });
    sc.addEventListener('scroll', () => { const i = Math.max(0, Math.min(3, Math.round(sc.scrollLeft / card()))); if (i === tsSlide) return; tsSlide = i;
      document.querySelectorAll('#ts-dots span').forEach((d, j) => { d.className = 'h-1.5 rounded-full transition-all ' + (j === i ? 'w-4 bg-slate-500 dark:bg-slate-300' : 'w-1.5 bg-slate-300 dark:bg-slate-700'); });
      document.querySelectorAll('#ts-chips [data-tsl]').forEach((b, j) => { b.className = 'rounded-lg px-2.5 py-1 ' + (j === i ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400'); }); }, { passive: true }); }
}

/* ---- Bearbeiten: Satz ---- */
function tsSheet() { let s = $('ts-sheet'); if (!s) { s = document.createElement('div'); s.id = 'ts-sheet'; s.className = 'hidden fixed inset-0 z-50 bg-black/60 flex items-end justify-center'; s.innerHTML = `<div id="ts-sheet-box" class="${sheetBox}"></div>`; document.body.appendChild(s); s.addEventListener('click', tsSheetClick); s.addEventListener('change', tsSheetChange); } return s; }
function openTsSheet(id, sea0) {
  const s = id ? tsById(id) : null; tsEdit = s ? s.id : null; tsImgNew = undefined; const km0 = (() => { try { return lastKnownKm(); } catch (_) { return null; } })();
  const sea = s ? s.sea : sea0 || (tireSet && TS_SEA[tireSet] ? tireSet : (tsMounted() || {}).sea || 'aw');
  const first = !s && !tsAll().some(x => x.sea === sea) ? (getLab().tires || []).filter(m => m.set === sea && m.date).map(m => m.date).sort()[0] : null;
  const st = s ? tsStats(s) : null, e = (s && s.end) || null, src = s ? tsImgSrc(s) : null;
  const segB = (k) => `<button type="button" data-tssea="${k}" class="flex-1 rounded-lg py-1.5 font-medium ${k === sea ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${TS_SEA[k][1]}</button>`;
  const dIn = (id2, lab, v) => `<div class="min-w-0"><label for="${id2}" class="text-xs text-slate-500 dark:text-slate-400">${lab}</label><input id="${id2}" type="date" value="${esc(v || '')}" class="${inCls} !px-1.5 text-[13px]"></div>`;
  const kmB = (f) => `<button type="button" data-kmfetch data-kmfor="${f}" title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf ml-1 align-middle relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition">↻</button>`;
  const kmF = (f, lab, v) => fld(f, lab, v, '', 'numeric').replace('>' + lab + '</label>', '>' + lab + '</label>' + kmB(f));
  tsSheet(); $('ts-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${s ? 'Reifensatz' : 'Neuer Reifensatz'}</p>
    <div class="flex items-center gap-3"><div id="ts-img-prev" class="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">${src ? `<img src="${src}" alt="" class="h-[80px] w-[80px] object-contain">` : tsTireSvg(72, TS_SEA[sea][0], null, false)}</div>
      <div class="min-w-0 flex-1 space-y-1.5 text-left"><label class="inline-flex h-9 cursor-pointer items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-3 text-[13px] font-semibold">📷 Bild wählen<input id="ts-img" type="file" accept="image/*" class="hidden"></label>
        ${src ? '<button type="button" data-tsa="imgdel" class="ml-1 text-[12px] font-semibold text-red-600 dark:text-red-400">Entfernen</button>' : ''}<p class="text-[11px] text-slate-500 dark:text-slate-400">z. B. Produktbild vom Hersteller – weißer Hintergrund wird entfernt, in der Cloud gespeichert.</p></div></div>
    <div id="ts-sea" class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-[13px]">${['so', 'aw', 'wi'].map(segB).join('')}</div>
    <div><label for="ts-name" class="text-xs text-slate-500 dark:text-slate-400">Reifen (Hersteller + Modell)</label><input id="ts-name" type="text" maxlength="60" value="${esc((s && s.name) || '')}" placeholder="z. B. Michelin Primacy 4+" class="${inCls}"></div>
    <div class="grid grid-cols-[1.4fr_1fr] gap-2"><div class="min-w-0"><label for="ts-size" class="text-xs text-slate-500 dark:text-slate-400">Größe</label><input id="ts-size" type="text" maxlength="24" value="${esc((s && s.size) || '')}" placeholder="235/50 R20" class="${inCls}"></div><div class="min-w-0"><label for="ts-dot" class="text-xs text-slate-500 dark:text-slate-400">DOT (WWJJ)</label><input id="ts-dot" type="text" inputmode="numeric" maxlength="4" value="${esc((s && s.dot) || '')}" placeholder="1226" class="${inCls}"></div></div>
    <div class="grid grid-cols-[1.35fr_1fr] gap-2">${dIn('ts-buy', 'Gekauft / montiert am', s ? s.buy : first || wxIso(new Date()))}${kmF('ts-buykm', 'km-Stand', s ? s.buyKm : (first ? '' : km0 || ''))}</div>
    <div class="grid grid-cols-2 gap-2">${fld('ts-price', 'Preis Satz (€)', s ? s.price : '', 'z. B. 780')}<label class="flex items-end gap-2 pb-3 text-[13px]"><input id="ts-mnt" type="checkbox" class="h-5 w-5 accent-emerald-600"${!s || s.mnt !== false ? ' checked' : ''}> beim Kauf montiert</label></div>
    <details class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2"${e ? ' open' : ''}><summary class="cursor-pointer text-sm font-semibold">Satz ausgemustert${e ? ' · ' + (TS_WHY[e.why] || TS_WHY.worn)[0] : ''}</summary>
      <div class="mt-2 space-y-2"><div class="grid grid-cols-[1.35fr_1fr] gap-2">${dIn('ts-end', 'Am', e ? e.date : '')}${kmF('ts-endkm', 'km-Stand', e ? e.km : '')}</div>
      <div class="grid grid-cols-2 gap-2"><div class="min-w-0"><label for="ts-why" class="text-xs text-slate-500 dark:text-slate-400">Grund</label><select id="ts-why" class="${inCls}">${Object.entries(TS_WHY).map(([k, [n]]) => `<option value="${k}"${e && e.why === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>${fld('ts-mm', 'Restprofil (mm)', e && e.mm != null ? e.mm : '', st && st.mmEnd != null ? fmt(st.mmEnd, 1) : '')}</div>
      ${fld('ts-earn', 'Erlös beim Verkauf (€)', e && e.earn ? e.earn : '', 'optional')}${e ? '<button type="button" data-tsa="unend" class="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Doch wieder in Gebrauch</button>' : ''}</div></details>
    ${st && st.ms.length ? `<p class="text-[12px] text-slate-500 dark:text-slate-400 text-left">${st.ms.length} ${st.ms.length === 1 ? 'Messung' : 'Messungen'} (${labD(st.ms[0].date)} – ${labD(st.ms[st.ms.length - 1].date)})${st.km ? ' · ' + tsKmF(st.km) + ' gefahren' : ''}${st.wear ? ' · ' + fmt(st.wear, 1) + ' mm/10.000 km' : ''}</p>` : ''}
    <p id="ts-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-tsa="${s ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${s ? 'text-red-600 dark:text-red-400' : ''}">${s ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-tsa="save" class="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white">Speichern</button></div>`;
  $('ts-sheet').classList.remove('hidden');
}
async function tsSheetChange(e) {
  if (e.target.id !== 'ts-img' || !e.target.files || !e.target.files[0]) return;
  const box = $('ts-img-prev'); box.innerHTML = '<span class="text-[11px] text-slate-500">…</span>';
  try { tsImgNew = await tsPrepImg(e.target.files[0]); box.innerHTML = `<img src="${tsImgNew}" alt="" class="h-[80px] w-[80px] object-contain">`; }
  catch (err) { tsImgNew = undefined; box.innerHTML = ''; appNote('Bild konnte nicht gelesen werden'); }
}
const tsNum = (id) => { const el = $(id); if (!el) return undefined; const v = deDec(String(el.value).replace(/\.(?=\d{3}\b)/g, '')); return Number.isFinite(v) ? v : undefined; };
async function tsSheetClick(e) {
  const sh = $('ts-sheet'); if (e.target === sh) { sh.classList.add('hidden'); return; }
  const sb = e.target.closest('[data-tssea]'); if (sb) { sb.parentElement.querySelectorAll('[data-tssea]').forEach(x => { const on = x === sb; x.className = 'flex-1 rounded-lg py-1.5 font-medium ' + (on ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'); }); return; }
  const b = e.target.closest('[data-tsa]'); if (!b) return; const act = b.dataset.tsa, lab = getLab(); lab.tsets = lab.tsets || [];
  if (act === 'close') { sh.classList.add('hidden'); return; }
  if (act === 'imgdel') { tsImgNew = null; $('ts-img-prev').innerHTML = ''; b.remove(); return; }
  if (act === 'unend') { ['ts-end', 'ts-endkm', 'ts-mm', 'ts-earn'].forEach(i => { if ($(i)) $(i).value = ''; }); b.closest('details').open = false; return; }
  if (act === 'del') { const s = tsById(tsEdit); if (!s) return; if (!(await ask(`„${s.name || 'Satz'}“ mit Bild löschen? Messungen bleiben erhalten.`, { title: 'Reifensatz löschen', ok: 'Löschen', danger: true }))) return;
    lab.tsets = lab.tsets.filter(x => x.id !== s.id); lab.tsw = (lab.tsw || []).filter(w => w.ts !== s.id); lab.tires = (lab.tires || []).map(m => m.ts === s.id ? (({ ts, ...r }) => r)(m) : m); setLab(lab);
    try { localStorage.removeItem('enyaq.timg.' + s.id); } catch (err) { } try { if (window.cloud && cloud.delTireImg) cloud.delTireImg(s.id); } catch (err) { }
    sh.classList.add('hidden'); renderTires(); return; }
  const name = $('ts-name').value.trim(), buy = $('ts-buy').value, sea = (document.querySelector('#ts-sea .bg-white') || {}).dataset?.tssea || 'aw';
  if (!buy) { $('ts-msg').textContent = 'Bitte das Kauf-/Montagedatum eintragen.'; return; }
  const old = tsEdit ? tsById(tsEdit) : null, s = { id: tsEdit || labId(), sea, name, buy, mnt: $('ts-mnt').checked };
  const size = $('ts-size').value.trim(), dot = $('ts-dot').value.trim(), buyKm = tsNum('ts-buykm'), price = tsNum('ts-price');
  if (size) s.size = size; if (dot) s.dot = dot; if (buyKm > 0) s.buyKm = Math.round(buyKm); if (price > 0) s.price = Math.round(price * 100) / 100;
  const end = $('ts-end').value; if (end) { if (end < buy) { $('ts-msg').textContent = 'Das Ausmusterungs-Datum liegt vor dem Kauf.'; return; }
    s.end = { date: end, why: $('ts-why').value || 'worn' }; const ek = tsNum('ts-endkm'), mm = tsNum('ts-mm'), earn = tsNum('ts-earn');
    if (ek > 0) s.end.km = Math.round(ek); if (mm >= 0 && mm <= 15) s.end.mm = Math.round(mm * 10) / 10; if (earn > 0) s.end.earn = Math.round(earn * 100) / 100; }
  if (old && old.img && tsImgNew !== null) s.img = old.img;
  if (tsImgNew) { s.img = Date.now(); try { save('enyaq.timg.' + s.id, { v: s.img, d: tsImgNew }); } catch (err) { }
    try { if (window.cloud && cloud.setTireImg && cloud.isSignedIn()) await cloud.setTireImg(s.id, { v: s.img, d: tsImgNew }); else appNote('Bild nur auf diesem Gerät – zum Hochladen anmelden'); } catch (err) { appNote('Bild konnte nicht hochgeladen werden – nur auf diesem Gerät gespeichert'); } }
  if (tsImgNew === null && old && old.img) { try { localStorage.removeItem('enyaq.timg.' + s.id); } catch (err) { } try { if (window.cloud && cloud.delTireImg) cloud.delTireImg(s.id); } catch (err) { } }
  /* neuer Satz derselben Saison: bisherigen aktiven Satz automatisch ausmustern (abgefahren, Restprofil aus der letzten Messung) */
  let note = '';
  if (!old) { const prev = lab.tsets.filter(x => x.sea === sea && !x.end && x.buy <= buy).sort((a, b) => a.buy.localeCompare(b.buy)).pop();
    if (prev && await ask(`„${prev.name || TS_SEA[sea][1] + 'reifen'}“ ab ${labD(buy)} als ausgemustert eintragen?`, { title: 'Alter Satz', ok: 'Ja, ausmustern', cancel: 'Nein' })) {
      const pst = tsStats(prev); prev.end = { date: buy, why: 'worn' }; if (s.buyKm) prev.end.km = s.buyKm; if (pst.mmEnd != null) prev.end.mm = Math.round(pst.mmEnd * 10) / 10; note = ' · alter Satz ausgemustert'; } }
  lab.tsets = old ? lab.tsets.map(x => x.id === s.id ? s : x) : lab.tsets.concat(s);
  setLab(lab); sh.classList.add('hidden'); tireSet = 'hist'; renderTires(); appNote('Reifensatz gespeichert' + note);
}

/* ---- Bearbeiten: Reifenwechsel ---- */
function openTswSheet(id) {
  const w = id ? (getLab().tsw || []).find(x => x.id === id) : null; tswEdit = w ? w.id : null; const mo = tsMounted();
  const act = tsAll().filter(s => !s.end || (w && s.id === w.ts)), def = w ? w.ts : (act.find(s => !mo || s.id !== mo.id) || act[0] || {}).id;
  if (!act.length) { appNote('Erst einen Reifensatz anlegen'); return; }
  const km0 = (() => { try { return lastKnownKm(); } catch (_) { return null; } })();
  tsSheet(); $('ts-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${w ? 'Reifenwechsel' : '⇄ Reifenwechsel eintragen'}</p>
    <div class="space-y-1.5" id="tsw-pick">${act.map(s => `<button type="button" data-tswp="${esc(s.id)}" class="flex w-full items-center gap-3 rounded-2xl border-2 p-2 text-left ${s.id === def ? 'border-emerald-500' : 'border-transparent bg-slate-100 dark:bg-slate-800'}">${tsThumb(s, 40)}<span class="min-w-0 flex-1"><span class="block truncate text-[13.5px] font-semibold">${esc(s.name || TS_SEA[s.sea][1] + 'reifen')}</span><span class="text-[11px]" style="color:${TS_SEA[s.sea][0]}">${TS_SEA[s.sea][1]}${mo && mo.id === s.id ? ' · gerade montiert' : ''}</span></span></button>`).join('')}</div>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 text-left">Welcher Satz ist ab dem Tag drauf?</p>
    <div class="grid grid-cols-[1.35fr_1fr] gap-2"><div class="min-w-0"><label for="tsw-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="tsw-date" type="date" value="${esc(w ? w.date : wxIso(new Date()))}" class="${inCls} !px-1.5 text-[13px]"></div>${fld('tsw-km', 'km-Stand', w ? w.km : (km0 || ''), '', 'numeric').replace('>km-Stand</label>', '>km-Stand</label><button type="button" data-kmfetch data-kmfor="tsw-km" title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf ml-1 align-middle relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition">↻</button>')}</div>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-tswa="${w ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${w ? 'text-red-600 dark:text-red-400' : ''}">${w ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-tswa="save" class="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white">Speichern</button></div>`;
  $('ts-sheet').classList.remove('hidden');
}
document.addEventListener('click', (e) => {
  const p = e.target.closest('#ts-sheet [data-tswp]'); if (p) { document.querySelectorAll('#tsw-pick [data-tswp]').forEach(x => { const on = x === p; x.classList.toggle('border-emerald-500', on); x.classList.toggle('border-transparent', !on); x.classList.toggle('bg-slate-100', !on); x.classList.toggle('dark:bg-slate-800', !on); }); return; }
  const a = e.target.closest('#ts-sheet [data-tswa]'); if (!a) return; const act = a.dataset.tswa, lab = getLab(); lab.tsw = lab.tsw || [];
  if (act === 'close') { $('ts-sheet').classList.add('hidden'); return; }
  if (act === 'del') { const snap = labSnap(); lab.tsw = lab.tsw.filter(x => x.id !== tswEdit); setLab(lab); $('ts-sheet').classList.add('hidden'); renderTires(); labUndo('Reifenwechsel gelöscht', snap); return; }
  const sel = document.querySelector('#tsw-pick .border-emerald-500'), date = $('tsw-date').value; if (!sel || !date) return;
  const w = { id: tswEdit || labId(), date, ts: sel.dataset.tswp }, km = tsNum('tsw-km'); if (km > 0) w.km = Math.round(km);
  lab.tsw = tswEdit ? lab.tsw.map(x => x.id === w.id ? w : x) : lab.tsw.concat(w); setLab(lab); $('ts-sheet').classList.add('hidden'); renderTires(); appNote('Reifenwechsel gespeichert');
});
$('tire-body').addEventListener('click', (e) => {
  if (tireSet !== 'hist') return;
  const g = e.target.closest('[data-tsgo]'); if (g) { e.stopPropagation(); tireSet = g.dataset.tsgo; renderTires(); return; }
  const ed = e.target.closest('[data-tsed]'); if (ed) { openTsSheet(ed.dataset.tsed); return; }
  if (e.target.closest('[data-tsnew]')) { openTsSheet(null); return; }
  if (e.target.closest('[data-tswnew]')) { openTswSheet(null); return; }
  const we = e.target.closest('[data-tswe]'); if (we) { openTswSheet(we.dataset.tswe); return; }
  const c = e.target.closest('[data-tsl]'); if (c) { tsSlide = +c.dataset.tsl; const sc = $('ts-swipe'); if (sc && sc.firstElementChild) sc.scrollTo({ left: tsSlide * (sc.firstElementChild.offsetWidth + 12), behavior: 'smooth' }); }
});
