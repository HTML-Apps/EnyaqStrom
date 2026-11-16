/* =====================================================================
   Startseite anpassen (Einstellungen › Startseite): Reihenfolge der Widgets im Wisch-Bereich per Ziehen am Griff,
   rechts ein/aus. settings.dash = { order: [id…], off: [id…] } (nur wenn abweichend vom Standard, synchronisiert).
   Umsetzung über CSS `order` + Klasse `dash-off` an den Karten; dashSlides() sortiert danach. Einfache Ansicht bleibt unberührt.
   ===================================================================== */
const DASH_W = [
  ['home-card', 'Strom zuhause', 'Ladungen zuhause × Strompreis seit Kauf'],
  ['ltm-card', 'Langzeitverbrauch', 'Verbrauch „Seit Kauf“ vom Bordcomputer eintragen'],
  ['btm-card', 'Akku-Temperatur', 'Akku °C notieren'],
  ['wxo-card', 'Verbrauchs-Prognose', 'braucht einen Wetter-Standort'],
  ['veh-slide', 'Fahrzeugstatus', 'nur mit verbundenem Fahrzeug · am PC neben dem Auto'],
  ['meter-card', 'Zählerstand', 'beim Live-Laden immer sichtbar'],
  ['news-card', 'Neuigkeiten', 'Quellen unter Anbieter & Kategorien']];
function dashCfg() {
  const d = getSettings().dash || {}, ids = DASH_W.map(w => w[0]);
  const order = (Array.isArray(d.order) ? d.order : []).filter(id => ids.includes(id));
  ids.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id); });   // neue Widgets an ihrer Standardstelle
  return { order, off: (Array.isArray(d.off) ? d.off : []).filter(id => ids.includes(id)) };
}
function applyDash() {
  const c = dashCfg(), simple = isSimple();
  DASH_W.forEach(([id]) => { const el = $(id); if (!el) return;
    el.style.order = simple ? '' : String(c.order.indexOf(id)); el.classList.toggle('dash-off', !simple && c.off.includes(id)); });
  const dd = $('dash-dots'); if (dd) dd.innerHTML = '';   // Punkte neu beschriften (Reihenfolge kann sich geändert haben)
  try { dashSwipeSync(); } catch (e) { }
}
/* Wisch-Reihenfolge = sichtbare Reihenfolge; ausgeblendete Widgets zählen nicht (Zählerstand beim Live-Laden schon) */
{ const ds = dashSlides; dashSlides = function () {
  const r = ds.apply(this, arguments); if (isSimple()) return r;
  return r.filter(x => !x.classList.contains('dash-off') || (x.id === 'meter-card' && liveHero)).sort((a, b) => (Number(a.style.order) || 0) - (Number(b.style.order) || 0));
}; }
function dashSave(order, off) {
  const def = DASH_W.map(w => w[0]).join(), same = order.join() === def && !off.length;
  setQuickSetting('dash', same ? undefined : { order, off });
  applyDash(); const m = $('dash-order-msg'); if (m) { m.textContent = '✓ Gespeichert'; clearTimeout(m._t); m._t = setTimeout(() => { m.textContent = ''; }, 1800); }
}
function renderDashSet() {
  const ul = $('dash-order'); if (!ul) return; const c = dashCfg();
  ul.innerHTML = c.order.map(id => { const w = DASH_W.find(x => x[0] === id), on = !c.off.includes(id);
    return `<li data-w="${id}" class="flex items-center gap-2 border-b border-slate-200 bg-white py-2 last:border-b-0 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" data-drag class="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 active:cursor-grabbing active:bg-slate-100 dark:active:bg-slate-800" aria-label="${esc(w[1])} verschieben (Pfeiltasten hoch/runter)"><svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
      <span class="min-w-0 flex-1 ${on ? '' : 'opacity-50'}"><span class="block text-sm font-medium">${esc(w[1])}</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(w[2])}</span></span>
      <label class="flex shrink-0 cursor-pointer items-center"><input type="checkbox" data-won="${id}" class="peer sr-only" aria-label="${esc(w[1])} anzeigen"${on ? ' checked' : ''}>
      <span class="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></label></li>`; }).join('');
}
const dashDomOrder = () => [...$('dash-order').children].map(li => li.dataset.w);
$('dash-order').addEventListener('change', (e) => {
  const id = e.target.dataset.won; if (!id) return; const c = dashCfg();
  const off = e.target.checked ? c.off.filter(x => x !== id) : [...new Set([...c.off, id])];
  dashSave(dashDomOrder(), off); renderDashSet();
});
/* Ziehen am Griff (Maus und Finger): Zeile folgt dem Zeiger, tauscht mit dem Nachbarn ab halber Zeilenhöhe */
var dashDrag = null;
$('dash-order').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h || dashDrag) return; e.preventDefault();
  const li = h.closest('li'); try { h.setPointerCapture(e.pointerId); } catch (er) { }
  dashDrag = { li, y0: e.clientY, pid: e.pointerId, moved: false }; li.classList.add('dragging');
});
$('dash-order').addEventListener('pointermove', (e) => {
  const d = dashDrag; if (!d || e.pointerId !== d.pid) return;
  let dy = e.clientY - d.y0; const prev = d.li.previousElementSibling, next = d.li.nextElementSibling;
  if (next && dy > next.offsetHeight / 2) { next.after(d.li); d.y0 += next.offsetHeight; d.moved = true; }
  else if (prev && dy < -prev.offsetHeight / 2) { prev.before(d.li); d.y0 -= prev.offsetHeight; d.moved = true; }
  dy = e.clientY - d.y0; d.li.style.transform = `translateY(${dy}px)`;
});
function dashDragEnd(e) {
  const d = dashDrag; if (!d || (e && e.pointerId !== d.pid)) return; dashDrag = null;
  d.li.classList.remove('dragging'); d.li.style.transition = 'transform .15s'; d.li.style.transform = '';
  setTimeout(() => { d.li.style.transition = ''; }, 160);
  if (d.moved) dashSave(dashDomOrder(), dashCfg().off);
}
$('dash-order').addEventListener('pointerup', dashDragEnd);
$('dash-order').addEventListener('pointercancel', dashDragEnd);
/* Tastatur: Griff fokussieren, Pfeil hoch/runter verschiebt */
$('dash-order').addEventListener('keydown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return; e.preventDefault();
  const li = h.closest('li'), o = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling; if (!o) return;
  if (e.key === 'ArrowUp') o.before(li); else o.after(li); h.focus(); dashSave(dashDomOrder(), dashCfg().off);
});
$('dash-order-reset').addEventListener('click', () => { setQuickSetting('dash', undefined); applyDash(); renderDashSet(); const m = $('dash-order-msg'); if (m) m.textContent = '✓ Standard wiederhergestellt'; });
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') try { renderDashSet(); } catch (e) { } return r; }; }
{ const rd = renderDashboard; renderDashboard = function () { const r = rd.apply(this, arguments); try { applyDash(); } catch (e) { } return r; }; }
try { applyDash(); renderDashSet(); } catch (e) { }
