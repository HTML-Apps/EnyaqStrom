/* =====================================================================
   Einstellungen › Fahrzeug & Kauf › Bilder-Karussell: Reihenfolge per Ziehen (Pointer, Tastatur ↑/↓).
   settings.carOrd = { <Fahrzeugprofil>: [Bild-Kennungen] } (String(name), 360°-Ansicht = '360'), synchronisiert.
   initCarousel (src/05) ordnet über carOrdApply; geänderte Reihenfolge → Start lädt beim Zurückkehren neu (Karussell baut sich einmal auf).
   ===================================================================== */
var carOrdDirty = false;
function carOrdBase() {
  const prof = CAR_HERO[carProf().key], list = (prof || HERO_IMGS).map(m => ({ ...m })), o = c360Local();
  if (o) list.splice(1, 0, { name: '360', src: (c360Cache && c360Cache.f[0]) || '', c360: true });
  return list;
}
function carOrdApply(imgs) {
  const ord = ((getSettings().carOrd || {})[carProf().key]); if (!Array.isArray(ord) || !ord.length) return imgs;
  const pos = (m) => { const i = ord.indexOf(String(m.name)); return i < 0 ? 1e3 + imgs.indexOf(m) : i; };
  const def = imgs.slice(); imgs.sort((a, b) => pos(a) - pos(b) || def.indexOf(a) - def.indexOf(b));   // neue Bilder (nicht in der Liste) hinten
  return imgs;
}
const carOrdLabel = (m, i) => m.c360 ? '360°-Ansicht' : m.tech ? 'Technik' : m.cut ? (String(m.name) === '_4' ? 'Akku-Schnitt' : 'Maße / Schnitt') : 'Foto';
function renderCarOrd() {
  const ul = $('car-ord'); if (!ul) return; const base = carOrdBase(), list = carOrdApply(base.slice()), n = (() => { try { return carAutoN(); } catch (e) { return 6; } })();
  ul.innerHTML = list.map((m, i) => `<li data-ci="${esc(String(m.name))}" class="flex items-center gap-2.5 border-b border-slate-200 bg-white py-1.5 last:border-b-0 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" data-cdrag class="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 active:cursor-grabbing active:bg-slate-100 dark:active:bg-slate-800" aria-label="Bild ${i + 1} verschieben (Pfeiltasten hoch/runter)"><svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
      <span class="flex h-11 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">${m.src ? `<img src="${m.src}" alt="" class="h-full w-full object-contain" draggable="false">` : '<span class="text-[11px] font-bold text-white">360°</span>'}</span>
      <span class="min-w-0 flex-1"><span class="block text-sm font-medium">${i + 1}. ${esc(carOrdLabel(m, i))}</span><span class="block text-xs ${i < n ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}">${i < n ? 'wechselt automatisch' : 'nur per Wischen'}</span></span></li>`).join('');
}
function carOrdSave() {
  const ids = [...$('car-ord').children].map(li => li.dataset.ci), def = carOrdBase().map(m => String(m.name));
  const all = Object.assign({}, getSettings().carOrd || {}); if (ids.join() === def.join()) delete all[carProf().key]; else all[carProf().key] = ids;
  setQuickSetting('carOrd', Object.keys(all).length ? all : undefined); carOrdDirty = true; renderCarOrd();
}
var carOrdDrag = null;
$('car-ord').addEventListener('pointerdown', (e) => { const h = e.target.closest('[data-cdrag]'); if (!h || carOrdDrag) return; e.preventDefault(); const li = h.closest('li'); try { h.setPointerCapture(e.pointerId); } catch (er) { } carOrdDrag = { li, y0: e.clientY, pid: e.pointerId, moved: false }; li.classList.add('dragging'); });
$('car-ord').addEventListener('pointermove', (e) => { const d = carOrdDrag; if (!d || e.pointerId !== d.pid) return; let dy = e.clientY - d.y0; const p = d.li.previousElementSibling, n = d.li.nextElementSibling;
  if (n && dy > n.offsetHeight / 2) { n.after(d.li); d.y0 += n.offsetHeight; d.moved = true; } else if (p && dy < -p.offsetHeight / 2) { p.before(d.li); d.y0 -= p.offsetHeight; d.moved = true; }
  dy = e.clientY - d.y0; d.li.style.transform = `translateY(${dy}px)`; });
function carOrdEnd(e) { const d = carOrdDrag; if (!d || (e && e.pointerId !== d.pid)) return; carOrdDrag = null; d.li.classList.remove('dragging'); d.li.style.transition = 'transform .15s'; d.li.style.transform = ''; setTimeout(() => { d.li.style.transition = ''; if (d.moved) carOrdSave(); }, 160); }
document.addEventListener('pointerup', carOrdEnd); document.addEventListener('pointercancel', carOrdEnd);   // am Dokument: beim Umhängen der Zeile geht die Zeiger-Bindung verloren
$('car-ord').addEventListener('keydown', (e) => { const h = e.target.closest('[data-cdrag]'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return; e.preventDefault(); const li = h.closest('li'), o = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling; if (!o) return;
  if (e.key === 'ArrowUp') o.before(li); else o.after(li); carOrdSave(); const nh = $('car-ord').querySelector(`li[data-ci="${li.dataset.ci}"] [data-cdrag]`); if (nh) nh.focus(); });
$('car-ord-reset').addEventListener('click', () => { const all = Object.assign({}, getSettings().carOrd || {}); delete all[carProf().key]; setQuickSetting('carOrd', Object.keys(all).length ? all : undefined); carOrdDirty = true; renderCarOrd(); });
$('set-car-n') && $('set-car-n').addEventListener('change', () => setTimeout(renderCarOrd, 50));
{ const sv = showView; showView = function (v) { if (v === 'dashboard' && carOrdDirty) { carOrdDirty = false; setTimeout(() => location.reload(), 0); } const r = sv.apply(this, arguments); if (v === 'settings') try { c360Frames().then(renderCarOrd, renderCarOrd); } catch (e) { } return r; }; }
try { renderCarOrd(); } catch (e) { }
