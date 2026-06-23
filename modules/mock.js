// mock.js — «Пробный экзамен» (ОГЭ): прохождение собранного варианта как на ФИПИ.
// Жёсткий общий таймер (авто-сдача на 0), БЕЗ обратной связи/подсказок/скрипта.
// Разделы по очереди; ответы копятся в objects answers; подсчёт по ключам и КЭС в конце.
// Письмо — AI-проверка (DeepSeek-воркер), офлайн → «оценим при интернете».
// Данные: app/data/oge_mock.json (сборка scripts/build_oge_mock.py). XP/результаты — gamify.

import { el, mount, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordRound, getName, getMockResults, recordMock } from '../js/gamify.js';
import { t, EXAM } from '../js/exam.js';
import { recognize, canRecognize } from '../js/stt.js';
import { evalSpeaking, evalEgeSpeaking } from '../js/speakeval.js';
import { renderPrintView } from './print.js';

const WORKER = 'https://purple-cake-2966.o-sintsova.workers.dev';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']; // EGE headings = 7 текстов A–G; ОГЭ matching/gaps (A–F) — лишние отфильтруются по texts[L]

function norm(s) { return (s || '').toString().toLowerCase().trim().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' '); }
function keyOk(got, key) {
  const g = norm(got);
  return String(key).split(/[\/|]/).some((k) => norm(k) === g) && g !== '';
}

export async function renderMock(container, cfg) {
  const M = t.mock;
  mount(container, el('div', { class: 'loader', text: M.loading }));
  let data;
  try { data = await loadJSON(cfg.dataFile || 'oge_mock'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }
  const variants = data.variants || [];
  // прогноз итога: ЕГЭ — тестовый балл (таблица), ОГЭ — отметка 2–5 (шкала). Считаем от examDate-независимо.
  let p2t = null, gradeScale = null;
  try {
    const sc = await loadJSON('scoring');
    if (EXAM.id === 'ege') p2t = sc.ege && sc.ege.primary_to_test;
    if (EXAM.id === 'oge') gradeScale = sc.oge && sc.oge.grade_scale;
  } catch {}

  let timerId = null;
  function clearTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function secBar(title, sub, onBack) {
    return el('div', { class: 'sec-bar mock' }, [
      onBack ? el('button', { class: 'back', text: '←', onclick: onBack }) : null,
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: title }),
        sub ? el('div', { class: 'sb-sub', text: sub }) : null,
      ]),
    ]);
  }

  // ---- Стартовый экран: «точка А» + список вариантов с прошлым результатом ----
  function introScreen() {
    clearTimer();
    const results = getMockResults();
    const byVar = {};
    results.forEach((r) => { if (!byVar[r.variantId] || r.date > byVar[r.variantId].date) byVar[r.variantId] = r; });
    const first = results.length === 0;

    const cards = variants.map((v) => {
      const past = byVar[v.id];
      const sub = past ? M.lastResult(past.total, past.max) : M.notTaken;
      return el('button', { class: 'mock-card' + (past ? ' taken' : ''), onclick: () => confirmStart(v) }, [
        el('div', { class: 'mc-n', text: '№ ' + v.num }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'mc-t', text: M.variant(v.num) }),
          el('div', { class: 'mc-s', text: sub }),
        ]),
        el('div', { class: 'mc-pts', text: v.maxPts + ' ' + M.ptsShort }),
      ]);
    });

    mount(container, el('div', { class: 'view' }, [
      secBar(M.title, null, cfg.goHome),
      el('div', { class: 'topics-body' }, [
        el('div', { class: 'mock-hero' }, [
          iconImg('spiky-check', '📝', 'mock-hero-img'),
          el('div', {}, [
            el('div', { class: 'mock-hero-t', text: first ? M.pointA : M.heroTitle }),
            el('div', { class: 'mock-hero-s', text: first ? M.pointASub : M.heroSub }),
          ]),
        ]),
        el('div', { class: 'mock-rules' }, M.rules.map((r) => el('div', { class: 'mock-rule', text: '• ' + r }))),
        el('div', { class: 'topics-label', text: M.pickVariant }),
        ...cards,
      ]),
    ]));
  }

  function totalMinutes(v) { return v.sections.reduce((s, x) => s + (x.timeMin || 0), 0); }

  function confirmStart(v) {
    const back = el('div', { class: 'modal-back' });
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.appendChild(el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-title', text: M.startTitle(v.num) }),
      el('div', { class: 'modal-text', text: M.startWarn(totalMinutes(v)) }),
      el('button', { class: 'btn btn-primary btn-block', text: M.startBtn, onclick: () => { close(); runExam(v); } }),
      el('button', { class: 'btn btn-ghost btn-block', text: '🖨 ' + M.printBtn, onclick: () => { close(); openPrint(v); } }),
      el('button', { class: 'btn btn-ghost btn-block', text: t.modalClose, onclick: close }),
    ]));
    document.body.appendChild(back);
  }

  function openPrint(v) {
    clearTimer();
    renderPrintView(container, {
      title: M.title + ' · ' + M.variant(v.num),
      sub: EXAM.badge,
      exam: EXAM.id,
      sections: v.sections,
      onBack: introScreen,
    });
  }

  // ---- Прохождение: общий таймер + разделы по очереди ----
  function runExam(v) {
    const answers = {};           // состояние ответов (переживает навигацию между разделами)
    let secIdx = 0;
    const deadline = Date.now() + totalMinutes(v) * 60000;

    const timerEl = el('span', { class: 'mock-timer' });
    function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function tick() {
      const left = deadline - Date.now();
      timerEl.textContent = '⏱ ' + fmt(left);
      timerEl.classList.toggle('low', left <= 5 * 60000);
      if (left <= 0) { clearTimer(); finishExam(v, answers, true); }
    }
    clearTimer(); tick(); timerId = setInterval(tick, 1000);

    function showSection() {
      const sec = v.sections[secIdx];
      const last = secIdx === v.sections.length - 1;
      const body = el('div', { class: 'mock-sec-body' }, renderSection(sec, answers));
      const navBtn = el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '18px' },
        text: last ? M.finishBtn : M.nextSection,
        onclick: () => { if (last) confirmFinish(v, answers); else { secIdx++; showSection(); } } });
      mount(container, el('div', { class: 'view mock-run' }, [
        el('div', { class: 'mock-bar' }, [
          el('div', { class: 'mock-bar-l' }, [
            el('div', { class: 'mock-step', text: M.sectionOf(secIdx + 1, v.sections.length) }),
            el('div', { class: 'mock-sec-title', text: sec.title }),
          ]),
          timerEl,
        ]),
        el('div', { class: 'mock-scroll' }, [body, navBtn]),
      ]));
      const sc = container.querySelector('.mock-scroll'); if (sc) sc.scrollTop = 0;
    }
    showSection();
  }

  function confirmFinish(v, answers) {
    const back = el('div', { class: 'modal-back' });
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.appendChild(el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-title', text: M.finishTitle }),
      el('div', { class: 'modal-text', text: M.finishWarn }),
      el('button', { class: 'btn btn-primary btn-block', text: M.finishBtn, onclick: () => { close(); finishExam(v, answers, false); } }),
      el('button', { class: 'btn btn-ghost btn-block', text: M.keepGoing, onclick: close }),
    ]));
    document.body.appendChild(back);
  }

  // ---- Рендер раздела без обратной связи ----
  function renderSection(sec, answers) {
    const out = [];
    if (sec.id === 'speaking') return renderSpeakingSection(sec, answers);
    if (sec.id === 'listening') {
      out.push(el('div', { class: 'mock-hint', text: M.listenHint }));
      out.push(el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: sec.audio }));
    }
    (sec.items || []).forEach((it, i) => out.push(renderItem(sec, it, i, answers)));
    if (sec.id === 'writing') out.push(renderWritingItem(sec, answers));
    return out;
  }

  // Раздел «Говорение»: 3 задания, запись под таймер, БЕЗ эталонов (оценка ИИ в конце).
  function renderSpeakingSection(sec, answers) {
    const out = [el('div', { class: 'mock-hint', text: M.speakHint })];
    sec.tasks.forEach((tk, ti) => {
      const akey = 'spk:' + ti;
      const heads = { read: M.spkRead, survey: M.spkSurvey, monologue: M.spkMono, ask: M.spkAsk, interview: M.spkInterview, compare: M.spkCompare };
      let promptEl;
      if (tk.instruction) { // ЕГЭ: инструкция + картинки + аудио (интервью)
        const kids = [el('div', { class: 'sp-instr', text: tk.instruction })];
        (tk.images || []).forEach((u) => kids.push(el('img', { class: 'sp-img', src: u, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })));
        if (tk.audio) kids.push(el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: tk.audio }));
        promptEl = el('div', {}, kids);
      } else if (tk.kind === 'read') promptEl = el('div', { class: 'sp-text', text: tk.text });
      else if (tk.kind === 'survey') promptEl = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: tk.audio });
      else promptEl = el('div', {}, [el('div', { class: 'mock-letter-q', text: tk.topic }), el('ol', { class: 'sp-plan' }, (tk.plan || []).map((p) => el('li', { text: p })))]);
      const recd = el('div', { class: 'sp-rec-hint', text: answers[akey] ? M.spkRecorded : '' });
      const rwrap = mockRecorder((blob) => { answers[akey] = blob; recd.textContent = M.spkRecorded; });
      out.push(el('div', { class: 'mock-q' }, [
        el('div', { class: 'mock-qt', text: (ti + 1) + '. ' + (heads[tk.kind] || '') }),
        promptEl, rwrap, recd,
      ]));
    });
    return out;
  }

  // Компактный диктофон (как в разделе говорения): запись/стоп/переслушать, отдаёт blob.
  function mockRecorder(onBlob) {
    const SP = t.speaking || t.egeSpeaking || {}; // ОГЭ ru / ЕГЭ en строки диктофона
    let mr = null, stream = null, url = null, chunks = [];
    const player = el('audio', { class: 'sp-audio', controls: '', style: { display: 'none' } });
    const timer = el('span', { class: 'sp-timer', text: '0:00' });
    let t0 = 0, tick = null;
    const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const btn = el('button', { class: 'btn btn-rec btn-block', text: SP.recStart });
    const hint = el('div', { class: 'sp-rec-hint', text: '' });
    function stopTracks() { if (stream) stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { hint.textContent = SP.micErr; return; }
      chunks = []; mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob); player.src = url; player.style.display = 'block';
        stopTracks(); onBlob(blob);
      };
      mr.start(); t0 = 0; timer.textContent = '0:00';
      tick = setInterval(() => { t0 += 1; timer.textContent = fmt(t0); }, 1000);
      btn.className = 'btn btn-rec rec-on btn-block'; btn.textContent = SP.recStop; hint.textContent = SP.recOn;
    }
    function stop() {
      if (mr && mr.state !== 'inactive') mr.stop();
      clearInterval(tick);
      btn.className = 'btn btn-rec done btn-block'; btn.textContent = SP.recAgain; hint.textContent = '';
    }
    btn.addEventListener('click', () => { if (!mr || mr.state === 'inactive') start(); else stop(); });
    return el('div', { class: 'sp-recorder' }, [el('div', { class: 'sp-rec-row' }, [btn, timer]), hint, player]);
  }

  function qnum(sec, i) { return el('span', { class: 'mock-qn', text: '№ ' + (i + 1) }); }

  function renderItem(sec, it, i, answers) {
    if (it.kind === 'choice') return choiceItem(it, i, answers);
    if (it.kind === 'fill') return fillItem(it, i, answers);
    if (it.kind === 'match') return lmatchItem(it, i, answers);
    if (it.kind === 'rmatch') return rmatchItem(it, answers);
    if (it.kind === 'gaps') return gapsItem(it, answers);
    if (it.kind === 'textgaps') return textgapsItem(it, answers);
    if (it.kind === 'tfns') return tfnsItem(it, answers);
    if (it.kind === 'gap') return gapItem(it, i, answers);
    return el('div');
  }

  function choiceItem(it, i, answers) {
    const opts = el('div', { class: 'mock-opts' }, it.options.map((o, oi) => {
      const id = 'c_' + it.zid + '_' + oi;
      const inp = el('input', { type: 'radio', name: 'c_' + it.zid, id, value: String(oi + 1) });
      if (answers[it.zid] === String(oi + 1)) inp.checked = true;
      inp.addEventListener('change', () => { answers[it.zid] = String(oi + 1); });
      return el('label', { class: 'mock-opt', for: id }, [inp, el('span', { text: o })]);
    }));
    return el('div', { class: 'mock-q' }, [el('div', { class: 'mock-qt' }, [qnum(null, i), el('span', { text: ' ' + it.q })]), opts]);
  }

  function fillItem(it, i, answers) {
    const inp = el('input', { class: 'mock-input', type: 'text', value: answers[it.zid] || '', placeholder: M.answerPh });
    inp.addEventListener('input', () => { answers[it.zid] = inp.value; });
    const prompt = it.label ? it.label + ': ' : (it.q ? it.q + ' ' : '');
    return el('div', { class: 'mock-q' }, [el('div', { class: 'mock-qt' }, [qnum(null, i), el('span', { text: ' ' + prompt })]), inp]);
  }

  function lmatchItem(it, i, answers) {
    answers[it.zid] = answers[it.zid] || {};
    const rubrics = el('ol', { class: 'ls-rubrics' }, it.rubrics.map((r) => el('li', { text: r })));
    const rows = it.speakers.map((sp) => {
      const sel = el('select', { class: 'rd-sel' });
      sel.appendChild(el('option', { value: '', text: '—' }));
      it.rubrics.forEach((_, ri) => sel.appendChild(el('option', { value: String(ri + 1), text: String(ri + 1) })));
      if (answers[it.zid][sp]) sel.value = answers[it.zid][sp];
      sel.addEventListener('change', () => { answers[it.zid][sp] = sel.value; });
      return el('div', { class: 'ls-mrow' }, [el('span', { class: 'ls-mlabel', text: sp }), sel]);
    });
    return el('div', { class: 'mock-q' }, [
      el('div', { class: 'mock-qt', text: it.task }),
      el('div', { class: 'ls-rub-title', text: M.rubricsLabel }), rubrics,
      el('div', { class: 'ls-mrows' }, rows),
    ]);
  }

  function rmatchItem(it, answers) {
    answers[it.zid] = answers[it.zid] || {};
    const qList = el('ol', { class: 'rd-qlist' }, it.questions.map((q) => el('li', { text: q })));
    const cards = LETTERS.filter((L) => it.texts[L] != null).map((L) => {
      const sel = el('select', { class: 'rd-sel' });
      sel.appendChild(el('option', { value: '', text: '—' }));
      it.questions.forEach((_, qi) => sel.appendChild(el('option', { value: String(qi + 1), text: String(qi + 1) })));
      if (answers[it.zid][L]) sel.value = answers[it.zid][L];
      sel.addEventListener('change', () => { answers[it.zid][L] = sel.value; });
      return el('div', { class: 'rd-text' }, [
        el('div', { class: 'rd-thead' }, [el('div', { class: 'rd-letter', text: L }), sel]),
        el('div', { class: 'rd-ttext', text: it.texts[L] }),
      ]);
    });
    return el('div', { class: 'mock-q' }, [
      el('div', { class: 'rd-qtitle', text: it.title || M.matchTitle }), qList,
      el('div', { class: 'rd-texts' }, cards),
    ]);
  }

  // EGE «вставка частей»: пассаж с маркерами {A}..{F} + список частей, select на каждый пропуск.
  function gapsItem(it, answers) {
    answers[it.zid] = answers[it.zid] || {};
    const parts = el('ol', { class: 'rd-qlist' }, it.parts.map((p) => el('li', { text: p })));
    const wrap = el('div', { class: 'mock-gaps-passage' });
    const chunks = (it.passage || '').split(/\{([A-F])\}/);
    chunks.forEach((ch, idx) => {
      if (idx % 2 === 0) { if (ch) wrap.appendChild(el('span', { text: ch })); return; }
      const L = ch; // буква пропуска
      const sel = el('select', { class: 'rd-sel rd-sel-inline' });
      sel.appendChild(el('option', { value: '', text: L }));
      it.parts.forEach((_, pi) => sel.appendChild(el('option', { value: String(pi + 1), text: String(pi + 1) })));
      if (answers[it.zid][L]) sel.value = answers[it.zid][L];
      sel.addEventListener('change', () => { answers[it.zid][L] = sel.value; });
      wrap.appendChild(sel);
    });
    return el('div', { class: 'mock-q' }, [
      el('div', { class: 'rd-qtitle', text: M.gapsTitle }),
      el('div', { class: 'mock-parts-title', text: M.partsLabel }), parts,
      wrap,
    ]);
  }

  // связный текст с пропусками (ЕГЭ грам.19-24 / словообр.25-29): абзац с инлайн-полями + база
  function textgapsItem(it, answers) {
    const head = el('div', { class: 'mock-tg-h', text: it.sub === 'wordform' ? M.tgWordform : M.tgGrammar });
    const para = el('div', { class: 'mock-tg-text' });
    (it.gaps || []).forEach((gp) => {
      const parts = (gp.text || '').split(/_{3,}/);
      para.appendChild(document.createTextNode(parts[0] || ''));
      const inp = el('input', { class: 'mock-gapinput', type: 'text', value: answers[gp.zid] || '' });
      inp.addEventListener('input', () => { answers[gp.zid] = inp.value; });
      para.appendChild(inp);
      if (gp.base_word) para.appendChild(el('span', { class: 'mock-tg-base', text: ' [' + gp.base_word + '] ' }));
      para.appendChild(document.createTextNode(parts[1] || ' '));
    });
    return el('div', { class: 'mock-q' }, [head, para]);
  }

  function tfnsItem(it, answers) {
    const key = 'tf:' + it.group;
    answers[key] = answers[key] || {};
    const labels = M.tfLabels; // ['Верно','Неверно','Не сказано']
    const rows = it.statements.map((st) => {
      const btns = ['1', '2', '3'].map((v, vi) => {
        const b = el('button', { class: 'tf-btn', text: labels[vi] });
        if (answers[key][st.num] === v) b.classList.add('sel');
        b.addEventListener('click', () => {
          answers[key][st.num] = v;
          b.parentNode.querySelectorAll('.tf-btn').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
        });
        return b;
      });
      return el('div', { class: 'mock-tf' }, [
        el('div', { class: 'mock-tf-s', text: st.num + '. ' + st.statement }),
        el('div', { class: 'mock-tf-btns' }, btns),
      ]);
    });
    return el('div', { class: 'mock-q' }, [
      el('div', { class: 'rd-ttext mock-rtext', text: it.text }),
      el('div', { class: 'mock-tf-title', text: M.tfTitle }),
      ...rows,
    ]);
  }

  function gapItem(it, i, answers) {
    const inp = el('input', { class: 'mock-input', type: 'text', value: answers[it.zid] || '', placeholder: M.answerPh });
    inp.addEventListener('input', () => { answers[it.zid] = inp.value; });
    const txt = it.text.replace(/_{3,}/, ' ____ ');
    return el('div', { class: 'mock-q' }, [
      el('div', { class: 'mock-qt' }, [qnum(null, i), it.base_word ? el('span', { class: 'mock-base', text: ' ' + it.base_word }) : null]),
      el('div', { class: 'mock-gaptext', text: txt }),
      inp,
    ]);
  }

  function renderWritingItem(sec, answers) {
    const tk = sec.task;
    const akey = 'w:' + (sec.wkind || 'letter');
    const ta = el('textarea', { class: 'mock-textarea', rows: '10', placeholder: M.writePh, value: answers[akey] || '' });
    ta.addEventListener('input', () => { answers[akey] = ta.value; updateWc(); });
    const wc = el('div', { class: 'mock-wc' });
    function updateWc() { const n = (ta.value.trim().match(/\S+/g) || []).length; wc.textContent = M.words(n); }
    updateWc();
    // ОГЭ-письмо: контекст + вопросы; ЕГЭ email/essay: один prompt
    const card = tk.prompt
      ? el('div', { class: 'letter-card' }, [el('div', { class: 'mock-letter-q', text: tk.prompt })])
      : el('div', { class: 'letter-card' }, [
          tk.context ? el('div', { class: 'mock-letter-ctx', text: tk.context }) : null,
          el('div', { class: 'mock-letter-q', text: tk.questions || '' }),
        ]);
    const instr = sec.words ? M.writeWords(sec.words[0], sec.words[1]) : M.writeInstr;
    return el('div', { class: 'mock-q' }, [card, el('div', { class: 'mock-write-instr', text: instr }), ta, wc]);
  }

  // ---- Подсчёт по завершении ----
  async function finishExam(v, answers, auto) {
    clearTimer();
    const loader = el('div', { class: 'loader', text: M.scoring });
    mount(container, el('div', { class: 'view' }, [secBar(M.title), loader]));

    const byKes = {};
    function add(kes, correct) { const b = byKes[kes] = byKes[kes] || { correct: 0, total: 0 }; b.total++; if (correct) b.correct++; }
    const secScores = [];

    for (const sec of v.sections) {
      if (sec.id === 'writing' || sec.id === 'speaking') continue;
      let sc = 0, rawN = 0; // sc — верных «сырых» заданий, rawN — всего «сырых» заданий
      for (const it of sec.items) {
        if (it.kind === 'choice' || it.kind === 'fill' || it.kind === 'gap') {
          const ok = keyOk(answers[it.zid], it.key); add(it.kes, ok); rawN++; if (ok) sc++;
        } else if (it.kind === 'textgaps') {
          (it.gaps || []).forEach((gp) => { const ok = keyOk(answers[gp.zid], gp.key); add(gp.kes || it.kes, ok); rawN++; if (ok) sc++; });
        } else if (it.kind === 'match') {
          const a = answers[it.zid] || {};
          it.speakers.forEach((sp, idx) => { const ok = (a[sp] || '') === it.key[idx]; add(it.kes, ok); rawN++; if (ok) sc++; });
        } else if (it.kind === 'rmatch') {
          const a = answers[it.zid] || {};
          LETTERS.filter((L) => it.texts[L] != null).forEach((L, idx) => { const ok = (a[L] || '') === it.answer[idx]; add(it.kes, ok); rawN++; if (ok) sc++; });
        } else if (it.kind === 'gaps') {
          const a = answers[it.zid] || {};
          (it.gaps || LETTERS).forEach((L, idx) => { const ok = (a[L] || '') === it.answer[idx]; add(it.kes, ok); rawN++; if (ok) sc++; });
        } else if (it.kind === 'tfns') {
          const a = answers['tf:' + it.group] || {};
          it.statements.forEach((st) => { const ok = (a[st.num] || '') === st.answer; add(it.kes, ok); rawN++; if (ok) sc++; });
        }
      }
      // разделы с флагом scaled (ЕГЭ) → масштабируем «сырой» результат к официальному максимуму раздела
      const score = (sec.scaled && rawN) ? Math.round(sc / rawN * sec.maxPts) : sc;
      secScores.push({ id: sec.id, title: sec.title, score, max: sec.maxPts });
    }

    // Письмо — AI (если есть текст и сеть). Иначе — отложенная оценка. Может быть несколько (ЕГЭ: email+essay).
    const wSecs = v.sections.filter((s) => s.id === 'writing');
    const writings = [];
    for (const wSec of wSecs) {
      const wText = (answers['w:' + (wSec.wkind || 'letter')] || '').trim();
      if (!wText) {
        writings.push({ wkind: wSec.wkind, title: wSec.title, status: 'empty', score: 0, max: wSec.maxPts });
        secScores.push({ id: 'writing', title: wSec.title, score: 0, max: wSec.maxPts });
      } else {
        try {
          const res = await evalWriting(wText, wSec);
          writings.push({ wkind: wSec.wkind, title: wSec.title, status: 'graded', score: res.totalScore || 0, max: wSec.maxPts, result: res });
          secScores.push({ id: 'writing', title: wSec.title, score: res.totalScore || 0, max: wSec.maxPts });
        } catch (e) {
          writings.push({ wkind: wSec.wkind, title: wSec.title, status: 'pending', score: null, max: wSec.maxPts });
          // в total письмо не входит, пока не оценено
        }
      }
    }

    // Говорение — распознавание (SpeechKit) + оценка (DeepSeek) по каждому заданию.
    const spSec = v.sections.find((s) => s.id === 'speaking');
    let speaking = null;
    if (spSec) {
      const evalFn = spSec.egespeaking ? evalEgeSpeaking : evalSpeaking; // ЕГЭ vs ОГЭ оценка устной
      const tasks = spSec.tasks || [];
      const perTask = [];
      let spScore = 0, anyOk = false;
      for (let ti = 0; ti < tasks.length; ti++) {
        const tk = tasks[ti];
        const blob = answers['spk:' + ti];
        loader.textContent = M.scoringSpeaking(ti + 1, tasks.length);
        if (!blob) { perTask.push({ kind: tk.kind, status: 'empty', score: 0, max: tk.maxPts }); continue; }
        try {
          const transcript = await recognize(blob);
          const res = await evalFn(tk.kind, tk, transcript);
          const sc = res.totalScore || 0; spScore += sc; anyOk = true;
          perTask.push({ kind: tk.kind, status: 'graded', score: sc, max: tk.maxPts, result: res, transcript });
        } catch (e) {
          perTask.push({ kind: tk.kind, status: 'error', score: 0, max: tk.maxPts });
        }
      }
      if (anyOk) {
        secScores.push({ id: 'speaking', title: spSec.title, score: spScore, max: spSec.maxPts });
        speaking = { status: 'graded', perTask };
      } else {
        speaking = { status: 'pending', perTask }; // офлайн → устная не вошла в баллы
      }
    }

    const autoMax = secScores.reduce((s, x) => s + x.max, 0);
    const total = secScores.reduce((s, x) => s + (x.score || 0), 0);
    const result = {
      date: new Date().toISOString().slice(0, 10),
      variantId: v.id, num: v.num, total, max: autoMax,
      sections: secScores, byKes,
      writing: writings.map((w) => ({ wkind: w.wkind, status: w.status, score: w.score, max: w.max })),
      speaking: speaking ? { status: speaking.status } : null,
      full: !!(spSec && speaking && speaking.status === 'graded'),
      auto,
    };
    recordMock(result);
    // немного XP за пройденный пробник (как тренировка)
    recordRound('mock', total > 0 ? 1 : 0, 1);

    resultScreen(v, result, writings, speaking, auto);
  }

  function resultScreen(v, result, writings, speaking, auto) {
    const pct = result.max ? Math.round(result.total / result.max * 100) : 0;
    const rows = result.sections.map((s) => el('div', { class: 'mock-res-row' }, [
      el('div', { class: 'mrr-t', text: s.title }),
      el('div', { class: 'mrr-v', text: (s.score == null ? '—' : s.score) + ' / ' + s.max }),
    ]));
    // КЭС
    const kesRows = Object.keys(result.byKes).sort().map((k) => {
      const b = result.byKes[k];
      return el('div', { class: 'mock-kes-row' }, [
        el('span', { class: 'mkr-k', text: k }),
        el('span', { class: 'mkr-v', text: b.correct + '/' + b.total }),
      ]);
    });

    const wNotes = (writings || []).filter((w) => w.status === 'pending' || w.status === 'empty')
      .map((w) => el('div', { class: 'mock-wnote', text: (w.status === 'pending' ? M.writePending : M.writeEmpty) + (w.title ? ' (' + w.title + ')' : '') }));
    const wFb = (writings || []).filter((w) => w.status === 'graded').map((w) => writingFeedback(w.result, w.title));

    // ЕГЭ: прогноз тестового балла (100-балльная). Считаем по % за письменную, проецируя тот же
    // уровень на устную часть: первичный 0-82 → тестовый по таблице ФИПИ.
    let testCard = null;
    if (p2t && result.max) {
      // result.full (устная оценена, max=82) → реальный первичный = total; иначе проекция % на 82
      const projPrimary = Math.max(1, Math.min(82, result.full ? result.total : Math.round(result.total / result.max * 82)));
      const testScore = p2t[projPrimary] || p2t[String(projPrimary)] || 0;
      testCard = el('div', { class: 'mock-test' }, [
        el('div', { class: 'mock-test-v', text: M.testProj(testScore) }),
        el('div', { class: 'mock-test-n', text: result.full ? M.testProjReal : M.testProjNote }),
      ]);
    }
    // ОГЭ: отметка 2–5. Если устная часть оценена (result.full) — отметка РЕАЛЬНАЯ по сумме;
    // иначе проецируем % за письменную на полный балл (письменная+устная).
    if (gradeScale && gradeScale.length && result.max) {
      const fullMax = gradeScale[gradeScale.length - 1].max;
      const projFull = result.full ? result.total : Math.round(result.total / result.max * fullMax);
      const g = gradeScale.find((x) => projFull >= x.min && projFull <= x.max) || gradeScale[0];
      testCard = el('div', { class: 'mock-test grade-' + g.grade }, [
        el('div', { class: 'mock-test-v', text: (result.full ? M.gradeReal : M.gradeProj)(g.grade) }),
        el('div', { class: 'mock-test-n', text: result.full ? M.gradeRealNote : M.gradeProjNote }),
      ]);
    }

    // Говорение — обратная связь по заданиям / пометка, что не вошло
    const spNote = (speaking && speaking.status === 'pending')
      ? el('div', { class: 'mock-wnote', text: M.speakPending }) : null;
    const spFb = (speaking && speaking.perTask || []).filter((p) => p.status === 'graded')
      .map((p) => speakFeedback(p));

    mount(container, el('div', { class: 'result view' }, [
      el('div', { class: 'mock-result-hero' }, [
        auto ? el('div', { class: 'mock-auto', text: M.timeUp }) : null,
        el('div', { class: 'mock-big', text: result.total + ' / ' + result.max }),
        el('div', { class: 'mock-big-sub', text: (result.full ? M.pointsFull : M.pointsScored)(pct) }),
        el('div', { class: 'mock-note', text: result.full ? M.fullPartNote : M.writtenPartNote }),
        testCard,
      ]),
      ...wNotes,
      spNote,
      el('div', { class: 'mock-res-card' }, [el('div', { class: 'mock-res-h', text: M.bySection }), ...rows]),
      ...wFb,
      ...spFb,
      kesRows.length ? el('div', { class: 'mock-res-card' }, [el('div', { class: 'mock-res-h', text: M.byKes }), el('div', { class: 'mock-kes', text: '' }), ...kesRows]) : null,
      el('button', { class: 'btn btn-primary btn-block', text: M.backToList, onclick: introScreen }),
      el('div', { class: 'row-actions' }, [el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome })]),
    ]));
  }

  function speakFeedback(p) {
    const titles = { read: M.spkRead, survey: M.spkSurvey, monologue: M.spkMono };
    const res = p.result || {};
    const crit = (res.criteria || []).map((c) => el('div', { class: 'mock-crit' }, [
      el('span', { class: 'mc-code', text: c.code }),
      el('span', { class: 'mc-name', text: c.name + (c.comment ? ' — ' + c.comment : '') }),
      el('span', { class: 'mc-sc', text: (c.score ?? '–') + '/' + c.max }),
    ]));
    return el('div', { class: 'mock-res-card' }, [
      el('div', { class: 'mock-res-h', text: M.speakResult + ' · ' + (titles[p.kind] || '') + ' — ' + p.score + '/' + p.max }),
      res.verdict ? el('div', { class: 'mock-verdict', text: res.verdict }) : null,
      ...crit,
    ]);
  }

  function writingFeedback(res, title) {
    const crit = (res.criteria || []).map((c) => el('div', { class: 'mock-crit' }, [
      el('span', { class: 'mc-code', text: c.code }),
      el('span', { class: 'mc-name', text: c.name }),
      el('span', { class: 'mc-sc', text: (c.score ?? '–') + '/' + c.max }),
    ]));
    return el('div', { class: 'mock-res-card' }, [
      el('div', { class: 'mock-res-h', text: M.writingResult + (title ? ' · ' + title : '') }),
      res.verdict ? el('div', { class: 'mock-verdict', text: res.verdict }) : null,
      ...crit,
    ]);
  }

  // AI-оценка письма — по критериям из задания (ОГЭ-письмо ru / ЕГЭ email|essay en).
  async function evalWriting(text, sec) {
    const wcN = (text.trim().match(/\S+/g) || []).length;
    const task = sec.task;
    const crit = sec.criteria || [];
    const critSpec = crit.map((c) => `${c.code} (max ${c.max}): ${c.name}`).join('; ');
    const critJson = crit.map((c) => `{"code":"${c.code}","name":"${c.name}","score":<0-${c.max}>,"max":${c.max},"comment":"<...>"}`).join(',');
    const stim = task.prompt || ((task.context || '') + ' ' + (task.questions || ''));
    const mx = crit.reduce((s, c) => s + c.max, 0);
    let sys, user;
    if (sec.lang === 'en') {
      const kind = sec.wkind === 'essay'
        ? 'task 38, a data-based opinion essay (200-250 words): opening, report facts, comparisons with comments, a problem and a solution, conclusion with own opinion.'
        : 'task 37, a personal email (100-140 words): answer the friend\'s questions AND ask 3 questions, correct opening, closing phrase and name.';
      sys = 'You are a strict but kind English exam examiner. Assess strictly by the official criteria and reply ONLY with valid JSON, no markdown. Comments in English, B1, short.';
      user = `Task: ${kind}\nCriteria: ${critSpec}.\n\nPrompt:\n"""${stim}"""\n\nStudent's writing (${wcN} words):\n"""${text}"""\n\nReturn JSON exactly: {"totalScore":<0-${mx}>,"criteria":[${critJson}],"verdict":"<1-2 sentences, English>"}\ntotalScore = sum of criteria. If К1 (communicative task) is 0, the whole task is 0.`;
    } else {
      sys = 'Ты строгий экзаменатор ОГЭ по английскому. Оцениваешь личное письмо (задание 35) строго по официальным критериям ФИПИ. Возвращаешь ТОЛЬКО валидный JSON, без markdown. Комментарии — по-русски.';
      user = `Критерии: ${critSpec}. Объём ${sec.words ? sec.words[0] + '–' + sec.words[1] : '100–120'} слов.\nКонтекст письма друга: ${stim}\n\nПисьмо ученика (${wcN} слов):\n"""${text}"""\n\nВерни JSON строго так:\n{"totalScore":<0-${mx}>,"criteria":[${critJson}],"verdict":"<1-2 предложения по-русски>"}\nВ ОГЭ встречные вопросы НЕ требуются. totalScore = сумма по критериям. ВАЖНО: если К1=0, всё задание = 0.`;
    }
    const r = await fetch(WORKER, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1500,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || 'err');
    if (!d.choices || !d.choices[0]) throw new Error('empty');
    return JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
  }

  introScreen();
}
