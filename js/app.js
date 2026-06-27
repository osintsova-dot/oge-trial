// app.js — оболочка: hash-роутер, splash, главная, прогресс, награды, тема.
// Экзамен-независимая: структура из exam.js (EXAM), тексты из strings (t).

import { el, mount, iconImg, infoModal, slides } from './ui.js';
import { loadJSON } from './data.js';
import { sectionStats, writingStats, resetAll } from './progress.js';
import { getState, levelInfo, levelTable, packStatus, streakActiveToday,
  applyTheme, getTheme, setTheme, getName, setName, getSound, setSound,
  dailyDigest, skinsStatus, setSkin, applySkin, achievementsStatus,
  getTokens, perksStatus, redeemPerk, recentRedeemed,
  getExamDate, setExamDate, isOnboarded, setOnboarded, examInfo, setPlanGoal, setWeekTargets,
  getListeningDone, getSpeakingDone, mockPromptNow, markMockPromptShown,
  getRole, setRole } from './gamify.js';
import { EXAM, t, sectionById, plural } from './exam.js';
import { dailyProgress, themeStats } from './vocab_srs.js';
import { weeklyPlan } from './planner.js';
import { exportProgress, importProgress } from './backup.js';
import { hasAccess, getKey, setKey, checkKey, rememberCheck } from './license.js';
import { pushSupported, isSubscribed, enablePush, disablePush, iosNeedsInstall, getHour, heartbeat } from './push.js';

// Heartbeat пушей: при активности шлём «занимался сегодня + серия» (тихо, если есть подписка).
window.addEventListener('ss:activity', (e) => {
  try { heartbeat((e.detail && e.detail.streak) || 0, true); } catch (err) {}
});

// ССЫЛКА НА СООБЩЕСТВО VK (откуда берут ключ) — подставить, когда будет
const VK_URL = 'https://vk.com/';

// Код перехода в режим учителя (в настройках «Прогресс»). СМЕНИ на свой.
const TEACHER_PASS = 'SS-TEACHER';
function enterTeacher() {
  const code = prompt(t.teacherPrompt);
  if (code == null) return;
  if (code.trim().toUpperCase() === TEACHER_PASS) { setRole('teacher'); updateRoleUI(); location.hash = '#/teacher'; route(); }
  else alert(t.teacherWrong);
}
// Модули разделов грузятся ЛЕНИВО (import() по требованию) — на главной не тянем весь код.
// lazy(path, name, arg): показать лоадер → импортировать модуль → вызвать render(view, arg).
function lazy(path, name, arg) {
  mount(view, el('div', { class: 'loader', text: '…' }));
  return import(path).then((m) => m[name](view, arg)).catch((e) => mount(view, el('div', { class: 'err-msg', text: String(e && e.message || e) })));
}

const view = document.getElementById('view');
// На главную. Если hash уже '#/', смена не вызовет 'hashchange' → рисуем главную напрямую,
// иначе после онбординга (особенно в установленном PWA, где URL уже с '#/') экран не сменится.
const goHome = () => { if (location.hash !== '#/') location.hash = '#/'; else route(); };

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function accColor(p) { return p >= 65 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)'; }

// Только закрытые разделы (для роутинга дрилла и статистики)
const DRILL = {};
for (const s of EXAM.sections) if (s.type === 'drill') {
  DRILL[s.id] = { section: s.id, dataFile: s.dataFile, topicKey: s.topicKey, title: t.sections[s.id],
    answerType: s.answerType, keysFile: EXAM.keysFile, topicsFile: EXAM.topicsFile, explainFile: EXAM.explainFile };
}

// --- Тема ---
function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); route(); }
function themeBtn(cls) {
  return el('button', { class: cls || 'theme-btn', onclick: toggleTheme,
    text: getTheme() === 'dark' ? '☀️' : '🌙', title: t.themeTitle });
}

// --- Роутер ---
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  setActiveTab(hash);
  const base = hash.split('?')[0];                 // раздел без query
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const sec = sectionById(base);
  // В режиме решения (дрилл/письмо) нижнее меню прячем, чтобы не перекрывало кнопки
  document.body.classList.toggle('in-flow', !!(sec && ['drill', 'writing', 'reading', 'vocab', 'listening', 'speaking', 'egespeaking', 'mock', 'soon'].includes(sec.type)));
  if (hash === 'progress') return renderProgress();
  if (hash === 'rewards')  return renderRewards();
  if (hash === 'plan')     return renderPlan();
  if (hash === 'teacher')  { setRole('teacher'); updateRoleUI(); document.body.classList.add('in-flow'); return lazy('../modules/teacher.js', 'renderTeacher', { goHome }); }
  if (hash === 'journal')  { setRole('teacher'); updateRoleUI(); document.body.classList.add('in-flow'); return lazy('../modules/teacher.js', 'renderJournal', { goHome }); }
  if (hash.split('?')[0] === 'hw') { document.body.classList.add('in-flow'); return lazy('../modules/teacher.js', 'renderHomework', { goHome, query: hash.slice(hash.indexOf('?') + 1) }); }
  if (hash.split('?')[0] === 'hwr') { document.body.classList.add('in-flow'); return lazy('../modules/teacher.js', 'renderHomeworkResult', { goHome, query: hash.slice(hash.indexOf('?') + 1) }); }
  if (sec && sec.type === 'drill')   return lazy('../modules/drill.js', 'renderDrill', { ...DRILL[sec.id], goHome });
  if (sec && sec.type === 'writing') return lazy('../modules/writing.js', 'renderWriting', { goHome, sectionId: sec.id, promptZid: new URLSearchParams(query).get('z') || undefined });
  if (sec && sec.type === 'reading') return lazy(EXAM.id === 'ege' ? '../modules/ege_reading.js' : '../modules/reading.js', EXAM.id === 'ege' ? 'renderReadingEge' : 'renderReading', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'vocab')   return lazy('../modules/vocab.js', 'renderVocab', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'listening') return lazy('../modules/listening.js', 'renderListening', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'speaking') return lazy('../modules/speaking.js', 'renderSpeaking', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'egespeaking') return lazy('../modules/ege_speaking.js', 'renderEgeSpeaking', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'mock') return lazy('../modules/mock.js', 'renderMock', { goHome, dataFile: sec.dataFile });
  if (sec && sec.type === 'soon')    return renderSoon(sec);
  return renderHome();
}
// показываем учительскую вкладку только в роли teacher (секретный вход #/teacher её включает)
function updateRoleUI() {
  const isT = getRole() === 'teacher';
  document.querySelectorAll('#bottom-nav a[data-tab="teacher"]').forEach((a) => { a.style.display = isT ? '' : 'none'; });
}
function setActiveTab(hash) {
  const tab = (hash === 'progress' || hash === 'rewards' || hash === 'teacher') ? hash : 'home';
  document.querySelectorAll('#bottom-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-tab') === tab);
  });
}

// --- Главная ---
// Модалка-лестница: все уровни и пороги XP, текущий подсвечен
function levelsModal() {
  const cur = levelInfo(getState().xp).level;
  infoModal({
    icon: '⭐', iconName: 'ic-xp', title: t.levelsTitle, text: t.levelsHow,
    list: levelTable().map((r) => ({
      left: t.lvl + r.level + ' · ' + r.title,
      right: r.min + ' XP',
      active: r.level === cur,
    })),
  });
}

function renderHome() {
  document.body.classList.remove('welcome-mode');
  const st = getState();
  const name = getName() || t.friend;
  const lvl = levelInfo(st.xp);
  const dg = dailyDigest();

  const chip = (icon, txt) => el('div', { class: 'chip' }, icon ? [icon, el('span', { text: ' ' + txt })] : [el('span', { text: txt })]);
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'h-in' }, [
      el('div', { class: 'h-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'h-hello', text: t.welcomeBack }),
          el('div', { class: 'h-name', text: name + '!' }),
        ]),
        themeBtn(),
      ]),
      el('div', { class: 'chips' }, [
        chip(iconImg('ic-streak', '🔥'), st.streak.count),
        el('div', { class: 'chip chip-tap', onclick: levelsModal }, [el('span', { text: t.lvl + lvl.level + ' · ' + lvl.title })]),
        chip(iconImg('ic-hero', '🦸'), st.heroes),
        st.freezes > 0 ? chip(iconImg('ic-freeze', '🧊'), st.freezes) : null,
      ]),
      el('div', { class: 'xp-block', onclick: levelsModal }, [
        el('div', { class: 'xp-head' }, [
          el('span', { class: 'xp-cur' }, [iconImg('ic-xp', '⭐'), ' ' + st.xp + ' XP']),
          el('span', { class: 'xp-note', text: lvl.next ? t.toRank(lvl.next, lvl.toNext) : t.maxRank }),
        ]),
        el('div', { class: 'xp-bar' }, [el('i', { style: { width: lvl.pct + '%' } })]),
      ]),
    ]),
  ]);

  const dPct = pct(dg.today.correct, dg.today.total);
  const wPct = pct(dg.week.correct, dg.week.total);
  const rw = (n) => n + ' ' + plural(n, t.roundsWord);
  const twRow = el('div', { class: 'tw-row' }, [
    el('div', { class: 'tw today' }, [
      el('div', { class: 'tw-h', text: t.today }),
      el('div', { class: 'tw-main', text: dg.today.rounds ? `${rw(dg.today.rounds)} · ${dPct}%` : t.empty }),
      el('div', { class: 'tw-xp', text: '+' + dg.today.xp + ' XP' }),
    ]),
    el('div', { class: 'tw week' }, [
      el('div', { class: 'tw-h', text: t.week }),
      el('div', { class: 'tw-main', text: dg.week.rounds ? `${rw(dg.week.rounds)} · ${wPct}%` : t.empty }),
      el('div', { class: 'tw-xp', text: '+' + dg.week.xp + ' XP' }),
    ]),
  ]);

  // Цель дня = дневная норма лексики (день закрывается ею). Клик → раздел «Лексика».
  const vp = dailyProgress();
  const ringPct = pct(vp.count, vp.goal);
  const goal = el('button', { class: 'goal goal-btn', onclick: () => { location.hash = '#/vocab'; } }, [
    el('div', { class: 'ring', style: { background: `conic-gradient(var(--honey) 0% ${ringPct}%, var(--track) ${ringPct}% 100%)` } },
      [el('i', {}, [vp.done ? '✓' : iconImg('ic-vocab', '🗂', 'goal-img')])]),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'g-title', text: t.vocab.dailyTitle }),
      el('div', { class: 'g-text', text: vp.done ? t.vocab.dailyDone(vp.goal) : t.vocab.dailyLeft(vp.count, vp.goal) }),
    ]),
    el('div', { class: 'at-arrow', text: '→' }),
  ]);

  // Пак недели заполняется асинхронно (после установки недельных целей из плана)
  const pack = el('div', { id: 'pack-card' });

  const tile = (sec) => {
    const stt = sec.type === 'drill' ? sectionStats(sec.id) : null;
    const p = stt && stt.attempted ? pct(stt.correct, stt.attempted) : null;
    return el('button', { class: 'tile ' + sec.tile, onclick: () => { location.hash = '#/' + sec.id; } }, [
      el('div', { class: 't-top' }, [
        el('div', { class: 't-icon' }, [iconImg(sec.iconFile || ('ic-' + (sec.iconKey || sec.tile)), sec.icon, 'tile-img')]),
        p != null ? el('div', { class: 't-pct', text: p + '%' }) : null,
      ]),
      el('div', { class: 't-name', text: t.sections[sec.id] }),
      el('div', { class: 't-meta', text: t.sectionMeta[sec.id] || '' }),
    ]);
  };
  // Пробник выносим из сетки в широкую плашку во всю ширину (и ОГЭ, и ЕГЭ —
  // так сетка остальных плиток заполняется ровно, а пробник смотрится завершённо)
  const mockWide = true;
  const tileEls = EXAM.sections.filter((s) => !(mockWide && s.type === 'mock')).map(tile);
  // «Скоро» (Аудирование) — обычной плашкой в той же сетке, последней
  if (EXAM.soonTile) tileEls.push(el('div', { class: 'tile locked' }, [
    el('div', { class: 't-top' }, [el('div', { class: 't-icon' }, [iconImg('ic-locked', '🔒', 'tile-img')]), el('div', { class: 't-soon', text: t.soon })]),
    el('div', { class: 't-name', text: t.soonTitle }),
    el('div', { class: 't-meta', text: t.soonMeta }),
  ]));
  const tiles = el('div', { class: 'tiles' }, tileEls);

  // Пробный экзамен — широкой плашкой во всю ширину (ОГЭ и ЕГЭ)
  const mockSec = mockWide ? EXAM.sections.find((s) => s.type === 'mock') : null;
  const mockCard = mockSec ? el('button', { class: 'goal goal-btn mock-wide', onclick: () => { location.hash = '#/' + mockSec.id; } }, [
    el('div', { class: 'ring', style: { background: 'var(--grad-mock)' } }, [el('i', {}, [iconImg('ic-' + (mockSec.iconKey || mockSec.tile), mockSec.icon, 'goal-img')])]),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'g-title', text: t.sections[mockSec.id] }),
      el('div', { class: 'g-text', text: t.sectionMeta[mockSec.id] || '' }),
    ]),
    el('div', { class: 'at-arrow', text: '→' }),
  ]) : null;

  const shortcuts = el('div', { class: 'shortcuts' }, [
    el('button', { class: 'shortcut', onclick: () => { location.hash = '#/progress'; } },
      [el('div', { class: 's-ic' }, [iconImg('ic-progress', '📊', 's-img')]), el('div', { class: 's-t', text: t.myProgress })]),
    el('button', { class: 'shortcut', onclick: () => { location.hash = '#/rewards'; } },
      [el('div', { class: 's-ic' }, [iconImg('ic-rewards', '🎖', 's-img')]), el('div', { class: 's-t', text: t.rewards })]),
  ]);

  // Счётчик до экзамена (тап → перечитать формат) либо приглашение поставить дату
  const ei = examInfo();
  let countdown = null;
  if (ei && ei.state !== 'past') {
    const txt = ei.state === 'thisMonth' ? t.countdownThisMonth(EXAM.examShort)
      : (ei.daysLeft <= 14 ? t.countdownDays(ei.daysLeft, EXAM.examShort) : t.countdownFuture(ei.weeksLeft, EXAM.examShort));
    countdown = el('button', { class: 'cd-card', onclick: renderExamIntro }, [
      el('img', { class: 'cd-img', src: './assets/spiky-check.png', alt: '' }),
      el('div', { class: 'cd-in' }, [
        el('div', { class: 'cd-h', text: t.countdownTitle }),
        el('div', { class: 'cd-v', text: txt }),
      ]),
      el('div', { class: 'cd-arrow', text: '›' }),
    ]);
  } else if (!getExamDate()) {
    countdown = el('button', { class: 'cd-card cd-set', onclick: () => renderExamDate(true) }, [
      el('img', { class: 'cd-img', src: './assets/spiky-check.png', alt: '' }),
      el('div', { class: 'cd-in' }, [
        el('div', { class: 'cd-h', text: t.countdownSetTitle }),
        el('div', { class: 'cd-v', text: t.countdownSetPrompt }),
      ]),
      el('div', { class: 'cd-arrow', text: '›' }),
    ]);
  }

  // Карточка недельного плана заполняется асинхронно (грузит topics)
  const planCard = el('div', { id: 'plan-card' });
  fillPlanCard(planCard).then(() => fillPackCard(pack));

  mount(view, el('div', {}, [
    hero,
    el('div', { class: 'wrap view' }, [
      countdown,
      planCard,
      twRow, goal, pack,
      el('div', { class: 'sec-title', text: t.sectionsTitle }),
      tiles,
      mockCard,
      el('div', { style: { height: '11px' } }),
      shortcuts,
    ]),
  ]));

  // Всплывающее напоминание о пробнике (не чаще раза в день, если есть раздел)
  const mp = mockPromptNow();
  if (mp && sectionById('mock')) { markMockPromptShown(); showMockPrompt(mp); }
}

// Модалка-напоминание «пора пройти пробный» / «зафиксируй точку А»
function showMockPrompt(sch) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const title = sch.first ? t.mockPrompt.firstTitle : t.mockPrompt.dueTitle;
  const text = sch.first ? t.mockPrompt.firstText : (sch.weekly ? t.mockPrompt.weeklyText : t.mockPrompt.dueText);
  back.appendChild(el('div', { class: 'modal-card' }, [
    el('div', { class: 'modal-ic' }, [iconImg('spiky-check', '📋', 'modal-img')]),
    el('div', { class: 'modal-title', text: title }),
    el('div', { class: 'modal-text', text: text }),
    el('button', { class: 'btn btn-primary btn-block', text: t.mockPrompt.go, onclick: () => { close(); location.hash = '#/mock'; } }),
    el('button', { class: 'btn btn-ghost btn-block', text: t.mockPrompt.later, onclick: close }),
  ]));
  document.body.appendChild(back);
}

// Заполнить карточку недельного плана (async: planner грузит topics)
// Пак недели: ячейки разделов с прогрессом count/target к недельной норме
function fillPackCard(node) {
  const pk = packStatus();
  const packItems = pk.sections.map((ps) => {
    const sec = EXAM.sections.find((s) => s.id === ps.id);
    // подписи убраны (длинные названия не влезали в узкие плашки) — иконка + счёт; имя в подсказке
    return el('div', { class: 'pk-cell' + (ps.done ? ' done' : ''), title: t.sections[ps.id] || ps.id }, [
      el('div', { class: 'pk-ic' }, [iconImg(sec && sec.iconFile ? sec.iconFile : ('ic-' + (sec ? (sec.iconKey || sec.tile) : ps.id)), sec ? sec.icon : '•', 'pk-img')]),
      // счётчик есть у всех; у пройденного — N/N зелёным + галочка сверху
      ps.target != null ? el('div', { class: 'pk-prog' + (ps.done ? ' done' : ''), text: Math.min(ps.count, ps.target) + '/' + ps.target }) : null,
      ps.done ? el('div', { class: 'pk-chk', text: '✓' }) : null,
    ]);
  });
  node.replaceChildren(el('div', { class: 'pack' }, [
    el('div', { class: 'p-head' }, [
      el('div', { class: 'p-t', text: t.packTitle }),
      el('div', { class: 'p-n', text: t.packOf(pk.done.length, pk.total) }),
    ]),
    el('div', { class: 'pk-cells' }, packItems),
    el('div', { class: 'p-note', text: t.packNote }),
  ]));
}

// Недельные цели пака = норма по разделам из выбранной цели плана
function syncWeekTargets(p) {
  if (!p || !p.hasDate || !p.chosen) return;
  const tgt = {};
  for (const sec of p.chosen.secs) if (EXAM.pack.includes(sec.id)) tgt[sec.id] = Math.ceil(sec.rem / p.weeks);
  setWeekTargets(tgt);
}

async function fillPlanCard(node) {
  let p;
  try { p = await weeklyPlan(); } catch { return; }
  if (!p || !p.hasDate || p.past) return;   // нет даты / экзамен прошёл → без карточки
  syncWeekTargets(p);
  if (p.allDone) {
    node.replaceChildren(el('button', { class: 'cd-card', onclick: () => { location.hash = '#plan'; } }, [
      el('img', { class: 'cd-img', src: './assets/spiky-thumb.png', alt: '' }),
      el('div', { class: 'cd-in' }, [
        el('div', { class: 'cd-h', text: t.planCardTitle }),
        el('div', { class: 'cd-v', text: t.planDoneCard }),
      ]),
    ]));
    return;
  }
  const c = p.chosen;
  const name = t.planGoals[c.key].name;
  node.replaceChildren(el('button', { class: 'cd-card plan-card', onclick: () => { location.hash = '#plan'; } }, [
    el('img', { class: 'cd-img', src: './assets/spiky-check.png', alt: '' }),
    el('div', { class: 'cd-in' }, [
      el('div', { class: 'cd-h', text: t.planCardTitle }),
      el('div', { class: 'cd-v', text: t.planToCover(c.weekly) }),
      el('div', { class: 'plan-sub', text: t.planMark[c.status] + ' ' + t.planGoalCardSub(name, t.planPerDay(c.daily)) }),
    ]),
    el('div', { class: 'cd-arrow', text: '›' }),
  ]));
}

// --- Экран «План подготовки» ---
async function renderPlan() {
  document.body.classList.remove('welcome-mode');
  mount(view, el('div', { class: 'view' }, [el('div', { class: 'loader', text: '…' })]));
  let p;
  try { p = await weeklyPlan(); } catch { goHome(); return; }
  if (!p || !p.hasDate) { goHome(); return; }
  syncWeekTargets(p);

  const head = el('div', { class: 'sec-bar plan-bar' }, [
    el('button', { class: 'back', text: '←', onclick: goHome }),
    el('div', { style: { flex: '1' } }, [el('div', { class: 'sb-title', text: t.planTitle })]),
  ]);
  const body = el('div', { class: 'plan-body' });
  body.appendChild(el('div', { class: 'plan-weeks', text: t.planWeeksLeft(p.weeks) }));

  if (p.allDone) {
    body.appendChild(el('div', { class: 'plan-done-msg', text: t.planAllDone }));
  } else {
    // Выбор цели (3 уровня) с пометками ✅/⚠️/🔒 — единой плашкой, отдельно от разделов
    const goalCards = p.tiers.map((tier) => {
      const g = t.planGoals[tier.key];
      const active = tier.key === p.chosenKey;
      return el('button', { class: 'goal-card' + (active ? ' on' : ''),
        onclick: () => { setPlanGoal(tier.key); renderPlan(); } }, [
        el('div', { class: 'goal-main' }, [
          el('div', { class: 'goal-name' }, [g.name, tier.key === p.recommendedKey ? el('span', { class: 'goal-rec', text: ' · ' + t.planRecommended }) : null]),
          el('div', { class: 'goal-desc', text: g.desc }),
        ]),
        el('div', { class: 'goal-side' }, [
          el('div', { class: 'goal-wk', text: tier.R ? t.planToCover(tier.weekly) : t.planMarkText.done }),
          el('div', { class: 'goal-mark ' + tier.status, text: t.planMark[tier.status] + ' ' + (tier.R ? t.planPerDay(tier.daily) : '') }),
        ]),
      ]);
    });
    body.appendChild(el('div', { class: 'goal-group' }, [
      el('div', { class: 'plan-choose-hdr', text: t.planChooseHdr }),
      ...goalCards,
    ]));
    const chosen = p.chosen;
    if (chosen.status === 'hard') body.appendChild(el('div', { class: 'plan-min-banner', text: t.planHardHint }));

    // Разбивка выбранной цели по разделам
    for (const s of chosen.secs) {
      const pctDone = s.totTopics ? Math.round((s.doneTopics / s.totTopics) * 100) : 0;
      body.appendChild(el('div', { class: 'plan-sec', onclick: () => { location.hash = '#' + s.id; } }, [
        el('div', { class: 'plan-sec-top' }, [
          el('div', { class: 'plan-sec-name', text: s.name }),
          el('div', { class: 'plan-sec-rem', text: s.rem ? t.planSecRem(s.rem, Math.ceil(s.rem / p.weeks)) : t.planSecDone }),
        ]),
        el('div', { class: 'plan-sec-sub', text: t.planSecLine(s.doneTopics, s.totTopics) }),
        el('div', { class: 'ti-bar' }, [el('i', { style: { width: pctDone + '%', background: 'var(--ok)' } })]),
      ]));
    }
    // Что осталось по темам (топ-10 выбранной цели)
    if (chosen.weak.length) {
      body.appendChild(el('div', { class: 'plan-topics-hdr', text: t.planTopicsHdr }));
      for (const w of chosen.weak.slice(0, 10)) {
        body.appendChild(el('div', { class: 'plan-topic' }, [
          el('div', { class: 'pt-label', text: w.label }),
          el('div', { class: 'pt-left', text: t.planTopicLeft(w.rem) }),
        ]));
      }
    }
  }

  // Лексика — всегда (отдельный темп)
  body.appendChild(el('div', { class: 'plan-vocab', onclick: () => { location.hash = '#vocab'; } }, [
    el('div', { class: 'plan-sec-name', text: t.planVocabTitle }),
    el('div', { class: 'plan-sec-sub', text: t.planVocabLine(p.vocab.learned, p.vocab.total) }),
  ]));

  mount(view, el('div', { class: 'view' }, [head, body]));
}

// --- Прогресс ---
async function renderProgress() {
  document.body.classList.remove('welcome-mode');
  const st = getState();
  const w = writingStats();
  // Лексика: освоено/всего/в работе (из SRS-прогресса). Файл — из конфига экзамена.
  const vocabSec = sectionById('vocab');
  const vdata = await loadJSON(vocabSec ? vocabSec.dataFile : 'vocab').catch(() => null);
  let vLearned = 0, vTotal = 0, vStarted = 0;
  if (vdata) { const vs = themeStats(vdata); for (const k in vs) { vLearned += vs[k].learned; vTotal += vs[k].total; vStarted += vs[k].started; } }
  const vPct = pct(vLearned, vTotal);
  const vocabCard = vdata ? el('button', { class: 'vocab-prog-card', onclick: () => { location.hash = '#/vocab'; } }, [
    el('div', { class: 'vp-top' }, [
      el('div', { class: 'vp-ic' }, [iconImg('ic-vocab', '🗂', 'vp-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'vp-t', text: t.sections.vocab }),
        el('div', { class: 'vp-s', text: t.vocab.learnedOf(vLearned, vTotal) + ' · ' + t.vocab.inProgress(vStarted) }),
      ]),
      el('div', { class: 'vp-v', text: vPct + '%' }),
    ]),
    el('div', { class: 'vp-bar' }, [el('i', { style: { width: vPct + '%' } })]),
  ]) : null;
  // Средний балл письма — в процентах (email и essay имеют разные максимумы; legacy без max → запасной 10)
  const avg = w.count ? Math.round(w.items.reduce((s, x) => s + Math.min(1, (x.score || 0) / (x.max || 10)), 0) / w.count * 100) : null;

  const miniStat = (num, lbl, color, icon) => el('div', { class: 'mini-stat' }, [
    el('div', { class: 'ms-v', style: { color } }, icon ? [num + ' ', icon] : [num]),
    el('div', { class: 'ms-l', text: lbl }),
  ]);
  const progRow = (sec) => {
    const s = sectionStats(sec.id);
    const p = s.attempted ? pct(s.correct, s.attempted) : 0;
    const c = accColor(p);
    return el('button', { class: 'prog-row', onclick: () => { location.hash = '#/' + sec.id; } }, [
      el('div', { class: 'pr-top' }, [
        el('div', { class: 'pr-ic' }, [iconImg('ic-' + (sec.iconKey || sec.tile), sec.icon, 'pr-img')]),
        el('div', { class: 'pr-name', text: t.sections[sec.id] }),
        el('div', { class: 'pr-pct', style: { color: c }, text: p + '%' }),
      ]),
      el('div', { class: 'pr-bar' }, [el('i', { style: { width: p + '%', background: c } })]),
      el('div', { class: 'pr-meta', text: s.attempted ? t.solved(s.attempted, s.correct) : t.noSolved }),
    ]);
  };
  const drillSecs = EXAM.sections.filter((s) => s.type === 'drill' || s.type === 'reading');

  // Разделы без «процента верных» (аудирование/говорение) — показываем «пройдено N из M».
  const doneRow = (sec, done, total) => {
    const p = total ? pct(done, total) : 0;
    const c = accColor(p);
    return el('button', { class: 'prog-row', onclick: () => { location.hash = '#/' + sec.id; } }, [
      el('div', { class: 'pr-top' }, [
        el('div', { class: 'pr-ic' }, [iconImg('ic-' + (sec.iconKey || sec.tile), sec.icon, 'pr-img')]),
        el('div', { class: 'pr-name', text: t.sections[sec.id] }),
        el('div', { class: 'pr-pct', style: { color: c }, text: p + '%' }),
      ]),
      el('div', { class: 'pr-bar' }, [el('i', { style: { width: p + '%', background: c } })]),
      el('div', { class: 'pr-meta', text: done ? t.progDone(done, total) : t.noSolved }),
    ]);
  };
  const doneRows = [];
  const lSec = EXAM.sections.find((s) => s.type === 'listening');
  if (lSec) {
    const ld = await loadJSON(lSec.dataFile).catch(() => null);
    const ltot = ld && ld.groups ? ld.groups.length : 0;
    doneRows.push(doneRow(lSec, Object.keys(getListeningDone()).length, ltot));
  }
  const spSec = EXAM.sections.find((s) => s.type === 'speaking' || s.type === 'egespeaking');
  if (spSec) {
    const sd = await loadJSON(spSec.dataFile).catch(() => null);
    const stot = sd ? ['read', 'survey', 'monologue', 'ask', 'interview', 'compare'].reduce((n, k) => n + ((sd[k] || []).length), 0) : 0;
    doneRows.push(doneRow(spSec, Object.keys(getSpeakingDone()).length, stot));
  }

  mount(view, el('div', { class: 'wrap view' }, [
    el('div', { class: 'prog-head' }, [el('div', { class: 'ph-title', text: t.progTitle }), themeBtn()]),
    el('div', { class: 'mini-stats' }, [
      miniStat(String(st.streak.count), t.streakLabel, '#F5A33C', iconImg('ic-streak', '🔥')),
      miniStat(String(st.xp), 'XP', 'var(--p-text)'),
      miniStat(String(st.heroes), plural(st.heroes, t.heroWord), 'var(--magenta)', iconImg('ic-hero', '🦸')),
    ]),
    vocabCard,
    el('div', { class: 'prog-section-title', text: t.bySection }),
    el('div', { class: 'prog-rows' }, [...drillSecs.map(progRow), ...doneRows]),
    el('button', { class: 'avg-card', onclick: () => { const ws = EXAM.sections.find((s) => s.type === 'writing'); location.hash = '#/' + (ws ? ws.id : 'writing'); } }, [
      el('div', { class: 'a-ic' }, [iconImg('ic-writing', '✉️', 'a-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'a-t', text: t.avgTitle }),
        el('div', { class: 'a-s', text: w.count ? t.avgSub(w.count) : t.avgCrit }),
      ]),
      el('div', { class: 'a-v' }, avg !== null ? [String(avg), el('span', { text: '%' })] : [el('span', { text: '—' })]),
    ]),
    el('div', { class: 'prog-section-title', text: t.achTitle }),
    el('div', { class: 'ach-grid' }, achievementsStatus().map((a) =>
      el('div', { class: 'ach' + (a.done ? '' : ' off'), title: a.desc,
        onclick: () => infoModal({
          iconName: 'ach-' + a.id, icon: a.icon, title: a.title, text: a.how, note: a.done ? a.rep : null,
          status: { done: a.done, label: a.done ? t.achGot : t.achLocked },
        }) }, [
        a.badge ? el('span', { class: 'ach-badge', text: a.badge }) : null,
        el('div', { class: 'ach-ic' }, [iconImg('ach-' + a.id, a.icon, 'ach-img')]),
        el('div', { class: 'ach-t', text: a.title }),
      ]))),
    el('div', { class: 'prog-actions' }, [
      el('button', { class: 'act-name', text: getSound() ? t.soundOn : t.soundOff,
        onclick: () => { setSound(!getSound()); renderProgress(); } }),
      pushButton(),
      el('button', { class: 'act-name', text: t.changeName, onclick: () => renderWelcome(getName(), true) }),
      el('button', { class: 'act-name', text: t.backupSave, onclick: backupModal }),
      el('button', { class: 'act-name', text: t.backupRestore, onclick: restoreFlow }),
      el('button', { class: 'act-name', text: '📅 ' + t.countdownSetTitle, onclick: () => renderExamDate(true) }),
      getRole() === 'teacher'
        ? el('button', { class: 'act-name', text: '🧑‍🏫 ' + t.exitTeacher, onclick: () => { setRole('student'); updateRoleUI(); goHome(); } })
        : el('button', { class: 'act-name', text: '🧑‍🏫 ' + t.teacherMode, onclick: enterTeacher }),
      el('button', { class: 'act-reset', text: t.reset, onclick: () => {
        if (confirm(t.resetConfirm)) { resetAll(); renderProgress(); }
      } }),
    ]),
  ]));
}

// Кнопка-тумблер пушей «не теряй серию» (в настройках «Прогресс»).
function pushButton() {
  if (!pushSupported()) return null;
  const btn = el('button', { class: 'act-name', text: '🔔 …' });
  const refresh = () => isSubscribed().then((on) => {
    btn.dataset.on = on ? '1' : '';
    btn.textContent = on ? t.pushOn : t.pushOff;
  });
  btn.addEventListener('click', async () => {
    if (iosNeedsInstall()) { alert(t.pushIosInstall); return; }
    btn.disabled = true; btn.textContent = t.pushWait;
    try {
      if (btn.dataset.on) await disablePush();
      else { const ok = await enablePush(getName(), getHour()); if (!ok) throw new Error('net'); }
    } catch (e) {
      alert(e.message === 'denied' ? t.pushDenied : t.pushErr);
    } finally { btn.disabled = false; refresh(); }
  });
  refresh();
  return btn;
}

// --- Бэкап прогресса: показать код (копируемый) / восстановить из кода ---
function backupModal() {
  const code = exportProgress();
  const back = el('div', { class: 'modal-back' });
  const ta = el('textarea', { class: 'bk-code', readonly: 'readonly' }); ta.value = code;
  const copyBtn = el('button', { class: 'btn btn-honey btn-block', text: t.backupCopy });
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); }
    catch (e) { ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e2) {} }
    copyBtn.textContent = t.backupCopied;
  });
  back.appendChild(el('div', { class: 'modal-card' }, [
    el('div', { class: 'modal-title', text: t.backupSave }),
    el('div', { class: 'modal-note', text: t.backupHint }),
    ta, copyBtn,
    el('button', { class: 'btn btn-block', style: { marginTop: '8px' }, text: t.backupClose, onclick: () => back.remove() }),
  ]));
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
}
function restoreFlow() {
  const code = prompt(t.backupAsk);
  if (!code) return;
  try { importProgress(code); alert(t.backupOk); location.reload(); }
  catch (e) { alert(t.backupErr(e.message)); }
}

// --- Награды (привилегии + скины) ---
function renderRewards() {
  document.body.classList.remove('welcome-mode');
  const skins = skinsStatus();
  const rows = skins.map((k) => {
    let btn;
    if (k.equipped) btn = el('button', { class: 's-btn equipped', text: t.skinEquipped });
    else if (k.unlocked) btn = el('button', { class: 's-btn equip', text: t.skinEquip, onclick: (e) => { e.stopPropagation(); if (setSkin(k.id)) renderRewards(); } });
    else btn = el('button', { class: 's-btn lock', text: '🔒 ' + k.need });
    return el('div', { class: 'skin' + (k.unlocked ? '' : ' locked'),
      onclick: () => infoModal({
        swatch: k.grad, title: k.name, text: k.how,
        status: { done: k.unlocked, label: k.equipped ? t.skinOn : (k.unlocked ? t.skinOpen : '🔒 ' + k.need) },
      }) }, [
      el('div', { class: 's-top' }, [
        el('div', {}, [el('div', { class: 's-name', text: k.name }), el('div', { class: 's-desc', text: k.desc })]),
        btn,
      ]),
      el('div', { class: 's-prev' }, [el('i', { style: { background: k.grad } })]),
    ]);
  });

  const tokens = getTokens();
  const perks = perksStatus().map((p) =>
    el('div', { class: 'perk' + (p.affordable ? '' : ' off'),
      onclick: () => infoModal({
        iconName: p.iconFile, icon: p.icon, title: p.title, text: p.how,
        status: { done: p.affordable, label: p.affordable ? t.perkEnough : t.perkNeed(p.cost - tokens) },
      }) }, [
      el('div', { class: 'perk-ic' }, [iconImg(p.iconFile, p.icon, 'perk-img')]),
      el('div', { class: 'perk-info' }, [
        el('div', { class: 'perk-t', text: p.title }),
        el('div', { class: 'perk-d', text: p.desc }),
      ]),
      el('button', { class: 'perk-btn' + (p.affordable ? '' : ' lock'), disabled: !p.affordable,
        text: p.variable ? t.perkChoose : ('🎟 ' + p.cost),
        onclick: (e) => { e.stopPropagation();
          if (p.variable) { exchangeModal(p); return; }
          const r = redeemPerk(p.id); if (r) { showBadge(r); renderRewards(); } } }),
    ]));
  const recent = recentRedeemed().slice(0, 5);
  const recentBlock = recent.length ? el('div', { class: 'redeemed' },
    [el('div', { class: 'redeemed-h', text: t.redeemedTitle }),
      ...recent.map((r) => el('div', { class: 'red-row' }, [
        el('span', { class: 'red-name' }, r.perk ? [iconImg(r.perk.iconFile, r.perk.icon, 'red-ic'), ' ' + r.perk.title] : ['—']),
        el('span', { class: 'red-meta', text: r.code + ' · ' + fmtDate(r.ts) }),
      ]))]) : null;

  mount(view, el('div', { class: 'wrap view' }, [
    el('div', { class: 'rew-title', text: t.rewards + ' 🎖' }),
    el('div', { class: 'tokens-bar' }, [
      iconImg('perk-ticket', '🎟', 'tok-ic'),
      el('span', { class: 'tok-n', text: String(tokens) }),
      el('span', { class: 'tok-l', text: t.tokensLabel(tokens, plural(tokens, t.tokenWord)) }),
    ]),
    el('div', { class: 'rew-sub', text: t.perksSub }),
    el('div', { class: 'perk-list' }, perks),
    recentBlock,
    el('div', { class: 'rew-skins-title', text: t.skinsTitle }),
    el('div', { class: 'skin-list' }, rows),
  ]));
}

function fmtDate(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

// Чузер для переменной привилегии (обмен жетонов): степпер min..min(max||баланс, баланс).
// Отображение «крупного числа» и подсказки берётся из самой привилегии (chooseBig/chooseHelp).
function exchangeModal(p) {
  const min = p.min || 1;
  const max = p.max ? Math.min(p.max, p.balance) : p.balance;
  if (max < min) return;
  let n = min;
  const big = (k) => p.chooseBig ? p.chooseBig(k) : ('+' + k);
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const num = el('div', { class: 'pts-num', text: big(n) });
  const spend = el('div', { class: 'pts-spend', text: t.ptsSpend(n) });
  const minus = el('button', { class: 'pts-step', text: '−' });
  const plus = el('button', { class: 'pts-step', text: '+' });
  const upd = () => {
    num.textContent = big(n); spend.textContent = t.ptsSpend(n);
    minus.disabled = n <= min; plus.disabled = n >= max;
  };
  minus.onclick = () => { if (n > min) { n--; upd(); } };
  plus.onclick = () => { if (n < max) { n++; upd(); } };
  back.appendChild(el('div', { class: 'modal-card' }, [
    el('div', { class: 'modal-ic' }, [iconImg(p.iconFile, p.icon, 'modal-img')]),
    el('div', { class: 'modal-title', text: p.title }),
    el('div', { class: 'modal-text', text: p.chooseHelp ? p.chooseHelp(p.balance) : '' }),
    el('div', { class: 'pts-stepper' }, [minus, num, plus]),
    spend,
    el('button', { class: 'btn btn-honey btn-block', style: { marginTop: '16px' }, text: t.ptsRedeem,
      onclick: () => { const r = redeemPerk(p.id, n); if (r) { close(); showBadge(r); renderRewards(); } } }),
  ]));
  document.body.appendChild(back);
  upd();
}

function showBadge(r) {
  const overlay = el('div', { class: 'badge-screen' });
  const fallback = el('div', { class: 'badge-ic', text: r.perk.icon });
  const spiky = el('img', { class: 'badge-img', src: './assets/spiky-gift.png', alt: '' });
  spiky.addEventListener('error', () => spiky.replaceWith(fallback));
  overlay.appendChild(el('div', { class: 'badge-card' }, [
    spiky,
    el('div', { class: 'badge-t', text: r.perk.title }),
    el('div', { class: 'badge-show', text: r.perk.badgeShow || t.badgeShow }),
    el('div', { class: 'badge-code', text: r.code }),
    el('div', { class: 'badge-date', text: fmtDate(r.ts) }),
    el('button', { class: 'btn btn-honey btn-block', text: t.badgeDone, onclick: () => overlay.remove() }),
  ]));
  document.body.appendChild(overlay);
}

// --- Заглушка раздела «в разработке» (говорение; позже аудирование) ---
function renderSoon(sec) {
  document.body.classList.remove('welcome-mode');
  mount(view, el('div', { class: 'view' }, [
    el('div', { class: 'sec-bar ' + sec.tile }, [
      el('button', { class: 'back', text: '←', onclick: goHome }),
      el('div', { style: { flex: '1' } }, [el('div', { class: 'sb-title', text: t.sections[sec.id] || '' })]),
    ]),
    el('div', { class: 'soon-screen' }, [
      el('div', { class: 'soon-ic' }, [iconImg('ic-' + (sec.iconKey || sec.tile), sec.icon, 'soon-img')]),
      el('div', { class: 'soon-h', text: t.soonScreenTitle }),
      el('div', { class: 'soon-t', text: t.soonScreenText }),
      el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: goHome }),
    ]),
  ]));
}

// --- Splash / знакомство ---
// edit=true — режим «изменить имя» (из прогресса): после ввода сразу домой, без онбординга.
function renderWelcome(prefill, edit) {
  document.body.classList.add('welcome-mode');
  const input = el('input', { class: 'name-input', type: 'text', placeholder: t.namePlaceholder,
    maxlength: '24', autocomplete: 'off', value: prefill || '' });
  const go = el('button', { class: 'go', text: t.go, disabled: !(prefill && prefill.trim()) });
  const submit = () => {
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    setName(n);
    if (edit) goHome(); else renderExamDate();
  };
  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => { go.disabled = !input.value.trim(); });

  mount(view, el('div', { class: 'splash' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'inner' }, [
      el('img', { src: EXAM.splashImg, alt: 'Speaky' }),
      el('div', { class: 'brandline', text: t.brandline }),
      el('div', { class: 'greet' }, [t.greetHi, el('br'), t.greetQ]),
      input, go,
      el('div', { class: 'note', text: t.offlineNote }),
    ]),
  ]));
  input.focus();
}

// --- Шаг онбординга: дата экзамена (месяц/год). edit=true — из «Прогресса». ---
function renderExamDate(edit) {
  document.body.classList.add('welcome-mode');
  const cur = getExamDate();              // 'YYYY-MM' или null
  const curY = cur ? Number(cur.split('-')[0]) : null;
  const curM = cur ? Number(cur.split('-')[1]) : null;
  const nowY = new Date().getFullYear();
  const years = [nowY, nowY + 1, nowY + 2];

  const mSel = el('select', { class: 'date-sel' },
    [el('option', { value: '', text: '—' }),
      ...t.months.map((m, i) => el('option', { value: String(i + 1), text: m, selected: curM === i + 1 ? 'selected' : null }))]);
  const ySel = el('select', { class: 'date-sel' },
    years.map((y) => el('option', { value: String(y), text: String(y), selected: (curY || nowY) === y ? 'selected' : null })));

  const proceed = (ym) => { setExamDate(ym); if (edit) goHome(); else renderExamIntro(); };
  const next = el('button', { class: 'go', text: t.examNext, onclick: () => {
    const m = mSel.value, y = ySel.value;
    proceed(m ? (y + '-' + String(m).padStart(2, '0')) : null);
  } });
  const skip = el('button', { class: 'skip-link', text: t.examSkip, onclick: () => proceed(null) });

  mount(view, el('div', { class: 'splash' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'inner' }, [
      el('img', { src: './assets/spiky-check.png', alt: 'Speaky' }),
      el('div', { class: 'greet', text: t.examWhenTitle(EXAM.examShort) }),
      el('div', { class: 'note', text: t.examWhenSub }),
      el('div', { class: 'date-row' }, [mSel, ySel]),
      next, skip,
    ]),
  ]));
}

// --- Шаг онбординга: рассказ о формате (карточки-слайды). Также пере-открывается с главной. ---
function renderExamIntro() {
  const cards = t.examIntro || [];
  if (!cards.length) { setOnboarded(true); goHome(); return; }
  // убираем экран даты из-под интро-оверлея (чтобы его кнопки не «торчали» и не перехватывали тапы)
  mount(view, el('div', { class: 'splash' }, [el('div', { class: 'shine' })]));
  slides(cards, { lastCta: t.go, onDone: () => { setOnboarded(true); goHome(); } });
}

// --- Замок: экран ввода ключа доступа (paywall) ---
function renderPaywall() {
  document.body.classList.add('welcome-mode');
  const p = t.paywall || {};
  const input = el('input', { class: 'name-input', type: 'text', placeholder: p.keyPh || 'XXXX-XXXX-XXXX', autocomplete: 'off', value: getKey() || '' });
  const go = el('button', { class: 'go', text: p.checkBtn || 'Войти' });
  const err = el('div', { class: 'err-msg', style: { display: 'none' } });
  const vk = el('a', { class: 'skip-link', href: VK_URL, target: '_blank', rel: 'noopener', text: p.getVK || 'Получить ключ в VK →' });
  const submit = async () => {
    const k = input.value.trim().toUpperCase();
    if (!k) { input.focus(); return; }
    err.style.display = 'none'; go.disabled = true; go.textContent = p.checking || 'Проверяю…';
    try {
      const res = await checkKey(k);
      if (res.valid) { setKey(k); rememberCheck(res); document.body.classList.remove('welcome-mode'); bootAfterAccess(); return; }
      err.textContent = res.reason === 'expired' ? (p.expired || 'Срок ключа истёк.')
        : res.reason === 'wrong_exam' ? (p.wrongExam || 'Этот ключ — для другого экзамена.')
        : (p.bad || 'Ключ не найден. Проверь и попробуй ещё раз.');
      err.style.display = 'block';
    } catch (e) {
      err.textContent = p.net || 'Нет связи с сервером. Проверь интернет.'; err.style.display = 'block';
    } finally { go.disabled = false; go.textContent = p.checkBtn || 'Войти'; }
  };
  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  mount(view, el('div', { class: 'splash' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'inner' }, [
      el('img', { src: EXAM.splashImg, alt: 'Speaky' }),
      el('div', { class: 'brandline', text: t.brandline }),
      el('div', { class: 'greet' }, [p.title || 'Доступ к тренажёру', el('br'), el('span', { style: { fontSize: '15px', fontWeight: '400', opacity: '.9' }, text: p.sub || '14 дней бесплатно по ключу из нашего сообщества' })]),
      vk,
      el('div', { class: 'note', style: { margin: '14px 0 6px' }, text: p.haveKey || 'Уже есть ключ? Введи его:' }),
      input, go, err,
    ]),
  ]));
  input.focus();
}

// Иконки нижнего меню (картинки с откатом на эмодзи) ---
const NAV_IC = { home: ['ic-home', '🏠'], progress: ['ic-progress', '📊'], rewards: ['ic-rewards', '🎖'], teacher: ['ic-teacher', '🧑‍🏫'] };
document.querySelectorAll('#bottom-nav a').forEach((a) => {
  const tab = a.getAttribute('data-tab'), ic = a.querySelector('.bn-ic');
  if (ic && NAV_IC[tab]) ic.replaceWith(iconImg(NAV_IC[tab][0], NAV_IC[tab][1], 'bn-ic'));
});

// --- Инициализация ---
applyTheme(getTheme());
applySkin();
updateRoleUI();
window.addEventListener('hashchange', route);

// продолжение запуска ПОСЛЕ подтверждения доступа (вызывается из paywall и при старте)
function bootAfterAccess() {
  const bare = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (['teacher', 'journal'].includes(bare)) return route(); // учитель с ключом — сразу в кабинет, минуя ученический онбординг
  if (!getName()) return renderWelcome();
  if (!isOnboarded()) return renderExamDate();
  route();
}

// ДЗ-ссылки ученика (#/hw, #/hwr) открываются СВОБОДНО, минуя замок и онбординг (платит учитель).
// Всё остальное (включая учительский кабинет) — за ключом доступа.
const bareHash = location.hash.replace(/^#\/?/, '').split('?')[0];
if (['hw', 'hwr'].includes(bareHash)) {
  route();
} else {
  hasAccess().then((ok) => { if (ok) bootAfterAccess(); else renderPaywall(); });
}
