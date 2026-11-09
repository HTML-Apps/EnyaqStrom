// Vercel Function: dauerhafte Google-Freigabe (Google Tasks + Drive „nur eigene Dateien“), damit die App ohne Google-Fenster an
// Tasks und Drive kommt. Einmal zustimmen → Google gibt dem Server ein Refresh-Token; das liegt verschlüsselt in
// enyaqStrom/<uid>/settings/google (lib/fs.js seal). Die App holt sich damit bei Bedarf ein kurzlebiges Zugriffstoken.
//   GET  /api/google?action=status   (Firebase-Token) -> { linked }
//   GET  /api/google?action=start    (Firebase-Token) -> { url }   Zustimmungsseite von Google (App leitet dorthin weiter)
//   GET  /api/google?code=…&state=…  Rücksprung von Google (ohne Firebase-Token, „state“ ist signiert) -> Weiterleitung /?go=gt-ok bzw. gt-err
//   GET  /api/google?action=token    (Firebase-Token) -> { access_token, expires_in }
//   POST /api/google {action:'unlink'} (Firebase-Token) -> Freigabe bei Google widerrufen und löschen
// Vercel-Variablen: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth-Client „Webanwendung“ im Google-Cloud-Projekt der Firebase-App),
// dort als autorisierte Weiterleitungs-URI eingetragen: https://enyaqstromapp.vercel.app/api/google
import { verifyUser } from '../lib/auth.js';
import { fsGetStrings, fsSetStrings, seal, unseal, sign } from '../lib/fs.js';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/drive.file'];
const norm = (e) => String(e || '').trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');
const docPath = (uid) => `enyaqStrom/${uid}/settings/google`;
const redirectUri = (req) => process.env.GOOGLE_REDIRECT_URI || 'https://' + (req.headers['x-forwarded-host'] || req.headers.host) + '/api/google';
const back = (res, q) => { res.setHeader('Location', '/?go=' + q); return res.status(302).end(); };

async function storedRt(uid) {
  const d = await fsGetStrings(docPath(uid)).catch(() => null);
  try { return d && d.rt ? unseal(d.rt) : null; } catch { return null; }
}
async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }) });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.FIREBASE_SERVICE_ACCOUNT)
    return req.query.code ? back(res, 'gt-err&m=' + encodeURIComponent('Server noch nicht eingerichtet')) : res.status(503).json({ error: 'Google-Zugang auf dem Server noch nicht eingerichtet (GOOGLE_CLIENT_ID/SECRET fehlen)' });

  /* Rücksprung von Google nach der Zustimmung */
  if (req.method === 'GET' && (req.query.code || req.query.error)) {
    if (req.query.error) return back(res, 'gt-err&m=' + encodeURIComponent(req.query.error === 'access_denied' ? 'Zustimmung abgebrochen' : String(req.query.error)));
    const [body, sig] = String(req.query.state || '').split('~');
    if (!body || sig !== sign(body)) return back(res, 'gt-err&m=' + encodeURIComponent('Ungültige Anfrage'));
    let st; try { st = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return back(res, 'gt-err&m=' + encodeURIComponent('Ungültige Anfrage')); }
    if (!st.uid || Date.now() - st.t > 15 * 60e3) return back(res, 'gt-err&m=' + encodeURIComponent('Zu lange gewartet – bitte nochmal'));
    const t = await googleToken({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri(req) });
    if (!t.ok) return back(res, 'gt-err&m=' + encodeURIComponent('Google: ' + (t.j.error_description || t.j.error || t.status)));
    if (!t.j.refresh_token) return back(res, 'gt-err&m=' + encodeURIComponent('Google hat keine dauerhafte Freigabe geliefert'));
    /* Das gewählte Google-Konto muss das angemeldete sein (sonst kämen fremde Aufgaben in die App) */
    let mail = ''; try { mail = JSON.parse(Buffer.from(String(t.j.id_token).split('.')[1], 'base64url').toString('utf8')).email; } catch { }
    if (norm(mail) !== norm(st.email)) {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.j.refresh_token), { method: 'POST' }).catch(() => { });
      return back(res, 'gt-err&m=' + encodeURIComponent('Bitte dasselbe Google-Konto wählen wie in der App (' + st.email + ')'));
    }
    await fsSetStrings(docPath(st.uid), { rt: seal(t.j.refresh_token), scope: t.j.scope || '', at: new Date().toISOString() });
    return back(res, 'gt-ok');
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const action = String(req.query.action || req.body?.action || '');

  if (action === 'start') {
    const body = Buffer.from(JSON.stringify({ uid: user.uid, email: user.email, t: Date.now() })).toString('base64url');
    const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', login_hint: user.email, state: body + '~' + sign(body) });
    return res.status(200).json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
  }
  if (action === 'status') return res.status(200).json({ linked: !!(await storedRt(user.uid)) });
  if (action === 'token') {
    const rt = await storedRt(user.uid); if (!rt) return res.status(404).json({ error: 'Nicht verbunden', linked: false });
    const t = await googleToken({ grant_type: 'refresh_token', refresh_token: rt });
    if (!t.ok) {
      if (t.j.error === 'invalid_grant') { await fsSetStrings(docPath(user.uid), { rt: '', at: new Date().toISOString() }).catch(() => { }); return res.status(410).json({ error: 'Google-Freigabe abgelaufen oder widerrufen – bitte neu verbinden', linked: false }); }
      return res.status(502).json({ error: 'Google: ' + (t.j.error_description || t.j.error || t.status) });
    }
    return res.status(200).json({ access_token: t.j.access_token, expires_in: t.j.expires_in || 3600 });
  }
  if (action === 'unlink' && req.method === 'POST') {
    const rt = await storedRt(user.uid);
    if (rt) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }).catch(() => { });
    await fsSetStrings(docPath(user.uid), { rt: '', at: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'Unbekannte Aktion' });
}
