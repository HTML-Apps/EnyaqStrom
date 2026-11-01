// Eis-Warnung als Push-Benachrichtigung.
// GET  (Vercel-Zeitplan, täglich am frühen Abend): für jedes Konto mit eingeschalteter Benachrichtigung das Eis-Risiko für morgen früh
//      berechnen (gleiche Formel wie in der App) und bei „möglich“/„wahrscheinlich“ eine Nachricht an alle angemeldeten Geräte schicken.
// POST (aus der App, mit Anmelde-Token): { test: true } schickt sofort eine Testnachricht an die eigenen Geräte.
// Benötigte Vercel-Variablen: VAPID_PRIVATE_KEY (Web-Push), FIREBASE_SERVICE_ACCOUNT (JSON des Firebase-Dienstkontos, nur Lesen),
// optional CRON_SECRET (schützt den Zeitplan-Aufruf; ohne Variable nur Aufrufe von Vercels Zeitplan).
import webpush from 'web-push';
import { SignJWT, importPKCS8 } from 'jose';
import { verifyUser } from '../lib/auth.js';

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
async function riskFor(uid) {
  const [prefs, places] = await Promise.all([fsGet(`enyaqStrom/${uid}/settings/prefs`), fsGet(`enyaqStrom/${uid}/settings/places`)]);
  const st = iceSet(prefs && prefs.settings); if (st.park === 'garage') return { st, r: null };
  const home = places && Array.isArray(places.places) ? places.places.find(p => p && p.kind === 'home' && Number.isFinite(p.lat)) : null, loc = home || (prefs && prefs.wxLoc);
  if (!loc || !Number.isFinite(loc.lat)) return { st, r: null, why: 'kein Ort „Zuhause“' };
  const tm = new Date(Date.now() + 864e5), day = iso(tm), wd = new Date(day + 'T12:00:00Z').getUTCDay();
  if (!st.we && (wd === 0 || wd === 6)) return { st, r: null, why: 'Wochenende' };
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,precipitation&wind_speed_unit=ms&timezone=Europe%2FBerlin&forecast_days=3`);
  if (!w.ok) throw new Error('Wetter ' + w.status); return { st, r: iceEval((await w.json()).hourly, day, st) };
}
async function devices(uid) { const d = await fsGet(`enyaqStrom/${uid}/settings/push`); return Object.entries((d && d.devices) || {}).filter(([, v]) => v && v.sub).map(([id, v]) => ({ id, sub: JSON.parse(v.sub) })); }
async function send(list, payload) {
  let ok = 0, gone = 0;
  for (const d of list) { try { await webpush.sendNotification(d.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }); ok++; } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) gone++; } }
  return { ok, gone };
}

export default async function handler(req, res) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: 'not_configured', need: ['VAPID_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT'].filter(k => !process.env[k]) });
  webpush.setVapidDetails('mailto:enyaqstrom@users.noreply.github.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);
  try {
    if (req.method === 'POST') {                                               // Testnachricht an die eigenen Geräte
      const user = await verifyUser(req); if (!user) return res.status(401).json({ error: 'unauthorized' });
      const list = await devices(user.uid); if (!list.length) return res.status(404).json({ error: 'no_device' });
      // Test = genau so, wie die echte Warnung aussieht: bei Eis-Risiko mit den echten Werten für morgen, sonst mit einem typischen Beispiel
      let st = iceSet(null), r = null; try { const x = await riskFor(user.uid); st = x.st; r = x.r; } catch (e) { }
      if (!r || r.lvl < 1) r = { lvl: 2, T: -1, minTg: -4.4, cc: 5, ws: 0.6, glaze: false };
      const payload = { ...message(r, st), tag: 'ice-test', url: '/', icon: '/Bilder/ice-icon.png' };
      return res.status(200).json({ ...(await send(list, payload)), devices: list.length });
    }
    const secret = process.env.CRON_SECRET, auth = req.headers.authorization || '', ua = String(req.headers['user-agent'] || '');
    if (secret ? auth !== 'Bearer ' + secret && req.query.key !== secret : !ua.startsWith('vercel-cron')) return res.status(401).json({ error: 'unauthorized' });
    const out = [];
    for (const uid of await fsUids()) {
      try { const list = await devices(uid); if (!list.length) continue; const { st, r, why } = await riskFor(uid);
        if (!r || r.lvl < st.min) { out.push({ uid: uid.slice(0, 6), lvl: r ? r.lvl : null, why: why || 'kein Eis' }); continue; }
        out.push({ uid: uid.slice(0, 6), lvl: r.lvl, ...(await send(list, { ...message(r, st), tag: 'ice-' + r.day, url: '/', icon: '/Bilder/ice-icon.png' })) });
      } catch (e) { out.push({ uid: uid.slice(0, 6), error: String(e.message || e).slice(0, 120) }); }
    }
    return res.status(200).json({ at: new Date().toISOString(), users: out });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
