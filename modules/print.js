// print.js — печать набора заданий (пробник/worksheet) в PDF + бланк ответов.
// Рендерит чистую печатную страницу (лист заданий + бланк ответов), кнопка → window.print()
// → «Сохранить как PDF». Без бэкенда. @media print прячет интерфейс (см. brand.css .no-print/.print-*).
// Набор = массив секций варианта (как в oge_mock.json/ege_mock.json) ИЛИ worksheet учителя.

import { el, mount } from '../js/ui.js';
import { t, EXAM } from '../js/exam.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ABC = ['A', 'B', 'C', 'D'];

// Главное: показать печатный вид набора заданий.
// opts = { title, sub, sections, onBack }
export function renderPrintView(container, opts) {
  const P = t.print;
  const toolbar = el('div', { class: 'print-bar no-print' }, [
    el('button', { class: 'back', text: '←', onclick: opts.onBack }),
    el('div', { class: 'print-bar-t', text: P.title }),
    el('button', { class: 'btn btn-primary print-go', text: '🖨 ' + P.doPrint, onclick: () => window.print() }),
  ]);

  const paper = el('div', { class: 'print-paper' }, [
    el('div', { class: 'pp-head' }, [
      el('div', { class: 'pp-title', text: opts.title }),
      opts.sub ? el('div', { class: 'pp-sub', text: opts.sub }) : null,
      el('div', { class: 'pp-meta' }, [el('span', { text: P.fio }), el('span', { class: 'pp-line' }), el('span', { text: P.date }), el('span', { class: 'pp-line short' })]),
    ]),
    ...buildPaper(opts.sections, P),
  ]);

  const sheet = el('div', { class: 'print-paper answer-sheet' }, [
    asHeader(P, opts.title),
    ...buildAnswerSheet(opts.sections, P),
  ]);

  mount(container, el('div', { class: 'view print-view' }, [toolbar, el('div', { class: 'print-hint no-print', text: P.hint }), paper, sheet]));
}

// ---- Лист заданий ----
function buildPaper(sections, P) {
  let n = 0; // сквозная нумерация заданий с кратким ответом
  const out = [];
  for (const sec of sections) {
    if (sec.id === 'speaking') { out.push(el('div', { class: 'pp-sec' }, [el('div', { class: 'pp-sec-h', text: sec.title }), el('div', { class: 'pp-note', text: P.speakingNote })])); continue; }
    if (sec.id === 'writing') {
      const tk = sec.task || {};
      const prompt = tk.prompt || ((tk.context || '') + ' ' + (tk.questions || ''));
      out.push(el('div', { class: 'pp-sec' }, [
        el('div', { class: 'pp-sec-h', text: sec.title }),
        el('div', { class: 'pp-stim', text: prompt.trim() }),
        el('div', { class: 'pp-note', text: P.writeOnSheet }),
      ]));
      continue;
    }
    const items = [el('div', { class: 'pp-sec-h', text: sec.title })];
    if (sec.id === 'listening' && sec.audio) items.push(el('div', { class: 'pp-audio', text: P.audioAt + ' ' + sec.audio }));
    for (const it of (sec.items || [])) {
      const r = renderItem(it, n);
      items.push(r.node);
      n = r.n;
    }
    out.push(el('div', { class: 'pp-sec' }, items));
  }
  return out;
}

function renderItem(it, n) {
  if (it.kind === 'choice') {
    n += 1;
    const opts = (it.options || []).map((o, i) => el('div', { class: 'pp-opt', text: ABC[i] + ') ' + o }));
    return { node: el('div', { class: 'pp-q' }, [el('div', { class: 'pp-qt', text: n + '. ' + (it.q || '') }), ...opts]), n };
  }
  if (it.kind === 'fill' || it.kind === 'gap') {
    n += 1;
    const txt = it.kind === 'gap' ? (it.text || '').replace(/_{3,}/, ' (' + n + ') ______ ') + (it.base_word ? '  [' + it.base_word + ']' : '') : (it.q || '');
    return { node: el('div', { class: 'pp-q' }, [el('div', { class: 'pp-qt', text: (it.kind === 'fill' ? n + '. ' : '') + txt })]), n };
  }
  if (it.kind === 'match') {
    const rows = (it.speakers || []).map((sp) => { n += 1; return el('div', { class: 'pp-mrow', text: sp + ' — (' + n + ') ____' }); });
    return { node: el('div', { class: 'pp-q' }, [el('div', { class: 'pp-qt', text: it.task || '' }), el('ol', { class: 'pp-rubrics' }, (it.rubrics || []).map((r) => el('li', { text: r }))), ...rows]), n };
  }
  if (it.kind === 'rmatch') {
    const ls = LETTERS.filter((L) => it.texts && it.texts[L] != null);
    const texts = ls.map((L) => el('div', { class: 'pp-text' }, [el('b', { text: L + '. ' }), it.texts[L]]));
    const rows = ls.map((L) => { n += 1; return el('span', { class: 'pp-mcell', text: L + ': (' + n + ')__ ' }); });
    return { node: el('div', { class: 'pp-q' }, [el('ol', { class: 'pp-rubrics' }, (it.questions || []).map((q) => el('li', { text: q }))), ...texts, el('div', { class: 'pp-mrow' }, rows)]), n };
  }
  if (it.kind === 'gaps') {
    const passage = (it.passage || '').replace(/\{([A-F])\}/g, (m, L) => ' (' + L + ')___ ');
    const rows = (it.gaps || []).map((L) => { n += 1; return el('span', { class: 'pp-mcell', text: L + ': (' + n + ')__ ' }); });
    return { node: el('div', { class: 'pp-q' }, [el('ol', { class: 'pp-rubrics' }, (it.parts || []).map((p) => el('li', { text: p }))), el('div', { class: 'pp-text', text: passage }), el('div', { class: 'pp-mrow' }, rows)]), n };
  }
  if (it.kind === 'tfns') {
    const head = el('div', { class: 'pp-text', text: it.text || '' });
    const sts = (it.statements || []).map((st) => { n += 1; return el('div', { class: 'pp-mrow', text: n + '. ' + st.statement + '  ____' }); });
    return { node: el('div', { class: 'pp-q' }, [head, ...sts]), n };
  }
  return { node: el('div'), n };
}

// ---- Шапка бланка ответов (как на экзамене) ----
function asHeader(P, title) {
  const filled = (label, cells) => el('div', { class: 'as-field' }, [
    el('div', { class: 'as-field-l', text: label }),
    el('div', { class: 'as-boxes' }, Array.from({ length: cells }, () => el('span', { class: 'as-box' }))),
  ]);
  return el('div', { class: 'as-header' }, [
    el('div', { class: 'as-title', text: P.answerSheet }),
    el('div', { class: 'as-ex', text: title }),
    filled(P.fSurname, 18),
    filled(P.fName, 18),
    filled(P.fPatr, 18),
    el('div', { class: 'as-line2' }, [
      el('span', { text: P.fSubject }), el('span', { class: 'pp-line' }),
      el('span', { text: P.fClass }), el('span', { class: 'pp-line short' }),
      el('span', { text: P.date }), el('span', { class: 'pp-line short' }),
    ]),
    el('div', { class: 'as-instr', text: P.asInstr }),
  ]);
}

// ---- Бланк ответов: пронумерованные клетки ----
function buildAnswerSheet(sections, P) {
  // считаем число заданий с кратким ответом (как в листе)
  let n = 0;
  const cells = [];
  for (const sec of sections) {
    if (sec.id === 'writing' || sec.id === 'speaking') continue;
    for (const it of (sec.items || [])) {
      let cnt = 0;
      if (it.kind === 'choice' || it.kind === 'fill' || it.kind === 'gap') cnt = 1;
      else if (it.kind === 'match') cnt = (it.speakers || []).length;
      else if (it.kind === 'rmatch') cnt = LETTERS.filter((L) => it.texts && it.texts[L] != null).length;
      else if (it.kind === 'gaps') cnt = (it.gaps || []).length;
      else if (it.kind === 'tfns') cnt = (it.statements || []).length;
      for (let i = 0; i < cnt; i++) { n += 1; cells.push(answerRow(n)); }
    }
  }
  const grid = el('div', { class: 'as-grid' }, cells);
  const writingNote = sections.some((s) => s.id === 'writing') ? el('div', { class: 'as-writing' }, [el('div', { class: 'as-w-h', text: P.writingArea }), ...Array.from({ length: 10 }, () => el('div', { class: 'as-line' }))]) : null;
  return [grid, writingNote].filter(Boolean);
}

function answerRow(n) {
  const boxes = Array.from({ length: 10 }, () => el('span', { class: 'as-box' }));
  return el('div', { class: 'as-row' }, [el('span', { class: 'as-n', text: String(n) }), el('span', { class: 'as-boxes' }, boxes)]);
}
