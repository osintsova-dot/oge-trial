// speaking.js — раздел «Говорение» (Шаг 1: диктофон + эталоны + чеклист само-оценки; AI-проверка — позже).
// 3 типа: чтение вслух (текст + TTS-эталон), телефон-опрос (аудио-вопросы), монолог (тема + план).
// Запись голоса — MediaRecorder; всё локально (на сервер ничего не уходит).

import { el, mount, iconImg, celebrate } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordRound, getName } from '../js/gamify.js';
import { speak, canSpeak, pauseSpeak, resumeSpeak, stopSpeak } from '../js/speak.js';
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

  // --- Меню: 3 типа заданий ---
  function menuScreen() {
    stopSpeak();
    const cats = [
      { key: 'read', label: S.catRead, arr: data.read, icon: '📖' },
      { key: 'survey', label: S.catSurvey, arr: data.survey, icon: '📞' },
      { key: 'monologue', label: S.catMono, arr: data.monologue, icon: '🗣' },
    ].filter((c) => c.arr && c.arr.length);
    const cards = cats.map((c) => el('button', { class: 'all-topics speaking', onclick: () => startTask(c.key, c.arr[randInt(c.arr.length)]) }, [
      el('div', { class: 'at-ic' }, [el('div', { class: 'sp-emo', text: c.icon })]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'at-t', text: c.label }),
        el('div', { class: 'at-s', text: S.taskCount(c.arr.length) }),
      ]),
      el('div', { class: 'at-arrow', text: '→' }),
    ]));
    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, S.pick),
      el('div', { class: 'topics-body' }, [el('div', { class: 'topics-label', text: S.pick }), ...cards]),
    ]));
  }

  // --- Диктофон (MediaRecorder): запись / стоп / переслушать / перезаписать ---
  function recorder() {
    let mr = null, stream = null, url = null, chunks = [];
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
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        player.src = url; player.style.display = 'block';
        stopTracks();
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
    return wrap;
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

  // Кнопка «послушать носителя по теме» — фрагмент из аудирования (если подобран).
  function nativeBlock(native) {
    if (!native || !native.audio) return null;
    const au = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: native.audio });
    const btn = el('button', { class: 'btn btn-ghost sp-native', text: '🎧 ' + S.listenNative,
      onclick: () => { try { au.currentTime = native.s || 0; au.play(); } catch {} } });
    return el('div', { class: 'sp-native-wrap' }, [btn, au]);
  }

  // --- Экран задания ---
  function startTask(kind, item) {
    let body;
    if (kind === 'read') {
      body = [
        el('div', { class: 'sp-instr', text: S.readInstr }),
        el('div', { class: 'sp-text', text: item.text }),
        spkBtn(item.text),
        el('div', { class: 'sp-step', text: S.yourTurn }),
        recorder(),
        checklist(S.critRead),
      ];
    } else if (kind === 'survey') {
      const au = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: item.audio });
      body = [
        el('div', { class: 'sp-instr', text: S.surveyInstr }),
        el('div', { class: 'sp-step', text: '🔊 ' + S.surveyPlay }),
        au,
        el('div', { class: 'sp-step', text: S.yourTurn }),
        recorder(),
        checklist(S.critSurvey),
      ];
    } else {
      body = [
        el('div', { class: 'sp-instr', text: S.monoInstr(item.topic) }),
        el('div', { class: 'sp-plan-h', text: S.planTitle }),
        el('ol', { class: 'sp-plan' }, item.plan.map((p) => el('li', { text: p }))),
        el('div', { class: 'sp-step', text: S.yourTurn }),
        recorder(),
        checklist(S.critMono),
        sampleBlock(item.sample),
        nativeBlock(item.native),
      ].filter(Boolean);
    }
    const done = el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '18px' }, text: S.doneBtn,
      onclick: () => finish() });
    mount(container, el('div', { class: 'view sp-screen' }, [
      secBar(menuScreen, S['cat' + (kind === 'read' ? 'Read' : kind === 'survey' ? 'Survey' : 'Mono')]),
      el('div', { class: 'sp-body' }, [...body, done]),
    ]));
    const sc = container.querySelector('.sp-screen'); if (sc) sc.scrollTop = 0;
  }

  // --- Завершение: тренировка засчитана (+XP), без объективного балла (AI — позже) ---
  function finish() {
    stopSpeak();
    const g = recordRound(SECTION, 1, 1);
    mount(container, el('div', { class: 'result view' }, [
      el('div', { class: 'voice-msg', text: S.donePraise(getName() || t.friend) }),
      el('div', { class: 'res-acc', text: S.doneSub }),
      el('div', { class: 'reward' }, [
        el('div', { class: 'reward-line' }, [el('span', { class: 'rl-label' }, [iconImg('ic-xp', '⭐'), el('span', { text: ' ' + t.rXp })]), el('b', { class: 'v-xp', text: '+' + g.xpGained + ' XP' })]),
      ]),
      el('button', { class: 'btn btn-primary btn-block', text: S.more, onclick: menuScreen }),
      el('div', { class: 'row-actions' }, [el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome })]),
    ]));
  }
}
