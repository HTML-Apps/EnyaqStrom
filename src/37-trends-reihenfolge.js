/* =====================================================================
   Trends (Start): Reihenfolge ohne Einstellungs-Menü ändern + Wert-Anzeige je Balken bei „Verbrauch 30 Tage“.
   Lange auf eine Trends-Karte drücken (≈ 0,5 s) → Verschiebe-Modus: Leiste unter dem Karussell mit ‹ › (verschiebt die
   gerade sichtbare Karte, Wischen wählt eine andere) und „Fertig“. Reihenfolge settings.trOrd = [data-tkey…] (synchronisiert,
   nur wenn abweichend). Antippen eines Balkens (Verbrauch 30 Tage) → Blase mit Datum, kWh/100, km, Fahrten.
   ===================================================================== */
let trEdit = false, trMidDone = false;
/* Trends-Bereich war beim ersten Aufbau noch unsichtbar (Breite 0) → sobald er Breite bekommt, einmal auf die Mitte setzen */
try { new ResizeObserver(() => { if (!trMidDone && $('trends').firstElementChild?.offsetWidth > 0) renderTrends(); }).observe($('trends')); } catch (e) { }
const trDotsHtml = (n) => Array.from({ length: n }, (_, i) => `<span data-tdot="${i}" class="block h-2 rounded-full transition-all ${i === trendIdx ? 'w-5 bg-emerald-500' : 'w-2 bg-slate-500/60'}"></span>`).join('');
function trKeys() { return [...$('trends').children].map(a => a.dataset.tkey); }
function trApplyOrder() {
  const box = $('trends'), ord = getSettings().trOrd; if (!Array.isArray(ord) || !ord.length) return;
  const cards = [...box.children], by = {}; cards.forEach(a => by[a.dataset.tkey] = a);
  const seq = ord.filter(k => by[k]); cards.forEach((a, i) => { const k = a.dataset.tkey; if (seq.includes(k)) return; seq.splice(Math.min(i, seq.length), 0, k); });   // neue Karten an ihrer Standard-Stelle
  seq.forEach(k => box.appendChild(by[k]));
}
{ const orig = renderTrends;
  renderTrends = function () {
    orig.apply(this, arguments);
    const box = $('trends'); if (!box || !box.children.length) return;
    try { trApplyOrder(); } catch (e) { }
    if (!trMidDone && box.firstElementChild.offsetWidth > 0) { trMidDone = true; trendIdx = Math.floor(box.children.length / 2); }   // Start: mittlere Karte → je 2 nach links/rechts
    trendIdx = Math.min(trendIdx, box.children.length - 1);
    $('trends-dots').innerHTML = trDotsHtml(box.children.length);
    box.scrollLeft = trendIdx * (box.firstElementChild.offsetWidth + 16);
    if (trEdit) trEditPaint();
  };
  try { renderTrends(); } catch (e) { }
}
function trEditPaint() {
  const box = $('trends'), n = box.children.length, i = trendIdx;
  [...box.children].forEach((a, k) => { a.classList.toggle('ring-2', trEdit && k === i); a.classList.toggle('ring-emerald-500', trEdit && k === i); a.classList.toggle('ring-inset', trEdit && k === i); });
  let bar = $('trends-edit');
  if (!trEdit) { if (bar) bar.remove(); $('trends-dots').classList.remove('hidden'); return; }
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'trends-edit';
    bar.className = '!mt-2 flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 shadow-sm p-1.5';
    $('trends-dots').after(bar); $('trends-dots').classList.add('hidden');
  }
  const btn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-30 active:scale-95 transition';
  const title = box.children[i]?.getAttribute('aria-label') || '';
  bar.innerHTML = `<button type="button" data-trmv="-1" class="${btn}" aria-label="Nach vorne" ${i <= 0 ? 'disabled' : ''}>‹</button>
    <div class="min-w-0 flex-1 text-center leading-tight"><p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">${esc(title)}</p><p class="text-xs text-slate-500 dark:text-slate-400">Position ${i + 1} von ${n} · wischen wählt</p></div>
    <button type="button" data-trmv="1" class="${btn}" aria-label="Nach hinten" ${i >= n - 1 ? 'disabled' : ''}>›</button>
    <button type="button" data-trdone class="h-10 shrink-0 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white active:scale-95 transition">Fertig</button>`;
}
function trEditStart() { trEdit = true; try { navigator.vibrate && navigator.vibrate(15); } catch (e) { } trEditPaint(); }
function trEditEnd() { trEdit = false; trEditPaint(); }
function trMove(d) {
  const box = $('trends'), cards = [...box.children], i = trendIdx, j = i + d; if (j < 0 || j >= cards.length) return;
  if (d > 0) cards[j].after(cards[i]); else cards[j].before(cards[i]);
  const keys = trKeys(), def = [...keys].sort((a, b) => TR_DEF.indexOf(a) - TR_DEF.indexOf(b));
  setQuickSetting('trOrd', keys.join() === def.join() ? undefined : keys);
  trendIdx = j; $('trends-dots').innerHTML = trDotsHtml(cards.length);
  box.style.scrollSnapType = 'none'; box.scrollTo({ left: j * (box.firstElementChild.offsetWidth + 16), behavior: 'smooth' });
  setTimeout(() => { box.style.scrollSnapType = ''; }, 450);
  trEditPaint();
}
const TR_DEF = ['km', 'strom', 'ges', 'eff', 'fbv'];
document.addEventListener('click', (e) => {
  const mv = e.target.closest('[data-trmv]'); if (mv) { trMove(Number(mv.dataset.trmv)); return; }
  if (e.target.closest('[data-trdone]')) { trEditEnd(); return; }
  if (trEdit && !e.target.closest('#trends, #trends-edit')) trEditEnd();
});
/* Langes Drücken auf eine Karte startet den Verschiebe-Modus */
{ const box = $('trends'); let lp = null, fired = false;
  box.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return; fired = false; clearTimeout(lp?.t);
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { fired = true; lp = null; trEditStart(); }, 520) };
  });
  const cancel = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  box.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => box.addEventListener(t, cancel));
  box.addEventListener('scroll', cancel, { passive: true });
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  box.addEventListener('click', (e) => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);   // Klick nach langem Drücken schlucken
  box.addEventListener('scroll', () => { if (trEdit) requestAnimationFrame(trEditPaint); }, { passive: true });
}
/* Verbrauch 30 Tage: Wert je Balken als Blase */
function fbvTip(bar) {
  const host = bar.closest('[data-fbv-box]'); if (!host) return;
  const old = host.querySelector('.fbv-tip'), was = old && old.dataset.k === bar.dataset.fbv;
  host.querySelectorAll('.fbv-tip').forEach(x => x.remove()); host.querySelectorAll('[data-fbv] > div').forEach(x => x.style.outline = '');
  if (was) return;
  const [d, v, km, n] = bar.dataset.fbv.split('|'), hr = host.getBoundingClientRect(), br = bar.getBoundingClientRect();
  const cx = br.left + br.width / 2 - hr.left, tip = document.createElement('div');
  tip.className = 'fbv-tip pointer-events-none absolute z-20 -top-2 -translate-y-full whitespace-nowrap rounded-xl bg-slate-900 dark:bg-slate-100 px-2.5 py-1.5 text-xs text-white dark:text-slate-900 shadow-lg';
  tip.dataset.k = bar.dataset.fbv;
  tip.innerHTML = Number(n) ? `<b class="tabular-nums">${d}</b> · <b class="tabular-nums">${v}</b> kWh/100<br><span class="opacity-75 tabular-nums">${km} km · ${n} ${n === '1' ? 'Fahrt' : 'Fahrten'}</span>` : `<b>${d}</b> · keine Fahrt`;
  host.appendChild(tip);
  const w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(hr.width - w, cx - w / 2)) + 'px';
  const fill = bar.firstElementChild; if (fill && Number(n)) { fill.style.outline = '2px solid currentColor'; fill.style.outlineOffset = '1px'; }
}
$('trends').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fbv]'); if (b) { fbvTip(b); return; }
  document.querySelectorAll('#trends .fbv-tip').forEach(x => x.remove()); document.querySelectorAll('#trends [data-fbv] > div').forEach(x => x.style.outline = '');
});
