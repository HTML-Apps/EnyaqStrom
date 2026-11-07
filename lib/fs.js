// Firestore (REST) mit dem Firebase-Dienstkonto (Vercel-Variable FIREBASE_SERVICE_ACCOUNT) – nur serverseitig.
import { SignJWT, importPKCS8 } from 'jose';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PROJECT_ID = 'daily-companion-24975';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
let tok = null, tokExp = 0;
const sa = () => JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

export async function gToken() {
  if (tok && Date.now() < tokExp) return tok;
  const s = sa(), key = await importPKCS8(s.private_key, 'RS256'), now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(s.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const j = await r.json(); if (!j.access_token) throw new Error('Dienstkonto: kein Zugriffstoken (' + (j.error_description || j.error || r.status) + ')');
  tok = j.access_token; tokExp = Date.now() + 50 * 60e3; return tok;
}
/** Dokument lesen → { feld: Textwert } (nur Text-Felder) oder null */
export async function fsGetStrings(path) {
  const r = await fetch(FS + '/' + path, { headers: { Authorization: 'Bearer ' + await gToken() } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('Firestore ' + r.status);
  const j = await r.json(); return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, v.stringValue ?? null]));
}
/** Dokument mit Text-Feldern komplett schreiben */
export async function fsSetStrings(path, obj) {
  const fields = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { stringValue: String(v) }]));
  const r = await fetch(FS + '/' + path, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await gToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('Firestore ' + r.status + (r.status === 403 ? ' (Dienstkonto darf nicht schreiben – Rolle „Cloud Datastore User“ ergänzen)' : ''));
}
/* Geheimnisse verschlüsselt ablegen (AES-256-GCM, Schlüssel aus dem Dienstkonto abgeleitet) – im Dokument steht nie der Klartext */
const encKey = () => createHash('sha256').update(sa().private_key + '|enyaq-skoda-key-v1').digest();
export function seal(text) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', encKey(), iv), enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function unseal(s) {
  const [iv, tag, enc] = String(s).split('.').map(x => Buffer.from(x, 'base64')), d = createDecipheriv('aes-256-gcm', encKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
