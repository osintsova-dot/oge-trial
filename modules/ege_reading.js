// ege_reading.js — раздел «Reading» ЕГЭ. Три формата, проверка по ключу оффлайн.
//   • 1.3.1 Подбор заголовков: 7 текстов A–G ↔ 8 заголовков (ответ — 7 цифр).
//   • 1.3.2 Вставка частей: текст с пропусками A–F ↔ 7 частей (ответ — 6 цифр).
//   • 1.3.3 Множественный выбор: длинный текст + N вопросов по 4 варианта.
// Одно задание-текст = один раунд (recordRound): XP/серия/пак/Герой как в дрилле.

import { el, mount, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordDrill, sectionStats } from '../js/progress.js';
import { recordRound, getName, checkNewAchievements } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { t, plural } from '../js/exam.js';

const SECTION = 'reading';
const L7 = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const L6 = ['A', 'B', 'C', 'D', 'E', 'F'];

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function randInt(n) { return Math.floor(Math.random() * n); }

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

// Блок «Почему» под текстом/вопросом: разбор (пояснения, если есть).
function whyBlock(why) {
  if (!why) return null;
  return el('div', { class: 'rd-why' }, [el('b', { text: t.readingEge.why + ': ' }), why]);
}

// Перерисовать текст в node, обернув каждое опорное предложение в <mark> с номером-бейджем.
// items — массив {ev: точная подстрока, num: номер (заголовка/вопроса)}. Без innerHTML.
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

// cfg: {goHome, dataFile}
export async function renderReadingEge(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let data, expl;
  try { data = await loadJSON(cfg.dataFile || 'ege_reading'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }
  expl = await loadJSON('ege_reading_explanations').catch(() => ({ headings: {}, gaps: {}, mc: {} }));

  const r = t.readingEge;
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

  // --- Меню: выбор формата ---
  function menuScreen() {
    const stats = sectionStats(SECTION);
    const nQ = data.mc.reduce((s, g) => s + g.questions.length, 0);
    const total = data.headings.length + data.gaps.length + nQ;
    const meta = `${total} ${plural(total, t.tasksWord)}`;
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
        card('ic-reading-match', r.headingsTitle, r.headingsSub, () => startHeadings(data.headings[randInt(data.headings.length)])),
        card('ic-reading-tf', r.gapsTitle, r.gapsSub, () => startGaps(data.gaps[randInt(data.gaps.length)])),
        card('ic-reading', r.mcTitle, r.mcSub, () => startMc(data.mc[randInt(data.mc.length)])),
      ]),
    ]));
  }

  // --- 1.3.1 Подбор заголовков ---
  function startHeadings(task) {
    const picks = {};                // letter -> '1'..'8'
    let checked = false;
    const action = el('button', { class: 'btn btn-check btn-block', text: t.check, disabled: true });
    const nodes = {};

    const headList = el('ol', { class: 'rd-qlist' }, task.headings.map((h) =>
      el('li', { class: 'rd-q', text: h })));

    const cards = el('div', { class: 'rd-texts' }, L7.map((Lr) => {
      const sel = el('select', { class: 'rd-sel' });
      sel.appendChild(el('option', { value: '', text: r.pickN }));
      task.headings.forEach((_, i) => sel.appendChild(el('option', { value: String(i + 1), text: String(i + 1) })));
      sel.addEventListener('change', () => {
        if (checked) return;
        picks[Lr] = sel.value;
        action.disabled = L7.some((x) => !picks[x]);
      });
      const verdict = el('div', { class: 'rd-cv', style: { display: 'none' } });
      const ttext = el('div', { class: 'rd-ttext', text: task.texts[Lr] });
      const card = el('div', { class: 'rd-tcard' }, [
        el('div', { class: 'rd-thead' }, [el('div', { class: 'rd-letter', text: Lr }), sel, verdict]),
        ttext,
      ]);
      nodes[Lr] = { sel, verdict, card, ttext };
      return card;
    }));

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0;
      const ex = (expl.headings || {})[task.zid] || {};
      L7.forEach((Lr, i) => {
        const want = task.answer[i];
        const ok = picks[Lr] === want;
        if (ok) correct++;
        const { sel, verdict, card, ttext } = nodes[Lr];
        sel.disabled = true;
        sel.classList.add(ok ? 'right' : 'wrong');
        verdict.className = 'rd-cv ' + (ok ? 'ok' : 'bad');
        verdict.textContent = ok ? '✓' : ('✕ ' + r.correctNum(want));
        verdict.style.display = 'inline-block';
        const e = ex[Lr] || {};
        if (e.evidence) renderHighlighted(ttext, task.texts[Lr], [{ ev: e.evidence, num: want }]);
        const wb = whyBlock(e.why);
        if (wb) card.appendChild(wb);
      });
      recordDrill(SECTION, task.zid, correct === L7.length, '1.3.1');
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      pending = { correct, total: L7.length };
      cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    action.addEventListener('click', () => { checked ? showSummary(pending.correct, pending.total) : doCheck(); });

    mount(container, el('div', { class: 'rd-screen view' }, [
      secBar(menuScreen, r.headingsSub),
      el('div', { class: 'rd-body' }, [
        el('div', { class: 'rd-passage' }, [
          el('div', { class: 'rd-hint', text: r.headingsInstr }),
          el('div', { class: 'rd-qtitle', text: r.headingsLabel }),
          headList,
        ]),
        cards,
        el('div', { class: 'rd-foot' }, [action]),
      ]),
    ]));
    container.querySelector('.rd-screen').scrollTop = 0;
  }

  // --- 1.3.2 Вставка частей ---
  function startGaps(task) {
    const picks = {};                // letter -> '1'..'7'
    let checked = false;
    const action = el('button', { class: 'btn btn-check btn-block', text: t.check, disabled: true });
    const gapNodes = {};

    // Текст с пропусками {A}..{F} → инлайновые выпадающие списки.
    const passage = el('div', { class: 'rd-text rd-gaptext' });
    const segs = task.passage.split(/\{([A-F])\}/);
    segs.forEach((seg, i) => {
      if (i % 2 === 0) {
        if (seg) passage.appendChild(document.createTextNode(seg));
      } else {
        const Lr = seg;
        const sel = el('select', { class: 'rd-sel rd-gapsel' });
        sel.appendChild(el('option', { value: '', text: Lr }));
        task.parts.forEach((_, k) => sel.appendChild(el('option', { value: String(k + 1), text: String(k + 1) })));
        sel.addEventListener('change', () => {
          if (checked) return;
          picks[Lr] = sel.value;
          action.disabled = L6.some((x) => !picks[x]);
        });
        const verdict = el('span', { class: 'rd-gapv' });
        gapNodes[Lr] = { sel, verdict };
        passage.appendChild(el('span', { class: 'rd-gapwrap' }, [el('span', { class: 'rd-gaplabel', text: Lr }), sel, verdict]));
      }
    });

    const partsList = el('ol', { class: 'rd-qlist' }, task.parts.map((p) =>
      el('li', { class: 'rd-q', text: p })));

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0;
      const ex = (expl.gaps || {})[task.zid] || {};
      L6.forEach((Lr, i) => {
        const want = task.answer[i];
        const ok = picks[Lr] === want;
        if (ok) correct++;
        const { sel, verdict } = gapNodes[Lr];
        sel.disabled = true;
        sel.classList.add(ok ? 'right' : 'wrong');
        verdict.className = 'rd-gapv ' + (ok ? 'ok' : 'bad');
        verdict.textContent = ok ? ' ✓' : (' ✕→' + want);
      });
      recordDrill(SECTION, task.zid, correct === L6.length, '1.3.2');
      const wb = whyBlock((ex.all || {}).why);
      if (wb) partsList.parentNode.appendChild(wb);
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      pending = { correct, total: L6.length };
      passage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    action.addEventListener('click', () => { checked ? showSummary(pending.correct, pending.total) : doCheck(); });

    mount(container, el('div', { class: 'rd-screen view' }, [
      secBar(menuScreen, r.gapsSub),
      el('div', { class: 'rd-body' }, [
        el('div', { class: 'rd-passage' }, [
          el('div', { class: 'rd-hint', text: r.gapsInstr }),
          passage,
        ]),
        el('div', { class: 'rd-partswrap' }, [
          el('div', { class: 'rd-qtitle', text: r.partsLabel }),
          partsList,
        ]),
        el('div', { class: 'rd-foot' }, [action]),
      ]),
    ]));
    container.querySelector('.rd-screen').scrollTop = 0;
  }

  // --- 1.3.3 Множественный выбор ---
  function startMc(group) {
    const picks = new Array(group.questions.length).fill(null);
    let checked = false;
    const action = el('button', { class: 'btn btn-check btn-block', text: t.check, disabled: true });
    const qNodes = [];

    const passage = el('div', { class: 'rd-text', text: group.text });

    const qWrap = el('div', { class: 'rd-statements' }, group.questions.map((q, i) => {
      const opts = q.options.map((label, k) => {
        const val = String(k + 1);
        const b = el('button', { class: 'mc-opt', text: `${val}) ${label}`, onclick: () => {
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
        el('div', { class: 'tf-text', text: q.question }),
        el('div', { class: 'mc-opts' }, opts),
        verdict,
      ]);
      const row = el('div', { class: 'tf-row' }, [el('div', { class: 'tf-num', text: String(q.num) }), body]);
      qNodes.push({ opts, verdict, body });
      return row;
    }));

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0;
      const ex = (expl.mc || {});
      const evidences = [];
      group.questions.forEach((q, i) => {
        const ok = picks[i] === q.answer;
        if (ok) correct++;
        recordDrill(SECTION, q.zid, ok, '1.3.3');
        const { opts, verdict, body } = qNodes[i];
        opts.forEach((o, k) => {
          o.disabled = true;
          const val = String(k + 1);
          if (val === q.answer) o.classList.add('right');
          else if (val === picks[i]) o.classList.add('wrong');
        });
        verdict.className = 'tf-verdict ' + (ok ? 'ok' : 'bad');
        verdict.textContent = ok ? '✓' : ('✕ ' + r.correctNum(q.answer));
        verdict.style.display = 'block';
        const e = ex[q.zid] || {};
        if (e.evidence) evidences.push({ ev: e.evidence, num: q.num });
        const wb = whyBlock(e.why);
        if (wb) body.appendChild(wb);
      });
      renderHighlighted(passage, group.text, evidences);
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      pending = { correct, total: group.questions.length };
      qWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    action.addEventListener('click', () => { checked ? showSummary(pending.correct, pending.total) : doCheck(); });

    mount(container, el('div', { class: 'rd-screen view' }, [
      secBar(menuScreen, r.mcSub),
      el('div', { class: 'rd-body' }, [
        el('div', { class: 'rd-passage' }, [
          el('div', { class: 'rd-hint', text: r.mcInstr }),
          passage,
        ]),
        qWrap,
        el('div', { class: 'rd-foot' }, [action]),
      ]),
    ]));
    container.querySelector('.rd-screen').scrollTop = 0;
  }

  // --- Итог раунда (общий) ---
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
