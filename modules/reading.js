// reading.js — раздел «Чтение» ОГЭ. Два типа заданий, проверка по ключу оффлайн.
//   • Утверждения True/False/Not stated: текст + 7 утверждений (ответ 1/2/3).
//   • Установление соответствия: 7 вопросов + 6 текстов A–F (каждому тексту — номер вопроса).
// Одно задание-текст = один раунд (recordRound): XP/серия/пак/Герой как в дрилле.

import { el, mount, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordDrill, sectionStats } from '../js/progress.js';
import { recordRound, getName, checkNewAchievements } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { playCorrect, playWrong } from '../js/sound.js';
import { t, plural } from '../js/exam.js';

const SECTION = 'reading';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

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

function randInt(n) { return Math.floor(Math.random() * n); }

// Перерисовать текст в node, обернув каждое опорное предложение в <mark> с номером.
// items — массив {ev: точная подстрока, num: номер вопроса/утверждения}. Без innerHTML.
function renderHighlighted(node, text, items) {
  const marks = [];
  for (const it of items) {
    if (!it || !it.ev) continue;
    const i = text.indexOf(it.ev);
    if (i >= 0) marks.push({ s: i, e: i + it.ev.length, num: it.num });
  }
  marks.sort((a, b) => a.s - b.s);
  node.textContent = '';
  let pos = 0;
  for (const m of marks) {
    if (m.s < pos) continue;               // перекрытие — пропускаем
    if (m.s > pos) node.appendChild(document.createTextNode(text.slice(pos, m.s)));
    const mk = el('mark', {}, [text.slice(m.s, m.e)]);
    if (m.num != null) mk.appendChild(el('span', { class: 'rd-qn', text: String(m.num) }));
    node.appendChild(mk);
    pos = m.e;
  }
  if (pos < text.length) node.appendChild(document.createTextNode(text.slice(pos)));
}

// Блок «Почему» под утверждением/текстом: разбор + (опц.) цитата опорного предложения.
function whyBlock(why, evidence) {
  if (!why && !evidence) return null;
  const kids = [el('b', { text: t.reading.why + ': ' }), why || ''];
  if (evidence) {
    kids.push(el('div', { class: 'rd-ev', style: { marginTop: '4px' } },
      ['« ', evidence, ' »']));
  }
  return el('div', { class: 'rd-why' }, kids);
}

// cfg: {goHome, dataFile}
export async function renderReading(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let data, expl;
  try { data = await loadJSON(cfg.dataFile || 'reading'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }
  expl = await loadJSON('reading_explanations').catch(() => ({ tf: {}, matching: {} }));

  const r = t.reading;
  const title = t.sections.reading;

  menuScreen();

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar reading' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: title }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
    ]);
  }

  // --- Меню: выбор типа задания ---
  function menuScreen() {
    const stats = sectionStats(SECTION);
    const meta = `${data.tf.length * 7 + data.matching.length} ${plural(data.tf.length * 7 + data.matching.length, t.tasksWord)}`;
    const card = (icon, tt, sub, onClick) => el('button', { class: 'all-topics reading', onclick: onClick }, [
      el('div', { class: 'at-ic' }, [iconImg(icon, '📖', 'at-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'at-t', text: tt }),
        el('div', { class: 'at-s', text: sub }),
      ]),
      el('div', { class: 'at-arrow', text: '→' }),
    ]);
    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, meta + (stats.attempted ? ` · ${pct(stats.correct, stats.attempted)}%` : '')),
      el('div', { class: 'topics-body' }, [
        el('div', { class: 'topics-label', text: r.pick }),
        card('ic-reading-tf', r.tfTitle, r.tfSub, () => startTF(data.tf[randInt(data.tf.length)])),
        card('ic-reading-match', r.matchTitle, r.matchSub, () => startMatch(data.matching[randInt(data.matching.length)])),
      ]),
    ]));
  }

  // --- Тип 1: True / False / Not stated ---
  function startTF(task) {
    const picks = new Array(task.statements.length).fill(null); // выбор 1/2/3 по утверждению
    let checked = false;

    const action = el('button', { class: 'btn btn-check btn-block', text: t.check, disabled: true });
    const rowsWrap = el('div', { class: 'rd-statements' });
    const rowNodes = [];

    task.statements.forEach((st, i) => {
      const opts = r.tf.map((label, k) => {
        const val = String(k + 1);
        const b = el('button', { class: 'tf-opt', text: label, onclick: () => {
          if (checked) return;
          picks[i] = val;
          opts.forEach((o) => o.classList.remove('sel'));
          b.classList.add('sel');
          action.disabled = picks.includes(null);
        } });
        return b;
      });
      const verdict = el('div', { class: 'tf-verdict', style: { display: 'none' } });
      const body = el('div', { class: 'tf-body' }, [
        el('div', { class: 'tf-text', text: st.statement }),
        el('div', { class: 'tf-opts' }, opts),
        verdict,
      ]);
      const row = el('div', { class: 'tf-row' }, [
        el('div', { class: 'tf-num', text: String(st.num) }),
        body,
      ]);
      rowNodes.push({ row, body, opts, verdict });
      rowsWrap.appendChild(row);
    });

    const passageText = el('div', { class: 'rd-text', text: task.text });

    action.addEventListener('click', () => {
      if (!checked) return doCheck();
      summary();
    });

    function doCheck() {
      checked = true;
      let correct = 0;
      const evidences = [];
      const ex = (expl.tf || {});
      task.statements.forEach((st, i) => {
        const ok = picks[i] === st.answer;
        if (ok) correct++;
        recordDrill(SECTION, st.zid, ok, '1.3.2');
        const { body, opts, verdict } = rowNodes[i];
        opts.forEach((o, k) => {
          o.disabled = true;
          const val = String(k + 1);
          if (val === st.answer) o.classList.add('right');
          else if (val === picks[i]) o.classList.add('wrong');
        });
        verdict.className = 'tf-verdict ' + (ok ? 'ok' : 'bad');
        verdict.textContent = ok ? '✓' : ('✕ ' + r.correctNum(r.tf[Number(st.answer) - 1]));
        verdict.style.display = 'block';
        const e = ex[st.zid] || {};
        const why = e.why || (st.answer === '3' ? r.notStatedNote : '');
        const wb = whyBlock(why, e.evidence);
        if (wb) body.appendChild(wb);
        if (e.evidence) evidences.push({ ev: e.evidence, num: st.num });
      });
      renderHighlighted(passageText, task.text, evidences);
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      rowsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pending = { correct, total: task.statements.length };
      correct === pending.total ? playCorrect() : playWrong();
    }
    let pending = null;
    function summary() { showSummary(pending.correct, pending.total); }

    mount(container, el('div', { class: 'rd-screen view' }, [
      secBar(menuScreen, r.tfSub),
      el('div', { class: 'rd-body' }, [
        el('div', { class: 'rd-passage' }, [
          el('div', { class: 'rd-hint', text: r.readFirst }),
          passageText,
        ]),
        rowsWrap,
        el('div', { class: 'rd-foot' }, [action]),
      ]),
    ]));
    container.querySelector('.rd-screen').scrollTop = 0;
  }

  // --- Тип 2: Установление соответствия ---
  function startMatch(task) {
    const picks = {}; // letter -> '1'..'7'
    let checked = false;
    const action = el('button', { class: 'btn btn-check btn-block', text: t.check, disabled: true });
    const cardNodes = {};

    const qList = el('ol', { class: 'rd-qlist' }, task.questions.map((q) =>
      el('li', { class: 'rd-q', text: q })));

    const cards = el('div', { class: 'rd-texts' }, LETTERS.map((L) => {
      const sel = el('select', { class: 'rd-sel' });
      sel.appendChild(el('option', { value: '', text: r.pickQ }));
      task.questions.forEach((_, qi) => sel.appendChild(el('option', { value: String(qi + 1), text: String(qi + 1) })));
      sel.addEventListener('change', () => {
        if (checked) return;
        picks[L] = sel.value;
        action.disabled = LETTERS.some((x) => !picks[x]);
      });
      const verdict = el('div', { class: 'rd-cv', style: { display: 'none' } });
      const ttext = el('div', { class: 'rd-ttext', text: task.texts[L] });
      const card = el('div', { class: 'rd-tcard' }, [
        el('div', { class: 'rd-thead' }, [
          el('div', { class: 'rd-letter', text: L }),
          sel, verdict,
        ]),
        ttext,
      ]);
      cardNodes[L] = { sel, verdict, ttext, card };
      return card;
    }));

    action.addEventListener('click', () => {
      if (!checked) return doCheck();
      summary();
    });

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0;
      const ansStr = task.answer; // 6 цифр в порядке A..F
      const ex = (expl.matching || {})[task.zid] || {};
      LETTERS.forEach((L, i) => {
        const want = ansStr[i];
        const got = picks[L];
        const ok = got === want;
        if (ok) correct++;
        const { sel, verdict, ttext, card } = cardNodes[L];
        sel.disabled = true;
        verdict.className = 'rd-cv ' + (ok ? 'ok' : 'bad');
        verdict.textContent = ok ? '✓' : ('✕ ' + r.correctNum(want));
        verdict.style.display = 'inline-block';
        sel.classList.add(ok ? 'right' : 'wrong');
        const e = ex[L] || {};
        if (e.evidence) renderHighlighted(ttext, task.texts[L], [{ ev: e.evidence, num: want }]);
        const wb = whyBlock(e.why, '');
        if (wb) card.appendChild(wb);
      });
      recordDrill(SECTION, task.zid, correct === LETTERS.length, '1.3.1');
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      pending = { correct, total: LETTERS.length };
      correct === pending.total ? playCorrect() : playWrong();
      cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function summary() { showSummary(pending.correct, pending.total); }

    mount(container, el('div', { class: 'rd-screen view' }, [
      secBar(menuScreen, r.matchSub),
      el('div', { class: 'rd-body' }, [
        el('div', { class: 'rd-passage' }, [
          el('div', { class: 'rd-hint', text: r.matchInstr }),
          el('div', { class: 'rd-qtitle', text: r.questionsTitle }),
          qList,
        ]),
        cards,
        el('div', { class: 'rd-foot' }, [action]),
      ]),
    ]));
  }

  // --- Итог раунда (общий для обоих типов) ---
  function showSummary(correct, total) {
    const g = recordRound(SECTION, correct, total);
    const name = getName();
    const acc = pct(correct, total);
    const praise = acc >= 80 ? t.praiseHigh : acc >= 60 ? t.praiseMid : t.praiseLow;
    const rline = (iconName, emoji, label, vc, value) => el('div', { class: 'reward-line' },
      [el('span', { class: 'rl-label' }, [iconImg(iconName, emoji), el('span', { text: ' ' + label })]), el('b', { class: vc, text: value })]);

    function showResult() {
      mount(container, el('div', { class: 'result view' }, [
        el('div', { class: 'voice-msg', text: roundMessage(name, correct, total, g.heroAwarded) }),
        el('div', { class: 'res-num' }, [String(correct), el('span', { text: '/' + total })]),
        el('div', { class: 'res-acc', text: t.accLine(acc, praise) }),
        el('div', { class: 'reward' }, [
          rline('ic-streak', '🔥', t.rStreak, 'v-streak', g.streak + ' ' + t.dayWord(g.streak)),
          rline('ic-xp', '⭐', t.rXp, 'v-xp', '+' + g.xpGained + ' XP'),
          g.freezeUsed ? rline('ic-freeze', '🧊', t.rFreeze, 'v-pack', t.freezeSaved) : null,
          rline('ic-hero', '🦸', t.rPack, 'v-pack', t.packOf(g.pack.done.length, g.pack.total)),
        ].filter(Boolean)),
        el('button', { class: 'btn btn-primary btn-block', text: r.nextText, onclick: menuScreen }),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome }),
        ]),
      ]));
    }
    celebrate(buildMoments(g, name), showResult);
  }
}
