// listening.js — раздел «Аудирование» ОГЭ. Аутентичное аудио ФИПИ (хотлинк) + проверка по ключу.
// Один вариант = одна запись + 11 заданий: соответствие (5 говорящих A–E), 4 «выбор», 6 «вписать слово».
// Скрипт (транскрипт) открывается ТОЛЬКО на этапе проверки: тап по предложению → переслушать фрагмент.

import { el, mount, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordDrill, sectionStats } from '../js/progress.js';
import { recordRound, getName, checkNewAchievements, recordListeningVariant, getListeningDone } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { playCorrect, playWrong } from '../js/sound.js';
import { t, plural } from '../js/exam.js';
import { tipButton, autoTipOnce } from '../js/tips.js';

const SECTION = 'listening';
const KES = '1.2';

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function randInt(n) { return Math.floor(Math.random() * n); }
// баллы = по 1 за вопрос; соответствие = по 1 за говорящего; TF/NS = по 1 за утверждение
function variantPoints(g) {
  return (g.questions || []).reduce((s, q) => s + (
    q.type === 'match' ? (q.speakers ? q.speakers.length : 1)
      : q.type === 'tfns' ? (q.statements ? q.statements.length : 1)
        : 1), 0);
}

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
    // группировка по категориям (ЕГЭ: match/tf/mc). ОГЭ — без cat → один плоский список.
    const cats = {};
    data.groups.forEach((g) => { const c = g.cat || '_'; (cats[c] = cats[c] || []).push(g); });
    const acc = stats.attempted ? ` · ${pct(stats.correct, stats.attempted)}%` : '';
    // подпись: для ЕГЭ — разбивка по категориям; для ОГЭ — N вариантов
    const cshort = L.catShort || {};
    const sub = (cats['_'])
      ? `${data.groups.length} ${plural(data.groups.length, t.varWord || ['вариант', 'варианта', 'вариантов'])}${acc}`
      : ['match', 'tf', 'mc'].filter((c) => cats[c]).map((c) => `${cshort[c] || c} ${cats[c].length}`).join(' · ') + acc;
    const done = getListeningDone();
    const card = (g, label) => {
      const d = done[g.vid || g.id];
      return el('button', { class: 'all-topics listening' + (d ? ' ls-done' : ''), onclick: () => startVariant(g) }, [
        el('div', { class: 'at-ic' }, [iconImg('ic-listening', '🎧', 'at-img')]),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'at-t', text: label }),
          el('div', { class: 'at-s', text: d ? L.doneScore(d.correct, d.total) : L.tasksPts(g.questions.length, variantPoints(g)) }),
        ]),
        el('div', { class: 'at-arrow', text: d ? '✓' : '→' }),
      ]);
    };
    // каждая категория — сворачиваемая плашка (свёрнута по умолчанию), в шапке счёт выполнено/всего
    const body = [el('div', { class: 'topics-label', text: L.pickVariant })];
    for (const c of ['match', 'tf', 'mc', '_']) {
      const arr = cats[c]; if (!arr) continue;
      const doneN = arr.filter((g) => done[g.vid || g.id]).length;
      const name = c === '_' ? (L.allVariants || 'Варианты') : ((L.cat && L.cat[c]) || c);
      const cardsWrap = el('div', { class: 'ls-cat-cards', style: { display: 'none' } },
        arr.map((g, i) => card(g, c === '_' ? L.variant(data.groups.indexOf(g) + 1) : ('№ ' + (i + 1)))));
      const caret = el('span', { class: 'ls-cat-caret', text: '▸' });
      const plate = el('button', { class: 'ls-cat-plate' + (arr.length && doneN === arr.length ? ' done' : ''), onclick: () => {
        const open = cardsWrap.style.display !== 'none';
        cardsWrap.style.display = open ? 'none' : '';
        caret.textContent = open ? '▾' : '▸';
      } }, [
        el('span', { class: 'ls-cat-name', text: name }),
        el('span', { class: 'ls-cat-cnt', text: doneN + '/' + arr.length }),
        caret,
      ]);
      body.push(plate, cardsWrap);
    }
    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, sub),
      el('div', { class: 'topics-body' }, body),
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

    // «🔊 В записи: «предложение»» (тап → переслушать) — заполняет переданный контейнер
    function fillSrc(container, ev) {
      if (!ev) return;
      container.replaceChildren(
        el('span', { class: 'ls-src-lbl', text: L.source + ': ' }),
        el('button', { class: 'ls-src-q', onclick: () => { try { audio.currentTime = ev.s; audio.play(); } catch {} } }, ['« ', ev.t, ' »']),
      );
      container.style.display = 'block';
    }

    // номер = позиция в варианте (= номер задания ФИПИ: 1-4 выбор, 5 соответствие, 6-11 вписать)
    group.questions.forEach((q, i) => {
      const n = i + 1;
      if (q.type === 'match') qWrap.appendChild(buildMatch(q, n));
      else if (q.type === 'choice') qWrap.appendChild(buildChoice(q, n));
      else if (q.type === 'tfns') qWrap.appendChild(buildTFNS(q, n));
      else qWrap.appendChild(buildFill(q, n));
    });

    const action = el('button', { class: 'btn btn-check btn-block', text: L.checkAll });
    action.addEventListener('click', () => { if (!checked) doCheck(); else showSummary(pending.correct, pending.total, pending.byKes, group); });

    function buildMatch(q, n) {
      const rubrics = el('ol', { class: 'ls-rubrics' }, q.rubrics.map((r) => el('li', { text: r })));
      const rows = q.speakers.map((sp, i) => {
        const sel = el('select', { class: 'ls-sel' });
        sel.appendChild(el('option', { value: '', text: L.pick }));
        q.rubrics.forEach((_, ri) => sel.appendChild(el('option', { value: String(ri + 1), text: String(ri + 1) })));
        const verdict = el('span', { class: 'ls-cv', style: { display: 'none' } });
        const src = el('div', { class: 'ls-src', style: { display: 'none' } });
        const row = el('div', { class: 'ls-mitem' }, [
          el('div', { class: 'ls-mrow' }, [el('div', { class: 'ls-letter', text: sp }), sel, verdict]),
          src,
        ]);
        return { sp, sel, verdict, row, src };
      });
      qNodes.push({
        type: 'match', zid: q.zid, key: q.key, kes: q.kes, rows,
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
            fillSrc(r.src, (q.evs || []).find((e) => e.label === r.sp));
          });
        },
      });
      return el('div', { class: 'ls-task ls-match' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.task || L.matchInstr]),
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
      const srcWrap = el('div', { class: 'ls-src', style: { display: 'none' } });
      qNodes.push({
        type: 'choice', zid: q.zid, key: q.key, kes: q.kes,
        result() { return { correct: pick === q.key ? 1 : 0, total: 1, allOk: pick === q.key }; },
        mark() {
          opts.forEach((o, k) => {
            o.disabled = true; const val = String(k + 1);
            if (val === q.key) o.classList.add('right');
            else if (val === pick) o.classList.add('wrong');
          });
          if (q.ev) {
            srcWrap.replaceChildren(
              el('span', { class: 'ls-src-lbl', text: L.source + ': ' }),
              el('button', { class: 'ls-src-q', onclick: () => { try { audio.currentTime = q.ev.s; audio.play(); } catch {} } }, ['« ', q.ev.t, ' »']),
            );
            srcWrap.style.display = 'block';
          }
        },
      });
      return el('div', { class: 'ls-task' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.q]),
        el('div', { class: 'ls-opts' }, opts),
        srcWrap,
      ]);
    }

    function buildFill(q, n) {
      const input = el('input', { class: 'ls-input', type: 'text', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false', placeholder: '…' });
      const verdict = el('div', { class: 'ls-cv', style: { display: 'none' } });
      const srcWrap = el('div', { class: 'ls-src', style: { display: 'none' } });
      qNodes.push({
        type: 'fill', zid: q.zid, key: q.key, kes: q.kes,
        result() { const ok = norm(input.value) === norm(q.key); return { correct: ok ? 1 : 0, total: 1, allOk: ok }; },
        mark() {
          input.disabled = true; const ok = norm(input.value) === norm(q.key);
          input.classList.add(ok ? 'right' : 'wrong');
          verdict.className = 'ls-cv block ' + (ok ? 'ok' : 'bad');
          verdict.textContent = ok ? '✓' : ('✕ ' + L.correctIs(q.key));
          verdict.style.display = 'block';
          // опора: предложение из записи, где звучит ответ (тап → переслушать)
          if (q.ev) {
            srcWrap.replaceChildren(
              el('span', { class: 'ls-src-lbl', text: L.source + ': ' }),
              el('button', { class: 'ls-src-q', onclick: () => { try { audio.currentTime = q.ev.s; audio.play(); } catch {} } }, ['« ', q.ev.t, ' »']),
            );
            srcWrap.style.display = 'block';
          }
        },
      });
      return el('div', { class: 'ls-task ls-fill' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.label]),
        input, verdict, srcWrap,
      ]);
    }

    // EGE задание 2: 7 утверждений A–G, по каждому Верно/Неверно/Не сказано (ключ — 7 цифр 1/2/3)
    function buildTFNS(q, n) {
      const labels = L.tfns;
      const rows = q.statements.map((st) => {
        const state = { pick: null };
        const btns = labels.map((lab, k) => {
          const val = String(k + 1);
          const b = el('button', { class: 'tf-opt', text: lab, onclick: () => {
            if (checked) return;
            state.pick = val; btns.forEach((o) => o.classList.remove('sel')); b.classList.add('sel');
          } });
          return b;
        });
        const verdict = el('div', { class: 'ls-cv block', style: { display: 'none' } });
        const src = el('div', { class: 'ls-src', style: { display: 'none' } });
        const row = el('div', { class: 'tfns-row' }, [
          el('div', { class: 'tfns-head' }, [el('span', { class: 'tfns-letter', text: st.letter }), el('span', { class: 'tfns-st', text: st.text })]),
          el('div', { class: 'tfns-opts' }, btns),
          verdict, src,
        ]);
        return { state, btns, verdict, row, src, st };
      });
      qNodes.push({
        type: 'tfns', zid: q.zid, key: q.key, kes: q.kes,
        result() { let c = 0; rows.forEach((r, i) => { if (r.state.pick === q.key[i]) c++; }); return { correct: c, total: rows.length, allOk: c === rows.length }; },
        mark() {
          rows.forEach((r, i) => {
            const want = q.key[i]; const ok = r.state.pick === want;
            r.btns.forEach((b, k) => { b.disabled = true; const v = String(k + 1); if (v === want) b.classList.add('right'); else if (v === r.state.pick) b.classList.add('wrong'); });
            r.verdict.className = 'ls-cv block ' + (ok ? 'ok' : 'bad');
            r.verdict.textContent = ok ? '✓' : ('✕ ' + labels[Number(want) - 1]);
            r.verdict.style.display = 'block';
            fillSrc(r.src, (q.evs || []).find((e) => e.label === r.st.letter));
          });
        },
      });
      return el('div', { class: 'ls-task ls-tfns' }, [
        el('div', { class: 'ls-q' }, [el('span', { class: 'ls-num', text: n + '. ' }), q.task || L.tfnsInstr]),
        el('div', { class: 'tfns-rows' }, rows.map((r) => r.row)),
      ]);
    }

    let pending = null;
    function doCheck() {
      checked = true;
      let correct = 0, total = 0;
      const byKes = {};
      qNodes.forEach((qn) => {
        const r = qn.result();
        correct += r.correct; total += r.total;
        const k = qn.kes || KES;
        if (!byKes[k]) byKes[k] = { correct: 0, total: 0 };
        byKes[k].correct += r.correct; byKes[k].total += r.total;
        recordDrill(SECTION, qn.zid, r.allOk, k);
        qn.mark();
      });
      pending = { correct, total, byKes };
      correct === total ? playCorrect() : playWrong();
      // скрипт открывается (только сейчас), но СВЁРНУТ в плашку — чтобы результаты были сразу видны
      const tb = transcriptBlock(group, audio);
      if (tb) qWrap.appendChild(tb);
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

  // --- Скрипт записи (виден только на проверке): опорные предложения подсвечены и пронумерованы
  //     номером задания; тап по предложению → переслушать фрагмент (как в «Чтении»). ---
  function transcriptBlock(group, audio) {
    if (!group.transcript || !group.transcript.length) return null;  // нет скрипта (MC без STT) — плашку не показываем
    // карта: время начала опорного сегмента → номера заданий, которые на него опираются
    const evMap = {};
    group.questions.forEach((q, i) => {
      if (q.ev && q.ev.s != null) (evMap[q.ev.s] = evMap[q.ev.s] || []).push(i + 1);
      if (q.evs) q.evs.forEach((e) => { if (e.s != null) (evMap[e.s] = evMap[e.s] || []).push(e.label); });
    });
    const lines = (group.transcript || []).map((seg) => {
      const nums = evMap[seg.s];
      const line = el('button', { class: 'ls-line' + (nums ? ' ev' : ''), onclick: () => {
        try { audio.currentTime = seg.s; audio.play(); } catch {}
      } }, [seg.t]);
      if (nums) nums.forEach((n) => line.appendChild(el('span', { class: 'ls-qn', text: String(n) })));
      return line;
    });
    // плашка-аккордеон: по умолчанию свёрнута, чтобы результаты были сразу видны
    const body = el('div', { class: 'ls-lines', style: { display: 'none' } }, lines);
    const head = el('button', { class: 'ls-script-toggle' }, [
      el('span', { class: 'ls-script-h', text: '📄 ' + L.transcriptTitle }),
      el('span', { class: 'ls-script-caret', text: '▸' }),
    ]);
    head.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      head.querySelector('.ls-script-caret').textContent = open ? '▸' : '▾';
    });
    return el('div', { class: 'ls-script' }, [
      head,
      el('div', { class: 'ls-script-hint', text: L.transcriptHint }),
      body,
    ]);
  }

  // --- Итог раунда + награды ---
  function showSummary(correct, total, byKes, group) {
    if (group) recordListeningVariant(group.vid || group.id, correct, total);
    const g = recordRound(SECTION, correct, total);
    const name = getName();
    const acc = pct(correct, total);
    const praise = acc >= 80 ? t.praiseHigh : acc >= 60 ? t.praiseMid : t.praiseLow;
    const rline = (iconName, emoji, label, vc, value) => el('div', { class: 'reward-line' },
      [el('span', { class: 'rl-label' }, [iconImg(iconName, emoji), el('span', { text: ' ' + label })]), el('b', { class: vc, text: value })]);
    // разбивка по кодификатору (КЭС): название + точность
    const kesNames = L.kes || {};
    const kesRows = Object.keys(byKes || {}).sort().map((k) => {
      const b = byKes[k]; const p = pct(b.correct, b.total);
      return el('div', { class: 'ls-kes-row' }, [
        el('span', { class: 'ls-kes-name', text: kesNames[k] || ('КЭС ' + k) }),
        el('b', { class: 'ls-kes-v', style: { color: p >= 60 ? 'var(--ok)' : 'var(--bad)' }, text: `${b.correct}/${b.total}` }),
      ]);
    });

    function showResult() {
      mount(container, el('div', { class: 'result view' }, [
        el('div', { class: 'voice-msg', text: roundMessage(name, correct, total, g.heroAwarded) }),
        el('div', { class: 'res-num' }, [String(correct), el('span', { text: '/' + total + ' ' + L.pointsWord(total) })]),
        el('div', { class: 'res-acc', text: t.accLine(acc, praise) }),
        el('div', { class: 'ls-maxpts', text: L.maxPts(total) }),
        kesRows.length ? el('div', { class: 'ls-kes-card' }, [el('div', { class: 'ls-kes-h', text: L.byKesTitle }), ...kesRows]) : null,
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
