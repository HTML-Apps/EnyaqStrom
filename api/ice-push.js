// Abendliche Push-Benachrichtigungen: Eis-Warnung und fällige Erinnerungen (zwei getrennte Nachrichten).
// GET  (Vercel-Zeitplan, täglich am frühen Abend), je Konto:
//      · Eis: Risiko für morgen früh (gleiche Formel wie in der App), bei „möglich“/„wahrscheinlich“ an Geräte mit Eis-Warnung (devices[id].ice, fehlt = an).
//      · Erinnerungen: nur am Fälligkeitstag (dueDate = heute) bzw. an dem Abend, an dem der km-Stand die Fälligkeit überschreitet
//        (Stand vom Vorabend in settings/pushState.remKm) – überfällige nicht erneut. An Geräte mit devices[id].rem = true.
//      · Akku niedrig: Akku-% vom Škoda-Server (eine Abfrage je Konto), unter der Schwelle des Geräts (devices[id].low in %, + 10 bei Frost)
//        und Auto nicht angesteckt → „Akku 17 % – heute Abend anstecken?“. E-Mail des Kontos dafür verschlüsselt in settings/lowPush (beim Einschalten gesetzt).
// POST (aus der App, mit Anmelde-Token): { test: true } Eis-Testnachricht, { test: 'rem' } Erinnerungs-Testnachricht, { test: 'low' } Akku-Testnachricht,
//      { low: 'reg' } Konto für die Akku-Nachricht freischalten (merkt die E-Mail verschlüsselt, damit der Zeitplan die Škoda-Zugangsdaten findet).
// Benötigte Vercel-Variablen: VAPID_PRIVATE_KEY (Web-Push), FIREBASE_SERVICE_ACCOUNT (JSON des Firebase-Dienstkontos, nur Lesen),
// optional CRON_SECRET (schützt den Zeitplan-Aufruf; ohne Variable nur Aufrufe von Vercels Zeitplan).
//      · Auto nicht abgeschlossen (devices[id].veh): Schloss/Türen/Fenster/Licht, nur wenn der Stand ≥ 30 Min. alt ist.
//      · Monatsanfang (devices[id].mon): Monatsbericht des Vormonats + Fahrtenbuch-Hinweis, einmal je Monat (bis zum 7. nachgeholt).
//      · Škoda-Schlüssel (devices[id].key, fehlt = an): 7 Tage vorher, am Vortag, am Ablauftag.
//      Zustand je Konto in settings/pushState (remKm, remDay, monSent, keySent) – ausgefallene Abende werden nachgeholt (Erinnerungen bis 7 Tage).
import webpush from 'web-push';
import { SignJWT, importPKCS8 } from 'jose';
import { verifyUser, accountForUser, usable } from '../lib/auth.js';
import { fsSetStrings, fsGetStrings, seal, unseal } from '../lib/fs.js';

const PROJECT_ID = 'daily-companion-24975';
const VAPID_PUBLIC = 'BHJg47_9-WGwpnQQkZCKyGtmbned4D9fOyJ-EsYRKqD6dizXoA60UIYNjR1_vL-y0yxFN8PAuYsjQhKLEHcC128';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const LVL = ['gering', 'möglich', 'wahrscheinlich'];

/* ---- Firestore (REST, mit Dienstkonto) ---- */
let tok = null, tokExp = 0;
async function gToken() {
  if (tok && Date.now() < tokExp) return tok;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const key = await importPKCS8(sa.private_key, 'RS256'), now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const j = await r.json(); if (!j.access_token) throw new Error('Dienstkonto: kein Zugriffstoken (' + (j.error_description || j.error || r.status) + ')');
  tok = j.access_token; tokExp = Date.now() + 50 * 60e3; return tok;
}
const val = (v) => v == null ? null : 'nullValue' in v ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue : 'timestampValue' in v ? v.timestampValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : null;
async function fsGet(path) {
  const r = await fetch(FS + '/' + path, { headers: { Authorization: 'Bearer ' + await gToken() } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('Firestore ' + r.status + ' bei ' + path);
  const j = await r.json(); return Object.fromEntries(Object.entries(j.fields || {}).map(([k, x]) => [k, val(x)]));
}
async function fsUids() {                                                       // alle Konten unter enyaqStrom/ (Dokumente ohne eigene Felder → showMissing)
  const out = []; let page = '';
  do { const r = await fetch(FS + '/enyaqStrom?showMissing=true&pageSize=300&mask.fieldPaths=x' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: { Authorization: 'Bearer ' + await gToken() } });
    if (!r.ok) throw new Error('Firestore ' + r.status + ' (Kontenliste)'); const j = await r.json();
    (j.documents || []).forEach(d => out.push(d.name.split('/').pop())); page = j.nextPageToken || ''; } while (page);
  return out;
}

/* ---- Eis-Risiko (wie iceEval in index.html) ---- */
const iso = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
function iceSet(s) {
  s = s || {}; return { dep: /^\d{1,2}:\d{2}$/.test(s.iceDep || '') ? s.iceDep.padStart(5, '0') : '06:30', we: !!s.iceWe, park: ['open', 'carport', 'garage'].includes(s.icePark) ? s.icePark : 'open',
    min: s.iceMin === 'high' ? 2 : 1, k: Number(s.iceK) > 0 ? Number(s.iceK) : 1 };
}
function iceEval(H, day, st) {
  const prev = iso(new Date(Date.parse(day + 'T12:00:00Z') - 864e5)), [dh] = st.dep.split(':').map(Number), pf = st.park === 'carport' ? 0.35 : 1, rows = [];
  H.time.forEach((t, i) => { const d = t.slice(0, 10), hr = +t.slice(11, 13); if (!((d === prev && hr >= 18) || (d === day && hr <= dh))) return;
    const T = Number(H.temperature_2m[i]), Td = Number(H.dew_point_2m[i]), cc = Number(H.cloud_cover[i]) || 0, ws = Number(H.wind_speed_10m[i]) || 0, p = Number(H.precipitation[i]) || 0;
    if (H.temperature_2m[i] == null || !Number.isFinite(T)) return; const wf = ws < 1.5 ? 1 : ws < 3 ? 0.75 : ws < 5 ? 0.45 : 0.2, Tg = T - 4 * (1 - cc / 100) * wf * pf * st.k;
    rows.push({ d, hr, T, Td: Number.isFinite(Td) ? Td : T - 3, cc, ws, p, Tg }); });
  const late = rows.filter(x => x.d === day && x.hr >= dh - 6); if (!late.length) return null;
  const frostH = late.filter(x => x.Tg <= 0 && x.Tg <= x.Td + 0.5).length, minTg = Math.min(...late.map(x => x.Tg)), gap = Math.min(...late.map(x => x.Tg - x.Td));
  let glaze = false; rows.forEach((x, i) => { if (x.p >= 0.2 && rows.slice(i + 1).some(y => y.Tg <= -0.5)) glaze = true; });
  const lvl = glaze && minTg <= 0 || (frostH >= 3 && minTg <= -1) ? 2 : frostH >= 1 || (minTg <= 0.5 && gap <= 1.5) ? 1 : 0, last = rows[rows.length - 1];
  return { day, lvl, T: last.T, minTg, cc: late.reduce((a, x) => a + x.cc, 0) / late.length, ws: late.reduce((a, x) => a + x.ws, 0) / late.length, glaze };
}
const deg = (v) => String(Math.round(v) || 0).replace('-', '−') + ' °C';
function message(r, st) {
  const sky = r.cc < 25 ? 'klar' : r.cc < 60 ? 'teils bewölkt' : 'bewölkt', wind = r.ws < 1.5 ? 'windstill' : r.ws < 4 ? 'wenig Wind' : 'windig';
  return { title: r.lvl >= 2 ? 'Eisgefahr' : 'Eisgefahr möglich',
    body: `${deg(r.T)} um ${st.dep} · ${sky}, ${wind}\n| Scheibe ≈ ${deg(r.minTg)}${r.glaze ? ' · Eisschicht nach Nässe' : ''}` };
}
async function riskFor(uid, prefs0) {
  const [prefs, places] = await Promise.all([prefs0 !== undefined ? prefs0 : fsGet(`enyaqStrom/${uid}/settings/prefs`), fsGet(`enyaqStrom/${uid}/settings/places`)]);
  const st = iceSet(prefs && prefs.settings); if (st.park === 'garage') return { st, r: null };
  const home = places && Array.isArray(places.places) ? places.places.find(p => p && p.kind === 'home' && Number.isFinite(p.lat)) : null, loc = home || (prefs && prefs.wxLoc);
  if (!loc || !Number.isFinite(loc.lat)) return { st, r: null, why: 'kein Ort „Zuhause“' };
  const tm = new Date(Date.now() + 864e5), day = iso(tm), wd = new Date(day + 'T12:00:00Z').getUTCDay();
  if (!st.we && (wd === 0 || wd === 6)) return { st, r: null, why: 'Wochenende' };
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,precipitation&wind_speed_unit=ms&timezone=Europe%2FBerlin&forecast_days=3`);
  if (!w.ok) throw new Error('Wetter ' + w.status); return { st, r: iceEval((await w.json()).hourly, day, st) };
}
async function devices(uid) { const d = await fsGet(`enyaqStrom/${uid}/settings/push`); return Object.entries((d && d.devices) || {}).filter(([, v]) => v && v.sub).map(([id, v]) => ({ id, sub: JSON.parse(v.sub), ice: v.ice !== false, low: Number(v.low) > 0 ? Number(v.low) : 0, rem: v.rem === true, veh: v.veh === true, mon: v.mon === true, key: v.key !== false })); }

/* ---- Fällige Erinnerungen ---- */
async function fsList(path) {                                                   // alle Dokumente einer Sammlung → [Felder]
  const out = []; let page = '';
  do { const r = await fetch(FS + '/' + path + '?pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: { Authorization: 'Bearer ' + await gToken() } });
    if (r.status === 404) return out; if (!r.ok) throw new Error('Firestore ' + r.status + ' bei ' + path); const j = await r.json();
    (j.documents || []).forEach(d => out.push(Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)])))); page = j.nextPageToken || ''; } while (page);
  return out;
}
async function fsLatest(uid, coll, n) {                                         // neueste n Dokumente nach „date“
  const r = await fetch(FS + '/enyaqStrom/' + uid + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + await gToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }], limit: n } }) });
  if (!r.ok) return []; return (await r.json()).filter(x => x.document).map(x => Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, val(v)])));
}
/** Aktueller km-Stand wie in der App (gemeinsamer km-Verlauf): größter Wert aus den letzten Ladungen und Kosten, Langzeit-Ablesungen,
    Tagesständen vom Auto (lab.odo), Fahrtenbuch (dieser und letzter Monat) und – falls abgefragt – dem Stand vom Auto. */
async function kmNow(uid, prefs, carKm) {
  const now = new Date(), ym = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 7), prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const [rs, cs, t1, t0] = await Promise.all([fsLatest(uid, 'readings', 8), fsLatest(uid, 'costs', 8), fsGet(`enyaqStrom/${uid}/tripMonths/${ym(now)}`).catch(() => null), fsGet(`enyaqStrom/${uid}/tripMonths/${ym(prev)}`).catch(() => null)]);
  const lab = (prefs && prefs.lab) || {}, lt = Array.isArray(lab.lt) ? lab.lt : [], od = Array.isArray(lab.odo) ? lab.odo : [];
  const trips = [t0, t1].flatMap(d => d && Array.isArray(d.list) ? d.list : []);
  const v = rs.concat(cs).map(x => Number(x.odometerKm)).concat(lt.map(x => Number(x && x.km)), od.map(x => Number(x && x.km1)), trips.map(x => Number(x && x.o1)), [Number(carKm)]).filter(k => k > 0);
  return v.length ? Math.max(...v) : null;
}
const kmF = (k) => Math.round(k).toLocaleString('de-DE');
/** Fällige Erinnerungen: Datum seit dem letzten Lauf (lastDay < dueDate ≤ heute; holt ausgefallene Abende bis 7 Tage nach),
    oder km-Fälligkeit seit dem letzten Lauf überschritten (prevKm < dueKm ≤ km). Laufzeiten und erledigte nicht. */
function remDue(rems, today, km, prevKm, lastDay) {
  if (!lastDay || lastDay >= today) lastDay = iso(new Date(Date.parse(today + 'T12:00:00Z') - 864e5));
  return rems.filter(r => r && r.title && r.kind !== 'run' && !r.doneAt).map(r => {
    const byDate = !!r.dueDate && r.dueDate > lastDay && r.dueDate <= today, byKm = Number(r.dueKm) > 0 && km != null && prevKm != null && prevKm < r.dueKm && km >= r.dueKm;
    return byDate || byKm ? { r, byKm: byKm && !byDate, late: byDate && r.dueDate < today } : null; }).filter(Boolean);
}
const dmy = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
function remMessage(due, km) {
  const sub = (o) => o.byKm ? 'Fällig bei ' + kmF(o.r.dueKm) + ' km · aktuell ' + kmF(km) + ' km' : o.late ? 'Fällig seit ' + dmy(o.r.dueDate) : 'Heute fällig';
  if (due.length === 1) { const o = due[0]; return { title: o.r.title, body: sub(o) + (o.r.note ? '\n' + String(o.r.note).slice(0, 120) : '') }; }
  return { title: due.length + ' Erinnerungen fällig', body: due.map(o => o.r.title).join(' · ').slice(0, 180) };
}
const remPayload = (m, today) => ({ ...m, kind: 'rem', tag: 'rem-' + today, url: '/?go=reminders' });
/* ---- Akku niedrig ---- */
async function lowAccount(uid, email) {                                         // Škoda-Zugang des Kontos; ohne E-Mail aus settings/lowPush (beim Einschalten verschlüsselt gemerkt)
  if (!email) { const d = await fsGetStrings(`enyaqStrom/${uid}/settings/lowPush`).catch(() => null); if (!d || !d.mail) return null;
    let x = ''; try { x = unseal(d.mail); } catch (e) { return null; } const [u, m] = x.split('|'); if (u !== uid || !m) return null; email = m; }
  const acc = await accountForUser({ uid, email }); return usable(acc) ? acc : null;
}
async function carNow(acc, withStatus) {                                         // Akku-%, Ladezustand, km-Stand (+ Schloss/Fenster/Licht) – 1 Abfrage; Limit der Škoda-API: 20/Stunde
  if (acc.demo) return { soc: 64, rangeKm: 262, plug: 'DISCONNECTED', state: 'READY_FOR_CHARGING', at: new Date().toISOString(), km: 1214, st: { doorsLocked: 'YES', locked: 'YES', doors: 'CLOSED', windows: 'CLOSED', lights: 'OFF' }, stAt: new Date(Date.now() - 3600e3).toISOString() };
  const base = 'https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(acc.vin) + '?include=', H = { headers: { 'X-API-Key': acc.key, Accept: 'application/json' } };
  let r = await fetch(base + (withStatus ? 'charging,odometer,status' : 'charging,odometer'), H);
  if (r.status === 400 && withStatus) r = await fetch(base + 'charging,odometer', H);   // Auto ohne Fahrzeugstatus
  if (!r.ok) throw new Error('Škoda ' + r.status); const v = (await r.json()).vehicle || {}, st = (v.charging || {}).status || {}, o = (v.status || {}).overall || null;
  return { soc: st.battery?.stateOfChargeInPercent ?? null, rangeKm: st.battery?.remainingCruisingRangeInMeters != null ? Math.round(st.battery.remainingCruisingRangeInMeters / 1000) : null,
    plug: st.plugConnectionState ?? null, state: st.state ?? null, at: v.charging?.carCapturedTimestamp ?? null, km: v.odometer?.mileageInKm ?? null,
    st: o, stAt: v.status?.carCapturedTimestamp ?? v.odometer?.carCapturedTimestamp ?? v.charging?.carCapturedTimestamp ?? null };
}
/* ---- Auto nicht abgeschlossen (wie vehHealth in der App) ---- */
function vehIssues(o) {
  if (!o) return null; const v = (x) => (x == null || /UNSUPPORTED|UNKNOWN|INVALID/i.test(String(x)) ? null : String(x));
  const lk = v(o.doorsLocked) || v(o.locked), doors = v(o.doors), win = v(o.windows), li = v(o.lights);
  return [lk === 'NO' && 'nicht verriegelt', doors && /OPEN/.test(doors) && 'Tür offen', win && /OPEN/.test(win) && 'Fenster offen', li && /^ON$/.test(li) && 'Licht an'].filter(Boolean);
}
const hm = (t) => new Date(t).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
function vehMessage(issues, stAt, today) {
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1), locked = !issues.includes('nicht verriegelt');
  return { title: locked ? cap(issues.join(' · ')) : 'Auto nicht abgeschlossen', body: (locked ? '' : cap(issues.join(' · ')) + ' · ') + 'Stand ' + (stAt ? hm(stAt) + ' Uhr' : 'unbekannt'),
    kind: 'veh', tag: 'veh-' + today, url: '/' };
}
/* ---- Monatsanfang: Monatsbericht + Fahrtenbuch-Hinweis (einmal je Monat, bis zum 7. nachholbar) ---- */
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
async function monthMessage(uid, ym) {
  const [y, m] = ym.split('-').map(Number), next = m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0');
  const r = await fetch(FS + '/enyaqStrom/' + uid + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + await gToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'readings' }], where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: ym + '-01' } } },
      { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN', value: { stringValue: next + '-01' } } }] } } } }) });
  const rs = r.ok ? (await r.json()).filter(x => x.document).map(x => Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, val(v)]))) : [];
  const ch = rs.filter(x => Number(x.consumedSinceLast) > 0 || (x.place && x.place !== 'home')), kwh = ch.reduce((a, x) => a + (Number(x.consumedSinceLast) || 0), 0), eur = ch.reduce((a, x) => a + (Number(x.cost) || 0), 0);
  /* Fahrtenbuch: nur wer es nutzt (Monat davor vorhanden). Fehlt der Monat oder endet die letzte Fahrt vor den letzten 3 Tagen → Hinweis */
  const pm = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'), [tm, tp] = await Promise.all([fsGet(`enyaqStrom/${uid}/tripMonths/${ym}`).catch(() => null), fsGet(`enyaqStrom/${uid}/tripMonths/${pm}`).catch(() => null)]);
  const lastE = tm && Array.isArray(tm.list) ? tm.list.map(x => String(x && x.e || '')).sort().pop() || '' : '', end = new Date(Date.UTC(y, m, 1) - 3 * 864e5).toISOString().slice(0, 10);
  const tripHint = (tm || tp) && (!lastE || lastE.slice(0, 10) < end);
  if (!ch.length && !tripHint) return null;
  const f = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  return { title: MON[m - 1] + ' ist fertig', body: (ch.length ? ch.length + (ch.length === 1 ? ' Ladung · ' : ' Ladungen · ') + f(kwh, 0) + ' kWh · ' + f(eur, 2) + ' € – Monatsbericht ansehen' : 'Monatsbericht ansehen')
    + (tripHint ? '\nFahrtenbuch für ' + MON[m - 1] + ' noch aus MyŠkoda importieren' : ''), kind: 'mon', tag: 'mon-' + ym, url: '/?go=berichte' };
}
/* ---- Škoda-Schlüssel läuft ab: 7 Tage vorher, am Vortag und am Ablauftag (je Stufe einmal, auch nachgeholt) ---- */
function keyStage(expires, today) {
  if (!expires || isNaN(Date.parse(expires))) return null; const ex = String(expires).slice(0, 10), d = Math.round((Date.parse(ex + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5);
  return d <= 0 ? { stage: 0, d, ex } : d <= 1 ? { stage: 1, d, ex } : d <= 7 ? { stage: 7, d, ex } : null;
}
const keyMessage = (k) => ({ title: k.d < 0 ? 'Škoda-Schlüssel abgelaufen' : 'Škoda-Schlüssel läuft ' + (k.d === 0 ? 'heute' : k.d === 1 ? 'morgen' : 'am ' + dmy(k.ex)) + ' ab',
  body: 'Ohne neuen Schlüssel kommen keine Fahrzeugdaten mehr. In der App unter Konto & Cloud „Škoda-Schlüssel ersetzen“.', kind: 'key', tag: 'key-' + k.ex, url: '/?go=einstellungen' });
const plugged = (c) => /^CONNECTED/i.test(String(c.plug || '')) || /CHARGING/i.test(String(c.state || '')) && !/READY|NOT|ERROR/i.test(String(c.state || ''));
function lowMessage(c, frost) {
  const old = c.at && Date.now() - Date.parse(c.at) > 6 * 3600e3 ? ' (Stand ' + new Date(c.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ')' : '';
  return { title: 'Akku ' + Math.round(c.soc) + ' %' + old, body: 'Heute Abend anstecken?' + (c.rangeKm != null ? ' · noch ca. ' + c.rangeKm + ' km' : '') + (frost ? '\nNachts Frost – Vorheizen braucht zusätzlich Strom.' : ''),
    kind: 'low', tag: 'low-' + iso(new Date()), url: '/' };
}
async function send(list, payload) {
  let ok = 0, gone = 0;
  for (const d of list) { try { await webpush.sendNotification(d.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }); ok++; } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) gone++; } }
  return { ok, gone };
}

/** Ein Konto im Abendlauf: alle Arten getrennt, Fehler einer Art stoppen die anderen nicht. Zustand (pushState) wird am Ende in einem Schritt geschrieben. */
async function runAccount(uid) {
  const o = { uid: uid.slice(0, 6) }, all = await devices(uid); if (!all.length) return null;
  const today = iso(new Date()), L = (f) => all.filter(f), iceL = L(d => d.ice), remL = L(d => d.rem), lowL = L(d => d.low > 0), vehL = L(d => d.veh), monL = L(d => d.mon), keyL = L(d => d.key);
  const [prefs, st0] = await Promise.all([fsGet(`enyaqStrom/${uid}/settings/prefs`), fsGetStrings(`enyaqStrom/${uid}/settings/pushState`).catch(() => null)]);
  const st = { ...(st0 || {}) }; let risk = null, acc = null, car = null;
  if (iceL.length) { try { const { st: is, r, why } = risk = await riskFor(uid, prefs);
      if (!r || r.lvl < is.min) Object.assign(o, { lvl: r ? r.lvl : null, why: why || 'kein Eis' });
      else Object.assign(o, { lvl: r.lvl, ice: await send(iceL, { ...message(r, is), tag: 'ice-' + r.day, url: '/', icon: '/Bilder/ice-icon.png?v=3' }) });
    } catch (e) { o.iceErr = String(e.message || e).slice(0, 120); } }
  /* Auto einmal abfragen (für Akku, Schloss, km-Stand der Erinnerungen und den Schlüssel-Ablauf) */
  try { acc = await lowAccount(uid); if (acc && (lowL.length || vehL.length || remL.length)) car = await carNow(acc, vehL.length > 0); } catch (e) { o.carErr = String(e.message || e).slice(0, 80); }
  if (remL.length) { try { const prevKm = Number(st.remKm) > 0 ? Number(st.remKm) : null, lastDay = /^\d{4}-\d{2}-\d{2}$/.test(st.remDay || '') && st.remDay >= iso(new Date(Date.now() - 7 * 864e5)) ? st.remDay : null;
      const km = await kmNow(uid, prefs, car && car.km), due = remDue(await fsList(`enyaqStrom/${uid}/reminders`), today, km, prevKm, lastDay);
      if (km != null) st.remKm = String(km); st.remDay = today;
      o.rem = due.length ? await send(remL, remPayload(remMessage(due, km), today)) : 0;
    } catch (e) { o.remErr = String(e.message || e).slice(0, 120); } }
  if (lowL.length) { try {
      if (!acc) o.low = 'kein Fahrzeug'; else if (!car || car.soc == null) o.low = 'kein Akku-Stand'; else if (plugged(car)) o.low = 'angesteckt';
      else { if (!risk) risk = await riskFor(uid, prefs).catch(() => null); const frost = !!(risk && risk.r && risk.r.lvl >= 1);
        const to = lowL.filter(d => car.soc < d.low + (frost ? 10 : 0)); o.low = to.length ? await send(to, lowMessage(car, frost)) : 'ok ' + Math.round(car.soc) + ' %'; }
    } catch (e) { o.lowErr = String(e.message || e).slice(0, 120); } }
  if (vehL.length) { try {     /* nur wenn der Stand mindestens 30 Minuten alt ist (Auto steht, niemand steigt gerade aus) */
      const is = car ? vehIssues(car.st) : null, age = car && car.stAt ? Date.now() - Date.parse(car.stAt) : Infinity;
      if (!acc) o.veh = 'kein Fahrzeug'; else if (!is) o.veh = 'kein Status'; else if (!is.length) o.veh = 'ok'; else if (age < 30 * 60e3) o.veh = 'zu frisch';
      else o.veh = await send(vehL, vehMessage(is, car.stAt, today));
    } catch (e) { o.vehErr = String(e.message || e).slice(0, 120); } }
  if (monL.length) { try { const d = new Date(), pm = new Date(d.getFullYear(), d.getMonth() - 1, 15), ym = iso(pm).slice(0, 7);
      if (Number(today.slice(8, 10)) <= 7 && st.monSent !== ym) { const m = await monthMessage(uid, ym); o.mon = m ? await send(monL, m) : 'nichts'; st.monSent = ym; }
    } catch (e) { o.monErr = String(e.message || e).slice(0, 120); } }
  if (keyL.length && acc && !acc.demo) { try { const k = keyStage(acc.expires, today), tag = k ? k.ex + '|' + k.stage : '';
      if (k && st.keySent !== tag) { o.key = await send(keyL, keyMessage(k)); st.keySent = tag; }
    } catch (e) { o.keyErr = String(e.message || e).slice(0, 120); } }
  if (JSON.stringify(st) !== JSON.stringify(st0 || {})) await fsSetStrings(`enyaqStrom/${uid}/settings/pushState`, { ...st, at: new Date().toISOString() }).catch(() => { });
  return o;
}
/** Beispiele für die Testnachrichten (echte Werte, wenn vorhanden) */
async function testPayload(kind, user) {
  const today = iso(new Date());
  if (kind === 'veh') { let c = null; try { const acc = await lowAccount(user.uid, user.email); if (acc) c = await carNow(acc, true); } catch (e) { }
    const is = c ? vehIssues(c.st) : null; return { p: { ...vehMessage(is && is.length ? is : ['nicht verriegelt', 'Fenster offen'], c && c.stAt, today), tag: 'veh-test' }, real: !!(is && is.length), state: is ? (is.length ? is.join(', ') : 'alles zu') : null }; }
  if (kind === 'mon') { const d = new Date(), ym = iso(new Date(d.getFullYear(), d.getMonth() - 1, 15)).slice(0, 7); let m = null; try { m = await monthMessage(user.uid, ym); } catch (e) { }
    return { p: { ...(m || { title: MON[Number(ym.slice(5)) - 1] + ' ist fertig', body: '12 Ladungen · 310 kWh · 96,40 € – Monatsbericht ansehen', kind: 'mon', url: '/?go=berichte' }), tag: 'mon-test' }, real: !!m }; }
  if (kind === 'key') { let acc = null; try { acc = await lowAccount(user.uid, user.email); } catch (e) { }
    const ex = acc && acc.expires && !isNaN(Date.parse(acc.expires)) ? String(acc.expires).slice(0, 10) : null, k = keyStage(ex, today);
    return { p: { ...keyMessage(k || { d: 7, ex: ex || iso(new Date(Date.now() + 7 * 864e5)) }), tag: 'key-test' }, real: !!k, expires: ex }; }
  return null;
}

export default async function handler(req, res) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: 'not_configured', need: ['VAPID_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT'].filter(k => !process.env[k]) });
  webpush.setVapidDetails('mailto:enyaqstrom@users.noreply.github.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);
  try {
    if (req.method === 'POST') {                                               // Testnachricht an die eigenen Geräte
      const user = await verifyUser(req); if (!user) return res.status(401).json({ error: 'unauthorized' });
      const all = await devices(user.uid), body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.low === 'reg') {                                                // Konto merken (E-Mail verschlüsselt, an die uid gebunden), damit der Abendlauf das Auto abfragen darf
        const acc = await accountForUser(user); if (!usable(acc)) return res.status(403).json({ error: 'no_vehicle' });
        await fsSetStrings(`enyaqStrom/${user.uid}/settings/lowPush`, { mail: seal(user.uid + '|' + user.email), at: new Date().toISOString() });
        return res.status(200).json({ ok: true });
      }
      if (body.test === 'low') {                                               // Akku-Test: echter Stand vom Auto, wenn erreichbar
        const list = all.filter(d => d.low > 0); if (!list.length) return res.status(404).json({ error: 'no_device' });
        let c = null, real = false; try { const acc = await lowAccount(user.uid, user.email); if (acc) { c = await carNow(acc); real = c.soc != null; } } catch (e) { }
        if (!real) c = { soc: 17, rangeKm: 62, at: new Date().toISOString() };
        return res.status(200).json({ ...(await send(list, { ...lowMessage(c, false), tag: 'low-test' })), devices: list.length, real, soc: real ? c.soc : null, plugged: real ? plugged(c) : null });
      }
      if (['veh', 'mon', 'key'].includes(body.test)) {
        const list = all.filter(d => d[body.test]); if (!list.length) return res.status(404).json({ error: 'no_device' });
        const t = await testPayload(body.test, user); return res.status(200).json({ ...(await send(list, t.p)), devices: list.length, real: t.real, state: t.state ?? null, expires: t.expires ?? null });
      }
      if (body.test === 'rem') {                                               // Erinnerungs-Test: echte heute fällige, sonst ein typisches Beispiel
        const list = all.filter(d => d.rem); if (!list.length) return res.status(404).json({ error: 'no_device' });
        const today = iso(new Date()); let due = []; try { due = remDue(await fsList(`enyaqStrom/${user.uid}/reminders`), today, null, null, null); } catch (e) { }
        const m = due.length ? remMessage(due, null) : { title: 'Inspektion', body: 'Heute fällig' };
        return res.status(200).json({ ...(await send(list, { ...remPayload(m, today), tag: 'rem-test' })), devices: list.length, real: due.length });
      }
      const list = all.filter(d => d.ice).length ? all.filter(d => d.ice) : all; if (!list.length) return res.status(404).json({ error: 'no_device' });
      // Test = genau so, wie die echte Warnung aussieht: bei Eis-Risiko mit den echten Werten für morgen, sonst mit einem typischen Beispiel
      let st = iceSet(null), r = null; try { const x = await riskFor(user.uid); st = x.st; r = x.r; } catch (e) { }
      if (!r || r.lvl < 1) r = { lvl: 2, T: -1, minTg: -4.4, cc: 5, ws: 0.6, glaze: false };
      const payload = { ...message(r, st), tag: 'ice-test', url: '/', icon: '/Bilder/ice-icon.png?v=3' };
      return res.status(200).json({ ...(await send(list, payload)), devices: list.length });
    }
    const secret = process.env.CRON_SECRET, auth = req.headers.authorization || '', ua = String(req.headers['user-agent'] || '');
    if (secret ? auth !== 'Bearer ' + secret && req.query.key !== secret : !ua.startsWith('vercel-cron')) return res.status(401).json({ error: 'unauthorized' });
    /* Konten zu viert gleichzeitig (Zeitlimit in vercel.json); ein Fehler bei einem Konto stoppt die anderen nicht */
    const uids = await fsUids(), out = []; let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, uids.length) }, async () => {
      while (next < uids.length) { const uid = uids[next++]; try { const o = await runAccount(uid); if (o) out.push(o); } catch (e) { out.push({ uid: uid.slice(0, 6), error: String(e.message || e).slice(0, 120) }); } }
    }));
    return res.status(200).json({ at: new Date().toISOString(), users: out });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
