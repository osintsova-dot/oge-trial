// teacher.js — учительский конструктор worksheets/ДЗ (Feature B).
// Собирает «набор заданий» из дрилл-банков (грамматика/словообр./лексика) по КЭС,
// печатает worksheet ученику + страницу с ключами (через print.js).
// Без бэкенда: данные из app/data, выбор — в памяти. Вход — дискретный (#/teacher).

import { el, mount } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { EXAM, t } from '../js/exam.js';
import { getName } from '../js/gamify.js';
import { renderPrintView, stripTrailingBase } from './print.js';

// человекочитаемые названия дрилл-разделов
const SEC_TITLE = { grammar: 'Грамматика', wordform: 'Словообразование', lexis: 'Лексика и словообразование' };

// распространённые неправильные глаголы (V2) — чтобы отличить Past Simple от Present Simple
const IRREG_PAST = new Set(('was were had did made went came took saw got gave knew found told became left felt put brought began kept held wrote stood heard let meant set met ran paid sat spoke lay led read grew lost fell sent built understood drew broke spent cut rose drove bought wore chose ate spoke shook threw caught dealt won taught bought sought thought sold fought hid bit wore dug swam rang sang drank sank shot lent meant slept swept wept crept kept felt dreamt spelt burnt learnt sent bent built spent dealt heard told sold held').split(/\s+/));

// тема грамматического задания (по КЭС + форме ответа)
function grammarTopic(it, ans) {
  const kes = it.kes || '', a = (ans || '').toLowerCase().trim();
  if (kes.startsWith('2.4.31')) return 'Passive (страдательный залог)';
  if (kes.startsWith('2.4.39') || kes.startsWith('2.4.40')) return 'Степени сравнения';
  if (kes.startsWith('2.4.37')) return 'Мн. число существительных';
  if (kes.startsWith('2.4.50')) return 'Числительные';
  if (kes.startsWith('2.4.44') || kes.startsWith('2.4.45')) return 'Местоимения';
  if (kes.startsWith('2.4.34') || kes.startsWith('2.4.35')) return 'Модальные глаголы';
  if (kes.startsWith('2.4.27')) return 'Конструкция I wish';
  if (kes.startsWith('2.4.5')) return 'There is / there are';
  if (kes.startsWith('2.4.10') || kes.startsWith('2.4.11')) return 'Условные предложения';
  if (kes.startsWith('2.4.12')) return 'Согласование времён';
  // активные времена (2.4.30) — по форме ответа
  const w = a.split(/\s+/);
  const ing = /\w+ing$/.test(w[w.length - 1] || '');
  if (/\bhad\b/.test(a)) return 'Past Perfect';
  if (/\b(have|has|haven'?t|hasn'?t|'ve)\b/.test(a)) return 'Present Perfect';
  if (/\b(will|'ll|won'?t|shall)\b/.test(a)) return 'Future Simple';
  if (/\b(was|were)\b/.test(a) && ing) return 'Past Continuous';
  if (/\b(am|is|are)\b/.test(a) && ing) return 'Present Continuous';
  if (/\bwould\b/.test(a)) return 'Would / future-in-the-past';
  if (w.length === 1) {
    const v = w[0];
    if (/(ed)$/.test(v) || IRREG_PAST.has(v)) return 'Past Simple';
    return 'Present Simple';
  }
  return 'Другие формы глагола';
}

// тема словообразования (по части речи / суффиксу-приставке)
function wordformTopic(it, ans) {
  const a = (ans || '').toLowerCase().trim(), base = (it.base_word || '').toLowerCase();
  if (/^(un|im|in|ir|il|dis|non|mis)/.test(a) && a.replace(/^(un|im|in|ir|il|dis|non|mis)/, '') === base) return 'Отрицательные приставки';
  if (/(ly)$/.test(a)) return 'Наречия (-ly)';
  if (/(tion|sion|ment|ness|ity|ence|ance|ship|hood|ist|er|or|ician|ism)$/.test(a)) return 'Существительные';
  if (/(ful|less|ous|ive|al|able|ible|ant|ent|ic|y|ish|ed)$/.test(a)) return 'Прилагательные';
  if (/(ise|ize|ify|en)$/.test(a)) return 'Глаголы';
  return 'Другое словообразование';
}

export function topicOf(secId, it, ans) {
  return secId === 'grammar' ? grammarTopic(it, ans) : wordformTopic(it, ans);
}

// ---- общие хелперы ДЗ (ссылка/проверка/разбор) ----
const b64e = (s) => btoa(unescape(encodeURIComponent(s)));   // UTF-8 безопасный base64
const b64d = (s) => decodeURIComponent(escape(atob(s)));
const hwNorm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/^(a|an|the)\s+/, '');
// пропуск может быть из нескольких прогонов подчёркиваний подряд («____ ____») — считаем как один
const GAP_RE = /_{3,}(?:\s*_{3,})*/;
const READ_LABEL = { tf: 'Верно/неверно/не сказано', match: 'Соответствие', headings: 'Заголовки', gaps: 'Вставка частей', mc: 'Выбор ответа' };

// ---- Журнал класса (localStorage, на устройстве учителя) ----
const JOURNAL_KEY = 'ss_teacher_journal';
function loadJournal() { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || []; } catch (e) { return []; } }
function saveJournal(arr) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(arr)); } catch (e) {} }
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function addToJournal(entry) {
  const arr = loadJournal();
  if (arr.some((e) => e.id === entry.id)) return false; // дедуп по содержимому
  arr.push(entry); saveJournal(arr); return true;
}

// разбивка результата по темам (для агрегата журнала): {topic: {c, t}}
function unitsByTopic(units, answers, keys) {
  const by = {};
  const bump = (topic, c, tot) => { const b = by[topic] = by[topic] || { c: 0, t: 0 }; b.c += c; b.t += tot; };
  for (const u of units) {
    if (u.kind === 'read') {
      const r = checkReadBlock(u.block, answers);
      bump('Чтение: ' + (READ_LABEL[u.block.type] || u.block.type), r.correct, r.total);
    } else {
      const it = u.it;
      const key = (keys[it.zid] || {}).answer || '';
      const ok = hwNorm(answers[it.zid] || '') === hwNorm(key) && (answers[it.zid] || '').trim() !== '';
      bump(topicOf(u.secId, it, key), ok ? 1 : 0, 1);
    }
  }
  return by;
}

function parseSet(query) {
  const groups = {};
  for (const part of (query || '').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const sec = part.slice(0, i), csv = part.slice(i + 1);
    if (sec && csv) groups[sec] = csv.split(',').filter(Boolean);
  }
  return groups;
}

async function gatherTasks(groups) {
  const keys = await loadJSON(EXAM.keysFile);
  const units = []; // {kind:'gap', secId, it} | {kind:'read', block}
  let readBlocks = null;
  for (const secId of Object.keys(groups)) {
    if (secId === 'reading') {
      readBlocks = readBlocks || await loadReadingBlocks();
      const byId = {};
      for (const b of readBlocks) byId[b.id] = b;
      for (const id of groups[secId]) { const b = byId[id]; if (b) units.push({ kind: 'read', block: b }); }
      continue;
    }
    const cfg = EXAM.sections.find((s) => s.id === secId);
    if (!cfg) continue;
    let bank;
    try { bank = await loadJSON(cfg.dataFile); } catch (e) { continue; }
    const byZid = {};
    for (const it of bank) byZid[it.zid] = it;
    for (const zid of groups[secId]) { const it = byZid[zid]; if (it) units.push({ kind: 'gap', secId, it }); }
  }
  return { units, keys };
}

// разбор + счёт по units (gap + read), общий для ученика и учителя
function reviewRows(units, answers, keys, H) {
  let correct = 0, total = 0;
  const rows = units.map((u, i) => {
    if (u.kind === 'read') {
      const r = checkReadBlock(u.block, answers);
      correct += r.correct; total += r.total;
      return el('div', { class: 'hw-rev ' + (r.correct === r.total ? 'ok' : 'no') }, [
        el('div', { class: 'hw-rev-t', text: (i + 1) + '. ' + H.readScore(r.correct, r.total) }),
        renderReadBlock(u.block, answers, H, true),
      ]);
    }
    const it = u.it;
    const key = (keys[it.zid] || {}).answer || '';
    const mine = answers[it.zid] || '';
    const ok = hwNorm(mine) === hwNorm(key) && mine.trim() !== '';
    if (ok) correct += 1; total += 1;
    const bw = it.base_word || '';
    const clean = bw ? stripTrailingBase(it.text || '', bw) : (it.text || '');
    const prev = clean.replace(GAP_RE, ' ___ ' + (bw ? '(' + bw + ') ' : ''));
    return el('div', { class: 'hw-rev ' + (ok ? 'ok' : 'no') }, [
      el('div', { class: 'hw-rev-t', text: (i + 1) + '. ' + prev }),
      el('div', { class: 'hw-rev-a' }, [
        el('span', { class: 'hw-rev-mark', text: ok ? '✓' : '✗' }),
        el('span', { text: ok ? H.yourCorrect(key) : H.yourWrong(mine || '—', key) }),
      ]),
    ]);
  });
  return { correct, total, rows };
}

// модалка со ссылкой (копирование + подтверждение), общая
function copyLinkSheet(o) {
  const inp = el('input', { class: 'tch-link-in', type: 'text', value: o.url, readonly: true });
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } }, [
    el('div', { class: 'modal tch-link-modal' }, [
      el('div', { class: 'tch-link-h', text: o.title }),
      o.sub ? el('div', { class: 'tch-link-sub', text: o.sub }) : null,
      inp,
      el('div', { class: 'tch-link-btns' }, [
        el('button', { class: 'btn', text: o.copyLabel, onclick: () => { inp.select(); if (navigator.clipboard) navigator.clipboard.writeText(o.url); } }),
        el('button', { class: 'btn btn-primary', text: o.closeLabel, onclick: () => back.remove() }),
      ]),
    ].filter(Boolean)),
  ]);
  document.body.appendChild(back);
  if (navigator.clipboard) navigator.clipboard.writeText(o.url).catch(() => {});
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}

// ---- Чтение: нормализация блоков + рендер/проверка (по образцу mock.js) ----
const RLET = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const TF_LBL = ['Верно', 'Неверно', 'Не сказано'];

function firstText(texts) {
  if (!texts) return '';
  const k = Object.keys(texts)[0];
  return (texts[k] || '').replace(/\s+/g, ' ').slice(0, 90);
}

// все блоки чтения текущего экзамена в едином виде: {id, kind, type, data, n, preview}
async function loadReadingBlocks() {
  const cfg = EXAM.sections.find((s) => s.type === 'reading');
  if (!cfg) return [];
  let r;
  try { r = await loadJSON(cfg.dataFile); } catch (e) { return []; }
  const out = [];
  (r.tf || []).forEach((x) => out.push({ id: 'tf_' + x.group, kind: 'tfns', type: 'tf', data: x, n: x.statements.length, preview: (x.text || '').replace(/\s+/g, ' ').slice(0, 90) }));
  (r.matching || []).forEach((x) => out.push({ id: 'mt_' + x.zid, kind: 'rmatch', type: 'match', data: x, n: (x.answer || '').length, preview: firstText(x.texts) }));
  (r.headings || []).forEach((x) => out.push({ id: 'hd_' + x.zid, kind: 'rmatch', type: 'headings', data: x, n: (x.answer || '').length, preview: firstText(x.texts) }));
  (r.gaps || []).forEach((x) => out.push({ id: 'gp_' + x.zid, kind: 'gaps', type: 'gaps', data: x, n: (x.answer || '').length, preview: (x.passage || '').replace(/\s+/g, ' ').slice(0, 90) }));
  (r.mc || []).forEach((x) => out.push({ id: 'mc_' + x.group, kind: 'choicegroup', type: 'mc', data: x, n: x.questions.length, preview: (x.text || '').replace(/\s+/g, ' ').slice(0, 90) }));
  return out;
}

// рендер блока чтения для решения (answers[block.id] = {}), readonly — для разбора
function renderReadBlock(block, answers, H, readonly) {
  const d = block.data;
  const a = (answers[block.id] = answers[block.id] || {});
  const wrap = el('div', { class: 'hw-rblock' });
  if (block.kind === 'tfns') {
    wrap.appendChild(el('div', { class: 'hw-rtext', text: d.text || '' }));
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.rTf }));
    (d.statements || []).forEach((st) => {
      const btns = ['1', '2', '3'].map((v, vi) => {
        const b = el('button', { class: 'tf-btn' + (a[st.num] === v ? ' sel' : ''), text: TF_LBL[vi] });
        if (!readonly) b.addEventListener('click', () => { a[st.num] = v; b.parentNode.querySelectorAll('.tf-btn').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); });
        else if (a[st.num] !== v) b.disabled = true;
        return b;
      });
      wrap.appendChild(el('div', { class: 'hw-tf' }, [el('div', { class: 'hw-tf-s', text: st.num + '. ' + st.statement }), el('div', { class: 'hw-tf-btns' }, btns)]));
    });
  } else if (block.kind === 'rmatch') {
    const qs = d.questions || d.headings || [];
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.rMatch }));
    wrap.appendChild(el('ol', { class: 'hw-rqs' }, qs.map((q) => el('li', { text: q }))));
    RLET.filter((L) => d.texts && d.texts[L] != null).forEach((L) => {
      const sel = el('select', { class: 'hw-sel' });
      sel.appendChild(el('option', { value: '', text: '—' }));
      qs.forEach((_, qi) => sel.appendChild(el('option', { value: String(qi + 1), text: String(qi + 1) })));
      if (a[L]) sel.value = a[L];
      if (readonly) sel.disabled = true; else sel.addEventListener('change', () => { a[L] = sel.value; });
      wrap.appendChild(el('div', { class: 'hw-rtxt' }, [el('div', { class: 'hw-rtxt-h' }, [el('b', { text: L }), sel]), el('div', { text: d.texts[L] })]));
    });
  } else if (block.kind === 'gaps') {
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.rGaps }));
    wrap.appendChild(el('ol', { class: 'hw-rqs' }, (d.parts || []).map((p) => el('li', { text: p }))));
    const para = el('div', { class: 'hw-rtext' });
    (d.passage || '').split(/\{([A-G])\}/).forEach((ch, idx) => {
      if (idx % 2 === 0) { if (ch) para.appendChild(document.createTextNode(ch)); return; }
      const L = ch;
      const sel = el('select', { class: 'hw-sel hw-sel-in' });
      sel.appendChild(el('option', { value: '', text: L }));
      (d.parts || []).forEach((_, pi) => sel.appendChild(el('option', { value: String(pi + 1), text: String(pi + 1) })));
      if (a[L]) sel.value = a[L];
      if (readonly) sel.disabled = true; else sel.addEventListener('change', () => { a[L] = sel.value; });
      para.appendChild(sel);
    });
    wrap.appendChild(para);
  } else if (block.kind === 'choicegroup') {
    wrap.appendChild(el('div', { class: 'hw-rtext', text: d.text || '' }));
    (d.questions || []).forEach((q, qi) => {
      const opts = (q.options || []).map((o, oi) => {
        const id = 'r_' + block.id + '_' + qi + '_' + oi;
        const inp = el('input', { type: 'radio', name: 'r_' + block.id + '_' + qi, id, value: String(oi + 1) });
        if (a[qi] === String(oi + 1)) inp.checked = true;
        if (readonly) inp.disabled = true; else inp.addEventListener('change', () => { a[qi] = String(oi + 1); });
        return el('label', { class: 'mock-opt', for: id }, [inp, el('span', { text: o })]);
      });
      wrap.appendChild(el('div', { class: 'hw-mcq' }, [el('div', { class: 'hw-mcq-q', text: (qi + 1) + '. ' + (q.question || q.q || '') }), el('div', { class: 'mock-opts' }, opts)]));
    });
  }
  return wrap;
}

// проверка блока чтения: {correct, total}
function checkReadBlock(block, answers) {
  const d = block.data;
  const a = answers[block.id] || {};
  let correct = 0, total = 0;
  if (block.kind === 'tfns') {
    (d.statements || []).forEach((st) => { total++; if ((a[st.num] || '') === st.answer) correct++; });
  } else if (block.kind === 'rmatch') {
    RLET.filter((L) => d.texts && d.texts[L] != null).forEach((L, idx) => { total++; if ((a[L] || '') === String((d.answer || '')[idx])) correct++; });
  } else if (block.kind === 'gaps') {
    (d.gaps || RLET).forEach((L, idx) => { total++; if ((a[L] || '') === String((d.answer || '')[idx])) correct++; });
  } else if (block.kind === 'choicegroup') {
    (d.questions || []).forEach((q, qi) => { total++; if ((a[qi] || '') === String(q.answer != null ? q.answer : q.key)) correct++; });
  }
  return { correct, total };
}

export async function renderTeacher(container, opts) {
  const T = t.teacher;
  mount(container, el('div', { class: 'view' }, [el('div', { class: 'loader', text: T.loading })]));

  const drillSecs = EXAM.sections.filter((s) => s.type === 'drill');
  const keys = await loadJSON(EXAM.keysFile);
  let topics = {};
  try { topics = await loadJSON(EXAM.topicsFile); } catch (e) { topics = {}; }
  // банки по разделам: { secId: [items] }
  const banks = {};
  for (const s of drillSecs) banks[s.id] = await loadJSON(s.dataFile);
  // блоки чтения (тексты + задания) — отдельная вкладка
  const readBlocks = await loadReadingBlocks();
  const hasReading = readBlocks.length > 0;
  const READTYPE = READ_LABEL;

  // выбранные задания: Set("secId:zid")
  const picked = new Set();
  let curSec = drillSecs[0].id;
  let curTopic = ''; // '' = все темы
  let search = '';
  const topicCache = {}; // zid -> тема (мемо)
  const itemTopic = (secId, it) => topicCache[it.zid] || (topicCache[it.zid] = topicOf(secId, it, (keys[it.zid] || {}).answer));

  const view = el('div', { class: 'view tch' });
  mount(container, view);

  function secItems(secId) {
    return (banks[secId] || []).filter((it) => keys[it.zid]); // только с ключом
  }
  // тематические группы раздела (по форме ответа) с количеством, отсортированы по убыванию
  function topicGroups(secId) {
    const cnt = new Map();
    for (const it of secItems(secId)) { const tp = itemTopic(secId, it); cnt.set(tp, (cnt.get(tp) || 0) + 1); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));
  }

  function filtered() {
    let arr = secItems(curSec);
    if (curTopic) arr = arr.filter((it) => itemTopic(curSec, it) === curTopic);
    if (search) { const q = search.toLowerCase(); arr = arr.filter((it) => (it.text || '').toLowerCase().includes(q) || (it.base_word || '').toLowerCase().includes(q)); }
    return arr;
  }

  function draw() {
    view.replaceChildren();
    // шапка
    view.appendChild(el('div', { class: 'tch-top' }, [
      el('button', { class: 'back', text: '←', onclick: opts.goHome }),
      el('div', { class: 'tch-h' }, [el('div', { class: 'tch-t', text: T.title }), el('div', { class: 'tch-sub', text: T.sub })]),
      el('button', { class: 'btn tch-journal-btn', text: '📊 ' + T.journal, onclick: () => renderJournal(container, opts) }),
    ]));

    // вкладки разделов (+ «Чтение»)
    const tabs = drillSecs.map((s) => ({ id: s.id, label: SEC_TITLE[s.id] || s.id }));
    if (hasReading) tabs.push({ id: 'reading', label: 'Чтение' });
    view.appendChild(el('div', { class: 'tch-tabs' }, tabs.map((tb) =>
      el('button', { class: 'tch-tab' + (tb.id === curSec ? ' on' : ''), text: tb.label,
        onclick: () => { curSec = tb.id; curTopic = ''; draw(); } }))));

    // фильтр: для дрилла — по теме; для чтения — по типу задания
    const sel = el('select', { class: 'tch-kes' });
    sel.appendChild(el('option', { value: '', text: curSec === 'reading' ? 'Все типы' : T.allTopics }));
    const groups = curSec === 'reading' ? readingTypeGroups() : topicGroups(curSec);
    for (const g of groups) sel.appendChild(el('option', { value: g.value != null ? g.value : g.label, text: (g.label) + ' (' + g.n + ')' }));
    sel.value = curTopic;
    sel.addEventListener('change', () => { curTopic = sel.value; draw(); });
    const srch = el('input', { class: 'tch-search', type: 'search', placeholder: T.searchPh, value: search });
    srch.addEventListener('input', () => { search = srch.value; redrawList(); });
    view.appendChild(el('div', { class: 'tch-filters' }, [sel, srch]));

    const listWrap = el('div', { class: 'tch-list' });
    view.appendChild(listWrap);
    drawList(listWrap);

    // нижняя панель действий (корзина)
    view.appendChild(actionBar());
    function redrawList() { drawList(listWrap); refreshBar(); }
  }

  // типы заданий чтения с количеством (для фильтра вкладки «Чтение»)
  function readingTypeGroups() {
    const cnt = new Map();
    for (const b of readBlocks) cnt.set(b.type, (cnt.get(b.type) || 0) + 1);
    return [...cnt.entries()].map(([type, n]) => ({ value: type, label: READTYPE[type] || type, n }));
  }
  // унифицированные строки текущей вкладки: {pid, preview, meta}
  function currentRows() {
    if (curSec === 'reading') {
      let arr = readBlocks;
      if (curTopic) arr = arr.filter((b) => b.type === curTopic);
      if (search) { const q = search.toLowerCase(); arr = arr.filter((b) => b.preview.toLowerCase().includes(q)); }
      return arr.map((b) => ({ pid: 'reading:' + b.id, preview: b.preview, meta: (READTYPE[b.type] || b.type) + ' · ' + b.n + ' вопр.' }));
    }
    return filtered().map((it) => ({ pid: curSec + ':' + it.zid, preview: (it.text || '').replace(/_{3,}/, ' ___ '), meta: (it.base_word ? '[' + it.base_word + '] · ' : '') + itemTopic(curSec, it) }));
  }

  function drawList(wrap) {
    wrap.replaceChildren();
    const rows = currentRows();
    if (!rows.length) { wrap.appendChild(el('div', { class: 'tch-empty', text: T.nothing })); return; }
    const allOn = rows.every((r) => picked.has(r.pid));
    const add = (list) => { for (const r of list) picked.add(r.pid); drawList(wrap); refreshBar(); };
    const rest = () => rows.filter((r) => !picked.has(r.pid));
    const N = 10;
    wrap.appendChild(el('div', { class: 'tch-lhead' }, [
      el('div', { class: 'tch-count', text: T.found(rows.length) }),
      el('div', { class: 'tch-quick' }, [
        el('button', { class: 'tch-selall', text: allOn ? T.deselectAll : T.selectAll, onclick: () => {
          for (const r of rows) { if (allOn) picked.delete(r.pid); else picked.add(r.pid); }
          drawList(wrap); refreshBar();
        } }),
        el('button', { class: 'tch-selall', text: T.addN(N), onclick: () => add(rest().slice(0, N)) }),
        el('button', { class: 'tch-selall', text: T.randomN(N), onclick: () => add(rest().sort(() => Math.random() - 0.5).slice(0, N)) }),
      ]),
    ]));
    for (const r of rows) {
      const on = picked.has(r.pid);
      const row = el('label', { class: 'tch-row' + (on ? ' on' : '') }, [
        el('input', { type: 'checkbox', class: 'tch-cb' }),
        el('div', { class: 'tch-row-b' }, [
          el('div', { class: 'tch-row-t', text: r.preview }),
          el('div', { class: 'tch-row-m', text: r.meta }),
        ]),
      ]);
      const cb = row.querySelector('.tch-cb');
      cb.checked = on;
      cb.addEventListener('change', () => {
        if (cb.checked) picked.add(r.pid); else picked.delete(r.pid);
        row.classList.toggle('on', cb.checked);
        refreshBar();
      });
      wrap.appendChild(row);
    }
  }

  let barCount;
  function actionBar() {
    barCount = el('div', { class: 'tch-bar-n' });
    const bar = el('div', { class: 'tch-bar' }, [
      barCount,
      el('div', { class: 'tch-bar-btns' }, [
        el('button', { class: 'btn tch-clear', text: T.clear, onclick: () => { picked.clear(); draw(); } }),
        el('button', { class: 'btn', text: '🔗 ' + T.linkBtn, onclick: copyLink }),
        el('button', { class: 'btn', text: '🗝 ' + T.printKeys, onclick: () => openPrint(true) }),
        el('button', { class: 'btn btn-primary', text: '🖨 ' + T.printWs, onclick: () => openPrint(false) }),
      ]),
    ]);
    refreshBar();
    return bar;
  }
  function refreshBar() { if (barCount) barCount.textContent = T.picked(picked.size); }

  // собрать выбранные задания в секции формата print.js
  function buildSections() {
    const out = [];
    for (const s of drillSecs) {
      const items = [];
      for (const it of secItems(s.id)) {
        if (!picked.has(s.id + ':' + it.zid)) continue;
        // base_word передаём — print покажет его у пропуска [BASE] и уберёт дубль с конца
        items.push({ kind: 'gap', sub: s.id, zid: it.zid, kes: it.kes,
          text: it.text, base_word: it.base_word, key: (keys[it.zid] || {}).answer });
      }
      if (items.length) out.push({ id: 'grammar', title: SEC_TITLE[s.id] || s.id, items });
    }
    return out;
  }

  function openPrint(withKeys) {
    if (!picked.size) return;
    const sections = buildSections();
    if (!sections.length) { alert(T.printNoReading); return; } // чтение печатается пока только через ДЗ
    renderPrintView(container, {
      title: T.wsTitle, sub: T.wsSub(EXAM.badge), exam: EXAM.id, sections,
      worksheet: true, withKeys,
      onBack: () => renderTeacher(container, opts),
    });
  }

  // кодируем выбранное в компактную строку: "secId:zid,zid;secId:zid"
  function encodeSet() {
    const parts = [];
    for (const s of drillSecs) {
      const zids = secItems(s.id).filter((it) => picked.has(s.id + ':' + it.zid)).map((it) => it.zid);
      if (zids.length) parts.push(s.id + ':' + zids.join(','));
    }
    const rids = readBlocks.filter((b) => picked.has('reading:' + b.id)).map((b) => b.id);
    if (rids.length) parts.push('reading:' + rids.join(','));
    return parts.join(';');
  }

  function copyLink() {
    if (!picked.size) return;
    const url = location.origin + location.pathname + '#/hw?' + encodeSet();
    copyLinkSheet({ url, title: T.linkTitle, sub: T.linkSub(picked.size), copyLabel: T.linkCopyAgain, closeLabel: T.linkClose });
  }

  draw();
}

// ===== Поток ученика: решение ДЗ по ссылке (#/hw?secId:zid,zid;…) =====
export async function renderHomework(container, opts) {
  const H = t.homework;
  mount(container, el('div', { class: 'view' }, [el('div', { class: 'loader', text: H.loading })]));

  const groups = parseSet(opts.query);
  const { units, keys } = await gatherTasks(groups);

  if (!units.length) {
    mount(container, el('div', { class: 'view hw' }, [
      el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.title })]),
      el('div', { class: 'tch-empty', text: H.broken }),
    ]));
    return;
  }

  const answers = {}; // zid -> ввод
  const view = el('div', { class: 'view hw' });
  mount(container, view);

  function drawTasks() {
    view.replaceChildren();
    view.appendChild(el('div', { class: 'hw-top' }, [
      el('button', { class: 'back', text: '←', onclick: opts.goHome }),
      el('div', { class: 'hw-h' }, [el('div', { class: 'hw-t', text: H.title }), el('div', { class: 'hw-sub', text: H.count(units.length) })]),
    ]));
    const list = el('div', { class: 'hw-list' });
    units.forEach((u, i) => {
      if (u.kind === 'read') {
        list.appendChild(el('div', { class: 'hw-q hw-q-read' }, [
          el('span', { class: 'hw-n', text: (i + 1) + '.' }),
          renderReadBlock(u.block, answers, H, false),
        ]));
        return;
      }
      const it = u.it;
      const bw = it.base_word || '';
      const clean = bw ? stripTrailingBase(it.text || '', bw) : (it.text || '');
      const m = clean.match(GAP_RE);
      const before = m ? clean.slice(0, m.index) : clean;
      const after = m ? clean.slice(m.index + m[0].length) : '';
      const inp = el('input', { class: 'hw-input', type: 'text', value: answers[it.zid] || '', placeholder: H.answerPh });
      inp.addEventListener('input', () => { answers[it.zid] = inp.value; });
      const cue = bw ? el('b', { class: 'hw-base', text: ' (' + bw + ') ' }) : document.createTextNode('');
      list.appendChild(el('div', { class: 'hw-q' }, [
        el('span', { class: 'hw-n', text: (i + 1) + '.' }),
        el('span', { class: 'hw-text' }, [document.createTextNode(before), inp, cue, document.createTextNode(after)]),
      ]));
    });
    view.appendChild(list);
    view.appendChild(el('div', { class: 'hw-bar' }, [
      el('button', { class: 'btn btn-primary btn-block', text: '📤 ' + H.submit, onclick: submitToTeacher }),
    ]));
  }

  // Сдать: фиксируем ответы → даём ссылку учителю → ПОТОМ показываем разбор (переделать нельзя)
  function submitToTeacher() {
    if (!confirm(H.confirmSubmit)) return;
    let name = getName();
    if (!name) name = (prompt(H.askName) || '').trim();
    const payload = { n: name || H.anon, set: groups, a: { ...answers }, ts: Date.now() }; // снимок ответов
    const url = location.origin + location.pathname + '#/hwr?' + b64e(JSON.stringify(payload));
    showReview();
    copyLinkSheet({ url, title: H.sendTitle, sub: H.sendSub, copyLabel: H.copy, closeLabel: H.close });
  }

  // разбор после сдачи — без «переделать»; повторно отправить улучшенный результат нельзя
  function showReview() {
    const { correct, total, rows } = reviewRows(units, answers, keys, H);
    const pc = Math.round(correct / total * 100);
    view.replaceChildren(
      el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.resultTitle })]),
      el('div', { class: 'hw-note', text: H.sentNote }),
      el('div', { class: 'hw-score' }, [
        el('div', { class: 'hw-score-v', text: correct + ' / ' + total }),
        el('div', { class: 'hw-score-p', text: pc + '%' }),
      ]),
      el('div', { class: 'hw-list' }, rows),
      el('div', { class: 'hw-bar' }, [el('button', { class: 'btn btn-primary btn-block', text: H.done, onclick: opts.goHome })]),
    );
    view.scrollTop = 0;
  }

  drawTasks();
}

// ===== Учитель видит результат ученика по ссылке (#/hwr?<base64>) =====
export async function renderHomeworkResult(container, opts) {
  const H = t.homework;
  mount(container, el('div', { class: 'view' }, [el('div', { class: 'loader', text: H.loading })]));
  let payload = null;
  try { payload = JSON.parse(b64d(opts.query)); } catch (e) { payload = null; }
  const fail = () => mount(container, el('div', { class: 'view hw' }, [
    el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.resultTitle })]),
    el('div', { class: 'tch-empty', text: H.broken }),
  ]));
  if (!payload || !payload.set) return fail();

  const { units, keys } = await gatherTasks(payload.set);
  if (!units.length) return fail();
  const answers = payload.a || {};
  const name = payload.n || H.anon;
  const { correct, total, rows } = reviewRows(units, answers, keys, H);
  const pc = Math.round(correct / total * 100);

  // сохраняем в журнал учителя (дедуп по содержимому)
  const sumLabels = Object.keys(payload.set).map((s) => s === 'reading' ? 'чтение' : (SEC_TITLE[s] || s).toLowerCase());
  const entry = {
    id: hashStr(name + '|' + JSON.stringify(payload.set) + '|' + JSON.stringify(answers)),
    exam: EXAM.id, name, ts: payload.ts || Date.now(), correct, total,
    byTopic: unitsByTopic(units, answers, keys), summary: sumLabels.join(', '),
  };
  const saved = addToJournal(entry);

  mount(container, el('div', { class: 'view hw' }, [
    el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.studentResult(name) })]),
    el('div', { class: 'hw-note', text: saved ? H.savedJournal : H.alreadyJournal }),
    el('div', { class: 'hw-score' }, [
      el('div', { class: 'hw-score-v', text: correct + ' / ' + total }),
      el('div', { class: 'hw-score-p', text: pc + '%' }),
    ]),
    el('div', { class: 'hw-list' }, rows),
    el('div', { class: 'hw-bar' }, [
      el('button', { class: 'btn', text: '📊 ' + t.teacher.journal, onclick: () => renderJournal(container, opts) }),
      el('button', { class: 'btn btn-primary', text: H.done, onclick: opts.goHome }),
    ]),
  ]));
}

// ===== Журнал класса (агрегат сохранённых результатов) =====
export function renderJournal(container, opts) {
  const T = t.teacher;
  const all = loadJournal().filter((e) => e.exam === EXAM.id).sort((a, b) => b.ts - a.ts);
  const view = el('div', { class: 'view tch' });

  const top = el('div', { class: 'tch-top' }, [
    el('button', { class: 'back', text: '←', onclick: () => renderTeacher(container, opts) }),
    el('div', { class: 'tch-h' }, [el('div', { class: 'tch-t', text: T.journalTitle }), el('div', { class: 'tch-sub', text: T.journalSub })]),
  ]);

  if (!all.length) { mount(container, el('div', { class: 'view tch' }, [top, el('div', { class: 'tch-empty', text: T.journalEmpty })])); return; }

  // агрегат
  const students = new Set(all.map((e) => e.name)).size;
  const avg = Math.round(all.reduce((s, e) => s + (e.total ? e.correct / e.total : 0), 0) / all.length * 100);
  const byTopic = {};
  for (const e of all) for (const tp in (e.byTopic || {})) { const b = byTopic[tp] = byTopic[tp] || { c: 0, t: 0 }; b.c += e.byTopic[tp].c; b.t += e.byTopic[tp].t; }
  const hard = Object.entries(byTopic).map(([tp, b]) => ({ tp, pc: Math.round(b.c / b.t * 100), c: b.c, t: b.t }))
    .filter((x) => x.t >= 1).sort((a, b) => a.pc - b.pc).slice(0, 8);

  const stat = (v, l) => el('div', { class: 'mini-stat' }, [el('div', { class: 'ms-v', text: String(v) }), el('div', { class: 'ms-l', text: l })]);
  const fmtDate = (ts) => { try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  mount(container, el('div', { class: 'view tch jr' }, [
    top,
    el('div', { class: 'mini-stats' }, [stat(all.length, T.jrSubmissions), stat(students, T.jrStudents), stat(avg + '%', T.jrAvg)]),
    el('div', { class: 'jr-sect', text: T.jrHard }),
    el('div', { class: 'jr-topics' }, hard.map((x) => el('div', { class: 'jr-topic' }, [
      el('div', { class: 'jr-topic-n', text: x.tp }),
      el('div', { class: 'jr-topic-bar' }, [el('i', { style: { width: x.pc + '%', background: x.pc < 50 ? '#d64545' : (x.pc < 75 ? '#E0922F' : '#2f9e44') } })]),
      el('div', { class: 'jr-topic-v', text: x.pc + '% (' + x.c + '/' + x.t + ')' }),
    ]))),
    el('div', { class: 'jr-sect', text: T.jrSubs }),
    el('div', { class: 'jr-list' }, all.map((e) => el('div', { class: 'jr-row' }, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { class: 'jr-name', text: e.name }),
        el('div', { class: 'jr-meta', text: fmtDate(e.ts) + ' · ' + (e.summary || '') }),
      ]),
      el('div', { class: 'jr-score', style: { color: e.correct / e.total < 0.5 ? '#d64545' : (e.correct / e.total < 0.75 ? '#E0922F' : '#2f9e44') }, text: e.correct + '/' + e.total }),
    ]))),
    el('div', { class: 'prog-actions' }, [
      el('button', { class: 'act-reset', text: T.jrClear, onclick: () => { if (confirm(T.jrClearConfirm)) { saveJournal(loadJournal().filter((e) => e.exam !== EXAM.id)); renderJournal(container, opts); } } }),
    ]),
  ]));
}
