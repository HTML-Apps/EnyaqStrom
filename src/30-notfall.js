/* =====================================================================
   Notfall: Widget im Wisch-Bereich (#sos-card, Standort im Fokus) + rote Notfallseite (#sos-page, Vollbild).
   Standort: Handy-GPS nur auf Knopfdruck („Standort ermitteln“), sonst Parkposition vom Auto (Škoda-API, `d.park` in KEY_WXO+'S').
   Nummern: settings.sos = { panne:{name,tel}, ins:{name,tel,nr}, contact:{name,tel} } (synchronisiert), leer → aus Wissen („Wichtige Nummern“ o. ä.) erraten.
   Fahrzeug: Kennzeichen/FIN/Modell aus den Einstellungen (FIN sonst aus Wissen). „Liegt im Auto“: Warndreieck, Weste, Verbandkasten, Repair-Kit aus der Utensilien-Packliste.
   Karte: eine Kachel-Ansicht von OpenStreetMap (3×3 Kacheln, Zoom 15) – ohne Netz nur Koordinaten.
   ===================================================================== */
var sosLoc = null, sosBusy = false, sosEdit = false;
const SOS_TEL = /(\+?\d[\d \/\-()]{5,}\d)/;
function sosKbText() { try { return (getKb().items || []).map(x => (x.title || '') + '\n' + (x.text || '')).join('\n'); } catch (e) { return ''; } }
/** Nummer aus Wissen raten: Zeile mit passendem Stichwort und Telefonnummer */
function sosGuess(re) {
  const ls = sosKbText().split('\n');
  for (const l of ls) if (re.test(l)) { const m = l.match(SOS_TEL); if (m && m[1].replace(/\D/g, '').length >= 6) return { name: l.replace(m[1], '').replace(/[:\-–·]+\s*$/, '').replace(/^[-•*\s]+/, '').trim().slice(0, 40), tel: m[1].trim() }; }
  return null;
}
function sosData() {
  const s = getSettings(), o = s.sos || {}, kb = sosKbText();
  const vin = (s.vin || '').trim() || ((kb.match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [])[0] || '');
  const panne = o.panne && o.panne.tel ? o.panne : sosGuess(/pannen|assist|mobilit|abschlepp|škoda.*(hilfe|service)|skoda.*(hilfe|service)/i);
  const ins = o.ins && o.ins.tel ? o.ins : sosGuess(/huk|versicher|schaden|allianz|devk|ergo|axa|generali|r\+v|lvm|vhv/i);
  const items = [];
  try { (getKb().items || []).filter(x => invIs(x)).forEach(x => invZones(invParse(x.text)).forEach(z => z.items.forEach(i => {
    if (/warndreieck|warnweste|weste|erste.?hilfe|verband|repair|reifen.?(dicht|pann)|pannenset|abschlepp|starthilfe|feuerl/i.test(i.n))
      items.push({ n: i.n, where: (z.n === i.f ? i.f : z.n + ' · ' + i.f) + (i.sub ? ' · ' + i.sub : ''), z });
  }))); } catch (e) { }
  return { plate: (s.plate || '').trim(), vin, model: carName(), year: s.year || '', panne, ins: ins ? { ...ins, nr: o.ins && o.ins.nr || '' } : (o.ins && o.ins.nr ? { name: o.ins.name || 'Versicherung', nr: o.ins.nr } : null), contact: o.contact && o.contact.tel ? o.contact : null, items };
}
const sosTelHref = (t) => 'tel:' + String(t || '').replace(/[^\d+]/g, '');
/** Parkposition vom Auto (aus dem letzten Fahrzeugstatus) */
function sosCarPos() { try { const c = load(KEY_WXO + 'S', null), p = c && c.d && c.d.park; if (p && isFinite(p.lat) && isFinite(p.lon)) return { lat: +p.lat, lon: +p.lon, at: p.at ? Date.parse(p.at) : c.t, src: 'car', addr: p.addr || '' }; } catch (e) { } return null; }
function sosPos() { const g = sosLoc && Date.now() - sosLoc.at < 30 * 60e3 ? sosLoc : null, c = sosCarPos(); return g || c; }
const sosAge = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : new Date(t).toLocaleDateString('de-DE'); };
const sosCoord = (p) => p.lat.toFixed(5).replace('.', ',') + ' · ' + p.lon.toFixed(5).replace('.', ',');
const sosMapsUrl = (p) => 'https://www.google.com/maps/search/?api=1&query=' + p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
function sosLocate() {
  if (sosBusy) return; if (!navigator.geolocation) { appNote('Standort wird von diesem Gerät nicht unterstützt'); return; }
  sosBusy = true; sosRenderAll();
  navigator.geolocation.getCurrentPosition((p) => { sosBusy = false; sosLoc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now(), src: 'gps' }; sosRenderAll(); },
    (e) => { sosBusy = false; sosRenderAll(); appNote(e && e.code === 1 ? 'Standort nicht freigegeben – in den Browser-Einstellungen erlauben' : 'Standort nicht ermittelbar – ist die Ortung am Handy an?'); },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}
async function sosShare(p) {
  const t = 'Mein Standort (' + (p.src === 'car' ? 'Parkposition Auto' : 'Handy-GPS') + '): ' + sosCoord(p) + '\n' + sosMapsUrl(p);
  try { if (navigator.share) { await navigator.share({ title: 'Mein Standort', text: t }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const ok = await errCopy(t); appNote(ok ? '✓ Standort kopiert' : 'Kopieren nicht möglich');
}
/** Kleine Karte: 3×3 OSM-Kacheln um den Punkt (Zoom 15), dunkel per Filter */
function sosMap(p, h, nx, cx, ny) {
  nx = nx || 1; cx = cx || '50%'; ny = ny || 1;
  const z = 15, n = 2 ** z, xf = (p.lon + 180) / 360 * n, lr = p.lat * Math.PI / 180, yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n, tx = Math.floor(xf), ty = Math.floor(yf);
  let t = ''; for (let dx = -nx; dx <= nx; dx++) for (let dy = -ny; dy <= ny; dy++) t += `<img src="https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png" alt="" width="256" height="256" loading="lazy" draggable="false" class="absolute max-w-none" style="left:calc(${cx} + ${Math.round((tx + dx - xf) * 256)}px);top:calc(50% + ${Math.round((ty + dy - yf) * 256)}px)">`;
  return `<div class="relative overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-800" style="height:${h}px"><div class="sos-tiles absolute inset-0">${t}</div>
    <span class="sos-dot absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-[6px] ring-red-500/35" style="left:${cx}"></span>
    <span class="absolute bottom-0.5 right-1.5 text-[9px] text-slate-600 dark:text-slate-400">© OpenStreetMap</span></div>`;
}
function sosLocLine(p) { return p ? (p.src === 'car' ? '🚗 Parkposition vom Auto · ' + sosAge(p.at) : '📍 Handy-GPS ± ' + (p.acc || '?') + ' m · ' + sosAge(p.at)) : ''; }

/* ---- Widget ---- */
function renderSosCard() {
  const el = $('sos-card'); if (!el) return; el.classList.toggle('hidden', isSimple()); setTimeout(() => { try { dashSwipeSync(); } catch (e) { } }, 0);
  const d = sosData(), p = sosPos(), tri = d.items.find(i => /warndreieck/i.test(i.n)), kit = d.items.find(i => /repair|reifen/i.test(i.n));
  const btn = 'rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-center text-[12px] font-semibold active:scale-95 transition';
  if (isDesk()) {   // PC: zwei Spalten – links 112 + Knöpfe + „Liegt im Auto“, rechts Karte über volle Höhe
    const b2 = 'rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-center text-[12px] font-semibold active:scale-95 transition';
    const mp = p ? sosMap(p, 999, 3, 'calc(50% + 165px)').replace('style="height:999px"', 'style="height:100%"').replace('rounded-2xl bg-slate-200', 'bg-slate-200') : '';
    el.innerHTML = `<div class="relative -m-4 flex min-h-0 flex-1">${p ? `<div class="absolute inset-0">${mp}</div><div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-white from-[36%] via-white/75 via-[48%] to-transparent to-[64%] dark:from-slate-900 dark:via-slate-900/75"></div>` : ''}<div class="relative flex min-h-0 flex-1 gap-3 p-4"><div class="flex w-[310px] shrink-0 flex-col gap-2">
      <div class="flex items-center gap-2"><span class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-600 text-[11px]">🆘</span><p class="min-w-0 flex-1 font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Notfall</p></div>
      <a href="tel:112" data-sosnop class="flex items-center gap-3 rounded-2xl bg-red-600 px-3.5 py-2.5 text-white active:scale-[0.99] transition"><span class="text-[22px]">🚑</span><span class="min-w-0 flex-1"><span class="block text-xl font-extrabold leading-none">112</span><span class="block truncate text-[11px] opacity-90">Notruf · Unfall mit Verletzten</span></span><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">📞</span></a>
      <div class="grid grid-cols-3 gap-1.5">${p ? `<button type="button" data-sosshare class="${b2}">📤 Teilen</button>` : `<button type="button" data-sosloc class="${b2}">📍 Orten</button>`}
        ${d.panne ? `<a href="${sosTelHref(d.panne.tel)}" data-sosnop class="${b2}">🛠️ Panne</a>` : `<button type="button" class="${b2} opacity-60">🛠️ Panne</button>`}
        ${d.ins && d.ins.tel ? `<a href="${sosTelHref(d.ins.tel)}" data-sosnop class="${b2}">🛡️ ${esc((d.ins.name || 'Versicherung').split(' ')[0].slice(0, 12))}</a>` : `<button type="button" class="${b2} opacity-60">🛡️ Versich.</button>`}</div>
      <div class="mt-auto min-h-0 overflow-hidden text-[11.5px] leading-[1.6] text-slate-500 dark:text-slate-400">${d.items.length ? `<p class="font-semibold text-slate-700 dark:text-slate-300">🧰 Liegt im Auto</p>${d.items.slice(0, 3).map(i => `<p class="truncate">${esc(i.n)} · ${esc(i.where)}</p>`).join('')}` : 'Antippen: alle Notfall-Infos'}</div></div>
      <div class="relative min-w-0 flex-1">${p ? `<div class="absolute bottom-0 right-0 max-w-full truncate rounded-lg bg-white/85 dark:bg-slate-900/80 px-2.5 py-1 text-[12px] font-semibold">${esc((p.addr ? p.addr + ' · ' : '') + sosLocLine(p))}</div>`
        : `<button type="button" data-sosloc class="absolute inset-0 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-[13px] font-semibold active:scale-[0.99]">${sosBusy ? '⏳ Standort wird ermittelt …' : '📍 Standort ermitteln'}<span class="text-[11px] font-normal text-slate-500 dark:text-slate-400">Handy-GPS · sonst Parkposition vom Auto</span></button>`}</div></div></div>`;
    return;
  }
  el.innerHTML = `<div class="flex items-center gap-2"><span class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-600 text-[11px]">🆘</span><p class="min-w-0 flex-1 font-barlow text-xl font-bold uppercase tracking-[0.08em] leading-6">Notfall</p>
      <a href="tel:112" data-sosnop class="rounded-xl bg-red-600 px-3 py-1 text-[13px] font-extrabold text-white active:scale-95 transition">📞 112</a></div>
    <div class="relative mt-2.5 min-h-0 flex-1">${p ? `<div class="absolute inset-0">${sosMap(p, 999).replace('style="height:999px"', 'style="height:100%"')}</div><div class="absolute inset-x-2 bottom-1.5 truncate text-[11.5px] font-semibold text-slate-800 dark:text-slate-100 [text-shadow:0_0_6px_rgba(255,255,255,.8)] dark:[text-shadow:0_0_6px_rgba(0,0,0,.9)]">${esc(sosLocLine(p))}</div>`
      : `<button type="button" data-sosloc class="absolute inset-0 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-[13px] font-semibold active:scale-[0.99]">${sosBusy ? '⏳ Standort wird ermittelt …' : '📍 Standort ermitteln'}<span class="text-[11px] font-normal text-slate-500 dark:text-slate-400">Handy-GPS · sonst Parkposition vom Auto</span></button>`}</div>
    <div class="mt-2 grid grid-cols-3 gap-1.5">${p ? `<button type="button" data-sosshare class="${btn}">📤 Teilen</button>` : `<button type="button" data-sosloc class="${btn}">📍 Orten</button>`}
      ${d.panne ? `<a href="${sosTelHref(d.panne.tel)}" data-sosnop class="${btn}">🛠️ Panne</a>` : `<button type="button" class="${btn} opacity-60">🛠️ Panne</button>`}
      ${d.ins && d.ins.tel ? `<a href="${sosTelHref(d.ins.tel)}" data-sosnop class="${btn}">🛡️ ${esc((d.ins.name || 'Versicherung').split(' ')[0].slice(0, 12))}</a>` : `<button type="button" class="${btn} opacity-60">🛡️ Versich.</button>`}</div>
    <p class="mt-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">${tri || kit ? '🧰 ' + esc([tri && 'Warndreieck: ' + tri.where, kit && !tri ? kit.n + ': ' + kit.where : ''].filter(Boolean).join(' · ')) : 'Antippen: alle Notfall-Infos'}</p>`;
}
try { matchMedia('(min-width: 1280px)').addEventListener('change', () => { try { renderSosCard(); if (!$('sos-page').classList.contains('hidden')) renderSosPage(); } catch (e) { } }); } catch (e) { }
$('sos-card').addEventListener('click', (e) => {
  if (e.target.closest('[data-sosnop]')) return;                                       // Anruf-Links normal ausführen
  if (e.target.closest('[data-sosloc]')) { sosLocate(); return; }
  if (e.target.closest('[data-sosshare]')) { const p = sosPos(); if (p) sosShare(p); return; }
  sosOpen();
});

/* ---- Notfallseite (Variante A) ---- */
function sosOpen() { const pg = $('sos-page'); sosEdit = false; renderSosPage(); pg.classList.remove('hidden'); document.documentElement.classList.add('overflow-hidden'); pg.scrollTop = 0; try { history.pushState({ sos: 1 }, ''); } catch (e) { } }
function sosClose(fromPop) { const pg = $('sos-page'); if (pg.classList.contains('hidden')) return; pg.classList.add('hidden'); document.documentElement.classList.remove('overflow-hidden'); if (!fromPop) try { if (history.state && history.state.sos) history.back(); } catch (e) { } }
window.addEventListener('popstate', () => sosClose(true));
function sosCall(ic, t, s, href, cls, ph) {
  return `<a href="${href || '#'}" ${href ? 'data-sosnop' : 'data-sosedit'} class="flex items-center gap-3 rounded-2xl ${cls} px-4 py-3 active:scale-[0.99] transition"><span class="text-2xl">${ic}</span><span class="min-w-0 flex-1"><span class="block text-[16px] font-extrabold leading-tight">${esc(t)}</span><span class="block truncate text-[12px] opacity-80">${esc(s)}</span></span><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ph || 'bg-white/20'} text-lg">${href ? '📞' : '✎'}</span></a>`;
}
function renderSosPage() {
  const pg = $('sos-page'); if (!pg) return; const d = sosData(), p = sosPos(), o = getSettings().sos || {}, inp = inCls;
  const top = `<div class="px-4 pb-1 text-white" style="padding-top:calc(env(safe-area-inset-top) + 10px)"><div class="flex items-center gap-1.5"><button type="button" data-sosclose class="-ml-1.5 flex h-9 w-7 shrink-0 items-center justify-center text-[32px] leading-none" aria-label="Zurück">‹</button><p class="min-w-0 flex-1 font-barlow text-[34px] font-bold uppercase tracking-[0.1em] leading-none">Notfall</p><button type="button" data-sosedit class="flex h-9 min-w-[36px] shrink-0 items-center justify-center rounded-full bg-black/25 px-2.5 text-[14px] font-semibold" aria-label="Angaben bearbeiten">${sosEdit ? '✓ Fertig' : '✎'}</button></div>
      <p class="mt-1.5 text-[13px] opacity-90">Ruhe bewahren · Warnblinker an · Weste anziehen</p><span class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-black/25 px-2 py-0.5 text-[11px] font-bold"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>offline bereit</span></div>`;
  let b = '';
  if (sosEdit) {
    const f = (id, lab, v, ph, im) => `<div><label for="${id}" class="text-xs text-slate-500 dark:text-slate-400">${lab}</label><input id="${id}" type="text" ${im ? 'inputmode="tel"' : ''} value="${esc(v || '')}" placeholder="${esc(ph || '')}" class="${inp}"></div>`;
    b = `<div class="space-y-3 rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-4 text-left shadow-xl shadow-black/30"><p class="text-sm font-bold">Notfall-Angaben</p><p class="text-[12px] text-slate-500 dark:text-slate-400">Leer gelassen sucht die App passende Nummern in Wissen. Kennzeichen und FIN stehen unter Fahrzeug &amp; Kauf.</p>
      <div class="grid grid-cols-2 gap-2">${f('sos-pn', 'Pannenhilfe (Name)', o.panne && o.panne.name, d.panne ? d.panne.name : 'Škoda Pannenhilfe')}${f('sos-pt', 'Telefon', o.panne && o.panne.tel, d.panne ? d.panne.tel : '', 1)}</div>
      <div class="grid grid-cols-2 gap-2">${f('sos-in', 'Versicherung (Name)', o.ins && o.ins.name, d.ins ? d.ins.name : 'z. B. HUK-Coburg')}${f('sos-it', 'Schaden-Hotline', o.ins && o.ins.tel, d.ins ? d.ins.tel : '', 1)}</div>
      ${f('sos-inr', 'Versicherungsnummer / Vertrag', o.ins && o.ins.nr, '')}
      <div class="grid grid-cols-2 gap-2">${f('sos-cn', 'Notfallkontakt', o.contact && o.contact.name, 'z. B. Papa')}${f('sos-ct', 'Telefon', o.contact && o.contact.tel, '', 1)}</div>
      <button type="button" data-sossave class="h-11 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white">Speichern</button></div>`;
  } else {
    const calls = [sosCall('🚑', '112 Notruf', 'Unfall mit Verletzten · Feuer', 'tel:112', 'bg-white text-red-700 shadow-xl shadow-black/30', 'bg-red-600 text-white'),
      d.panne ? sosCall('🛠️', d.panne.name || 'Pannenhilfe', d.panne.tel, sosTelHref(d.panne.tel), 'bg-black/25 text-white ring-1 ring-white/5') : sosCall('🛠️', 'Pannenhilfe', 'Nummer eintragen', '', 'bg-black/25 text-white ring-1 ring-white/5'),
      d.ins && d.ins.tel ? sosCall('🛡️', d.ins.name || 'Versicherung', d.ins.tel + (d.ins.nr ? ' · Nr. ' + d.ins.nr : ''), sosTelHref(d.ins.tel), 'bg-black/25 text-white ring-1 ring-white/5') : sosCall('🛡️', 'Versicherung', 'Schaden-Hotline eintragen', '', 'bg-black/25 text-white ring-1 ring-white/5'),
      d.contact ? sosCall('👤', d.contact.name || 'Notfallkontakt', d.contact.tel, sosTelHref(d.contact.tel), 'bg-black/25 text-white ring-1 ring-white/5') : ''].filter(Boolean);
    if (isDesk()) { b = sosDeskPage(d, p, calls); pg.innerHTML = `<div class="flex min-h-full flex-col" style="background:linear-gradient(180deg,#000 0,#000 env(safe-area-inset-top),rgba(0,0,0,.55) calc(env(safe-area-inset-top) + 80px),rgba(0,0,0,0) calc(env(safe-area-inset-top) + 230px))">${b}</div>`; return; }
    b += `<div class="space-y-2">${calls.join('')}</div>`;
    b += `<div class="rounded-3xl bg-black/25 ring-1 ring-white/5 p-4 text-left"><div class="flex items-baseline justify-between"><p class="text-sm font-bold">📍 Standort</p>${p ? `<span class="text-[11px] ${p.src === 'gps' ? 'text-emerald-300' : 'text-green-300'}">${esc(sosLocLine(p))}</span>` : ''}</div>
      ${p ? `<div class="mt-2">${sosMap(p, 150)}</div><p class="mt-2 font-mono text-[13px]">${sosCoord(p)}</p>${p.addr ? `<p class="text-[12px] text-red-100/80">${esc(p.addr)}</p>` : ''}
        <div class="mt-2 grid grid-cols-3 gap-1.5 text-[12px] font-semibold"><button type="button" data-sosshare class="rounded-xl bg-white/10 py-2">📤 Teilen</button><a href="${sosMapsUrl(p)}" target="_blank" rel="noopener" data-sosnop class="rounded-xl bg-white/10 py-2 text-center">🗺️ Karte</a><button type="button" data-soscopy class="rounded-xl bg-white/10 py-2">📋 Kopieren</button></div>` : ''}
      ${!p || p.src === 'car' ? `<button type="button" data-sosloc class="mt-2 h-10 w-full rounded-xl border border-dashed border-white/30 text-[13px] font-semibold">${sosBusy ? '⏳ wird ermittelt …' : '📍 Genauer per Handy-GPS ermitteln'}</button>` : ''}
      <p class="mt-2 text-[11.5px] leading-snug text-red-100/75">Ohne Ortung: Auf der Autobahn zeigen Schilder an den Leitpfosten den Kilometer, Pfeile die Richtung zur nächsten Notrufsäule. Die 112 ortet dein Handy in der Regel selbst.</p></div>`;
    if (d.items.length) b += `<div class="rounded-3xl bg-black/25 ring-1 ring-white/5 p-4 text-left"><p class="text-sm font-bold">🧰 Liegt im Auto</p>${d.items.slice(0, 8).map(i => `<div class="flex items-start justify-between gap-3 border-t border-white/10 py-2 text-[13px]"><span>${esc(i.n)}</span><span class="text-right text-red-100/75">${esc(i.where)}</span></div>`).join('')}</div>`;
    const facts = [['Kennzeichen', d.plate], ['FIN', d.vin], ['Fahrzeug', d.model], ['Erstzulassung', d.year], ['Versicherung', d.ins ? (d.ins.name || '') + (d.ins.nr ? ' · ' + d.ins.nr : '') : '']].filter(x => x[1]);
    if (facts.length) b += `<div class="grid grid-cols-2 gap-2">${facts.map(([k, v]) => `<button type="button" data-soscp="${esc(v)}" class="min-w-0 rounded-2xl bg-black/25 ring-1 ring-white/5 px-3 py-2 text-left active:scale-[0.98]"><span class="block text-[10.5px] text-red-100/75">${k}</span><span class="block truncate text-[13px] font-semibold ${k === 'FIN' ? 'font-mono' : ''}">${esc(v)}</span></button>`).join('')}</div><p class="text-center text-[11px] text-red-100/70">Angaben antippen zum Kopieren</p>`;
  }
  pg.innerHTML = `<div class="min-h-full" style="background:linear-gradient(180deg,#000 0,#000 env(safe-area-inset-top),rgba(0,0,0,.55) calc(env(safe-area-inset-top) + 80px),rgba(0,0,0,0) calc(env(safe-area-inset-top) + 230px))">` + top + `<div class="mx-auto max-w-xl space-y-3 px-4 pb-10 pt-4">${b}</div></div>`;
}
$('sos-page').addEventListener('click', async (e) => {
  if (e.target.closest('[data-sosnop]')) return;
  if (e.target.closest('[data-sosclose]')) { sosClose(); return; }
  if (e.target.closest('[data-sosedit]')) { e.preventDefault(); sosEdit = !sosEdit; renderSosPage(); return; }
  if (e.target.closest('[data-sosloc]')) { sosLocate(); return; }
  const p = sosPos();
  if (e.target.closest('[data-sosshare]') && p) { sosShare(p); return; }
  if (e.target.closest('[data-soscopy]') && p) { const ok = await errCopy(sosCoord(p) + ' – ' + sosMapsUrl(p)); appNote(ok ? '✓ Standort kopiert' : 'Kopieren nicht möglich'); return; }
  const cp = e.target.closest('[data-soscp]'); if (cp) { const ok = await errCopy(cp.dataset.soscp); appNote(ok ? '✓ Kopiert' : 'Kopieren nicht möglich'); return; }
  if (e.target.closest('[data-sossave]')) {
    const v = (id) => ($(id).value || '').trim(), pr = (n, t, x) => (n || t || x) ? Object.fromEntries(Object.entries({ name: n, tel: t, nr: x }).filter(([, y]) => y)) : null;
    const sos = { panne: pr(v('sos-pn'), v('sos-pt')), ins: pr(v('sos-in'), v('sos-it'), v('sos-inr')), contact: pr(v('sos-cn'), v('sos-ct')) };
    Object.keys(sos).forEach(k => { if (!sos[k]) delete sos[k]; });
    setQuickSetting('sos', Object.keys(sos).length ? sos : undefined); sosEdit = false; sosRenderAll(); appNote('✓ Notfall-Angaben gespeichert');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sos-page').classList.contains('hidden')) sosClose(); });
function sosRenderAll() { try { renderSosCard(); } catch (e) { } try { if (!$('sos-page').classList.contains('hidden')) renderSosPage(); } catch (e) { } }
$('simple-sos').addEventListener('click', () => sosOpen());
{ const rd = renderDashboard; renderDashboard = function () { const r = rd.apply(this, arguments); try { renderSosCard(); } catch (e) { } return r; }; }
{ const rv = renderVehCard; renderVehCard = function () { const r = rv.apply(this, arguments); try { renderSosCard(); } catch (e) { } return r; }; }   // neue Parkposition vom Auto
try { renderSosCard(); } catch (e) { }

/* ---- Notfallseite am PC (Variante B): Kopf in einer Zeile, Anrufe oben nebeneinander, Karte groß (2/3) mit Adresse + Aktionen
   auf der Karte, rechts „Liegt im Auto“ + Fahrzeugdaten. Bearbeiten-Formular bleibt wie am Handy. */
function sosDeskPage(d, p, calls) {
  const head = `<div class="flex items-center gap-3 px-8 pb-1 text-white" style="padding-top:calc(env(safe-area-inset-top) + 18px)"><button type="button" data-sosclose class="-ml-1.5 flex h-10 w-7 shrink-0 items-center justify-center text-[34px] leading-none" aria-label="Zurück">‹</button>
    <p class="shrink-0 font-barlow text-[36px] font-bold uppercase tracking-[0.1em] leading-none">Notfall</p><p class="ml-3 truncate text-[13px] opacity-90">Ruhe bewahren · Warnblinker an · Weste anziehen</p>
    <span class="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-black/25 px-2 py-0.5 text-[11px] font-bold"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>offline bereit</span>
    <button type="button" data-sosedit class="ml-auto flex h-10 min-w-[40px] shrink-0 items-center justify-center rounded-full bg-black/25 px-3 text-[15px] font-semibold" aria-label="Angaben bearbeiten">✎</button></div>`;
  const ov = 'rounded-xl bg-black/70 px-3.5 py-2.5 text-[13px] font-semibold backdrop-blur-sm active:scale-95 transition';
  const map = p ? `<div class="absolute inset-0">${sosMap(p, 999, 4, '50%', 2).replace('style="height:999px"', 'style="height:100%"').replace('rounded-2xl bg-slate-200', 'rounded-3xl bg-slate-200')}</div>
      <div class="absolute bottom-4 left-4 max-w-[45%] rounded-2xl bg-black/70 px-4 py-3 backdrop-blur-sm"><p class="text-[11.5px] font-bold ${p.src === 'gps' ? 'text-emerald-300' : 'text-green-300'}">${esc(sosLocLine(p))}</p><p class="mt-0.5 font-mono text-[13px]">${sosCoord(p)}</p>${p.addr ? `<p class="truncate text-[13px] text-red-100/85">${esc(p.addr)}</p>` : ''}</div>
      <div class="absolute bottom-4 right-4 flex gap-1.5"><button type="button" data-sosshare class="${ov}">📤 Teilen</button><a href="${sosMapsUrl(p)}" target="_blank" rel="noopener" data-sosnop class="${ov}">🗺️ Karte</a><button type="button" data-soscopy class="${ov}">📋 Kopieren</button>${p.src === 'car' ? `<button type="button" data-sosloc class="${ov}">${sosBusy ? '⏳ wird ermittelt …' : '📍 Genauer per GPS'}</button>` : ''}</div>`
    : `<button type="button" data-sosloc class="absolute inset-0 flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/30 bg-black/20 text-[16px] font-semibold">${sosBusy ? '⏳ Standort wird ermittelt …' : '📍 Standort ermitteln'}<span class="text-[12px] font-normal text-red-100/75">Handy-GPS · sonst Parkposition vom Auto</span></button>`;
  const items = d.items.length ? `<div class="rounded-3xl bg-black/25 ring-1 ring-white/5 p-4 text-left"><p class="text-sm font-bold">🧰 Liegt im Auto</p>${d.items.slice(0, 8).map(i => `<div class="flex items-start justify-between gap-3 border-t border-white/10 py-2 text-[13px]"><span>${esc(i.n)}</span><span class="text-right text-red-100/75">${esc(i.where)}</span></div>`).join('')}</div>` : '';
  const facts = [['Kennzeichen', d.plate], ['FIN', d.vin], ['Fahrzeug', d.model], ['Erstzulassung', d.year], ['Versicherung', d.ins ? (d.ins.name || '') + (d.ins.nr ? ' · ' + d.ins.nr : '') : '']].filter(x => x[1]);
  const fh = facts.length ? `<div class="grid grid-cols-2 gap-2">${facts.map(([k, v]) => `<button type="button" data-soscp="${esc(v)}" class="min-w-0 rounded-2xl bg-black/25 ring-1 ring-white/5 px-3 py-2 text-left active:scale-[0.98]"><span class="block text-[10.5px] text-red-100/75">${k}</span><span class="block truncate text-[13px] font-semibold ${k === 'FIN' ? 'font-mono' : ''}">${esc(v)}</span></button>`).join('')}</div>` : '';
  const cols = calls.length >= 4 ? 'grid-cols-4' : 'grid-cols-3';
  return head + `<div class="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-8 pt-4">
    <div class="grid ${cols} gap-3">${calls.join('')}</div>
    <div class="flex min-h-[460px] flex-1 gap-4"><div class="relative min-w-0 flex-1">${map}</div>
      <div class="no-scrollbar flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto">${items}${fh}<p class="mt-auto text-[12px] leading-snug text-red-100/75">Ohne Ortung: Auf der Autobahn zeigen Schilder an den Leitpfosten den Kilometer, Pfeile die Richtung zur nächsten Notrufsäule. Die 112 ortet dein Handy in der Regel selbst.</p></div></div></div>`;
}
