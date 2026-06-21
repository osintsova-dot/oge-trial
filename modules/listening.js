// listening.js — раздел «Аудирование» ОГЭ. Аутентичное аудио ФИПИ (хотлинк) + проверка по ключу.
// Один вариант = одна запись + 11 заданий: соответствие (5 говорящих A–E), 4 «выбор», 6 «вписать слово».
// Скрипт (транскрипт) открывается ТОЛЬКО на этапе проверки: тап по предложению → переслушать фрагмент.

import { el, mount, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordDrill, sectionStats } from '../js/progress.js';
import { recordRound, getName, checkNewAchievements } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { playCorrect, playWrong } from '../js/sound.js';
import { t, plural } from '../js/exam.js';
import { tipButton, autoTipOnce } from '../js/tips.js';

const SECTION = 'listening';
const KES = '1.2';

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function randInt(n) { return Math.floor(Math.random() * n); }

// Нормализация ввода «вписать слово»: как у ФИПИ — регистр не важен, артикль/лишние пробелы убираем.
function norm(s) {
  return String(s || '').toLowerCase().trim().replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').replace(/^(a|an|the)\s+/, '');
}

function buildMoments(g, name) {
  const m = [];
  if (g.heroAwarded) m.push({ icon: '🦸', img: './assets/spiky-hero.png', title: t.celHeroT, text: celeb('hero', name), confetti: true });
  if (g.levelUp) m.push({ icon: '⭐', img: './assets/spiky-cheer.png', title: t.celLevelT(g.level, g.title), text: celeb('level', name), confetti: true });
  if (g.streakUp && [3, 7, 14, 30, 50, 100].includes(g.streak)) m.push({ icon: '🔥', img: './assets/spiky-fire.png', title: t.celStreakT(g.streak), text: celeb('streak', name) });
  if (g.freezeEarned) m.push({ icon: '🧊', title: t.celFreezeT, text: celeb('freeze', name) });
  if (g.tokensEarned) m.push({ icon: '🎟', img: './assets/spiky-gift.png', title: t.celTokenT(g.tokensEarned, plural(g.tokensEarned, t.tokenWord)), text: t.celTokenText(name || t.friend) });
  for (const a of checkNewAchievements()) m.push({ icon: a.icon, img: './assets/spiky-medal.png', title: a.title, text: t.celAchText(a.desc, celeb('ach', name)), confetti: true });
  return m;
}

// cfg: { goHome, dataFile }
export async function renderListening(container, cfg) {
  mount(container, el('div', { class: 'loader', text: t.loadingTasks }));
  let data;
  try { data = await loadJSON(cfg.dataFile || 'listening'); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }

  const L = t.listening;
  const title = t.sections.listening;
  menuScreen();
  autoTipOnce('listening');

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar listening' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: title }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
      tipButton('listening'),
    ]);
  }

  // --- Меню: список вариантов ---
  function menuScreen() {
    const stats = sectionStats(SECTION);
    const sub = `${data.groups.length} ${plural(data.groups.length, t.varWord || ['вариант', 'варианта', 'вариантов'])}` +
      (stats.attempted ? ` · ${pct(stats.correct, stats.attempted)}%` : '');
    const cards = data.groups.map((g, i) => el('button', { class: 'all-topics listening', onclick: () => startVariant(g) }, [
      el('div', { class: 'at-ic' }, [iconImg('ic-listening', '🎧', 'at-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'at-t', text: L.variant(i + 1) }),
        el('div', { class: 'at-s', text: L.variantSub }),
      ]),
      el('div', { class: 'at-arrow', text: '→' }),
    ]));
    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, sub),
      el('div', { class: 'topics-body' }, [
        el('div', { class: 'topics-label', text: L.pickVariant }),
        ...cards,
      ]),
    ]));
  }

  // --- Один вариант: плеер + 11 заданий ---
  function startVariant(group) {
    let checked = false;

    // аудио (хотлинк ФИПИ) — переиспользуем тот же элемент и в разборе (для тап-переслушать)
    const audio = el('audio', { class: 'ls-audio', controls: '', preload: 'none', src: group.audio });
    audio.addEventListener('error', () => {
      audioWrap.appendChild(el('div', { class: 'ls-auderr', text: L.audioErr }));
    });
    const audioWrap = el('div', { class: 'ls-player' }, [
      el('div', { class: 'ls-listen', text: L.listenHint }),
      audio,
    ]);

    // состояние ответов и узлы для разбора
    const qNodes = [];   // { q, type, getResult, mark(correct, key) , inputs }
    const qWrap = el('div', { class: 'ls-questions' });
    let num = 0;

    group.questions.forEach((q) => {
      if (q.type === 'match') qWrap.appendChild(buildMatch(q));
      else if (q.type === 'choice') qWrap.appendChild(buildChoice(q, ++num));
      else qWrap.appendChild(buildFill(q, ++num));
    });

    const action = el('button', { class: 'btn btn-check btn-block', text: L.checkAll });
    action.addEventListener('click', () => { if (!checked) doCheck(); else showSummary(pending.correct, pending.total); });

    function buildMatch(q) {
      const rubrics = el('ol', { class: 'ls-rubrics' }, q.rubrics.map((r) => el('li', { text: r })));
      const rows = q.speakers.map((sp, i) => {
        const sel = el('select', { class: 'ls-sel' });
        sel.appendChild(el('option', { value: '', text: L.pick }));
        q.rubrics.forEach((_, ri) => sel.appendChild(el('option', { value: String(ri + 1), text: String(ri + 1) })));
        const verdict = el('span', { class: 'ls-cv', style: { display: 'none' } });
        const row = el('div', { class: 'ls-mrow' }, [
          el('div', { class: 'ls-letter', text: sp }),
          sel, verdict,
        ]);
        return { sp, sel, verdict, row };
      });
      qNodes.push({
        type: 'match', zid: q.zid, key: q.key, rows,
        result() {
          let c = 0; rows.forEach((r, i) => { if (r.sel.value === q.key[i]) c++; });
          return { correct: c, total: rows.length, allOk: c === rows.length };
        },
        mark() {
          rows.forEach((r, i) => {
            const want = q.key[i]; const ok = r.sel.value === want;
            r.sel.disabled = true; r.sel.classList.add(ok ? 'right' : 'wrong');
            r.verdict.className = 'ls-cv ' + (ok ? 'ok' : 'bad');
            r.verdict.textContent = ok ? '✓' : ('✕ ' + want);
            r.verdict.style.display = 'inline-block';
          });
        },
      });
      return el('div', { class: 'ls-task ls-match' }, [
        el('div', { class: 'ls-q', text: L.matchInstr }),
        el('div', { class: 'ls-rub-title', text: L.rubricsLabel }),
        rubrics,
        el('div', { class: 'ls-mrows' }, rows.map((r) => r.row)),
      ]);
    }

    function buildChoice(q, n) {
      let pick = null;
      const opts = q.options.map((opt, k) => {
        const val = String(k + 1);
        const b = el('button', { class: 'ls-opt', text: opt, onclick: () => {
          if (checked) return;
          pick = val; opts.forEach((o) => o.classList.remove('sel')); b.classList.add('sel');
        } });
        return b;
      });
      qNodes.push({
        type: 'choice', zid: q.zid, key: q.key,
        result() { return { correct: pick === q.key ? 1 : 0, total: 1, allOk: pick === q.key }; },
        mark() {
          opts.forEach((o, k) => {
            o.disabled = true; const val = String(k + 1);
            if (val === q.key) o.classList.add('right');
            else if (val === pick) o.classList.add('wrong');
          });
        },
      });
      return el('div', { class: 'ls-task' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.q]),
        el('div', { class: 'ls-opts' }, opts),
      ]);
    }

    function buildFill(q, n) {
      const input = el('input', { class: 'ls-input', type: 'text', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false', placeholder: '…' });
      const verdict = el('div', { class: 'ls-cv', style: { display: 'none' } });
      qNodes.push({
        type: 'fill', zid: q.zid, key: q.key,
        result() { const ok = norm(input.value) === norm(q.key); return { correct: ok ? 1 : 0, total: 1, allOk: ok }; },
        mark() {
          input.disabled = true; const ok = norm(input.value) === norm(q.key);
          input.classList.add(ok ? 'right' : 'wrong');
          verdict.className = 'ls-cv block ' + (ok ? 'ok' : 'bad');
          verdict.textContent = ok ? '✓' : ('✕ ' + L.correctIs(q.key));
          verdict.style.display = 'block';
        },
      });
      return el('div', { class: 'ls-task ls-fill' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.label]),
        input, verdict,
      ]);
    }

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0, total = 0;
      qNodes.forEach((qn) => {
        const r = qn.result();
        correct += r.correct; total += r.total;
        recordDrill(SECTION, qn.zid, qn.type === 'match' ? r.allOk : r.allOk, KES);
        qn.mark();
      });
      pending = { correct, total };
      correct === total ? playCorrect() : playWrong();
      // открываем скрипт (только сейчас) + тап-переслушать
      qWrap.appendChild(transcriptBlock(group, audio));
      action.textContent = t.finish;
      action.className = 'btn btn-primary btn-block';
      action.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    mount(container, el('div', { class: 'ls-screen view' }, [
      secBar(menuScreen, L.variant(data.groups.indexOf(group) + 1)),
      el('div', { class: 'ls-body' }, [
        audioWrap,
        qWrap,
        el('div', { class: 'ls-foot' }, [action]),
      ]),
    ]));
    const sc = container.querySelector('.ls-screen'); if (sc) sc.scrollTop = 0;
  }

  // --- Скрипт записи (виден только на проверке): тап по предложению → переслушать фрагмент ---
  function transcriptBlock(group, audio) {
    const lines = (group.transcript || []).map((seg) =>
      el('button', { class: 'ls-line', onclick: () => {
        try { audio.currentTime = seg.s; audio.play(); } catch {}
      } }, [seg.t]));
    return el('div', { class: 'ls-script' }, [
      el('div', { class: 'ls-script-h', text: L.transcriptTitle }),
      el('div', { class: 'ls-script-hint', text: L.transcriptHint }),
      el('div', { class: 'ls-lines' }, lines),
    ]);
  }

  // --- Итог раунда + награды ---
  function showSummary(correct, total) {
    const g = recordRound(SECTION, correct, total);
    const name = getName();
    const acc = pct(correct, total);
    const praise = acc >= 80 ? t.praiseHigh : acc >= 60 ? t.praiseMid : t.praiseLow;
    const rline = (iconName, emoji, label, vc, value) => el('div', { class: 'reward-line' },
      [el('span', { class: 'rl-label' }, [iconImg(iconName, emoji), el('span', { text: ' ' + label })]), el('b', { class: vc, text: value })]);

    function showResult() {
      mount(container, el('div', { class: 'result view' }, [
        el('div', { class: 'voice-msg', text: roundMessage(name, correct, total, g.heroAwarded) }),
        el('div', { class: 'res-num' }, [String(correct), el('span', { text: '/' + total })]),
        el('div', { class: 'res-acc', text: t.accLine(acc, praise) }),
        el('div', { class: 'reward' }, [
          rline('ic-streak', '🔥', t.rStreak, 'v-streak', g.streak + ' ' + t.dayWord(g.streak)),
          rline('ic-xp', '⭐', t.rXp, 'v-xp', '+' + g.xpGained + ' XP'),
          g.freezeUsed ? rline('ic-freeze', '🧊', t.rFreeze, 'v-pack', t.freezeSaved) : null,
          rline('ic-hero', '🦸', t.rPack, 'v-pack', t.packOf(g.pack.done.length, g.pack.total)),
        ].filter(Boolean)),
        el('button', { class: 'btn btn-primary btn-block', text: L.nextText, onclick: menuScreen }),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-ghost', text: t.toHome, onclick: cfg.goHome }),
        ]),
      ]));
    }
    celebrate(buildMoments(g, name), showResult);
  }
}
