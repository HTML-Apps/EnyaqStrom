/* =====================================================================
   Navigation
   ===================================================================== */
let currentView = 'dashboard', histHeadVisible = true;
function isDesk() { try { return matchMedia('(min-width: 1280px)').matches; } catch (e) { return false; } }
function showView(name) {
  if (name === 'reminders' && isDesk()) { renderReminders(); return; }      // PC: Erinnerungen stehen fest rechts
  currentView = name; if (name === 'history') histHeadVisible = true;     // frisch geöffnet: Kopfzeile steht oben im Bild
  document.querySelectorAll('.view').forEach(v => { if (v.id === 'view-reminders' && v.parentElement && v.parentElement.id === 'desk-rem') return; v.classList.toggle('hidden', v.id !== 'view-' + name); });
  if (isDesk()) try { deskNavMark(name); } catch (e) { }
  document.querySelectorAll('.nav-btn').forEach(b => {
    const active = b.dataset.view === name;
    b.classList.toggle('tab-active', active);
    b.classList.toggle('text-slate-500', !active);
  });
  if (name === 'capture') { if (ENABLE_AI_SCAN) startCamera(); updateCaptureDefaults(); } else stopCamera();
  if (name === 'dashboard') { renderDashboard(); try { renderBakBanner(); renderFrost(); renderWxo(); } catch (e) { } }
  if (name === 'report') renderReport(); else reportYM = null;           // beim Verlassen zurück auf den Standardmonat
  if (name === 'settings') { fillSettings(); try { renderBakInfo(); setSettingsSec(setSec); const nd = window.setNoDrawer; window.setNoDrawer = false; if (!nd) setTimeout(openSetDrawer, 60); } catch (e) { } } else { try { closeSetDrawer(); } catch (e) { } }
  if (name === 'costs') renderCostsView();
  if (name === 'reminders') renderReminders();
  if (name === 'providers') renderProvidersView();
  if (name === 'kb') renderKb();
  if (name === 'badges') { try { renderBadges(); } catch (e) { } }
  if (name === 'recs') { try { renderRecs(); } catch (e) { console.error(e); } }
  if (name === 'wish') { try { renderWish(); } catch (e) { console.error(e); } }
  if (name === 'route') { try { rtShow(); } catch (e) { console.error(e); } }
  if (name === 'tires') { tireSet = 'aw'; tireSel = null; try { renderTires(); } catch (e) { console.error(e); } }   // beim Öffnen immer Allwetter
  if (name !== 'history' && editMode) setEditMode(false);
  if (name === 'history') renderHistory();
  updateHistFab();
  fitSeg();
  renderReminderBadges();
  try { renderWrapCard(); } catch (e) { /* Rückblick-Modul noch nicht initialisiert */ }
  window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0;   // neue Ansicht immer oben beginnen (nach dem Rendern, sonst klemmt der Browser die Position)
}
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('btn-profile').addEventListener('click', () => showView('settings'));          // Profil/Einstellungen: Icon neben dem Titel der Startseite
$('btn-bell').addEventListener('click', () => showView('reminders'));            // Erinnerungen

/* =====================================================================
   Kamera (MediaDevices API)
   ===================================================================== */
let stream = null;
let photoDataUrl = null;
const video = $('video'), snap = $('snapshot'), camMsg = $('cam-msg');

function camNotice(text) { camMsg.textContent = text; camMsg.classList.toggle('hidden', !text); }

async function startCamera() {
  if (stream || photoDataUrl) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    camNotice('Kamerazugriff nicht verfügbar. Der Browser erlaubt ihn nur über https:// oder localhost – nutze alternativ „Bild aus Kamera-App wählen“.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream; camNotice('');
  } catch (err) {
    console.error(err);
    const denied = err.name === 'NotAllowedError';
    camNotice(denied ? 'Kamerazugriff verweigert. Bitte im Browser freigeben oder „Bild aus Kamera-App wählen“ nutzen.'
                     : 'Kamera konnte nicht gestartet werden (' + err.name + ').');
  }
}
function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

/** Zeichnet ein Bild-Quellobjekt skaliert (max. 1280 px) ins Canvas und speichert es als Base64-JPEG. */
function setPhoto(source, w, h) {
  const scale = Math.min(1, 1280 / Math.max(w, h));
  snap.width = Math.round(w * scale); snap.height = Math.round(h * scale);
  snap.getContext('2d').drawImage(source, 0, 0, snap.width, snap.height);
  photoDataUrl = snap.toDataURL('image/jpeg', 0.85);
  snap.classList.remove('hidden'); video.classList.add('hidden');
  $('btn-ocr').disabled = false; $('ocr-error').classList.add('hidden');
}

$('btn-shot').addEventListener('click', () => {
  if (!stream || !video.videoWidth) { camNotice('Keine Kamera aktiv.'); return; }
  setPhoto(video, video.videoWidth, video.videoHeight);
});
$('btn-retake').addEventListener('click', () => {
  photoDataUrl = null; snap.classList.add('hidden'); video.classList.remove('hidden');
  $('btn-ocr').disabled = true; startCamera();
});
$('file-input').addEventListener('change', (e) => {      // Fallback, z. B. bei file:// ohne Kamerazugriff
  const file = e.target.files[0]; if (!file) return;
  const img = new Image();
  img.onload = () => { setPhoto(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(img.src); camNotice(''); };
  img.onerror = () => showOcrError('Bild konnte nicht geladen werden.');
  img.src = URL.createObjectURL(file);
});

/* =====================================================================
   KI-Auslesen (OpenAI gpt-4o Vision)
   ===================================================================== */
function showOcrError(msg) { const el = $('ocr-error'); el.textContent = msg; el.classList.remove('hidden'); }

$('btn-ocr').addEventListener('click', async () => {
  if (!photoDataUrl) return;
  if (!window.cloud?.isSignedIn?.()) { showOcrError('Bitte zuerst unter Einstellungen mit Google anmelden.'); return; }

  $('ocr-error').classList.add('hidden');
  $('btn-ocr').disabled = true; $('ocr-spinner').classList.remove('hidden'); $('ocr-label').textContent = 'Lese Zählerstand …';
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ image: photoDataUrl })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error('Konto nicht berechtigt.');
    if (!res.ok) throw new Error(data.error?.message || data.error || ('HTTP ' + res.status));
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.replace(',', '.').match(/\d+(\.\d+)?/);
    if (!match) throw new Error('Keine Zahl erkannt (Antwort: „' + text.slice(0, 40) + '“). Bitte neues Foto aufnehmen oder manuell eingeben.');
    $('reading-input').value = parseFloat(match[0]).toFixed(1);   // eine Nachkommastelle
    paintReading();
  } catch (err) {
    console.error(err);
    showOcrError('KI-Auslesen fehlgeschlagen: ' + err.message);
  } finally {
    $('ocr-spinner').classList.add('hidden'); $('ocr-label').textContent = 'Zählerstand per KI auslesen'; $('btn-ocr').disabled = false;
  }
});

/* =====================================================================
   Speichern eines Zählerstands
   ===================================================================== */
function flash(el, text, ok) {
  el.textContent = text; el.className = 'text-sm ' + (ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

$('btn-save').addEventListener('click', () => {
  const readings = getReadings(), place = capPlace, home = place === 'home';
  const km = optNum($('km-input').value), s0 = optNum($('soc0-input').value), s1 = optNum($('soc1-input').value);
  if ([km, s0, s1].some(Number.isNaN) || (km != null && km < 0) || [s0, s1].some(v => v != null && (v < 0 || v > 100)) || (s0 != null && s1 != null && s1 <= s0)) {
    flash($('save-msg'), 'Bitte km-Stand und Akku-Prozente prüfen (0–100 %, Ende größer als Start).', false); return;
  }

  let entry, msg;
  if (home) {
    const value = Math.round(parseNum($('reading-input').value) * 10) / 10;
    if (!isFinite(value) || value < 0) { flash($('save-msg'), 'Bitte einen gültigen Zählerstand eingeben.', false); return; }
    const prev = lastHome(readings);                      // Vorgänger am Zähler (Bosch/Unterwegs-Einträge zählen nicht)
    let reset = false;                                    // Zähler zurückgesetzt? Dann zählt die Ladung ab 0
    if (prev && value < prev.totalReading) {
      if (!confirm('Der Wert (' + fmt(value) + ') ist kleiner als der letzte Stand (' + fmt(prev.totalReading) + ').\n\nWurde der Zähler zurückgesetzt (Start bei 0)?\nOK = ja, die Ladung wird ab 0 gerechnet.\nAbbrechen = Eingabe prüfen.')) return;
      reset = true;
    }
    const consumed = reset ? value : (prev ? Math.max(0, Math.round((value - prev.totalReading) * 10) / 10) : 0);   // Differenz zum Vorgänger
    const cost = consumed * getSettings().price;
    entry = { id: Date.now(), date: new Date().toISOString(), totalReading: value, consumedSinceLast: consumed, cost };
    if (reset) entry.meterReset = true;
    msg = 'Gespeichert: ' + fmt(consumed) + ' kWh, ' + eur(cost);
  } else {
    if (s0 == null || s1 == null) { flash($('save-msg'), 'Bitte Akku-Start und Akku-Ende angeben – sie verbinden diese Ladung mit der Verbrauchsrechnung.', false); return; }
    const kwh = optNum($('kwh-input').value), price = optNum($('price-input').value), fee = optNum($('fee-input').value);
    if ([kwh, price, fee].some(Number.isNaN) || [kwh, price, fee].some(v => v != null && v < 0)) { flash($('save-msg'), 'Bitte kWh, Preis und Gebühren prüfen (nicht negativ).', false); return; }
    const prevH = lastHome(readings), cost = (kwh != null && price != null ? kwh * price : 0) + (fee ?? 0);      // Gebühren kommen additiv auf die Kosten
    entry = { id: Date.now(), date: new Date().toISOString(), place, totalReading: prevH ? prevH.totalReading : 0, consumedSinceLast: kwh ?? 0, cost };
    if (price != null) entry.pricePerKwh = price;
    if (fee != null) entry.fee = fee;                                    // Servicegebühr (Bosch/Unterwegs), bereits in cost enthalten
    if (place === 'away' && $('prov-input').value) entry.provider = $('prov-input').value;      // optional: Ladeanbieter (Auswertungen fassen weiter als "Unterwegs" zusammen)
    msg = 'Gespeichert (' + (entry.provider || PLACES[place]) + '): ' + (kwh != null ? fmt(kwh) + ' kWh' : s0 + ' → ' + s1 + ' %') + (cost > 0 ? ', ' + eur(cost) : '');
  }
  if (km != null) entry.odometerKm = km;                // optionale Felder nur setzen, wenn vorhanden (Firestore verbietet undefined)
  if (s0 != null) entry.socStart = s0;
  entry.capacityKwh = batteryKwh();                      // Kapazität zum Zeitpunkt der Ladung festhalten
  if (s1 != null) entry.socEnd = s1;
  { const bt = optNum($('bt-input').value); if (bt != null && !Number.isNaN(bt)) entry.battTemp = bt; }   // Akku-Temperatur beim Anstecken (optional)
  const live = home ? getLive() : null;                  // abgeschlossene Live-Ladung (nur Zuhause): echte Start-/Endzeit und Leistung festhalten
  if (live && live.kwhTarget != null && liveKwh(live) >= live.kwhTarget) {
    const end = Math.min(Date.now(), liveFinishAt(live));
    if (end > live.startedAt) { entry.chargeStart = new Date(live.startedAt).toISOString(); entry.chargeEnd = new Date(end).toISOString(); }
    const kws = (live.powerSamples || []).map(s => s[1]).filter(v => v > 0.5);
    if (kws.length) entry.avgPowerKw = Math.round(kws.reduce((a, b) => a + b, 0) / kws.length * 10) / 10;
  }
  readings.push(entry);
  const status = commitReadings(readings);
  if (!status) return;
  if (home) stopLive(false);                             // echter Wert erfasst -> Simulation beenden

  flash($('save-msg'), msg + (window.cloud?.isSignedIn() ? ' · Cloud: wird übertragen …' : ' · nur lokal (nicht bei Google angemeldet)'), true);
  setTimeout(() => checkBadges(false), 600);                              // neues Abzeichen? (Pop-up mit Konfetti)
  status.then(s => {                                     // Ergebnis der Cloud-Übertragung sichtbar machen
    if (s === 'cloud') flash($('save-msg'), msg + ' · Cloud ✓', true);
    else if (s.startsWith('error:')) flash($('save-msg'), msg + ' · Cloud-Fehler: ' + s.slice(6), false);
  });
  $('save-msg').classList.remove('hidden');
  ['reading-input', 'km-input', 'soc0-input', 'soc1-input', 'bt-input', 'kwh-input', 'price-input', 'prov-input', 'fee-input'].forEach(id => { $(id).value = ''; delete $(id).dataset.live; delete $(id).dataset.manual; delete $(id).dataset.auto; });
  closeKmEdit(); setCapPlace('home');                    // nächste Erfassung startet wieder bei Zuhause
});

/** Ladeort in der Erfassen-Maske wählen: Zuhause = Zählerstand, Bosch/Unterwegs = optional kWh und Preis (kein Zähler). */
function setCapPlace(p) {
  capPlace = PLACES[p] ? p : 'home';
  const home = capPlace === 'home';
  segPaint('.cap-place-btn', capPlace);
  $('cap-meter-card').classList.toggle('hidden', !home);
  $('cap-away-card').classList.toggle('hidden', home);
  const away = capPlace === 'away';                      // Anbieter-Auswahl nur bei "Unterwegs"
  $('prov-wrap').classList.toggle('hidden', !away); $('fee-wrap').classList.toggle('hidden', home);   // Anbieter nur bei Unterwegs, Gebühren bei Bosch und Unterwegs
  $('cap-away-grid').style.gridTemplateColumns = away ? '0.85fr 0.95fr 0.85fr 1.35fr' : 'repeat(3,minmax(0,1fr))';   // Unterwegs: vier Spalten, Anbieter am breitesten
  if (away) {
    const sel = $('prov-input'), keep = sel.value;
    sel.innerHTML = providerOptions('');                 // aktuelle Liste aus den Einstellungen
    if (keep && getProviders().includes(keep)) sel.value = keep;
    else if (!keep || sel.dataset.auto) {                // zuletzt benutzten Anbieter vorschlagen
      const last = getReadings().reverse().find(r => placeOf(r) === 'away' && r.provider && getProviders().includes(r.provider));
      sel.value = last ? last.provider : ''; if (last) sel.dataset.auto = '1'; else delete sel.dataset.auto;
    }
  }
  $('cap-title').textContent = home ? 'Zählerstand' : 'Ladung: ' + PLACES[capPlace];
  if (!home) {
    ['soc0-input', 'soc1-input', 'km-input'].forEach(id => { if ($(id).dataset.live) { $(id).value = ''; delete $(id).dataset.live; } });   // Live-Vorbelegung gilt nur für Zuhause
    suggestCapPrice();
  }
  updateCaptureDefaults();
}
/** Preis vorbelegen (nur wenn das Feld leer ist oder selbst vorbelegt wurde):
    Unterwegs mit Anbieter: eigener Preis aus „Ladeanbieter“ (DC vor AC) → letzte Ladung bei diesem Anbieter → Ø aus der Historie.
    Bosch: Preis der Bosch-Karte (AC vor DC) → letzte Ladung bei Bosch. Ohne Anbieter: letzte Ladung an diesem Ort. */
function suggestCapPrice() {
  const pi = $('price-input'); if (capPlace === 'home' || !(pi.value === '' || pi.dataset.auto)) return;
  const rs = getReadings().reverse(), prov = capPlace === 'away' ? $('prov-input').value : '';
  let v = null, src = '';
  if (capPlace === 'bosch') { const p = pvPrices('bosch'); v = p.ac ?? p.dc; if (v != null) src = 'Preis von ' + (pvBoschName() || 'Bosch') + ' (Ladeanbieter)'; }
  else if (prov) {
    const p = pvPrices(prov); v = p.dc ?? p.ac; if (v != null) src = 'Preis von ' + prov + ' (Ladeanbieter)';
    if (v == null) { const l = rs.find(r => placeOf(r) === 'away' && r.provider === prov && r.pricePerKwh != null); if (l) { v = l.pricePerKwh; src = 'letzte Ladung bei ' + prov; } }
    if (v == null && p.hist) { v = p.hist; src = 'Ø bei ' + prov; }
  }
  if (v == null) { const l = rs.find(r => placeOf(r) === capPlace && r.pricePerKwh != null); if (l) { v = l.pricePerKwh; src = 'letzte Ladung ' + (capPlace === 'bosch' ? 'bei Bosch' : 'unterwegs'); } }
  pi.value = v != null ? String(v).replace('.', ',') : ''; pi.title = src ? 'Vorbelegt: ' + src : '';
  if (v != null) pi.dataset.auto = '1'; else delete pi.dataset.auto;
}
document.querySelectorAll('.cap-place-btn').forEach(b => b.addEventListener('click', () => setCapPlace(b.dataset.place)));
$('price-input').addEventListener('input', (e) => { delete e.target.dataset.auto; });
$('prov-input').addEventListener('change', (e) => { delete e.target.dataset.auto; suggestCapPrice(); });   // anderer Anbieter: dessen Preis vorschlagen

/* =====================================================================
   Einstellungen
   ===================================================================== */
function fillSettings() {
  try { renderVcStatus(); } catch (e) { }
  try { fillWxoPrefs(); } catch (e) { }
  renderProviders(); renderCategories(); renderTPlaceList(); renderTLabelSettings(); renderTripsLast();
  const s = getSettings();
  $('set-cmp-car').value = s.cmpCar || ''; $('set-cmp-l').value = s.cmpL ? String(s.cmpL).replace('.', ',') : ''; $('set-cmp-eur').value = s.cmpEur ? String(s.cmpEur).replace('.', ',') : ''; $('set-cmp-co2').value = s.cmpCo2 ? String(s.cmpCo2) : '';
  $('set-price').value = String(s.price).replace('.', ',');
  $('set-battery').value = String(batteryKwh()).replace('.', ',');
  $('set-ui').value = s.ui === 'simple' ? 'simple' : ''; $('set-car').value = carProf(s).key; const ct = s.carT || {}; Object.keys(CAR_TECH).forEach(k => { $('set-ct-' + k).value = ct[k] > 0 ? String(ct[k]).replace('.', ',') : ''; }); carFormHints();
  $('set-title').value = s.title || DEFAULT_TITLE;
  $('set-brand').value = s.brand || ''; $('set-model').value = s.model || ''; $('set-plate').value = s.plate || ''; $('set-year').value = s.year || ''; $('set-vin').value = s.vin || '';
  $('set-power').value = String(chargePowerKw()).replace('.', ',');
  $('set-cert-ac').value = s.certAcKwh != null ? fmt(s.certAcKwh, 0) : ''; $('set-cert-dc').value = s.certDcKwh != null ? fmt(s.certDcKwh, 0) : ''; $('set-cert-km').value = s.certKm != null ? fmt(s.certKm, 0) : ''; certRatioHint();
  $('set-ref-lo').value = s.refLo != null ? String(s.refLo).replace('.', ',') : ''; $('set-ref-hi').value = s.refHi != null ? String(s.refHi).replace('.', ',') : '';
  renderDvInfo(); $('set-purchase').value = purchaseDay(); $('set-purchase-km').value = s.purchaseKm != null ? fmt(s.purchaseKm, 0) : ''; $('set-purchase-price').value = s.purchasePrice != null ? fmt(s.purchasePrice, 2) : ''; $('set-wltp').value = s.wltp ? String(s.wltp).replace('.', ',') : ''; $('set-wltp-net').value = s.wltpNet ? String(s.wltpNet).replace('.', ',') : ''; renderWxLoc();
  $('set-rem-days').value = String(remWarn().days); $('set-rem-km').value = String(remWarn().km); $('set-next-hu').value = s.nextHu || ''; $('set-next-svc').value = s.nextService || '';
}
/** Ladeanbieter: speichern sofort (lokal und, wenn angemeldet, in der Cloud). Ältere Einträge behalten ihren Anbieter-Namen. */
function renderProviders() {
  const l = getProviders();
  $('prov-list').innerHTML = l.length ? l.map((n, i) => `<span class="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm max-w-full"><span class="truncate">${esc(n)}</span><button type="button" data-del="${i}" aria-label="${esc(n)} entfernen" class="w-6 h-6 shrink-0 rounded-lg text-slate-500 hover:text-red-600 active:scale-95">×</button></span>`).join('')
                              : '<span class="text-xs text-slate-500 dark:text-slate-400">Noch keine Anbieter angelegt.</span>';
}
function setProviders(list) {
  save(KEY_PROVIDERS, list); renderProviders();
  if (capPlace === 'away') setCapPlace('away');           // Auswahl in der Erfassen-Maske aktualisieren
  const msg = $('prov-msg');
  if (!window.cloud?.isSignedIn()) { msg.textContent = 'Gespeichert (nur lokal, nicht angemeldet).'; return; }
  msg.textContent = 'Gespeichert · Cloud: wird übertragen …';
  window.cloud.setProviders(list).then(() => { msg.textContent = 'Gespeichert · Cloud ✓'; })
    .catch(e => { msg.textContent = 'Lokal gespeichert, Cloud-Fehler: ' + (e.code || e.message) + (e.code === 'permission-denied' ? ' (Firestore-Regel für enyaqStrom/<uid>/settings ergänzen)' : ''); });
}
function addProvider() {
  const inp = $('prov-new'), name = inp.value.trim().replace(/\s+/g, ' ').slice(0, 30), l = getProviders();
  if (!name) return;
  if (l.some(n => n.toLowerCase() === name.toLowerCase())) { $('prov-msg').textContent = '„' + name + '“ gibt es schon.'; return; }
  if (l.length >= 20) { $('prov-msg').textContent = 'Maximal 20 Anbieter.'; return; }
  inp.value = ''; setProviders(l.concat(name));
}
$('btn-prov-add').addEventListener('click', addProvider);
$('prov-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProvider(); } });
$('prov-list').addEventListener('click', e => {
  const i = e.target.dataset.del; if (i === undefined) return;
  const l = getProviders(); l.splice(+i, 1); setProviders(l);
});
/** Cloud-Abgleich der Liste: beim ersten Abgleich werden lokale und Cloud-Anbieter zusammengeführt, danach gilt die Cloud (Löschen wirkt auf allen Geräten). */
window.onCloudProviders = (list, first, uid) => {
  if (first) checkCacheUid(uid);
  const local = getProviders();
  let next = Array.isArray(list) ? list.filter(n => typeof n === 'string' && n.trim()) : [];
  if (first && (uploadCutoff(uid) === 0 || !Array.isArray(list))) { const merged = next.concat(local.filter(n => !next.some(m => m.toLowerCase() === n.toLowerCase()))); if (merged.length !== next.length || !Array.isArray(list)) { next = merged; if (next.length) window.cloud.setProviders(next).catch(() => {}); } }
  if (JSON.stringify(next) !== JSON.stringify(local)) { save(KEY_PROVIDERS, next); renderProviders(); if (capPlace === 'away') setCapPlace('away'); }
};
$('set-year').addEventListener('input', (e) => {
  const el = e.target, del = e.inputType && e.inputType.startsWith('delete'), raw = /^[1-9]\//.test(el.value) ? '0' + el.value : el.value;   // „1/“ → „01/“
  let d = raw.replace(/\D/g, '').slice(0, 6);
  if (d.length === 1 && +d > 1) d = '0' + d;                                          // „5“ → „05“
  el.value = d.length > 2 || (d.length === 2 && !del) ? d.slice(0, 2) + '/' + d.slice(2) : d;
});
$('btn-save-settings').addEventListener('click', () => {
  const price = parseNum($('set-price').value);
  if (!isFinite(price) || price < 0) { alert('Bitte einen gültigen Strompreis eingeben (z. B. 0,307).'); return; }
  const carT = {}; for (const k of Object.keys(CAR_TECH)) {                       // technische Werte: leer = Wert des Fahrzeugtyps
    const raw = $('set-ct-' + k).value.trim(); if (!raw) continue; const v = parseNum(['cw', 'A'].includes(k) ? raw : raw.replace(/[.\s]/g, '')), [lo, hi] = CAR_TECH[k];
    if (!(v >= lo && v <= hi)) { alert('Bitte einen Wert zwischen ' + fmt(lo, lo < 1 ? 2 : 0) + ' und ' + fmt(hi, hi < 1 ? 2 : 0) + ' eintragen oder das Feld leer lassen.'); $('set-ct-' + k).focus(); return; }
    carT[k] = v;
  }
  const battery = parseNum($('set-battery').value);
  if (!isFinite(battery) || battery < 10 || battery > 200) { alert('Bitte eine gültige Nettokapazität in kWh eingeben (z. B. 52).'); return; }
  const power = parseNum($('set-power').value);
  if (!isFinite(power) || power < 0.5 || power > 50) { alert('Bitte eine gültige Ladeleistung in kW eingeben (z. B. 7).'); return; }
  const remDays = $('set-rem-days').value.trim() === '' ? 14 : parseNum($('set-rem-days').value), remKm = $('set-rem-km').value.trim() === '' ? 500 : parseNum($('set-rem-km').value);
  const ym = (id) => { const v = $(id).value.trim(); return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined; }, nextHu = ym('set-next-hu'), nextService = ym('set-next-svc');
  if (!Number.isInteger(remDays) || remDays < 0 || remDays > 365) { alert('Bitte die Vorwarnung in Tagen als ganze Zahl von 0 bis 365 eingeben.'); return; }
  if (!Number.isInteger(remKm) || remKm < 0 || remKm > 20000) { alert('Bitte die Vorwarnung in km als ganze Zahl von 0 bis 20000 eingeben.'); return; }
  const pd = $('set-purchase').value, purchase = /^\d{4}-\d{2}-\d{2}$/.test(pd) && !isNaN(Date.parse(pd)) ? pd : '2026-06-08';
  const wl = $('set-wltp').value.trim() === '' ? undefined : parseFloat($('set-wltp').value.replace(',', '.'));
  const wln = $('set-wltp-net').value.trim() === '' ? undefined : parseFloat($('set-wltp-net').value.replace(',', '.'));
  const tnum = (id) => { const t = $(id).value.trim().replace('−', '-').replace(',', '.'); return t === '' ? undefined : Number(t); };
  const rlo = tnum('set-ref-lo'), rhi = tnum('set-ref-hi');
  if ([rlo, rhi].some(v => v !== undefined && !(Number.isFinite(v) && v >= -20 && v <= 45)) || (rlo !== undefined) !== (rhi !== undefined) || (rlo !== undefined && rhi - rlo < 2)) {
    alert('Bitte beim Referenzbereich der Akku-Temperatur beide Werte eintragen (−20 bis 45 °C, „bis“ mindestens 2 °C über „von“) oder beide Felder leer lassen.'); return; }
  const deNum = (v) => { const t = v.trim(); if (t === '') return undefined; return Number((/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '') : t).replace(',', '.')); };   // 16.969 = sechzehntausend…, 32.500,50 = Euro mit Cent
  const pk = deNum($('set-purchase-km').value), pp = deNum($('set-purchase-price').value);
  const certAcKwh = deNum($('set-cert-ac').value), certDcKwh = deNum($('set-cert-dc').value), certKm = deNum($('set-cert-km').value);
  if ([certAcKwh, certDcKwh].some(v => v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 1e6)) || (certAcKwh !== undefined) !== (certDcKwh !== undefined) || (certAcKwh !== undefined && certAcKwh + certDcKwh <= 0)) { alert('Bitte beim Akku-Zertifikat beide Werte (AC und DC in kWh) eintragen oder beide Felder leer lassen.'); return; }
  if (certKm !== undefined && !(certKm >= 0 && certKm <= 2e6)) { alert('Bitte den km-Stand des Akku-Zertifikats als Zahl eingeben oder das Feld leer lassen.'); return; }
  if (pk !== undefined && !(pk >= 0 && pk <= 2e6)) { alert('Bitte den Kilometerstand bei Kauf als Zahl eingeben (z. B. 16.969) oder das Feld leer lassen.'); return; }
  if (pp !== undefined && !(pp >= 0 && pp <= 1e7)) { alert('Bitte den Kaufpreis in Euro als Zahl eingeben (z. B. 32.500) oder das Feld leer lassen.'); return; }
  if (wl !== undefined && !(wl > 5 && wl < 40)) { alert('Bitte den WLTP-Verbrauch in kWh/100 km eingeben (z. B. 16,0) oder das Feld leer lassen.'); return; }
  if (wln !== undefined && !(wln > 5 && wln < 40)) { alert('Bitte den WLTP-Verbrauch ohne Ladeverluste in kWh/100 km eingeben (z. B. 14,7) oder das Feld leer lassen.'); return; }
  const vin = $('set-vin').value.trim().toUpperCase().replace(/\s+/g, ''), yr = $('set-year').value.trim();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { alert('Die Fahrgestellnummer (FIN) hat 17 Zeichen aus Ziffern und Buchstaben (ohne I, O und Q). Bitte prüfen oder das Feld leer lassen.'); return; }
  if (yr) {                                                                         // Baujahr immer als MM/JJJJ, nicht in der Zukunft
    const m = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(yr), now = new Date();
    if (!m) { alert('Bitte das Baujahr im Format MM/JJJJ eingeben (z. B. 11/2023) oder das Feld leer lassen.'); $('set-year').focus(); return; }
    if (+m[2] < 1990 || +m[2] * 12 + +m[1] > now.getFullYear() * 12 + now.getMonth() + 1) { alert('Das Baujahr ' + yr + ' kann nicht stimmen: Es muss zwischen 01/1990 und ' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear() + ' liegen.'); $('set-year').focus(); return; }
  }
  const txt = (id, n) => $(id).value.trim().replace(/\s+/g, ' ').slice(0, n) || undefined;
  if (save(KEY_SETTINGS, { title: $('set-title').value.trim() || DEFAULT_TITLE, car: $('set-car').value !== 'enyaq50' ? $('set-car').value : undefined, carT: Object.keys(carT).length ? carT : undefined, ui: $('set-ui').value || undefined, brand: txt('set-brand', 30), model: txt('set-model', 40), plate: (txt('set-plate', 15) || '').toUpperCase() || undefined, year: yr || undefined, vin: vin || undefined, price, battery, power, remDays, remKm, purchase, wltp: wl, wltpNet: wln !== undefined ? Math.round(wln * 100) / 100 : undefined, purchaseKm: pk !== undefined ? Math.round(pk) : undefined, purchasePrice: pp !== undefined ? Math.round(pp * 100) / 100 : undefined, commuteKm: getSettings().commuteKm || undefined, ccEnd: getSettings().ccEnd || undefined, gtMirror: getSettings().gtMirror || undefined, gtList: getSettings().gtList || undefined, rtLast: getSettings().rtLast || undefined, iceDep: getSettings().iceDep || undefined, iceWe: getSettings().iceWe || undefined, icePark: getSettings().icePark || undefined, iceMin: getSettings().iceMin || undefined, iceK: getSettings().iceK || undefined, nRep: getSettings().nRep || undefined, nTrips: getSettings().nTrips || undefined, nBakYm: getSettings().nBakYm || undefined, nBakAt: getSettings().nBakAt || undefined, nBakSnz: getSettings().nBakSnz || undefined, wxIcons: getSettings().wxIcons || undefined, carN: getSettings().carN ?? undefined, carSec: getSettings().carSec ?? undefined, wxoCut: getSettings().wxoCut ?? undefined, dashFirst: getSettings().dashFirst || undefined, refLo: rlo, refHi: rhi, nextHu, nextService, certAcKwh: certAcKwh !== undefined ? Math.round(certAcKwh * 10) / 10 : undefined, certDcKwh: certDcKwh !== undefined ? Math.round(certDcKwh * 10) / 10 : undefined, certKm: certKm !== undefined ? Math.round(certKm) : undefined })) {   // commuteKm: im Steuerhelfer (Berichte → Fahrten) gepflegt
    renderReminderBadges(); renderHeroStats(); pushPrefs(); applyTitle();
    $('settings-msg').classList.remove('hidden'); setTimeout(() => $('settings-msg').classList.add('hidden'), 2500);
  }
});
/* Alle Daten löschen: zweistufig. Stufe 1 = Dialog mit Erklärung, Stufe 2 = Wort LÖSCHEN eintippen. Erst dann wird der rote Button aktiv. */
const WIPE_WORD = 'LÖSCHEN';
$('btn-wipe').addEventListener('click', () => {
  $('wipe-cloud').classList.toggle('hidden', !window.cloud?.isSignedIn());
  $('wipe-input').value = ''; $('wipe-ok').disabled = true; $('wipe-dialog').classList.remove('hidden'); setTimeout(() => $('wipe-input').focus(), 50);
});
const closeWipe = () => { $('wipe-dialog').classList.add('hidden'); $('wipe-input').value = ''; $('wipe-ok').disabled = true; };
$('wipe-cancel').addEventListener('click', closeWipe);
$('wipe-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeWipe(); });
$('wipe-input').addEventListener('input', (e) => { $('wipe-ok').disabled = e.target.value.trim().toUpperCase() !== WIPE_WORD; });
$('wipe-ok').addEventListener('click', () => {
  if ($('wipe-input').value.trim().toUpperCase() !== WIPE_WORD) return;     // doppelte Absicherung, falls der Button doch aktiv wäre
  closeWipe();
  {
    commitReadings([]); commitCosts([]); commitReminders([]); commitRecurring([]); commitTrips([]); localStorage.removeItem(KEY_TRIPS_IMP); localStorage.removeItem(KEY_TLABELS); localStorage.removeItem(KEY_TRULES); localStorage.removeItem(KEY_TDEF); setTPlaces([]); localStorage.removeItem(KEY_SETTINGS); localStorage.removeItem(KEY_WXLOC); localStorage.removeItem(KEY_WXCACHE); localStorage.removeItem(KEY_TEMPS); localStorage.removeItem(KEY_WRAP); localStorage.removeItem(KEY_DRIVE); localStorage.removeItem(KEY_HERO); localStorage.removeItem(KEY_HERO_C); applyHeroColor(); pushPrefs(); setProviders([]); setCategories(DEFAULT_CATEGORIES.slice()); fillSettings(); alert('Alle Daten wurden gelöscht.');
  }
});


/* Fahrzeugtyp: Hinweise und graue Platzhalter aus dem gewählten Profil; beim Wechsel Akku/Ladeleistung mitziehen, wenn sie noch dem alten Standard entsprechen. */
let carFormKey = null;
function carFormHints() {
  const c = CAR_PRESETS[$('set-car').value] || CAR_PRESETS.enyaq50, f = (v) => String(v).replace('.', ',');
  if (carFormKey && carFormKey !== $('set-car').value) {
    const o = CAR_PRESETS[carFormKey];
    if (parseNum($('set-battery').value) === o.net) $('set-battery').value = f(c.net);
    if (parseNum($('set-power').value) === o.ac) $('set-power').value = f(c.ac);
    const tv = $('set-title').value.trim(); if (!tv || tv === DEFAULT_TITLE || tv === o.title) $('set-title').value = c.title || DEFAULT_TITLE;   // Standard-Titel mitwechseln
  }
  carFormKey = $('set-car').value;
  $('set-battery').placeholder = f(c.net); $('set-power').placeholder = f(c.ac);
  $('set-wltp-hint').textContent = 'Für den Vergleich im Rückblick. ' + c.name + ': ' + c.wltpHint + '. Leer = ' + fmt(c.wltp, 1) + '.';
  Object.keys(CAR_TECH).forEach(k => { $('set-ct-' + k).placeholder = k === 'wKm' ? fmt(c[k], 0) : f(c[k]); });
  $('set-car-hint').textContent = 'Setzt Standardwerte für Akku, Ladeleistung, WLTP, Routenplaner und Akku-Garantie.' + (c.est ? ' cw-Wert und Stirnfläche sind vorläufige Schätzwerte.' : '');
}
$('set-car').addEventListener('change', carFormHints);
