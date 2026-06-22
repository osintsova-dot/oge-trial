// themes.js — связь «тема ↔ задания письма/чтения» (для финала недели и фильтра по теме).
// Данные app/data/themes.json (тема → tasks[{id,exam,section}]; id совпадает с zid в writing/email/essay/reading).

import { loadJSON } from './data.js';
import { EXAM } from './exam.js';

let _themes = null;
async function loadThemes() {
  if (_themes) return _themes;
  try { _themes = await loadJSON('themes'); } catch { _themes = {}; }
  return _themes;
}

// Русское название темы по ключу (для подписей). Пусто, если тема не найдена.
export async function themeName(themeKey) {
  const th = (await loadThemes())[themeKey];
  return (th && th.ru) || '';
}

// Карта всех тем { key: ru-название } (для подписей списков).
export async function allThemeNames() {
  const all = await loadThemes();
  const out = {};
  for (const k in all) out[k] = all[k].ru || k;
  return out;
}

// zid-наборы заданий темы для текущего экзамена: { writing:Set, reading:Set, name }
export async function themeZids(themeKey) {
  const th = (await loadThemes())[themeKey];
  const out = { writing: new Set(), reading: new Set(), name: (th && th.ru) || themeKey || '' };
  if (!th || !th.tasks) return out;
  for (const tk of th.tasks) {
    if (tk.exam !== EXAM.id) continue;
    if (tk.section === 'writing') out.writing.add(tk.id);
    else if (tk.section === 'reading') out.reading.add(tk.id);
  }
  return out;
}
