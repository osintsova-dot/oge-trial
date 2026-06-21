// vocab.js — раздел «Лексика». Флэшкарты + интервальное повторение (SRS).
// Дневная сессия = «к повторению» (вперемешку) + новые из активной темы, норма 15.
// Новые слова — по выбранной теме; повторение — смешанное (см. vocab_srs.js).

import { el, mount, iconImg, confetti, celebrate } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { EXAM, t, plural } from '../js/exam.js';
import { recordVocabReview, getName, checkNewAchievements, getState, isThemeFinaled, recordThemeFinale } from '../js/gamify.js';
import { celeb } from '../js/voice.js';
import { DAILY_GOAL, getActiveTheme, setActiveTheme, dailyProgress,
  buildSession, dueItems, review, themeStats, themeDetail,
  modeForBox, clozeFor, distractors, normAnswer } from '../js/vocab_srs.js';
import { themeZids } from '../js/themes.js';
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
import { openWordSearch } from './word_search.js';

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
      onclick: () => startSession(buildSession(data)) });
    const dueNote = el('div', { class: 'vc-note', text: due ? v.dueNote(due, plural(due, t.tasksWord)) : v.dueNone });

    // активная тема
    const activeBox = el('div', { class: 'vc-active' }, [
      el('div', {}, [el('span', { class: 'vc-a-l', text: v.learning }), el('b', { class: 'vc-a-t', text: themeRu(active) })]),
      el('div', { class: 'vc-a-sub', text: v.learningSub }),
    ]);

    // финал недели: активная тема готова → карточка сверху
    const ready = themeDetail(data, active).ready;
    const finaleCard = ready ? el('button', { class: 'cd-card finale-card', onclick: openFinale }, [
      el('img', { class: 'cd-img', src: './assets/spiky-medal.png', alt: '' }),
      el('div', { class: 'cd-in' }, [
        el('div', { class: 'cd-h', text: v.finaleTitle }),
        el('div', { class: 'cd-v', text: v.finaleCardTitle(themeRu(active)) }),
        el('div', { class: 'plan-sub', text: v.finaleCardSub }),
      ]),
      el('div', { class: 'cd-arrow', text: '›' }),
    ]) : null;

    // список тем — выбрать активную; прогресс learned/total; 🏆 у готовых
    const list = el('div', { class: 'topic-list' });
    for (const th of data.themes) {
      const s = stats[th.key];
      const p = pct(s.learned, s.total);
      const isActive = th.key === active;
      const done = isThemeFinaled(th.key) || themeDetail(data, th.key).ready;
      list.appendChild(el('button', { class: 'topic-item' + (isActive ? ' vc-on' : ''), onclick: () => { setActiveTheme(th.key); menuScreen(); } }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ti-name' }, [isActive ? '✓ ' : '', (done ? '🏆 ' : ''), th.name || th.ru]),
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
        finaleCard,
        goalCard, startBtn, dueNote,
        el('button', { class: 'ws-trigger-bar', onclick: openWordSearch }, [
          el('span', { class: 'ws-mag', text: '🔎' }),
          el('span', { text: v.searchPlaceholder }),
        ]),
        activeBox,
        el('div', { class: 'topics-label', text: v.pickTheme }),
        list,
      ]),
    ]));
  }

  // --- Финал недели: тема освоена → награда + письмо/эссе по теме ---
  function openFinale() {
    const active = getActiveTheme();
    const r = recordThemeFinale(active);   // +2 жетона один раз
    const moments = r.already ? [] : [{ icon: '🏆', img: './assets/spiky-medal.png', title: v.finaleCeleb, text: celeb('hero', getName()), confetti: true }];
    celebrate(moments, () => finaleScreen(active));
  }
  async function finaleScreen(active) {
    let hasLetters = true;
    try { hasLetters = (await themeZids(active)).writing.size > 0; } catch {}
    const tasks = (EXAM.writing && EXAM.writing.tasks) || [];
    const btns = tasks.map((tk) => el('button', { class: 'btn btn-honey btn-block',
      text: v.finaleWrite(t.sections[tk.sectionId] || tk.sectionId), onclick: () => { location.hash = '#' + tk.sectionId; } }));
    mount(container, el('div', { class: 'view' }, [
      secBar(menuScreen, v.finaleTitle),
      el('div', { class: 'topics-body' }, [
        el('div', { class: 'finale-hero' }, [
          el('img', { class: 'finale-img', src: './assets/spiky-medal.png', alt: '' }),
          el('div', { class: 'finale-h', text: v.finaleSub(themeRu(active)) }),
        ]),
        ...(hasLetters ? btns : [el('div', { class: 'vc-note', text: v.finaleNoTasks })]),
        el('button', { class: 'btn btn-ghost btn-block', text: v.finalePickNew, onclick: menuScreen }),
      ]),
    ]));
  }

  // --- Сессия: сначала знакомство со всеми новыми карточками, затем тренировка вперемешку ---
  function startSession(cards) {
    if (!cards.length) { menuScreen(); return; }
    let learned = 0, sessionXp = 0, dayClosedG = null;
    let curIdx = 0, curTotal = 0, curLabel = '';
    const news = cards.filter((c) => c.box === 0);   // новые слова — для фазы знакомства
    const train = shuffle(cards);                     // тренировка — все слова вперемешку (микс типов/слов)

    // Каркас экрана: верх (метка фазы + счёт + палочки) + тело + низ
    function frame(body, foot) {
      const segBar = el('div', { class: 'seg-bar' });
      for (let i = 0; i < curTotal; i++) segBar.appendChild(el('i', { class: i < curIdx ? 'seg-ok' : (i === curIdx ? 'seg-cur' : 'seg') }));
      mount(container, el('div', { class: 'round view' }, [
        el('div', { class: 'round-top' }, [
          el('div', { class: 'drill-bar' }, [
            el('button', { class: 'drill-x', text: '✕', onclick: menuScreen }),
            el('div', { class: 'drill-title', text: curLabel || t.sections.vocab }),
            el('div', { class: 'drill-count', text: `${curIdx + 1} / ${curTotal}` }),
          ]),
          segBar,
        ]),
        el('div', { class: 'round-body vc-body' }, [].concat(body)),
        el('div', { class: 'round-foot' }, [].concat(foot)),
      ]));
    }

    // Завершить слово: SRS + XP/гейт (один раз на слово). Не продвигает — это делает trainStep.
    function finishWord(it, remembered, startBox) {
      if (remembered) learned++;
      const wasDone = dailyProgress().done;
      const r = review(it.id, remembered, startBox);
      const g = recordVocabReview(remembered, r.done && !wasDone);
      sessionXp += g.xpGained;
      if (g.dayClosed) dayClosedG = g;
    }

    // Панель результата (✓/✗ + правильный ответ + «Дальше»)
    function nextPanel(ok, correctText, cb) {
      return [
        el('div', { class: 'fc-result ' + (ok ? 'ok' : 'bad'), text: ok ? v.correct : v.wrongIs(correctText) }),
        el('button', { class: 'btn btn-honey btn-block', text: v.next, onclick: cb }),
      ];
    }

    // Режим «выбор перевода»: EN + 4 варианта RU
    function chooseUI(it, onDone) {
      const opts = shuffle([it.ru].concat(distractors(data, it, 3)));
      let answered = false;
      const list = el('div', { class: 'mc-list' });
      const refresh = (foot) => {};
      opts.forEach((opt) => {
        const b = el('button', { class: 'mc-opt', text: opt, onclick: () => {
          if (answered) return; answered = true;
          const ok = opt === it.ru;
          b.classList.add(ok ? 'mc-ok' : 'mc-bad');
          if (!ok) [...list.children].forEach((c) => { if (c.textContent === it.ru) c.classList.add('mc-ok'); });
          frame([el('div', { class: 'task-kind mk-kind', text: v.mChoose }), el('div', { class: 'mode-word', text: it.en }), list],
            nextPanel(ok, it.ru, () => onDone(ok)));
        } });
        list.appendChild(b);
      });
      frame([el('div', { class: 'task-kind mk-kind', text: v.mChoose }), el('div', { class: 'mode-word', text: it.en }), list], []);
    }

    // Режим ввода (cloze/впечатать): headNodes + поле; accept — правильная строка
    function typeUI(headNodes, accept, onDone) {
      const input = el('input', { class: 'answer-input', type: 'text', autocomplete: 'off', placeholder: v.typePlaceholder });
      const submit = () => {
        const ok = normAnswer(input.value) === normAnswer(accept);
        frame(headNodes.concat(el('div', { class: 'answer-wrap' }, [input])), nextPanel(ok, accept, () => onDone(ok)));
        input.disabled = true;
      };
      const check = el('button', { class: 'btn btn-check', text: t.check, onclick: submit });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      frame(headNodes.concat(el('div', { class: 'answer-wrap' }, [input])), [check]);
      input.focus();
    }
    const typeHead = (it) => [el('div', { class: 'task-kind mk-kind', text: v.mType }), el('div', { class: 'mode-word', text: it.ru }),
      it.def ? el('div', { class: 'mode-sub', text: it.def }) : null].filter(Boolean);
    function clozeUI(it, cz, onDone) {
      typeUI([el('div', { class: 'task-kind mk-kind', text: v.mCloze }), el('div', { class: 'task-text', text: cz.sentence }),
        el('div', { class: 'hint-ru', text: v.hintRu(it.ru) })], cz.gapAnswer, onDone);
    }

    // Фаза 1 — знакомство: листаем все новые карточки (переворот → «Дальше»), без оценки
    let pi = 0;
    function preview() {
      if (pi >= news.length) return trainStart();
      curLabel = v.mPreview; curTotal = news.length; curIdx = pi;
      const it = news[pi];
      let flipped = false;
      const front = el('div', { class: 'fc-front', text: it.en });
      const back = el('div', { class: 'fc-back', style: { display: 'none' } }, [
        it.def ? el('div', { class: 'fc-def', text: it.def }) : null,
        el('div', { class: it.def ? 'fc-ru fc-ru-sub' : 'fc-ru', text: it.ru }),
        it.ex ? el('div', { class: 'fc-ex', text: it.ex }) : null,
        el('div', { class: 'fc-theme', text: it.themeRu || '' }),
      ].filter(Boolean));
      const hint = el('div', { class: 'fc-hint', text: v.tapToFlip });
      const next = el('button', { class: 'btn btn-honey btn-block', text: v.next, style: { display: 'none' }, onclick: () => { pi++; preview(); } });
      const cardBox = el('div', { class: 'flashcard', onclick: () => {
        if (flipped) return; flipped = true; back.style.display = 'block'; hint.style.display = 'none'; next.style.display = 'block';
      } }, [front, back, hint]);
      frame([el('div', { class: 'task-kind mk-kind', text: v.mPreview }), cardBox], [next]);
    }

    // Фаза 2 — тренировка: все слова вперемешку, режим по коробке (новые → выбор; ошибка→box1, верно→box2)
    let ti = 0;
    function trainStart() { ti = 0; curLabel = v.mTrain; trainStep(); }
    function trainStep() {
      if (ti >= train.length) return summary();
      curLabel = v.mTrain; curTotal = train.length; curIdx = ti;
      const it = train[ti];
      const done = (ok) => { finishWord(it, ok, it.box === 0 ? 2 : undefined); ti++; trainStep(); };
      const mode = modeForBox(it.box);
      if (mode === 'choose') return chooseUI(it, done);
      if (mode === 'cloze') { const cz = clozeFor(it); return cz ? clozeUI(it, cz, done) : typeUI(typeHead(it), it.en, done); }
      return typeUI(typeHead(it), it.en, done);
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
          el('div', { class: 'res-num' }, [String(learned), el('span', { text: '/' + train.length })]),
          el('div', { class: 'res-acc', text: v.dailyLeft(dp.count, dp.goal) }),
          el('div', { class: 'reward' }, [
            rline('ic-xp', '⭐', t.rXp, 'v-xp', '+' + sessionXp + ' XP'),
            rline('ic-streak', '🔥', t.rStreak, 'v-streak', streakNow + ' ' + t.dayWord(streakNow)),
          ]),
          el('button', { class: 'btn btn-primary btn-block', text: dp.done ? v.practiceMore : v.startDaily,
            onclick: () => startSession(buildSession(data)) }),
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

    preview();
  }
}
