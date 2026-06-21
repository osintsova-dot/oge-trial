// gamify.js — слой геймификации (серия, «пак», XP, уровни, тема, заморозки, ачивки).
// Экзамен-независимый: хранит состояние в localStorage, без сервера и аккаунтов.

import { totalDrill, goldCrownCount } from './progress.js';
import { EXAM, t } from './exam.js';

const KEY = EXAM.store + '_game_v1';

// Разделы, входящие в «пак» (собери все → Герой). Расширится с Фазой 2 (чтение, аудирование).
export const PACK_SECTIONS = [
  { key: 'grammar',  label: 'Грамматика',       icon: '📝', hash: 'grammar'  },
  { key: 'wordform', label: 'Словообразование', icon: '🔤', hash: 'wordform' },
  { key: 'reading',  label: 'Чтение',           icon: '📖', hash: 'reading'  },
  { key: 'writing',  label: 'Письмо',           icon: '✉️', hash: 'writing'  },
];

// Пороги XP для званий (названия — из strings по языку экзамена)
const LEVEL_MINS = [0, 500, 1500, 3000, 5000, 8000];

const DEFAULT = { name: '', streak: { count: 0, lastDay: null }, pack: { done: [] }, heroes: 0, xp: 0, theme: 'light', history: {}, skin: 'aurora', freezes: 0, perfectRounds: 0, maxStreak: 0, achieved: [], tokens: 0, redeemed: [], sound: true, examDate: null, onboarded: false, tipsSeen: [] };

// Реальные привилегии у учителя — покупаются за жетоны 🎟 (зарабатываются работой в приложении).
// Список и цены — конфиг; меняются свободно.
// Текст (title/desc) — из t.perks[id].
export const PERKS = [
  { id: 'hint', icon: '💡', cost: 2 },
  { id: 'nohw', icon: '🎒', cost: 4 },
  // переменные привилегии (обмен жетонов): выбираешь количество жетонов
  { id: 'points', icon: '➕', iconFile: 'perk-star', cost: 1, variable: true, min: 1, max: 10 }, // 1 жетон = +1 балл к тесту, до 10
  { id: 'coins', icon: '🪙', cost: 1, variable: true, min: 1, max: null },                       // 1 жетон = 5 монет «Твоя школа», без потолка
];
// amount задаётся при обмене переменной привилегии — тогда title = «+N…», cost = amount
function perkText(p, amount) {
  const d = t.perks[p.id];
  const o = { id: p.id, icon: p.icon, iconFile: p.iconFile || ('perk-' + p.id),
    cost: p.cost, title: d.title, desc: d.desc, how: d.how,
    variable: !!p.variable, min: p.min || 1, max: p.max || null,
    chooseHelp: d.chooseHelp || null, chooseBig: d.chooseBig || null, badgeShow: d.badgeShow || null };
  if (p.variable && amount != null) { o.title = d.titleN ? d.titleN(amount) : d.title; o.cost = amount; }
  return o;
}

const FREEZE_CAP = 3; // максимум накопленных заморозок

// Достижения (ачивки). done(state, totals, goldCrowns) → выполнено ли. Текст — из t.ach[id].
export const ACHIEVEMENTS = [
  // badge: 'times' → уголок «×N» (повторяемое), 'record' → уголок «N» (рекорд).
  // count(s,tot,g) → число для уголка и строки «получено N раз» в модалке.
  { id: 'first',       icon: '🐣', done: (s) => s.xp > 0 },
  { id: 'perfect',     icon: '✨', done: (s) => (s.perfectRounds || 0) >= 1, count: (s) => s.perfectRounds || 0, badge: 'times' },
  { id: 'hero',        icon: '🦸', done: (s) => s.heroes >= 1, count: (s) => s.heroes || 0, badge: 'times' },
  { id: 'hundred',     icon: '💯', done: (s, tot) => tot.attempted >= 100 },
  { id: 'week',        icon: '📅', done: (s) => (s.maxStreak || 0) >= 7, count: (s) => s.maxStreak || 0, badge: 'record' },
  { id: 'gold',        icon: '👑', done: (s, tot, g) => g >= 1, count: (s, tot, g) => g, badge: 'times' },
  { id: 'fivehundred', icon: '🔥', done: (s, tot) => tot.attempted >= 500 },
  { id: 'frosty',      icon: '🧊', done: (s) => (s.freezes || 0) >= 3 },
];

const HISTORY_KEEP = 60; // сколько дней истории храним (для дневного/недельного итога)

// Скины-награды: градиент XP-полосы, открываются за уровни/героев. Текст (name/desc/need) — из t.skins[id].
export const SKINS = [
  { id: 'aurora',    grad: 'linear-gradient(90deg,#6C3FC5,#F5C842)',          req: () => true },
  { id: 'sunset',    grad: 'linear-gradient(90deg,#C84B8C,#F5A03C)',          req: (s) => levelInfo(s.xp).level >= 2 },
  { id: 'grape',     grad: 'linear-gradient(90deg,#4F2C92,#8E5BE8)',          req: (s) => levelInfo(s.xp).level >= 4 },
  { id: 'honeycomb', grad: 'linear-gradient(90deg,#EDA92C,#F5C842)',          req: (s) => s.heroes >= 2 },
  { id: 'guru',      grad: 'linear-gradient(90deg,#6C3FC5,#C84B8C,#F5C842)',  req: (s) => levelInfo(s.xp).level >= 6 },
];

function read() {
  try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return Object.assign({}, DEFAULT); }
}
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayStr() { return ymd(new Date()); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); }
// Сколько дней между двумя датами 'YYYY-MM-DD' (b - a)
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

// Заморозки серии (для отображения)
export function getFreezes() { return read().freezes || 0; }

export function getState() { return read(); }

// Был ли сегодня хотя бы один раунд (цель дня выполнена)
export function streakActiveToday() { return read().streak.lastDay === todayStr(); }

// Имя ученика (персонализация)
export function getName() { return read().name || ''; }
export function setName(name) { const s = read(); s.name = (name || '').trim().slice(0, 24); write(s); }

// Дата экзамена (гранулярность «месяц/год», строка 'YYYY-MM' или null)
export function getExamDate() { return read().examDate || null; }
export function setExamDate(ym) { const s = read(); s.examDate = ym || null; write(s); }

// Онбординг пройден (имя + дата + интро)
export function isOnboarded() { return !!read().onboarded; }
export function setOnboarded(v) { const s = read(); s.onboarded = !!v; write(s); }

// Виден ли уже совет Спики по разделу (авто-показ только в первый раз)
export function hasSeenTip(id) { return (read().tipsSeen || []).includes(id); }
export function markTipSeen(id) { const s = read(); s.tipsSeen = s.tipsSeen || []; if (!s.tipsSeen.includes(id)) { s.tipsSeen.push(id); write(s); } }

// Сводка по дате экзамена для счётчика. null, если дата не задана.
// state: 'future' | 'thisMonth' | 'past'. Считаем до 1-го числа выбранного месяца.
export function examInfo() {
  const ym = read().examDate;
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return null;
  const target = ymd(new Date(y, m - 1, 1));
  const today = new Date();
  const days = daysBetween(todayStr(), target);
  const sameMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
  let state = 'future';
  if (sameMonth || (days <= 0 && days > -28)) state = 'thisMonth';
  if (days <= -28) state = 'past';
  return { ym, year: y, month: m, daysLeft: days, weeksLeft: Math.max(0, Math.round(days / 7)), state };
}

// Таблица всех уровней: [{level, min, title}] — для экрана-объяснения «какие уровни»
export function levelTable() {
  return LEVEL_MINS.map((min, k) => ({ level: k + 1, min, title: t.ranks[k] }));
}

// Уровень и звание по XP (названия берём из t.ranks)
export function levelInfo(xp) {
  let i = 0;
  for (let k = 0; k < LEVEL_MINS.length; k++) if (xp >= LEVEL_MINS[k]) i = k;
  const curMin = LEVEL_MINS[i], nextMin = LEVEL_MINS[i + 1];
  return {
    level: i + 1,
    title: t.ranks[i],
    next: nextMin != null ? t.ranks[i + 1] : null,
    toNext: nextMin != null ? nextMin - xp : 0,
    pct: nextMin != null ? Math.round(((xp - curMin) / (nextMin - curMin)) * 100) : 100,
  };
}

// Разделы, доступные сегодня (ещё не пройденные в текущем паке) — «минус сделанное»
export function availableSections() {
  const done = read().pack.done;
  return PACK_SECTIONS.filter((s) => !done.includes(s.key));
}
export function packStatus() {
  const done = read().pack.done;
  return {
    done, total: EXAM.pack.length, ids: EXAM.pack,
    complete: EXAM.pack.every((id) => done.includes(id)),
  };
}

// Засчитать завершённый раунд раздела. correct/total — для XP.
// Возвращает сводку для дневного итога.
export function recordRound(section, correct, total) {
  const s = read();
  const today = todayStr();

  // Серия больше НЕ растёт от закрытых разделов — день закрывает ТОЛЬКО дневная норма
  // лексики (см. recordVocabReview / advanceStreak). Здесь — только XP, пак, история.
  const streakUp = false, freezeUsed = 0;

  // XP: 10 за верный ответ + 30 за идеальный раунд
  const xpGained = (correct * 10) + (total > 0 && correct === total ? 30 : 0);
  const xpBefore = s.xp;
  s.xp += xpGained;

  // Идеальный раунд → +1 заморозка (до потолка) и счётчик идеалов (для ачивок)
  let freezeEarned = false;
  if (total > 0 && correct === total) {
    s.perfectRounds = (s.perfectRounds || 0) + 1;
    if ((s.freezes || 0) < FREEZE_CAP) { s.freezes = (s.freezes || 0) + 1; freezeEarned = true; }
  }

  // Пак: отметить раздел пройденным
  let sectionNewlyDone = false;
  if (EXAM.pack.includes(section) && !s.pack.done.includes(section)) {
    s.pack.done.push(section);
    sectionNewlyDone = true;
  }
  // Пак собран → Герой, сброс на новый круг
  let heroAwarded = false;
  if (EXAM.pack.every((id) => s.pack.done.includes(id))) {
    s.heroes += 1;
    s.pack.done = [];
    heroAwarded = true;
  }

  // Жетоны 🎟 за работу: +1 за собранный пак (Героя), +2 за веху серии
  let tokensEarned = 0;
  if (heroAwarded) { s.tokens = (s.tokens || 0) + 1; tokensEarned += 1; }
  if (streakUp && [7, 14, 30, 50, 100].includes(s.streak.count)) { s.tokens = (s.tokens || 0) + 2; tokensEarned += 2; }

  // История по дням — для дневного/недельного итога
  s.history = s.history || {};
  const d = s.history[today] || { rounds: 0, correct: 0, total: 0, xp: 0 };
  d.rounds += 1; d.correct += correct; d.total += total; d.xp += xpGained;
  s.history[today] = d;
  const days = Object.keys(s.history).sort();
  while (days.length > HISTORY_KEEP) delete s.history[days.shift()];

  write(s);
  const lvlBefore = levelInfo(xpBefore).level;
  const lvl = levelInfo(s.xp);
  return {
    streak: s.streak.count, streakUp,
    xpGained, xpTotal: s.xp,
    levelUp: lvl.level > lvlBefore, level: lvl.level, title: lvl.title,
    sectionNewlyDone, heroAwarded, heroes: s.heroes,
    freezes: s.freezes, freezeUsed, freezeEarned,
    tokens: s.tokens, tokensEarned,
    pack: packStatus(),
  };
}

// Продвинуть серию на сегодня (заморозки прикрывают пропуски). Вызывается, когда
// закрыта дневная норма лексики. Возвращает {streakUp, freezeUsed, tokensEarned}.
function advanceStreak(s) {
  const today = todayStr();
  let streakUp = false, freezeUsed = 0, tokensEarned = 0;
  if (s.streak.lastDay !== today) {
    if (!s.streak.lastDay) {
      s.streak.count = 1;
    } else {
      const missed = daysBetween(s.streak.lastDay, today) - 1;
      if (missed <= 0) s.streak.count += 1;
      else if ((s.freezes || 0) >= missed) { s.freezes -= missed; freezeUsed = missed; s.streak.count += 1; }
      else s.streak.count = 1;
    }
    s.streak.lastDay = today;
    streakUp = true;
    if (s.streak.count > (s.maxStreak || 0)) s.maxStreak = s.streak.count;
    if ([7, 14, 30, 50, 100].includes(s.streak.count)) { s.tokens = (s.tokens || 0) + 2; tokensEarned += 2; }
  }
  return { streakUp, freezeUsed, tokensEarned };
}

// Засчитать карточку лексики. remembered — «помню». dayJustClosed — норма 15 закрыта именно сейчас.
// XP за карточку (+бонус за закрытие дня), и тогда же продвигается серия (день «закрыт»).
export function recordVocabReview(remembered, dayJustClosed) {
  const s = read();
  const today = todayStr();
  const xpBefore = s.xp;
  let xpGained = remembered ? 5 : 2;
  let streakUp = false, freezeUsed = 0, tokensEarned = 0;
  if (dayJustClosed) {
    const a = advanceStreak(s);
    streakUp = a.streakUp; freezeUsed = a.freezeUsed; tokensEarned = a.tokensEarned;
    xpGained += 20; // бонус за закрытие дневной нормы лексики
    // заморозка за закрытый день (до потолка)
    if ((s.freezes || 0) < FREEZE_CAP) { s.freezes = (s.freezes || 0) + 1; }
  }
  s.xp += xpGained;
  s.history = s.history || {};
  const d = s.history[today] || { rounds: 0, correct: 0, total: 0, xp: 0 };
  d.xp += xpGained;
  s.history[today] = d;
  const days = Object.keys(s.history).sort();
  while (days.length > HISTORY_KEEP) delete s.history[days.shift()];
  write(s);
  const lvl = levelInfo(s.xp), lvlBefore = levelInfo(xpBefore).level;
  return {
    xpGained, streak: s.streak.count, streakUp, freezeUsed, tokensEarned,
    dayClosed: !!dayJustClosed, levelUp: lvl.level > lvlBefore, level: lvl.level, title: lvl.title,
    tokens: s.tokens, freezes: s.freezes,
  };
}

// Дневной и недельный итог (по истории). week — суммарно за последние 7 дней.
export function dailyDigest() {
  const h = read().history || {};
  const today = h[todayStr()] || { rounds: 0, correct: 0, total: 0, xp: 0 };
  const week = { rounds: 0, correct: 0, total: 0, xp: 0, days: 0 };
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const dd = new Date(now); dd.setDate(now.getDate() - i);
    const rec = h[ymd(dd)];
    if (rec) { week.rounds += rec.rounds; week.correct += rec.correct; week.total += rec.total; week.xp += rec.xp; week.days += 1; }
  }
  return { today, week };
}

// Скины-награды: статус коллекции (что открыто), выбор и применение
export function skinsStatus() {
  const s = read();
  const cur = getSkin();
  return SKINS.map((sk) => ({ id: sk.id, grad: sk.grad,
    name: t.skins[sk.id].name, desc: t.skins[sk.id].desc, need: t.skins[sk.id].need, how: t.skins[sk.id].how,
    unlocked: !!sk.req(s), equipped: sk.id === cur }));
}
export function getSkin() {
  const s = read();
  const sk = SKINS.find((x) => x.id === s.skin);
  // если выбранный скин почему-то недоступен — откат к базовому (Аврора)
  return (sk && sk.req(s)) ? sk.id : 'aurora';
}
// CSS-градиент активного скина — для XP-полосы и превью
export function getSkinGrad() {
  return (SKINS.find((x) => x.id === getSkin()) || SKINS[0]).grad;
}
export function setSkin(id) {
  const s = read();
  const sk = SKINS.find((x) => x.id === id);
  if (!sk || !sk.req(s)) return false;   // надеть можно только разблокированное
  s.skin = id; write(s); applySkin(); return true;
}
// Применяем градиент скина в переменную --xp-fill (её использует .xp-fill и превью)
export function applySkin() { document.documentElement.style.setProperty('--xp-fill', getSkinGrad()); }

// --- Жетоны и привилегии ---
export function getTokens() { return read().tokens || 0; }
export function perksStatus() {
  const bal = read().tokens || 0;
  return PERKS.map((p) => ({ ...perkText(p),
    affordable: bal >= (p.variable ? (p.min || 1) : p.cost), balance: bal }));
}
function makeCode() {
  const h = '0123456789ABCDEF';
  let c = '';
  for (let i = 0; i < 4; i++) c += h[Math.floor(Math.random() * 16)];
  return 'SS-' + c;
}
// Потратить жетоны на привилегию → выдать код-бейдж (показать учителю). null, если не хватает жетонов.
export function redeemPerk(id, amount) {
  const s = read();
  const p = PERKS.find((x) => x.id === id);
  if (!p) return null;
  let cost;
  if (p.variable) {
    cost = Math.round(amount || 0);
    if (cost < (p.min || 1)) return null;
    if (p.max && cost > p.max) cost = p.max;
  } else cost = p.cost;
  if ((s.tokens || 0) < cost) return null;
  s.tokens -= cost;
  const rec = { id, code: makeCode(), ts: Date.now() };
  if (p.variable) rec.amount = cost;
  s.redeemed = s.redeemed || [];
  s.redeemed.unshift(rec);
  if (s.redeemed.length > 50) s.redeemed.length = 50;
  write(s);
  return { perk: perkText(p, rec.amount), code: rec.code, ts: rec.ts, amount: rec.amount };
}
export function recentRedeemed() {
  return (read().redeemed || []).map((r) => { const p = PERKS.find((x) => x.id === r.id); return { ...r, perk: p ? perkText(p, r.amount) : null }; });
}

// Статус всех ачивок (для экрана прогресса). Текст — из t.ach[id].
export function achievementsStatus() {
  const s = read(), tot = totalDrill(), g = goldCrownCount();
  return ACHIEVEMENTS.map((a) => {
    const def = t.ach[a.id];
    const done = !!a.done(s, tot, g);
    const count = a.count ? a.count(s, tot, g) : null;
    // строка «получено N раз» / «рекорд N» в модалке — только когда есть смысл
    const rep = (def.rep && count != null && count > 0) ? def.rep(count) : null;
    // уголок на плитке: ×N для повторяемых (от 2-х), число-рекорд для серии
    let badge = null;
    if (done && a.badge === 'times' && count >= 2) badge = '×' + count;
    else if (done && a.badge === 'record' && count > 0) badge = String(count);
    return { id: a.id, icon: a.icon, title: def.title, desc: def.desc, how: def.how, done, count, rep, badge };
  });
}
// Вернуть только что открытые ачивки (с текстом из t), чтобы показать праздник
export function checkNewAchievements() {
  const s = read(), tot = totalDrill(), g = goldCrownCount();
  const earned = ACHIEVEMENTS.filter((a) => a.done(s, tot, g)).map((a) => a.id);
  const had = s.achieved || [];
  const fresh = earned.filter((id) => !had.includes(id));
  if (fresh.length) { s.achieved = earned; write(s); }
  return fresh.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return { id, icon: a.icon, title: t.ach[id].title, desc: t.ach[id].desc }; });
}

// Тема (светлая/тёмная)
export function getTheme() { return read().theme || 'light'; }
export function setTheme(theme) { const s = read(); s.theme = theme; write(s); applyTheme(theme); }
export function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme || 'light'); }

// Звуки результата (вкл/выкл). По умолчанию включены.
export function getSound() { const s = read(); return s.sound !== false; }
export function setSound(on) { const s = read(); s.sound = !!on; write(s); }
