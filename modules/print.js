// print.js — печать набора заданий (пробник/worksheet) в PDF + бланк ответов.
// Рендерит чистую печатную страницу (лист заданий + бланк ответов), кнопка → window.print()
// → «Сохранить как PDF». Без бэкенда. @media print прячет интерфейс (см. brand.css .no-print/.print-*).
// Набор = массив секций варианта (как в oge_mock.json/ege_mock.json) ИЛИ worksheet учителя.

import { el, mount } from '../js/ui.js';

// qrcode-generator нужен только для печати (QR на аудио) — грузим лениво при первом импорте print.js,
// а не на главной. qrEl() корректно отдаёт null, пока скрипт ещё не подгрузился.
if (typeof window !== 'undefined' && !window.qrcode) {
  const s = document.createElement('script'); s.src = './js/vendor/qrcode.js'; s.async = true;
  document.head.appendChild(s);
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ABC = ['A', 'B', 'C', 'D'];

// убрать базовое слово, дублированное в конце предложения (формат ФИПИ ОГЭ: «…spring. COME»)
export function stripTrailingBase(text, baseWord) {
  if (!baseWord) return text;
  const esc = baseWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = text.replace(new RegExp('\\s*' + esc + '\\s*$', 'i'), '').trimEnd();
  if (out === text.trimEnd()) return text; // базового слова в конце не было (формат ЕГЭ)
  return /[.!?]$/.test(out) ? out : out + '.';
}

// Печатный лист = как на ФИПИ: инструкции и бланк ПО-РУССКИ для обоих экзаменов (реальный
// вариант ФИПИ всегда на русском, даже ЕГЭ). Формулировки — из демоверсии ФИПИ-2026.
const P = {
  title: 'Версия для печати', doPrint: 'Печать', officialBlank: 'Официальный бланк',
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
  tgLexis: 'Прочитайте текст с пропусками. Выберите номер слова, подходящего по смыслу, и запишите цифру 1, 2, 3 или 4 (задания 30–36).',
  // официальный бланк ответов № 1 (по образцу ФИПИ-2026)
  examFull: { oge: 'ОСНОВНОЙ ГОСУДАРСТВЕННЫЙ ЭКЗАМЕН — 2026', ege: 'ЕДИНЫЙ ГОСУДАРСТВЕННЫЙ ЭКЗАМЕН — 2026' },
  as1Title: 'БЛАНК ОТВЕТОВ № 1', as2Title: 'БЛАНК ОТВЕТОВ № 2',
  asRegion: 'Код региона', asSubjCode: 'Код предмета', asSubjName: 'Название предмета',
  asSubjVal: 'Английский язык', asReserve: 'Резерв',
  asSign: 'Подпись участника экзамена',
  asFillRule: 'Заполнять гелевой или капиллярной ручкой ЧЁРНЫМИ чернилами ЗАГЛАВНЫМИ ПЕЧАТНЫМИ БУКВАМИ и ЦИФРАМИ по следующему образцу:',
  asSampleL: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', asSampleD: '1234567890  - .',
  asShortBand: 'Результаты выполнения заданий с КРАТКИМ ОТВЕТОМ',
  asReplaceBand: 'Замена ошибочных ответов на задания с КРАТКИМ ОТВЕТОМ',
  asInfoBand: 'СВЕДЕНИЯ ОБ УЧАСТНИКЕ', asDoc: 'Документ', asSeria: 'Серия', asNomer: 'Номер',
  as2Note: 'Развёрнутые ответы (письменная часть). Пишите аккуратно, не выходя за границы поля.',
  keysTitle: 'КЛЮЧИ (для учителя)',
  wsGridTitle: 'БЛАНК ОТВЕТОВ (заполни ручкой)',
  wsGridNote: 'Печатными ЗАГЛАВНЫМИ буквами, по одному символу в клетке. Номер строки = номер задания. Пиши тёмной ручкой, ровно — учитель проверит по фото.',
};

// Главное: показать печатный вид набора заданий.
// opts = { title, sub, sections, onBack }
export function renderPrintView(container, opts) {
  const officialHref = './assets/blanks/' + (opts.exam === 'oge' ? 'oge' : 'ege') + '_blank.pdf';
  const toolbar = el('div', { class: 'print-bar no-print' }, [
    el('button', { class: 'back', text: '←', onclick: opts.onBack }),
    el('div', { class: 'print-bar-t', text: P.title }),
    el('a', { class: 'btn print-official', href: officialHref, target: '_blank', rel: 'noopener', text: '📄 ' + P.officialBlank }),
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

  // worksheet учителя: отдельный БЛАНК ОТВЕТОВ-сетка (для проверки по фото) + опц. страница ключей
  let sheets = [];
  if (opts.worksheet) {
    const grid = buildWorksheetGrid(opts.sections, P, opts.exam);
    if (grid) sheets.push(grid);
    if (opts.withKeys) sheets.push(buildKeysPage(opts.sections, P, opts.exam));
  } else {
    sheets = [
      el('div', { class: 'print-paper answer-sheet as1-sheet' }, [asHeader(P, opts.title, opts.exam), ...buildAnswerSheet(opts.sections, P, opts.exam)]),
      buildSheet2(P, opts.sections, opts.exam),
    ];
  }

  mount(container, el('div', { class: 'view print-view' }, [toolbar, el('div', { class: 'print-hint no-print', text: P.hint }), paper, ...sheets].filter(Boolean)));
}

// Сколько ЗАДАНИЙ (номеров) занимает элемент и длина ответа каждого (для бланка) — строго по ФИПИ.
// Соответствие/вставка = ОДНО задание с многозначным ответом; ОГЭ верно-неверно — по утверждению.
function itemSlots(it, exam) {
  if (it.kind === 'choice') return [1];
  if (it.kind === 'fill') return [10];
  if (it.kind === 'gap') return [12];
  if (it.kind === 'textgaps') return (it.gaps || []).map(() => 12);
  if (it.kind === 'lexgaps') return (it.gaps || []).map(() => 1);
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
  if (it.kind === 'lexgaps') return P.tgLexis;
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
    // fill: формулировка-заметка (label, напр. «Current job») + место под слово; gap: предложение с пропуском
    const fillTxt = (it.label || it.q || '') + ': ______';
    // gap: базовое слово показываем ПРЯМО у пропуска [BASE]; убираем дубль базового слова с конца (формат ОГЭ)
    const bw = it.base_word || '';
    const body = bw ? stripTrailingBase(it.text || '', bw) : (it.text || '');
    // пропуск может быть из нескольких прогонов подчёркиваний подряд — заменяем целиком один раз
    const gapTxt = body.replace(/_{3,}(?:\s*_{3,})*/, ' (' + n + ') ______ ' + (bw ? '[' + bw + '] ' : ''));
    const txt = it.kind === 'gap' ? gapTxt : fillTxt;
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
  if (it.kind === 'lexgaps') {
    // связный текст с пропусками (num) ___ + под ним список заданий с 4 вариантами
    const para = el('div', { class: 'pp-text pp-textgaps' });
    const nums = [];
    (it.passage || '').split(/\{(\d+)\}/).forEach((ch, idx) => {
      if (idx % 2 === 0) { if (ch) para.appendChild(document.createTextNode(ch)); return; }
      n += 1; nums.push(n);
      para.appendChild(el('span', { class: 'pp-tg-gap', text: ' (' + n + ') ______ ' }));
    });
    const list = (it.gaps || []).map((gp, gi) => el('div', { class: 'pp-lex-q' }, [
      el('b', { text: (nums[gi] || gp.pos) + '. ' }),
      ...(gp.options || []).map((w, oi) => el('span', { class: 'pp-lex-opt', text: (oi + 1) + ') ' + w + '  ' })),
    ]));
    return { node: el('div', { class: 'pp-q' }, [para, el('div', { class: 'pp-lex-list' }, list)]), n };
  }
  return { node: el('div'), n };
}

const AS_CELLS = 17; // клеток в строке ответа (как на бланке ФИПИ)

// ---- Шапка БЛАНКА ОТВЕТОВ № 1 (по образцу ФИПИ-2026) ----
function asHeader(P, title, exam) {
  const cg = (label, k) => el('div', { class: 'as1-cg' }, [
    el('div', { class: 'as1-cg-l', text: label }),
    el('div', { class: 'as1-cg-b' }, Array.from({ length: k }, () => el('span', { class: 'as1-box' }))),
  ]);
  const sample = (s) => el('div', { class: 'as1-sample' }, s.split('').map((ch) =>
    el('span', { class: 'as1-sch', text: ch === ' ' ? ' ' : ch })));
  // строка-поле «Фамилия» и т.п. с клетками (для ОГЭ — сведения об участнике на бланке № 1)
  const cellRow = (label, k) => el('div', { class: 'as1-namerow' }, [
    el('div', { class: 'as1-name-l', text: label }),
    el('div', { class: 'as1-cg-b' }, Array.from({ length: k }, () => el('span', { class: 'as1-box' }))),
  ]);
  const band = el('div', { class: 'as1-band' }, [
    el('div', { class: 'as1-exam', text: (P.examFull[exam] || P.examFull.ege) }),
    el('div', { class: 'as1-blank', text: P.as1Title }),
  ]);
  const codes = el('div', { class: 'as1-codes' }, [
    cg(P.asRegion, 2), cg(P.asSubjCode, 2),
    el('div', { class: 'as1-cg' }, [el('div', { class: 'as1-cg-l', text: P.asSubjName }), el('div', { class: 'as1-subjval', text: P.asSubjVal })]),
    cg(P.asReserve, 4),
  ]);
  const rule = el('div', { class: 'as1-rule', text: P.asFillRule });
  const samples = el('div', { class: 'as1-samples' }, [sample(P.asSampleL), sample(P.asSampleD)]);
  if (exam === 'oge') {
    // ОГЭ: сведения об участнике (ФИО + документ) прямо на бланке № 1
    const info = el('div', { class: 'as1-info' }, [
      el('div', { class: 'as1-infoband', text: P.asInfoBand }),
      cellRow(P.fSurname, 24), cellRow(P.fName, 24), cellRow(P.fPatr, 24),
      el('div', { class: 'as1-docrow' }, [
        el('div', { class: 'as1-name-l', text: P.asDoc }),
        el('span', { class: 'as1-doc-s', text: P.asSeria }), el('div', { class: 'as1-cg-b' }, Array.from({ length: 4 }, () => el('span', { class: 'as1-box' }))),
        el('span', { class: 'as1-doc-s', text: P.asNomer }), el('div', { class: 'as1-cg-b' }, Array.from({ length: 6 }, () => el('span', { class: 'as1-box' }))),
      ]),
    ]);
    return el('div', { class: 'as1-head' }, [band, codes, rule, samples, info]);
  }
  return el('div', { class: 'as1-head' }, [
    band, codes,
    el('div', { class: 'as1-sign' }, [el('span', { class: 'pp-line' }), el('span', { class: 'as1-sign-l', text: P.asSign })]),
    rule, samples,
  ]);
}

// ---- Бланк ответов № 1: две колонки пронумерованных строк (краткий ответ) ----
function buildAnswerSheet(sections, P, exam) {
  let n = 0;
  const nums = [];
  for (const sec of sections) {
    if (sec.id === 'writing' || sec.id === 'speaking') continue;
    for (const it of (sec.items || [])) for (const _ of itemSlots(it, exam)) { n += 1; nums.push(n); }
  }
  const mid = Math.ceil(nums.length / 2);
  const col = (arr) => el('div', { class: 'as1-col' }, arr.map((num) => answerRow(num)));
  return [
    el('div', { class: 'as1-secband', text: P.asShortBand }),
    el('div', { class: 'as1-cols' }, [col(nums.slice(0, mid)), col(nums.slice(mid))]),
  ];
}

function answerRow(num) {
  return el('div', { class: 'as1-row' }, [
    el('span', { class: 'as1-num', text: String(num) }),
    el('span', { class: 'as1-cells' }, Array.from({ length: AS_CELLS }, () => el('span', { class: 'as1-box' }))),
  ]);
}

// ---- БЛАНК ОТВЕТОВ-сетка для worksheet (светлые клетки, строка = номер задания; для проверки по фото) ----
function buildWorksheetGrid(sections, P, exam) {
  let n = 0;
  const rows = [];
  for (const sec of sections) {
    if (sec.id === 'writing' || sec.id === 'speaking') continue;
    for (const it of (sec.items || [])) for (const len of itemSlots(it, exam)) {
      n += 1;
      rows.push({ num: n, cells: Math.min(Math.max(len, 6), 15) });
    }
  }
  if (!rows.length) return null;
  // официальная шапка ФИПИ (как у настоящего бланка) + наша сетка-ответов с нумерацией заданий
  return el('div', { class: 'print-paper answer-sheet ws-grid-paper' }, [
    asHeader(P, P.wsGridTitle, exam),
    el('div', { class: 'as1-secband', text: P.asShortBand }),
    el('div', { class: 'ws-grid-note', text: P.wsGridNote }),
    el('div', { class: 'ws-grid' }, rows.map((r) => el('div', { class: 'ws-grow' }, [
      el('span', { class: 'ws-gnum', text: String(r.num) }),
      el('span', { class: 'ws-gcells' }, Array.from({ length: r.cells }, () => el('span', { class: 'ws-acell' }))),
    ]))),
  ]);
}

// ответ задания для страницы ключей (worksheet учителя)
function answerOf(it) {
  if (it.kind === 'gap' || it.kind === 'fill') return it.key || '';
  if (it.kind === 'choice') return it.key ? String(it.key) : '';
  if (it.kind === 'textgaps') return (it.gaps || []).map((g) => g.key).join(', ');
  if (it.kind === 'lexgaps') return (it.gaps || []).map((g) => g.key).join(', ');
  if (it.kind === 'match') return (it.key || []).join('');
  if (it.kind === 'rmatch') return (it.answer || []).join('');
  if (it.kind === 'gaps') return (it.answer || []).join('');
  if (it.kind === 'tfns') return (it.statements || []).map((s) => s.answer).join('');
  return '';
}

// ---- Страница КЛЮЧЕЙ для учителя (нумерация совпадает с листом заданий) ----
function buildKeysPage(sections, P, exam) {
  let n = 0;
  const rows = [];
  for (const sec of sections) {
    if (sec.id === 'writing' || sec.id === 'speaking') continue;
    for (const it of (sec.items || [])) {
      const slots = itemSlots(it, exam);
      const first = n + 1; n += slots.length;
      const label = slots.length > 1 ? first + '–' + n : String(first);
      rows.push({ label, ans: answerOf(it) });
    }
  }
  const mid = Math.ceil(rows.length / 2);
  const col = (arr) => el('div', { class: 'pk-col' }, arr.map((r) =>
    el('div', { class: 'pk-row' }, [el('b', { text: r.label + '. ' }), el('span', { text: r.ans })])));
  return el('div', { class: 'print-paper answer-sheet pk-sheet' }, [
    el('div', { class: 'pk-h', text: P.keysTitle }),
    el('div', { class: 'pk-cols' }, [col(rows.slice(0, mid)), col(rows.slice(mid))]),
  ]);
}

// ---- Бланк ответов № 2: поле для развёрнутых ответов (письмо) ----
function buildSheet2(P, sections, exam) {
  if (!sections.some((s) => s.id === 'writing')) return null;
  return el('div', { class: 'print-paper answer-sheet as2-sheet' }, [
    el('div', { class: 'as1-band' }, [
      el('div', { class: 'as1-exam', text: (P.examFull[exam] || P.examFull.ege) }),
      el('div', { class: 'as1-blank', text: P.as2Title }),
    ]),
    el('div', { class: 'as2-note', text: P.as2Note }),
    el('div', { class: 'as2-grid' }),
  ]);
}
