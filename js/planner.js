// planner.js — адаптивный недельный план от срока до экзамена.
// Ученик выбирает ЦЕЛЬ (3 уровня), приложение показывает «надо/нед» под его срок
// и помечает реалистичность относительно привычки 15 заданий/день (105/нед).
// Лексика считается отдельно (15 слов/день, свой SRS-темп).

import { loadJSON } from './data.js';
import { EXAM, t } from './exam.js';
import { examInfo, getPlanGoal } from './gamify.js';
import { sectionStats, writingStats } from './progress.js';
import { themeStats } from './vocab_srs.js';

const HABIT_WEEKLY = 15 * 7;  // 105 — дневной темп 15 заданий × 7
const WARN_WEEKLY = 160;      // выше → «не успеть» (🔒); между — «интенсивно» (⚠️)
const READING_KEY = 'Чтение';

// Цели: perTopic — сколько задач на тему (Infinity = весь банк); writing — целевое число писем.
const TIERS = [
  { key: 'full',   perTopic: Infinity, writing: 20 },
  { key: 'master', perTopic: 15,       writing: 12 },
  { key: 'light',  perTopic: 5,        writing: 5 },
];

// Псевдо-темы чтения из данных (когда у раздела нет КЭС в topics — напр. ЕГЭ-чтение):
// строим список по форматам с их объёмом, kes совпадает с тем, что пишет модуль чтения.
async function readingTopics(dataFile) {
  try {
    const d = await loadJSON(dataFile);
    const rf = t.readFmt || {};
    const list = [];
    if (Array.isArray(d.headings)) list.push({ kes: '1.3.1', label: rf['1.3.1'] || 'Headings', count: d.headings.length });
    if (Array.isArray(d.gaps)) list.push({ kes: '1.3.2', label: rf['1.3.2'] || 'Gapped text', count: d.gaps.length });
    if (Array.isArray(d.mc)) list.push({ kes: '1.3.3', label: rf['1.3.3'] || 'Multiple choice', count: d.mc.reduce((n, g) => n + (g.questions ? g.questions.length : 0), 0) });
    return list;
  } catch { return []; }
}

// Остаток под заданную «глубину». Возвращает {R, secs, weak}. extra — псевдо-темы по sec.id.
function compute(topics, perTopic, writingTarget, extra) {
  const secs = [], weak = [];
  let R = 0;
  for (const s of EXAM.sections) {
    if (s.type === 'writing') {
      const done = writingStats().count;
      const rem = Math.max(0, writingTarget - done);
      R += rem;
      secs.push({ id: s.id, name: t.sections[s.id], rem, doneTopics: rem ? 0 : 1, totTopics: 1 });
      if (rem) weak.push({ section: s.id, label: t.sections[s.id], rem });
      continue;
    }
    if (s.type !== 'drill' && s.type !== 'reading') continue;
    const topicKey = s.topicKey || (s.type === 'reading' ? READING_KEY : null);
    let list = topicKey ? (topics[topicKey] || []) : [];
    if (!list.length && s.type === 'reading' && extra && extra[s.id]) list = extra[s.id];  // ЕГЭ-чтение без КЭС
    if (!list.length) continue;
    const by = sectionStats(s.id).byKes;
    let secRem = 0, doneT = 0;
    for (const tp of list) {
      const tgt = Math.min(perTopic, tp.count);
      const att = (by[tp.kes] || {}).attempted || 0;
      const rem = Math.max(0, tgt - att);
      secRem += rem;
      if (rem <= 0) doneT++;
      else weak.push({ section: s.id, label: tp.label, rem });
    }
    R += secRem;
    secs.push({ id: s.id, name: t.sections[s.id], rem: secRem, doneTopics: doneT, totTopics: list.length });
  }
  return { R, secs, weak: weak.sort((a, b) => b.rem - a.rem) };
}

function statusOf(weekly, R) {
  if (R === 0) return 'done';
  if (weekly <= HABIT_WEEKLY) return 'ok';
  if (weekly <= WARN_WEEKLY) return 'tight';
  return 'hard';
}

export async function weeklyPlan() {
  const ei = examInfo();
  if (!ei) return { hasDate: false };
  if (ei.state === 'past') return { hasDate: true, past: true };
  const weeks = Math.max(1, ei.weeksLeft);

  const topics = await loadJSON(EXAM.topicsFile);
  // Псевдо-темы для reading-разделов без КЭС (ЕГЭ-чтение)
  const extra = {};
  for (const s of EXAM.sections) {
    if (s.type === 'reading') {
      const tk = s.topicKey || READING_KEY;
      if (!(topics[tk] || []).length && s.dataFile) extra[s.id] = await readingTopics(s.dataFile);
    }
  }
  const tiers = TIERS.map((def) => {
    const c = compute(topics, def.perTopic, def.writing, extra);
    const weekly = Math.ceil(c.R / weeks);
    return { key: def.key, R: c.R, weekly, daily: Math.ceil(weekly / 7),
      status: statusOf(weekly, c.R), secs: c.secs, weak: c.weak };
  });

  // Рекомендация — самая полная цель со статусом «реально»; иначе самая лёгкая.
  const rec = tiers.find((x) => x.status === 'ok') || tiers[tiers.length - 1];
  const stored = getPlanGoal();
  const chosen = tiers.find((x) => x.key === stored) || rec;

  // Лексика — отдельно
  const vocab = { learned: 0, total: 0 };
  try {
    const vsec = EXAM.sections.find((s) => s.type === 'vocab');
    const vd = await loadJSON(vsec ? vsec.dataFile : 'vocab');
    const ts = themeStats(vd);
    for (const k in ts) { vocab.learned += ts[k].learned; vocab.total += ts[k].total; }
  } catch {}

  return {
    hasDate: true, weeks, vocab,
    tiers, recommendedKey: rec.key, chosenKey: chosen.key, chosen,
    allDone: tiers[0].R === 0,   // весь банк пройден
  };
}
