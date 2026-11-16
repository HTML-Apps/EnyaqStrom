// Neuigkeiten aus Enyaq-Foren (Widget „Neuigkeiten“ auf Start, src/23-neuigkeiten.js).
//   GET ?src=ef3,ef8,el,sb,bk  -> { items:[{s, g, t, u, d, f}], at, err:{src:msg} }   (öffentliche Beiträge, keine Anmeldung nötig; efNN = Bereich NN von enyaq-forum.de)
//   GET ?diag=1            -> je Quelle: gefundene Feed-Adressen, Status, Anzahl (zum Prüfen, welche Feeds wirklich gehen)
// Feeds werden je Quelle 30 Min. im Speicher gehalten, die Antwort zusätzlich im Vercel-CDN (s-maxage) – die Foren sehen höchstens ~2 Abrufe pro Stunde.
const UA = 'Mozilla/5.0 (compatible; EnyaqStrom/1.0; +https://enyaqstromapp.vercel.app)';
const TTL = 30 * 60e3, MAX = 40;
const cache = new Map();                                                         // src -> { at, items, feeds, err }

/* Quellen: feste Liste (keine fremden Adressen von außen), geprüft 11/2026 per ?diag=1. GoingElectric, TFF-Forum und electrive-Seiten (nicht der Feed)
   sperren Server-Abrufe (403) – nicht umgehen. find() liefert Feed-Adressen; mehrere Kandidaten, die erste mit Einträgen gewinnt.
   g = Gruppe für die Chips in der App: forum · news · skoda · en */
const EF_BOARDS = [2, 3, 4, 5, 6, 7, 8, 9, 12, 38, 39, 43, 49];                  // enyaq-forum.de-Bereiche, die die App anbietet (efNN)
const SOURCES = {
  ef: { name: 'enyaq-forum.de', g: 'forum', async find(log) { return [[...await discover('https://www.enyaq-forum.de/forum/', log), 'https://www.enyaq-forum.de/forum/board-feed/']]; }, keep: () => true },
  mt: { name: 'Motor-Talk', g: 'forum', async find(log) { return [['https://www.motor-talk.de/forum/skoda-elektrofahrzeuge-b1114.rss']]; }, keep: () => true },
  el: { name: 'electrive', g: 'news', async find() { return [['https://www.electrive.net/tag/enyaq/feed/']]; }, keep: () => true },
  ec: { name: 'ecomento', g: 'news', async find() { return [['https://ecomento.de/tag/skoda-enyaq-iv/feed/']]; }, keep: () => true },
  sb: { name: 'Škoda Storyboard', g: 'skoda', async find() { return [['https://www.skoda-storyboard.com/de/feed/']]; }, keep: (it) => /enyaq|elroq|software|my\s?škoda|my\s?skoda|update/i.test(it.t) },
  bk: { name: 'BRISKODA', g: 'en', async find() { return [['https://www.briskoda.net/forums/forum/399-skoda-enyaq.xml/']]; }, keep: () => true }
};
for (const id of EF_BOARDS) SOURCES['ef' + id] = { name: 'enyaq-forum.de', g: 'forum', async find() { return [['https://www.enyaq-forum.de/forum/board-feed/' + id + '/']]; }, keep: () => true };

async function get(url, log) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
    const t = r.ok ? await r.text() : '';
    log && log.push(r.status + ' ' + url + (r.ok ? ' (' + t.length + ' B)' : ''));
    return r.ok ? t : null;
  } catch (e) { log && log.push('ERR ' + url + ' ' + (e.name === 'TimeoutError' ? 'Zeitüberschreitung' : e.message)); return null; }
}
const abs = (h, base) => { try { return new URL(h.replace(/&amp;/g, '&'), base).href; } catch (e) { return null; } };
/** <link rel="alternate" type="application/rss+xml|atom+xml" href> einer Seite */
async function discover(page, log) {
  const h = await get(page, log); if (!h) return [];
  const out = []; for (const m of h.matchAll(/<link\b[^>]*>/gi)) { const tag = m[0]; if (!/rel=["']?alternate/i.test(tag) || !/(rss|atom)\+xml/i.test(tag)) continue; const hr = /href=["']([^"']+)/i.exec(tag); const u = hr && abs(hr[1], page); if (u && !out.includes(u)) out.push(u); }
  return out;
}
/** enyaq-forum.de (WoltLab): Thread-Link auf den neuesten Beitrag (?action=lastPost springt auf die letzte Seite + Anker) */
const efLast = (u) => /^https:\/\/www\.enyaq-forum\.de\/forum\/thread\/\d+[^?#]*$/.test(u) ? u + '?action=lastPost' : u;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', bull: '•', ndash: '–', mdash: '—', hellip: '…', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', deg: '°' };
const dec = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);
const tagv = (x, t) => { const m = new RegExp('<' + t + '\\b[^>]*>([\\s\\S]*?)</' + t + '>', 'i').exec(x); return m ? dec(m[1]).trim() : ''; };
const plain = (s) => dec(String(s).replace(/<!\[CDATA\[|\]\]>/g, '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** RSS 2.0 oder Atom → [{t, u, d, f}] */
function parse(xml) {
  const out = [], atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  for (const m of xml.matchAll(atom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)) {
    const x = m[0]; let t = plain(tagv(x, 'title')), u = '';
    if (atom) { const l = /<link\b[^>]*rel=["']alternate["'][^>]*>/i.exec(x) || /<link\b[^>]*>/i.exec(x); u = l ? (/href=["']([^"']+)/i.exec(l[0])?.[1] || '') : ''; }
    else u = tagv(x, 'link') || tagv(x, 'guid');
    const dRaw = tagv(x, atom ? 'updated' : 'pubDate') || tagv(x, 'published') || tagv(x, 'dc:date'), d = Date.parse(dRaw);
    const f = atom ? dec(/<category\b[^>]*(?:term|label)=["']([^"']+)/i.exec(x)?.[1] || '') : plain(tagv(x, 'category'));
    const body = plain(tagv(x, atom ? 'content' : 'description') || tagv(x, 'summary')).slice(0, 160);
    if (!t) t = body.slice(0, 140);
    u = dec(u).trim(); if (!t || !/^https?:\/\//.test(u)) continue;
    out.push({ t: t.slice(0, 200), u: u.slice(0, 500), d: Number.isFinite(d) ? new Date(d).toISOString() : null, f: f.slice(0, 80), x: body });
  }
  return out;
}
/** Antworten im selben Thema zusammenfassen (phpBB/WoltLab liefern oft Beiträge statt Themen): „Re: …“ und „Forum • Thema“ kürzen, je Thema der neueste */
function topics(items, s) {
  const by = new Map();
  for (const it of items) {
    let t = it.t.replace(/^(?:AW|Re|Antwort)\s*:\s*/i, '');
    const k = t.toLowerCase(), o = by.get(k);
    if (!o) by.set(k, { ...it, t, n: 1 }); else { o.n++; if ((it.d || '') > (o.d || '')) { o.d = it.d; o.u = it.u; } }
  }
  return [...by.values()];
}
async function loadSource(s, diag) {
  const c = cache.get(s); if (!diag && c && Date.now() - c.at < TTL) return c;
  const src = SOURCES[s], log = [], res = { at: Date.now(), items: [], feeds: [], err: null, log };
  try {
    const groups = (c && c.feeds && c.feeds.length && !diag) ? c.feeds.map(f => [f]) : await src.find(log);   // gefundene Feeds merken (Suche nur beim ersten Mal)
    for (const g of groups) {
      for (const f of g) { const x = await get(f, log); if (!x) continue; const it = parse(x); log.push('  → ' + it.length + ' Einträge'); if (it.length) { res.feeds.push(f); res.items.push(...it); break; } }
    }
    const b = /^ef(\d+)$/.exec(s)?.[1];
    res.items = topics(res.items.filter(src.keep), s).map(x => ({ s: b ? 'ef' : s, g: src.g, ...(b ? { b: Number(b) } : {}), ...x }));
    if (src.g === 'forum' && s.startsWith('ef')) res.items.forEach(x => { x.u = efLast(x.u); });   // WoltLab: direkt zum neuesten Beitrag statt Seite 1
    if (!res.items.length) res.err = 'keine Einträge gefunden';
  } catch (e) { res.err = e.message; }
  if (!res.items.length && c && c.items.length) { cache.set(s, { ...c, at: Date.now() - TTL + 5 * 60e3 }); return { ...c, err: res.err, log }; }   // Fehler: alten Stand behalten, in 5 Min. neu versuchen
  cache.set(s, res); return res;
}

export default async function handler(req, res) {
  const q = req.query || {}, diag = q.diag === '1';
  const want = [...new Set(String(q.src || 'ef3,ef5,ef8,ef9,ef49,el,sb,bk').split(',').map(x => x.trim()).filter(x => SOURCES[x]))].slice(0, 16);
  if (diag) {
    res.setHeader('Cache-Control', 'no-store');
    const out = {}; await Promise.all(Object.keys(SOURCES).filter(s => q.all === '1' || !/^ef\d+$/.test(s) || s === 'ef8').map(async s => { const r = await loadSource(s, true); out[s] = { name: SOURCES[s].name, feeds: r.feeds, n: r.items.length, err: r.err, sample: r.items.slice(0, 3).map(x => x.t), log: r.log }; }));
    if (q.boards === '1') {   // Unterbereiche von enyaq-forum.de (für Feeds je Bereich: /forum/board-feed/<id>/)
      const h = await get('https://www.enyaq-forum.de/forum/') || '', seen = new Set();
      out.efBoards = [...h.matchAll(/href="https:\/\/www\.enyaq-forum\.de\/forum\/board\/(\d+)-[^"]*"[^>]*>([^<]{2,80})</g)].map(m => [m[1], m[2].trim()]).filter(([id]) => !seen.has(id) && seen.add(id));
    }
    return res.status(200).json(out);
  }
  const rs = await Promise.all(want.map(s => loadSource(s)));
  const err = {}; rs.forEach((r, i) => { if (r.err) err[want[i]] = r.err; });
  const dup = new Set(), items = rs.flatMap(r => r.items.map(({ n, x, ...o }) => o)).sort((a, b) => (b.d || '').localeCompare(a.d || '')).filter(x => !dup.has(x.u) && dup.add(x.u)).slice(0, MAX);
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  res.status(200).json({ items, at: new Date(Math.min(...rs.map(r => r.at), Date.now())).toISOString(), err });
}
