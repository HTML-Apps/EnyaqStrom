/* =====================================================================
   Eigene Dialoge statt der grauen Browser-Fenster alert()/confirm():
   appNote(text)            Hinweis unten über der Navigation (verschwindet von selbst)
   ask(text, {…})        Rückfrage als eigenes Fenster → Promise<boolean>
   undoDel(text, undo)   „Gelöscht · Rückgängig“ statt vorheriger Rückfrage
   ===================================================================== */
const NOTE_POS = 'fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[85] mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-3 py-2.5 text-white shadow-2xl';
function noteEl(id, cls, inner, ms) {
  const old = $(id); if (old) old.remove(); clearTimeout(window[id + 'T']);
  const el = document.createElement('div'); el.id = id; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.className = NOTE_POS + ' ' + cls; el.innerHTML = inner;
  document.body.appendChild(el); window[id + 'T'] = setTimeout(() => { if (el.isConnected) el.remove(); }, ms); return el;
}
function appNote(msg, kind) {
  const ok = kind === 'ok', t = String(msg == null ? '' : msg);
  const el = noteEl('app-note', ok ? 'border-emerald-600 bg-emerald-950' : 'border-amber-600 bg-amber-950',
    `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ok ? 'bg-emerald-600' : 'bg-amber-600'}"><svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${ok ? '<path d="M5 12.5l4.5 4.5L19 7"/>' : '<path d="M12 7v6M12 17h.01"/>'}</svg></span>
    <span class="min-w-0 flex-1 whitespace-pre-line text-left text-sm leading-snug">${esc(t)}</span><button type="button" aria-label="Schließen" class="shrink-0 self-start px-1 text-lg leading-none opacity-70">×</button>`,
    Math.min(12000, Math.max(4500, t.length * 70)));
  el.querySelector('button').addEventListener('click', () => el.remove());
}
function undoDel(msg, undo) {
  const el = noteEl('app-undo', 'border-slate-600 bg-slate-800',
    `<span class="min-w-0 flex-1 text-sm font-semibold">${esc(msg)}</span><button type="button" data-u="1" class="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-emerald-300 active:bg-white/20">Rückgängig</button><button type="button" aria-label="Schließen" class="shrink-0 px-1 text-lg leading-none opacity-70">×</button>`, 7000);
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; el.remove(); if (b.dataset.u) { try { undo(); appNote('Wiederhergestellt', 'ok'); } catch (err) { console.error(err); } } });
}
function ask(msg, o) {
  o = o || {};
  return new Promise((done) => {
    const prevFocus = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="w-full max-w-md rounded-[26px] border border-slate-200 bg-white p-5 text-left text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      ${o.title ? `<p class="text-lg font-bold">${esc(o.title)}</p>` : ''}<p class="${o.title ? 'mt-2 text-sm text-slate-600 dark:text-slate-300' : 'text-[15px]'} whitespace-pre-line leading-relaxed">${esc(msg)}</p>
      <div class="mt-5 flex gap-2"><button type="button" data-a="0" class="h-12 flex-1 rounded-2xl bg-slate-100 px-3 text-sm font-semibold active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700">${esc(o.cancel || 'Abbrechen')}</button>
      <button type="button" data-a="1" class="h-12 flex-1 rounded-2xl px-3 text-sm font-bold text-white ${o.danger ? 'bg-red-600 active:bg-red-700' : 'bg-emerald-600 active:bg-emerald-700'}">${esc(o.ok || 'OK')}</button></div></div>`;
    const end = (v) => { document.removeEventListener('keydown', key, true); wrap.remove(); try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { } done(v); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) return end(false); const b = e.target.closest('[data-a]'); if (b) end(b.dataset.a === '1'); });
    document.addEventListener('keydown', key, true); document.body.appendChild(wrap); wrap.querySelector('[data-a="1"]').focus();
  });
}
const labSnap = () => JSON.parse(JSON.stringify(getLab()));
function labUndo(msg, snap) { undoDel(msg, () => { setLab(snap); try { renderBtm(); renderLtm(); } catch (e) { } }); }
