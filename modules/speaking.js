// speaking.js — раздел «Говорение» (Шаг 1: диктофон + эталоны + чеклист само-оценки; AI-проверка — позже).
// 3 типа: чтение вслух (текст + TTS-эталон), телефон-опрос (аудио-вопросы), монолог (тема + план).
// Запись голоса — MediaRecorder; всё локально (на сервер ничего не уходит).

import { el, mount, iconImg, celebrate } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordRound, getName, getSpeakingDone, markSpeakingDone } from '../js/gamify.js';
import { speak, canSpeak, pauseSpeak, resumeSpeak, stopSpeak } from '../js/speak.js';
import { recognize, canRecognize } from '../js/stt.js';
import { evalSpeaking } from '../js/speakeval.js';
import { getActiveTheme } from '../js/vocab_srs.js';
import { themeName, allThemeNames } from '../js/themes.js';
import { t } from '../js/exam.js';
import { tipButton, autoTipOnce } from '../js/tips.js';

const SECTION = 'speaking';
function randInt(n) { return Math.floor(Math.random() * n); }

export async function renderSpeaking(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let data;
  try { data = await loadJSON(cfg.dataFile || 'oge_speaking'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }

  const S = t.speaking;
  const title = t.sections.speaking;
  const CATS = [
    { key: 'read', label: S.catRead, arr: data.read, icon: '📖' },
    { key: 'survey', label: S.catSurvey, arr: data.survey, icon: '📞' },
    { key: 'monologue', label: S.catMono, arr: data.monologue, icon: '🗣' },
  ].filter((c) => c.arr && c.arr.length);
  menuScreen();
  autoTipOnce('speaking');

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar speaking' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: title }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
      tipButton('speaking'),
    ]);
  }

  // подпись карточки задания в списке (монолог — тема; опрос — «Опрос: тема»; чтение — фрагмент)
  function cardLabel(kind, item, names) {
    if (kind === 'monologue') return cap(item.topic || '');
    if (kind === 'survey') {
      const th = names && names[item.theme];
      return th ? S.surveyCard(th) : shorten(item.questions && item.questions[0] || '', 56);
    }
    return shorten(item.text || '', 56);
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function shorten(s, n) { s = (s || '').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }

  // --- Меню: 3 типа заданий → список заданий ---
  function menuScreen() {
    stopSpeak();
    const cards = CATS.map((c) => {
      const done = countDone(c.key, c.arr);
      return el('button', { class: 'all-topics speaking', onclick: () => listScreen(c.key) }, [
        el('div', { class: 'at-ic' }, [el('div', { class: 'sp-emo', text: c.icon })]),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'at-t', text: c.label }),
          el('div', { class: 'at-s', text: S.taskCount(c.arr.length) + (done ? ' · ' + S.doneOf(done, c.arr.length) : '') }),
        ]),
        el('div', { class: 'at-arrow', text: '→' }),
      ]);
    });
    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, S.pick),
      el('div', { class: 'topics-body' }, [el('div', { class: 'topics-label', text: S.pick }), ...cards]),
    ]));
  }

  function countDone(kind, arr) {
    const d = getSpeakingDone();
    return arr.reduce((n, it) => n + (d[kind + ':' + it.zid] ? 1 : 0), 0);
  }

  // --- Список заданий одного типа: случайное + тема недели сверху + остальные, с отметками ---
  async function listScreen(kind) {
    stopSpeak();
    const cat = CATS.find((c) => c.key === kind);
    const arr = cat.arr;
    const doneMap = getSpeakingDone();
    let active = '', activeName = '', names = {};
    try { active = getActiveTheme(); activeName = active ? await themeName(active) : ''; names = await allThemeNames(); } catch {}

    const taskBtn = (it, i) => {
      const isDone = !!doneMap[kind + ':' + it.zid];
      return el('button', { class: 'sp-item' + (isDone ? ' done' : ''), onclick: () => startTask(kind, it) }, [
        el('span', { class: 'sp-item-n', text: '№ ' + (i + 1) }),
        el('span', { class: 'sp-item-t', text: cardLabel(kind, it, names) }),
        el('span', { class: 'sp-item-chk', text: isDone ? '✓' : '' }),
      ]);
    };

    const list = el('div', { class: 'sp-list' });
    // случайное задание сверху
    list.appendChild(el('button', { class: 'btn btn-primary btn-block sp-random', text: '🎲 ' + S.randomTask,
      onclick: () => startTask(kind, arr[randInt(arr.length)]) }));
    // тема недели — наверх
    const themed = [], rest = [];
    arr.forEach((it, i) => ((active && it.theme === active) ? themed : rest).push([it, i]));
    if (themed.length) {
      list.appendChild(el('div', { class: 'topics-label', text: t.vocab.themeWeekLabel(activeName || S.catLabel(kind)) }));
      themed.forEach(([it, i]) => list.appendChild(taskBtn(it, i)));
      if (rest.length) list.appendChild(el('div', { class: 'topics-label', text: t.wAllLetters }));
    }
    rest.forEach(([it, i]) => list.appendChild(taskBtn(it, i)));

    mount(container, el('div', { class: 'view' }, [
      secBar(menuScreen, cat.label),
      el('div', { class: 'topics-body' }, [list]),
    ]));
    const v = container.querySelector('.view'); if (v) v.scrollTop = 0;
  }

  // --- Диктофон (MediaRecorder): запись / стоп / переслушать / перезаписать ---
  // Возвращает { wrap, getBlob, onRecorded } — getBlob отдаёт последнюю запись (для ИИ-проверки).
  function recorder() {
    let mr = null, stream = null, url = null, chunks = [], lastBlob = null, recordedCb = null;
    const player = el('audio', { class: 'sp-audio', controls: '', style: { display: 'none' } });
    const timer = el('span', { class: 'sp-timer', text: '0:00' });
    let t0 = 0, tick = null;
    const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const btn = el('button', { class: 'btn btn-rec btn-block', text: S.recStart });
    const hint = el('div', { class: 'sp-rec-hint', text: '' });

    function stopTracks() { if (stream) stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { hint.textContent = S.micErr; return; }
      chunks = [];
      mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        lastBlob = blob;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        player.src = url; player.style.display = 'block';
        stopTracks();
        if (recordedCb) recordedCb(blob);
      };
      mr.start();
      t0 = 0; timer.textContent = '0:00';
      tick = setInterval(() => { t0 += 1; timer.textContent = fmt(t0); }, 1000);
      btn.className = 'btn btn-rec rec-on btn-block'; btn.textContent = S.recStop;
      hint.textContent = S.recOn;
    }
    function stop() {
      if (mr && mr.state !== 'inactive') mr.stop();
      clearInterval(tick);
      btn.className = 'btn btn-rec done btn-block'; btn.textContent = S.recAgain;
      hint.textContent = '';
    }
    btn.addEventListener('click', () => { if (!mr || mr.state === 'inactive') start(); else stop(); });
    const wrap = el('div', { class: 'sp-recorder' }, [
      el('div', { class: 'sp-rec-row' }, [btn, timer]),
      hint, player,
    ]);
    return { wrap, getBlob: () => lastBlob, onRecorded: (cb) => { recordedCb = cb; } };
  }

  // блок чеклиста критериев (само-оценка)
  function checklist(items) {
    return el('div', { class: 'sp-crit' }, [
      el('div', { class: 'sp-crit-h', text: S.critTitle }),
      el('ul', { class: 'sp-crit-list' }, items.map((it) => el('li', {}, [
        el('label', {}, [el('input', { type: 'checkbox', class: 'sp-chk' }), el('span', { text: ' ' + it })]),
      ]))),
    ]);
  }

  // Кнопка эталона: плей → пауза/продолжить + стоп (остановить в любой момент).
  function spkBtn(text) {
    if (!canSpeak()) return null;
    let state = 'idle'; // idle | playing | paused
    const play = el('button', { class: 'btn btn-ghost sp-tts', text: '🔊 ' + S.listenModel });
    const stop = el('button', { class: 'btn btn-ghost sp-tts-stop', text: '⏹', title: S.ttsStop, style: { display: 'none' } });
    function reset() { state = 'idle'; play.textContent = '🔊 ' + S.listenModel; stop.style.display = 'none'; }
    play.addEventListener('click', () => {
      if (state === 'idle') {
        state = 'playing';
        play.textContent = '⏸ ' + S.ttsPause;
        stop.style.display = '';
        speak(text, { onend: reset });
      } else if (state === 'playing') {
        state = 'paused'; pauseSpeak(); play.textContent = '▶️ ' + S.ttsResume;
      } else {
        state = 'playing'; resumeSpeak(); play.textContent = '⏸ ' + S.ttsPause;
      }
    });
    stop.addEventListener('click', () => { stopSpeak(); reset(); });
    return el('div', { class: 'sp-tts-row' }, [play, stop]);
  }

  // Свёрнутый «образец ответа» (эталон) с кнопкой проигрывания.
  function sampleBlock(text) {
    if (!text) return null;
    const body = el('div', { class: 'sp-sample-body', style: { display: 'none' } }, [
      spkBtn(text),
      el('div', { class: 'sp-sample-text', text }),
    ]);
    let open = false;
    const head = el('button', { class: 'sp-sample-head' }, [
      el('span', { text: '📝 ' + S.sampleTitle }),
      el('span', { class: 'sp-sample-chev', text: '▾' }),
    ]);
    head.addEventListener('click', () => { open = !open; body.style.display = open ? '' : 'none'; head.querySelector('.sp-sample-chev').textContent = open ? '▴' : '▾'; });
    return el('div', { class: 'sp-sample' }, [head, body]);
  }

  // Вопросы опроса + образцы ответов (свёрнуто): каждый вопрос → эталонный ответ с озвучкой.
  function surveySampleBlock(questions, samples) {
    if (!questions || !questions.length) return null;
    const rows = questions.map((q, i) => {
      const ans = samples && samples[i];
      const kids = [el('div', { class: 'sp-qa-q', text: (i + 1) + '. ' + q })];
      if (ans) { kids.push(el('div', { class: 'sp-qa-a', text: ans })); kids.push(spkBtn(ans)); }
      return el('div', { class: 'sp-qa' }, kids);
    });
    const body = el('div', { class: 'sp-sample-body', style: { display: 'none' } }, rows);
    let open = false;
    const head = el('button', { class: 'sp-sample-head' }, [
      el('span', { text: '📝 ' + (samples ? S.sampleTitle : S.surveyQs) }),
      el('span', { class: 'sp-sample-chev', text: '▾' }),
    ]);
    head.addEventListener('click', () => { open = !open; body.style.display = open ? '' : 'none'; head.querySelector('.sp-sample-chev').textContent = open ? '▴' : '▾'; });
    return el('div', { class: 'sp-sample' }, [head, body]);
  }

  // Кнопка «послушать носителя по теме» — фрагмент из аудирования (если подобран).
  function nativeBlock(native) {
    if (!native || !native.audio) return null;
    const au = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: native.audio });
    const btn = el('button', { class: 'btn btn-ghost sp-native', text: '🎧 ' + S.listenNative,
      onclick: () => { try { au.currentTime = native.s || 0; au.play(); } catch {} } });
    return el('div', { class: 'sp-native-wrap' }, [btn, au]);
  }

  // --- ИИ-проверка: запись → распознавание (SpeechKit) → оценка по критериям (DeepSeek) ---
  function aiCheck(kind, item, rec) {
    if (!canRecognize()) return null;
    const out = el('div', { class: 'sp-ai-out' });
    const btn = el('button', { class: 'btn btn-ghost sp-ai-btn', text: '🤖 ' + S.aiCheck });
    const hint = (txt, cls) => out.replaceChildren(el('div', { class: cls || 'sp-ai-hint', text: txt }));
    btn.addEventListener('click', async () => {
      const blob = rec.getBlob();
      if (!blob) { hint(S.aiNoRec); return; }
      btn.disabled = true;
      hint(S.aiRecognizing);
      let transcript;
      try { transcript = await recognize(blob, (d, n) => hint(`${S.aiRecognizing} (${d}/${n})`)); }
      catch (e) { hint(S.aiErr + ' ' + (e.message || ''), 'sp-ai-err'); btn.disabled = false; return; }
      if (!transcript) { hint(S.aiEmpty, 'sp-ai-err'); btn.disabled = false; return; }
      hint(S.aiEvaluating);
      try { out.replaceChildren(aiResult(await evalSpeaking(kind, item, transcript), transcript)); }
      catch (e) { hint(S.aiErr + ' ' + (e.message || ''), 'sp-ai-err'); }
      btn.disabled = false;
    });
    return el('div', { class: 'sp-ai' }, [btn, out]);
  }

  function aiResult(res, transcript) {
    const crit = (res.criteria || []).map((c) => el('div', { class: 'mock-crit' }, [
      el('span', { class: 'mc-code', text: c.code }),
      el('span', { class: 'mc-name', text: c.name + (c.comment ? ' — ' + c.comment : '') }),
      el('span', { class: 'mc-sc', text: (c.score ?? '–') + '/' + c.max }),
    ]));
    let openT = false;
    const tBody = el('div', { class: 'sp-sample-text', style: { display: 'none' }, text: transcript });
    const tHead = el('button', { class: 'sp-sample-head' }, [
      el('span', { text: '🗒 ' + S.aiTranscript }), el('span', { class: 'sp-sample-chev', text: '▾' }),
    ]);
    tHead.addEventListener('click', () => { openT = !openT; tBody.style.display = openT ? '' : 'none'; tHead.querySelector('.sp-sample-chev').textContent = openT ? '▴' : '▾'; });
    return el('div', { class: 'sp-ai-card' }, [
      el('div', { class: 'sp-ai-score', text: (res.totalScore ?? '–') + ' / ' + res.max }),
      res.verdict ? el('div', { class: 'sp-ai-verdict', text: res.verdict }) : null,
      ...crit,
      el('div', { class: 'sp-ai-note', text: S.aiNote }),
      el('div', { class: 'sp-sample' }, [tHead, tBody]),
    ].filter(Boolean));
  }

  // --- Экран задания ---
  function startTask(kind, item) {
    let body;
    const rec = recorder();
    if (kind === 'read') {
      body = [
        el('div', { class: 'sp-instr', text: S.readInstr }),
        el('div', { class: 'sp-text', text: item.text }),
        spkBtn(item.text),
        el('div', { class: 'sp-step', text: S.yourTurn }),
        rec.wrap,
        aiCheck(kind, item, rec),
        checklist(S.critRead),
      ].filter(Boolean);
    } else if (kind === 'survey') {
      const au = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: item.audio });
      body = [
        el('div', { class: 'sp-instr', text: S.surveyInstr }),
        el('div', { class: 'sp-step', text: '🔊 ' + S.surveyPlay }),
        au,
        el('div', { class: 'sp-step', text: S.yourTurn }),
        rec.wrap,
        aiCheck(kind, item, rec),
        checklist(S.critSurvey),
        surveySampleBlock(item.questions, item.samples),
      ].filter(Boolean);
    } else {
      body = [
        el('div', { class: 'sp-instr', text: S.monoInstr(item.topic) }),
        el('div', { class: 'sp-plan-h', text: S.planTitle }),
        el('ol', { class: 'sp-plan' }, item.plan.map((p) => el('li', { text: p }))),
        el('div', { class: 'sp-step', text: S.yourTurn }),
        rec.wrap,
        aiCheck(kind, item, rec),
        checklist(S.critMono),
        sampleBlock(item.sample),
        nativeBlock(item.native),
      ].filter(Boolean);
    }
    const done = el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '18px' }, text: S.doneBtn,
      onclick: () => finish(kind, item) });
    mount(container, el('div', { class: 'view sp-screen' }, [
      secBar(() => listScreen(kind), S['cat' + (kind === 'read' ? 'Read' : kind === 'survey' ? 'Survey' : 'Mono')]),
      el('div', { class: 'sp-body' }, [...body, done]),
    ]));
    const sc = container.querySelector('.sp-screen'); if (sc) sc.scrollTop = 0;
  }

  // --- Завершение: тренировка засчитана (+XP), отметка «выполнено» (без балла — AI позже) ---
  function finish(kind, item) {
    stopSpeak();
    if (kind && item) markSpeakingDone(kind, item.zid);
    const g = recordRound(SECTION, 1, 1);
    mount(container, el('div', { class: 'result view' }, [
      el('div', { class: 'voice-msg', text: S.donePraise(getName() || t.friend) }),
      el('div', { class: 'res-acc', text: S.doneSub }),
      el('div', { class: 'reward' }, [
        el('div', { class: 'reward-line' }, [el('span', { class: 'rl-label' }, [iconImg('ic-xp', '⭐'), el('span', { text: ' ' + t.rXp })]), el('b', { class: 'v-xp', text: '+' + g.xpGained + ' XP' })]),
      ]),
      el('button', { class: 'btn btn-primary btn-block', text: S.more, onclick: () => (kind ? listScreen(kind) : menuScreen()) }),
      el('div', { class: 'row-actions' }, [el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome })]),
    ]));
  }
}
