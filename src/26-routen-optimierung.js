/* =====================================================================
   Routenplaner › Optimierung: bestes Autobahn-Tempo für die eingegebene Strecke.
   Je Tempo (100–140 km/h): Prognose-Modell (Route, Höhen, Wetter, persönlicher Faktor) mit diesem Tempo auf der Autobahn;
   der Tempo-Einfluss auf der Autobahn kommt aus der Tempomat-Messreihe (passende Jahreszeit nach Außentemperatur):
     Energie(v) = Modell(v) + Autobahn-km × [(Mess(v) − Mess(vRef)) − (Flach(v) − Flach(vRef))] / 100,   vRef = eingestelltes AB-Tempo
   (bei vRef stimmt die Optimierung also genau mit der Prognose überein; außerhalb der Messreihe trägt das Physikmodell weiter).
   Ladestopps mit dem echten Lader-Plan (rtDP, eigene DC-Ladekurve, Säulen an der Route). Kosten = Laden unterwegs (Ladekarten-Preis)
   + Rest zum Nachladen zuhause (Strompreis). Optimal = kleinste Summe aus Reisezeit × Zeitwert (€/h) + Kosten.
   ===================================================================== */
const OPT_V = [100, 110, 120, 130, 140], KEY_OPTVAL = 'enyaq.optVal', OPT_VALS = [15, 30, 50];
var optIdx = 1;   // sichtbare Karte (0 langsam, 1 optimal, 2 schnell) – var: TDZ-sicher
/** Flacher Verbrauch (akkuseitig, kWh/100 km) bei 15 °C, windstill – nur für den Tempo-Unterschied */
function optFlat(v) { const P = rtPhys(), m = P.m + P.mp, u = v / 3.6, F = P.crr * m * 9.81 + 0.5 * 1.225 * P.cw * P.A * u * u; return (F / P.eta + P.aux * 1000 / u) * 100000 / 3.6e6; }
/** Eigene Tempomat-Messreihen mit mind. 3 Werten (Wissen › Tempomat) */
const optSerList = () => (getLab().speeds || []).map(s => ({ ...s, rows: (s.rows || []).filter(r => r.v > 0 && r.k > 0).sort((a, b) => a.v - b.v) })).filter(s => s.rows.length >= 3);
const KEY_OPTSER = 'enyaq.optSer', optSerPick = () => String(load(KEY_OPTSER, 'auto') || 'auto');   // 'auto' oder id einer Messreihe (nur dieses Gerät)
const optSerShort = (s) => [s.season, s.klima ? 'Klima ' + s.klima : '', s.note].filter(Boolean).join(' · ');
/** Messreihe: gewählte, sonst automatisch nach Jahreszeit (mittlere Temperatur der Fahrt) */
function optSeries(tAvg) {
  const ss = optSerList(); if (!ss.length) return null;
  const pick = optSerPick(), own = pick !== 'auto' && ss.find(s => s.id === pick); return own || optSerAuto(ss, tAvg);
}
function optSerAuto(ss, tAvg) {
  const sea = tAvg < 8 ? 'Winter' : tAvg < 16 ? 'Übergang' : 'Sommer', kl = tAvg < 5 || tAvg > 24 ? 'an' : null;
  return ss.find(s => s.season === sea && (!kl || s.klima === kl)) || ss.find(s => s.season === sea) || ss[0];
}
/** Messwert bei Tempo v: innerhalb der Reihe linear, außerhalb Randwert + Physik-Unterschied */
function optMeas(sr, v) {
  const R = sr.rows, a = R[0], b = R[R.length - 1];
  if (v <= a.v) return a.k + optFlat(v) - optFlat(a.v); if (v >= b.v) return b.k + optFlat(v) - optFlat(b.v);
  for (let i = 1; i < R.length; i++) if (v <= R[i].v) { const p = R[i - 1], q = R[i]; return p.k + (q.k - p.k) * (v - p.v) / (q.v - p.v); }
  return b.k;
}
const KEY_OPTABS = 'enyaq.optAbs', optAbs = () => !!load(KEY_OPTABS, false);   // Messwerte direkt (nur dieses Gerät)
const optKey = () => optSerPick() + (optAbs() ? '|abs' : '');
const optVal = () => { const v = Number(load(KEY_OPTVAL, 30)); return OPT_VALS.includes(v) ? v : 30; };
async function rtOptRun() {
  const el = $('rt-opt'); if (!el) return;
  if (!RT.base || !RT.legs || RT.busy) { rtOptRender(); return; }
  const n = RT.n; if (RT.opt && RT.opt.n === n && !RT.opt.err && RT.opt.pick === optKey()) { rtOptRender(); return; }
  RT.opt = { n, busy: true, pick: optKey() }; rtOptRender();
  try {
    const abs = optAbs(), o = RT.o, cap = batteryKwh(), vRef = o.vab, sr = optSeries(RT.base.tAvg), homeP = Number(getSettings().price) || 0.3;
    let sites = []; try { sites = await rtChargers(RT.base); } catch (e) { }
    if (n !== RT.n) return; rtCurveInit();
    const rows = OPT_V.map(v => {
      let b = rtCalc(RT.legs, { ...o, vab: v });
      /* Messwerte direkt: Ø des Modells auf den Autobahn-Abschnitten (inkl. Wetter, Höhen, persönlicher Faktor) wird auf den Messwert gesetzt –
         Unterschiede zwischen den Abschnitten (Steigung, Wind) bleiben, das Niveau kommt aus der Messreihe. Sonst nur der Tempo-Verlauf (s. oben). */
      let corr = 0;
      if (sr && abs && b.mwKm > 1) { let mwE = 0; for (let i = 1; i < b.cumK.length; i++) if (b.mwk[i] > b.mwk[i - 1]) mwE += b.cumK[i] - b.cumK[i - 1]; corr = optMeas(sr, v) - mwE / b.mwKm * 100; }
      else if (sr) corr = (optMeas(sr, v) - optMeas(sr, vRef)) - (optFlat(v) - optFlat(vRef));   // kWh/100 km Autobahn
      if (corr) { const cumK = b.cumK.map((c, i) => c + corr * b.mwk[i] / 100), soc = cumK.map(c => o.soc - c / cap * 100), kwh = cumK[cumK.length - 1];
        b = { ...b, cumK, soc, kwh, k100: kwh / b.km * 100, socA: soc[soc.length - 1], turn: b.turn ? { ...b.turn, soc: soc[b.turn.i] } : null }; }
      let plan = []; const needs = Math.min(...b.soc.slice(1)) < WXO_RES - 0.5;
      if (needs) { plan = null; if (sites.length) { const pos = rtPos(b, sites), dp = rtDP(b, pos, 'fast'); plan = dp.plan(o.soc, 0); } }
      if (needs && (!plan || !plan.length)) return { v, ok: false, kwh: b.kwh };
      const r = rtApplyStops(b, plan), chMin = (plan || []).reduce((a, s) => a + s.tot, 0), chKwh = (plan || []).reduce((a, s) => a + (s.tgt - s.sArr) / 100 * cap, 0);
      const eurCh = (plan || []).reduce((a, s) => a + (s.eur || (s.tgt - s.sArr) / 100 * cap / 0.93 * 0.59), 0), eurHome = Math.max(0, b.kwh - chKwh) / 0.9 * homeP;
      return { v, ok: true, kwh: b.kwh, drive: b.dur / 60, ch: chMin, stops: (plan || []).length, tot: r.tEnd / 60, arr: o.dep + r.tEnd * 1000, eur: eurCh + eurHome, eurCh, socA: r.socA };
    });
    if (n !== RT.n) return;
    RT.opt = { n, pick: optKey(), abs, rows, sr, vRef, ext: sr ? OPT_V.filter(v => v > sr.rows[sr.rows.length - 1].v || v < sr.rows[0].v) : [] };
  } catch (e) { if (n !== RT.n) return; RT.opt = { n, err: (e && e.message) || 'Optimierung nicht möglich' }; }
  optIdx = 1; rtOptRender();
}
const optHm = (min) => { const m = Math.round(min); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const optEur = (x) => fmt(x, 2) + '\u00a0€';
function rtOptPick(rows) {
  const ok = rows.filter(r => r.ok); if (!ok.length) return null; const val = optVal();
  const score = (r) => r.tot / 60 * val + r.eur, best = ok.reduce((a, r) => score(r) < score(a) ? r : a, ok[0]);
  const slow = ok.filter(r => r.v < best.v).reduce((a, r) => !a || r.eur < a.eur || (r.eur === a.eur && r.v > a.v) ? r : a, null);
  const fast = ok.filter(r => r.v > best.v).reduce((a, r) => !a || r.tot < a.tot - 0.5 ? r : a, null);
  return { best, slow, fast, score };
}
function rtOptRender() {
  const el = $('rt-opt'); if (!el) return; const box = 'rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4';
  if (!RT.a || !RT.b) { el.innerHTML = `<p class="px-1 text-xs text-slate-500 dark:text-slate-400 text-left">Start und Ziel eingeben – die App rechnet die Strecke für 100 bis 140 km/h auf der Autobahn durch und sucht den besten Kompromiss aus Ankunftszeit, Verbrauch und Ladezeit.</p>`; return; }
  const op = RT.opt;
  if (RT.busy || !op || op.busy) { el.innerHTML = `<div class="${box} text-sm text-slate-500 dark:text-slate-400 text-left">Rechne 100–140 km/h mit Messreihe und Ladestopps durch …</div>`; return; }
  if (op.err) { el.innerHTML = `<div class="${box} text-sm text-red-600 dark:text-red-400 text-left">${esc(op.err)}</div>`; return; }
  const rows = op.rows, pk = rtOptPick(rows);
  if (!pk) { el.innerHTML = `<div class="${box} text-sm text-left">Mit den Ladern an der Route ist die Strecke bei keinem Tempo zu schaffen.</div>`; return; }
  /* Diagramm: Balken Fahren + Laden (Gesamtzeit), Linie Kosten */
  const W = 312, H = 150, top = 22, bot = 18, ok = rows.filter(r => r.ok), mxT = Math.max(...ok.map(r => r.tot)) * 1.04, mnE = Math.min(...ok.map(r => r.eur)), mxE = Math.max(...ok.map(r => r.eur));
  const bw = 34, X = (i) => 18 + bw / 2 + i * (W - 36 - bw) / (rows.length - 1), Yt = (m) => H - bot - m / mxT * (H - bot - top), Ye = (e) => H - bot - 12 - (mxE > mnE ? (e - mnE) / (mxE - mnE) : 0.5) * (H - bot - top) * 0.45;   // Kostenlinie im unteren Teil der Balken, nie über den Zeit-Beschriftungen
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="mt-1 w-full" style="height:${H}px" role="img" aria-label="Reisezeit und Kosten je Tempo">`;
  rows.forEach((r, i) => { const x = X(i) - bw / 2, best = r === pk.best;
    if (!r.ok) { svg += `<text x="${X(i)}" y="${H - bot - 8}" text-anchor="middle" font-size="10" class="fill-red-500">✕</text>`; }
    else { const yd = Yt(r.drive), yt = Yt(r.tot);
      svg += `<rect x="${x}" y="${yd}" width="${bw}" height="${H - bot - yd}" rx="4" class="${best ? 'fill-emerald-500' : 'fill-slate-300 dark:fill-slate-700'}"/>`;
      if (r.ch > 0.5) svg += `<rect x="${x}" y="${yt}" width="${bw}" height="${Math.max(2, yd - yt - 1)}" rx="4" class="${best ? 'fill-amber-400' : 'fill-amber-200 dark:fill-amber-900'}"/>`;
      svg += `<text x="${X(i)}" y="${yt - 5}" text-anchor="middle" font-size="10.5" font-weight="700" class="${best ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-slate-600 dark:fill-slate-300'}">${optHm(r.tot)}</text>`; }
    svg += `<text x="${X(i)}" y="${H - 4}" text-anchor="middle" font-size="10.5" class="${best ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-slate-500 dark:fill-slate-400'}" font-weight="${best ? 700 : 400}">${r.v}${op.ext.includes(r.v) ? '*' : ''}</text>`; });
  const lp = rows.map((r, i) => r.ok ? X(i).toFixed(1) + ',' + Ye(r.eur).toFixed(1) : null).filter(Boolean);
  svg += `<polyline points="${lp.join(' ')}" fill="none" stroke="#a78bfa" stroke-width="2"/>` + rows.map((r, i) => r.ok ? `<circle cx="${X(i).toFixed(1)}" cy="${Ye(r.eur).toFixed(1)}" r="3" fill="#a78bfa"><title>${optEur(r.eur)}</title></circle>` : '').join('') + '</svg>';
  /* Karten: langsam | optimal | schnell, wischbar */
  const B = pk.best, line = (r) => `${optHm(r.drive)} h fahren · ${r.stops ? r.stops + (r.stops === 1 ? ' Stopp · ' : ' Stopps · ') + Math.round(r.ch) + ' min laden' : 'ohne Ladestopp'} · ${fmt(r.kwh, 0)} kWh · ${optEur(r.eur)}`;
  const dT = (r) => Math.round(r.tot - B.tot), dE = (r) => r.eur - B.eur;
  const why = {
    slow: (r) => `${dT(r)} min später da, spart ${optEur(-dE(r))}${r.stops < B.stops ? ' und einen Ladestopp' : ''}.`,
    best: () => pk.fast ? `${pk.fast.v} km/h wäre nur ${-dT(pk.fast)} min schneller, kostet aber +${optEur(dE(pk.fast))}${pk.fast.ch > B.ch + 1 ? ' und lädt ' + Math.round(pk.fast.ch - B.ch) + ' min länger' : ''}.` : pk.slow ? `${pk.slow.v} km/h spart nur ${optEur(-dE(pk.slow))}, dauert aber ${dT(pk.slow)} min länger.` : 'Bester Kompromiss aus Zeit und Kosten.',
    fast: (r) => `${-dT(r)} min früher da, kostet +${optEur(dE(r))}${r.ch > B.ch + 1 ? ', ' + Math.round(r.ch - B.ch) + ' min mehr laden' : ''}.`
  };
  const card = (k, r, lbl, cls, labCls) => r ? `<div class="w-full shrink-0 snap-center snap-always px-0.5"><div class="h-full rounded-3xl p-4 ${cls}">
      <div class="flex items-baseline justify-between gap-2"><p class="text-[11px] font-bold uppercase tracking-[0.08em] ${labCls}">${lbl}</p><p class="text-xs opacity-80">${fmt(RT.base.km, 0)} km · Ankunft <b>${hhmm(r.arr)}</b></p></div>
      <p class="mt-0.5 font-barlow text-[40px] font-bold uppercase leading-none">${r.v} km/h</p>
      <p class="mt-1.5 text-[12.5px] opacity-90">${line(r)}</p><p class="mt-1.5 text-[12px] opacity-80">${why[k](r)}</p>
      <button type="button" data-optuse="${r.v}" class="mt-2.5 rounded-xl bg-black/10 px-3 py-1.5 text-xs font-semibold active:scale-95 transition dark:bg-white/10">In Prognose übernehmen ›</button></div></div>` : '';
  const cards = [card('slow', pk.slow, 'Langsam', 'bg-white dark:bg-slate-900 shadow-sm', 'text-sky-600 dark:text-sky-400'),
    card('best', B, '★ Optimal', 'bg-gradient-to-br from-emerald-700 to-slate-900 text-white shadow-sm', 'text-emerald-200'),
    card('fast', pk.fast, 'Schnell', 'bg-white dark:bg-slate-900 shadow-sm', 'text-pink-600 dark:text-pink-400')].filter(Boolean);
  const startI = pk.slow ? 1 : 0, val = optVal(), sr = op.sr;
  el.innerHTML = `<div class="${box}"><div class="flex items-baseline justify-between gap-2"><p class="text-sm font-bold">Reisezeit je Tempo</p><p class="text-[11px] text-slate-500 dark:text-slate-400"><span class="text-emerald-500">■</span> Fahren <span class="text-amber-400">■</span> Laden <span class="text-violet-400">●</span> Kosten</p></div>${svg}
      <p class="text-center text-[11px] text-slate-500 dark:text-slate-400">Tempomat auf der Autobahn (km/h)${op.ext.length ? ' · * außerhalb der Messreihe geschätzt' : ''}</p></div>
    <div id="opt-cards" class="no-scrollbar mt-3 flex snap-x snap-mandatory overflow-x-auto scroll-smooth">${cards.join('')}</div>
    ${cards.length > 1 ? `<div class="mt-2 flex justify-center gap-1.5" id="opt-dots">${cards.map((_, i) => `<span class="h-1.5 rounded-full transition-all ${i === startI ? 'w-4 bg-slate-500 dark:bg-slate-300' : 'w-1.5 bg-slate-300 dark:bg-slate-700'}"></span>`).join('')}</div>` : ''}
    <div class="mt-3 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400"><span>Zeit ist mir wert:</span>${OPT_VALS.map(x => `<button type="button" data-optval="${x}" class="rounded-lg px-2 py-0.5 font-semibold ${x === val ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-slate-800 shadow-sm'}">${x} €/h</button>`).join('')}</div>
    ${(() => { const ss = optSerList(), pick = ss.some(s => s.id === optSerPick()) ? optSerPick() : 'auto', au = ss.length ? optSerAuto(ss, RT.base.tAvg) : null, on = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', off = 'bg-white dark:bg-slate-800 shadow-sm';
      return ss.length ? `<div class="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400"><span>Messreihe:</span><button type="button" data-optser="auto" class="rounded-lg px-2 py-0.5 font-semibold ${pick === 'auto' ? on : off}">Automatisch${au ? ' (' + esc(optSerShort(au)) + ')' : ''}</button>${ss.map(s => `<button type="button" data-optser="${esc(s.id)}" class="rounded-lg px-2 py-0.5 font-semibold ${pick === s.id ? on : off}">${esc(optSerShort(s))}</button>`).join('')}</div>
      <div class="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 px-3 py-2 shadow-sm"><div class="min-w-0 text-left"><p class="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Messwerte direkt</p><p class="text-[11px] text-slate-500 dark:text-slate-400">${op.abs ? 'Autobahn-Verbrauch genau aus der Messreihe – Wetter der Fahrt und dein Faktor zählen dort nicht' : 'Aus: Niveau aus der Prognose (Wetter, Faktor), Messreihe nur für den Tempo-Anstieg'}</p></div>
        <button type="button" data-optabs role="switch" aria-checked="${op.abs ? 'true' : 'false'}" aria-label="Messwerte direkt" class="relative h-7 w-12 shrink-0 rounded-full transition ${op.abs ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}"><span class="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${op.abs ? 'left-[22px]' : 'left-0.5'}"></span></button></div>` : ''; })()}
    <p class="mt-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400 text-left">${sr ? (op.abs ? '📈 Autobahn = Messwerte ' : '📈 Tempo-Anstieg aus deiner Messreihe ') + esc(spdLabel(sr)) : '⚠️ Keine Tempomat-Messreihe (Wissen › Tempomat) – nur Physikmodell'} · ${fmt(RT.base.mwKm, 0)} km Autobahn · Kosten = Laden unterwegs + Nachladen zuhause · Ladezeit mit deiner DC-Ladekurve</p>`;
  const sc = $('opt-cards'); if (sc) { requestAnimationFrame(() => { sc.style.scrollBehavior = 'auto'; sc.scrollLeft = startI * sc.clientWidth; sc.style.scrollBehavior = ''; });
    sc.addEventListener('scroll', () => { const i = Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth)); document.querySelectorAll('#opt-dots span').forEach((d, j) => { d.className = 'h-1.5 rounded-full transition-all ' + (j === i ? 'w-4 bg-slate-500 dark:bg-slate-300' : 'w-1.5 bg-slate-300 dark:bg-slate-700'); }); }, { passive: true }); }
}
$('rt-opt').addEventListener('click', (e) => {
  if (e.target.closest('[data-optabs]')) { save(KEY_OPTABS, !optAbs()); rtOptRun(); return; }
  const sp = e.target.closest('[data-optser]'); if (sp) { save(KEY_OPTSER, sp.dataset.optser); rtOptRun(); return; }
  const v = e.target.closest('[data-optval]'); if (v) { save(KEY_OPTVAL, Number(v.dataset.optval)); rtOptRender(); return; }
  const u = e.target.closest('[data-optuse]'); if (u) { $('rt-vab').value = u.dataset.optuse; RT.tab = 'plan'; rtTabs(); rtRun(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
