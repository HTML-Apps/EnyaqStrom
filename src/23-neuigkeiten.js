/* =====================================================================
   Neuigkeiten (Start, Karte ganz rechts nach dem Zählerstand): neue Beiträge aus Enyaq-Foren über /api/news.
   Filter-Chips je Gruppe (Forum · News · Škoda · Englisch), Liste scrollt innerhalb der Karte (Höhe = übrige Karten). Quellen ein/aus unter
   Einstellungen › Anbieter & Kategorien (settings.news, synchronisiert). „neu“ = neuer als beim letzten Ansehen (je Gerät).
   ===================================================================== */
const NEWS_SRC = [   // GoingElectric und TFF sperren Server-Abrufe (403) – nicht dabei
  { k: 'ef', n: 'enyaq-forum.de', short: 'enyaq-forum', g: 'forum', sub: 'Bereiche unten auswählen', c: '#22c55e', on: true },
  { k: 'mt', n: 'Motor-Talk', g: 'forum', sub: 'Skoda Elektrofahrzeuge (Enyaq + Elroq, viel Kaufberatung)', c: '#38bdf8', on: false },
  { k: 'el', n: 'electrive', g: 'news', sub: 'Fachnachrichten, Schlagwort „Enyaq“', c: '#f97316', on: true },
  { k: 'ec', n: 'ecomento', g: 'news', sub: 'Nachrichten, Schlagwort „Škoda Enyaq“', c: '#eab308', on: true },
  { k: 'sb', n: 'Škoda Storyboard', g: 'skoda', sub: 'Škoda-Pressemeldungen zu Enyaq, Elroq, Software, MyŠkoda', c: '#10b981', on: true },
  { k: 'bk', n: 'BRISKODA', g: 'en', sub: 'Enyaq-Forum (englisch) – sperrt Abrufe zeitweise', c: '#ec4899', on: false }];
const NEWS_GROUPS = [['forum', 'Forum'], ['news', 'News'], ['skoda', 'Škoda'], ['en', 'Englisch']];
/* Bereiche von enyaq-forum.de (IDs wie dort, Server-Liste EF_BOARDS in api/news.js) */
const EF_B = [[8, 'Akku, Software, Elektrik', 1], [9, 'Apps, Navi, Assistenz, Multimedia', 1], [3, 'Antrieb, Verbrauch, Reichweite', 1], [5, 'Reifen & Felgen', 1], [49, 'Anleitung, FAQ, Tipps', 1],
  [2, 'Allgemeines', 0], [4, 'Fahrwerk & Bremsen', 0], [6, 'Karosserie & Anbauteile', 0], [7, 'Interieur', 0], [43, 'Werkstatt & Nachrüsten', 0], [38, 'Wallbox & Laden zuhause', 0], [39, 'Stromanbieter & Ladekarten', 0], [12, 'Öffentliche Ladesäulen', 0]];
const KEY_NEWS = 'enyaq.news', KEY_NEWS_SEEN = 'enyaq.newsSeen', NEWS_TTL = 30 * 60e3;
var newsFilter = 'all', newsBusy = false, newsErr = '';   // var: Aufruf über renderDashboard ohne TDZ
function newsOn() { const st = getSettings().news || {}; return NEWS_SRC.filter(s => st[s.k] == null ? s.on : !!st[s.k]).map(s => s.k).filter(k => k !== 'ef' || newsBoards().length); }
function newsBoards() { const v = (getSettings().news || {}).efb; return Array.isArray(v) ? v.filter(id => EF_B.some(b => b[0] === id)) : EF_B.filter(b => b[2]).map(b => b[0]); }
const newsQuery = () => newsOn().flatMap(k => k === 'ef' ? newsBoards().map(id => 'ef' + id) : [k]).join(',');
const newsDef = (k) => NEWS_SRC.find(s => s.k === k) || { n: k, c: '#64748b', g: 'news' };
const newsGrp = (x) => x.g || newsDef(x.s).g;
function newsAgo(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (!Number.isFinite(m)) return '';
  if (m < 2) return 'gerade'; if (m < 60) return m + ' Min.'; const h = Math.round(m / 60); if (h < 24) return h + ' Std.';
  const d = Math.floor((dayStart().getTime() - new Date(new Date(t).toDateString()).getTime()) / 864e5);
  return d <= 1 ? 'gestern' : d < 7 ? d + ' Tg.' : new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
async function newsLoad(force) {
  const src = newsQuery(), c = load(KEY_NEWS, null);
  if (!src || newsBusy || !navigator.onLine) return;
  if (!force && c && c.src === src && Date.now() - c.t < NEWS_TTL) return;
  newsBusy = true;
  try {
    const r = await fetch('/api/news?src=' + encodeURIComponent(src)), j = await r.json();
    if (!r.ok || !Array.isArray(j.items)) throw new Error('HTTP ' + r.status);
    save(KEY_NEWS, { t: Date.now(), at: Date.parse(j.at) || Date.now(), src, items: j.items.slice(0, 40) }); newsErr = '';
  } catch (e) { newsErr = 'Foren gerade nicht erreichbar.'; }
  finally { newsBusy = false; }
  try { renderNews(); } catch (e) { }
}
/** Gemeinsame Teile für Karte und Vollbild: Chips, Liste, Alter */
function newsParts(big) {
  const on = newsOn(), c = load(KEY_NEWS, null), fresh = c && c.src === newsQuery(), all = fresh ? c.items.filter(x => on.includes(x.s)) : [];
  if (!fresh || Date.now() - c.t >= NEWS_TTL) newsLoad();
  const grps = NEWS_GROUPS.filter(([g]) => on.some(k => newsDef(k).g === g));
  if (newsFilter !== 'all' && !grps.some(([g]) => g === newsFilter)) newsFilter = 'all';
  const seen = Number(localStorage.getItem(KEY_NEWS_SEEN)) || 0, cnt = (g) => all.filter(x => newsGrp(x) === g).length;
  const items = newsFilter === 'all' ? all : all.filter(x => newsGrp(x) === newsFilter);
  const chip = (k, label, n) => `<button type="button" data-nf="${k}" class="shrink-0 whitespace-nowrap rounded-[9px] px-2.5 py-1 ${big ? 'text-[13px]' : 'text-[11.5px]'} font-semibold active:scale-95 transition ${newsFilter === k ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}">${esc(label)} ${n}</button>`;
  const chips = chip('all', 'Alle', all.length) + (grps.length > 1 ? grps.map(([g, n]) => chip(g, n, cnt(g))).join('') : '');
  const row = (x) => { const d = Date.parse(x.d), nw = d > seen && seen > 0, s = newsDef(x.s);
    return `<a href="${esc(x.u)}" target="_blank" rel="noopener" class="${big ? 'mb-2 rounded-2xl px-3.5 py-3' : 'mb-1.5 rounded-xl px-2.5 py-2'} block border-l-[3px] bg-slate-100 text-left active:scale-[.99] transition dark:bg-slate-800" style="border-left-color:${s.c}">
      <span class="${big ? 'line-clamp-3 text-[15px]' : 'line-clamp-2 text-[12.5px]'} font-semibold leading-snug">${esc(x.t)}</span>
      <span class="mt-0.5 flex justify-between gap-2 ${big ? 'text-xs' : 'text-[10.5px]'} text-slate-500 dark:text-slate-400"><span class="min-w-0 truncate">${esc(s.n)}${x.b ? ' · ' + esc((EF_B.find(b => b[0] === x.b) || [0, ''])[1]) : x.f ? ' · ' + esc(x.f) : ''}</span><span class="shrink-0">${Number.isFinite(d) ? newsAgo(d) : ''}${nw ? ' · <b class="font-semibold text-emerald-600 dark:text-emerald-400">neu</b>' : ''}</span></span></a>`; };
  const empty = !fresh ? (newsErr || 'Lade Neuigkeiten …') : !items.length ? (newsErr || 'Keine Beiträge gefunden.') : '';
  return { show: on.length > 0, chips, list: empty ? `<p class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">${esc(empty)}</p>` : items.map(row).join(''), age: fresh ? 'vor ' + newsAgo(c.t).replace('gerade', 'wenigen Sek.') : '' };
}
function renderNews() {
  const el = $('news-card'); if (!el) return;
  const show = newsOn().length > 0 && !isSimple();
  el.classList.toggle('hidden', !show); setTimeout(() => { try { dashSwipeSync(); } catch (e) { } }, 0);
  if (!show) return;
  const p = newsParts(false), keep = $('news-list') ? $('news-list').scrollTop : 0;
  el.innerHTML = `<div class="flex items-center justify-between gap-2"><button type="button" data-nopen class="flex min-w-0 items-center gap-1 active:opacity-70" aria-label="Neuigkeiten ganzseitig öffnen"><span class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Neuigkeiten</span><svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button><button type="button" data-nref class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 active:opacity-60" title="Neu laden">${p.age}</button></div>
    <div class="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">${p.chips}</div>
    <div class="relative mt-2 min-h-0 flex-1"><div id="news-list" class="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain pb-3">${p.list}</div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white dark:from-slate-900"></div></div>`;
  if (keep) $('news-list').scrollTop = keep;
  newsWatch();
  if (newsFull) newsFullRender();
}
/* ===== Vollbild: Tipp auf die Überschrift → Karte wächst auf ganze Seite (clip-path von der Kartenform aus), zurück per ×, Zurück-Taste oder Esc ===== */
var newsFull = null, newsFullPushed = false;
function newsFullRender() {
  const ov = newsFull; if (!ov) return; const p = newsParts(true);
  ov.querySelector('[data-nf-age]').textContent = p.age; ov.querySelector('[data-nf-chips]').innerHTML = p.chips; ov.querySelector('[data-nf-list]').innerHTML = p.list;
}
function newsClip(r) { const W = innerWidth, H = innerHeight; return `inset(${Math.max(0, r.top)}px ${Math.max(0, W - r.right)}px ${Math.max(0, H - r.bottom)}px ${Math.max(0, r.left)}px round 24px)`; }
const newsStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate;
function newsOpenFull() {
  if (newsFull) return;
  const card = $('news-card'), r = card.getBoundingClientRect();
  const ov = document.createElement('div'); newsFull = ov;
  ov.className = 'fixed inset-0 z-[75] flex flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Neuigkeiten');
  ov.innerHTML = `<div data-nf-in class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4" style="padding-top:calc(env(safe-area-inset-top) + 14px)">
      <div class="flex items-center gap-2"><button type="button" data-nf-x class="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full outline-none active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:active:bg-slate-800" aria-label="Schließen"><svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h2 class="min-w-0 flex-1 truncate font-barlow text-[26px] font-bold uppercase tracking-[0.1em] leading-8">Neuigkeiten</h2><button type="button" data-nref data-nf-age class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 active:opacity-60" title="Neu laden"></button></div>
      <div data-nf-chips class="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4"></div>
      <div data-nf-list class="no-scrollbar -mx-4 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style="padding-bottom:calc(env(safe-area-inset-bottom) + 16px)"></div></div>`;
  document.body.appendChild(ov); newsFullRender(); document.body.style.overflow = 'hidden';
  try { history.pushState({ newsFull: 1 }, ''); newsFullPushed = true; } catch (e) { newsFullPushed = false; }
  if (!newsStill()) {
    ov.animate([{ clipPath: newsClip(r) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    ov.querySelector('[data-nf-in]').animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 140, easing: 'ease-out', fill: 'backwards' });
  }
  setTimeout(() => { const c = load(KEY_NEWS, null), mx = c ? Math.max(0, ...c.items.map(x => Date.parse(x.d) || 0)) : 0; if (mx && newsFull === ov) try { localStorage.setItem(KEY_NEWS_SEEN, String(mx)); } catch (er) { } }, 2500);
  ov.addEventListener('click', (e) => {
    if (e.target.closest('[data-nf-x]')) { newsCloseFull(false); return; }
    const f = e.target.closest('[data-nf]'); if (f) { newsFilter = f.dataset.nf; newsFullRender(); try { renderNews(); } catch (er) { } ov.querySelector('[data-nf-list]').scrollTop = 0; return; }
    if (e.target.closest('[data-nref]')) newsLoad(true);
  });
}
function newsCloseFull(fromPop) {
  const ov = newsFull; if (!ov) return; newsFull = null; document.body.style.overflow = '';
  if (newsFullPushed && !fromPop) { newsFullPushed = false; try { history.back(); } catch (e) { } } else newsFullPushed = false;
  const card = $('news-card'), r = card && card.getBoundingClientRect(), vis = r && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left < innerWidth && r.right > 0;
  if (newsStill()) { ov.remove(); return; }
  ov.querySelector('[data-nf-in]').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
  const a = vis ? ov.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: newsClip(r) }], { duration: 360, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
    : ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
  a.onfinish = () => ov.remove();
}
window.addEventListener('popstate', () => { if (newsFull) newsCloseFull(true); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && newsFull) newsCloseFull(false); });
$('news-card').addEventListener('click', (e) => {
  if (e.target.closest('[data-nopen]')) { newsOpenFull(); return; }
  const f = e.target.closest('[data-nf]'); if (f) { newsFilter = f.dataset.nf; renderNews(); return; }
  if (e.target.closest('[data-nref]')) { newsLoad(true); return; }
});
/* Gesehen: Karte mind. 2 s sichtbar → neuester Beitrag gilt als gesehen (Markierungen verschwinden beim nächsten Öffnen) */
var newsObs = null, newsSeenT = null;
function newsWatch() {
  if (newsObs || !('IntersectionObserver' in window)) return;
  newsObs = new IntersectionObserver((es) => { es.forEach(en => { clearTimeout(newsSeenT); if (en.isIntersecting && en.intersectionRatio > 0.6) newsSeenT = setTimeout(() => {
    const c = load(KEY_NEWS, null), mx = c ? Math.max(0, ...c.items.map(x => Date.parse(x.d) || 0)) : 0; if (mx) try { localStorage.setItem(KEY_NEWS_SEEN, String(mx)); } catch (er) { } }, 2000); }); }, { threshold: [0, 0.6, 1] });
  newsObs.observe($('news-card'));
}
/* Erstes Öffnen: alles bis jetzt gilt als gesehen, sonst wäre beim ersten Mal alles „neu“ */
try { if (!localStorage.getItem(KEY_NEWS_SEEN)) localStorage.setItem(KEY_NEWS_SEEN, String(Date.now() - 864e5)); } catch (e) { }

/* Einstellungen › Anbieter & Kategorien: Schalter je Quelle, bei enyaq-forum.de zusätzlich Bereiche als Chips */
function newsSaveSet(st) {
  NEWS_SRC.forEach(s => { if (st[s.k] === s.on) delete st[s.k]; });   // nur Abweichungen vom Standard speichern
  const def = EF_B.filter(b => b[2]).map(b => b[0]).sort((x, y) => x - y).join();
  if (Array.isArray(st.efb) && st.efb.slice().sort((x, y) => x - y).join() === def) delete st.efb;
  setQuickSetting('news', Object.keys(st).length ? st : undefined); newsFilter = 'all';
  try { renderNews(); } catch (er) { } try { renderNewsSet(); } catch (er) { }
}
function renderNewsSet() {
  const box = $('news-src'); if (!box) return; const st = getSettings().news || {}, isOn = (s) => st[s.k] == null ? s.on : !!st[s.k], bs = newsBoards();
  box.innerHTML = NEWS_SRC.map(s => `<div class="py-2.5"><label class="flex cursor-pointer items-center gap-3">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${s.c}"></span>
    <span class="min-w-0 flex-1"><span class="block text-sm font-medium">${esc(s.n)}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${esc(s.sub)}</span></span>
    <input type="checkbox" data-nsrc="${s.k}" class="peer sr-only"${isOn(s) ? ' checked' : ''}>
    <span class="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></label>
    ${s.k === 'ef' && isOn(s) ? `<div class="mt-2 flex flex-wrap gap-1.5 pl-5">${EF_B.map(([id, n]) => `<button type="button" data-efb="${id}" aria-pressed="${bs.includes(id)}" class="rounded-lg px-2.5 py-1 text-xs font-semibold active:scale-95 transition ${bs.includes(id) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}">${bs.includes(id) ? '✓ ' : ''}${esc(n)}</button>`).join('')}</div>` : ''}</div>`).join('');
}
$('news-src').addEventListener('change', (e) => {
  const k = e.target.dataset.nsrc; if (!k) return;
  const st = { ...(getSettings().news || {}) }; st[k] = !!e.target.checked; newsSaveSet(st);
});
$('news-src').addEventListener('click', (e) => {
  const b = e.target.closest('[data-efb]'); if (!b) return;
  const id = Number(b.dataset.efb), st = { ...(getSettings().news || {}) }, cur = newsBoards();
  st.efb = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]; newsSaveSet(st);
});
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') try { renderNewsSet(); } catch (e) { } return r; }; }
