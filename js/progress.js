// progress.js — прогресс ученика в localStorage (без сервера, на каждой машине свой)

import { EXAM } from './exam.js';

const KEY = EXAM.store + '_progress_v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

function ensure(state, section) {
  if (!state[section]) state[section] = {};
  return state[section];
}

// Отметить попытку по закрытому заданию (грамматика/словообр.)
// section: 'grammar' | 'wordform'; zid; correct:bool; kes (для статистики по темам)
export function recordDrill(section, zid, correct, kes) {
  const state = read();
  const sec = ensure(state, section);
  const prev = sec[zid] || { tries: 0, ok: false, kes };
  prev.tries += 1;
  if (correct) prev.ok = true;
  prev.kes = kes;
  sec[zid] = prev;
  write(state);
}

// Сохранить результат письма
export function recordWriting(zid, score) {
  const state = read();
  if (!state.writing) state.writing = [];
  state.writing.push({ zid, score, ts: Date.now() });
  write(state);
}

// Статистика по разделу: {total, attempted, correct, byKes:{kes:{attempted,correct}}}
export function sectionStats(section) {
  const sec = read()[section] || {};
  const byKes = {};
  let attempted = 0, correct = 0;
  for (const rec of Object.values(sec)) {
    attempted++;
    if (rec.ok) correct++;
    const k = rec.kes || '?';
    if (!byKes[k]) byKes[k] = { attempted: 0, correct: 0 };
    byKes[k].attempted++;
    if (rec.ok) byKes[k].correct++;
  }
  return { attempted, correct, byKes };
}

export function writingStats() {
  const w = read().writing || [];
  return { count: w.length, items: w };
}

// Задания раздела, которые ещё не освоены (отвечали, но ни разу верно) — для «работы над ошибками».
// Сортировка: чаще проваленные — выше.
export function mistakeZids(section) {
  const sec = read()[section] || {};
  return Object.entries(sec)
    .filter(([, r]) => !r.ok)
    .sort((a, b) => (b[1].tries || 0) - (a[1].tries || 0))
    .map(([zid]) => zid);
}

// Суммарно по закрытым разделам (для ачивок)
export function totalDrill() {
  const s = read();
  let attempted = 0, correct = 0;
  for (const section of ['grammar', 'wordform', 'reading']) {
    for (const r of Object.values(s[section] || {})) { attempted++; if (r.ok) correct++; }
  }
  return { attempted, correct };
}

// Уровень короны темы: 0 — нет, 1 бронза, 2 серебро, 3 золото (по объёму и точности)
export function crownTier(attempted, correct) {
  if (!attempted || attempted < 5) return 0;
  const acc = (correct / attempted) * 100;
  if (attempted >= 15 && acc >= 85) return 3;
  if (attempted >= 10 && acc >= 70) return 2;
  if (acc >= 50) return 1;
  return 0;
}

// Сколько золотых корон собрано по всем темам (для ачивки)
export function goldCrownCount() {
  const s = read();
  let n = 0;
  for (const section of ['grammar', 'wordform']) {
    const by = {};
    for (const r of Object.values(s[section] || {})) {
      const k = r.kes || '?';
      if (!by[k]) by[k] = { a: 0, c: 0 };
      by[k].a++; if (r.ok) by[k].c++;
    }
    for (const k in by) if (crownTier(by[k].a, by[k].c) === 3) n++;
  }
  return n;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch {}
}
