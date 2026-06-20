// vocab_srs.js — интервальное повторение лексики (Лейтнер) + дневная норма.
// Состояние в localStorage (раздельно по экзамену). Без сервера.
//   srs[id] = { box: 1..5, due: 'YYYY-MM-DD' }   — коробка и дата следующего показа
//   active  = ключ активной темы (откуда берём НОВЫЕ слова)
//   day     = { date, count }                    — сколько слов пройдено сегодня

import { EXAM } from './exam.js';

const KEY = EXAM.store + '_vocab_v1';
export const DAILY_GOAL = 15;          // обязательная дневная норма слов
const BOX_DAYS = [0, 1, 2, 4, 8, 16];  // интервал по коробке (box 1..5; индекс 0 не используется)

function read() {
  try { return Object.assign({ srs: {}, active: null, day: { date: null, count: 0 } }, JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return { srs: {}, active: null, day: { date: null, count: 0 } }; }
}
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function today() { return ymd(new Date()); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }

// --- Активная тема (откуда новые слова) ---
export function getActiveTheme() { return read().active; }
export function setActiveTheme(key) { const s = read(); s.active = key; write(s); }

// --- Прогресс дня ---
function rollDay(s) {
  if (s.day.date !== today()) s.day = { date: today(), count: 0 };
  return s;
}
export function dailyProgress() {
  const s = rollDay(read()); write(s);
  return { count: s.day.count, goal: DAILY_GOAL, done: s.day.count >= DAILY_GOAL };
}

// --- Сбор дневной сессии: сначала «к повторению» (вперемешку), добор новыми из активной темы ---
function allItems(data) {
  const out = [];
  for (const th of data.themes) for (const g of th.groups) for (const it of g.items)
    out.push({ ...it, theme: th.key, themeRu: th.ru });
  return out;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Слова «к повторению» сегодня (есть в srs и срок наступил), вперемешку из всех тем
export function dueItems(data) {
  const s = read(); const t = today();
  const byId = {}; for (const it of allItems(data)) byId[it.id] = it;
  const due = Object.entries(s.srs)
    .filter(([id, r]) => byId[id] && r.due <= t)
    .map(([id]) => byId[id]);
  return shuffle(due);
}
// Новые слова активной темы (ещё не в srs)
export function newItems(data, theme) {
  const s = read();
  const th = data.themes.find((x) => x.key === theme);
  if (!th) return [];
  const items = [];
  for (const g of th.groups) for (const it of g.items) if (!s.srs[it.id]) items.push({ ...it, theme: th.key, themeRu: th.ru });
  return items;
}
// Сессия = due (вперемешку) + добор новыми из активной темы до n
export function buildSession(data, n = DAILY_GOAL) {
  const due = dueItems(data);
  if (due.length >= n) return due.slice(0, n);
  const active = getActiveTheme() || (data.themes[0] && data.themes[0].key);
  const fresh = newItems(data, active);
  return due.concat(fresh.slice(0, n - due.length));
}

// --- Оценка карточки: remembered=true → коробка выше, false → сброс в 1 ---
export function review(id, remembered) {
  const s = rollDay(read());
  const cur = s.srs[id] || { box: 0, due: today() };
  const box = remembered ? Math.min(5, (cur.box || 0) + 1) : 1;
  s.srs[id] = { box, due: addDays(BOX_DAYS[box]) };
  s.day.count += 1;
  write(s);
  return { count: s.day.count, goal: DAILY_GOAL, done: s.day.count >= DAILY_GOAL, box };
}

// --- Статистика по теме: сколько слов «освоено» (box>=4) / в работе / всего ---
export function themeStats(data) {
  const s = read();
  const res = {};
  for (const th of data.themes) {
    let total = 0, learned = 0, started = 0;
    for (const g of th.groups) for (const it of g.items) {
      total++;
      const r = s.srs[it.id];
      if (r) { started++; if (r.box >= 4) learned++; }
    }
    res[th.key] = { total, learned, started };
  }
  return res;
}

export function resetVocab() { try { localStorage.removeItem(KEY); } catch {} }
