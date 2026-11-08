/* =====================================================================
   Historie: Liste aller Zählerstände, neueste zuerst
   ===================================================================== */
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
let editMode = false;

const INPUT_CLS = 'w-full min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500';
const toLocalInput = (iso) => {                       // ISO-Datum -> Wert für <input type="datetime-local">
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** Ladedauer als hh:mm aus geladenen kWh und Ladeleistung (chargePowerKw()). */
const fmtDuration = (kwh) => { const m = Math.round(kwh / chargePowerKw() * 60); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
const durHm = (ms) => { const m = Math.round(ms / 60000); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
const realMsOf = (r) => { const ms = r.chargeStart && r.chargeEnd ? Date.parse(r.chargeEnd) - Date.parse(r.chargeStart) : 0; return ms > 0 ? ms : 0; };   // gemessene Ladedauer
/* ---- Wallbox-Wächter: Ø Leistung einer Ladung Zuhause (Zähler-kWh / gemessene Dauer, sonst Wert vom Auto) und üblicher Wert (Median der letzten 10) ---- */
const WB_SLOW = 0.6;                                                    // Hinweis unter 60 % der üblichen Leistung
const homePowerOf = (r) => { const ms = realMsOf(r); return ms && r.consumedSinceLast > 0 ? r.consumedSinceLast / (ms / 3600000) : (r.avgPowerKw > 0 ? r.avgPowerKw : null); };
const wbMedian = (a) => { if (a.length < 3) return null; const x = a.slice().sort((p, q) => p - q), m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
/** Je Eintrag (Index) die Leistung und den üblichen Wert der bis zu 10 vorherigen Ladungen Zuhause. */
function wbFlags(rs) {
  const out = new Map(), prev = [];
  rs.forEach((r, i) => { if (!isHome(r)) return; const kw = homePowerOf(r); if (!(kw > 0.3)) return; const usual = wbMedian(prev.slice(-10)); out.set(i, { kw, usual, slow: usual != null && kw < usual * WB_SLOW }); prev.push(kw); });
  return out;
}
/** Üblicher Wert vom Auto (für den Live-Vergleich mit der Leistung laut MyŠkoda), sonst aus dem Zähler. */
function wbUsualLive() { const h = getReadings().filter(isHome), car = h.map(r => r.avgPowerKw).filter(v => v > 0.3).slice(-10); return wbMedian(car) ?? wbMedian(h.map(homePowerOf).filter(v => v > 0.3).slice(-10)); }
const chargeDurationOf = (r) => realMsOf(r) ? durHm(realMsOf(r)) : isHome(r) ? fmtDuration(r.consumedSinceLast) : '–';
const unitPriceOf = (r) => isHome(r) && r.consumedSinceLast > 0 ? r.cost / r.consumedSinceLast : getSettings().price;
const cell = (i, f) => $('history-list').querySelector(`li[data-idx="${i}"] [data-f="${f}"]`);

function setEditMode(on) {
  editMode = on;
  if (!on && deferredCosts) { save(KEY_COSTS, deferredCosts); deferredCosts = null; }
  if (!on && deferredCloud) { applyCloud(deferredCloud); deferredCloud = null; }   // während des Bearbeitens eingegangene Cloud-Daten jetzt übernehmen
  $('btn-edit').classList.toggle('hidden', on);
  $('btn-edit-cancel').classList.toggle('hidden', !on);
  $('btn-edit-save').classList.toggle('hidden', !on);
  renderHistory();
  updateHistFab();
}

function renderHistory() {
  const readings = getReadings(), costs = getCosts();
  $('btn-edit').classList.toggle('hidden', editMode || readings.length + costs.length === 0);
  const lbl = 'text-xs text-slate-500 dark:text-slate-400';

  const wbF = wbFlags(readings);
  const rHtml = readings.map((r, i) => {
    const d = new Date(r.date), place = placeOf(r), home = place === 'home';
    const pj = prevHomeIdx(readings, i), oldVal = pj >= 0 ? readings[pj].totalReading : null;     // alter Stand = Wert des Vorgängers am Zähler (Bosch/Unterwegs zählen nicht)
    const isStart = home && oldVal === null && !r.meterReset;        // reiner Startwert ohne Ladung (erster Zuhause-Eintrag ohne Zähler-Reset)

    const st = entryStats(readings, i);
    const row = (k, v) => `<div class="flex justify-between items-baseline mt-2"><span class="text-sm text-slate-500 dark:text-slate-400">${k}</span><span class="font-medium text-right">${v}</span></div>`;
    const extra = (st.comfort > 0 ? row('↳ davon 🔥 Komfort', '<span class="text-amber-600 dark:text-amber-300">' + fmt(st.comfort, 1) + ' kWh' + (unitOf(r) != null ? ' · ' + eur(st.comfort * unitOf(r)) : '') + '</span>') : '') +
      (r.odometerKm != null ? row('Kilometerstand', (st.km ? '<span class="text-xs font-normal text-slate-500">(+' + fmt(st.km, 0) + ' km)</span> ' : '') + fmt(r.odometerKm, 0) + ' km') : '') +
      (r.battTemp != null ? row('Akku-Temperatur', btFmt(r.battTemp).replace('-', '−') + ' °C') : '') +
      (r.socStart != null && r.socEnd != null ? row('Ladestand', (st.loss != null && st.loss >= 0 && st.loss < 60 ? '<span class="text-xs font-normal text-slate-500">(Verlust ≈ ' + fmt(st.loss, 0) + ' %)</span> ' : '') + r.socStart + ' % → ' + r.socEnd + ' %') + row('Batteriekapazität', fmt(capOf(r), 1) + ' kWh') : '') +
      (st.kwh100 != null ? row('Gesamtverbrauch/100 km', (st.method === 'charge' ? '≈ ' : '') + fmt(st.kwh100, 1) + ' kWh' + (st.cost100 != null ? ' · ' + eur(st.cost100) : ''))
        + (st.method === 'charge' ? '<p class="text-xs text-slate-500 mt-1 text-right">grob: ohne Akku-% der letzten Ladung aus den geladenen kWh berechnet</p>' : st.rough ? '<p class="text-xs text-slate-500 mt-1 text-right">kleine Akku-Entnahme – Wert ungenau</p>' : '')
        + (st.cost100 == null ? '<p class="text-xs text-slate-500 mt-1 text-right">Preis fehlt – €/100 km nicht berechenbar (im Bearbeiten-Modus eintragen)</p>' : '') : '') +
      (st.gap ? row('Verbrauch/100 km', '–') + '<p class="text-xs text-slate-500 mt-1 text-right">Akku-Start liegt über dem Ende der letzten Ladung – dazwischen wurde woanders geladen</p>' : '');

    const realMs = realMsOf(r), faint = 'text-xs font-normal text-slate-500';
    const durRows = realMs && r.consumedSinceLast > 0
      ? row('Ladedauer <span class="text-xs">(gemessen)</span>', durHm(realMs) + ' h') +
        row('Ø Leistung am Zähler', (r.avgPowerKw != null ? '<span class="' + faint + '">(Auto: ' + fmt(r.avgPowerKw, 1) + ' kW)</span> ' : '') + fmt(r.consumedSinceLast / (realMs / 3600000), 1) + ' kW')
        + (home && wbF.get(i)?.slow ? '<p class="text-xs text-amber-700 dark:text-amber-300 mt-1 text-right">Deutlich langsamer als üblich (' + fmt(wbF.get(i).usual, 1) + ' kW) – nur eine Phase? Sicherung, Kabel und Ladestrom im Auto prüfen.</p>' : '')
      : `<div class="flex justify-between items-baseline mt-2">
        <span class="text-sm text-slate-500 dark:text-slate-400">Ladedauer <span class="text-xs">(bei ${chargePowerKw()} kW)</span></span>
        <span class="text-lg font-semibold">${isStart ? '–' : fmtDuration(r.consumedSinceLast) + ' h'}</span>
      </div>`;

    if (editMode) {
      const gh = home ? '' : ' hidden', ga = home ? ' hidden' : '';       // Feldgruppen je nach gewähltem Ladeort ein-/ausblenden
      return `<li data-idx="${i}" data-kind="laden" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4 ring-2 ring-emerald-500/40">
        <input type="datetime-local" data-f="date" value="${toLocalInput(r.date)}" class="${INPUT_CLS}">
        <select data-f="place" aria-label="Ladeort" class="${INPUT_CLS} mt-3">${PLACE_KEYS.map(k => `<option value="${k}" ${k === place ? 'selected' : ''}>${PLACES[k]}</option>`).join('')}</select>
        <div class="g-home${gh}">
          <div class="grid grid-cols-3 gap-2 mt-3 text-center">
            <div><p class="${lbl} mb-1">Alt</p>${oldVal === null ? '<p class="py-2">–</p>'
              : `<input data-f="old" type="text" inputmode="decimal" value="${oldVal.toFixed(1)}" ${r.meterReset ? 'disabled' : ''} class="${INPUT_CLS} disabled:opacity-40">`}</div>
            <div><p class="${lbl} mb-1">Neu</p><input data-f="new" type="text" inputmode="decimal" value="${r.totalReading.toFixed(1)}" class="${INPUT_CLS}"></div>
            <div><p class="${lbl} mb-1">Geladen</p><p data-f="diff" class="py-2 font-semibold text-emerald-700 dark:text-emerald-300">–</p></div>
          </div>
          <div class="flex justify-between items-baseline mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <span class="text-sm text-slate-500 dark:text-slate-400">Kosten</span>
            <span data-f="cost" class="text-lg font-semibold">–</span>
          </div>
          <div class="flex justify-between items-baseline mt-2">
            <span class="text-sm text-slate-500 dark:text-slate-400">Ladedauer</span>
            <span data-f="dur" class="text-lg font-semibold">–</span>
          </div>
        </div>
        <div class="g-away${ga}">
          <div class="g-grid grid gap-1.5 mt-3 text-center" style="grid-template-columns:${place === 'away' ? '0.85fr 0.95fr 0.85fr 1.35fr' : 'repeat(3,minmax(0,1fr))'}">
            <div class="min-w-0"><p class="${lbl} mb-1">kWh</p><input data-f="kwh" type="text" inputmode="decimal" value="${!home && r.consumedSinceLast > 0 ? String(r.consumedSinceLast).replace('.', ',') : ''}" class="${INPUT_CLS} text-sm"></div>
            <div class="min-w-0"><p class="${lbl} mb-1">€/kWh</p><input data-f="price" type="text" inputmode="decimal" value="${!home && r.pricePerKwh != null ? String(r.pricePerKwh).replace('.', ',') : ''}" class="${INPUT_CLS} text-sm"></div>
            <div class="min-w-0"><p class="${lbl} mb-1">Gebühr €</p><input data-f="fee" type="text" inputmode="decimal" value="${r.fee != null ? String(r.fee).replace('.', ',') : ''}" class="${INPUT_CLS} text-sm"></div>
            <div class="g-prov min-w-0${place === 'away' ? '' : ' hidden'}"><p class="${lbl} mb-1">Anbieter</p><select data-f="prov" class="${INPUT_CLS} h-[42px] px-1 py-0 text-sm">${providerOptions(r.provider || '')}</select></div>
          </div>
          <div class="flex justify-between items-baseline mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <span class="text-sm text-slate-500 dark:text-slate-400">Kosten</span>
            <span data-f="acost" class="text-lg font-semibold">–</span>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-3 text-center">
          <div data-kmwrap><p class="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">km-Stand <button type="button" data-kmfetch title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition after:absolute after:-inset-2.5">↻</button></p><input data-f="km" type="text" inputmode="decimal" value="${r.odometerKm ?? ''}" class="${INPUT_CLS}"></div>
          <div><p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Akku Start %</p><input data-f="s0" type="text" inputmode="decimal" value="${r.socStart ?? ''}" class="${INPUT_CLS}"></div>
          <div><p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Akku Ende %</p><input data-f="s1" type="text" inputmode="decimal" value="${r.socEnd ?? ''}" class="${INPUT_CLS}"></div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Kapazität kWh</p><input data-f="cap" type="text" inputmode="decimal" value="${capOf(r)}" class="${INPUT_CLS}"></div>
          <div><p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Akku °C</p><input data-f="bt" type="text" inputmode="text" value="${r.battTemp ?? ''}" placeholder="–" class="${INPUT_CLS}"></div>
          <div><p class="text-xs text-slate-500 dark:text-slate-400 mb-1" title="Komfortenergie aus der MyŠkoda-App (Heizen/Kühlen am Kabel)">🔥 Komfort kWh</p><input data-f="cf" type="text" inputmode="decimal" value="${r.comfort > 0 ? String(r.comfort).replace('.', ',') : ''}" placeholder="–" class="${INPUT_CLS}"></div>
        </div>
        <p class="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">🔥 Komfort: Wert aus der MyŠkoda-App</p>
        <label class="g-home${gh} mt-3 flex items-center gap-2 text-sm"><input type="checkbox" data-f="reset" class="accent-emerald-500 w-4 h-4" ${r.meterReset ? 'checked' : ''}> Zähler wurde zurückgesetzt (Verbrauch = Zählerstand)</label>
        <button data-f="delbtn" data-del="0" class="mt-3 w-full py-2 rounded-xl border border-red-500 text-red-600 dark:text-red-400 text-sm font-medium">Eintrag löschen</button>
      </li>`;
    }

    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
                 ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    const wf = home ? wbF.get(i) : null;
    const head = `<div class="flex justify-between items-baseline">
        <span class="font-semibold">${WEEKDAYS[d.getDay()]}${wf && wf.slow ? ` <span class="ml-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300" title="Deutlich langsamer als üblich (${fmt(wf.usual, 1)} kW)">⚠ ${fmt(wf.kw, 1)} kW</span>` : ''}</span>
        <span class="text-sm text-slate-500 dark:text-slate-400">${date}</span>
      </div>`;
    if (!home) {                                       // Bosch / Unterwegs: gleiche Reihenfolge wie Zuhause (Kacheln -> Kosten -> km/Ladestand/Verbrauch), nur ohne Zähler
      const hasKwh = r.consumedSinceLast > 0, hasPrice = r.pricePerKwh != null, hasFee = r.fee != null, hasCost = (hasKwh && hasPrice) || hasFee;
      return `<li data-idx="${i}" data-kind="laden" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4">
      ${head}
      <div class="grid grid-cols-3 gap-2 mt-3 text-center">
        <div class="min-w-0"><p class="${lbl}">Ort</p><p class="mt-0.5"><span class="inline-block max-w-full truncate align-bottom text-xs px-2.5 py-1 rounded-lg ${PLACE_BADGE[place]}">${esc(r.provider || PLACES[place])}</span></p></div>
        <div><p class="${lbl}">Preis</p><p class="font-medium">${hasPrice ? fmt(r.pricePerKwh, 3) + ' €' : '–'}</p></div>
        <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 py-1"><p class="${lbl}">Geladen</p>
          <p class="font-semibold text-emerald-700 dark:text-emerald-300">${hasKwh ? fmt(r.consumedSinceLast) + ' kWh' : '–'}</p></div>
      </div>
      <div class="flex justify-between items-baseline mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <span class="text-sm text-slate-500 dark:text-slate-400">Kosten${hasPrice || hasFee ? ` <span class="text-xs">(${[hasPrice ? fmt(r.pricePerKwh, 3) + ' €/kWh' : '', hasFee ? '+ ' + eur(r.fee) + ' Gebühr' : ''].filter(Boolean).join(' ')})</span>` : ''}</span>
        <span class="text-lg font-semibold">${hasCost ? eur(r.cost) : '–'}</span>
      </div>
      ${extra}
    </li>`;
    }
    return `<li data-idx="${i}" data-kind="laden" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4">
      ${head}
      <div class="grid grid-cols-3 gap-2 mt-3 text-center">
        <div><p class="${lbl} text-center">Alt</p><p class="font-medium text-center">${r.meterReset ? 'Reset' : oldVal === null ? '–' : fmt(oldVal)}</p></div>
        <div><p class="${lbl} text-center">Neu</p><p class="font-medium text-center">${fmt(r.totalReading)}</p></div>
        <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 py-1"><p class="${lbl} text-center">Geladen</p>
          <p class="text-center font-semibold text-emerald-700 dark:text-emerald-300">${isStart ? '–' : fmt(r.consumedSinceLast) + ' kWh'}</p></div>
      </div>
      <div class="flex justify-between items-baseline mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <span class="text-sm text-slate-500 dark:text-slate-400">Kosten${!isStart && r.consumedSinceLast > 0 ? ` <span class="text-xs">(${fmt(unitPriceOf(r), 3)} €/kWh)</span>` : ''}</span>
        <span class="text-lg font-semibold">${isStart ? '–' : eur(r.cost)}</span>
      </div>
      ${durRows}${extra}
    </li>`;
  });
  const cHtml = costs.map((c, j) => {                     // Kosten-Karten (Ansicht und Bearbeiten)
    const d = new Date(c.date), amt = costAmt(c), inc = amt < 0;
    if (editMode) {
      return `<li data-cidx="${j}" data-kind="kosten" data-cat="${esc((c.category || '').trim())}" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4 ring-2 ring-emerald-500/40">
        <input type="datetime-local" data-cf="date" value="${toLocalInput(c.date)}" class="${INPUT_CLS}">
        <select data-cf="cat" aria-label="Kategorie" class="${INPUT_CLS} mt-3">${catOptions(c.category || '')}</select>
        <input data-cf="title" type="text" maxlength="80" value="${esc(c.title || '')}" placeholder="Titel" class="${INPUT_CLS} mt-3 !text-left">
        <div class="grid grid-cols-2 gap-2 mt-3 text-center">
          <div><p class="${lbl} mb-1 text-center">Betrag € (Minus = Einnahme)</p><input data-cf="amount" type="text" inputmode="decimal" value="${String(amt).replace('.', ',')}" class="${INPUT_CLS}"></div>
          <div data-kmwrap><p class="${lbl} mb-1 flex items-center justify-center gap-1">km-Stand <button type="button" data-kmfetch title="Aktuellen km-Stand vom Auto holen" aria-label="Aktuellen km-Stand vom Auto holen" class="kmf relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-emerald-600 dark:text-emerald-400 active:scale-90 transition after:absolute after:-inset-2.5">↻</button></p><input data-cf="km" type="text" inputmode="decimal" value="${c.odometerKm ?? ''}" class="${INPUT_CLS}"></div>
        </div>
        <input data-cf="note" type="text" maxlength="300" value="${esc(c.note || '')}" placeholder="Notiz" class="${INPUT_CLS} mt-3 !text-left">
 <div data-dv-block="c${c.id}" class="mt-3">${dvBlockInner('c' + c.id, c)}</div>
        <button data-cf="cdel" data-del="0" class="mt-3 w-full py-2 rounded-xl border border-red-500 text-red-600 dark:text-red-400 text-sm font-medium">Eintrag löschen</button>
      </li>`;
    }
    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    return `<li data-cidx="${j}" data-kind="kosten" data-cat="${esc((c.category || '').trim())}" class="rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm p-4">
      <div class="flex justify-between items-baseline"><span class="font-semibold">${WEEKDAYS[d.getDay()]}</span><span class="text-sm text-slate-500 dark:text-slate-400">${date}</span></div>
      <div class="flex justify-between items-start gap-3 mt-2">
        <div class="min-w-0"><p class="font-medium break-words">${esc(c.title || 'Kosten')}</p>${c.category ? `<span class="inline-block mt-1 text-xs px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">${esc(c.category)}</span>` : ''}</div>
        <span class="text-lg font-semibold whitespace-nowrap ${inc ? 'text-emerald-600 dark:text-emerald-400' : ''}">${inc ? '+' : ''}${eur(Math.abs(amt))}</span>
      </div>
      ${c.odometerKm ? `<div class="flex justify-between items-baseline mt-2"><span class="text-sm text-slate-500 dark:text-slate-400">Kilometerstand</span><span class="font-medium">${fmt(c.odometerKm, 0)} km</span></div>` : ''}
      ${c.note ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-2 break-words">${esc(c.note)}</p>` : ''}
      ${dvChips(c)}
    </li>`;
  });
  const items = rHtml.map((html, i) => ({ t: Date.parse(readings[i].date), k: 0, html }))        // Ladungen und Kosten chronologisch gemischt, neueste zuerst
    .concat(cHtml.map((html, j) => ({ t: Date.parse(costs[j].date), k: 1, html })));
  items.sort((a, b) => b.t - a.t || a.k - b.k);
  $('history-list').innerHTML = items.map(x => x.html).join('');
  applyHistFilter();
  if (editMode) updateDiffs();
  renderDataCheck();
}

/** Historie → Kosten: Etiketten-Filter wie im Checkheft, mit allen Kategorien (auch ohne Einträge) und Anzahl */
let histCat = 'all';
function renderHistCats(show) {
  const box = $('hist-cats'); box.classList.toggle('hidden', !show || !getCosts().length); if (!show) { $('hist-cat-sum').classList.add('hidden'); return; }
  const cs = getCosts(), key = (c) => (c.category || '').trim(), names = getCategories().slice();
  cs.forEach(c => { const k = key(c); if (k && !names.some(n => n.toLowerCase() === k.toLowerCase())) names.push(k); });
  if (histCat !== 'all' && !names.some(n => n.toLowerCase() === histCat.toLowerCase())) histCat = 'all';
  const cnt = (n) => cs.filter(c => key(c).toLowerCase() === n.toLowerCase()).length;
  const chip = (k, label, cls) => '<button type="button" data-hcat="' + esc(k) + '" class="h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-semibold ' + (histCat.toLowerCase() === k.toLowerCase() ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700 ' + cls) + '">' + label + '</button>';
  const sb = $('hist-cat-sum'), sel = histCat === 'all' ? [] : cs.filter(c => key(c).toLowerCase() === histCat.toLowerCase());   // Summe für das gewählte Etikett
  sb.classList.toggle('hidden', histCat === 'all');
  if (histCat !== 'all') {
    const out = sel.reduce((a, c) => a + Math.max(0, costAmt(c)), 0), inc = sel.reduce((a, c) => a + Math.max(0, -costAmt(c)), 0), ts = sel.map(c => Date.parse(c.date)).filter(Number.isFinite);
    const span = ts.length ? new Date(Math.min(...ts)).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' }) + (ts.length > 1 ? ' – ' + new Date(Math.max(...ts)).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' }) : '') : '';
    const big = out > 0 || !inc ? '<span class="text-xl font-semibold tabular-nums">' + eur(out) + '</span>' : '<span class="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+' + eur(inc) + '</span>';
    sb.innerHTML = '<div class="flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 shadow-sm px-4 py-3"><span class="min-w-0"><span class="block truncate font-semibold">Summe ' + esc(histCat) + '</span><span class="block truncate text-xs text-slate-500 dark:text-slate-400">' + sel.length + (sel.length === 1 ? ' Eintrag' : ' Einträge') + (span ? ' · ' + span : '') + (out > 0 && inc > 0 ? ' · Einnahmen +' + eur(inc) : '') + '</span></span>' + big + '</div>';
  }
  box.innerHTML = chip('all', 'Alle', '') + names.map(n => { const t = chType(n); return chip(n, esc(n) + ' ' + cnt(n), t ? t.txt : 'text-slate-600 dark:text-slate-300'); }).join('');
}
$('hist-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-hcat]'); if (!b) return; histCat = b.dataset.hcat; applyHistFilter(); });
/** Filter Alle | Laden | Kosten: blendet nur aus (alles bleibt im Dokument, damit das Speichern im Bearbeiten-Modus vollständig ist). */
function applyHistFilter() {
  const nL = getReadings().length, nK = getCosts().length, trips = histFilter === 'fahrten';
  if (trips && editMode) { setEditMode(false); return; }                       // setEditMode rendert die Historie neu und ruft diese Funktion erneut
  $('trips-wrap').classList.toggle('hidden', !trips); $('history-list').classList.toggle('hidden', trips);
  $('btn-edit').classList.toggle('hidden', trips || editMode || nL + nK === 0);
  if (trips) { segPaintKey('.hist-filter-btn', 'filter', histFilter); $('history-empty').classList.add('hidden'); $('dq-card').classList.add('hidden'); renderTrips(); updateHistFab(); return; }
  renderDataCheck();
  const kost = histFilter === 'kosten'; renderHistCats(kost);
  const catOk = (li) => !kost || histCat === 'all' || (li.dataset.cat || '').toLowerCase() === histCat.toLowerCase();
  [...$('history-list').children].forEach(li => li.classList.toggle('hidden', (histFilter !== 'all' && li.dataset.kind !== histFilter) || !catOk(li)));
  segPaintKey('.hist-filter-btn', 'filter', histFilter);
  const nCat = kost && histCat !== 'all' ? getCosts().filter(c => (c.category || '').trim().toLowerCase() === histCat.toLowerCase()).length : nK;
  const visible = histFilter === 'laden' ? nL : kost ? nCat : nL + nK;
  $('history-empty').classList.toggle('hidden', visible > 0);
  $('history-empty').textContent = nL + nK === 0 ? 'Noch nichts erfasst.' : histFilter === 'kosten' ? (histCat !== 'all' && nK ? 'Keine Kosten mit dem Etikett „' + histCat + '“.' : 'Noch keine Kosten erfasst.') : 'Noch keine Ladungen erfasst.';
}
document.querySelectorAll('.hist-filter-btn').forEach(b => b.addEventListener('click', () => { histFilter = b.dataset.filter; if (histFilter === 'fahrten') tripDays = 21; applyHistFilter(); }));
const ccell = (j, f) => $('history-list').querySelector(`li[data-cidx="${j}"] [data-cf="${f}"]`);
/** Ladeort der Karte i im Bearbeiten-Modus (so, wie er gerade im Auswahlfeld steht). */
const domPlace = (i) => cell(i, 'place')?.value || 'home';
function togglePlaceGroups(li, place) {
  li.querySelectorAll('.g-home').forEach(el => el.classList.toggle('hidden', place !== 'home'));
  li.querySelectorAll('.g-away').forEach(el => el.classList.toggle('hidden', place === 'home'));
  li.querySelectorAll('.g-prov').forEach(el => el.classList.toggle('hidden', place !== 'away'));
  li.querySelectorAll('.g-grid').forEach(el => { el.style.gridTemplateColumns = place === 'away' ? '0.85fr 0.95fr 0.85fr 1.35fr' : 'repeat(3,minmax(0,1fr))'; });
}
/** "Alt" eines Zuhause-Eintrags und "Neu" des vorherigen Zuhause-Eintrags sind derselbe Wert (Bosch/Unterwegs dazwischen zählen nicht). */
function syncOlds() {
  let prevNew = null;
  getReadings().forEach((_, i) => {
    if (domPlace(i) !== 'home') return;
    if (prevNew != null && cell(i, 'old')) cell(i, 'old').value = prevNew;
    prevNew = cell(i, 'new').value;
  });
}

/** Berechnet im Bearbeitungsmodus live die geladenen kWh aus den Eingabefeldern. */
function updateDiffs() {
  const stored = getReadings();
  let prevNew = null;                                    // letzter Zuhause-Stand in der Reihenfolge der Einträge
  for (let i = 0; i < stored.length; i++) {
    if (domPlace(i) === 'home') {
      const neu = parseNum(cell(i, 'new').value), reset = cell(i, 'reset')?.checked === true;
      const ok = isFinite(neu) && (reset || prevNew != null), kwh = ok ? (reset ? neu : Math.max(0, neu - prevNew)) : 0;
      cell(i, 'diff').textContent = ok ? fmt(kwh) + ' kWh' : '–';
      cell(i, 'cost').textContent = ok ? eur(kwh * unitPriceOf(stored[i])) : '–';
      cell(i, 'dur').textContent = ok ? fmtDuration(kwh) + ' h' : '–';
      if (isFinite(neu)) prevNew = neu;
    } else {
      const kwh = optNum(cell(i, 'kwh').value), price = optNum(cell(i, 'price').value);
      const fee = optNum(cell(i, 'fee').value), e = n => n != null && isFinite(n);
      cell(i, 'acost').textContent = (e(kwh) && e(price)) || e(fee) ? eur((e(kwh) && e(price) ? kwh * price : 0) + (e(fee) ? fee : 0)) : '–';
    }
  }
}

$('history-list').addEventListener('input', (e) => {
  if (!editMode || !e.target.dataset.f) return;
  const li = e.target.closest('li'), i = +li.dataset.idx, f = e.target.dataset.f;
  if (f === 'new') syncOlds();
  if (f === 'old') {                                     // "Alt" ändern = "Neu" des vorherigen Zuhause-Eintrags ändern
    let j = i - 1; while (j >= 0 && domPlace(j) !== 'home') j--;
    if (j >= 0) cell(j, 'new').value = e.target.value;
    syncOlds();
  }
  if (f === 'reset' && cell(i, 'old')) cell(i, 'old').disabled = e.target.checked;
  updateDiffs();
});
$('history-list').addEventListener('change', (e) => {   // Ladeort gewechselt: passende Felder zeigen
  if (!editMode || e.target.dataset.f !== 'place') return;
  togglePlaceGroups(e.target.closest('li'), e.target.value); syncOlds(); updateDiffs();
});

$('history-list').addEventListener('click', (e) => {      // "Eintrag löschen" markiert nur; gelöscht wird erst beim Speichern
  if (e.target.dataset.f !== 'delbtn' && e.target.dataset.cf !== 'cdel') return;
  const on = e.target.dataset.del !== '1', li = e.target.closest('li');
  e.target.dataset.del = on ? '1' : '0';
  e.target.textContent = on ? 'Löschen zurücknehmen' : 'Eintrag löschen';
  li.classList.toggle('opacity-50', on); li.classList.toggle('ring-red-500', on);
});
/** Schwebende Buttons: sobald die Kopfzeile der Historie aus dem Bild gescrollt ist, erscheinen Bearbeiten bzw. Abbrechen/Speichern über der Navigation. */
function updateHistFab() {
  const has = getReadings().length + getCosts().length > 0, on = currentView === 'history' && !histHeadVisible && has && histFilter !== 'fahrten';
  $('hist-fab').classList.toggle('hidden', !on);
  $('fab-edit').classList.toggle('hidden', editMode);
  $('fab-cancel').classList.toggle('hidden', !editMode); $('fab-save').classList.toggle('hidden', !editMode);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => { histHeadVisible = entries[entries.length - 1].isIntersecting; updateHistFab(); }).observe($('hist-head'));
}
$('fab-edit').addEventListener('click', () => $('btn-edit').click());
$('fab-cancel').addEventListener('click', () => $('btn-edit-cancel').click());
$('fab-save').addEventListener('click', () => $('btn-edit-save').click());
$('btn-edit').addEventListener('click', () => setEditMode(true));
$('btn-edit-cancel').addEventListener('click', () => setEditMode(false));
$('btn-edit-save').addEventListener('click', () => {
  const stored = getReadings(), currentPrice = getSettings().price;
  const all = stored.map((r, i) => ({
    r, date: new Date(cell(i, 'date').value), place: domPlace(i), neu: Math.round(parseNum(cell(i, 'new').value) * 10) / 10,
    cap: parseNum(cell(i, 'cap').value), reset: cell(i, 'reset')?.checked === true, km: optNum(cell(i, 'km').value), s0: optNum(cell(i, 's0').value), s1: optNum(cell(i, 's1').value), bt: optNum((cell(i, 'bt')?.value ?? '').replace('−', '-')), cf: optNum(cell(i, 'cf')?.value ?? ''),
    kwh: optNum(cell(i, 'kwh').value), price: optNum(cell(i, 'price').value), prov: cell(i, 'prov')?.value || '', fee: optNum(cell(i, 'fee')?.value ?? ''), del: cell(i, 'delbtn').dataset.del === '1'
  }));
  const live = all.filter(x => !x.del);
  if (live.some(x => isNaN(x.date) || (x.place === 'home' && (!isFinite(x.neu) || x.neu < 0)))) { alert('Bitte gültige Datums- und Zählerstandswerte eingeben.'); return; }
  if (live.some(x => x.place !== 'home' && ([x.kwh, x.price, x.fee].some(Number.isNaN) || [x.kwh, x.price, x.fee].some(v => v != null && v < 0)))) { alert('Bitte kWh, Preis und Gebühren prüfen (Zahl, nicht negativ).'); return; }
  if (all.some(x => [x.km, x.s0, x.s1].some(Number.isNaN) || (x.km != null && x.km < 0) || [x.s0, x.s1].some(v => v != null && (v < 0 || v > 100)) || (x.s0 != null && x.s1 != null && x.s1 <= x.s0))) {
    alert('Bitte km-Stand und Akku-Prozente prüfen (0–100 %, Ende größer als Start).'); return;
  }
  if (all.some(x => Number.isNaN(x.bt) || (x.bt != null && (x.bt < BT_MIN || x.bt > BT_MAX)))) { alert('Bitte die Akku-Temperatur prüfen (' + BT_MIN + ' bis ' + BT_MAX + ' °C) oder das Feld leer lassen.'); return; }
  if (all.some(x => Number.isNaN(x.cf) || (x.cf != null && (x.cf < 0 || x.cf > 50)))) { alert('Bitte die Komfortenergie prüfen (0 bis 50 kWh) oder das Feld leer lassen.'); return; }
  if (all.some(x => !isFinite(x.cap) || x.cap < 10 || x.cap > 200)) { alert('Bitte eine gültige Batteriekapazität in kWh eingeben (10 bis 200).'); return; }
  const storedCosts = getCosts();                        // Kosten-Karten (dieselbe Bearbeiten-Ansicht)
  const callC = storedCosts.map((c, j) => ({ c, date: new Date(ccell(j, 'date')?.value), cat: ccell(j, 'cat')?.value ?? c.category ?? '', title: (ccell(j, 'title')?.value ?? c.title ?? '').trim(),
    amount: (v => String(v).trim() === '' ? 0 : parseNum(v))(ccell(j, 'amount')?.value ?? String(c.amount)), /* leer = 0 € */ km: optNum(ccell(j, 'km')?.value ?? ''), note: (ccell(j, 'note')?.value ?? c.note ?? '').trim(), del: ccell(j, 'cdel')?.dataset.del === '1' }));
  const cLive = callC.filter(x => !x.del);
  if (cLive.some(x => isNaN(x.date) || !isFinite(x.amount))) { alert('Bitte bei den Kosten ein gültiges Datum und einen gültigen Betrag eingeben (0 € ist erlaubt).'); return; }
  if (cLive.some(x => Number.isNaN(x.km) || (x.km != null && (x.km < 0 || x.km > 999999)))) { alert('Bitte bei den Kosten einen gültigen km-Stand eingeben (0 bis 999999) oder das Feld leer lassen.'); return; }
  const gone = all.filter(x => x.del).length + callC.filter(x => x.del).length;
  if (gone && !confirm(gone + (gone === 1 ? ' Eintrag wird' : ' Einträge werden') + ' gelöscht (auch in der Cloud). Fortfahren?')) return;
  const items = all.filter(x => !x.del);

  items.sort((a, b) => a.date - b.date);                 // chronologisch, falls Datum geändert wurde
  let chk = null;                                        // Zählerstand muss nur zwischen Zuhause-Einträgen steigen
  const drop = items.some(x => { if (x.place !== 'home') return false; const bad = chk != null && x.neu < chk && !x.reset; chk = x.neu; return bad; });
  if (drop && !confirm('Mindestens ein Zählerstand ist kleiner als der vorherige. Trotzdem speichern?')) return;

  let prevHomeNew = null;                                // Zählerkette: nur Zuhause-Einträge
  const result = items.map(x => {
    const wasHome = isHome(x.r), common = { id: x.r.id, date: x.date.toISOString() };
    let out;
    if (x.place === 'home') {
      // Preis pro kWh des Eintrags beibehalten (aus den gespeicherten Werten), sonst aktueller Preis
      const unitPrice = wasHome && x.r.consumedSinceLast > 0 ? x.r.cost / x.r.consumedSinceLast : currentPrice;
      const consumed = x.reset ? x.neu : (prevHomeNew != null ? Math.max(0, Math.round((x.neu - prevHomeNew) * 10) / 10) : 0);
      out = { ...x.r, ...common, totalReading: x.neu, consumedSinceLast: consumed, cost: consumed * unitPrice };
      delete out.place; delete out.pricePerKwh; delete out.provider; delete out.fee;
      if (x.reset) out.meterReset = true; else delete out.meterReset;
      prevHomeNew = x.neu;
    } else {
      out = { ...x.r, ...common, place: x.place, totalReading: prevHomeNew ?? 0, consumedSinceLast: x.kwh ?? 0, cost: (x.kwh != null && x.price != null ? x.kwh * x.price : 0) + (x.fee ?? 0) };
      if (x.price != null) out.pricePerKwh = x.price; else delete out.pricePerKwh;
      if (x.place === 'away' && x.prov) out.provider = x.prov; else delete out.provider;
      if (x.fee != null) out.fee = x.fee; else delete out.fee;
      delete out.meterReset; delete out.chargeStart; delete out.chargeEnd; delete out.avgPowerKw;     // Zähler-/Live-Daten gibt es nur zuhause
    }
    if (x.km != null) out.odometerKm = x.km; else delete out.odometerKm;       // geleerte Felder wirklich entfernen
    if (x.s0 != null) out.socStart = x.s0; else delete out.socStart;
    if (x.s1 != null) out.socEnd = x.s1; else delete out.socEnd;
    if (x.bt != null) out.battTemp = Math.round(x.bt * 10) / 10; else delete out.battTemp;
    if (x.cf > 0) out.comfort = Math.round(x.cf * 10) / 10; else delete out.comfort;
    out.capacityKwh = x.cap;
    return out;
  });
  const costResult = cLive.map(x => {
    const out = { ...x.c, date: x.date.toISOString(), title: x.title || x.cat || 'Kosten', amount: Math.round(x.amount * 100) / 100, category: x.cat };
    if (x.note) out.note = x.note; else delete out.note;                       // geleerte Felder wirklich entfernen (Firestore verbietet undefined)
    if (x.km != null && x.km > 0) out.odometerKm = x.km; else delete out.odometerKm;
    return out;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (commitReadings(result)) {
    if (JSON.stringify(costResult) !== JSON.stringify(storedCosts)) commitCosts(costResult);
    deferredCloud = null; deferredCosts = null; setEditMode(false);
  }
});

/* =====================================================================
   7-Segment-Anzeige: Schriftgröße automatisch an die verfügbare Breite anpassen
   ===================================================================== */
function fitSeg() {                                       // Dashboard- und Erfassen-Anzeige jeweils an die Breite anpassen
  [['seg-box', 'seg-wrap', 'seg-unit'], ['seg2-box', 'seg2-wrap', 'seg2-unit']].forEach(([bx, wr, un]) => {
    const box = $(bx), wrap = $(wr);
    if (!box || !box.clientWidth) return;                // View nicht sichtbar
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - $(un).offsetWidth - 8;
    wrap.style.fontSize = '100px';
    const w = wrap.firstElementChild.getBoundingClientRect().width;     // Breite des "888888.8" bei 100 px
    wrap.style.fontSize = Math.max(20, Math.min(56, Math.floor(100 * avail / w))) + 'px';
  });
}
window.addEventListener('resize', fitSeg);
if (document.fonts) document.fonts.ready.then(fitSeg);

/* =====================================================================
   Export / Import der Zählerstände
   Dateiformat (JSON):
   { "app": "enyaq-ladekosten", "version": 1, "exportedAt": "<ISO-Datum>", "chargePowerKw": 7,
     "readings": [ { id, date, totalReading, consumedSinceLast, cost, chargeDuration ("hh:mm"), place ("bosch" | "away"; fehlt = Zuhause), pricePerKwh, provider (Ladeanbieter, nur bei "away"), fee (Servicegebühr in €, nur bei "bosch"/"away"; in cost enthalten) }, … ] }
   Die Felder "app" und "version" dienen dem Wiedererkennen beim Import. Einstellungen werden nicht exportiert.
   "chargeDuration" ist ein abgeleiteter Wert (kWh / Ladeleistung): Er wird exportiert und beim Import geprüft,
   aber nicht gespeichert, sondern bei der Anzeige immer neu berechnet.
   ===================================================================== */
const EXPORT_APP_ID = 'enyaq-ladekosten';

/** Inhalt der Datensicherung (Datei-Export und monatliche Sicherung in Google Drive). Einstellungen ohne PIN. */
function buildBackup() {
  const readings = getReadings(), st = { ...(load(KEY_SETTINGS, {}) || {}) }; delete st.pin;
  return {
    app: EXPORT_APP_ID, version: 1, exportedAt: new Date().toISOString(), chargePowerKw: chargePowerKw(),
    readings: readings.map(r => ({ ...r, chargeDuration: isHome(r) ? chargeDurationOf(r) : undefined })),     // Ladedauer als hh:mm (nur Zuhause)
    costs: getCosts(), categories: getCategories(), reminders: getReminders(), recurring: getRecurring(),
    trips: getTrips(), tripPrefs: { places: getTPlaces(), labels: getTLabels(), rules: getTRules(), defLabel: defLabelId() },   // Fahrtenbuch (seit Version mit Fahrten)
    settings: st, providers: getProviders(), provInfo: load(KEY_PROVINFO, null), kb: load('enyaq.kb', null), lab: load(KEY_LAB, null)          // seit Version mit Ladeanbietern
  };
}
$('btn-export').addEventListener('click', () => {
  const readings = getReadings(), costs = getCosts(), reminders = getReminders(), recurring = getRecurring(), trips = getTrips();
  if (!readings.length && !costs.length && !reminders.length && !recurring.length && !trips.length) { flash($('io-msg'), 'Keine Daten zum Exportieren vorhanden.', false); return; }
  const payload = buildBackup();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = 'enyaq-ladekosten-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  flash($('io-msg'), readings.length + ' Ladungen, ' + costs.length + ' Kosten und ' + reminders.length + ' Erinnerungen exportiert.', true);
});

/** Ladeanbieter (ergänzen) und Einstellungen (nach Rückfrage) aus einer Sicherung übernehmen. */
function importPrefsFromBackup(text) {
  let d; try { d = JSON.parse(text); } catch { return; }
  if (Array.isArray(d.providers)) { const cur = getProviders(), add = d.providers.filter(n => typeof n === 'string' && n.trim() && !cur.some(m => m.toLowerCase() === n.trim().toLowerCase())).map(n => n.trim().slice(0, 30));
    if (add.length) setProviders(cur.concat(add).slice(0, 20)); }
  if (d.provInfo && typeof d.provInfo === 'object') {                  // fehlende Angaben ergänzen, eigene bleiben
    const cur = getProvInfo(), src = d.provInfo, out = { home: { ...(src.home || {}), ...cur.home }, bosch: { ...(src.bosch || {}), ...cur.bosch }, p: { ...(src.p || {}), ...cur.p } };
    if (JSON.stringify(out) !== JSON.stringify(cur)) setProvInfo(JSON.parse(JSON.stringify(out)));
  }
  if (d.kb && Array.isArray(d.kb.items)) {                              // Wissen: fehlende Einträge und Kategorien ergänzen
    const cur = getKb(), ids = new Set(cur.items.map(x => String(x.id))), add = d.kb.items.filter(x => x && x.title && !ids.has(String(x.id)));
    const cats = cur.cats.concat((d.kb.cats || []).filter(c => typeof c === 'string' && !cur.cats.includes(c)));
    if (add.length || cats.length !== cur.cats.length) setKb({ cats, items: cur.items.concat(add) });
  }
  if (d.lab && typeof d.lab === 'object') {                            // Ladekurven/Rekorde: fehlende ergänzen
    const cur = load(KEY_LAB, null), base = getLab(), ids = new Set(base.curves.concat(base.recs).map(x => String(x.id)));
    const ac = (d.lab.curves || []).filter(x => x && x.id && !ids.has(String(x.id))), ar = (d.lab.recs || []).filter(x => x && x.id && !ids.has(String(x.id)));
    const sids = new Set(base.speeds.map(x => String(x.id))), as = (Array.isArray(d.lab.speeds) ? d.lab.speeds : []).filter(x => x && x.id && !sids.has(String(x.id)));
    const rts = { ...(d.lab.routes && typeof d.lab.routes === 'object' ? d.lab.routes : {}), ...base.routes }, nr = Object.keys(rts).length !== Object.keys(base.routes).length;
    const lids = new Set(base.lt.map(x => String(x.id))), al = (Array.isArray(d.lab.lt) ? d.lab.lt : []).filter(x => x && x.id && !lids.has(String(x.id)));
    const bids = new Set(base.bt.map(x => String(x.id))), ab = (Array.isArray(d.lab.bt) ? d.lab.bt : []).filter(x => x && x.id && !bids.has(String(x.id)));
    const tids = new Set(base.tires.map(x => String(x.id))), at = (Array.isArray(d.lab.tires) ? d.lab.tires : []).filter(x => x && x.id && x.v && !tids.has(String(x.id)));
    const wids = new Set(base.wish.map(x => String(x.id))), aw = (Array.isArray(d.lab.wish) ? d.lab.wish : []).filter(x => x && x.id && x.title && !wids.has(String(x.id)));
    const fids = new Set(base.fc.map(x => String(x.id))), af = (Array.isArray(d.lab.fc) ? d.lab.fc : []).filter(x => x && x.id && x.km > 0 && !fids.has(String(x.id)));
    if (!cur || ac.length || ar.length || as.length || nr || al.length || ab.length || at.length || aw.length || af.length) setLab({ fc: base.fc.concat(af), curves: base.curves.concat(ac), recs: base.recs.concat(ar), speeds: base.speeds.concat(as), routes: rts, lt: base.lt.concat(al), bt: base.bt.concat(ab), tires: base.tires.concat(at), wish: base.wish.concat(aw) });
  }
  if (d.settings && typeof d.settings === 'object' && Object.keys(d.settings).length && confirm('Die Sicherung enthält auch Einstellungen (Strompreis, Akku, Fahrzeugdaten, Kauftag …).\n\nOK = Einstellungen aus der Sicherung übernehmen\nAbbrechen = aktuelle Einstellungen behalten')) {
    const keep = load(KEY_SETTINGS, {}) || {}, n = { ...d.settings }; delete n.pin; if (keep.pin) n.pin = keep.pin;
    if (!(Number(n.price) >= 0)) delete n.price;
    save(KEY_SETTINGS, n); pushPrefs(); if (currentView === 'settings') fillSettings();
  }
}
/** Prüft die Datei streng und gibt bereinigte Einträge (chronologisch) zurück oder wirft einen Fehler. */
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!data || data.app !== EXPORT_APP_ID || !Array.isArray(data.readings)) throw new Error('Das ist keine Export-Datei dieser App.');
  if (typeof data.version !== 'number' || data.version > 1) throw new Error('Die Datei stammt aus einer neueren App-Version.');
  const seen = new Set();
  return data.readings.map((r, i) => {
    const date = new Date(r?.date);
    const nums = [r?.totalReading, r?.consumedSinceLast, r?.cost];
    if (isNaN(date) || !nums.every(v => typeof v === 'number' && isFinite(v) && v >= 0)) throw new Error('Eintrag ' + (i + 1) + ' ist ungültig.');
    if (r.chargeDuration !== undefined && !/^\d{2,}:[0-5]\d$/.test(r.chargeDuration)) throw new Error('Ladedauer in Eintrag ' + (i + 1) + ' ist ungültig (erwartet hh:mm).');
    let id = Number(r.id);
    if (!Number.isFinite(id) || seen.has(id)) id = Date.now() + i;      // IDs eindeutig halten
    seen.add(id);
    const out = { id, date: date.toISOString(), totalReading: r.totalReading, consumedSinceLast: r.consumedSinceLast, cost: r.cost };
    if (r.place !== undefined && r.place !== null) {                                                // Ladeort: fehlt = Zuhause
      if (!PLACES[r.place]) throw new Error('Ladeort in Eintrag ' + (i + 1) + ' ist ungültig.');
      if (r.place !== 'home') out.place = r.place;
    }
    if (r.fee !== undefined && r.fee !== null) {                                                   // Servicegebühr nur bei Bosch/Unterwegs
      if (typeof r.fee !== 'number' || !isFinite(r.fee) || r.fee < 0 || r.fee > 1000) throw new Error('Gebühr in Eintrag ' + (i + 1) + ' ist ungültig.');
      if (out.place) out.fee = r.fee;                                                            // nur bei Bosch/Unterwegs
    }
    if (typeof r.provider === 'string' && r.provider.trim() && out.place === 'away') out.provider = r.provider.trim().slice(0, 30);   // Ladeanbieter nur bei "Unterwegs"
    for (const k of ['odometerKm', 'socStart', 'socEnd', 'capacityKwh', 'avgPowerKw', 'pricePerKwh']) {            // optionale Felder prüfen und übernehmen
      if (r[k] === undefined || r[k] === null) continue;
      if (typeof r[k] !== 'number' || !isFinite(r[k]) || r[k] < 0 || (k === 'capacityKwh' ? (r[k] < 10 || r[k] > 200) : (k !== 'odometerKm' && r[k] > 100))) throw new Error('Feld ' + k + ' in Eintrag ' + (i + 1) + ' ist ungültig.');
      out[k] = r[k];
    }
    if (r.battTemp != null) { if (typeof r.battTemp !== 'number' || !isFinite(r.battTemp) || r.battTemp < -30 || r.battTemp > 60) throw new Error('Feld battTemp in Eintrag ' + (i + 1) + ' ist ungültig.'); out.battTemp = r.battTemp; }
    if (r.comfort != null) { if (typeof r.comfort !== 'number' || !isFinite(r.comfort) || r.comfort < 0 || r.comfort > 50) throw new Error('Feld comfort in Eintrag ' + (i + 1) + ' ist ungültig.'); if (r.comfort > 0) out.comfort = r.comfort; }
    for (const k of ['chargeStart', 'chargeEnd']) {
      if (r[k] == null) continue;
      if (isNaN(Date.parse(r[k]))) throw new Error('Feld ' + k + ' in Eintrag ' + (i + 1) + ' ist ungültig.');
      out[k] = new Date(r[k]).toISOString();
    }
    if (r.meterReset === true) out.meterReset = true;
    return out;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Kosten und Kategorien aus einer Export-Datei (optional, ältere Dateien haben sie nicht). Wirft bei ungültigen Einträgen. */
function parseImportCosts(text) {
  const data = JSON.parse(text), out = { costs: [], categories: [] }, seen = new Set();
  if (Array.isArray(data.categories)) out.categories = data.categories.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim().slice(0, 30));
  if (!Array.isArray(data.costs)) return out;
  out.costs = data.costs.map((c, i) => {
    const date = new Date(c?.date), amount = c?.amount;
    if (isNaN(date) || typeof amount !== 'number' || !isFinite(amount) || Math.abs(amount) > 1e6) throw new Error('Kosten-Eintrag ' + (i + 1) + ' ist ungültig.');
    let id = Number(c.id); if (!Number.isFinite(id) || seen.has(id)) id = Date.now() + i; seen.add(id);
    const o = { id, date: date.toISOString(), title: String(c.title ?? '').trim().slice(0, 80) || 'Kosten', amount: Math.round(amount * 100) / 100, category: typeof c.category === 'string' ? c.category.trim().slice(0, 30) : '' };
    if (typeof c.note === 'string' && c.note.trim()) o.note = c.note.trim().slice(0, 300);
    if (typeof c.odometerKm === 'number' && c.odometerKm > 0 && c.odometerKm <= 999999) o.odometerKm = c.odometerKm;
    if (typeof c.guid === 'string' && c.guid) o.guid = c.guid.slice(0, 64);
    if (Number.isFinite(Number(c.recurId)) && c.recurId != null) o.recurId = Number(c.recurId);
    return o;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
  return out;
}
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';                                   // dieselbe Datei später erneut wählbar
  if (!file) return;
  try {
    const text = await file.text(), imported = parseImport(text), ic = parseImportCosts(text), ir = parseImportReminders(text), irc = parseImportRecurring(text);
    const current = getReadings(), curCosts = getCosts(), curRem = getReminders();
    const fresh = imported.filter(i => !current.some(c => sameId(c, i)));          // nur wirklich neue Einträge
    const merged = current.filter(c => !imported.some(i => sameId(c, i))).concat(imported).sort((a, b) => new Date(a.date) - new Date(b.date));
    const freshC = ic.costs.filter(i => !curCosts.some(c => sameId(c, i)));
    const mergedC = curCosts.filter(c => !ic.costs.some(i => sameId(c, i))).concat(ic.costs).sort((a, b) => new Date(a.date) - new Date(b.date));
    const freshR = ir.filter(i => !curRem.some(c => sameId(c, i)));
    const mergedR = curRem.filter(c => !ir.some(i => sameId(c, i))).concat(ir);
    if ((current.length > 0 || curCosts.length > 0 || curRem.length > 0) && !confirm(imported.length + ' Ladungen (' + fresh.length + ' neu), ' + ic.costs.length + ' Kosten (' + freshC.length + ' neu) und ' + ir.length + ' Erinnerungen (' + freshR.length + ' neu) in der Datei. Mit den vorhandenen Daten zusammenführen?')) return;
    if (!commitReadings(merged)) return;                 // Zusammenführen (gleiche ID: Datei gewinnt); wird bei Anmeldung auch in die Cloud geschrieben
    if (ic.costs.length) commitCosts(mergedC);
    if (ir.length) commitReminders(mergedR);
    if (irc.length) { const curRc = getRecurring(); commitRecurring(curRc.filter(c => !irc.some(i => sameId(c, i))).concat(irc)); bookRecurring(); }
    const newCats = ic.categories.filter(n => !getCategories().some(m => m.toLowerCase() === n.toLowerCase()));
    if (newCats.length) setCategories(getCategories().concat(newCats));
    const nT = importTripsFromBackup(text);                // Fahrten + Orte/Etiketten/Regeln (ältere Dateien haben sie nicht)
    importPrefsFromBackup(text);                           // Ladeanbieter und Einstellungen (ältere Dateien haben sie nicht)
    stopLive(false);                                     // Live-Basis wäre veraltet
    flash($('io-msg'), fresh.length + ' neue Ladungen, ' + freshC.length + ' neue Kosten, ' + freshR.length + ' neue Erinnerungen' + (nT ? ' und ' + nT + ' neue Fahrten' : '') + ' importiert.', true);
  } catch (err) {
    flash($('io-msg'), 'Import fehlgeschlagen: ' + err.message, false);
  }
});


