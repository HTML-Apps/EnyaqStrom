/* =====================================================================
   Neuigkeiten (Start, Karte ganz rechts nach dem Zählerstand): neue Beiträge aus Enyaq-Foren über /api/news.
   Filter-Chips je Forum, Liste scrollt innerhalb der Karte (Höhe = übrige Karten). Quellen ein/aus unter
   Einstellungen › Anbieter & Kategorien (settings.news, synchronisiert). „neu“ = neuer als beim letzten Ansehen (je Gerät).
   ===================================================================== */
const NEWS_SRC = [
  { k: 'ge', n: 'GoingElectric', sub: 'Enyaq-Unterforen', c: '#f59e0b', on: true },
  { k: 'ef', n: 'enyaq-forum.de', short: 'enyaq-forum', sub: 'alle Bereiche', c: '#22c55e', on: true },
  { k: 'tff', n: 'TFF-Forum', short: 'TFF', sub: 'Schlagwort bzw. Thread „Škoda Enyaq“', c: '#a78bfa', on: true },
  { k: 'mt', n: 'Motor-Talk', sub: 'Skoda Elektrofahrzeuge', c: '#38bdf8', on: false }];
const KEY_NEWS = 'enyaq.news', KEY_NEWS_SEEN = 'enyaq.newsSeen', NEWS_TTL = 30 * 60e3;
var newsFilter = 'all', newsBusy = false, newsErr = '';   // var: Aufruf über renderDashboard ohne TDZ
function newsOn() { const st = getSettings().news || {}; return NEWS_SRC.filter(s => st[s.k] == null ? s.on : !!st[s.k]).map(s => s.k); }
const newsDef = (k) => NEWS_SRC.find(s => s.k === k) || { n: k, c: '#64748b' };
function newsAgo(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (!Number.isFinite(m)) return '';
  if (m < 2) return 'gerade'; if (m < 60) return m + ' Min.'; const h = Math.round(m / 60); if (h < 24) return h + ' Std.';
  const d = Math.floor((dayStart().getTime() - new Date(new Date(t).toDateString()).getTime()) / 864e5);
  return d <= 1 ? 'gestern' : d < 7 ? d + ' Tg.' : new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
async function newsLoad(force) {
  const src = newsOn().join(','), c = load(KEY_NEWS, null);
  if (!src || newsBusy || !navigator.onLine) return;
  if (!force && c && c.src === src && Date.now() - c.t < NEWS_TTL) return;
  newsBusy = true;
  try {
    const r = await fetch('/api/news?src=' + encodeURIComponent(src)), j = await r.json();
    if (!r.ok || !Array.isArray(j.items)) throw new Error('HTTP ' + r.status);
    save(KEY_NEWS, { t: Date.now(), at: Date.parse(j.at) || Date.now(), src, items: j.items.slice(0, 30) }); newsErr = '';
  } catch (e) { newsErr = 'Foren gerade nicht erreichbar.'; }
  finally { newsBusy = false; }
  try { renderNews(); } catch (e) { }
}
function renderNews() {
  const el = $('news-card'); if (!el) return;
  const on = newsOn(), show = on.length > 0 && !isSimple();
  el.classList.toggle('hidden', !show); setTimeout(() => { try { dashSwipeSync(); } catch (e) { } }, 0);
  if (!show) return;
  const c = load(KEY_NEWS, null), fresh = c && c.src === on.join(','), all = fresh ? c.items.filter(x => on.includes(x.s)) : [];
  if (!fresh || Date.now() - c.t >= NEWS_TTL) newsLoad();
  if (newsFilter !== 'all' && !on.includes(newsFilter)) newsFilter = 'all';
  const seen = Number(localStorage.getItem(KEY_NEWS_SEEN)) || 0, cnt = (k) => all.filter(x => x.s === k).length;
  const items = newsFilter === 'all' ? all : all.filter(x => x.s === newsFilter);
  const chip = (k, label, n) => `<button type="button" data-nf="${k}" class="shrink-0 whitespace-nowrap rounded-[9px] px-2.5 py-1 text-[11.5px] font-semibold active:scale-95 transition ${newsFilter === k ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}">${esc(label)} ${n}</button>`;
  const chips = chip('all', 'Alle', all.length) + on.map(k => chip(k, newsDef(k).short || newsDef(k).n, cnt(k))).join('');
  const row = (x) => { const d = Date.parse(x.d), nw = d > seen && seen > 0, s = newsDef(x.s);
    return `<a href="${esc(x.u)}" target="_blank" rel="noopener" class="mb-1.5 block rounded-xl border-l-[3px] bg-slate-100 px-2.5 py-2 text-left active:scale-[.99] transition dark:bg-slate-800" style="border-left-color:${s.c}">
      <span class="line-clamp-2 text-[12.5px] font-semibold leading-snug">${esc(x.t)}</span>
      <span class="mt-0.5 flex justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400"><span class="min-w-0 truncate">${esc(s.n)}${x.f ? ' · ' + esc(x.f) : ''}</span><span class="shrink-0">${Number.isFinite(d) ? newsAgo(d) : ''}${nw ? ' · <b class="font-semibold text-emerald-600 dark:text-emerald-400">neu</b>' : ''}</span></span></a>`; };
  const empty = !fresh ? (newsErr || 'Lade Neuigkeiten …') : !items.length ? (newsErr || 'Keine Beiträge gefunden.') : '';
  el.innerHTML = `<div class="flex items-center justify-between gap-2"><p class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Neuigkeiten</p><button type="button" data-nref class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 active:opacity-60" title="Neu laden">${fresh ? 'vor ' + newsAgo(c.t).replace('gerade', 'wenigen Sek.') : ''}</button></div>
    <div class="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">${chips}</div>
    <div class="relative mt-2 min-h-0 flex-1"><div id="news-list" class="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain pb-3">${empty ? `<p class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">${esc(empty)}</p>` : items.map(row).join('')}</div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white dark:from-slate-900"></div></div>`;
  newsWatch();
}
$('news-card').addEventListener('click', (e) => {
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

/* Einstellungen › Anbieter & Kategorien: Schalter je Quelle */
function renderNewsSet() {
  const box = $('news-src'); if (!box) return; const on = newsOn();
  box.innerHTML = NEWS_SRC.map(s => `<label class="flex cursor-pointer items-center gap-3 py-2.5">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${s.c}"></span>
    <span class="min-w-0 flex-1"><span class="block text-sm font-medium">${esc(s.n)}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${esc(s.sub)}</span></span>
    <input type="checkbox" data-nsrc="${s.k}" class="peer sr-only"${on.includes(s.k) ? ' checked' : ''}>
    <span class="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" aria-hidden="true"></span></label>`).join('');
}
$('news-src').addEventListener('change', (e) => {
  const k = e.target.dataset.nsrc; if (!k) return;
  const st = { ...(getSettings().news || {}) }; st[k] = !!e.target.checked;
  NEWS_SRC.forEach(s => { if (st[s.k] === s.on) delete st[s.k]; });   // nur Abweichungen vom Standard speichern
  setQuickSetting('news', Object.keys(st).length ? st : undefined); newsFilter = 'all';
  try { renderNews(); } catch (er) { }
});
{ const sv = showView; showView = function (v) { const r = sv.apply(this, arguments); if (v === 'settings') try { renderNewsSet(); } catch (e) { } return r; }; }
