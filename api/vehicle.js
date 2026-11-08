// Vercel Function: liefert Ladestand, Ladeziel und km-Stand vom Škoda-Server (offizielle MyŠkoda Public API).
// Anmeldung per Firebase-Token (Header "Authorization: Bearer <Token>"). Welcher API-Schlüssel und welche VIN gelten,
// steht in der Vercel-Variable SKODA_ACCOUNTS (siehe lib/auth.js). Die Schlüssel verlassen den Server nie.
//   GET /api/vehicle?check=1  -> { enabled, keyExpires }   (keine Škoda-Abfrage, zählt nicht gegen das Limit)
//   GET /api/vehicle?raw=1    -> rohe Škoda-Antwort ohne VIN (Diagnose: welche Felder gibt es?)
//   GET /api/vehicle          -> Fahrzeugdaten (Limit der Škoda-API: 20 Anfragen/Stunde/Fahrzeug -> 60 s Cache je Konto)
//   POST /api/vehicle {newKey} -> neuen API-Schlüssel aus der App übernehmen: erst beim Škoda-Server prüfen, dann verschlüsselt speichern
//                                (hat danach Vorrang vor dem Schlüssel in SKODA_ACCOUNTS; VIN/Freischaltung bleiben dort)
import { verifyUser, accountForUser, forgetAccountCache } from '../lib/auth.js';
import { fsSetStrings, seal } from '../lib/fs.js';

const cache = new Map();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Nur GET oder POST erlaubt' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const acc = await accountForUser(user);

  if (acc && acc.demo) return demo(req, res);                    // Testkonto: feste Werte, kein Škoda-Server

  if (req.method === 'POST') {                                   // Schlüssel in der App ersetzen
    if (!acc) return res.status(403).json({ error: 'Für dieses Konto sind keine Fahrzeugdaten hinterlegt' });
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: 'Speichern nicht eingerichtet (FIREBASE_SERVICE_ACCOUNT fehlt)' });
    const nk = String(req.body?.newKey || '').trim();
    if (nk.length < 16 || nk.length > 400 || /\s/.test(nk)) return res.status(400).json({ error: 'Das sieht nicht wie ein Škoda-API-Schlüssel aus' });
    try {
      const r = await fetch('https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(acc.vin) + '?include=odometer', { headers: { 'X-API-Key': nk, Accept: 'application/json' } });
      if (r.status === 401) return res.status(400).json({ error: 'Der Škoda-Server kennt diesen Schlüssel nicht (ungültig oder abgelaufen)' });
      if (r.status === 403) return res.status(400).json({ error: 'Der Schlüssel gilt nicht für dein Fahrzeug' });
      if (r.status === 429) return res.status(429).json({ error: 'Abfrage-Limit erreicht – bitte in ein paar Minuten erneut versuchen' });
      if (!r.ok) return res.status(502).json({ error: 'Škoda-Server antwortet mit Fehler ' + r.status });
      const ex = r.headers.get('x-api-key-expires-at'), exp = ex && !isNaN(Date.parse(ex)) ? new Date(ex).toISOString().slice(0, 10) : '';
      await fsSetStrings(`enyaqStrom/${user.uid}/settings/skoda`, { key: seal(nk), expires: exp, at: new Date().toISOString() });
      forgetAccountCache(user.uid); cache.delete(user.email);
      return res.status(200).json({ ok: true, expires: exp || null });
    } catch (err) { return res.status(500).json({ error: String(err.message || err).slice(0, 160) }); }
  }

  if (req.query && req.query.check) return res.status(200).json({ enabled: !!acc, keyExpires: acc?.expires ?? null });
  if (!acc) return res.status(403).json({ error: 'Für dieses Konto sind keine Fahrzeugdaten hinterlegt' });

  /* Diagnose: rohe Antwort des Škoda-Servers (ohne VIN), um zu sehen, welche Felder das Fahrzeug liefert (z. B. Akkutemperatur).
     Versucht zusätzlich die Klimatisierung; wird sie nicht unterstützt, nur Laden + km-Stand. Zählt gegen das Abfrage-Limit. */
  if (req.query && req.query.raw) {
    try {
      const base = 'https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(acc.vin) + '?include=';
      let r, inc;
      for (inc of ['charging,odometer,status,air-conditioning', 'charging,odometer,status', 'charging,odometer']) { r = await fetch(base + inc, { headers: { 'X-API-Key': acc.key, Accept: 'application/json' } }); if (r.status !== 400) break; }
      const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (e) { }
      const strip = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (/^vin$/i.test(k) || /licen[cs]ePlate/i.test(k)) o[k] = '…'; else strip(o[k]); } return o; };
      return res.status(200).json({ status: r.status, include: inc, data: data ? strip(data) : text.slice(0, 2000) });
    } catch (err) { return res.status(502).json({ error: 'Škoda-Server nicht erreichbar' }); }
  }

  const hit = cache.get(user.email);
  if (hit && Date.now() - hit.at < 60_000) return res.status(200).json(hit.body);

  try {
    /* mit Fahrzeugstatus (Türen/Schloss); unterstützt das Auto ihn nicht (400), nur Laden + km-Stand */
    const base = 'https://public.api.connect.skoda-auto.cz/api/v1/vehicles/' + encodeURIComponent(acc.vin) + '?include=', H = { 'X-API-Key': acc.key, Accept: 'application/json' };
    let r = await fetch(base + 'charging,odometer,status', { headers: H });
    if (r.status === 400) r = await fetch(base + 'charging,odometer', { headers: H });
    if (!r.ok) {
      const msg = { 401: 'Škoda-API-Schlüssel abgelaufen oder ungültig', 403: 'Schlüssel gilt nicht für dieses Fahrzeug', 429: 'Abfrage-Limit erreicht, bitte später erneut versuchen' }[r.status] || ('Škoda-API Fehler ' + r.status);
      return res.status(502).json({ error: msg });
    }
    const data = await r.json();
    const v = data.vehicle || {}, ch = v.charging || {}, st = v.status || {};
    const body = {                                          // fehlende Felder bleiben null (= unbekannt)
      soc: ch.status?.battery?.stateOfChargeInPercent ?? null,
      rangeKm: ch.status?.battery?.remainingCruisingRangeInMeters != null ? Math.round(ch.status.battery.remainingCruisingRangeInMeters / 1000) : null,
      chargeState: ch.status?.state ?? null,
      plug: ch.status?.plugConnectionState ?? null,
      plugLock: ch.status?.plugLockState ?? null,
      minutesToFull: ch.status?.remainingTimeToFullyChargedInMinutes ?? null,
      fullAt: ch.status?.fullyChargedAt ?? null,
      careMode: ch.settings?.chargingCareMode ?? null,
      atSavedLocation: ch.isVehicleInSavedLocation ?? null,
      doorsLocked: st.overall?.doorsLocked ?? null,
      locked: st.overall?.locked ?? null,
      doors: st.overall?.doors ?? null,
      windows: st.overall?.windows ?? null,
      lights: st.overall?.lights ?? null,
      targetSoc: ch.settings?.targetStateOfChargeInPercent ?? null,
      chargePowerKw: ch.status?.chargePowerInKw ?? null,
      odometerKm: v.odometer?.mileageInKm ?? null,
      capturedAt: ch.carCapturedTimestamp ?? v.odometer?.carCapturedTimestamp ?? null,
      keyExpiresAt: r.headers.get('x-api-key-expires-at') ?? acc.expires ?? null
    };
    cache.set(user.email, { at: Date.now(), body });
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({ error: 'Škoda-Server nicht erreichbar' });
  }
}

/* Demo/Test (SKODA_ACCOUNTS-Eintrag {"demo": true}): fester Zustand eines Epiq in der Garage, damit sich die App ohne Auto und
   ohne API-Schlüssel ausprobieren lässt. Zeitstempel = vor 10 Minuten, damit die Anzeige „aktuell“ wirkt. */
function demo(req, res) {
  if (req.method === 'POST') return res.status(400).json({ error: 'Testkonto: hier gibt es keinen echten Škoda-Schlüssel' });
  if (req.query && req.query.check) return res.status(200).json({ enabled: true, keyExpires: null, demo: true });
  const body = {
    soc: 64, rangeKm: 262, chargeState: 'READY_FOR_CHARGING', plug: 'DISCONNECTED', plugLock: 'UNLOCKED', minutesToFull: null, fullAt: null,
    careMode: 'ACTIVATED', atSavedLocation: true, doorsLocked: 'YES', locked: 'YES', doors: 'CLOSED', windows: 'CLOSED', lights: 'OFF',
    targetSoc: 80, chargePowerKw: null, odometerKm: 1214, capturedAt: new Date(Date.now() - 10 * 60e3).toISOString(), keyExpiresAt: null, demo: true
  };
  if (req.query && req.query.raw) return res.status(200).json({ status: 200, include: 'demo', data: body });
  return res.status(200).json(body);
}
