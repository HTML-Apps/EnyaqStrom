/* =====================================================================
   Cloud-Abgleich von WLTP-Wert, Wetter-Standort, Ladeanbieter-Angaben und Einstellungen (Fahrzeugdaten, Strompreis, Akku, Kauf …)
   im Dokument enyaqStrom/<uid>/settings/prefs, gleiche Regel wie Anbieter und Kategorien. Die PIN bleibt nur auf dem Gerät.
   Erster Abgleich: Was die Cloud hat, gilt; fehlt dort etwas und ist lokal vorhanden, wird es hochgeladen. Danach gilt die Cloud (Änderung auf einem Gerät wirkt auf allen).
   ===================================================================== */
const SYNC_SET_KEYS = ['title', 'brand', 'model', 'plate', 'year', 'vin', 'price', 'battery', 'power', 'remDays', 'remKm', 'purchase', 'purchaseKm', 'purchasePrice', 'commuteKm', 'refLo', 'refHi', 'nextHu', 'nextService', 'certAcKwh', 'certDcKwh', 'certKm', 'wltpNet', 'ccEnd', 'wxoCut', 'dashFirst', 'car', 'carT', 'carN', 'carSec', 'wxIcons', 'nRep', 'nTrips', 'nBakYm', 'nBakAt', 'nBakSnz', 'gtMirror', 'gtList', 'iceDep', 'iceWe', 'icePark', 'iceMin', 'iceK', 'cmpCar', 'cmpL', 'cmpEur', 'cmpCo2'];
/** Einstellungen für die Cloud: feste Reihenfolge, ohne leere Werte (Firestore verbietet undefined). null = nichts vorhanden. */
function syncSet(src) {
  const o = {}; if (src && typeof src === 'object') SYNC_SET_KEYS.forEach(k => { const v = src[k]; if (v != null && v !== '' && !(typeof v === 'number' && !isFinite(v))) o[k] = v; });
  return Object.keys(o).length ? o : null;
}
function pushPrefs() {
  if (!window.cloud?.isSignedIn()) return;
  const w = Number(getSettings().wltp);
  window.cloud.setPrefs({ wltp: w > 0 ? w : null, wxLoc: wxLoc() || null, provInfo: load(KEY_PROVINFO, null), settings: syncSet(load(KEY_SETTINGS, {})), kb: load('enyaq.kb', null), lab: labNoFc(load(KEY_LAB, null)) }).catch(() => { });
}
window.onCloudPrefs = (d, first, uid) => {
  if (first) checkCacheUid(uid);
  const lw = Number(getSettings().wltp) > 0 ? Number(getSettings().wltp) : null, ll = wxLoc();
  let nw = d && Number(d.wltp) > 0 ? Number(d.wltp) : null, nl = d && d.wxLoc && Number.isFinite(d.wxLoc.lat) && Number.isFinite(d.wxLoc.lon) ? { lat: d.wxLoc.lat, lon: d.wxLoc.lon, label: String(d.wxLoc.label || '') } : null, up = false;
  if (first) { if (nw == null && lw != null) { nw = lw; up = true; } if (nl == null && ll) { nl = ll; up = true; } }
  if (nw !== lw) { const raw = load(KEY_SETTINGS, {}) || {}; if (nw == null) delete raw.wltp; else raw.wltp = nw; save(KEY_SETTINGS, raw); if (document.activeElement !== $('set-wltp')) $('set-wltp').value = nw != null ? String(nw).replace('.', ',') : ''; }
  if (JSON.stringify(nl) !== JSON.stringify(ll || null)) { if (nl) save(KEY_WXLOC, nl); else localStorage.removeItem(KEY_WXLOC); localStorage.removeItem(KEY_WXCACHE); renderWxLoc(); }
  /* Ladeanbieter-Angaben (Name Zuhause, Tarife, Preise): wie WLTP – beim ersten Abgleich lokal hochladen, wenn die Cloud noch nichts hat */
  const lp = load(KEY_PROVINFO, null); let np = d && d.provInfo && typeof d.provInfo === 'object' ? d.provInfo : null;
  if (first && np == null && lp) { np = lp; up = true; }
  if (JSON.stringify(np) !== JSON.stringify(lp)) { if (np) save(KEY_PROVINFO, np); else localStorage.removeItem(KEY_PROVINFO); if (currentView === 'providers') renderProvidersView(); }
  /* Einstellungen (Fahrzeugdaten, Strompreis, Akku, Kauf …): beim ersten Abgleich gilt die Cloud; hat sie noch nichts, werden die lokalen hochgeladen */
  const ls = syncSet(load(KEY_SETTINGS, {})); let ns = d ? syncSet(d.settings) : null;
  if (first && ns == null && ls) { ns = ls; up = true; }
  if (ns && JSON.stringify(ns) !== JSON.stringify(ls)) {
    const raw = load(KEY_SETTINGS, {}) || {}; SYNC_SET_KEYS.forEach(k => delete raw[k]); save(KEY_SETTINGS, { ...raw, ...ns });   // PIN, WLTP usw. bleiben
    applyTitle(); renderReminderBadges(); renderHeroStats(); try { fillWxoPrefs(); window.carReschedule && window.carReschedule(); } catch (e) { }
    try { renderReportBanner(); renderTripsBanner(); renderBakBanner(); } catch (e) { }   // Hinweise, die auf einem anderen Gerät erledigt wurden
    if (currentView === 'settings' && !$('view-settings').contains(document.activeElement)) fillSettings();   // nicht mitten in eine Eingabe schreiben
    if (currentView === 'dashboard') renderDashboard();
  }
  /* Wissen (Einträge, Kategorien): wie die Ladeanbieter-Angaben */
  const lk = load('enyaq.kb', null); let nk = d && d.kb && typeof d.kb === 'object' ? d.kb : null;
  if (first && nk == null && lk) { nk = lk; up = true; }
  if (JSON.stringify(nk) !== JSON.stringify(lk)) { if (nk) save('enyaq.kb', nk); else localStorage.removeItem('enyaq.kb'); try { renderKbStart(); if (currentView === 'kb') renderKb(); } catch (e) { } }
  /* Labor (Ladekurven, Rekorde, Tempomat-Messreihe): wie Wissen */
  /* Labor: zusammenführen (neuester Stand je Element), nie durch einen älteren oder fehlenden Cloud-Stand löschen */
  const lq = load(KEY_LAB, null), cq = d && d.lab && typeof d.lab === 'object' ? d.lab : null; let nq = labMerge(lq, cq);
  if (nq && labCanon(labNoFc(nq)) !== labCanon(labNoFc(cq))) up = true;                    // gemerkte Fahrten laufen über das eigene Routen-Dokument
  if (labCanon(nq) !== labCanon(lq)) { if (nq) save(KEY_LAB, nq); try { renderCurve(); if (currentView === 'recs') renderRecs(); if (currentView === 'tires') renderTires(); if (currentView === 'wish') renderWish(); if (currentView === 'route') rtTabs(); } catch (e) { } }
  try { if (currentView === 'route') rtCloudPlan(); } catch (e) { }
  if (up) window.cloud.setPrefs({ wltp: nw, wxLoc: nl, provInfo: np, settings: ns, kb: nk, lab: labNoFc(nq) }).catch(() => { });
};

/* =====================================================================
   Belege in Google Drive (nur bei Kosten): Fotos/PDFs werden in den Ordner „Enyaq Belege“ deines Google Drive hochgeladen; am Kosteneintrag liegt nur die Verknüpfung (files: [{ id, name, mime }]),
   die über die bestehende Kosten-Synchronisierung auf alle Geräte geht. Zugriff: nur drive.file (Dateien, die diese App selbst anlegt). Der Google-Dialog erscheint nach Tipps auf „Speichern“/„Hochladen“.
   ===================================================================== */
const DV_NAME = 'Enyaq Belege', DV_MAX = 15e6, KEY_DRIVE = 'enyaq.driveFolder', dvPend = new Map();      // dvPend: 'form' bzw. 'c<id>' → noch nicht hochgeladene Dateien
const dvLink = (id) => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
const DV_CLIP = '<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5"/></svg>';
function dvChips(c) { const f = c.files || []; return f.length ? '<div class="mt-2 flex flex-wrap gap-1.5">' + f.map(x => '<a href="' + dvLink(x.id) + '" target="_blank" rel="noopener" class="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs">' + DV_CLIP + '<span class="truncate">' + esc(x.name) + '</span></a>').join('') + '</div>' : ''; }
function dvBlockInner(scope, c) {
  const att = (c && c.files) || [], pend = dvPend.get(scope) || [], form = scope === 'form', btn = 'rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium active:scale-95 transition';
  const row = (inner, act) => '<li class="flex items-center justify-between gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs"><span class="min-w-0 truncate">' + inner + '</span>' + act + '</li>';
  const x = (a, extra) => '<button type="button" data-dv="' + a + '" ' + extra + ' aria-label="Entfernen" class="shrink-0 px-2 py-1 text-slate-500 dark:text-slate-400">✕</button>';
  return (att.length || pend.length ? '<ul class="mb-2 space-y-1">' + att.map(f => row('<a href="' + dvLink(f.id) + '" target="_blank" rel="noopener" class="underline">' + esc(f.name) + '</a>', x('rm-file', 'data-id="' + esc(f.id) + '"'))).join('')
      + pend.map((f, i) => row(esc(f.name) + ' · ' + fmt(f.size / 1048576, 1) + ' MB · ' + (form ? 'wird beim Speichern hochgeladen' : 'noch nicht hochgeladen'), x('rm-pend', 'data-i="' + i + '"'))).join('') + '</ul>' : '')
    + '<div class="flex gap-2"><button type="button" data-dv="pick" class="flex-1 ' + btn + '">Beleg hinzufügen</button>' + (!form && pend.length ? '<button type="button" data-dv="upload" class="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white active:scale-95 transition">Hochladen (' + pend.length + ')</button>' : '') + '</div>'
    + '<input type="file" data-dv-in accept="image/*,application/pdf" multiple class="hidden"><p data-dv-msg class="mt-1 text-xs text-slate-500 dark:text-slate-400"></p>';
}
function dvRefresh(blk, msg) { const sc = blk.dataset.dvBlock, c = sc === 'form' ? null : getCosts().find(x => String(x.id) === sc.slice(1)); blk.innerHTML = dvBlockInner(sc, c); if (msg) dvMsg(blk, msg); }
const dvRefreshForm = () => dvRefresh($('cost-belege'));
const dvMsg = (blk, t) => { const m = blk.querySelector('[data-dv-msg]'); if (m) m.textContent = t; };
function dvErrText(e) {
  const m = String((e && (e.code || e.message)) || e);
  if (/popup-blocked/.test(m)) return 'Das Google-Fenster wurde blockiert. Bitte Pop-ups für die App erlauben.';
  if (/popup-closed|cancelled-popup/.test(m)) return 'Die Anmeldung bei Google wurde abgebrochen.';
  if (/user-mismatch/.test(m)) return 'Bitte mit demselben Google-Konto anmelden wie in der App.';
  if (e && e.status === 403 && /has not been used|accessNotConfigured|disabled/i.test(m)) return 'Die Google-Drive-API ist im Cloud-Projekt noch nicht aktiviert (Google Cloud Console → APIs & Dienste → Drive API).';
  if (e && e.status === 401) return 'Die Google-Anmeldung ist abgelaufen. Bitte erneut versuchen.';
  return m;
}
async function dvFetch(tok, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + tok } });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message || ''; } catch (e) { } const err = new Error(m || 'Google Drive: HTTP ' + r.status); err.status = r.status; throw err; }
  return r;
}
async function dvFolder(tok) {                                                                // Ordner finden oder anlegen (gemerkt wird nur die ID; Umbenennen/Verschieben in Drive ist unkritisch)
  const known = load(KEY_DRIVE, null);
  if (known && known.id) { try { const j = await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(known.id) + '?fields=id,trashed')).json(); if (!j.trashed) return j.id; } catch (e) { if (e.status !== 404) throw e; } }
  const q = encodeURIComponent("appProperties has { key='enyaqBelege' and value='1' } and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const l = await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&pageSize=1')).json();
  let id = l.files && l.files[0] && l.files[0].id;
  if (!id) id = (await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DV_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { enyaqBelege: '1' } }) })).json()).id;
  save(KEY_DRIVE, { id }); renderDvInfo(); return id;
}
async function dvPrepare(file) {                                                              // Fotos verkleinern (max. 1.800 px, JPEG), PDFs unverändert
  const ext0 = ((file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'), plain = { blob: file, mime: file.type || 'application/octet-stream', ext: ext0 };
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return plain;
  const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return plain;
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.82)); return blob && blob.size < file.size ? { blob, mime: 'image/jpeg', ext: 'jpg' } : plain;
}
function dvName(c, i, ext) {                                                                  // z. B. 2026-10-13_Reifen_Winterreifen_149,90.jpg
  const d = new Date(c.date), ds = isNaN(d) ? '' : wxIso(d), parts = [ds, c.category, c.title && c.title !== c.category ? c.title : '', Math.abs(Number(c.amount) || 0).toFixed(2).replace('.', ',')].filter(Boolean);
  return parts.join('_').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 110) + (i > 0 ? '_' + (i + 1) : '') + '.' + ext;
}
/* =====================================================================
   Monatliche Sicherung in Google Drive: Datei „enyaq-sicherung-JJJJ-MM.json“ im Unterordner „Sicherungen“ des Belege-Ordners
   (gleiche Berechtigung drive.file). Je Monat eine Datei; eine erneute Sicherung im selben Monat überschreibt sie.
   Automatisch, sobald im neuen Monat ein Drive-Zugriff besteht (z. B. nach einem Beleg-Upload). Sonst erscheint auf Start ein Hinweis,
   denn das Google-Fenster darf nur nach einem Tipp öffnen. Status: enyaq.driveBackup = { ym, at, auto (true/false), snooze ('JJJJ-MM-TT') }.
   ===================================================================== */
const KEY_DVBAK = 'enyaq.driveBackup';
const bakState = () => { const l = { auto: true, ...(load(KEY_DVBAK, {}) || {}) }, st = getSettings();   // lokale Werte + geräteübergreifender Stand
  const ym = maxStr(l.ym, st.nBakYm), at = maxStr(l.at, st.nBakAt), sn = maxStr(l.snooze, st.nBakSnz); if (ym) l.ym = ym; if (at) l.at = at; if (sn) l.snooze = sn; return l; };
const bakYM = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const bakHasData = () => getReadings().length + getCosts().length + getReminders().length + getTrips().length > 0;
const bakDue = () => { const b = bakState(); return b.auto && window.cloud?.isSignedIn() && bakHasData() && b.ym !== bakYM(); };
async function bakSubFolder(tok) {
  const parent = await dvFolder(tok), q = encodeURIComponent("appProperties has { key='enyaqBackup' and value='1' } and mimeType='application/vnd.google-apps.folder' and trashed=false and '" + parent + "' in parents");
  const l = await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&pageSize=1')).json();
  if (l.files && l.files[0]) return l.files[0].id;
  return (await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sicherungen', mimeType: 'application/vnd.google-apps.folder', parents: [parent], appProperties: { enyaqBackup: '1' } }) })).json()).id;
}
async function bakUpload(tok) {
  const ym = bakYM(), folder = await bakSubFolder(tok), body = JSON.stringify(buildBackup(), null, 1), name = 'enyaq-sicherung-' + ym + '.json';
  const q = encodeURIComponent("appProperties has { key='enyaqBackupYM' and value='" + ym + "' } and trashed=false and '" + folder + "' in parents");
  const ex = await (await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&pageSize=1')).json(), id = ex.files && ex.files[0] && ex.files[0].id;
  if (id) await dvFetch(tok, 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  else {
    const bd = 'enyaq' + Date.now(), meta = { name, mimeType: 'application/json', parents: [folder], appProperties: { enyaqBackupYM: ym } };
    const mp = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + bd + '--';
    await dvFetch(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: mp });
  }
  const b = bakState(); b.ym = ym; b.at = new Date().toISOString(); delete b.snooze; save(KEY_DVBAK, b); nagSet({ nBakYm: b.ym, nBakAt: b.at });
  return { name, kb: Math.round(body.length / 1024) };
}
let bakBusy = false;
/** Sichern: silent = nur mit bereits vorhandenem Drive-Zugriff (kein Google-Fenster). */
async function runBackup(silent) {
  if (bakBusy || !window.cloud?.isSignedIn()) { if (!silent) $('bak-msg').textContent = 'Bitte zuerst bei Google anmelden.'; return false; }
  if (silent && !window.cloud.driveReady()) return false;
  bakBusy = true; if (!silent) { $('bak-msg').textContent = 'Verbinde mit Google Drive …'; $('bak-banner-sub').textContent = 'Wird gesichert …'; }
  try { const tok = await window.cloud.driveToken(), r = await bakUpload(tok); $('bak-msg').textContent = 'Gesichert: ' + r.name + ' (' + fmt(r.kb, 0) + ' KB) · ' + fmtDate(new Date().toISOString()); renderBakBanner(); return true; }
  catch (e) { if (e && e.status === 401) window.cloud.driveForget(); const t = 'Sicherung fehlgeschlagen: ' + dvErrText(e); $('bak-msg').textContent = t; if (!silent) $('bak-banner-sub').textContent = t; return false; }
  finally { bakBusy = false; }
}
function renderBakBanner() {
  const b = bakState(), show = bakDue() && b.snooze !== todayYMD() && !$('view-dashboard').classList.contains('hidden') && !liveHero;
  $('bak-banner').classList.toggle('hidden', !show);
  if (show) $('bak-banner-sub').textContent = b.at ? 'Letzte Sicherung: ' + fmtDate(b.at) + ' · Antippen zum Sichern' : 'Antippen: alle Daten in Google Drive sichern';
}
function renderBakInfo() { const b = bakState(); $('bak-auto').checked = b.auto !== false; if (!bakBusy) $('bak-msg').textContent = b.at ? 'Letzte Sicherung: ' + fmtDate(b.at) + ' (' + b.ym + ')' : 'Noch keine Sicherung in Google Drive.'; }
$('bak-auto').addEventListener('change', (e) => { const b = bakState(); b.auto = e.target.checked; save(KEY_DVBAK, b); renderBakBanner(); });
$('bak-now').addEventListener('click', () => runBackup(false));
$('bak-banner-go').addEventListener('click', () => runBackup(false));
$('bak-banner-x').addEventListener('click', () => { const b = bakState(); b.snooze = todayYMD(); save(KEY_DVBAK, b); nagSet({ nBakSnz: b.snooze }); renderBakBanner(); });
/* Prüfen: kurz nach dem Start, beim Wechsel auf Start und regelmäßig (Drive-Zugriff kann zwischendurch durch einen Beleg-Upload entstehen) */
function bakCheck() { if (bakDue()) runBackup(true); renderBakBanner(); }
setTimeout(bakCheck, 4000); setInterval(bakCheck, 5 * 60 * 1000);
async function dvUploadFor(cost, files, tokP, onProgress) {
  const tok = await (tokP || window.cloud.driveToken()), folder = await dvFolder(tok), out = [], have = (cost.files || []).length;
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    const pr = await dvPrepare(files[i]); if (pr.blob.size > DV_MAX) throw new Error('„' + files[i].name + '“ ist größer als 15 MB.');
    const body = new FormData(); body.append('metadata', new Blob([JSON.stringify({ name: dvName(cost, have + i, pr.ext), parents: [folder], mimeType: pr.mime, appProperties: { costId: String(cost.id) } })], { type: 'application/json' })); body.append('file', pr.blob);
    const j = await (await dvFetch(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', { method: 'POST', body })).json();
    out.push({ id: j.id, name: j.name, mime: j.mimeType || pr.mime });
  }
  return out;
}
function dvSetFiles(costId, fn) { return commitCosts(getCosts().map(c => { if (String(c.id) !== String(costId)) return c; const f = fn(c.files || []), o = { ...c }; if (f.length) o.files = f; else delete o.files; return o; })); }
async function dvAfterSave(entry, files, tokP, msg, text) {
  flash(msg, text + ' · Belege werden zu Google Drive hochgeladen …', true);
  try { const up = await dvUploadFor(entry, files, tokP); await dvSetFiles(entry.id, f => f.concat(up)); flash(msg, text + ' · ' + up.length + (up.length === 1 ? ' Beleg' : ' Belege') + ' in Google Drive ✓', true); }
  catch (e) { if (e && e.status === 401) window.cloud.driveForget(); flash(msg, text + ' · Beleg-Upload fehlgeschlagen: ' + dvErrText(e) + ' (im Verlauf unter „Bearbeiten“ erneut hinzufügen)', false); }
}
function dvCostFromLi(li, c) {                                                                // aktuelle (noch ungespeicherte) Eingaben für den Dateinamen nutzen
  const v = (f) => li && li.querySelector('[data-cf="' + f + '"]'), d = new Date(v('date')?.value), amt = parseNum(v('amount')?.value ?? '');
  return { ...c, title: v('title')?.value.trim() || c.title, category: v('cat') ? v('cat').value : c.category, date: isNaN(d) ? c.date : d.toISOString(), amount: isFinite(amt) && amt !== 0 ? amt : c.amount };
}
async function dvUploadEdit(blk, scope) {
  const cur = getCosts().find(c => String(c.id) === scope.slice(1)), files = dvPend.get(scope) || []; if (!cur || !files.length) return;
  if (!window.cloud?.isSignedIn()) { dvMsg(blk, 'Bitte zuerst bei Google anmelden (Einstellungen).'); return; }
  const tokP = window.cloud.driveToken(); tokP.catch(() => { }); dvMsg(blk, 'Verbinde mit Google Drive …');
  try { const up = await dvUploadFor(dvCostFromLi(blk.closest('li'), cur), files, tokP, (i, n) => dvMsg(blk, 'Lade hoch ' + i + ' von ' + n + ' …')); dvPend.delete(scope); await dvSetFiles(cur.id, f => f.concat(up)); dvRefresh(blk, up.length + (up.length === 1 ? ' Beleg' : ' Belege') + ' in Google Drive gespeichert.'); }
  catch (e) { if (e && e.status === 401) window.cloud.driveForget(); dvMsg(blk, 'Upload fehlgeschlagen: ' + dvErrText(e)); }
}
async function dvRemove(blk, scope, fid) {
  const cur = getCosts().find(c => String(c.id) === scope.slice(1)), f = cur && (cur.files || []).find(x => x.id === fid); if (!f) return;
  if (!confirm('Beleg „' + f.name + '“ aus dem Eintrag entfernen und in Google Drive löschen?')) return;
  if (!window.cloud?.isSignedIn()) { dvMsg(blk, 'Bitte zuerst bei Google anmelden.'); return; }
  const tokP = window.cloud.driveToken(); tokP.catch(() => { }); dvMsg(blk, 'Verbinde mit Google Drive …');
  try { const tok = await tokP; try { await dvFetch(tok, 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fid), { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }   // 404 = in Drive schon weg
    await dvSetFiles(cur.id, l => l.filter(x => x.id !== fid)); dvRefresh(blk, 'Beleg entfernt.'); }
  catch (e) { if (e && e.status === 401) window.cloud.driveForget(); dvMsg(blk, 'Entfernen fehlgeschlagen: ' + dvErrText(e)); }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dv]'), blk = b && b.closest('[data-dv-block]'); if (!blk) return; const scope = blk.dataset.dvBlock, act = b.dataset.dv;
  if (act === 'pick') blk.querySelector('[data-dv-in]').click();
  else if (act === 'rm-pend') { const l = dvPend.get(scope) || []; l.splice(Number(b.dataset.i), 1); dvPend.set(scope, l); dvRefresh(blk); }
  else if (act === 'rm-file') dvRemove(blk, scope, b.dataset.id);
  else if (act === 'upload') dvUploadEdit(blk, scope);
});
document.addEventListener('change', (e) => {
  const inp = e.target.closest('[data-dv-in]'), blk = inp && inp.closest('[data-dv-block]'); if (!blk) return; const scope = blk.dataset.dvBlock, l = dvPend.get(scope) || []; let big = '';
  Array.from(inp.files).forEach(f => { if (f.size > DV_MAX) big = '„' + f.name + '“ ist größer als 15 MB und wurde ausgelassen.'; else l.push(f); });
  dvPend.set(scope, l); dvRefresh(blk, big);
});
function renderDvInfo() {
  const f = load(KEY_DRIVE, null), a = $('dv-open');
  $('dv-info').textContent = f && f.id ? 'Die Belege liegen im Ordner „' + DV_NAME + '“ in deinem Google Drive. Du kannst den Ordner dort umbenennen oder verschieben.' : 'Beim ersten Beleg-Upload legt die App den Ordner „' + DV_NAME + '“ in deinem Google Drive an. Sie sieht dabei nur Dateien, die sie selbst angelegt hat.';
  a.classList.toggle('hidden', !(f && f.id)); if (f && f.id) a.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(f.id);
}
dvRefreshForm(); renderDvInfo();

