/* =====================================================================
   Labor: DC-Ladekurven (Berichte → Akku) und Verbrauchsrekorde (eigene Seite „Rekorde“).
   Speicher enyaq.lab = { curves: [{ id, name, date, s0, s1, kwh, min, maxKw, avgKw?, hi100?, tStart?, tEnd?, tOut?, loss?, pts?: { '10': kW, … }, files? }],
                          recs: [{ id, route, date, km?, k100, tOut?, tBat?, v?, cond?: [..], note? }], speeds: [{ id, season, klima, note?, tOut?, rows: [{ v, k }] }] }
   Synchronisiert über das Einstellungs-Dokument (prefs.lab) und in der Sicherung enthalten. Ohne eigene Daten gilt LAB_DEF (Sommerkurve 21.08.2026, Tempomat-Messreihe).
   ===================================================================== */
const KEY_LAB = 'enyaq.lab';
const LAB_DEF = {
  curves: [{ id: 'c1', name: 'Sommer', date: '2026-08-21', s0: 5, s1: 80, kwh: 37.17, min: 33, maxKw: 106.2, avgKw: 66.7, hi100: 25, tStart: 23, tEnd: 42, tOut: 20, loss: 5,
    pts: { 10: 101, 20: 102, 30: 94, 40: 83, 50: 74, 60: 66, 70: 58, 80: 55, 81: 40, 90: 30, 95: 27, 100: 22 }, tail: [{ a: 80, b: 90, min: 10 }, { a: 90, b: 100, min: 13 }] }],
  recs: [], speeds: [{ id: 's1', season: 'Sommer', klima: 'an', note: 'eben', rows: [{ v: 90, k: 13 }, { v: 100, k: 15 }, { v: 110, k: 17 }, { v: 120, k: 18.5 }, { v: 130, k: 21 }] }] };
const cvMig = (c) => c && c.id === 'c1' && c.date === '2026-08-21' && c.s1 === 80 && !c.tail ? { ...c, tail: LAB_DEF.curves[0].tail, pts: { ...LAB_DEF.curves[0].pts, ...(c.pts || {}) } } : c;   // 80→100 % nachgetragen (10 + 13 min)
function getLab() { const o = load(KEY_LAB, null); return { curves: o && Array.isArray(o.curves) ? o.curves.map(cvMig) : LAB_DEF.curves.slice(), recs: o && Array.isArray(o.recs) ? o.recs : [], routes: o && o.routes && typeof o.routes === 'object' && !Array.isArray(o.routes) ? o.routes : {}, lt: o && Array.isArray(o.lt) ? o.lt : [], bt: o && Array.isArray(o.bt) ? o.bt : [], tires: o && Array.isArray(o.tires) ? o.tires : [], wish: o && Array.isArray(o.wish) ? o.wish : [], fc: o && Array.isArray(o.fc) ? o.fc : [], odo: o && Array.isArray(o.odo) ? o.odo : [], speeds: o && Array.isArray(o.speeds) ? o.speeds : o && o.speed && Array.isArray(o.speed.rows) ? [{ id: 's1', season: 'Sommer', klima: 'an', note: 'eben', rows: o.speed.rows }] : JSON.parse(JSON.stringify(LAB_DEF.speeds)) }; }
const recKey = (r) => String(r || '').trim().toLowerCase();
/* Zusammenführen statt Überschreiben: jedes Element (Kurve, Rekord, Messreihe, Strecke) trägt u = letzte Änderung (ms),
   Löschungen stehen in del { id: ms }. So gewinnt beim Abgleich zwischen Geräten/Cloud immer der neueste Stand je Element. */
const LAB_LISTS = ['curves', 'recs', 'speeds', 'lt', 'bt', 'tires', 'wish', 'fc', 'odo'];
function labStamp(o) {
  const prev = load(KEY_LAB, null) || {}, now = Date.now(), del = { ...(prev.del || {}) };
  LAB_LISTS.forEach(k => { const pm = new Map((prev[k] || []).map(x => [String(x.id), x])), ids = new Set();
    o[k] = (o[k] || []).map(x => { ids.add(String(x.id)); const old = pm.get(String(x.id)), a = { ...x }; delete a.u; const b = old ? { ...old } : null; if (b) delete b.u;
      return !old || JSON.stringify(a) !== JSON.stringify(b) ? { ...a, u: now } : { ...a, u: old.u || 0 }; });
    pm.forEach((x, id) => { if (!ids.has(id)) del[id] = now; }); });
  const pr = prev.routes || {}, nr = {}; Object.entries(o.routes || {}).forEach(([k, v]) => { const a = { ...v }; delete a.u; const b = pr[k] ? { ...pr[k] } : null; if (b) delete b.u; nr[k] = !b || JSON.stringify(a) !== JSON.stringify(b) ? { ...a, u: now } : { ...a, u: pr[k].u || 0 }; });
  Object.keys(pr).forEach(k => { if (!nr[k]) del['r_' + k] = now; });
  const cut = now - 400 * 864e5; Object.keys(del).forEach(k => { if (del[k] < cut) delete del[k]; });
  return { ...o, routes: nr, del };
}
function labMerge(a, b) {
  if (!a) return b; if (!b) return a;
  const del = { ...(a.del || {}) }; Object.entries(b.del || {}).forEach(([k, t]) => { if (!(del[k] >= t)) del[k] = t; });
  const out = { del };
  LAB_LISTS.forEach(k => { const m = new Map(); [a[k] || [], b[k] || []].forEach(l => l.forEach(x => { const id = String(x.id), c = m.get(id); if (!c || (x.u || 0) > (c.u || 0)) m.set(id, x); }));
    out[k] = [...m.values()].filter(x => !(del[String(x.id)] >= (x.u || 0))); });
  const ra = a.routes || {}, rb = b.routes || {}; out.routes = {};
  new Set(Object.keys(ra).concat(Object.keys(rb))).forEach(k => { const x = ra[k], y = rb[k], w = !x ? y : !y ? x : (y.u || 0) > (x.u || 0) ? y : x; if (!(del['r_' + k] >= (w.u || 0))) out.routes[k] = w; });
  if (!a.speeds && !b.speeds && (a.speed || b.speed)) out.speed = a.speed || b.speed;
  return out;
}
const labCanon = (o) => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((r, x) => (r[x] = v[x], r), {}) : v);
function setLab(o) { save(KEY_LAB, JSON.parse(JSON.stringify(labStamp(o)))); try { pushPrefs(); } catch (e) { } try { pushRoutes(); } catch (e) { } try { renderCurve(); } catch (e) { } if (currentView === 'recs') renderRecs(); if (currentView === 'tires') renderTires(); if (currentView === 'wish') renderWish(); }
const labId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const deDec = (v) => { const t = String(v == null ? '' : v).trim().replace('−', '-').replace(',', '.'); return t === '' ? undefined : Number(t); };
const labD = (iso) => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const sheetBox = 'w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-4 pt-2.5 pb-5 space-y-3';
const inCls = 'mt-1 w-full min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500';
const fld = (id, label, val, ph, mode = 'decimal') => `<div class="min-w-0"><label for="${id}" class="text-xs text-slate-500 dark:text-slate-400">${label}</label><input id="${id}" type="text" inputmode="${mode}" autocomplete="off" value="${val == null ? '' : esc(String(val).replace('.', ','))}" placeholder="${ph || ''}" class="${inCls}"></div>`;

/* ---- DC-Ladekurve ---- */
let cvSel = null;
function cvPow(c, p) {                                                          // kW bei Ladestand p (lineare Interpolation der Stützpunkte; ohne Punkte: Ø-Leistung)
  const P = Object.entries(c.pts || {}).map(([k, v]) => [Number(k), Number(v)]).filter(x => x[1] > 0).sort((a, b) => a[0] - b[0]);
  const sg = p > c.s1 && (c.tail || []).find(t => p >= t.a && p <= t.b && t.min > 0);
  if (sg && !P.some(x => x[0] > c.s1)) return c.kwh / (c.s1 - c.s0) * (sg.b - sg.a) / (sg.min / 60);
  if (!P.length) return c.avgKw || (c.kwh && c.min ? c.kwh / (c.min / 60) : 50);
  if (p <= P[0][0]) return P[0][1]; if (p >= P[P.length - 1][0]) return P[P.length - 1][1];
  for (let i = 0; i < P.length - 1; i++) if (p <= P[i + 1][0]) return P[i][1] + (P[i + 1][1] - P[i][1]) * (p - P[i][0]) / (P[i + 1][0] - P[i][0]);
  return P[P.length - 1][1];
}
function cvMinutes(c, a, b) {                                                   // Ladezeit von a bis b %, auf die gemessene Dauer der Kurve geeicht
  const per = c.kwh / (c.s1 - c.s0), raw = (x, y) => { let m = 0; for (let p = x; p < y; p += 0.5) m += per * 0.5 / cvPow(c, p + 0.25) * 60; return m; };
  const k = c.min > 0 ? c.min / raw(c.s0, c.s1) : 1; let m = 0;
  for (let p = a; p < b; p += 0.5) {                                            // über das Ende hinaus: je Abschnitt auf die gemessene Zeit geeicht
    const sg = p >= c.s1 && (c.tail || []).find(t => p >= t.a && p < t.b && t.min > 0);
    m += sg ? sg.min * raw(p, p + 0.5) / raw(sg.a, sg.b) : raw(p, p + 0.5) * k;
  }
  return m;
}
/** Software-Stand einer Ladekurve (letztes Update vor ihrem Datum) als kleiner Zusatz am Chip, z. B. „· 3.7.1“ – vor/nach einem Update vergleichbar */
function cvUpTag(c) { try { const l = upList(); if (l.length < 2 || !c.date) return ''; const u = l.filter(x => x.inst <= c.date).pop(); return u ? ` <span class="opacity-70">· 📡 ${esc(u.ver || '')}</span>` : ''; } catch (e) { return ''; } }
function renderCurve() {
  const el = $('cv-body'); if (!el) return;
  const lab = getLab(), cs = lab.curves.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!cs.length) { el.innerHTML = '<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine Ladekurve erfasst. Nach der nächsten Schnellladung die Werte der Säule eintragen.</p><button type="button" data-cvact="new" class="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold">+ Kurve hinzufügen</button>'; $('cv-hdate').textContent = ''; return; }
  if (!cs.some(c => c.id === cvSel)) cvSel = cs[cs.length - 1].id;
  const c = cs.find(x => x.id === cvSel), others = cs.filter(x => x !== c);
  const COL = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399'], col = (x) => COL[cs.indexOf(x) % COL.length];
  const chips = `<div class="mt-2 flex flex-wrap gap-1.5">${cs.map(x => `<button type="button" data-cv="${esc(x.id)}" class="inline-flex h-[30px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${x === c ? '' : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}"${x === c ? ` style="background:${col(x)}26;color:${col(x)}"` : ''}><span class="h-[3px] w-2.5 rounded" style="background:${col(x)}"></span>${esc(x.name || 'Kurve')} · ${String(x.date || '').slice(5, 7)}/${String(x.date || '').slice(0, 4)}${cvUpTag(x)}</button>`).join('')}<button type="button" data-cvact="new" class="inline-flex h-[30px] items-center rounded-full border border-dashed border-slate-400 dark:border-slate-600 px-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">+ Kurve hinzufügen</button></div>`;
  const W = 320, H = 170, L = 34, R = 8, T = 14, B = 26, X = (p) => L + p / 100 * (W - L - R), Y = (kw) => T + (1 - Math.min(150, kw) / 150) * (H - T - B);
  const cvEnd = (x) => Math.max(x.s1, ...(x.tail || []).filter(t => t.min > 0).map(t => t.b));
  const path = (x, from = x.s0, to = cvEnd(x)) => { let d = ''; for (let p = from; p <= to + 0.01; p += 0.5) d += (d ? ' L' : 'M') + X(p).toFixed(1) + ' ' + Y(cvPow(x, p)).toFixed(1); return d; };
  const avg = c.avgKw || (c.kwh && c.min ? c.kwh / (c.min / 60) : null);
  let peakP = c.s0, peak = 0; for (let p = c.s0; p <= c.s1; p++) { const v = cvPow(c, p); if (v > peak) { peak = v; peakP = p; } }
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="mt-2 w-full" role="img" aria-label="Ladeleistung über Ladestand">`
    + [150, 100, 50].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800"/><text x="${L - 6}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="currentColor" class="text-slate-400">${v}</text>`).join('')
    + `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" class="text-slate-300 dark:text-slate-700"/>`
    + [0, 50, 80, 100].map(p => `<text x="${X(p)}" y="${H - 8}" text-anchor="${p === 100 ? 'end' : 'middle'}" font-size="10" fill="currentColor" class="text-slate-400">${p} %</text>`).join('')
    + others.map(x => `<path d="${path(x)}" fill="none" stroke="${col(x)}" stroke-width="1.6" stroke-dasharray="4 3" opacity=".7"/>`).join('')
    + `<path d="${path(c, c.s0, c.s1)} L${X(c.s1)} ${Y(0)} L${X(c.s0)} ${Y(0)} Z" fill="${col(c)}" fill-opacity=".14"/><path d="${path(c, c.s0, c.s1)}" fill="none" stroke="${col(c)}" stroke-width="2.6" stroke-linejoin="round"/>`
    + (cvEnd(c) > c.s1 ? `<path d="${path(c, c.s1, cvEnd(c))} L${X(cvEnd(c))} ${Y(0)} L${X(c.s1)} ${Y(0)} Z" fill="${col(c)}" fill-opacity=".07"/><path d="${path(c, c.s1, cvEnd(c))}" fill="none" stroke="${col(c)}" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round"/><text x="${X((c.s1 + cvEnd(c)) / 2)}" y="${Y(cvPow(c, c.s1 + 1)) - 8}" text-anchor="middle" font-size="9.5" fill="${col(c)}">gedrosselt</text>` : '')
    + (avg ? `<line x1="${L}" x2="${W - R}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#64748b" stroke-dasharray="4 3"/><text x="${W - R - 2}" y="${Y(avg) - 4}" text-anchor="end" font-size="9.5" fill="#94a3b8">Ø ${fmt(avg, 1)} kW</text>` : '')
    + `<circle cx="${X(peakP)}" cy="${Y(c.maxKw || peak)}" r="3.5" fill="${col(c)}"/><text x="${X(peakP) + 5}" y="${Y(c.maxKw || peak) - 6}" font-size="10" font-weight="600" fill="${col(c)}">${fmt(c.maxKw || peak, 0)} kW</text></svg>`;
  const tile = (l, v) => v == null || v === '' ? '' : `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-1 py-2 text-center"><p class="text-[11px] text-slate-500 dark:text-slate-400">${l}</p><p class="text-[15px] font-bold tabular-nums">${v}</p></div>`;
  const tiles = [tile('Energie', c.kwh ? fmt(c.kwh, 1) + ' kWh' : null), tile('Max · Ø', c.maxKw ? fmt(c.maxKw, 0) + (avg ? ' · ' + fmt(avg, 0) : '') + ' kW' : null), tile('> 100 kW', c.hi100 != null ? 'bis ' + c.hi100 + ' %' : null),
    tile('Akku', c.tStart != null ? fmt(c.tStart, 0) + (c.tEnd != null ? ' → ' + fmt(c.tEnd, 0) : '') + ' °C' : null), tile('Außen', c.tOut != null ? fmt(c.tOut, 0) + ' °C' : null), tile('Verlust', c.loss != null ? fmt(c.loss, 0) + ' %' : null)].filter(Boolean).join('');
  const opts = (sel) => Array.from({ length: 21 }, (_, i) => i * 5).map(v => `<option value="${v}"${v === sel ? ' selected' : ''}>${v} %</option>`).join('');
  const ra = Number(el.dataset.ra || 10), rb = Number(el.dataset.rb || 80);
  el.innerHTML = chips
    + `<div class="mt-3 flex items-baseline gap-2"><span class="font-barlow text-[42px] font-bold leading-none" style="color:${col(c)}">${fmt(c.min, 0)} min</span><span class="text-sm text-slate-500 dark:text-slate-400">für ${c.s0} → ${c.s1} %</span></div>`
    + svg + (tiles ? `<div class="mt-2 grid grid-cols-3 gap-1.5">${tiles}</div>` : '')
    + ((c.tail || []).some(t => t.min > 0) ? `<div class="mt-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2"><p class="text-[11px] text-slate-500 dark:text-slate-400 text-left">Ab ${c.s1} % gedrosselt (nachgeladen, aus Zeiten gerechnet)</p><div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">${c.tail.filter(t => t.min > 0).map(t => `<span><b class="tabular-nums">${t.a} → ${t.b} %</b> ${fmt(t.min, 0)} min <span class="text-slate-500 dark:text-slate-400">· Ø ${fmt(c.kwh / (c.s1 - c.s0) * (t.b - t.a) / (t.min / 60), 0)} kW</span></span>`).join('')}</div></div>` : '')
    + `<div class="mt-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3"><p class="text-sm font-semibold text-left">Ladezeit-Rechner (diese Kurve)</p><div class="mt-2 flex items-center gap-1.5 text-sm"><span class="text-slate-500 dark:text-slate-400">von</span><select id="cv-a" aria-label="von" class="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-0.5 py-1.5 font-semibold">${opts(ra)}</select><span class="text-slate-500 dark:text-slate-400">bis</span><select id="cv-b" aria-label="bis" class="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-0.5 py-1.5 font-semibold">${opts(rb)}</select><span id="cv-res" class="ml-auto whitespace-nowrap font-barlow text-[22px] font-bold" style="color:${col(c)}"></span></div><p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-left">Bedingungen wie bei dieser Messung (Akku ${c.tStart != null ? fmt(c.tStart, 0) + ' °C' : 'warm'}). Bei kaltem Akku deutlich länger.${Object.keys(c.pts || {}).length ? '' : ' Ohne Leistungs-Stützpunkte gerechnet mit Ø-Leistung.'}</p></div>`
    + `<div class="mt-3 flex items-center justify-between gap-2 text-sm font-semibold">${c.files && c.files.length ? `<a href="${dvLink(c.files[0].id)}" target="_blank" rel="noopener" class="text-sky-600 dark:text-sky-300">Foto der Säule ansehen ›</a>` : '<span></span>'}<button type="button" data-cvact="edit" class="text-sky-600 dark:text-sky-300">Bearbeiten ›</button></div>`;
  $('cv-hdate').textContent = labD(c.date);
  cvCalc();
}
function cvCalc() {
  const el = $('cv-body'), a = $('cv-a'), b = $('cv-b'), r = $('cv-res'); if (!a || !b || !r) return; const c = getLab().curves.find(x => x.id === cvSel); if (!c) return;
  const A = Number(a.value), Bv = Number(b.value); el.dataset.ra = A; el.dataset.rb = Bv;
  r.textContent = Bv <= A ? '–' : '≈ ' + fmt(Math.round(cvMinutes(c, A, Bv)), 0) + ' min';
}
document.addEventListener('change', (e) => { if (e.target && (e.target.id === 'cv-a' || e.target.id === 'cv-b')) cvCalc(); });
document.addEventListener('click', (e) => {
  const ch = e.target.closest('#cv-body [data-cv]'); if (ch) { cvSel = ch.dataset.cv; renderCurve(); return; }
  const b = e.target.closest('#cv-body [data-cvact]'); if (b) openCvSheet(b.dataset.cvact === 'edit' ? cvSel : null);
});
let cvEdit = null; const cvPend = [];
function openCvSheet(id) {
  const c = id ? getLab().curves.find(x => x.id === id) : null; cvEdit = c ? c.id : null; cvPend.length = 0;
  const v = (k) => c ? c[k] : undefined, P = (c && c.pts) || {};
  $('cv-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${c ? 'Ladekurve bearbeiten' : 'Ladekurve erfassen'}</p>
    <div class="grid grid-cols-2 gap-2"><div class="min-w-0"><label for="cv-name" class="text-xs text-slate-500 dark:text-slate-400">Name</label><input id="cv-name" type="text" maxlength="24" value="${esc((c && c.name) || '')}" placeholder="z. B. Winter" class="${inCls}"></div><div class="min-w-0"><label for="cv-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="cv-date" type="date" value="${esc((c && c.date) || wxIso(new Date()))}" class="${inCls}"></div></div>
    <div class="grid grid-cols-3 gap-2">${fld('cv-s0', 'Start %', v('s0'), '5', 'numeric')}${fld('cv-s1', 'Ende %', v('s1'), '80', 'numeric')}${fld('cv-kwh', 'Energie kWh', v('kwh'), '37,17')}${fld('cv-min', 'Dauer min', v('min'), '33', 'numeric')}${fld('cv-max', 'Max kW', v('maxKw'), '106,2')}${fld('cv-avg', 'Ø kW', v('avgKw'), 'optional')}${fld('cv-t0', 'Akku °C Start', v('tStart'), '', 'text')}${fld('cv-t1', 'Akku °C Ende', v('tEnd'), '', 'text')}${fld('cv-to', 'Außen °C', v('tOut'), '', 'text')}${fld('cv-hi', '> 100 kW bis %', v('hi100'), 'optional', 'numeric')}${fld('cv-loss', 'Verlust %', v('loss'), 'optional')}</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 text-left">Weitergeladen über das Ende hinaus? (optional)</p>
    <div class="grid grid-cols-2 gap-2">${fld('cv-t90', 'Ende → 90 % · min', ((c && c.tail) || []).find(t => t.b === 90)?.min, 'z. B. 10', 'numeric')}${fld('cv-t100', '90 → 100 % · min', ((c && c.tail) || []).find(t => t.b === 100)?.min, 'z. B. 13', 'numeric')}</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 text-left">Leistung (kW) bei Ladestand – optional, ergibt die Kurve</p>
    <div class="grid grid-cols-5 gap-1.5 text-center">${[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(p => `<label class="text-[10px] text-slate-500 dark:text-slate-400">${p} %<input data-cvp="${p}" type="text" inputmode="decimal" value="${P[p] != null ? String(P[p]).replace('.', ',') : ''}" class="mt-1 w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-0.5 py-2 text-center text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"></label>`).join('')}</div>
    <div><button type="button" data-cvs="pick" class="w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-2.5 text-sm">Foto der Säule anhängen (Google Drive)</button><p id="cv-fmsg" class="mt-1 text-xs text-slate-500 dark:text-slate-400 text-left empty:hidden">${c && c.files && c.files.length ? c.files.length + ' Foto in Google Drive' : ''}</p></div>
    <p id="cv-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-cvs="${c ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${c ? 'text-red-600 dark:text-red-400' : ''}">${c ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-cvs="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  $('cv-sheet').classList.remove('hidden');
}
$('cv-sheet').addEventListener('click', async (e) => {
  if (e.target === $('cv-sheet')) { $('cv-sheet').classList.add('hidden'); return; }
  const b = e.target.closest('[data-cvs]'); if (!b) return; const act = b.dataset.cvs, lab = getLab();
  if (act === 'close') $('cv-sheet').classList.add('hidden');
  else if (act === 'pick') $('cv-file').click();
  else if (act === 'del') { if (confirm('Diese Ladekurve löschen?')) { lab.curves = lab.curves.filter(x => x.id !== cvEdit); setLab(lab); $('cv-sheet').classList.add('hidden'); } }
  else if (act === 'save') {
    const n = (id) => deDec($(id).value), m = $('cv-msg'), s0 = n('cv-s0'), s1 = n('cv-s1'), kwh = n('cv-kwh'), min = n('cv-min'), mx = n('cv-max');
    if (!(s0 >= 0 && s1 <= 100 && s1 > s0)) { m.textContent = 'Bitte Start- und Ende-% eintragen (Ende größer als Start).'; return; }
    if (!(kwh > 0 && min > 0 && mx > 0)) { m.textContent = 'Bitte Energie, Dauer und Max-Leistung eintragen.'; return; }
    const pts = {}; document.querySelectorAll('[data-cvp]').forEach(i => { const v = deDec(i.value); if (v > 0 && v < 400) pts[i.dataset.cvp] = v; });
    const oldC = cvEdit ? lab.curves.find(x => x.id === cvEdit) : null; Object.entries((oldC && oldC.pts) || {}).forEach(([k, v]) => { if (Number(k) % 10) pts[k] = v; });   // Zwischenpunkte (z. B. 81 %) behalten
    const t90 = n('cv-t90'), t100 = n('cv-t100'), tail = [];
    if (t90 > 0 && s1 < 90) tail.push({ a: s1, b: 90, min: t90 }); if (t100 > 0 && (s1 <= 90)) tail.push({ a: Math.max(90, s1), b: 100, min: t100 }); else if (t100 > 0 && s1 < 100) tail.push({ a: s1, b: 100, min: t100 });
    const old = cvEdit ? lab.curves.find(x => x.id === cvEdit) : null, opt = (id) => { const v = n(id); return Number.isFinite(v) ? v : undefined; };
    const c = { id: old ? old.id : labId(), name: $('cv-name').value.trim().slice(0, 24) || 'Kurve', date: $('cv-date').value || wxIso(new Date()), s0, s1, kwh, min, maxKw: mx, avgKw: opt('cv-avg'), hi100: opt('cv-hi'), tStart: opt('cv-t0'), tEnd: opt('cv-t1'), tOut: opt('cv-to'), loss: opt('cv-loss'), pts, tail: tail.length ? tail : undefined, files: old && old.files ? old.files : undefined };
    Object.keys(c).forEach(k => c[k] === undefined && delete c[k]);
    let tokP = null; if (cvPend.length) { if (!window.cloud?.isSignedIn()) { m.textContent = 'Für das Foto bitte bei Google anmelden.'; return; } tokP = window.cloud.driveToken(); tokP.catch(() => { }); }
    lab.curves = old ? lab.curves.map(x => x.id === old.id ? c : x) : lab.curves.concat(c); cvSel = c.id; setLab(lab); $('cv-sheet').classList.add('hidden');
    if (cvPend.length) { try { const up = await dvUploadFor({ id: c.id, date: c.date + 'T12:00:00Z', title: 'Ladekurve ' + c.name, category: 'Ladekurve', amount: 0 }, cvPend.slice(), tokP); const l2 = getLab(); l2.curves = l2.curves.map(x => x.id === c.id ? { ...x, files: (x.files || []).concat(up) } : x); setLab(l2); } catch (er) { if (er && er.status === 401) window.cloud.driveForget(); alert('Foto-Upload fehlgeschlagen: ' + dvErrText(er)); } cvPend.length = 0; }
  }
});
$('cv-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) { cvPend.length = 0; cvPend.push(f); $('cv-fmsg').textContent = f.name + ' · wird beim Speichern hochgeladen'; } e.target.value = ''; });

/* ---- Verbrauchsrekorde ---- */
const REC_COND = ['Klima aus', 'Klima an', 'Heizung', 'Tempomat', 'trocken', 'Regen', 'Winterreifen', 'Stau'];
let recRoute = 'all', recEdit = null;
function recChips(r) { return [r.tOut != null ? 'Außen ' + fmt(r.tOut, 0) + ' °C' : '', r.tBat != null ? 'Akku ' + fmt(r.tBat, 0) + ' °C' : '', r.v ? 'Ø ' + fmt(r.v, 0) + ' km/h' : ''].concat(r.cond || []).filter(Boolean).map(t => `<span class="inline-flex h-[22px] items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 text-[11px] text-slate-600 dark:text-slate-300">${esc(t)}</span>`).join(''); }
const CUP = '<svg class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';
/* ---- Höhenprofil je Strecke: Route über OSRM (OpenStreetMap), Höhen über Open-Meteo (Copernicus DEM 90 m); wird einmal geladen und mit der Strecke gespeichert (lab.routes) ---- */
const HP_MASS = 2100, HP_ETA = 0.9, HP_RECUP = 0.8;                          // kg inkl. Fahrer; Antriebswirkungsgrad bergauf; bergab genutzter Anteil (Rollen + Rekuperation)
const rtKey = (route) => recKey(route);
const recSeason = (r) => r.season === 'wi' || r.season === 'so' ? r.season : ((m) => m >= 4 && m <= 10 ? 'so' : 'wi')(Number(String((r && r.date) || wxIso(new Date())).slice(5, 7)));   // ohne Angabe: April–Oktober Sommer
const SEA_L = { so: 'Sommer', wi: 'Winter' }, SEA_I = { so: '☀️', wi: '❄️' };
const recDirKey = (r) => recKey(r.route) + '|' + (r.dir === 'ba' ? 'ba' : 'ab') + '|' + recSeason(r);
let recGeo = { a: null, b: null, via: null, prof: null, busy: false, err: '' }, recDirSel = {}, recSeaSel = {};
/* Speicherform ohne verschachtelte Arrays (Firestore erlaubt keine Arrays in Arrays): { km, up, dn, d: [km …], h: [m …] }; im Speicher zusätzlich pts = [[km, m] …] */
function hpN(p) { if (!p) return null; if (Array.isArray(p.pts)) return p; const d = Array.isArray(p.d) ? p.d : [], h = Array.isArray(p.h) ? p.h : []; return d.length > 1 && d.length === h.length ? { ...p, pts: d.map((x, i) => [x, h[i]]) } : null; }
function hpStore(p) { p = hpN(p); return p ? { km: p.km, up: p.up, dn: p.dn, d: p.pts.map(x => x[0]), h: p.pts.map(x => x[1]) } : undefined; }
(function hpMigrate() { const o = load(KEY_LAB, null); if (!o || !o.routes || typeof o.routes !== 'object') return; let ch = false;
  Object.values(o.routes).forEach(m => { if (m && m.prof && Array.isArray(m.prof.pts)) { m.prof = hpStore(m.prof); ch = true; } }); if (ch) save(KEY_LAB, o); })();
function hpRev(p) { return { ...p, up: p.dn, dn: p.up, pts: p.pts.map(([d, h]) => [Math.round((p.km - d) * 100) / 100, h]).reverse() }; }
function hpCost(p) { const kwh = (h) => HP_MASS * 9.81 * h / 3.6e6; return p.km > 0 ? (kwh(p.up) / HP_ETA - kwh(p.dn) * HP_RECUP) / p.km * 100 : 0; }   // zusätzliche kWh/100 km durch die Höhe
async function hpLoad(a, b, via) {
  const wp = [a, via, b].filter(Boolean).map(p => p.lon.toFixed(5) + ',' + p.lat.toFixed(5)).join(';');
  const rr = await fetch('https://router.project-osrm.org/route/v1/driving/' + wp + '?overview=full&geometries=geojson'); if (!rr.ok) throw new Error('Route nicht gefunden (' + rr.status + ')');
  const rj = await rr.json(), rt = rj.routes && rj.routes[0]; if (!rt) throw new Error('Keine Route gefunden');
  const cs = rt.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })), cum = [0];
  for (let i = 1; i < cs.length; i++) cum.push(cum[i - 1] + geoDist(cs[i - 1], cs[i]));
  const tot = cum[cum.length - 1], N = Math.min(100, Math.max(2, cs.length)), smp = []; let j = 0;
  for (let k = 0; k < N; k++) { const t = tot * k / (N - 1); while (j < cum.length - 2 && cum[j + 1] < t) j++; const f = cum[j + 1] > cum[j] ? (t - cum[j]) / (cum[j + 1] - cum[j]) : 0; smp.push({ d: t, lat: cs[j].lat + (cs[j + 1 < cs.length ? j + 1 : j].lat - cs[j].lat) * f, lon: cs[j].lon + (cs[j + 1 < cs.length ? j + 1 : j].lon - cs[j].lon) * f }); }
  const er = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + smp.map(s => s.lat.toFixed(5)).join(',') + '&longitude=' + smp.map(s => s.lon.toFixed(5)).join(','));
  if (!er.ok) throw new Error('Höhen nicht verfügbar (' + er.status + ')'); const ej = await er.json(), el = ej.elevation || [];
  const hs = el.map((h, i) => (Number(el[i - 1] ?? h) + Number(h) * 2 + Number(el[i + 1] ?? h)) / 4);   // leicht geglättet gegen Rasterrauschen
  let up = 0, dn = 0; for (let i = 1; i < hs.length; i++) { const dh = hs[i] - hs[i - 1]; if (dh > 0) up += dh; else dn -= dh; }
  return { km: Math.round(tot / 10) / 100, up: Math.round(up), dn: Math.round(dn), pts: smp.map((s, i) => [Math.round(s.d / 10) / 100, Math.round(hs[i])]) };
}
function hpSvg(p, la = 'A', lb = 'B', mini = false) {
  const W = 296, H = mini ? 56 : 110, L = mini ? 0 : 30, T = mini ? 4 : 14, B = mini ? 2 : 20, hs = p.pts.map(x => x[1]);
  let y0 = Math.min(...hs), y1 = Math.max(...hs); const pad = Math.max(10, (y1 - y0) * 0.15); y0 = Math.floor((y0 - pad) / 10) * 10; y1 = Math.ceil((y1 + pad) / 10) * 10;
  const X = (d) => L + d / (p.km || 1) * (W - L - 4), Y = (h) => T + (1 - (h - y0) / (y1 - y0 || 1)) * (H - T - B);
  const d = 'M' + p.pts.map(([x, h]) => X(x).toFixed(1) + ' ' + Y(h).toFixed(1)).join(' L'), area = d + ` L${X(p.km).toFixed(1)} ${H - B} L${X(0).toFixed(1)} ${H - B} Z`;
  if (mini) return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" class="mt-1 w-full" style="height:${H}px"><path d="${area}" fill="#34d399" fill-opacity=".18"/><path d="${d}" fill="none" stroke="#34d399" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  const mx = p.pts.reduce((a, x) => x[1] > a[1] ? x : a, p.pts[0]), st = Math.max(10, Math.ceil((y1 - y0) / 3 / 10) * 10), ticks = []; for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) ticks.push(v);
  const xs = [0, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200].filter(v => v <= p.km).filter((v, i, a) => a.length <= 5 || v % 10 === 0 || v === 0 || v === 5 || v === 15).slice(0, 6);
  const f = p.pts[0], l = p.pts[p.pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Höhenprofil ${la} nach ${lb}" class="w-full"><defs><linearGradient id="hpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d399" stop-opacity=".35"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></linearGradient></defs>`
    + ticks.map(v => `<line x1="${L}" x2="${W - 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800"/><text x="${L - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94a3b8">${v}</text>`).join('')
    + xs.map(v => `<text x="${X(v).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${v} km</text>`).join('')
    + `<path d="${area}" fill="url(#hpg)"/><path d="${d}" fill="none" stroke="#34d399" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="${X(0)}" cy="${Y(f[1]).toFixed(1)}" r="3.5" fill="currentColor" class="text-slate-700 dark:text-slate-100"/><text x="${X(0) + 5}" y="${(Y(f[1]) + 13).toFixed(1)}" font-size="9.5" fill="#94a3b8">${la}</text>`
    + `<circle cx="${X(p.km)}" cy="${Y(l[1]).toFixed(1)}" r="3.5" fill="currentColor" class="text-slate-700 dark:text-slate-100"/><text x="${X(p.km) - 5}" y="${(Y(l[1]) + 13).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94a3b8">${lb}</text>`
    + `<text x="${Math.min(W - 24, Math.max(L + 20, X(mx[0]))).toFixed(1)}" y="${(Y(mx[1]) - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#10b981">${mx[1]} m</text></svg>`;
}
/* Ortssuche: gespeicherte Orte + Photon (OpenStreetMap, für Suche beim Tippen gedacht), Ergebnisse nahe Start/Zuhause bevorzugt */
const hpPhLabel = (f) => { const q = f.properties || {}, st = [q.street, q.housenumber].filter(Boolean).join(' '), town = q.city || q.town || q.village || q.district || q.county || '';
  const main = q.name && q.name !== town ? q.name : (st || town || q.name || ''); return { main, sub: [q.name && q.name !== town && st ? st : '', [q.postcode, town].filter(Boolean).join(' '), q.state && q.country !== 'Deutschland' ? q.country : ''].filter(x => x && x !== main).join(', ') }; };
async function hpSearch(t, n = 5) {
  const bias = recGeo.a || getTPlaces().find(p => p.kind === 'home') || null;
  const r = await fetch('https://photon.komoot.io/api/?lang=de&limit=' + n + '&q=' + encodeURIComponent(t) + (bias ? '&lat=' + bias.lat.toFixed(3) + '&lon=' + bias.lon.toFixed(3) : ''));
  if (!r.ok) throw new Error('Ortssuche nicht erreichbar'); const j = await r.json();
  return (j.features || []).map(f => { const l = hpPhLabel(f); return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: l.main, sub: l.sub }; }).filter(x => x.label);
}
async function hpResolve(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  const pl = getTPlaces().find(p => p.name && p.name.toLowerCase() === t.toLowerCase()); if (pl) return { lat: pl.lat, lon: pl.lon, label: pl.name, sub: 'Gespeicherter Ort' };
  const g = geoOf(t); if (g) return { ...g, label: placeAt(t)?.name || t, sub: 'Koordinaten' };
  const res = await hpSearch(t, 1); if (!res.length) throw new Error('„' + t + '“ nicht gefunden'); return res[0];
}
let hpSugT = 0, hpSugN = 0;
function hpStatus(w, ok, txt) { const el = $('rec-st-' + w); if (!el) return; el.className = 'mt-1 text-xs text-left ' + (ok === true ? 'text-emerald-600 dark:text-emerald-400' : ok === false ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'); el.textContent = txt || ''; }
function hpSugHide(w) { const el = $('rec-sug-' + w); if (el) { el.innerHTML = ''; el.classList.add('hidden'); } }
function hpSuggest(w) {
  clearTimeout(hpSugT); const inp = $('rec-' + w), t = inp ? inp.value.trim() : ''; recGeo[w + 'Dirty'] = true;
  if (t.length < 2 || geoOf(t)) { hpSugHide(w); hpStatus(w, null, geoOf(t) ? 'Koordinaten erkannt – Feld verlassen zum Übernehmen' : ''); return; }
  const tl = t.toLowerCase(), own = getTPlaces().filter(p => p.name && p.name.toLowerCase().includes(tl)).slice(0, 4).map(p => ({ lat: p.lat, lon: p.lon, label: p.name, sub: 'Gespeicherter Ort' }));
  const show = (list, more) => { const el = $('rec-sug-' + w); if (!el) return; recGeo['sug' + w] = list;
    el.innerHTML = list.map((x, i) => `<button type="button" data-sug="${w}:${i}" class="flex w-full items-start gap-2 px-3 py-2 text-left active:bg-slate-100 dark:active:bg-slate-800"><svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span class="min-w-0"><span class="block truncate text-sm font-medium">${esc(x.label)}</span>${x.sub ? `<span class="block truncate text-[11px] text-slate-500 dark:text-slate-400">${esc(x.sub)}</span>` : ''}</span></button>`).join('')
      + (more ? `<p class="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 text-left">${more}</p>` : '');
    el.classList.toggle('hidden', !list.length && !more); };
  show(own, 'Suche …'); const n = ++hpSugN;
  hpSugT = setTimeout(async () => { try { const res = await hpSearch(t); if (n !== hpSugN) return; show(own.concat(res), res.length || own.length ? '' : 'Nichts gefunden – anders schreiben, z. B. mit Ort oder PLZ'); } catch (e) { if (n === hpSugN) show(own, 'Suche nicht erreichbar – Koordinaten (lat,lon) gehen immer'); } }, 400);
}
function hpPick(w, pt) {
  recGeo[w] = pt; recGeo[w + 'Dirty'] = false; recGeo.err = ''; hpSugN++; clearTimeout(hpSugT); hpSugHide(w);
  const inp = $('rec-' + w); if (inp) inp.value = hpLabel(pt); hpStatus(w, true, '✓ ' + [pt.label, pt.sub].filter(Boolean).join(' · ')); hpRefresh();
}
const hpLabel = (p) => { if (!p) return ''; const pl = placeAt(p.lat + ',' + p.lon); return p.label || (pl && pl.name) || (p.lat.toFixed(4) + ', ' + p.lon.toFixed(4)); };
function hpBox() {
  const el = $('rec-hp'); if (!el) return; const g = recGeo;
  if (!g.a || !g.b) { el.innerHTML = '<p class="text-xs text-slate-500 dark:text-slate-400 text-left">Mit Start und Ziel lädt die App das Höhenprofil der Route.</p>'; return; }
  el.innerHTML = g.busy ? '<p class="text-sm text-slate-500 dark:text-slate-400 text-left">Höhenprofil wird geladen …</p>'
    : g.err ? `<p class="text-sm text-red-600 dark:text-red-400 text-left">${esc(g.err)}</p><button type="button" data-rs="hpload" class="mt-1 text-xs font-semibold text-sky-600 dark:text-sky-300">Erneut versuchen ›</button>`
    : g.prof ? `<div class="flex items-baseline justify-between gap-2 text-xs"><b class="text-sm whitespace-nowrap">Profil geladen</b><span class="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">${fmt(g.prof.km, 1)} km · ↑ ${g.prof.up} m · ↓ ${g.prof.dn} m</span></div>${hpSvg(g.prof, 'A', 'B', true)}`
    : '';
  el.innerHTML += (g.via || g.viaOpen ? '' : `<button type="button" data-rs="via" class="mt-1 text-xs font-semibold text-sky-600 dark:text-sky-300">Andere Route? Zwischenpunkt setzen ›</button>`);
}
async function hpRefresh() {
  const g = recGeo; if (!g.a || !g.b) { g.prof = null; hpBox(); return; }
  g.busy = true; g.err = ''; hpBox();
  try { g.prof = await hpLoad(g.a, g.b, g.via); } catch (e) { g.prof = null; g.err = 'Höhenprofil nicht geladen: ' + ((e && e.message) || 'kein Internet?'); }
  g.busy = false; hpBox(); recHint();
}
async function hpField(which) {
  const inp = $('rec-' + which); if (!inp) return; const t = inp.value.trim(); const cur = recGeo[which];
  if (!t) { recGeo[which] = null; hpSugHide(which); hpStatus(which, null, ''); hpRefresh(); return; } if (cur && hpLabel(cur) === t && !recGeo[which + 'Dirty']) return;
  hpStatus(which, null, 'Suche …');
  try { hpPick(which, await hpResolve(t)); } catch (e) { recGeo[which] = null; hpSugHide(which); hpStatus(which, false, ((e && e.message) || 'Nicht gefunden') + ' – bitte einen Vorschlag aus der Liste wählen'); hpRefresh(); }
}

/* ---- Langzeitverbrauch: Ablesungen „Seit Kauf“ aus dem Bordcomputer (lab.lt), Verlauf über die Jahre ---- */
let ltEdit = null;
function ltApp() { try { const rs = getReadings(); if (!rs.length) return null; const t = consumptionTotals(rs, rs.map((_, i) => i)); return t && t.km >= 100 ? t.kwh100 : null; } catch (e) { return null; } }
/** WLTP ohne Ladeverluste: eigener Wert aus den Einstellungen, sonst WLTP − 8 % (geschätzt) */
function wltpNet() { const s = getSettings(), n = Number(s.wltpNet); if (n > 0) return { v: n, est: false }; const w = Number(s.wltp) > 0 ? Number(s.wltp) : carProf(s).wltp; return { v: Math.round(w * 0.92 * 10) / 10, est: true }; }
function ltSvg(es, app, wl) {
  const W = 296, H = 124, L = 32, R = 12, T = 16, B = 20, t0 = Date.parse(es[0].date), t1 = Date.parse(es[es.length - 1].date), span = Math.max(1, t1 - t0);
  const vs = es.map(e => e.k100).concat(app != null ? [app] : [], wl != null ? [wl] : []); let y0 = Math.floor(Math.min(...vs) - 0.6), y1 = Math.ceil(Math.max(...vs) + 0.6); if (y1 - y0 < 2) y1 = y0 + 2;
  const X = (d) => es.length < 2 ? (L + W - R) / 2 : L + (Date.parse(d) - t0) / span * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const st = y1 - y0 > 6 ? 2 : 1, tk = []; for (let v = y0; v <= y1; v += st) tk.push(v);
  const multiYear = new Date(es[0].date).getFullYear() !== new Date(es[es.length - 1].date).getFullYear();
  const lbl = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', multiYear ? { month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit' });
  const xi = es.length <= 5 ? es.map((_, i) => i) : [0, Math.round((es.length - 1) / 2), es.length - 1];
  /* Wert-Beschriftungen ausdünnen: zuerst letzter, höchster, niedrigster und erster Wert, dann die übrigen –
     nur wenn kein anderes Label näher als 30 px daneben steht (bzw. vertikal klar getrennt ist) */
  const lab = new Set(), placed = [], n = es.length, iMax = es.reduce((a, e, i) => e.k100 > es[a].k100 ? i : a, 0), iMin = es.reduce((a, e, i) => e.k100 < es[a].k100 ? i : a, 0);
  [n - 1, iMax, iMin, 0].concat(es.map((_, i) => n - 2 - i).filter(i => i > 0)).forEach(i => { if (lab.has(i)) return; const x = X(es[i].date), y = Y(es[i].k100);
    if (placed.every(p => Math.abs(p.x - x) >= 30 || Math.abs(p.y - y) >= 14)) { lab.add(i); placed.push({ x, y }); } });
  return `<svg viewBox="0 0 ${W} ${H}" class="mt-1 w-full" role="img" aria-label="Langzeitverbrauch über die Zeit">`
    + tk.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94a3b8">${v}</text>`).join('')
    + (app != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(app).toFixed(1)}" y2="${Y(app).toFixed(1)}" stroke="#38bdf8" stroke-dasharray="4 3"/><text x="${W - R}" y="${(Y(app) + (wl != null && app < wl ? 11 : -4)).toFixed(1)}" text-anchor="end" font-size="9" fill="#0ea5e9">App: ${fmt(app, 1)} (ab Steckdose)</text>` : '')
    + (wl != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(wl).toFixed(1)}" y2="${Y(wl).toFixed(1)}" stroke="#a78bfa" stroke-width="1.6" stroke-dasharray="2 3"/><text x="${L + 2}" y="${(Y(wl) + (app != null && app > wl ? 11 : -4)).toFixed(1)}" font-size="9" fill="#8b5cf6">WLTP ohne Verluste ${fmt(wl, 1)}</text>` : '')
    + (es.length > 1 ? `<polyline points="${es.map(e => X(e.date).toFixed(1) + ',' + Y(e.k100).toFixed(1)).join(' ')}" fill="none" stroke="#10b981" stroke-width="2.4" stroke-linejoin="round"/>` : '')
    + es.map((e, i) => `<circle cx="${X(e.date).toFixed(1)}" cy="${Y(e.k100).toFixed(1)}" r="${n > 30 ? 2.2 : 3.5}" fill="#10b981"/>${lab.has(i) ? `<text x="${Math.min(W - R - 8, Math.max(L + 10, X(e.date))).toFixed(1)}" y="${(Y(e.k100) + (app != null && Math.abs(Y(e.k100) - 4 - Y(app)) < 12 ? 14 : -8)).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="currentColor" class="text-slate-500 dark:text-slate-300">${fmt(e.k100, 1)}</text>` : ''}`).join('')
    + xi.map(i => `<text x="${Math.min(W - R - 6, Math.max(L + 6, X(es[i].date))).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${lbl(es[i].date)}</text>`).join('') + '</svg>';
}
function ltCard(list) {
  const es = (list || []).filter(e => e.k100 > 0 && e.date).sort((a, b) => a.date.localeCompare(b.date) || (a.km || 0) - (b.km || 0)), app = ltApp(), wn = wltpNet();
  if (!es.length) return `<p class="rounded-3xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine Ablesung. Lies im Auto unter Fahrdaten den Langzeitspeicher „Seit Kauf“ ab und trage den Verbrauch über „+“ ein – am besten alle paar Wochen. So siehst du, wie sich dein Langzeitverbrauch über die Jahre entwickelt.${app != null ? ` Die App rechnet aus deinen Ladungen aktuell ${fmt(app, 1)} kWh/100 km ab Steckdose.` : ''}</p>`;
  const cur = es[es.length - 1], prev = es[es.length - 2], dl = prev ? cur.k100 - prev.k100 : null, first = es[0];
  const dChip = dl == null ? '' : `<span class="ml-auto shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${dl > 0.05 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : dl < -0.05 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}">${dl > 0 ? '+' : dl < 0 ? '−' : '±'}${fmt(Math.abs(dl), 1)} seit ${labD(prev.date).slice(0, 6)}</span>`;
  const rows = es.slice().reverse().map((e, i, a) => { const p = a[i + 1], d = p ? e.k100 - p.k100 : null;
    return `<button type="button" data-lt="${esc(e.id)}" class="grid w-full grid-cols-[1.2fr_1fr_0.8fr_0.6fr] items-baseline gap-1.5 border-t border-slate-100 dark:border-slate-800 py-2.5 text-left text-[13px] active:bg-slate-50 dark:active:bg-slate-800/50"><span>${labD(e.date)}</span><span class="text-xs text-slate-500 dark:text-slate-400" title="${e.kmEst ? 'geschätzt – wird genau, sobald das Fahrtenbuch für diesen Tag importiert ist' : ''}">${e.km ? (e.kmEst ? '≈ ' : '') + fmt(e.km, 0) + ' km' : e.kmEst ? 'folgt' : '–'}</span><b class="text-right tabular-nums">${fmt(e.k100, 1)}</b><span class="text-right text-[11px] ${d == null ? 'text-slate-400' : d > 0.05 ? 'text-amber-600 dark:text-amber-400' : d < -0.05 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}">${d == null ? 'Start' : (d > 0 ? '+' : d < 0 ? '−' : '±') + fmt(Math.abs(d), 1)}</span></button>`; }).join('');
  return `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-2">
    <div class="flex items-baseline justify-between gap-2"><p class="text-sm text-slate-500 dark:text-slate-400 text-left">Langzeitverbrauch seit Kauf</p><span class="text-xs text-slate-500">${labD(cur.date)}</span></div>
    <div class="flex items-baseline gap-2"><span class="font-barlow text-[44px] font-bold leading-none text-emerald-600 dark:text-emerald-400">${fmt(cur.k100, 1)}</span><span class="text-sm text-slate-500 dark:text-slate-400">kWh/100 km</span>${dChip}</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 text-left">Bordcomputer „Seit Kauf“${cur.km ? ' · ' + fmt(cur.km, 0) + ' km' : ''}${first !== cur && first.km && cur.km ? ' · ' + fmt(cur.km - first.km, 0) + ' km seit der ersten Ablesung' : ''}${cur.v ? ' · Ø ' + fmt(cur.v, 0) + ' km/h' : ''}</p>
    ${(() => { const d = cur.k100 - wn.v, pc = d / wn.v * 100; return `<p class="rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 text-left">Deine ${fmt(cur.k100, 1)} liegen <b class="${d > 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${fmt(Math.abs(d), 1)} kWh/100 km (${fmt(Math.abs(pc), 0)} %) ${d > 0.05 ? 'über' : d < -0.05 ? 'unter' : 'genau auf'}</b> dem WLTP ohne Ladeverluste (${fmt(wn.v, 1)}${wn.est ? ', geschätzt' : ''}).</p>`; })()}
    ${ltSvg(es, null, wn.v)}
    <p class="text-[11px] text-slate-500 dark:text-slate-400 text-left">Grün: deine Ablesungen. Lila gepunktet: WLTP ohne Ladeverluste${wn.est ? ' (WLTP − 8 %, eigenen Wert unter Einstellungen → Laden & Akku eintragen)' : ''} – der passende Vergleich, weil auch der Bordcomputer ohne Ladeverluste misst.</p></div>
    <div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm px-4 pb-1.5 pt-2"><div class="grid grid-cols-[1.2fr_1fr_0.8fr_0.6fr] gap-1.5 py-1.5 text-[11px] text-slate-500 dark:text-slate-400"><span>Datum</span><span>km-Stand</span><span class="text-right">kWh/100</span><span class="text-right">Δ</span></div>${rows}</div>`;
}
function openLtSheet(id) {
  const e = id ? (getLab().lt || []).find(x => x.id === id) : null; ltEdit = e ? e.id : null; const app = ltApp(), km0 = (() => { try { return lastKnownKm(); } catch (_) { return null; } })();
  $('rec-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${e ? 'Ablesung bearbeiten' : 'Langzeitverbrauch festhalten'}</p>
    <p class="text-xs text-slate-500 dark:text-slate-400 text-left">Im Auto: Fahrdaten → „Seit Kauf“ (Langzeitspeicher) ablesen</p>
    <div class="grid grid-cols-[1.35fr_1fr_1fr] gap-2"><div class="min-w-0"><label for="lt-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="lt-date" type="date" value="${esc(e ? e.date : wxIso(new Date()))}" class="${inCls} !px-1.5 text-[13px]"></div>${fld('lt-km', 'km-Stand', e ? e.km : (km0 || undefined), '20.401', 'numeric').replace('>km-Stand</label>', '>km-Stand</label><button type="button" data-kmfetch data-kmfor="lt-km" title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf ml-1 align-middle relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition after:absolute after:-inset-2.5">↻</button>')}${fld('lt-k', 'kWh/100 km', e ? e.k100 : undefined, '15,3')}${fld('lt-v', 'Ø km/h', e ? e.v : undefined, 'optional', 'numeric')}${fld('lt-h', 'Fahrzeit h', e ? e.h : undefined, 'optional')}<div class="min-w-0"><label for="lt-note" class="text-xs text-slate-500 dark:text-slate-400">Notiz</label><input id="lt-note" type="text" maxlength="80" value="${esc((e && e.note) || '')}" placeholder="…" class="${inCls}"></div></div>
    <p class="rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 text-left">Vergleich: WLTP ohne Ladeverluste <b>${fmt(wltpNet().v, 1)}</b>${wltpNet().est ? ' (geschätzt)' : ''}${app != null ? ` · App ab Steckdose <b>${fmt(app, 1)}</b>` : ''}</p>
    <p id="lt-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-lts="${e ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${e ? 'text-red-600 dark:text-red-400' : ''}">${e ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-lts="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  $('rec-sheet').classList.remove('hidden');
}
$('rec-sheet').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-lts]'); if (!b) return; const act = b.dataset.lts, lab = getLab(); lab.lt = lab.lt || [];
  if (act === 'del') { if (!confirm('Diese Ablesung löschen?')) return; lab.lt = lab.lt.filter(x => x.id !== ltEdit); setLab(lab); }
  else if (act === 'save') {
    const k = deDec($('lt-k').value), km = deDec(String($('lt-km').value).replace(/\./g, '')), opt = (id) => { const v = deDec($(id).value); return Number.isFinite(v) && v > 0 ? v : undefined; };
    if (!(k > 5 && k < 50)) { $('lt-msg').textContent = 'Bitte den Verbrauch in kWh/100 km eintragen (z. B. 15,3).'; return; }
    const e = { id: ltEdit || labId(), date: $('lt-date').value || wxIso(new Date()), km: Number.isFinite(km) && km > 0 ? Math.round(km) : undefined, k100: Math.round(k * 10) / 10, v: opt('lt-v'), h: opt('lt-h'), note: $('lt-note').value.trim() || undefined };
    Object.keys(e).forEach(x => e[x] === undefined && delete e[x]);
    lab.lt = ltEdit ? lab.lt.map(x => x.id === ltEdit ? e : x) : lab.lt.concat(e); recRoute = 'lt'; setLab(lab);
  }
  $('rec-sheet').classList.add('hidden');
});

/* ---- Akku-Temperatur: schnelle Notizen (lab.bt = [{ id, at (ISO), t °C, out? °C, ctx? 'fahrt'|'geparkt'|'laden' }]), Verlauf Akku vs. Außen ---- */
const BT_CTX = [['fahrt', 'nach Fahrt'], ['geparkt', 'geparkt'], ['laden', 'vor Laden']];
let btVal = null, btCtx = null, btRange = '30', btOut = { t: 0, v: null }, btLastSaved = null;
async function btOutside() {
  if (Date.now() - btOut.t < 15 * 60000) return btOut.v; const l = wxLoc(); if (!l) return null;
  try { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&current=temperature_2m&timezone=auto'); const j = await r.json(); const v = j && j.current ? Number(j.current.temperature_2m) : null; btOut = { t: Date.now(), v: Number.isFinite(v) ? v : null }; } catch (e) { btOut = { t: Date.now() - 14 * 60000, v: null }; }
  return btOut.v;
}
/* Akku-Temperaturen aus der Historie (battTemp beim Anstecken, seit Kauf nachgetragen) für den Verlauf: als hohle Punkte, nicht in der
   Eintragsliste (Bearbeiten in der Historie). Doppelte fallen weg: gleicher Tag, ≤ 6 h und ≤ 1 °C Abstand zu einem Akku-°C-Eintrag. */
function btHist(all) {
  let rs = []; try { rs = getReadings(); } catch (e) { }
  return rs.filter(r => Number.isFinite(r.battTemp) && r.date && Number.isFinite(Date.parse(r.date))).map(r => ({ id: 'h' + r.id, at: r.date, t: r.battTemp, h: true }))
    .filter(x => { const tx = Date.parse(x.at); return !all.some(e => e.at.slice(0, 10) === x.at.slice(0, 10) && Math.abs(e.t - x.t) <= 1 && Math.abs(Date.parse(e.at) - tx) < 6 * 36e5); });
}
function btSvg(es) {
  const W = 296, H = 132, L = 30, R = 8, T = 10, B = 20, now = Date.now(), span = btRange === '30' ? 30 : btRange === '365' ? 365 : null;
  const t0 = span ? now - span * 864e5 : Math.min(...es.map(e => Date.parse(e.at))), t1 = now, xs = (t) => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R);
  const vs = es.flatMap(e => [e.t].concat(Number.isFinite(e.out) ? [e.out] : [])); let y0 = Math.floor(Math.min(0, ...vs) / 10) * 10, y1 = Math.ceil(Math.max(30, ...vs) / 10) * 10;
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B), tk = []; for (let v = y0; v <= y1; v += 10) tk.push(v);
  const line = (k) => { const p = es.filter(e => Number.isFinite(e[k])); return p.length > 1 ? p.map(e => xs(Date.parse(e.at)).toFixed(1) + ',' + Y(e[k]).toFixed(1)).join(' ') : ''; };
  const fmtX = (t) => new Date(t).toLocaleDateString('de-DE', span === 30 ? { day: '2-digit', month: '2-digit' } : { month: '2-digit', year: '2-digit' });
  const la = line('t'), lo = line('out');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Verlauf Akku- und Außentemperatur">`
    + tk.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800"/><text x="${L - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94a3b8">${v}°</text>`).join('')
    + (lo ? `<polyline points="${lo}" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-dasharray="4 3"/>` : '')
    + (la ? `<polyline points="${la}" fill="none" stroke="#f97316" stroke-width="2.4" stroke-linejoin="round"/>` : '')
    + es.map(e => e.h ? `<circle cx="${xs(Date.parse(e.at)).toFixed(1)}" cy="${Y(e.t).toFixed(1)}" r="2.6" fill="none" stroke="#f97316" stroke-width="1.4"/>` : `<circle cx="${xs(Date.parse(e.at)).toFixed(1)}" cy="${Y(e.t).toFixed(1)}" r="2.4" fill="#f97316"/>`).join('')
    + [t0, (t0 + t1) / 2, t1].map((t, i) => `<text x="${xs(t).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" font-size="9.5" fill="#94a3b8">${fmtX(t)}</text>`).join('') + '</svg>';
}
const btTripTxt = (e) => { const t = e.trip; if (!t) return ''; if (t.k === 'fahrt') return (t.ago != null ? t.ago + ' min nach ' : 'nach ') + (t.min ? t.min + ' min' : '') + (t.km ? ' / ' + t.km + ' km' : '') + ' Fahrt'; return t.h ? t.h + ' h geparkt' : ''; };
/* Plausibilität: weicht ein Wert um ≥ 6 °C vom zeitlich vorherigen ab, nur Hinweis (Wert bleibt gespeichert) */
const BT_JUMP = 6;
function btJump(en, list) {
  const t0 = Date.parse(en.at); let prev = null;
  for (const x of list || []) { if (x === en || x.id === en.id || !Number.isFinite(x.t) || !x.at) continue; const tx = Date.parse(x.at); if (tx < t0 && (!prev || tx > Date.parse(prev.at))) prev = x; }
  if (!prev) return null; const d = Math.round((en.t - prev.t) * 10) / 10; return Math.abs(d) >= BT_JUMP ? { prev, d } : null;
}
const btJumpD = (j) => (j.d > 0 ? '+' : '−') + fmt(Math.abs(j.d), 0) + '°';
const btJumpTxt = (en, j) => `⚠️ ${btJumpD(j)} zum letzten Wert (${fmt(j.prev.t, 0)} °C) – bitte prüfen.`;
function btCard(list) {
  const all = (list || []).filter(e => Number.isFinite(e.t) && e.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), last = all[all.length - 1];
  if (btVal == null) btVal = last ? Math.round(last.t) : 15;
  const hist = btHist(all), comb = all.concat(hist).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const span = btRange === '30' ? 30 : btRange === '365' ? 365 : null, es = span ? comb.filter(e => Date.parse(e.at) >= Date.now() - span * 864e5) : comb, nh = es.filter(e => e.h).length;
  const pill = (on) => on ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-transparent' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300';
  const now = new Date(), stepB = 'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-3xl font-semibold active:scale-90 transition select-none';
  let h = `<div id="btq-card" class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-3">
    <div class="flex items-baseline justify-between gap-2"><p class="text-sm text-slate-500 dark:text-slate-400 text-left">Akku-Temperatur jetzt</p><span class="text-xs text-slate-500">${now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${hhmm(now.getTime())}</span></div>
    <div class="flex items-center gap-2.5"><button type="button" data-bt="-1" aria-label="1 Grad weniger" class="${stepB}">−</button><span class="flex-1 text-center font-barlow text-[56px] font-bold leading-none text-orange-500 dark:text-orange-400 tabular-nums"><span id="btq-val">${btVal}</span> <span class="text-[28px]">°C</span></span><button type="button" data-bt="1" aria-label="1 Grad mehr" class="${stepB}">+</button></div>
    <div class="flex gap-1.5">${BT_CTX.map(([k, l]) => `<button type="button" data-btctx="${k}" aria-pressed="${btCtx === k}" class="flex-1 rounded-full border py-1.5 text-xs font-semibold ${pill(btCtx === k)}">${l}</button>`).join('')}</div>
    <div class="flex items-center gap-2"><span id="btq-out" class="min-w-0 text-xs text-slate-500 dark:text-slate-400 text-left">${btOut.v != null ? 'Außen ' + fmt(btOut.v, 0) + ' °C · automatisch' : wxLoc() ? 'Außen wird geladen …' : 'Außen: Standort unter Einstellungen → Wetter'}</span><button type="button" data-bt="save" class="ml-auto h-11 shrink-0 rounded-2xl bg-emerald-600 px-6 text-sm font-semibold text-white active:scale-95 transition">Speichern</button></div>
    ${btLastSaved ? `<div class="flex items-center justify-between gap-2 text-xs"><span class="text-left"><span class="text-emerald-600 dark:text-emerald-400">✓ ${fmt(btLastSaved.t, 0)} °C um ${hhmm(Date.parse(btLastSaved.at))} gespeichert</span>${(() => { const j = btJump(btLastSaved, getLab().bt); return j ? '<span class="block text-amber-600 dark:text-amber-400">' + btJumpTxt(btLastSaved, j) + '</span>' : ''; })()}</span><button type="button" data-bt="undo" class="font-semibold text-sky-600 dark:text-sky-300">Rückgängig</button></div>` : ''}</div>`;
  h += `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-1.5"><div class="flex items-center justify-between gap-2"><p class="text-sm font-bold">Verlauf</p><div class="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">${[['30', '30 T'], ['365', '1 J'], ['all', 'Alle']].map(([k, l]) => `<button type="button" data-btr="${k}" class="rounded-md px-2 py-0.5 ${btRange === k ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${l}</button>`).join('')}</div></div>`
    + (es.length ? btSvg(es) + `<div class="flex items-center gap-3.5 text-[11px] text-slate-500 dark:text-slate-400"><span><span class="inline-block h-[3px] w-3 bg-orange-500 align-middle"></span> Akku</span><span><span class="inline-block w-3 border-t-2 border-dashed border-sky-400 align-middle"></span> Außen</span>${nh ? '<span><span class="inline-block h-2 w-2 rounded-full border-[1.5px] border-orange-500 align-middle"></span> Historie</span>' : ''}<span class="ml-auto">${es.length} ${es.length === 1 ? 'Wert' : 'Werte'}</span></div>`
      : `<p class="py-4 text-sm text-slate-500 dark:text-slate-400 text-left">${comb.length ? 'Keine Werte in diesem Zeitraum.' : 'Noch keine Werte. Temperatur oben einstellen und speichern – die App merkt sich den letzten Wert, beim nächsten Mal reicht oft ein Tipp.'}</p>`) + '</div>';
  if (all.length) h += `<details data-btlist ${btListOpen ? 'open' : ''} class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm px-4 py-3"><summary class="cursor-pointer text-sm font-semibold">Alle Einträge (${all.length})</summary><div class="mt-2">${all.slice().reverse().slice(0, 200).map(e => { const j = btJump(e, all); return `<div data-btedit="${esc(e.id)}" role="button" tabindex="0" aria-label="Eintrag bearbeiten" class="flex cursor-pointer items-center gap-2 border-t border-slate-100 dark:border-slate-800 py-2 text-[13px] active:bg-slate-50 dark:active:bg-slate-800/50"><span class="w-[92px] shrink-0 tabular-nums">${new Date(e.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${hhmm(Date.parse(e.at))}</span><b class="w-12 shrink-0 tabular-nums text-orange-600 dark:text-orange-400">${fmt(e.t, 0)} °C</b><span class="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">${j ? `<span class="text-amber-600 dark:text-amber-400" title="${fmt(Math.abs(j.d), 0)}° ${j.d > 0 ? 'über' : 'unter'} dem vorherigen Wert (${fmt(j.prev.t, 0)} °C) – bitte prüfen">⚠️ ${j.d > 0 ? '+' : '−'}${fmt(Math.abs(j.d), 0)}°</span> ` : ''}${[Number.isFinite(e.out) ? 'außen ' + fmt(e.out, 0) + ' °C' : '', ((BT_CTX.find(c => c[0] === e.ctx) || [])[1] || '') + (e.ctxAuto ? ' (auto)' : ''), btTripTxt(e)].filter(Boolean).join(' · ')}</span><button type="button" data-btdel="${esc(e.id)}" aria-label="Eintrag löschen" class="shrink-0 px-1.5 text-slate-400 active:text-red-500">✕</button></div>`; }).join('')}</div></details>`;
  if (btOut.v == null && wxLoc() && Date.now() - btOut.t > 15 * 60000) btOutside().then(v => { const el = $('btq-out'); if (el) el.textContent = v != null ? 'Außen ' + fmt(v, 0) + ' °C · automatisch' : 'Außen nicht verfügbar'; });
  return h;
}
$('rec-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-bt]'), c = e.target.closest('[data-btctx]'), r = e.target.closest('[data-btr]'), d = e.target.closest('[data-btdel]');
  if (c) { btCtx = btCtx === c.dataset.btctx ? null : c.dataset.btctx; renderRecs(); return; }
  if (r) { btRange = r.dataset.btr; renderRecs(); return; }
  if (d) { if (!confirm('Diesen Eintrag löschen?')) return; const lab = getLab(); lab.bt = (lab.bt || []).filter(x => x.id !== d.dataset.btdel); setLab(lab); return; }
  const ed = e.target.closest('[data-btedit]'); if (ed) { openBtSheet(ed.dataset.btedit); return; }
  if (!b) return; const a = b.dataset.bt;
  if (a === '1' || a === '-1') { btVal = Math.max(-30, Math.min(70, btVal + Number(a))); $('btq-val').textContent = btVal; btLastSaved = null; return; }
  if (a === 'save') {
    const out = await btOutside(), lab = getLab(), en = { id: labId(), at: new Date().toISOString(), t: btVal };
    if (Number.isFinite(out)) en.out = Math.round(out * 10) / 10; if (btCtx) en.ctx = btCtx;
    lab.bt = (lab.bt || []).concat(en); btLastSaved = en; btCtx = null; setLab(lab); return;
  }
  if (a === 'undo' && btLastSaved) { const lab = getLab(), id = btLastSaved.id; lab.bt = (lab.bt || []).filter(x => x.id !== id); btLastSaved = null; setLab(lab); }
});
/* Akku °C: Eintrag nachträglich bearbeiten (Datum, Uhrzeit, Akku, Außen, Anlass) */
let btEdit = null, btEditCtx = null;
var btListOpen = btListOpen || false;
$('rec-list').addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('[data-btlist]')) btListOpen = e.target.open; }, true);
function openBtSheet(id) {
  const e = (getLab().bt || []).find(x => x.id === id); if (!e) return; btEdit = e.id; btEditCtx = e.ctx || null;
  const d = new Date(e.at), pad = (n) => String(n).padStart(2, '0');
  const pill = (k, l) => `<button type="button" data-btsctx="${k}" class="flex-1 rounded-full border py-2 text-xs font-semibold ${btEditCtx === k ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-transparent' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${l}</button>`;
  $('rec-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">Akku-Temperatur bearbeiten</p>
    <div class="grid grid-cols-2 gap-2"><div class="min-w-0"><label for="bts-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="bts-date" type="date" value="${wxIso(d)}" class="${inCls}"></div><div class="min-w-0"><label for="bts-time" class="text-xs text-slate-500 dark:text-slate-400">Uhrzeit</label><input id="bts-time" type="time" value="${pad(d.getHours())}:${pad(d.getMinutes())}" class="${inCls}"></div>
      ${fld('bts-t', 'Akku °C', e.t, '12', 'text')}${fld('bts-out', 'Außen °C', Number.isFinite(e.out) ? e.out : undefined, 'optional', 'text')}</div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Anlass${e.ctxAuto ? ' (automatisch aus dem Fahrtenbuch)' : ''}</p><div id="bts-ctx" class="mt-1 flex gap-1.5">${BT_CTX.map(([k, l]) => pill(k, l)).join('')}</div></div>
    <p id="bts-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-bts="del" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-red-600 dark:text-red-400">Löschen</button><button type="button" data-bts="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>
    <button type="button" data-bts="close" class="h-11 w-full rounded-2xl text-sm font-semibold text-slate-500 dark:text-slate-400">Abbrechen</button>`;
  $('rec-sheet').classList.remove('hidden');
}
$('rec-sheet').addEventListener('click', (ev) => {
  const c = ev.target.closest('[data-btsctx]');
  if (c) { btEditCtx = btEditCtx === c.dataset.btsctx ? null : c.dataset.btsctx; $('bts-ctx').querySelectorAll('[data-btsctx]').forEach(x => { const on = x.dataset.btsctx === btEditCtx;
    ['bg-orange-100', 'text-orange-700', 'dark:bg-orange-950', 'dark:text-orange-300', 'border-transparent'].forEach(k => x.classList.toggle(k, on)); ['border-slate-300', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-300'].forEach(k => x.classList.toggle(k, !on)); }); return; }
  const b = ev.target.closest('[data-bts]'); if (!b) return; const act = b.dataset.bts, lab = getLab(); lab.bt = lab.bt || [];
  if (act === 'del') { if (!confirm('Diesen Eintrag löschen?')) return; lab.bt = lab.bt.filter(x => x.id !== btEdit); setLab(lab); }
  else if (act === 'save') {
    const t = deDec($('bts-t').value), out = deDec($('bts-out').value), at = new Date(($('bts-date').value || '') + 'T' + ($('bts-time').value || '12:00'));
    if (!Number.isFinite(t) || t < -30 || t > 70) { $('bts-msg').textContent = 'Bitte eine Akku-Temperatur zwischen −30 und 70 °C eintragen.'; return; }
    if (isNaN(at)) { $('bts-msg').textContent = 'Bitte Datum und Uhrzeit prüfen.'; return; }
    if ($('bts-out').value.trim() && !(Number.isFinite(out) && out > -40 && out < 50)) { $('bts-msg').textContent = 'Außentemperatur bitte als Zahl (oder leer lassen).'; return; }
    lab.bt = lab.bt.map(x => { if (x.id !== btEdit) return x; const o = { ...x, t: Math.round(t * 10) / 10 };
      if (Number.isFinite(out)) o.out = Math.round(out * 10) / 10; else delete o.out;
      if (at.toISOString() !== new Date(x.at).toISOString().replace(/:\d\d\.\d+Z$/, ':00.000Z') && Math.abs(at - new Date(x.at)) >= 60000) { o.at = at.toISOString(); delete o.trip; if (o.ctxAuto) { delete o.ctx; delete o.ctxAuto; } }
      if (btEditCtx !== (o.ctx || null)) { if (btEditCtx) o.ctx = btEditCtx; else delete o.ctx; delete o.ctxAuto; }
      return o; });
    setLab(lab); try { btFillTrips(); } catch (e) { } try { renderBtm(); } catch (e) { }
  }
  $('rec-sheet').classList.add('hidden');
});
/* Start: kleine Akku-Temperatur-Karte (links der Verbrauchs-Prognose im Wisch-Bereich). Speichert in dieselbe Liste wie Rekorde → Akku °C (lab.bt). */
let btmVal = null, btmCtx = 'geparkt', btmSaved = null, btmMsg = '';
function renderBtm() {
  const el = $('btm-card'); if (!el) return;
  const all = (getLab().bt || []).filter(e => Number.isFinite(e.t) && e.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), last = all[all.length - 1];
  if (btmVal == null) btmVal = last ? Math.round(last.t) : 15;
  const now = new Date(), stepB = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-2xl font-semibold active:scale-90 transition select-none';
  const pill = (on) => on ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-transparent' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300';
  const btmJ = btmSaved ? btJump(btmSaved, all) : null;
  const info = btmMsg ? btmMsg : btmJ ? `<span class="text-amber-600 dark:text-amber-400">${btJumpTxt(btmSaved, btmJ)}</span>` : btmSaved ? `<span class="text-emerald-600 dark:text-emerald-400">✓ ${fmt(btmSaved.t, 0)} °C um ${hhmm(Date.parse(btmSaved.at))} gespeichert</span>`
    : [btOut.v != null ? 'Außen ' + fmt(btOut.v, 0) + ' °C' : '', last ? 'zuletzt ' + fmt(last.t, 0) + ' °C · ' + new Date(last.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : 'noch kein Wert'].filter(Boolean).join(' · ');
  el.innerHTML = `<div class="flex items-baseline justify-between gap-2"><p class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Akku-Temperatur</p><span class="flex shrink-0 gap-3"><button type="button" data-btm="tasks" class="text-xs font-semibold text-sky-700 dark:text-sky-300">📥 Tasks</button><button type="button" data-btm="open" class="text-xs font-semibold text-sky-700 dark:text-sky-300">Verlauf ›</button></span></div>
    <div class="mt-2 flex items-center gap-2.5"><button type="button" data-btm="-1" aria-label="1 Grad weniger" class="${stepB}">−</button><span class="flex-1 text-center font-barlow text-[50px] font-bold leading-none text-orange-500 dark:text-orange-400 tabular-nums"><span id="btm-val">${btmVal}</span> <span class="text-[24px]">°C</span></span><button type="button" data-btm="1" aria-label="1 Grad mehr" class="${stepB}">+</button></div>
    <div class="mt-2.5 flex gap-1.5">${BT_CTX.map(([k, l]) => `<button type="button" data-btmctx="${k}" aria-pressed="${btmCtx === k}" class="flex-1 rounded-full border py-1.5 text-xs font-semibold ${pill(btmCtx === k)}">${l}</button>`).join('')}</div>
    <div class="min-h-2 flex-1"></div>
    <div class="flex items-center gap-2"><span class="min-w-0 ${btmJ || /⚠️/.test(btmMsg) ? 'line-clamp-2' : 'truncate'} text-xs leading-4 text-left text-slate-500 dark:text-slate-400">${info}</span>${btmSaved ? '<button type="button" data-btm="undo" class="ml-auto h-10 shrink-0 rounded-2xl bg-slate-200 dark:bg-slate-800 px-4 text-sm font-semibold text-sky-700 dark:text-sky-300 active:scale-95 transition">Rückgängig</button>' : '<button type="button" data-btm="save" class="ml-auto h-10 shrink-0 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white active:scale-95 transition">Speichern</button>'}</div>`;
}
$('btm-card').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-btmctx]'); if (c) { btmCtx = btmCtx === c.dataset.btmctx ? null : c.dataset.btmctx; renderBtm(); return; }
  const b = e.target.closest('[data-btm]'); if (!b) return; const a = b.dataset.btm;
  if (a === '1' || a === '-1') { btmVal = Math.max(-30, Math.min(70, btmVal + Number(a))); $('btm-val').textContent = btmVal; if (btmSaved || btmMsg) { btmSaved = null; btmMsg = ''; renderBtm(); } return; }
  if (a === 'open') { NAV_GO.akkutemp ? NAV_GO.akkutemp() : showView('recs'); return; }
  if (a === 'tasks') { gtImport(false); return; }
  if (a === 'save') {
    b.disabled = true; const out = await btOutside(), lab = getLab(), en = { id: labId(), at: new Date().toISOString(), t: btmVal };
    if (Number.isFinite(out)) en.out = Math.round(out * 10) / 10; if (btmCtx) en.ctx = btmCtx;
    lab.bt = (lab.bt || []).concat(en); btmSaved = en; btmCtx = 'geparkt'; btmMsg = ''; setLab(lab); renderBtm(); return;
  }
  if (a === 'undo' && btmSaved) { const lab = getLab(), id = btmSaved.id; lab.bt = (lab.bt || []).filter(x => x.id !== id); btmSaved = null; setLab(lab); renderBtm(); }
});
/* Start: Langzeitverbrauch-Karte (ganz links im Wisch-Bereich, links der Akku-Temperatur). ±0,1 kWh/100 km, Datum antippbar,
   km-Stand vom Auto (stündlicher Zwischenstand; beim Speichern einmal frisch geholt). Speichert in lab.lt wie Rekorde → Langzeit. */
let ltmVal = null, ltmDate = null, ltmSaved = null, ltmMsg = '';
function ltmCarKm() {                                                               // { km, at } aus dem letzten Abruf beim Auto
  const c = load(KEY_WXO + 'S', null), d = c && c.d;
  if (carKmCache && (!d || carKmCache.t >= c.t)) return { km: carKmCache.km, at: carKmCache.at || new Date(carKmCache.t).toISOString() };
  return d && d.odometerKm != null ? { km: Math.round(d.odometerKm), at: d.capturedAt || new Date(c.t).toISOString() } : null;
}
function renderLtm() {
  const el = $('ltm-card'); if (!el) return;
  const all = (getLab().lt || []).filter(e => e.k100 > 0 && e.date).sort((a, b) => a.date.localeCompare(b.date) || (a.km || 0) - (b.km || 0)), last = all[all.length - 1];
  if (ltmVal == null) ltmVal = last ? last.k100 : 16;
  const today = wxIso(new Date()); if (!ltmDate) ltmDate = today;
  const car = apiEnabled() && ltmDate === today ? ltmCarKm() : null, kmTxt = ltmDate !== today ? '<span class="font-normal text-slate-500 dark:text-slate-400">wird geschätzt</span>' : car ? fmt(car.km, 0) + ' km' : (() => { const k = (() => { try { return lastKnownKm(); } catch (_) { return null; } })(); return k ? '≈ ' + fmt(k, 0) + ' km' : 'km folgt'; })();
  const carAt = car && car.at ? new Date(car.at) : null, carSub = car ? (carAt ? (wxIso(carAt) === today ? hhmm(carAt.getTime()) : carAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })) : '') : '';
  const stepB = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-2xl font-semibold active:scale-90 transition select-none';
  const chip = (a, l, on) => `<button type="button" data-ltm="${a}" class="rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'} active:scale-95 transition">${l}</button>`;
  const d = last ? Math.round((ltmVal - last.k100) * 10) / 10 : null;
  const info = ltmMsg ? ltmMsg : ltmSaved ? `<span class="text-emerald-600 dark:text-emerald-400">✓ ${fmt(ltmSaved.k100, 1)} gespeichert${ltmSaved.km ? ' · ' + fmt(ltmSaved.km, 0) + ' km' : ''}</span>`
    : last ? `zuletzt ${fmt(last.k100, 1)} · ${new Date(last.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}${d ? ` · <span class="${d > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d), 1)}</span>` : ''}` : 'noch keine Ablesung';
  const dTxt = ltmDate === today ? 'Heute' : new Date(ltmDate + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  el.innerHTML = `<div class="flex items-baseline justify-between gap-2"><p class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Langzeitverbrauch</p><span class="flex shrink-0 gap-3"><button type="button" data-ltm="tasks" class="text-xs font-semibold text-sky-700 dark:text-sky-300">📥 Tasks</button><button type="button" data-ltm="open" class="text-xs font-semibold text-sky-700 dark:text-sky-300">Verlauf ›</button></span></div>
    <div class="mt-2 flex items-center gap-2.5"><button type="button" data-ltm="-0.1" aria-label="0,1 weniger" class="${stepB}">−</button><span class="flex-1 text-center font-barlow font-bold leading-none text-emerald-600 dark:text-emerald-400 tabular-nums"><span id="ltm-val" class="text-[50px]">${fmt(ltmVal, 1)}</span> <span class="text-[18px]">kWh/100</span></span><button type="button" data-ltm="0.1" aria-label="0,1 mehr" class="${stepB}">+</button></div>
    <div class="mt-2.5 grid grid-cols-2 gap-1.5"><label class="relative min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-2.5 py-1.5"><p class="text-[10.5px] text-left text-slate-500 dark:text-slate-400">Datum ✎</p><p class="truncate text-[13px] font-semibold">${dTxt}</p><input id="ltm-date" type="date" max="${today}" value="${ltmDate}" aria-label="Datum der Ablesung" class="absolute inset-0 h-full w-full cursor-pointer opacity-0"></label>
      <button type="button" data-ltm="km" class="min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-2.5 py-1.5 text-left active:scale-[.98] transition"><p class="truncate text-[10.5px] text-slate-500 dark:text-slate-400">km-Stand${apiEnabled() && ltmDate === today ? ' <span class="text-emerald-600 dark:text-emerald-400">↻</span>' : ''}</p><p class="truncate text-[13px] font-semibold tabular-nums">${kmTxt} <span class="text-[10.5px] font-normal text-slate-500 dark:text-slate-400">${carSub}</span></p></button></div>
    <div class="min-h-2 flex-1"></div>
    <div class="flex items-center gap-2"><span class="min-w-0 truncate text-xs leading-4 text-left text-slate-500 dark:text-slate-400">${info}</span>${ltmSaved ? '<button type="button" data-ltm="undo" class="ml-auto h-10 shrink-0 rounded-2xl bg-slate-200 dark:bg-slate-800 px-4 text-sm font-semibold text-sky-700 dark:text-sky-300 active:scale-95 transition">Rückgängig</button>' : '<button type="button" data-ltm="save" class="ml-auto h-10 shrink-0 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white active:scale-95 transition">Speichern</button>'}</div>`;
}
$('ltm-card').addEventListener('change', (e) => { if (e.target.id === 'ltm-date') { ltmDate = e.target.value || wxIso(new Date()); ltmSaved = null; ltmMsg = ''; renderLtm(); } });
$('ltm-card').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ltm]'); if (!b) return; const a = b.dataset.ltm;
  if (a === '0.1' || a === '-0.1') { ltmVal = Math.max(5, Math.min(49.9, Math.round((ltmVal + Number(a)) * 10) / 10)); if (ltmSaved || ltmMsg) { ltmSaved = null; ltmMsg = ''; renderLtm(); } else $('ltm-val').textContent = fmt(ltmVal, 1); return; }
  if (a === 'open') { recRoute = 'lt'; showView('recs'); return; }
  if (a === 'tasks') { gtImport(false); return; }
  if (a === 'km') { if (ltmDate !== wxIso(new Date())) return; if (!apiEnabled()) { ltmMsg = 'Keine Fahrzeugdaten eingerichtet'; renderLtm(); return; } b.disabled = true; ltmMsg = 'km-Stand wird geholt …'; renderLtm();
    try { await fetchCarKm(); ltmMsg = ''; } catch (er) { ltmMsg = '<span class="text-red-600 dark:text-red-400">km-Stand nicht verfügbar</span>'; } renderLtm(); return; }
  if (a === 'save') {
    b.disabled = true; const date = ltmDate || wxIso(new Date()), today = date === wxIso(new Date()), en = { id: labId(), date, at: today ? new Date().toISOString() : date + 'T12:00:00', k100: Math.round(ltmVal * 10) / 10 };
    if (today && apiEnabled()) { try { en.km = (await fetchCarKm()).km; } catch (er) { const c = ltmCarKm(); if (c && Date.now() - Date.parse(c.at) < 6 * 3600e3) en.km = c.km; } }
    if (!(en.km > 0)) { const k = await gtKmAt(en.at).catch(() => ({ km: null, est: true })); if (k.km > 0) en.km = k.km; if (k.est || !(k.km > 0)) en.kmEst = true; }
    const lab = getLab(); lab.lt = (lab.lt || []).concat(en); ltmSaved = en; ltmMsg = ''; ltmDate = null; setLab(lab); renderLtm(); return;
  }
  if (a === 'undo' && ltmSaved) { const lab = getLab(), id = ltmSaved.id; lab.lt = (lab.lt || []).filter(x => x.id !== id); ltmSaved = null; setLab(lab); renderLtm(); }
});
/* =====================================================================
   Akku-Temperatur per Sprachbefehl: Gemini/Android Auto legt eine Aufgabe in Google Tasks an („Akku 12 Grad“, „Akkutemperatur minus 3 nach Fahrt“).
   Die App liest offene Aufgaben, die mit „Akku“ beginnen, übernimmt Wert + Zeitpunkt (Aufgabe angelegt) in lab.bt – wie Akku °C –, ergänzt die
   Außentemperatur dieser Stunde und hakt die Aufgabe ab. Berechtigung: Google Tasks (zusammen mit Drive, ein Google-Fenster).
   Automatisch beim Öffnen von Start, solange der Google-Zugriff noch gültig ist; sonst per Tipp auf „📥 Tasks“.
   ===================================================================== */
const GT_NUM = { null: 0, eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50 };
function gtWordNum(t) {                                                             // „einundzwanzig“ → 21
  t = t.toLowerCase(); if (GT_NUM[t] != null) return GT_NUM[t];
  const m = /^(\w+?)und(zwanzig|dreißig|vierzig|fünfzig)$/.exec(t); return m && GT_NUM[m[1]] != null ? GT_NUM[m[1]] + GT_NUM[m[2]] : null;
}
/** „Akku 12 Grad“, „12° Akku Nachfahrt“, „Akkutemperatur: -3,5 °C nach Fahrt“, „Akku minus drei geparkt“ → { t, ctx } oder null.
    Reihenfolge egal (Gemini schreibt die Zahl gern vorne), Zahl als Ziffer oder Wort, Anlass auch zusammengeschrieben („Nachfahrt“, „vorladen“). */
function gtParse(title) {
  const s0 = String(title || '').trim().toLowerCase().replace(/−/g, '-'); if (!/akku/.test(s0)) return null;
  const s = ' ' + s0.replace(/akku\s*-?\s*(temperatur|temp\.?)?/g, ' ').replace(/[:=]/g, ' ') + ' ';
  let v = null, m = /(?:^|[^\d,.])(minus\s*|-\s*)?(\d{1,2}(?:[.,]\d)?)(?![\d.,])/.exec(s);
  if (m) v = (m[1] ? -1 : 1) * Number(m[2].replace(',', '.'));
  else { const w = /(?:^|\s)(minus\s+)?([a-zäöüß]+)/g; let x; while ((x = w.exec(s))) { const n = gtWordNum(x[2]); if (n != null) { v = (x[1] ? -1 : 1) * n; break; } } }
  if (v == null || !Number.isFinite(v) || v < -30 || v > 70) return null;
  const ctx = /nach\s*(der\s*)?fahrt|gefahren/.test(s) ? 'fahrt' : /geparkt|parken|im stand/.test(s) ? 'geparkt' : /vor\s*(dem\s*)?laden|laden/.test(s) ? 'laden' : null;
  return { t: Math.round(v * 10) / 10, ctx };
}
/** „Langzeit 13,1“, „Langzeit dreizehn Komma eins“ → kWh/100 km oder null */
function gtParseLt(title) {
  const s0 = String(title || '').trim().toLowerCase(); if (!/lang\s*zeit/.test(s0)) return null;
  const s = s0.replace(/lang\s*zeit(verbrauch)?/g, ' ').replace(/kilowattstunden|kwh|pro|\/|100|km|kilometer/g, ' ');
  let v = null; const m = /(\d{1,2})(?:\s*[.,]\s*(\d))?(?![\d])/.exec(s);
  if (m) v = Number(m[1] + (m[2] ? '.' + m[2] : ''));
  else { const w = /([a-zäöüß]+)(?:\s+(?:komma|punkt)\s+([a-zäöüß]+|\d))?/g; let x; while ((x = w.exec(s))) { const a = gtWordNum(x[1]); if (a == null) continue; const b = x[2] == null ? 0 : /\d/.test(x[2]) ? Number(x[2]) : gtWordNum(x[2]); v = a + (b != null && b < 10 ? b / 10 : 0); break; } }
  return v != null && v > 5 && v < 50 ? Math.round(v * 10) / 10 : null;
}
/** Genauer km-Stand zu einem Zeitpunkt aus dem Fahrtenbuch (MyŠkoda): während einer Fahrt zwischen Start- und Ziel-km interpoliert,
    zwischen zwei Fahrten (Auto stand) der Ziel-km der vorherigen Fahrt. Nur wenn Fahrten vor UND nach dem Zeitpunkt vorliegen – sonst null. */
function tripKmAt(iso) {
  const t = Date.parse(iso), ts = getTrips().filter(x => Number.isFinite(x.o1) && x.s && x.e); if (!Number.isFinite(t) || !ts.length) return null;
  const S = (x) => Date.parse(x.s), E = (x) => Date.parse(x.e);
  const inT = ts.find(x => S(x) <= t && t <= E(x));
  if (inT) { const o0 = Number.isFinite(inT.o0) ? inT.o0 : inT.o1 - (inT.km || 0); return Math.round(o0 + (inT.o1 - o0) * (t - S(inT)) / Math.max(1, E(inT) - S(inT))); }
  let before = null, after = null; ts.forEach(x => { if (E(x) < t && (!before || E(x) > E(before))) before = x; if (S(x) > t && (!after || S(x) < S(after))) after = x; });
  return before && after ? before.o1 : null;
}
/** km-Stand zu einem Zeitpunkt: { km, est } – Fahrtenbuch (genau) → heute vom Auto → zwischen zwei Ladungen interpoliert (geschätzt) */
async function gtKmAt(iso) {
  const tk = tripKmAt(iso); if (tk > 0) return { km: tk, est: false };
  if (wxIso(new Date(iso)) === wxIso(new Date()) && apiEnabled()) { try { return { km: (await fetchCarKm()).km, est: false }; } catch (e) { } }
  const rs = getReadings().filter(r => r.odometerKm > 0).map(r => ({ t: Date.parse(r.date), km: r.odometerKm })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t), t = Date.parse(iso);
  const i = rs.findIndex(x => x.t >= t); if (i <= 0) return { km: null, est: true }; const a = rs[i - 1], b = rs[i];
  return { km: Math.round(a.km + (b.km - a.km) * (t - a.t) / Math.max(1, b.t - a.t)), est: true };
}
/** Fahrt zu einem Zeitpunkt aus dem Fahrtenbuch: während einer Fahrt oder bis 45 min danach → { ctx: 'fahrt', min, km };
    letzte Fahrt länger als 2 h her → { ctx: 'geparkt' }. Nur wenn das Fahrtenbuch über den Zeitpunkt hinaus reicht (sonst null = noch unbekannt). */
function tripCtxAt(iso) {
  const t = Date.parse(iso), ts = getTrips().filter(x => x.s && x.e); if (!Number.isFinite(t) || !ts.length) return null;
  const S = (x) => Date.parse(x.s), E = (x) => Date.parse(x.e); if (!ts.some(x => S(x) > t || (S(x) <= t && t <= E(x)))) return null;   // Fahrtenbuch reicht noch nicht bis hierher
  const inT = ts.find(x => S(x) <= t && t <= E(x));
  if (inT) return { ctx: 'fahrt', min: Math.max(1, Math.round((t - S(inT)) / 60000)), km: inT.km > 0 ? Math.round(inT.km * (t - S(inT)) / Math.max(1, E(inT) - S(inT))) : undefined };
  const before = ts.filter(x => E(x) < t).sort((a, b) => E(b) - E(a))[0]; if (!before) return null;
  const gap = (t - E(before)) / 60000;
  if (gap <= 45) return { ctx: 'fahrt', min: Math.round((E(before) - S(before)) / 60000), km: before.km > 0 ? Math.round(before.km) : undefined, ago: Math.round(gap) };
  return gap >= 120 ? { ctx: 'geparkt', parkedH: Math.round(gap / 60) } : null;
}
/** Akku °C: Anlass und Fahrt automatisch aus dem Fahrtenbuch ergänzen (eigener Anlass bleibt), auch nachträglich nach dem Import */
function btFillTrips() {
  const lab = getLab(); if (!Array.isArray(lab.bt)) return 0; let n = 0;
  lab.bt = lab.bt.map(e => { if (!e.at || e.trip) return e; const c = tripCtxAt(e.at); if (!c) return e;
    const o = { ...e, trip: { k: c.ctx } }; if (c.min) o.trip.min = c.min; if (c.km) o.trip.km = c.km; if (c.ago != null) o.trip.ago = c.ago; if (c.parkedH) o.trip.h = c.parkedH;
    if (!o.ctx) { o.ctx = c.ctx; o.ctxAuto = true; } n++; return o; });
  if (n) setLab(lab); return n;
}
/** Nachträglich: Langzeit-Ablesungen per Sprachbefehl ohne (genauen) km-Stand bekommen ihn aus dem Fahrtenbuch, sobald es importiert ist */
function ltFillKm() {
  const lab = getLab(); if (!Array.isArray(lab.lt)) return 0; let n = 0;
  lab.lt = lab.lt.map(e => { if (!e.at || !(e.kmEst || !(e.km > 0))) return e; const km = tripKmAt(e.at); if (!(km > 0)) return e; n++; const o = { ...e, km }; delete o.kmEst; return o; });
  if (n) setLab(lab); return n;
}
/** Außentemperatur zu einem Zeitpunkt der letzten Tage (stündlich, Open-Meteo) */
async function gtOutAt(iso) {
  const l = wxLoc(); if (!l) return null;
  const d0 = wxIso(new Date(iso)), old = Date.now() - Date.parse(iso) > 6 * 864e5;   // älter als 6 Tage: Wetter-Archiv
  try { const r = await fetch(old ? 'https://archive-api.open-meteo.com/v1/archive?latitude=' + l.lat + '&longitude=' + l.lon + '&hourly=temperature_2m&start_date=' + d0 + '&end_date=' + d0 + '&timezone=auto'
      : 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&hourly=temperature_2m&past_days=7&forecast_days=1&timezone=auto'); const j = await r.json();
    const d = new Date(iso), k = wxIso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':00', i = j.hourly.time.indexOf(k); return i >= 0 && j.hourly.temperature_2m[i] != null ? Math.round(j.hourly.temperature_2m[i] * 10) / 10 : null; } catch (e) { return null; }
}
let gtBusy = false;
function renderVcStatus() {
  const el = $('vc-status'); if (!el) return; const last = load('enyaq.gtLast', null), signed = window.cloud?.isSignedIn?.();
  el.innerHTML = !signed ? '<span class="text-amber-600 dark:text-amber-400">●</span> Bitte zuerst bei Google anmelden'
    : '<span class="text-emerald-600 dark:text-emerald-400">●</span> Google Tasks ' + (window.cloud.driveReady() ? 'verbunden' : 'eingerichtet') + (last ? ' · zuletzt ' + fmtDate(last) : '');
}
async function gtImport(silent) {
  if (gtBusy) return; if (!window.cloud?.isSignedIn()) { if (!silent) { btmMsg = 'Für Google Tasks bitte anmelden.'; renderBtm(); } return; }
  if (silent && !window.cloud.driveReady()) return;
  gtBusy = true; if (!silent) { btmMsg = 'Google Tasks wird gelesen …'; renderBtm(); }
  try {
    const api = 'https://tasks.googleapis.com/tasks/v1';
    let tok = await window.cloud.driveToken(), H = { Authorization: 'Bearer ' + tok }, lr = await fetch(api + '/users/@me/lists?maxResults=20', { headers: H });
    const why = async (r) => { try { const j = await r.json(), e = j.error || {}, d = (e.details || []).find(x => x.reason) || {}, er = (e.errors || [])[0] || {}; return { reason: d.reason || er.reason || e.status || '', msg: e.message || '' }; } catch (x) { return { reason: '', msg: '' }; } };
    if (lr.status === 401 || lr.status === 403) {
      let w = await why(lr);
      /* Zugriffstoken stammt noch aus der Zeit vor der Tasks-Berechtigung (nur Drive): neu anfordern – öffnet einmal das Google-Fenster */
      if (lr.status === 401 || /insufficient|SCOPE/i.test(w.reason + ' ' + w.msg)) {
        if (silent) throw new Error('Tasks-Berechtigung fehlt');
        window.cloud.driveForget(); tok = await window.cloud.driveToken(true); H = { Authorization: 'Bearer ' + tok };
        lr = await fetch(api + '/users/@me/lists?maxResults=20', { headers: H }); if (!lr.ok) w = await why(lr);
      }
      if (!lr.ok) throw new Error(/SERVICE_DISABLED|accessNotConfigured|has not been used|disabled/i.test(w.reason + ' ' + w.msg) ? 'Die Google Tasks API ist im Google-Projekt noch nicht aktiviert (Cloud Console → APIs & Dienste → Bibliothek → Google Tasks API).'
        : /insufficient|SCOPE/i.test(w.reason + ' ' + w.msg) ? 'Die Tasks-Berechtigung wurde nicht erteilt – im Google-Fenster bitte den Haken bei Google Tasks setzen.' : 'Kein Zugriff (' + (w.reason || lr.status) + ')' + (w.msg ? ': ' + w.msg.slice(0, 120) : ''));
    } else if (!lr.ok) throw new Error('Google Tasks ' + lr.status);
    const lists = (await lr.json()).items || [], lab = getLab(); lab.bt = lab.bt || []; lab.lt = lab.lt || []; const have = new Set(lab.bt.concat(lab.lt).map(e => e.src).filter(Boolean)); let n = 0, nl = 0, skip = 0; const flag = [];
    for (const L of lists) {
      const tr = await fetch(api + '/lists/' + encodeURIComponent(L.id) + '/tasks?showCompleted=false&maxResults=100', { headers: H }); if (!tr.ok) continue;
      for (const t of ((await tr.json()).items || [])) {
        if (L.title === GT_LIST) continue;                                            // gespiegelte Fälligkeiten nicht einlesen
        const lv = gtParseLt(t.title), v = lv == null ? gtParse(t.title) : null; if (lv == null && !v) continue; const src = 'gt:' + t.id;
        if (lv != null) {                                                             // Langzeitverbrauch (Bordcomputer „Seit Kauf“)
          if (!have.has(src)) { const at = t.updated || new Date().toISOString(), k = await gtKmAt(at), e = { id: labId(), date: wxIso(new Date(at)), at, k100: lv, src, note: 'per Sprachbefehl' }; if (k.km > 0) e.km = k.km; if (k.est || !(k.km > 0)) e.kmEst = true; lab.lt.push(e); have.add(src); nl++; }
        } else if (!have.has(src)) {
          const at = t.updated || new Date().toISOString(), en = { id: labId(), at, t: v.t, src }; if (v.ctx) en.ctx = v.ctx;
          const out = await gtOutAt(at); if (Number.isFinite(out)) en.out = out;
          lab.bt.push(en); have.add(src); n++; flag.push(en);
        } else skip++;
        await fetch(api + '/lists/' + encodeURIComponent(L.id) + '/tasks/' + encodeURIComponent(t.id), { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) }).catch(() => { });
      }
    }
    if (n || nl) { lab.bt.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); setLab(lab); if (n) btmVal = null; try { btFillTrips(); ltFillKm(); } catch (e) { } }
    btmMsg = n || nl ? '✓ ' + [n ? n + ' Akku' : '', nl ? nl + ' Langzeit' : ''].filter(Boolean).join(' + ') + ' aus Google Tasks' : silent ? '' : 'Keine neuen „Akku …“- oder „Langzeit …“-Aufgaben.';
    const jumps = flag.map(en => [en, btJump(en, lab.bt)]).filter(x => x[1]);                    // nur Hinweis, Werte bleiben gespeichert
    if (jumps.length) btmMsg += ' · <span class="text-amber-600 dark:text-amber-400">' + (jumps.length === 1 ? '⚠️ ' + fmt(jumps[0][0].t, 0) + ' °C, ' + btJumpD(jumps[0][1]) + ' – bitte prüfen' : '⚠️ ' + jumps.length + '× ≥ ' + BT_JUMP + '° Sprung – im Verlauf prüfen') + '</span>';
    save('enyaq.gtLast', new Date().toISOString()); try { renderVcStatus(); } catch (e) { }
    renderBtm(); try { renderLtm(); } catch (e) { } if (n && currentView === 'recs') renderRecs();
  } catch (e) { if (!silent) { btmMsg = '⚠️ Google Tasks: kein Zugriff'; renderBtm();
      $('au-sheet-box').innerHTML = '<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">Google Tasks</p><p class="text-sm text-left">' + esc(e.message || String(e)) + '</p><button type="button" data-cc="close" class="h-12 w-full rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">Schließen</button>';
      $('au-sheet').classList.remove('hidden'); } }
  finally { gtBusy = false; }
}
/* =====================================================================
   Fälligkeiten → Google Tasks (Liste „EnyaqStrom“): jede offene Fälligkeit als Aufgabe (mit Datum, sonst ohne), Titel/Notiz/Datum werden
   bei Änderungen nachgezogen; erledigt/gelöscht → Aufgabe entfernt. In Google Tasks abgehakt → hier „Erledigt“ (Wiederholung setzt neu an).
   Verknüpfung über r.gtId (am Datensatz, also auf allen Geräten gleich), r.gtSig = zuletzt übertragener Stand. Laufzeiten werden nicht gespiegelt.
   ===================================================================== */
const GT_LIST = 'EnyaqStrom';
const gtMirrorOn = () => !!getSettings().gtMirror;
function gtTaskOf(r) {
  const km = r.dueKm > 0 ? 'Fällig bei ' + fmt(r.dueKm, 0) + ' km' : '', rep = isRepeating(r) ? remRepeatText(r) : '';
  const notes = [km, rep, r.note || '', 'Aus EnyaqStrom – hier abhaken = in der App erledigt.'].filter(Boolean).join('\n');
  const t = { title: r.title, notes }; if (r.dueDate) t.due = r.dueDate + 'T00:00:00.000Z'; return t;
}
const gtSigOf = (t) => [t.title, t.notes, t.due || ''].join('|');
let gtMirBusy = false, gtMirT = null;
const gtMirrorSoon = () => { if (!gtMirrorOn()) return; clearTimeout(gtMirT); gtMirT = setTimeout(() => gtMirror(true), 1500); };
async function gtMirror(silent) {
  const msg = (t) => { const el = $('gt-sync-msg'); if (el) el.textContent = t; };
  if (gtMirBusy || !gtMirrorOn()) return; if (!window.cloud?.isSignedIn()) { if (!silent) msg('Bitte zuerst bei Google anmelden.'); return; }
  if (silent && !window.cloud.driveReady()) return;
  gtMirBusy = true; if (!silent) msg('Gleiche mit Google Tasks ab …');
  try {
    const tok = await window.cloud.driveToken(), H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, api = 'https://tasks.googleapis.com/tasks/v1';
    const J = async (r) => { if (!r.ok) throw new Error('Google Tasks ' + r.status); return r.status === 204 ? {} : r.json(); };
    /* Liste finden oder anlegen (ID geräteübergreifend in den Einstellungen) */
    let lid = getSettings().gtList;
    const lists = (await J(await fetch(api + '/users/@me/lists?maxResults=100', { headers: H }))).items || [];
    if (!lid || !lists.some(l => l.id === lid)) { const f = lists.find(l => l.title === GT_LIST); lid = f ? f.id : (await J(await fetch(api + '/users/@me/lists', { method: 'POST', headers: H, body: JSON.stringify({ title: GT_LIST }) }))).id; nagSet({ gtList: lid }); }
    const L = api + '/lists/' + encodeURIComponent(lid) + '/tasks';
    const tasks = (await J(await fetch(L + '?showCompleted=true&showHidden=true&maxResults=100', { headers: H }))).items || [], byId = new Map(tasks.map(t => [t.id, t]));
    let list = getReminders(), changed = false, nNew = 0, nUpd = 0, nDel = 0, nDone = 0;
    const put = (r, upd) => { list = list.map(x => String(x.id) === String(r.id) ? cleanRem({ ...x, ...upd }) : x); changed = true; };
    /* 1. In Google Tasks abgehakt → hier erledigt (wie „Erledigt“ ohne Kosten) */
    for (const r of list.filter(r => !isRun(r) && !r.doneAt && r.gtId)) {
      const t = byId.get(r.gtId); if (!t || t.status !== 'completed') continue;
      const at = t.completed ? new Date(t.completed) : new Date(), km = lastKnownKm(), log = remLog(r).map(e => { const o = { at: e.at }; if (e.km > 0) o.km = e.km; if (e.cost > 0) o.cost = e.cost; return o; }).concat(km > 0 ? { at: at.toISOString(), km: Math.round(km) } : { at: at.toISOString() }).slice(-REM_LOG_MAX);
      const upd = { lastDoneAt: at.toISOString(), lastDoneKm: km ?? undefined, log };
      if (isRepeating(r)) { upd.startDate = ymd(at); upd.startKm = km ?? undefined; if (hasRepTime(r)) upd.dueDate = ymd(remStep(at, r)); if (r.repeatKm > 0 && km != null) upd.dueKm = km + r.repeatKm; upd.gtSig = undefined; }   // neue Fälligkeit → Aufgabe wird wieder geöffnet
      else { upd.doneAt = at.toISOString(); }
      put(r, upd); nDone++;
    }
    /* 2. Offene Fälligkeiten anlegen bzw. aktualisieren */
    for (const r of list.filter(r => !isRun(r) && !r.doneAt)) {
      const want = gtTaskOf(r), sig = gtSigOf(want), t = r.gtId ? byId.get(r.gtId) : null;
      if (!t) { const c = await J(await fetch(L, { method: 'POST', headers: H, body: JSON.stringify(want) })); put(r, { gtId: c.id, gtSig: sig }); nNew++; }
      else if (r.gtSig !== sig || t.status === 'completed') { await J(await fetch(L + '/' + encodeURIComponent(t.id), { method: 'PATCH', headers: H, body: JSON.stringify({ ...want, status: 'needsAction', completed: null }) })); put(r, { gtSig: sig }); nUpd++; }
    }
    /* 3. Aufgaben ohne offene Fälligkeit (erledigt, gelöscht, zur Laufzeit geworden) entfernen */
    const keep = new Set(list.filter(r => !isRun(r) && !r.doneAt && r.gtId).map(r => r.gtId));
    for (const t of tasks) if (!keep.has(t.id) && /Aus EnyaqStrom/.test(t.notes || '')) { await fetch(L + '/' + encodeURIComponent(t.id), { method: 'DELETE', headers: H }).catch(() => { }); nDel++; }
    list.filter(r => (isRun(r) || r.doneAt) && r.gtId).forEach(r => put(r, { gtId: undefined, gtSig: undefined }));
    if (changed) { gtMirSkip = true; commitReminders(list); gtMirSkip = false; try { renderReminders(); } catch (e) { } }
    msg('✓ Abgeglichen ' + hhmm(Date.now()) + (nNew + nUpd + nDel + nDone ? ' · ' + [nNew ? nNew + ' neu' : '', nUpd ? nUpd + ' geändert' : '', nDone ? nDone + ' in Tasks erledigt' : '', nDel ? nDel + ' entfernt' : ''].filter(Boolean).join(', ') : ' · alles aktuell'));
  } catch (e) { msg('Fehler: ' + (e.message || e)); }
  finally { gtMirBusy = false; }
}
let gtMirSkip = false;
$('set-gt-mirror').addEventListener('change', (e) => { setQuickSetting('gtMirror', e.target.checked || undefined); if (e.target.checked) gtMirror(false); else $('gt-sync-msg').textContent = 'Aus – bestehende Aufgaben bleiben in Google Tasks, bis du die Liste dort löschst.'; });
$('gt-sync').addEventListener('click', () => { if (!gtMirrorOn()) { $('set-gt-mirror').checked = true; setQuickSetting('gtMirror', true); } gtMirror(false); });
$('vc-fetch').addEventListener('click', () => gtImport(false));
setTimeout(() => { gtImport(true); gtMirror(true); try { ltFillKm(); btFillTrips(); } catch (e) { } }, 3000); document.addEventListener('visibilitychange', () => { if (!document.hidden) { gtImport(true); gtMirror(true); } });
renderBtm(); renderLtm();
if (wxLoc() && !$('wxo-card').classList.contains('hidden')) { /* Prognose sichtbar: Beobachter setzt die Startkarte */ } else dashSwipeTo(dashDefaultIdx(), false);
dashSwipeSync();
if (btOut.v == null && wxLoc()) btOutside().then(() => { if (!btmSaved) renderBtm(); }).catch(() => { });

