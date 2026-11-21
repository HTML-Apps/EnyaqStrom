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
  ['news-card', 'Neuigkeiten', 'Quellen unter Anbieter & Kategorien'],
  ['sos-card', 'Notfall', 'Standort, 112, Pannenhilfe · antippen für die Notfallseite']];
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
  let first = '', pref = '', dyn = false; try { first = dashStartId(); pref = dashStartPref(); dyn = dashDyn(); } catch (e) { }
  const dd = $('set-dash-dyn'); if (dd) dd.checked = dyn;
  const nm = (id) => (DASH_W.find(x => x[0] === id) || [0, ''])[1];
  ul.innerHTML = c.order.map(id => { const w = DASH_W.find(x => x[0] === id), on = !c.off.includes(id), st = on && id === first;
    return `<li data-w="${id}" class="flex items-center gap-2 border-b border-slate-200 py-2 last:border-b-0 dark:border-slate-800 ${st ? 'dash-start relative z-[1] -mx-2 my-1 rounded-2xl border-b-0 bg-emerald-50 px-2 ring-2 ring-emerald-500 dark:bg-emerald-500/10' : 'bg-white dark:bg-slate-900'}"${st ? ' aria-current="true"' : ''}>
      <button type="button" data-drag class="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 active:cursor-grabbing active:bg-slate-100 dark:active:bg-slate-800" aria-label="${esc(w[1])} verschieben (Pfeiltasten hoch/runter)"><svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
      <span class="min-w-0 flex-1 ${on ? '' : 'opacity-50'}"><span class="flex min-w-0 items-center gap-1.5"><span class="truncate text-sm ${st ? 'font-bold' : 'font-medium'}">${esc(w[1])}</span>${st ? '<span class="shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Start</span>' : ''}</span><span class="block truncate text-xs ${st ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}">${esc(st ? (id !== pref ? (id === 'meter-card' && dyn ? 'startet gerade (Dynamisch: wenig Akku)' : '„' + nm(pref) + '“ gerade nicht verfügbar – startet stattdessen') : 'wird beim Öffnen zuerst gezeigt') : id === pref ? 'Startansicht, wenn verfügbar' : w[2])}</span></span>
      <button type="button" data-star="${id}" aria-pressed="${id === pref}" aria-label="${esc(w[1])} als Startansicht" title="Als Startansicht" class="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-[22px] leading-none active:scale-90 transition ${id === pref ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}">${id === pref ? '★' : '☆'}</button>
      <label class="flex shrink-0 cursor-pointer items-center"><input type="checkbox" data-won="${id}" class="peer sr-only" aria-label="${esc(w[1])} anzeigen"${on ? ' checked' : ''}>
      <span class="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></label></li>`; }).join('');
}
const dashDomOrder = () => [...$('dash-order').children].map(li => li.dataset.w);
$('dash-order').addEventListener('click', (e) => {
  const b = e.target.closest('[data-star]'); if (!b) return; const id = b.dataset.star, c = dashCfg();
  setQuickSetting('dashStart', id);
  if (c.off.includes(id)) dashSave(dashDomOrder(), c.off.filter(x => x !== id)); else applyDash();   // Stern auf ausgeblendetes Widget blendet es wieder ein
  renderDashSet(); const m = $('dash-order-msg'); if (m) { m.textContent = '★ „' + (DASH_W.find(x => x[0] === id) || [0, ''])[1] + '“ ist die Startansicht'; clearTimeout(m._t); m._t = setTimeout(() => { m.textContent = ''; }, 2500); }
});
$('set-dash-dyn').addEventListener('change', (e) => { setQuickSetting('dashDyn', !!e.target.checked); renderDashSet(); });
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
  if (d.moved) { dashSave(dashDomOrder(), dashCfg().off); setTimeout(renderDashSet, 170); }
}
$('dash-order').addEventListener('pointerup', dashDragEnd);
$('dash-order').addEventListener('pointercancel', dashDragEnd);
/* Tastatur: Griff fokussieren, Pfeil hoch/runter verschiebt */
$('dash-order').addEventListener('keydown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return; e.preventDefault();
  const li = h.closest('li'), o = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling; if (!o) return;
  if (e.key === 'ArrowUp') o.before(li); else o.after(li); h.focus(); dashSave(dashDomOrder(), dashCfg().off);
});
$('dash-order-reset').addEventListener('click', () => { setQuickSetting('dash', undefined); setQuickSetting('dashStart', undefined); applyDash(); renderDashSet(); const m = $('dash-order-msg'); if (m) m.textContent = '✓ Standard wiederhergestellt'; });
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') try { renderDashSet(); } catch (e) { } return r; }; }
{ const rd = renderDashboard; renderDashboard = function () { const r = rd.apply(this, arguments); try { applyDash(); } catch (e) { } return r; }; }
try { applyDash(); renderDashSet(); } catch (e) { }
/* Solange nicht selbst gewischt wurde: Startansicht festhalten, auch wenn Karten nachträglich erscheinen/verschwinden oder umsortiert werden
   (sonst verschiebt z. B. das spät eingeblendete „Strom zuhause“ die Ansicht auf eine andere Karte) */
var dashHoldT = null;
function dashHold() {
  if (window.dSwUser || currentView !== 'dashboard') return;
  clearTimeout(dashHoldT); dashHoldT = setTimeout(() => { if (window.dSwUser) return; try { const want = dashDefaultIdx(); if (dSw.idx !== want || Math.abs(dashSlides()[want].offsetLeft - dSw.tr.offsetLeft - dSw.tr.scrollLeft) > 4) dashSwipeTo(want, false); } catch (e) { } }, 30);
}
try { new MutationObserver(dashHold).observe($('dash-swipe-track'), { subtree: false, childList: true, attributes: true, attributeFilter: ['class', 'style'] }); } catch (e) { }
try { $('dash-swipe-track').querySelectorAll(':scope > div').forEach(el => new MutationObserver(dashHold).observe(el, { attributes: true, attributeFilter: ['class', 'style'] })); } catch (e) { }
dashHold();

/* Sicherung der Startseite je Gerätetyp: Die Einstellung bleibt je Gerät (lokal), wird aber zusätzlich als dashPD (PC) bzw. dashPM (Handy)
   in die Cloud geschrieben. Ist der Gerätespeicher leer (Browser hat Websitedaten gelöscht, neues Gerät …) – erkennbar am fehlenden
   lokalen Stempel dashT –, kommt die Startseite aus dieser Sicherung zurück. Ein Gerät mit eigenem Stempel übernimmt nie fremde Werte. */
const DASH_KEYS = ['dash', 'dashStart', 'dashDyn'];
const dashTypeKey = () => (matchMedia('(min-width: 1280px)').matches ? 'dashPD' : 'dashPM');
{ const sq = setQuickSetting; setQuickSetting = function (k, v) {
  const r = sq.apply(this, arguments);
  if (DASH_KEYS.includes(k)) { const st = load(KEY_SETTINGS, {}) || {}, b = { t: Date.now() }; DASH_KEYS.forEach(x => { if (st[x] !== undefined) b[x] = st[x]; });
    st.dashT = b.t; st[dashTypeKey()] = b; save(KEY_SETTINGS, st); try { pushPrefs(); } catch (e) { } }
  return r; }; }
function dashRestore() {
  const st = load(KEY_SETTINGS, {}) || {}; if (st.dashT) return false;
  const b = st[dashTypeKey()]; if (!b || typeof b !== 'object' || !b.t) return false;
  DASH_KEYS.forEach(x => { if (b[x] !== undefined) st[x] = b[x]; else delete st[x]; }); st.dashT = b.t; save(KEY_SETTINGS, st);
  try { applyDash(); renderDashSet(); window.dSwUser = false; dashSwipeTo(dashDefaultIdx(), false); } catch (e) { }
  return true;
}
{ const oc = window.onCloudPrefs; window.onCloudPrefs = function () { const r = oc && oc.apply(this, arguments); try { dashRestore(); } catch (e) { } return r; }; }
/* Vorhandene Einstellung ohne Stempel (vor dieser Version gespeichert): als eigenen Stand übernehmen und einmal sichern */
try { const st = load(KEY_SETTINGS, {}) || {}; if (!st.dashT && DASH_KEYS.some(x => st[x] !== undefined)) setQuickSetting('dash', st.dash); else dashRestore(); } catch (e) { }
/* Browser bitten, den Speicher dieser App nicht von selbst zu leeren (Chrome/Edge/Android); Stand im Gerätecheck */
try { navigator.storage && navigator.storage.persist && navigator.storage.persisted().then(p => { window.storePersist = p; if (!p) navigator.storage.persist().then(q => { window.storePersist = q; }); }); } catch (e) { }
try { if (!localStorage.getItem('enyaq.devBorn')) localStorage.setItem('enyaq.devBorn', String(Date.now())); } catch (e) { }
