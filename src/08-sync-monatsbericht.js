/* =====================================================================
   Cloud-Sync: Firestore ist die Quelle der Wahrheit, localStorage der schnelle Cache (auch offline).
   Pfad: enyaqStrom/{uid}/readings/{id}. Einstellungen und Live-Daten bleiben bewusst lokal.
   Das Firebase-Modul unten ruft diese beiden Funktionen auf.
   ===================================================================== */
let deferredCloud = null, cloudEmail = null;

function applyCloud(list) { save(KEY_READINGS, list); refreshViews(); }
function refreshViews() {
  const v = [...document.querySelectorAll('.view')].find(el => !el.classList.contains('hidden'));
  if (v?.id === 'view-dashboard') renderDashboard();
  if (v?.id === 'view-history') renderHistory();
  if (v?.id === 'view-report') renderReport();
  if (v?.id === 'view-costs') renderCostsView();
  if (v?.id === 'view-reminders') renderReminders();
  renderReminderBadges();
}
const sameId = (a, b) => String(a.id) === String(b.id);
/* Alte Zwischenspeicher dürfen nichts wieder hochladen, was inzwischen woanders gelöscht wurde (z. B. nach einer Wiederherstellung):
   Lokale Einträge, die in der Cloud fehlen, werden nur hochgeladen, wenn dieses Gerät sie nach dem letzten Abgleich angelegt hat (die ID ist ein Zeitstempel)
   oder wenn es noch nie mit diesem Konto abgeglichen war (erste Anmeldung mit vorhandenen lokalen Daten). Offline angelegte Einträge hält zusätzlich die Firestore-Warteschlange. */
const LAST_SYNC_AT = Number(localStorage.getItem('enyaq.lastSync')) || 0, CACHE_UID_AT_BOOT = localStorage.getItem('enyaq.cacheUid');
function touchSync() { try { localStorage.setItem('enyaq.lastSync', String(Date.now())); } catch {} }
function uploadCutoff(uid) { return LAST_SYNC_AT > 0 ? LAST_SYNC_AT : (CACHE_UID_AT_BOOT === uid ? Infinity : 0); }       // 0 = alles hochladen, Infinity = nichts
const unsyncedLocal = (local, cloud, uid) => { const cut = uploadCutoff(uid); return local.filter(x => !cloud.some(c => sameId(c, x)) && (cut === 0 || Number(x.id) > cut)); };
const KEY_CACHE_UID = 'enyaq.cacheUid';                   // Konto (UID), zu dem der lokale Cache gehört

/** Schutz: Daten eines anderen Kontos nie in dieses Konto hochladen (gilt für Zählerstände, Kosten, Listen). */
function checkCacheUid(uid) {
  if (!uid) return;
  const prev = localStorage.getItem(KEY_CACHE_UID);
  if (prev && prev !== uid) { save(KEY_READINGS, []); save(KEY_COSTS, []); save(KEY_REMINDERS, []); save(KEY_RECUR, []); localStorage.removeItem(KEY_PROVIDERS); localStorage.removeItem(KEY_PROVINFO); localStorage.removeItem(KEY_DVBAK); localStorage.removeItem('enyaq.kb'); localStorage.removeItem(KEY_CATEGORIES); localStorage.removeItem(KEY_WXLOC); localStorage.removeItem(KEY_WXCACHE); localStorage.removeItem(KEY_TEMPS); localStorage.removeItem(KEY_WRAP); save(KEY_TRIPS, []); localStorage.removeItem(KEY_TPLACES); localStorage.removeItem(KEY_TRIPS_IMP); localStorage.removeItem(KEY_TLABELS); localStorage.removeItem(KEY_TRULES); localStorage.removeItem(KEY_TDEF); stopLive(false);
    /* auch alles Konto-Bezogene, das sonst hängen bliebe: Einstellungen (kommen aus der Cloud des neuen Kontos), Fahrzeugstatus und km-Stand
       (sonst bis zu 1 h die Werte des vorherigen Autos), Prognose, Eis-/Frost-Hinweise, Abzeichen, letzte Route, „Fahrzeug verbinden – später“ */
    [KEY_SETTINGS, KEY_WXO, KEY_WXO + 'S', KEY_ICE, KEY_FROST, KEY_BADGES, KEY_RT, KEY_VEH_LATER, 'enyaq.onbPreset'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    carKmCache = null; try { renderVehCard(); } catch (e) { } try { applyTitle(); } catch (e) { } }
  localStorage.setItem(KEY_CACHE_UID, uid);
}
let deferredCosts = null;
window.onCloudCosts = (cloud, isFirst, uid) => {
  if (isFirst) checkCacheUid(uid);
  cloud = cloud.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (isFirst) {                                         // lokale Kosten, die in der Cloud fehlen, automatisch hochladen und behalten
    const missing = unsyncedLocal(getCosts(), cloud, uid);
    if (missing.length) {
      window.cloud.pushCosts([], missing).catch(e => window.onCloudStatus({ error: 'Kosten-Upload fehlgeschlagen: ' + (e.code || e.message) }));
      cloud = cloud.concat(missing).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  }
  if (editMode) deferredCosts = cloud; else { save(KEY_COSTS, cloud); refreshViews(); bookRecurring(); }
  touchSync();
};
window.onCloudReadings = (cloud, isFirst, uid) => {
  if (isFirst) checkCacheUid(uid);
  cloud = cloud.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (isFirst) {                                         // beim ersten Abgleich: lokale Einträge, die in der Cloud fehlen
    const missing = unsyncedLocal(getReadings(), cloud, uid);
    if (missing.length) {                                // automatisch hochladen und lokal behalten – es geht nichts verloren
      window.cloud.push([], missing)
        .then(() => window.onCloudStatus({ email: cloudEmail, note: missing.length + ' lokale Einträge in die Cloud übertragen' }))
        .catch(e => window.onCloudStatus({ error: 'Upload fehlgeschlagen: ' + (e.code || e.message) }));
      cloud = cloud.concat(missing).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
  }
  if (editMode) deferredCloud = cloud; else applyCloud(cloud);
  touchSync();
};

window.onCloudStatus = (s) => {
  if (s === null) { vehicle = { uid: null, ok: false, allowed: false, expires: null }; vehicleChecked = false; save(KEY_VEHICLE, vehicle); renderVehicleStatus(); refreshViews(); }
  else if (s.uid && !vehicleChecked) { vehicleChecked = true; checkVehicle(s.uid); }              // beim Start im Hintergrund prüfen
  const el = $('cloud-status'), btn = $('btn-cloud');
  if (!s?.error) cloudEmail = s?.email || null;
  if (s?.error) { el.textContent = 'Fehler: ' + s.error; el.className = 'text-sm text-red-600 dark:text-red-400'; }
  else if (cloudEmail) { el.textContent = 'Angemeldet als ' + cloudEmail + ' – Synchronisation aktiv.' + (s?.note ? ' ' + s.note + '.' : ''); el.className = 'text-sm text-emerald-700 dark:text-emerald-400'; }
  else { el.textContent = 'Nicht angemeldet – Daten nur auf diesem Gerät.'; el.className = 'text-sm text-slate-500 dark:text-slate-400'; }
  btn.textContent = cloudEmail ? 'Abmelden' : 'Mit Google anmelden';
  paintUserBoxes();
};
/* Anmeldung kommt erst nach dem Start (Firebase): Konto-Zeilen in Schnellmenü und Einstellungs-Menü dann nachziehen – sonst bleibt am PC „Nicht angemeldet“ stehen */
function paintUserBoxes() { try { renderNavUser(); } catch (e) { } try { renderDrawerUser(); } catch (e) { } }
$('btn-help').addEventListener('click', () => { $('help-copy').textContent = 'Kopieren'; $('help-dialog').classList.remove('hidden'); });   // Einladungslink (Gedankenstütze)
$('help-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('help-tpl').textContent); $('help-copy').textContent = 'Kopiert ✓'; } catch (e) { $('help-copy').textContent = 'Bitte von Hand markieren'; } });
$('help-close').addEventListener('click', () => $('help-dialog').classList.add('hidden'));
$('help-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });   // Tippen neben das Fenster schließt
$('btn-cloud').addEventListener('click', async () => {
  if (!window.cloud) { appNote('Firebase konnte nicht geladen werden (offline?).'); return; }
  try { cloudEmail ? await window.cloud.logout() : await window.cloud.login(); }
  catch (e) { window.onCloudStatus({ error: e.code || e.message }); }
});
setTimeout(() => { if (!window.cloud) $('cloud-status').textContent = 'Cloud-Sync nicht verfügbar (Firebase nicht geladen).'; }, 4000);

/* Service Worker registrieren (funktioniert nur über https:// oder localhost, nicht über file://) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err)));
}

/* =====================================================================
   Monatsbericht (Tab "Berichte")
   Alle Zahlen kommen aus monthReport(jahr, monat) – die Ansicht rechnet nichts selbst.
   Zuordnung der Ladungen nach Ablesedatum (wie im Verbrauchs-Diagramm).
   ===================================================================== */
const MONTHS_LONG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const KEY_REPORT_SEEN = 'enyaq.reportSeen';
let reportYM = null;                                      // { y, m } des angezeigten Monats; null = Standardmonat beim nächsten Öffnen
const ymKey = (y, m) => y + '-' + pad2(m + 1);
/* Hinweis-Status geräteübergreifend: in den Einstellungen (Cloud-Dokument) gespeichert, damit „gesehen/erledigt“ auf allen Geräten gilt.
   nRep = Monatsbericht gesehen (JJJJ-MM), nTrips = Fahrtenbuch-Hinweis ausgeblendet (JJJJ-MM), nBakYm/nBakAt = letzte Sicherung, nBakSnz = Sicherung heute ausgeblendet */
function nagSet(obj) { const st = load(KEY_SETTINGS, {}) || {}; Object.assign(st, obj); save(KEY_SETTINGS, st); try { pushPrefs(); } catch (e) { } }
const maxStr = (...a) => a.filter(Boolean).sort().pop() || '';
const sgn = (n, d = 1) => (n > 0.0001 ? '+' : n < -0.0001 ? '−' : '±') + fmt(Math.abs(n), d);
const isoWeek = (d) => {                                  // ISO-Kalenderwoche
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};

function monthReport(y, m, place = 'home') {
  const rs = getReadings(), s = new Date(y, m, 1), e = new Date(y, m + 1, 1), wk = new Map();
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) { const k = isoWeek(d); if (!wk.has(k)) wk.set(k, 0); }
  const o = { y, m, place, charges: [], kwh: 0, cost: 0, km: 0, kwhKm: 0, costKm: 0, nKm: 0, chg: 0, stored: 0, nSoc: 0, lossCost: 0, kwhP: 0, costP: 0 }, idx = [];
  rs.forEach((r, i) => {
    const d = new Date(r.date);
    if (!inView(r, place) || isStartRow(rs, i) || !(d >= s && d < e)) return;   // der erste Zuhause-Eintrag (ohne Reset) ist nur der Startwert
    const st = entryStats(rs, i), c = r.consumedSinceLast, u = unitOf(r);
    o.kwh += c; o.cost += r.cost;
    wk.set(isoWeek(d), (wk.get(isoWeek(d)) || 0) + c);
    if (isCharge(rs, i)) o.charges.push({ r, d, st });
    if (u != null && c > 0) { o.kwhP += c; o.costP += c * u; }                      // Ø Preis nur aus Ladungen mit kWh und Preis
    idx.push(i);
    if (st.stored !== undefined) { o.chg += c; o.stored += st.stored; o.nSoc++; o.lossCost += (c - st.stored) * (u ?? 0); }
  });
  o.weeks = [...wk].map(([kw, kwh]) => ({ kw, kwh }));
  const t = consumptionTotals(rs, idx);                   // Verbrauch aus der Akku-Entnahme (falls Akku-% erfasst), sonst grob
  o.km = t.km; o.kwhKm = t.kwh; o.costKm = t.cost; o.nKm = t.n; o.approx = t.approx;
  o.kwh100 = t.km ? t.kwh100 : null;
  o.cost100 = t.cost100;
  o.loss = o.chg > 0 ? Math.max(0, (1 - o.stored / o.chg) * 100) : null;
  o.lossCost = Math.max(0, o.lossCost);
  o.price = o.kwhP > 0 ? o.costP / o.kwhP : null;
  return o;
}
/** Hat der Monat bei irgendeinem Ladeort Ladungen? (für Hinweiskarte und Standardmonat) */
const costsIn = (y, m) => getCosts().filter(c => { const d = new Date(c.date); return d.getFullYear() === y && d.getMonth() === m; });
const monthHasCharges = (y, m) => PLACE_KEYS.some(k => monthReport(y, m, k).charges.length > 0) || costsIn(y, m).length > 0;

const prevMonthOf = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() - 1, 1);
function defaultReportMonth() {                           // Standard: laufender Monat, wenn er Ladungen hat; sonst der Vormonat
  const n = new Date(), p = prevMonthOf(n), cur = { y: n.getFullYear(), m: n.getMonth() };
  if (monthHasCharges(cur.y, cur.m)) return cur;
  return monthHasCharges(p.getFullYear(), p.getMonth()) ? { y: p.getFullYear(), m: p.getMonth() } : cur;
}
function markReportSeen(y, m) {
  const p = prevMonthOf();
  if (y === p.getFullYear() && m === p.getMonth()) { save(KEY_REPORT_SEEN, ymKey(y, m)); if (getSettings().nRep !== ymKey(y, m)) nagSet({ nRep: ymKey(y, m) }); }
}

/** Hinweiskarte auf dem Dashboard, solange der Bericht des Vormonats noch nicht angesehen wurde. */
function renderReportBanner() {
  const el = $('report-banner'), p = prevMonthOf(), key = ymKey(p.getFullYear(), p.getMonth());
  const show = maxStr(load(KEY_REPORT_SEEN, ''), getSettings().nRep) < key && monthHasCharges(p.getFullYear(), p.getMonth());
  el.classList.toggle('hidden', !show);
  if (show) $('report-banner-text').textContent = 'Dein Bericht für ' + MONTHS_LONG[p.getMonth()] + ' ist fertig';
}
/** Import-Erinnerung Fahrtenbuch: ab dem 1. eines Monats, solange die neueste Fahrt älter als die letzten 3 Tage des Vormonats ist
    (= Vormonat noch nicht importiert). Nur wenn das Fahrtenbuch schon genutzt wird; „×“ blendet sie für den laufenden Monat aus. */
const KEY_TRIPS_NAG = 'enyaq.tripsNagHidden';
function renderTripsBanner() {
  const el = $('trips-banner'); if (!el || typeof getTrips !== 'function') return;
  const n = new Date(), mKey = ymKey(n.getFullYear(), n.getMonth()), trips = getTrips();
  const newest = trips.reduce((a, t) => Math.max(a, Date.parse(t.e) || 0), 0), cut = new Date(n.getFullYear(), n.getMonth(), 1).getTime() - 3 * 864e5;
  const show = trips.length > 0 && newest < cut && maxStr(load(KEY_TRIPS_NAG, ''), getSettings().nTrips) < mKey;
  el.classList.toggle('hidden', !show);
  if (show) { const p = prevMonthOf(); $('trips-banner-text').textContent = 'Fahrtenbuch für ' + MONTHS_LONG[p.getMonth()] + ' importieren'; }
}
$('trips-banner-go').addEventListener('click', () => { openSettings('fahrten'); setTimeout(() => $('btn-trips').scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); });
$('trips-banner-x').addEventListener('click', () => { const n = new Date(), k = ymKey(n.getFullYear(), n.getMonth()); save(KEY_TRIPS_NAG, k); nagSet({ nTrips: k }); renderTripsBanner(); });
$('report-banner').addEventListener('click', () => { const p = prevMonthOf(); reportYM = { y: p.getFullYear(), m: p.getMonth() }; showView('report'); });

/** km, die im Monat gefahren wurden: aus den km-Ständen von Ladungen und Kosten (letzter Stand im Monat minus letzter Stand davor). */
function kmDrivenIn(y, m) {
  const pts = getReadings().filter(r => r.odometerKm > 0).map(r => [Date.parse(r.date), r.odometerKm])
    .concat(getCosts().filter(c => c.odometerKm > 0).map(c => [Date.parse(c.date), c.odometerKm])).sort((a, b) => a[0] - b[0]);
  const s0 = new Date(y, m, 1).getTime(), e0 = new Date(y, m + 1, 1).getTime();
  const inM = pts.filter(q => q[0] >= s0 && q[0] < e0); if (!inM.length) return null;
  const before = pts.filter(q => q[0] < s0), b = before[before.length - 1];
  const base = b && s0 - b[0] < 45 * 86400000 ? b[1] : inM[0][1];                       // Stand vor dem Monat nur, wenn er nicht zu alt ist
  const km = inM[inM.length - 1][1] - base; return km > 0 ? km : null;
}
/** Gesamtkosten eines Monats: Laden (alle Orte) + Kosten − Einnahmen. */
function costTotals(y, m) {
  const laden = monthReport(y, m, 'all').cost, cs = costsIn(y, m);
  const other = cs.reduce((a, c) => a + Math.max(0, costAmt(c)), 0), income = -cs.reduce((a, c) => a + Math.min(0, costAmt(c)), 0);
  return { laden, other, income, total: laden + other - income, cs };
}
function renderCostReport(y, m, cur) {
  const t = costTotals(y, m), py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1, p = costTotals(py, pm);
  const nCharges = monthReport(y, m, 'all').charges.length, empty = !nCharges && !t.cs.length;
  $('rk-empty').classList.toggle('hidden', !empty); $('rk-body').classList.toggle('hidden', empty);
  if (empty) return;
  $('rk-total').textContent = fmt(t.total, 2);
  const dl = $('rk-delta');
  if (cur) { dl.textContent = 'Zwischenstand bis heute'; dl.className = 'text-sm mt-2 text-slate-500 dark:text-slate-400'; }
  else if (p.total > 0) {
    const d = t.total - p.total, pct = Math.abs(d) / p.total * 100;
    dl.textContent = (d <= 0 ? '▼ ' : '▲ ') + eur(Math.abs(d)) + ' (' + fmt(pct, 0) + ' %) ' + (d <= 0 ? 'weniger' : 'mehr') + ' als ' + MONTHS_LONG[pm];
    dl.className = 'text-sm mt-2 ' + (d <= 0 ? GOOD : BAD);
  } else { dl.textContent = ''; }
  $('rk-laden').textContent = eur(t.laden); $('rk-other').textContent = eur(t.other); $('rk-income').textContent = t.income > 0 ? '+' + eur(t.income) : '–';

  const rows = [], byCat = new Map();                                                    // Verteilung: Laden + Kategorien (nur Ausgaben)
  t.cs.forEach(c => { const a = costAmt(c); if (a > 0) byCat.set(c.category || 'Ohne Kategorie', (byCat.get(c.category || 'Ohne Kategorie') || 0) + a); });
  if (t.laden > 0) rows.push({ n: 'Laden', v: t.laden, cls: 'bg-emerald-500' });
  [...byCat].forEach(([n, v]) => rows.push({ n, v, cls: 'bg-sky-500' }));
  rows.sort((a, b) => b.v - a.v);
  const sum = rows.reduce((a, r) => a + r.v, 0), max = rows[0]?.v || 1;
  $('rk-cats').innerHTML = rows.length ? rows.map(r => `<div class="py-1.5"><div class="flex justify-between items-baseline text-sm gap-3"><span class="truncate">${esc(r.n)}</span><span class="font-medium whitespace-nowrap">${eur(r.v)} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">${fmt(r.v / sum * 100, 0)} %</span></span></div><div class="h-2 mt-1 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden"><div class="h-full rounded ${r.cls}" style="width:${(r.v / max * 100).toFixed(1)}%"></div></div></div>`).join('')
                                       : '<p class="text-sm text-slate-500 dark:text-slate-400">Keine Ausgaben in diesem Monat.</p>';

  const km = kmDrivenIn(y, m);                                                            // pro 100 km (Einnahmen sind abgezogen)
  $('rk-km').textContent = km ? fmt(km, 0) : '–';
  $('rk-100').textContent = km ? eur(t.total / km * 100) : '–';
  $('rk-100o').textContent = km ? eur((t.total - t.laden) / km * 100) : '–';
  $('rk-km-note').textContent = km ? 'km aus den erfassten km-Ständen von Ladungen und Kosten. Einnahmen sind abgezogen.' : 'Für diesen Monat fehlen km-Stände (bei Ladungen oder Kosten eintragen).';

  let ytd = 0, ytdLaden = 0, ytdOther = 0;                                                // Jahr bisher
  for (let mm = 0; mm <= m; mm++) { const q = costTotals(y, mm); ytd += q.total; ytdLaden += q.laden; ytdOther += q.other - q.income; }
  $('rk-ytd').innerHTML = repRow('Gesamtkosten ' + y, eur(ytd)) + repRow('davon Laden', eur(ytdLaden)) + repRow('davon Kosten (netto)', eur(ytdOther)) + repRow('Ø pro Monat', eur(ytd / (m + 1)));

  const list = t.cs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  $('rk-list').innerHTML = list.length ? list.map(c => { const a = costAmt(c), d = new Date(c.date);
    return `<div class="flex justify-between items-baseline gap-3 text-sm py-1.5 border-t first:border-t-0 border-slate-200 dark:border-slate-800"><span class="min-w-0"><span class="text-slate-500 dark:text-slate-400">${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.</span> <span class="break-words">${esc(c.title || 'Kosten')}</span>${c.category ? ` <span class="text-xs text-slate-500 dark:text-slate-400">· ${esc(c.category)}</span>` : ''}</span><span class="font-medium whitespace-nowrap ${a < 0 ? GOOD : ''}">${a < 0 ? '+' : ''}${eur(Math.abs(a))}</span></div>`; }).join('')
    : '<p class="text-sm text-slate-500 dark:text-slate-400">Keine Kosten außer Laden.</p>';
}
document.querySelectorAll('.rep-mode-btn').forEach(b => b.addEventListener('click', () => { repMode = b.dataset.mode; renderReport(); }));

const repRow = (k, v, cls = '') => `<div class="flex justify-between items-baseline gap-3 text-sm py-1.5 border-t first:border-t-0 border-slate-200 dark:border-slate-800"><span class="text-slate-500 dark:text-slate-400">${k}</span><span class="font-medium text-right ${cls}">${v}</span></div>`;
const GOOD = 'text-emerald-600 dark:text-emerald-400', BAD = 'text-amber-600 dark:text-amber-400';

function renderReport() {
  if (!reportYM) reportYM = defaultReportMonth();
  const { y, m } = reportYM, rs = getReadings(), n = new Date(), cur = y === n.getFullYear() && m === n.getMonth();
  const r = monthReport(y, m, repPlace), py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1, p = monthReport(py, pm, repPlace);
  const dates = rs.map(x => Date.parse(x.date)).concat(getCosts().map(c => Date.parse(c.date)), getTrips().map(t => Date.parse(t.s))).filter(Number.isFinite);
  const first = dates.length ? new Date(Math.min(...dates)) : n;                     // frühester Eintrag (Ladung oder Kosten)
  $('rep-prev').disabled = !(y > first.getFullYear() || (y === first.getFullYear() && m > first.getMonth()));
  $('rep-next').disabled = cur;
  $('rep-title').textContent = MONTHS_LONG[m] + ' ' + y;
  $('rep-sub').textContent = (cur ? 'Zwischenstand bis heute' : 'Monatsbericht') + ' · ' + VIEWS[repPlace];
  segPaint('.rep-place-btn', repPlace);
  $('rep-print-app').textContent = getSettings().title || DEFAULT_TITLE;
  markReportSeen(y, m);
  segPaintKey('.rep-mode-btn', 'mode', repMode);
  $('rep-laden').classList.toggle('hidden', repMode !== 'laden'); $('rep-kosten').classList.toggle('hidden', repMode !== 'kosten'); $('rep-fahrten').classList.toggle('hidden', repMode !== 'fahrten');
  $('rep-head').classList.toggle('hidden', repMode === 'akku' || repMode === 'stat'); $('rep-akku').classList.toggle('hidden', repMode !== 'akku'); $('rep-stat').classList.toggle('hidden', repMode !== 'stat');
  if (repMode === 'stat') { renderStat(); return; }
  if (repMode === 'fahrten') { renderTripReport(y, m); return; }
  if (repMode === 'akku') { renderBattery(); return; }
  if (repMode === 'kosten') { $('rep-sub').textContent = (cur ? 'Zwischenstand bis heute' : 'Kostenbericht') + ' · Laden + Kosten'; renderCostReport(y, m, cur); return; }

  const empty = !r.charges.length;
  $('rep-empty-t').textContent = 'Keine Ladungen' + whereTxt(repPlace) + ' in diesem Monat';
  $('rep-empty-s').textContent = repPlace === 'home' || repPlace === 'all' ? 'Sobald du eine Ladung erfasst, erscheint hier der Bericht.' : 'Sobald du eine Ladung bei „' + PLACES[repPlace] + '“ erfasst, erscheint hier der Bericht.';
  $('rep-empty').classList.toggle('hidden', !empty); $('rep-body').classList.toggle('hidden', empty);
  if (empty) return;

  /* Kopf: Kosten und Vergleich bzw. Hochrechnung */
  const dim = new Date(y, m + 1, 0).getDate(), days = Math.max(1, (Date.now() - new Date(y, m, 1)) / 86400000), proj = r.cost / days * dim;
  $('rep-cost').textContent = fmt(r.cost, 2);
  const dl = $('rep-delta');
  if (cur) { dl.textContent = 'Hochrechnung bis Monatsende: ca. ' + eur(proj); dl.className = 'text-sm mt-2 text-slate-500 dark:text-slate-400'; }
  else if (p.cost > 0) {
    const pct = (r.cost / p.cost - 1) * 100;
    dl.textContent = (pct <= 0 ? '↓ ' + fmt(-pct, 0) + ' % günstiger' : '↑ ' + fmt(pct, 0) + ' % teurer') + ' als im ' + MONTHS_LONG[pm] + ' (' + eur(p.cost) + ')';
    dl.className = 'text-sm mt-2 ' + (pct <= 0 ? GOOD : BAD);
  } else { dl.textContent = 'Kein Vormonat zum Vergleich'; dl.className = 'text-sm mt-2 text-slate-500 dark:text-slate-400'; }

  $('rep-kwh').textContent = fmt(r.kwh, 1);
  const nk = r.charges.filter(c => c.r.consumedSinceLast > 0).length;               // Bosch/Unterwegs: kWh sind optional
  $('rep-n').textContent = r.charges.length; $('rep-n-sub').textContent = nk ? 'Ø ' + fmt(r.kwh / nk, 1) + ' kWh' : 'ohne kWh-Angabe';
  $('rep-price').textContent = r.price != null ? fmt(r.price, 3) : '–';

  /* Wochenverlauf */
  const max = Math.max(1, ...r.weeks.map(w => w.kwh)), top = Math.max(...r.weeks.map(w => w.kwh));
  $('rep-weeks').innerHTML = `<div class="flex items-end gap-2 h-[120px]">${r.weeks.map(w => `<div class="flex-1 text-center"><div class="text-xs ${w.kwh === top ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}">${w.kwh > 0 ? fmt(w.kwh, 1) : '–'}</div><div class="rounded" style="height:${Math.max(2, Math.round(w.kwh / max * 90))}px;background:${w.kwh === top ? '#1D9E75' : '#5DCAA5'}"></div></div>`).join('')}</div>`
    + `<div class="flex gap-2 mt-1">${r.weeks.map(w => `<span class="flex-1 text-center text-xs text-slate-500 dark:text-slate-400">KW ${w.kw}</span>`).join('')}</div>`;

  /* Effizienz */
  $('rep-kwh100').textContent = r.kwh100 != null ? fmt(r.kwh100, 1) : '–';
  $('rep-cost100').textContent = r.cost100 != null ? fmt(r.cost100, 2) : '–';
  $('rep-loss').textContent = r.loss != null ? fmt(r.loss, 0) + ' %' : '–';
  $('rep-eff-note').textContent = (r.km ? fmt(r.km, 0) + ' km gefahren' : 'Kein km-Stand erfasst') + (r.approx ? ' · Verbrauch grob (ohne Akku-%)' : '') + (r.loss != null ? ' · Verlust kostete ca. ' + eur(r.lossCost) : '');

  /* Vergleich + Jahr */
  let ytdCost = 0, ytdKwh = 0, ytdMonths = 0;
  for (let mm = 0; mm <= m; mm++) { const q = monthReport(y, mm, repPlace); if (q.charges.length) { ytdCost += q.cost; ytdKwh += q.kwh; ytdMonths++; } }
  const rows = [];
  if (p.charges.length && cur) {
    rows.push(repRow('Kosten ' + MONTHS_LONG[pm] + ' (gesamt)', eur(p.cost)), repRow('kWh ' + MONTHS_LONG[pm] + ' (gesamt)', fmt(p.kwh, 1) + ' kWh'), repRow('Hochrechnung dieser Monat', 'ca. ' + eur(proj)));
  } else if (p.charges.length) {
    rows.push(repRow('Kosten zum Vormonat', sgn(r.cost - p.cost, 2) + ' € (' + sgn((r.cost / p.cost - 1) * 100, 0) + ' %)', r.cost <= p.cost ? GOOD : BAD),
              repRow('kWh zum Vormonat', sgn(r.kwh - p.kwh, 1) + ' kWh', r.kwh <= p.kwh ? GOOD : BAD));
    if (r.kwh100 != null && p.kwh100 != null) rows.push(repRow('Verbrauch zum Vormonat', sgn(r.kwh100 - p.kwh100, 1) + ' kWh/100 km', r.kwh100 <= p.kwh100 ? GOOD : BAD));
  } else rows.push(repRow('Vormonat', 'keine Daten'));
  rows.push(repRow('Ø Monatskosten ' + y, eur(ytdCost / ytdMonths)));
  $('rep-compare').innerHTML = rows.join('');

  /* Highlights */
  const big = r.charges.reduce((a, b) => b.r.consumedSinceLast > a.r.consumedSinceLast ? b : a);
  const wd = [0, 0, 0, 0, 0, 0, 0]; r.charges.forEach(c => wd[c.d.getDay()]++);
  const wdTop = wd.indexOf(Math.max(...wd));
  const hc = r.charges.filter(c => isHome(c.r));                                  // Ladedauer gibt es nur für Zähler-Ladungen zuhause
  const avgMin = hc.reduce((s, c) => s + (realMsOf(c.r) ? realMsOf(c.r) / 60000 : c.r.consumedSinceLast / chargePowerKw() * 60), 0) / (hc.length || 1);
  $('rep-high').innerHTML = (big.r.consumedSinceLast > 0 ? repRow('Größte Ladung', fmt(big.r.consumedSinceLast, 1) + ' kWh' + (big.r.cost > 0 ? ' · ' + eur(big.r.cost) : '') + ' (KW ' + isoWeek(big.d) + ')') : '')
    + repRow('Häufigster Ladetag', WEEKDAYS[wdTop] + ' (' + wd[wdTop] + ' von ' + r.charges.length + ')')
    + (hc.length ? repRow('Ø Ladedauer' + (repPlace === 'all' ? ' (Zuhause)' : ''), durHm(avgMin * 60000) + ' h') : '')
    + repRow('Jahr bisher', eur(ytdCost) + ' · ' + fmt(ytdKwh, 0) + ' kWh');

  /* Hinweise zur Datenbasis */
  const msgs = [], nc = r.charges.length;
  if (r.nKm === 0) msgs.push('Kein km-Stand erfasst – Verbrauch pro 100 km nicht berechenbar.');
  else if (r.nKm < nc) msgs.push('Bei ' + (nc - r.nKm) + ' von ' + nc + ' Ladungen fehlt der km-Stand, der Verbrauch beruht auf ' + r.nKm + ' Ladungen.');
  if (r.nSoc > 0 && r.nSoc < nc) msgs.push('Der Ladeverlust beruht auf ' + r.nSoc + ' von ' + nc + ' Ladungen.');
  const noKwh = r.charges.filter(c => !isHome(c.r) && !(c.r.consumedSinceLast > 0)).length;
  if (noKwh) msgs.push(noKwh + (noKwh === 1 ? ' Ladung' : ' Ladungen') + ' bei Bosch/Unterwegs ohne kWh-Angabe: nicht in kWh und Kosten enthalten.');
  const ign = new Set(load(DQ_KEY, [])), s0 = new Date(y, m, 1), e0 = new Date(y, m + 1, 1);
  const dq = rs.length > 1 ? dataChecks(rs).filter(f => { const d = new Date(rs[f.i].date); return !ign.has(f.id + ':' + f.code) && d >= s0 && d < e0; }).length : 0;
  if (dq) msgs.push(dq + (dq === 1 ? ' Hinweis' : ' Hinweise') + ' aus der Datenprüfung offen.');
  $('rep-hint').textContent = msgs.join(' '); $('rep-hint').classList.toggle('hidden', !msgs.length);

  /* Ladeliste (nur im PDF/Druck sichtbar) */
  const th = 'text-left font-medium py-1 border-b border-slate-300', td = 'py-1 border-b border-slate-200';
  $('rep-list').innerHTML = `<p class="text-sm mb-2">Alle Ladungen im ${MONTHS_LONG[m]} ${y}</p><table class="w-full text-xs"><thead><tr><th class="${th}">Datum</th>${repPlace === 'all' ? `<th class="${th}">Ort</th>` : ''}<th class="${th} text-right">kWh</th><th class="${th} text-right">Kosten</th><th class="${th} text-right">Dauer</th><th class="${th} text-right">km</th></tr></thead><tbody>`
    + r.charges.map(c => `<tr><td class="${td}">${c.d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}, ${c.d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</td>${repPlace === 'all' ? `<td class="${td}">${PLACES[placeOf(c.r)]}</td>` : ''}<td class="${td} text-right">${c.r.consumedSinceLast > 0 ? fmt(c.r.consumedSinceLast, 1) : '–'}</td><td class="${td} text-right">${isHome(c.r) || c.r.cost > 0 || (c.r.consumedSinceLast > 0 && c.r.pricePerKwh != null) ? eur(c.r.cost) : '–'}</td><td class="${td} text-right">${isHome(c.r) ? chargeDurationOf(c.r) : '–'}</td><td class="${td} text-right">${c.st.km ? fmt(c.st.km, 0) : '–'}</td></tr>`).join('')
    + `<tr class="font-semibold"><td class="py-1">Summe</td>${repPlace === 'all' ? '<td></td>' : ''}<td class="py-1 text-right">${fmt(r.kwh, 1)}</td><td class="py-1 text-right">${eur(r.cost)}</td><td></td><td class="py-1 text-right">${r.km ? fmt(r.km, 0) : '–'}</td></tr></tbody></table>`;
}
document.querySelectorAll('.rep-place-btn').forEach(b => b.addEventListener('click', () => { repPlace = b.dataset.place; renderReport(); }));
$('rep-prev').addEventListener('click', () => { const d = new Date(reportYM.y, reportYM.m - 1, 1); reportYM = { y: d.getFullYear(), m: d.getMonth() }; renderReport(); });
$('rep-next').addEventListener('click', () => { const d = new Date(reportYM.y, reportYM.m + 1, 1); reportYM = { y: d.getFullYear(), m: d.getMonth() }; renderReport(); });

/* PDF: Druckdialog des Geräts (dort „Als PDF sichern“); Dateiname = Dokumenttitel */
$('rep-pdf').addEventListener('click', async () => {
  document.body.classList.remove('print-akte'); const old = document.title; document.title = 'Ladebericht ' + $('rep-title').textContent;
  const swaps = [...document.querySelectorAll('#view-report canvas')].filter(c => c.offsetWidth > 0 && c.width > 0).map(c => { const im = new Image(); im.src = c.toDataURL('image/png'); im.className = 'cv-print'; im.style.cssText = 'width:100%;height:auto;max-width:100%'; im.alt = c.getAttribute('aria-label') || 'Diagramm'; c.classList.add('cv-src'); c.after(im); return im; });   // Diagramme als Bilder drucken (Canvas bleibt sonst gern leer)
  await Promise.all(swaps.map(i => i.decode ? i.decode().catch(() => { }) : Promise.resolve())); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.addEventListener('afterprint', () => { document.title = old; swaps.forEach(i => i.remove()); document.querySelectorAll('#view-report .cv-src').forEach(c => c.classList.remove('cv-src')); }, { once: true });
  window.print();
});

/* Bild: Zusammenfassung auf Canvas zeichnen, per Teilen-Dialog senden (sonst als PNG herunterladen) */
$('rep-img').addEventListener('click', () => {
  const W = 1080, H = 1420, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), F = 'system-ui, -apple-system, "Segoe UI", sans-serif', txt = (id) => $(id).textContent;
  const box = (x, y, w, h, col, r = 32) => { g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fill(); };
  const t = (s, x, y, size, col, wt = 400, al = 'left', font = F) => { g.font = wt + ' ' + size + 'px ' + font; g.fillStyle = col; g.textAlign = al; g.fillText(s, x, y); };
  box(0, 0, W, H, '#f1f5f9', 0);
  t(txt('rep-title'), 60, 100, 60, '#0f172a', 600); t((getSettings().title || DEFAULT_TITLE) + ' · ' + txt('rep-sub'), 60, 150, 30, '#64748b');
  box(60, 190, 960, 290, '#fff'); t('Ladekosten im Monat', 100, 250, 30, '#64748b');
  t(txt('rep-cost') + ' €', 100, 365, 110, '#059669', 600);
  t(txt('rep-delta'), 100, 445, 30, /↓/.test(txt('rep-delta')) ? '#059669' : /↑/.test(txt('rep-delta')) ? '#d97706' : '#64748b');
  [['Geladen', 'rep-kwh', 'kWh'], ['Ladungen', 'rep-n', txt('rep-n-sub')], ['Ø Preis', 'rep-price', '€/kWh']].forEach(([l, id, sub], i) => {
    const x = 60 + i * 330; box(x, 510, 300, 190, '#fff', 28); t(l, x + 28, 560, 26, '#64748b'); t(txt(id), x + 28, 630, 54, '#0f172a', 600); t(sub, x + 28, 674, 24, '#64748b');
  });
  box(60, 730, 960, 250, '#fff'); t('Effizienz', 100, 790, 30, '#64748b');
  [['kWh/100 km', 'rep-kwh100', '#ecfdf5', '#047857'], ['€/100 km', 'rep-cost100', '#f0f9ff', '#0369a1'], ['Ladeverlust', 'rep-loss', '#fffbeb', '#b45309']].forEach(([l, id, bg, fg], i) => {
    const x = 100 + i * 300; box(x, 815, 270, 105, bg, 20); t(l, x + 135, 850, 24, '#64748b', 400, 'center'); t(txt(id), x + 135, 900, 44, fg, 600, 'center');
  });
  t(txt('rep-eff-note'), 100, 955, 26, '#64748b');
  const cmp = [...$('rep-compare').children].map(el => [el.children[0].textContent, el.children[1].textContent]).slice(0, 4), h = 90 + cmp.length * 62;
  box(60, 1010, 960, h, '#fff'); t('Vergleich', 100, 1070, 30, '#64748b');
  cmp.forEach(([k, v], i) => { t(k, 100, 1130 + i * 62, 30, '#475569'); t(v, 980, 1130 + i * 62, 30, '#0f172a', 500, 'right'); });
  t('Erstellt mit ' + (getSettings().title || DEFAULT_TITLE), W / 2, H - 40, 24, '#94a3b8', 400, 'center');
  cv.toBlob(async (blob) => {
    if (!blob) { flash($('rep-msg'), 'Bild konnte nicht erstellt werden.', false); $('rep-msg').classList.remove('hidden'); return; }
    const name = 'ladebericht-' + ymKey(reportYM.y, reportYM.m) + '.png', file = new File([blob], name, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Ladebericht ' + txt('rep-title') }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }                       // abgebrochen = nichts tun, sonst Download
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash($('rep-msg'), 'Bild gespeichert.', true); $('rep-msg').classList.remove('hidden');
  }, 'image/png');
});

if (getLive()) tickLive();                              // Live-Modus nach Neuladen fortsetzen
$('scan-card').classList.toggle('hidden', !ENABLE_AI_SCAN);
setCapPlace(capPlace);                                   // Reiter "Zuhause" gleich beim Start hervorheben
bookRecurring();                                         // fällige wiederkehrende Kosten nachbuchen
initCarousel();                                          // Enyaq1–5 laden (asynchron)

/* =====================================================================
   Jahrestag des Kaufs: Festkarte mit Konfetti. Erscheint am Jahrestag des Kauftags (ab dem 1. Jahr)
   bei jedem Öffnen der App und wenn die App nach mindestens 5 Minuten wieder in den Vordergrund kommt.
   Wurde sie am Jahrestag nicht gesehen, erscheint sie innerhalb von 7 Tagen einmal nachträglich.
   Kauf am 29.02.: in Nicht-Schaltjahren am 28.02. Fahrzeugalter monatsgenau ab Baujahr (MM/JJJJ).
   ===================================================================== */
const BD_LATE = 7, KEY_BDSEEN = 'enyaq.bdSeen';            // Frist für die nachträgliche Gratulation (Tage)
const BD_ORD = ['ersten', 'zweiten', 'dritten', 'vierten', 'fünften', 'sechsten', 'siebten', 'achten', 'neunten', 'zehnten'];
function bdInfo(today = new Date()) {
  const [py, pm, pd] = purchaseDay().split('-').map(Number), t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ann = (y) => new Date(y, pm - 1, Math.min(pd, new Date(y, pm, 0).getDate()));   // Jahrestag im Jahr y (29.02. → 28.02.)
  let y = today.getFullYear(), A = ann(y); if (A > t0) { y--; A = ann(y); }               // letzter Jahrestag bis heute
  const years = y - py, late = Math.round((t0 - A) / 864e5);
  if (years < 1 || late > BD_LATE) return null;
  const key = y + '-' + pm;
  if (late > 0 && load(KEY_BDSEEN, '') === key) return null;                              // nachträglich nur einmal
  const ym = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec((getSettings().year || '').trim());
  const ageM = ym ? (y * 12 + pm) - (+ym[2] * 12 + +ym[1]) : null;
  return { years, py, pm, pd, ym: ym ? ym[0] : null, ageM, late, key, day: A, from: ann(y - 1).getTime(), to: A.getTime() };
}
const bdUnit = (n, one, many) => n + ' <span class="text-xl">' + (n === 1 ? one : many) + '</span>';
let bdShown = 0, bdHidden = 0;
async function showBirthday() {
  const b = bdInfo(); if (!b || !$('wr-ov').classList.contains('hidden')) return;
  const set = getSettings(), name = (set.model || '').trim() || carProf().short;
  $('bd-name').textContent = name.split(/\s+/)[0] || carProf().short;
  $('bd-date').textContent = (b.late ? 'Nachträglich · ' : '') + b.day.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  save(KEY_BDSEEN, b.key);
  $('bd-own').innerHTML = bdUnit(b.years, 'Jahr', 'Jahre');
  $('bd-own-s').textContent = 'seit ' + String(b.pd).padStart(2, '0') + '.' + String(b.pm).padStart(2, '0') + '.' + b.py;
  const hasAge = b.ageM != null && b.ageM >= 0;
  $('bd-age-tile').classList.toggle('hidden', !hasAge); $('bd-tiles').classList.toggle('grid-cols-2', hasAge);
  if (hasAge) {
    const J = Math.floor(b.ageM / 12), M = b.ageM % 12;
    $('bd-age').innerHTML = J && M ? J + ' <span class="text-xl">J.</span> ' + M + ' <span class="text-xl">Mon.</span>' : J ? bdUnit(J, 'Jahr', 'Jahre') : bdUnit(M, 'Monat', 'Monate');
    $('bd-age-s').textContent = 'Baujahr ' + b.ym;
  }
  /* Bilanz des zurückliegenden Jahres: Kilometer und Ladungen */
  const km = rangeKm(b.from, b.to), rs = getReadings();
  let n = 0; rs.forEach((r, i) => { const t = Date.parse(r.date); if (t >= b.from && t < b.to && isCharge(rs, i)) n++; });
  const parts = []; if (km) parts.push('<b class="text-white">' + fmt(km, 0) + ' km</b>'); if (n) parts.push('<b class="text-white">' + n + (n === 1 ? ' Ladung' : ' Ladungen') + '</b>');
  $('bd-stats').innerHTML = parts.length ? 'Im ' + (BD_ORD[b.years - 1] ? BD_ORD[b.years - 1] + ' ' : b.years + '. ') + 'gemeinsamen Jahr:<br>' + parts.join(' · ') : '';
  $('bd-stats').classList.toggle('hidden', !parts.length);
  /* Konfetti */
  const box = $('bd-conf'), cols = ['#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa', '#fb7185'];
  box.textContent = '';
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('i'), r = Math.random;
    c.style.cssText = 'left:' + (r() * 100).toFixed(1) + '%;background:' + cols[i % cols.length] + ';--d:' + (4.5 + r() * 4).toFixed(2) + 's;--w:' + (-r() * 8).toFixed(2) + 's;--x:' + ((r() - 0.5) * 120).toFixed(0) + 'px;--r:' + ((r() < 0.5 ? -1 : 1) * (360 + r() * 540)).toFixed(0) + 'deg;--y:' + (r() * 30).toFixed(0) + '%;' + (r() < 0.3 ? 'width:9px;height:9px;border-radius:50%;' : '');
    box.appendChild(c);
  }
  $('bd-ov').classList.remove('hidden'); document.body.style.overflow = 'hidden'; bdShown = Date.now();
  const img = $('bd-img'); if (!img.src) { const src = await findHeroImg(1); if (src) { img.src = (await cutWhite(src)).src; img.alt = 'Dein ' + name; img.classList.remove('hidden'); } }
}
function hideBirthday() { $('bd-ov').classList.add('hidden'); $('bd-conf').textContent = ''; document.body.style.overflow = ''; setTimeout(() => { try { showNextBadge(); } catch (e) { } }, 350); }
$('bd-close').addEventListener('click', hideBirthday);
$('bd-ov').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.parentElement === e.currentTarget) hideBirthday(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('bd-ov').classList.contains('hidden')) hideBirthday(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { bdHidden = Date.now(); return; }
  if (bdHidden && Date.now() - bdHidden >= 5 * 60 * 1000 && $('bd-ov').classList.contains('hidden')) showBirthday();
});
setTimeout(showBirthday, 700);                           // nach dem Start, damit Daten und Bild bereitstehen
