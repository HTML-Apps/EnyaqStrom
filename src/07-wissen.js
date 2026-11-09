/* =====================================================================
   Wissen (Start → „Wissen“): eigene Einträge mit Titel, Kategorie, Notiz, Links und Belegen (Google Drive), optional auf Start angeheftet.
   Speicher: enyaq.kb = { cats: [Name], items: [{ id, title, cat, text?, links?: [{ url, label? }], files?: [{ id, name, mime }], pin?, at }] }
   Cloud: im Dokument settings/prefs (Feld kb), Datensicherung: Feld kb.
   ===================================================================== */
const KEY_KB = 'enyaq.kb', KB_MG = 'Mängel', KB_UP = 'Updates', KB_DEF_CATS = ['Mängel', 'Updates', 'Handbuch', 'Tipps', 'Werkstatt', 'Verträge', 'Sonstiges'];
/* Software-Updates = feste Wissen-Kategorie „Updates“: ver, how 'ota'|'werkstatt', inst 'JJJJ-MM-TT', km, base (Ausgangsstand, kein Vergleich), done (Auswertung gemeldet).
   Vergleich je 30 Tage vor/nach der Installation (vorher höchstens bis zum vorigen Update). */
const UP_DAYS = 30, isUp = (x) => x && x.cat === KB_UP;
const upList = (kb) => (kb || getKb()).items.filter(x => isUp(x) && x.inst).sort((a, b) => a.inst.localeCompare(b.inst));
const upCur = (kb) => { const l = upList(kb); return l.length ? l[l.length - 1] : null; };
const upAge = (x) => Math.floor((Date.now() - Date.parse(x.inst + 'T00:00:00')) / 864e5);
const upTag = (x) => { const [t, c] = x.base ? ['Ausgangsstand', 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'] : upAge(x) < UP_DAYS ? ['Vergleich läuft', 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200'] : ['✓ ausgewertet', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200']; return `<span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c}">${t}</span>`; };
const upIcon = (x) => x.base ? '🏁' : x.how === 'werkstatt' ? '🔧' : '📡';
const upMeta = (x) => [x.inst ? mgDate(x.inst) : '', x.km ? fmt(x.km, 0) + ' km' : '', x.base ? '' : x.how === 'werkstatt' ? 'Werkstatt' : 'OTA'].filter(Boolean).join(' · ');
/* Mängel-Tagebuch = feste Wissen-Kategorie „Mängel“. Zusatzfelder je Eintrag: st 'offen'|'gemeldet'|'erledigt', art (Art des Mangels), seen 'JJJJ-MM-TT', km, occ [ISO] (wieder aufgetreten). */
const MG_ST = { offen: ['offen', 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'], gemeldet: ['gemeldet', 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'], erledigt: ['erledigt', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'] };
const MG_ART = [['geraeusch', '🔊', 'Geräusch'], ['software', '💻', 'Software'], ['elektrik', '⚡', 'Elektrik'], ['karosserie', '🚪', 'Karosserie'], ['laden', '🔌', 'Laden'], ['sonst', '🛠️', 'Sonstiges']];
const isMg = (x) => x && x.cat === KB_MG, mgSt = (x) => MG_ST[x.st] ? x.st : 'offen', mgArt = (x) => MG_ART.find(a => a[0] === x.art) || MG_ART[5];
const mgTag = (x) => `<span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${MG_ST[mgSt(x)][1]}">${MG_ST[mgSt(x)][0]}</span>`;
const mgDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const mgMeta = (x) => [x.seen ? 'seit ' + mgDate(x.seen).slice(0, 6) : '', x.km ? fmt(x.km, 0) + ' km' : '', x.files && x.files.length ? '📷 ' + x.files.length : '', (x.occ || []).length ? (x.occ.length + 1) + '× aufgetreten' : ''].filter(Boolean).join(' · ') || MG_ART.find(a => a[0] === x.art)?.[2] || KB_MG;
const mgOpen = (kb) => kb.items.filter(x => isMg(x) && mgSt(x) === 'offen').length;
const KB_ICON = (c) => c === KB_MG ? '🛠️' : c === KB_UP ? '🔄' : /hand|anleit|manual/i.test(c) ? '📘' : /tipp|trick|info/i.test(c) ? '💡' : /werk|service|wart/i.test(c) ? '🔧' : /vertr|versich|doku|unterl/i.test(c) ? '📄' : /lade|strom|wallbox/i.test(c) ? '⚡' : /kontakt|tel/i.test(c) ? '📞' : '🗂️';
const KB_TINT = (c) => c === KB_MG ? 'bg-rose-100 dark:bg-rose-600/25' : c === KB_UP ? 'bg-sky-100 dark:bg-sky-600/25' : ({ '📘': 'bg-sky-100 dark:bg-sky-600/25', '💡': 'bg-amber-100 dark:bg-amber-600/25', '🔧': 'bg-violet-100 dark:bg-violet-600/25', '📄': 'bg-emerald-100 dark:bg-emerald-600/25', '⚡': 'bg-lime-100 dark:bg-lime-600/25', '📞': 'bg-rose-100 dark:bg-rose-600/25' }[KB_ICON(c)] || 'bg-slate-100 dark:bg-slate-700/60');
function getKb() { const o = load(KEY_KB, null), cats = o && Array.isArray(o.cats) && o.cats.length ? o.cats.slice() : KB_DEF_CATS.slice(); if (!cats.includes(KB_UP)) cats.unshift(KB_UP); if (!cats.includes(KB_MG)) cats.unshift(KB_MG);   // „Mängel“ und „Updates“ sind fest dabei
  return { cats, items: o && Array.isArray(o.items) ? o.items : [] }; }
function setKb(o) { save(KEY_KB, JSON.parse(JSON.stringify(o))); pushPrefs(); renderKbStart(); if (currentView === 'kb') renderKb(); }
let kbCat = '', kbCur = null, kbPend = [];
const kbSub = (x) => [x.links && x.links.length ? (x.links.length === 1 ? 'Link' : x.links.length + ' Links') : '', x.files && x.files.length ? (x.files.length === 1 ? '1 Beleg' : x.files.length + ' Belege') : '', x.text ? x.text.split('\n')[0].slice(0, 60) : ''].filter(Boolean).join(' · ') || x.cat;
function renderKb() {
  const kb = getKb(), q = $('kb-q').value.trim().toLowerCase();
  const n = (c) => kb.items.filter(x => x.cat === c).length;
  const nOpen = mgOpen(kb);
  $('kb-cats').innerHTML = [['', 'Alle (' + kb.items.length + ')']].concat(kb.cats.filter(c => n(c) || c === KB_MG || c === KB_UP).map(c => [c, KB_ICON(c) + ' ' + c + (c === KB_MG ? '' : ' (' + n(c) + ')')]))
    .map(([k, l]) => `<button type="button" data-kbc="${esc(k)}" class="shrink-0 rounded-lg px-2.5 py-1.5 ${k === kbCat ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">${esc(l)}${k === KB_MG && nOpen ? ` <span class="ml-0.5 rounded-md bg-rose-600 px-1.5 text-[10px] font-bold text-white">${nOpen}</span>` : ''}</button>`).join('');
  const mgs = kb.items.filter(isMg), cnt = (st) => mgs.filter(x => mgSt(x) === st).length;
  const uc = upCur(kb);
  $('kb-mg-bar').classList.toggle('hidden', kbCat !== KB_MG && !(kbCat === KB_UP && uc));
  $('kb-mg-sum').innerHTML = kbCat === KB_UP ? (uc ? 'Aktuell: <b class="text-slate-800 dark:text-slate-100">' + esc(uc.ver || '?') + '</b> seit ' + mgDate(uc.inst) : '') : esc(mgs.length ? cnt('offen') + ' offen · ' + cnt('gemeldet') + ' gemeldet · ' + cnt('erledigt') + ' erledigt' : 'Noch keine Mängel notiert');
  $('kb-mg-share').classList.toggle('hidden', kbCat !== KB_MG || !(cnt('offen') + cnt('gemeldet')));
  $('kb-up-start').classList.toggle('hidden', !(kbCat === KB_UP && !uc));
  const hit = (x) => (!kbCat || x.cat === kbCat) && (!q || [x.title, x.text, x.cat].concat((x.links || []).map(l => l.url + ' ' + (l.label || ''))).join(' ').toLowerCase().includes(q));
  const ord = { offen: 0, gemeldet: 1, erledigt: 2 }, list = kb.items.filter(hit).sort((a, b) => kbCat === KB_MG ? (ord[mgSt(a)] - ord[mgSt(b)]) || String(b.seen || b.at || '').localeCompare(String(a.seen || a.at || '')) : kbCat === KB_UP ? String(b.inst || '').localeCompare(String(a.inst || '')) : a.title.localeCompare(b.title, 'de')), pins = list.filter(x => x.pin), rest = list.filter(x => !x.pin);
  $('kb-pin-wrap').classList.toggle('hidden', !pins.length);
  $('kb-pins').innerHTML = pins.map(x => `<button type="button" data-kb="${esc(x.id)}" class="flex h-14 min-w-0 items-center gap-2.5 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm px-2.5 text-left active:scale-[0.98] transition">
      <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${KB_TINT(x.cat)}">${KB_ICON(x.cat)}</span>
      <span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold leading-5">${esc(x.title)}</span><span class="block truncate text-[11px] leading-4 ${x.links && x.links.length ? 'text-sky-600 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}">${x.links && x.links.length ? '↗ Link öffnen' : esc(kbSub(x))}</span></span>
      <svg class="h-3.5 w-3.5 shrink-0 text-slate-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg></button>`).join('');
  $('kb-list-wrap').classList.toggle('hidden', !rest.length);
  $('kb-list').innerHTML = rest.map(x => `<li><button type="button" data-kb="${esc(x.id)}" class="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-100 dark:active:bg-slate-800">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${KB_TINT(x.cat)}">${isMg(x) ? mgArt(x)[1] : isUp(x) ? upIcon(x) : KB_ICON(x.cat)}</span>
      <span class="min-w-0 flex-1"><span class="block truncate font-medium">${esc(x.title)}</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(isMg(x) ? mgMeta(x) : isUp(x) ? upMeta(x) : kbSub(x))}</span></span>${isMg(x) ? mgTag(x) : isUp(x) ? upTag(x) : '<span class="text-slate-400">›</span>'}</button></li>`).join('');
  $('kb-empty').classList.toggle('hidden', list.length > 0);
  $('kb-empty').textContent = kbCat === KB_UP && !q ? 'Noch keine Software-Version eingetragen. Trag zuerst die Version ein, die jetzt auf dem Auto ist (Ausgangsstand) – jedes spätere Update wird dann mit der Zeit davor verglichen.' : kbCat === KB_MG && !q ? 'Noch keine Mängel. Mit „+ Neu“ notierst du z. B. ein Klappern oder einen Software-Fehler – mit Datum, km vom Auto und Fotos.' : kb.items.length ? 'Keine Treffer.' : 'Noch nichts gespeichert. Lege mit „+ Neu“ zum Beispiel den Link zum Handbuch, Reifendruck-Werte oder die Nummer deiner Werkstatt an.';
}
/* Start: Button-Zusatz und angeheftete Einträge als Chips (Link-Einträge öffnen direkt) */
function renderKbStart() {
  const kb = getKb(), n = kb.items.length, pins = kb.items.filter(x => x.pin).sort((a, b) => a.title.localeCompare(b.title, 'de'));
  try { upCheckDone(); } catch (e) { }
  const mo = mgOpen(kb); $('go-kb-n').textContent = ' · ' + (mo ? mo + (mo === 1 ? ' offener Mangel' : ' offene Mängel') : n ? n + (n === 1 ? ' Eintrag' : ' Einträge') : 'Handbuch, Tipps & mehr');
  $('kb-start-pins').classList.toggle('hidden', !pins.length);
  /* Angepinnte Einträge als Unterzeilen von „Wissen“ (Baumlinie); mit Link öffnet ein Tipp direkt den Link, sonst den Eintrag */
  const ico = '<svg class="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>';
  const ext = '<svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-label="öffnet Link"><path d="M7 17L17 7M9 7h8v8"/></svg>';
  const chev = '<svg class="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const cls = (i) => 'relative flex w-full items-center gap-2.5 pl-[18px] py-2.5 text-left text-[15px] active:opacity-70' + (i ? ' border-t border-slate-200 dark:border-slate-800' : '');
  const twig = '<span class="absolute left-0 top-1/2 h-0.5 w-3 -translate-y-1/2 bg-slate-200 dark:bg-slate-800" aria-hidden="true"></span>';
  $('kb-start-pins').innerHTML = pins.length ? '<span class="absolute left-[27px] top-0 bottom-[23px] w-0.5 bg-slate-200 dark:bg-slate-800" aria-hidden="true"></span>' + pins.map((x, i) => x.links && x.links.length
    ? `<a href="${esc(x.links[0].url)}" target="_blank" rel="noopener" class="${cls(i)}">${twig}${ico}<span class="min-w-0 flex-1 truncate">${esc(x.title)}</span>${ext}</a>`
    : `<button type="button" data-kb="${esc(x.id)}" class="${cls(i)}">${twig}${ico}<span class="min-w-0 flex-1 truncate">${esc(x.title)}</span>${chev}</button>`).join('') : '';
}
const kbLinkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="underline text-sky-600 dark:text-sky-300 break-all">$1</a>');
function openKb(id) {
  const x = getKb().items.find(y => String(y.id) === String(id)); if (!x) return;
  kbCur = x.id; $('kb-edit').classList.add('hidden'); $('kb-view').classList.remove('hidden');
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  $('kb-view').innerHTML = `<div class="flex items-center gap-3"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${KB_TINT(x.cat)}">${KB_ICON(x.cat)}</span><div class="min-w-0"><p class="text-lg font-bold leading-tight break-words">${esc(x.title)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${esc(x.cat)}${x.at ? ' · zuletzt geändert ' + fmtDate(x.at) : ''}</p></div></div>
    ${(x.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="flex items-center justify-between gap-3 rounded-2xl bg-sky-50 dark:bg-sky-600/15 px-3.5 py-3 text-sky-800 dark:text-sky-200"><span class="min-w-0"><span class="block truncate text-sm font-semibold">${esc(l.label || 'Link öffnen')}</span><span class="block truncate text-xs opacity-80">${esc(host(l.url))}</span></span><span aria-hidden="true">↗</span></a>`).join('')}
    ${isMg(x) ? `<div class="rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-3 text-sm"><div class="flex items-center justify-between gap-2"><span class="font-semibold">${mgArt(x)[1]} ${mgArt(x)[2]}</span>${mgTag(x)}</div>
      <p class="mt-1.5 text-left text-slate-600 dark:text-slate-300">${x.seen ? 'Bemerkt am ' + mgDate(x.seen) : 'Bemerkt: –'}${x.km ? ' · ' + fmt(x.km, 0) + ' km' : ''}</p>
      ${(x.occ || []).length ? `<p class="mt-1 text-left text-xs text-slate-500 dark:text-slate-400">Wieder aufgetreten: ${x.occ.map(o => mgDate(o).slice(0, 6)).join(', ')} · insgesamt ${x.occ.length + 1}×</p>` : ''}
      <div class="mt-2.5 grid grid-cols-2 gap-1.5"><button type="button" data-kbact="again" class="rounded-xl bg-white dark:bg-slate-800 py-2 text-xs font-semibold active:scale-95 transition">＋ wieder aufgetreten</button>
        ${mgSt(x) === 'offen' ? '<button type="button" data-kbact="st-gemeldet" class="rounded-xl bg-white dark:bg-slate-800 py-2 text-xs font-semibold active:scale-95 transition">→ gemeldet</button>' : mgSt(x) === 'gemeldet' ? '<button type="button" data-kbact="st-erledigt" class="rounded-xl bg-white dark:bg-slate-800 py-2 text-xs font-semibold active:scale-95 transition">✓ erledigt</button>' : '<button type="button" data-kbact="st-offen" class="rounded-xl bg-white dark:bg-slate-800 py-2 text-xs font-semibold active:scale-95 transition">↺ wieder offen</button>'}</div></div>` : ''}
    ${isUp(x) ? `<div class="rounded-2xl bg-sky-50 dark:bg-sky-950/30 p-3 text-sm"><div class="flex items-center justify-between gap-2"><span class="font-semibold">${upIcon(x)} Version ${esc(x.ver || '?')}</span>${upTag(x)}</div><p class="mt-1 text-left text-slate-600 dark:text-slate-300">${esc(upMeta(x))}</p>
      ${x.base ? '<p class="mt-2 text-left text-xs text-slate-500 dark:text-slate-400">Ausgangsstand: ab hier wird jedes neue Update mit der Zeit davor verglichen.</p>' : '<div id="kb-up-cmp" class="mt-2"><p class="text-xs text-slate-500 dark:text-slate-400">Vergleich wird berechnet …</p></div>'}</div>` : ''}
    ${x.text ? `<div class="rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-3 text-sm leading-6 whitespace-pre-wrap break-words">${kbLinkify(x.text)}</div>` : ''}
    ${x.files && x.files.length ? `<div><p class="mb-1.5 text-xs text-slate-500 dark:text-slate-400">Belege</p><div class="flex flex-wrap gap-1.5">${x.files.map(f => `<a href="${dvLink(f.id)}" target="_blank" rel="noopener" class="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs"><span aria-hidden="true">📎</span><span class="truncate">${esc(f.name)}</span></a>`).join('')}</div></div>` : ''}
    <div class="grid grid-cols-3 gap-2 pt-1"><button type="button" data-kbact="edit" class="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium active:scale-95 transition">Bearbeiten</button><button type="button" data-kbact="share" class="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium active:scale-95 transition">Teilen</button><button type="button" data-kbact="del" class="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-medium text-red-600 dark:text-red-300 active:scale-95 transition">Löschen</button></div>
    <button type="button" data-kbact="close" class="w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold active:scale-95 transition">Schließen</button>`;
  $('kb-dialog').classList.remove('hidden');
  if (isUp(x) && !x.base) upCompare(x).then(h => { if (kbCur === x.id && $('kb-up-cmp')) $('kb-up-cmp').innerHTML = h; }).catch(e => { console.error(e); if ($('kb-up-cmp')) $('kb-up-cmp').innerHTML = '<p class="text-xs text-red-600">Vergleich nicht möglich.</p>'; });
}
/* Vorher/Nachher-Vergleich eines Updates → HTML. Verbrauch ab Akku je Strecke zwischen zwei Ladungen; temperaturbereinigt über die Abweichung vom eigenen Wettermodell. */
async function upCompare(x) {
  const t0 = Date.parse(x.inst + 'T00:00:00'), prev = upList().filter(y => y.inst < x.inst).pop(), D = 864e5;
  const bA = Math.max(t0 - UP_DAYS * D, prev ? Date.parse(prev.inst + 'T00:00:00') : 0), aB = Math.min(t0 + UP_DAYS * D, Date.now() + D), age = Math.min(UP_DAYS, Math.max(0, upAge(x)));
  const rs = getReadings(), inB = (t) => t >= bA && t < t0, inA = (t) => t >= t0 && t < aB;
  const seg = []; rs.forEach((r, i) => { if (i < 1) return; const s2 = entryStats(rs, i), a = Date.parse(rs[i - 1].date), b = Date.parse(r.date); if (s2.method !== 'soc' || s2.rough || !(s2.km >= 10) || !(s2.usedBat > 0)) return; seg.push({ a, b, km: s2.km, bat: s2.usedBat }); });
  const sB = seg.filter(z => inB(z.b) && z.a >= bA), sA = seg.filter(z => inA(z.b) && z.a >= t0 - D);
  const k100 = (l) => { const km = l.reduce((q, z) => q + z.km, 0); return km ? l.reduce((q, z) => q + z.bat, 0) / km * 100 : null; };
  let adj = null; const l = wxLoc();
  if (l && sB.length && sA.length) { try { const all = sB.concat(sA), m = await wxoModel(l), days = await wxTemps(l, wxIso(new Date(Math.min(...all.map(z => z.a)))), wxIso(new Date(Math.max(...all.map(z => z.b))))), tc = load(KEY_TEMPS, {}) || {}, rain = tc.rain || {}, hum = tc.hum || {};
      const res = (z) => { let st = 0, n = 0, wet = 0, nr = 0, hu = 0, nh = 0; for (let t = z.a; t <= z.b + 1; t += D) { const d = wxIso(new Date(t)); if (days[d] != null) { st += days[d]; n++; } if (rain[d] != null) { nr++; if (rain[d] >= 1) wet++; } if (hum[d] != null) { nh++; hu += hum[d]; } }
        return n ? z.bat / z.km * 100 - wxoPredX(m, wxoX(st / n, nr ? wet / nr : 0, nh ? hu / nh : 0)) : null; };
      const avgR = (L2) => { const v = L2.map(z => ({ r: res(z), km: z.km })).filter(o => o.r != null), km = v.reduce((q, o) => q + o.km, 0); return km ? v.reduce((q, o) => q + o.r * o.km, 0) / km : null; };
      const rB = avgR(sB), rA = avgR(sA); if (rB != null && rA != null) adj = (rA - rB) / (k100(sB) || 16) * 100; } catch (e) { } }
  const cv = getLab().curves.filter(c => c.date && c.pts), cvT = (c) => Date.parse(c.date + 'T12:00:00'), p2060 = (c) => { let q = 0, n = 0; for (let p = Math.max(20, c.s0); p <= Math.min(60, c.s1); p += 5) { q += cvPow(c, p); n++; } return n >= 3 ? q / n : null; };
  const cB = cv.filter(c => cvT(c) < t0 && cvT(c) >= t0 - 120 * D && (!prev || cvT(c) >= Date.parse(prev.inst + 'T00:00:00'))).sort((a, b) => cvT(b) - cvT(a))[0], cA = cv.filter(c => cvT(c) >= t0).sort((a, b) => cvT(a) - cvT(b))[0];
  const lossOf = (f) => { const v = rs.map((r, i) => ({ r, s2: entryStats(rs, i) })).filter(o => isHome(o.r) && f(Date.parse(o.r.date)) && o.s2.loss != null && o.s2.loss >= 0 && o.s2.loss < 40).map(o => o.s2.loss); return v.length ? v.reduce((q, y) => q + y, 0) / v.length : null; };
  const cfOf = (f) => { const v = rs.filter(r => comfortOf(r) > 0 && f(Date.parse(r.date))).map(comfortOf); return v.length ? v.reduce((q, y) => q + y, 0) / v.length : null; };
  const rows = [], good = [], bad = [];
  const row = (lab, a, b, u, dec, lowGood, note, dOverride, pkt) => { if (a == null && b == null) return; const d = dOverride != null ? dOverride : a != null && b != null ? (pkt ? b - a : (b - a) / a * 100) : null, ok = d == null || Math.abs(d) < (pkt ? 0.5 : 1.5) ? null : (d < 0) === lowGood;
    if (ok === true) good.push(lab); if (ok === false) bad.push(lab);
    rows.push(`<div class="grid grid-cols-[1.3fr_.8fr_.8fr_.7fr] items-baseline gap-1 border-t border-slate-200 dark:border-slate-800 py-1.5 text-[13px]"><span class="text-left text-slate-600 dark:text-slate-300">${lab}</span><span class="text-right tabular-nums">${a != null ? fmt(a, dec) + u : '–'}</span><span class="text-right font-semibold tabular-nums">${b != null ? fmt(b, dec) + u : '–'}</span><span class="text-right font-semibold tabular-nums ${ok === true ? 'text-emerald-600 dark:text-emerald-400' : ok === false ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}">${d != null ? (d > 0 ? '+' : '−') + (pkt ? fmt(Math.abs(d), 1) + ' Pkt' : fmt(Math.abs(d), 0) + ' %') : ''}</span></div>`
      + (note ? `<p class="-mt-1 pb-1 text-left text-[10.5px] text-slate-500 dark:text-slate-400">${note}</p>` : '')); };
  row('Verbrauch ab Akku', k100(sB), k100(sA), '', 1, true, adj != null ? 'Δ temperaturbereinigt mit deinem Wettermodell' : sB.length && sA.length ? 'ohne Temperatur-Bereinigung' : '', adj);
  row('DC 20–60 %', cB ? p2060(cB) : null, cA ? p2060(cA) : null, ' kW', 0, false);
  row('Ladeverlust zuhause', lossOf(inB), lossOf(inA), ' %', 1, true, '', null, true);
  row('Komfort je Vorheizen', cfOf(inB), cfOf(inA), ' kWh', 1, true);
  const kmA = sA.reduce((q, z) => q + z.km, 0), nA = rs.filter(r => inA(Date.parse(r.date))).length;
  const head = `<p class="text-left text-xs text-slate-500 dark:text-slate-400">Vorher / nachher · je ${UP_DAYS} Tage</p><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div class="h-full bg-sky-500" style="width:${(age / UP_DAYS * 100).toFixed(0)}%"></div></div>
    <p class="mt-1 text-left text-[11px] text-slate-500 dark:text-slate-400">nachher: ${age} von ${UP_DAYS} Tagen · ${nA} ${nA === 1 ? 'Ladung' : 'Ladungen'} · ${fmt(kmA, 0)} km</p>`;
  if (!rows.length) return head + '<p class="mt-2 text-left text-xs text-slate-500 dark:text-slate-400">Noch keine vergleichbaren Daten. Ladungen mit Akku-% und km-Stand vor und nach dem Update füllen den Vergleich.</p>';
  const fz = good.length || bad.length ? (good.length ? 'besser: ' + good.join(', ') : '') + (good.length && bad.length ? ' · ' : '') + (bad.length ? 'schlechter: ' + bad.join(', ') : '') : 'bisher kein deutlicher Unterschied';
  return head + `<div class="mt-2 grid grid-cols-[1.3fr_.8fr_.8fr_.7fr] gap-1 text-[10px] uppercase tracking-wide text-slate-500"><span></span><span class="text-right">vorher</span><span class="text-right">nachher</span><span class="text-right">Δ</span></div>` + rows.join('')
    + `<p class="mt-2 rounded-xl bg-sky-100/70 dark:bg-sky-900/40 px-3 py-2 text-left text-xs text-sky-900 dark:text-sky-100">${age < UP_DAYS ? 'Zwischenstand' : 'Ergebnis'}: ${esc(fz)}.${age < UP_DAYS ? ' Endgültig nach ' + UP_DAYS + ' Tagen.' : ''}</p>`;
}
/* Nach 30 Tagen: Auswertung einmal melden (Benachrichtigung, falls erlaubt) */
function upCheckDone() {
  const kb = getKb(), due = kb.items.filter(x => isUp(x) && !x.base && !x.done && x.inst && upAge(x) >= UP_DAYS); if (!due.length) return;
  save(KEY_KB, { ...kb, items: kb.items.map(x => due.includes(x) ? { ...x, done: true } : x) }); try { pushPrefs(); } catch (e) { }
  try { if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) navigator.serviceWorker.ready.then(r => due.forEach(x => r.showNotification('Update ' + (x.ver || '') + ' ausgewertet', { body: 'Der Vorher/Nachher-Vergleich ist fertig – Wissen → Updates.', tag: 'upd-' + x.id, icon: '/Bilder/car-v4-192.png' }))); } catch (e) { }
}
function kbLinkRow(u = '', l = '') { return `<div class="kb-lrow flex gap-1.5"><input type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="${esc(u)}" aria-label="Adresse" class="kb-lu min-w-0 flex-[3] rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><input type="text" autocomplete="off" placeholder="Name" value="${esc(l)}" aria-label="Name des Links" class="kb-ll min-w-0 flex-[2] rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><button type="button" data-kbrm="1" aria-label="Link entfernen" class="w-9 shrink-0 rounded-xl text-slate-500">✕</button></div>`; }
function kbFilesHtml(files) { return files.map((f, i) => `<span class="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 pl-2.5 pr-1 py-1 text-xs"><span class="truncate">📎 ${esc(f.name)}${f.pending ? ' · wird hochgeladen' : ''}</span><button type="button" data-kbf="${i}" aria-label="Beleg entfernen" class="px-1.5 text-slate-500">✕</button></span>`).join('') + '<button type="button" id="kb-file-add" class="rounded-lg border border-dashed border-slate-400 dark:border-slate-600 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400">+ Beleg</button>'; }
let kbFiles = [];
function editKb(id) {
  const kb = getKb(), x = id != null ? kb.items.find(y => String(y.id) === String(id)) : null;
  kbCur = x ? x.id : null; kbPend = []; kbFiles = x && x.files ? x.files.slice() : [];
  $('kb-edit-h').textContent = x ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  $('kb-title').value = x ? x.title : ''; $('kb-text').value = x ? x.text || '' : ''; $('kb-pin').checked = !!(x && x.pin);
  $('kb-cat').innerHTML = kb.cats.map(c => `<option value="${esc(c)}">${KB_ICON(c)} ${esc(c)}</option>`).join('') + '<option value="__new">+ Neue Kategorie …</option>';
  $('kb-cat').value = x ? x.cat : (kbCat || kb.cats.find(c => c !== KB_MG) || kb.cats[0]);
  kbMg = { st: x ? mgSt(x) : 'offen', art: x && x.art ? x.art : '' }; $('kb-mg-date').value = x && x.seen ? x.seen : wxIso(new Date()); $('kb-mg-date').max = wxIso(new Date());
  $('kb-mg-km').value = x && x.km ? String(x.km) : (() => { try { const c = ltmCarKm(); if (c && c.km) return String(c.km); const k = lastKnownKm(); return k ? String(Math.round(k)) : ''; } catch (e) { return ''; } })();
  kbUp = { how: x && x.how === 'werkstatt' ? 'werkstatt' : 'ota' }; $('kb-up-ver').value = x && x.ver ? x.ver : ''; $('kb-up-date').value = x && x.inst ? x.inst : wxIso(new Date()); $('kb-up-date').max = wxIso(new Date());
  $('kb-up-km').value = x && x.km ? String(x.km) : $('kb-mg-km').value; $('kb-up-base').checked = !!(x ? x.base : kbUpBaseNext); kbUpBaseNext = false;
  kbMgPaint();
  $('kb-links').innerHTML = (x && x.links && x.links.length ? x.links : [{ url: '' }]).map(l => kbLinkRow(l.url, l.label)).join('');
  $('kb-files').innerHTML = kbFilesHtml(kbFiles); $('kb-msg').classList.add('hidden');
  $('kb-view').classList.add('hidden'); $('kb-edit').classList.remove('hidden'); $('kb-dialog').classList.remove('hidden');
  if (!x) setTimeout(() => $('kb-title').focus(), 50);
}
const kbErr = (t) => { $('kb-msg').textContent = t; $('kb-msg').classList.remove('hidden'); };
$('kb-cat').addEventListener('change', (e) => {
  if (e.target.value !== '__new') return;
  const n = (prompt('Name der neuen Kategorie:') || '').trim().replace(/\s+/g, ' ').slice(0, 24), kb = getKb();
  if (!n) { e.target.value = kb.cats[0]; return; }
  if (!kb.cats.some(c => c.toLowerCase() === n.toLowerCase())) { kb.cats.push(n); save(KEY_KB, kb); }
  e.target.innerHTML = getKb().cats.map(c => `<option value="${esc(c)}">${KB_ICON(c)} ${esc(c)}</option>`).join('') + '<option value="__new">+ Neue Kategorie …</option>';
  e.target.value = getKb().cats.find(c => c.toLowerCase() === n.toLowerCase());
});
$('kb-link-add').addEventListener('click', () => { $('kb-links').insertAdjacentHTML('beforeend', kbLinkRow()); });
$('kb-links').addEventListener('click', (e) => { if (e.target.closest('[data-kbrm]')) e.target.closest('.kb-lrow').remove(); });
$('kb-files').addEventListener('click', (e) => {
  if (e.target.id === 'kb-file-add') { if (!window.cloud?.isSignedIn()) { kbErr('Belege brauchen die Anmeldung bei Google (Einstellungen → Konto & Cloud).'); return; } $('kb-file-in').click(); return; }
  const b = e.target.closest('[data-kbf]'); if (!b) return; const f = kbFiles[+b.dataset.kbf];
  if (f.pending) kbPend = kbPend.filter(p => p !== f.file); kbFiles.splice(+b.dataset.kbf, 1); $('kb-files').innerHTML = kbFilesHtml(kbFiles);
});
$('kb-file-in').addEventListener('change', (e) => { [...e.target.files].forEach(f => { kbPend.push(f); kbFiles.push({ name: f.name, pending: true, file: f }); }); e.target.value = ''; $('kb-files').innerHTML = kbFilesHtml(kbFiles); });
async function kbUpload(item, files, tokP) {
  const tok = await (tokP || window.cloud.driveToken()), folder = await dvFolder(tok), out = [];
  for (let i = 0; i < files.length; i++) {
    const pr = await dvPrepare(files[i]); if (pr.blob.size > DV_MAX) throw new Error('„' + files[i].name + '“ ist größer als 15 MB.');
    const name = ('Wissen_' + item.title + (files.length > 1 || (item.files || []).length ? '_' + ((item.files || []).length + i + 1) : '')).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 110) + '.' + pr.ext;
    const body = new FormData(); body.append('metadata', new Blob([JSON.stringify({ name, parents: [folder], mimeType: pr.mime, appProperties: { kbId: String(item.id) } })], { type: 'application/json' })); body.append('file', pr.blob);
    const j = await (await dvFetch(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', { method: 'POST', body })).json();
    out.push({ id: j.id, name: j.name, mime: j.mimeType || pr.mime });
  }
  return out;
}
$('kb-save').addEventListener('click', async () => {
  const title = $('kb-title').value.trim().replace(/\s+/g, ' ').slice(0, 80), cat = $('kb-cat').value === '__new' ? getKb().cats[0] : $('kb-cat').value;
  const upVer = $('kb-up-ver').value.trim().slice(0, 24);
  if (cat === KB_UP && !upVer) { kbErr('Bitte die Software-Version eintragen (z. B. 3.7).'); return; }
  if (cat === KB_UP && !$('kb-up-date').value) { kbErr('Bitte das Datum der Installation eintragen.'); return; }
  if (!title && cat !== KB_UP) { kbErr('Bitte einen Titel eingeben.'); return; }
  const links = []; for (const r of document.querySelectorAll('#kb-links .kb-lrow')) {
    let u = r.querySelector('.kb-lu').value.trim(); const l = r.querySelector('.kb-ll').value.trim().slice(0, 60); if (!u) continue;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try { const p = new URL(u); if (!/^(https?|tel|mailto):$/.test(p.protocol)) throw 0; } catch (e) { kbErr('Ungültiger Link: ' + u); return; }
    const o = { url: u }; if (l) o.label = l; links.push(o);
  }
  const kb = getKb(), old = kb.items.find(y => String(y.id) === String(kbCur)), item = { id: old ? old.id : Date.now(), title: title || ('Software ' + upVer), cat, at: new Date().toISOString() };
  const text = $('kb-text').value.trim().slice(0, 4000); if (text) item.text = text; if (links.length) item.links = links; if ($('kb-pin').checked) item.pin = true;
  if (cat === KB_UP) { const km = $('kb-up-km').value.trim() ? Number($('kb-up-km').value.replace(/\D/g, '')) : null; if (km != null && !(km >= 0 && km < 2e6)) { kbErr('Bitte einen gültigen km-Stand eingeben oder das Feld leer lassen.'); return; }
    item.ver = upVer; item.how = kbUp.how; item.inst = $('kb-up-date').value; if (km) item.km = km; if ($('kb-up-base').checked) item.base = true; if (old && old.done && old.inst === item.inst) item.done = true; }
  if (cat === KB_MG) { const km = $('kb-mg-km').value.trim() ? Number($('kb-mg-km').value.replace(/\D/g, '')) : null; if (km != null && !(km >= 0 && km < 2e6)) { kbErr('Bitte einen gültigen km-Stand eingeben oder das Feld leer lassen.'); return; }
    item.st = kbMg.st; if (kbMg.art) item.art = kbMg.art; if ($('kb-mg-date').value) item.seen = $('kb-mg-date').value; if (km) item.km = km; if (old && old.occ && old.occ.length) item.occ = old.occ; if (old && old.stAt && old.st === kbMg.st) item.stAt = old.stAt; else if (kbMg.st !== 'offen') item.stAt = new Date().toISOString(); }
  const kept = kbFiles.filter(f => !f.pending).map(f => ({ id: f.id, name: f.name, mime: f.mime })); if (kept.length) item.files = kept;
  const pend = kbPend.slice(), tokP = pend.length ? window.cloud.driveToken() : null; if (tokP) tokP.catch(() => { });   // Google-Fenster direkt nach dem Tipp
  setKb({ cats: kb.cats, items: old ? kb.items.map(y => String(y.id) === String(old.id) ? item : y) : kb.items.concat(item) });
  $('kb-dialog').classList.add('hidden');
  if (pend.length) {
    try { const up = await kbUpload(item, pend, tokP), k2 = getKb(); setKb({ cats: k2.cats, items: k2.items.map(y => String(y.id) === String(item.id) ? { ...y, files: (y.files || []).concat(up) } : y) }); }
    catch (e) { if (e && e.status === 401) window.cloud.driveForget(); appNote('Beleg-Upload fehlgeschlagen: ' + dvErrText(e)); }
  }
});
/* Mängel: Felder im Bearbeiten-Dialog */
let kbMg = { st: 'offen', art: '' };
let kbUp = { how: 'ota' }, kbUpBaseNext = false;
function kbMgPaint() {
  $('kb-mg').classList.toggle('hidden', $('kb-cat').value !== KB_MG);
  $('kb-up').classList.toggle('hidden', $('kb-cat').value !== KB_UP);
  $('kb-up-how').innerHTML = [['ota', 'OTA'], ['werkstatt', 'Werkstatt']].map(([k, l]) => `<button type="button" data-uphow="${k}" class="whitespace-nowrap rounded-xl text-[13px] ${kbUp.how === k ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${l}</button>`).join('');
  $('kb-title').placeholder = $('kb-cat').value === KB_UP ? 'leer = „Software ‹Version›“' : 'z. B. Bedienungsanleitung';
  $('kb-mg-st').innerHTML = Object.keys(MG_ST).map(k => `<button type="button" data-mgst="${k}" class="rounded-xl py-2 ${kbMg.st === k ? MG_ST[k][1] + ' ring-2 ring-current/30' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${MG_ST[k][0]}</button>`).join('');
  $('kb-mg-art').innerHTML = MG_ART.map(([k, i, l]) => `<button type="button" data-mgart="${k}" class="rounded-lg px-2 py-1.5 ${kbMg.art === k ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">${i} ${l}</button>`).join('');
  $('kb-text').placeholder = $('kb-cat').value === KB_MG ? 'Wann tritt es auf? Temperatur, Straße, Geschwindigkeit … – hilft der Werkstatt beim Nachstellen' : 'Text, Werte, Schritte …';
}
$('kb-cat').addEventListener('change', kbMgPaint);
$('kb-up').addEventListener('click', async (e) => {
  const h = e.target.closest('[data-uphow]'); if (h) { kbUp.how = h.dataset.uphow; kbMgPaint(); return; }
  if (e.target.id === 'kb-up-kmf') { e.preventDefault(); const b = e.target; b.textContent = '…'; try { $('kb-up-km').value = String((await fetchCarKm()).km); } catch (er) { kbErr('km-Stand vom Auto nicht verfügbar.'); } b.textContent = '↻'; }
});
$('kb-up-start').addEventListener('click', () => { kbUpBaseNext = true; editKb(null); setTimeout(() => $('kb-up-ver').focus(), 60); });
$('kb-mg').addEventListener('click', async (e) => {
  const s2 = e.target.closest('[data-mgst]'), a = e.target.closest('[data-mgart]');
  if (s2) { kbMg.st = s2.dataset.mgst; kbMgPaint(); return; }
  if (a) { kbMg.art = kbMg.art === a.dataset.mgart ? '' : a.dataset.mgart; kbMgPaint(); return; }
  if (e.target.id === 'kb-mg-kmf') { e.preventDefault(); const b = e.target; b.textContent = '…'; try { $('kb-mg-km').value = String((await fetchCarKm()).km); } catch (er) { kbErr('km-Stand vom Auto nicht verfügbar.'); } b.textContent = '↻'; }
});
/* Werkstatt-Liste: offene und gemeldete Mängel als Text zum Teilen (WhatsApp, Mail …) */
$('kb-mg-share').addEventListener('click', async (e) => {
  const kb = getKb(), l = kb.items.filter(x => isMg(x) && mgSt(x) !== 'erledigt').sort((a, b) => String(a.seen || '').localeCompare(String(b.seen || '')));
  let km = null; try { const c = ltmCarKm(); km = c && c.km; } catch (er) { }
  const t = carName() + ' – Mängelliste' + (km ? ' (km ' + fmt(km, 0) + ')' : '') + ', Stand ' + mgDate(wxIso(new Date())) + '\n\n' + l.map((x, i) => [(i + 1) + '. ' + x.title + ' (' + mgArt(x)[2] + (mgSt(x) === 'gemeldet' ? ', bereits gemeldet' : '') + ')',
    '   seit ' + (x.seen ? mgDate(x.seen) : '–') + (x.km ? ' / ' + fmt(x.km, 0) + ' km' : '') + ((x.occ || []).length ? ' · ' + (x.occ.length + 1) + '× aufgetreten' : ''),
    x.text ? '   ' + x.text.replace(/\n+/g, ' ').slice(0, 300) : '', (x.files || []).map(f => '   Foto: ' + dvLink(f.id)).join('\n')].filter(Boolean).join('\n')).join('\n\n');
  try { if (navigator.share) await navigator.share({ title: 'Mängelliste ' + carShort(), text: t }); else { await navigator.clipboard.writeText(t); e.target.textContent = 'Kopiert ✓'; setTimeout(() => { e.target.textContent = '📋 Werkstatt-Liste'; }, 1800); } } catch (er) { }
});
$('kb-cancel').addEventListener('click', () => { if (kbCur != null && getKb().items.some(y => String(y.id) === String(kbCur))) openKb(kbCur); else $('kb-dialog').classList.add('hidden'); });
$('kb-dialog').addEventListener('click', async (e) => {
  if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); return; }
  const b = e.target.closest('[data-kbact]'); if (!b) return; const act = b.dataset.kbact, kb = getKb(), x = kb.items.find(y => String(y.id) === String(kbCur));
  if (act === 'close' || !x) { $('kb-dialog').classList.add('hidden'); return; }
  if (act === 'edit') editKb(x.id);
  else if (act === 'again') { setKb({ cats: kb.cats, items: kb.items.map(y => y === x ? { ...y, occ: (y.occ || []).concat(new Date().toISOString()), at: new Date().toISOString() } : y) }); openKb(x.id); }
  else if (act.startsWith('st-')) { const st = act.slice(3); setKb({ cats: kb.cats, items: kb.items.map(y => y === x ? { ...y, st, stAt: new Date().toISOString(), at: new Date().toISOString() } : y) }); openKb(x.id); }
  else if (act === 'del') { const prevKb = JSON.parse(JSON.stringify(kb)); setKb({ cats: kb.cats, items: kb.items.filter(y => y !== x) }); $('kb-dialog').classList.add('hidden'); undoDel('„' + x.title + '“ gelöscht', () => setKb(prevKb)); }
  else if (act === 'share') {
    const t = [x.title, x.text || ''].concat((x.links || []).map(l => (l.label ? l.label + ': ' : '') + l.url)).filter(Boolean).join('\n');
    try { if (navigator.share) await navigator.share({ title: x.title, text: t }); else { await navigator.clipboard.writeText(t); b.textContent = 'Kopiert ✓'; } } catch (err) { }
  }
});
$('kb-add').addEventListener('click', () => editKb(null));
$('kb-q').addEventListener('input', renderKb);
$('kb-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-kbc]'); if (b) { kbCat = b.dataset.kbc; renderKb(); } });
$('kb-pins').addEventListener('click', (e) => { const b = e.target.closest('[data-kb]'); if (b) openKb(b.dataset.kb); });
$('kb-list').addEventListener('click', (e) => { const b = e.target.closest('[data-kb]'); if (b) openKb(b.dataset.kb); });
$('kb-start-pins').addEventListener('click', (e) => { const b = e.target.closest('button[data-kb]'); if (b) openKb(b.dataset.kb); });
$('go-kb').addEventListener('click', () => showView('kb'));
renderKbStart();

/** Bild oben auf der Statistik-Seite: Statistik.png/.webp/.jpg/.jpeg im Ordner „Bilder“ (freigestellt, auf dem Kartenhintergrund der App); fehlt es, bleibt die Karte weg. */
const STAT_IMG_VER = '2';                                 // bei neuem Bild hochzählen (umgeht Browser- und Service-Worker-Cache); v2 = bei Canva freigestelltes PNG
async function initStatImg() {
  let src = null;
  for (const e of ['png', 'webp', 'jpg', 'jpeg']) { src = await probeImg('Bilder/Statistik.' + e + '?v=' + STAT_IMG_VER); if (src) break; }
  if (!src) return;
  const m = await cutWhite(src); $('st-img').src = m.src; $('st-img-card').classList.remove('hidden');
}

