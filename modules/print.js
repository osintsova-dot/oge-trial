// print.js — печать набора заданий (пробник/worksheet) в PDF + бланк ответов.
// Рендерит чистую печатную страницу (лист заданий + бланк ответов), кнопка → window.print()
// → «Сохранить как PDF». Без бэкенда. @media print прячет интерфейс (см. brand.css .no-print/.print-*).
// Набор = массив секций варианта (как в oge_mock.json/ege_mock.json) ИЛИ worksheet учителя.

import { el, mount } from '../js/ui.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ABC = ['A', 'B', 'C', 'D'];

// Печатный лист = как на ФИПИ: инструкции и бланк ПО-РУССКИ для обоих экзаменов (реальный
// вариант ФИПИ всегда на русском, даже ЕГЭ). Формулировки — из демоверсии ФИПИ-2026.
const P = {
  title: 'Версия для печати', doPrint: 'Печать',
  hint: 'Нажми «Печать» → «Сохранить как PDF». Лист заданий и бланк ответов — на отдельных страницах.',
  fio: 'Фамилия, имя: ', date: 'Дата: ',
  answerSheet: 'Бланк ответов № 1',
  speakingNote: 'Устная часть выполняется в приложении (не печатается).',
  writeOnSheet: 'Ответ запишите на бланке ответов или на отдельном листе.',
  writingArea: 'Письменная часть:',
  audioScan: '🔊 Отсканируйте QR, чтобы включить аудио:',
  fSurname: 'Фамилия', fName: 'Имя', fPatr: 'Отчество', fSubject: 'Предмет: Английский язык', fClass: 'Класс:',
  asInstr: 'Ответы записывайте чёткими печатными буквами/цифрами, по одному символу в клетке.',
  iChoice: 'В каждом задании запишите цифру, соответствующую выбранному варианту ответа.',
  iFill: 'Запишите в поле ответа слово (без пробелов и иных символов).',
  iMatch: 'Установите соответствие между говорящими A–F и утверждениями 1–7. Одно утверждение лишнее.',
  iTfns: 'Определите, какие из утверждений соответствуют содержанию (1 — True), какие не соответствуют (2 — False) и о чём не сказано (3 — Not stated).',
  iGaps: 'Прочитайте текст и заполните пропуски A–F частями предложений 1–7. Одна часть лишняя.',
  iReadMatch: 'Установите соответствие между текстами и заголовками/вопросами. Один пункт лишний.',
  tgGrammar: 'Преобразуйте, если необходимо, слова, напечатанные заглавными буквами, так, чтобы они грамматически соответствовали содержанию текста (задания 19–24).',
  tgWordform: 'Образуйте от слов, напечатанных заглавными буквами, однокоренные слова, так, чтобы они грамматически и лексически соответствовали содержанию текста (задания 25–29).',
};

// Главное: показать печатный вид набора заданий.
// opts = { title, sub, sections, onBack }
export function renderPrintView(container, opts) {
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
    ...buildPaper(opts.sections, P, opts.exam),
  ]);

  const sheet = el('div', { class: 'print-paper answer-sheet' }, [
    asHeader(P, opts.title),
    ...buildAnswerSheet(opts.sections, P, opts.exam),
  ]);

  mount(container, el('div', { class: 'view print-view' }, [toolbar, el('div', { class: 'print-hint no-print', text: P.hint }), paper, sheet]));
}

// Сколько ЗАДАНИЙ (номеров) занимает элемент и длина ответа каждого (для бланка) — строго по ФИПИ.
// Соответствие/вставка = ОДНО задание с многозначным ответом; ОГЭ верно-неверно — по утверждению.
function itemSlots(it, exam) {
  if (it.kind === 'choice') return [1];
  if (it.kind === 'fill') return [10];
  if (it.kind === 'gap') return [12];
  if (it.kind === 'textgaps') return (it.gaps || []).map(() => 12);
  if (it.kind === 'match') return [(it.speakers || []).length];
  if (it.kind === 'rmatch') return [LETTERS.filter((L) => it.texts && it.texts[L] != null).length];
  if (it.kind === 'gaps') return [(it.gaps || []).length];
  if (it.kind === 'tfns') return exam === 'ege' ? [(it.statements || []).length] : (it.statements || []).map(() => 1);
  return [];
}

// ---- Лист заданий ----
function buildPaper(sections, P, exam) {
  let n = 0; // нумерация ЗАДАНИЙ по ФИПИ
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
    if (sec.id === 'listening' && sec.audio) {
      const wrap = el('div', { class: 'pp-audio-wrap' });
      const qr = qrEl(sec.audio);
      if (qr) wrap.appendChild(qr);
      wrap.appendChild(el('div', { class: 'pp-audio' }, [el('div', { class: 'pp-audio-l', text: P.audioScan }), el('div', { text: sec.audio })]));
      items.push(wrap);
    }
    let lastInstr = '';
    for (const it of (sec.items || [])) {
      // инструкция «что делать» — одна на группу одинаковых заданий подряд (как на экзамене)
      const instr = instrFor(it, P);
      if (instr && instr !== lastInstr) { items.push(el('div', { class: 'pp-instr', text: instr })); lastInstr = instr; }
      const r = renderItem(it, n, exam);
      items.push(r.node);
      n = r.n;
    }
    out.push(el('div', { class: 'pp-sec' }, items));
  }
  return out;
}

// QR-код ссылки на аудио (SVG, чётко печатается). Библиотека qrcode-generator (вшита локально).
function qrEl(text) {
  const gen = (typeof window !== 'undefined') && window.qrcode;
  if (!gen) return null;
  let qr = null;
  for (const ecc of ['M', 'L']) {
    try { qr = gen(0, ecc); qr.addData(text); qr.make(); break; } catch (e) { qr = null; }
  }
  if (!qr) return null;
  const n = qr.getModuleCount(), cell = 3, size = n * cell, NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size); svg.setAttribute('class', 'pp-qr');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff');
  svg.appendChild(bg);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    const rc = document.createElementNS(NS, 'rect');
    rc.setAttribute('x', c * cell); rc.setAttribute('y', r * cell);
    rc.setAttribute('width', cell); rc.setAttribute('height', cell); rc.setAttribute('fill', '#000');
    svg.appendChild(rc);
  }
  return svg;
}

// инструкция «что делать» по типу задания (match/rmatch несут свою — там null/title)
function instrFor(it, P) {
  if (it.kind === 'choice') return P.iChoice;
  if (it.kind === 'fill') return P.iFill;
  if (it.kind === 'gap') return P.iGap;
  if (it.kind === 'tfns') return P.iTfns;
  if (it.kind === 'gaps') return P.iGaps;
  if (it.kind === 'rmatch') return P.iReadMatch;
  return ''; // match — своя инструкция в it.task
}

function renderItem(it, n, exam) {
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
    n += 1; const num = n; // одно задание, ответ = последовательность цифр
    const cells = (it.speakers || []).map((sp) => el('span', { class: 'pp-mcell', text: sp + '__ ' }));
    return { node: el('div', { class: 'pp-q' }, [el('div', { class: 'pp-qt', text: '№ ' + num + '. ' + (it.task || '') }), el('ol', { class: 'pp-rubrics' }, (it.rubrics || []).map((r) => el('li', { text: r }))), el('div', { class: 'pp-mrow' }, cells)]), n };
  }
  if (it.kind === 'rmatch') {
    n += 1; const num = n;
    const ls = LETTERS.filter((L) => it.texts && it.texts[L] != null);
    const texts = ls.map((L) => el('div', { class: 'pp-text' }, [el('b', { text: L + '. ' }), it.texts[L]]));
    const ansrow = el('div', { class: 'pp-mrow' }, [el('b', { text: '№ ' + num + ': ' }), ...ls.map((L) => el('span', { class: 'pp-mcell', text: L + '__ ' }))]);
    return { node: el('div', { class: 'pp-q' }, [el('ol', { class: 'pp-rubrics' }, (it.questions || []).map((q) => el('li', { text: q }))), ...texts, ansrow]), n };
  }
  if (it.kind === 'gaps') {
    n += 1; const num = n;
    const passage = (it.passage || '').replace(/\{([A-F])\}/g, (m, L) => ' (' + L + ')___ ');
    const ansrow = el('div', { class: 'pp-mrow' }, [el('b', { text: '№ ' + num + ': ' }), ...(it.gaps || []).map((L) => el('span', { class: 'pp-mcell', text: L + '__ ' }))]);
    return { node: el('div', { class: 'pp-q' }, [el('ol', { class: 'pp-rubrics' }, (it.parts || []).map((p) => el('li', { text: p }))), el('div', { class: 'pp-text', text: passage }), ansrow]), n };
  }
  if (it.kind === 'tfns') {
    const head = el('div', { class: 'pp-text', text: it.text || '' });
    if (exam === 'ege') {
      n += 1; const num = n; // одно задание, ответ = последовательность 1/2/3
      const sts = (it.statements || []).map((st, i) => el('div', { class: 'pp-mrow', text: (st.letter || LETTERS[i]) + '. ' + st.statement }));
      const ansrow = el('div', { class: 'pp-mrow' }, [el('b', { text: '№ ' + num + ': ' }), ...(it.statements || []).map((st, i) => el('span', { class: 'pp-mcell', text: (st.letter || LETTERS[i]) + '__ ' }))]);
      return { node: el('div', { class: 'pp-q' }, [head, ...sts, ansrow]), n };
    }
    const sts = (it.statements || []).map((st) => { n += 1; return el('div', { class: 'pp-mrow', text: n + '. ' + st.statement + '  ____' }); });
    return { node: el('div', { class: 'pp-q' }, [head, ...sts]), n };
  }
  if (it.kind === 'textgaps') {
    const head = el('div', { class: 'pp-instr', text: it.sub === 'wordform' ? P.tgWordform : P.tgGrammar });
    const para = el('div', { class: 'pp-text pp-textgaps' });
    (it.gaps || []).forEach((gp) => {
      n += 1;
      const parts = (gp.text || '').split(/_{3,}/);
      para.appendChild(document.createTextNode(parts[0] || ''));
      para.appendChild(el('span', { class: 'pp-tg-gap', text: ' (' + n + ') ________ ' }));
      if (gp.base_word) para.appendChild(el('b', { text: '[' + gp.base_word + '] ' }));
      para.appendChild(document.createTextNode(parts[1] || ' '));
    });
    return { node: el('div', { class: 'pp-q' }, [head, para]), n };
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

// ---- Бланк ответов: номера и клетки строго по ФИПИ (соответствие = один номер, N клеток) ----
function buildAnswerSheet(sections, P, exam) {
  let n = 0;
  const cells = [];
  for (const sec of sections) {
    if (sec.id === 'writing' || sec.id === 'speaking') continue;
    for (const it of (sec.items || [])) {
      for (const len of itemSlots(it, exam)) { n += 1; cells.push(answerRow(n, len)); }
    }
  }
  const grid = el('div', { class: 'as-grid' }, cells);
  const writingNote = sections.some((s) => s.id === 'writing') ? el('div', { class: 'as-writing' }, [el('div', { class: 'as-w-h', text: P.writingArea }), ...Array.from({ length: 10 }, () => el('div', { class: 'as-line' }))]) : null;
  return [grid, writingNote].filter(Boolean);
}

function answerRow(n, len) {
  const boxes = Array.from({ length: Math.max(1, len || 1) }, () => el('span', { class: 'as-box' }));
  return el('div', { class: 'as-row' }, [el('span', { class: 'as-n', text: String(n) }), el('span', { class: 'as-boxes' }, boxes)]);
}
