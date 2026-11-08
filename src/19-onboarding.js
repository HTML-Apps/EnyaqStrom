/* =====================================================================
   Onboarding beim allerersten Öffnen (Entwurf: Canvas „Onboarding“ A1–C2)
   A1 Willkommen + „Mit Google anmelden“ (Titel/Bild nach Fahrzeugprofil; Einladungslink /?auto=epiq setzt den Epiq schon vorher)
   A2 nach der Anmeldung: persönliche Begrüßung, bei Voreinstellung (USER_PRESETS) „Hendrik hat schon alles vorbereitet“
   B1–B3 kurze, überspringbare Fragen: Strompreis, Abholung + km-Stand, Startbildschirm (entfällt, wenn schon installiert)
   C  kurze Tour auf Start (nur einfache Ansicht): Status-Karte, Plus, Auswerten
   Fortschritt in localStorage „enyaq.onb“ (a1 … b3, t1 … t3, done) – übersteht das Neuladen nach der Voreinstellung.
   Wer schon Daten hat (lokal oder in der Cloud), sieht nichts davon.
   ===================================================================== */
const KEY_ONB = 'enyaq.onb';
const onbNeedVeh = () => typeof vehicle !== 'undefined' && vehicle.allowed && !vehicle.ok;
const onbSteps = () => ['b1', 'b2', ...(onbNeedVeh() || onbGet() === 'bv' ? ['bv'] : []), ...(onbStandalone() ? [] : ['b3'])];   // Fahrzeug nur, wenn freigegeben und noch nicht verbunden; Startbildschirm entfällt, wenn installiert
const onbGet = () => { try { return localStorage.getItem(KEY_ONB) || ''; } catch (e) { return 'done'; } };
const onbSet = (v) => { try { localStorage.setItem(KEY_ONB, v); } catch (e) { } };
let onbInstall = null; window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); onbInstall = e; });   // „Auf den Startbildschirm“ in B3
const onbStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
(() => {
  /* Einladungslink: /?auto=epiq → Fahrzeug schon vor der Anmeldung (Titel und Bild auf dem Willkommensbildschirm) */
  const q = new URLSearchParams(location.search), a = (q.get('auto') || '').toLowerCase();
  if (a) { const key = a.startsWith('epiq') ? 'epiq55' : a.startsWith('enyaq') ? 'enyaq50' : null;
    const was = carProf().key;
    if (key && !getReadings().length) { const st = load(KEY_SETTINGS, {}) || {}; if (key === 'enyaq50') delete st.car; else st.car = key; st.title = CAR_PRESETS[key].title; save(KEY_SETTINGS, st); try { applyTitle(); } catch (e) { } }
    q.delete('auto'); const clean = location.pathname + (q.toString() ? '?' + q : '');
    if (carProf().key !== was) { location.replace(clean); return; }                       // Karussell wurde schon mit dem alten Auto aufgebaut → sauber neu laden
    history.replaceState(null, '', clean); }
  if (onbGet()) return;
  const s = syncSet(load(KEY_SETTINGS, {})) || {}, own = Object.keys(s).filter(k => !['car', 'title', 'ui'].includes(k));
  onbSet(getReadings().length || getCosts().length || own.length ? 'done' : 'a1');                       // vorhandene Nutzer: kein Onboarding
})();
function onbHero() { const l = (typeof CAR_HERO !== 'undefined' && CAR_HERO[carProf().key]) || HERO_IMGS; return l[0].src; }
const ONB_BG = 'background:radial-gradient(ellipse 80% 45% at 50% 38%,rgba(80,150,255,.42),rgba(80,150,255,0) 70%),linear-gradient(180deg,#000,#061a52 45%,#000)';
const onbBtn = (act, t) => `<button type="button" data-onb="${act}" class="flex h-14 w-full items-center justify-center rounded-[18px] bg-emerald-600 text-[17px] font-bold text-white active:scale-[0.98] transition">${t}</button>`;
const onbCheck = '<svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
function onbShell(html, bg) {
  let el = $('onb'); if (!el) { el = document.createElement('div'); el.id = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
  el.className = 'fixed inset-0 z-[95] overflow-y-auto bg-black text-white'; el.style.cssText = bg || '';
  el.innerHTML = `<div class="mx-auto flex min-h-full max-w-md flex-col px-[22px] pb-[calc(26px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]">${html}</div>`;
  document.body.style.overflow = 'hidden';
}
function onbClose() { const el = $('onb'); if (el) el.remove(); document.body.style.overflow = ''; }
function onbA1() {
  const t = (carProf().title || carName()).toUpperCase();
  onbShell(`<p class="text-center font-barlow text-[22px] font-bold uppercase tracking-[0.16em] text-slate-300">${esc(t)}</p>
    <div class="flex flex-1 items-center justify-center py-4"><img src="${onbHero()}" alt="" class="w-full max-w-[340px] drop-shadow-[0_18px_18px_rgba(0,0,0,0.6)]"></div>
    <h1 class="text-center text-[28px] font-extrabold leading-tight">Dein E-Auto<br>im Blick</h1>
    <p class="mx-1.5 mb-6 mt-2.5 text-center text-[15px] leading-relaxed text-slate-300">Laden, Kosten und Akku – alles an einem Ort. Melde dich einmal an, dann ist alles gesichert.</p>
    <button type="button" data-onb="login" class="flex h-14 w-full items-center justify-center gap-3 rounded-[18px] bg-white text-[17px] font-bold text-slate-800 active:scale-[0.98] transition"><svg class="h-[22px] w-[22px]" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Mit Google anmelden</button>
    <p id="onb-msg" class="mt-2 min-h-[1.25rem] text-center text-sm text-amber-300" role="status"></p>
    <button type="button" data-onb="nologin" class="mx-auto py-2 text-sm text-slate-400 active:opacity-70">Erst mal ohne Anmeldung ansehen</button>`, ONB_BG);
}
function onbA2() {
  const u = (window.cloud && window.cloud.userInfo && window.cloud.userInfo()) || {}, first = (u.name || '').split(' ')[0], pre = load('enyaq.onbPreset', false);
  const item = (t, s) => `<div class="flex items-center gap-3 border-t border-slate-800 py-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-emerald-500/20 text-emerald-400">${onbCheck}</span><div class="min-w-0"><p class="text-base font-semibold">${esc(t)}</p><p class="text-[13px] text-slate-400">${esc(s)}</p></div></div>`;
  onbShell(`<div class="flex items-center gap-3">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer" class="h-12 w-12 rounded-full">` : `<span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-xl font-bold">${esc((first || u.email || '?')[0].toUpperCase())}</span>`}<div class="min-w-0"><p class="text-sm text-slate-400">Angemeldet als</p><p class="truncate text-base font-semibold">${esc(u.name || u.email || '')}</p></div></div>
    <h1 class="mt-7 text-[30px] font-extrabold leading-tight">Hallo${first ? ' ' + esc(first) : ''}!</h1>
    <p class="mt-1.5 text-base leading-snug text-slate-300">${pre ? 'Hendrik hat schon alles für dich vorbereitet:' : 'Schön, dass du da bist. Das ist eingerichtet:'}</p>
    <div class="my-4 flex justify-center"><img src="${onbHero()}" alt="" class="w-full max-w-[280px]"></div>
    <div class="border-b border-slate-800">${item(carProf().title || carName(), 'Bilder, Akku und Reichweite passend')}${isSimple() ? item('Einfache Ansicht', 'Große Kacheln, nur das Wichtigste') : ''}${item('Daten gesichert', 'in deinem Google-Konto')}</div>
    <div class="min-h-6 flex-1"></div>${onbBtn('go', 'Los geht’s')}<p class="mt-3 text-center text-sm text-slate-400">Noch ${onbSteps().length} kurze Fragen – dauert 1 Minute</p>`, ONB_BG);
}
function onbStep(i, title, sub, body, cta) {
  const st = onbSteps(), dots = st.map((_, k) => `<span class="h-[7px] rounded-full ${k === i ? 'w-[18px] bg-emerald-400' : 'w-[7px] bg-slate-700'}"></span>`).join('');
  onbShell(`<div class="flex items-center justify-between"><span class="text-[13px] text-slate-400">Schritt ${i + 1} von ${st.length}</span><button type="button" data-onb="skip" class="py-1 text-sm text-slate-400 active:opacity-70">Überspringen</button></div>
    <div class="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">${dots}</div>
    <h1 class="mt-7 text-[26px] font-extrabold leading-tight">${title}</h1><p class="mt-2 text-[15px] leading-relaxed text-slate-300">${sub}</p>
    ${body}<div class="min-h-6 flex-1"></div>${onbBtn('next', cta || 'Weiter')}`);
}
let onbPrice = null;
function onbB1() {
  if (onbPrice == null) onbPrice = Math.round((Number(getSettings().price) || 0.35) * 100) / 100;
  const sb = 'flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[20px] bg-slate-800 text-3xl font-semibold active:scale-90 transition select-none';
  onbStep(0, 'Was kostet dein Strom zuhause?', 'Steht auf der Stromrechnung („Arbeitspreis“). Damit rechnet die App deine Ladekosten.',
    `<div class="mt-7 flex items-center gap-3"><button type="button" data-onb="p-" aria-label="1 Cent weniger" class="${sb}">−</button><div class="flex-1 text-center"><p id="onb-price" class="font-barlow text-[54px] font-bold leading-none text-emerald-400 tabular-nums">${fmt(onbPrice, 2)}</p><p class="mt-1 text-[15px] text-slate-400">€ pro kWh</p></div><button type="button" data-onb="p+" aria-label="1 Cent mehr" class="${sb}">+</button></div>
     <p class="mt-6 rounded-2xl bg-slate-900 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-400">Weiß ich gerade nicht? Kein Problem – die App nimmt erst einmal ${fmt(onbPrice, 2)} € und du kannst es später in den Einstellungen ändern.</p>`);
}
function onbB2() {
  const s = getSettings(), inp = 'mt-1.5 h-14 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 text-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500';
  onbStep(1, 'Seit wann hast du deinen ' + esc(carShort()) + '?', 'Damit Rückblick, Garantie und „seit Kauf“ stimmen.',
    `<label class="mt-5 block text-sm text-slate-400">Abholung<input id="onb-buy" type="date" max="${wxIso(new Date())}" value="${esc(s.purchase || '')}" class="${inp} [color-scheme:dark]"></label>
     <p class="mt-1 text-[12.5px] text-slate-500">Tippen öffnet einen Kalender</p>
     <label class="mt-4 block text-sm text-slate-400">Kilometerstand bei Abholung<input id="onb-km" type="text" inputmode="numeric" placeholder="z. B. 18" value="${s.purchaseKm != null ? s.purchaseKm : ''}" class="${inp}"></label>
     <p class="mt-1 text-[12.5px] text-slate-500">Steht im Kombi-Instrument · ungefähr reicht</p>`);
}
function onbBV() {
  onbStep(onbSteps().indexOf('bv'), 'Fahrzeug verbinden?', 'Dann zeigt die App Akkustand, Reichweite und ob das Auto abgeschlossen ist – direkt vom Auto. Den Schlüssel erzeugst du in der MyŠkoda-App.',
    `<div class="mt-5 space-y-3">${vehFormHtml(true, true)}</div><p class="rounded-2xl bg-slate-900 px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-400">Noch kein Auto da? Einfach überspringen – das geht später jederzeit auf Start oder in den Einstellungen.</p>`, 'Verbinden');
}
let onbOpt = { inst: true };
function onbB3() {
  const tog = (k, icon, t, s, dis) => `<button type="button" data-onb="${dis ? '' : 't-' + k}" ${dis ? 'disabled' : ''} role="switch" aria-checked="${!dis && onbOpt[k]}" class="mt-3.5 flex w-full items-center gap-3 rounded-[18px] bg-slate-900 p-3.5 text-left ${dis ? 'opacity-60' : 'active:scale-[0.99] transition'}">${icon}<span class="min-w-0 flex-1"><span class="block text-base font-semibold">${t}</span><span class="block text-[13px] leading-snug text-slate-400">${s}</span></span>${dis ? '' : `<span class="relative h-[30px] w-[50px] shrink-0 rounded-full ${onbOpt[k] ? 'bg-emerald-500' : 'bg-slate-700'}"><span class="absolute top-[3px] h-6 w-6 rounded-full bg-white ${onbOpt[k] ? 'right-[3px]' : 'left-[3px]'}"></span></span>`}</button>`;
  const ico = (p) => `<svg class="h-[26px] w-[26px] shrink-0 text-emerald-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const phone = ico('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>');
  const instRow = onbStandalone() ? tog('inst', phone, 'Auf dem Startbildschirm ✓', 'Die App ist schon installiert.', true)
    : onbInstall ? tog('inst', phone, 'Auf den Startbildschirm', 'App-Symbol neben deinen anderen Apps', false)
    : tog('inst', phone, 'Auf den Startbildschirm', 'Im Browser-Menü ⋮ auf „App installieren“ bzw. „Zum Startbildschirm“ tippen.', true);
  onbStep(onbSteps().indexOf('b3'), 'Fast fertig!', 'Leg die App auf den Startbildschirm – dann öffnet sie sich wie jede andere App:', instRow + '<p id="onb-msg" class="mt-3 min-h-[1.25rem] text-sm text-amber-300" role="status"></p>', 'Fertig');
}
/* Tour auf Start: Ring um das Ziel, Rest abgedunkelt, Sprechblase darunter bzw. darüber */
const onbVeh = () => { const v = $('veh-slide'); return !!v && !v.classList.contains('hidden'); };
const ONB_TOUR = [
  ['t1', () => $('dash-swipe'), () => onbVeh() ? 'Dein Auto auf einen Blick' : 'Verbrauch und Akku', () => onbVeh() ? 'Akku, Reichweite und ob das Auto abgeschlossen ist. Zur Seite wischen zeigt Langzeitverbrauch und Akkupflege.' : 'Ab und zu den Verbrauch „Seit Kauf“ vom Bordcomputer eintragen. Zur Seite wischen zeigt, wie gut der Akku gepflegt wird.'],
  ['t2', () => document.querySelector('#simple-nav [data-easy-nav="add"] span') || document.querySelector('#simple-nav [data-easy-nav="add"]'), 'Nach dem Laden: Plus drücken', 'Zuhause geladen? Zählerstand fotografieren oder eintippen – fertig. Unterwegs: kWh und Preis von der Säule.'],
  ['t3', () => document.querySelector('#simple-nav [data-easy-nav="eval"]'), 'Auswerten', 'Was du geladen, bezahlt und gegenüber einem Benziner gespart hast – Monat für Monat.']
];
function onbTour(i) {
  const st = ONB_TOUR[i]; if (!st) { onbSet('done'); onbClose(); return; }
  onbSet(st[0]); onbClose(); if (currentView !== 'dashboard') showView('dashboard');
  const tgt = st[1](); if (!tgt) { onbTour(i + 1); return; }
  if (i === 0) window.scrollTo(0, 0); else tgt.scrollIntoView({ block: 'nearest' });
  setTimeout(() => {
    const T = (x) => typeof x === 'function' ? x() : x, title = T(st[2]), text = T(st[3]);
    if (i === 0 && onbVeh()) try { dashSwipeTo(dashIdx('veh-slide'), false); } catch (e) { }
    const r = tgt.getBoundingClientRect(), pad = 6, below = r.top + r.height / 2 < innerHeight / 2, rad = getComputedStyle(tgt).borderRadius || '22px';
    const el = document.createElement('div'); el.id = 'onb'; el.className = 'fixed inset-0 z-[95]'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="pointer-events-none absolute rounded-[22px] ring-[3px] ring-emerald-400" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px;border-radius:${rad === '0px' ? '22px' : rad};box-shadow:0 0 0 9999px rgba(0,0,0,.72)"></div>
      <div class="absolute inset-x-4 mx-auto max-w-sm rounded-[18px] bg-slate-50 p-4 text-slate-900 shadow-2xl" style="${below ? 'top:' + (r.bottom + pad + 14) : 'bottom:' + (innerHeight - r.top + pad + 14)}px">
        <span class="absolute h-4 w-4 rotate-45 bg-slate-50" style="${below ? 'top:-8px' : 'bottom:-8px'};left:${Math.max(18, Math.min(innerWidth - 66, r.left + r.width / 2 - 24))}px"></span>
        <p class="text-xs font-bold tracking-wider text-emerald-600">${i + 1} VON ${ONB_TOUR.length}</p><p class="mt-1 text-[17px] font-bold">${title}</p><p class="mt-1 text-sm leading-relaxed text-slate-700">${text}</p>
        <div class="mt-3 flex items-center justify-between"><button type="button" data-onb="tend" class="py-1 text-sm text-slate-500 active:opacity-70">Tour beenden</button><button type="button" data-onb="tnext" class="rounded-xl bg-emerald-600 px-[18px] py-2.5 text-sm font-bold text-white active:scale-95 transition">${i === ONB_TOUR.length - 1 ? 'Fertig' : 'Weiter'}</button></div></div>`;
    document.body.appendChild(el); setTimeout(() => { const b = el.querySelector('[data-onb="tnext"]'); if (b) b.focus({ preventScroll: true }); }, 30);
  }, i === 0 ? 350 : 150);
}
function onbShow() {
  const s = onbGet();
  if (s === 'a1') onbA1(); else if (s === 'a2') onbA2(); else if (s === 'b1') onbB1(); else if (s === 'b2') onbB2(); else if (s === 'bv') onbBV(); else if (s === 'b3') onbB3();
  else if (/^t[123]$/.test(s)) { if (isSimple()) onbTour(Number(s[1]) - 1); else { onbSet('done'); onbClose(); } }
  else onbClose();
}
function onbNext(from) {                                                     // nach B3 bzw. Überspringen: weiter oder Tour
  const st = onbSteps(), i = st.indexOf(from);
  if (i >= 0 && i < st.length - 1) { onbSet(st[i + 1]); onbShow(); return; }
  if (isSimple()) { onbSet('t1'); onbShow(); } else { onbSet('done'); onbClose(); }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('#onb [data-onb]'); if (!b || !b.dataset.onb) return; const a = b.dataset.onb, s = onbGet();
  if (a === 'login') { const m = $('onb-msg'); m.textContent = ''; b.disabled = true;
    try { await window.cloud.login(); m.className = 'mt-2 min-h-[1.25rem] text-center text-sm text-emerald-300'; m.textContent = 'Angemeldet – einen Moment …'; }
    catch (er) { b.disabled = false; m.className = 'mt-2 min-h-[1.25rem] text-center text-sm text-amber-300'; m.textContent = er && /popup-closed|cancel/i.test(er.code || er.message || '') ? 'Anmeldung abgebrochen – einfach nochmal tippen.' : 'Anmeldung hat nicht geklappt. Bitte nochmal versuchen.'; }
    return; }
  if (a === 'nologin') { onbSet('b1'); onbShow(); return; }
  if (a === 'go') { onbSet('b1'); const img = document.querySelector('#car-scroll img');                // Karussell zeigt noch das andere Auto → einmal neu laden
    if (window.onbReload || (img && !img.getAttribute('src').endsWith(onbHero()))) { location.reload(); return; } onbShow(); return; }
  if (a === 'p-' || a === 'p+') { onbPrice = Math.max(0.05, Math.min(1.5, Math.round((onbPrice + (a === 'p+' ? 0.01 : -0.01)) * 100) / 100)); $('onb-price').textContent = fmt(onbPrice, 2); return; }
  if (a === 't-inst') { const k = a.slice(2); onbOpt[k] = !onbOpt[k]; onbB3(); return; }
  if (a === 'skip') { onbNext(s); return; }
  if (a === 'next') {
    if (s === 'b1') setQuickSetting('price', onbPrice);
    if (s === 'b2') { const d = $('onb-buy').value, k = parseInt(String($('onb-km').value).replace(/\D/g, ''), 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) setQuickSetting('purchase', d); if (Number.isFinite(k) && k >= 0 && k < 1e6) setQuickSetting('purchaseKm', k); }
    if (s === 'bv') { b.disabled = true; b.textContent = 'Prüfe beim Škoda-Server …';
      try { await vehConnect(true); } catch (er) { const m = $('sk-msg'); m.className = 'min-h-[1.25rem] text-left text-sm text-amber-300'; m.textContent = er.message; b.disabled = false; b.textContent = 'Verbinden'; return; } }
    if (s === 'b3') { b.disabled = true;
      if (onbOpt.inst && onbInstall && !onbStandalone()) { try { onbInstall.prompt(); await onbInstall.userChoice; } catch (er) { } onbInstall = null; }
      b.disabled = false; }
    onbNext(s); return; }
  if (a === 'tnext') { onbTour(Number(onbGet().slice(1))); return; }
  if (a === 'tend') { onbSet('done'); onbClose(); }
});
/* Anmeldung abwarten: erst wenn Firebase den Stand kennt, entscheiden (sonst blitzt A1 bei angemeldeten Nutzern kurz auf) */
(() => {
  if (onbGet() === 'done') return;
  let known = false;
  const stOrig = window.onCloudStatus;
  window.onCloudStatus = (st) => {
    stOrig(st);
    if (st && st.error) return;
    const first = !known; known = true;
    if (!st && first && onbGet() === 'a1') onbShow();                         // nicht angemeldet → Willkommen
    if (st === null && !first) return;
  };
  const prOrig = window.onCloudPrefs;
  window.onCloudPrefs = (d, first, uid) => {
    const had = !!(d && syncSet(d.settings));
    prOrig(d, first, uid);
    if (!first) return;
    const s = onbGet();
    if (s !== 'a1' && s !== '') return;                                      // schon weiter (z. B. nach dem Neuladen)
    if (had) { onbSet('done'); onbClose(); return; }                          // bekanntes Konto mit Einstellungen: kein Onboarding
    onbSet('a2');
    const carWas = carProf().key;
    Promise.resolve(window.presetP).then(() => { if (carProf().key !== carWas) window.onbReload = true; onbShow(); });
  };
  /* Firebase meldet sich nicht (offline, gesperrt): nach 4 s trotzdem willkommen heißen */
  setTimeout(() => { if (!known && onbGet() === 'a1' && !$('onb')) onbShow(); }, 4000);
  if (onbGet() !== 'a1') onbShow();                                          // nach dem Neuladen an der gleichen Stelle weiter
})();
