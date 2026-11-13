/* =====================================================================
   Strecken-Prognose: Route (OSRM) + Höhen (Open-Meteo) + Wetter entlang der Strecke (Temperatur, Regen, Wind zur Ankunftszeit je Abschnitt).
   Physik je Abschnitt (akkuseitig, ohne Ladeverluste): Rollen + Luft (cw 0,257 · 2,56 m², Luftdichte nach Temperatur), Steigung (bergab mit
   Rekuperation), Anfahren/Bremsen nach Tempo, Nebenverbraucher, Heizung/Klima + kalter Akku, Nässe (mehr Rollwiderstand).
   Persönlicher Faktor: lernt aus den selbst eingetragenen Realwerten gemerkter Fahrten (lab.fc), neue Fahrten zählen mehr (Halbwertszeit 180 Tage).
   ===================================================================== */
const rtPhys = () => { const c = carProf(); return { m: c.m, crr: c.crr, cw: c.cw, A: c.A, eta: c.eta, rec: c.rec, aux: c.aux, mp: 75 }; };   // aus dem Fahrzeugprofil
const RT = { a: null, b: null, res: null, busy: false, err: '', tab: 'plan', n: 0, route: {}, wx: {}, sugN: 0, sugT: 0, sug: {} };
const KEY_RT = 'enyaq.rtLast';
const rtFmtP = (v) => (v >= 0.05 ? '+' : v <= -0.05 ? '−' : '±') + fmt(Math.abs(v), 1) + ' %';
const rtDev = (p, r) => (p - r) / r * 100;
function rtFactor(skipId, override) {
  const list = getLab().fc.map(x => override && x.id === override.id ? override : x).filter(x => x.id !== skipId && x.real > 0 && x.raw100 > 0);
  let s = 2, w0 = 2; list.forEach(x => { const age = Math.max(0, (Date.now() - Date.parse(x.dep)) / 864e5), w = Math.pow(0.5, age / 180) * Math.max(0.2, Math.min(1, (x.km || 0) / 100)); s += w * Math.min(1.4, Math.max(0.7, x.real / x.raw100)); w0 += w; });
  return Math.round(s / w0 * 1000) / 1000;
}
async function rtRoute(a, b, v) {
  const wp = [a, v, b].filter(Boolean), key = wp.map(p => p.lat.toFixed(4) + ',' + p.lon.toFixed(4)).join(';'); if (RT.route[key]) return RT.route[key];
  const rr = await fetch('https://router.project-osrm.org/route/v1/driving/' + wp.map(p => p.lon.toFixed(5) + ',' + p.lat.toFixed(5)).join(';') + '?overview=false&steps=true&geometries=geojson');
  if (!rr.ok) throw new Error('Route nicht gefunden (' + rr.status + ')'); const rj = await rr.json(), rt = rj.routes && rj.routes[0]; if (!rt) throw new Error('Keine Route gefunden');
  const raw = [];                                                                 // Teilstücke: { a, b, len, v, mw }
  (rt.legs || []).forEach(l => (l.steps || []).forEach(s => { const c = (s.geometry && s.geometry.coordinates) || [], v = s.duration > 0 ? s.distance / s.duration : 13, mw = /(^|[;\s])A\s?\d/.test(s.ref || '') || v > 24;
    for (let i = 1; i < c.length; i++) { const p = { lat: c[i - 1][1], lon: c[i - 1][0] }, q = { lat: c[i][1], lon: c[i][0] }, len = geoDist(p, q); if (len > 0) raw.push({ p, q, len, v: Math.max(3, v), mw }); } }));
  const tot = raw.reduce((s, x) => s + x.len, 0); if (!(tot > 100)) throw new Error('Strecke zu kurz');
  const N = Math.max(12, Math.min(240, Math.round(tot / 1000))), L = tot / N, segs = []; let j = 0, off = 0;
  const at = (k, o) => { const r = raw[k], f = r.len ? o / r.len : 0; return { lat: r.p.lat + (r.q.lat - r.p.lat) * f, lon: r.p.lon + (r.q.lon - r.p.lon) * f }; };
  let pos = at(0, 0); const pts = [pos];
  for (let i = 0; i < N; i++) { let need = L, t = 0, mwl = 0;
    while (need > 1e-6 && j < raw.length) { const r = raw[j], take = Math.min(need, r.len - off); t += take / r.v; if (r.mw) mwl += take; need -= take; off += take; if (off >= r.len - 1e-6) { j++; off = 0; } }
    const end = j < raw.length ? at(j, off) : raw[raw.length - 1].q, y = Math.sin((end.lon - pos.lon) * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180), x = Math.cos(pos.lat * Math.PI / 180) * Math.sin(end.lat * Math.PI / 180) - Math.sin(pos.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) * Math.cos((end.lon - pos.lon) * Math.PI / 180);
    segs.push({ len: L, v: L / Math.max(t, 0.1), mw: mwl / L > 0.5, brg: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, lat: (pos.lat + end.lat) / 2, lon: (pos.lon + end.lon) / 2, d: (i + 0.5) * L }); pos = end; pts.push(end); }
  const el = [];
  for (let k = 0; k < pts.length; k += 100) { const ch = pts.slice(k, k + 100), er = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + ch.map(s => s.lat.toFixed(5)).join(',') + '&longitude=' + ch.map(s => s.lon.toFixed(5)).join(','));
    if (!er.ok) throw new Error('Höhen nicht verfügbar (' + er.status + ')'); el.push(...((await er.json()).elevation || []).map(Number)); }
  const h = el.map((v, i) => (Number(el[i - 1] ?? v) + v * 2 + Number(el[i + 1] ?? v)) / 4);
  const res = { km: tot / 1000, segs, pts, h: h.length === pts.length ? h : pts.map(() => 0), noH: h.length !== pts.length };
  RT.route[key] = res; return res;
}
async function rtWeather(route, dep) {
  const n = Math.max(2, Math.min(8, Math.round(route.km / 30) + 1)), idx = [...new Set(Array.from({ length: n }, (_, i) => Math.round(i * (route.segs.length - 1) / (n - 1))))];
  const key = idx.map(i => route.segs[i].lat.toFixed(2) + ',' + route.segs[i].lon.toFixed(2)).join(';'), c = RT.wx[key];
  let data = c && Date.now() - c.t < 30 * 60e3 ? c.d : null;
  if (!data) { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + idx.map(i => route.segs[i].lat.toFixed(3)).join(',') + '&longitude=' + idx.map(i => route.segs[i].lon.toFixed(3)).join(',') + '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m,dew_point_2m&wind_speed_unit=ms&timezone=auto&past_days=1&forecast_days=16');
    if (!r.ok) throw new Error('Wetter nicht verfügbar'); const j = await r.json(); data = Array.isArray(j) ? j : [j]; RT.wx[key] = { t: Date.now(), d: data }; }
  return { pts: idx.map((si, k) => ({ d: route.segs[si].d, h: data[k] && data[k].hourly })) };
}
function rtWxAt(wx, d, ms) {
  if (!wx) return null; let best = wx.pts[0]; wx.pts.forEach(p => { if (Math.abs(p.d - d) < Math.abs(best.d - d)) best = p; }); const h = best.h; if (!h || !h.time) return null;
  const t = new Date(ms), k = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) + 'T' + pad2(t.getHours()) + ':00', i = h.time.indexOf(k); if (i < 0) return null;
  return { T: Number(h.temperature_2m[i]), rain: Number(h.precipitation[i]) || 0, ws: Number(h.wind_speed_10m[i]) || 0, wd: Number(h.wind_direction_10m[i]) || 0, rh: h.relative_humidity_2m ? Number(h.relative_humidity_2m[i]) : NaN, td: h.dew_point_2m ? Number(h.dew_point_2m[i]) : NaN };
}
/* Mitfahrer-Zuschlag („Freundin-Zuschlag“): ab 2 Personen pauschal +12 % – sie friert im Winter (24 °C + Sitzheizung) und will es im Sommer noch kühler.
   In der App nicht eigens ausgewiesen, steckt im Chip Heizung/Klima. */
const FREUNDIN_ZUSCHLAG = 0.12;
/* Freisicht (beschlagene Scheiben nach dem Parken): bei hoher Luftfeuchte bzw. Taupunkt nahe der Außentemperatur und unter 14 °C läuft zu Beginn jeder
   Etappe einige Minuten Gebläse + Klimakompressor + Heizung. Grob 0,25–0,6 kWh, mit Mitfahrern mehr (Atemfeuchte). */
function rtFog(w, pers) {
  if (!w || !(w.T < 14)) return 0; const sp = Number.isFinite(w.td) ? w.T - w.td : null, rh = Number.isFinite(w.rh) ? w.rh : null;
  const lvl = (rh != null && rh >= 92) || (sp != null && sp <= 1.5) ? 1 : (rh != null && rh >= 85) || (sp != null && sp <= 3) ? 0.6 : 0; if (!lvl) return 0;
  return lvl * Math.min(0.6, 0.25 + 0.03 * Math.max(0, 12 - w.T)) * (pers >= 2 ? 1.25 : 1);
}
const RT_STANDBY = 0.05;                                                          // kW Ruhestrom beim Parken am Ziel (Hin & zurück; zählt im Akkustand mit)
function rtCalc(legs, o) {
  const RT_P = rtPhys(), m = RT_P.m + RT_P.mp * (o.pers - 1), g = 9.81, cap = batteryKwh(), f = 1 + o.tempo / 100, J = 3.6e6;
  const bat = (x) => x > 0 ? x / RT_P.eta : x * RT_P.rec;
  let t = 0, E = { base: 0, slope: 0, wind: 0, rain: 0, heat: 0 }, cum = [0], Ts = [], rainKm = 0, hwSum = 0, noWx = false, h = [], turn = null, durDrive = 0, d0 = 0, pts = [], dkm = [], tt = [], dk = 0, fogE = [];
  legs.forEach((lg, li) => {
    const route = lg.route, wx = lg.wx;
    if (li) { t += o.stay * 3600; turn = { i: cum.length - 1, t: durDrive }; }
    h = h.length ? h.concat(route.h.slice(1)) : route.h.slice(); if (!pts.length) { pts.push(route.pts[0]); dkm.push(0); tt.push(0); }
    route.segs.forEach((s, i) => {
      const v = (s.mw ? o.vab / 3.6 : s.v) * f, dt = s.len / v, ww = rtWxAt(wx, s.d, o.dep + t * 1000), w = ww || { T: 10, rain: 0, ws: 0, wd: 0 }; if (!ww) noWx = true;
      const rho = 1.293 * 273.15 / (273.15 + w.T), hw = w.ws * 0.7 * Math.cos((w.wd - s.brg) * Math.PI / 180), dh = route.h[i + 1] - route.h[i], Fs = m * g * dh;
      const aero = (u) => 0.5 * rho * RT_P.cw * RT_P.A * u * Math.abs(u), wet = w.rain >= 0.3 ? 1.2 : 1;
      const F0 = RT_P.crr * m * g + aero(v), Fw = RT_P.crr * m * g + aero(v + hw), Fr = RT_P.crr * wet * m * g + aero(v + hw);
      const stops = v < 11 ? 2 : v < 17 ? 1 : v < 22 ? 0.3 : 0.03, acc = stops * s.len / 1000 * 0.5 * m * v * v * (1 / RT_P.eta - RT_P.rec);
      const e0 = bat(F0 * s.len), e1 = bat(F0 * s.len + Fs), e2 = bat(Fw * s.len + Fs), e3 = bat(Fr * s.len + Fs);
      const pH = w.T < 18 ? 0.09 * (18 - w.T) : w.T > 24 ? 0.08 * (w.T - 24) : 0, cold = Math.max(0, e3) * 0.004 * Math.max(0, 15 - w.T);
      const eb = (e0 + acc) / J + RT_P.aux * dt / 3600, es = (e1 - e0) / J, ew = (e2 - e1) / J, er = (e3 - e2) / J, eh = pH * dt / 3600 + cold / J + (i === 0 ? 0.5 * Math.max(0, 15 - w.T) / 15 + (fogE[li] = rtFog(ww, o.pers)) + (li ? RT_STANDBY * o.stay : 0) : 0);
      E.base += eb; E.slope += es; E.wind += ew; E.rain += er; E.heat += eh; cum.push(cum[cum.length - 1] + eb + es + ew + er + eh);
      t += dt; durDrive += dt; dk += s.len / 1000; pts.push(route.pts[i + 1]); dkm.push(dk); tt.push(t); Ts.push(w.T); if (w.rain >= 0.3) rainKm += s.len / 1000; hwSum += hw * s.len;
    });
    d0 += route.km;
  });
  if (o.pers >= 2) { E.heat += cum[cum.length - 1] * FREUNDIN_ZUSCHLAG; cum = cum.map(c => c * (1 + FREUNDIN_ZUSCHLAG)); }
  const k = rtFactor(), raw = cum[cum.length - 1], kwh = raw * k, km = d0, socAt = (c) => o.soc - c * k / cap * 100;
  let up = 0, dn = 0; for (let i = 1; i < h.length; i++) { const d = h[i] - h[i - 1]; if (d > 0) up += d; else dn -= d; }
  return { km, dur: durDrive, tEnd: t, raw, k, kwh, k100: kwh / km * 100, raw100: raw / km * 100, E: Object.fromEntries(Object.entries(E).map(([a, v]) => [a, v * k])), soc: cum.map(socAt),
    pts, dkm, tt, cumK: cum.map(c => c * k), fog: fogE.reduce((a, x) => a + (x || 0), 0) * k * (o.pers >= 2 ? 1 + FREUNDIN_ZUSCHLAG : 1), socA: socAt(raw), turn: turn ? { i: turn.i, soc: socAt(cum[turn.i]), t: turn.t, km: legs[0].route.km } : null, up: Math.round(up), dn: Math.round(dn), tMin: Math.min(...Ts), tMax: Math.max(...Ts), tAvg: Ts.reduce((a, x) => a + x, 0) / Ts.length, rainKm, hw: hwSum / (km * 1000), noWx, noH: legs.some(l => l.route.noH), h };
}
function rtSvg(r) {
  const W = 312, H = 104, B = 4, n = r.h.length, X = (i) => i / (n - 1) * W;
  let y0 = Math.min(...r.h), y1 = Math.max(...r.h); const pad = Math.max(15, (y1 - y0) * 0.2); y0 -= pad; y1 += pad;
  const Yh = (v) => B + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 2 * B), Ys = (v) => B + (1 - (Math.max(-5, Math.min(100, v)) - 0) / 100) * (H - 2 * B);
  const ln = r.h.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yh(v).toFixed(1)).join(' '), sl = r.soc.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Ys(v).toFixed(1)).join(' ');
  const res = Ys(WXO_RES), last = r.soc[r.soc.length - 1], tx = r.turn ? X(r.turn.i) : null, SS = r.stops || [];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mt-2 w-full" style="height:${H}px" aria-hidden="true"><defs><linearGradient id="rtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64748b" stop-opacity=".5"/><stop offset="1" stop-color="#64748b" stop-opacity=".05"/></linearGradient></defs>`
    + `<path d="${ln} L${W} ${H} L0 ${H} Z" fill="url(#rtg)"/><path d="${ln}" fill="none" stroke="#94a3b8" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`
    + `<line x1="0" x2="${W}" y1="${res.toFixed(1)}" y2="${res.toFixed(1)}" stroke="#f87171" stroke-dasharray="3 4" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    + (tx != null ? `<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="0" y2="${H}" stroke="#f472b6" stroke-dasharray="2 3" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '')
    + `<path d="${sl}" fill="none" stroke="#34d399" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
    + SS.map(st => `<line x1="${X(st.j).toFixed(1)}" x2="${X(st.j).toFixed(1)}" y1="${Ys(st.sArr).toFixed(1)}" y2="${Ys(st.tgt).toFixed(1)}" stroke="#fbbf24" stroke-width="2.4" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`).join('')
    + `<circle cx="${X(n - 1) - 3}" cy="${Ys(last).toFixed(1)}" r="3.5" fill="${last < WXO_RES ? '#f87171' : '#34d399'}"/></svg>`
    + `<div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400"><span>${Math.round(r.h[0])} m</span>${r.turn ? `<span class="text-pink-400">◆ Ziel ${Math.round(r.turn.soc)} %</span>` : ''}${SS.length === 1 ? `<span class="text-amber-500">⚡ ${Math.round(SS[0].sArr)} → ${SS[0].tgt} %</span>` : SS.length ? `<span class="text-amber-500">⚡ ${SS.length} Stopps</span>` : ''}<span class="text-red-400">${WXO_RES} % Reserve</span><span>${Math.round(r.h[n - 1])} m</span></div>`;
}
function rtRenderRes() {
  const el = $('rt-res'), ab = $('rt-abrp'); if (!el) return; const r = RT.res;
  ab.classList.toggle('hidden', !r || RT.busy);
  if (RT.busy) { el.innerHTML = '<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 text-sm text-slate-500 dark:text-slate-400 text-left">Route, Höhen und Wetter werden geladen …</div>'; return; }
  if (RT.err) { el.innerHTML = `<div class="rounded-3xl bg-white dark:bg-slate-900 shadow-sm p-4 text-sm text-red-600 dark:text-red-400 text-left">${esc(RT.err)}<button type="button" data-rt="retry" class="mt-1 block text-xs font-semibold text-sky-600 dark:text-sky-300">Erneut versuchen ›</button></div>`; return; }
  if (!r) { el.innerHTML = '<p class="px-1 text-xs text-slate-500 dark:text-slate-400 text-left">Start und Ziel eingeben – die App rechnet mit Route, Höhenprofil, Wetter und Wind zur Abfahrtszeit, kalibriert mit deinen eingetragenen Fahrten.</p>'; return; }
  const eta = new Date(RT.o.dep + r.tEnd * 1000), dur = Math.round(r.dur / 60), lo = r.socA < WXO_RES - 0.5 && !(RT.ch && RT.ch.busy), tw = r.turn;
  const chip = (i, sg, v, t) => `<span class="inline-flex items-center gap-1 whitespace-nowrap rounded-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[12px]" title="${t}"><span aria-hidden="true">${i}</span>${(sg ? (v >= 0 ? '+' : '−') : '') + fmt(Math.abs(v), 1)}</span>`;
  el.innerHTML = `<div class="rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4">
    <div class="flex items-end justify-between gap-3"><div class="min-w-0"><p class="text-[11px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Verbrauch</p><p class="font-barlow text-[40px] font-bold leading-none text-emerald-500 dark:text-emerald-400">${fmt(r.kwh, 1)}<span class="text-lg"> kWh</span></p><p class="mt-0.5 text-xs text-left text-slate-500 dark:text-slate-400">${fmt(r.k100, 1)} kWh/100 km · ${fmt(r.km, 0)} km · ${Math.floor(dur / 60)} h ${pad2(dur % 60)}${r.stops && r.stops.length ? ' inkl. Laden' : ''}</p></div>
      <div class="shrink-0 text-right"><p class="text-[11px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">${tw ? 'Zurück' : 'Ankunft'}</p><p class="font-barlow text-[40px] font-bold leading-none ${lo ? 'text-red-500' : ''}">${r.socA < 0 ? '0' : Math.round(r.socA)}<span class="text-lg"> %</span></p><p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">~ ${hhmm(eta.getTime())} Uhr</p></div></div>
    ${tw ? `<p class="mt-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-left"><span class="text-pink-500">◆</span> Am Ziel ~ ${hhmm(RT.o.dep + tw.t * 1000)} Uhr mit <b>${Math.round(tw.soc)} %</b> · ${fmt(tw.km, 0)} km je Richtung · ohne Laden am Ziel</p>` : ''}
    ${lo ? `<p class="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300 text-left">${(r.stops && r.stops.length ? 'Auch mit Ladestopps knapp' : r.socA < 0 ? 'Reicht nicht ohne Laden' : (tw ? 'Rückkehr' : 'Ankunft') + ' unter ' + WXO_RES + ' %') + (r.stops && r.stops.length ? ' – länger laden oder voller starten.' : ' – Ladestopp siehe unten oder voller starten.')}</p>` : ''}
    ${rtSvg(r)}
    <div class="mt-1 flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span><span class="text-emerald-500">━</span> Akku</span><span>Höhe · ↑ ${r.up} m ↓ ${r.dn} m</span></div>
    <div class="mt-2.5 flex flex-wrap gap-1.5">${chip('🛣️', false, r.E.base, 'Rollen, Luft, Anfahren, Nebenverbraucher – flach, windstill, trocken')}${chip('⛰️', true, r.E.slope, 'Steigungen minus Rekuperation bergab')}${chip('💨', true, r.E.wind, (r.hw > 0.2 ? 'Gegenwind' : r.hw < -0.2 ? 'Rückenwind' : 'Wind') + ' im Schnitt ' + fmt(Math.abs(r.hw) * 3.6, 0) + ' km/h')}${chip('🔥', true, r.E.heat, (r.fog > 0.05 ? 'Heizung/Klima, Freisicht (≈ ' + fmt(r.fog, 1) + ' kWh) und kalter Akku, ' : 'Heizung/Klima und kalter Akku, ') + fmt(r.tMin, 0) + ' bis ' + fmt(r.tMax, 0) + ' °C')}${Math.abs(r.E.rain) >= 0.05 ? chip('🌧️', true, r.E.rain, 'Nässe auf ' + fmt(r.rainKm, 0) + ' km') : ''}</div>
    <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-left">${fmt(r.tAvg, 0)} °C · ${r.hw > 0.2 ? 'Gegenwind' : r.hw < -0.2 ? 'Rückenwind' : 'kaum Wind'}${r.rainKm >= 1 ? ' · Regen' : ''}${r.fog > 0.05 ? ' · Freisicht nötig (feucht)' : ''} · persönlicher Faktor ${fmt(r.k, 2)}${r.noWx ? ' · ⚠️ teils ohne Wettervorhersage (10 °C angenommen)' : ''}${r.noH ? ' · ⚠️ ohne Höhenprofil' : ''}</p></div>`;
  el.innerHTML += rtStopCard() ? '<div class="mt-3">' + rtStopCard() + '</div>' : '';
}
/* ---- Ladestopp: Schnelllader an der Route aus dem Ladesäulenregister der Bundesnetzagentur (ArcGIS-Dienst, CC BY 4.0), Ladezeit aus der eigenen
   DC-Ladekurve (begrenzt durch die Säulenleistung), Preis aus den Ladekarten (passender Betreiber vor günstigster DC-Karte). Ein Stopp; reicht er nicht, Hinweis. ---- */
const RT_ARC = 'https://services-eu1.arcgis.com/TJm8oSvOdJUQvQT5/arcgis/rest/services/Ladesaeulen/FeatureServer/0/query';
const RT_CH = { cache: {}, sort: 'fast', mine: false };
const rtOpName = (s) => String(s || '').replace(/\s+(GmbH|AG|SE|KG|mbH|e\.\s?V\.|Co\.|&|und|GmbH\s*&\s*Co\.?\s*KG)\b.*$/i, '').replace(/\s{2,}/g, ' ').trim();
async function rtArcBox(x0, y0, x1, y1, where) {
  const out = [];
  for (let page = 0; page < 5; page++) {
    const u = RT_ARC + '?where=' + encodeURIComponent(where) + '&geometry=' + [x0, y0, x1, y1].map(v => v.toFixed(4)).join(',') + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2000&resultOffset=' + page * 2000 + '&f=json';
    const r = await fetch(u); if (!r.ok) throw new Error('Ladesäulenregister nicht erreichbar (' + r.status + ')'); const j = await r.json(); if (j.error) throw new Error(j.error.message || 'Abfrage fehlgeschlagen');
    out.push(...(j.features || [])); if (!j.exceededTransferLimit || !(j.features || []).length) break;
  }
  return out;
}
async function rtChargers(r) {
  const key = r.pts.length + ':' + r.pts[0].lat.toFixed(3) + ',' + r.pts[0].lon.toFixed(3) + ':' + r.pts[r.pts.length - 1].lat.toFixed(3) + ',' + r.pts[r.pts.length - 1].lon.toFixed(3) + ':' + Math.round(r.km);
  if (RT_CH.cache[key]) return RT_CH.cache[key];
  const boxes = []; let i0 = 0;
  for (let i = 1; i < r.pts.length; i++) if (r.dkm[i] - r.dkm[i0] >= 40 || i === r.pts.length - 1) { const p = r.pts.slice(i0, i + 1); boxes.push([Math.min(...p.map(q => q.lon)) - 0.045, Math.min(...p.map(q => q.lat)) - 0.03, Math.max(...p.map(q => q.lon)) + 0.045, Math.max(...p.map(q => q.lat)) + 0.03]); i0 = i; }
  let feats;
  try { feats = (await Promise.all(boxes.map(b => rtArcBox(...b, "Typ='Schnellladeeinrichtung'")))).flat(); }
  catch (e) { feats = (await Promise.all(boxes.map(b => rtArcBox(...b, '1=1')))).flat(); }
  const sites = new Map(), seen = new Set();
  feats.forEach(f => { const a = f.attributes || {}, g = f.geometry || {}, fid = a.OBJECTID ?? a.ObjectId ?? a.FID ?? a.ID ?? JSON.stringify(a); if (seen.has(fid)) return; seen.add(fid); lat = Number(g.y ?? a.coordinates_latitude), lon = Number(g.x ?? a.coordinates_longitude); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (a.Status && /außer|stillgelegt|geplant|defekt/i.test(a.Status)) return;
    const plugs = Array.from({ length: 10 }, (_, i) => a['Steckersystem_Ladepunkt' + (i + 1)]).filter(v => typeof v === 'string' && v.trim());
    let n = 0, kw = 0; plugs.forEach(v => { if (!/combo|ccs/i.test(v)) return; n++; for (const m of v.matchAll(/\((\d+(?:[.,]\d+)?)\s*kw\)/gi)) kw = Math.max(kw, Number(m[1].replace(',', '.'))); });
    const st = Number(String(a.max_electric_power_station || '').replace(',', '.'));
    if (!plugs.length && /schnell/i.test(a.Typ || '')) { n = Number(a.Anzahl_Ladepunkte) || 1; kw = st || 50; }
    if (!n) return; if (!kw) kw = st > 0 ? Math.min(st, 350) : 50; if (st > 0 && st < kw) kw = st; if (kw < 50) return;
    const op = rtOpName(a.Betreiber || a.operator_companyName || 'Ladesäule'), k = lat.toFixed(3) + ',' + lon.toFixed(3) + '|' + op.toLowerCase(), cur = sites.get(k);
    if (cur) { cur.n += n; cur.kw = Math.max(cur.kw, kw); }
    else sites.set(k, { id: k, lat, lon, op, place: [a.Ort, [a['Straße'] || a.Strasse, a.Hausnummer].filter(Boolean).join(' ')].filter(Boolean).join(', '), n, kw }); });
  const out = [...sites.values()]; RT_CH.cache[key] = out; return out;
}
function rtSegDist(p, a, b) {                                                   // Abstand Punkt–Strecke in m (lokal eben) und Lage f (0 = a, 1 = b)
  const ky = 111320, kx = 111320 * Math.cos(p.lat * Math.PI / 180), ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const f = L > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0; return { m: Math.hypot(ax + f * dx, ay + f * dy), f };
}
/* Ladezeit-Tabelle je Säulenleistung: M[p] = Minuten von 0 bis p %, aus der neuesten DC-Ladekurve (auf deren gemessene Dauer geeicht), begrenzt durch die Säule.
   Kurve wird einmal je Planung gewählt (rtCurveInit), damit die Tabelle nicht für jeden Rechenschritt neu entsteht. */
let RT_CT = {}, RT_CV = null;
function rtCurveInit() { const cs = getLab().curves.slice().sort((x, y) => String(y.date).localeCompare(String(x.date))); RT_CV = cs.find(x => x.kwh > 0 && x.s1 > x.s0) || null; RT_CT = {}; }
function rtCT(kwCap) {
  const kc = kwCap >= 150 ? 150 : kwCap >= 100 ? 100 : kwCap >= 75 ? 75 : 50; if (RT_CT[kc]) return RT_CT[kc];
  const c = RT_CV, cap = batteryKwh(); let per, pw, k = 1;
  if (c) { per = c.kwh / (c.s1 - c.s0); pw = (p) => cvPow(c, p); let raw = 0; for (let p = c.s0; p < c.s1; p++) raw += per / pw(p + 0.5) * 60; k = c.min > 0 && raw > 0 ? c.min / raw : 1; }
  else { per = cap / 100; pw = (p) => p < 50 ? 95 : p < 80 ? 70 : 30; }
  const M = [0]; for (let p = 0; p < 100; p++) { const w = Math.min(pw(p + 0.5), kc); M.push(M[p] + per / Math.max(3, w) * 60 * (c ? Math.max(c && p >= c.s0 && p < c.s1 ? k : 1, k) : 1)); }
  return (RT_CT[kc] = M);
}
const rtChargeMin = (a, b, kwCap) => { const M = rtCT(kwCap), f = (x) => { x = Math.max(0, Math.min(100, x)); const i = Math.floor(x); return i >= 100 ? M[100] : M[i] + (M[i + 1] - M[i]) * (x - i); }; return Math.max(0, f(b) - f(a)); };
function rtCardFor(op) {
  const cards = getProviders(), o = op.toLowerCase(), own = cards.find(n => { const w = n.toLowerCase().split(/[\s\-–·]+/)[0]; return w.length >= 3 && (o.includes(w) || w.includes(o.split(' ')[0])); });
  const pr = (n) => { try { const p = pvPrices(n); return p.dc || p.hist || null; } catch (e) { return null; } };
  if (own && pr(own)) return { name: own, eur: pr(own), own: true };
  let best = null; cards.forEach(n => { const v = pr(n); if (v && (!best || v < best.eur)) best = { name: n, eur: v, own: false }; }); return best;
}
/* Lage der Lader an der Route (bei Hin & zurück je Weg einmal), nach Position sortiert. Je 4 km Strecke bleiben die 3 besten Lader (Leistung × Ladepunkte, wenig Umweg) –
   in Städten stehen sonst hunderte Säulen im Korridor, die für die Planung nichts bringen. */
function rtPos(r, sites) {
  const last = r.pts.length - 1, ranges = r.turn ? [[1, r.turn.i, 'Hinweg'], [r.turn.i + 1, last - 1, 'Rückweg']] : [[1, last - 1, '']], out = [];
  const lat0 = Math.min(...r.pts.map(p => p.lat)) - 0.04, lat1 = Math.max(...r.pts.map(p => p.lat)) + 0.04;
  sites.forEach(s => { if (s.lat < lat0 || s.lat > lat1) return; ranges.forEach(([i0, i1, leg]) => {
    let j = -1, dm = 1e9; for (let i = i0; i <= i1; i++) { const p = r.pts[i]; if (Math.abs(p.lat - s.lat) > 0.06 && Math.abs(r.pts[i - 1].lat - s.lat) > 0.06) continue; const d = rtSegDist(s, r.pts[i - 1], p); if (d.m < dm) { dm = d.m; j = d.f > 0.5 ? i : i - 1; } }
    if (j < 1 || j >= last || dm > 3000) return; const off = dm / 1000; out.push({ ...s, cid: s.id + '|' + leg, leg, j, off, det: off < 0.4 ? 0 : off * 2 / 40 * 60 + 2 });
  }); });
  const score = (c) => Math.min(c.kw, 150) * Math.min(c.n, 4) - c.det * 40, buckets = new Map();
  out.forEach(c => { const k = c.leg + Math.floor(r.dkm[c.j] / 4); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); });
  const keep = []; buckets.forEach(l => keep.push(...l.sort((a, b) => score(b) - score(a)).slice(0, 3)));
  keep.forEach(c => { c.card = rtCardFor(c.op); });
  return keep.sort((a, b) => a.j - b.j);
}
const RT_MINARR = 7, RT_TGT = [50, 60, 70, 80];
const rtPen = (c) => (c.n <= 1 ? 8 : c.n === 2 ? 3 : 0) + 3;                       // Wartezeit-Risiko bei wenigen Ladepunkten + 3 min je Stopp (Anfahren, Anstecken)
/* Ladeplan rückwärts (dynamische Programmierung): F[k][o] = geringste Kosten bis zum Ziel, wenn man Lader k mit Ladeziel o verlässt.
   Kosten = Ladezeit + Umweg + Zuschläge (schnell) bzw. Euro (günstig). Einmal gerechnet, liefert die Tabelle den Plan und jede Alternative sofort. */
function rtDP(r, pos, by) {
  const cap = batteryKwh(), last = r.pts.length - 1, need = (j) => (r.cumK[last] - r.cumK[j]) / cap * 100, n = pos.length;
  const opts = pos.map(c => { const fin = Math.ceil(need(c.j) + WXO_RES + 1); return (fin <= 90 ? [fin] : []).concat(RT_TGT.filter(t => t < fin)); });
  const w = (c, sA, T) => { const min = rtChargeMin(sA, T, c.kw), eur = c.card ? (T - sA) / 100 * cap / 0.93 * c.card.eur : null; return { min, eur, cost: by === 'cheap' ? (eur ?? 99) + (min + c.det) * 0.02 : min + c.det + rtPen(c) }; };
  const arr = (s, j0, c) => s - (r.cumK[c.j] - r.cumK[j0]) / cap * 100 - c.off * 2 * 0.2 / cap * 100;
  const F = pos.map(() => []), NX = pos.map(() => []);
  const bestFrom = (soc, j0, k0, out) => { let best = Infinity, arg = null;
    for (let m = k0; m < n; m++) { const c = pos[m]; if (c.j <= j0) continue; const sA = arr(soc, j0, c); if (sA < RT_MINARR) break;
      opts[m].forEach((T, oi) => { if (T < sA + 5 || F[m][oi] === Infinity) return; const x = w(c, sA, T), v = x.cost + F[m][oi]; if (out) out.push({ m, oi, sA, x, v }); if (v < best) { best = v; arg = { m, oi, sA, x }; } }); }
    return { best, arg }; };
  for (let k = n - 1; k >= 0; k--) opts[k].forEach((T, oi) => { if (T - need(pos[k].j) >= WXO_RES) { F[k][oi] = 0; NX[k][oi] = null; return; } const b = bestFrom(T, pos[k].j, k + 1); F[k][oi] = b.best; NX[k][oi] = b.arg; });
  const chain = (a) => { const out = []; while (a) { const c = pos[a.m], T = opts[a.m][a.oi]; out.push({ ...c, sArr: a.sA, tgt: T, min: a.x.min, eur: a.x.eur, tot: a.x.min + c.det }); a = NX[a.m][a.oi]; } return out; };
  const idx = new Map(pos.map((c, i) => [c.cid, i]));
  return {
    plan(soc, j0) { if (soc - need(j0) >= WXO_RES) return []; const b = bestFrom(soc, j0, 0); return b.arg ? chain(b.arg) : null; },
    alts(soc, j0) { const all = []; bestFrom(soc, j0, 0, all); const per = new Map(); all.forEach(a => { const o = per.get(a.m); if (!o || a.v < o.v) per.set(a.m, a); }); return [...per.values()].map(a => ({ v: a.v, plan: chain(a) })); },
    idx
  };
}
function rtApplyStops(base, stops) {
  if (!stops || !stops.length) return base; const soc = base.soc.slice(); let add = 0, k = 0, tadd = 0;
  for (let i = 0; i < soc.length; i++) { while (k < stops.length && i > stops[k].j) { add += stops[k].tgt - stops[k].sArr; k++; } soc[i] += add; }
  stops.forEach(s => { s.at = RT.o.dep + (base.tt[s.j] + tadd) * 1000; tadd += s.tot * 60; });
  const tot = stops.reduce((a, s) => a + s.tot, 0), d = stops.reduce((a, s) => a + s.tgt - s.sArr, 0);
  return { ...base, soc, socA: base.socA + d, turn: base.turn ? { ...base.turn, soc: soc[base.turn.i] } : null, stops, tEnd: base.tEnd + tot * 60, dur: base.dur + tot * 60 };
}
async function rtFindStops(n) {
  const b = RT.base; if (!b || Math.min(...b.soc.slice(1)) >= WXO_RES - 0.5) { RT.ch = null; return; }
  RT.ch = { busy: true }; rtRenderRes();
  try { const sites = await rtChargers(b); if (n !== RT.n) return; await new Promise(res => setTimeout(res, 0)); rtCurveInit();
    const pos = rtPos(b, sites), dp = { fast: rtDP(b, pos, 'fast') }, stops = dp.fast.plan(RT.o.soc, 0);
    RT.ch = { pos, dp, none: !stops || !stops.length, sites: sites.length }; RT.res = rtApplyStops(b, stops); }
  catch (e) { if (n !== RT.n) return; RT.ch = { err: (e && e.message) || 'Ladesäulen nicht geladen' }; }
  rtRenderRes();
}
function rtStopCard() {
  const ch = RT.ch; if (!ch) return ''; const box = 'rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4 border border-amber-400/40', r = RT.res, S = (r && r.stops) || [];
  const head = (t, rr) => `<div class="flex items-baseline justify-between gap-2"><p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-600 dark:text-amber-400">⚡ ${t}</p>${rr || ''}</div>`;
  const foot = '<p class="mt-2 text-[10px] text-slate-500 dark:text-slate-400 text-left">Daten: Ladesäulenregister der Bundesnetzagentur (CC BY 4.0)</p>';
  if (ch.busy) return `<div class="${box}">${head('Ladestopp-Vorschlag')}<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400 text-left">Suche Schnelllader an der Route …</p></div>`;
  if (ch.err) return `<div class="${box}">${head('Ladestopp-Vorschlag')}<p class="mt-1.5 text-sm text-red-600 dark:text-red-400 text-left">${esc(ch.err)}</p><button type="button" data-rt="stops" class="mt-1 text-xs font-semibold text-sky-600 dark:text-sky-300">Erneut versuchen ›</button></div>`;
  if (!S.length) return `<div class="${box}">${head('Ladestopp-Vorschlag')}<p class="mt-1.5 text-sm text-slate-600 dark:text-slate-300 text-left">${ch.sites ? 'Mit den Ladern an der Route nicht zu schaffen – die Abstände zwischen den Schnellladern sind zu groß. Voller starten?' : 'Keine Schnelllader (ab 50 kW, CCS) nahe der Route gefunden.'}</p>${foot}</div>`;
  const tile = (l, v, s) => `<div class="min-w-0 flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5"><p class="text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">${l}</p><p class="text-[15px] font-bold whitespace-nowrap">${v}</p>${s ? `<p class="truncate text-[10px] text-slate-500 dark:text-slate-400">${s}</p>` : ''}</div>`;
  const sub = (c) => `${esc(c.place || '')}${c.place ? ' · ' : ''}${c.n}× ${fmt(c.kw, 0)} kW · ${c.off < 0.4 ? 'direkt an der Route' : '+' + Math.round(c.det) + ' min Umweg'}`;
  if (S.length === 1) { const c = S[0];
    return `<div class="${box}">${head('Ladestopp-Vorschlag', `<span class="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">${c.leg ? c.leg + ' · ' : ''}km ${fmt(r.dkm[c.j], 0)} von ${fmt(r.km, 0)}</span>`)}
    <div class="mt-2 flex items-center gap-2.5"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950 text-xl" aria-hidden="true">⚡</span><div class="min-w-0"><p class="truncate text-[15px] font-bold">${esc(c.op)}</p><p class="truncate text-xs text-slate-500 dark:text-slate-400">${sub(c)}</p></div></div>
    <div class="mt-2.5 flex gap-1.5">${tile('Laden', Math.round(c.sArr) + ' → ' + c.tgt + ' %', '~ ' + hhmm(c.at) + ' Uhr')}${tile('Dauer', Math.round(c.min) + ' min', 'Ladekurve')}${tile('Kosten', c.eur != null ? '≈ ' + fmt(c.eur, 2) + ' €' : '–', c.card ? esc(c.card.name) : 'Preis in Ladekarten')}</div>
    <div class="mt-2.5 flex items-center justify-end text-[13px]"><button type="button" data-rtalt="0" class="font-semibold text-sky-600 dark:text-sky-300">Alternativen ›</button></div>${foot}</div>`; }
  const tm = S.reduce((a, c) => a + c.tot, 0), eu = S.every(c => c.eur != null) ? S.reduce((a, c) => a + c.eur, 0) : null;
  return `<div class="${box}">${head('Ladeplan · ' + S.length + ' Stopps', `<span class="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">${Math.round(tm)} min${eu != null ? ' · ≈ ' + fmt(eu, 2) + ' €' : ''}</span>`)}
    ${S.map((c, i) => `<div class="mt-2.5 flex items-start gap-2.5 ${i ? 'border-t border-slate-100 dark:border-slate-800 pt-2.5' : ''}"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950 text-sm font-bold text-amber-700 dark:text-amber-300">${i + 1}</span>
      <div class="min-w-0 flex-1"><div class="flex items-baseline justify-between gap-2"><p class="truncate text-[14px] font-bold">${esc(c.op)}</p><span class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">${c.leg ? c.leg + ' · ' : ''}km ${fmt(r.dkm[c.j], 0)} · ${hhmm(c.at)}</span></div><p class="truncate text-[11px] text-slate-500 dark:text-slate-400">${sub(c)}</p>
      <div class="mt-1 flex items-center justify-between gap-2 text-[12.5px]"><span class="whitespace-nowrap"><b>${Math.round(c.sArr)} → ${c.tgt} %</b> · ${Math.round(c.min)} min${c.eur != null ? ' · ≈ ' + fmt(c.eur, 2) + ' €' : ''}</span><button type="button" data-rtalt="${i}" class="shrink-0 font-semibold text-sky-600 dark:text-sky-300">Ändern ›</button></div></div></div>`).join('')}${foot}</div>`;
}
/* Alternativen für Stopp k: frühere Stopps bleiben, für jeden möglichen Lader wird der Rest neu geplant */
function rtAltList(k) {
  const b = RT.base, S = RT.res.stops || [], pre = S.slice(0, k), st = pre.length ? { j: pre[pre.length - 1].j, soc: pre[pre.length - 1].tgt } : { j: 0, soc: RT.o.soc };
  const by = RT_CH.sort, dp = RT.ch.dp[by] || (RT.ch.dp[by] = rtDP(b, RT.ch.pos, by));
  const out = dp.alts(st.soc, st.j).map(a => { const plan = pre.concat(a.plan); return { c: a.plan[0], plan, tot: plan.reduce((x, y) => x + y.tot, 0), eur: plan.every(x => x.eur != null) ? plan.reduce((x, y) => x + y.eur, 0) : null }; });
  return out.sort((a, b2) => by === 'cheap' ? ((a.eur ?? 1e9) - (b2.eur ?? 1e9)) || a.tot - b2.tot : (a.tot + a.plan.reduce((x, y) => x + rtPen(y), 0)) - (b2.tot + b2.plan.reduce((x, y) => x + rtPen(y), 0)) || (a.eur ?? 1e9) - (b2.eur ?? 1e9)).slice(0, 40);
}
function rtAltSheet() {
  const ch = RT.ch; if (!ch || !ch.pos) return; const box = $('au-sheet-box'), k = RT.altK || 0, multi = (RT.res.stops || []).length > 1;
  let list = rtAltList(k); if (RT_CH.mine) list = list.filter(x => x.c.card && x.c.card.own); RT.altList = list;
  const chip = (key, l, on) => `<button type="button" data-rta="${key}" class="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${l}</button>`;
  const pill = (t, warn) => `<span class="whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] ${warn ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800'}">${t}</span>`;
  const row = (x, i) => { const c = x.c, on = c.cid === RT.altSel, more = x.plan.length - k - 1;
    return `<button type="button" data-rtc="${i}" class="flex w-full items-center gap-3 border-t border-slate-100 dark:border-slate-800 py-2.5 text-left first:border-t-0"><span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-emerald-500' : 'border-slate-400 dark:border-slate-600'}">${on ? '<span class="h-2 w-2 rounded-full bg-emerald-500"></span>' : ''}</span>
      <span class="min-w-0 flex-1"><span class="flex items-baseline justify-between gap-2"><b class="truncate text-[14px]">${esc(c.op)}${c.place ? ' <span class="font-normal text-slate-500 dark:text-slate-400">· ' + esc(c.place.split(',')[0]) + '</span>' : ''}</b><b class="shrink-0 text-[13px]">${c.eur != null ? fmt(c.eur, 2) + ' €' : '–'}</b></span>
      <span class="block text-[11px] text-slate-500 dark:text-slate-400">${c.leg ? c.leg + ' · ' : ''}km ${fmt(RT.base.dkm[c.j], 0)} · Ankunft mit ${Math.round(c.sArr)} % · bis ${c.tgt} %</span>
      <span class="mt-1 flex flex-wrap gap-1">${pill(c.n + '× ' + fmt(c.kw, 0) + ' kW')}${pill(Math.round(c.min) + ' min')}${pill(c.off < 0.4 ? 'an der Route' : '+' + Math.round(c.det) + ' min Umweg')}${more > 0 ? pill('danach ' + more + ' weitere' + (more > 1 ? ' Stopps' : 'r Stopp') + ' · gesamt ' + Math.round(x.tot) + ' min') : multi ? pill('kein weiterer Stopp nötig') : ''}${c.card && !c.card.own ? pill('Preis: ' + esc(c.card.name), true) : ''}${!c.card ? pill('kein Preis', true) : ''}${c.n <= 2 ? pill('nur ' + c.n + ' Ladepunkt' + (c.n > 1 ? 'e' : ''), true) : ''}</span></span></button>`; };
  box.innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div>
    <div class="flex items-start justify-between gap-2"><div><p class="text-lg font-bold">${multi ? 'Wo laden? · Stopp ' + (k + 1) : 'Wo laden?'}</p><p class="text-xs text-slate-500 dark:text-slate-400 text-left">ab 50 kW · CCS · bis 3 km neben der Route${multi ? ' · spätere Stopps werden neu geplant' : ''}</p></div><button type="button" data-rta="close" aria-label="Schließen" class="px-1 text-xl text-slate-400">✕</button></div>
    <div class="flex gap-1.5 overflow-x-auto">${chip('fast', 'Schnellste Ankunft', RT_CH.sort === 'fast')}${chip('cheap', 'Günstigste', RT_CH.sort === 'cheap')}${chip('mine', 'Meine Karten', RT_CH.mine)}</div>
    <div class="max-h-[52vh] overflow-y-auto">${list.length ? list.map(row).join('') : '<p class="py-3 text-sm text-slate-500 dark:text-slate-400 text-left">Kein passender Lader.</p>'}</div>
    <p class="text-[10px] text-slate-500 dark:text-slate-400 text-left">Daten: Ladesäulenregister der Bundesnetzagentur (CC BY 4.0) · Preise aus deinen Ladekarten · Ladezeit aus deiner DC-Ladekurve</p>
    <button type="button" data-rta="take" class="h-12 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white active:scale-95 transition">Diesen Stopp übernehmen</button>`;
  box.dataset.rtid = ''; $('au-sheet').classList.remove('hidden');
}
$('au-sheet').addEventListener('click', (e) => {
  const c = e.target.closest('[data-rtc]'), a = e.target.closest('[data-rta]'); if (!c && !a) return;
  if (c) { const x = RT.altList[Number(c.dataset.rtc)]; if (x) { RT.altSel = x.c.cid; RT.altPlan = x.plan; } rtAltSheetMark(); return; }
  const k = a.dataset.rta;
  if (k === 'close') { $('au-sheet').classList.add('hidden'); return; }
  if (k === 'fast' || k === 'cheap') { RT_CH.sort = k; rtAltSheet(); return; }
  if (k === 'mine') { RT_CH.mine = !RT_CH.mine; rtAltSheet(); return; }
  if (k === 'take') { if (RT.altPlan) { RT.res = rtApplyStops(RT.base, RT.altPlan.map(s => ({ ...s }))); rtRenderRes(); } $('au-sheet').classList.add('hidden'); }
});
function rtAltSheetMark() { document.querySelectorAll('#au-sheet-box [data-rtc]').forEach(b => { const x = RT.altList[Number(b.dataset.rtc)], on = x && x.c.cid === RT.altSel, dot = b.firstElementChild; dot.className = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ' + (on ? 'border-emerald-500' : 'border-slate-400 dark:border-slate-600'); dot.innerHTML = on ? '<span class="h-2 w-2 rounded-full bg-emerald-500"></span>' : ''; }); }
function rtParams() {
  const dv = $('rt-dep').value, dep = dv ? new Date(dv).getTime() : Date.now(), soc = Math.max(1, Math.min(100, Number($('rt-soc').value) || 80));
  return { dep: isNaN(dep) ? Date.now() : dep, soc, pers: Number($('rt-pers').value) || 1, tempo: Number($('rt-tempo').value) || 0, vab: Number($('rt-vab').value) || 120, round: RT.round, stay: Number($('rt-stay').value) || 3 };
}
async function rtRun() {
  const n = ++RT.n; $('rt-save-msg').classList.add('hidden');
  if (!RT.a || !RT.b) { RT.res = null; RT.err = ''; RT.busy = false; rtRenderRes(); return; }
  RT.busy = true; RT.err = ''; rtRenderRes(); const o = rtParams();
  try { const pairs = o.round ? [[RT.a, RT.b], [RT.b, RT.a]] : [[RT.a, RT.b]], legs = [];
    for (const [x, y] of pairs) { const route = await rtRoute(x, y, RT.v); let wx = null; try { wx = await rtWeather(route, o.dep); } catch (e) { } legs.push({ route, wx }); }
    if (n !== RT.n) return; RT.o = o; RT.res = RT.base = rtCalc(legs, o); RT.ch = null; }
  catch (e) { if (n !== RT.n) return; RT.res = null; RT.err = 'Prognose nicht möglich: ' + ((e && e.message) || 'kein Internet?'); }
  RT.busy = false; rtRenderRes(); if (RT.res) rtFindStops(n);
  try { const pk = (p) => p ? { label: p.label, lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 } : null;   // Planung geräteübergreifend (Einstellungen → Cloud)
    const v = { a: pk(RT.a), b: pk(RT.b), v: pk(RT.v), pers: o.pers, tempo: o.tempo, vab: o.vab, round: !!o.round, stay: o.stay, soc: o.soc, dep: new Date(o.dep).toISOString(), at: new Date().toISOString() }, cur = getSettings().rtLast;
    const same = cur && JSON.stringify({ ...cur, at: 0 }) === JSON.stringify({ ...v, at: 0 }); save(KEY_RT, v); if (!same) { setQuickSetting('rtLast', v); pushRoutes(); } } catch (e) { }
}
function rtSugHide(w) { const el = $('rt-sug-' + w); el.innerHTML = ''; el.classList.add('hidden'); }
function rtSugShow(w, list, more) {
  const el = $('rt-sug-' + w); RT.sug[w] = list;
  el.innerHTML = list.map((x, i) => `<button type="button" data-rtsug="${w}:${i}" class="block w-full px-3 py-2 text-left active:bg-slate-100 dark:active:bg-slate-800"><span class="block truncate text-sm">${esc(x.label)}</span>${x.sub ? `<span class="block truncate text-[11px] text-slate-500 dark:text-slate-400">${esc(x.sub)}</span>` : ''}</button>`).join('')
    + (more ? `<p class="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 text-left">${more}</p>` : '');
  el.classList.toggle('hidden', !list.length && !more);
}
function rtSuggest(w) {
  clearTimeout(RT.sugT); const t = $('rt-' + w).value.trim(); RT[w] = null;
  const tl = t.toLowerCase(), own = getTPlaces().filter(p => p.name && Number.isFinite(p.lat) && (!tl || p.name.toLowerCase().includes(tl))).slice(0, 4).map(p => ({ lat: p.lat, lon: p.lon, label: p.name, sub: 'Gespeicherter Ort' }));
  if (t.length < 2) { rtSugShow(w, own, ''); return; }
  rtSugShow(w, own, 'Suche …'); const n = ++RT.sugN;
  RT.sugT = setTimeout(async () => { try { const res = await hpSearch(t); if (n === RT.sugN) rtSugShow(w, own.concat(res), res.length || own.length ? '' : 'Nichts gefunden'); } catch (e) { if (n === RT.sugN) rtSugShow(w, own, 'Ortssuche nicht erreichbar'); } }, 350);
}
function rtPick(w, p) { RT[w] = p; $('rt-' + w).value = p.label; rtSugHide(w); RT.sugN++; rtRun(); }
function rtViaUi() { const on = !!(RT.v || RT.vOpen); $('rt-v-w').classList.toggle('hidden', !on); $('rt-v-add').classList.toggle('hidden', on); $('rt-v').value = RT.v ? RT.v.label : $('rt-v').value; }
$('rt-v-add').addEventListener('click', () => { RT.vOpen = true; rtViaUi(); $('rt-v').focus(); });
$('rt-v-x').addEventListener('click', () => { const had = !!RT.v; RT.v = null; RT.vOpen = false; $('rt-v').value = ''; rtSugHide('v'); rtViaUi(); if (had) rtRun(); });
['a', 'b', 'v'].forEach(w => {
  const inp = $('rt-' + w);
  inp.addEventListener('input', () => rtSuggest(w)); inp.addEventListener('focus', () => { inp.select(); rtSuggest(w); });
  inp.addEventListener('blur', () => setTimeout(async () => { rtSugHide(w); const t = inp.value.trim(); if (RT[w] || !t) return; try { rtPick(w, await hpResolve(t)); } catch (e) { RT.err = (e && e.message) || 'Ort nicht gefunden'; RT.res = null; rtRenderRes(); } }, 200));
  $('rt-sug-' + w).addEventListener('mousedown', (e) => e.preventDefault());
  $('rt-sug-' + w).addEventListener('click', (e) => { const b = e.target.closest('[data-rtsug]'); if (!b) return; const [ww, i] = b.dataset.rtsug.split(':'); const p = RT.sug[ww] && RT.sug[ww][Number(i)]; if (p) rtPick(ww, p); });
});
$('rt-swap').addEventListener('click', () => { [RT.a, RT.b] = [RT.b, RT.a]; $('rt-a').value = RT.a ? RT.a.label : ''; $('rt-b').value = RT.b ? RT.b.label : ''; rtRun(); });
['rt-dep', 'rt-pers', 'rt-tempo', 'rt-vab'].forEach(id => $(id).addEventListener('change', rtRun));
let rtStayLast = '3';
$('rt-stay').addEventListener('change', (e) => { if (e.target.value === 'off') { e.target.value = rtStayLast; RT.round = false; rtRoundUi(); } else rtStayLast = e.target.value; rtRun(); });   // „nur hin“ schaltet Hin & zurück aus
function rtRoundUi() { const b = $('rt-rt'), on = !!RT.round; b.setAttribute('aria-pressed', String(on)); ['bg-pink-100', 'text-pink-700', 'dark:bg-pink-950', 'dark:text-pink-300'].forEach(c => b.classList.toggle(c, on)); ['bg-slate-100', 'dark:bg-slate-800'].forEach(c => b.classList.toggle(c, !on)); b.classList.toggle('hidden', on); $('rt-stay-w').classList.toggle('hidden', !on); $('rt-stay-w').classList.toggle('flex', on); }
$('rt-rt').addEventListener('click', () => { RT.round = !RT.round; rtRoundUi(); rtRun(); });
$('rt-soc').addEventListener('change', rtRun);
$('rt-soc-full').addEventListener('click', (e) => { e.preventDefault(); $('rt-soc').value = '100'; rtRun(); });   // Tipp aufs Batterie-Symbol: voller Akku
$('rt-res').addEventListener('click', (e) => { if (e.target.closest('[data-rt="retry"]')) rtRun(); if (e.target.closest('[data-rt="stops"]')) rtFindStops(RT.n); const al = e.target.closest('[data-rtalt]'); if (al) { RT.altK = Number(al.dataset.rtalt); const cur = (RT.res.stops || [])[RT.altK]; RT.altSel = cur ? cur.cid : null; RT.altPlan = RT.res.stops; rtAltSheet(); } });
$('rt-save').addEventListener('click', () => {
  const r = RT.res, o = RT.o; if (!r) return; const cap = batteryKwh(), k = deDec($('rt-abrp-k').value), s = deDec($('rt-abrp-s').value), msg = $('rt-save-msg');
  if (k !== undefined && !(k > 3 && k < 60)) { msg.textContent = 'ABRP-Verbrauch bitte in kWh/100 km (z. B. 19,1).'; msg.className = 'mt-1.5 text-xs text-left text-red-600 dark:text-red-400'; return; }
  if (s !== undefined && !(s >= -20 && s < o.soc)) { msg.textContent = 'ABRP-Ankunft bitte in % und kleiner als der Start-Akku.'; msg.className = 'mt-1.5 text-xs text-left text-red-600 dark:text-red-400'; return; }
  const en = { id: labId(), dep: new Date(o.dep).toISOString(), a: { label: RT.a.label, lat: RT.a.lat, lon: RT.a.lon }, b: { label: RT.b.label, lat: RT.b.lat, lon: RT.b.lon }, ...(RT.v ? { v: { label: RT.v.label, lat: RT.v.lat, lon: RT.v.lon } } : {}), km: Math.round(r.km * 10) / 10,
    k100: Math.round(r.k100 * 100) / 100, raw100: Math.round(r.raw100 * 100) / 100, kwh: Math.round(r.kwh * 10) / 10, soc0: o.soc, socA: Math.round(r.socA), k: r.k, pers: o.pers, tempo: o.tempo, vab: o.vab, tAvg: Math.round(r.tAvg * 10) / 10 }; if (o.round) { en.round = true; en.stay = o.stay; } if (r.stops && r.stops.length) en.stop = r.stops.map(x => ({ op: x.op, km: Math.round(r.dkm[x.j]), from: Math.round(x.sArr), to: x.tgt }));
  if (k !== undefined) en.abrp = k; else if (s !== undefined) { en.abrpSoc = s; en.abrp = Math.round((o.soc - s) / 100 * cap / r.km * 100 * 100) / 100; }
  const lab = getLab(); lab.fc = (lab.fc || []).concat(en); setLab(lab); $('rt-abrp-k').value = ''; $('rt-abrp-s').value = '';
  msg.textContent = '✓ Gemerkt – nach der Fahrt unter „Abgleich“ den echten Verbrauch eintragen.'; msg.className = 'mt-1.5 text-xs text-left text-emerald-600 dark:text-emerald-400'; rtTabs();
});
function rtTabs() {
  const n = getLab().fc.length;
  $('rt-tabs').innerHTML = [['plan', 'Prognose'], ['cmp', 'Abgleich' + (n ? ' (' + n + ')' : '')]].map(([k, l]) => `<button type="button" data-rttab="${k}" class="flex-1 py-1.5 rounded-lg text-[13px] font-medium ${RT.tab === k ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-600 dark:text-slate-400'}">${l}</button>`).join('');
  $('rt-plan').classList.toggle('hidden', RT.tab !== 'plan'); $('rt-cmp').classList.toggle('hidden', RT.tab !== 'cmp'); if (RT.tab === 'cmp') rtRenderCmp();
}
$('rt-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-rttab]'); if (!b) return; RT.tab = b.dataset.rttab; rtTabs(); });
function rtStats(list) {
  const done = list.filter(x => x.real > 0), both = done.filter(x => x.abrp > 0);
  const avg = (l, f) => l.length ? l.reduce((s, x) => s + Math.abs(rtDev(f(x), x.real)), 0) / l.length : null;
  let wa = 0, wb = 0; both.forEach(x => { const a = Math.abs(x.k100 - x.real), b = Math.abs(x.abrp - x.real); if (a < b) wa++; else if (b < a) wb++; });
  return { done, both, app: avg(done, x => x.k100), appB: avg(both, x => x.k100), abrp: avg(both, x => x.abrp), wa, wb };
}
function rtRenderCmp() {
  const el = $('rt-cmp'), list = getLab().fc.slice().sort((a, b) => Date.parse(b.dep) - Date.parse(a.dep)), st = rtStats(list), k = rtFactor();
  const card = 'rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm';
  if (!list.length) { el.innerHTML = `<div class="${card} p-4 text-sm text-slate-600 dark:text-slate-300 text-left">Noch keine gemerkten Fahrten. Unter „Prognose“ eine Strecke berechnen, optional den ABRP-Wert eintragen und „Fahrt merken“ tippen. Nach der Fahrt hier den echten Verbrauch vom Bordcomputer eintragen.</div>`; return; }
  const tot = st.wa + st.wb, pa = tot ? st.wa / tot * 100 : 50;
  const head = `<div class="${card} p-4"><div class="flex items-baseline justify-between gap-2"><p class="text-[11px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Wer liegt näher dran?</p><span class="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">${st.done.length} ${st.done.length === 1 ? 'Fahrt' : 'Fahrten'}${st.both.length ? ' · ' + st.both.length + ' mit ABRP' : ''}</span></div>
    ${st.done.length ? `<div class="mt-2 flex items-center gap-3"><div class="flex-1"><p class="font-barlow text-[30px] font-bold leading-none text-emerald-500 dark:text-emerald-400">${fmt(st.app, 1)} %</p><p class="text-[11px] text-slate-500 dark:text-slate-400">Ø Abweichung App</p></div><span class="font-barlow text-lg font-bold text-slate-400 dark:text-slate-600">vs</span><div class="flex-1 text-right"><p class="font-barlow text-[30px] font-bold leading-none text-violet-500 dark:text-violet-400">${st.abrp == null ? '–' : fmt(st.abrp, 1) + ' %'}</p><p class="text-[11px] text-slate-500 dark:text-slate-400">Ø Abweichung ABRP</p></div></div>
    ${st.both.length ? `<div class="mt-2 flex h-2 overflow-hidden rounded-full"><span style="width:${pa}%" class="bg-emerald-500"></span><span style="width:${100 - pa}%" class="bg-violet-500"></span></div><div class="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400"><span>App näher: ${st.wa}×</span><span>ABRP näher: ${st.wb}×</span></div>${st.appB != null && st.both.length !== st.done.length ? `<p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-left">Nur Fahrten mit ABRP-Wert: App Ø ${fmt(st.appB, 1)} %</p>` : ''}` : ''}`
    : '<p class="mt-2 text-sm text-slate-600 dark:text-slate-300 text-left">Noch kein Realwert eingetragen.</p>'}
    <p class="mt-2.5 border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-500 dark:text-slate-400 text-left">📈 Persönlicher Faktor der App: <b class="text-slate-700 dark:text-slate-200">${fmt(k, 2)}</b> · lernt aus jedem eingetragenen Realwert</p></div>`;
  const pill = 'flex-1 whitespace-nowrap rounded-lg bg-slate-100 dark:bg-slate-800 px-1.5 py-1';
  const row = (x) => { const d = new Date(x.dep), dl = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }), tt = esc(x.a.label + (x.round ? ' ⇄ ' : ' → ') + x.b.label + (x.v ? ' (über ' + x.v.label + ')' : ''));
    if (!(x.real > 0)) return `<button type="button" data-rtrow="${esc(x.id)}" class="flex w-full items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 py-2.5 text-left first:border-t-0"><span class="min-w-0"><span class="block truncate text-[13px]">${tt}</span><span class="block text-[11px] text-slate-500 dark:text-slate-400">${dl} · App ${fmt(x.k100, 1)}${x.abrp ? ' · ABRP ' + fmt(x.abrp, 1) : ''}</span></span><span class="shrink-0 rounded-lg bg-amber-100 dark:bg-amber-950 px-2 py-1 text-[12px] font-semibold text-amber-700 dark:text-amber-300">✍️ Real eintragen</span></button>`;
    const a = Math.abs(x.k100 - x.real), b = x.abrp ? Math.abs(x.abrp - x.real) : null, dot = b == null ? 'bg-slate-400 dark:bg-slate-600' : a < b ? 'bg-emerald-500' : b < a ? 'bg-violet-500' : 'bg-slate-400';
    return `<button type="button" data-rtrow="${esc(x.id)}" class="block w-full border-t border-slate-100 dark:border-slate-800 py-2.5 text-left first:border-t-0"><span class="flex items-center justify-between gap-2"><span class="min-w-0"><span class="block truncate text-[13px]">${tt}</span><span class="block text-[11px] text-slate-500 dark:text-slate-400">${dl} · ${fmt(x.km, 0)} km</span></span><span class="h-2.5 w-2.5 shrink-0 rounded-full ${dot}"></span></span>
      <span class="mt-1.5 flex gap-1.5 text-[11.5px] tabular-nums"><span class="${pill}"><span class="text-emerald-600 dark:text-emerald-400">App</span> ${fmt(x.k100, 1)} <span class="text-slate-500 dark:text-slate-400">${rtFmtP(rtDev(x.k100, x.real))}</span></span><span class="${pill}"><span class="text-violet-600 dark:text-violet-400">ABRP</span> ${x.abrp ? fmt(x.abrp, 1) + ' <span class="text-slate-500 dark:text-slate-400">' + rtFmtP(rtDev(x.abrp, x.real)) + '</span>' : '–'}</span><span class="${pill} !flex-[0.8]"><span class="text-amber-600 dark:text-amber-400">Real</span> <b>${fmt(x.real, 1)}</b></span></span></button>`; };
  el.innerHTML = head + `<div class="${card} px-4 py-1.5">${list.map(row).join('')}</div>`;
}
$('rt-cmp').addEventListener('click', (e) => { const b = e.target.closest('[data-rtrow]'); if (b) rtSheet(b.dataset.rtrow); });
function rtSheet(id) {
  const x = getLab().fc.find(e => e.id === id); if (!x) return; const box = $('au-sheet-box'), d = new Date(x.dep);
  const inp = (fid, val, unit, ph, cls = '') => `<label class="flex min-w-0 flex-1 items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 ${cls}"><input id="${fid}" type="text" inputmode="decimal" autocomplete="off" value="${val == null ? '' : String(val).replace('.', ',')}" placeholder="${ph}" class="w-full min-w-0 bg-transparent text-base focus:outline-none"><span class="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">${unit}</span></label>`;
  const tile = (l, c, v, extra = '') => `<div class="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-800 px-3 py-2 ${extra}"><p class="text-[10.5px] font-semibold uppercase tracking-[0.06em] ${c}">${l}</p><p class="font-barlow text-[26px] font-bold leading-none" data-rtv="${l}">${v}</p></div>`;
  box.innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div>
    <div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="text-lg font-bold">Wie war die Fahrt?</p><p class="truncate text-xs text-slate-500 dark:text-slate-400">${esc(x.a.label)} ${x.round ? '⇄' : '→'} ${esc(x.b.label)} · ${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${fmt(x.km, 0)} km</p></div><button type="button" data-rts="close" aria-label="Schließen" class="px-1 text-xl text-slate-400">✕</button></div>
    <div class="flex gap-2">${tile('App', 'text-emerald-600 dark:text-emerald-400', fmt(x.k100, 1))}${tile('ABRP', 'text-violet-600 dark:text-violet-400', x.abrp ? fmt(x.abrp, 1) : '–')}${tile('Real', 'text-amber-600 dark:text-amber-400', x.real ? fmt(x.real, 1) : '–', 'ring-2 ring-amber-400')}</div>
    <div><p class="text-sm font-semibold">Echter Verbrauch</p><p class="text-xs text-slate-500 dark:text-slate-400 text-left">${x.round ? 'Hin- und Rückfahrt zusammen – am einfachsten den Akkustand bei Rückkehr eintragen („Seit Start“ setzt sich beim Parken zurück)' : 'Bordcomputer → „Seit Start“, nach Ankunft ablesen – oder den Akkustand bei Ankunft'}</p>
      <div class="mt-1.5 flex gap-2">${inp('rts-real', x.real, 'kWh/100 km', 'z. B. 18,9', 'ring-2 ring-emerald-500')}${x.stop ? '' : inp('rts-soc', x.realSoc, x.round ? '% zurück' : '% Ankunft', '–')}</div></div>
    <div><p class="text-sm font-semibold">ABRP-Prognose</p>${x.stop ? '' : `<p class="text-xs text-slate-500 dark:text-slate-400 text-left">Akkustand bei Ankunft laut ABRP – oder den Verbrauch, falls bekannt</p>`}<div class="mt-1.5 flex gap-2">${inp('rts-abrp', x.abrp, 'kWh/100 km', 'optional')}${x.stop ? '' : inp('rts-abrps', x.abrpSoc, x.round ? '% zurück' : '% Ankunft', '–')}</div></div>
    <div id="rts-prev" class="rounded-2xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-[13px] text-left"></div>
    <p id="rts-msg" class="hidden text-xs text-left text-red-600 dark:text-red-400"></p>
    <button type="button" data-rts="save" class="h-12 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white active:scale-95 transition">Speichern</button>
    <button type="button" data-rts="del" class="w-full py-1 text-xs font-semibold text-red-600 dark:text-red-400">Gemerkte Fahrt löschen</button>`;
  box.dataset.rtid = id; $('au-sheet').classList.remove('hidden'); rtSheetPrev();
  ['rts-real', 'rts-soc', 'rts-abrp'].forEach(f => $(f) && $(f).addEventListener('input', rtSheetPrev));
  if ($('rts-abrps')) $('rts-abrps').addEventListener('input', () => { const v = deDec($('rts-abrps').value); if (v !== undefined && v < x.soc0) $('rts-abrp').value = String(Math.round((x.soc0 - v) / 100 * batteryKwh() / x.km * 100 * 10) / 10).replace('.', ','); rtSheetPrev(); });   // ABRP-Ankunft % → kWh/100 km
  if ($('rts-abrp') && $('rts-abrps')) $('rts-abrp').addEventListener('input', () => { $('rts-abrps').value = ''; });
}
function rtSheetVals() {
  const x = getLab().fc.find(e => e.id === $('au-sheet-box').dataset.rtid); if (!x) return null; const cap = batteryKwh();
  const real = deDec($('rts-real').value), soc = $('rts-soc') ? deDec($('rts-soc').value) : undefined, abrp = deDec($('rts-abrp').value), abrpSoc = $('rts-abrps') ? deDec($('rts-abrps').value) : undefined;
  const r = real !== undefined ? real : soc !== undefined && soc < x.soc0 ? Math.round((x.soc0 - soc) / 100 * cap / x.km * 100 * 100) / 100 : undefined;
  return { x, real: r, soc, abrp, abrpSoc, rawReal: real };
}
function rtSheetPrev() {
  const v = rtSheetVals(); if (!v) return; const { x, real, abrp } = v, el = $('rts-prev'), box = $('au-sheet-box');
  box.querySelector('[data-rtv="Real"]').textContent = real > 0 ? fmt(real, 1) : '–'; box.querySelector('[data-rtv="ABRP"]').textContent = abrp > 0 ? fmt(abrp, 1) : '–';
  if (!(real > 0)) { el.innerHTML = '<span class="text-slate-500 dark:text-slate-400">Echten Verbrauch oder Akku bei Ankunft eintragen – dann siehst du, wer näher lag.</span>'; return; }
  const da = rtDev(x.k100, real), db = abrp > 0 ? rtDev(abrp, real) : null, k0 = rtFactor(x.id), k1 = rtFactor(null, { ...x, real });
  const win = db == null ? '' : Math.abs(da) < Math.abs(db) ? '🏁 Die App lag diesmal näher' : Math.abs(db) < Math.abs(da) ? '🏁 ABRP lag diesmal näher' : '🏁 Gleichstand';
  el.innerHTML = `<div class="flex justify-between gap-2"><span><span class="text-emerald-600 dark:text-emerald-400">App</span> <b>${rtFmtP(da)}</b></span>${db == null ? '' : `<span><span class="text-violet-600 dark:text-violet-400">ABRP</span> <b>${rtFmtP(db)}</b></span>`}</div>
    <p class="mt-1 text-xs text-left text-slate-500 dark:text-slate-400">${win ? win + ' · ' : ''}${Math.abs(k1 - k0) >= 0.005 ? 'persönlicher Faktor ' + fmt(k0, 2) + ' → ' + fmt(k1, 2) : 'persönlicher Faktor bleibt ' + fmt(k1, 2)}</p>`;
}
$('au-sheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rts]'); if (!b) return; const act = b.dataset.rts, id = $('au-sheet-box').dataset.rtid;
  if (act === 'close') { $('au-sheet').classList.add('hidden'); return; }
  if (act === 'del') { const snap = labSnap(), lab = getLab(); lab.fc = lab.fc.filter(x => x.id !== id); setLab(lab); $('au-sheet').classList.add('hidden'); rtTabs(); labUndo('Gemerkte Fahrt gelöscht', snap); return; }
  const v = rtSheetVals(); if (!v) return; const msg = $('rts-msg');
  if (v.rawReal !== undefined && !(v.rawReal > 3 && v.rawReal < 60)) { msg.textContent = 'Echten Verbrauch bitte in kWh/100 km eingeben (z. B. 18,9).'; msg.classList.remove('hidden'); return; }
  if (v.soc !== undefined && !(v.soc >= -20 && v.soc < v.x.soc0)) { msg.textContent = 'Akku bei Ankunft muss unter dem Start-Akku (' + v.x.soc0 + ' %) liegen.'; msg.classList.remove('hidden'); return; }
  if (v.abrpSoc !== undefined && !(v.abrpSoc >= -20 && v.abrpSoc < v.x.soc0)) { msg.textContent = 'ABRP-Ankunft muss unter dem Start-Akku (' + v.x.soc0 + ' %) liegen.'; msg.classList.remove('hidden'); return; }
  if (v.abrp !== undefined && !(v.abrp > 3 && v.abrp < 60)) { msg.textContent = 'ABRP-Wert bitte als Akkustand in % oder in kWh/100 km eingeben.'; msg.classList.remove('hidden'); return; }
  const lab = getLab(); lab.fc = lab.fc.map(x => { if (x.id !== id) return x; const n = { ...x }; delete n.real; delete n.realSoc; delete n.abrp;
    if (v.real > 0) n.real = v.real; if (v.soc !== undefined) n.realSoc = v.soc; if (v.abrp > 0) n.abrp = v.abrp; delete n.abrpSoc; if (v.abrp > 0 && v.abrpSoc !== undefined) n.abrpSoc = v.abrpSoc; return n; });
  setLab(lab); $('au-sheet').classList.add('hidden'); rtTabs();
});
/* Planung von einem anderen Gerät übernehmen, wenn hier nichts gerade bearbeitet wird */
function rtCloudPlan() {
  const l = getSettings().rtLast, ae = document.activeElement; if (!l || !l.a || !l.b || (ae && /^rt-/.test(ae.id))) return;
  const same = (p, q) => p && q && Math.abs(p.lat - q.lat) < 1e-4 && Math.abs(p.lon - q.lon) < 1e-4; if (same(RT.a, l.a) && same(RT.b, l.b) && (!!RT.v === !!l.v && (!l.v || same(RT.v, l.v))) && !!RT.round === !!l.round) return;
  RT.a = l.a; RT.b = l.b; RT.v = l.v || null; RT.vOpen = false; rtViaUi(); RT.round = !!l.round; $('rt-a').value = l.a.label; $('rt-b').value = l.b.label; if (l.pers) $('rt-pers').value = String(l.pers); if (l.stay) { $('rt-stay').value = String(l.stay); rtStayLast = $('rt-stay').value; } rtRoundUi(); if (RT.tab === 'plan') rtRun();
}
function rtShow() {
  rtTabs();
  if (!RT.a && !RT.b) { const l = getSettings().rtLast || load(KEY_RT, null) || {}, home = getTPlaces().find(p => p.kind === 'home' && Number.isFinite(p.lat));
    RT.a = l.a || (home ? { lat: home.lat, lon: home.lon, label: home.name } : null); RT.b = l.b || null; RT.v = l.v || null; rtViaUi();
    $('rt-a').value = RT.a ? RT.a.label : ''; $('rt-b').value = RT.b ? RT.b.label : '';
    if (l.pers) $('rt-pers').value = String(l.pers); if (l.dep && Date.parse(l.dep) > Date.now() - 3600e3) { const d = new Date(l.dep); $('rt-dep').value = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); } RT.round = !!l.round; if (l.stay) { $('rt-stay').value = String(l.stay); rtStayLast = $('rt-stay').value; } rtRoundUi(); if (l.tempo != null) $('rt-tempo').value = String(l.tempo); if (l.vab) $('rt-vab').value = String(l.vab); }
  const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  if (!$('rt-dep').value || new Date($('rt-dep').value).getTime() < Date.now() - 3600e3) $('rt-dep').value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  if (!$('rt-soc').value) { $('rt-soc').value = '80'; wxoSoc().then(s => { if (s != null && $('rt-soc').value === '80') { $('rt-soc').value = String(Math.round(s)); if (RT.res || RT.busy) rtRun(); } }).catch(() => { }); }
  if (RT.tab === 'plan') rtRun();
}

/* ---- Push-Benachrichtigung der Eis-Warnung: Gerät anmelden (Push-Adresse in enyaqStrom/<uid>/settings/push), Testnachricht über /api/ice-push ---- */
const VAPID_PUBLIC = 'BHJg47_9-WGwpnQQkZCKyGtmbned4D9fOyJ-EsYRKqD6dizXoA60UIYNjR1_vL-y0yxFN8PAuYsjQhKLEHcC128';
const devId = () => { let id = load('enyaq.devId', null); if (!id) { id = 'd' + labId(); save('enyaq.devId', id); } return id; };
function pushOk() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }   // Funktion (nicht const): wird schon beim Start aus renderReminders aufgerufen
const pushMsg = (t, bad) => { const el = $('ice-push-msg'); if (el) { el.textContent = t || ''; el.classList.toggle('text-red-600', !!bad); el.classList.toggle('dark:text-red-400', !!bad); } };
const b64u = (s) => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function pushState() { if (!pushOk()) return null; try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; } }
async function fillIcePush() {
  try { lowFill(false); pxFill(false); ['set-low-push', 'set-veh-push', 'set-key-push', 'set-mon-push'].forEach(id => { $(id).disabled = !pushOk(); }); } catch (e) { }
  const cb = $('set-ice-push'), cr = $('set-rem-push'); if (!cb) return; if (!pushOk()) { cb.checked = false; cb.disabled = true; if (cr) { cr.checked = false; cr.disabled = true; } pushMsg('Dieser Browser unterstützt keine Push-Nachrichten.'); return; }
  const sub = await pushState(), ok = !!sub && Notification.permission === 'granted'; cb.checked = ok && load('enyaq.icePush', false); if (cr) cr.checked = ok && load('enyaq.remPush', false);
  try { lowFill(ok); pxFill(ok); } catch (e) { }
  if (!$('ice-push-msg').textContent) pushMsg(Notification.permission === 'denied' ? 'Benachrichtigungen sind für diese App blockiert – in den Android-Einstellungen erlauben.' : '');
}
/* Ein Gerät, zwei Arten: Eis-Warnung (ice) und fällige Erinnerungen (rem). Angemeldet, solange eins davon an ist; der Server schickt je Art nur an Geräte mit Häkchen. */
async function pushSave() {
  const f = { ice: !!load('enyaq.icePush', false), rem: !!load('enyaq.remPush', false), low: Number(load('enyaq.lowPush', 0)) || 0,
    veh: !!load('enyaq.vehPush', false), mon: !!load('enyaq.monPush', false), key: load('enyaq.keyPush', null) !== false };   // Schlüssel: fehlt = an
  if (!f.ice && !f.rem && !f.low && !f.veh && !f.mon && load('enyaq.keyPush', null) !== true) { try { await window.cloud.setPush(devId(), null); } catch (e) { } try { const s = await pushState(); if (s) await s.unsubscribe(); } catch (e) { } return; }
  if (!window.cloud?.isSignedIn()) throw new Error('Bitte zuerst bei Google anmelden.');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Benachrichtigungen nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
  await window.cloud.setPush(devId(), { sub: JSON.stringify(sub.toJSON()), at: new Date().toISOString(), ua: (navigator.userAgentData && navigator.userAgentData.platform) || (/(Android|iPhone|Windows|Mac)/.exec(navigator.userAgent) || [''])[0], ice: f.ice, rem: f.rem, low: f.low, veh: f.veh, mon: f.mon, key: f.key });
  if (vehicle && vehicle.ok) authHeaders().then(h => fetch('/api/ice-push', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ low: 'reg' }) })).catch(() => { });   // Konto für den Abendlauf (Auto-Abfrage) freischalten
}
async function pushKind(key, on) { const was = load(key, false); save(key, on); try { await pushSave(); } catch (e) { save(key, was); throw e; } }
const icePushOn = () => pushKind('enyaq.icePush', true), icePushOff = () => pushKind('enyaq.icePush', false).catch(() => { });
/* Schalter + Test für Erinnerungs-Push (Einstellungen › Wetter) */
const remPushMsg = (t, bad) => { const el = $('rem-push-msg'); if (el) { el.textContent = t || ''; el.classList.toggle('text-red-600', !!bad); el.classList.toggle('dark:text-red-400', !!bad); } };
const remPushBoxes = (v) => { if ($('set-rem-push')) $('set-rem-push').checked = v; };
const remPushChange = async (e) => {
  const cb = e.target; cb.disabled = true; remPushBoxes(cb.checked);
  try { remPushMsg(cb.checked ? 'Wird eingerichtet …' : ''); await pushKind('enyaq.remPush', cb.checked); remPushMsg(cb.checked ? '✓ Dieses Gerät meldet fällige Erinnerungen abends am Fälligkeitstag.' : 'Aus für dieses Gerät.'); }
  catch (er) { remPushBoxes(false); remPushMsg((er && er.message) || 'Einrichten fehlgeschlagen.', true); }
  cb.disabled = false;
};
$('set-rem-push').addEventListener('change', remPushChange);
const remTest = async (ev) => {
  const b = ev.currentTarget; b.disabled = true; remPushMsg('Sende …');
  try {
    if (!load('enyaq.remPush', false) || !(await pushState())) { await pushKind('enyaq.remPush', true); remPushBoxes(true); }
    const r = await fetch('/api/ice-push', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ test: 'rem' }) }), j = await r.json().catch(() => ({}));
    if (r.status === 503 && j.error === 'not_configured') remPushMsg('Server noch nicht eingerichtet – in Vercel fehlen: ' + (j.need || []).join(', ') + '.', true);
    else if (r.status === 404) remPushMsg('Kein Gerät angemeldet – Schalter oben einschalten.', true);
    else if (!r.ok) remPushMsg('Fehler: ' + (j.error || r.status), true);
    else remPushMsg(j.ok ? '✓ Gesendet' + (j.real ? ' (mit deinen heute fälligen Erinnerungen)' : ' (Beispiel – heute ist nichts fällig)') + ' – kommt gleich an.' : 'Nicht zugestellt – Gerät bitte neu anmelden (Schalter aus und an).', !j.ok);
  } catch (er) { remPushMsg((er && er.message) || 'Senden fehlgeschlagen.', true); }
  b.disabled = false;
};
$('rem-test').addEventListener('click', remTest);
/* Akku niedrig am Abend (Einstellungen › Fahrzeug und Laden): enyaq.lowPush = Schwelle in % (0 = aus), nur mit verbundenem Fahrzeug */
const lowMsg = (t, bad) => { const el = $('low-push-msg'); if (el) { el.textContent = t || ''; el.classList.toggle('text-red-600', !!bad); el.classList.toggle('dark:text-red-400', !!bad); } };
const lowThr = () => Number($('set-low-thr').value) || 20;
function lowFill(ok) {
  const box = $('low-push-box'); box.classList.toggle('hidden', !(vehicle && vehicle.ok));
  const v = Number(load('enyaq.lowPush', 0)) || 0; $('set-low-push').checked = !!ok && v > 0; $('set-low-thr').value = String(v || load('enyaq.lowThr', 20));
}
async function lowReg() {                                                        // Server merkt sich das Konto, damit der Abend-Lauf den Akku-Stand abfragen darf
  const r = await fetch('/api/ice-push', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ low: 'reg' }) }), j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error('Fahrzeug nicht verbunden – erst unter Konto & Sync verbinden.');
  if (r.status === 503 && j.error === 'not_configured') throw new Error('Server noch nicht eingerichtet – in Vercel fehlen: ' + (j.need || []).join(', ') + '.');
  if (!r.ok) throw new Error('Fehler: ' + (j.error || r.status));
}
$('set-low-push').addEventListener('change', async (e) => {
  const cb = e.target; cb.disabled = true;
  try {
    if (cb.checked) { lowMsg('Wird eingerichtet …'); await lowReg(); await pushKind('enyaq.lowPush', lowThr()); lowMsg('✓ Dieses Gerät erinnert abends, wenn der Akku unter ' + lowThr() + ' % liegt.'); }
    else { await pushKind('enyaq.lowPush', 0).catch(() => { }); lowMsg('Aus für dieses Gerät.'); }
  } catch (er) { cb.checked = false; save('enyaq.lowPush', 0); lowMsg((er && er.message) || 'Einrichten fehlgeschlagen.', true); }
  cb.disabled = false;
});
$('set-low-thr').addEventListener('change', async () => {
  save('enyaq.lowThr', lowThr()); if (!(Number(load('enyaq.lowPush', 0)) > 0)) return;
  try { await pushKind('enyaq.lowPush', lowThr()); lowMsg('✓ Schwelle jetzt ' + lowThr() + ' %.'); } catch (er) { lowMsg((er && er.message) || 'Speichern fehlgeschlagen.', true); }
});
$('low-test').addEventListener('click', async (ev) => {
  const b = ev.currentTarget; b.disabled = true; lowMsg('Sende …');
  try {
    if (!(Number(load('enyaq.lowPush', 0)) > 0) || !(await pushState())) { await lowReg(); await pushKind('enyaq.lowPush', lowThr()); $('set-low-push').checked = true; }
    const r = await fetch('/api/ice-push', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ test: 'low' }) }), j = await r.json().catch(() => ({}));
    if (r.status === 404) lowMsg('Kein Gerät angemeldet – Schalter oben einschalten.', true);
    else if (!r.ok) lowMsg('Fehler: ' + (j.error || r.status), true);
    else lowMsg(j.ok ? '✓ Gesendet' + (j.real ? ' mit dem echten Stand (' + Math.round(j.soc) + ' %' + (j.plugged ? ', angesteckt – abends käme dann nichts' : '') + ')' : ' (Beispiel – Auto gerade nicht erreichbar)') + ' – kommt gleich an.' : 'Nicht zugestellt – Gerät bitte neu anmelden (Schalter aus und an).', !j.ok);
  } catch (er) { lowMsg((er && er.message) || 'Senden fehlgeschlagen.', true); }
  b.disabled = false;
});
/* Weitere Abend-Nachrichten: Auto nicht abgeschlossen (veh), Monatsanfang (mon), Škoda-Schlüssel (key, fehlt = an). Gleiches Muster wie oben. */
const PX = {
  veh: { key: 'enyaq.vehPush', on: '✓ Dieses Gerät warnt abends, wenn das Auto offen ist.', car: true },
  mon: { key: 'enyaq.monPush', on: '✓ Dieses Gerät meldet am Monatsanfang den Monatsbericht.' },
  key: { key: 'enyaq.keyPush', on: '✓ Dieses Gerät erinnert rechtzeitig an den Škoda-Schlüssel.', car: true, def: true }
};
const pxOn = (k) => { const v = load(PX[k].key, null); return PX[k].def ? v !== false : !!v; };
const pxMsg = (k, t, bad) => { const el = $(k + '-push-msg'); if (el) { el.textContent = t || ''; el.classList.toggle('text-red-600', !!bad); el.classList.toggle('dark:text-red-400', !!bad); } };
function pxFill(ok) {
  ['veh', 'key'].forEach(k => $(k + '-push-box').classList.toggle('hidden', !(vehicle && vehicle.ok)));
  Object.keys(PX).forEach(k => { $('set-' + k + '-push').checked = !!ok && pxOn(k); });
}
Object.keys(PX).forEach(k => {
  $('set-' + k + '-push').addEventListener('change', async (e) => {
    const cb = e.target; cb.disabled = true;
    try { pxMsg(k, cb.checked ? 'Wird eingerichtet …' : ''); await pushKind(PX[k].key, cb.checked); pxMsg(k, cb.checked ? PX[k].on : 'Aus für dieses Gerät.'); }
    catch (er) { cb.checked = false; save(PX[k].key, false); pxMsg(k, (er && er.message) || 'Einrichten fehlgeschlagen.', true); }
    cb.disabled = false;
  });
  $(k + '-test').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; pxMsg(k, 'Sende …');
    try {
      if (!(load(PX[k].key, null) === true) || !(await pushState())) { await pushKind(PX[k].key, true); $('set-' + k + '-push').checked = true; }
      if (PX[k].car) await lowReg().catch(() => { });
      const r = await fetch('/api/ice-push', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ test: k }) }), j = await r.json().catch(() => ({}));
      const dd = (x) => x ? x.slice(8, 10) + '.' + x.slice(5, 7) + '.' + x.slice(0, 4) : '';
      if (r.status === 503 && j.error === 'not_configured') pxMsg(k, 'Server noch nicht eingerichtet – in Vercel fehlen: ' + (j.need || []).join(', ') + '.', true);
      else if (r.status === 404) pxMsg(k, 'Kein Gerät angemeldet – Schalter oben einschalten.', true);
      else if (!r.ok) pxMsg(k, 'Fehler: ' + (j.error || r.status), true);
      else if (!j.ok) pxMsg(k, 'Nicht zugestellt – Gerät bitte neu anmelden (Schalter aus und an).', true);
      else pxMsg(k, '✓ Gesendet' + (k === 'veh' ? (j.real ? ' mit dem echten Stand' : j.state ? ' (Beispiel – dein Auto ist gerade ' + j.state + ')' : ' (Beispiel – Auto gerade nicht erreichbar)')
        : k === 'mon' ? (j.real ? ' mit deinem letzten Monat' : ' (Beispiel)') : (j.expires ? ' – dein Schlüssel gilt bis ' + dd(j.expires) : ' (Beispiel – Ablaufdatum unbekannt)')) + ' – kommt gleich an.');
    } catch (er) { pxMsg(k, (er && er.message) || 'Senden fehlgeschlagen.', true); }
    b.disabled = false;
  });
});
$('set-ice-push').addEventListener('change', async (e) => {
  const cb = e.target; cb.disabled = true;
  try { if (cb.checked) { pushMsg('Wird eingerichtet …'); await icePushOn(); pushMsg('✓ Dieses Gerät bekommt die Eis-Warnung abends.'); } else { await icePushOff(); pushMsg('Aus für dieses Gerät.'); } }
  catch (er) { cb.checked = false; save('enyaq.icePush', false); pushMsg((er && er.message) || 'Einrichten fehlgeschlagen.', true); }
  cb.disabled = false;
});
$('ice-test').addEventListener('click', async () => {
  const b = $('ice-test'); b.disabled = true; pushMsg('Sende …');
  try {
    if (!load('enyaq.icePush', false) || !(await pushState())) { await icePushOn(); $('set-ice-push').checked = true; }
    const r = await fetch('/api/ice-push', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) }), j = await r.json().catch(() => ({}));
    if (r.status === 503 && j.error === 'not_configured') pushMsg('Server noch nicht eingerichtet – in Vercel fehlen: ' + (j.need || []).join(', ') + '.', true);
    else if (r.status === 404) pushMsg('Kein Gerät angemeldet – Schalter oben einschalten.', true);
    else if (!r.ok) pushMsg('Fehler: ' + (j.error || r.status), true);
    else pushMsg(j.ok ? '✓ Gesendet an ' + j.ok + ' Gerät' + (j.ok > 1 ? 'e' : '') + (j.gone ? ' (' + j.gone + ' abgemeldet)' : '') + ' – kommt gleich an.' : 'Nicht zugestellt – Gerät bitte neu anmelden (Schalter aus und an).', !j.ok);
  } catch (er) { pushMsg((er && er.message) || 'Senden fehlgeschlagen.', true); }
  b.disabled = false;
});

/* ---- Routenplaner-Daten geräteübergreifend: eigenes Dokument enyaqStrom/<uid>/settings/routes = { list: gemerkte Fahrten (lab.fc), del: Löschungen, rtLast: Planung }.
   Unabhängig vom großen Einstellungs-Dokument; Zusammenführen je Fahrt (neuester Stand gewinnt), Planung nach Zeitstempel. ---- */
const labNoFc = (o) => { if (!o) return o; const c = { ...o }; delete c.fc; return c; };
let rtPushT = 0;
function pushRoutes() { clearTimeout(rtPushT); rtPushT = setTimeout(() => { if (!window.cloud?.isSignedIn()) return; const L = load(KEY_LAB, null) || {}, rl = getSettings().rtLast;
  window.cloud.setRoutes({ list: L.fc || [], del: L.del || {}, rtLast: rl || null }).catch(e => { try { window.onCloudStatus?.({ error: 'Routenplaner speichern: ' + (e.message || e) }); } catch (er) { } }); }, 800); }
window.onCloudRoutes = (d, first) => {
  const L = load(KEY_LAB, null) || {}, loc = L.fc || [], rem = d && Array.isArray(d.list) ? d.list : [], del = { ...(L.del || {}) };
  Object.entries((d && d.del) || {}).forEach(([k, t]) => { if (!(del[k] >= t)) del[k] = t; });
  const m = new Map(); [loc, rem].forEach(l => l.forEach(x => { if (!x || !x.id) return; const c = m.get(String(x.id)); if (!c || (x.u || 0) > (c.u || 0)) m.set(String(x.id), x); }));
  const fc = [...m.values()].filter(x => !(del[String(x.id)] >= (x.u || 0))), canon = (l) => JSON.stringify(l.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))));
  let push = !d || canon(fc) !== canon(rem);
  if (canon(fc) !== canon(loc)) { save(KEY_LAB, { ...L, fc, del }); try { if (currentView === 'route') rtTabs(); } catch (e) { } }
  const lr = getSettings().rtLast, cr = d && d.rtLast;                       // Planung: neuerer Stand gewinnt
  if (cr && (!lr || String(cr.at || '') > String(lr.at || ''))) { const st = load(KEY_SETTINGS, {}) || {}; st.rtLast = cr; save(KEY_SETTINGS, st); try { if (currentView === 'route') rtCloudPlan(); } catch (e) { } }
  else if (lr && (!cr || String(lr.at || '') > String(cr.at || ''))) push = true;
  if (push) pushRoutes();
};

if (window.__noStorage) {                                                       // Hinweis: Browser-Speicher gesperrt
  const d = document.createElement('div'); d.setAttribute('role', 'alert');
  d.className = 'fixed inset-x-3 top-3 z-[70] rounded-2xl bg-amber-500 text-slate-950 px-4 py-3 text-sm shadow-xl text-left';
  d.innerHTML = '<b>Browser-Speicher gesperrt.</b> Die App läuft, kann aber nichts dauerhaft auf diesem Gerät speichern. Öffne sie direkt in Chrome (nicht in einer anderen App) und erlaube unter Website-Einstellungen → Cookies und Websitedaten diese Seite. <button type="button" class="ml-1 underline font-semibold">Ausblenden</button>';
  d.querySelector('button').addEventListener('click', () => d.remove()); document.body.appendChild(d);
}
