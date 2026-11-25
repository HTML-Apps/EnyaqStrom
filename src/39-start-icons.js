/* =====================================================================
   Start: Verknüpfungen als eine Icon-Leiste (Variante B) statt sechs Zeilen-Knöpfen.
   Die alten Knöpfe (#go-stat, #btn-wrap-preview, #go-akku, #go-prov, #go-badges, #kb-card/#go-kb) bleiben versteckt im DOM –
   ihre Klick-Logik und die Untertitel (*-n) werden weiter gepflegt; die Leiste übernimmt Symbol, ruft .click() auf und liest
   Kurzwerte aus den Untertiteln (Akku x/100, Abzeichen x/y, offene Mängel als roter Zähler).
   ===================================================================== */
const SI_ITEMS = [
  { id: 'go-stat', lab: () => 'Daten' },
  { id: 'btn-wrap-preview', lab: () => 'Rückblick' },
  { id: 'go-akku', n: 'go-akku-n', lab: (t) => (t.match(/(\d+)\s*\/\s*100/) || [])[0]?.replace(/\s/g, '') || 'Akku' },
  { id: 'go-prov', lab: () => 'Anbieter' },
  { id: 'go-badges', n: 'go-badges-n', lab: (t) => { const m = t.match(/(\d+)\s*von\s*(\d+)/); return m ? m[1] + '/' + m[2] : 'Abzeichen'; } },
  { id: 'go-kb', n: 'go-kb-n', lab: () => 'Wissen', badge: (t) => +((t.match(/(\d+)\s*offene/) || [])[1] || 0) },
];
function startIcons() {
  const box = $('start-icons'); if (!box) return;
  box.innerHTML = SI_ITEMS.map((x, i) => {
    const b = $(x.id); if (!b) return '';
    const svg = (b.querySelector('svg') || {}).outerHTML || '', t = x.n ? ($(x.n) || {}).textContent || '' : '', bd = x.badge ? x.badge(t) : 0;
    const name = (b.querySelector('span') || b).textContent.split('·')[0].trim();
    return `<button type="button" data-si="${i}" class="relative flex w-[54px] flex-col items-center gap-1.5 active:scale-95 transition" aria-label="${esc(name + (t ? ' ' + t : ''))}">
      <span class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 [&>svg]:!h-[22px] [&>svg]:!w-[22px]">${svg}</span>
      ${bd ? `<span class="absolute -top-0.5 right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white">${bd}</span>` : ''}
      <span class="max-w-full truncate text-[10.5px] text-slate-600 dark:text-slate-300 tabular-nums">${esc(x.lab(t))}</span></button>`;
  }).join('');
}
$('start-icons').addEventListener('click', (e) => { const b = e.target.closest('[data-si]'); if (b) $(SI_ITEMS[+b.dataset.si].id)?.click(); });
{ let tm; const mo = new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(startIcons, 50); });
  SI_ITEMS.forEach(x => { const n = x.n && $(x.n); if (n) mo.observe(n, { childList: true, characterData: true, subtree: true }); });
  startIcons();
}
