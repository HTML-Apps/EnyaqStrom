/* =====================================================================
   Verbräuche & Effizienz (Start) als Bento-Raster (Variante B): gleiche Werte wie vorher (renderStats, renderEfficiency,
   renderLossChart füllen ihre IDs weiter), hier nur die Zusätze: Farbskala mit WLTP-Marke, ct/km, Verlust-Ring mit Klartext,
   Ladungen-Kachel (Titel + Untertitel statt langem Label) mit Mini-Verlauf der letzten 8 Wochen/Monate bzw. Jahre.
   ===================================================================== */
const EFF_LO = 10, EFF_HI = 26;
function effBento() {
  const rs = getReadings(), idxs = rs.map((_, i) => i).filter(i => inView(rs[i], dashPlace)), t = consumptionTotals(rs, idxs);
  const pos = (v) => Math.max(0, Math.min(100, (v - EFF_LO) / (EFF_HI - EFF_LO) * 100)).toFixed(1) + '%';
  const s = getSettings(), wl = Number(s.wltp) > 0 ? Number(s.wltp) : (() => { try { return carProf(s).wltp; } catch (e) { return null; } })();
  const mk = $('eff-mark'), wt = $('eff-wltp'), bd = $('eff-wltp-badge'), has = t.km > 0 && t.kwh100 > 0;
  mk.classList.toggle('hidden', !has); if (has) mk.style.left = pos(t.kwh100);
  const tk = $('eff-wltp-tick'); wt.classList.toggle('hidden', !wl); tk.classList.toggle('hidden', !wl);
  if (wl) {   // Dreieck genau unter dem WLTP-Wert (Text daneben; früher wurde der ganze Text mittig gesetzt → Dreieck lag links daneben)
    tk.style.left = pos(wl); const p = (wl - EFF_LO) / (EFF_HI - EFF_LO), right = p > 0.7;
    wt.style.left = pos(wl); wt.style.transform = right ? 'translateX(calc(-100% + 5px))' : 'translateX(-5px)';
    wt.innerHTML = right ? 'WLTP ' + fmt(wl, 1) + ' <span class="inline-block w-2.5 text-center">▲</span>' : '<span class="inline-block w-2.5 text-center">▲</span> WLTP ' + fmt(wl, 1);
  }
  bd.classList.toggle('hidden', !(has && wl));
  if (has && wl) {
    const d = (t.kwh100 - wl) / wl * 100, ok = d <= 0;
    bd.textContent = Math.abs(d) < 0.5 ? 'wie WLTP' : fmt(Math.abs(d), 0) + ' % ' + (ok ? 'unter' : 'über') + ' WLTP';
    bd.className = 'rounded-full px-2 py-0.5 text-[11px] font-bold ' + (ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300');
  }
  $('eff-ct').textContent = t.cost100 != null ? ' · ≈ ' + fmt(t.cost100, 1) + ' ct/km' : '';
  /* Ladeverlust-Ring aus dem schon berechneten Text (eff-loss = „5 %“) */
  const lp = parseFloat(($('eff-loss').textContent || '').replace(',', '.')), C = 2 * Math.PI * 26;
  $('eff-ring').setAttribute('stroke-dasharray', (Number.isFinite(lp) ? Math.max(1.5, Math.min(100, lp) / 100 * C) : 0).toFixed(1) + ' ' + C.toFixed(1));
  $('eff-loss-txt').textContent = Number.isFinite(lp) ? fmt(Math.max(0, 100 - lp), 0) + ' von 100 kWh kommen im Akku an' : 'noch keine Ladungen mit Akku-%';
}
function statBento() {
  const rs = getReadings(), ch = rs.filter((r, i) => inView(r, dashPlace) && isCharge(rs, i)).map(r => new Date(r.date));
  const now = new Date(), yr = statRange === 'year';
  $('stat-label').textContent = 'Ladungen';
  $('stat-sub').textContent = yr ? 'im Jahr ' + now.getFullYear() : statRange === 'week' ? 'Ø je Woche' : 'Ø je Monat';
  /* Mini-Verlauf: Anzahl je Woche (ab Montag) / Monat / Jahr, laufender Zeitraum blass */
  const N = yr ? Math.min(8, Math.max(1, now.getFullYear() - (ch.length ? Math.min(...ch.map(d => d.getFullYear())) : now.getFullYear()) + 1)) : 8, b = new Array(N).fill(0);
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
  ch.forEach(d => {
    const k = yr ? now.getFullYear() - d.getFullYear() : statRange === 'month' ? (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth()
      : d >= mon ? 0 : Math.floor((mon - d) / 6048e5) + 1;
    if (k >= 0 && k < N) b[N - 1 - k]++;
  });
  const mx = Math.max(1, ...b), lab = yr ? (i) => String(now.getFullYear() - (N - 1 - i)) : statRange === 'month' ? (i) => MONTHS[(now.getMonth() - (N - 1 - i) + 120) % 12] : (i) => (N - 1 - i ? 'vor ' + (N - 1 - i) + ' Wo.' : 'diese Woche') + ' (ab ' + new Date(mon.getTime() - (N - 1 - i) * 6048e5).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) + ')';
  const ml = (i) => yr ? String(now.getFullYear() - (N - 1 - i)).slice(2) : statRange === 'month' ? MONTHS[(now.getMonth() - (N - 1 - i) + 120) % 12].charAt(0)
    : MONTHS[new Date(mon.getTime() - (N - 1 - i) * 6048e5).getMonth()].charAt(0);   // Woche: Monat ihres Montags
  $('stat-spark-lab').innerHTML = ch.length ? b.map((_, i) => `<span class="flex-1">${ml(i)}</span>`).join('') : '';
  $('stat-spark').innerHTML = ch.length ? b.map((v, i) => `<div class="flex-1 rounded-[3px] ${!v ? 'bg-slate-300 dark:bg-slate-700' : i === N - 1 ? 'bg-emerald-500/40' : 'bg-emerald-500'}" style="height:${v ? Math.max(10, v / mx * 100).toFixed(0) : 6}%" title="${lab(i)}: ${v}"></div>`).join('') : '';
}
{ const oS = renderStats, oE = renderEfficiency;
  renderStats = function () { oS.apply(this, arguments); try { statBento(); } catch (e) { } };
  renderEfficiency = function () { oE.apply(this, arguments); try { effBento(); } catch (e) { } };
}
try { renderStats(); renderEfficiency(); } catch (e) { }   // erster Aufbau lief schon vor dieser Datei
