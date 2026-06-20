// word_search.js — быстрый поиск по тематическому словарю (оверлей).
// Используется из письма (забыл выражение → нашёл → вставил) и из раздела лексики.
// Грузит словарь текущего экзамена один раз и кэширует.

import { el } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { t, sectionById } from '../js/exam.js';

let cache = null;

async function getWords() {
  if (cache) return cache;
  const sec = sectionById('vocab');
  const data = await loadJSON(sec ? sec.dataFile : 'vocab');
  cache = [];
  for (const th of data.themes) {
    const theme = th.name || th.ru;
    for (const g of th.groups) for (const it of g.items) {
      cache.push({ en: it.en, ru: it.ru || '', def: it.def || '', ex: it.ex || '', theme });
    }
  }
  return cache;
}

export async function openWordSearch() {
  const v = t.vocab;
  const input = el('input', { class: 'ws-input', type: 'search', placeholder: v.searchPlaceholder, autocomplete: 'off' });
  const results = el('div', { class: 'ws-results' });
  const close = () => overlay.remove();
  const overlay = el('div', { class: 'ws-overlay' }, [
    el('div', { class: 'ws-panel' }, [
      el('div', { class: 'ws-bar' }, [
        el('div', { class: 'ws-title', text: v.searchTitle }),
        el('button', { class: 'ws-close', text: '✕', onclick: close }),
      ]),
      el('div', { class: 'ws-search' }, [input]),
      results,
    ]),
  ]);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(overlay);

  results.replaceChildren(el('div', { class: 'vc-note', text: '…' }));
  let words = [];
  try { words = await getWords(); results.replaceChildren(); }
  catch (e) { results.replaceChildren(el('div', { class: 'err-msg', text: e.message })); return; }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (q.length < 2) return;
    const res = words.filter((w) =>
      w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q) || w.def.toLowerCase().includes(q));
    results.appendChild(el('div', { class: 'topics-label', text: v.searchCount(res.length) }));
    if (!res.length) { results.appendChild(el('div', { class: 'vc-note', text: v.searchEmpty })); return; }
    for (const w of res.slice(0, 80)) {
      results.appendChild(el('div', { class: 'ws-item' }, [
        el('div', { class: 'ws-en', text: w.en }),
        el('div', { class: 'ws-ru', text: w.ru }),
        w.def ? el('div', { class: 'ws-def', text: w.def }) : null,
        w.ex ? el('div', { class: 'ws-ex', text: w.ex }) : null,
        el('div', { class: 'ws-theme', text: w.theme }),
      ].filter(Boolean)));
    }
  });
  input.focus();
}
