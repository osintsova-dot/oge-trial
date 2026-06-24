// teacher.js — учительский конструктор worksheets/ДЗ (Feature B).
// Собирает «набор заданий» из дрилл-банков (грамматика/словообр./лексика) по КЭС,
// печатает worksheet ученику + страницу с ключами (через print.js).
// Без бэкенда: данные из app/data, выбор — в памяти. Вход — дискретный (#/teacher).

import { el, mount } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { EXAM, t } from '../js/exam.js';
import { getName } from '../js/gamify.js';
import { evalWriting } from '../js/writeeval.js';
import { renderPrintView, stripTrailingBase } from './print.js';
import { canRecognizePhoto, recognizePhoto, recognizeBlank, parseAnswerGrid } from '../js/ocr.js';
import { checkAnswer } from '../js/checker.js';

// Блок «📷 Фото письма» для ДЗ: распознаёт фото, дописывает в поле, требует сверки.
function ocrPhotoBlock(ta, onText, errBox) {
  if (!canRecognizePhoto()) return null;
  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  const pbtn = el('button', { class: 'btn btn-ghost w-photo', text: t.wPhoto });
  const note = el('div', { class: 'w-photo-note', style: { display: 'none' }, text: t.wPhotoNote });
  pbtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (errBox) errBox.style.display = 'none';
    note.style.display = 'none';
    pbtn.disabled = true; pbtn.textContent = t.wPhotoLoading;
    try {
      const text = await recognizePhoto(file);
      ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + text;
      onText();
      note.style.display = 'block';
      ta.focus();
    } catch (e) {
      if (errBox) { errBox.textContent = t.wPhotoErr(e.message); errBox.style.display = 'block'; }
    } finally {
      pbtn.disabled = false; pbtn.textContent = t.wPhoto;
    }
  });
  return el('div', { class: 'w-photo-row' }, [pbtn, input, note]);
}

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

// англ. названия тем для ЕГЭ (UI английский — темы тоже должны быть на английском)
const TOPIC_EN = {
  'Passive (страдательный залог)': 'Passive voice', 'Степени сравнения': 'Comparatives & superlatives',
  'Мн. число существительных': 'Plural nouns', 'Числительные': 'Numerals', 'Местоимения': 'Pronouns',
  'Модальные глаголы': 'Modal verbs', 'Конструкция I wish': 'I wish', 'There is / there are': 'There is / there are',
  'Условные предложения': 'Conditionals', 'Согласование времён': 'Sequence of tenses',
  'Past Perfect': 'Past Perfect', 'Present Perfect': 'Present Perfect', 'Future Simple': 'Future Simple',
  'Past Continuous': 'Past Continuous', 'Present Continuous': 'Present Continuous',
  'Would / future-in-the-past': 'Would / future-in-the-past', 'Past Simple': 'Past Simple', 'Present Simple': 'Present Simple',
  'Другие формы глагола': 'Other verb forms',
  'Отрицательные приставки': 'Negative prefixes', 'Наречия (-ly)': 'Adverbs (-ly)', 'Существительные': 'Nouns',
  'Прилагательные': 'Adjectives', 'Глаголы': 'Verbs', 'Другое словообразование': 'Other word formation',
};

export function topicOf(secId, it, ans) {
  const lbl = secId === 'grammar' ? grammarTopic(it, ans) : wordformTopic(it, ans);
  return (EXAM.lang === 'en') ? (TOPIC_EN[lbl] || lbl) : lbl;
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
// сохранённые выданные наборы (worksheets) — чтобы проверить именно их позже
const WS_SETS_KEY = 'ss_worksheets';
function loadWsSets() { try { return JSON.parse(localStorage.getItem(WS_SETS_KEY)) || []; } catch (e) { return []; } }
function saveWsSets(arr) { try { localStorage.setItem(WS_SETS_KEY, JSON.stringify(arr)); } catch (e) {} }
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
    } else if (u.kind === 'listen') {
      const r = checkListenBlock(u.block, answers);
      bump('Аудирование', r.correct, r.total);
    } else if (u.kind === 'write') {
      continue; // письмо оценивается отдельно (ИИ + отправка из раздела «Письмо»)
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
  const units = []; // {kind:'gap'|'read'|'listen'|'write', ...}
  let readBlocks = null, listenBlocks = null, writingBlocks = null;
  for (const secId of Object.keys(groups)) {
    if (secId === 'reading') {
      readBlocks = readBlocks || await loadReadingBlocks();
      const byId = {};
      for (const b of readBlocks) byId[b.id] = b;
      for (const id of groups[secId]) { const b = byId[id]; if (b) units.push({ kind: 'read', block: b }); }
      continue;
    }
    if (secId === 'listening') {
      listenBlocks = listenBlocks || await loadListeningBlocks();
      const byId = {};
      for (const b of listenBlocks) byId[b.id] = b;
      for (const id of groups[secId]) { const b = byId[id]; if (b) units.push({ kind: 'listen', block: b }); }
      continue;
    }
    if (secId === 'writing') {
      writingBlocks = writingBlocks || await loadWritingBlocks();
      const byId = {};
      for (const b of writingBlocks) byId[b.id] = b;
      for (const id of groups[secId]) { const b = byId[id]; if (b) units.push({ kind: 'write', block: b }); }
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
function reviewRows(allUnits, answers, keys, H) {
  const units = allUnits.filter((u) => u.kind !== 'write'); // письмо проверяется и отправляется отдельно
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
    if (u.kind === 'listen') {
      const r = checkListenBlock(u.block, answers);
      correct += r.correct; total += r.total;
      return el('div', { class: 'hw-rev ' + (r.correct === r.total ? 'ok' : 'no') }, [
        el('div', { class: 'hw-rev-t', text: (i + 1) + '. ' + H.listenScore(r.correct, r.total) }),
        renderListenBlock(u.block, answers, H, true),
      ]);
    }
    const it = u.it;
    const key = (keys[it.zid] || {}).answer || '';
    const mine = answers[it.zid] || '';
    const ok = hwNorm(mine) === hwNorm(key) && mine.trim() !== '';
    if (ok) correct += 1; total += 1;
    const bw = it.base_word || '';
    const src = (it.answer_type === 'Выбор ответа' && it.sentence) ? it.sentence : (bw ? stripTrailingBase(it.text || '', bw) : (it.text || ''));
    const prev = src.replace(GAP_RE, ' ___ ' + (bw ? '(' + bw + ') ' : ''));
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

// карточка результата письма (оценено ИИ) — для разбора ученика и экрана учителя
function writingCard(w, H) {
  return el('div', { class: 'hw-rev ' + (w.score >= w.max ? 'ok' : 'no') }, [
    el('div', { class: 'hw-rev-t', text: '✉️ ' + (w.topic || H.wTask) + ' — ' + w.score + '/' + w.max }),
    el('div', { class: 'jr-topics' }, (w.crit || []).map((c) => el('div', { class: 'jr-topic' }, [
      el('div', { class: 'jr-topic-n', text: c.code }),
      el('div', { class: 'jr-topic-bar' }, [el('i', { style: { width: (c.max ? c.score / c.max * 100 : 0) + '%', background: 'var(--p-text)' } })]),
      el('div', { class: 'jr-topic-v', text: c.score + '/' + c.max }),
    ]))),
    w.verdict ? el('div', { class: 'hw-rev-a', text: w.verdict }) : null,
  ].filter(Boolean));
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

// Отправка результата письма учителю (вызывается из раздела «Письмо» после ИИ-проверки)
export function shareWritingResult(o) {
  const payload = {
    kind: 'writing', n: o.name || 'Ученик', wkind: o.wkind || 'letter', topic: o.topic || '',
    score: o.score || 0, max: o.max || 0, verdict: o.verdict || '',
    crit: (o.criteria || []).map((c) => ({ code: c.code, score: c.score, max: c.max })), ts: Date.now(),
  };
  const url = location.origin + location.pathname + '#/hwr?' + b64e(JSON.stringify(payload));
  copyLinkSheet({ url, title: t.homework.sendTitle, sub: t.homework.sendSub, copyLabel: t.homework.copy, closeLabel: t.homework.close });
}

// ---- Чтение: нормализация блоков + рендер/проверка (по образцу mock.js) ----
const RLET = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const TF_LBL = ['Верно', 'Неверно', 'Не сказано'];

function firstText(texts) {
  if (!texts) return '';
  const k = Object.keys(texts)[0];
  return (texts[k] || '').replace(/\s+/g, ' ').slice(0, 90);
}

// пометка в разборе: ✓ или ✗ с правильным ответом
function markEl(ok, correct) {
  return el('span', { class: 'hw-mk ' + (ok ? 'ok' : 'no'), text: ok ? ' ✓' : ' ✗ → ' + correct });
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
      const head = el('div', { class: 'hw-tf-s' }, [el('span', { text: st.num + '. ' + st.statement }), readonly ? markEl(a[st.num] === st.answer, TF_LBL[+st.answer - 1]) : null].filter(Boolean));
      wrap.appendChild(el('div', { class: 'hw-tf' }, [head, el('div', { class: 'hw-tf-btns' }, btns)]));
    });
  } else if (block.kind === 'rmatch') {
    const qs = d.questions || d.headings || [];
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.rMatch }));
    wrap.appendChild(el('ol', { class: 'hw-rqs' }, qs.map((q) => el('li', { text: q }))));
    const ls = RLET.filter((L) => d.texts && d.texts[L] != null);
    ls.forEach((L, idx) => {
      const sel = el('select', { class: 'hw-sel' });
      sel.appendChild(el('option', { value: '', text: '—' }));
      qs.forEach((_, qi) => sel.appendChild(el('option', { value: String(qi + 1), text: String(qi + 1) })));
      if (a[L]) sel.value = a[L];
      if (readonly) sel.disabled = true; else sel.addEventListener('change', () => { a[L] = sel.value; });
      const correct = String((d.answer || '')[idx]);
      const hrow = el('div', { class: 'hw-rtxt-h' }, [el('b', { text: L }), sel, readonly ? markEl((a[L] || '') === correct, correct) : null].filter(Boolean));
      wrap.appendChild(el('div', { class: 'hw-rtxt' }, [hrow, el('div', { text: d.texts[L] })]));
    });
  } else if (block.kind === 'gaps') {
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.rGaps }));
    wrap.appendChild(el('ol', { class: 'hw-rqs' }, (d.parts || []).map((p) => el('li', { text: p }))));
    const para = el('div', { class: 'hw-rtext' });
    const gl = d.gaps || [];
    (d.passage || '').split(/\{([A-G])\}/).forEach((ch, idx) => {
      if (idx % 2 === 0) { if (ch) para.appendChild(document.createTextNode(ch)); return; }
      const L = ch;
      const sel = el('select', { class: 'hw-sel hw-sel-in' });
      sel.appendChild(el('option', { value: '', text: L }));
      (d.parts || []).forEach((_, pi) => sel.appendChild(el('option', { value: String(pi + 1), text: String(pi + 1) })));
      if (a[L]) sel.value = a[L];
      if (readonly) sel.disabled = true; else sel.addEventListener('change', () => { a[L] = sel.value; });
      para.appendChild(sel);
      if (readonly) { const correct = String((d.answer || '')[gl.indexOf(L)]); para.appendChild(markEl((a[L] || '') === correct, correct)); }
    });
    wrap.appendChild(para);
  } else if (block.kind === 'choicegroup') {
    wrap.appendChild(el('div', { class: 'hw-rtext', text: d.text || '' }));
    (d.questions || []).forEach((q, qi) => {
      const key = String(q.answer != null ? q.answer : q.key);
      const opts = (q.options || []).map((o, oi) => {
        const id = 'r_' + block.id + '_' + qi + '_' + oi;
        const inp = el('input', { type: 'radio', name: 'r_' + block.id + '_' + qi, id, value: String(oi + 1) });
        if (a[qi] === String(oi + 1)) inp.checked = true;
        if (readonly) inp.disabled = true; else inp.addEventListener('change', () => { a[qi] = String(oi + 1); });
        const cls = 'mock-opt' + (readonly && String(oi + 1) === key ? ' hw-opt-correct' : '') + (readonly && a[qi] === String(oi + 1) && a[qi] !== key ? ' hw-opt-wrong' : '');
        return el('label', { class: cls, for: id }, [inp, el('span', { text: o })]);
      });
      const qh = el('div', { class: 'hw-mcq-q' }, [el('span', { text: (qi + 1) + '. ' + (q.question || q.q || '') }), readonly ? markEl((a[qi] || '') === key, key) : null].filter(Boolean));
      wrap.appendChild(el('div', { class: 'hw-mcq' }, [qh, el('div', { class: 'mock-opts' }, opts)]));
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

// ---- Письмо: темы для ДЗ (ученик пишет в разделе «Письмо», результат шлёт сам) ----
const WLABEL = { writing: 'Письмо', email: 'Email', essay: 'Эссе' };
async function loadWritingBlocks() {
  const out = [];
  for (const tk of ((EXAM.writing && EXAM.writing.tasks) || [])) {
    let d;
    try { d = await loadJSON(tk.dataFile); } catch (e) { continue; }
    (d || []).forEach((it) => {
      if (tk.sectionId === 'essay' && !it.table) return; // в ДЗ — только зад.38 (с таблицей/диаграммой), без старого opinion
      const prompt = (it.prompt || ((it.context || '') + ' ' + (it.questions || '')).trim() || it.subject || '').replace(/\s+/g, ' ');
      out.push({ id: tk.sectionId + '~' + it.zid, secId: tk.sectionId, zid: it.zid,
        wlabel: WLABEL[tk.sectionId] || tk.id, title: it.name ? ('Письмо от ' + it.name) : (it.subject || prompt).slice(0, 60), prompt,
        table: it.table || null, criteria: tk.criteria, max: tk.max, words: tk.words });
    });
  }
  return out;
}

// ---- Аудирование: блоки (аудио + вопросы) + рендер/проверка ----
async function loadListeningBlocks() {
  const cfg = EXAM.sections.find((s) => s.type === 'listening');
  if (!cfg) return [];
  let d;
  try { d = await loadJSON(cfg.dataFile); } catch (e) { return []; }
  return (d.groups || []).map((g, i) => ({
    id: g.id, audio: g.audio, questions: g.questions || [], transcript: g.transcript || [],
    n: (g.questions || []).length, idx: i + 1,
    preview: (g.transcript && g.transcript.find((s) => (s.t || '').length > 15) || {}).t || ('Аудио ' + (i + 1)),
  }));
}

function renderListenBlock(block, answers, H, readonly) {
  const wrap = el('div', { class: 'hw-rblock' });
  if (!readonly) {
    wrap.appendChild(el('div', { class: 'hw-rinstr', text: H.lPlay }));
    wrap.appendChild(el('audio', { class: 'hw-audio', controls: true, preload: 'none', src: block.audio }));
  }
  (block.questions || []).forEach((q, qi) => {
    const a = (answers[q.zid] = answers[q.zid] || (q.type === 'match' ? {} : ''));
    if (q.type === 'choice') {
      const key = String(q.key);
      const opts = (q.options || []).map((o, oi) => {
        const id = 'l_' + q.zid + '_' + oi;
        const inp = el('input', { type: 'radio', name: 'l_' + q.zid, id, value: String(oi + 1) });
        if (answers[q.zid] === String(oi + 1)) inp.checked = true;
        if (readonly) inp.disabled = true; else inp.addEventListener('change', () => { answers[q.zid] = String(oi + 1); });
        const cls = 'mock-opt' + (readonly && String(oi + 1) === key ? ' hw-opt-correct' : '') + (readonly && answers[q.zid] === String(oi + 1) && answers[q.zid] !== key ? ' hw-opt-wrong' : '');
        return el('label', { class: cls, for: id }, [inp, el('span', { text: o })]);
      });
      const qh = el('div', { class: 'hw-mcq-q' }, [el('span', { text: (qi + 1) + '. ' + (q.q || '') }), readonly ? markEl((answers[q.zid] || '') === key, key) : null].filter(Boolean));
      wrap.appendChild(el('div', { class: 'hw-mcq' }, [qh, el('div', { class: 'mock-opts' }, opts)]));
    } else if (q.type === 'fill') {
      const inp = el('input', { class: 'hw-input', type: 'text', value: answers[q.zid] || '', placeholder: H.answerPh });
      if (readonly) inp.disabled = true; else inp.addEventListener('input', () => { answers[q.zid] = inp.value; });
      const ok = hwNorm(answers[q.zid] || '') === hwNorm(q.key || '') && (answers[q.zid] || '').trim() !== '';
      wrap.appendChild(el('div', { class: 'hw-q' }, [el('span', { class: 'hw-n', text: (qi + 1) + '.' }), el('span', { class: 'hw-text' }, [document.createTextNode((q.label ? q.label + ': ' : '')), inp, readonly ? markEl(ok, q.key || '') : null].filter(Boolean))]));
    } else if (q.type === 'match') {
      const obj = answers[q.zid] = answers[q.zid] || {};
      wrap.appendChild(el('div', { class: 'hw-mcq-q', text: (qi + 1) + '. ' + (q.task || '') }));
      wrap.appendChild(el('ol', { class: 'hw-rqs' }, (q.rubrics || []).map((r) => el('li', { text: r }))));
      (q.speakers || []).forEach((sp, idx) => {
        const sel = el('select', { class: 'hw-sel' });
        sel.appendChild(el('option', { value: '', text: '—' }));
        (q.rubrics || []).forEach((_, ri) => sel.appendChild(el('option', { value: String(ri + 1), text: String(ri + 1) })));
        if (obj[sp]) sel.value = obj[sp];
        if (readonly) sel.disabled = true; else sel.addEventListener('change', () => { obj[sp] = sel.value; });
        const correct = String((q.key || '')[idx]);
        wrap.appendChild(el('div', { class: 'hw-rtxt-h' }, [el('b', { text: sp }), sel, readonly ? markEl((obj[sp] || '') === correct, correct) : null].filter(Boolean)));
      });
    }
  });
  if (readonly && block.transcript && block.transcript.length) {
    wrap.appendChild(el('details', { class: 'hw-script' }, [
      el('summary', { text: H.lScript }),
      el('div', { class: 'hw-rtext', text: block.transcript.map((s) => s.t).join(' ') }),
    ]));
  }
  return wrap;
}

function checkListenBlock(block, answers) {
  let correct = 0, total = 0;
  (block.questions || []).forEach((q) => {
    if (q.type === 'match') {
      (q.speakers || []).forEach((sp, idx) => { total++; if (((answers[q.zid] || {})[sp] || '') === String((q.key || '')[idx])) correct++; });
    } else if (q.type === 'fill') {
      total++; if (hwNorm(answers[q.zid] || '') === hwNorm(q.key || '') && (answers[q.zid] || '').trim() !== '') correct++;
    } else {
      total++; if ((answers[q.zid] || '') === String(q.key)) correct++;
    }
  });
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
  // блоки чтения / аудирования — отдельные вкладки
  const readBlocks = await loadReadingBlocks();
  const hasReading = readBlocks.length > 0;
  const listenBlocks = await loadListeningBlocks();
  const hasListening = listenBlocks.length > 0;
  const writingBlocks = await loadWritingBlocks();
  const hasWriting = writingBlocks.length > 0;
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
    // только с ключом; MC «Выбор ответа» — только с предложением-контекстом (как в дрилле)
    return (banks[secId] || []).filter((it) => keys[it.zid] && (it.answer_type !== 'Выбор ответа' || it.sentence));
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
    view.appendChild(el('div', { class: 'tch-actions' }, [
      el('button', { class: 'btn tch-journal-btn', text: '📋 ' + T.savedBtn, onclick: showSavedSets }),
      el('button', { class: 'btn tch-journal-btn', text: '📊 ' + T.journal, onclick: () => renderJournal(container, opts) }),
    ]));

    // вкладки разделов (+ «Чтение»)
    const tabs = drillSecs.map((s) => ({ id: s.id, label: SEC_TITLE[s.id] || s.id }));
    if (hasReading) tabs.push({ id: 'reading', label: 'Чтение' });
    if (hasListening) tabs.push({ id: 'listening', label: 'Аудирование' });
    if (hasWriting) tabs.push({ id: 'writing', label: 'Письмо' });
    view.appendChild(el('div', { class: 'tch-tabs' }, tabs.map((tb) =>
      el('button', { class: 'tch-tab' + (tb.id === curSec ? ' on' : ''), text: tb.label,
        onclick: () => { curSec = tb.id; curTopic = ''; draw(); } }))));

    // фильтр: для дрилла — по теме; для чтения — по типу задания
    const sel = el('select', { class: 'tch-kes' });
    const isRead = curSec === 'reading', isListen = curSec === 'listening';
    sel.appendChild(el('option', { value: '', text: isListen ? 'Все варианты' : isRead ? 'Все типы' : T.allTopics }));
    const groups = isRead ? readingTypeGroups() : isListen ? [] : topicGroups(curSec);
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
    if (curSec === 'listening') {
      let arr = listenBlocks;
      if (search) { const q = search.toLowerCase(); arr = arr.filter((b) => b.preview.toLowerCase().includes(q)); }
      return arr.map((b) => ({ pid: 'listening:' + b.id, preview: 'Аудио ' + b.idx + ': ' + b.preview, meta: 'Аудирование · ' + b.n + ' заданий' }));
    }
    if (curSec === 'writing') {
      let arr = writingBlocks;
      if (search) { const q = search.toLowerCase(); arr = arr.filter((b) => (b.title + ' ' + b.prompt).toLowerCase().includes(q)); }
      return arr.map((b) => ({ pid: 'writing:' + b.id, preview: b.title, meta: b.wlabel }));
    }
    return filtered().map((it) => ({ pid: curSec + ':' + it.zid, preview: ((it.sentence || it.text) || '').replace(/_{3,}/, ' ___ '), meta: (it.base_word ? '[' + it.base_word + '] · ' : '') + itemTopic(curSec, it) }));
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
        ...(canRecognizePhoto() ? [el('button', { class: 'btn', text: T.checkBlank, onclick: openBlankCheck })] : []),
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

  // запомнить выданный набор (чтобы проверить именно его позже)
  function rememberWsSet() {
    const setStr = encodeSet(); if (!setStr) return;
    const arr = loadWsSets();
    const dateStr = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const name = (curTopic ? curTopic + ' · ' : '') + picked.size + ' зад. · ' + dateStr;
    const ex = arr.find((s) => s.exam === EXAM.id && s.set === setStr);
    if (ex) { ex.ts = Date.now(); ex.name = name; }
    else arr.push({ id: hashStr(EXAM.id + setStr + Date.now()), exam: EXAM.id, name, ts: Date.now(), set: setStr });
    saveWsSets(arr);
  }

  function openPrint(withKeys) {
    if (!picked.size) return;
    const sections = buildSections();
    if (!sections.length) { alert(T.printNoReading); return; } // чтение печатается пока только через ДЗ
    rememberWsSet(); // сохранить набор для последующей проверки бланков
    renderPrintView(container, {
      title: T.wsTitle, sub: T.wsSub(EXAM.badge), exam: EXAM.id, sections,
      worksheet: true, withKeys,
      onBack: () => renderTeacher(container, opts),
    });
  }

  // проверка заполненного бланка по фото: нумерация ответов совпадает с печатным worksheet
  function openBlankCheck() {
    if (!picked.size) { alert(T.bkNoTasks); return; }
    const sections = buildSections();
    const expected = [];
    let num = 0;
    for (const sec of sections) for (const it of (sec.items || [])) { num += 1; expected.push({ num, key: it.key || '', text: it.text || '', zid: it.zid, secId: it.sub, item: it }); }
    if (!expected.length) { alert(T.bkNoTasks); return; }
    renderBlankCheck(container, expected, () => renderTeacher(container, opts));
  }

  // экран «Выданные»: список сохранённых наборов → проверить бланк именно этого набора
  function showSavedSets() {
    const sets = loadWsSets().filter((s) => s.exam === EXAM.id).sort((a, b) => b.ts - a.ts);
    const fmtDate = (ts) => { try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    view.replaceChildren();
    view.appendChild(el('div', { class: 'tch-top' }, [
      el('button', { class: 'back', text: '←', onclick: draw }),
      el('div', { class: 'tch-h' }, [el('div', { class: 'tch-t', text: T.savedTitle }), el('div', { class: 'tch-sub', text: T.savedSub })]),
    ]));
    if (!sets.length) { view.appendChild(el('div', { class: 'tch-empty', text: T.savedEmpty })); return; }
    const list = el('div', { class: 'tch-list' });
    for (const s of sets) {
      list.appendChild(el('div', { class: 'tch-row saved-row' }, [
        el('div', { class: 'tch-row-b' }, [
          el('div', { class: 'tch-row-t', text: s.name }),
          el('div', { class: 'tch-row-m', text: fmtDate(s.ts) }),
        ]),
        el('button', { class: 'btn btn-primary saved-check', text: T.checkBlank, onclick: () => {
          picked.clear();
          const g = parseSet(s.set);
          for (const sec in g) for (const zid of g[sec]) picked.add(sec + ':' + zid);
          openBlankCheck();
        } }),
        el('button', { class: 'saved-del', title: T.savedDel, text: '🗑', onclick: () => {
          if (!confirm(T.savedDelConfirm)) return;
          saveWsSets(loadWsSets().filter((x) => x.id !== s.id)); showSavedSets();
        } }),
      ]));
    }
    view.appendChild(list);
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
    const lids = listenBlocks.filter((b) => picked.has('listening:' + b.id)).map((b) => b.id);
    if (lids.length) parts.push('listening:' + lids.join(','));
    const wids = writingBlocks.filter((b) => picked.has('writing:' + b.id)).map((b) => b.id);
    if (wids.length) parts.push('writing:' + wids.join(','));
    return parts.join(';');
  }

  function copyLink() {
    if (!picked.size) return;
    const url = location.origin + location.pathname + '#/hw?' + encodeSet();
    copyLinkSheet({ url, title: T.linkTitle, sub: T.linkSub(picked.size), copyLabel: T.linkCopyAgain, closeLabel: T.linkClose });
  }

  draw();
}

// ===== Проверка заполненного бланка по фото (учитель) =====
// expected = [{num, key, text, zid}] в том же порядке, что worksheet/бланк. Без бэкенда: фото→OCR→сверка с ключами.
// opts = { save:true/false (запись в журнал класса), title, sub } — пробник зовёт с save:false (самопроверка).
export function renderBlankCheck(container, expected, onBack, opts) {
  const T = t.teacher;
  const o = opts || {};
  const save = o.save !== false;
  let got = {}; // "номер" -> распознанный ответ
  const view = el('div', { class: 'view tch' });
  mount(container, view);

  const header = () => el('div', { class: 'tch-top' }, [
    el('button', { class: 'back', text: '←', onclick: onBack }),
    el('div', { class: 'tch-h' }, [el('div', { class: 'tch-t', text: o.title || T.bkTitle }), el('div', { class: 'tch-sub', text: o.sub || T.bkSub })]),
  ]);

  function photoScreen() {
    const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    const btn = el('button', { class: 'btn btn-primary btn-block', text: T.bkPhoto });
    const loader = el('div', { class: 'loader', style: { display: 'none' }, text: T.bkLoading });
    const err = el('div', { class: 'err-msg', style: { display: 'none' } });
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; input.value = '';
      if (!file) return;
      err.style.display = 'none'; btn.disabled = true; loader.style.display = 'block';
      try {
        const { words } = await recognizeBlank(file);
        got = parseAnswerGrid(words, expected.map((e) => e.num));
        reviewScreen();
      } catch (e) { err.textContent = T.bkErr(e.message); err.style.display = 'block'; }
      finally { btn.disabled = false; loader.style.display = 'none'; }
    });
    mount(view, el('div', { class: 'view' }, [header(),
      el('div', { class: 'tch-blank-body' }, [el('div', { class: 'bk-hint', text: T.bkSub }), btn, input, loader, err])]));
  }

  function reviewScreen() {
    const inputs = {};
    const nameInp = el('input', { class: 'bk-input bk-name', type: 'text', placeholder: T.bkName, style: { marginTop: '14px' } });
    const rows = expected.map((e) => {
      const inp = el('input', { class: 'bk-input', type: 'text', value: got[String(e.num)] || '' });
      inputs[e.num] = inp;
      return el('div', { class: 'bk-row' }, [el('span', { class: 'bk-num', text: '№' + e.num }), inp]);
    });
    const resultBox = el('div', {});
    const checkBtn = el('button', { class: 'btn btn-primary btn-block', text: T.bkCheck });
    checkBtn.addEventListener('click', () => {
      let ok = 0;
      const byTopic = {};
      const lines = expected.map((e) => {
        const ua = inputs[e.num].value;
        const { correct, expected: exp } = checkAnswer(ua, { answer: e.key }); // normalize уже без пробелов
        if (correct) ok += 1;
        // разбивка по темам для журнала (как у онлайн-сдач) — только при сохранении
        if (save) {
          const tp = topicOf(e.secId, e.item, e.key);
          const b = byTopic[tp] = byTopic[tp] || { c: 0, t: 0 }; b.c += correct ? 1 : 0; b.t += 1;
        }
        return el('div', { class: 'bk-res ' + (correct ? 'ok' : 'bad') }, [
          el('span', { class: 'bk-num', text: '№' + e.num }),
          el('span', { class: 'bk-mark', text: correct ? '✓' : '✗' }),
          el('span', { class: 'bk-ua', text: ua || '—' }),
          correct ? null : el('span', { class: 'bk-exp', text: '→ ' + exp }),
        ].filter(Boolean));
      });
      // кнопка сохранения в журнал класса (только в учительском режиме)
      const tail = [];
      if (save) {
        const saveBtn = el('button', { class: 'btn btn-block', style: { marginTop: '10px' }, text: T.bkSave });
        saveBtn.addEventListener('click', () => {
          const name = (nameInp.value || '').trim() || 'Ученик';
          const answersStr = expected.map((e) => e.num + ':' + (inputs[e.num].value || '')).join(',');
          const entry = {
            id: hashStr(EXAM.id + '|' + name + '|' + answersStr),
            exam: EXAM.id, name, ts: Date.now(),
            correct: ok, total: expected.length, byTopic,
            summary: '📄 Бумажный бланк · ' + ok + '/' + expected.length,
          };
          const added = addToJournal(entry);
          saveBtn.disabled = true;
          saveBtn.textContent = added ? T.bkSaved : T.bkDup;
        });
        tail.push(nameInp, saveBtn);
      }
      resultBox.replaceChildren(el('div', { class: 'bk-score', text: T.bkScore(ok, expected.length) }), ...lines, ...tail);
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    mount(view, el('div', { class: 'view' }, [header(),
      el('div', { class: 'tch-blank-body' }, [
        el('div', { class: 'bk-hint', text: T.bkReview }),
        el('div', { class: 'bk-list' }, rows),
        el('div', { style: { marginTop: '12px' } }, [checkBtn,
          el('button', { class: 'btn btn-block', style: { marginTop: '8px' }, text: T.bkAgain, onclick: photoScreen })]),
        resultBox,
      ])]));
  }

  photoScreen();
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
      if (u.kind === 'write') {
        // письмо прямо в ДЗ: задание + поле + счётчик слов; проверится ИИ при «Сдать»
        const akey = 'w:' + u.block.id;
        const ta = el('textarea', { class: 'hw-wtext', rows: '8', placeholder: H.answerPh, value: answers[akey] || '' });
        const wc = el('div', { class: 'hw-wc' });
        const [wmin, wmax] = u.block.words || [100, 140];
        const upd = () => { const n = ta.value.trim().split(/\s+/).filter(Boolean).length; wc.textContent = n + ' / ' + wmin + '–' + wmax; wc.className = 'hw-wc ' + (n >= wmin && n <= wmax ? 'ok' : (n > wmax ? 'bad' : '')); };
        ta.addEventListener('input', () => { answers[akey] = ta.value; upd(); });
        upd();
        const errBox = el('div', { class: 'err-msg', style: { display: 'none' } });
        const photoNode = ocrPhotoBlock(ta, () => { answers[akey] = ta.value; upd(); }, errBox);
        list.appendChild(el('div', { class: 'hw-q hw-q-read' }, [
          el('span', { class: 'hw-n', text: (i + 1) + '.' }),
          el('div', { class: 'hw-rblock' }, [
            el('div', { class: 'hw-rinstr', text: '✉️ ' + (u.block.wlabel || H.wTask) }),
            el('div', { class: 'hw-rtext', text: u.block.prompt }),
            (u.block.table && u.block.table.rows) ? el('div', { class: 'essay-table' }, [
              u.block.table.q ? el('div', { class: 'et-q', text: u.block.table.q }) : null,
              el('table', { class: 'et' }, [el('tbody', {}, u.block.table.rows.map((r) => el('tr', {}, [el('td', { text: r[0] }), el('td', { class: 'et-pct', text: r[1] + '%' })])))]),
            ].filter(Boolean)) : null,
            ta, wc, photoNode, errBox,
          ].filter(Boolean)),
        ]));
        return;
      }
      if (u.kind === 'read' || u.kind === 'listen') {
        list.appendChild(el('div', { class: 'hw-q hw-q-read' }, [
          el('span', { class: 'hw-n', text: (i + 1) + '.' }),
          u.kind === 'read' ? renderReadBlock(u.block, answers, H, false) : renderListenBlock(u.block, answers, H, false),
        ]));
        return;
      }
      const it = u.it;
      const bw = it.base_word || '';
      // MC-лексика «Выбор ответа»: предложение-контекст (it.sentence) + кнопки-варианты
      const isMC = it.answer_type === 'Выбор ответа' || /^\s*1\)/.test(it.text || '');
      const srcText = (isMC && it.sentence) ? it.sentence : (bw ? stripTrailingBase(it.text || '', bw) : (it.text || ''));
      const m = srcText.match(GAP_RE);
      const before = m ? srcText.slice(0, m.index) : srcText;
      const after = m ? srcText.slice(m.index + m[0].length) : '';
      if (isMC) {
        const mcOpts = [...(it.text || '').matchAll(/\d\)\s*([A-Za-z][A-Za-z'-]*)/g)].map((x) => x[1]);
        const blank = el('span', { class: 'hw-blank', text: answers[it.zid] || '___' });
        const optWrap = el('div', { class: 'mc-list' }), btns = [];
        for (const w of mcOpts) {
          const b = el('button', { class: 'mc-opt' + (answers[it.zid] === w ? ' mc-sel' : ''), text: w });
          b.addEventListener('click', () => { answers[it.zid] = w; blank.textContent = w; btns.forEach((x) => x.classList.remove('mc-sel')); b.classList.add('mc-sel'); });
          btns.push(b); optWrap.appendChild(b);
        }
        list.appendChild(el('div', { class: 'hw-q hw-q-read' }, [
          el('span', { class: 'hw-n', text: (i + 1) + '.' }),
          el('div', { class: 'hw-rblock' }, [
            el('div', { class: 'hw-rtext' }, [document.createTextNode(before), blank, document.createTextNode(after)]),
            optWrap,
          ]),
        ]));
        return;
      }
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

  // Сдать: фиксируем → ИИ-проверка письма (если есть) → ссылка учителю → разбор. Переделать нельзя.
  async function submitToTeacher() {
    if (!confirm(H.confirmSubmit)) return;
    let name = getName();
    if (!name) name = (prompt(H.askName) || '').trim();
    const writeUnits = units.filter((u) => u.kind === 'write');
    let w = [];
    if (writeUnits.length) {
      view.replaceChildren(el('div', { class: 'loader', text: H.wEvaluating }));
      for (const u of writeUnits) {
        const b = u.block, text = (answers['w:' + b.id] || '').trim();
        if (!text) { w.push({ id: b.id, wkind: b.wlabel, topic: b.title, score: 0, max: b.max, crit: [], verdict: H.wEmpty }); continue; }
        try {
          const res = await evalWriting(text, { lang: EXAM.lang, sectionId: b.secId, criteria: b.criteria, max: b.max, words: b.words, stim: b.prompt });
          w.push({ id: b.id, wkind: b.wlabel, topic: b.title, score: res.totalScore || 0, max: b.max,
            crit: (res.criteria || []).map((c) => ({ code: c.code, score: c.score, max: c.max })), verdict: res.verdict || '' });
        } catch (e) {
          w.push({ id: b.id, wkind: b.wlabel, topic: b.title, score: 0, max: b.max, crit: [], verdict: H.wEvalFail });
        }
      }
    }
    const payload = { n: name || H.anon, set: groups, a: { ...answers }, w, ts: Date.now() };
    const url = location.origin + location.pathname + '#/hwr?' + b64e(JSON.stringify(payload));
    showReview(w);
    copyLinkSheet({ url, title: H.sendTitle, sub: H.sendSub, copyLabel: H.copy, closeLabel: H.close });
  }

  // разбор после сдачи (авто + письмо) — без «переделать»
  function showReview(w) {
    const { correct, total, rows } = reviewRows(units, answers, keys, H);
    let c = correct, tot = total;
    for (const x of (w || [])) { c += x.score; tot += x.max; }
    const pc = tot ? Math.round(c / tot * 100) : 0;
    view.replaceChildren(
      el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.resultTitle })]),
      el('div', { class: 'hw-note', text: H.sentNote }),
      el('div', { class: 'hw-score' }, [
        el('div', { class: 'hw-score-v', text: c + ' / ' + tot }),
        el('div', { class: 'hw-score-p', text: pc + '%' }),
      ]),
      el('div', { class: 'hw-list' }, [...rows, ...(w || []).map((x) => writingCard(x, H))]),
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
  if (!payload) return fail();

  // результат письма (оценён ИИ у ученика) — отдельный вид
  if (payload.kind === 'writing') {
    const name = payload.n || H.anon, score = payload.score || 0, max = payload.max || 0;
    const pc = max ? Math.round(score / max * 100) : 0;
    const entry = {
      id: hashStr('w|' + name + '|' + (payload.topic || '') + '|' + score + '|' + (payload.ts || '')),
      exam: EXAM.id, name, ts: payload.ts || Date.now(), correct: score, total: max,
      byTopic: { 'Письмо': { c: score, t: max } }, summary: 'письмо' + (payload.topic ? ': ' + payload.topic : ''),
      writings: [{ topic: payload.topic || '', score, max }],
    };
    const saved = addToJournal(entry);
    mount(container, el('div', { class: 'view hw' }, [
      el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.studentResult(name) })]),
      el('div', { class: 'hw-note', text: saved ? H.savedJournal : H.alreadyJournal }),
      el('div', { class: 'hw-score' }, [el('div', { class: 'hw-score-v', text: score + ' / ' + max }), el('div', { class: 'hw-score-p', text: pc + '%' })]),
      el('div', { class: 'hw-rev ok' }, [
        payload.topic ? el('div', { class: 'hw-rev-t', text: '✉️ ' + payload.topic }) : null,
        el('div', { class: 'jr-topics' }, (payload.crit || []).map((c) => el('div', { class: 'jr-topic' }, [
          el('div', { class: 'jr-topic-n', text: c.code }),
          el('div', { class: 'jr-topic-bar' }, [el('i', { style: { width: (c.max ? c.score / c.max * 100 : 0) + '%', background: 'var(--p-text)' } })]),
          el('div', { class: 'jr-topic-v', text: c.score + '/' + c.max }),
        ]))),
        payload.verdict ? el('div', { class: 'hw-rev-a', text: payload.verdict }) : null,
      ].filter(Boolean)),
      el('div', { class: 'hw-bar' }, [
        el('button', { class: 'btn', text: '📊 ' + t.teacher.journal, onclick: () => renderJournal(container, opts) }),
        el('button', { class: 'btn btn-primary', text: H.done, onclick: opts.goHome }),
      ]),
    ]));
    return;
  }

  if (!payload.set) return fail();
  const { units, keys } = await gatherTasks(payload.set);
  const w = payload.w || [];
  if (!units.length && !w.length) return fail();
  const answers = payload.a || {};
  const name = payload.n || H.anon;
  const auto = reviewRows(units, answers, keys, H);
  let correct = auto.correct, total = auto.total;
  for (const x of w) { correct += x.score; total += x.max; }
  const pc = total ? Math.round(correct / total * 100) : 0;

  // сохраняем в журнал учителя (дедуп по содержимому)
  const byTopic = unitsByTopic(units, answers, keys);
  for (const x of w) { const b = byTopic['Письмо'] = byTopic['Письмо'] || { c: 0, t: 0 }; b.c += x.score; b.t += x.max; }
  const sumLabels = Object.keys(payload.set).map((s) => s === 'reading' ? 'чтение' : s === 'listening' ? 'аудирование' : s === 'writing' ? 'письмо' : (SEC_TITLE[s] || s).toLowerCase());
  const entry = {
    id: hashStr(name + '|' + JSON.stringify(payload.set) + '|' + JSON.stringify(answers) + '|' + JSON.stringify(w.map((x) => x.score))),
    exam: EXAM.id, name, ts: payload.ts || Date.now(), correct, total,
    byTopic, summary: [...new Set(sumLabels)].join(', '),
    writings: w.map((x) => ({ topic: x.topic, score: x.score, max: x.max })),
  };
  const saved = addToJournal(entry);

  mount(container, el('div', { class: 'view hw' }, [
    el('div', { class: 'hw-top' }, [el('button', { class: 'back', text: '←', onclick: opts.goHome }), el('div', { class: 'hw-t', text: H.studentResult(name) })]),
    el('div', { class: 'hw-note', text: saved ? H.savedJournal : H.alreadyJournal }),
    el('div', { class: 'hw-score' }, [
      el('div', { class: 'hw-score-v', text: correct + ' / ' + total }),
      el('div', { class: 'hw-score-p', text: pc + '%' }),
    ]),
    el('div', { class: 'hw-list' }, [...auto.rows, ...w.map((x) => writingCard(x, H))]),
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

  const stat = (v, l) => el('div', { class: 'mini-stat' }, [el('div', { class: 'ms-v', text: String(v) }), el('div', { class: 'ms-l', text: l })]);
  const fmtDate = (ts) => { try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const pcColor = (pc) => pc < 50 ? '#d64545' : (pc < 75 ? '#E0922F' : '#2f9e44');
  // слабые темы из набора записей (сложные сверху)
  const hardOf = (entries) => {
    const by = {};
    for (const e of entries) for (const tp in (e.byTopic || {})) { const b = by[tp] = by[tp] || { c: 0, t: 0 }; b.c += e.byTopic[tp].c; b.t += e.byTopic[tp].t; }
    return Object.entries(by).map(([tp, b]) => ({ tp, pc: Math.round(b.c / b.t * 100), c: b.c, t: b.t })).filter((x) => x.t >= 1).sort((a, b) => a.pc - b.pc);
  };
  const topicsBlock = (hard) => el('div', { class: 'jr-topics' }, hard.map((x) => el('div', { class: 'jr-topic' }, [
    el('div', { class: 'jr-topic-n', text: x.tp }),
    el('div', { class: 'jr-topic-bar' }, [el('i', { style: { width: x.pc + '%', background: pcColor(x.pc) } })]),
    el('div', { class: 'jr-topic-v', text: x.pc + '% (' + x.c + '/' + x.t + ')' }),
  ])));
  const subRow = (e) => el('div', { class: 'jr-row' }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { class: 'jr-meta', text: fmtDate(e.ts) + ' · ' + (e.summary || '') }),
      ...((e.writings || []).filter((wr) => wr.topic).map((wr) => el('div', { class: 'jr-wrow', text: '✉️ ' + wr.topic + ' — ' + wr.score + '/' + wr.max }))),
    ]),
    el('div', { class: 'jr-score', style: { color: pcColor(e.total ? e.correct / e.total * 100 : 0) }, text: e.correct + '/' + e.total }),
  ]);

  // агрегат класса
  const avg = Math.round(all.reduce((s, e) => s + (e.total ? e.correct / e.total : 0), 0) / all.length * 100);
  // группировка по ученикам (имя нормализуем: регистр/пробелы → одна Аня вместо «Аня»/«аня»)
  const nkey = (n) => (n || 'Ученик').trim().replace(/\s+/g, ' ').toLowerCase();
  const byName = new Map();
  for (const e of all) {
    const k = nkey(e.name);
    if (!byName.has(k)) byName.set(k, { name: (e.name || 'Ученик').trim().replace(/\s+/g, ' '), entries: [] });
    byName.get(k).entries.push(e);
  }
  const studs = [...byName.values()].map(({ name, entries }) => {
    const av = Math.round(entries.reduce((s, e) => s + (e.total ? e.correct / e.total : 0), 0) / entries.length * 100);
    return { name, entries, av };
  }).sort((a, b) => a.av - b.av); // слабые ученики сверху

  // карточка ученика (раскрывается: личные слабые темы + сдачи)
  const studentCard = (s) => {
    const body = el('div', { class: 'jr-stud-body', style: { display: 'none' } }, [
      el('div', { class: 'jr-sub-h', text: T.jrIndivWeak }),
      topicsBlock(hardOf(s.entries)),
      el('div', { class: 'jr-sub-h', text: T.jrStudentSubs }),
      el('div', { class: 'jr-list' }, s.entries.slice().sort((a, b) => b.ts - a.ts).map(subRow)),
    ]);
    let open = false;
    const head = el('button', { class: 'jr-stud-head' }, [
      el('div', { style: { flex: '1', minWidth: '0', textAlign: 'left' } }, [
        el('div', { class: 'jr-name', text: s.name }),
        el('div', { class: 'jr-meta', text: T.jrWorks(s.entries.length) }),
      ]),
      el('div', { class: 'jr-stud-av', style: { color: pcColor(s.av) }, text: s.av + '%' }),
      el('span', { class: 'jr-chev', text: '▾' }),
    ]);
    head.addEventListener('click', () => { open = !open; body.style.display = open ? '' : 'none'; head.querySelector('.jr-chev').textContent = open ? '▴' : '▾'; });
    return el('div', { class: 'jr-stud' }, [head, body]);
  };

  mount(container, el('div', { class: 'view tch jr' }, [
    top,
    el('div', { class: 'mini-stats' }, [stat(all.length, T.jrSubmissions), stat(byName.size, T.jrStudents), stat(avg + '%', T.jrAvg)]),
    el('div', { class: 'jr-sect', text: T.jrHard }),
    topicsBlock(hardOf(all)),
    el('div', { class: 'jr-sect', text: T.jrByStudent }),
    el('div', { class: 'jr-studs' }, studs.map(studentCard)),
    el('div', { class: 'prog-actions' }, [
      el('button', { class: 'act-reset', text: T.jrClear, onclick: () => { if (confirm(T.jrClearConfirm)) { saveJournal(loadJournal().filter((e) => e.exam !== EXAM.id)); renderJournal(container, opts); } } }),
    ]),
  ]));
}
