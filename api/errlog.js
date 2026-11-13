// Fehlerprotokoll: die App meldet unerwartete Fehler (src/22-fehlerprotokoll.js), damit sie auch von anderen Geräten/Konten sichtbar werden.
//   POST {items:[{m,s,st,t,n,v,p}]}  (angemeldet) -> speichert je Eintrag ein Dokument in enyaqErrLog/ (nur der Server darf dort lesen/schreiben),
//                                    höchstens DAY_MAX Einträge je Konto und Tag (Zähler in enyaqErrQuota/<uid>), darüber 429
//   GET  ?check=1                    -> { admin }   (Entwickler-Konto: SHA-256 der E-Mail, keine Adresse im Klartext – Repo ist öffentlich)
//   GET                              -> neueste 80 Einträge aller Konten (nur Entwickler)
//   DELETE                           -> alle Einträge löschen (nur Entwickler)
import { createHash, randomBytes } from 'node:crypto';
import { verifyUser } from '../lib/auth.js';
import { gToken, fsSetStrings, fsGetStrings } from '../lib/fs.js';

const PROJECT_ID = 'daily-companion-24975';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ADMINS = ['dd13cdb504b32c7cfbe816c1bc457f887c9ff69309a5fe47e3036c488e28315a'];
const isAdmin = (email) => ADMINS.includes(createHash('sha256').update(String(email)).digest('hex'));
const DAY_MAX = 50;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function uaShort(ua) {
  ua = String(ua || ''); const os = /Android [\d.]+/.exec(ua)?.[0] || (/iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '?');
  const br = /SamsungBrowser\/[\d.]+/.exec(ua)?.[0] || /Edg\/\d+/.exec(ua)?.[0] || /Firefox\/\d+/.exec(ua)?.[0] || /Chrome\/\d+/.exec(ua)?.[0] || /Version\/[\d.]+ Safari/.exec(ua)?.[0] || '';
  return (os + ' · ' + br).replace(/\/([\d]+)[\d.]*/g, ' $1');
}
async function list(n) {
  const r = await fetch(FS + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + await gToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'enyaqErrLog' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: n } }) });
  if (!r.ok) throw new Error('Firestore ' + r.status);
  return (await r.json()).filter(x => x.document).map(x => ({ name: x.document.name, ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, v.stringValue ?? null])) }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: 'not_configured' });
  const user = await verifyUser(req); if (!user) return res.status(401).json({ error: 'unauthorized' });
  const admin = isAdmin(user.email);
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const day = new Date().toISOString().slice(0, 10), q = await fsGetStrings('enyaqErrQuota/' + user.uid).catch(() => null), used = q && q.day === day ? Number(q.n) || 0 : 0;
      if (used >= DAY_MAX) return res.status(429).json({ error: 'limit', max: DAY_MAX });
      const items = (Array.isArray(body.items) ? body.items.slice(0, 10) : []).filter(x => x && x.m).slice(0, DAY_MAX - used), ua = uaShort(req.headers['user-agent']), who = user.email.split('@')[0].slice(0, 3) + '…';
      await fsSetStrings('enyaqErrQuota/' + user.uid, { day, n: String(used + items.length) });
      for (const x of items) {
        if (!x || !x.m) continue;
        await fsSetStrings('enyaqErrLog/' + Date.now() + '-' + randomBytes(4).toString('hex'), { at: new Date().toISOString(), t: str(x.t, 30), m: str(x.m, 300), s: str(x.s, 160), st: str(x.st, 600),
          n: str(Number(x.n) || 1, 6), v: str(x.v, 10), p: str(x.p, 60), ua, who, uid: user.uid.slice(0, 6) });
      }
      return res.status(200).json({ ok: true, n: items.length });
    }
    if (req.method === 'GET') {
      if (req.query && req.query.check) return res.status(200).json({ admin });
      if (!admin) return res.status(403).json({ error: 'forbidden' });
      return res.status(200).json({ items: (await list(80)).map(({ name, ...x }) => x) });
    }
    if (req.method === 'DELETE') {
      if (!admin) return res.status(403).json({ error: 'forbidden' });
      const all = await list(300); for (const d of all) await fetch('https://firestore.googleapis.com/v1/' + d.name, { method: 'DELETE', headers: { Authorization: 'Bearer ' + await gToken() } });
      return res.status(200).json({ ok: true, n: all.length });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 160) }); }
}
