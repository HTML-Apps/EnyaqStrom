/* =====================================================================
   Reifen: Profiltiefe je Satz (Sommer/Allwetter/Winter), 4 Reifen × 3 Messpunkte (außen, mitte, innen) in mm.
   lab.tires = [{ id, set: 'so'|'aw'|'wi', date, km?, v: { VL: [a, m, i], VR, HL, HR }, note? }]
   ===================================================================== */
const TIRE_SETS = [['so', '☀️ Sommer'], ['aw', '🌦️ Allwetter'], ['wi', '❄️ Winter']], TIRE_POS = ['VL', 'VR', 'HL', 'HR'];
const TIRE_NAME = { VL: 'vorne links', VR: 'vorne rechts', HL: 'hinten links', HR: 'hinten rechts' }, TIRE_COL = { VL: '#38bdf8', VR: '#a78bfa', HL: '#f97316', HR: '#facc15' };
const TIRE_PT = ['außen', 'mitte', 'innen'];
let tireSet = null, tireSel = null, tireEdit = null;
const tAvg = (a) => { const v = (a || []).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const tCol = (v) => v == null ? '#64748b' : v >= 5 ? '#10b981' : v >= 4 ? '#eab308' : v >= 3 ? '#f97316' : '#ef4444';
const tFmt = (v) => v == null ? '–' : fmt(v, 1);
function tireList(set) { return (getLab().tires || []).filter(m => m.set === set && m.date).sort((a, b) => a.date.localeCompare(b.date) || (a.km || 0) - (b.km || 0)); }
function tirePrognosis(ms) {                                                     // linearer Verschleiß je Reifen (erste → letzte Messung), wann 3 mm erreicht
  if (ms.length < 2) return null; const f = ms[0], l = ms[ms.length - 1], dd = (Date.parse(l.date) - Date.parse(f.date)) / 864e5, dk = f.km > 0 && l.km > 0 ? l.km - f.km : null; if (!(dd > 20)) return null;
  let worst = null;
  TIRE_POS.forEach(p => { const a = tAvg(f.v[p]), b = tAvg(l.v[p]); if (a == null || b == null || !(a - b > 0.05)) return; const rate = (a - b) / dd, rest = b - 3; if (rest <= 0) { worst = { p, days: 0, km: 0 }; return; }
    const days = rest / rate, km = dk > 0 ? rest / ((a - b) / dk) : null; if (!worst || days < worst.days) worst = { p, days, km, perK: dk > 0 ? (a - b) / dk * 10000 : null }; });
  if (!worst) return null; worst.date = new Date(Date.parse(l.date) + worst.days * 864e5); worst.atKm = worst.km != null && l.km ? l.km + worst.km : null; return worst;
}
function tireChart(ms) {
  const W = 296, H = 118, L = 24, R = 52, T = 8, B = 18, t0 = Date.parse(ms[0].date), t1 = Math.max(Date.parse(ms[ms.length - 1].date), t0 + 864e5);
  const X = (d) => ms.length < 2 ? (L + W - R) / 2 : L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R), Y = (v) => T + (1 - (v - 1) / 8) * (H - T - B);
  let g = [2, 4, 6, 8].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" class="text-slate-200 dark:text-slate-800"/><text x="${L - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`).join('');
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(3).toFixed(1)}" y2="${Y(3).toFixed(1)}" stroke="#f97316" stroke-dasharray="3 3"/><text x="${W - R + 4}" y="${(Y(3) + 3).toFixed(1)}" font-size="8.5" fill="#f97316">3 empf.</text>`
    + `<line x1="${L}" x2="${W - R}" y1="${Y(1.6).toFixed(1)}" y2="${Y(1.6).toFixed(1)}" stroke="#ef4444" stroke-dasharray="3 3"/><text x="${W - R + 4}" y="${(Y(1.6) + 3).toFixed(1)}" font-size="8.5" fill="#ef4444">1,6 Pflicht</text>`;
  TIRE_POS.forEach(p => { const pts = ms.map(m => [X(m.date), tAvg(m.v[p])]).filter(x => x[1] != null), op = tireSel && tireSel !== p ? 0.18 : 1;
    if (pts.length > 1) g += `<polyline points="${pts.map(([x, v]) => x.toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')}" fill="none" stroke="${TIRE_COL[p]}" stroke-width="${tireSel === p ? 2.8 : 2}" opacity="${op}" stroke-linejoin="round"/>`;
    g += pts.map(([x, v]) => `<circle cx="${x.toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="${TIRE_COL[p]}" opacity="${op}"/>`).join(''); });
  const lab = (d) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' });
  const xi = ms.length <= 4 ? ms.map((_, i) => i) : [0, Math.round((ms.length - 1) / 2), ms.length - 1];
  g += xi.map(i => `<text x="${X(ms[i].date).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#94a3b8">${lab(ms[i].date)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Profiltiefe je Reifen über die Zeit">${g}</svg>`;
}
function renderTires() {
  const el = $('tire-body'); if (!el) return; const all = getLab().tires || [];
  if (!tireSet) { const last = all.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; tireSet = last ? last.set : 'so'; }
  $('tire-seg').innerHTML = TIRE_SETS.map(([k, l]) => `<button type="button" data-tset="${k}" class="flex-1 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap ${tireSet === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-600 dark:text-slate-400'}">${l}</button>`).join('');
  const ms = tireList(tireSet), last = ms[ms.length - 1];
  if (!last) { el.innerHTML = `<p class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 text-sm text-slate-600 dark:text-slate-300 text-left">Für den ${TIRE_SETS.find(s => s[0] === tireSet)[1].split(' ')[1]}satz gibt es noch keine Messung. Über „+ Messung“ die Profiltiefe aller vier Reifen eintragen – je Reifen außen, mitte und innen, immer an denselben Stellen (z. B. Hauptrille an der Ventil-Position). Werte vom Kauf mit dem damaligen Datum nachtragen.</p>`; return; }
  const next = new Date(Date.parse(last.date + 'T12:00:00')); next.setMonth(next.getMonth() + 6); const due = next < new Date();
  const tile = (p) => { const v = last.v[p] || [], a = tAvg(v), prev = ms.length > 1 ? tAvg(ms[ms.length - 2].v[p]) : null;
    return `<button type="button" data-tire="${p}" class="flex h-[96px] w-full flex-col items-center justify-center rounded-2xl border-[1.5px] bg-slate-100 dark:bg-slate-800 px-1 ${tireSel === p ? 'ring-2 ring-offset-0' : ''}" style="border-color:${tCol(a)};${tireSel === p ? '--tw-ring-color:' + TIRE_COL[p] : ''}">
      <span class="text-[10.5px] text-slate-500 dark:text-slate-400">${TIRE_NAME[p]}</span>
      <span class="font-barlow text-[26px] font-bold leading-none" style="color:${tCol(a)}">${tFmt(a)}<span class="text-[13px]"> mm</span></span>
      <span class="mt-1 flex gap-[3px] text-[10px] tabular-nums">${[0, 1, 2].map(i => `<span class="rounded bg-white dark:bg-slate-900 px-1" title="${TIRE_PT[i]}">${tFmt(v[i])}</span>`).join('')}</span>
      ${prev != null && a != null ? `<span class="mt-0.5 text-[9.5px] text-slate-500 dark:text-slate-400">${a - prev > 0.04 ? '+' : a - prev < -0.04 ? '−' : '±'}${fmt(Math.abs(a - prev), 1)} seit letzter</span>` : ''}</button>`; };
  const car = `<div class="relative h-[204px] w-[102px]"><img src="/Bilder/Enyaq/enyaq-top.webp" alt="Enyaq von oben" width="474" height="944" draggable="false" class="h-full w-full select-none object-contain">`
    + [['left', 23.5, 'VL'], ['right', 23.5, 'VR'], ['left', 76.5, 'HL'], ['right', 76.5, 'HR']].map(([sd, y, p]) => `<span class="absolute h-[34px] w-[7px] -translate-y-1/2 rounded-[3px] shadow" style="${sd}:3px;top:${y}%;background:${tCol(tAvg(last.v[p]))}"></span>`).join('') + '</div>';
  const pg = tirePrognosis(ms);
  let h = `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-2">
    <div class="flex items-baseline justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span class="text-left">${labD(last.date)}${last.km ? ' · ' + fmt(last.km, 0) + ' km' : ''}</span><span class="shrink-0 font-semibold ${due ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}">${due ? 'Messung fällig' : 'nächste: ' + next.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}</span></div>
    <div class="grid grid-cols-[1fr_102px_1fr] items-center gap-x-1.5"><div class="space-y-3">${tile('VL')}${tile('HL')}</div><div class="flex justify-center">${car}</div><div class="space-y-3">${tile('VR')}${tile('HR')}</div></div>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 text-center">je Reifen außen · mitte · innen · Antippen hebt den Reifen im Verlauf hervor</p></div>`;
  h += `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 space-y-1.5"><div class="flex items-baseline justify-between"><p class="text-sm font-bold">Verlauf${pg ? ' &amp; Prognose' : ''}</p><span class="text-[11px] text-slate-500 dark:text-slate-400">Ø je Reifen in mm</span></div>
    ${tireChart(ms)}<div class="flex gap-3 text-[11px] text-slate-500 dark:text-slate-400">${TIRE_POS.map(p => `<span><span class="inline-block h-[3px] w-2.5 align-middle" style="background:${TIRE_COL[p]}"></span> ${p}</span>`).join('')}</div>
    ${pg ? `<p class="rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 text-left">${pg.days === 0 ? `<b>${TIRE_NAME[pg.p]}</b> ist bereits bei 3 mm oder darunter.` : `Am schnellsten nutzt sich <b>${TIRE_NAME[pg.p]}</b> ab${pg.perK ? ' (' + fmt(pg.perK, 1) + ' mm je 10.000 km)' : ''}. 3 mm voraussichtlich ${pg.atKm ? 'bei <b>~' + fmt(Math.round(pg.atKm / 1000) * 1000, 0) + ' km</b> (' : '<b>'}${pg.date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}${pg.atKm ? ')' : '</b>'}.`}</p>` : `<p class="text-[11px] text-slate-500 dark:text-slate-400 text-left">Ab der zweiten Messung zeigt die App, welcher Reifen sich am schnellsten abnutzt und wann 3 mm erreicht sind.</p>`}</div>`;
  if (tireSel) h += `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm px-4 py-3"><p class="text-sm font-bold text-left">${TIRE_NAME[tireSel][0].toUpperCase() + TIRE_NAME[tireSel].slice(1)}</p><div class="mt-1 grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-1 text-[11px] text-slate-500 dark:text-slate-400"><span>Datum</span><span class="text-right">außen</span><span class="text-right">mitte</span><span class="text-right">innen</span><span class="text-right">Ø</span></div>${ms.slice().reverse().map(m => `<div class="grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-1 border-t border-slate-100 dark:border-slate-800 py-1.5 text-[13px] tabular-nums"><span>${labD(m.date)}</span>${[0, 1, 2].map(i => `<span class="text-right">${tFmt((m.v[tireSel] || [])[i])}</span>`).join('')}<b class="text-right" style="color:${tCol(tAvg(m.v[tireSel]))}">${tFmt(tAvg(m.v[tireSel]))}</b></div>`).join('')}</div>`;
  h += `<details class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm px-4 py-3"><summary class="cursor-pointer text-sm font-semibold">Alle Messungen (${ms.length})</summary><div class="mt-2">${ms.slice().reverse().map(m => `<button type="button" data-tm="${esc(m.id)}" class="flex w-full items-center gap-2 border-t border-slate-100 dark:border-slate-800 py-2 text-left text-[13px]"><span class="w-[84px] shrink-0">${labD(m.date)}</span><span class="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">${m.km ? fmt(m.km, 0) + ' km · ' : ''}${TIRE_POS.map(p => p + ' ' + tFmt(tAvg(m.v[p]))).join(' · ')}</span><span class="shrink-0 text-slate-400">›</span></button>`).join('')}</div></details>`;
  el.innerHTML = h;
}
function openTireSheet(id) {
  const lab = getLab(), m = id ? (lab.tires || []).find(x => x.id === id) : null; tireEdit = m ? m.id : null;
  const set = m ? m.set : tireSet || 'so', prev = tireList(set).filter(x => !m || x.id !== m.id).pop(), km0 = (() => { try { return lastKnownKm(); } catch (_) { return null; } })();
  const cell = (p, i) => { const v = m ? (m.v[p] || [])[i] : undefined, ph = prev ? (prev.v[p] || [])[i] : undefined;
    return `<input data-tv="${p}:${i}" type="text" inputmode="decimal" autocomplete="off" aria-label="${TIRE_NAME[p]} ${TIRE_PT[i]}" value="${v != null ? String(v).replace('.', ',') : ''}" placeholder="${ph != null ? String(ph).replace('.', ',') : ''}" class="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-0.5 py-2.5 text-center text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500">`; };
  const blk = (p) => `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-2"><p class="text-xs font-semibold text-left">${TIRE_NAME[p]}</p><div class="mt-1 grid grid-cols-3 gap-1">${[0, 1, 2].map(i => cell(p, i)).join('')}</div><div class="mt-0.5 grid grid-cols-3 gap-1 text-center text-[10px] text-slate-500 dark:text-slate-400">${TIRE_PT.map(t => `<span>${t}</span>`).join('')}</div></div>`;
  $('tire-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${m ? 'Messung bearbeiten' : 'Profiltiefe messen'}</p>
    <div id="tire-set-in" class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-[13px]">${TIRE_SETS.map(([k, l]) => `<button type="button" data-tsin="${k}" class="flex-1 rounded-lg py-1.5 font-medium ${k === set ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${l}</button>`).join('')}</div>
    <div class="grid grid-cols-[1.35fr_1fr] gap-2"><div class="min-w-0"><label for="tire-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="tire-date" type="date" value="${esc(m ? m.date : wxIso(new Date()))}" class="${inCls} !px-1.5 text-[13px]"></div>${fld('tire-km', 'km-Stand', m ? m.km : (km0 || undefined), '', 'numeric').replace('>km-Stand</label>', '>km-Stand</label><button type="button" data-kmfetch data-kmfor="tire-km" title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf ml-1 align-middle relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition">↻</button>')}</div>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 text-left">mm mit Komma, z. B. 6,8. ${prev ? 'Grau = letzte Messung (' + labD(prev.date) + ').' : ''} Immer an denselben Stellen messen.</p>
    <div class="grid grid-cols-2 gap-2">${blk('VL')}${blk('VR')}${blk('HL')}${blk('HR')}</div>
    <div><label for="tire-note" class="text-xs text-slate-500 dark:text-slate-400">Notiz</label><input id="tire-note" type="text" maxlength="100" value="${esc((m && m.note) || '')}" placeholder="z. B. nach Reifenwechsel, Reifen getauscht" class="${inCls}"></div>
    <p id="tire-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-tss="${m ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${m ? 'text-red-600 dark:text-red-400' : ''}">${m ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-tss="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  $('tire-sheet').classList.remove('hidden');
}
$('tire-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-tset]'); if (b) { tireSet = b.dataset.tset; tireSel = null; renderTires(); } });
$('tire-body').addEventListener('click', (e) => { const t = e.target.closest('[data-tire]'); if (t) { tireSel = tireSel === t.dataset.tire ? null : t.dataset.tire; renderTires(); return; } const m = e.target.closest('[data-tm]'); if (m) openTireSheet(m.dataset.tm); });
$('tire-add').addEventListener('click', () => openTireSheet(null));
$('tire-sheet').addEventListener('click', (e) => {
  if (e.target === $('tire-sheet')) { $('tire-sheet').classList.add('hidden'); return; }
  const si = e.target.closest('[data-tsin]'); if (si) { si.parentElement.querySelectorAll('[data-tsin]').forEach(x => { const on = x === si; x.classList.toggle('bg-white', on); x.classList.toggle('dark:bg-slate-600', on); x.classList.toggle('shadow-sm', on); x.classList.toggle('text-slate-500', !on); x.classList.toggle('dark:text-slate-400', !on); }); return; }
  const b = e.target.closest('[data-tss]'); if (!b) return; const act = b.dataset.tss, lab = getLab(); lab.tires = lab.tires || [];
  if (act === 'close') { $('tire-sheet').classList.add('hidden'); return; }
  if (act === 'del') { const snap = labSnap(); lab.tires = lab.tires.filter(x => x.id !== tireEdit); setLab(lab); $('tire-sheet').classList.add('hidden'); labUndo('Messung gelöscht', snap); return; }
  const v = {}; let n = 0, bad = false;
  TIRE_POS.forEach(p => { v[p] = [0, 1, 2].map(i => { const t = document.querySelector(`[data-tv="${p}:${i}"]`).value.trim(); if (t === '') return null; const x = deDec(t); if (!(x >= 0 && x <= 15)) { bad = true; return null; } n++; return Math.round(x * 10) / 10; }); });
  if (bad) { $('tire-msg').textContent = 'Bitte Profiltiefen in mm zwischen 0 und 15 eintragen (z. B. 6,8).'; return; }
  if (!n) { $('tire-msg').textContent = 'Bitte mindestens einen Messwert eintragen.'; return; }
  const km = deDec(String($('tire-km').value).replace(/\./g, '')), set = document.querySelector('#tire-set-in .bg-white')?.dataset.tsin || 'so';
  const m = { id: tireEdit || labId(), set, date: $('tire-date').value || wxIso(new Date()), v };
  if (Number.isFinite(km) && km > 0) m.km = Math.round(km); const note = $('tire-note').value.trim(); if (note) m.note = note;
  lab.tires = tireEdit ? lab.tires.map(x => x.id === tireEdit ? m : x) : lab.tires.concat(m); tireSet = set; setLab(lab); $('tire-sheet').classList.add('hidden');
});

/* =====================================================================
   Wunschliste (Zubehör): lab.wish = [{ id, title, desc?, price?, prio: 'hoch'|'mittel'|'niedrig', when?, links?: [url], note?, bought? (JJJJ-MM-TT) }]
   ===================================================================== */
const WISH_PRIO = [['hoch', '#ef4444', 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'], ['mittel', '#f59e0b', 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'], ['niedrig', '#64748b', 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200']];
const WISH_WHEN = ['❄️ vor dem Winter', '☀️ vor dem Sommer', '🧳 vor dem Urlaub', '🎁 Geschenkidee'];
let wishTab = 'open', wishEdit = null, wishLinks = [];
const wHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
const wUrl = (t) => { t = String(t || '').trim(); if (!t) return null; if (!/^https?:\/\//i.test(t) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) t = 'https://' + t; try { const u = new URL(t); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; } };
const LINK_I = '<svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
function renderWish() {
  const el = $('wish-body'); if (!el) return; const all = getLab().wish || [], open = all.filter(w => !w.bought), done = all.filter(w => w.bought);
  const rank = (p) => WISH_PRIO.findIndex(x => x[0] === p);
  $('wish-seg').innerHTML = [['open', 'Offen · ' + open.length], ['done', 'Gekauft · ' + done.length]].map(([k, l]) => `<button type="button" data-wtab="${k}" class="flex-1 py-1.5 rounded-lg text-[13px] font-medium ${wishTab === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-600 dark:text-slate-400'}">${l}</button>`).join('');
  const list = wishTab === 'open' ? open.slice().sort((a, b) => rank(a.prio) - rank(b.prio) || String(a.id).localeCompare(String(b.id))) : done.slice().sort((a, b) => String(b.bought).localeCompare(String(a.bought)));
  const sum = list.reduce((s, w) => s + (w.price > 0 ? w.price : 0), 0);
  const chip = (t, cls) => `<span class="inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[11px] ${cls}">${t}</span>`;
  let h = list.length ? `<div class="flex items-baseline justify-between px-1 text-xs text-slate-500 dark:text-slate-400"><span>${wishTab === 'open' ? 'Summe offen' : 'Summe gekauft'}</span><b class="text-base text-slate-900 dark:text-slate-100 tabular-nums">${eur(sum)}</b></div>` : '';
  h += list.map(w => { const pr = WISH_PRIO.find(x => x[0] === w.prio) || WISH_PRIO[1];
    return `<div data-wish="${esc(w.id)}" role="button" tabindex="0" class="flex cursor-pointer gap-2.5 rounded-2xl bg-white dark:bg-slate-900 shadow-sm p-3 active:scale-[0.99] transition">
      <button type="button" data-wbuy="${esc(w.id)}" aria-label="${w.bought ? 'Wieder auf offen setzen' : 'Als gekauft markieren'}" class="mt-0.5 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-lg border-2 ${w.bought ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'}">${w.bought ? '<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : ''}</button>
      <span class="min-w-0 flex-1 space-y-1"><span class="flex items-baseline justify-between gap-2"><b class="min-w-0 text-[14.5px] ${w.bought ? 'text-slate-500 line-through decoration-1' : ''} text-left">${esc(w.title)}</b>${w.price > 0 ? `<b class="shrink-0 text-[14.5px] tabular-nums">${eur(w.price)}</b>` : ''}</span>
      ${w.desc ? `<span class="block text-xs text-slate-500 dark:text-slate-400 text-left">${esc(w.desc)}</span>` : ''}
      <span class="flex flex-wrap gap-1">${w.bought ? chip('✓ gekauft ' + labD(w.bought), 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300') : chip(`<span style="color:${pr[1]}">●</span> ${pr[0]}`, 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}${w.when && !w.bought ? chip(esc(w.when), 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') : ''}${(w.links || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener" data-wlink class="inline-flex h-[22px] max-w-full items-center gap-1 rounded-md bg-sky-50 dark:bg-slate-800 px-1.5 text-[11px] text-sky-700 dark:text-sky-300">${LINK_I}<span class="truncate">${esc(wHost(u))}</span></a>`).join('')}</span>
      ${w.note ? `<span class="block text-[11px] text-slate-500 dark:text-slate-400 text-left">${esc(w.note)}</span>` : ''}</span></div>`; }).join('');
  if (!list.length) h = `<p class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 text-sm text-slate-600 dark:text-slate-300 text-left">${wishTab === 'open' ? 'Noch keine Wünsche. Über „+“ Zubehör eintragen, das du dir irgendwann zulegen möchtest – mit Preis, Wichtigkeit und Links zum Shop.' : 'Noch nichts gekauft. Kästchen bei einem Wunsch antippen, wenn du ihn gekauft hast.'}</p>`;
  else if (wishTab === 'open') h += '<p class="text-center text-[11px] text-slate-500 dark:text-slate-400">Kästchen antippen = als gekauft markieren (auf Wunsch gleich als Kosten buchen)</p>';
  el.innerHTML = h;
}
/* Gekauft-Dialog: Abbrechen lässt den Wunsch unverändert offen */
let wishBuyId = null;
function openWishBuy(w) {
  wishBuyId = w.id; const btn = 'h-12 w-full rounded-2xl text-sm font-semibold active:scale-[0.98] transition';
  $('wish-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold text-left">„${esc(w.title)}“ gekauft?</p>
    <p class="text-sm text-slate-600 dark:text-slate-300 text-left">Der Wunsch wandert zu „Gekauft“.${w.price > 0 ? ' Du kannst ihn gleich als Kosten buchen (' + eur(w.price) + ', heute) – den Betrag passt du bei Bedarf in der Historie an.' : ''}</p>
    ${w.price > 0 ? `<button type="button" data-wb="cost" class="${btn} bg-emerald-600 text-white">Gekauft + als Kosten buchen</button>` : ''}
    <button type="button" data-wb="only" class="${btn} ${w.price > 0 ? 'bg-slate-200 dark:bg-slate-800' : 'bg-emerald-600 text-white'}">${w.price > 0 ? 'Nur als gekauft markieren' : 'Als gekauft markieren'}</button>
    <button type="button" data-wb="cancel" class="${btn} border border-slate-300 dark:border-slate-700">Abbrechen</button>`;
  $('wish-sheet').classList.remove('hidden');
}
function wishLinksPaint() {
  $('wish-links').innerHTML = wishLinks.map((u, i) => `<div class="flex h-10 items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 text-[13px] text-sky-700 dark:text-sky-300">${LINK_I}<span class="min-w-0 flex-1 truncate">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</span><button type="button" data-wlx="${i}" aria-label="Link entfernen" class="shrink-0 px-1 text-slate-400">✕</button></div>`).join('');
}
function openWishSheet(id) {
  const w = id ? (getLab().wish || []).find(x => x.id === id) : null; wishEdit = w ? w.id : null; wishLinks = (w && w.links || []).slice();
  $('wish-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${w ? 'Wunsch bearbeiten' : 'Wunsch hinzufügen'}</p>
    <div><label for="wish-title" class="text-xs text-slate-500 dark:text-slate-400">Was?</label><input id="wish-title" type="text" maxlength="60" value="${esc((w && w.title) || '')}" placeholder="z. B. Gummimatten Winter" class="${inCls}"></div>
    <div><label for="wish-desc" class="text-xs text-slate-500 dark:text-slate-400">Kurzbeschreibung (optional)</label><input id="wish-desc" type="text" maxlength="80" value="${esc((w && w.desc) || '')}" placeholder="z. B. Original Škoda, 4-teilig" class="${inCls}"></div>
    <div class="grid grid-cols-[0.8fr_1.2fr] gap-2">${fld('wish-price', 'ca. Preis €', w ? w.price : undefined, 'optional')}<div class="min-w-0"><label for="wish-when" class="text-xs text-slate-500 dark:text-slate-400">Wann?</label><input id="wish-when" list="wish-whens" type="text" maxlength="30" value="${esc((w && w.when) || '')}" placeholder="optional" class="${inCls}"><datalist id="wish-whens">${WISH_WHEN.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div></div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Wichtigkeit</p><div id="wish-prio" class="mt-1 flex gap-1.5">${WISH_PRIO.map(([k, c, cls]) => `<button type="button" data-wprio="${k}" class="flex-1 rounded-full border py-1.5 text-xs font-semibold ${((w && w.prio) || 'mittel') === k ? cls + ' border-transparent' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${k}</button>`).join('')}</div></div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Links</p><div id="wish-links" class="mt-1 space-y-1.5"></div>
      <button type="button" data-ws="paste" class="mt-1.5 flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-slate-400 dark:border-slate-600 text-[13px] text-slate-600 dark:text-slate-300">+ Link einfügen (aus Zwischenablage)</button>
      <div id="wish-lrow" class="mt-1.5 hidden flex gap-2"><input id="wish-lin" type="url" inputmode="url" autocomplete="off" placeholder="https://…" class="${inCls} !mt-0"><button type="button" data-ws="addl" class="shrink-0 rounded-xl bg-slate-200 dark:bg-slate-800 px-3 text-sm font-semibold">OK</button></div>
      <p id="wish-lmsg" class="mt-1 text-xs text-left text-slate-500 dark:text-slate-400 empty:hidden"></p></div>
    <div><label for="wish-note" class="text-xs text-slate-500 dark:text-slate-400">Notiz</label><input id="wish-note" type="text" maxlength="120" value="${esc((w && w.note) || '')}" placeholder="z. B. Größe, Farbe, Alternative" class="${inCls}"></div>
    <p id="wish-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-ws="${w ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${w ? 'text-red-600 dark:text-red-400' : ''}">${w ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-ws="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  wishLinksPaint(); $('wish-sheet').classList.remove('hidden');
}
function wishAddLink(t) {
  const u = wUrl(t), m = $('wish-lmsg'); if (!u) { m.textContent = 'Das sieht nicht nach einem Link aus. Bitte die Adresse unten einfügen.'; $('wish-lrow').classList.remove('hidden'); return false; }
  if (!wishLinks.includes(u)) wishLinks.push(u); wishLinksPaint(); m.textContent = '✓ ' + wHost(u) + ' hinzugefügt'; $('wish-lin').value = ''; return true;
}
$('wish-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-wtab]'); if (b) { wishTab = b.dataset.wtab; renderWish(); } });
$('wish-add').addEventListener('click', () => openWishSheet(null));
$('wish-body').addEventListener('click', (e) => {
  if (e.target.closest('[data-wlink]')) return;                                   // Link öffnet den Shop, nicht das Formular
  const bb = e.target.closest('[data-wbuy]');
  if (bb) {
    const lab = getLab(), w = (lab.wish || []).find(x => x.id === bb.dataset.wbuy); if (!w) return;
    if (w.bought) { lab.wish = lab.wish.map(x => x.id === w.id ? (({ bought, ...r }) => r)(x) : x); setLab(lab); return; }
    openWishBuy(w); return;                                                       // erst nach Bestätigung im Dialog als gekauft markieren
  }
  const c = e.target.closest('[data-wish]'); if (c) openWishSheet(c.dataset.wish);
});
$('wish-sheet').addEventListener('click', async (e) => {
  if (e.target === $('wish-sheet')) { wishBuyId = null; $('wish-sheet').classList.add('hidden'); return; }
  const pr = e.target.closest('[data-wprio]'); if (pr) { pr.parentElement.querySelectorAll('[data-wprio]').forEach(x => { const on = x === pr, cls = WISH_PRIO.find(p => p[0] === x.dataset.wprio)[2].split(' '); cls.concat('border-transparent').forEach(c => x.classList.toggle(c, on)); ['border-slate-300', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-300'].forEach(c => x.classList.toggle(c, !on)); x.dataset.on = on ? '1' : ''; }); return; }
  const wb = e.target.closest('[data-wb]');
  if (wb) {
    const act = wb.dataset.wb, id = wishBuyId; wishBuyId = null; $('wish-sheet').classList.add('hidden'); if (act === 'cancel') return;
    const lab = getLab(), w = (lab.wish || []).find(x => x.id === id); if (!w || w.bought) return;
    lab.wish = lab.wish.map(x => x.id === w.id ? { ...x, bought: wxIso(new Date()) } : x); setLab(lab);
    if (act === 'cost' && w.price > 0) { const cat = getCategories().includes('Zubehör') ? 'Zubehör' : 'Sonstiges';
      commitCosts(getCosts().concat({ id: Date.now(), date: new Date().toISOString(), title: w.title.slice(0, 80), amount: Math.round(w.price * 100) / 100, category: cat })); }
    return;
  }
  const lx = e.target.closest('[data-wlx]'); if (lx) { wishLinks.splice(Number(lx.dataset.wlx), 1); wishLinksPaint(); return; }
  const b = e.target.closest('[data-ws]'); if (!b) return; const act = b.dataset.ws, lab = getLab(); lab.wish = lab.wish || [];
  if (act === 'paste') { let t = ''; try { t = await navigator.clipboard.readText(); } catch (er) { } if (t && wishAddLink(t)) return; $('wish-lrow').classList.remove('hidden'); $('wish-lmsg').textContent = t ? $('wish-lmsg').textContent : 'Zwischenablage nicht lesbar – Link hier einfügen:'; $('wish-lin').focus(); return; }
  if (act === 'addl') { wishAddLink($('wish-lin').value); return; }
  if (act === 'close') { $('wish-sheet').classList.add('hidden'); return; }
  if (act === 'del') { const snap = labSnap(); lab.wish = lab.wish.filter(x => x.id !== wishEdit); setLab(lab); $('wish-sheet').classList.add('hidden'); labUndo('Wunsch gelöscht', snap); return; }
  const title = $('wish-title').value.trim(); if (!title) { $('wish-msg').textContent = 'Bitte angeben, was du dir wünschst.'; return; }
  const lt = $('wish-lin').value.trim(); if (lt && !wishAddLink(lt)) return;
  const price = deDec($('wish-price').value), prioEl = document.querySelector('#wish-prio [data-wprio].border-transparent');
  const old = wishEdit ? lab.wish.find(x => x.id === wishEdit) : null;
  const w = { id: wishEdit || labId(), title: title.slice(0, 60), prio: prioEl ? prioEl.dataset.wprio : 'mittel' };
  const desc = $('wish-desc').value.trim(), when = $('wish-when').value.trim(), note = $('wish-note').value.trim();
  if (desc) w.desc = desc; if (Number.isFinite(price) && price > 0) w.price = Math.round(price * 100) / 100; if (when) w.when = when; if (wishLinks.length) w.links = wishLinks.slice(); if (note) w.note = note; if (old && old.bought) w.bought = old.bought;
  lab.wish = old ? lab.wish.map(x => x.id === old.id ? w : x) : lab.wish.concat(w); setLab(lab); $('wish-sheet').classList.add('hidden');
});
$('wish-sheet').addEventListener('keydown', (e) => { if (e.target.id === 'wish-lin' && e.key === 'Enter') { e.preventDefault(); wishAddLink(e.target.value); } });

function renderRecs() {
  const lab = getLab(), byRoute = new Map();
  lab.recs.forEach(r => { const k = recDirKey(r), o = byRoute.get(k); if (!o || r.k100 < o.k100) byRoute.set(k, r); });   // je Strecke ein Eintrag (ältere Doppelte: der beste zählt)
  const recs = [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route, 'de'));
  if (isSimple()) recRoute = 'lt';                                                    // einfache Ansicht: nur Langzeitverbrauch
  if (!['all', 'speed', 'lt', 'bt'].includes(recRoute)) recRoute = 'all';
  const chip = (k, l) => `<button type="button" data-rr="${esc(k)}" class="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-semibold ${recRoute === k ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${esc(l)}</button>`;
  const rc = $('rec-chips'); rc.className = 'flex bg-slate-200 dark:bg-slate-800 rounded-xl p-1';
  rc.innerHTML = [['all', 'Rekorde'], ['speed', 'Tempomat'], ['lt', 'Langzeit'], ['bt', 'Akku °C']].map(([k2, l]) => `<button type="button" data-rr="${k2}" class="flex-1 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap ${recRoute === k2 ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-600 dark:text-slate-400'}">${l}</button>`).join('');
  $('rec-add').setAttribute('aria-label', recRoute === 'speed' ? 'Neue Messreihe' : recRoute === 'lt' ? 'Neue Ablesung' : recRoute === 'bt' ? 'Akku-Temperatur notieren' : 'Neuer Rekord');
  let h = '';
  if (recRoute === 'all') {
    const groups = new Map(); recs.forEach(r => { const k = recKey(r.route); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    h = [...groups.entries()].sort((a, b) => a[1][0].route.localeCompare(b[1][0].route, 'de')).map(([k, rs]) => {
      const meta = lab.routes[k] || {}, ab = rs.find(r => r.dir !== 'ba'), ba = rs.find(r => r.dir === 'ba'), two = !!(meta.both || (ab && ba));
      const dir = two ? (recDirSel[k] || (ab ? 'ab' : 'ba')) : (ab ? 'ab' : 'ba'), inDir = rs.filter(x => (x.dir === 'ba' ? 'ba' : 'ab') === dir), nowSea = recSeason({});
      const sea = recSeaSel[k] || (inDir.some(x => recSeason(x) === nowSea) ? nowSea : inDir.length ? recSeason(inDir[0]) : nowSea);
      const pick = (dd, ss) => rs.find(x => (x.dir === 'ba' ? 'ba' : 'ab') === dd && recSeason(x) === ss), r = pick(dir, sea), other = pick(dir === 'ba' ? 'ab' : 'ba', sea);
      const tb = (on) => on ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400';
      const tabs = `<span class="flex items-stretch rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">${two ? [['ab', 'Hinweg'], ['ba', 'Rückweg']].map(([v, l]) => `<span role="button" tabindex="0" data-rdir="${v}" data-rk="${esc(k)}" class="flex-[1.6] rounded-lg py-1.5 text-center ${tb(v === dir)}">${l}</span>`).join('') + '<span class="mx-1 my-1 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true"></span>' : ''}${['so', 'wi'].map(v => { const x = pick(dir, v); return `<span role="button" tabindex="0" data-rsea="${v}" data-rk="${esc(k)}" aria-label="${SEA_L[v]}" class="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 ${tb(v === sea)}"><span class="text-[14px] leading-none ${v === sea ? '' : 'opacity-60'}">${SEA_I[v]}</span></span>`; }).join('')}</span>`;
      const seaSeg = `<span class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">${['so', 'wi'].map(v => { const x = pick(dir, v); return `<span role="button" tabindex="0" data-rsea="${v}" data-rk="${esc(k)}" class="flex-1 rounded-lg py-1.5 text-center ${v === sea ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${SEA_I[v]} ${SEA_L[v]}${x ? ' · <span class="tabular-nums">' + fmt(x.k100, 1) + '</span>' : ''}</span>`; }).join('')}</span>`;
      const mp = hpN(meta.prof), prof = mp ? (dir === 'ba' ? hpRev(mp) : mp) : null, la = dir === 'ba' ? 'B' : 'A', lb = dir === 'ba' ? 'A' : 'B';
      const seg = two ? `<span class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">${[['ab', 'Hin · A → B'], ['ba', 'Rück · B → A']].map(([v, l]) => `<span role="button" tabindex="0" data-rdir="${v}" data-rk="${esc(k)}" class="flex-1 rounded-lg py-1.5 text-center ${v === dir ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${l}</span>`).join('')}</span>` : '';
      const cost = prof ? hpCost(prof) : null, costO = prof ? hpCost(hpRev(prof)) : null, tile = (l, v) => `<span class="rounded-xl bg-slate-100 dark:bg-slate-800/70 px-0.5 py-1.5 text-center"><span class="block text-[10.5px] text-slate-500 dark:text-slate-400">${l}</span><span class="block text-[14px] font-bold tabular-nums">${v}</span></span>`;
      const net = prof ? prof.pts[prof.pts.length - 1][1] - prof.pts[0][1] : 0, mxh = prof ? Math.max(...prof.pts.map(x => x[1])) : 0;
      const body = r ? `<span class="flex items-center gap-3"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">${CUP}</span><span><span class="block font-barlow text-[30px] font-bold leading-none text-emerald-600 dark:text-emerald-400">${fmt(r.k100, 1)} <span class="font-sans text-[13px] font-medium text-slate-500 dark:text-slate-400">kWh/100 km</span></span><span class="block text-xs text-slate-500 dark:text-slate-400">Bestwert · ${labD(r.date)}${other ? ' · ' + (dir === 'ba' ? 'Hinweg ' : 'Rückweg ') + fmt(other.k100, 1) : ''}</span></span></span>`
        : `<span class="block rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 text-left">Für ${two ? (dir === 'ba' ? 'den Rückweg' : 'den Hinweg') + ' im' : 'den'} ${SEA_L[sea]} noch kein Bestwert. Antippen zum Eintragen.</span>`;
      return `<div role="button" tabindex="0" data-rec="${esc(r ? r.id : '')}" data-newdir="${dir}" data-newsea="${sea}" data-route="${esc(rs[0].route)}" class="block w-full cursor-pointer rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 text-left active:scale-[0.99] transition space-y-2.5">
        <span class="flex items-baseline justify-between gap-2"><span class="min-w-0 truncate text-[15px] font-bold">${esc(rs[0].route)}</span><span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">${prof ? fmt(prof.km, 1) + ' km' : r && r.km ? fmt(r.km, 0) + ' km' : ''}</span></span>
        ${tabs}${body}
        ${meta.a && meta.b ? `<span class="block text-[11px] text-slate-500 dark:text-slate-400 truncate">${esc(hpLabel(dir === 'ba' ? meta.b : meta.a))} → ${meta.via ? 'über ' + esc(hpLabel(meta.via)) + ' → ' : ''}${esc(hpLabel(dir === 'ba' ? meta.a : meta.b))}</span>` : ''}
        ${prof ? hpSvg(prof, la, lb) + `<span class="grid grid-cols-4 gap-1.5">${tile('Anstieg', '↑ ' + prof.up + ' m')}${tile('Gefälle', '↓ ' + prof.dn + ' m')}${tile('Netto', (net > 0 ? '+' : net < 0 ? '−' : '') + Math.abs(net) + ' m')}${tile('Höchster', mxh + ' m')}</span>`
          + `<span class="block rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 text-left"><b class="text-slate-900 dark:text-slate-100">Höhe ${cost >= 0 ? 'kostet' : 'spart'} hier ≈ ${fmt(Math.abs(cost), 1)} kWh/100 km</b> (${dir === 'ba' ? 'Hinweg' : 'Rückweg'} ≈ ${fmt(costO, 1)}).${r ? ` Höhenbereinigt wäre dein Bestwert ≈ <b class="text-emerald-600 dark:text-emerald-400">${fmt(r.k100 - cost, 1)}</b> – damit mit flachen Strecken vergleichbar.` : ''}</span>` : ''}
        ${r && recChips(r) ? `<span class="flex flex-wrap gap-1">${recChips(r)}</span>` : ''}${r && r.note ? `<span class="block text-xs text-slate-500 dark:text-slate-400 text-left">${esc(r.note)}</span>` : ''}
        ${prof ? '<span class="block text-[10px] text-slate-400 dark:text-slate-500 text-left">Route: OSRM · Suche: Photon · © OpenStreetMap · Höhen: Open-Meteo (Copernicus DEM 90 m) · grobe Schätzung (2,1 t, 90 % Antrieb bergauf, 80 % bergab genutzt durch Rollen + Rekuperation)</span>' : ''}</div>`; }).join('')
      || '<p class="rounded-3xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine Rekorde. Trage über „+“ deinen Bestwert je Strecke ein, mit Start und Ziel für das Höhenprofil. Ein neuer Eintrag für dieselbe Strecke und Richtung ersetzt den alten.</p>';
  } else if (recRoute === 'lt') h = ltCard(lab.lt);
  else if (recRoute === 'bt') h = btCard(lab.bt);
  else h = speedCard(lab.speeds);
  $('rec-list').innerHTML = h;
}
/* ---- Tempomat-Messreihen: mehrere je Bedingung (Sommer/Winter/Übergang, Klima an/aus) ---- */
const SPD_SEASONS = ['Sommer', 'Übergang', 'Winter'], SPD_V = [80, 90, 100, 110, 120, 130, 140], SPD_COL = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#94a3b8'];
let spdSel = null, spdEdit = null;
const spdLabel = (s) => [s.season, s.klima ? 'Klima ' + s.klima : '', s.note].filter(Boolean).join(' · ') + (s.tOut != null ? ' · ' + fmt(s.tOut, 0) + ' °C' : '');
function speedCard(list) {
  const ss = (list || []).filter(s => (s.rows || []).some(r => r.k > 0));
  if (!ss.length) return '<p class="rounded-3xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine Messreihe. Über „+“ Verbräuche bei konstantem Tempo eintragen, je Jahreszeit und Klima.</p>';
  if (!ss.some(s => s.id === spdSel)) spdSel = ss[0].id;
  const sp = ss.find(s => s.id === spdSel), ci = (s) => SPD_COL[list.indexOf(s) % SPD_COL.length];
  const rows = sp.rows.filter(r => r.v > 0 && r.k > 0).sort((a, b) => a.v - b.v);
  const mx = Math.max(...rows.map(r => r.k)), mn = Math.min(...rows.map(r => r.k)), colr = (k) => { const t = mx > mn ? (k - mn) / (mx - mn) : 0; return t < .2 ? '#10b981' : t < .45 ? '#22c55e' : t < .65 ? '#eab308' : t < .85 ? '#f59e0b' : '#ef4444'; };
  const net = AVILOO.nom * avSoh(lastKnownKm() || 0) / 100;
  let h = `<div class="flex flex-wrap gap-1.5">${ss.map(s => `<button type="button" data-spsel="${esc(s.id)}" class="inline-flex h-[30px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${s === sp ? '' : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}"${s === sp ? ` style="background:${ci(s)}26;color:${ci(s)}"` : ''}><span class="h-2 w-2 rounded-full" style="background:${ci(s)}"></span>${esc([s.season, s.klima ? 'Klima ' + s.klima : ''].filter(Boolean).join(' · '))}</button>`).join('')}</div>
    <div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4"><div class="flex items-baseline justify-between gap-2"><p class="min-w-0 text-sm font-bold text-left">${esc(spdLabel(sp))}</p><button type="button" data-spd="${esc(sp.id)}" class="shrink-0 text-xs font-semibold text-sky-600 dark:text-sky-300">Bearbeiten</button></div>
    <div class="mt-3 grid items-end gap-1.5" style="grid-template-columns:repeat(${rows.length},minmax(0,1fr));height:110px">${rows.map(r => `<div class="flex flex-col items-center gap-1 text-[11px]"><b class="tabular-nums">${fmt(r.k, r.k % 1 ? 1 : 0)}</b><span class="w-full rounded-t-md" style="height:${Math.round(r.k / mx * 80)}px;background:${colr(r.k)}"></span></div>`).join('')}</div>
    <div class="mt-1 grid gap-1.5 text-center text-[11px] text-slate-500 dark:text-slate-400" style="grid-template-columns:repeat(${rows.length},minmax(0,1fr))">${rows.map((r, i) => `<span>${r.v}${i === rows.length - 1 ? ' km/h' : ''}</span>`).join('')}</div>
    <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-left">kWh/100 km bei konstantem Tempo. Reichweite mit ${fmt(net, 0)} kWh: ${rows.map(r => r.v + ' km/h ≈ ' + fmt(Math.round(net / r.k * 100 / 5) * 5, 0) + ' km').join(' · ')}</p></div>`;
  if (ss.length > 1) {                                                          // Vergleich aller Messreihen je Tempo
    const vs = [...new Set(ss.flatMap(s => s.rows.filter(r => r.k > 0).map(r => r.v)))].sort((a, b) => a - b);
    h += `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4"><p class="text-sm font-bold text-left">Vergleich</p><div class="mt-2 overflow-x-auto no-sb"><table class="w-full text-sm tabular-nums"><thead><tr class="text-[11px] text-slate-500 dark:text-slate-400"><th class="py-1 pr-2 text-left font-medium">km/h</th>${ss.map(s => `<th class="py-1 px-1 text-right font-medium"><span class="inline-block h-2 w-2 rounded-full align-middle" style="background:${ci(s)}"></span> ${esc(s.season.slice(0, 2) + '.' + (s.klima ? ' K. ' + s.klima : ''))}</th>`).join('')}</tr></thead><tbody>${vs.map(v => { const vals = ss.map(s => (s.rows.find(r => r.v === v) || {}).k), lo = Math.min(...vals.filter(x => x > 0));
      return `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1.5 pr-2 text-left text-slate-500 dark:text-slate-400">${v}</td>${vals.map(x => `<td class="py-1.5 px-1 text-right ${x === lo && vals.filter(y => y > 0).length > 1 ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}">${x > 0 ? fmt(x, 1) : '–'}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div><p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-left">kWh/100 km; grün = niedrigster Wert je Tempo.</p></div>`;
  }
  return h;
}
$('rec-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-rr]'); if (b) { recRoute = b.dataset.rr; renderRecs(); } });
$('rec-list').addEventListener('click', (e) => {
  const s = e.target.closest('[data-spsel]'); if (s) { spdSel = s.dataset.spsel; renderRecs(); return; }
  const lt = e.target.closest('[data-lt]'); if (lt) { openLtSheet(lt.dataset.lt); return; }
  const dt = e.target.closest('[data-rdir]'); if (dt) { recDirSel[dt.dataset.rk] = dt.dataset.rdir; renderRecs(); return; }
  const ds = e.target.closest('[data-rsea]'); if (ds) { recSeaSel[ds.dataset.rk] = ds.dataset.rsea; renderRecs(); return; }
  const it = e.target.closest('[data-rec]'); if (it) { if (it.dataset.rec) openRecSheet(it.dataset.rec); else openRecSheet(null, { route: it.dataset.route, dir: it.dataset.newdir, season: it.dataset.newsea }); return; }
  const sp = e.target.closest('[data-spd]'); if (sp) openSpdSheet(sp.dataset.spd);
});
segSwipe($('rec-list'), $('rec-chips'));                                    // Rekorde: Strecken | Tempomat | Langzeit per Wischen
$('rec-add').addEventListener('click', () => recRoute === 'speed' ? openSpdSheet(null) : recRoute === 'lt' ? openLtSheet(null) : recRoute === 'bt' ? $('btq-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : openRecSheet(null));
const recTown = (a) => { const m = /\d{5} ([^,]+)/.exec(String(a || '')); return m ? m[1].split('-')[0].trim() : ''; };
function openRecSheet(id, pre) {
  const lab = getLab(), r = id ? lab.recs.find(x => x.id === id) : null, d = pre || r || {}; recEdit = r ? r.id : null;
  const routes = [...new Set(lab.recs.map(x => x.route))], meta = (d.route && lab.routes[recKey(d.route)]) || {};
  recGeo = { a: meta.a || null, b: meta.b || null, via: meta.via || null, prof: hpN(meta.prof), both: !!meta.both || d.dir === 'ba', busy: false, err: '' };
  $('rec-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${r ? 'Rekord bearbeiten' : 'Rekord eintragen'}</p>
    <div><label for="rec-route" class="text-xs text-slate-500 dark:text-slate-400">Strecke</label><input id="rec-route" list="rec-routes" type="text" maxlength="40" value="${esc(d.route || '')}" placeholder="z. B. Arbeitsweg oder A6 Tempomat 110" class="${inCls}"><datalist id="rec-routes">${routes.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>
    <div class="relative"><label for="rec-a" class="text-xs text-slate-500 dark:text-slate-400">Start (A)</label><input id="rec-a" type="text" autocomplete="off" enterkeyhint="done" value="${esc(hpLabel(recGeo.a))}" placeholder="Ort, Adresse oder lat,lon" class="${inCls}"><div id="rec-sug-a" class="hidden mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800"></div><p id="rec-st-a" class="mt-1 text-xs text-left text-emerald-600 dark:text-emerald-400 empty:hidden">${hpLabel(recGeo.a) ? '✓ ' + esc(hpLabel(recGeo.a)) : ''}</p></div>
    <div class="relative"><label for="rec-b" class="text-xs text-slate-500 dark:text-slate-400">Ziel (B)</label><input id="rec-b" type="text" autocomplete="off" enterkeyhint="done" value="${esc(hpLabel(recGeo.b))}" placeholder="Ort, Adresse oder lat,lon" class="${inCls}"><div id="rec-sug-b" class="hidden mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800"></div><p id="rec-st-b" class="mt-1 text-xs text-left text-emerald-600 dark:text-emerald-400 empty:hidden">${hpLabel(recGeo.b) ? '✓ ' + esc(hpLabel(recGeo.b)) : ''}</p></div>
    <div id="rec-via-row" class="${recGeo.via ? '' : 'hidden'}"><div class="relative"><label for="rec-via" class="text-xs text-slate-500 dark:text-slate-400">Zwischenpunkt (optional)</label><input id="rec-via" type="text" autocomplete="off" enterkeyhint="done" value="${esc(hpLabel(recGeo.via))}" placeholder="Ort, Adresse oder lat,lon" class="${inCls}"><div id="rec-sug-via" class="hidden mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800"></div><p id="rec-st-via" class="mt-1 text-xs text-left text-emerald-600 dark:text-emerald-400 empty:hidden">${hpLabel(recGeo.via) ? '✓ ' + esc(hpLabel(recGeo.via)) : ''}</p></div></div>
    <p class="-mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-left">Beim Tippen erscheinen Vorschläge (deine Orte und Adressen) – einen antippen. Oder eine Fahrt aus dem Fahrtenbuch übernehmen.</p>
    <div id="rec-hp" class="rounded-xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2.5"></div>
    <label class="flex items-center gap-2.5 text-sm"><input id="rec-both" type="checkbox" ${recGeo.both ? 'checked' : ''} class="h-5 w-5 accent-emerald-600">Rückweg B → A mit eigenem Bestwert führen</label>
    <div id="rec-dir-row" class="${recGeo.both ? '' : 'hidden'}"><p class="text-xs text-slate-500 dark:text-slate-400">Richtung</p><div id="rec-dir" class="mt-1 flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm">${[['ab', 'A → B · Hin'], ['ba', 'B → A · Rück']].map(([v, l]) => `<button type="button" data-dirv="${v}" class="flex-1 rounded-lg py-1.5 font-medium ${(d.dir === 'ba' ? 'ba' : 'ab') === v ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${l}</button>`).join('')}</div></div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Jahreszeit</p><div id="rec-sea" class="mt-1 flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm">${['so', 'wi'].map(v => `<button type="button" data-seav="${v}" class="flex-1 rounded-lg py-1.5 font-medium ${recSeason(d) === v ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${SEA_I[v]} ${SEA_L[v]}</button>`).join('')}</div></div>
    <div class="grid grid-cols-[1.35fr_0.8fr_1fr] gap-2"><div class="min-w-0"><label for="rec-date" class="text-xs text-slate-500 dark:text-slate-400">Datum</label><input id="rec-date" type="date" value="${esc(d.date || wxIso(new Date()))}" class="${inCls} !px-1.5 text-[13px]"></div>${fld('rec-km', 'km', d.km, '17')}${fld('rec-k', 'kWh/100 km', d.k100, '10,8')}${fld('rec-to', 'Außen °C', d.tOut, '18', 'text')}${fld('rec-tb', 'Akku °C', d.tBat, 'optional', 'text')}${fld('rec-v', 'Ø km/h', d.v, 'optional', 'numeric')}</div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Bedingungen</p><div id="rec-cond" class="mt-1 flex flex-wrap gap-1.5">${REC_COND.map(c => { const on = (d.cond || []).includes(c); return `<button type="button" data-cond="${esc(c)}" aria-pressed="${on}" class="h-8 rounded-full border px-3 text-xs font-semibold ${on ? 'border-emerald-600 bg-emerald-600/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">${esc(c)}</button>`; }).join('')}</div></div>
    <div><label for="rec-note" class="text-xs text-slate-500 dark:text-slate-400">Notiz</label><input id="rec-note" type="text" maxlength="120" value="${esc(d.note || '')}" placeholder="z. B. Rekuperation B, Eco-Modus" class="${inCls}"></div>
    <p id="rec-hint" class="rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 text-left empty:hidden"></p>
    ${r ? '' : '<button type="button" data-rs="trip" class="text-sm font-semibold text-sky-600 dark:text-sky-300">Aus dem Fahrtenbuch übernehmen ›</button><div id="rec-trips" class="hidden space-y-1"></div>'}
    <p id="rec-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-rs="${r ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${r ? 'text-red-600 dark:text-red-400' : ''}">${r ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-rs="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  recDrafts = {}; recCur = recDirVal() + '|' + recSeaVal(); recLoaded = recFormGet();
  $('rec-sheet').classList.remove('hidden'); hpBox(); recHint();
}
/* Richtung im Formular wechseln: Werte des Rekords dieser Richtung laden (oder leeren), statt den offenen Rekord umzuhängen */
/* Ungespeicherte Eingaben je Richtung/Jahreszeit (Schlüssel 'ab|so' …) bleiben beim Tab-Wechsel erhalten und werden mit „Speichern“ zusammen gesichert */
let recDrafts = {}, recCur = 'ab|so', recLoaded = null;
const REC_FIELDS = ['rec-date', 'rec-km', 'rec-k', 'rec-to', 'rec-tb', 'rec-v', 'rec-note'];
const recFormGet = () => { const f = { id: recEdit, cond: [...document.querySelectorAll('#rec-cond [data-cond]')].filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.cond) }; REC_FIELDS.forEach(id => { f[id] = $(id) ? $(id).value : ''; }); return f; };
const recFormSame = (a, b) => !!a && !!b && REC_FIELDS.every(id => (a[id] || '').trim() === (b[id] || '').trim()) && a.cond.join('|') === b.cond.join('|');
function recSwitchDir() {
  const now = recFormGet(); if (!recFormSame(now, recLoaded)) recDrafts[recCur] = now; else delete recDrafts[recCur];   // nur geänderte Richtung merken
  recCur = recDirVal() + '|' + recSeaVal();
  const rt = ($('rec-route')?.value || '').trim(), key = recKey(rt) + '|' + recCur, r = getLab().recs.find(x => recDirKey(x) === key) || null, dr = recDrafts[recCur];
  recEdit = dr ? dr.id : r ? r.id : null; const v = (x) => x == null ? '' : String(x).replace('.', ',');
  const kmKeep = $('rec-km').value;
  $('rec-date').value = r ? r.date : wxIso(new Date()); if (r && r.km) $('rec-km').value = v(r.km);
  [['rec-k', 'k100'], ['rec-to', 'tOut'], ['rec-tb', 'tBat'], ['rec-v', 'v']].forEach(([id, k]) => { $(id).value = r ? v(r[k]) : ''; }); $('rec-note').value = r ? (r.note || '') : '';
  if (!r) $('rec-km').value = kmKeep;
  const fromRec = recFormGet(); fromRec.cond = r ? (r.cond || []).slice() : [];
  recLoaded = { ...fromRec, cond: REC_COND.filter(c => fromRec.cond.includes(c)) };
  if (dr) REC_FIELDS.forEach(id => { $(id).value = dr[id]; });
  const condNow = dr ? dr.cond : recLoaded.cond;
  document.querySelectorAll('#rec-cond [data-cond]').forEach(c => { const on = condNow.includes(c.dataset.cond); c.setAttribute('aria-pressed', on); ['border-emerald-600', 'bg-emerald-600/15', 'text-emerald-700', 'dark:text-emerald-300'].forEach(x => c.classList.toggle(x, on)); ['border-slate-300', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-300'].forEach(x => c.classList.toggle(x, !on)); });
  const t = $('rec-sheet-box').querySelector('p.text-lg'); if (t) t.textContent = recEdit ? 'Rekord bearbeiten' : 'Rekord eintragen';
  const lb = $('rec-sheet-box').querySelector('[data-rs="del"],[data-rs="close"]'); if (lb) { const ex = !!recEdit; lb.dataset.rs = ex ? 'del' : 'close'; lb.textContent = ex ? 'Löschen' : 'Abbrechen'; lb.classList.toggle('text-red-600', ex); lb.classList.toggle('dark:text-red-400', ex); }
  $('rec-msg').textContent = '';
}
const recSeaVal = () => document.querySelector('#rec-sea .bg-white')?.dataset.seav === 'wi' ? 'wi' : 'so';
const recDirVal = () => ($('rec-both')?.checked && document.querySelector('#rec-dir .bg-white')?.dataset.dirv === 'ba') ? 'ba' : 'ab';
function recHint() {
  const rt = ($('rec-route')?.value || '').trim(), k = deDec($('rec-k')?.value), h = $('rec-hint'); if (!h) return;
  const dk = recKey(rt) + '|' + recDirVal() + '|' + recSeaVal(), lbl = '„' + rt + '“ (' + ($('rec-both')?.checked ? (recDirVal() === 'ba' ? 'Rück, ' : 'Hin, ') : '') + SEA_L[recSeaVal()] + ')', own = recEdit ? getLab().recs.find(r => r.id === recEdit) : null, others = getLab().recs.filter(r => recDirKey(r) === dk && r.id !== recEdit), best = others.length ? Math.min(...others.map(r => r.k100)) : (own && recDirKey(own) === dk ? own.k100 : null);
  h.textContent = !rt || !(k > 0) || best == null ? (rt && k > 0 ? 'Erster Eintrag für ' + lbl : '') : k < best ? 'Neuer Bestwert für ' + lbl + ' – ersetzt ' + fmt(best, 1) : k > best ? 'Achtung: Bisheriger Bestwert ' + fmt(best, 1) + ' ist besser. Speichern ersetzt ihn trotzdem.' : '';
}
$('rec-sheet').addEventListener('input', (e) => { const m = /^rec-(a|b|via)$/.exec(e.target.id || ''); if (m) hpSuggest(m[1]); else recHint(); });
$('rec-sheet').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-sug]')) e.preventDefault(); });   // Fokus im Feld lassen, damit kein „change“ vor der Auswahl feuert
$('rec-sheet').addEventListener('keydown', (e) => { const m = /^rec-(a|b|via)$/.exec(e.target.id || ''); if (m && e.key === 'Enter') { e.preventDefault(); const l = recGeo['sug' + m[1]]; if (l && l.length && !$('rec-sug-' + m[1]).classList.contains('hidden')) hpPick(m[1], l[0]); else e.target.blur(); } });
$('rec-sheet').addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'rec-a') hpField('a'); else if (id === 'rec-b') hpField('b'); else if (id === 'rec-via') hpField('via');
  else if (id === 'rec-both') { recGeo.both = e.target.checked; $('rec-dir-row').classList.toggle('hidden', !e.target.checked); recHint(); }
  else if (id === 'rec-route' && !recGeo.a && !recGeo.b) { const m = getLab().routes[recKey(e.target.value)]; if (m && m.a && m.b) { Object.assign(recGeo, { a: m.a, b: m.b, via: m.via || null, prof: hpN(m.prof), both: !!m.both }); $('rec-a').value = hpLabel(m.a); $('rec-b').value = hpLabel(m.b); $('rec-both').checked = !!m.both; $('rec-dir-row').classList.toggle('hidden', !m.both); hpBox(); recHint(); } }
});
$('rec-sheet').addEventListener('click', (e) => {
  if (e.target === $('rec-sheet')) { $('rec-sheet').classList.add('hidden'); return; }
  const c = e.target.closest('[data-cond]'); if (c) { const on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on); ['border-emerald-600', 'bg-emerald-600/15', 'text-emerald-700', 'dark:text-emerald-300'].forEach(x => c.classList.toggle(x, on)); ['border-slate-300', 'dark:border-slate-700', 'text-slate-600', 'dark:text-slate-300'].forEach(x => c.classList.toggle(x, !on)); return; }
  const sg = e.target.closest('[data-sug]'); if (sg) { const [w, i] = sg.dataset.sug.split(':'); const pt = (recGeo['sug' + w] || [])[+i]; if (pt) hpPick(w, pt); return; }
  const dv = e.target.closest('[data-dirv]'); if (dv) { dv.parentElement.querySelectorAll('[data-dirv]').forEach(x => { const on = x === dv; x.classList.toggle('bg-white', on); x.classList.toggle('dark:bg-slate-600', on); x.classList.toggle('shadow-sm', on); x.classList.toggle('text-slate-500', !on); x.classList.toggle('dark:text-slate-400', !on); }); recSwitchDir(); recHint(); return; }
  const sv = e.target.closest('[data-seav]'); if (sv) { sv.parentElement.querySelectorAll('[data-seav]').forEach(x => { const on = x === sv; x.classList.toggle('bg-white', on); x.classList.toggle('dark:bg-slate-600', on); x.classList.toggle('shadow-sm', on); x.classList.toggle('text-slate-500', !on); x.classList.toggle('dark:text-slate-400', !on); }); recSwitchDir(); recHint(); return; }
  const tp = e.target.closest('[data-trip]'); if (tp) { const t = getTrips().find(x => String(x.id) === tp.dataset.trip); if (t) { const g0 = geoOf(t.p0), g1 = geoOf(t.p1); if (g0 && g1 && !recGeo.a && !recGeo.b) { recGeo.a = { ...g0, label: placeAt(t.p0)?.name || recTown(t.a0) || '' }; recGeo.b = { ...g1, label: placeAt(t.p1)?.name || recTown(t.a1) || '' }; $('rec-a').value = hpLabel(recGeo.a); $('rec-b').value = hpLabel(recGeo.b); hpStatus('a', true, '✓ ' + hpLabel(recGeo.a) + ' · aus Fahrt'); hpStatus('b', true, '✓ ' + hpLabel(recGeo.b) + ' · aus Fahrt'); hpRefresh(); } $('rec-date').value = wxIso(new Date(t.s)); $('rec-km').value = String(t.km).replace('.', ','); if (t.k100) $('rec-k').value = String(t.k100).replace('.', ','); if (t.v) $('rec-v').value = String(Math.round(t.v)); $('rec-trips').classList.add('hidden'); recHint(); } return; }
  const b = e.target.closest('[data-rs]'); if (!b) return; const act = b.dataset.rs, lab = getLab();
  if (act === 'close') $('rec-sheet').classList.add('hidden');
  else if (act === 'via') { recGeo.viaOpen = true; $('rec-via-row').classList.remove('hidden'); hpBox(); setTimeout(() => { $('rec-via')?.focus(); $('rec-via-row').scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50); }
  else if (act === 'hpload') hpRefresh();
  else if (act === 'trip') { const box = $('rec-trips'), ts = getTrips().filter(t => t.km >= 3 && t.k100 > 0).sort((a, b) => Date.parse(b.s) - Date.parse(a.s)).slice(0, 12);
    box.innerHTML = ts.length ? ts.map(t => `<button type="button" data-trip="${esc(String(t.id))}" class="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-left text-sm"><span class="min-w-0 truncate">${new Date(t.s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${fmt(t.km, 0)} km${t.v ? ' · Ø ' + fmt(t.v, 0) + ' km/h' : ''}${recTown(t.a0) && recTown(t.a1) ? ' · ' + esc(recTown(t.a0)) + ' → ' + esc(recTown(t.a1)) : ''}</span><b class="shrink-0 tabular-nums">${fmt(t.k100, 1)}</b></button>`).join('') : '<p class="text-xs text-slate-500">Keine Fahrten im Fahrtenbuch.</p>'; box.classList.toggle('hidden'); }
  else if (act === 'del') { const snap = labSnap(); lab.recs = lab.recs.filter(x => x.id !== recEdit); setLab(lab); $('rec-sheet').classList.add('hidden'); labUndo('Rekord gelöscht', snap); }
  else if (act === 'save') {
    const m = $('rec-msg'), route = $('rec-route').value.trim().slice(0, 40), DL = { ab: 'A → B', ba: 'B → A' };
    if (!route) { m.textContent = 'Bitte eine Strecke angeben.'; return; }
    const curKey = recDirVal() + '|' + recSeaVal(), cur = recFormGet(), all = { ...recDrafts, [curKey]: cur };
    if (!$('rec-both').checked) Object.keys(all).forEach(x => { if (x.startsWith('ba|')) delete all[x]; });   // Rückweg abgewählt → dessen Entwürfe verwerfen
    const recs = [];
    for (const [ds, f] of Object.entries(all)) {
      const [dir, sea] = ds.split('|'), k = deDec(f['rec-k']), opt = (id) => { const v = deDec(f[id]); return Number.isFinite(v) ? v : undefined; }, nm = DL[dir] + ' · ' + SEA_L[sea];
      if (!(k > 3 && k < 60)) { if (ds === curKey || (f['rec-k'] || '').trim()) { m.textContent = 'Bitte den Verbrauch in kWh/100 km eintragen (z. B. 10,8)' + (ds === curKey ? '.' : ' – fehlt bei ' + nm + '.'); return; } continue; }
      const r = { id: f.id || labId(), route, date: f['rec-date'] || wxIso(new Date()), km: opt('rec-km'), k100: Math.round(k * 10) / 10, tOut: opt('rec-to'), tBat: opt('rec-tb'), v: opt('rec-v'), cond: f.cond.length ? f.cond : undefined, note: (f['rec-note'] || '').trim() || undefined, dir: dir === 'ba' ? 'ba' : undefined, season: sea };
      Object.keys(r).forEach(x => r[x] === undefined && delete r[x]); recs.push(r);
    }
    if (recGeo.busy) { m.textContent = 'Höhenprofil lädt noch – bitte kurz warten.'; return; }
    const rk = recKey(route), old = lab.routes[rk] || {}, ids = recs.map(r => r.id), dks = recs.map(r => recDirKey(r));
    if (recGeo.a && recGeo.b) lab.routes = { ...lab.routes, [rk]: { a: recGeo.a, b: recGeo.b, via: recGeo.via || undefined, prof: hpStore(recGeo.prof || old.prof), both: !!recGeo.both || undefined } };
    else if (!recGeo.a && !recGeo.b && old.a) { const o2 = { ...lab.routes }; if (lab.recs.every(x => recKey(x.route) !== rk || ids.includes(x.id))) delete o2[rk]; lab.routes = o2; }
    else if (old.a) lab.routes = { ...lab.routes, [rk]: { ...old, both: !!recGeo.both || undefined } };
    Object.values(lab.routes).forEach(o => Object.keys(o).forEach(x => o[x] === undefined && delete o[x]));
    lab.recs = lab.recs.filter(x => !ids.includes(x.id) && !dks.includes(recDirKey(x))).concat(recs); recRoute = 'all'; setLab(lab); recDrafts = {}; $('rec-sheet').classList.add('hidden');   // je Strecke/Richtung/Jahreszeit genau ein Eintrag
  }
});
function openSpdSheet(id) {
  const sp = id ? getLab().speeds.find(x => x.id === id) : null; spdEdit = sp ? sp.id : null;
  const seg = (name, opts, cur) => `<div data-seg="${name}" class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm">${opts.map(o => `<button type="button" data-v="${esc(o)}" class="flex-1 rounded-lg py-1.5 font-medium ${o === cur ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}">${esc(o)}</button>`).join('')}</div>`;
  $('rec-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">${sp ? 'Messreihe bearbeiten' : 'Tempomat-Messreihe eintragen'}</p>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Jahreszeit</p><div class="mt-1">${seg('season', SPD_SEASONS, sp ? sp.season : 'Winter')}</div></div>
    <div><p class="text-xs text-slate-500 dark:text-slate-400">Klima / Heizung</p><div class="mt-1">${seg('klima', ['an', 'aus'], sp ? sp.klima : 'an')}</div></div>
    <div class="grid grid-cols-[1fr_0.6fr] gap-2"><div class="min-w-0"><label for="spd-note" class="text-xs text-slate-500 dark:text-slate-400">Zusatz</label><input id="spd-note" type="text" maxlength="30" value="${esc((sp && sp.note) || '')}" placeholder="z. B. eben, Winterreifen" class="${inCls}"></div>${fld('spd-to', 'Außen °C', sp ? sp.tOut : undefined, 'optional', 'text')}</div>
    <p class="text-xs text-slate-500 dark:text-slate-400 text-left">kWh/100 km bei konstantem Tempo (leer lassen, was du nicht gemessen hast)</p>
    <div class="grid grid-cols-4 gap-2">${SPD_V.map(v => fld('spd-' + v, v + ' km/h', sp ? (sp.rows.find(r => r.v === v) || {}).k : undefined, '', 'decimal')).join('')}</div>
    <p id="spd-msg" class="text-sm text-red-600 dark:text-red-400 text-left empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-ss="${sp ? 'del' : 'close'}" class="h-12 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold ${sp ? 'text-red-600 dark:text-red-400' : ''}">${sp ? 'Löschen' : 'Abbrechen'}</button><button type="button" data-ss="save" class="h-12 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">Speichern</button></div>`;
  $('rec-sheet').classList.remove('hidden');
}
$('rec-sheet').addEventListener('click', (e) => {
  const sb = e.target.closest('[data-seg] [data-v]'); if (sb) { sb.parentElement.querySelectorAll('[data-v]').forEach(x => { const on = x === sb; x.classList.toggle('bg-white', on); x.classList.toggle('dark:bg-slate-600', on); x.classList.toggle('shadow-sm', on); x.classList.toggle('text-slate-500', !on); x.classList.toggle('dark:text-slate-400', !on); }); return; }
  const b = e.target.closest('[data-ss]'); if (!b) return; const act = b.dataset.ss, lab = getLab();
  if (act === 'del') { const snap = labSnap(); lab.speeds = lab.speeds.filter(x => x.id !== spdEdit); spdSel = null; setLab(lab); labUndo('Messreihe gelöscht', snap); }
  else if (act === 'save') {
    const pick = (n) => { const x = document.querySelector(`[data-seg="${n}"] .bg-white`); return x ? x.dataset.v : ''; };
    const rows = SPD_V.map(v => ({ v, k: deDec($('spd-' + v).value) })).filter(r => r.k > 3 && r.k < 60);
    if (!rows.length) { $('spd-msg').textContent = 'Bitte mindestens einen Verbrauch eintragen.'; return; }
    const to = deDec($('spd-to').value), sp = { id: spdEdit || labId(), season: pick('season') || 'Sommer', klima: pick('klima') || 'an', note: $('spd-note').value.trim() || undefined, tOut: Number.isFinite(to) ? to : undefined, rows };
    Object.keys(sp).forEach(k => sp[k] === undefined && delete sp[k]);
    lab.speeds = spdEdit ? lab.speeds.map(x => x.id === spdEdit ? sp : x) : lab.speeds.concat(sp); spdSel = sp.id; recRoute = 'speed'; setLab(lab);
  }
  $('rec-sheet').classList.add('hidden');
});

