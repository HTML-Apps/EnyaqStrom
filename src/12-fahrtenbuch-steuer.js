/* =====================================================================
   Fahrtenbuch (Import der CSV aus der MyŠkoda-App: „tripStatistics_<VIN>_….csv“)
   Lokal: enyaq.trips = alle Fahrten. Cloud: enyaqStrom/<uid>/tripMonths/<JJJJ-MM> = { list: [Fahrten des Monats], updatedAt }.
   Pro Monat ein Dokument: Ein Import schreibt nur die Monate, deren Inhalt sich geändert hat (meist der laufende und ggf. der Vormonat),
   statt jedes Mal alle Fahrten. Die ID einer Fahrt ergibt sich aus Start- und Endzeit, damit erkennt ein erneuter Import dieselbe Fahrt wieder.
   Eigene Angaben (Etikett „ucls“) bleiben beim Import erhalten. Orte: enyaq.tripPlaces = [{ id, name, kind: 'home'|'work'|'', lat, lon }],
   Cloud-Dokument enyaqStrom/<uid>/settings/places. Ein Ort gilt für alle Fahrten im Umkreis von 300 m.
   Fahrt: { id, s, e (ISO), cls (Klassifizierung aus der Datei), ucls (eigenes Etikett), a0, a1 (Adressen), p0, p1 ("lat,lon"), km, o0, o1,
            dmin (Fahrzeit), tmin (Reisezeit), v (Ø km/h), kwh, k100, soc0, soc1, pcs (öffentliche Ladestopps), pcg (% dort geladen), short }
   ===================================================================== */
const KEY_TRIPS = 'enyaq.trips', KEY_TPLACES = 'enyaq.tripPlaces', KEY_TRIPS_IMP = 'enyaq.tripsImport';
const getTrips = () => { const l = load(KEY_TRIPS, []); return Array.isArray(l) ? l : []; };
const getTPlaces = () => { const l = load(KEY_TPLACES, []); return Array.isArray(l) ? l : []; };
const tripYM = (t) => { const d = new Date(t.s); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };   // Monat in Ortszeit
const tripVisible = (t) => (t.km || 0) >= 1;                                               // 0-km-„Fahrten“ (Rangieren, Tür auf/zu) ausblenden
/** Schreibweg für Fahrten: lokal speichern + nur geänderte Monatsdokumente in die Cloud. */
function commitTrips(next) {
  const prev = getTrips(); next.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  if (!save(KEY_TRIPS, next)) return false;
  try { setTimeout(() => { ltFillKm(); btFillTrips(); }, 0); } catch (e) { }                                  // Langzeit-Ablesungen per Sprache: km-Stand jetzt genau aus den Fahrten
  if (!window.cloud?.isSignedIn()) return Promise.resolve('local');
  return window.cloud.pushTrips(prev, next).then(n => 'cloud:' + n).catch(e => { console.error('Firestore-Schreibfehler (Fahrten)', e); window.onCloudStatus?.({ error: 'Fahrten: ' + (e.code === 'permission-denied' ? 'Keine Berechtigung für enyaqStrom/<uid>/tripMonths (Firestore-Regel ergänzen)' : e.code || e.message) }); return 'error:' + (e.code || e.message); });
}
const tripSig = (t) => JSON.stringify([t.id, t.s, t.e, t.cls, t.ucls, t.a0, t.a1, t.p0, t.p1, t.km, t.o0, t.o1, t.dmin, t.tmin, t.v, t.kwh, t.k100, t.soc0, t.soc1, t.pcs, t.pcg, t.short]);
/** Gruppiert Fahrten nach Monat: { 'JJJJ-MM': [Fahrten] } */
function tripsByMonth(list) { const m = {}; list.forEach(t => { (m[tripYM(t)] = m[tripYM(t)] || []).push(t); }); return m; }

/** CSV der MyŠkoda-App lesen. Datumsformat „TT.MM.JJJJ HH:MM“ (lokale Zeit), Dezimalpunkt; leere Felder = unbekannt. */
function parseTripCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) throw new Error('Die Datei enthält keine Fahrten.');
  const H = rows[0].map(h => h.trim()), col = (n) => H.indexOf(n);
  if (col('Start of trip') < 0 || col('Distance in km') < 0) throw new Error('Das ist keine Fahrtenbuch-Datei aus der MyŠkoda-App (Spalte „Start of trip“ fehlt).');
  const dt = (v) => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(v || ''); if (m) return new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]); const t = Date.parse(v); return isNaN(t) ? null : new Date(t); };
  const num = (v) => { if (v == null || String(v).trim() === '') return null; const n = Number(String(v).trim().replace(',', '.')); return isFinite(n) ? n : null; };
  const str = (v) => (v || '').trim();
  const out = [], seen = new Set();
  rows.slice(1).forEach(r => {
    const g = (n) => r[col(n)], s = dt(g('Start of trip')), e = dt(g('End of trip')); if (!s || !e) return;
    const k = (d) => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes());
    let id = 't' + k(s) + '-' + pad2(e.getHours()) + pad2(e.getMinutes()); while (seen.has(id)) id += 'x'; seen.add(id);
    const t = { id, s: s.toISOString(), e: e.toISOString(), cls: str(g('Classification')), a0: str(g('Start address')), a1: str(g('End address')), p0: str(g('Start coordinates')), p1: str(g('End coordinates')),
      km: num(g('Distance in km')), o0: num(g('Start odometer in km')), o1: num(g('End odometer in km')), dmin: num(g('Driving time in minutes')), tmin: num(g('Travel time in minutes')), v: num(g('Average speed in km/h')),
      kwh: num(g('Electricity consumption in kWh')), k100: num(g('Average electricity consumption in kWh/100km')), soc0: num(g('Start SoC in %')), soc1: num(g('End SoC in %')),
      pcs: num(g('Public charging stops')), pcg: num(g('Public charge SoC gained in %')), short: /^true$/i.test(str(g('Short trip'))) };
    Object.keys(t).forEach(x => { if (t[x] === null || t[x] === '') delete t[x]; });     // Firestore verbietet undefined, leere Felder sparen Platz
    out.push(t);
  });
  if (!out.length) throw new Error('Keine gültigen Fahrten in der Datei gefunden.');
  return out;
}
/** Import: neue Fahrten anlegen, geänderte aktualisieren, eigenes Etikett behalten. Fahrten, die in der Datei fehlen, bleiben erhalten. */
async function importTrips(file) {
  const msg = $('trips-msg');
  try {
    const parsed = parseTripCsv(await file.text()), cur = getTrips(), byId = new Map(cur.map(t => [t.id, t]));
    let fresh = 0, changed = 0;
    parsed.forEach(t => { const old = byId.get(t.id); if (!old) { byId.set(t.id, t); fresh++; return; } const n = { ...t }; if (old.ucls) n.ucls = old.ucls; if (tripSig(n) !== tripSig(old)) { byId.set(t.id, n); changed++; } });
    if (!fresh && !changed) { flash(msg, 'Keine neuen Fahrten: alle ' + parsed.length + ' Fahrten der Datei sind schon vorhanden.', true); msg.classList.remove('hidden'); return { ok: true, fresh: 0, changed: 0, n: parsed.length, parsed }; }
    const status = commitTrips([...byId.values()]); if (!status) return { ok: false, err: 'Speichern fehlgeschlagen' };
    save(KEY_TRIPS_IMP, { at: new Date().toISOString(), n: parsed.length }); renderTripsLast();
    const text = fresh + ' neue Fahrten' + (changed ? ', ' + changed + ' aktualisiert' : '') + ' importiert';
    flash(msg, text + (window.cloud?.isSignedIn() ? ' · Cloud: wird übertragen …' : ' · nur lokal (nicht angemeldet)'), true); msg.classList.remove('hidden');
    status.then(r => { if (r.startsWith('cloud')) { flash(msg, text + ' · Cloud ✓ (' + r.slice(6) + (r.slice(6) === '1' ? ' Monat' : ' Monate') + ' geschrieben)', true); msg.classList.remove('hidden'); } else if (r.startsWith('error:')) { flash(msg, text + ' · Cloud-Fehler: ' + r.slice(6), false); msg.classList.remove('hidden'); } });
    refreshViews();
    return { ok: true, fresh, changed, n: parsed.length, parsed };
  } catch (err) { flash(msg, 'Fahrtenbuch-Import fehlgeschlagen: ' + err.message, false); msg.classList.remove('hidden'); return { ok: false, err: err.message }; }
}
function renderTripsLast() {
  const x = load(KEY_TRIPS_IMP, null), n = getTrips().length, el = $('trips-last'); if (!el) return;
  el.textContent = n ? n + ' Fahrten gespeichert' + (x && x.at ? ' · letzter Import ' + fmtDate(x.at) : '') + '. Lade jeden Monat die neueste Datei hoch: Nur Neues wird übertragen.' : 'In der MyŠkoda-App das Fahrtenbuch als CSV exportieren und hier hochladen.';
}
$('btn-trips').addEventListener('click', () => $('trips-file').click());
$('trips-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importTrips(f); });

/* ---- Orte ---- */
const geoOf = (p) => { const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(p || ''); return m ? { lat: +m[1], lon: +m[2] } : null; };
const geoDist = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function placeAt(p) { const g = geoOf(p); if (!g) return null; let best = null, bd = 300; getTPlaces().forEach(pl => { const d = geoDist(g, pl); if (d <= bd) { bd = d; best = pl; } }); return best; }
const shortAddr = (a) => { if (!a) return 'Unbekannter Ort'; const p = a.split(',').map(x => x.trim()); return p.length >= 2 ? p[0] + ', ' + p[1].replace(/^\d{4,5}\s*/, '') : p[0]; };
const placeName = (a, p) => { const pl = placeAt(p); return pl ? pl.name : shortAddr(a); };
/* ---- Etiketten und Regeln ----
   Etiketten: enyaq.tripLabels = [{ id, name, color }], frei anpassbar in den Einstellungen. Fahrten speichern im Feld „ucls“ die ID (ältere Einträge den Namen, das wird erkannt).
   Regeln: enyaq.tripRules = [{ id, a: { lat, lon, addr }, b: { lat, lon, addr }, label }] = „Strecke A ↔ B bekommt dieses Etikett“, beide Richtungen, Umkreis 300 m.
   Reihenfolge: eigenes Etikett der Fahrt > Regel > Klassifizierung aus der Datei > Zuhause ↔ Arbeit = Arbeitsweg > Standard-Etikett. */
const KEY_TLABELS = 'enyaq.tripLabels', KEY_TRULES = 'enyaq.tripRules', KEY_TDEF = 'enyaq.tripDefLabel';
const LABEL_COLORS = ['#0ea5e9', '#94a3b8', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316', '#78716c'];   // 12 Farben = max. 12 Etiketten, jede nur einmal
/** Doppelte Farben auflösen: Ein späteres Etikett mit bereits vergebener Farbe bekommt die erste freie Farbe. */
const uniqColors = (ls) => { const taken = new Set(); return ls.map((x, i) => { let c = x.color; if (!c || taken.has(c)) c = LABEL_COLORS.find(k => !taken.has(k) && !ls.slice(i + 1).some(y => y.color === k)) || LABEL_COLORS.find(k => !taken.has(k)) || c; taken.add(c); return c === x.color ? x : { ...x, color: c }; }); };
const freeColor = (ls, from = -1) => { const used = new Set(ls.map(l => l.color)); for (let k = 1; k <= LABEL_COLORS.length; k++) { const c = LABEL_COLORS[(from + k) % LABEL_COLORS.length]; if (!used.has(c)) return c; } return null; };
const DEF_LABELS = [{ id: 'arbeitsweg', name: 'Arbeitsweg', color: '#0ea5e9' }, { id: 'privat', name: 'Privat', color: '#94a3b8' }, { id: 'dienstlich', name: 'Dienstlich', color: '#f59e0b' }];
const getTLabels = () => { const l = load(KEY_TLABELS, null); return uniqColors(Array.isArray(l) && l.length ? l : DEF_LABELS.map(x => ({ ...x }))); };
const getTRules = () => { const l = load(KEY_TRULES, []); return Array.isArray(l) ? l : []; };
const defLabelId = () => { const d = load(KEY_TDEF, 'privat'), l = getTLabels(); return l.some(x => x.id === d) ? d : (l.find(x => x.id === 'privat') || l[0]).id; };
const labelById = (id) => { if (!id) return null; const l = getTLabels(), k = String(id).toLowerCase(); return l.find(x => x.id === id) || l.find(x => x.name.toLowerCase() === k) || null; };
const sameRoute = (r, g0, g1) => (geoDist(g0, r.a) <= 300 && geoDist(g1, r.b) <= 300) || (geoDist(g0, r.b) <= 300 && geoDist(g1, r.a) <= 300);
function ruleFor(t) { const g0 = geoOf(t.p0), g1 = geoOf(t.p1); if (!g0 || !g1) return null; return getTRules().find(r => labelById(r.label) && sameRoute(r, g0, g1)) || null; }
/** Etikett einer Fahrt samt Herkunft: 'manual' (selbst gesetzt), 'rule', 'file' (aus der CSV) oder 'auto' (Standard). */
function tripLabel(t) {
  let l = labelById(t.ucls); if (l) return { lab: l, src: 'manual' };
  const r = ruleFor(t); if (r) return { lab: labelById(r.label), src: 'rule' };
  const c = t.cls || '', m = /business|dienst|gesch/i.test(c) ? 'dienstlich' : /commut|arbeit|work/i.test(c) ? 'arbeitsweg' : /priva/i.test(c) ? 'privat' : '';
  if (m && (l = labelById(m))) return { lab: l, src: 'file' };
  const k0 = placeAt(t.p0)?.kind, k1 = placeAt(t.p1)?.kind;
  if (((k0 === 'home' && k1 === 'work') || (k0 === 'work' && k1 === 'home')) && (l = labelById('arbeitsweg'))) return { lab: l, src: 'rule' };
  return { lab: labelById(defLabelId()), src: 'auto' };
}
const tripTag = (t) => tripLabel(t).lab.name;
/** Etiketten, Regeln, Standard und Orte gemeinsam sichern: lokal + Cloud-Dokument settings/places. */
function pushTripPrefs() {
  if (!window.cloud?.isSignedIn()) return;
  window.cloud.setTripPrefs({ list: getTPlaces(), labels: getTLabels(), rules: getTRules(), defLabel: defLabelId() }).catch(e => window.onCloudStatus?.({ error: 'Fahrten-Einstellungen: ' + (e.code === 'permission-denied' ? 'Keine Berechtigung für enyaqStrom/<uid>/settings/places' : e.code || e.message) }));
}
function setTripPrefs(o) {
  if (o.labels) save(KEY_TLABELS, o.labels); if (o.rules) save(KEY_TRULES, o.rules); if (o.defLabel) save(KEY_TDEF, o.defLabel);
  renderTLabelSettings(); refreshViews(); pushTripPrefs();
}
function renderTLabelSettings() {
  const ls = getTLabels(), el = $('tlab-list'); if (!el) return;
  el.innerHTML = ls.map(l => `<span class="inline-flex items-center gap-1 pl-1 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm max-w-full"><button type="button" data-tlcol="${esc(l.id)}" aria-label="Farbe von ${esc(l.name)} wechseln" class="w-7 h-7 shrink-0 flex items-center justify-center"><span class="block w-4 h-4 rounded-full" style="background:${esc(l.color)}"></span></button><button type="button" data-tlren="${esc(l.id)}" class="truncate">${esc(l.name)}</button><button type="button" data-tldel="${esc(l.id)}" aria-label="${esc(l.name)} entfernen" class="w-6 h-6 shrink-0 rounded-lg text-slate-500 hover:text-red-600 active:scale-95">×</button></span>`).join('');
  $('tlab-def').innerHTML = ls.map(l => `<option value="${esc(l.id)}" ${l.id === defLabelId() ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const rules = getTRules();
  $('trule-count').textContent = rules.length;
  $('trule-list').innerHTML = rules.length ? rules.map(r => { const l = labelById(r.label); return `<li class="flex items-center justify-between gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 pl-3 pr-1 py-1.5 text-sm"><span class="min-w-0 truncate">${esc(placeName(r.a.addr, r.a.lat + ',' + r.a.lon))} ↔ ${esc(placeName(r.b.addr, r.b.lat + ',' + r.b.lon))} → <span style="color:${l ? esc(l.color) : '#94a3b8'}" aria-hidden="true">●</span> ${l ? esc(l.name) : 'gelöschtes Etikett'}</span><button type="button" data-trdel="${esc(r.id)}" aria-label="Regel entfernen" class="w-6 h-6 shrink-0 rounded-lg text-slate-500 hover:text-red-600 active:scale-95">×</button></li>`; }).join('')
    : '<li class="text-xs text-slate-500 dark:text-slate-400">Noch keine Regeln.</li>';
  const pl = getTPlaces(), opt = pl.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('trule-form').classList.toggle('hidden', pl.length < 1);
  ['trule-a', 'trule-b'].forEach(id => { const v = $(id).value; $(id).innerHTML = opt; if (pl.some(p => p.id === v)) $(id).value = v; });
  const lv = $('trule-l').value; $('trule-l').innerHTML = ls.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join(''); if (labelById(lv)) $('trule-l').value = lv;
}
$('btn-tlab-add').addEventListener('click', () => {
  const name = $('tlab-new').value.trim().replace(/\s+/g, ' ').slice(0, 24), ls = getTLabels(); if (!name) return;
  if (ls.some(l => l.name.toLowerCase() === name.toLowerCase())) { $('tlab-msg').textContent = '„' + name + '“ gibt es schon.'; return; }
  if (ls.length >= LABEL_COLORS.length) { $('tlab-msg').textContent = 'Maximal ' + LABEL_COLORS.length + ' Etiketten (eine Farbe je Etikett).'; return; }
  $('tlab-new').value = ''; $('tlab-msg').textContent = '';
  setTripPrefs({ labels: ls.concat({ id: 'l' + Date.now(), name, color: freeColor(ls) }) });
});
$('tlab-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('btn-tlab-add').click(); } });
$('tlab-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tlcol],[data-tlren],[data-tldel]'); if (!b) return; const ls = getTLabels();
  if (b.dataset.tlcol) { const l = ls.find(x => x.id === b.dataset.tlcol), c = freeColor(ls.filter(x => x.id !== l.id).concat({ color: l.color }), LABEL_COLORS.indexOf(l.color));   // nächste Farbe, die kein anderes Etikett hat
    if (!c) { $('tlab-msg').textContent = 'Alle Farben sind vergeben.'; return; } setTripPrefs({ labels: ls.map(x => x.id === l.id ? { ...x, color: c } : x) }); return; }
  if (b.dataset.tlren) { const l = ls.find(x => x.id === b.dataset.tlren), n = (prompt('Neuer Name für „' + l.name + '“:', l.name) || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!n || n === l.name) return; if (ls.some(x => x.id !== l.id && x.name.toLowerCase() === n.toLowerCase())) { $('tlab-msg').textContent = '„' + n + '“ gibt es schon.'; return; }
    setTripPrefs({ labels: ls.map(x => x.id === l.id ? { ...x, name: n } : x) }); return; }
  if (b.dataset.tldel) { if (ls.length <= 1) { $('tlab-msg').textContent = 'Mindestens ein Etikett muss bleiben.'; return; }
    const l = ls.find(x => x.id === b.dataset.tldel), nRule = getTRules().filter(r => r.label === l.id).length;
    if (!confirm('Etikett „' + l.name + '“ entfernen?' + (nRule ? ' ' + nRule + (nRule === 1 ? ' Regel wird' : ' Regeln werden') + ' mit entfernt.' : '') + ' Fahrten mit diesem Etikett bekommen wieder ihr automatisches Etikett.')) return;
    setTripPrefs({ labels: ls.filter(x => x.id !== l.id), rules: getTRules().filter(r => r.label !== l.id) }); }
});
$('tlab-def').addEventListener('change', (e) => setTripPrefs({ defLabel: e.target.value }));
$('trule-list').addEventListener('click', (e) => { const id = e.target.dataset.trdel; if (id) setTripPrefs({ rules: getTRules().filter(r => r.id !== id) }); });
$('btn-trule-add').addEventListener('click', () => {
  const pl = getTPlaces(), a = pl.find(p => p.id === $('trule-a').value), b = pl.find(p => p.id === $('trule-b').value), lab = $('trule-l').value; if (!a || !b || !lab) return;
  const pa = { lat: a.lat, lon: a.lon, addr: a.name }, pb = { lat: b.lat, lon: b.lon, addr: b.name };
  setTripPrefs({ rules: getTRules().filter(r => !sameRoute(r, pa, pb)).concat({ id: 'r' + Date.now(), a: pa, b: pb, label: lab }) });
});
/* ---- Etikett einer Fahrt wählen (Antippen in der Historie) ---- */
let ttagTrip = null;
function openTTag(t) {
  ttagTrip = t; const cur = tripLabel(t), g0 = geoOf(t.p0), g1 = geoOf(t.p1), canRule = !!(g0 && g1);
  const others = canRule ? getTrips().filter(x => x.id !== t.id && tripVisible(x) && geoOf(x.p0) && geoOf(x.p1) && sameRoute({ a: g0, b: g1 }, geoOf(x.p0), geoOf(x.p1))).length : 0;
  $('ttag-route').textContent = placeName(t.a0, t.p0) + ' → ' + placeName(t.a1, t.p1) + (canRule ? ' · ' + (others + 1) + (others ? ' Fahrten' : ' Fahrt') + ' auf dieser Strecke' : '');
  $('ttag-opts').innerHTML = getTLabels().map(l => `<button type="button" data-tpick="${esc(l.id)}" class="flex items-center gap-2 w-full rounded-xl px-3 py-3 text-left font-medium active:scale-[0.99] transition ${l.id === cur.lab.id ? 'ring-2 ring-emerald-500' : ''} bg-slate-100 dark:bg-slate-800"><span class="block w-3.5 h-3.5 rounded-full" style="background:${esc(l.color)}"></span>${esc(l.name)}</button>`).join('')
    + (cur.src === 'manual' ? '<button type="button" data-tpick="" class="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 dark:text-slate-300 active:scale-[0.99] transition">Eigene Auswahl zurücksetzen (Regel/Standard)</button>' : '');
  $('ttag-rule-wrap').classList.toggle('hidden', !canRule); $('ttag-rule').checked = canRule && (others > 0 || !!ruleFor(t));
  $('ttag-dialog').classList.remove('hidden');
}
$('ttag-cancel').addEventListener('click', () => $('ttag-dialog').classList.add('hidden'));
$('ttag-dialog').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); return; }
  const b = e.target.closest('[data-tpick]'); if (!b || !ttagTrip) return; const id = b.dataset.tpick, t = ttagTrip, list = getTrips();
  if (id && $('ttag-rule').checked && !$('ttag-rule-wrap').classList.contains('hidden')) {   // Regel: gilt für alle Fahrten dieser Strecke (eigene Auswahl dort wird aufgehoben)
    const g0 = geoOf(t.p0), g1 = geoOf(t.p1), rule = { id: 'r' + Date.now(), a: { ...g0, addr: t.a0 || '' }, b: { ...g1, addr: t.a1 || '' }, label: id };
    commitTrips(list.map(x => { const x0 = geoOf(x.p0), x1 = geoOf(x.p1); if (x.ucls && x0 && x1 && sameRoute(rule, x0, x1)) { const n = { ...x }; delete n.ucls; return n; } return x; }));
    setTripPrefs({ rules: getTRules().filter(r => !sameRoute(r, g0, g1)).concat(rule) });
  } else commitTrips(list.map(x => { if (x.id !== t.id) return x; const n = { ...x }; if (id) n.ucls = id; else delete n.ucls; return n; }));
  $('ttag-dialog').classList.add('hidden'); renderTrips();
});
function setTPlaces(list) {
  save(KEY_TPLACES, list); renderTPlaceList(); refreshViews();
  renderTLabelSettings(); pushTripPrefs();
}
function renderTPlaceList() {
  const el = $('tplace-list'); if (!el) return; const l = getTPlaces(), K = { home: ' · Zuhause', work: ' · Arbeit' };
  $('tplace-count').textContent = l.length;                                   // Anzahl im zugeklappten Kopf
  el.innerHTML = l.length ? l.map(p => `<span class="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm max-w-full"><span class="truncate">${esc(p.name)}${K[p.kind] || ''}</span><button type="button" data-del="${esc(p.id)}" aria-label="${esc(p.name)} entfernen" class="w-6 h-6 shrink-0 rounded-lg text-slate-500 hover:text-red-600 active:scale-95">×</button></span>`).join('')
    : '<span class="text-xs text-slate-500 dark:text-slate-400">Noch keine Orte benannt.</span>';
}
$('tplace-list').addEventListener('click', (e) => { const id = e.target.dataset.del; if (id) setTPlaces(getTPlaces().filter(p => p.id !== id)); });
let tplaceEdit = null;                                                                     // { pos: "lat,lon", addr, place }
function openTPlace(pos, addr) {
  const pl = placeAt(pos); tplaceEdit = { pos, addr, place: pl };
  $('tplace-addr').textContent = addr || pos; $('tplace-name').value = pl ? pl.name : ''; $('tplace-kind').value = pl ? pl.kind || '' : '';
  $('tplace-del').classList.toggle('hidden', !pl); $('tplace-dialog').classList.remove('hidden'); $('tplace-name').focus();
}
$('tplace-cancel').addEventListener('click', () => $('tplace-dialog').classList.add('hidden'));
$('tplace-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
$('tplace-del').addEventListener('click', () => { if (tplaceEdit?.place) setTPlaces(getTPlaces().filter(p => p.id !== tplaceEdit.place.id)); $('tplace-dialog').classList.add('hidden'); });
$('tplace-save').addEventListener('click', () => {
  const name = $('tplace-name').value.trim().replace(/\s+/g, ' ').slice(0, 30), kind = $('tplace-kind').value, g = geoOf(tplaceEdit?.pos);
  if (!name || !g) { $('tplace-name').focus(); return; }
  let l = getTPlaces();
  if (kind) l = l.map(p => p.kind === kind && (!tplaceEdit.place || p.id !== tplaceEdit.place.id) ? { ...p, kind: '' } : p);   // nur ein Zuhause und eine Arbeit
  if (tplaceEdit.place) l = l.map(p => p.id === tplaceEdit.place.id ? { ...p, name, kind } : p);
  else l = l.concat({ id: 'p' + Date.now(), name, kind, lat: g.lat, lon: g.lon });
  setTPlaces(l); $('tplace-dialog').classList.add('hidden');
});

/* ---- km pro Tag vom Auto (ohne Fahrtenbuch): bei jeder Abfrage beim Škoda-Server den km-Stand je Tag merken (erster + letzter Wert).
   lab.odo = [{ id: 'o' + Tag, d: 'YYYY-MM-DD', km0, t0, km1, t1 }] – synchronisiert wie die übrigen Messreihen. Gefahren an Tag D = letzter Stand D − letzter Stand des
   vorherigen Tags mit Wert; liegen Tage ohne Abfrage dazwischen, gilt der Wert für den ganzen Zeitraum. */
function odoNote(d) {
  const km = d && Number(d.odometerKm); if (!(km > 0)) return;
  const at = d.capturedAt && Number.isFinite(Date.parse(d.capturedAt)) ? d.capturedAt : new Date().toISOString(), day = wxIso(new Date(at)), id = 'o' + day, kmr = Math.round(km);
  const lab = getLab(), cur = lab.odo.find(x => x.id === id);
  if (cur && cur.km1 === kmr && Date.parse(cur.t1) >= Date.parse(at)) return;                 // nichts Neues
  if (cur && Date.parse(at) < Date.parse(cur.t1)) return;                                      // ältere Meldung
  lab.odo = lab.odo.filter(x => x.id !== id).concat(cur ? { ...cur, km1: kmr, t1: at } : { id, d: day, km0: kmr, t0: at, km1: kmr, t1: at });
  if (lab.odo.length > 800) lab.odo = lab.odo.sort((a, b) => a.d.localeCompare(b.d)).slice(-800);
  setLab(lab); if (currentView === 'history' && histFilter === 'fahrten') try { renderTrips(); } catch (e) { }
}
/** Tage mit gefahrenen km laut Auto: [{ k: Tag, km, from: erster Tag des Zeitraums (bei Lücken), a, b }], neueste zuerst */
function odoDays() {
  const l = getLab().odo.filter(x => x.d && x.km1 > 0).sort((a, b) => a.d.localeCompare(b.d)), out = [];
  for (let i = 1; i < l.length; i++) { const p = l[i - 1], c = l[i], km = c.km1 - p.km1; if (km < 1 || km > 3000) continue;
    const nx = wxIso(new Date(Date.parse(p.d + 'T12:00:00') + 864e5)); out.push({ k: c.d, km, from: nx !== c.d ? nx : null, a: p.km1, b: c.km1 }); }
  return out.reverse();
}

/* ---- Historie → Fahrten ---- */
let tripDays = 21;
const fmtMin = (m) => m == null ? '' : m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + ' h ' + pad2(Math.round(m % 60)) + ' min';
const hm = (iso) => { const d = new Date(iso); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const dayKey = (iso) => wxIso(new Date(iso));
function renderTrips() {
  const all = getTrips().filter(tripVisible).sort((a, b) => (a.s < b.s ? 1 : -1)), wrap = $('trips-wrap'); if (!wrap) return;
  /* km vom Auto nur für die Zeit nach dem letzten Fahrtenbuch-Import (davor ist das Fahrtenbuch genauer) */
  const tAll = getTrips().filter(t => t.e), lastDay = tAll.reduce((m, t) => { const k = dayKey(t.e); return k > m ? k : m; }, ''), lastKm = tAll.reduce((m, t) => Math.max(m, Number(t.o1) || 0), 0);
  const odo = odoDays().filter(o => o.k > lastDay).map(o => { if (lastDay && (o.from || o.k) <= lastDay) { const from = wxIso(new Date(Date.parse(lastDay + 'T12:00:00') + 864e5)); return lastKm > 0 ? { ...o, km: Math.max(0, o.b - Math.max(o.a, lastKm)), from: from !== o.k ? from : null } : o; } return o; }).filter(o => o.km >= 1);
  const any = all.length || odo.length;
  $('trips-empty').classList.toggle('hidden', !!any); $('trips-kpi').classList.toggle('hidden', !any); $('trips-csv').classList.toggle('hidden', !all.length);
  const imp = load(KEY_TRIPS_IMP, null);
  $('trips-info').textContent = [all.length ? all.length + ' Fahrten' + (imp && imp.at ? ' · Import vom ' + fmtDate(imp.at) : '') : '', odo.length ? 'danach km vom Auto' : ''].filter(Boolean).join(' · ');
  if (!any) { $('trips-list').innerHTML = ''; $('trips-more').classList.add('hidden'); return; }
  const lastK = [all.length ? dayKey(all[0].s) : '', odo.length ? odo[0].k : ''].sort().pop(), last = new Date(lastK + 'T12:00:00'), ym = lastK.slice(0, 7);
  const mt = all.filter(t => tripYM(t) === ym), mo = odo.filter(o => o.k.slice(0, 7) === ym), km = mt.reduce((a, t) => a + (t.km || 0), 0) + mo.reduce((a, o) => a + o.km, 0);
  const tile = (l, v, u) => `<div class="rounded-2xl bg-white dark:bg-slate-900 shadow-sm p-3"><p class="text-xs text-slate-500 dark:text-slate-400 truncate">${l}</p><p class="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">${v}${u ? ' <span class="text-xs font-normal text-slate-500 dark:text-slate-400">' + u + '</span>' : ''}</p></div>`;
  const dDays = new Set(mt.map(t => dayKey(t.s)).concat(mo.map(o => o.k))).size;
  $('trips-kpi').innerHTML = tile(MONTHS_LONG[last.getMonth()], fmt(km, 0), 'km') + (mo.length ? tile('Tage gefahren', dDays, '') + tile('Ø pro Tag', dDays ? fmt(km / dDays, 0) : '–', 'km')
    : tile('Fahrten', mt.length, '') + tile('Ø Strecke', mt.length ? fmt(km / mt.length, 0) : '–', 'km'));
  const days = [], idx = new Map();
  all.forEach(t => { const k = dayKey(t.s); if (!idx.has(k)) { idx.set(k, days.length); days.push({ k, trips: [] }); } days[idx.get(k)].trips.push(t); });
  odo.forEach(o => { if (!idx.has(o.k)) { idx.set(o.k, days.length); days.push({ k: o.k, trips: [], odo: o }); } });
  days.sort((a, b) => b.k.localeCompare(a.k));
  const today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 864e5).toISOString());
  const pos = (p, a) => geoOf(p) ? `<button type="button" data-tpos="${esc(p)}" data-taddr="${esc(a || '')}" class="min-w-0 truncate text-left text-sm underline decoration-dotted decoration-slate-400 underline-offset-4">${esc(placeName(a, p))}</button>` : `<span class="min-w-0 truncate text-sm">${esc(placeName(a, p))}</span>`;
  $('trips-list').innerHTML = days.slice(0, tripDays).map(d => {
    const dd = new Date(d.k + 'T12:00:00'), sum = d.trips.reduce((a, t) => a + (t.km || 0), 0);
    const title = (d.k === today ? 'Heute, ' : d.k === yest ? 'Gestern, ' : '') + WEEKDAYS[dd.getDay()].slice(0, 2) + ' ' + pad2(dd.getDate()) + '.' + pad2(dd.getMonth() + 1) + '.' + (dd.getFullYear() !== new Date().getFullYear() ? dd.getFullYear() : '');
    if (d.odo) { const o = d.odo, fd = o.from ? new Date(o.from + 'T12:00:00') : null;
      return `<div class="space-y-2"><div class="flex justify-between items-baseline px-0.5"><span class="font-semibold">${title}</span><span class="text-sm text-slate-500 dark:text-slate-400">${fd ? 'seit ' + WEEKDAYS[fd.getDay()].slice(0, 2) + ' ' + pad2(fd.getDate()) + '.' + pad2(fd.getMonth() + 1) + '.' : 'km vom Auto'}</span></div>
        <div class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3.5 flex items-center gap-3"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" aria-hidden="true"><svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 14l3-5"/><path d="M4.5 18a9 9 0 1 1 15 0"/></svg></span>
          <div class="min-w-0 flex-1"><p class="text-sm">km-Stand vom Auto</p><p class="truncate text-xs text-slate-500 dark:text-slate-400 tabular-nums">${fmt(o.km < o.b - o.a ? o.b - o.km : o.a, 0)} → ${fmt(o.b, 0)} km · Fahrten folgen mit dem Fahrtenbuch</p></div>
          <span class="shrink-0 text-lg font-semibold tabular-nums">${fmt(o.km, 0)} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">km</span></span></div></div>`; }
    return `<div class="space-y-2"><div class="flex justify-between items-baseline px-0.5"><span class="font-semibold">${title}</span><span class="text-sm text-slate-500 dark:text-slate-400">${d.trips.length} ${d.trips.length === 1 ? 'Fahrt' : 'Fahrten'} · ${fmt(sum, 0)} km</span></div>`
      + d.trips.slice().reverse().map(t => { const tl = tripLabel(t), SRC = { rule: ' · Regel', auto: ' · auto', file: '', manual: '' };
        return `<div class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3.5 flex gap-3">
          <div class="flex flex-col items-center pt-1.5" aria-hidden="true"><span class="block w-2.5 h-2.5 rounded-full border-2 border-emerald-500"></span><span class="block flex-1 w-0.5 my-1 bg-slate-200 dark:bg-slate-700"></span><span class="block w-2.5 h-2.5 rounded-full bg-emerald-500"></span></div>
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex justify-between gap-2">${pos(t.p0, t.a0)}<span class="shrink-0 text-sm text-slate-500 dark:text-slate-400">${hm(t.s)}</span></div>
            <div class="flex justify-between gap-2">${pos(t.p1, t.a1)}<span class="shrink-0 text-sm text-slate-500 dark:text-slate-400">${hm(t.e)}</span></div>
            <div class="flex items-center justify-between gap-2 pt-0.5">
              <button type="button" data-ttag="${esc(t.id)}" class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 active:scale-95 transition"><span class="block w-2.5 h-2.5 rounded-full" style="background:${esc(tl.lab.color)}" aria-hidden="true"></span>${esc(tl.lab.name)}<span class="opacity-60">${SRC[tl.src]}</span></button>
              <span class="text-lg font-semibold tabular-nums">${fmt(t.km || 0, 0)} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">km · ${fmtMin(t.dmin)}</span></span>
            </div>
            ${t.k100 != null || t.soc0 != null ? `<p class="text-xs text-slate-500 dark:text-slate-400 text-right">${[t.k100 != null && t.k100 > 0 ? fmt(t.k100, 1) + ' kWh/100 km' : '', t.soc0 != null && t.soc1 != null ? 'Akku ' + t.soc0 + ' → ' + t.soc1 + ' %' : '', t.pcs > 0 ? t.pcs + '× unterwegs geladen' : ''].filter(Boolean).join(' · ')}</p>` : ''}
          </div></div>`; }).join('') + '</div>';
  }).join('');
  $('trips-more').classList.toggle('hidden', days.length <= tripDays);
}
$('trips-more').addEventListener('click', () => { tripDays += 30; renderTrips(); });
/* Vergleichs-Benziner (Rückblick): sofort speichern */
$('set-cmp-car').addEventListener('change', (e) => setQuickSetting('cmpCar', e.target.value.trim().slice(0, 40) || undefined));
[['set-cmp-l', 'cmpL', 1, 30], ['set-cmp-eur', 'cmpEur', 0.5, 5], ['set-cmp-co2', 'cmpCo2', -0.01, 2000]].forEach(([id, k, lo, hi]) => $(id).addEventListener('change', (e) => { const v = deDec(e.target.value);
  if (e.target.value.trim() === '') { setQuickSetting(k, undefined); return; } if (Number.isFinite(v) && v > lo && v < hi) { setQuickSetting(k, Math.round(v * 100) / 100); e.target.value = String(Math.round(v * 100) / 100).replace('.', ','); } else e.target.value = getSettings()[k] ? String(getSettings()[k]).replace('.', ',') : ''; }));
$('trips-go-set').addEventListener('click', () => openSettings('fahrten'));
$('trips-list').addEventListener('click', (e) => {
  const tg = e.target.closest('[data-ttag]');
  if (tg) { const list = getTrips(), t = list.find(x => x.id === tg.dataset.ttag); if (!t) return;
    openTTag(t); return; }
  const ps = e.target.closest('[data-tpos]'); if (ps) openTPlace(ps.dataset.tpos, ps.dataset.taddr);
});
/** CSV (Semikolon, Dezimalkomma, BOM: öffnet direkt in Excel). */
function tripsCsv(list, name) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"', n = (v, d = 1) => v == null ? '' : fmt(v, d);
  const lines = [['Start', 'Ende', 'Kategorie', 'Von', 'Nach', 'Startadresse', 'Zieladresse', 'km', 'km-Stand Start', 'km-Stand Ende', 'Fahrzeit min', 'kWh', 'kWh/100 km', 'Akku Start %', 'Akku Ende %'].map(q).join(';')]
    .concat(list.slice().sort((a, b) => (a.s < b.s ? -1 : 1)).map(t => [fmtDate(t.s) + ' ' + hm(t.s), fmtDate(t.e) + ' ' + hm(t.e), tripTag(t), placeName(t.a0, t.p0), placeName(t.a1, t.p1), t.a0 || '', t.a1 || '', n(t.km, 0), t.o0 ?? '', t.o1 ?? '', t.dmin ?? '', n(t.kwh, 2), n(t.k100), t.soc0 ?? '', t.soc1 ?? ''].map(q).join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('trips-csv').addEventListener('click', () => tripsCsv(getTrips().filter(tripVisible), 'fahrtenbuch-' + todayYMD() + '.csv'));

/* ---- Berichte → Fahrten ---- */
/* =====================================================================
   Steuerhelfer Arbeitsweg (Berichte → Fahrten): Arbeitstage = Kalendertage mit mindestens einer Fahrt mit Etikett „Arbeitsweg“.
   Entfernungspauschale: ab 2026 0,38 € je Entfernungs-km ab dem 1. km; bis 2025 0,30 € (1.–20. km) und 0,38 € ab dem 21. km.
   Einfache Entfernung: eigene Angabe (Einstellung commuteKm) oder der Median der Arbeitsweg-Fahrten, auf ganze km abgerundet.
   ===================================================================== */
let taxY = new Date().getFullYear();
const isCommute = (t) => { const l = tripLabel(t).lab; return l && (l.id === 'arbeitsweg' || /arbeit/i.test(l.name || '')); };
const taxRate = (y, km) => y >= 2026 ? km * 0.38 : Math.min(km, 20) * 0.30 + Math.max(0, km - 20) * 0.38;
function taxData(y) {
  const trips = getTrips().filter(t => tripVisible(t) && new Date(t.s).getFullYear() === y), com = trips.filter(isCommute);
  const days = new Map(); com.forEach(t => { const d = new Date(t.s), k = ymd(d); const o = days.get(k) || { d, n: 0, km: 0 }; o.n++; o.km += t.km || 0; days.set(k, o); });
  const med = wbMedian(com.map(t => t.km || 0).filter(v => v > 0)) ?? (com.length ? com[0].km : null);
  const own = Number(getSettings().commuteKm) > 0 ? Number(getSettings().commuteKm) : null, dist = own ?? (med ? Math.floor(med) : null);
  const comKm = com.reduce((a, t) => a + (t.km || 0), 0);
  /* echte Kosten: Arbeitsweg-km × Ø Verbrauch inkl. Ladeverluste × Ø Strompreis des Jahres (sonst Gesamtwerte) */
  const rs = getReadings(), inY = rs.map((r, i) => i).filter(i => new Date(rs[i].date).getFullYear() === y), all = rs.map((_, i) => i);
  const tc = (idx) => { try { const t = idx.length ? consumptionTotals(rs, idx) : null; return t && t.km ? t.kwh100 : null; } catch (e) { return null; } };
  const pr = (idx) => { let e = 0, c = 0; idx.forEach(i => { const r = rs[i]; if (r.consumedSinceLast > 0 && r.cost > 0) { e += r.consumedSinceLast; c += r.cost; } }); return e > 0 ? c / e : null; };
  const k100 = tc(inY) ?? tc(all), price = pr(inY) ?? pr(all), real = k100 != null && price != null ? comKm * k100 / 100 * price : null;
  /* Lücken: Monate (ab Kaufmonat, bis heute) ohne jede Fahrt im Fahrtenbuch */
  const [py, pm] = purchaseMonth().split('-').map(Number), now = new Date(), gaps = [];
  for (let m = 0; m < 12; m++) { if (y < py || (y === py && m < pm - 1) || y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) continue; if (!trips.some(t => new Date(t.s).getMonth() === m)) gaps.push(m); }
  return { y, days: [...days.values()].sort((a, b) => a.d - b.d), dist, own: own != null, med, sum: dist ? days.size * taxRate(y, dist) : null, comKm, real, gaps, n: com.length };
}
const MON_S = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function taxYears() { const ys = new Set(getTrips().filter(isCommute).map(t => new Date(t.s).getFullYear())); return [...ys].sort(); }
function renderTax() {
  const ys = taxYears(), card = $('tax-card'); card.classList.toggle('hidden', !ys.length); if (!ys.length) return;
  if (!ys.includes(taxY)) taxY = ys[ys.length - 1];
  const d = taxData(taxY), i = ys.indexOf(taxY);
  $('tax-y').textContent = taxY; $('tax-prev').disabled = i <= 0; $('tax-next').disabled = i >= ys.length - 1;
  $('tax-prev').classList.toggle('opacity-30', i <= 0); $('tax-next').classList.toggle('opacity-30', i >= ys.length - 1);
  $('tax-days').textContent = d.days.length;
  $('tax-sub').textContent = 'Tage mit mindestens einer Fahrt „Arbeitsweg“ · ' + d.n + (d.n === 1 ? ' Fahrt' : ' Fahrten') + ', ' + fmt(d.comKm, 0) + ' km';
  if (document.activeElement !== $('tax-km')) { $('tax-km').value = d.dist ?? ''; $('tax-km').placeholder = d.med ? String(Math.floor(d.med)) : '–'; }
  $('tax-rate-l').textContent = taxY >= 2026 ? 'Pauschale (0,38 €/km)' : 'Pauschale (0,30/0,38 €/km)';
  $('tax-sum').textContent = d.sum != null ? eur(d.sum) : '–';
  $('tax-real').textContent = d.real != null ? eur(d.real) : '–';
  $('tax-formula').textContent = d.dist ? d.days.length + ' Tage × ' + (taxY >= 2026 ? d.dist + ' km × 0,38 €' : (d.dist <= 20 ? d.dist + ' km × 0,30 €' : '(20 km × 0,30 € + ' + (d.dist - 20) + ' km × 0,38 €)')) + (d.own ? ' · Entfernung selbst eingetragen' : ' · Entfernung aus deinen Fahrten (Median), änderbar') : 'Trage die einfache Entfernung zur Arbeit ein.';
  $('tax-gap').classList.toggle('hidden', !d.gaps.length);
  if (d.gaps.length) $('tax-gap').textContent = 'Ohne Fahrtenbuch-Daten: ' + d.gaps.map(m => MON_S[m]).join(', ') + ' – dort können Arbeitstage fehlen. Fahrtenbuch für diese Monate importieren.';
  const byM = {}; d.days.forEach(x => { (byM[x.d.getMonth()] = byM[x.d.getMonth()] || []).push(x); });
  $('tax-months').innerHTML = Object.keys(byM).map(Number).sort((a, b) => a - b).map(m => `<div><p class="font-semibold text-slate-700 dark:text-slate-200">${MON_S[m]} · ${byM[m].length} ${byM[m].length === 1 ? 'Tag' : 'Tage'}</p><p class="text-slate-500 dark:text-slate-400 leading-5">${byM[m].map(x => pad2(x.d.getDate()) + '.').join(' ')}</p></div>`).join('') || '<p class="text-slate-500">Keine Arbeitstage.</p>';
}
$('tax-prev').addEventListener('click', () => { const ys = taxYears(), i = ys.indexOf(taxY); if (i > 0) { taxY = ys[i - 1]; renderTax(); } });
$('tax-next').addEventListener('click', () => { const ys = taxYears(), i = ys.indexOf(taxY); if (i < ys.length - 1) { taxY = ys[i + 1]; renderTax(); } });
$('tax-km').addEventListener('change', (e) => {
  const v = parseInt(e.target.value, 10), raw = load(KEY_SETTINGS, {}) || {};
  if (v > 0 && v < 1000) raw.commuteKm = v; else delete raw.commuteKm;
  save(KEY_SETTINGS, raw); pushPrefs(); renderTax();
});
$('tax-pdf').addEventListener('click', async () => {
  const d = taxData(taxY), st = getSettings(), mm = [st.brand, st.model].filter(Boolean).join(' '), box = $('akte-print');
  const byM = {}; d.days.forEach(x => { (byM[x.d.getMonth()] = byM[x.d.getMonth()] || []).push(x); });
  const TD = 'padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top';
  let h = '<div style="max-width:720px;margin:0 auto;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;line-height:1.4"><h1 style="font-size:24px;margin:0">Wege zur ersten Tätigkeitsstätte ' + taxY + '</h1>'
    + '<p style="margin:2px 0 14px;color:#475569;font-size:14px">' + esc(mm || 'Fahrzeug') + (st.plate ? ' · ' + esc(st.plate) : '') + ' · erstellt am ' + fmtDate(new Date().toISOString()) + '</p>'
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
    + [['Arbeitstage (Tage mit Fahrt „Arbeitsweg“)', d.days.length], ['Einfache Entfernung', d.dist ? d.dist + ' km' : '–'], ['Entfernungspauschale', taxY >= 2026 ? '0,38 € je km ab dem 1. km' : '0,30 € (1.–20. km), 0,38 € ab dem 21. km'], ['Betrag', d.sum != null ? '<b>' + eur(d.sum) + '</b>' : '–'], ['Gefahrene Arbeitsweg-km (laut Fahrtenbuch)', fmt(d.comKm, 0) + ' km']]
      .map(([k, v]) => '<tr><td style="' + TD + ';color:#475569">' + k + '</td><td style="' + TD + ';text-align:right">' + v + '</td></tr>').join('') + '</table>'
    + '<h2 style="font-size:16px;margin:0 0 6px">Arbeitstage je Monat</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + TD + ';text-align:left">Monat</th><th style="' + TD + ';text-align:right">Tage</th><th style="' + TD + ';text-align:left">Daten</th></tr></thead><tbody>'
    + Object.keys(byM).map(Number).sort((a, b) => a - b).map(m => '<tr style="break-inside:avoid"><td style="' + TD + '">' + MON_S[m] + '</td><td style="' + TD + ';text-align:right">' + byM[m].length + '</td><td style="' + TD + '">' + byM[m].map(x => pad2(x.d.getDate()) + '.' + pad2(m + 1) + '.').join(', ') + '</td></tr>').join('') + '</tbody></table>'
    + (d.gaps.length ? '<p style="font-size:12px;color:#92400e;margin-top:10px">Hinweis: Für ' + d.gaps.map(m => MON_S[m]).join(', ') + ' liegen keine Fahrtenbuch-Daten vor.</p>' : '')
    + '<p style="font-size:11px;color:#64748b;margin:20px 0 0;border-top:1px solid #cbd5e1;padding-top:8px">Aus dem Fahrtenbuch der MyŠkoda-App (Etikett „Arbeitsweg“) erstellt. Keine Steuerberatung; Angaben vor der Verwendung prüfen.</p></div>';
  box.innerHTML = '<div id="akte-bar"><button type="button" data-akte="close" style="background:#e2e8f0;color:#0f172a">Schließen</button><button type="button" data-akte="print" style="background:#059669;color:#fff">Drucken / als PDF</button></div>' + h;
  akteOldTitle = document.title; document.title = 'Arbeitsweg ' + taxY; document.body.classList.add('print-akte'); window.scrollTo(0, 0);
});
function renderTripReport(y, m) {
  try { renderTax(); } catch (e) { console.error(e); }
  const ym = y + '-' + pad2(m + 1), list = getTrips().filter(t => tripYM(t) === ym && tripVisible(t)), empty = !list.length;
  $('rf-empty').classList.toggle('hidden', !empty); $('rf-body').classList.toggle('hidden', empty);
  $('rep-sub').textContent = 'Fahrtenbuch · aus der MyŠkoda-App'; if (empty) return;
  const km = list.reduce((a, t) => a + (t.km || 0), 0), long = list.reduce((a, t) => (t.km || 0) > (a.km || 0) ? t : a);
  $('rf-km').textContent = fmt(km, 0);
  $('rf-sub').textContent = list.length + (list.length === 1 ? ' Fahrt' : ' Fahrten') + ' · Ø ' + fmt(km / list.length, 0) + ' km · längste ' + fmt(long.km, 0) + ' km (' + WEEKDAYS[new Date(long.s).getDay()].slice(0, 2) + ' ' + wrD(Date.parse(long.s)) + ')';
  const dim = new Date(y, m + 1, 0).getDate(), per = Array(dim).fill(0); list.forEach(t => { per[new Date(t.s).getDate() - 1] += t.km || 0; });
  const mx = Math.max(...per, 1);
  $('rf-bars').innerHTML = per.map((v, i) => `<div class="flex-1 rounded-t-[3px] ${v === mx ? 'bg-emerald-500' : v ? 'bg-emerald-700/70 dark:bg-emerald-800' : 'bg-slate-200 dark:bg-slate-800'}" style="height:${v ? Math.max(5, v / mx * 96) : 3}px" title="${i + 1}.: ${fmt(v, 0)} km"></div>`).join('');
  $('rf-bars-l').innerHTML = [1, 8, 15, 22, dim].map(d => '<span>' + d + '.</span>').join('');
  const wk = list.filter(t => t.kwh > 0 && t.km > 0), skwh = wk.reduce((a, t) => a + t.kwh, 0), skm = wk.reduce((a, t) => a + t.km, 0), dmin = list.reduce((a, t) => a + (t.dmin || 0), 0);
  $('rf-k100').textContent = skm ? fmt(skwh / skm * 100, 1) : '–'; $('rf-time').textContent = dmin ? fmt(dmin / 60, 1) : '–'; $('rf-speed').textContent = dmin ? fmt(km / (dmin / 60), 0) : '–';
  const split = {}; list.forEach(t => { const g = tripLabel(t).lab.id; split[g] = (split[g] || 0) + (t.km || 0); });
  const tags = getTLabels().filter(l => split[l.id] > 0);
  $('rf-split').innerHTML = '<div class="flex h-3 rounded-full overflow-hidden">' + tags.map(l => `<div style="width:${(split[l.id] / km * 100).toFixed(1)}%;background:${esc(l.color)}"></div>`).join('') + '</div>'
    + '<div class="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">' + tags.map(l => `<span><span style="color:${esc(l.color)}" aria-hidden="true">●</span> ${esc(l.name)} ${fmt(split[l.id], 0)} km <span class="text-xs text-slate-500 dark:text-slate-400">${fmt(split[l.id] / km * 100, 0)} %</span></span>`).join('') + '</div>';
  const dest = new Map(); list.forEach(t => { const n = placeName(t.a1, t.p1), o = dest.get(n) || { n: 0, km: 0 }; o.n++; o.km += t.km || 0; dest.set(n, o); });
  $('rf-top').innerHTML = [...dest.entries()].sort((a, b) => b[1].n - a[1].n || b[1].km - a[1].km).slice(0, 5).map(([n, o]) => repRow(esc(n), o.n + ' × · ' + fmt(o.km, 0) + ' km')).join('');
}
$('rf-csv').addEventListener('click', () => { const ym = reportYM.y + '-' + pad2(reportYM.m + 1); tripsCsv(getTrips().filter(t => tripYM(t) === ym && tripVisible(t)), 'fahrtenbuch-' + ym + '.csv'); });
$('rf-all').addEventListener('click', () => { histFilter = 'fahrten'; showView('history'); });

/** Datensicherung: Fahrten zusammenführen (gleiche ID = vorhanden, eigenes Etikett bleibt) und Orte/Regeln/Etiketten ergänzen. Liefert die Zahl neuer Fahrten. */
function importTripsFromBackup(text) {
  let d; try { d = JSON.parse(text); } catch (e) { return 0; }
  const list = Array.isArray(d.trips) ? d.trips.filter(t => t && typeof t.id === 'string' && !isNaN(Date.parse(t.s)) && !isNaN(Date.parse(t.e))) : [];
  const cur = getTrips(), ids = new Set(cur.map(t => t.id)), fresh = list.filter(t => !ids.has(t.id));
  if (fresh.length) commitTrips(cur.concat(fresh));
  const pf = d.tripPrefs; if (pf && typeof pf === 'object') {
    const pl = getTPlaces(), ru = getTRules(), np = Array.isArray(pf.places) ? pf.places.filter(p => p && p.id && isFinite(p.lat) && isFinite(p.lon) && !pl.some(q => q.id === p.id)) : [];
    const nr = Array.isArray(pf.rules) ? pf.rules.filter(r => r && r.id && r.a && r.b && !ru.some(q => q.id === r.id)) : [];
    const cl = getTLabels(), nl = Array.isArray(pf.labels) ? pf.labels.filter(l => l && l.id && l.name && !cl.some(q => q.id === l.id)) : [];
    if (np.length) save(KEY_TPLACES, pl.concat(np));
    if (nr.length || nl.length) setTripPrefs({ rules: ru.concat(nr), labels: cl.concat(nl).slice(0, LABEL_COLORS.length) }); else if (np.length) { renderTPlaceList(); pushTripPrefs(); }
  }
  return fresh.length;
}
/* ---- Cloud-Abgleich ---- */
window.onCloudTrips = (months, first, uid) => {                    // months = { 'JJJJ-MM': [Fahrten] }
  if (first) checkCacheUid(uid);
  const cloud = [].concat(...Object.values(months)), local = getTrips();
  let next = cloud;
  if (first) {                                                     // vor der Anmeldung importierte Fahrten nachreichen
    const ids = new Set(cloud.map(t => t.id)), missing = local.filter(t => !ids.has(t.id));
    if (missing.length) { next = cloud.concat(missing); window.cloud.pushTrips(cloud, next).catch(() => { }); }
  }
  next.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  if (JSON.stringify(next) !== JSON.stringify(local)) { save(KEY_TRIPS, next); refreshViews(); try { ltFillKm(); btFillTrips(); } catch (e) { } }
};
window.onCloudPlaces = (d, first, uid) => {                       // d = { list (Orte), labels, rules, defLabel } oder null
  if (first) checkCacheUid(uid);
  const lp = getTPlaces(), lr = getTRules();
  if (!d) { if (first && (lp.length || lr.length || localStorage.getItem(KEY_TLABELS))) pushTripPrefs(); return; }
  let places = Array.isArray(d.list) ? d.list : [], rules = Array.isArray(d.rules) ? d.rules : [], up = false;
  if (first) {                                                     // vor der Anmeldung angelegte Orte/Regeln nachreichen
    const mp = places.concat(lp.filter(p => !places.some(q => q.id === p.id))), mr = rules.concat(lr.filter(r => !rules.some(q => q.id === r.id)));
    if (mp.length !== places.length || mr.length !== rules.length || (!d.labels && localStorage.getItem(KEY_TLABELS))) up = true; places = mp; rules = mr;
  }
  const before = JSON.stringify([lp, lr, getTLabels(), defLabelId()]);
  save(KEY_TPLACES, places); save(KEY_TRULES, rules);
  if (Array.isArray(d.labels) && d.labels.length) save(KEY_TLABELS, d.labels); if (d.defLabel) save(KEY_TDEF, d.defLabel);
  if (up) pushTripPrefs();
  if (JSON.stringify([getTPlaces(), getTRules(), getTLabels(), defLabelId()]) !== before) { renderTPlaceList(); renderTLabelSettings(); refreshViews(); }
};
renderTPlaceList(); renderTLabelSettings(); renderTripsLast();

/* =====================================================================
   Wischgesten für die Segment-Tabs: links/rechts wischen = nächster/vorheriger Tab. Es wird einfach der benachbarte Button „geklickt“,
   damit gilt dieselbe Logik wie beim Antippen. Touch-Events statt Pointer-Events, weil der Browser Pointer beim Scrollen abbricht.
   Ausgenommen: Eingabefelder, Schieberegler (Akku), Kamera, waagrecht scrollbare Bereiche und Start am Bildschirmrand (Zurück-Geste von Android).
   ===================================================================== */
function segSwipe(area, seg, ignore = '') {
  if (!area || !seg) return;
  const skip = 'input,select,textarea,video,.touch-none,[role=slider],.overflow-x-auto' + (ignore ? ',' + ignore : '');
  let sx = 0, sy = 0, st = 0, on = false;
  area.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; on = e.touches.length === 1 && !e.target.closest(skip) && t.clientX > 24 && t.clientX < innerWidth - 24;
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  area.addEventListener('touchend', (e) => {
    if (!on) return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - st > 800) return;     // nur klare, zügige Wischbewegung zur Seite
    const btns = [...seg.querySelectorAll('button')].filter(b => b.offsetParent !== null), i = btns.findIndex(b => b.classList.contains('bg-white')), j = i + (dx < 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= btns.length) return;
    btns[j].click();
  }, { passive: true });
  area.addEventListener('touchcancel', () => { on = false; }, { passive: true });
}
segSwipe($('view-capture'), $('cap-place'));                               // Laden: Zuhause | Bosch | Unterwegs (ganze Seite)
segSwipe($('view-history'), $('hist-filter'));                             // Historie: Alle | Laden | Kosten | Fahrten (ganze Seite)
