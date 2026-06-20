// voice.js — персонализированные фразы (тон «с характером / драйв»).
// Пулы фраз берём из strings по языку экзамена (ru/en). {name}/{score} подставляются.

import { t } from './exam.js';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function say(kind, name, vars = {}) {
  const pool = (t.voice && t.voice[kind]) || [''];
  return pick(pool)
    .replace(/{name}/g, name || t.friend)
    .replace(/{score}/g, vars.score || '');
}

// Фраза для праздничного экрана по типу момента
export function celeb(kind, name) {
  const map = { hero: 'celHero', level: 'celLevel', streak: 'celStreak', freeze: 'celFreeze', ach: 'celAch' };
  return say(map[kind] || 'celAch', name);
}

// Сообщение по итогу раунда: герой → high → mid → low
export function roundMessage(name, correct, total, hero) {
  if (hero) return say('hero', name);
  const ratio = total ? correct / total : 0;
  const kind = ratio >= 0.8 ? 'high' : ratio >= 0.5 ? 'mid' : 'low';
  return say(kind, name, { score: correct + '/' + total });
}
