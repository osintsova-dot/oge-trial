// writing.js — раздел «Письмо» (общий для ОГЭ и ЕГЭ).
// ОГЭ: одно письмо (зад.35, К1–К4). ЕГЭ: email (зад.37, К1–К3) и эссе (зад.38, К1–К5).
// Конфиг задания — из EXAM.writing.tasks; тексты — из t; AI-проверка по языку экзамена.

import { el, mount, celebrate, iconImg } from '../js/ui.js';
import { loadJSON } from '../js/data.js';
import { recordWriting, writingStats } from '../js/progress.js';
import { openWordSearch } from './word_search.js';
import { recordRound, getName, checkNewAchievements } from '../js/gamify.js';
import { roundMessage, celeb } from '../js/voice.js';
import { EXAM, t, plural } from '../js/exam.js';
import { tipButton, autoTipOnce } from '../js/tips.js';
import { getActiveTheme } from '../js/vocab_srs.js';
import { themeZids } from '../js/themes.js';
import { shareWritingResult } from './teacher.js';
import { evalWriting as evalWritingApi } from '../js/writeeval.js';
import { canRecognizePhoto, recognizePhoto } from '../js/ocr.js';

const WORKER = 'https://purple-cake-2966.o-sintsova.workers.dev'; // прокси DeepSeek

// Тематическая картинка для карточки-стимула. ОГЭ — по subject; ЕГЭ — по ключевым словам промпта.
const SUBJECT_THEME = {
  'School': 'school', 'School clubs': 'school', 'School subjects': 'school', 'School exams': 'school',
  'Exam preparation': 'school', 'Coming late': 'school', 'Learning foreign languages': 'school',
  'School friends': 'family', 'My best friend': 'family', 'Family gatherings': 'family',
  'Mother’s Day': 'family', 'Christmas time': 'family', 'New Year resolutions': 'family', 'Presents': 'family',
  'Sports': 'sport', 'Diet': 'health',
  'Holidays': 'travel', 'Travelling': 'travel', 'Summer': 'travel', 'Souvenirs': 'travel', 'Russian towns': 'travel',
  'Museum': 'culture', 'Theatre': 'culture', 'Books': 'culture', 'Music': 'culture',
  'Watching films': 'culture', 'Watching TV': 'culture', 'Hobby': 'culture',
  'Career plans': 'career', 'Future profession': 'career',
  'Missing my computer': 'tech', 'Life without gadgets': 'tech', 'News': 'tech',
  'Ecological problems': 'nature', 'Weather': 'nature',
  'Pets': 'pets', 'Pocket money': 'money', 'Clothes': 'money',
};
const KW_THEME = [
  [/school|teacher|lesson|exam|classmate|homework|study/, 'school'],
  [/sport|football|basketball|tennis|swim|gym|athlet|team/, 'sport'],
  [/diet|healthy food|eating|fruit|vegetable|fitness/, 'health'],
  [/travel|holiday|trip|tourist|abroad|excursion|bicycle|bike/, 'travel'],
  [/music|book|film|movie|cinema|theatre|art|museum|reading|hobby/, 'culture'],
  [/career|profession|job|future work|university/, 'career'],
  [/family|friend|parent|picnic|birthday|present|christmas/, 'family'],
  [/computer|gadget|phone|internet|online|technolog|video game/, 'tech'],
  [/environment|ecolog|nature|weather|climate|pollut|animal/, 'nature'],
  [/\bpet\b|\bpets\b|\bdog\b|\bcat\b|puppy/, 'pets'],
  [/money|shopping|clothes|pocket money|spend/, 'money'],
];
function themeFor(it) {
  let key = it.subject && SUBJECT_THEME[it.subject];
  if (!key) {
    const s = (it.prompt || it.subject || it.context || '').toLowerCase();
    for (const [re, k] of KW_THEME) { if (re.test(s)) { key = k; break; } }
  }
  return './assets/theme-' + (key || 'default') + '.png';
}

function critColor(score, max) {
  const r = max ? score / max : 0;
  return r >= 0.8 ? 'var(--ok)' : r >= 0.5 ? 'var(--warn)' : 'var(--bad)';
}
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  catch (e) { return ''; }
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

// cfg: {goHome, sectionId}
export async function renderWriting(container, cfg) {
  const task = (EXAM.writing.tasks.find((x) => x.sectionId === cfg.sectionId)) || EXAM.writing.tasks[0];
  mount(container, el('div', { class: 'loader', text: t.wLoading }));
  let items;
  try { items = await loadJSON(task.dataFile); }
  catch (e) { mount(container, el('div', { class: 'err-msg', text: e.message })); return; }

  const headTitle = t.sections[cfg.sectionId];
  const headSub = t.sectionMeta[cfg.sectionId] || '';
  const [wMin, wMax] = task.words;

  // тема недели: закрепим её письма сверху
  let themeW = new Set(), themeName = '';
  try { const z = await themeZids(getActiveTheme()); themeW = z.writing; themeName = z.name; } catch {}

  // первый экран рисуем В КОНЦЕ renderWriting — после инициализации FRAMES/CONNECTORS,
  // которые нужны редактору (taskScreen → frameBlock). См. firstScreen() в конце функции.

  function secBar(onBack, sub) {
    return el('div', { class: 'sec-bar writing' }, [
      el('button', { class: 'back', text: '←', onclick: onBack }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'sb-title', text: headTitle }),
        el('div', { class: 'sb-sub', text: sub }),
      ]),
      tipButton(cfg.sectionId),
      el('button', { class: 'sb-action', text: '🔎', title: t.vocab.searchTitle, onclick: openWordSearch }),
    ]);
  }

  // короткий заголовок задания для списка
  function itemTitle(it, i) { return it.name ? t.wFrom(it.name) : headTitle + ' ' + (i + 1); }
  function snippet(it) {
    const s = it.subject || it.prompt || it.context || '';
    return s.length > 64 ? s.slice(0, 64) + '…' : s;
  }

  function pickScreen() {
    const works = writingStats().items;
    const byZid = {};
    for (const w of works) (byZid[w.zid] = byZid[w.zid] || []).push(w);

    const list = el('div', { class: 'topic-list' });
    const itemBtn = (it, i) => {
      const recs = byZid[it.zid];
      const best = recs ? Math.max(...recs.map((r) => (r.max ? (r.score || 0) / r.max : 0))) : null;
      const col = best != null ? critColor(best, 1) : null;
      const right = best != null
        ? el('div', { class: 'w-badge', style: { color: col }, text: '✓' + (recs.length > 1 ? ' ×' + recs.length : '') })
        : el('div', { class: 'at-arrow', text: '→' });
      return el('button', { class: 'topic-item' + (best != null ? ' w-done' : ''),
        style: best != null ? { borderLeftColor: col } : {}, onclick: () => taskScreen(i) }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ti-name', text: itemTitle(it, i) }),
          el('div', { class: 'ti-count', text: snippet(it) }),
        ]),
        right,
      ]);
    };
    if (cfg.sectionId === 'essay') {
      // эссе темы недели — наверх (чтобы тренировать лексику изучаемой темы), затем деление по формату
      const themed = items.map((it, i) => [it, i]).filter(([it]) => themeW.has(it.zid));
      if (themed.length) {
        list.appendChild(el('div', { class: 'topics-label', text: t.vocab.themeWeekLabel(themeName) }));
        themed.forEach(([it, i]) => list.appendChild(itemBtn(it, i)));
      }
      // остальные эссе делим по формату: зад.38 (с таблицей/диаграммой) и старое эссе-мнение
      const tbl = [], opn = [];
      items.forEach((it, i) => { if (themeW.has(it.zid)) return; (it.table ? tbl : opn).push([it, i]); });
      if (tbl.length) { list.appendChild(el('div', { class: 'topics-label', text: t.wEssayTable })); tbl.forEach(([it, i]) => list.appendChild(itemBtn(it, i))); }
      if (opn.length) { list.appendChild(el('div', { class: 'topics-label', text: t.wEssayOpinion })); opn.forEach(([it, i]) => list.appendChild(itemBtn(it, i))); }
    } else {
      // письма темы недели — наверх, с подписью
      const themed = [], rest = [];
      items.forEach((it, i) => (themeW.has(it.zid) ? themed : rest).push([it, i]));
      if (themed.length) list.appendChild(el('div', { class: 'topics-label', text: t.vocab.themeWeekLabel(themeName) }));
      themed.forEach(([it, i]) => list.appendChild(itemBtn(it, i)));
      if (themed.length && rest.length) list.appendChild(el('div', { class: 'topics-label', text: t.wAllLetters }));
      rest.forEach(([it, i]) => list.appendChild(itemBtn(it, i)));
    }

    const body = [];
    body.push(el('button', { class: 'all-topics writing', onclick: worksScreen }, [
      el('div', { class: 'at-ic' }, [iconImg('ic-writing', '✍️', 'at-img')]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'at-t', text: t.wMyWorks }),
        el('div', { class: 'at-s', text: t.wWorksSub(works.length) }),
      ]),
      el('div', { class: 'at-arrow', text: '→' }),
    ]));
    body.push(list);

    mount(container, el('div', { class: 'view' }, [
      secBar(cfg.goHome, t.wPickSub),
      el('div', { class: 'topics-body' }, body),
    ]));
  }

  // Архив проверенных работ (все разделы письма), новые сверху, цвет по баллу.
  function worksScreen() {
    const works = writingStats().items.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const list = el('div', { class: 'topic-list' });
    if (!works.length) list.appendChild(el('div', { class: 'vc-note', text: t.wWorksEmpty }));
    works.forEach((w) => {
      const col = critColor(w.score || 0, w.max || 1);
      list.appendChild(el('button', { class: 'topic-item w-done', style: { borderLeftColor: col }, onclick: () => workScreen(w) }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ti-name', text: w.title || headTitle }),
          el('div', { class: 'ti-count', text: (t.sections[w.section] || '') + ' · ' + fmtDate(w.ts) }),
        ]),
        el('div', { class: 'w-badge', style: { color: col }, text: (w.score ?? '–') + '/' + (w.max || '?') }),
      ]));
    });
    mount(container, el('div', { class: 'view' }, [
      secBar(pickScreen, t.wWorksSub(works.length)),
      el('div', { class: 'topics-body' }, [el('div', { class: 'topics-label', text: t.wMyWorks }), list]),
    ]));
  }

  // Чтение одной сохранённой работы: задание + текст ученика + разбор.
  function workScreen(rec) {
    const box = el('div', {});
    mount(container, el('div', { class: 'w-screen view' }, [
      secBar(worksScreen, (t.sections[rec.section] || headTitle) + ' · ' + fmtDate(rec.ts)),
      el('div', { class: 'writing-body' }, [
        rec.prompt ? el('div', { class: 'letter-card' }, [el('div', { class: 'body' }, [el('b', { text: t.wTaskPrompt + ': ' }), rec.prompt])]) : null,
        el('div', { class: 'fixes-card' }, [el('h3', { text: t.wYourText }), el('div', { class: 'corrected', text: rec.text || '' })]),
        box,
      ].filter(Boolean)),
    ]));
    if (rec.result) renderResult(box, rec.result, rec.max);
    const sc = container.querySelector('.w-screen'); if (sc) sc.scrollTop = 0;
  }

  // Writing frames (каркасы) по типу задания — английский скелет с началами фраз.
  const FRAMES = {
    letter: [
      ['Greeting', 'Dear (name),'],
      ['Opening', "Thanks for your letter! It was great to hear from you."],
      ['Bridge', "Sorry I haven't written for so long — I've been busy with …"],
      ['Answer 1', "You asked me about … . Well, …"],
      ['Answer 2', "As for … , …"],
      ['Answer 3', "Speaking about … , …"],
      ['Ending', "Anyway, I've got to go now — … . Write back soon!"],
      ['Sign-off', "Best wishes,\n(your name)"],
    ],
    email: [
      ['Greeting', 'Dear (name),'],
      ['Opening', "Thanks for your email. I'm really glad (to hear) …"],
      ['Answers', "As for your questions, … / Regarding … , …"],
      ['Ask 3 questions', "By the way, I'd like to ask you a few things. First, …? Secondly, …? And finally, …?"],
      ['Ending', "That's all my news for now. Hope to hear from you soon."],
      ['Sign-off', "Best wishes,\n(your name)"],
    ],
    essay: [
      ['Intro', "Nowadays the issue of … attracts a lot of attention. People hold different views on it."],
      ['The data', "According to the chart/table, … . The figure for … is … , while …"],
      ['Comment', "It is worth noting that … . This can be explained by …"],
      ['Problem & solution', "However, there is a problem: … . One possible solution is …"],
      ['Conclusion / opinion', "In my opinion, … . All in all, …"],
    ],
  };
  const CONNECTORS = [
    ['+', 'Moreover, Furthermore, In addition'],
    ['≠', 'However, On the other hand, Nevertheless'],
    ['☺', 'In my view, I believe, As far as I am concerned'],
    ['→', 'Therefore, That is why, As a result'],
    ['✓', 'All in all, To sum up, In conclusion'],
  ];

  function collapsible(title, kids) {
    const body = el('div', { class: 'w-coll-body', style: { display: 'none' } }, kids);
    let open = false;
    const head = el('button', { class: 'w-coll-head' }, [el('span', { text: title }), el('span', { class: 'w-coll-chev', text: '▾' })]);
    head.addEventListener('click', () => { open = !open; body.style.display = open ? '' : 'none'; head.querySelector('.w-coll-chev').textContent = open ? '▴' : '▾'; });
    return el('div', { class: 'w-coll' }, [head, body]);
  }

  function frameBlock() {
    const parts = FRAMES[task.id] || FRAMES.letter;
    const rows = parts.map(([label, starter]) => el('div', { class: 'w-frame-row' }, [
      el('div', { class: 'w-frame-lbl', text: label }),
      el('div', { class: 'w-frame-txt', text: starter }),
    ]));
    const conn = el('div', { class: 'w-conn' }, [
      el('div', { class: 'w-frame-lbl', text: t.wConnectors }),
      ...CONNECTORS.map(([s, list]) => el('div', { class: 'w-conn-row' }, [el('span', { class: 'w-conn-s', text: s }), el('span', { text: list })])),
    ]);
    return collapsible('🧩 ' + t.wFrame, [...rows, conn]);
  }

  function ideasBlock(it) {
    if (!it.ideas || !it.ideas.length) return null;
    return collapsible('💡 ' + t.wIdeas, [el('ul', { class: 'w-ideas' }, it.ideas.map((x) => el('li', { text: x })))]);
  }

  function taskScreen(i) {
    const it = items[i];
    const area = el('textarea', { class: 'letter-area', placeholder: it.name ? 'Dear ' + it.name + ',\n…' : '' });
    const wc = el('div', { class: 'wc', text: '0 ' + plural(0, t.wordsWord) + ' · ' + wMin + '–' + wMax });
    const btn = el('button', { class: 'btn btn-honey btn-block', text: t.wCheck });
    const loader = el('div', { class: 'loader', style: { display: 'none' }, text: t.wLoading });
    const errBox = el('div', { class: 'err-msg', style: { display: 'none' } });
    const resultBox = el('div', {});

    const countWords = () => area.value.trim().split(/\s+/).filter(Boolean).length;
    const updateWc = () => {
      const w = countWords();
      wc.textContent = w + ' ' + plural(w, t.wordsWord) + ' · ' + wMin + '–' + wMax;
      wc.className = 'wc ' + (w >= wMin && w <= wMax ? 'ok' : (w > wMax ? 'bad' : (w >= Math.round(wMin * 0.6) ? 'warn' : '')));
    };
    area.addEventListener('input', updateWc);

    // --- Фото письма (OCR через Yandex Vision). Рукопись врёт → обязателен шаг «сверь и поправь». ---
    function photoBlock() {
      if (!canRecognizePhoto()) return null; // воркер не настроен — кнопки нет
      const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
      const pbtn = el('button', { class: 'btn btn-ghost w-photo', text: t.wPhoto });
      const note = el('div', { class: 'w-photo-note', style: { display: 'none' }, text: t.wPhotoNote });
      pbtn.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = ''; // чтобы повторный выбор того же файла тоже сработал
        if (!file) return;
        errBox.style.display = 'none'; note.style.display = 'none';
        pbtn.disabled = true; pbtn.textContent = t.wPhotoLoading;
        try {
          const text = await recognizePhoto(file);
          area.value = (area.value.trim() ? area.value.trim() + '\n' : '') + text;
          updateWc();
          note.style.display = 'block';
          area.focus();
        } catch (e) {
          errBox.textContent = t.wPhotoErr(e.message); errBox.style.display = 'block';
        } finally {
          pbtn.disabled = false; pbtn.textContent = t.wPhoto;
        }
      });
      return el('div', { class: 'w-photo-row' }, [pbtn, input, note]);
    }

    btn.addEventListener('click', async () => {
      const text = area.value.trim();
      errBox.style.display = 'none'; resultBox.replaceChildren();
      if (countWords() < 20) { errBox.textContent = t.wErrShort; errBox.style.display = 'block'; return; }
      btn.disabled = true; loader.style.display = 'block';
      try {
        const res = await evalWriting(text, it);
        recordWriting({ zid: it.zid, section: cfg.sectionId, title: itemTitle(it, i),
          prompt: snippet(it), text, score: res.totalScore, max: task.max, result: res });
        renderResult(resultBox, res);
        const g = recordRound(cfg.sectionId, res.totalScore || 0, task.max);
        const name = getName();
        resultBox.insertBefore(el('p', { class: 'voice-msg', text: roundMessage(name, res.totalScore || 0, task.max, g.heroAwarded) }), resultBox.firstChild);
        const rl = (iconName, emoji, label, vc, val) => el('div', { class: 'reward-line' },
          [el('span', { class: 'rl-label' }, [iconImg(iconName, emoji), el('span', { text: ' ' + label })]), el('b', { class: vc, text: val })]);
        resultBox.appendChild(el('div', { class: 'reward' }, [
          rl('ic-streak', '🔥', t.rStreak, 'v-streak', String(g.streak)),
          rl('ic-xp', '⭐', t.rXp, 'v-xp', '+' + g.xpGained + ' XP'),
          rl('ic-hero', '🦸', t.rPack, 'v-pack', t.packOf(g.pack.done.length, g.pack.total)),
        ]));
        resultBox.appendChild(el('div', { style: { marginTop: '12px' } }, [
          el('button', { class: 'btn w-share-teacher', text: '📤 ' + t.wSendTeacher, onclick: () => shareWritingResult({
            name: getName(), wkind: cfg.sectionId, topic: itemTitle(it, i),
            score: res.totalScore, max: task.max, criteria: res.criteria, verdict: res.verdict,
          }) }),
        ]));
        btn.textContent = t.wRecheck;
        celebrate(buildMoments(g, name), () => resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      } catch (e) {
        errBox.textContent = t.wErrServer(e.message); errBox.style.display = 'block';
      } finally {
        btn.disabled = false; loader.style.display = 'none';
      }
    });

    // карточка-стимул с тематической картинкой
    const themeImg = el('img', { class: 'lc-theme', src: themeFor(it), alt: '' });
    themeImg.addEventListener('error', () => themeImg.remove()); // нет файла → просто без картинки
    const head = el('div', { class: 'lc-head' }, [
      themeImg,
      el('div', { class: 'from', text: it.name ? t.wLetterFrom(it.name) : headTitle }),
    ]);
    const body = (it.context || it.questions)
      ? el('div', { class: 'body' }, [it.context || '', it.questions ? el('b', { text: ' ' + it.questions }) : null])
      : el('div', { class: 'body', text: it.prompt || '' });
    // таблица опроса для эссе ЕГЭ (зад.38) — рендерим настоящей таблицей
    const tableEl = (it.table && it.table.rows && it.table.rows.length)
      ? el('div', { class: 'essay-table' }, [
        it.table.q ? el('div', { class: 'et-q', text: it.table.q }) : null,
        el('table', { class: 'et' }, [el('tbody', {}, it.table.rows.map((r) => el('tr', {}, [
          el('td', { text: r[0] }), el('td', { class: 'et-pct', text: r[1] + '%' }),
        ])))]),
      ].filter(Boolean))
      : null;
    const stimulus = el('div', { class: 'letter-card' }, [head, body, tableEl].filter(Boolean));

    mount(container, el('div', { class: 'w-screen view' }, [
      secBar(pickScreen, headSub),
      el('div', { class: 'writing-body' }, [
        stimulus,
        frameBlock(),
        ideasBlock(it),
        resultBox,
        el('div', { style: { position: 'relative' } }, [area, wc]),
        photoBlock(),
        el('div', { style: { marginTop: '14px' } }, [btn]),
        loader, errBox,
      ]),
    ]));
    area.focus();
  }

  // --- AI-проверка (промпт по языку экзамена и типу задания) ---
  async function evalWriting(text, it) {
    const stim = it.prompt || ((it.context || '') + ' ' + (it.questions || ''));
    // эссе без таблицы — старое эссе-мнение (зад.40): проверяем по его плану, а не по зад.38
    const essayKind = cfg.sectionId === 'essay' ? (it.table ? 'data' : 'opinion') : null;
    return evalWritingApi(text, { lang: EXAM.lang, sectionId: cfg.sectionId, criteria: task.criteria, max: task.max, words: [wMin, wMax], stim, essayKind });
  }

  function renderResult(box, r, mx = task.max) {
    const crit = (r.criteria && r.criteria.length) ? r.criteria : task.criteria.map((c) => ({ ...c, score: 0, comment: '' }));
    const critCards = crit.map((c) => el('div', { class: 'crit' }, [
      el('div', { class: 'c-top' }, [
        el('div', { class: 'c-name', text: c.code + ' · ' + c.name }),
        el('div', { class: 'c-score', style: { color: critColor(c.score, c.max) }, text: `${c.score}/${c.max}` }),
      ]),
      c.comment ? el('div', { class: 'c-comment', text: c.comment }) : null,
    ]));
    const nodes = [
      el('div', { class: 'letter-result' }, [
        el('div', { class: 'lr-head' }, [
          el('div', { class: 'lr-score' }, [String(r.totalScore ?? '–'), el('span', { text: '/' + mx })]),
          el('div', { class: 'lr-verdict', text: r.verdict || t.wVerdictDefault }),
        ]),
        el('div', { class: 'crit-list' }, critCards),
      ]),
    ];
    if (r.errors && r.errors.length) {
      nodes.push(el('div', { class: 'fixes-card' }, [
        el('h3', { text: t.wErrorsTitle }),
        ...r.errors.map((e) => el('div', { class: 'fix-row' }, [
          el('span', { class: 'was', text: e.quote || '' }),
          el('span', { class: 'arrow', text: '→' }),
          el('span', { class: 'now', text: e.fix || '' }),
        ])),
      ]));
    }
    if (r.corrected) {
      nodes.push(el('div', { class: 'fixes-card' }, [
        el('h3', { text: t.wCorrectedTitle }),
        el('div', { class: 'corrected', text: r.corrected }),
      ]));
    }
    mount(box, el('div', {}, nodes));
  }

  // первый экран: ДЗ-тема (deep-link #/<section>?z=ZID) → сразу редактор; иначе — список тем
  if (cfg.promptZid) {
    const di = items.findIndex((it) => it.zid === cfg.promptZid);
    if (di >= 0) taskScreen(di); else pickScreen();
  } else {
    pickScreen();
  }
  autoTipOnce(cfg.sectionId);
}
