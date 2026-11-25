/* =====================================================================
   Trends-Karte „Verbrauch 30 Tage (Fahrtenbuch)“ (Variante A): letzte Karte im Trends-Karussell auf Start.
   Je Tag Σ kWh ÷ Σ km der importierten Fahrten (t.kwh, sonst t.k100 × km), Farbe nach Höhe, blass = wenig km, Ø-Linie.
   NUR ANZEIGE: die Werte fließen in keine Berechnung der App ein (Prognose, Kosten, Effizienz bleiben unberührt).
   ===================================================================== */
const FBV_DAYS = 30;
function fbvData() {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const from = t0.getTime() - (FBV_DAYS - 1) * 864e5, days = {};
  getTrips().forEach(t => {
    const s = Date.parse(t.s), km = Number(t.km); if (!Number.isFinite(s) || s < from || !(km >= 0.5)) return;
    const kwh = Number.isFinite(t.kwh) && t.kwh > 0 ? t.kwh : Number.isFinite(t.k100) && t.k100 > 0 ? t.k100 * km / 100 : null; if (kwh == null) return;
    const k = wxIso(new Date(s)), d = days[k] = days[k] || { km: 0, kwh: 0, n: 0 }; d.km += km; d.kwh += kwh; d.n++;
  });
  const list = []; for (let i = 0; i < FBV_DAYS; i++) { const d = new Date(from + i * 864e5), k = wxIso(d), x = days[k]; list.push({ d, k, km: x ? x.km : 0, n: x ? x.n : 0, v: x && x.km > 0 ? x.kwh / x.km * 100 : null }); }
  const km = list.reduce((a, x) => a + x.km, 0), kwh = Object.values(days).reduce((a, x) => a + x.kwh, 0), n = list.reduce((a, x) => a + x.n, 0);
  return { list, km, n, avg: km > 0 ? kwh / km * 100 : null };
}
function fbvCard() {
  const D = fbvData(), dd = (d) => pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
  const tag = '<span class="ml-auto shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10.5px] font-medium text-slate-500 dark:text-slate-400" title="Diese Werte fließen in keine Berechnung der App ein">nur Anzeige</span>';
  const head = `<div class="flex items-center gap-2"><p class="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"><svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V9a4 4 0 014-4M18 7v8a4 4 0 01-4 4h-2"/></svg>Verbrauch 30 Tage</p>${tag}</div>`;
  if (D.avg == null) return `<article class="snap-center snap-always shrink-0 w-full rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4" aria-label="Verbrauch 30 Tage aus dem Fahrtenbuch">${head}
    <p class="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Keine Fahrten mit Verbrauch in den letzten 30 Tagen.<br><span class="text-xs">Fahrtenbuch aus MySkoda importieren (Teilen-Menü oder Einstellungen › Fahrtenbuch).</span></p></article>`;
  const vs = D.list.filter(x => x.v != null).map(x => x.v), lo = Math.max(0, Math.floor(Math.min(...vs, D.avg) * 0.75)), hi = Math.max(...vs, D.avg) * 1.05, hp = (v) => Math.max(4, (v - lo) / ((hi - lo) || 1) * 100);
  const col = (v) => v > 24 ? 'bg-amber-500' : v < 19 ? 'bg-sky-500' : 'bg-emerald-500';
  const bars = D.list.map(x => x.v == null
    ? `<div class="flex-1 h-full flex items-end" title="${dd(x.d)}: keine Fahrt"><div class="w-full h-[3px] rounded-sm bg-slate-200 dark:bg-slate-800"></div></div>`
    : `<div class="flex-1 h-full flex items-end" title="${dd(x.d)}: ${fmt(x.v, 1)} kWh/100 km · ${fmt(x.km, 0)} km · ${x.n} ${x.n === 1 ? 'Fahrt' : 'Fahrten'}"><div class="w-full rounded-t-[3px] rounded-b-[1px] ${col(x.v)}" style="height:${hp(x.v).toFixed(1)}%;opacity:${(0.45 + Math.min(x.km, 80) / 80 * 0.55).toFixed(2)}"></div></div>`).join('');
  const mid = D.list[Math.floor(FBV_DAYS / 2)].d, dot = (c) => `<i class="inline-block h-2 w-2 rounded-sm ${c}"></i>`;
  return `<article class="snap-center snap-always shrink-0 w-full rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4" aria-label="Verbrauch 30 Tage aus dem Fahrtenbuch">${head}
    <div class="mt-3 flex flex-wrap items-baseline gap-x-2"><span class="font-barlow text-4xl font-bold leading-none tabular-nums">${fmt(D.avg, 1)}</span><span class="text-xs text-slate-500 dark:text-slate-400">kWh/100 km Ø · ${fmt(D.km, 0)} km · ${D.n} Fahrten</span></div>
    <div class="relative mt-3 h-[140px]"><div class="absolute inset-0 flex items-end gap-[2px]">${bars}</div>
      <div class="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-400/70 dark:border-slate-300/60" style="bottom:${hp(D.avg).toFixed(1)}%"><span class="absolute -top-[18px] right-0 rounded bg-white/90 dark:bg-slate-900/90 px-1 text-[10px] text-slate-600 dark:text-slate-300">Ø ${fmt(D.avg, 1)}</span></div></div>
    <div class="mt-1 flex justify-between text-[10px] text-slate-500 dark:text-slate-400"><span>${dd(D.list[0].d)}</span><span>${dd(mid)}</span><span>heute</span></div>
    <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400"><span>${dot('bg-sky-500')} &lt; 19</span><span>${dot('bg-emerald-500')} 19–24</span><span>${dot('bg-amber-500')} &gt; 24 kWh/100</span><span class="ml-auto">blass = wenig km · aus dem Fahrtenbuch, nur Anzeige</span></p></article>`;
}
/* An renderTrends anhängen: Karte als letzte Folie + Punkte neu */
{ const orig = renderTrends;
  renderTrends = function () {
    orig.apply(this, arguments);
    const box = $('trends'); if (!box) return; let html = ''; try { html = fbvCard(); } catch (e) { return; }
    box.insertAdjacentHTML('beforeend', html);
    const n = box.children.length; $('trends-dots').innerHTML = Array.from({ length: n }, (_, i) => `<span data-tdot="${i}" class="block h-2 rounded-full transition-all ${i === trendIdx ? 'w-5 bg-emerald-500' : 'w-2 bg-slate-500/60'}"></span>`).join('');
  };
  try { renderTrends(); } catch (e) { }
}
