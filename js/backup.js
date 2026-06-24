// backup.js — экспорт/импорт прогресса кодом (страховка: iOS Safari стирает localStorage по ITP).
// Собираем ключи текущего экзамена (игра/прогресс/лексика) в base64-код. Без сервера.

import { EXAM } from './exam.js';

const keys = () => [EXAM.store + '_game_v1', EXAM.store + '_progress_v1', EXAM.store + '_vocab_v1'];

export function exportProgress() {
  const blob = { _exam: EXAM.id };
  for (const k of keys()) { const v = localStorage.getItem(k); if (v != null) blob[k] = v; }
  return btoa(unescape(encodeURIComponent(JSON.stringify(blob)))); // utf8-safe base64
}

export function importProgress(code) {
  let blob;
  try { blob = JSON.parse(decodeURIComponent(escape(atob((code || '').trim())))); }
  catch (e) { throw new Error('код повреждён или неполный'); }
  if (!blob || blob._exam !== EXAM.id) throw new Error('это код от другого приложения');
  for (const k of keys()) { if (blob[k] != null) localStorage.setItem(k, blob[k]); }
}
