/* =====================================================================
   Wetter-Pop-up: Klick auf die Überschrift zeigt, an welchen der nächsten 7 Tage (ab morgen)
   die Regenwahrscheinlichkeit unter 10 % liegt. Daten und Ortssuche: Open-Meteo (kostenlos, ohne Anmeldung).
   ===================================================================== */
const WX_DRY = 10, WX_SECONDS = 10, WX_TTL = 30 * 60 * 1000;                        // Grenze in %, Anzeigedauer, Cache-Dauer
const WD_S = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], WD_L = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const wxLoc = () => load(KEY_WXLOC, null);
const wxIso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const wxDay = (iso) => { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d); return { wd: WD_S[x.getDay()], long: WD_L[x.getDay()], dm: String(d).padStart(2, '0') + '.' + String(m).padStart(2, '0') + '.' }; };
function renderWxLoc() { const l = wxLoc(); $('wx-msg').textContent = l ? 'Gespeichert: ' + l.label : 'Noch kein Standort gespeichert. Ort oder PLZ eingeben, suchen und das passende Ergebnis antippen.'; }

/** Ortssuche über die Open-Meteo-Geocoding-API; eine 5-stellige PLZ wird zuerst als Postleitzahl (DE) gesucht, danach als Ortsname. */
async function wxSearch() {
  const q = $('wx-q').value.trim(), box = $('wx-results'); box.textContent = '';
  if (q.length < 2) { $('wx-msg').textContent = 'Bitte einen Ort oder eine Postleitzahl eingeben.'; return; }
  const plz = (q.match(/\b\d{5}\b/) || [])[0], city = q.replace(/\b\d{5}\b/, '').replace(/,?\s*(Deutschland|Germany)\s*$/i, '').replace(/^[\s,]+|[\s,]+$/g, '');
  const get = async (name, cc) => { const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=10&language=de&format=json&name=' + encodeURIComponent(name) + (cc ? '&countryCode=' + cc : '')); if (!r.ok) throw new Error(r.status); return (await r.json()).results || []; };
  $('wx-msg').textContent = 'Suche …';
  try {
    let res = plz ? await get(plz, 'DE') : [];
    if (!res.length && city.length >= 2) res = await get(city, plz ? 'DE' : '');
    if (city) { const hit = (r) => String(r.name).toLowerCase().includes(city.toLowerCase()) ? 0 : 1; res.sort((a, b) => hit(a) - hit(b)); }
    if (!res.length) { $('wx-msg').textContent = 'Nichts gefunden. Versuche es mit dem Ortsnamen oder einer anderen Schreibweise.'; return; }
    $('wx-msg').textContent = 'Passendes Ergebnis antippen:';
    res.forEach(r => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'text-left rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm active:scale-[0.99] transition';
      b.textContent = [r.name, r.admin2 && r.admin2 !== r.name ? r.admin2 : '', r.admin1, r.country].filter(Boolean).join(', ') + (r.postcodes && r.postcodes[0] ? ' · ' + r.postcodes[0] : '');
      b.addEventListener('click', () => {
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        if (save(KEY_WXLOC, { lat: r.latitude, lon: r.longitude, label })) { localStorage.removeItem(KEY_WXCACHE); box.textContent = ''; renderWxLoc(); pushPrefs(); }
      });
      box.appendChild(b);
    });
  } catch (e) { $('wx-msg').textContent = 'Die Suche ist gerade nicht erreichbar. Bitte Internetverbindung prüfen.'; }
}
$('wx-search').addEventListener('click', wxSearch);
$('wx-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); wxSearch(); } });

/** Vorhersage: tägliche maximale Niederschlagswahrscheinlichkeit; 30 Min. zwischengespeichert, bei fehlender Verbindung der letzte Stand. */
async function wxForecast(l) {
  const c = load(KEY_WXCACHE, null), same = c && c.lat === l.lat && c.lon === l.lon;
  if (same && Date.now() - c.t < WX_TTL) return c;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&daily=precipitation_probability_max&timezone=auto&forecast_days=8');
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), out = { lat: l.lat, lon: l.lon, t: Date.now(), days: j.daily.time.map((d, i) => ({ d, p: j.daily.precipitation_probability_max[i] })) };
    save(KEY_WXCACHE, out); return out;
  } catch (e) { if (same) return { ...c, stale: true }; throw e; }
}

/* =====================================================================
   Frost-Hinweis (Start, ab 16 Uhr): Tiefstwert morgen zwischen 5 und 9 Uhr am Wetter-Standort unter 0 °C.
   Reichweite: Netto-Akku ÷ (Ø Verbrauch inkl. Ladeverluste × 0,93); Winter-Abschlag als Faustwert 10 % + 1,5 % je Grad unter 0 (max. 35 %).
   Vorhersage stündlich (Open-Meteo), 1 Stunde zwischengespeichert. × blendet bis zum nächsten Tag aus.
   ===================================================================== */
const KEY_FROST = 'enyaq.frost';                 // { lat, lon, t, day ('JJJJ-MM-TT' = morgen), min } + snooze
async function frostMin() {
  const l = wxLoc(); if (!l) return null;
  const tm = new Date(Date.now() + 864e5), day = wxIso(tm), c = load(KEY_FROST, null);
  if (c && c.lat === l.lat && c.lon === l.lon && c.day === day && Date.now() - c.t < 3600e3) return c.min;
  const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&hourly=temperature_2m&timezone=auto&forecast_days=3');
  if (!r.ok) return c && c.day === day ? c.min : null;
  const j = await r.json(), v = j.hourly.time.map((t, i) => [t, j.hourly.temperature_2m[i]]).filter(([t]) => t.slice(0, 10) === day && +t.slice(11, 13) >= 5 && +t.slice(11, 13) <= 9).map(x => x[1]).filter(Number.isFinite);
  const min = v.length ? Math.min(...v) : null;
  save(KEY_FROST, { ...(c || {}), lat: l.lat, lon: l.lon, t: Date.now(), day, min }); return min;
}
async function renderFrost() {
  const el = $('frost-banner'); if (!el) return;
  const now = new Date(), h = now.getHours(), fc = load(KEY_FROST, {}) || {}, ask = fc.ask, st = iceSet();
  if (liveHero) { el.classList.add('hidden'); return; }
  /* Morgens: kurz nachfragen, ob die Prognose von gestern gestimmt hat (lernt, wie stark die Scheibe am Stellplatz auskühlt) */
  if (h >= 5 && h < 12 && ask && ask.day === todayYMD() && !ask.done) {
    $('frost-h').textContent = 'War die Scheibe heute früh vereist?';
    $('frost-t').innerHTML = `<span class="block">Prognose gestern: ${ICE_LVL[ask.lvl]}${Number.isFinite(ask.tg) ? ' (Scheibe ≈ ' + fmt(Math.round(ask.tg) || 0, 0).replace('-', '−') + ' °C)' : ''}. Deine Antwort macht die Warnung genauer.</span><span class="mt-1.5 flex gap-2"><button type="button" data-ice="1" class="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white">Ja, vereist</button><button type="button" data-ice="0" class="rounded-lg bg-black/10 dark:bg-white/10 px-3 py-1 text-xs font-semibold">Nein, frei</button></span>`;
    el.classList.remove('hidden'); return;
  }
  /* Abends kein eigener Hinweis mehr (die Eis-Badges an der Verbrauchs-Prognose zeigen es dezent) – nur die Prognose für die Rückfrage am Morgen merken */
  el.classList.add('hidden'); if (h < 16) return;
  let ice = null; try { ice = await iceRisk(); } catch (e) { }
  if (ice) { const c = load(KEY_FROST, {}) || {}; if (!c.ask || c.ask.day !== ice.day || !c.ask.done) { c.ask = ice.lvl >= 1 || ice.minTg <= 2 ? { day: ice.day, lvl: ice.lvl, tg: Math.round(ice.minTg * 10) / 10 } : null; save(KEY_FROST, c); } }
}
$('frost-x').addEventListener('click', () => { const c = load(KEY_FROST, {}) || {}; if (c.ask && c.ask.day === todayYMD() && new Date().getHours() < 12) c.ask.done = true; else c.snooze = todayYMD(); save(KEY_FROST, c); $('frost-banner').classList.add('hidden'); });
$('frost-banner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ice]'); if (!b) return; const c = load(KEY_FROST, {}) || {}, a = c.ask; if (!a) return;
  const yes = b.dataset.ice === '1', st = iceSet(); let k = st.k;
  if (yes && a.lvl === 0) k *= 1.12; else if (yes && a.lvl === 1) k *= 1.05; else if (!yes && a.lvl === 2) k *= 0.9; else if (!yes && a.lvl === 1) k *= 0.95;
  k = Math.round(Math.max(0.5, Math.min(1.8, k)) * 100) / 100; if (k !== st.k) setQuickSetting('iceK', k);
  a.done = true; a.ans = yes; save(KEY_FROST, c); localStorage.removeItem(KEY_ICE);
  $('frost-h').textContent = 'Danke!'; $('frost-t').textContent = k !== st.k ? 'Die Eis-Warnung ist jetzt ' + (k > st.k ? 'etwas empfindlicher' : 'etwas zurückhaltender') + '.' : 'Passt – die Warnung bleibt, wie sie ist.';
  setTimeout(() => $('frost-banner').classList.add('hidden'), 2500);
});
/* =====================================================================
   Eis-Warnung (Vortag): Scheibe vereist, wenn das Glas unter 0 °C und unter den Taupunkt fällt. In klaren, windstillen Nächten strahlt die Scheibe ab und ist
   2–5 °C kälter als die Luft (Raureif schon bei +2 °C möglich). Glas ≈ Luft − 4 °C × (1 − Bewölkung) × Windfaktor × Stellplatz × gelernter Faktor.
   Nässe am Abend mit Frost danach → Eisschicht. Stunden von 18 Uhr bis zur Abfahrt am Ort „Zuhause“ (sonst Wetter-Standort). Stufen: 0 gering, 1 möglich, 2 wahrscheinlich.
   ===================================================================== */
const KEY_ICE = 'enyaq.ice', ICE_LVL = ['gering', 'möglich', 'wahrscheinlich'];
const iceSet = () => { const s = getSettings(); return { dep: /^\d{1,2}:\d{2}$/.test(s.iceDep || '') ? s.iceDep.padStart(5, '0') : '06:30', we: !!s.iceWe, park: ['open', 'carport', 'garage'].includes(s.icePark) ? s.icePark : 'open', min: s.iceMin === 'high' ? 2 : 1, k: Number(s.iceK) > 0 ? Number(s.iceK) : 1 }; };
const iceLoc = () => { const hm = getTPlaces().find(p => p.kind === 'home' && Number.isFinite(p.lat)); return hm ? { lat: hm.lat, lon: hm.lon } : wxLoc(); };
/* Eis-Risiko für den Morgen von `day` aus stündlichen Werten (Nacht ab 18 Uhr des Vortags bis zur Abfahrt) */
function iceEval(H, day, st) {
  const prev = wxIso(new Date(Date.parse(day + 'T12:00:00') - 864e5)), [dh] = st.dep.split(':').map(Number), pf = st.park === 'carport' ? 0.35 : 1, rows = [];
  H.time.forEach((t, i) => { const d = t.slice(0, 10), hr = +t.slice(11, 13); if (!((d === prev && hr >= 18) || (d === day && hr <= dh))) return;
    const T = Number(H.temperature_2m[i]), Td = Number(H.dew_point_2m[i]), cc = Number(H.cloud_cover[i]) || 0, ws = Number(H.wind_speed_10m[i]) || 0, p = Number(H.precipitation[i]) || 0;
    if (H.temperature_2m[i] == null || !Number.isFinite(T)) return; const wf = ws < 1.5 ? 1 : ws < 3 ? 0.75 : ws < 5 ? 0.45 : 0.2, Tg = T - 4 * (1 - cc / 100) * wf * pf * st.k;
    rows.push({ d, hr, T, Td: Number.isFinite(Td) ? Td : T - 3, cc, ws, p, Tg }); });
  const late = rows.filter(x => x.d === day && x.hr >= dh - 6); if (!late.length) return null;
  const frostH = late.filter(x => x.Tg <= 0 && x.Tg <= x.Td + 0.5).length, minTg = Math.min(...late.map(x => x.Tg)), gap = Math.min(...late.map(x => x.Tg - x.Td));
  let glaze = false; rows.forEach((x, i) => { if (x.p >= 0.2 && rows.slice(i + 1).some(y => y.Tg <= -0.5)) glaze = true; });
  const lvl = glaze && minTg <= 0 || (frostH >= 3 && minTg <= -1) ? 2 : frostH >= 1 || (minTg <= 0.5 && gap <= 1.5) ? 1 : 0, last = rows[rows.length - 1];
  /* Eis-Wahrscheinlichkeit (Schätzung, kein Messwert): innerhalb der Stufe nach Stärke abgestuft – gering 5–25 %, möglich 30–60 %, wahrscheinlich 65–95 % */
  const cl = (v) => Math.max(0, Math.min(1, v)), sev = lvl >= 2 ? cl((-1 - minTg) / 4 + frostH / 14 + (glaze ? 0.5 : 0)) : lvl === 1 ? cl((0.5 - minTg) / 2 + (1.5 - gap) / 3) : cl((2.5 - minTg) / 3 + (3 - gap) / 6);
  const p = Math.round(((lvl >= 2 ? 65 : lvl === 1 ? 30 : 5) + sev * (lvl === 0 ? 20 : 30)) / 5) * 5;
  return { day, lvl, p, T: last.T, minT: Math.min(...late.map(x => x.T)), minTg, cc: late.reduce((a, x) => a + x.cc, 0) / late.length, ws: late.reduce((a, x) => a + x.ws, 0) / late.length, glaze, frostH };
}
async function iceHourly(l, st) {
  const sig = [l.lat.toFixed(3), l.lon.toFixed(3), wxIso(new Date())].join('|'), c = load(KEY_ICE + 'H', null);
  if (c && c.sig === sig && Date.now() - c.t < 3600e3) return c.H;
  const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&hourly=temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,precipitation&wind_speed_unit=ms&timezone=auto&past_days=1&forecast_days=8');
  if (!r.ok) { if (c && c.H) return c.H; throw new Error('Wetter ' + r.status); } const H = (await r.json()).hourly; if (!H || !H.time) throw new Error('Wetter leer');
  save(KEY_ICE + 'H', { sig, t: Date.now(), H }); return H;
}
async function iceRisk() {
  const st = iceSet(); if (st.park === 'garage') return null; const l = iceLoc(); if (!l) return null;
  const tm = new Date(Date.now() + 864e5), day = wxIso(tm), wd = tm.getDay(); if (!st.we && (wd === 0 || wd === 6)) return null;
  return iceEval(await iceHourly(l, st), day, st);
}
/** Eis-Risiko je Morgen für die nächsten Tage (7-Tage-Prognose) – unabhängig von der Wochenend-Einstellung */
async function iceDays(days) { const st = iceSet(), l = iceLoc(); if (st.park === 'garage' || !l) return {}; const H = await iceHourly(l, st), out = {}; days.forEach(d => { const r = iceEval(H, d, st); if (r) out[d] = r; }); return out; }
/* =====================================================================
   Verbrauchs-Prognose (Start): lernendes Modell aus den eigenen Ladungen + Open-Meteo-Vorhersage.
   Jede genaue Strecke zwischen zwei Ladungen (Akku-%, ≥ 20 km) ist ein Lernpunkt: Verbrauch aus dem Akku (ohne Ladeverluste, wie der Bordcomputer) gegen die mittlere Tagestemperatur
   und den Anteil nasser Tage (≥ 1 mm) am Wetter-Standort. Modell: kWh/100 km = Basis + Kälte × max(0, 18 °C − T) + Regen × Nass-Anteil.
   Bayes'sche Ridge-Regression: Startwerte aus Erfahrungswerten (Kälte +0,25 je Grad, Regen +1,0) gelten wie 3 Ladungen; mit jeder Ladung
   übernehmen die eigenen Daten mehr (neuere Ladungen zählen stärker, Halbwertszeit 90 Tage). Ergebnis 6 h zwischengespeichert, Vorhersage 1 h.
   ===================================================================== */
const WXO_RES = 20;                                                                   // Reserve im Lade-Tipp (Laden 20–80 %)
const WXO_HALF = 90;                                                                  // Halbwertszeit in Tagen: eine 90 Tage alte Ladung zählt halb so viel
const KEY_WXO = 'enyaq.wxo4', WXO_T0 = 18, WXO_T1 = 5;
/* Modell: kWh/100 km = a + b·max(0, 18 °C − T) + d·max(0, 5 °C − T) + c·Nass-Anteil + e·Anteil feuchter Morgen
   a Grundverbrauch, b Kälte (mild), d Kältezuschlag unter 5 °C (Heizung, kalter Akku), c Regen, e feuchter Morgen (Scheiben trocknen: Heizung + Klima).
   Startwerte (Prior) zählen jeweils etwa wie 3 Ladungen mit typischen Werten; danach übernehmen die eigenen Ladungen. */
const WXO_PRIOR = { a: 14.0, b: 0.12, d: 0.25, c: 0.9, e: 0.6 }, WXO_LAMBDA = [0.05, 3 * 25, 3 * 9, 3 * 0.25, 3 * 0.25];
const wxoX = (T, r, h) => [1, Math.max(0, WXO_T0 - T), Math.max(0, WXO_T1 - T), r, h];
/** Feuchter Morgen je Tag: 5–9 Uhr im Mittel ≥ 90 % Luftfeuchte bei unter 10 °C (Scheiben beschlagen) → { 'JJJJ-MM-TT': 0 | 1 } */
function wxoHumDays(j) {
  const h = j && j.hourly, out = {}; if (!h || !h.time || !h.relative_humidity_2m) return out; const acc = {};
  h.time.forEach((t, i) => { const hr = +t.slice(11, 13); if (hr < 5 || hr > 9) return; const rh = h.relative_humidity_2m[i], tc = h.temperature_2m ? h.temperature_2m[i] : null; if (rh == null || tc == null) return; const d = t.slice(0, 10), o = acc[d] = acc[d] || { rh: 0, t: 0, n: 0 }; o.rh += rh; o.t += tc; o.n++; });
  Object.keys(acc).forEach(d => { const o = acc[d]; out[d] = o.n >= 3 && o.rh / o.n >= 90 && o.t / o.n < 10 ? 1 : 0; }); return out;
}
const wxoIcon = (w) => w == null ? '🌡️' : w === 0 ? '☀️' : w <= 2 ? '🌤️' : w === 3 ? '☁️' : w <= 48 ? '🌫️' : w <= 57 ? '🌦️' : w <= 67 ? '🌧️' : w <= 77 ? '❄️' : w <= 82 ? '🌦️' : w <= 86 ? '🌨️' : '⛈️';
/** Meteocons (Bas Milius, MIT-Lizenz, Bilder/wx/) je Wettercode von Open-Meteo; Tagesvarianten, da es Tageswerte sind */
const WX_MC = (w) => w == null ? null : w === 0 ? 'clear-day' : w <= 2 ? 'partly-cloudy-day' : w === 3 ? 'overcast-day' : w <= 48 ? 'fog-day' : w <= 55 ? 'drizzle' : w <= 57 ? 'sleet' : w <= 65 ? 'rain' : w <= 67 ? 'sleet' : w <= 77 ? 'snow' : w <= 82 ? 'partly-cloudy-day-rain' : w <= 86 ? 'partly-cloudy-day-snow' : w === 95 ? 'thunderstorms-day-rain' : 'hail';
const wxIconStyle = () => getSettings().wxIcons === 'emoji' ? 'emoji' : 'meteo';
/** Wetter-Symbol als HTML: Meteocons (Standard) oder Emoji – Einstellung „Wetter-Symbole“ */
function wxoIconHtml(w, px) { const n = WX_MC(w); return wxIconStyle() === 'meteo' && n ? `<img src="Bilder/wx/${n}.svg" alt="${wxoText(w)}" width="${px}" height="${px}" class="inline-block align-middle" style="width:${px}px;height:${px}px;margin:-${Math.round(px * 0.12)}px 0">` : wxoIcon(w); }
const wxoText = (w) => w == null ? '' : w === 0 ? 'sonnig' : w <= 2 ? 'heiter' : w === 3 ? 'bewölkt' : w <= 48 ? 'Nebel' : w <= 57 ? 'Niesel' : w <= 67 ? 'Regen' : w <= 77 ? 'Schnee' : w <= 82 ? 'Schauer' : w <= 86 ? 'Schneeschauer' : 'Gewitter';
function wxoSolve(A, y) {                                                          // n×n Gauß mit Pivot
  const n = y.length, M = A.map((r, i) => r.concat(y[i]));
  for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-9) return null;
    for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } }
  return M.map((r, i) => r[n] / r[i]);
}
/** Lernpunkte aus den Ladungen (Strecke zwischen zwei Ladungen) + Wetter-Archiv → Modell { a, b, d, c, e, n, sd, … } */
async function wxoModel(l) {
  const rs = getReadings(), iv = [];
  rs.forEach((r, i) => { if (i < 1) return; const s = entryStats(rs, i), a = Date.parse(rs[i - 1].date), b = Date.parse(r.date); const y = s.usedBat / s.km * 100; if (s.method !== 'soc' || s.rough || !(y > 3 && y < 60) || s.km < 20 || !Number.isFinite(a) || !Number.isFinite(b)) return; iv.push({ a: wxIso(new Date(a)), b: wxIso(new Date(b)), y, t: b }); });
  const sig = iv.length + ':' + (iv.length ? iv[iv.length - 1].b : '') + ':' + l.lat + ',' + l.lon, c = load(KEY_WXO, null);
  if (c && c.sig === sig && Date.now() - c.t < 6 * 3600e3) return c.m;
  let pts = [];
  if (iv.length) {
    const days = await wxTemps(l, iv.reduce((m, x) => x.a < m ? x.a : m, iv[0].a), iv.reduce((m, x) => x.b > m ? x.b : m, iv[0].b)), tc = load(KEY_TEMPS, {}) || {}, rain = tc.rain || {}, hum = tc.hum || {};
    iv.forEach(x => { let st = 0, n = 0, wet = 0, nr = 0, hu = 0, nh = 0;
      for (let t = Date.parse(x.a + 'T12:00:00'), e = Date.parse(x.b + 'T12:00:00'); t <= e; t += 864e5) { const d = wxIso(new Date(t)), v = days[d], p = rain[d], q = hum[d]; if (v != null) { st += v; n++; } if (p != null) { nr++; if (p >= 1) wet++; } if (q != null) { nh++; hu += q; } }
      if (n) pts.push({ T: st / n, r: nr ? wet / nr : 0, h: nh ? hu / nh : 0, y: x.y, w: Math.pow(0.5, (Date.now() - x.t) / (WXO_HALF * 864e5)) }); });
  }
  const P = WXO_PRIOR, L = WXO_LAMBDA, K = 5, pr = [P.a, P.b, P.d, P.c, P.e];
  const A = L.map((x, i) => L.map((_, j) => i === j ? x : 0)), v = L.map((x, i) => x * pr[i]);
  if (pts.length) { const my = pts.reduce((s, p) => s + p.y, 0) / pts.length, adj = pts.reduce((s, p) => { const x = wxoX(p.T, p.r, p.h); return s + P.b * x[1] + P.d * x[2] + P.c * x[3] + P.e * x[4]; }, 0) / pts.length; v[0] = L[0] * (my - adj); }   // Grund-Startwert aus den eigenen Daten
  pts.forEach(p => { const x = wxoX(p.T, p.r, p.h); for (let i = 0; i < K; i++) { v[i] += p.w * x[i] * p.y; for (let j = 0; j < K; j++) A[i][j] += p.w * x[i] * x[j]; } });
  const beta = wxoSolve(A, v) || pr.slice();
  const cl = (x, lo, hi) => Math.min(hi, Math.max(lo, x));                                               // physikalisch sinnvoll halten
  const m = { a: beta[0], b: cl(beta[1], 0, 0.8), d: cl(beta[2], 0, 1.2), c: cl(beta[3], 0, 4), e: cl(beta[4], 0, 3) };
  const res = pts.map(p => p.y - wxoPredX(m, wxoX(p.T, p.r, p.h))), sd = res.length > 5 ? Math.sqrt(res.reduce((s, x) => s + x * x, 0) / (res.length - 5)) : null;
  Object.assign(m, { n: pts.length, sd, spanT: pts.length ? Math.max(...pts.map(p => p.T)) - Math.min(...pts.map(p => p.T)) : 0,
    coldN: pts.filter(p => p.T < WXO_T1).length, wetN: pts.filter(p => p.r > 0.3).length, humN: pts.filter(p => p.h > 0.3).length });
  save(KEY_WXO, { sig, t: Date.now(), m }); return m;
}
const wxoPredX = (m, x) => m.a + m.b * x[1] + m.d * x[2] + m.c * x[3] + m.e * x[4];
const wxoPred = (m, T, wet, hum) => wxoPredX(m, wxoX(T, wet ? 1 : 0, hum ? 1 : 0));
/** Zuschläge eines Tages für die 7-Tage-Ansicht: ❄️ Kälte (beide Stufen), 🌧️ Regen, 💧 feuchter Morgen */
function wxoParts(m, T, wet, hum) { const x = wxoX(T, wet ? 1 : 0, hum ? 1 : 0); return { cold: m.b * x[1] + m.d * x[2], rain: m.c * x[3], hum: m.e * x[4] }; }
/** 7-Tage-Vorhersage: Tagesmittel, Niederschlag, Wettercode (1 h zwischengespeichert) */
async function wxoForecast(l) {
  const c = load(KEY_WXO + 'F', null), same = c && c.lat === l.lat && c.lon === l.lon && c.day === wxIso(new Date()) && c.days && c.days[0] && 't7' in c.days[0];
  if (same && Date.now() - c.t < 3600e3) return c.days;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code&hourly=temperature_2m,relative_humidity_2m&timezone=auto&forecast_days=8');
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), d = j.daily, hd = wxoHumDays(j), hr = (t, h) => { const k = (j.hourly && j.hourly.time || []).indexOf(t + 'T' + String(h).padStart(2, '0') + ':00'); const v = k >= 0 ? j.hourly.temperature_2m[k] : null; return v == null ? null : v; };
    const days = d.time.map((t, i) => ({ t7: hr(t, WXO_H1), t16: hr(t, WXO_H2), hum: hd[t] || 0, d: t, T: d.temperature_2m_mean[i] ?? (d.temperature_2m_min[i] + d.temperature_2m_max[i]) / 2, lo: d.temperature_2m_min[i], hi: d.temperature_2m_max[i], p: d.precipitation_sum[i] ?? 0, w: d.weather_code[i] }));
    save(KEY_WXO + 'F', { lat: l.lat, lon: l.lon, day: wxIso(new Date()), t: Date.now(), days }); return days;
  } catch (e) { if (c && c.lat === l.lat) return c.days.filter(x => x.d >= wxIso(new Date())); throw e; }
}
/** Ø km pro Tag aus den letzten ~90 Tagen der km-Stände; typisches Ladeziel (Median der letzten 10 Akku-Ende-Werte) */
function wxoHabits() {
  const rs = getReadings().filter(r => r.odometerKm > 0 && Number.isFinite(Date.parse(r.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let kmDay = null;
  if (rs.length >= 2) { const last = rs[rs.length - 1], lim = Date.parse(last.date) - 90 * 864e5, first = rs.find(r => Date.parse(r.date) >= lim) || rs[0], d = (Date.parse(last.date) - Date.parse(first.date)) / 864e5; if (d >= 7 && last.odometerKm > first.odometerKm) kmDay = (last.odometerKm - first.odometerKm) / d; }
  const ends = getReadings().filter(r => r.socEnd > 30).slice(-10).map(r => r.socEnd);
  return { kmDay, target: ends.length ? Math.round(median(ends)) : 80 };
}
/** Aktueller Akkustand vom Auto (1 h zwischengespeichert – die Škoda-API erlaubt 20 Abfragen pro Stunde); bei Fehlern der letzte Wert bis 6 h alt */
async function wxoSoc() {
  const c = load(KEY_WXO + 'S', null);
  if (c && c.d && Date.now() - c.t < 3600e3) return c.soc;                     // ältere Zwischenstände ohne Fahrzeugdaten einmal neu holen
  const old = c && Date.now() - c.t < 6 * 3600e3 ? c.soc : null;
  if (!apiEnabled()) return old;
  try {
    const res = await fetch('/api/vehicle', { headers: await authHeaders() }), d = await res.json().catch(() => ({}));
    if (!res.ok || d.soc == null) return old;
    if (d.odometerKm != null) { carKmCache = { t: Date.now(), km: Math.round(d.odometerKm), at: d.capturedAt || null }; odoNote(d); try { renderHeroStats(); } catch (e) { } }
    save(KEY_WXO + 'S', { t: Date.now(), soc: d.soc, d }); try { renderVehCard(); } catch (e) { } try { if (!ltmSaved) renderLtm(); } catch (e) { } return d.soc;
  } catch (e) { return old; }
}
/* PC: Fahrzeugstatus rechts neben dem Auto (Glas-Karte) – aus der stündlichen Abfrage beim Auto (gleicher Zwischenspeicher wie der Restakku) */
/* Handy: Fahrzeugstatus als eigene Karte im Wisch-Bereich (zwischen Prognose und Zählerstand); am PC steht er neben dem Auto */
/** Farbe des Akku-Balkens: unter 15 % rot, unter 25 % orange, sonst grün */
const socBarCls = (soc) => soc < 15 ? 'from-red-600 to-red-400' : soc < 25 ? 'from-orange-600 to-orange-400' : 'from-emerald-600 to-emerald-400';
function renderVehSlide() {
  const el = $('veh-slide'); if (!el) return;
  const c = load(KEY_WXO + 'S', null), d = c && c.d, on = !isDesk() && apiEnabled() && d && d.soc != null;
  el.classList.toggle('hidden', !on); el.classList.toggle('flex', !!on); setTimeout(() => { try { dashSwipeSync(); } catch (e) { } }, 0); if (!on) return;
  const soc = Math.round(d.soc), tgt = Number(d.targetSoc) || null, charging = d.chargeState === 'CHARGING' || d.chargePowerKw > 0, plugged = d.plug === 'CONNECTED';
  const lk = d.doorsLocked || d.locked, locked = lk === 'YES' ? true : lk === 'NO' ? false : null, ok = locked !== false && !/OPEN/.test(d.doors || '') && !/OPEN/.test(d.windows || '');
  const at = d.capturedAt ? new Date(d.capturedAt) : new Date(c.t);
  if (isSimple()) { el.innerHTML = vehSlideEasy(d, soc, tgt, charging, plugged, locked, at); return; }
  const tile = (a, b, col) => `<div class="min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800/70 px-2.5 py-1.5"><p class="text-[10.5px] text-left text-slate-500 dark:text-slate-400">${a}</p><p class="truncate text-[13px] font-semibold ${col || ''}">${b}</p></div>`;
  el.innerHTML = `<div class="flex items-center justify-between gap-2"><p class="font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Fahrzeugstatus</p><span class="text-[11px] ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">● ${ok ? 'Alles OK' : 'Bitte prüfen'}</span></div>
    <div class="mt-1.5 flex items-baseline gap-2"><span class="font-barlow text-[36px] font-bold leading-none">${soc} %</span>${d.rangeKm != null ? `<span class="text-[15px] font-semibold">${fmt(d.rangeKm, 0)} km</span>` : ''}<span class="ml-auto text-[10.5px] text-slate-500 dark:text-slate-400">${at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${hhmm(at.getTime())}</span></div>
    <div class="relative mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div class="h-full rounded-full bg-gradient-to-r ${socBarCls(soc)} ${charging ? 'animate-pulse' : ''}" style="width:${Math.max(2, Math.min(100, soc))}%"></div>${tgt ? `<div class="absolute inset-y-0 border-l-2 border-slate-900/70 dark:border-white/80" style="left:${tgt}%"></div>` : ''}</div>
    <div class="min-h-2 flex-1"></div>
    <div class="grid grid-cols-2 gap-1.5">${[
      locked != null ? tile('Verriegelt', locked ? '🔒 geschlossen' : '🔓 geöffnet', locked ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400') : tile('Ladestatus', d.chargeState === 'READY_FOR_CHARGING' ? 'bereit' : charging ? 'lädt' : 'kein Laden'),
      charging ? tile('Lädt', (d.chargePowerKw > 0 ? fmt(d.chargePowerKw, 1) + ' kW' : '') + (d.minutesToFull > 0 ? ' · voll ' + hhmm(at.getTime() + d.minutesToFull * 60000) : ''), 'text-sky-600 dark:text-sky-300') : tile('Ladekabel', plugged ? 'verbunden' : 'nicht verbunden'),
      tile('Ladeziel', tgt ? tgt + ' %' + (d.careMode === 'ACTIVATED' ? ' · Schonung' : '') : '–'),
      tile('km-Stand', d.odometerKm != null ? fmt(Math.round(d.odometerKm), 0) + ' km' : '–')].join('')}</div>`;
}
/* Einfache Ansicht: kompakter Status (Mockup „Status A“). Zustand über Symbole oben (Schloss zu/offen, Stecker ab/steckt, Blitz = lädt),
   die Zeile unten sagt es in Worten. Laden: Balken blau mit laufenden Streifen. */
const VEH_ICO = {
  lockc: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', locko: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  plug: '<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/>', plugin: '<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v3"/><path d="M8 21h8"/>', bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'
};
const vehIco = (k, cls, label) => `<span role="img" aria-label="${label}" class="flex h-[26px] w-[26px] items-center justify-center rounded-[9px] ${cls}"><svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${VEH_ICO[k]}</svg></span>`;
function vehSlideEasy(d, soc, tgt, charging, plugged, locked, at) {
  const open = locked === false, openDW = /OPEN/.test(d.doors || '') || /OPEN/.test(d.windows || '');
  const lockI = open || openDW ? vehIco('locko', 'bg-amber-500/20 text-amber-500 dark:text-amber-400', open ? 'offen' : 'Tür oder Fenster offen') : locked ? vehIco('lockc', 'text-slate-400', 'verriegelt') : '';
  const plugI = charging ? vehIco('bolt', 'bg-sky-500/20 text-sky-600 dark:text-sky-400', 'lädt') : plugged ? vehIco('plugin', 'text-sky-600 dark:text-sky-400', 'Kabel verbunden') : vehIco('plug', 'text-slate-300 dark:text-slate-600', 'Kabel nicht verbunden');
  const today = wxIso(at) === wxIso(new Date()), atTxt = (today ? '' : at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · ') + hhmm(at.getTime());   // heute: nur Uhrzeit (Platz)
  const tgtTxt = tgt ? 'Ladeziel ' + tgt + ' %' : '';
  const foot = charging ? `<b class="font-semibold text-sky-600 dark:text-sky-400">Lädt${d.chargePowerKw > 0 ? ' · ' + fmt(d.chargePowerKw, 1) + ' kW' : ''}${d.minutesToFull > 0 ? ' · voll ca. ' + hhmm(at.getTime() + d.minutesToFull * 60000) : ''}</b>`
    : open ? '<b class="font-semibold text-amber-600 dark:text-amber-400">Auto ist nicht verriegelt</b>' : openDW ? '<b class="font-semibold text-amber-600 dark:text-amber-400">Tür oder Fenster offen</b>'
    : plugged ? `<b class="font-semibold text-sky-600 dark:text-sky-400">Kabel steckt${tgtTxt ? ' · ' + tgtTxt : ''}</b>` : tgtTxt;
  const fill = charging ? 'from-sky-600 to-sky-400' : socBarCls(soc), stripes = charging ? '<div class="absolute inset-0 veh-stripes"></div>' : '';
  return `<div class="flex items-center gap-1.5"><p class="min-w-0 flex-1 truncate font-barlow text-[19px] font-bold uppercase tracking-[0.06em] leading-6">Fahrzeugstatus</p>${lockI}${plugI}<span class="ml-0.5 shrink-0 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">${atTxt}</span></div>
    <div class="mt-1.5 flex items-baseline gap-2.5"><span class="font-barlow text-[44px] font-bold leading-none">${soc} %</span>${d.rangeKm != null ? `<span class="font-barlow text-[22px] font-bold ${wxoLowR(d.rangeKm) ? 'text-red-500' : ''}">${fmt(d.rangeKm, 0)} km</span>` : ''}${d.odometerKm != null ? `<span class="ml-auto text-xs text-slate-500 dark:text-slate-400">km ${fmt(Math.round(d.odometerKm), 0)}</span>` : ''}</div>
    <div class="relative mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div class="relative h-full overflow-hidden rounded-full bg-gradient-to-r ${fill}" style="width:${Math.max(2, Math.min(100, soc))}%">${stripes}</div>${tgt ? `<div class="absolute inset-y-0 w-0.5 bg-slate-900/60 dark:bg-white/75" style="left:${tgt}%"></div>` : ''}</div>
    <div class="mt-1.5 flex justify-between gap-2 text-[11.5px] text-slate-500 dark:text-slate-400"><span class="min-w-0 truncate">${foot}</span><span class="shrink-0">vom Auto · Škoda-App</span></div>`;
}
function renderVehCard() {
  try { renderVehSlide(); } catch (e) { }
  try { const c = load(KEY_WXO + 'S', null), d = c && c.d, at = d && (Date.parse(d.capturedAt) || c.t);
    setChargeHero(!!(apiEnabled() && d && (d.chargeState === 'CHARGING' || d.chargePowerKw > 0) && at && Date.now() - at < 3 * 3600e3)); } catch (e) { }
  const el = $('veh-card'), wrap = $('hero-car'); if (!el) return;
  const c = load(KEY_WXO + 'S', null), d = c && c.d, on = isDesk() && apiEnabled() && d && d.soc != null && !liveHero;
  el.classList.toggle('on', !!on); wrap.classList.toggle('has-veh', !!on); if (!on) return;
  const soc = Math.round(d.soc), tgt = Number(d.targetSoc) || null, cs = d.chargeState || '', charging = cs === 'CHARGING' || d.chargePowerKw > 0;
  const plugged = d.plug === 'CONNECTED', lk = d.doorsLocked || d.locked, locked = lk === 'YES' ? true : lk === 'NO' ? false : null;
  const at = d.capturedAt ? new Date(d.capturedAt) : new Date(c.t), atTxt = at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · ' + hhmm(at.getTime());
  const ok = locked !== false && !/OPEN/.test(d.doors || '') && !/OPEN/.test(d.windows || '') && !/^ON$/.test(d.lights || '');
  const row = (i, a, b, col) => `<div class="flex items-center justify-between gap-2 border-t border-white/10 py-1.5 text-[12.5px]"><span class="flex items-center gap-2 text-slate-200">${i}${a}</span><span class="font-semibold ${col || 'text-slate-200'}">${b}</span></div>`;
  const ico = (path) => `<svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const I = { lock: ico('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), plug: ico('<path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8zM12 17v5"/>'), tgt: ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'), odo: ico('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/>'), bolt: ico('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>') };
  const rows = [
    locked != null ? row(I.lock, 'Verriegelt', locked ? 'geschlossen' : 'geöffnet', locked ? 'text-emerald-400' : 'text-amber-400') : '',
    charging ? row(I.bolt, 'Lädt', (d.chargePowerKw > 0 ? fmt(d.chargePowerKw, 1) + ' kW' : '') + (d.minutesToFull > 0 ? ' · voll ' + hhmm(Date.parse(d.capturedAt || new Date(c.t).toISOString()) + d.minutesToFull * 60000) : ''), 'text-sky-300')
      : row(I.plug, 'Ladekabel', plugged ? 'verbunden' : 'nicht verbunden', plugged ? 'text-sky-300' : 'text-slate-400'),
    tgt ? row(I.tgt, 'Ladeziel', tgt + ' %' + (d.careMode === 'ACTIVATED' ? ' · Akkuschonung' : '')) : '',
    d.odometerKm != null ? row(I.odo, 'km-Stand', fmt(Math.round(d.odometerKm), 0) + ' km') : ''
  ].join('');
  el.innerHTML = `<div class="rounded-[20px] border border-white/10 bg-slate-900/55 px-4 py-3.5 text-white backdrop-blur-md">
    <div class="flex items-center justify-between"><span class="font-barlow text-[15px] font-bold uppercase tracking-[0.08em]">Fahrzeugstatus</span><span class="text-[11px] ${ok ? 'text-emerald-400' : 'text-amber-400'}">● ${ok ? 'Alles OK' : 'Bitte prüfen'}</span></div>
    <div class="mt-2 flex items-baseline gap-2"><span class="font-barlow text-[40px] font-bold leading-none">${soc} %</span>${d.rangeKm != null ? `<span class="text-[15px] font-semibold">${fmt(d.rangeKm, 0)} km</span>` : ''}</div>
    <div class="relative mb-2.5 mt-2 h-3.5 overflow-hidden rounded-full bg-slate-800"><div class="h-full rounded-full bg-gradient-to-r ${socBarCls(soc)} ${charging ? 'animate-pulse' : ''}" style="width:${Math.max(2, Math.min(100, soc))}%"></div>${tgt ? `<div class="absolute -inset-y-0.5 border-l-2 border-white/80" style="left:${tgt}%"></div>` : ''}</div>
    ${rows}<p class="mt-1.5 text-[10.5px] text-slate-400">Stand vom Auto: ${atTxt}</p></div>`;
}
const WXO_H1 = 7, WXO_H2 = 16;                                                        // Anzeige: Temperatur zur Hin- und Rückfahrt (nur Anzeige, gerechnet wird mit dem Tagesmittel)
const wxoTT = (v) => fmt(Math.round(v), 0).replace('-', '−') + '°';
const wxoCut = () => { const v = Number(getSettings().wxoCut); return Number.isInteger(v) && v >= 0 && v <= 24 ? v : 18; };   // ab dieser Stunde gilt „Morgen“
const dashFirst = () => { const v = getSettings().dashFirst; return v === 'meter' || v === 'dyn' ? v : 'wx'; };
const DASH_DYN_SOC = 30;                                                                  // „Dynamisch“: unter diesem Akkustand zuerst der Zählerstand
/** Welche Karte beim Öffnen vorne liegt: fest gewählt oder dynamisch nach dem zuletzt vom Auto gemeldeten Akkustand (bis 6 h alt) */
function dashFirstSlide(soc) {
  const f = dashFirst(); if (f !== 'dyn') return f;
  if (soc == null) { const c = load(KEY_WXO + 'S', null); soc = c && Date.now() - c.t < 6 * 3600e3 ? c.soc : null; }
  return soc != null && soc < DASH_DYN_SOC ? 'meter' : 'wx';
}
function setQuickSetting(k, v) { const st = load(KEY_SETTINGS, {}) || {}; if (v === undefined) delete st[k]; else st[k] = v; save(KEY_SETTINGS, st); try { pushPrefs(); } catch (e) { } }
function fillWxoPrefs() {
  Promise.resolve().then(() => fillIcePush()).catch(() => { });                    // erst nach dem Laden des Skripts (Konstanten weiter unten)
  try { const st = iceSet(), f = (id, v) => { const e = $(id); if (e && document.activeElement !== e) e.value = v; }; f('set-ice-dep', st.dep); f('set-ice-park', st.park); f('set-ice-min', st.min === 2 ? 'high' : 'mid'); f('set-ice-we', st.we ? '1' : '0');
    $('set-ice-info').textContent = 'Eis-Wahrscheinlichkeit für den Ort „Zuhause“ (Temperatur, Taupunkt, Bewölkung, Wind) als Badge an der Verbrauchs-Prognose und in der 7-Tage-Ansicht; „Hinweis ab“ gilt für die Push-Nachricht. Morgens fragt die App kurz nach, ob es gestimmt hat.' + (Math.abs(st.k - 1) >= 0.02 ? ' Gelernt: dein Stellplatz kühlt ' + fmt(Math.abs(st.k - 1) * 100, 0) + ' % ' + (st.k > 1 ? 'stärker' : 'schwächer') + ' aus als üblich.' : ''); } catch (e) { }
  const gm = $('set-gt-mirror'); if (gm) gm.checked = !!getSettings().gtMirror;
  const wi = $('set-wx-icons'); if (wi && document.activeElement !== wi) wi.value = wxIconStyle();
  const cn = $('set-car-n'), cs = $('set-car-sec'); if (cn && document.activeElement !== cn) cn.value = String(carAutoN()); if (cs && document.activeElement !== cs) { const v = String(carAutoMs() / 1000); cs.value = [...cs.options].some(o => o.value === v) ? v : '30'; } const a = $('set-wxo-cut'), b = $('set-dash-first'); if (a && document.activeElement !== a) a.value = String(wxoCut()); if (b && document.activeElement !== b) b.value = dashFirst(); }
$('set-wxo-cut').addEventListener('change', (e) => { setQuickSetting('wxoCut', Number(e.target.value)); renderWxo(); });
$('set-car-n').addEventListener('change', (e) => { setQuickSetting('carN', Number(e.target.value)); try { window.carReschedule && window.carReschedule(); } catch (er) { } });
$('set-car-sec').addEventListener('change', (e) => { setQuickSetting('carSec', Number(e.target.value)); try { window.carReschedule && window.carReschedule(); } catch (er) { } });
$('set-wx-icons').addEventListener('change', (e) => { setQuickSetting('wxIcons', e.target.value); try { renderWxo(); } catch (er) { } });
$('set-dash-first').addEventListener('change', (e) => { setQuickSetting('dashFirst', e.target.value); });
[['set-ice-dep', 'iceDep', v => /^\d{2}:\d{2}$/.test(v) ? v : undefined], ['set-ice-park', 'icePark', v => v], ['set-ice-min', 'iceMin', v => v], ['set-ice-we', 'iceWe', v => v === '1' || undefined]].forEach(([id, key, f]) =>
  $(id).addEventListener('change', (e) => { setQuickSetting(key, f(e.target.value)); localStorage.removeItem(KEY_ICE); const c = load(KEY_FROST, {}) || {}; delete c.snooze; save(KEY_FROST, c); try { fillWxoPrefs(); renderFrost(); } catch (er) { } }));
const wxoN = () => !isDesk() ? 3 : ($('wxo-card').clientWidth || document.querySelector('main').clientWidth) >= 760 ? 7 : 5;   // Tage in der Vorschau: Handy 3, PC je nach Breite 5 oder 7
let wxoNLast = 0; window.addEventListener('resize', () => { clearTimeout(window.__wxoRs); window.__wxoRs = setTimeout(() => { if (wxoN() !== wxoNLast) try { renderWxo(); } catch (e) { } }, 250); });
let wxoTok = 0, wxoLast = null;
const wxoFmtR = (km) => fmt(Math.round(km / 5) * 5, 0);
const wxoLowR = (km) => Math.round(km / 5) * 5 < 250;                                // Reichweite unter 250 km: ganz in Rot
async function renderWxo() {
  const el = $('wxo-card'), l = isSimple() ? null : wxLoc(); if (!el) return;
  if (!l || liveHero) {                                                              // ohne Wetter (oder einfache Ansicht): Fahrzeugstatus trotzdem holen
    el.classList.add('hidden');
    if (!liveHero && apiEnabled()) wxoSoc().then(() => { try { renderVehCard(); } catch (e) { } }).catch(() => { });
    return;
  }
  const tok = ++wxoTok; let m, fc, socNow = null;
  try { [m, fc, socNow] = await Promise.all([wxoModel(l), wxoForecast(l), wxoSoc().catch(() => null)]); } catch (e) { if (tok === wxoTok) el.classList.add('hidden'); return; }
  if (tok !== wxoTok) return;
  const today = wxIso(new Date()), days = fc.filter(x => x.d >= today).slice(0, 7); if (days.length < 3) { el.classList.add('hidden'); return; }
  const eff = (() => { try { return avgEff(getReadings()); } catch (e) { return BAT.eta; } })(), cap = batteryKwh(), rng = (k) => cap / k * 100;
  days.forEach(x => { x.k = wxoPred(m, x.T, x.p >= 1, x.hum); x.r = rng(x.k); x.parts = wxoParts(m, x.T, x.p >= 1, x.hum); });
  const best = rng(m.a), hl = new Date().getHours() >= wxoCut() ? 1 : 0, lab = (i) => i === 0 ? 'Heute' : i === 1 ? 'Morgen' : wxDay(days[i].d).wd + '.';
  wxoLast = { m, days, eff, cap };
  wxoNLast = wxoN(); $('wxo-days').style.gridTemplateColumns = 'repeat(' + wxoNLast + ', minmax(0, 1fr))';
  $('wxo-days').innerHTML = days.slice(0, wxoNLast).map((x, i) => { const on = i === hl;
    return `<div data-wd="${x.d}" class="relative min-w-0 rounded-2xl px-1.5 py-2 text-center ${on ? 'bg-sky-50 dark:bg-sky-950/60 ring-[1.5px] ring-sky-400' : 'bg-slate-100 dark:bg-slate-800/60'}">
      <p class="text-center text-[11px] font-semibold ${on ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}">${lab(i)}</p>
      <p class="mt-0.5 text-center text-[22px] leading-none">${wxoIconHtml(x.w, wxIconStyle() === 'meteo' ? 40 : 30)}</p><p class="text-center text-[12.5px] font-semibold leading-tight whitespace-nowrap" title="${WXO_H1} Uhr / ${WXO_H2} Uhr · Ø ${fmt(x.T, 0)}°">${x.t7 != null && x.t16 != null ? wxoTT(x.t7) + ' / ' + wxoTT(x.t16) : wxoTT(x.T)}</p>
      <p class="mt-0.5 text-center text-[15px] font-bold leading-tight">${fmt(x.k, 1)}</p><p class="text-center text-[9.5px] leading-tight text-slate-500 dark:text-slate-400">kWh/100 km</p>
      <div class="mx-1.5 mt-1.5 h-[5px] rounded-full bg-slate-200 dark:bg-slate-700"><div class="h-[5px] rounded-full bg-gradient-to-r from-emerald-500 to-sky-400" style="width:${Math.max(8, Math.min(100, x.r / best * 100)).toFixed(0)}%"></div></div>
      <p class="mt-0.5 text-center text-[12px]${wxoLowR(x.r) ? ' text-red-600 dark:text-red-400' : ''}"><b>${wxoFmtR(x.r)}</b> <span class="${wxoLowR(x.r) ? '' : 'text-slate-500 dark:text-slate-400'}">km</span></p></div>`; }).join('');
  wxoIceBadges(days.slice(0, wxoNLast).map(x => x.d), tok);
  /* Reicht-bis: aktueller Akkustand vom Auto (Škoda-API) bis 20 % Reserve, mit Ø km/Tag und dem vorhergesagten Verbrauch des jeweiligen Tages.
     Ohne Fahrzeugdaten: ab dem typischen Ladeziel (Ladehub 20–80 %). */
  const hb = wxoHabits(), tip = $('wxo-tip'), soc = Number.isFinite(socNow) ? socNow : null, from = soc ?? hb.target;
  if (hb.kmDay > 3) {
    let e = cap * (from - WXO_RES) / 100, i = hl, n = 0;
    while (n < 30 && e > 0) { const x = days[Math.min(i, days.length - 1)], need = hb.kmDay * x.k / 100; if (e < need) break; e -= need; i++; n++; }
    const head = soc != null ? Math.round(soc) + ' % Restakku' : `Ladehub ${WXO_RES}–${hb.target} %`;
    const until = from <= WXO_RES ? 'unter der Reserve' : n <= 0 ? 'reicht keinen vollen Tag' : n === 1 ? 'reicht bis ' + (hl ? 'morgen' : 'heute Abend') : hl + n - 1 < days.length ? 'reicht bis ' + wxDay(days[hl + n - 1].d).wd + '. (' + n + ' Tage)' : 'reicht ca. ' + n + ' Tage';
    tip.textContent = head + ' – ' + until;
    tip.classList.remove('hidden');
  } else tip.classList.add('hidden');
  el.classList.remove('hidden');
  if (dashFirst() === 'dyn' && !window.dSwUser) { const want = dashFirstSlide(soc) === 'wx' ? dashIdx('wxo-card') : dashIdx('meter-card'); if (dSw.idx !== want) setTimeout(() => dashSwipeTo(want), 50); }
  try { save(KEY_WXO + 'H', { day: todayYMD(), st: wxIconStyle(), n: wxoN(), cut: hl, days: $('wxo-days').innerHTML, tip: tip.classList.contains('hidden') ? '' : tip.textContent }); } catch (e) { }   // für den sofortigen Aufbau beim nächsten Öffnen
}
/** Beim Laden: Karte sofort aus dem letzten Stand zeigen (oder als Platzhalter in gleicher Höhe), damit nichts springt; renderWxo füllt sie danach neu */
function wxoBoot() {
  if (!wxLoc() || liveHero) return;
  const c = load(KEY_WXO + 'H', null), sk = '<div class="h-[148px] rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse"></div>';
  $('wxo-days').style.gridTemplateColumns = 'repeat(' + wxoN() + ', minmax(0, 1fr))';
  $('wxo-days').innerHTML = c && c.day === todayYMD() && c.days && (c.n || 3) === wxoN() && (c.st || 'emoji') === wxIconStyle() ? c.days : sk.repeat(wxoN());
  const tip = $('wxo-tip'); tip.textContent = c && c.day === todayYMD() ? c.tip || '' : ''; tip.classList.toggle('hidden', !tip.textContent);
  if (!tip.textContent) { tip.textContent = ' '; tip.classList.remove('hidden'); }       // gleiche Höhe wie mit Text
  $('wxo-card').classList.remove('hidden');
}
function wxoPartsHtml(q) {
  if (!q) return ''; const t = [[q.cold, '❄️'], [q.rain, '🌧️'], [q.hum, '💧']].filter(([v]) => v >= 0.05);   // je Anteil eine Zeile: Symbole und Zahlen jeweils untereinander
  return t.length ? `<span class="mt-px flex justify-end"><span class="grid grid-cols-[auto_30px] items-center gap-x-1 text-[11.5px] leading-[1.35] text-slate-500 dark:text-slate-400">${t.map(([v, i]) => `<span class="text-center">${i}</span><span class="text-right tabular-nums">+${fmt(v, 1)}</span>`).join('')}</span></span>` : '';
}
function openWxoSheet() {
  const o = wxoLast; if (!o) return; const { m, days } = o, P = WXO_PRIOR;
  $('wxo-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 shrink-0 rounded bg-slate-300 dark:bg-slate-700 max-sm:hidden"></div><p class="shrink-0 text-xl font-bold">Prognose 7 Tage</p>
    <div class="flex shrink-0 justify-end gap-2 text-[11.5px] text-slate-500 dark:text-slate-400"><span>kWh/100 km</span><span class="w-[62px] text-right">Reichweite</span></div>
    <div class="divide-y divide-slate-200 dark:divide-slate-800 !mt-1 max-sm:!-mt-1 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:overflow-y-auto">${days.map((x, i) => `<div class="flex items-center gap-2 py-2.5 max-sm:flex-[1_0_auto] max-sm:py-1.5"><span class="w-[54px] shrink-0 whitespace-nowrap leading-tight"><span class="block text-[15px] font-semibold">${i === 0 ? 'Heute' : i === 1 ? 'Morgen' : wxDay(x.d).wd + '.'}</span><span class="block text-[11.5px] text-slate-500 dark:text-slate-400">${wxDay(x.d).dm}</span></span><span class="shrink-0 text-2xl">${wxoIconHtml(x.w, 42)}</span>
      <span class="w-[84px] shrink-0 whitespace-nowrap text-[13px] leading-snug text-slate-500 dark:text-slate-400">${fmt(x.lo, 0).replace('-', '−')} bis ${fmt(x.hi, 0).replace('-', '−')} °C${x.p >= 1 ? '<br>' + fmt(x.p, 0) + ' mm' : ''}<span class="block sm:hidden" data-icem="${x.d}"></span></span>
      <span class="hidden min-w-[26px] flex-1 justify-center sm:flex" data-iced="${x.d}"></span><span class="min-w-0 flex-1 text-right sm:w-[72px] sm:flex-none sm:shrink-0"><span class="block text-[18px] font-bold leading-tight">${fmt(x.k, 1)}</span>${wxoPartsHtml(x.parts)}</span><span class="w-[62px] shrink-0 whitespace-nowrap text-right text-[15px]${wxoLowR(x.r) ? ' text-red-600 dark:text-red-400' : ''}">${wxoFmtR(x.r)} km</span></div>`).join('')}</div>
    <details class="group rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-3 text-[12.5px] leading-relaxed max-sm:shrink-0 max-sm:max-h-[45dvh] max-sm:overflow-y-auto">
      <summary class="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">So rechnet die Prognose<span class="text-slate-400 transition-transform group-open:rotate-90">›</span></summary>
      <p class="mt-1">Grundverbrauch (ab ${WXO_T0} °C, trocken): <b>${fmt(m.a, 1)}</b> kWh/100 km${m.n ? '' : ' <span class="text-slate-400">(Startwert)</span>'}</p>
      <p>Kälte: <b>+${fmt(m.b, 2)}</b> je Grad unter ${WXO_T0} °C ${m.n >= 5 && m.spanT >= 6 ? '' : '<span class="text-slate-400">(noch nah am Startwert ' + fmt(P.b, 2) + ')</span>'}</p>
      <p>Kältezuschlag: <b>+${fmt(m.d, 2)}</b> je Grad unter ${WXO_T1} °C ${m.coldN >= 3 ? '' : '<span class="text-slate-400">(Startwert ' + fmt(P.d, 2) + ', lernt ab Ladungen unter ' + WXO_T1 + ' °C)</span>'}</p>
      <p>Regentag: <b>+${fmt(m.c, 1)}</b> ${m.wetN >= 4 ? '' : '<span class="text-slate-400">(noch nah am Startwert ' + fmt(P.c, 1) + ')</span>'}</p>
      <p>Feuchter Morgen (5–9 Uhr ≥ 90 %, unter 10 °C): <b>+${fmt(m.e, 1)}</b> ${m.humN >= 4 ? '' : '<span class="text-slate-400">(noch nah am Startwert ' + fmt(P.e, 1) + ')</span>'}</p>
      <p class="text-slate-500 dark:text-slate-400">❄️ Kälte · 🌧️ Regen · 💧 beschlagene Scheiben (Heizung + Klima)</p>
      <p class="text-slate-500 dark:text-slate-400"><span class="font-semibold text-orange-500">70 %</span> Eis-Wahrscheinlichkeit morgens – geschätzt aus der Scheibentemperatur (Temperatur, Taupunkt, Bewölkung, Wind, Stellplatz); <span class="text-yellow-500">gelb</span> Raureif möglich, <span class="text-orange-500">orange</span> wahrscheinlich vereist, <span class="text-red-500">rot</span> fast sicher bzw. Eisschicht. Ab 20 % angezeigt (Eis-Warnung, Ort „Zuhause“, Abfahrt laut Einstellungen)</p>
      ${m.sd ? `<p>Typische Abweichung: ±${fmt(m.sd, 1)} kWh/100 km</p>` : ''}
      <p class="mt-1.5 text-slate-500 dark:text-slate-400">Gelernt aus ${m.n} genauen Ladungen (mit Akku-% und km-Stand, ≥ 20 km) und dem Wetter an deinem Standort. Jede neue Ladung verbessert die Werte; neuere zählen stärker (eine 90 Tage alte Ladung halb so viel). Verbrauch ohne Ladeverluste (aus dem Akku, vergleichbar mit der Anzeige im Auto). Wetter: Open-Meteo${wxIconStyle() === 'meteo' ? ', Symbole: Meteocons von Bas Milius (MIT)' : ''}. Reichweite: ${fmt(o.cap, 1)} kWh netto bei 100 % Akku.</p>
    </details>
    <button type="button" data-wxo="close" class="h-12 w-full shrink-0 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">Schließen</button>`;
  $('wxo-sheet').classList.remove('hidden');
  iceDays(days.map(x => x.d)).then(map => {                                     // Eis-Wahrscheinlichkeit je Morgen: Prozent + Balken (Handy unter den Temperaturen, PC in der Lücke)
    const bar = (r, w) => { const p = r.p, c = p < 50 ? '#eab308' : p < 80 ? '#f97316' : '#ef4444', t = 'Eis morgens ≈ ' + p + ' % (Scheibe ≈ ' + fmt(Math.round(r.minTg) || 0, 0).replace('-', '−') + ' °C, ' + ICE_LVL[r.lvl] + ')';
      return `<span class="inline-flex items-center gap-1.5" title="${t}"><span class="whitespace-nowrap text-[12px] font-bold tabular-nums" style="color:${c}">${p} %</span><span class="block h-[5px] overflow-hidden rounded-full bg-slate-300 dark:bg-slate-700" style="width:${w}px"><span class="block h-full rounded-full" style="width:${p}%;background:${c}"></span></span><span class="sr-only">${t}</span></span>`; };
    document.querySelectorAll('#wxo-sheet-box [data-icem]').forEach(el => { const r = map[el.dataset.icem]; if (r && r.p >= 20) el.innerHTML = bar(r, 40); });
    document.querySelectorAll('#wxo-sheet-box [data-iced]').forEach(el => { const r = map[el.dataset.iced]; if (r && r.p >= 20) el.innerHTML = bar(r, 46); });
  }).catch(() => { });
}
/* Start: Verbrauchs-Prognose und Zählerstand seitlich wischen (Standard: Prognose). Höhe folgt der sichtbaren Karte. */
const dSw = { tr: $('dash-swipe-track'), idx: 0 };
function dashSlides() { if (isSimple()) return [$('ltm-card'), $('veh-slide'), $('care-slide')].filter(x => x && !x.classList.contains('hidden')); return [$('ltm-card'), $('btm-card'), $('wxo-card'), $('veh-slide'), $('meter-card')].filter(x => x && !x.classList.contains('hidden') && !((x.id === 'btm-card' || x.id === 'ltm-card') && liveHero)); }
const dashIdx = (id) => Math.max(0, dashSlides().indexOf($(id)));
/** Karte beim Öffnen: Prognose oder Zählerstand (Akku-Temperatur liegt links davon und wird nur per Wischen erreicht) */
const dashDefaultIdx = () => isSimple() ? dashIdx('veh-slide') : dashFirstSlide() === 'wx' && !$('wxo-card').classList.contains('hidden') ? dashIdx('wxo-card') : dashIdx('meter-card');
function dashSwipeSync() {
  const sl = dashSlides(), w = dSw.tr.clientWidth + 12, i = Math.max(0, Math.min(sl.length - 1, Math.round(dSw.tr.scrollLeft / (w || 1)))); dSw.idx = i;
  const two = sl.length > 1, dd = $('dash-dots'); dd.classList.toggle('hidden', !two);
  if (dd.children.length !== sl.length) dd.innerHTML = sl.map((x, k) => `<button type="button" data-dslide="${k}" aria-label="${x.id === 'ltm-card' ? 'Langzeitverbrauch' : x.id === 'care-slide' ? 'Akkupflege' : x.id === 'btm-card' ? 'Akku-Temperatur' : x.id === 'wxo-card' ? 'Verbrauchs-Prognose' : x.id === 'veh-slide' ? 'Fahrzeugstatus' : 'Zählerstand'}" class="pointer-events-auto h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700 transition-all"></button>`).join('');
  dd.querySelectorAll('[data-dslide]').forEach((b, k) => { const on = k === i; b.classList.toggle('w-4', on); b.classList.toggle('w-1.5', !on); ['bg-slate-400', 'dark:bg-slate-500'].forEach(c => b.classList.toggle(c, on)); ['bg-slate-300', 'dark:bg-slate-700'].forEach(c => b.classList.toggle(c, !on)); });
}
function dashSwipeTo(i, smooth = true) { const sl = dashSlides(); if (!sl[i]) return; dSw.tr.scrollTo({ left: sl[i].offsetLeft - dSw.tr.offsetLeft, behavior: smooth ? 'smooth' : 'auto' }); }
['pointerdown', 'touchstart', 'wheel'].forEach(ev => dSw.tr.addEventListener(ev, () => { window.dSwUser = true; }, { passive: true }));   // selbst gewischt: nicht mehr automatisch umschalten
$('dash-dots').addEventListener('pointerdown', () => { window.dSwUser = true; });
let dSwT = null; dSw.tr.addEventListener('scroll', () => { clearTimeout(dSwT); dSwT = setTimeout(dashSwipeSync, 60); }, { passive: true });
$('dash-dots').addEventListener('click', (e) => { const b = e.target.closest('[data-dslide]'); if (b) dashSwipeTo(Number(b.dataset.dslide)); });
try { new ResizeObserver(() => dashSwipeSync()).observe($('ltm-card')); new ResizeObserver(() => dashSwipeSync()).observe($('btm-card')); new ResizeObserver(() => dashSwipeSync()).observe($('wxo-card')); new ResizeObserver(() => dashSwipeSync()).observe($('meter-card')); } catch (e) { }
let dSwVis = false; new MutationObserver(() => { const v = !$('wxo-card').classList.contains('hidden'); if (v !== dSwVis) { dSwVis = v; dashSwipeTo(dashDefaultIdx(), false); } dashSwipeSync(); }).observe($('wxo-card'), { attributes: true, attributeFilter: ['class'] });
$('btn-live').addEventListener('click', () => setTimeout(() => dashSwipeTo(dashSlides().length - 1), 0));
mouseSwipe(dSw.tr, 12);
dashSwipeSync();
$('wxo-more').addEventListener('click', openWxoSheet);
$('wxo-days').addEventListener('click', (e) => { const b = e.target.closest('[data-iceb]'); if (b) { e.stopPropagation(); wxoIceTip(b); return; } openWxoSheet(); });
/* Eis-Badge oben rechts an den Prognose-Kacheln (ab 20 %), Farben wie in der 7-Tage-Prognose; Tipp darauf zeigt kurz die Erklärung über den Kacheln */
const ICE_COL = (p) => p < 50 ? '#eab308' : p < 80 ? '#f97316' : '#ef4444', ICE_NAME = (p) => p < 50 ? 'Raureif' : p < 80 ? 'Vereist' : 'Eisschicht';
let wxoIceMap = {}, wxoIceT = 0;
function wxoIceBadges(ds, tok) {
  iceDays(ds).then(map => { if (tok !== wxoTok) return; wxoIceMap = map;
    document.querySelectorAll('#wxo-days [data-wd]').forEach(el => { const r = map[el.dataset.wd], old = el.querySelector('[data-iceb]'); if (old) old.remove(); if (!r || r.p < 20) return;
      el.insertAdjacentHTML('beforeend', `<button type="button" data-iceb="${el.dataset.wd}" aria-label="Eis morgens ${r.p} Prozent – Erklärung" class="absolute -top-[7px] -right-1 z-[1] inline-flex items-center gap-0.5 rounded-full py-0.5 pl-1 pr-1.5 text-[10px] font-bold leading-none text-slate-900 shadow-sm active:scale-95 transition" style="background:${ICE_COL(r.p)}"><span class="text-[10px] leading-none" aria-hidden="true">❄️</span>${r.p} %</button>`); });
  }).catch(() => { });
}
function wxoIceTip(b) {
  const r = wxoIceMap[b.dataset.iceb], el = $('wxo-ice-tip'); if (!r) return; clearTimeout(wxoIceT);
  const day = b.dataset.iceb === wxIso(new Date()) ? 'Heute früh' : b.dataset.iceb === wxIso(new Date(Date.now() + 864e5)) ? 'Morgen früh' : wxDay(b.dataset.iceb).wd + '. früh', cur = ICE_NAME(r.p);
  const item = (e, n) => `<span class="${n === cur ? 'font-bold' : 'opacity-55'}">${e} ${n}</span>`;
  el.innerHTML = `<p class="text-[13px] font-semibold">${day}: Eis ≈ ${r.p} % · Scheibe ≈ ${fmt(Math.round(r.minTg) || 0, 0).replace('-', '−')} °C</p><p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">${item('🟡', 'Raureif')}${item('🟠', 'Vereist')}${item('🔴', 'Eisschicht')}</p>`;
  el.classList.remove('hidden'); wxoIceT = setTimeout(() => el.classList.add('hidden'), 5000);
}
$('wxo-ice-tip').addEventListener('click', () => { clearTimeout(wxoIceT); $('wxo-ice-tip').classList.add('hidden'); });
$('wxo-sheet').addEventListener('click', (e) => { if (e.target === $('wxo-sheet') || e.target.closest('[data-wxo="close"]')) $('wxo-sheet').classList.add('hidden'); });
wxoBoot(); fillWxoPrefs(); renderWxo(); setInterval(() => { if (!document.hidden && currentView === 'dashboard') renderWxo(); }, 30 * 60 * 1000);
setTimeout(() => renderFrost(), 1500); setInterval(() => { if (!document.hidden && currentView === 'dashboard') renderFrost(); }, 15 * 60 * 1000);
let wxTimer = null, wxTok = 0, wxChart = null;
function wxKill() { if (wxChart) { wxChart.destroy(); wxChart = null; } }
function wxClose() { wxTok++; clearTimeout(wxTimer); wxKill(); $('wx-pop').classList.add('hidden'); }
function wxBody(html) { wxKill(); $('wx-body').innerHTML = html; }
function wxArm() { clearTimeout(wxTimer); wxTimer = setTimeout(wxClose, WX_SECONDS * 1000); }   // schließt nach 10 s von selbst (ohne Anzeige)
const WX_MUTED = 'text-slate-500 dark:text-slate-400', WX_GREEN = 'text-emerald-600 dark:text-emerald-400';
function wxRender(data, l) {
  const today = wxIso(new Date()), days = data.days.filter(x => x.d > today).slice(0, 7), isDry = (x) => x.p != null && x.p < WX_DRY, dry = days.filter(isDry);
  let h = '<p class="pr-10 text-[13px] ' + WX_MUTED + '">' + (dry.length ? 'Nächster trockener Tag' : 'Trockene Tage') + '</p>';
  if (dry.length) { const n = wxDay(dry[0].d); h += '<p class="text-[28px] font-bold leading-tight">' + n.long + ', ' + n.dm + '</p><p class="mt-0.5 text-sm font-bold ' + WX_GREEN + '">' + dry[0].p + ' % Regenwahrscheinlichkeit</p>'; }
  else h += '<p class="text-[24px] font-bold leading-tight">Kein trockener Tag</p><p class="mt-0.5 text-sm ' + WX_MUTED + '">In den nächsten 7 Tagen liegt die Regenwahrscheinlichkeit überall bei ' + WX_DRY + ' % oder mehr.</p>';
  h += '<div class="relative mt-3 h-[190px]"><canvas id="wx-chart" role="img" aria-label="Regenwahrscheinlichkeit der nächsten 7 Tage"></canvas></div>';
  const more = dry.slice(1).map(x => { const n = wxDay(x.d); return n.wd + ' ' + n.dm + ' (' + x.p + ' %)'; });
  h += '<p class="mt-2 text-xs ' + WX_MUTED + '">Regenwahrscheinlichkeit in %, Grenze = ' + WX_DRY + ' %.' + (more.length ? ' Außerdem trocken: ' + more.join(', ') + '.' : '') + '</p>';
  const st = data.stale ? ' · offline, Stand ' + new Date(data.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  h += '<p class="mt-1 text-[11px] ' + WX_MUTED + '">' + esc(l.label) + ' · Open-Meteo' + st + '</p>';
  wxBody(h); wxDraw(days, isDry);
}
/** Diagramm als Chart.js-Canvas (wie die Diagramme auf Start): Farben bleiben auch bei aggressiven Handy-Dunkelmodi erhalten. */
function wxDraw(days, isDry) {
  const cv = $('wx-chart'); if (!cv || typeof Chart === 'undefined' || !days.length) return;
  const dark = isDark(), text = dark ? '#cbd5e1' : '#475569', line = dark ? '#94a3b8' : '#64748b', green = '#10b981';
  const top = Math.max(40, Math.ceil(Math.max(...days.map(x => x.p || 0)) / 10) * 10 + 10);
  const extra = { id: 'wxExtra', afterDatasetsDraw(ch) {                                // gestrichelte 10-%-Linie + Prozentwerte über den Balken
    const { ctx, chartArea: a, scales: { y } } = ch, yy = y.getPixelForValue(WX_DRY);
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.left, yy); ctx.lineTo(a.right, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ch.getDatasetMeta(0).data.forEach((b, i) => { const x = days[i]; ctx.fillStyle = isDry(x) ? (dark ? '#34d399' : '#059669') : (dark ? '#e2e8f0' : '#334155'); ctx.fillText(x.p == null ? '–' : String(x.p), b.x, b.y - 5); });
    ctx.restore(); } };
  wxChart = new Chart(cv, { type: 'bar', plugins: [extra],
    data: { labels: days.map(x => wxDay(x.d).wd), datasets: [{ data: days.map(x => x.p || 0), backgroundColor: days.map(x => isDry(x) ? green : '#000000'), borderColor: days.map(x => isDry(x) ? green : (dark ? '#e2e8f0' : '#000000')), borderWidth: 1.5,
      borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 2, bottomRight: 2 }, borderSkipped: false, minBarLength: 4, barPercentage: .5, categoryPercentage: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 20 } }, plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: text, font: { size: 12 } } }, y: { display: false, min: 0, max: top } } } });
}
async function wxOpen() {
  const pop = $('wx-pop'), card = $('wx-card'), tok = ++wxTok, t = $('app-title').getBoundingClientRect(), l = wxLoc();
  clearTimeout(wxTimer); card.style.transition = 'none'; card.style.transform = ''; card.style.opacity = '';
  card.style.top = Math.round(t.bottom + 12) + 'px'; pop.classList.remove('hidden');
  const c = card.getBoundingClientRect(); $('wx-caret').style.left = Math.min(Math.max(t.left - c.left + 15, 21), c.width - 35) + 'px';   // Pfeil zeigt auf die Überschrift
  if (!l) {
    wxBody('<p class="pr-10 text-[13px] ' + WX_MUTED + '">Wetter</p><p class="text-xl font-bold leading-tight">Kein Standort hinterlegt</p><p class="mt-1 text-sm ' + WX_MUTED + '">Trage in den Einstellungen einen Ort oder eine Postleitzahl ein.</p><button id="wx-go" type="button" class="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:scale-95 transition">Standort eintragen</button>');
    $('wx-go').addEventListener('click', () => { wxClose(); openSettings('wetter'); $('wx-q').scrollIntoView({ block: 'center' }); $('wx-q').focus({ preventScroll: true }); });
    wxArm(); return;
  }
  wxBody('<p class="pr-10 text-[13px] ' + WX_MUTED + '">Wetter</p><p class="text-xl font-bold leading-tight">Wird geladen …</p>');
  try { const data = await wxForecast(l); if (tok !== wxTok) return; wxRender(data, l); }
  catch (e) { if (tok !== wxTok) return; wxBody('<p class="pr-10 text-[13px] ' + WX_MUTED + '">Wetter</p><p class="text-xl font-bold leading-tight">Keine Daten</p><p class="mt-1 text-sm ' + WX_MUTED + '">Die Vorhersage konnte nicht geladen werden. Bitte Internetverbindung prüfen.</p>'); }
  wxArm();
}
(() => {                                                                               // Bedienung: Überschrift antippen, schließen per Kreuz, Hintergrund, Esc oder Wegwischen
  const t = $('app-title'), card = $('wx-card'); let sx = 0, sy = 0, id = null, drag = false;
  t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-label', 'Wetter: trockene Tage anzeigen'); t.classList.add('cursor-pointer');
  t.addEventListener('click', wxOpen);
  t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wxOpen(); } });
  $('wx-x').addEventListener('click', wxClose); $('wx-bd').addEventListener('click', wxClose);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('wx-pop').classList.contains('hidden')) wxClose(); });
  card.addEventListener('pointerdown', e => { id = e.pointerId; sx = e.clientX; sy = e.clientY; drag = false; card.style.transition = 'none'; });
  card.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return; const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!drag && Math.max(Math.abs(dx), Math.abs(dy)) > 8) { drag = true; try { card.setPointerCapture(id); } catch (e) { } }
    if (drag) { card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; card.style.opacity = String(Math.max(0.3, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 260)); }
  });
  const end = e => {
    if (e.pointerId !== id) return; id = null; if (!drag) return; drag = false;
    const m = Math.max(Math.abs(e.clientX - sx), Math.abs(e.clientY - sy));
    if (m >= 60) wxClose(); else { card.style.transition = 'transform .2s, opacity .2s'; card.style.transform = ''; card.style.opacity = ''; }
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
})();
renderWxLoc();

