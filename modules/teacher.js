// teacher.js — учительский конструктор worksheets/ДЗ (Feature B).
// Собирает «набор заданий» из дрилл-банков (грамматика/словообр./лексика) по КЭС,
// печатает worksheet ученику + страницу с ключами (через print.js).
// Без бэкенда: данные из app/data, выбор — в памяти. Вход — дискретный (#/teacher).

import { el, mount } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { EXAM, t } from '../js/exam.js';
import { renderPrintView } from './print.js';

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

function topicOf(secId, it, ans) {
  return secId === 'grammar' ? grammarTopic(it, ans) : wordformTopic(it, ans);
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
    ]));

    // вкладки разделов
    view.appendChild(el('div', { class: 'tch-tabs' }, drillSecs.map((s) =>
      el('button', { class: 'tch-tab' + (s.id === curSec ? ' on' : ''), text: SEC_TITLE[s.id] || s.id,
        onclick: () => { curSec = s.id; curTopic = ''; draw(); } }))));

    // фильтр по ТЕМЕ (Present Perfect, Passive, …) с количеством
    const sel = el('select', { class: 'tch-kes' });
    sel.appendChild(el('option', { value: '', text: T.allTopics }));
    for (const g of topicGroups(curSec)) sel.appendChild(el('option', { value: g.label, text: g.label + ' (' + g.n + ')' }));
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

  function drawList(wrap) {
    wrap.replaceChildren();
    const arr = filtered();
    if (!arr.length) { wrap.appendChild(el('div', { class: 'tch-empty', text: T.nothing })); return; }
    // шапка списка: количество + «выбрать все/снять все» для текущего фильтра
    const allOn = arr.every((it) => picked.has(curSec + ':' + it.zid));
    wrap.appendChild(el('div', { class: 'tch-lhead' }, [
      el('div', { class: 'tch-count', text: T.found(arr.length) }),
      el('button', { class: 'tch-selall', text: allOn ? T.deselectAll : T.selectAll, onclick: () => {
        for (const it of arr) { const id = curSec + ':' + it.zid; if (allOn) picked.delete(id); else picked.add(id); }
        drawList(wrap); refreshBar();
      } }),
    ]));
    for (const it of arr) {
      const id = curSec + ':' + it.zid;
      const on = picked.has(id);
      const prev = (it.text || '').replace(/_{3,}/, ' ___ ');
      const row = el('label', { class: 'tch-row' + (on ? ' on' : '') }, [
        el('input', { type: 'checkbox', class: 'tch-cb' }),
        el('div', { class: 'tch-row-b' }, [
          el('div', { class: 'tch-row-t', text: prev }),
          el('div', { class: 'tch-row-m', text: (it.base_word ? '[' + it.base_word + '] · ' : '') + itemTopic(curSec, it) }),
        ]),
      ]);
      const cb = row.querySelector('.tch-cb');
      cb.checked = on;
      cb.addEventListener('change', () => {
        if (cb.checked) picked.add(id); else picked.delete(id);
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
        // base_word уже есть в конце text (формат ФИПИ) — не дублируем в скобках
        items.push({ kind: 'gap', sub: s.id, zid: it.zid, kes: it.kes,
          text: it.text, key: (keys[it.zid] || {}).answer });
      }
      if (items.length) out.push({ id: 'grammar', title: SEC_TITLE[s.id] || s.id, items });
    }
    return out;
  }

  function openPrint(withKeys) {
    if (!picked.size) return;
    const sections = buildSections();
    renderPrintView(container, {
      title: T.wsTitle, sub: T.wsSub(EXAM.badge), exam: EXAM.id, sections,
      worksheet: true, withKeys,
      onBack: () => renderTeacher(container, opts),
    });
  }

  draw();
}
