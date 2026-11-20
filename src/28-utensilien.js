/* =====================================================================
   Wissen › Fahrzeugutensilien: Einträge, deren Text eine Packliste ist (Überschrift je Fach, darunter „- Ding ✅“),
   zeigt der Detail-Dialog als Auto von oben mit Pins je Bereich, Fächer-Chips, Haken zum Antippen und Suche „Wo ist …?“.
   Datenquelle bleibt der Text des Eintrags (Sync/Zusammenführen wie jedes kb-Element): Antippen setzt/entfernt ✅ in der Zeile.
   Offen = ohne ✅ (auch „?“). Zeilen nach einer Leerzeile ohne neue Überschrift gehören zum vorigen Fach; „(Seite rechts)“ am Ende = Platz im Fach.
   ===================================================================== */
const INV_Z = [ // Bereich, Symbol, Pin-Position (% der Draufsicht, Front oben), Erkennung über die Fach-Überschrift
  ['Frunk', '🔌', 50, 6, /frunk|vorderer koffer/i],
  ['Mulde', '⚽', 50, 93, /mulde|unterboden|reserverad/i],
  ['Cockpit', '🧤', 70, 31, /handschuh|kartenfach|sonnenblende|cockpit|armatur/i],
  ['Türen', '☂️', 14, 47, /tür/i],
  ['Mittelkonsole', '🍬', 50, 42, /konsole|armlehne|getränke|wireless|becher|trapez/i],
  ['Rücksitze', '🛍️', 50, 61, /rück|fond|sitz/i],
  ['Kofferraum', '🧰', 50, 82, /koffer|heck|laderaum/i],
  ['Sonstiges', '📦', 86, 70, /./]];
var invZ = null, invF = null, invQ = '', invTxt = false;
/** Text → Fächer mit Dingen (Zeilennummer für das Abhaken) */
function invParse(text) {
  const ls = String(text || '').split('\n'), fs = []; let cur = null;
  ls.forEach((l, li) => { const t = l.trim(); if (!t) return;
    if (/^[-–•*]\s*/.test(t)) { if (!cur) { cur = { name: 'Allgemein', items: [] }; fs.push(cur); }
      let n = t.replace(/^[-–•*]\s*/, ''), ok = /✅|☑️|✔️?/.test(n); n = n.replace(/✅|☑️|✔️?/g, '').trim();
      const q = /\?\s*$/.test(n); n = n.replace(/\s*\?\s*$/, '').trim(); let sub = ''; const m = n.match(/\s*\(([^()]+)\)\s*$/); if (m) { sub = m[1].trim(); n = n.slice(0, m.index).trim(); }
      if (n) cur.items.push({ li, n, ok, q, sub }); return; }
    const name = t.replace(/^\((.*)\)$/, '$1').replace(/:$/, '').trim(); cur = { name, items: [] }; fs.push(cur); });
  return fs.filter(f => f.items.length);
}
function invIs(x) { if (!x || !x.text || isUp(x) || isMg(x)) return false; const fs = invParse(x.text), n = fs.reduce((a, f) => a + f.items.length, 0), ok = fs.reduce((a, f) => a + f.items.filter(i => i.ok).length, 0);
  return fs.length >= 3 && n >= 8 && (ok >= 3 || /utensil|inventar|packliste|im auto/i.test(x.title || '')); }
function invZones(fs) {
  const zs = INV_Z.map(([n, e, x, y, re]) => ({ n, e, x, y, re, fs: [] }));
  fs.forEach(f => (zs.find(z => z.re.test(f.name)) || zs[zs.length - 1]).fs.push(f));
  return zs.filter(z => z.fs.length).map(z => ({ ...z, items: z.fs.flatMap(f => f.items.map(i => ({ ...i, f: f.name }))) }));
}
const invOpenN = (its) => its.filter(i => !i.ok).length;
function invItem(i, where) {
  return `<button type="button" data-invi="${i.li}" class="flex w-full items-center gap-2.5 border-t border-slate-200 dark:border-slate-800 py-2 text-left text-[13.5px] active:opacity-70">
    <span class="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold ${i.ok ? 'bg-emerald-600 text-white' : 'border-[1.5px] border-dashed border-amber-500 text-amber-500'}">${i.ok ? '✓' : '?'}</span>
    <span class="min-w-0 flex-1 [overflow-wrap:anywhere] ${i.ok ? '' : 'text-amber-600 dark:text-amber-400'}">${esc(i.n)}${where ? `<span class="block text-[11.5px] text-slate-500 dark:text-slate-400">📍 ${esc(where)}</span>` : i.sub ? ` <span class="text-[11.5px] text-slate-500 dark:text-slate-400">· ${esc(i.sub)}</span>` : ''}</span>${i.ok ? '' : '<span class="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">offen</span>'}</button>`;
}
function invHtml(x) {
  const fs = invParse(x.text), zs = invZones(fs), all = zs.flatMap(z => z.items.map(i => ({ ...i, z }))), open = invOpenN(all);
  if (!invZ || !zs.some(z => z.n === invZ)) invZ = (zs.find(z => z.n === 'Mittelkonsole') || zs[0]).n;
  const zc = zs.find(z => z.n === invZ), H = 400, W = Math.round(H * 240 / 478), q = invQ.trim().toLowerCase();
  let h = `<div class="relative"><span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span><input id="inv-q" type="search" value="${esc(invQ)}" placeholder="Wo ist …?" autocomplete="off" class="${inCls} !mt-0 !pl-9"></div>
    <p class="-mt-1 px-1 text-left text-[12px] text-slate-500 dark:text-slate-400">${all.length} Dinge an ${fs.length} Plätzen${open ? ` · <b class="text-amber-600 dark:text-amber-400">${open} offen</b>` : ' · alles da ✓'}</p>`;
  if (q) { const hit = all.filter(i => (i.n + ' ' + i.f + ' ' + i.sub).toLowerCase().includes(q));
    const mark = (s) => { const k = s.toLowerCase().indexOf(q); return k < 0 ? esc(s) : esc(s.slice(0, k)) + '<b class="text-emerald-600 dark:text-emerald-400">' + esc(s.slice(k, k + q.length)) + '</b>' + esc(s.slice(k + q.length)); };
    h += hit.length ? `<div class="space-y-1.5">${hit.map(i => `<button type="button" data-invz="${esc(i.z.n)}" data-invf="${esc(i.f)}" class="flex w-full items-center gap-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2 text-left active:scale-[0.99] transition">
        <span class="relative h-[48px] w-[24px] shrink-0"><img src="/Bilder/Enyaq/enyaq-top.webp" alt="" class="h-full w-full object-contain opacity-60" draggable="false"><span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 ring-[3px] ring-emerald-500/40" style="left:${i.z.x}%;top:${i.z.y}%"></span></span>
        <span class="min-w-0 flex-1"><span class="block text-[14px] font-semibold">${mark(i.n)}${i.ok ? '' : ' <span class="text-[11px] font-normal text-amber-600 dark:text-amber-400">offen</span>'}</span><span class="block text-[12px] text-slate-500 dark:text-slate-400">📍 ${esc(i.z.n === i.f ? i.f : i.z.n + ' · ' + i.f)}${i.sub ? ' · ' + esc(i.sub) : ''}</span></span></button>`).join('')}</div>`
      : `<p class="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-3 text-left text-sm text-slate-500 dark:text-slate-400">Nichts gefunden für „${esc(invQ)}“.</p>`;
    return h; }
  const desk = isDesk(), pinsW = desk ? 320 : 300, HH = desk ? 560 : H, WW = Math.round(HH * 240 / 478);
  if (desk) h += '<div class="flex items-start gap-4">';
  h += `<div class="relative ${desk ? 'shrink-0' : 'mx-auto'}" style="width:${pinsW}px;max-width:100%;height:${HH}px"><img src="/Bilder/Enyaq/enyaq-top.webp" alt="Enyaq von oben" width="240" height="478" draggable="false" class="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 select-none opacity-90 dark:opacity-80" style="width:${WW}px;height:${HH}px">
    ${zs.map(z => { const on = z.n === invZ, o = invOpenN(z.items);
      return `<button type="button" data-invz="${esc(z.n)}" class="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full py-[3px] pl-1.5 pr-2 text-[11.5px] font-bold shadow-sm transition active:scale-95 ${on ? 'bg-emerald-500 text-emerald-950 ring-4 ring-emerald-500/30' : 'bg-white/95 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-slate-700'}" style="left:${z.x}%;top:${z.y}%"><span class="text-[13px]">${z.e}</span>${esc(z.n)} <span class="opacity-60">${z.items.length}</span>${o ? '<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>' : ''}</button>`; }).join('')}</div>
    ${desk ? '' : '<p class="-mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400"><span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"></span> etwas offen · Bereich antippen</p>'}`;
  if (desk) {   // PC: gewählter Bereich rechts, alle Fächer als Kacheln nebeneinander (statt Fächer-Leiste)
    h += `<div id="inv-zone" class="min-w-0 flex-1 text-left"><div class="flex items-baseline justify-between gap-2"><p class="text-[17px] font-bold">${zc.e} ${esc(zc.n)}</p><span class="text-[12px] text-slate-500 dark:text-slate-400">${zc.items.length} Dinge${zc.fs.length > 1 ? ' · ' + zc.fs.length + ' Fächer' : ''} · ${invOpenN(zc.items) ? invOpenN(zc.items) + ' offen' : 'alles da'}</span></div>
      <div class="mt-2.5 grid items-start gap-2.5" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${zc.fs.map(f => { const big = f.items.length > 8;   // lange Fächer über zwei Spalten, Dinge darin zweispaltig
        return `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 px-3 pb-1 pt-2.5" style="${big ? 'grid-column:span 2' : ''}"><p class="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">${esc(f.name)}</p><div class="${big ? 'columns-2 gap-x-5' : ''}">${f.items.map(i => `<div class="break-inside-avoid">${invItem(i)}</div>`).join('')}</div></div>`; }).join('')}</div>
      <p class="mt-2.5 text-[11.5px] text-slate-500 dark:text-slate-400"><span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"></span> etwas offen · anderen Bereich am Auto anklicken · ← → wechselt Bereiche</p></div></div>
      <button type="button" data-invtxt class="w-full text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">${invTxt ? 'Text ausblenden' : 'Als Text anzeigen'}</button>
      ${invTxt ? `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-3 text-sm leading-6 whitespace-pre-wrap break-words text-left">${kbLinkify(x.text)}</div>` : ''}`;
    return h;
  }
  const fsel = zc.fs.some(f => f.name === invF) ? invF : null, shown = fsel ? zc.fs.filter(f => f.name === fsel) : zc.fs;
  h += `<div id="inv-zone" class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 px-3 pb-1.5 pt-3 text-left"><div class="flex items-baseline justify-between gap-2"><p class="text-[15px] font-bold">${zc.e} ${esc(zc.n)}</p><span class="text-[11.5px] text-slate-500 dark:text-slate-400">${zc.items.length} Dinge${zc.fs.length > 1 ? ' · ' + zc.fs.length + ' Fächer' : ''}${invOpenN(zc.items) ? ' · ' + invOpenN(zc.items) + ' offen' : ''}</span></div>
    ${zc.fs.length > 1 ? `<div class="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 text-[11.5px] font-semibold">${[['', 'Alle']].concat(zc.fs.map(f => [f.name, f.name])).map(([k, n]) => `<button type="button" data-invf="${esc(k)}" class="shrink-0 rounded-lg px-2.5 py-1 ${(fsel || '') === k ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400'}">${esc(n)}</button>`).join('')}</div>` : ''}
    ${shown.map(f => (zc.fs.length > 1 && !fsel ? `<p class="mt-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">${esc(f.name)}</p>` : '') + f.items.map(i => invItem(i)).join('')).join('')}</div>
    <button type="button" data-invtxt class="w-full text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">${invTxt ? 'Text ausblenden' : 'Als Text anzeigen'}</button>
    ${invTxt ? `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-3 text-sm leading-6 whitespace-pre-wrap break-words text-left">${kbLinkify(x.text)}</div>` : ''}`;
  return h;
}
function invRender() { const b = $('inv-box'), x = getKb().items.find(y => String(y.id) === String(kbCur)); if (!b || !x) return; const foc = document.activeElement && document.activeElement.id === 'inv-q', pos = foc ? document.activeElement.selectionStart : 0;
  b.innerHTML = invHtml(x); if (foc && $('inv-q')) { $('inv-q').focus(); try { $('inv-q').setSelectionRange(pos, pos); } catch (e) { } } }
/** Haken in der Textzeile setzen/entfernen („?“ fällt beim Abhaken weg) */
function invToggle(li) {
  const kb = getKb(), x = kb.items.find(y => String(y.id) === String(kbCur)); if (!x) return; const ls = String(x.text).split('\n'), l = ls[li]; if (l == null) return;
  ls[li] = /✅/.test(l) ? l.replace(/\s*✅\s*/g, ' ').replace(/\s+$/, '') : l.replace(/\s*\?\s*$/, '').replace(/\s+$/, '') + ' ✅';
  setKb({ cats: kb.cats, items: kb.items.map(y => y === x ? { ...y, text: ls.join('\n'), at: new Date().toISOString() } : y) }); invRender();
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#inv-box')) return;
  const i = e.target.closest('[data-invi]'); if (i) { invToggle(+i.dataset.invi); return; }
  if (e.target.closest('[data-invtxt]')) { invTxt = !invTxt; invRender(); return; }
  const z = e.target.closest('[data-invz]'); if (z) { invZ = z.dataset.invz; invF = z.dataset.invf || null; if (invQ) { invQ = ''; } invRender(); const zn = $('inv-zone'); if (zn) zn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
  const f = e.target.closest('[data-invf]'); if (f) { invF = f.dataset.invf || null; invRender(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'inv-q') { invQ = e.target.value; invRender(); } });
/* PC: Dialog für Packlisten breit (Auto links, Bereich rechts); ← → wechselt den Bereich */
{ const ok = openKb; openKb = function (id) { const r = ok.apply(this, arguments); try { const x = getKb().items.find(y => String(y.id) === String(id)); $('kb-dialog').firstElementChild.classList.toggle('kb-wide', !!x && invIs(x) && isDesk()); } catch (e) { } return r; }; }
document.addEventListener('keydown', (e) => {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !$('inv-box') || $('kb-dialog').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
  const x = getKb().items.find(y => String(y.id) === String(kbCur)); if (!x) return; const zs = invZones(invParse(x.text)), i = zs.findIndex(z => z.n === invZ); if (i < 0) return;
  invZ = zs[(i + (e.key === 'ArrowRight' ? 1 : -1) + zs.length) % zs.length].n; invF = null; e.preventDefault(); invRender();
});
