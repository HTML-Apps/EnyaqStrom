/* =====================================================================
   PC-Ansicht (ab 1280 px, isDesk) der Start-Widgets – Breite nutzen:
   Strom zuhause A (KPI-Spalte + beschriftete Monatsbalken mit Ø-Linie), Langzeit A (Eingabe links, Verlaufskurve rechts),
   Akku °C B (Eingabe links, Temperatur-Skala mit Wohlfühlbereich + Kennzahlen rechts), Zählerstand A (letzte Ladungen
   zuhause rechts, per CSS-Grid in index.html), Neuigkeiten B (neueste Meldung groß links, Liste rechts).
   Inhalte rechts liegen absolut, damit die Kartenhöhe gleich bleibt. Am Handy unverändert.
   ===================================================================== */
const pcDM = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
/* Linien-Diagramm, füllt den Eltern-Container (relative). pts [{t, v}], Achse rechts, Datum unten. */
function pcLine(pts, o) {
  o = o || {}; if (pts.length < 2) return `<div class="absolute inset-0 flex items-center justify-center text-center text-[12px] text-slate-500 dark:text-slate-400">${esc(o.empty || 'Ab 2 Werten erscheint hier der Verlauf.')}</div>`;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, vs = pts.map(p => p.v), st = o.step || 0.5;
  let lo = Math.floor((Math.min(...vs) - st * 0.3) / st) * st, hi = Math.ceil((Math.max(...vs) + st * 0.3) / st) * st; if (hi - lo < st * 2) hi = lo + st * 2;
  const X = (t) => t1 > t0 ? (t - t0) / (t1 - t0) * 100 : 50, Y = (v) => 100 - (v - lo) / (hi - lo) * 100, col = o.color || '#10b981';
  const grid = []; for (let g = lo; g <= hi + 1e-9; g += st) grid.push(g); const gs = grid.length > 5 ? grid.filter((_, i) => i % 2 === 0) : grid;
  const span = t1 - t0, lab = []; for (let i = 0; i < 4; i++) { const t = t0 + span * i / 3; lab.push([i / 3 * 100, span > 75 * 864e5 ? new Date(t).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '') : pcDM(t)]); }
  return `<div class="absolute inset-0 pb-5 pr-8"><div class="relative h-full w-full">
    ${gs.map(g => `<div class="absolute inset-x-0 border-t border-slate-200 dark:border-slate-800" style="top:${Y(g)}%"><span class="absolute -right-8 -translate-y-1/2 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">${fmt(g, st < 1 ? 1 : 0)}</span></div>`).join('')}
    <svg class="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(p => X(p.t).toFixed(2) + ',' + Y(p.v).toFixed(2)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    ${pts.map((p, i) => `<span class="absolute ${i === pts.length - 1 ? 'h-3 w-3' : 'h-2 w-2'} -translate-x-1/2 -translate-y-1/2 rounded-full" style="left:${X(p.t)}%;top:${Y(p.v)}%;background:${col}" title="${pcDM(p.t)}: ${fmt(p.v, 1)}"></span>`).join('')}
    <span class="absolute -translate-x-full -translate-y-full pb-1.5 pr-1 text-[11px] font-bold tabular-nums" style="left:${X(t1)}%;top:${Y(pts[pts.length - 1].v)}%">${fmt(pts[pts.length - 1].v, 1)}</span>
    ${lab.map(([x, l], i) => `<span class="absolute top-full mt-1 text-[10px] text-slate-500 dark:text-slate-400 ${i === 0 ? '' : i === 3 ? '-translate-x-full' : '-translate-x-1/2'}" style="left:${x}%">${l}</span>`).join('')}</div></div>`;
}

/* ---- Strom zuhause A ---- */
function pcHomeDesk(el, s, name, mx, MS) {
  const PH = 78, avgP = s.avg != null ? s.avg / mx * PH : null, n = s.months.length;
  const tile = (l, v, sub) => `<div class="home-tile min-w-0 rounded-2xl px-3 py-2"><p class="home-sub text-[10.5px]">${l}</p><p class="truncate text-[18px] font-bold tabular-nums">${v}</p><p class="home-sub truncate text-[10.5px]">${sub}</p></div>`;
  el.innerHTML = `<div class="flex min-h-0 flex-1 gap-5"><div class="flex w-[270px] shrink-0 flex-col">
      <div class="flex items-center gap-2"><span class="home-dot flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px]" aria-hidden="true">⚡</span><p class="min-w-0 flex-1 truncate font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Strom zuhause</p></div>
      <p class="mt-1.5 font-barlow text-[40px] font-bold leading-none tabular-nums">${esc(eur(s.eur))}</p>
      <p class="home-calc mt-1 text-[12px]">${fmt(s.kwh, 0)} kWh × ${fmt(s.price * 100, 1)} ct · ${s.n} ${s.n === 1 ? 'Ladung' : 'Ladungen'}</p>
      <p class="home-sub text-[11px]">seit Kauf ${new Date(s.p0 + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}${name ? ` · <span class="home-name font-bold">${esc(name)}</span>` : ''}</p>
      <div class="mt-auto grid grid-cols-2 gap-1.5">${tile('Ø pro Monat', s.avg != null ? fmt(Math.round(s.avg), 0) + ' €' : '–', s.avg != null ? (s.avgN === 1 ? MS[s.avgFrom % 12] : 'ab ' + MS[s.avgFrom % 12]) : 'noch zu früh')}${tile('je km', s.ctKm ? fmt(s.ctKm, 1) + ' ct' : '–', s.k100 ? fmt(s.k100, 1) + ' kWh/100' : 'inkl. Ladeverlust')}</div></div>
    <div class="relative min-w-0 flex-1"><div class="absolute inset-x-0 top-0 bottom-5">
      ${avgP != null ? `<div class="home-avg absolute inset-x-0 border-t-[1.5px] border-dashed" style="bottom:${avgP}%"><span class="home-sub absolute -top-4 right-0 text-[10.5px]">Ø ${fmt(Math.round(s.avg), 0)} €</span></div>` : ''}
      ${s.months.map((x, i) => { const h = Math.max(2, x.eur / mx * PH); return `<div class="absolute bottom-0 flex flex-col items-center" style="left:calc(${i / n * 100}% + 5px);width:calc(${100 / n}% - 10px);height:100%" title="${MS[x.m % 12]}: ${esc(eur(x.eur))}${x.cur ? ' (Zwischenstand)' : ''}">
        <span class="home-strong absolute text-[11.5px] font-bold tabular-nums" style="bottom:calc(${h}% + 3px)">${fmt(Math.round(x.eur), 0)} €</span><div class="home-bar${x.cur ? ' home-bar-cur' : ''} absolute bottom-0 w-full rounded-t-lg" style="height:${h}%"></div></div>`; }).join('')}</div>
      ${s.months.map((x, i) => `<span class="home-sub absolute bottom-0 text-center text-[10.5px]" style="left:${i / n * 100}%;width:${100 / n}%">${MS[x.m % 12]}${x.cur ? ' (läuft)' : ''}</span>`).join('')}</div></div>`;
}

/* ---- Langzeitverbrauch A ---- */
{ const ro = renderLtm; renderLtm = function () { const r = ro.apply(this, arguments); try { pcLtmDesk(); } catch (e) { } return r; }; }
function pcLtmDesk() {
  const el = $('ltm-card'); if (!el || !isDesk()) return;
  const all = (getLab().lt || []).filter(e => e.k100 > 0 && e.date).map(e => ({ t: Date.parse(e.date + 'T12:00:00'), v: e.k100 })).filter(p => Number.isFinite(p.t)).sort((a, b) => a.t - b.t).slice(-30);
  const avg = all.length ? all.reduce((a, p) => a + p.v, 0) / all.length : null;
  el.innerHTML = `<div class="flex min-h-0 flex-1 gap-5"><div data-pc-left class="flex w-[350px] shrink-0 flex-col">${el.innerHTML}</div>
    <div class="flex min-w-0 flex-1 flex-col"><div data-pc-head class="flex items-baseline justify-between gap-2 text-[12px]"><span class="font-semibold text-slate-600 dark:text-slate-300">${all.length ? all.length + ' ' + (all.length === 1 ? 'Ablesung' : 'Ablesungen') : 'Verlauf'}${avg != null ? ` <span class="font-normal text-slate-500 dark:text-slate-400">· Ø ${fmt(avg, 1)} kWh/100</span>` : ''}</span></div>
      <div class="relative mt-2 min-h-0 flex-1">${pcLine(all, { step: 0.5, color: isDark() ? '#34d399' : '#059669', empty: 'Ab 2 Ablesungen erscheint hier der Verlauf.' })}</div></div></div>`;
  pcMoveLinks(el);
}
/* Kopf-Links (📥 Tasks · Verlauf ›) aus der schmalen linken Spalte in den Kopf der rechten Seite verschieben */
function pcMoveLinks(el) {
  const lk = el.querySelector('[data-pc-left] > div:first-child > span.shrink-0'), hd = el.querySelector('[data-pc-head]');
  if (lk && hd) hd.appendChild(lk);
}

/* ---- Akku-Temperatur B ---- */
{ const ro = renderBtm; renderBtm = function () { const r = ro.apply(this, arguments); try { pcBtmDesk(); } catch (e) { } return r; }; }
const PC_BT_LO = -10, PC_BT_HI = 40, pcBtX = (v) => Math.max(0, Math.min(100, (v - PC_BT_LO) / (PC_BT_HI - PC_BT_LO) * 100));
function pcBtState(v) { return v < 10 ? ['stark gebremst ❄️', 'text-sky-600 dark:text-sky-300'] : v < 20 ? ['gebremst', 'text-sky-600 dark:text-sky-300'] : v <= 35 ? ['optimal ✓', 'text-emerald-600 dark:text-emerald-400'] : ['warm – gedrosselt', 'text-amber-600 dark:text-amber-400']; }
function pcBtmDesk() {
  const el = $('btm-card'); if (!el || !isDesk()) return;
  el.innerHTML = `<div class="flex min-h-0 flex-1 gap-5"><div data-pc-left class="flex w-[370px] shrink-0 flex-col">${el.innerHTML}</div><div class="flex min-w-0 flex-1 flex-col"><div data-pc-head class="flex items-baseline justify-between gap-2 text-[12px]"><span class="font-semibold text-slate-600 dark:text-slate-300">Wohlfühlbereich des Akkus</span></div><div id="pc-btm-side" class="flex min-h-0 flex-1 flex-col"></div></div></div>`;
  pcMoveLinks(el); pcBtmSide();
}
function pcBtmSide() {
  const box = $('pc-btm-side'); if (!box) return; const v = btmVal == null ? 15 : btmVal;
  const all = (getLab().bt || []).filter(e => Number.isFinite(e.t) && e.at), lowE = all.reduce((m, e) => !m || e.t < m.t ? e : m, null);
  const r30 = all.filter(e => Date.now() - Date.parse(e.at) <= 30 * 864e5), a30 = r30.length ? r30.reduce((a, e) => a + e.t, 0) / r30.length : null, [stT, stC] = pcBtState(v);
  const tip = v < 20 ? 'Vor dem Schnellladen den Akku vorheizen (Ladestation als Navi-Ziel) – optimal ab ca. 25 °C.' : v <= 35 ? 'Gute Akku-Temperatur – Schnellladen mit voller Leistung möglich.' : 'Akku warm – die Ladeleistung kann gedrosselt werden.';
  const tile = (l, val, c) => `<div class="min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-2.5 py-1.5"><p class="truncate text-[10.5px] text-slate-500 dark:text-slate-400">${l}</p><p class="truncate text-[13.5px] font-bold ${c || ''}">${val}</p></div>`;
  box.innerHTML = `
    <div class="relative mt-7"><div class="h-4 rounded-full" style="background:linear-gradient(90deg,#1d4ed8 0%,#38bdf8 40%,#10b981 60%,#10b981 90%,#f59e0b 95%,#ef4444 100%)"></div>
      <div class="absolute bottom-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-300" style="left:${pcBtX(v)}%"><span class="whitespace-nowrap rounded-lg bg-orange-500 px-2 py-0.5 text-[12px] font-extrabold text-white">${btFmt(v)} °C</span><span class="h-6 w-0.5 bg-slate-900 dark:bg-white"></span></div></div>
    <div class="mt-1 flex justify-between text-[10.5px] text-slate-500 dark:text-slate-400">${[-10, 0, 10, 20, 30, 40].map(x => `<span>${x}°</span>`).join('')}</div>
    <div class="mt-2.5 grid grid-cols-3 gap-1.5">${tile('Ladeleistung', stT, stC)}${tile('Tiefster Wert', lowE ? btFmt(lowE.t) + ' °C · ' + pcDM(Date.parse(lowE.at)) : '–')}${tile('Ø 30 Tage', a30 != null ? fmt(a30, 1) + ' °C' : '–')}</div>
    <p class="mt-auto truncate text-[11.5px] text-slate-500 dark:text-slate-400" title="${esc(tip)}">💡 ${esc(tip)}</p>`;
}
$('btm-card').addEventListener('click', () => setTimeout(() => { try { if (isDesk()) pcBtmSide(); } catch (e) { } }, 0));

/* ---- Zählerstand A: letzte Ladungen zuhause (rechte Spalte über CSS-Grid) ---- */
function pcMeterHist() {
  const box = $('meter-hist'); if (!box) return; if (!isDesk()) { box.innerHTML = ''; return; }
  const rs = getReadings(), L = []; rs.forEach((r, i) => { if (isHome(r) && isCharge(rs, i)) L.push(r); });
  const last = L.slice(-12).reverse();
  box.innerHTML = `<div class="absolute inset-0 flex flex-col rounded-2xl bg-slate-100 dark:bg-slate-800/50 px-3 py-2.5"><p class="text-[12px] font-semibold text-slate-600 dark:text-slate-300">Letzte Ladungen zuhause</p>
    <div class="no-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto">${last.length ? last.map(r => `<div class="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-slate-200 dark:border-slate-700/70 py-1.5 text-[12.5px] tabular-nums"><span class="text-slate-500 dark:text-slate-400">${new Date(r.date + (r.date.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><span>${fmt(Number(r.consumedSinceLast) || 0, 1)} kWh</span><span class="w-16 text-right font-bold text-emerald-600 dark:text-emerald-400">${Number.isFinite(Number(r.cost)) ? esc(eur(Number(r.cost))) : '–'}</span></div>`).join('') : '<p class="py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">Noch keine Ladung zuhause.</p>'}</div></div>`;
}
{ const rd = renderDashboard; renderDashboard = function () { const r = rd.apply(this, arguments); try { pcMeterHist(); } catch (e) { } return r; }; }

/* ---- Neuigkeiten B: Magazin ---- */
function pcNewsDesk(el, p, keep) {
  const x = p.items[0], s = newsDef(x.s), d = Date.parse(x.d), read = p.rd.has(newsId(x.u)), nw = !read && d > p.seen && p.seen > 0;
  el.innerHTML = `<div class="flex min-h-0 flex-1 gap-3.5"><div class="flex w-[340px] shrink-0 flex-col">
      <button type="button" data-nopen class="flex min-w-0 items-center gap-1 self-start active:opacity-70" aria-label="Neuigkeiten ganzseitig öffnen"><span class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Neuigkeiten</span><svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>
      <a href="${esc(newsUrl(x.u))}" target="_blank" rel="noopener" data-nread="${esc(x.u)}" class="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-l-[3px] bg-slate-100 dark:bg-slate-800 p-3.5 text-left active:scale-[.99] transition" style="border-left-color:${read ? NEWS_READ_C : s.c};background-image:linear-gradient(135deg,${s.c}40,transparent 80%)">
        <span class="truncate text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">${esc(s.n)}${nw ? ' · <span class="text-emerald-600 dark:text-emerald-400">neu</span>' : ''} · ${Number.isFinite(d) ? newsAgo(d) : ''}</span>
        <span class="mt-1.5 line-clamp-4 text-[17px] font-extrabold leading-snug">${esc(x.t)}</span>
        <span class="relative mt-auto pt-1 text-[12px] font-semibold text-sky-700 dark:text-sky-300">Lesen ›</span><span class="pointer-events-none absolute -bottom-8 -right-5 select-none text-[110px] leading-none opacity-[0.08]" aria-hidden="true">📰</span></a></div>
    <div class="flex min-w-0 flex-1 flex-col"><div class="flex items-center gap-2"><div class="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">${p.chips}</div><button type="button" data-nref class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 active:opacity-60" title="Neu laden">${p.age}</button></div>
      <div class="relative mt-2 min-h-0 flex-1"><div id="news-list" class="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain pb-3">${p.items.slice(1).map(p.row).join('')}</div>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white dark:from-slate-900"></div></div></div></div>`;
  if (keep) $('news-list').scrollTop = keep;
  try { newsWatch(); } catch (e) { } if (newsFull) newsFullRender();
}

/* Wechsel Handy ↔ PC (Fenstergröße): alle betroffenen Widgets neu zeichnen */
try { matchMedia('(min-width: 1280px)').addEventListener('change', () => { [renderHomeCard, renderLtm, renderBtm, pcMeterHist, renderNews].forEach(f => { try { f(); } catch (e) { } }); }); } catch (e) { }
try { renderLtm(); renderBtm(); pcMeterHist(); } catch (e) { }

/* ---- Neuigkeiten-Vollbild am PC: Liste links angeheftet, rechts eingebautes Browser-Fenster (iframe) ----
   Ob eine Seite eingebettet werden darf, prüft der Server (/api/news?frame=1: X-Frame-Options / CSP frame-ancestors).
   Verbietet die Seite das Einbetten → rechts Hinweis + „Im Browser öffnen“. Unbekannt → Versuch im Fenster, Knopf ↗ immer da. */
var nfSel = null, nfFrame = null;
function nfFrameLoad() {
  if (nfFrame && Date.now() - nfFrame.t < 6 * 3600e3) return Promise.resolve(nfFrame.h);
  const c = load('enyaq.newsFrame', null); if (c && Date.now() - c.t < 12 * 3600e3) { nfFrame = c; return Promise.resolve(c.h); }
  return fetch('/api/news?frame=1').then(r => r.ok ? r.json() : null).then(j => { const h = j && j.hosts || {}; nfFrame = { t: Date.now(), h }; try { save('enyaq.newsFrame', nfFrame); } catch (e) { } return h; }).catch(() => ({}));
}
function nfHostOk(u, h) { try { const x = (h || {})[new URL(u).host]; return x ? x.ok : null; } catch (e) { return null; } }
function nfPaneHtml(x, ok) {
  const s = newsDef(x.s), d = Date.parse(x.d), url = newsUrl(x.u);
  const bar = `<div class="flex shrink-0 items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${s.c}"></span>
      <div class="min-w-0 flex-1"><p class="truncate text-[13px] font-semibold">${esc(x.t)}</p><p class="truncate text-[11px] text-slate-500 dark:text-slate-400">${esc(s.n)} · ${Number.isFinite(d) ? newsAgo(d) : ''} · ${esc(url.replace(/^https?:\/\//, '').slice(0, 70))}</p></div>
      ${ok !== false ? '<button type="button" data-nfp-reload class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[17px] hover:bg-slate-100 dark:hover:bg-slate-800" title="Neu laden" aria-label="Neu laden">↻</button>' : ''}
      <a href="${esc(url)}" target="_blank" rel="noopener" class="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 text-[12.5px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-700">↗ Im Browser öffnen</a>
      <button type="button" data-nfp-x class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[18px] hover:bg-slate-100 dark:hover:bg-slate-800" title="Fenster schließen" aria-label="Fenster schließen">×</button></div>`;
  if (ok === false) return bar + `<div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center"><span class="pointer-events-none absolute -bottom-10 -right-6 select-none text-[220px] leading-none opacity-[0.06]" aria-hidden="true">📰</span>
      <p class="text-[15px] font-semibold">${esc(s.n)} erlaubt keine Anzeige in anderen Apps.</p><p class="mt-1 max-w-md text-[13px] text-slate-500 dark:text-slate-400">Die Seite verbietet das Einbetten – das lässt sich nicht umgehen. Öffne den Beitrag einfach im Browser.</p>
      <a href="${esc(url)}" target="_blank" rel="noopener" class="mt-4 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-95 transition">↗ Im Browser öffnen</a></div>`;
  return bar + `<div class="relative min-h-0 flex-1 bg-white"><div data-nfp-load class="absolute inset-0 flex items-center justify-center text-[13px] text-slate-400">Seite wird geladen …</div>
      <iframe data-nfp-frame src="${esc(url)}" title="${esc(x.t)}" class="relative h-full w-full border-0" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" loading="eager"></iframe></div>
      ${ok == null ? '<p class="shrink-0 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">Bleibt das Fenster leer, lässt die Seite keine Anzeige in der App zu – dann ↗ Im Browser öffnen.</p>' : ''}`;
}
const NF_EMPTY = `<div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center"><span class="pointer-events-none absolute -bottom-10 -right-6 select-none text-[220px] leading-none opacity-[0.06]" aria-hidden="true">📰</span><p class="text-[15px] font-semibold">Beitrag links auswählen</p><p class="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Er öffnet sich hier im eingebauten Fenster.</p></div>`;
function nfMarkSel(ov) { ov.querySelectorAll('[data-nf-list] a[data-nread]').forEach(a => { const on = a.dataset.nread === nfSel; a.classList.toggle('ring-2', on); a.classList.toggle('ring-emerald-500', on); }); }
{ const ro = newsFullRender; newsFullRender = function () { const r = ro.apply(this, arguments); try { if (newsFull && newsFull.classList.contains('nf-desk')) nfMarkSel(newsFull); } catch (e) { } return r; }; }
{ const ro = newsOpenFull; newsOpenFull = function () {
  const was = newsFull, r = ro.apply(this, arguments), ov = newsFull; if (!ov || ov === was || !isDesk()) return r;
  ov.classList.add('nf-desk'); nfSel = null; nfFrameLoad();
  const inn = ov.querySelector('[data-nf-in]'), row = document.createElement('div'); row.className = 'flex min-h-0 flex-1';
  inn.replaceWith(row); row.appendChild(inn); inn.classList.remove('mx-auto', 'max-w-2xl', 'w-full', 'flex-1'); inn.classList.add('w-[460px]', 'shrink-0', 'border-r', 'border-slate-200', 'dark:border-slate-800');
  const pane = document.createElement('div'); pane.setAttribute('data-nf-pane', ''); pane.className = 'flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950'; pane.style.paddingTop = 'env(safe-area-inset-top)'; pane.innerHTML = NF_EMPTY; row.appendChild(pane);
  ov.addEventListener('click', async (e) => {
    if (e.isTrusted && (e.screenX || e.screenY)) nfOff = { x: e.screenX - e.clientX, y: e.screenY - e.clientY };
    if (e.target.closest('[data-nfp-x]')) { nfSel = null; pane.innerHTML = NF_EMPTY; nfMarkSel(ov); return; }
    if (e.target.closest('[data-nfp-reload]')) { const f = pane.querySelector('[data-nfp-frame]'); if (f) f.src = f.src; return; }
    if (e.target.closest('[data-nfp-front]')) { nfDockPlace(pane, true); return; }
    const a = e.target.closest('[data-nf-list] a[data-nread]'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    e.preventDefault(); const c = load(KEY_NEWS, null), x = c && c.items.find(i => i.u === a.dataset.nread); if (!x) { window.open(a.href, '_blank', 'noopener'); return; }
    nfSel = x.u; nfMarkSel(ov); const h = nfFrame ? nfFrame.h : await nfFrameLoad(); if (nfSel !== x.u) return;
    const ok = nfHostOk(newsUrl(x.u), h);
    if (ok !== true) { nfDock(x, pane); return; }                                   // Seite sperrt Einbetten (oder unbekannt) → angedocktes Browserfenster
    pane.innerHTML = nfPaneHtml(x, ok);
    const f = pane.querySelector('[data-nfp-frame]'); if (f) f.addEventListener('load', () => { const l = pane.querySelector('[data-nfp-load]'); if (l) l.remove(); }, { once: true });
  });
  return r; }; }

/* Angedocktes Beitragsfenster: echtes Browserfenster (Pop-up ohne Tableiste) genau über dem rechten Bereich; ein benanntes Fenster für
   alle Beiträge. Erst leer öffnen, opener trennen (Beitragsseite bekommt keinen Zugriff auf die App), dann zur Adresse. */
var nfWin = null;
/* Lage des App-Inhalts auf dem Bildschirm genau aus dem Mausklick (screenX − clientX) – Schätzen über outerWidth − innerWidth
   lag daneben (Edge-Seitenleiste/vertikale Tabs nur auf einer Seite, unsichtbare Fensterränder unter Windows).
   nfBp = unsichtbarer Rand des Pop-ups (links/rechts/unten), gemessen solange es noch about:blank ist (gleiche Herkunft). */
var nfOff = null, nfBp = 0;
function nfDockRect(pane) {
  const r = pane.getBoundingClientRect();
  let d;
  if (nfOff) d = { left: nfOff.x + r.left - nfBp, top: nfOff.y + r.top, width: r.width + 2 * nfBp, height: r.height + nfBp };
  else { const bx = (outerWidth - innerWidth) / 2, by = outerHeight - innerHeight - bx; d = { left: screenX + bx + r.left, top: screenY + by + r.top, width: r.width, height: r.height }; }
  /* nie über den freien Bildschirmbereich hinaus – sonst schiebt Windows/Edge das ganze Fenster nach oben/links */
  const ax = screen.availLeft || 0, ay = screen.availTop || 0, ar = ax + screen.availWidth, ab = ay + screen.availHeight;
  d.width = Math.min(d.width, ar - d.left + nfBp); d.height = Math.min(d.height, ab - d.top + nfBp);
  return { left: Math.round(d.left), top: Math.round(d.top), width: Math.round(d.width), height: Math.round(d.height) };
}
function nfDockPlace(pane, front) {
  if (!nfWin || nfWin.closed) return false; const d = nfDockRect(pane);
  try { nfWin.resizeTo(d.width, d.height); nfWin.moveTo(d.left, d.top); } catch (e) { }   // erst Größe (Außenmaß), dann Lage – sonst wird zu groß verschoben
  if (front) try { nfWin.focus(); } catch (e) { }
  return true;
}
function nfDock(x, pane) {
  const url = newsUrl(x.u), s = newsDef(x.s), d = nfDockRect(pane);
  if (!nfWin || nfWin.closed) {
    nfWin = window.open('about:blank', 'enyaqNews', `popup=yes,left=${d.left},top=${d.top},width=${Math.max(300, d.width - 40)},height=${Math.max(300, d.height - 120)}`);   // width/height = Innenmaß → kleiner öffnen, danach aufs Außenmaß ziehen
    if (nfWin) try { nfWin.opener = null; const b = (nfWin.outerWidth - nfWin.innerWidth) / 2; if (b >= 0 && b < 20) nfBp = b; } catch (e) { }
  }
  if (nfWin) { try { nfWin.location.href = url; } catch (e) { } nfDockPlace(pane, true); }
  const blocked = !nfWin;
  pane.innerHTML = `<div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-8 text-center"><span class="pointer-events-none absolute -bottom-10 -right-6 select-none text-[220px] leading-none opacity-[0.06]" aria-hidden="true">📰</span>
      <span class="h-2.5 w-2.5 rounded-full" style="background:${s.c}"></span><p class="mt-2 max-w-lg text-[16px] font-semibold leading-snug">${esc(x.t)}</p><p class="mt-1 text-[12px] text-slate-500 dark:text-slate-400">${esc(s.n)}${Number.isFinite(Date.parse(x.d)) ? ' · ' + newsAgo(Date.parse(x.d)) : ''}</p>
      <p class="mt-4 max-w-md text-[13px] text-slate-500 dark:text-slate-400">${blocked ? 'Der Browser hat das Fenster blockiert. Erlaube Pop-ups für diese App (Symbol rechts in der Adressleiste), dann klappt es beim nächsten Klick.' : 'Läuft im Fenster hier rechts daneben – die Seite erlaubt keine Anzeige direkt in der App.'}</p>
      <div class="mt-4 flex gap-2">${blocked ? '' : '<button type="button" data-nfp-front class="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-95 transition">⧉ Fenster nach vorne</button>'}
        <a href="${esc(url)}" target="_blank" rel="noopener" class="rounded-2xl bg-slate-200 dark:bg-slate-800 px-5 py-2.5 text-sm font-semibold active:scale-95 transition">↗ Als Tab öffnen</a></div></div>`;
}
