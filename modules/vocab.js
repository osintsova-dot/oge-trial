// vocab.js — раздел «Лексика». Флэшкарты + интервальное повторение (SRS).
// Дневная сессия = «к повторению» (вперемешку) + новые из активной темы, норма 15.
// Новые слова — по выбранной теме; повторение — смешанное (см. vocab_srs.js).

import { el, mount, iconImg, confetti, celebrate } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { t, plural } from '../js/exam.js';
import { recordVocabReview, getName, checkNewAchievements, getState } from '../js/gamify.js';
import { celeb } from '../js/voice.js';
import { DAILY_GOAL, getActiveTheme, setActiveTheme, dailyProgress,
  buildSession, dueItems, newItems, review, themeStats } from '../js/vocab_srs.js';

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

// cfg: {goHome, dataFile}
export async function renderVocab(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let data;
  try { data = await loadJSON(cfg.dataFile || 'vocab'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }

  const v = t.vocab;
  // активная тема по умолчанию — первая
  if (!getActiveTheme()) setActiveTheme(data.themes[0].key);

  menuScreen();

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar vocab' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: t.sections.vocab }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
    ]);
  }
  function themeRu(key) { const th = data.themes.find((x) => x.key === key); return th ? (th.name || th.ru) : key; }

  // --- Меню: дневная норма + выбор активной темы + прогресс по темам ---
  function menuScreen() {
    const dp = dailyProgress();
    const stats = themeStats(data);
    const active = getActiveTheme();
    const due = dueItems(data).length;

    const ringPct = pct(dp.count, dp.goal);
    const goalCard = el('div', { class: 'vc-goal' }, [
      el('div', { class: 'ring', style: { background: `conic-gradient(var(--honey) 0% ${ringPct}%, var(--track) ${ringPct}% 100%)` } },
        [el('i', {}, [dp.done ? '✓' : iconImg('ic-vocab', '🗂', 'goal-img')])]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'g-title', text: v.dailyTitle }),
        el('div', { class: 'g-text', text: dp.done ? v.dailyDone(dp.goal) : v.dailyLeft(dp.count, dp.goal) }),
      ]),
    ]);
    const startBtn = el('button', { class: 'btn btn-honey btn-block', text: dp.done ? v.practiceMore : v.startDaily,
      onclick: () => startSession(buildSession(data, DAILY_GOAL)) });
    const dueNote = el('div', { class: 'vc-note', text: due ? v.dueNote(due, plural(due, t.tasksWord)) : v.dueNone });

    // активная тема
    const activeBox = el('div', { class: 'vc-active' }, [
      el('div', {}, [el('span', { class: 'vc-a-l', text: v.learning }), el('b', { class: 'vc-a-t', text: themeRu(active) })]),
      el('div', { class: 'vc-a-sub', text: v.learningSub }),
    ]);

    // список тем — выбрать активную; прогресс learned/total
    const list = el('div', { class: 'topic-list' });
    for (const th of data.themes) {
      const s = stats[th.key];
      const p = pct(s.learned, s.total);
      const isActive = th.key === active;
      list.appendChild(el('button', { class: 'topic-item' + (isActive ? ' vc-on' : ''), onclick: () => { setActiveTheme(th.key); menuScreen(); } }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ti-name' }, [isActive ? '✓ ' : '', th.name || th.ru]),
          el('div', { class: 'ti-count', text: v.learnedOf(s.learned, s.total) }),
        ]),
        el('div', { class: 'ti-right' }, [
          el('div', { class: 'ti-acc', text: p + '%' }),
          el('div', { class: 'ti-bar' }, [el('i', { style: { width: p + '%' } })]),
        ]),
      ]));
    }

    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, v.sub),
      el('div', { class: 'topics-body' }, [
        goalCard, startBtn, dueNote,
        activeBox,
        el('div', { class: 'topics-label', text: v.pickTheme }),
        list,
      ]),
    ]));
  }

  // --- Сессия флэшкарт ---
  function startSession(cards) {
    if (!cards.length) { menuScreen(); return; }
    let idx = 0, learned = 0, sessionXp = 0, dayClosedG = null;

    function card() {
      if (idx >= cards.length) return summary();
      const it = cards[idx];
      let flipped = false;

      const segBar = el('div', { class: 'seg-bar' });
      for (let i = 0; i < cards.length; i++) {
        segBar.appendChild(el('i', { class: i < idx ? 'seg-ok' : (i === idx ? 'seg-cur' : 'seg') }));
      }

      const front = el('div', { class: 'fc-front', text: it.en });
      const back = el('div', { class: 'fc-back', style: { display: 'none' } }, [
        it.def ? el('div', { class: 'fc-def', text: it.def }) : null,
        el('div', { class: it.def ? 'fc-ru fc-ru-sub' : 'fc-ru', text: it.ru }),
        it.ex ? el('div', { class: 'fc-ex', text: it.ex }) : null,
        el('div', { class: 'fc-theme', text: it.themeRu || '' }),
      ].filter(Boolean));
      const hint = el('div', { class: 'fc-hint', text: v.tapToFlip });
      const cardBox = el('div', { class: 'flashcard', onclick: flip }, [front, back, hint]);

      const grade = el('div', { class: 'fc-grade', style: { display: 'none' } }, [
        el('button', { class: 'btn fc-no', text: v.dontKnow, onclick: () => answer(false) }),
        el('button', { class: 'btn fc-yes', text: v.know, onclick: () => answer(true) }),
      ]);

      function flip() {
        if (flipped) return;
        flipped = true;
        back.style.display = 'block';
        hint.style.display = 'none';
        grade.style.display = 'flex';
      }
      function answer(ok) {
        if (ok) learned++;
        const wasDone = dailyProgress().done;
        const r = review(it.id, ok);
        const g = recordVocabReview(ok, r.done && !wasDone);
        sessionXp += g.xpGained;
        if (g.dayClosed) dayClosedG = g;
        idx++; card();
      }

      mount(container, el('div', { class: 'round view' }, [
        el('div', { class: 'round-top' }, [
          el('div', { class: 'drill-bar' }, [
            el('button', { class: 'drill-x', text: '✕', onclick: menuScreen }),
            el('div', { class: 'drill-title', text: t.sections.vocab }),
            el('div', { class: 'drill-count', text: `${idx + 1} / ${cards.length}` }),
          ]),
          segBar,
        ]),
        el('div', { class: 'round-body vc-body' }, [cardBox]),
        el('div', { class: 'round-foot' }, [grade]),
      ]));
    }

    function summary() {
      const dp = dailyProgress();
      const name = getName();
      const streakNow = dayClosedG ? dayClosedG.streak : getState().streak.count;
      const rline = (ic, em, label, vc, val) => el('div', { class: 'reward-line' },
        [el('span', { class: 'rl-label' }, [iconImg(ic, em), el('span', { text: ' ' + label })]), el('b', { class: vc, text: val })]);

      function show() {
        mount(container, el('div', { class: 'result view' }, [
          el('div', { class: 'voice-msg', text: dp.done ? v.dayClosed : v.keepGoing }),
          el('div', { class: 'res-num' }, [String(learned), el('span', { text: '/' + cards.length })]),
          el('div', { class: 'res-acc', text: v.dailyLeft(dp.count, dp.goal) }),
          el('div', { class: 'reward' }, [
            rline('ic-xp', '⭐', t.rXp, 'v-xp', '+' + sessionXp + ' XP'),
            rline('ic-streak', '🔥', t.rStreak, 'v-streak', streakNow + ' ' + t.dayWord(streakNow)),
          ]),
          el('button', { class: 'btn btn-primary btn-block', text: dp.done ? v.practiceMore : v.startDaily,
            onclick: () => startSession(buildSession(data, DAILY_GOAL)) }),
          el('div', { class: 'row-actions' }, [
            el('button', { class: 'btn btn-ghost', text: v.toThemes, onclick: menuScreen }),
            el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome }),
          ]),
        ]));
      }

      const moments = [];
      if (dayClosedG) {
        moments.push({ icon: '🎯', img: './assets/spiky-cheer.png', title: v.dayClosed, text: celeb('streak', name), confetti: true });
        if (dayClosedG.streakUp && [3, 7, 14, 30, 50, 100].includes(dayClosedG.streak))
          moments.push({ icon: '🔥', img: './assets/spiky-fire.png', title: t.celStreakT(dayClosedG.streak), text: celeb('streak', name) });
        if (dayClosedG.levelUp)
          moments.push({ icon: '⭐', img: './assets/spiky-cheer.png', title: t.celLevelT(dayClosedG.level, dayClosedG.title), text: celeb('level', name), confetti: true });
        for (const a of checkNewAchievements())
          moments.push({ icon: a.icon, img: './assets/spiky-medal.png', title: a.title, text: t.celAchText(a.desc, celeb('ach', name)), confetti: true });
      }
      celebrate(moments, show);
    }

    card();
  }
}
