// ege_speaking.js — EGE Speaking (task 1 read aloud · task 2 ask questions · task 3 interview
// audio · task 4 compare photos). English immersion. Record (MediaRecorder) + AI feedback
// (Yandex SpeechKit → DeepSeek). Data: app/data/ege_speaking.json (картинки/аудио — хотлинк ФИПИ).
// ВАЖНО: официальные максимумы баллов ЕГЭ-говорения НЕ подтверждены → ИИ даёт РАЗБОР
// (ориентировочно), а не финальный балл; в пробник пока не включаем.

import { el, mount, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordRound, getName, getSpeakingDone, markSpeakingDone } from '../js/gamify.js';
import { recognize, canRecognize } from '../js/stt.js';
import { evalEgeSpeaking } from '../js/speakeval.js';
import { speak, canSpeak, stopSpeak } from '../js/speak.js';
import { t } from '../js/exam.js';
import { tipButton } from '../js/tips.js';

const SECTION = 'speaking';
function randInt(n) { return Math.floor(Math.random() * n); }

export async function renderEgeSpeaking(container, cfg) {
  const S = t.egeSpeaking;
  mount(container, el('div', { class: 'loader', text: S.loading }));
  let data;
  try { data = await loadJSON(cfg.dataFile || 'ege_speaking'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }

  const CATS = [
    { key: 'read', label: S.catRead, arr: data.read, icon: '📖' },
    { key: 'ask', label: S.catAsk, arr: data.ask, icon: '❓' },
    { key: 'interview', label: S.catInterview, arr: data.interview, icon: '🎧' },
    { key: 'compare', label: S.catCompare, arr: data.compare, icon: '🖼' },
  ].filter((c) => c.arr && c.arr.length);

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar speaking' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: t.sections.speaking }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
    ]);
  }

  function countDone(kind, arr) {
    const d = getSpeakingDone();
    return arr.reduce((n, it) => n + (d[kind + ':' + it.zid] ? 1 : 0), 0);
  }

  function menuScreen() {
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

  function listScreen(kind) {
    stopSpeak();
    const cat = CATS.find((c) => c.key === kind);
    const arr = cat.arr;
    const doneMap = getSpeakingDone();
    const list = el('div', { class: 'sp-list' }, [
      el('button', { class: 'btn btn-primary btn-block sp-random', text: '🎲 ' + S.randomTask, onclick: () => startTask(kind, arr[randInt(arr.length)]) }),
      ...arr.map((it, i) => {
        const isDone = !!doneMap[kind + ':' + it.zid];
        return el('button', { class: 'sp-item' + (isDone ? ' done' : ''), onclick: () => startTask(kind, it) }, [
          el('span', { class: 'sp-item-n', text: '№ ' + (i + 1) }),
          el('span', { class: 'sp-item-t', text: cat.label }),
          el('span', { class: 'sp-item-chk', text: isDone ? '✓' : '' }),
        ]);
      }),
    ]);
    mount(container, el('div', { class: 'view' }, [secBar(menuScreen, cat.label), el('div', { class: 'topics-body' }, [list])]));
  }

  // диктофон (как в ОГЭ-говорении), отдаёт blob
  function recorder() {
    let mr = null, stream = null, url = null, chunks = [], lastBlob = null;
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
      chunks = []; mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        lastBlob = blob; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
        player.src = url; player.style.display = 'block'; stopTracks();
      };
      mr.start(); t0 = 0; timer.textContent = '0:00';
      tick = setInterval(() => { t0 += 1; timer.textContent = fmt(t0); }, 1000);
      btn.className = 'btn btn-rec rec-on btn-block'; btn.textContent = S.recStop; hint.textContent = S.recOn;
    }
    function stop() { if (mr && mr.state !== 'inactive') mr.stop(); clearInterval(tick); btn.className = 'btn btn-rec done btn-block'; btn.textContent = S.recAgain; hint.textContent = ''; }
    btn.addEventListener('click', () => { if (!mr || mr.state === 'inactive') start(); else stop(); });
    return { wrap: el('div', { class: 'sp-recorder' }, [el('div', { class: 'sp-rec-row' }, [btn, timer]), hint, player]), getBlob: () => lastBlob };
  }

  function imgs(item) {
    return (item.images || []).map((u) => el('img', { class: 'sp-img', src: u, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
  }

  // кнопка озвучки эталона (TTS)
  function spk(text) {
    if (!canSpeak() || !text) return null;
    return el('button', { class: 'btn btn-ghost sp-tts', text: '🔊 ' + S.listenModel, onclick: () => speak(text) });
  }

  // свёрнутый эталон (Model answer). content — массив узлов.
  function sampleBlock(title, content) {
    if (!content || !content.length) return null;
    const body = el('div', { class: 'sp-sample-body', style: { display: 'none' } }, content);
    let open = false;
    const head = el('button', { class: 'sp-sample-head' }, [
      el('span', { text: '📝 ' + title }), el('span', { class: 'sp-sample-chev', text: '▾' }),
    ]);
    head.addEventListener('click', () => { open = !open; body.style.display = open ? '' : 'none'; head.querySelector('.sp-sample-chev').textContent = open ? '▴' : '▾'; });
    return el('div', { class: 'sp-sample' }, [head, body]);
  }

  // эталон под тип задания (показывается, если данные есть)
  function sampleFor(kind, item) {
    if (kind === 'ask' && item.sampleQuestions && item.sampleQuestions.length) {
      return sampleBlock(S.sampleQuestions, item.sampleQuestions.map((q) => el('div', { class: 'sp-qa' }, [el('div', { class: 'sp-qa-a', text: q }), spk(q)].filter(Boolean))));
    }
    if (kind === 'interview' && item.sampleAnswers && item.sampleAnswers.length) {
      const rows = item.sampleAnswers.map((a, i) => el('div', { class: 'sp-qa' }, [
        item.questions && item.questions[i] ? el('div', { class: 'sp-qa-q', text: (i + 1) + '. ' + item.questions[i] }) : null,
        el('div', { class: 'sp-qa-a', text: a }), spk(a),
      ].filter(Boolean)));
      return sampleBlock(S.sampleTitle, rows);
    }
    if (kind === 'compare') {
      // универсальный шаблон (структура + фразы); точный по картинкам — позже через Vision
      return sampleBlock(S.sampleTemplate, [el('div', { class: 'sp-sample-text', text: S.compareTemplate }), spk(S.compareTemplate)].filter(Boolean));
    }
    return null;
  }

  function aiCheck(kind, item, rec) {
    if (!canRecognize()) return null;
    const out = el('div', { class: 'sp-ai-out' });
    const btn = el('button', { class: 'btn btn-ghost sp-ai-btn', text: '🤖 ' + S.aiCheck });
    const hint = (txt, cls) => out.replaceChildren(el('div', { class: cls || 'sp-ai-hint', text: txt }));
    btn.addEventListener('click', async () => {
      const blob = rec.getBlob();
      if (!blob) { hint(S.aiNoRec); return; }
      btn.disabled = true; hint(S.aiRecognizing);
      let transcript;
      try { transcript = await recognize(blob, (d, n) => hint(`${S.aiRecognizing} (${d}/${n})`)); }
      catch (e) { hint(S.aiErr + ' ' + (e.message || ''), 'sp-ai-err'); btn.disabled = false; return; }
      if (!transcript) { hint(S.aiEmpty, 'sp-ai-err'); btn.disabled = false; return; }
      hint(S.aiEvaluating);
      try {
        const res = await evalEgeSpeaking(kind, item, transcript);
        out.replaceChildren(aiResult(res, transcript));
      } catch (e) { hint(S.aiErr + ' ' + (e.message || ''), 'sp-ai-err'); }
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
    const tHead = el('button', { class: 'sp-sample-head' }, [el('span', { text: '🗒 ' + S.aiTranscript }), el('span', { class: 'sp-sample-chev', text: '▾' })]);
    tHead.addEventListener('click', () => { openT = !openT; tBody.style.display = openT ? '' : 'none'; tHead.querySelector('.sp-sample-chev').textContent = openT ? '▴' : '▾'; });
    return el('div', { class: 'sp-ai-card' }, [
      el('div', { class: 'sp-ai-score', text: (res.totalScore ?? '–') + ' / ' + res.max }),
      res.verdict ? el('div', { class: 'sp-ai-verdict', text: res.verdict }) : null,
      ...crit,
      el('div', { class: 'sp-ai-note', text: S.aiNote }),
      el('div', { class: 'sp-sample' }, [tHead, tBody]),
    ].filter(Boolean));
  }

  function startTask(kind, item) {
    const rec = recorder();
    const body = [el('div', { class: 'sp-instr', text: item.instruction || '' })];
    if (kind === 'interview' && item.audio) {
      body.push(el('div', { class: 'sp-step', text: '🔊 ' + S.playInterview }));
      body.push(el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: item.audio }));
    }
    imgs(item).forEach((im) => body.push(im));
    body.push(el('div', { class: 'sp-step', text: S.yourTurn }));
    body.push(rec.wrap);
    const ac = aiCheck(kind, item, rec); if (ac) body.push(ac);
    const sample = sampleFor(kind, item); if (sample) body.push(sample);
    const done = el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '18px' }, text: S.doneBtn, onclick: () => finish(kind, item) });
    const cat = CATS.find((c) => c.key === kind);
    mount(container, el('div', { class: 'view sp-screen' }, [
      secBar(() => listScreen(kind), cat ? cat.label : ''),
      el('div', { class: 'sp-body' }, [...body, done]),
    ]));
    const sc = container.querySelector('.sp-screen'); if (sc) sc.scrollTop = 0;
  }

  function finish(kind, item) {
    if (kind && item) markSpeakingDone(kind, item.zid);
    const g = recordRound(SECTION, 1, 1);
    mount(container, el('div', { class: 'result view' }, [
      el('div', { class: 'voice-msg', text: S.donePraise(getName() || t.friend) }),
      el('div', { class: 'res-acc', text: S.doneSub }),
      el('div', { class: 'reward' }, [el('div', { class: 'reward-line' }, [el('span', { class: 'rl-label' }, [iconImg('ic-xp', '⭐'), el('span', { text: ' ' + t.rXp })]), el('b', { class: 'v-xp', text: '+' + g.xpGained + ' XP' })])]),
      el('button', { class: 'btn btn-primary btn-block', text: S.more, onclick: () => listScreen(kind) }),
      el('div', { class: 'row-actions' }, [el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome })]),
    ]));
  }

  menuScreen();
}
