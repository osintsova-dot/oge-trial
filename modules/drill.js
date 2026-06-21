// drill.js — универсальный дрилл закрытых заданий (общий для ОГЭ и ЕГЭ).
// Тексты — из strings (t) по языку экзамена; данные/ключи/темы — из cfg (exam.js).

import { el, mount, confetti, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { checkAnswer } from '../js/checker.js';
import { recordDrill, sectionStats, mistakeZids, crownTier } from '../js/progress.js';
import { recordRound, getName, checkNewAchievements, dailyRoundSize } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { playCorrect, playWrong } from '../js/sound.js';
import { t, plural } from '../js/exam.js';
import { tipButton, autoTipOnce } from '../js/tips.js';

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function accColor(p) { return p >= 65 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)'; }

// Праздничные «моменты» из результата раунда
function buildMoments(g, name) {
  const m = [];
  if (g.heroAwarded) m.push({ icon: '🦸', img: './assets/spiky-hero.png', title: t.celHeroT, text: celeb('hero', name), confetti: true });
  if (g.levelUp) m.push({ icon: '⭐', img: './assets/spiky-cheer.png', title: t.celLevelT(g.level, g.title), text: celeb('level', name), confetti: true });
  if (g.streakUp && [3, 7, 14, 30, 50, 100].includes(g.streak)) m.push({ icon: '🔥', img: './assets/spiky-fire.png', title: t.celStreakT(g.streak), text: celeb('streak', name) });
  if (g.freezeEarned) m.push({ icon: '🧊', title: t.celFreezeT, text: celeb('freeze', name) });
  if (g.tokensEarned) m.push({ icon: '🎟', img: './assets/spiky-gift.png', title: t.celTokenT(g.tokensEarned, plural(g.tokensEarned, t.tokenWord)), text: t.celTokenText(name || t.friend) });
  for (const a of checkNewAchievements()) m.push({ icon: a.icon, img: './assets/spiky-medal.png', title: a.title, text: t.celAchText(a.desc, celeb('ach', name)), confetti: true });
  return m;
}

// Перемешать копию массива (Fisher–Yates)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Разбить текст вокруг пропуска и убрать опорное слово в конце
function parseTask(item) {
  let sentence = item.text || '';
  if (item.base_word) sentence = sentence.replace(new RegExp('\\s*' + item.base_word + '\\s*$'), '');
  const parts = sentence.split(/_{3,}/);
  return { before: parts[0] || '', after: parts.slice(1).join(' ') };
}

// cfg: {section, dataFile, topicKey, title, keysFile, topicsFile, explainFile, goHome}
export async function renderDrill(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let items, keys, topics, explains;
  try {
    [items, keys, topics] = await Promise.all([
      loadJSON(cfg.dataFile), loadJSON(cfg.keysFile || 'keys'), loadJSON(cfg.topicsFile || 'topics'),
    ]);
    explains = await loadJSON(cfg.explainFile || 'explanations').catch(() => ({}));
  } catch (e) {
    mount(container, el('div', { class: 'err-msg', text: e.message }));
    return;
  }
  const withKey = items.filter((it) => keys[it.zid]);
  const themes = (topics[cfg.topicKey] || []).slice();
  const meta = `${withKey.length} ${plural(withKey.length, t.tasksWord)} · ${themes.length} ${plural(themes.length, t.topicsWord)}`;

  themeScreen();
  autoTipOnce(cfg.section);

  function themeScreen() {
    const stats = sectionStats(cfg.section);
    const crownEmoji = ['', '🥉', '🥈', '🥇'];
    const list = el('div', { class: 'topic-list' });
    for (const tp of themes) {
      const pool = withKey.filter((it) => it.kes === tp.kes);
      if (!pool.length) continue;
      const s = stats.byKes[tp.kes];
      const p = s && s.attempted ? pct(s.correct, s.attempted) : null;
      const c = p != null ? accColor(p) : 'var(--faint)';
      const tier = s ? crownTier(s.attempted, s.correct) : 0;
      list.appendChild(el('button', { class: 'topic-item', onclick: () => startDrill(pool, tp.label) }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ti-name' }, [tier ? iconImg('crown-' + tier, crownEmoji[tier], 'ti-crown') : null, tier ? ' ' : '', tp.label]),
          el('div', { class: 'ti-count', text: pool.length + ' ' + plural(pool.length, t.tasksWord) }),
        ]),
        el('div', { class: 'ti-right' }, [
          el('div', { class: 'ti-acc', style: { color: c }, text: p != null ? p + '%' : '—' }),
          el('div', { class: 'ti-bar' }, [el('i', { style: { width: (p || 0) + '%', background: c } })]),
        ]),
      ]));
    }

    const mistakeSet = new Set(mistakeZids(cfg.section));
    const mistakes = withKey.filter((it) => mistakeSet.has(it.zid));
    const mistakeCard = mistakes.length ? el('button', { class: 'mistakes-card', onclick: () => startDrill(mistakes, t.mistakes) }, [
      el('div', { class: 'at-ic' }, [iconImg('ic-mistakes', '🔁', 'at-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'at-t', text: t.mistakes }),
        el('div', { class: 'at-s', text: t.mistakesSub(mistakes.length, plural(mistakes.length, t.tasksWord)) }),
      ]),
      el('div', { class: 'at-arrow', text: '→' }),
    ]) : null;

    mount(container, el('div', { class: 'view' }, [
      el('div', { class: 'sec-bar ' + cfg.section }, [
        el('button', { class: 'back', text: '←', onclick: cfg.goHome }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'sb-title', text: cfg.title }),
          el('div', { class: 'sb-sub', text: meta }),
        ]),
        tipButton(cfg.section),
      ]),
      el('div', { class: 'topics-body' }, [
        mistakeCard,
        el('button', { class: 'all-topics ' + cfg.section, onclick: () => startDrill(withKey, t.allTopics) }, [
          el('div', { class: 'at-ic' }, [iconImg('ic-dice', '🎲', 'at-img')]),
          el('div', { style: { flex: '1' } }, [
            el('div', { class: 'at-t', text: t.allTopics }),
            el('div', { class: 'at-s', text: t.allTopicsSub }),
          ]),
          el('div', { class: 'at-arrow', text: '→' }),
        ]),
        el('div', { class: 'topics-label', text: t.byCodifier }),
        list,
      ]),
    ]));
  }

  function startDrill(pool, themeName) {
    const order = shuffle(pool);
    let roundStart = 0;
    let queue, idx, results;
    startRound();

    function startRound() {
      const n = dailyRoundSize(cfg.section, order.length);   // размер раунда = план дня по разделу
      queue = [];
      for (let i = 0; i < n; i++) queue.push(order[(roundStart + i) % order.length]);
      roundStart = (roundStart + n) % order.length;
      idx = 0; results = [];
      question();
    }

    function question() {
      if (idx >= queue.length) return summary();
      const item = queue[idx];
      const key = keys[item.zid];
      const { before, after } = parseTask(item);
      let answered = false, checkedAt = 0;

      const blank = el('span', { class: 'blank', text: '?' });
      const input = el('input', { class: 'answer-input', type: 'text', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false', placeholder: t.enterAnswer });
      const badge = el('div', { style: { display: 'none' } });
      const why = el('div', { style: { display: 'none' } });
      const action = el('button', { class: 'btn btn-check', text: t.check, disabled: true });

      const segEls = [];
      const segBar = el('div', { class: 'seg-bar' });
      for (let i = 0; i < queue.length; i++) {
        let cls = 'seg';
        if (i < results.length) cls = results[i] ? 'seg-ok' : 'seg-bad';
        else if (i === idx) cls = 'seg-cur';
        const sg = el('i', { class: cls });
        segEls.push(sg); segBar.appendChild(sg);
      }

      const doCheck = () => {
        const val = input.value.trim();
        if (!val) { input.focus(); return; }
        answered = true; checkedAt = Date.now();
        const { correct, expected } = checkAnswer(val, key);
        correct ? playCorrect() : playWrong();
        recordDrill(cfg.section, item.zid, correct, item.kes);
        results.push(correct);
        segEls[idx].className = 'seg-just ' + (correct ? 'seg-ok' : 'seg-bad');
        input.readOnly = true;
        input.classList.add(correct ? 'correct' : 'wrong');
        blank.textContent = val;
        badge.className = 'answer-badge ' + (correct ? 'ok' : 'bad');
        badge.textContent = correct ? '✓' : '✕';
        badge.style.display = 'flex';
        why.className = 'why ' + (correct ? 'ok' : 'bad');
        const parts = [];
        if (!correct) parts.push(el('div', { class: 'correct-line', text: t.correctIs(expected) }));
        parts.push(el('div', { class: 'why-h', text: t.why }));
        parts.push(el('div', { class: 'why-text', text: explains[item.zid] || (correct ? t.whyCorrect : t.whyCheck) }));
        why.replaceChildren(...parts);
        why.style.display = 'block';
        const last = idx + 1 >= queue.length;
        action.textContent = last ? t.finish : t.next;
        action.className = 'btn ' + (correct ? 'btn-next-ok' : 'btn-next-bad');
        action.disabled = false;
      };
      const doAdvance = () => { idx++; question(); };

      action.addEventListener('click', () => {
        if (!answered) doCheck();
        else if (Date.now() - checkedAt > 250) doAdvance();
      });
      input.addEventListener('input', () => { if (!answered) action.disabled = !input.value.trim(); });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.repeat) return;
        e.preventDefault();
        if (!answered) doCheck();
        else if (Date.now() - checkedAt > 450) doAdvance();
      });

      mount(container, el('div', { class: 'round view' }, [
        el('div', { class: 'round-top' }, [
          el('div', { class: 'drill-bar' }, [
            el('button', { class: 'drill-x', text: '✕', onclick: themeScreen }),
            el('div', { class: 'drill-title', text: `${cfg.title} · ${themeName}` }),
            el('div', { class: 'drill-count', text: `${idx + 1} / ${queue.length}` }),
          ]),
          segBar,
        ]),
        el('div', { class: 'round-body' }, [
          el('div', { class: 'task-kind', text: cfg.title }),
          item.base_word
            ? el('div', { class: 'base-chip' }, [
                el('span', { class: 'bc-l', text: t.baseWord }),
                el('span', { class: 'bc-w', text: item.base_word }),
              ])
            : null,
          el('div', { class: 'task-text' }, [before, blank, after]),
          el('div', { class: 'answer-wrap' }, [input, badge]),
          why,
        ]),
        el('div', { class: 'round-foot' }, [action]),
      ]));
      input.focus();
    }

    function summary() {
      const correct = results.filter(Boolean).length;
      const total = results.length;
      const g = recordRound(cfg.section, correct, total);
      const name = getName();
      const acc = pct(correct, total);
      const praise = acc >= 80 ? t.praiseHigh : acc >= 60 ? t.praiseMid : t.praiseLow;

      const rline = (iconName, emoji, label, valueClass, value) => el('div', { class: 'reward-line' },
        [el('span', { class: 'rl-label' }, [iconImg(iconName, emoji), el('span', { text: ' ' + label })]),
         el('b', { class: valueClass, text: value })]);

      function showResult() {
        const children = [
          el('div', { class: 'voice-msg', text: roundMessage(name, correct, total, g.heroAwarded) }),
          el('div', { class: 'res-num' }, [String(correct), el('span', { text: '/' + total })]),
          el('div', { class: 'res-acc', text: t.accLine(acc, praise) }),
          el('div', { class: 'reward' }, [
            rline('ic-streak', '🔥', t.rStreak, 'v-streak', g.streak + ' ' + t.dayWord(g.streak)),
            rline('ic-xp', '⭐', t.rXp, 'v-xp', '+' + g.xpGained + ' XP'),
            g.freezeUsed ? rline('ic-freeze', '🧊', t.rFreeze, 'v-pack', t.freezeSaved) : null,
            rline('ic-hero', '🦸', t.rPack, 'v-pack', t.packOf(g.pack.done.length, g.pack.total)),
          ].filter(Boolean)),
          el('button', { class: 'btn btn-primary btn-block', text: t.more15, onclick: startRound }),
          el('div', { class: 'row-actions' }, [
            el('button', { class: 'btn btn-ghost', text: t.otherTopic, onclick: themeScreen }),
            el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome }),
          ]),
        ];
        mount(container, el('div', { class: 'result view' }, children));
      }

      celebrate(buildMoments(g, name), showResult);
    }
  }
}
