/* =====================================================================
   360°-Ansicht als zusätzliches Bild im Start-Karussell (2. Bild). Quelle: eigene Datei = Bildstreifen mit N Ansichten untereinander
   (gleich groß, freigestellt; N aus dem Dateinamen „…-12.webp“, sonst 12). Liegt NICHT im Repo, sondern privat je Konto:
   Cloud-Dokument settings/timg_c360 (über cloud.setTireImg/getTireImg) + Zwischenspeicher localStorage enyaq.c360 {v, d, n}.
   Im Karussell dreht sie sich langsam (src/05); Antippen → Vollbild, Ziehen/Pfeiltasten drehen.
   ===================================================================== */
var c360Cache = null;
function c360Local() { try { const o = JSON.parse(localStorage.getItem('enyaq.c360') || 'null'); return o && o.d && o.n > 1 ? o : null; } catch (e) { return null; } }
/** Bildstreifen in einzelne Ansichten (Data-URLs) zerlegen; {f: [...], aspect} oder null */
async function c360Frames() {
  if (c360Cache) return c360Cache; const o = c360Local(); if (!o) return null;
  const im = new Image(); im.src = o.d; await im.decode();
  const w = im.naturalWidth, h = Math.round(im.naturalHeight / o.n); if (!w || h < 10) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), f = [];
  for (let i = 0; i < o.n; i++) { x.clearRect(0, 0, w, h); x.drawImage(im, 0, i * h, w, h, 0, 0, w, h); f.push(c.toDataURL('image/webp', 0.9)); }
  c360Cache = { f, aspect: w / h }; return c360Cache;
}
/* ---- Vollbild: Ziehen dreht (alle 28 px eine Ansicht), ← →, Leertaste = Drehen an/aus, ✕/Esc/Zurück schließt ---- */
var c360Ov = null;
async function c360Open() {
  const c = await c360Frames(); if (!c) return; let i = 0, auto = true, t = 0, sx = null, si = 0, pushed = false;
  const ov = document.createElement('div'); c360Ov = ov; ov.className = 'fixed inset-0 z-[95] select-none bg-black text-white'; ov.style.touchAction = 'none';
  ov.innerHTML = `<img alt="Enyaq 360°" draggable="false" class="absolute inset-0 h-full w-full object-contain" style="padding:max(56px,env(safe-area-inset-top)) 4px max(84px,env(safe-area-inset-bottom))" src="${c.f[0]}">
    <p class="absolute left-4 font-barlow text-xl font-bold uppercase tracking-[0.1em]" style="top:max(16px,env(safe-area-inset-top))">360°</p>
    <button type="button" data-c3="x" aria-label="Schließen" class="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl" style="top:max(8px,env(safe-area-inset-top))">✕</button>
    <div class="absolute inset-x-0 flex items-center justify-center gap-3" style="bottom:max(22px,env(safe-area-inset-bottom))">
      <button type="button" data-c3="prev" aria-label="Nach links drehen" class="h-11 w-11 rounded-full bg-white/15 text-2xl">‹</button>
      <button type="button" data-c3="auto" class="h-11 rounded-full bg-white/15 px-5 text-sm font-semibold"></button>
      <button type="button" data-c3="next" aria-label="Nach rechts drehen" class="h-11 w-11 rounded-full bg-white/15 text-2xl">›</button></div>
    <p class="pointer-events-none absolute inset-x-0 text-center text-[12px] text-white/60" style="bottom:max(76px,calc(env(safe-area-inset-bottom) + 54px))">Ziehen zum Drehen</p>`;
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  const img = ov.querySelector('img'), ab = ov.querySelector('[data-c3="auto"]');
  const set = (n) => { i = ((n % c.f.length) + c.f.length) % c.f.length; img.src = c.f[i]; };
  const run = () => { clearInterval(t); ab.textContent = auto ? '❚❚ Anhalten' : '▶ Drehen'; if (auto) t = setInterval(() => set(i + 1), 650); };
  run();
  const close = (fromPop) => { clearInterval(t); ov.remove(); c360Ov = null; document.body.style.overflow = ''; document.removeEventListener('keydown', key); window.removeEventListener('popstate', pop); if (pushed && !fromPop) try { history.back(); } catch (e) { } };
  const key = (e) => { if (e.key === 'Escape') close(false); else if (e.key === 'ArrowLeft') { auto = false; run(); set(i - 1); } else if (e.key === 'ArrowRight') { auto = false; run(); set(i + 1); } else if (e.key === ' ') { e.preventDefault(); auto = !auto; run(); } };
  const pop = () => { pushed = false; close(true); };
  document.addEventListener('keydown', key); try { history.pushState({ c360: 1 }, ''); pushed = true; window.addEventListener('popstate', pop); } catch (e) { }
  ov.addEventListener('click', (e) => { const b = e.target.closest('[data-c3]'); if (!b) return; const k = b.dataset.c3;
    if (k === 'x') close(false); else if (k === 'auto') { auto = !auto; run(); } else { auto = false; run(); set(i + (k === 'next' ? 1 : -1)); } });
  ov.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; sx = e.clientX; si = i; auto = false; run(); try { ov.setPointerCapture(e.pointerId); } catch (er) { } });
  ov.addEventListener('pointermove', (e) => { if (sx == null) return; set(si - Math.round((e.clientX - sx) / 28)); });
  ov.addEventListener('pointerup', () => { sx = null; }); ov.addEventListener('pointercancel', () => { sx = null; });
}
/* ---- Einstellungen › Bilder-Karussell: Datei wählen / Entfernen ---- */
function c360Status() { const o = c360Local(), st = $('c360-st'), del = $('c360-del'); if (!st) return; del.classList.toggle('hidden', !o);
  st.textContent = o ? '✓ ' + o.n + ' Ansichten gespeichert' + (o.v ? ' · ' + new Date(o.v).toLocaleDateString('de-DE') : '') + ' – 2. Bild im Karussell' : 'Eigene Drehansicht als 2. Bild im Karussell (nur für dein Konto)'; }
$('c360-file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 950 * 1024) { appNote('Datei zu groß (höchstens ca. 900 KB).'); return; }
  const n = Number((/-(\d{1,2})\.(webp|png)$/i.exec(f.name) || [])[1]) || 12;
  const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const o = { v: Date.now(), d, n };
  try { localStorage.setItem('enyaq.c360', JSON.stringify(o)); } catch (er) { appNote('Speichern im Browser nicht möglich (Speicher voll).'); return; }
  try { if (window.cloud && window.cloud.isSignedIn && window.cloud.isSignedIn()) { await window.cloud.setTireImg('c360', o); localStorage.setItem('enyaq.c360', JSON.stringify({ ...o, up: true })); } } catch (er) { try { syncErr(er); } catch (e2) { } }
  appNote('✓ 360°-Ansicht gespeichert – Start wird neu geladen'); setTimeout(() => location.reload(), 1200);
});
$('c360-del').addEventListener('click', async () => {
  if (!await ask('Die 360°-Ansicht wird aus dem Karussell und aus deiner Cloud entfernt.', { title: '360°-Ansicht entfernen?', ok: 'Entfernen', danger: true })) return;
  try { localStorage.removeItem('enyaq.c360'); } catch (e) { } try { await window.cloud.delTireImg('c360'); } catch (e) { }
  appNote('360°-Ansicht entfernt'); setTimeout(() => location.reload(), 1000);
});
c360Status();
/* Neues Gerät / anderes Gerät hat hochgeladen oder entfernt: nach dem ersten Cloud-Abgleich angleichen (gilt ab dem nächsten Öffnen) */
{ const oc = window.onCloudPrefs; let done = false; window.onCloudPrefs = function (d, first) { const r = oc && oc.apply(this, arguments);
  if (!done && window.cloud && window.cloud.getTireImg) { done = true; window.cloud.getTireImg('c360').then(c => { const l = c360Local();
    if (!c && l && !l.up) { window.cloud.setTireImg('c360', { v: l.v, d: l.d, n: l.n }).then(() => { try { localStorage.setItem('enyaq.c360', JSON.stringify({ ...l, up: true })); } catch (e) { } }).catch(() => { }); }
    else if (c && c.d && (!l || l.v !== c.v)) { try { localStorage.setItem('enyaq.c360', JSON.stringify({ v: c.v, d: c.d, n: c.n || 12, up: true })); } catch (e) { } c360Status(); if (!l) appNote('360°-Ansicht geladen – erscheint beim nächsten Öffnen im Karussell'); }
    else if (!c && l && l.up) { try { localStorage.removeItem('enyaq.c360'); } catch (e) { } c360Status(); } }).catch(() => { }); }
  return r; }; }
