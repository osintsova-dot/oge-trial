// vocab_srs.js — интервальное повторение лексики (Лейтнер) + дневная норма.
// Состояние в localStorage (раздельно по экзамену). Без сервера.
//   srs[id] = { box: 1..5, due: 'YYYY-MM-DD' }   — коробка и дата следующего показа
//   active  = ключ активной темы (откуда берём НОВЫЕ слова)
//   day     = { date, count }                    — сколько слов пройдено сегодня

import { EXAM } from './exam.js';

const KEY = EXAM.store + '_vocab_v1';
export const DAILY_GOAL = 15;          // обязательная дневная норма слов (закрывает день/серию)
const MIN_NEW = 5;                     // минимум новых слов в день (чтобы тема двигалась)
const SESSION_CAP = 20;                // потолок слов за сессию (чтобы список не взрывался)
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
    out.push({ ...it, theme: th.key, themeRu: th.name || th.ru });
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
  for (const g of th.groups) for (const it of g.items) if (!s.srs[it.id]) items.push({ ...it, theme: th.key, themeRu: th.name || th.ru });
  return items;
}
// Сессия = повторения (с их box) + минимум новых из активной темы. Каждый item несёт box (0=новое).
// Повторения сначала; новых не меньше MIN_NEW (если есть), добор до DAILY_GOAL; общий потолок SESSION_CAP.
export function buildSession(data) {
  const s = read();
  const due = dueItems(data).map((it) => ({ ...it, box: (s.srs[it.id] || {}).box || 1 }));
  const active = getActiveTheme() || (data.themes[0] && data.themes[0].key);
  const fresh = newItems(data, active).map((it) => ({ ...it, box: 0 }));
  let nNew = Math.max(DAILY_GOAL - due.length, fresh.length ? MIN_NEW : 0);
  nNew = Math.min(nNew, fresh.length, SESSION_CAP);
  const dueKeep = due.slice(0, SESSION_CAP - nNew);
  return dueKeep.concat(fresh.slice(0, Math.min(nNew, SESSION_CAP - dueKeep.length)));
}

// Какой режим показать по коробке: 1–2 выбор перевода, 3 cloze, 4–5 впечатать.
export function modeForBox(box) {
  if (box >= 4) return 'type';
  if (box === 3) return 'cloze';
  return 'choose';
}

// Cloze из примера: найти фразу en в ex (регистронезависимо) → предложение с пропуском. null, если нет.
export function clozeFor(item) {
  const ex = item.ex || '', phrase = item.en || '';
  if (!ex || !phrase) return null;
  const i = ex.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return null;
  return { sentence: ex.slice(0, i) + '____' + ex.slice(i + phrase.length), gapAnswer: ex.slice(i, i + phrase.length) };
}

// n случайных «неправильных» переводов (ru) из других слов — для режима выбора.
export function distractors(data, item, n = 3) {
  const all = allItems(data).filter((x) => x.id !== item.id && x.ru !== item.ru);
  return shuffle(all).slice(0, n).map((x) => x.ru);
}

// Нормализация ввода для type/cloze: регистр, пробелы, ведущие to/a/an/the.
export function normAnswer(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/^to\s+/, '').replace(/^(a|an|the)\s+/, '');
}

// --- Оценка карточки: remembered=true → коробка выше, false → сброс в 1 ---
// startBox — для новых слов (день-1): чистый интро → стартует с startBox (напр. 2); ошибка → box 1.
export function review(id, remembered, startBox) {
  const s = rollDay(read());
  const isNew = !s.srs[id];
  const cur = s.srs[id] || { box: 0, due: today() };
  let box;
  if (isNew && startBox) box = remembered ? startBox : 1;
  else box = remembered ? Math.min(5, (cur.box || 0) + 1) : 1;
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
