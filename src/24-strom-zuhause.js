/* =====================================================================
   Strom zuhause (Start, erste Karte links vom Langzeitverbrauch): alle Ladungen „Zuhause“ seit dem Kauf × Preis aus den Einstellungen.
   Monatsbalken (laufender Monat hell), Ø pro Monat (abgeschlossene Monate ohne angebrochenen Kaufmonat), Kosten je km.
   Heißt der Anbieter zuhause (Ladeanbieter › Zuhause) „Vattenfall“, in Vattenfall-Farben (Gelb auf Dunkelblau, nur Name, kein Logo).
   ===================================================================== */
function homeStats() {
  const rs = getReadings(), p0 = purchaseDay(), t0 = Date.parse(p0 + 'T00:00:00'), price = Number(getSettings().price) || 0, byM = {};
  let kwh = 0, n = 0, lastT = 0;
  rs.forEach((r, i) => {
    if (!(isHome(r) && isCharge(rs, i))) return; const t = Date.parse(r.date); if (!(t >= t0)) return;
    const k = Number(r.consumedSinceLast) || 0; if (k <= 0) return;
    const d = new Date(t), mk = d.getFullYear() * 12 + d.getMonth(); byM[mk] = (byM[mk] || 0) + k; kwh += k; n++; lastT = Math.max(lastT, t);
  });
  const now = new Date(), cur = now.getFullYear() * 12 + now.getMonth(), d0 = new Date(t0), m0 = d0.getFullYear() * 12 + d0.getMonth();
  const months = []; for (let m = Math.max(m0, cur - 5); m <= cur; m++) months.push({ m, eur: (byM[m] || 0) * price, cur: m === cur });
  const done = []; for (let m = m0 + (d0.getDate() > 1 ? 1 : 0); m < cur; m++) done.push((byM[m] || 0) * price);   // ohne angebrochenen Kaufmonat
  const doneAll = []; for (let m = m0; m < cur; m++) doneAll.push((byM[m] || 0) * price);
  const avgL = done.length ? done : doneAll, avg = avgL.length ? avgL.reduce((a, b) => a + b, 0) / avgL.length : null;
  let km = null; try { km = rangeKm(t0, Date.now()); } catch (e) { }
  return { kwh, n, price, eur: kwh * price, months, avg, km: km > 0 ? km : null, p0 };
}
function renderHomeCard() {
  const el = $('home-card'); if (!el) return;
  const s = homeStats(), show = !isSimple() && s.n > 0 && s.price > 0;
  el.classList.toggle('hidden', !show); setTimeout(() => { try { dashSwipeSync(); } catch (e) { } }, 0);
  if (!show) return;
  const name = pvHomeName(), vf = /vattenfall/i.test(name), mx = Math.max(1, ...s.months.map(x => x.eur));
  el.classList.toggle('home-vf', vf);
  const MS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const bars = s.months.map(x => `<div class="flex min-w-0 flex-1 flex-col items-center gap-0.5" title="${MS[x.m % 12]}: ${esc(eur(x.eur))}${x.cur ? ' (Zwischenstand)' : ''}">
      <div class="home-bar w-full rounded-t${x.cur ? ' home-bar-cur' : ''}" style="height:${Math.max(3, Math.round(x.eur / mx * 46))}px"></div><span class="home-sub text-[9.5px]">${MS[x.m % 12]}</span></div>`).join('');
  el.innerHTML = `<div class="flex items-center gap-2"><span class="home-dot flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px]" aria-hidden="true">⚡</span>
      <p class="min-w-0 flex-1 truncate font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Strom zuhause</p>${name ? `<span class="home-name shrink-0 text-[11px] font-bold">${esc(name)}</span>` : ''}</div>
    <p class="mt-1.5 font-barlow text-[40px] font-bold leading-none tabular-nums">${esc(eur(s.eur))}</p>
    <p class="home-calc mt-1 text-[12px]">${fmt(s.kwh, 0)} kWh × ${fmt(s.price * 100, 1)} ct</p>
    <p class="home-sub text-[11px]">seit Kauf ${new Date(s.p0 + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${s.n} ${s.n === 1 ? 'Ladung' : 'Ladungen'}</p>
    <div class="min-h-1 flex-1"></div>
    <div class="mt-1.5 flex items-end gap-1.5">${bars}</div>
    <div class="home-sub mt-1.5 flex justify-between text-[11px]"><span>${s.avg != null ? `Ø <b class="home-strong">${fmt(Math.round(s.avg), 0)} €</b>/Monat` : ''}</span><span>${s.km ? `<b class="home-strong">${fmt(s.eur / s.km * 100, 1)} ct</b>/km` : ''}</span></div>`;
}
{ const rd = renderDashboard; renderDashboard = function () { const r = rd.apply(this, arguments); try { renderHomeCard(); } catch (e) { } try { renderNews(); } catch (e) { } return r; }; }
try { renderHomeCard(); } catch (e) { } try { renderNews(); } catch (e) { }   // erster Aufbau (Start wurde schon vor diesem Skriptteil gezeichnet)
