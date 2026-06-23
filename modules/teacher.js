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
  let curKes = ''; // '' = все
  let search = '';

  const view = el('div', { class: 'view tch' });
  mount(container, view);

  function secItems(secId) {
    return (banks[secId] || []).filter((it) => keys[it.zid]); // только с ключом
  }
  // КЭС-группы для раздела (из topics по topicKey), иначе — собираем из самих заданий
  function kesGroups(secId) {
    const sec = drillSecs.find((s) => s.id === secId);
    const fromTopics = (topics[sec.topicKey] || []).map((g) => ({ kes: g.kes, label: g.label }));
    if (fromTopics.length) return fromTopics;
    const seen = new Map();
    for (const it of secItems(secId)) if (!seen.has(it.kes)) seen.set(it.kes, { kes: it.kes, label: it.kes });
    return [...seen.values()];
  }

  function filtered() {
    let arr = secItems(curSec);
    if (curKes) arr = arr.filter((it) => it.kes === curKes);
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
        onclick: () => { curSec = s.id; curKes = ''; draw(); } }))));

    // фильтр по КЭС
    const sel = el('select', { class: 'tch-kes' });
    sel.appendChild(el('option', { value: '', text: T.allKes }));
    for (const g of kesGroups(curSec)) sel.appendChild(el('option', { value: g.kes, text: g.kes + ' · ' + g.label }));
    sel.value = curKes;
    sel.addEventListener('change', () => { curKes = sel.value; draw(); });
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
    wrap.appendChild(el('div', { class: 'tch-count', text: T.found(arr.length) }));
    for (const it of arr) {
      const id = curSec + ':' + it.zid;
      const on = picked.has(id);
      const prev = (it.text || '').replace(/_{3,}/, ' ___ ');
      const row = el('label', { class: 'tch-row' + (on ? ' on' : '') }, [
        el('input', { type: 'checkbox', class: 'tch-cb' }),
        el('div', { class: 'tch-row-b' }, [
          el('div', { class: 'tch-row-t', text: prev }),
          el('div', { class: 'tch-row-m', text: (it.base_word ? '[' + it.base_word + '] · ' : '') + it.kes }),
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
