/* =====================================================================
   Einstellungen als Bereiche mit Seitenleiste (Burger-Menü). Die vorhandenen Karten werden anhand ihrer Überschrift einem Bereich zugeordnet;
   sichtbar ist immer nur ein Bereich. Beim Öffnen der Einstellungen erscheint die Seitenleiste zur Auswahl.
   ===================================================================== */
const SET_SECS = [
  { k: 'fahrzeug', e: '🚗', t: 'Fahrzeug & Kauf', h: ['Allgemein', 'Kauf'], save: true },
  { k: 'laden', e: '⚡', t: 'Laden & Akku', h: ['Fahrzeug und Laden'], save: true },
  { k: 'erinnerungen', e: '🔔', t: 'Erinnerungen', h: ['Erinnerungen'], save: true },
  { k: 'fahrten', e: '🧭', t: 'Fahrtenbuch', h: ['Fahrtenbuch'] },
  { k: 'listen', e: '🏷️', t: 'Anbieter & Kategorien', h: ['Listen'] },
  { k: 'wetter', e: '⛅', t: 'Wetter', h: ['Wetter', 'Eis-Warnung'] },
  { k: 'daten', e: '☁️', t: 'Sicherung & Belege', h: ['Belege', 'Datensicherung'] },
  { k: 'sprache', e: '🎙️', t: 'Sprachsteuerung', h: ['So funktioniert’s', 'Akku-Temperatur', 'Langzeitverbrauch'] },
  { k: 'konto', e: '👤', t: 'Konto & Cloud', h: ['Cloud-Sync'], hidden: true },
  { k: 'gefahr', e: '⚠️', t: 'Alle Daten löschen', h: ['Gefahrenzone'], hidden: true }
];
const SET_ICON = {sprache: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>', fahrzeug: '<path d="M5 17h14M6 17v2M18 17v2M4 13l2-5h12l2 5v4H4z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>', laden: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8Z"/>', erinnerungen: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21a2 2 0 0 0 4 0"/>', fahrten: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>', listen: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', wetter: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>', daten: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5"/>', konto: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>', gefahr: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'};
const KEY_SETSEC = 'enyaq.setSec';
let setSec = (() => { try { return localStorage.getItem(KEY_SETSEC) || 'fahrzeug'; } catch (e) { return 'fahrzeug'; } })();
(function tagSettingsCards() {
  [...$('view-settings').children].forEach(el => {
    if (el.id === 'set-head' || el.id === 'set-sub') return;
    if (el.querySelector('#btn-save-settings')) { el.dataset.secs = SET_SECS.filter(x => x.save).map(x => x.k).join(' '); return; }
    const h = (el.querySelector('h2')?.textContent || '').trim(), sec = SET_SECS.find(x => x.h.includes(h));
    el.dataset.secs = sec ? sec.k : 'fahrzeug';
  });
  $('sd-list').innerHTML = SET_SECS.filter(x => !x.hidden).map(x => `<button type="button" data-sec="${x.k}" class="sd-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800"><svg class="h-[22px] w-[22px] shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${SET_ICON[x.k] || ''}</svg><span class="min-w-0 truncate">${esc(x.t)}</span></button>`).join('');
})();
function setSettingsSec(k) {
  const sec = SET_SECS.find(x => x.k === k) || SET_SECS[0]; setSec = sec.k; try { localStorage.setItem(KEY_SETSEC, sec.k); } catch (e) { }
  [...$('view-settings').children].forEach(el => { if (el.dataset.secs) el.classList.toggle('hidden', !el.dataset.secs.split(' ').includes(sec.k)); });
  $('set-h').textContent = sec.t;
  /* Nur eine Karte im Bereich: deren Kopfzeile (Symbol + Titel) doppelt die Seitenüberschrift → ausblenden, ihr Erklärsatz wird Untertitel */
  const cards = [...$('view-settings').children].filter(el => el.dataset.secs && !el.classList.contains('hidden') && !el.querySelector('#btn-save-settings'));
  cards.forEach(c => { const hd = c.querySelector(':scope > .border-b-2'); if (hd) hd.classList.remove('hidden'); });
  let sub = '';
  if (cards.length === 1) { const hd = cards[0].querySelector(':scope > .border-b-2'); if (hd) { hd.classList.add('hidden'); sub = (hd.querySelector('p')?.textContent || '').trim(); } }
  $('set-sub').textContent = sub; $('set-sub').classList.toggle('hidden', !sub);
  document.querySelectorAll('#set-drawer [data-sec]').forEach(b => { if (!b.classList.contains('sd-item')) return; const on = b.dataset.sec === sec.k; b.classList.toggle('bg-emerald-600/15', on); b.classList.toggle('text-emerald-700', on); b.classList.toggle('dark:text-emerald-300', on); b.classList.toggle('font-semibold', on); });
  window.scrollTo(0, 0);
}
function renderDrawerUser() {
  const u = window.cloud?.userInfo?.(), av = $('sd-avatar');
  $('sd-name').textContent = u ? (u.name || u.email || 'Angemeldet') : 'Nicht angemeldet';
  $('sd-sub').textContent = u ? 'Cloud ✓' + (typeof apiEnabled === 'function' && apiEnabled() ? ' · Škoda-API verbunden' : '') : 'Konto & Cloud – antippen zum Anmelden';
  const ini = u ? (u.name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') : '?';
  av.innerHTML = u && u.photo ? '<img src="' + esc(u.photo) + '" alt="" referrerpolicy="no-referrer" class="h-full w-full object-cover">' : esc(ini);
}
function openSetDrawer() {
  renderDrawerUser();
  const d = $('set-drawer'); d.classList.remove('pointer-events-none'); d.setAttribute('aria-hidden', 'false'); $('set-burger').setAttribute('aria-expanded', 'true');
  $('set-drawer-bg').classList.replace('opacity-0', 'opacity-100'); $('set-drawer-panel').classList.replace('-translate-x-full', 'translate-x-0');
}
function closeSetDrawer() {
  const d = $('set-drawer'); d.classList.add('pointer-events-none'); d.setAttribute('aria-hidden', 'true'); $('set-burger').setAttribute('aria-expanded', 'false');
  $('set-drawer-bg').classList.replace('opacity-100', 'opacity-0'); $('set-drawer-panel').classList.replace('translate-x-0', '-translate-x-full');
}
$('set-burger').addEventListener('click', openSetDrawer);
$('set-drawer-bg').addEventListener('click', closeSetDrawer);
$('set-drawer').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sec],[data-go]'); if (!b) return;
  closeSetDrawer();
  if (b.dataset.sec) { openSettings(b.dataset.sec); return; }
  const g = b.dataset.go;
  showView(g);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('set-drawer').getAttribute('aria-hidden') === 'false') closeSetDrawer(); });
/* Wischen: vom linken Rand nach rechts öffnet, nach links schließt */
(() => { let sx = 0, sy = 0, on = false;
  document.addEventListener('touchstart', (e) => { const t = e.touches[0], open = $('set-drawer').getAttribute('aria-hidden') === 'false'; on = currentView === 'settings' && (open || t.clientX < 40); sx = t.clientX; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (!on) return; on = false; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; const open = $('set-drawer').getAttribute('aria-hidden') === 'false'; if (dx > 0 && !open) openSetDrawer(); else if (dx < 0 && open) closeSetDrawer(); }, { passive: true });
})();

/* ---- Schnellmenü auf Start („☰“ links neben dem Titel oder vom linken Rand nach rechts wischen): alle wichtigen Seiten und Reiter mit einem Tipp ---- */
function navOpen() { return $('nav-drawer').getAttribute('aria-hidden') === 'false'; }
/** Konto-Zeile unten im Schnellmenü (am PC dauerhaft sichtbar) – wird auch bei jeder Änderung der Anmeldung neu gezeichnet */
function renderNavUser() {
  try { const u = window.cloud?.userInfo?.(), av = $('nav-avatar'); $('nav-name').textContent = u ? (u.name || u.email || 'Angemeldet') : 'Nicht angemeldet';
    $('nav-sub').textContent = u ? 'Cloud ✓' + (typeof apiEnabled === 'function' && apiEnabled() ? ' · Škoda-API verbunden' : '') : 'Konto & Cloud – antippen zum Anmelden';
    const ini = u ? (u.name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') : '?';
    av.innerHTML = u && u.photo ? '<img src="' + esc(u.photo) + '" alt="" referrerpolicy="no-referrer" class="h-full w-full object-cover">' : esc(ini); } catch (e) { }
}
function openNavDrawer() {
  renderNavUser();
  const n = Number(($('bell-badge')?.textContent || '').replace(/\D/g, '')) || 0, rb = $('nav-rem-n'); rb.textContent = n; rb.classList.toggle('hidden', !(n > 0 && !$('bell-badge').classList.contains('hidden')));
  let due = false; try { const lim = new Date(); lim.setMonth(lim.getMonth() + 2); due = chDue().some(x => x.d <= lim); } catch (e) { } $('nav-ch-dot').classList.toggle('hidden', !due);   // HU/Service in den nächsten 2 Monaten oder überfällig
  const d = $('nav-drawer'); d.classList.remove('pointer-events-none'); d.setAttribute('aria-hidden', 'false'); $('btn-nav').setAttribute('aria-expanded', 'true');
  $('nav-drawer-bg').classList.replace('opacity-0', 'opacity-100'); $('nav-drawer-panel').classList.replace('-translate-x-full', 'translate-x-0');
}
function closeNavDrawer() {
  if (isDesk()) { $('nav-q').value = ''; navSearch(); return; }        // PC: Menü bleibt offen
  $('nav-q').value = ''; navSearch(); try { $('nav-q').blur(); } catch (e) { }
  const d = $('nav-drawer'); d.classList.add('pointer-events-none'); d.setAttribute('aria-hidden', 'true'); $('btn-nav').setAttribute('aria-expanded', 'false');
  $('nav-drawer-bg').classList.replace('opacity-100', 'opacity-0'); $('nav-drawer-panel').classList.replace('translate-x-0', '-translate-x-full');
}
const navStart = (id) => { if (currentView !== 'dashboard') showView('dashboard'); setTimeout(() => { const el = $(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 320); };
const NAV_GO = {
  sprache: () => openSettings('sprache'),
  home: () => showView('dashboard'),
  'cap-home': () => { setCapPlace('home'); showView('capture'); setCapPlace('home'); }, 'cap-bosch': () => { setCapPlace('bosch'); showView('capture'); setCapPlace('bosch'); },
  'cap-away': () => { setCapPlace('away'); showView('capture'); setCapPlace('away'); }, costs: () => showView('costs'),
  eff: () => navStart('sec-eff'), trends: () => navStart('sec-trends'), recs: () => { if (recRoute === 'bt') recRoute = 'all'; showView('recs'); }, akkutemp: () => { recRoute = 'bt'; showView('recs'); },
  curve: () => { repMode = 'akku'; setBtTab('kurve', false); showView('report'); },
  rep: () => { repMode = 'laden'; showView('report'); }, akku: () => { repMode = 'akku'; showView('report'); }, stat: () => { repMode = 'stat'; setDpTab('stat', false); showView('report'); },
  trips: () => { histFilter = 'fahrten'; tripDays = 21; showView('history'); }, hist: () => { histFilter = 'all'; showView('history'); },
  badges: () => showView('badges'), wrap: () => $('btn-wrap-preview').click(),
  tax: () => { repMode = 'fahrten'; showView('report'); setTimeout(() => { const t = $('tax-card'); if (t && !t.classList.contains('hidden')) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250); },
  akte: () => { repMode = 'stat'; setDpTab('akte', false); showView('report'); }, checkheft: () => { repMode = 'stat'; setDpTab('checkheft', false); showView('report'); }, ausst: () => { repMode = 'stat'; setDpTab('ausst', false); showView('report'); },
  reminders: () => showView('reminders'), kb: () => showView('kb'), providers: () => showView('providers'), tires: () => showView('tires'), wish: () => { wishTab = 'open'; showView('wish'); },
  route: () => showView('route'), backup: () => openSettings('daten'), car: () => openSettings('fahrzeug'), settings: () => showView('settings'), account: () => openSettings('konto'),
  'rep-kosten': () => { repMode = 'kosten'; showView('report'); }, 'rep-fahrten': () => { repMode = 'fahrten'; showView('report'); },
  'hist-kosten': () => { histFilter = 'kosten'; showView('history'); }, 'hist-laden': () => { histFilter = 'laden'; showView('history'); },
  'akte-pdf': () => { NAV_GO.akte(); setTimeout(() => $('btn-akte').click(), 300); }, 'ch-pdf': () => { NAV_GO.checkheft(); setTimeout(() => { const b = $('btn-ch-pdf'); if (b && !b.classList.contains('hidden')) b.scrollIntoView({ block: 'center' }); }, 300); },
  'bak-now': () => { openSettings('daten'); setTimeout(() => $('bak-now').scrollIntoView({ block: 'center' }), 200); },
  'set-laden': () => openSettings('laden'), 'set-rem': () => openSettings('erinnerungen'), 'set-fahrten': () => openSettings('fahrten'), 'set-listen': () => openSettings('listen'), 'set-wetter': () => openSettings('wetter'), 'set-gefahr': () => openSettings('gefahr')
};
/* Suche im Schnellmenü: Titel, Ort in der App und Stichwörter; alle Suchwörter müssen vorkommen (Groß/klein und Umlaute egal) */
const NAV_IDX = [
  ['cap-home', 'Laden Zuhause erfassen', 'Laden', 'wallbox zähler foto heim'], ['cap-bosch', 'Laden Bosch erfassen', 'Laden', 'arbeit werk lichtblick'], ['cap-away', 'Laden unterwegs erfassen', 'Laden', 'schnelllader dc ladesäule'],
  ['route', 'Routenplaner', 'Fahrzeug › Strecken-Prognose', 'route strecke hin und zurück rundfahrt verbrauch prognose abrp höhenprofil wind wetter reichweite ankunft akku planen'], ['costs', 'Kosten erfassen', 'Kosten', 'ausgabe beleg rechnung versicherung'], ['rep', 'Bericht Laden', 'Berichte › Laden', 'monat kwh'], ['rep-kosten', 'Bericht Kosten', 'Berichte › Kosten', 'tco ausgaben'],
  ['eff', 'Verbräuche & Effizienz', 'Start', 'verbrauch kwh/100 km ladekosten pro km strompreis'], ['trends', 'Trends', 'Start', 'laufleistung stromkosten gesamtkosten monate'], ['recs', 'Rekorde', 'Rekorde', 'verbrauch bestwert strecke tempomat messreihe reichweite langzeitverbrauch seit kauf bordcomputer akku temperatur °c notieren'],
  ['akkutemp', 'Akku-Temperatur notieren', 'Rekorde › Akku °C', 'akku temperatur °c grad notieren batterie'], ['curve', 'DC-Ladekurve', 'Berichte › Akku', 'schnellladen ladeleistung kw ladezeit rechner sommer winter'],
  ['akku', 'Akku', 'Berichte › Akku', 'kapazität pflege temperatur soh netto rebalancing'], ['stat', 'Statistik', 'Berichte › Daten', 'fahrzeugdaten verbrauch laufleistung'], ['badges', 'Abzeichen', 'Abzeichen', 'badges erfolge'],
  ['akte', 'Fahrzeugakte', 'Berichte › Daten', 'verkauf historie'], ['sprache', 'Sprachsteuerung', 'Einstellungen', 'gemini sprachbefehle google tasks akku langzeit android auto'], ['ausst', 'Ausstattung', 'Berichte › Daten', 'sonderausstattung datenblatt care connect pr-code farbe felgen'], ['akte-pdf', 'Fahrzeugakte als PDF', 'Aktion', 'drucken export'], ['checkheft', 'Checkheft', 'Berichte › Daten', 'service reparatur tüv hu werkstatt'],
  ['ch-pdf', 'Checkheft als PDF', 'Aktion', 'belege mappe drucken'], ['rep-fahrten', 'Fahrten-Bericht', 'Berichte › Fahrten', 'fahrtenbuch arbeitsweg'], ['tax', 'Steuer · Arbeitsweg', 'Berichte › Fahrten', 'pendlerpauschale entfernungspauschale werbungskosten'],
  ['hist', 'Historie', 'Historie', 'verlauf bearbeiten datenprüfung'], ['hist-laden', 'Ladungen', 'Historie › Laden', 'verlauf'], ['hist-kosten', 'Kosten-Verlauf', 'Historie › Kosten', 'etiketten kategorien filter'], ['trips', 'Fahrten', 'Historie › Fahrten', 'fahrtenbuch'],
  ['wrap', 'Rückblick', 'Start', 'jahr wrapped'], ['reminders', 'Erinnerungen', 'Erinnerungen', 'wartung termine fällig'], ['kb', 'Wissen', 'Wissen', 'notizen links tipps'], ['wish', 'Wunschliste', 'Wunschliste', 'zubehör kaufen wunsch matten kofferraum links shop'], ['tires', 'Reifen', 'Reifen', 'profiltiefe profil reifenprofil mm sommer winter allwetter messen'], ['providers', 'Ladekarten', 'Ladeanbieter', 'anbieter tarife preise'],
  ['bak-now', 'Jetzt in Google Drive sichern', 'Einstellungen › Sicherung & Belege', 'backup drive'], ['backup', 'Sicherung & Belege', 'Einstellungen', 'export import drive'],
  ['car', 'Fahrzeug & Kauf', 'Einstellungen', 'kennzeichen fin kaufpreis kauftag'], ['set-laden', 'Laden & Akku', 'Einstellungen', 'strompreis kapazität wltp referenz temperatur'], ['set-rem', 'Nächste HU / Service', 'Einstellungen › Erinnerungen', 'vorwarnung fälligkeit tüv'],
  ['set-wetter', 'Eis-Warnung (Scheibe vereist)', 'Einstellungen › Wetter', 'eis frost scheibe vereist kratzen raureif vorklimatisieren abfahrt stellplatz carport garage benachrichtigung push nachricht'], ['set-fahrten', 'Fahrtenbuch-Einstellungen', 'Einstellungen', 'orte etiketten regeln import benziner vergleich sprit spritpreis ersparnis gespart co2 co₂ ökostrom strommix klima'], ['set-listen', 'Anbieter & Kategorien', 'Einstellungen', 'etiketten liste'], ['set-wetter', 'Wetter', 'Einstellungen', 'standort frost'],
  ['account', 'Konto & Cloud', 'Einstellungen', 'anmelden google škoda api'], ['set-gefahr', 'Alle Daten löschen', 'Einstellungen', 'zurücksetzen reset']];
const navNorm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function navSearch() {
  const q = navNorm($('nav-q').value.trim()), words = q.split(/\s+/).filter(Boolean), res = $('nav-results');
  $('nav-tiles').classList.toggle('hidden', !!words.length); res.classList.toggle('hidden', !words.length); if (!words.length) { res.innerHTML = ''; return; }
  const hits = NAV_IDX.filter(x => { const h = navNorm(x[1] + ' ' + x[2] + ' ' + x[3]); return words.every(w => h.includes(w)); });
  res.innerHTML = hits.length ? hits.map(x => '<button type="button" data-nav="' + x[0] + '" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800"><span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-semibold">' + esc(x[1]) + '</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">' + esc(x[2]) + '</span></span><svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>').join('')
    : '<p class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-left">Nichts gefunden.</p>';
}
$('nav-q').addEventListener('input', navSearch);
$('nav-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('nav-results').querySelector('[data-nav]'); if (b) b.click(); } });
$('btn-nav').addEventListener('click', openNavDrawer);
$('nav-drawer-bg').addEventListener('click', closeNavDrawer);
$('nav-drawer').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (!b) return; closeNavDrawer(); const f = NAV_GO[b.dataset.nav]; if (f) f(); });
/* PC (≥ 1280 px): Erinnerungen-Seite fest in die rechte Spalte, Schnellmenü dauerhaft offen; zurück, sobald das Fenster schmaler wird */
const NAV_VIEW = { home: 'dashboard', 'cap-home': 'capture', 'cap-bosch': 'capture', 'cap-away': 'capture', costs: 'costs', rep: 'report', hist: 'history', badges: 'badges', recs: 'recs', akkutemp: 'recs', kb: 'kb', providers: 'providers', tires: 'tires', wish: 'wish', route: 'route', settings: 'settings' };
function deskNavMark(name) { $('nav-home').classList.toggle('nav-on', name === 'dashboard'); document.querySelectorAll('#nav-tiles [data-nav]').forEach(b => b.classList.toggle('nav-on', NAV_VIEW[b.dataset.nav] === name && name !== 'capture')); }
function applyDesk() {
  const vr = $('view-reminders'), aside = $('desk-rem');
  if (isDesk()) {
    if (vr.parentElement !== aside) aside.appendChild(vr);
    vr.classList.remove('hidden'); try { renderReminders(); } catch (e) { }
    try { renderWxo(); } catch (e) { }
    try { renderVehCard(); } catch (e) { }
    if (currentView === 'reminders') showView('dashboard');
    try { openNavDrawer(); } catch (e) { }
  } else if (vr.parentElement === aside) {
    $('view-history').before(vr); vr.classList.toggle('hidden', currentView !== 'reminders');
    try { closeNavDrawer(); } catch (e) { }
    try { renderWxo(); } catch (e) { }
    try { renderVehCard(); } catch (e) { }
  }
}
try { matchMedia('(min-width: 1280px)').addEventListener('change', applyDesk); } catch (e) { }
applyDesk();
try { renderVehCard(); } catch (e) { }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && navOpen()) closeNavDrawer(); });
(() => { let sx = 0, sy = 0, on = false;     // Start: vom linken Rand nach rechts wischen öffnet, nach links schließt
  document.addEventListener('touchstart', (e) => { const t = e.touches[0], open = navOpen(); on = e.touches.length === 1 && !lbOpen && (open || (currentView === 'dashboard' && t.clientX < 40)); sx = t.clientX; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (!on) return; on = false; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return; const open = navOpen(); if (dx > 0 && !open) openNavDrawer(); else if (dx < 0 && open) closeNavDrawer(); }, { passive: true });
})();
setSettingsSec(setSec);
/** Einstellungen direkt in einem Bereich öffnen (ohne Seitenleiste). */
function openSettings(sec) { window.setNoDrawer = true; if (currentView !== 'settings') showView('settings'); else window.setNoDrawer = false; setSettingsSec(sec); }
segSwipe($('view-report'), $('rep-mode'), '#rep-place,#dp-panes,#dp-seg,#bat-panes,#bat-seg');   // Berichte: Laden | Kosten | Akku | Datenpool | Fahrten (ganze Seite; im Datenpool wischen die Unter-Tabs)
/* ---- Berichte → Akku: Unter-Tabs Pflege | Mehrkonsum | Alterung | Kurve ---- */
const BT_TABS = ['pflege', 'mehr', 'alter', 'kurve'];
let btTab = (() => { try { const t = localStorage.getItem('enyaq.batTab'); return BT_TABS.includes(t) ? t : 'pflege'; } catch (e) { return 'pflege'; } })();
function setBtTab(t, anim = true) {
  if (!BT_TABS.includes(t)) t = 'pflege';
  const dir = BT_TABS.indexOf(t) - BT_TABS.indexOf(btTab); btTab = t; try { localStorage.setItem('enyaq.batTab', t); } catch (e) { }
  segPaintKey('.bt-btn', 'bt', t);
  BT_TABS.forEach(k => { const el = $('bt-' + k), on = k === t; el.classList.toggle('hidden', !on); el.classList.remove('dp-inL', 'dp-inR'); if (on && anim && dir) { void el.offsetWidth; el.classList.add(dir > 0 ? 'dp-inL' : 'dp-inR'); } });
  if (t === 'alter') { try { const ch = Chart.getChart($('bat-chart')); if (ch) ch.resize(); } catch (e) { } }
}
document.querySelectorAll('.bt-btn').forEach(b => b.addEventListener('click', () => setBtTab(b.dataset.bt)));
setBtTab(btTab, false);
segSwipe($('bat-panes'), $('bat-seg'));
segSwipe($('bat-seg'), $('bat-seg'));

/* ---- Daten → Ausstattung: Datenblatt aus der Bestellung (Anlage N1-10), Sonderausstattung nach Kategorien, Care-Connect-Ablauf ---- */
const AUSST = {
  model: 'Škoda Enyaq 50 iV Loft', extras: 'Climatronic · Kessy · SHZ · PDC · ACC',
  tiles: [['Modell', 'Enyaq 50 iV Loft', 'Design Selection Loft'], ['Farbe', 'Graphite-Grau', 'Metallic'], ['Räder', '19" Regulus Aero', '235/55 R19 rundum'], ['Innen', 'Stoff/Kunstleder', 'Dunkelgrau (Loft)']],
  pdf: [['Modell', 'Škoda Enyaq 50 iV Loft (Climatronic, Kessy, SHZ, PDC, ACC)'], ['Lackierung', 'Graphite-Grau Metallic'], ['Innenausstattung', 'Stoff/Kunstleder-Kombination in Dunkelgrau (Loft)'], ['Räder', '19" Leichtmetallfelgen Regulus Aero Anthrazit-glanzgedreht, Reifen 235/55 R19']],
  tech: [
    ['Antrieb', '⚡', [['Leistung', '109 kW (148 PS)'], ['Drehmoment (Hinterachse, Peak)', '220 Nm'], ['Antrieb', 'Heckantrieb, 1-Gang (EV)'], ['Motor', 'Hinterachse APP310'], ['Motorart', '1 × Wechselstrom-Elektromaschine'], ['Motorbauart', '1 × permanentmagneterregte Synchronmaschine']]],
    ['Fahrleistung & Akku', '🔋', [['Beschleunigung 0–100 km/h', '11,3 s'], ['Zellchemie', 'NMC']]],
    ['Karosserie & Gewicht', '📐', [['cw-Wert', '0,272'], ['Leergewicht mit Fahrer', '1.941 kg']]],
    ['Preis', '🏷️', [['Listenpreis', '46.000 €']]],
  ],
  techSum: '109 kW · 220 Nm · 0–100 in 11,3 s',
  groups: [
    ['Räder & Reifen', '🛞', [['C6H', '19" Leichtmetallfelge Regulus Aero Anthrazit-glanzgedreht'], ['J27', 'Reifen 235/55 R19']]],
    ['Laden', '🔌', [['PUA', 'Mobile Ladestation „iV Universal Charger“ mit austauschbaren Anschlussadaptern']]],
    ['Komfort & Sitze', '💺', [['Q2J', 'Komfortsitze vorn'], ['N2U', 'Sitzbezüge in Stoff/Kunstleder'], ['3L3', 'Höheneinstellbare Vordersitze'], ['7P4', 'Manuell einstellbare Lendenwirbelstütze in den Vordersitzen'], ['3NU', 'Rücksitzbank ungeteilt, Lehne geteilt umlegbar mit Mittelarmlehne'], ['', 'Sitzheizung'], ['', 'Standheizung'], ['', 'Klimaanlage'], ['', 'Mittelarmlehne'], ['', 'Fensterheber elektrisch'], ['', 'Teillederausstattung']]],
    ['Licht & Sicht', '💡', [['QQ8', 'Ambientebeleuchtung'], ['8N6', 'Regensensor und Fahrlichtassistent (Easy Light Assist)'], ['9C3', 'Tagesfahrlichtschaltung und Coming/Leaving Home'], ['6T2', 'Fußraumbeleuchtung im Innenraum'], ['9E3', 'Gepäckraumbeleuchtung'], ['1J2', 'Projektionsleuchte (Spiegel)'], ['6XW', 'Außenspiegel elektrisch einstell-, anklapp- und beheizbar, automatisch abblendend (Fahrerseite)'], ['5JB', 'Außenspiegel Fahrer- und Beifahrerseite konvex'], ['4L6', 'Automatisch abblendbarer Innenspiegel'], ['4GS', 'Frontscheibe in Wärmeschutzglas'], ['', 'Abgedunkelte Scheiben']]],
    ['Assistenz & Sicherheit', '🛡️', [['KA2', 'Rückfahrkamera'], ['7X2', 'Parksensoren vorn und hinten'], ['', 'Geschwindigkeitsregelanlage'], ['9TE', 'Zusätzliche Rückstrahler (Türbereich)'], ['', 'Fahrerairbag'], ['', 'ESP (Elektronisches Stabilitätsprogramm)'], ['', 'ASR (Antriebsschlupfregelung)'], ['', 'ABS (Antiblockiersystem)'], ['', 'Elektronische Wegfahrsperre'], ['', 'Servolenkung'], ['', 'Start/Stopp-Automatik']]],
    ['Multimedia & Connect', '📡', [['8AV', 'Infotainmentdisplay 13"'], ['7UT', 'Navigationssystem'], ['8RM', '8 Lautsprecher'], ['YON', 'Care Connect inkl. iV Remote Services Basic und Infotainment Online (3 Jahre)'], ['', 'Bordcomputer']]],
    ['Innenraum & Praktisch', '🧰', [['WAN', 'Clever'], ['3S2', 'Dachreling in Schwarz'], ['3N3', 'Ablagekästen im Kofferraum'], ['0TE', 'Fußmatten'], ['QJ1', 'Chromapplikationen im Interieur'], ['5MB', 'Dekorleisten „Alu brushed“']]],
    ['Pakete', '📦', [['A8C', 'Design Selection Loft'], ['WQL', 'Ausstattungspaket für Enyaq iV 50 (Wiederanlauf)'], ['YPA', 'Steuerung Pakete']]],
  ],
};
const AU_TOTAL = AUSST.groups.reduce((a, g) => a + g[2].length, 0), CC_TITLE = 'Care Connect verlängern';
let auOpen = new Set(), auAll = false;
const auNorm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function renderAusst() {
  $('au-sub').textContent = 'Loft · ' + AUSST.extras;
  $('au-tiles').innerHTML = AUSST.tiles.map(([k, v, d]) => `<div class="min-w-0 rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-3 py-2.5"><p class="text-[11px] text-slate-500 dark:text-slate-400">${k}</p><p class="mt-0.5 truncate text-[14px] font-bold">${esc(v)}</p><p class="truncate text-[11px] text-slate-500 dark:text-slate-400">${esc(d)}</p></div>`).join('');
  $('au-tech-sum').textContent = AUSST.techSum;
  $('au-tech').innerHTML = AUSST.tech.map(([name, ico, rows]) => `<div class="mt-3"><p class="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"><span class="text-sm">${ico}</span>${esc(name)}</p>`
    + rows.map(([k, v]) => `<div class="flex items-baseline justify-between gap-3 border-t border-slate-200 dark:border-slate-800 py-1.5"><span class="min-w-0 text-[13px] text-slate-500 dark:text-slate-400">${esc(k)}</span><span class="text-right text-[13px] font-semibold">${esc(v)}</span></div>`).join('') + '</div>').join('');
  renderCcBanner(); renderAuList();
}
function renderAuList() {
  const q = auNorm($('au-q').value.trim()), hit = (it) => !q || auNorm(it[0] + ' ' + it[1]).includes(q);
  let n = 0;
  const html = AUSST.groups.map(([name, ico, items]) => {
    const its = items.filter(hit); if (!its.length) return ''; n += its.length;
    const open = q || auAll || auOpen.has(name);
    return `<div class="border-t border-slate-200 dark:border-slate-800"><button type="button" data-aug="${esc(name)}" class="flex w-full items-center gap-2.5 py-2.5 text-left"><span class="w-6 text-center text-base">${ico}</span><span class="min-w-0 flex-1 text-[14px] font-semibold">${esc(name)}</span><span class="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">${its.length}</span><span class="w-4 text-center text-slate-400 transition ${open ? 'rotate-90' : ''}">›</span></button>`
      + (open ? '<div class="pb-2">' + its.map(([c, t]) => `<div class="flex items-start gap-2.5 py-1.5 pl-1"><span class="mt-px flex h-[22px] w-[44px] shrink-0 items-center justify-center rounded-md ${c ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'border border-dashed border-slate-300 dark:border-slate-700 text-slate-400'} font-mono text-[10.5px] font-semibold">${c || 'Serie'}</span><span class="min-w-0 text-[13px] leading-snug">${esc(t)}</span></div>`).join('') + '</div>' : '') + '</div>';
  }).join('');
  $('au-list').innerHTML = html || '<p class="border-t border-slate-200 dark:border-slate-800 py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nichts gefunden.</p>';
  $('au-count').textContent = q ? n + ' von ' + AU_TOTAL + ' Positionen' : AU_TOTAL + ' Positionen';
  $('au-all').classList.toggle('hidden', !!q);
  $('au-all').textContent = auAll ? 'Alle zuklappen' : 'Alle ' + AU_TOTAL + ' anzeigen ›';
}
const ccRem = () => getReminders().find(r => r.title === CC_TITLE && !r.doneAt);
function renderCcBanner() {
  const end = getSettings().ccEnd, ok = /^\d{4}-\d{2}-\d{2}$/.test(end || '');
  let txt;
  if (!ok) txt = 'Care Connect inkl. Remote Services: <b>3 Jahre</b>. Ablaufdatum eintragen → Erinnerung';
  else {
    const d = daysBetween(parseYMD(end), dayStart()), m = Math.round(d / 30.44);
    txt = d < 0 ? 'Care Connect ist am <b>' + fmtYMD(end) + '</b> abgelaufen.' : 'Care Connect läuft bis <b>' + fmtYMD(end) + '</b> (' + (d > 60 ? 'noch ' + m + ' Monate' : 'noch ' + d + (d === 1 ? ' Tag' : ' Tage')) + ').' + (ccRem() ? ' Erinnerung aktiv.' : '');
  }
  $('au-cc').innerHTML = `<span class="text-lg">📡</span><span class="min-w-0 flex-1">${txt}</span><span class="font-semibold text-sky-600 dark:text-sky-300">›</span>`;
}
function openCcSheet() {
  const st = getSettings(), def = st.ccEnd || ymd(addMonths(parseYMD(purchaseDay()), 36)), btn = 'h-12 rounded-2xl text-sm font-semibold active:scale-[0.98] transition';
  $('au-sheet-box').innerHTML = `<div class="mx-auto h-1 w-10 rounded bg-slate-300 dark:bg-slate-700"></div><p class="text-lg font-bold">Care Connect</p>
    <p class="text-sm text-left text-slate-600 dark:text-slate-300">Inkl. iV Remote Services Basic und Infotainment Online, 3 Jahre ab Auslieferung. Das genaue Ablaufdatum steht in der MyŠkoda-App unter Dienste.</p>
    <div><label for="cc-end" class="text-xs text-slate-500 dark:text-slate-400">Läuft ab am</label><input id="cc-end" type="date" value="${def}" class="${inCls}"></div>
    <label class="flex items-center gap-2.5 text-sm"><input id="cc-rem" type="checkbox" class="h-5 w-5 accent-emerald-600" checked> Erinnerung 1 Monat vorher</label>
    <p id="cc-msg" class="text-sm text-red-600 dark:text-red-400 empty:hidden"></p>
    <div class="grid grid-cols-2 gap-2.5"><button type="button" data-cc="${st.ccEnd ? 'del' : 'close'}" class="${btn} border border-slate-300 dark:border-slate-700 ${st.ccEnd ? 'text-red-600 dark:text-red-400' : ''}">${st.ccEnd ? 'Entfernen' : 'Abbrechen'}</button><button type="button" data-cc="save" class="${btn} bg-emerald-600 text-white">Speichern</button></div>`;
  $('au-sheet').classList.remove('hidden');
}
function ccSetEnd(end, withRem) {
  const st = load(KEY_SETTINGS, {}); if (end) st.ccEnd = end; else delete st.ccEnd;
  save(KEY_SETTINGS, st); try { pushPrefs(); } catch (e) { }
  let rems = getReminders().filter(r => !(r.title === CC_TITLE && !r.doneAt));      // alte offene Care-Connect-Erinnerung ersetzen
  if (end && withRem) {
    const due = addMonths(parseYMD(end), -1);
    rems = rems.concat(cleanRem({ id: Date.now(), title: CC_TITLE, category: 'Sonstiges', note: 'Läuft am ' + fmtYMD(end) + ' ab – rechtzeitig in der MyŠkoda-App verlängern.', dueDate: ymd(due < dayStart() ? dayStart() : due), startDate: purchaseDay() < ymd(due) ? purchaseDay() : todayYMD() }));
  }
  commitReminders(rems); try { renderReminders(); } catch (e) { }
  renderCcBanner();
}
$('au-cc').addEventListener('click', openCcSheet);
$('au-tech-btn').addEventListener('click', () => { const open = $('au-tech').classList.toggle('hidden') === false; $('au-tech-chev').classList.toggle('rotate-90', open); });
$('au-sheet').addEventListener('click', (e) => {
  if (e.target === $('au-sheet')) { $('au-sheet').classList.add('hidden'); return; }
  const b = e.target.closest('[data-cc]'); if (!b) return; const act = b.dataset.cc;
  if (act === 'close') { $('au-sheet').classList.add('hidden'); return; }
  if (act === 'del') { if (!confirm('Ablaufdatum und Erinnerung entfernen?')) return; ccSetEnd(null); $('au-sheet').classList.add('hidden'); return; }
  const v = $('cc-end').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) { $('cc-msg').textContent = 'Bitte ein gültiges Datum wählen.'; return; }
  ccSetEnd(v, $('cc-rem').checked); $('au-sheet').classList.add('hidden');
});
$('au-list').addEventListener('click', (e) => { const g = e.target.closest('[data-aug]'); if (!g || $('au-q').value.trim()) return; const k = g.dataset.aug; if (auAll) { auAll = false; auOpen = new Set(AUSST.groups.map(x => x[0])); } auOpen.has(k) ? auOpen.delete(k) : auOpen.add(k); renderAuList(); });
$('au-all').addEventListener('click', () => { auAll = !auAll; auOpen = new Set(); renderAuList(); });
$('au-q').addEventListener('input', renderAuList);

/* ---- Daten (Berichte, früher „Datenpool“): Unter-Tabs Statistik | Fahrzeugakte | Checkheft, per Antippen oder Wischen ---- */
let dpTab = 'stat';
const DP_TABS = ['stat', 'akte', 'ausst', 'checkheft'];
function setDpTab(t, anim = true) {
  if (!DP_TABS.includes(t)) t = 'stat';
  const dir = DP_TABS.indexOf(t) - DP_TABS.indexOf(dpTab); dpTab = t;
  segPaintKey('.dp-btn', 'dp', t);
  DP_TABS.forEach(k => { const el = $('dp-' + k), on = k === t; el.classList.toggle('hidden', !on); el.classList.remove('dp-inL', 'dp-inR'); if (on && anim && dir) { void el.offsetWidth; el.classList.add(dir > 0 ? 'dp-inL' : 'dp-inR'); } });
  if (t === 'checkheft') { try { renderCheckheft(); } catch (e) { } }
  if (t === 'ausst') { try { renderAusst(); } catch (e) { console.error(e); } }
}
document.querySelectorAll('.dp-btn').forEach(b => b.addEventListener('click', () => setDpTab(b.dataset.dp)));
segSwipe($('dp-panes'), $('dp-seg'));                                     // im Datenpool wechselt Wischen die Unter-Tabs
segSwipe($('dp-seg'), $('dp-seg'));
setDpTab('stat', false);

segSwipe($('rep-place'), $('rep-place'));                                   // Berichte → Laden: Ort direkt auf der Tab-Leiste wischen
segSwipe($('dash-place'), $('dash-place'));                                 // Start: Ort auf der Tab-Leiste (die Seite selbst hat das Bilder-Karussell)
segSwipe($('range-switch').parentElement, $('range-switch'));               // Start: Diagramm Woche | Monat | Jahr (ganze Karte)
segSwipe(document.querySelector('.stat-btn').closest('.rounded-3xl'), document.querySelector('.stat-btn').parentElement);   // Start: Ø Ladungen

initStatImg();                                           // Statistik-Bild laden (asynchron)
/* Direktlinks (z. B. per NFC-Tag am Stromzähler): …/?go=laden öffnet „Laden“ mit Zuhause.
   Weitere Ziele: laden-bosch, laden-unterwegs, kosten, historie, fahrten, berichte, einstellungen. Der Parameter wird danach aus der Adresse entfernt,
   damit ein Neuladen wieder auf Start beginnt. */
function openDeepLink() {
  const q = new URLSearchParams(location.search), go = (q.get('go') || location.hash.replace(/^#/, '') || '').toLowerCase();
  const T = { 'laden': ['capture', () => setCapPlace('home')], 'laden-zuhause': ['capture', () => setCapPlace('home')], 'laden-bosch': ['capture', () => setCapPlace('bosch')],
    'laden-unterwegs': ['capture', () => setCapPlace('away')], 'kosten': ['costs'], 'historie': ['history', () => { histFilter = 'all'; }], 'fahrten': ['history', () => { histFilter = 'fahrten'; }],
    'berichte': ['report'], 'einstellungen': ['settings'] };
  const t = T[go];
  if (t) { if (t[1]) t[1](); showView(t[0]); if (t[1]) t[1](); if (t[0] === 'history') applyHistFilter(); } else showView('dashboard');   // Ziel vor und nach dem Seitenwechsel setzen (showView setzt teils Standardwerte)
  if (go) history.replaceState(null, '', location.pathname);
  return !!t;
}
openDeepLink();
