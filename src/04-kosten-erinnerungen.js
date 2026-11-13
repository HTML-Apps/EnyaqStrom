/* =====================================================================
   Kosten: Kategorien (Einstellungen) und Erfassen
   ===================================================================== */
const catChipCls = (on) => 'grow inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] border active:scale-95 transition ' + (on ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-semibold' : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300');
/** Kleines Symbol je Kategorie (nach Stichwort im Namen), sonst ein Etikett. */
const CAT_ICONS = [[/service|wartung|werkstatt|inspektion|repar/i, '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6Z"/>'],
  [/versich/i, '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6Z"/>'], [/anmeld|steuer|zulass|tüv|\bhu\b/i, '<path d="M14 3H6v18h12V7Z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>'],
  [/wäsch|wasch|pflege/i, '<path d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3Z"/>'], [/park/i, '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>'],
  [/maut|vignette/i, '<path d="M8 21l2-18M16 21l-2-18M12 7v2M12 13v2"/>'], [/straf|gebühr|bußg/i, '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="M14 7v12"/>'],
  [/tuning|zubehör/i, '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>'], [/reifen|räder|rad/i, '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'], [/laden|strom/i, '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z"/>']];
const catIcon = (n, cls = 'w-4 h-4') => { const m = CAT_ICONS.find(([re]) => re.test(n || '')); return '<svg class="' + cls + ' shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">' + (m ? m[1] : '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="7.5" r="1"/>') + '</svg>'; };
function renderCategories() {
  const l = getCategories();
  $('cat-list').innerHTML = l.length ? l.map((n, i) => `<span class="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm max-w-full"><span class="truncate">${esc(n)}</span><button type="button" data-del="${i}" aria-label="${esc(n)} entfernen" class="w-6 h-6 shrink-0 rounded-lg text-slate-500 hover:text-red-600 active:scale-95">×</button></span>`).join('')
                                     : '<span class="text-xs text-slate-500 dark:text-slate-400">Keine Kategorien angelegt.</span>';
}
function setCategories(list) {
  save(KEY_CATEGORIES, list); renderCategories();
  if (!$('view-costs').classList.contains('hidden')) renderCostsView();
  const msg = $('cat-msg');
  if (!window.cloud?.isSignedIn()) { msg.textContent = 'Gespeichert (nur lokal, nicht angemeldet).'; return; }
  msg.textContent = 'Gespeichert · Cloud: wird übertragen …';
  window.cloud.setCategories(list).then(() => { msg.textContent = 'Gespeichert · Cloud ✓'; })
    .catch(e => { msg.textContent = 'Lokal gespeichert, Cloud-Fehler: ' + (e.code || e.message) + (e.code === 'permission-denied' ? ' (Firestore-Regel für enyaqStrom/<uid>/settings ergänzen)' : ''); });
}
function addCategory() {
  const inp = $('cat-new'), name = inp.value.trim().replace(/\s+/g, ' ').slice(0, 30), l = getCategories();
  if (!name) return;
  if (l.some(n => n.toLowerCase() === name.toLowerCase())) { $('cat-msg').textContent = '„' + name + '“ gibt es schon.'; return; }
  if (l.length >= 40) { $('cat-msg').textContent = 'Maximal 40 Kategorien.'; return; }
  inp.value = ''; setCategories(l.concat(name));
}
$('btn-cat-add').addEventListener('click', addCategory);
$('cat-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });
$('cat-list').addEventListener('click', e => {
  const i = e.target.dataset.del; if (i === undefined) return;
  const l = getCategories(); l.splice(+i, 1); setCategories(l);          // bestehende Kosten behalten ihren Kategorie-Namen
});
/** Cloud-Abgleich der Kategorien: erster Abgleich führt zusammen (nur wenn lokal angepasst), danach gilt die Cloud. */
window.onCloudCategories = (list, first, uid) => {
  if (first) checkCacheUid(uid);
  const customized = localStorage.getItem(KEY_CATEGORIES) !== null, local = getCategories();
  let next = Array.isArray(list) ? list.filter(n => typeof n === 'string' && n.trim()) : null;
  if (next === null) { if (customized && first) window.cloud.setCategories(local).catch(() => {}); return; }
  if (first && customized && uploadCutoff(uid) === 0) { const merged = next.concat(local.filter(n => !next.some(m => m.toLowerCase() === n.toLowerCase()))); if (merged.length !== next.length) { next = merged; window.cloud.setCategories(next).catch(() => {}); } }
  if (first && !localStorage.getItem(KEY_CHCATS)) {                         // Checkheft: Service, Reparatur und TÜV einmalig ergänzen, falls sie fehlen
    const miss = CH_TYPES.map(t => t.n).filter(n => !next.some(m => chType(m) && chType(m).n === n)); localStorage.setItem(KEY_CHCATS, '1');
    if (miss.length) { next = next.concat(miss); window.cloud.setCategories(next).catch(() => {}); }
  }
  if (!customized || JSON.stringify(next) !== JSON.stringify(local)) { save(KEY_CATEGORIES, next); renderCategories(); if (!$('view-costs').classList.contains('hidden')) renderCostsView(); }
};

/** Letzter bekannter km-Stand: gemeinsamer km-Verlauf (Ladungen, Kosten, Fahrtenbuch, Tagesstände und aktueller Stand vom Auto) – odoNow in src/05 */
function lastKnownKm() { return odoNow(); }
let costCat = '';
function renderCostsView() {
  const cats = getCategories();
  if (costCat && !cats.includes(costCat)) costCat = '';
  $('cost-cats').innerHTML = cats.length ? cats.map(n => `<button type="button" data-cat="${esc(n)}" class="cost-cat ${catChipCls(n === costCat)}">${catIcon(n)}${esc(n)}</button>`).join('')
                                         : '<span class="text-xs text-slate-500 dark:text-slate-400">Keine Kategorien – lege welche in den Einstellungen an.</span>';
  if (!$('cost-date').value) $('cost-date').value = toLocalInput(new Date().toISOString());
  const km = lastKnownKm(); $('cost-km').placeholder = km != null ? 'zuletzt ' + fmt(km, 0) : '';
  renderRecurring(); paintCostType(); renderCostRecent(); requestAnimationFrame(packCostCats);
}
/** Ausgabe / Einnahme: Umschalter steuert das (versteckte) Kästchen cost-income, Vorzeichen und Button-Text passen sich an. */
function paintCostType() {
  const inc = $('cost-income').checked;
  document.querySelectorAll('#cost-type [data-ctype]').forEach(b => { const on = (b.dataset.ctype === 'in') === inc;
    b.className = 'py-2 rounded-lg text-sm font-semibold transition ' + (on ? (inc ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm') : 'text-slate-500 dark:text-slate-400'); b.setAttribute('aria-pressed', String(on)); });
  $('cost-sign').textContent = inc ? '+' : '−'; $('cost-sign').className = 'font-barlow text-4xl font-bold ' + (inc ? 'text-emerald-500' : 'text-slate-400');
  $('cost-amount').classList.toggle('text-emerald-500', inc); $('cost-save-label').textContent = inc ? 'Einnahme speichern' : 'Ausgabe speichern';
}
$('cost-type').addEventListener('click', (e) => { const b = e.target.closest('[data-ctype]'); if (!b) return; $('cost-income').checked = b.dataset.ctype === 'in'; paintCostType(); });
/** Die letzten vier Kosten mit Symbol; Antippen öffnet die Historie (Filter Kosten). */
function renderCostRecent() {
  const l = getCosts().slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 4);
  $('recent-card').classList.toggle('hidden', !l.length);
  $('cost-recent').innerHTML = l.map(c => { const a = costAmt(c), inc = a < 0;
    return `<li><button type="button" data-goh class="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${inc ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}">${catIcon(c.category || c.title, 'w-[18px] h-[18px]')}</span>
      <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">${esc(c.title || 'Kosten')}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${fmtDate(c.date)}${c.category ? ' · ' + esc(c.category) : ''}</span></span>
      <span class="shrink-0 font-semibold tabular-nums ${inc ? 'text-emerald-500' : ''}">${inc ? '+' : ''}${eur(Math.abs(a))}</span></button></li>`; }).join('');
}
/** Kategorien platzsparend anordnen: Breiten messen, dann nach „First Fit Decreasing“ in möglichst wenige Zeilen packen.
    Die Chips wachsen danach auf volle Zeilenbreite (grow), so entstehen bündige Reihen ohne Lücken am Ende. */
function packCostCats() {
  const box = $('cost-cats'), chips = [...box.querySelectorAll('.cost-cat')]; if (chips.length < 3 || !box.clientWidth) return;
  const gap = 6, W = box.clientWidth; chips.forEach(c => { c.style.flexGrow = '0'; });
  const items = chips.map(c => ({ c, w: Math.ceil(c.getBoundingClientRect().width) })).sort((a, b) => b.w - a.w), rows = [];
  items.forEach(it => { const r = rows.find(r => r.w + gap + it.w <= W); if (r) { r.items.push(it); r.w += gap + it.w; } else rows.push({ w: it.w, items: [it] }); });
  rows.forEach(r => r.items.forEach(it => { box.appendChild(it.c); it.c.style.flexGrow = ''; }));
}
window.addEventListener('resize', () => { if (!$('view-costs').classList.contains('hidden')) packCostCats(); });
$('cost-recent').addEventListener('click', (e) => { if (e.target.closest('[data-goh]')) { histFilter = 'kosten'; showView('history'); } });
$('cost-to-hist').addEventListener('click', () => { histFilter = 'kosten'; showView('history'); });
$('cost-cats').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  costCat = costCat === b.dataset.cat ? '' : b.dataset.cat;                       // erneut tippen = Auswahl aufheben
  renderCostsView();
});
$('btn-cost-save').addEventListener('click', async () => {
  const amtRaw = $('cost-amount').value.trim(), amount = amtRaw === '' ? 0 : parseNum(amtRaw), km = optNum($('cost-km').value), d = new Date($('cost-date').value), msg = $('cost-msg');   // leer = 0 € (kostenlose Info, z. B. mit Beleg)
  if (!isFinite(amount) || amount < 0) { flash(msg, 'Bitte einen gültigen Betrag eingeben (0 € ist erlaubt).', false); return; }
  if (amount === 0 && $('cost-recur').checked) { flash(msg, 'Wiederkehrende Kosten brauchen einen Betrag größer 0.', false); return; }
  if (isNaN(d)) { flash(msg, 'Bitte ein gültiges Datum eingeben.', false); return; }
  if (Number.isNaN(km) || (km != null && (km < 0 || km > 999999))) { flash(msg, 'Bitte einen gültigen km-Stand eingeben (0 bis 999999) oder das Feld leer lassen.', false); return; }
  const income = $('cost-income').checked, note = $('cost-note').value.trim();
  const entry = { id: Date.now(), date: d.toISOString(), title: $('cost-title').value.trim() || costCat || 'Kosten', amount: amount ? Math.round(amount * 100) / 100 * (income ? -1 : 1) : 0, category: costCat };
  if (note) entry.note = note;                                                    // optionale Felder nur setzen, wenn vorhanden (Firestore verbietet undefined)
  if (km != null) entry.odometerKm = km;
  const files = (dvPend.get('form') || []).slice();                                // Belege: Tipp auf „Speichern“ öffnet bei Bedarf das Google-Fenster
  if (files.length && !window.cloud?.isSignedIn()) { flash(msg, 'Belege brauchen die Anmeldung bei Google (Einstellungen). Bitte anmelden oder die Belege entfernen.', false); return; }
  const tokP = files.length ? window.cloud.driveToken() : null; if (tokP) tokP.catch(() => { });
  let tpl = null;
  if ($('cost-recur').checked) {                                                  // Vorlage anlegen; die erste Buchung ist dieser Eintrag (Nummer 0)
    const tid = Date.now(); entry.id = tid * 1000; entry.recurId = tid;
    tpl = cleanRem({ id: tid, title: entry.title, amount: entry.amount, category: costCat || undefined, note: note || undefined, intervalMonths: Number($('cost-recur-int').value), startDate: entry.date, nextIdx: 1 });
    const due = recurDueCount(tpl);
    if (due > 0 && !(await ask('Das Datum liegt in der Vergangenheit: ' + due + ' weitere Buchung' + (due === 1 ? '' : 'en') + ' bis heute werden zusätzlich angelegt.', { title: 'Fortfahren?', ok: 'Anlegen' }))) return;
  }
  const costs = getCosts(); costs.push(entry); costs.sort((a, b) => new Date(a.date) - new Date(b.date));
  const status = commitCosts(costs);
  if (!status) return;
  if (tpl) { commitRecurring(getRecurring().concat(tpl)); bookRecurring(); }
  const text = 'Gespeichert: ' + entry.title + ', ' + (income ? '+' : '') + eur(Math.abs(entry.amount));
  flash(msg, text + (window.cloud?.isSignedIn() ? ' · Cloud: wird übertragen …' : ' · nur lokal (nicht bei Google angemeldet)'), true);
  status.then(r => { if (r === 'cloud') flash(msg, text + ' · Cloud ✓', true); else if (r.startsWith('error:')) flash(msg, text + ' · Cloud-Fehler: ' + r.slice(6), false); });
  ['cost-title', 'cost-amount', 'cost-km', 'cost-note'].forEach(id => { $(id).value = ''; });
  $('cost-income').checked = false; $('cost-recur').checked = false; $('cost-recur-opts').classList.add('hidden'); $('cost-date').value = '';                    // Datum für die nächste Erfassung wieder auf "jetzt"
  renderCostsView();
  if (files.length) { dvPend.set('form', []); dvRefreshForm(); dvAfterSave(entry, files, tokP, msg, text); }
});

/* CSV-Leser (wird vom Fahrtenbuch-Import genutzt) */
function parseCsv(text) {                                // RFC-4180: Anführungszeichen, "" als Maskierung, Zeilenumbrüche in Feldern
  text = text.replace(/^\uFEFF/, ''); const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

/* =====================================================================
   Erinnerungen (Wartung, Service, Prüfungen) nach Datum und/oder km
   Eintrag: { id, title, category?, note?, dueDate? ('JJJJ-MM-TT'), dueKm?, startDate ('JJJJ-MM-TT', Beginn des Fortschrittsbalkens), startKm?,
              repeatMonths?, repeatDays? (täglich/wöchentlich, Wochen = 7 Tage), repeatUnit? ('d'|'w', nur Anzeige), repeatKm?, doneAt? (ISO, nur bei einmaligen), lastDoneAt?, lastDoneKm?, log? ([{ at, km?, cost? }] alle Erledigungen), guid? (aus früherem Import) }
   Fortschritt: Anteil der Strecke von startDate/startKm bis dueDate/dueKm; gilt der größere der beiden Anteile (es zählt, was zuerst erreicht wird).
   Wiederkehrende Erinnerungen werden mit „Erledigt“ ab dem Erledigt-Datum (und -km) neu angesetzt, einmalige wandern in die Liste „Erledigt“.
   Den aktuellen km-Stand liefert lastKnownKm() (gemeinsamer km-Verlauf, auch Fahrtenbuch und Auto).
   ===================================================================== */
const getReminders = () => { const l = load(KEY_REMINDERS, []); return Array.isArray(l) ? l : []; };
const remWarn = () => {
  const s = getSettings(), n = (v, d) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v))) ? d : Number(v);
  return { days: n(s.remDays, 14), km: n(s.remKm, 500) };
};
/** Schreibweg für Erinnerungen: lokaler Cache + Firestore (nur Änderungen). Liefert false | Promise('local' | 'cloud' | 'error:…'). */
function commitReminders(next) {
  const prev = getReminders();
  if (!save(KEY_REMINDERS, next)) return false;
  renderReminderBadges();
  if (isDesk()) try { renderReminders(); } catch (e) { }
  try { if (!gtMirSkip) gtMirrorSoon(); } catch (e) { }
  if (!window.cloud?.isSignedIn()) return Promise.resolve('local');
  return window.cloud.pushReminders(prev, next).then(() => 'cloud').catch(e => {
    console.error('Firestore-Schreibfehler (Erinnerungen)', e);
    window.onCloudStatus?.({ error: e.code || e.message });
    return 'error:' + (e.code || e.message);
  });
}
/* Datums-Helfer: Tage immer lokal und auf 12:00 Uhr gerechnet, damit Zeitumstellungen nichts verschieben */
const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseYMD = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
const todayYMD = () => ymd(new Date());
const daysBetween = (a, b) => Math.round((a - b) / 86400000);
const fmtYMD = (s) => parseYMD(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
function addMonths(d, n) {                                 // 31.01. + 1 Monat = 28./29.02. (Monatsende bleibt gültig)
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, 12), last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last)); return r;
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const cleanRem = (o) => { Object.keys(o).forEach(k => { if (o[k] === undefined || o[k] === null || (typeof o[k] === 'number' && !isFinite(o[k]))) delete o[k]; }); return o; };
const isRun = (r) => r && r.kind === 'run';                         // Laufzeit: „seit …“, optional mit Haltbarkeit (dueDate = Ablauf)
const isRepeating = (r) => !isRun(r) && (r.repeatMonths > 0 || r.repeatDays > 0 || r.repeatKm > 0);
/** Ablauf einer Laufzeit: Beginn + Haltbarkeit (Tage, Wochen, Monate) */
const runDue = (since, n, u) => !(n > 0) || !since ? null : ymd(u === 'm' ? addMonths(parseYMD(since), n) : addDays(parseYMD(since), n * (u === 'w' ? 7 : 1)));
const runLifeText = (r) => !(r.lifeN > 0) ? '' : r.lifeN + ' ' + (r.lifeUnit === 'm' ? (r.lifeN === 1 ? 'Monat' : 'Monate') : r.lifeUnit === 'd' ? (r.lifeN === 1 ? 'Tag' : 'Tage') : (r.lifeN === 1 ? 'Woche' : 'Wochen'));
function agoText(days) {                                               // „vor 12 Tagen“, „vor 4 Monaten“
  if (days <= 0) return 'heute'; if (days === 1) return 'gestern'; if (days < 14) return 'vor ' + days + ' Tagen';
  if (days < 60) return 'vor ' + Math.round(days / 7) + ' Wochen'; if (days < 730) return 'vor ' + Math.round(days / 30.44) + ' Monaten';
  const y = days / 365.25; return 'vor ' + fmt(Math.round(y * 10) / 10, 1).replace(/,0$/, '') + ' Jahren';
}
function leftText(days) {                                              // „noch ~2 Tage“, „noch ~20 Monate“
  if (days < 14) return 'noch ' + days + (days === 1 ? ' Tag' : ' Tage'); if (days < 60) return 'noch ~' + Math.round(days / 7) + ' Wochen';
  return 'noch ~' + Math.round(days / 30.44) + ' Monate';
}
const hasRepTime = (r) => r.repeatMonths > 0 || r.repeatDays > 0;
/** Zeit-Intervall anwenden (n = +1 vor, −1 zurück): Monate oder Tage (wöchentlich = 7 Tage) */
const remStep = (d, r, n = 1) => r.repeatMonths > 0 ? addMonths(d, n * r.repeatMonths) : addDays(d, n * r.repeatDays);
function remEveryText(r) {
  if (r.repeatMonths > 0) return r.repeatMonths === 1 ? 'monatlich' : 'alle ' + r.repeatMonths + ' Monate';
  if (r.repeatDays > 0) { if (r.repeatUnit === 'w' || (r.repeatDays % 7 === 0 && r.repeatUnit !== 'd')) { const w = r.repeatDays / 7; return w === 1 ? 'wöchentlich' : 'alle ' + w + ' Wochen'; } return r.repeatDays === 1 ? 'täglich' : 'alle ' + r.repeatDays + ' Tage'; }
  return '';
}
/** Verlauf aller Erledigungen einer Erinnerung, älteste zuerst: [{ at (ISO), km?, cost? }].
    Ältere Einträge ohne Verlauf: der zuletzt gespeicherte Termin (lastDoneAt bzw. doneAt) gilt als erster Eintrag. */
const REM_LOG_MAX = 100;
function remLog(r) {
  if (Array.isArray(r.log) && r.log.length) return r.log.filter(e => e && !isNaN(Date.parse(e.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const at = r.lastDoneAt || r.doneAt; if (!at) return [];
  const e = { at }; if (r.lastDoneKm > 0) e.km = r.lastDoneKm; return [e];
}
/* Aufklappbarer Verlauf für die Karten (neueste Erledigung oben) */
function remLogHtml(r) {
  const l = remLog(r).slice().reverse(); if (!l.length) return '';
  return `<details class="group"><summary class="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 [&::-webkit-details-marker]:hidden">Verlauf (${l.length})<svg class="h-3.5 w-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
    <ul class="mt-1.5 divide-y divide-slate-200 dark:divide-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800/60 px-3">${l.map(e => `<li class="flex items-baseline justify-between gap-3 py-1.5 text-xs"><span class="tabular-nums">${fmtDate(e.at)}</span><span class="tabular-nums text-right text-slate-500 dark:text-slate-400">${[e.km > 0 ? fmt(e.km, 0) + ' km' : '', e.cost > 0 ? eur(e.cost) : ''].filter(Boolean).join(' · ') || '–'}</span></li>`).join('')}</ul></details>`;
}

/** Stand einer Erinnerung: { daysLeft, kmLeft, frac (0–1+, null = unbekannt), level 'ok' | 'soon' | 'over' }. */
function remStatus(r, km = lastKnownKm(), today = dayStart()) {
  const w = remWarn(), st = { daysLeft: null, kmLeft: null, frac: null, level: 'ok' }, fr = [];
  if (r.dueDate) {
    const due = parseYMD(r.dueDate), start = parseYMD(r.startDate || r.dueDate), total = daysBetween(due, start);
    st.daysLeft = daysBetween(due, today);
    fr.push(total > 0 ? Math.max(0, daysBetween(today, start)) / total : (st.daysLeft <= 0 ? 1 : 0));
  }
  if (r.dueKm > 0 && km != null) {
    st.kmLeft = r.dueKm - km;
    const sk = r.startKm != null ? r.startKm : (r.repeatKm > 0 ? r.dueKm - r.repeatKm : null);
    if (sk != null && r.dueKm > sk) fr.push(Math.max(0, km - sk) / (r.dueKm - sk));
    else if (st.kmLeft <= 0) fr.push(1);
    else if (sk != null) fr.push(0);
  }
  st.frac = fr.length ? Math.max(...fr) : null;
  const over = (st.daysLeft != null && st.daysLeft <= 0) || (st.kmLeft != null && st.kmLeft <= 0);
  const runTot = isRun(r) && r.dueDate && r.startDate ? daysBetween(parseYMD(r.dueDate), parseYMD(r.startDate)) : 0;
  const wd = r.repeatDays > 0 ? Math.min(w.days, Math.floor(r.repeatDays / 3)) : runTot > 0 ? Math.min(w.days, Math.floor(runTot / 3)) : w.days;
  const soon = (st.daysLeft != null && st.daysLeft <= wd) || (st.kmLeft != null && st.kmLeft <= w.km);
  st.level = over ? 'over' : soon ? 'soon' : 'ok';
  return st;
}
const REM_RANK = { over: 0, soon: 1, ok: 2 };
const sortedOpenReminders = (km = lastKnownKm()) => getReminders().filter(r => !r.doneAt && (!isRun(r) || r.dueDate)).map(r => ({ r, s: remStatus(r, km) }))
  .sort((a, b) => remEta(a.s) - remEta(b.s) || a.r.title.localeCompare(b.r.title, 'de'));
/** Chronologische Reihenfolge: Tage bis zur Fälligkeit; nur nach km fällige über den Ø km pro Tag in Tage umgerechnet (es zählt, was zuerst eintritt) */
function remEta(s) {
  let kd = 30; try { const h = wxoHabits(); if (h.kmDay > 3) kd = h.kmDay; } catch (e) { }
  const t = [s.daysLeft, s.kmLeft != null ? s.kmLeft / kd : null].filter(v => v != null);
  return t.length ? Math.min(...t) : 1e9;
}

/** Zähler an Glocke (Start-Seite) und am Start-Tab: Erinnerungen, die fällig, überfällig oder innerhalb der Vorwarnung sind. */
function renderReminderBadges() {
  const km = lastKnownKm(), st = getReminders().filter(r => !r.doneAt).map(r => remStatus(r, km));
  const n = st.filter(s => s.level !== 'ok').length, over = st.some(s => s.level === 'over');
  ['bell-badge', 'nav-badge'].forEach(id => {
    const el = $(id); if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('hidden', n === 0);                                                                              // immer grün (#10b981 wie die Balken)
  });
  renderHeroReminder(); renderRemBanner();
  const b = $('btn-bell'); if (b) b.setAttribute('aria-label', n ? 'Erinnerungen, ' + n + (n === 1 ? ' fällig oder bald fällig' : ' fällig oder bald fällig') : 'Erinnerungen');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderReminderBadges(); if (!$('view-reminders').classList.contains('hidden')) renderReminders(); } });   // Tageswechsel im Hintergrund

const REM_LEVEL = {
  over: { bar: 'bg-red-500', chip: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  soon: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  ok:   { bar: 'bg-emerald-500', chip: '' }
};
function remRepeatText(r) {
  const p = []; if (hasRepTime(r)) p.push(remEveryText(r)); if (r.repeatKm > 0) p.push('alle ' + fmt(r.repeatKm, 0) + ' km');
  return p.length ? 'wiederholt ' + p.join(' / ') : 'einmalig';
}
function remLines(r, s, km) {
  const out = [];
  if (r.dueDate) {
    const d = s.daysLeft, when = fmtYMD(r.dueDate);
    out.push(d < 0 ? (-d) + (d === -1 ? ' Tag' : ' Tage') + ' überfällig · seit ' + when : d === 0 ? 'Heute fällig · ' + when : d === 1 ? 'Morgen fällig · ' + when
      : 'in ' + d + ' Tagen · ' + when + (d >= 60 ? ' (≈ ' + Math.round(d / 30.44) + ' Monate)' : ''));
  }
  if (r.dueKm > 0) {
    out.push(km == null ? 'bei ' + fmt(r.dueKm, 0) + ' km (aktueller km-Stand unbekannt)'
      : s.kmLeft < 0 ? fmt(-s.kmLeft, 0) + ' km überfällig (bei ' + fmt(r.dueKm, 0) + ' km)' : s.kmLeft === 0 ? 'Jetzt fällig (bei ' + fmt(r.dueKm, 0) + ' km)' : 'noch ' + fmt(s.kmLeft, 0) + ' km (bei ' + fmt(r.dueKm, 0) + ' km)');
  }
  return out;
}
const KEY_REMTAB = 'enyaq.remTab';
let remTab = load(KEY_REMTAB, 'due') === 'run' ? 'run' : 'due';
function renderReminders() {
  try { fillIcePush(); } catch (e) { }   // Push-Schalter unten auf der Seite: aktuellen Stand zeigen
  const km = lastKnownKm(), all = sortedOpenReminders(km), open = all.filter(x => !isRun(x.r)), done = getReminders().filter(r => r.doneAt && !isRun(r)).sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
  const runs = getReminders().filter(r => isRun(r)).map(r => ({ r, s: remStatus(r, km) })).sort((a, b) => String(a.r.startDate || '9999').localeCompare(String(b.r.startDate || '9999')) || a.r.title.localeCompare(b.r.title, 'de'));   // am längsten laufend zuerst
  const lv = all.filter(x => x.s.level !== 'ok'), n = lv.length, over = lv.filter(x => x.s.level === 'over').length;
  $('rem-summary').textContent = open.length + runs.length ? (n ? over + ' fällig · ' + (n - over) + ' bald' : 'Alles im grünen Bereich') + ' · ' + open.length + (open.length === 1 ? ' Fälligkeit' : ' Fälligkeiten') + ' · ' + runs.length + (runs.length === 1 ? ' Laufzeit' : ' Laufzeiten') : '';
  segPaintKey('.rem-tab', 'rtab', remTab);
  document.querySelectorAll('.rem-tab').forEach(b => { b.textContent = (b.dataset.rtab === 'run' ? 'Laufzeit (' + runs.length + ')' : 'Fälligkeiten (' + open.length + ')'); });
  const isDue = remTab === 'due', empty = isDue ? !open.length && !done.length : !runs.length;
  $('rem-empty').classList.toggle('hidden', !empty);
  $('rem-empty-h').textContent = isDue ? 'Noch keine Fälligkeiten' : 'Noch keine Laufzeiten';
  $('rem-empty-t').textContent = isDue ? 'Lege mit „+ Neu“ eine an.' : 'Mit „+ Neu“ → Laufzeit hältst du fest, seit wann etwas läuft – z. B. Keramikbeschichtung oder Reifenglanz.';
  $('rem-list').classList.toggle('hidden', !isDue); $('rem-run-list').classList.toggle('hidden', isDue); $('rem-ics-note').classList.toggle('hidden', !isDue);
  $('rem-ics-all').classList.toggle('hidden', !isDue || !open.some(x => x.r.dueDate));
  $('rem-run-list').innerHTML = runs.map(({ r, s }) => {
    const ago = daysBetween(dayStart(), parseYMD(r.startDate || todayYMD())), has = !!r.dueDate, lvl = REM_LEVEL[s.level];
    const pct = has ? Math.min(100, Math.round((s.frac || 0) * 100)) : 0, col = s.level === 'over' ? 'text-red-600 dark:text-red-400' : s.level === 'soon' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
    const left = !has ? '<span class="text-xs text-slate-500 dark:text-slate-400">ohne Ablauf</span>' : `<span class="text-xs font-semibold ${col}">${s.daysLeft < 0 ? 'abgelaufen seit ' + agoText(-s.daysLeft).replace(/^vor /, '') : s.daysLeft === 0 ? 'läuft heute ab' : leftText(s.daysLeft)}</span>`;
    return `<li data-id="${esc(r.id)}" class="rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4 space-y-2">
      <div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="font-medium break-words">${esc(r.title)}</p><p class="text-xs text-left text-slate-500 dark:text-slate-400">${[r.category ? esc(r.category) : '', has ? 'hält ca. ' + esc(runLifeText(r)) : ''].filter(Boolean).join(' · ') || 'Laufzeit'}</p></div>
        <div class="shrink-0 text-right"><p class="text-[15px] font-bold leading-tight">${agoText(ago)}</p><p class="text-right text-[11px] text-slate-500 dark:text-slate-400">seit ${fmtYMD(r.startDate || todayYMD())}</p>${ago > 0 ? '<p class="text-right text-[11px] text-slate-500 dark:text-slate-400">' + fmt(ago, 0) + (ago === 1 ? ' Tag' : ' Tage') + '</p>' : ''}</div></div>
      ${has ? `<div class="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="h-full rounded-full ${lvl.bar}" style="width:${pct}%"></div></div>` : ''}
      ${r.note ? `<p class="text-xs text-left text-slate-500 dark:text-slate-400 break-words">${esc(r.note)}</p>` : ''}
      ${remLog(r).length > 1 ? remLogHtml(r) : ''}
      <div class="flex items-center justify-between gap-2 pt-0.5"><span class="min-w-0 whitespace-nowrap">${left}</span><div class="flex shrink-0 gap-1.5"><button type="button" data-act="edit" class="whitespace-nowrap px-2.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-[13px] font-medium active:scale-95 transition">Bearbeiten</button><button type="button" data-act="renew" class="whitespace-nowrap px-2.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-[13px] font-semibold text-sky-700 dark:text-sky-300 active:scale-95 transition">↻ Erneuert</button></div></div></li>`;
  }).join('');
  $('rem-list').innerHTML = open.map(({ r, s }) => {
    const lv = REM_LEVEL[s.level], pct = s.frac == null ? 0 : Math.min(100, Math.round(s.frac * 100));
    const chip = s.level === 'ok' ? '' : `<span class="shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium ${lv.chip}">${s.level === 'soon' ? 'Bald' : ((s.daysLeft != null && s.daysLeft < 0) || (s.kmLeft != null && s.kmLeft < 0)) ? 'Überfällig' : 'Fällig'}</span>`;
    return `<li data-id="${esc(r.id)}" class="rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4 space-y-2">
      <div class="flex items-start justify-between gap-2"><p class="font-medium min-w-0 break-words">${esc(r.title)}</p>${chip}</div>
      <p class="text-xs text-slate-500 dark:text-slate-400">${r.category ? esc(r.category) + ' · ' : ''}${esc(remRepeatText(r))}</p>
      <div class="space-y-0.5">${remLines(r, s, km).map(t => `<p class="text-sm">${esc(t)}</p>`).join('')}</div>
      ${s.frac == null ? '' : `<div class="flex items-center gap-2"><div class="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="h-full rounded-full ${lv.bar}" style="width:${pct}%"></div></div><span class="w-10 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">${pct} %</span></div>`}
      ${r.note ? `<p class="text-xs text-slate-500 dark:text-slate-400 break-words">${esc(r.note)}</p>` : ''}
      ${r.lastDoneAt ? `<p class="text-xs text-slate-500 dark:text-slate-400">Zuletzt erledigt: ${fmtDate(r.lastDoneAt)}${r.lastDoneKm ? ' bei ' + fmt(r.lastDoneKm, 0) + ' km' : ''}</p>` : ''}
      ${remLog(r).length > 1 ? remLogHtml(r) : ''}
      <div class="grid grid-cols-3 gap-2 pt-1">
        <button type="button" data-act="done" class="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:scale-95 transition">Erledigt</button>
        <button type="button" data-act="edit" class="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium active:scale-95 transition">Bearbeiten</button>
        <button type="button" data-act="ics" class="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium active:scale-95 transition">Kalender</button>
      </div></li>`;
  }).join('');
  $('rem-done-wrap').classList.toggle('hidden', !done.length);
  $('rem-done-label').textContent = 'Erledigt (' + done.length + ')';
  $('rem-done-list').innerHTML = done.map(r => `<li data-id="${esc(r.id)}" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-3 space-y-2">
      <p class="text-sm font-medium break-words">${esc(r.title)}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">erledigt am ${fmtDate(r.doneAt)}${r.lastDoneKm ? ' bei ' + fmt(r.lastDoneKm, 0) + ' km' : ''}</p>
      ${remLog(r).length > 1 ? remLogHtml(r) : ''}
      <div class="grid grid-cols-2 gap-2"><button type="button" data-act="reopen" class="py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium active:scale-95 transition">Wieder öffnen</button><button type="button" data-act="del" class="py-2 rounded-xl border border-red-500 text-red-600 dark:text-red-400 text-sm font-medium active:scale-95 transition">Löschen</button></div></li>`).join('');
}
$('rem-done-toggle').addEventListener('click', () => { const l = $('rem-done-list'); l.classList.toggle('hidden'); $('rem-done-arrow').textContent = l.classList.contains('hidden') ? '▾' : '▴'; });
const remById = (id) => getReminders().find(r => String(r.id) === String(id));
/** Laufzeit erneuert: läuft ab heute neu (Haltbarkeit bleibt), Eintrag im Verlauf */
async function remRenew(r) {
  if (!(await ask('Die Laufzeit beginnt dann heute neu.', { title: '„' + r.title + '“ heute erneuert?', ok: 'Erneuert' }))) return;
  const t = todayYMD(), log = remLog(r).map(e => { const o = { at: e.at }; if (e.km > 0) o.km = e.km; if (e.cost > 0) o.cost = e.cost; return o; });
  if (!log.length && r.startDate) log.push({ at: parseYMD(r.startDate).toISOString() });   // bisheriger Beginn als erster Verlaufseintrag
  log.push({ at: new Date().toISOString() });
  const upd = { ...r, startDate: t, dueDate: runDue(t, r.lifeN, r.lifeUnit) || undefined, log: log.slice(-REM_LOG_MAX) };
  commitReminders(getReminders().map(x => String(x.id) === String(r.id) ? cleanRem(upd) : x)); renderReminders();
}
async function remListClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const li = b.closest('li[data-id]'), r = li && remById(li.dataset.id); if (!r) return;
  const act = b.dataset.act;
  if (act === 'renew') { remRenew(r); return; }
  if (act === 'done') openDone(r); else if (act === 'edit') openRemDialog(r); else if (act === 'ics') downloadIcs([r]);
  else if (act === 'reopen') { commitReminders(getReminders().map(x => String(x.id) === String(r.id) ? cleanRem({ ...x, doneAt: undefined }) : x)); renderReminders(); }
  else if (act === 'del') { const prevR = getReminders(); commitReminders(prevR.filter(x => String(x.id) !== String(r.id))); renderReminders(); undoDel('„' + r.title + '“ gelöscht', () => { commitReminders(prevR); renderReminders(); }); }
}
$('rem-list').addEventListener('click', remListClick);
$('rem-run-list').addEventListener('click', remListClick);
$('rem-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-rtab]'); if (!b) return; remTab = b.dataset.rtab; save(KEY_REMTAB, remTab); renderReminders(); });
segSwipe($('view-reminders'), $('rem-tabs'));                            // ganze Seite: seitlich wischen wechselt Fälligkeiten | Laufzeit
$('rem-done-list').addEventListener('click', remListClick);

/* ---- Anlegen / Bearbeiten ---- */
let remEditId = null;
function remMsg(id, text) { const el = $(id); el.textContent = text; el.className = 'text-sm text-red-600 dark:text-red-400'; }
let remKind = 'due';
function setRemKind(k) {
  remKind = k === 'run' ? 'run' : 'due'; const run = remKind === 'run';
  segPaintKey('.rem-kind', 'rkind', remKind);
  $('rem-f-due').classList.toggle('hidden', run); $('rem-f-run').classList.toggle('hidden', !run);
  $('rem-title').placeholder = run ? 'z. B. Keramikbeschichtung' : 'z. B. Reifendruck prüfen';
  $('rem-note-l').textContent = run ? 'Produkt / Notiz (optional)' : 'Notiz (optional)';
  $('rem-hint').textContent = run ? 'Ohne „Hält ca.“ zählt die Laufzeit nur hoch („vor 7 Tagen“). Mit Haltbarkeit erinnert dich die App, wenn sie abläuft.' : 'Datum und km können zusammen gelten: Es zählt, was zuerst erreicht wird.';
  $('rem-dialog-msg').className = 'hidden text-sm';
}
$('rem-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-rkind]'); if (b) setRemKind(b.dataset.rkind); });
$('rem-since-today').addEventListener('click', () => { $('rem-since').value = todayYMD(); });
function openRemDialog(r = null) {
  remEditId = r ? r.id : null;
  setRemKind(r ? (isRun(r) ? 'run' : 'due') : remTab);
  $('rem-since').value = isRun(r) ? (r.startDate || todayYMD()) : todayYMD(); $('rem-life').value = isRun(r) && r.lifeN > 0 ? String(r.lifeN) : ''; $('rem-life-unit').value = isRun(r) && r.lifeUnit ? r.lifeUnit : 'w';
  $('rem-dialog-title').textContent = r ? 'Erinnerung bearbeiten' : 'Neue Erinnerung';
  $('rem-title').value = r?.title || ''; $('rem-cat').innerHTML = catOptions(r?.category || '');
  $('rem-due').value = r && !isRun(r) ? r.dueDate || '' : ''; $('rem-due-km').value = r?.dueKm ? String(r.dueKm) : '';
  const ru = r?.repeatMonths ? 'm' : r?.repeatDays ? (r.repeatUnit === 'w' || (r.repeatDays % 7 === 0 && r.repeatUnit !== 'd') ? 'w' : 'd') : 'm';
  $('rem-rep-unit').value = ru; $('rem-rep-m').value = r?.repeatMonths ? String(r.repeatMonths) : r?.repeatDays ? String(ru === 'w' ? r.repeatDays / 7 : r.repeatDays) : ''; $('rem-rep-km').value = r?.repeatKm ? String(r.repeatKm) : '';
  $('rem-note').value = r?.note || '';
  $('rem-dialog-msg').className = 'hidden text-sm'; $('rem-delete').classList.toggle('hidden', !r);
  $('rem-dialog').classList.remove('hidden');
}
const closeRemDialog = () => $('rem-dialog').classList.add('hidden');
$('rem-add').addEventListener('click', () => openRemDialog());
$('rem-cancel').addEventListener('click', closeRemDialog);
$('rem-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeRemDialog(); });
$('rem-delete').addEventListener('click', () => {
  const r = remEditId != null && remById(remEditId); if (!r) return;
  const prevR = getReminders(); commitReminders(prevR.filter(x => String(x.id) !== String(r.id))); closeRemDialog(); renderReminders(); undoDel('„' + r.title + '“ gelöscht', () => { commitReminders(prevR); renderReminders(); });
});
$('rem-save').addEventListener('click', () => {
  const title = $('rem-title').value.trim().replace(/\s+/g, ' '), cat = $('rem-cat').value, note = $('rem-note').value.trim();
  if (remKind === 'run') {                                              // Laufzeit: seit … (+ optional Haltbarkeit)
    const since = $('rem-since').value, lifeN = optNum($('rem-life').value), lifeU = $('rem-life-unit').value;
    if (!title) { remMsg('rem-dialog-msg', 'Bitte einen Titel eingeben.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || isNaN(parseYMD(since))) { remMsg('rem-dialog-msg', 'Bitte angeben, seit wann es läuft.'); return; }
    if (since > todayYMD()) { remMsg('rem-dialog-msg', 'Das Datum liegt in der Zukunft – dafür bitte „Fälligkeit“ nutzen.'); return; }
    if (Number.isNaN(lifeN) || (lifeN != null && (!Number.isInteger(lifeN) || lifeN < 1 || lifeN > 999))) { remMsg('rem-dialog-msg', 'Bitte die Haltbarkeit als ganze Zahl (1 bis 999) eingeben oder leer lassen.'); return; }
    const list = getReminders(), old = remEditId != null ? list.find(x => String(x.id) === String(remEditId)) : null;
    const r = { ...(old || { id: Date.now() }), kind: 'run', title, category: cat || undefined, note: note || undefined, startDate: since, lifeN: lifeN ?? undefined, lifeUnit: lifeN ? lifeU : undefined, dueDate: runDue(since, lifeN, lifeU) || undefined,
      dueKm: undefined, startKm: undefined, repeatMonths: undefined, repeatDays: undefined, repeatUnit: undefined, repeatKm: undefined, doneAt: undefined };
    commitReminders(old ? list.map(x => String(x.id) === String(old.id) ? cleanRem(r) : x) : list.concat(cleanRem(r)));
    remTab = 'run'; save(KEY_REMTAB, remTab); closeRemDialog(); renderReminders(); return;
  }
  let due = $('rem-due').value;
  const dueKm = optNum($('rem-due-km').value), repN = optNum($('rem-rep-m').value), repU = $('rem-rep-unit').value, repKm = optNum($('rem-rep-km').value), km = lastKnownKm();
  const repMax = repU === 'd' ? 3650 : repU === 'w' ? 520 : 240;
  if (!title) { remMsg('rem-dialog-msg', 'Bitte einen Titel eingeben.'); return; }
  if (due && isNaN(parseYMD(due))) { remMsg('rem-dialog-msg', 'Bitte ein gültiges Datum eingeben.'); return; }
  if ([dueKm, repN, repKm].some(Number.isNaN) || (dueKm != null && (dueKm <= 0 || dueKm > 999999)) || (repN != null && (!Number.isInteger(repN) || repN < 1 || repN > repMax))
      || (repKm != null && (repKm <= 0 || repKm > 999999))) { remMsg('rem-dialog-msg', 'Bitte km (1 bis 999999) und das Intervall (ganze Zahl, 1 bis ' + repMax + ') prüfen.'); return; }
  const repM = repN != null && repU === 'm' ? repN : null, repD = repN != null && repU !== 'm' ? repN * (repU === 'w' ? 7 : 1) : null, tmp = { repeatMonths: repM || 0, repeatDays: repD || 0 };
  let dKm = dueKm;
  if (!due && dKm == null) {                                            // nur Wiederholung angegeben: erste Fälligkeit ab heute
    if (repM || repD) due = ymd(remStep(new Date(), tmp));
    if (repKm && km != null) dKm = km + repKm;
  }
  if (!due && dKm == null) { remMsg('rem-dialog-msg', repKm && !repM && !repD ? 'Für die Wiederholung nach km fehlt ein bekannter km-Stand. Bitte „Fällig bei km“ eingeben.' : 'Bitte ein Datum oder einen km-Stand angeben, wann die Erinnerung fällig ist.'); return; }
  const list = getReminders(), old = remEditId != null ? list.find(x => String(x.id) === String(remEditId)) : null;
  const r = { ...(old || { id: Date.now() }), kind: undefined, lifeN: undefined, lifeUnit: undefined, title, category: cat || undefined, note: note || undefined, dueDate: due || undefined, dueKm: dKm ?? undefined, repeatMonths: repM ?? undefined, repeatDays: repD ?? undefined, repeatUnit: repD ? repU : undefined, repeatKm: repKm ?? undefined };
  const today = new Date();
  if (!old) {                                                           // Beginn des Fortschritts: bei Wiederholung der Beginn des aktuellen Zeitraums, sonst heute
    const back = due && (repM || repD) ? remStep(parseYMD(due), tmp, -1) : null;
    r.startDate = back && back < today ? ymd(back) : ymd(today);
  } else if (due && parseYMD(due) <= parseYMD(r.startDate || due)) r.startDate = repM || repD ? ymd(remStep(parseYMD(due), tmp, -1)) : ymd(addDays(parseYMD(due), -30));
  if (dKm != null) { const sk = km != null && km < dKm ? km : (repKm && dKm > repKm ? dKm - repKm : null); if (!old || old.startKm == null || old.startKm >= dKm) r.startKm = sk ?? undefined; }
  else r.startKm = undefined;
  if (old && isRun(old)) r.startDate = ymd(today);                      // aus einer Laufzeit wurde eine Fälligkeit
  commitReminders(old ? list.map(x => String(x.id) === String(old.id) ? cleanRem(r) : x) : list.concat(cleanRem(r)));
  remTab = 'due'; save(KEY_REMTAB, remTab); closeRemDialog(); renderReminders();
});

/* ---- Erledigt ---- */
let doneId = null;
function openDone(r) {
  doneId = r.id; $('done-title').textContent = r.title; $('done-date').value = toLocalInput(new Date().toISOString());
  const km = lastKnownKm(); $('done-km').value = ''; $('done-km').placeholder = km != null ? 'zuletzt ' + fmt(km, 0) : '';
  $('done-cost').value = ''; $('done-msg').className = 'hidden text-sm'; updateDonePreview(); $('done-dialog').classList.remove('hidden');
}
/** Neuer Stand nach „Erledigt“ (ohne zu speichern): { doneAt, km, dueDate?, dueKm? } oder { error }. */
function remNextAfterDone(r) {
  const d = new Date($('done-date').value); if (isNaN(d)) return { error: 'Bitte ein gültiges Datum eingeben.' };
  let km = optNum($('done-km').value); if (Number.isNaN(km) || (km != null && (km < 0 || km > 999999))) return { error: 'Bitte einen gültigen km-Stand eingeben oder das Feld leer lassen.' };
  if (km == null) km = lastKnownKm();
  const out = { doneAt: d, km };
  if (isRepeating(r)) {
    if (hasRepTime(r)) out.dueDate = ymd(remStep(d, r));
    if (r.repeatKm > 0) { if (km == null) { if (!hasRepTime(r)) return { error: 'Für die nächste km-Fälligkeit bitte den km-Stand eingeben.' }; } else out.dueKm = km + r.repeatKm; }
  }
  return out;
}
function updateDonePreview() {
  const r = remById(doneId), n = r ? remNextAfterDone(r) : null, el = $('done-next');
  el.textContent = !r || n.error ? '' : !isRepeating(r) ? 'Einmalige Erinnerung: wird nach „Erledigt“ abgelegt.'
    : 'Nächste Fälligkeit: ' + [n.dueDate ? fmtYMD(n.dueDate) : '', n.dueKm ? 'bei ' + fmt(n.dueKm, 0) + ' km' : ''].filter(Boolean).join(' oder ');
}
['done-date', 'done-km'].forEach(id => $(id).addEventListener('input', updateDonePreview));
$('done-cancel').addEventListener('click', () => $('done-dialog').classList.add('hidden'));
$('done-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });
$('done-ok').addEventListener('click', () => {
  const r = remById(doneId); if (!r) return;
  const n = remNextAfterDone(r), cost = optNum($('done-cost').value);
  if (n.error) { remMsg('done-msg', n.error); return; }
  if (Number.isNaN(cost) || (cost != null && (cost < 0 || cost > 1e6))) { remMsg('done-msg', 'Bitte einen gültigen Betrag eingeben oder das Feld leer lassen.'); return; }
  const upd = { ...r, lastDoneAt: n.doneAt.toISOString(), lastDoneKm: n.km ?? undefined };
  const le = { at: n.doneAt.toISOString() }; if (n.km > 0) le.km = Math.round(n.km); if (cost > 0) le.cost = Math.round(cost * 100) / 100;   // ohne undefined (Firestore)
  upd.log = remLog(r).map(e => { const o = { at: e.at }; if (e.km > 0) o.km = e.km; if (e.cost > 0) o.cost = e.cost; return o; })
    .concat(le).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-REM_LOG_MAX);
  if (isRepeating(r)) {
    upd.startDate = ymd(n.doneAt); upd.startKm = n.km ?? undefined;
    if (hasRepTime(r)) upd.dueDate = n.dueDate;
    if (r.repeatKm > 0) upd.dueKm = n.dueKm ?? r.dueKm;
  } else upd.doneAt = n.doneAt.toISOString();
  commitReminders(getReminders().map(x => String(x.id) === String(r.id) ? cleanRem(upd) : x));
  if (cost != null && cost > 0) {                                       // optional gleich als Kosten buchen
    const entry = { id: Date.now() + 1, date: n.doneAt.toISOString(), title: r.title.slice(0, 80), amount: Math.round(cost * 100) / 100, category: r.category || '' };
    const kmTyped = optNum($('done-km').value); if (kmTyped != null && kmTyped > 0) entry.odometerKm = kmTyped;       // nur ein selbst eingegebener km-Stand, nicht der geschätzte
    commitCosts(getCosts().concat(entry).sort((a, b) => new Date(a.date) - new Date(b.date)));
  }
  $('done-dialog').classList.add('hidden'); renderReminders();
});

/* ---- Kalender-Export (.ics, ganztägig am Fälligkeitstag, Hinweise 7 Tage und 1 Tag vorher) ---- */
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {                                                // Zeilen auf höchstens 75 Byte kürzen (UTF-8, Umbruch nie mitten im Zeichen)
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > 75) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; } else { cur += ch; bytes += b; } }
  out.push(cur); return out.join('\r\n');
}
function buildIcs(list) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), compact = (s) => s.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Enyaq Ladekosten//Erinnerungen//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  list.filter(r => r.dueDate).forEach(r => {
    const desc = [r.note, r.dueKm ? 'Auch fällig bei ' + fmt(r.dueKm, 0) + ' km.' : '', isRepeating(r) ? 'Intervall: ' + remRepeatText(r).replace(/^wiederholt /, '') + '.' : '', 'Aus der App Enyaq Ladekosten.'].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', 'UID:enyaq-rem-' + r.id + '@enyaq-ladekosten', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + compact(r.dueDate), 'DTEND;VALUE=DATE:' + compact(ymd(addDays(parseYMD(r.dueDate), 1))),
      'SUMMARY:' + icsEsc(carShort() + ': ' + r.title), 'DESCRIPTION:' + icsEsc(desc), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(r.title), 'TRIGGER:-P6DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(r.title), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
function downloadIcs(list) {
  const withDate = list.filter(r => r.dueDate);
  if (!withDate.length) { appNote('Diese Erinnerung hat kein Fälligkeitsdatum (nur km) und kann nicht in den Kalender.'); return; }
  const a = document.createElement('a'), name = withDate.length === 1 ? 'enyaq-' + withDate[0].title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) : 'enyaq-erinnerungen';
  a.href = URL.createObjectURL(new Blob([buildIcs(withDate)], { type: 'text/calendar;charset=utf-8' })); a.download = (name || 'enyaq-erinnerung') + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('rem-ics-all').addEventListener('click', () => downloadIcs(sortedOpenReminders().filter(x => !isRun(x.r)).map(x => x.r)));

/** Cloud-Abgleich der Erinnerungen (wie bei den Kosten): beim ersten Abgleich werden lokale, in der Cloud fehlende Einträge hochgeladen und behalten. */
window.onCloudReminders = (cloud, isFirst, uid) => {
  if (isFirst) checkCacheUid(uid);
  if (isFirst) {
    const missing = unsyncedLocal(getReminders(), cloud, uid);
    if (missing.length) { window.cloud.pushReminders([], missing).catch(e => window.onCloudStatus({ error: 'Erinnerungen-Upload fehlgeschlagen: ' + (e.code || e.message) })); cloud = cloud.concat(missing); }
  }
  save(KEY_REMINDERS, cloud.sort((a, b) => Number(a.id) - Number(b.id)));
  refreshViews(); touchSync();
};


/** Erinnerungen aus einer Export-Datei (optional, ältere Dateien haben sie nicht). Wirft bei ungültigen Einträgen. */
function parseImportReminders(text) {
  const data = JSON.parse(text); if (!Array.isArray(data.reminders)) return [];
  const seen = new Set(), okYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseYMD(s));
  return data.reminders.map((r, i) => {
    const bad = () => new Error('Erinnerung ' + (i + 1) + ' ist ungültig.');
    if (!r || typeof r.title !== 'string' || !r.title.trim()) throw bad();
    if ((r.dueDate != null && !okYMD(r.dueDate)) || (r.startDate != null && !okYMD(r.startDate))) throw bad();
    const num = (v, max) => v == null ? undefined : (typeof v === 'number' && isFinite(v) && v > 0 && v <= max ? v : (() => { throw bad(); })());
    let id = Number(r.id); if (!Number.isFinite(id) || seen.has(id)) id = Date.now() + i; seen.add(id);
    const o = { id, title: r.title.trim().slice(0, 80), startDate: r.startDate || r.dueDate || todayYMD(), dueDate: r.dueDate ?? undefined, dueKm: num(r.dueKm, 999999), startKm: typeof r.startKm === 'number' && r.startKm >= 0 && r.startKm <= 999999 ? r.startKm : undefined,
      repeatMonths: num(r.repeatMonths, 240), repeatDays: num(r.repeatDays, 3650), repeatUnit: r.repeatUnit === 'w' || r.repeatUnit === 'd' ? r.repeatUnit : undefined, repeatKm: num(r.repeatKm, 999999) };
    if (!o.dueDate && o.dueKm == null) throw bad();
    if (typeof r.category === 'string' && r.category.trim()) o.category = r.category.trim().slice(0, 30);
    if (typeof r.note === 'string' && r.note.trim()) o.note = r.note.trim().slice(0, 300);
    for (const k of ['doneAt', 'lastDoneAt']) if (r[k] != null) { if (isNaN(Date.parse(r[k]))) throw bad(); o[k] = new Date(r[k]).toISOString(); }
    if (typeof r.lastDoneKm === 'number' && r.lastDoneKm > 0 && r.lastDoneKm <= 999999) o.lastDoneKm = r.lastDoneKm;
    if (typeof r.guid === 'string' && r.guid) o.guid = r.guid.slice(0, 64);
    if (Array.isArray(r.log)) {
      const l = r.log.filter(e => e && typeof e.at === 'string' && !isNaN(Date.parse(e.at))).slice(-REM_LOG_MAX).map(e => {
        const x = { at: new Date(e.at).toISOString() };
        if (typeof e.km === 'number' && e.km > 0 && e.km <= 999999) x.km = e.km;
        if (typeof e.cost === 'number' && e.cost > 0 && e.cost <= 1e6) x.cost = e.cost;
        return x; });
      if (l.length) o.log = l;
    }
    return cleanRem(o);
  });
}


/* =====================================================================
   Wiederkehrende Kosten (Versicherung, Steuer, Abo …)
   Vorlage: { id, title, amount (negativ = Einnahme), category?, note?, intervalMonths (1|3|6|12), startDate (ISO der ersten Buchung), nextIdx (nächste Buchung, 0-basiert) }
   Buchungen entstehen beim Öffnen der App automatisch bis heute. Ihre ID ist fest (Vorlagen-ID × 1000 + Nummer): Öffnen zwei Geräte gleichzeitig,
   überschreiben sie denselben Eintrag, statt doppelt zu buchen. Ein gelöschter Eintrag wird nicht neu gebucht, weil nextIdx nur vorwärts läuft.
   ===================================================================== */
const getRecurring = () => { const l = load(KEY_RECUR, []); return Array.isArray(l) ? l : []; };
function commitRecurring(next) {
  const prev = getRecurring();
  if (!save(KEY_RECUR, next)) return false;
  if (!window.cloud?.isSignedIn()) return Promise.resolve('local');
  return window.cloud.pushRecurring(prev, next).then(() => 'cloud').catch(e => {
    console.error('Firestore-Schreibfehler (wiederkehrende Kosten)', e);
    window.onCloudStatus?.({ error: e.code || e.message });
    return 'error:' + (e.code || e.message);
  });
}
const RECUR_LABEL = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
function recurDate(t, n) {
  const s = new Date(t.startDate); if (n === 0) return s;
  const d = addMonths(s, t.intervalMonths * n); d.setHours(s.getHours(), s.getMinutes(), 0, 0); return d;
}
function recurDueCount(t) { let n = t.nextIdx || 0, c = 0; const now = new Date(); while (n < 1000 && recurDate(t, n) <= now) { n++; c++; } return c; }
/** Bucht fällige Wiederholungen nach. Liefert die Zahl neuer Kosten. */
function bookRecurring() {
  const tpls = getRecurring(); if (!tpls.length) return 0;
  const now = new Date(), ids = new Set(getCosts().map(c => String(c.id))), add = []; let changed = false;
  const next = tpls.map(t => {
    let n = t.nextIdx || 0;
    while (n < 1000 && recurDate(t, n) <= now) {
      const id = Number(t.id) * 1000 + n;
      if (!ids.has(String(id))) { add.push(cleanRem({ id, date: recurDate(t, n).toISOString(), title: t.title, amount: t.amount, category: t.category || '', note: t.note, recurId: t.id })); ids.add(String(id)); }
      n++;
    }
    if (n === (t.nextIdx || 0)) return t;
    changed = true; return { ...t, nextIdx: n };
  });
  if (add.length) commitCosts(getCosts().concat(add).sort((a, b) => new Date(a.date) - new Date(b.date)));
  if (changed) commitRecurring(next);
  if (changed || add.length) { if (!$('view-costs').classList.contains('hidden')) renderRecurring(); }
  return add.length;
}
function renderRecurring() {
  const l = getRecurring();
  $('recur-card').classList.toggle('hidden', !l.length);
  $('recur-list').innerHTML = l.map(t => `<li data-id="${esc(t.id)}" class="flex items-center justify-between gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 px-3 py-2">
    <div class="min-w-0"><p class="text-sm font-medium truncate">${esc(t.title)} · ${t.amount < 0 ? '+' : ''}${esc(eur(Math.abs(t.amount)))}</p>
    <p class="text-xs text-slate-500 dark:text-slate-400">${RECUR_LABEL[t.intervalMonths] || 'alle ' + t.intervalMonths + ' Monate'} · nächste Buchung ${fmtDate(recurDate(t, t.nextIdx || 0).toISOString())}</p></div>
    <button type="button" data-end="${esc(t.id)}" class="shrink-0 px-3 py-1.5 rounded-xl border border-red-500 text-red-600 dark:text-red-400 text-xs font-medium active:scale-95 transition">Beenden</button></li>`).join('');
}
$('recur-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-end]'); if (!b) return;
  const t = getRecurring().find(x => String(x.id) === b.dataset.end); if (!t) return;
  if (!(await ask('Bereits gebuchte Kosten bleiben erhalten.', { title: '„' + t.title + '“ nicht mehr automatisch buchen?', ok: 'Beenden', danger: true }))) return;
  commitRecurring(getRecurring().filter(x => String(x.id) !== String(t.id))); renderRecurring();
});
$('cost-recur').addEventListener('change', () => $('cost-recur-opts').classList.toggle('hidden', !$('cost-recur').checked));
document.addEventListener('visibilitychange', () => { if (!document.hidden) bookRecurring(); });
window.onCloudRecurring = (cloud, isFirst, uid) => {
  if (isFirst) checkCacheUid(uid);
  if (isFirst) {
    const missing = unsyncedLocal(getRecurring(), cloud, uid);
    if (missing.length) { window.cloud.pushRecurring([], missing).catch(e => window.onCloudStatus({ error: 'Upload fehlgeschlagen: ' + (e.code || e.message) })); cloud = cloud.concat(missing); }
  }
  save(KEY_RECUR, cloud.sort((a, b) => Number(a.id) - Number(b.id)));
  if (!editMode) bookRecurring();
  refreshViews(); touchSync();
};
function parseImportRecurring(text) {
  const data = JSON.parse(text); if (!Array.isArray(data.recurring)) return [];
  return data.recurring.map((t, i) => {
    const bad = () => new Error('Wiederkehrende Kosten ' + (i + 1) + ' sind ungültig.');
    if (!t || isNaN(new Date(t.startDate)) || typeof t.amount !== 'number' || !isFinite(t.amount) || t.amount === 0 || !RECUR_LABEL[t.intervalMonths] || !Number.isFinite(Number(t.id))) throw bad();
    const o = { id: Number(t.id), title: String(t.title ?? '').trim().slice(0, 80) || 'Kosten', amount: Math.round(t.amount * 100) / 100, intervalMonths: t.intervalMonths, startDate: new Date(t.startDate).toISOString(),
      nextIdx: Number.isInteger(t.nextIdx) && t.nextIdx >= 0 && t.nextIdx <= 1000 ? t.nextIdx : 0 };
    if (typeof t.category === 'string' && t.category.trim()) o.category = t.category.trim().slice(0, 30);
    if (typeof t.note === 'string' && t.note.trim()) o.note = t.note.trim().slice(0, 300);
    return o;
  });
}


