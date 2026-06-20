// app.js — оболочка: hash-роутер, splash, главная, прогресс, награды, тема.
// Экзамен-независимая: структура из exam.js (EXAM), тексты из strings (t).

import { el, mount, iconImg } from './ui.js';
import { loadJSON } from './data.js';
import { sectionStats, writingStats, resetAll } from './progress.js';
import { getState, levelInfo, packStatus, streakActiveToday,
  applyTheme, getTheme, setTheme, getName, setName,
  dailyDigest, skinsStatus, setSkin, applySkin, achievementsStatus,
  getTokens, perksStatus, redeemPerk, recentRedeemed } from './gamify.js';
import { EXAM, t, sectionById, plural } from './exam.js';
import { renderDrill } from '../modules/drill.js';
import { renderWriting } from '../modules/writing.js';

const view = document.getElementById('view');
const goHome = () => { location.hash = '#/'; };

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function accColor(p) { return p >= 65 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)'; }

// Только закрытые разделы (для роутинга дрилла и статистики)
const DRILL = {};
for (const s of EXAM.sections) if (s.type === 'drill') {
  DRILL[s.id] = { section: s.id, dataFile: s.dataFile, topicKey: s.topicKey, title: t.sections[s.id],
    keysFile: EXAM.keysFile, topicsFile: EXAM.topicsFile, explainFile: EXAM.explainFile };
}

// --- Тема ---
function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); route(); }
function themeBtn(cls) {
  return el('button', { class: cls || 'theme-btn', onclick: toggleTheme,
    text: getTheme() === 'dark' ? '☀️' : '🌙', title: 'тема' });
}

// --- Роутер ---
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  setActiveTab(hash);
  const sec = sectionById(hash);
  // В режиме решения (дрилл/письмо) нижнее меню прячем, чтобы не перекрывало кнопки
  document.body.classList.toggle('in-flow', !!(sec && (sec.type === 'drill' || sec.type === 'writing')));
  if (hash === 'progress') return renderProgress();
  if (hash === 'rewards')  return renderRewards();
  if (sec && sec.type === 'drill')   return renderDrill(view, { ...DRILL[sec.id], goHome });
  if (sec && sec.type === 'writing') return renderWriting(view, { goHome, sectionId: sec.id });
  return renderHome();
}
function setActiveTab(hash) {
  const tab = (hash === 'progress' || hash === 'rewards') ? hash : 'home';
  document.querySelectorAll('#bottom-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-tab') === tab);
  });
}

// --- Главная ---
function renderHome() {
  document.body.classList.remove('welcome-mode');
  const st = getState();
  const name = getName() || t.friend;
  const lvl = levelInfo(st.xp);
  const pk = packStatus();
  const dg = dailyDigest();

  const chip = (icon, txt) => el('div', { class: 'chip' }, icon ? [icon, el('span', { text: ' ' + txt })] : [el('span', { text: txt })]);
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'h-in' }, [
      el('div', { class: 'h-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'h-hello', text: t.welcomeBack }),
          el('div', { class: 'h-name', text: name + '!' }),
        ]),
        themeBtn(),
      ]),
      el('div', { class: 'chips' }, [
        chip(iconImg('ic-streak', '🔥'), st.streak.count),
        chip(null, t.lvl + lvl.level + ' · ' + lvl.title),
        chip(iconImg('ic-hero', '🦸'), st.heroes),
        st.freezes > 0 ? chip(iconImg('ic-freeze', '🧊'), st.freezes) : null,
        chip(iconImg('ic-xp', '⭐'), st.xp + ' XP'),
      ]),
      el('div', { class: 'xp-bar' }, [el('i', { style: { width: lvl.pct + '%' } })]),
      el('div', { class: 'xp-note', text: lvl.next ? t.toRank(lvl.next, lvl.toNext) : t.maxRank }),
    ]),
  ]);

  const dPct = pct(dg.today.correct, dg.today.total);
  const wPct = pct(dg.week.correct, dg.week.total);
  const rw = (n) => n + ' ' + plural(n, t.roundsWord);
  const twRow = el('div', { class: 'tw-row' }, [
    el('div', { class: 'tw today' }, [
      el('div', { class: 'tw-h', text: t.today }),
      el('div', { class: 'tw-main', text: dg.today.rounds ? `${rw(dg.today.rounds)} · ${dPct}%` : t.empty }),
      el('div', { class: 'tw-xp', text: '+' + dg.today.xp + ' XP' }),
    ]),
    el('div', { class: 'tw week' }, [
      el('div', { class: 'tw-h', text: t.week }),
      el('div', { class: 'tw-main', text: dg.week.rounds ? `${rw(dg.week.rounds)} · ${wPct}%` : t.empty }),
      el('div', { class: 'tw-xp', text: '+' + dg.week.xp + ' XP' }),
    ]),
  ]);

  const goalDone = streakActiveToday();
  const ringPct = goalDone ? 100 : 0;
  const goal = el('div', { class: 'goal' }, [
    el('div', { class: 'ring', style: { background: `conic-gradient(var(--honey) 0% ${ringPct}%, var(--track) ${ringPct}% 100%)` } },
      [el('i', {}, [goalDone ? '✓' : iconImg('ic-goal', '🎯', 'goal-img')])]),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'g-title', text: t.goalTitle }),
      el('div', { class: 'g-text', text: goalDone ? t.goalDone(rw(dg.today.rounds)) : t.goalIdle }),
    ]),
  ]);

  const packItems = pk.ids.map((id) => {
    const sec = EXAM.sections.find((s) => s.id === id);
    const done = pk.done.includes(id);
    return el('div', { class: 'pk-cell' + (done ? ' done' : '') }, [
      el('div', { class: 'pk-ic' }, [iconImg(sec && sec.iconFile ? sec.iconFile : ('ic-' + (sec ? (sec.iconKey || sec.tile) : id)), sec ? sec.icon : '•', 'pk-img')]),
      el('div', { class: 'pk-name', text: t.sections[id] || id }),
      done ? el('div', { class: 'pk-chk', text: '✓' }) : null,
    ]);
  });
  const pack = el('div', { class: 'pack' }, [
    el('div', { class: 'p-head' }, [
      el('div', { class: 'p-t', text: t.packTitle }),
      el('div', { class: 'p-n', text: t.packOf(pk.done.length, pk.total) }),
    ]),
    el('div', { class: 'pk-cells' }, packItems),
    el('div', { class: 'p-note', text: t.packNote }),
  ]);

  const tile = (sec) => {
    const stt = sec.type === 'drill' ? sectionStats(sec.id) : null;
    const p = stt && stt.attempted ? pct(stt.correct, stt.attempted) : null;
    return el('button', { class: 'tile ' + sec.tile, onclick: () => { location.hash = '#/' + sec.id; } }, [
      el('div', { class: 't-top' }, [
        el('div', { class: 't-icon' }, [iconImg(sec.iconFile || ('ic-' + (sec.iconKey || sec.tile)), sec.icon, 'tile-img')]),
        p != null ? el('div', { class: 't-pct', text: p + '%' }) : null,
      ]),
      el('div', { class: 't-name', text: t.sections[sec.id] }),
      el('div', { class: 't-meta', text: t.sectionMeta[sec.id] || '' }),
    ]);
  };
  const tiles = el('div', { class: 'tiles' }, EXAM.sections.map(tile));
  const lockedTile = EXAM.soonTile ? el('div', { class: 'tile locked' }, [
    el('div', { class: 't-top' }, [el('div', { class: 't-icon' }, [iconImg('ic-locked', '🔒', 'tile-img')]), el('div', { class: 't-soon', text: t.soon })]),
    el('div', { class: 't-name', text: t.soonTitle }),
    el('div', { class: 't-meta', text: t.soonMeta }),
  ]) : null;

  const shortcuts = el('div', { class: 'shortcuts' }, [
    el('button', { class: 'shortcut', onclick: () => { location.hash = '#/progress'; } },
      [el('div', { class: 's-ic' }, [iconImg('ic-progress', '📊', 's-img')]), el('div', { class: 's-t', text: t.myProgress })]),
    el('button', { class: 'shortcut', onclick: () => { location.hash = '#/rewards'; } },
      [el('div', { class: 's-ic' }, [iconImg('ic-rewards', '🎖', 's-img')]), el('div', { class: 's-t', text: t.rewards })]),
  ]);

  mount(view, el('div', {}, [
    hero,
    el('div', { class: 'wrap view' }, [
      twRow, goal, pack,
      el('div', { class: 'sec-title', text: t.sectionsTitle }),
      tiles, lockedTile,
      el('div', { style: { height: '11px' } }),
      shortcuts,
    ]),
  ]));
}

// --- Прогресс ---
function renderProgress() {
  document.body.classList.remove('welcome-mode');
  const st = getState();
  const w = writingStats();
  const avg = w.count ? (w.items.reduce((s, x) => s + (x.score || 0), 0) / w.count).toFixed(1) : null;

  const miniStat = (num, lbl, color, icon) => el('div', { class: 'mini-stat' }, [
    el('div', { class: 'ms-v', style: { color } }, icon ? [num + ' ', icon] : [num]),
    el('div', { class: 'ms-l', text: lbl }),
  ]);
  const progRow = (sec) => {
    const s = sectionStats(sec.id);
    const p = s.attempted ? pct(s.correct, s.attempted) : 0;
    const c = accColor(p);
    return el('div', { class: 'prog-row' }, [
      el('div', { class: 'pr-top' }, [
        el('div', { class: 'pr-name', text: t.sections[sec.id] }),
        el('div', { class: 'pr-pct', style: { color: c }, text: p + '%' }),
      ]),
      el('div', { class: 'pr-bar' }, [el('i', { style: { width: p + '%', background: c } })]),
      el('div', { class: 'pr-meta', text: s.attempted ? t.solved(s.attempted, s.correct) : t.noSolved }),
    ]);
  };
  const drillSecs = EXAM.sections.filter((s) => s.type === 'drill');

  mount(view, el('div', { class: 'wrap view' }, [
    el('div', { class: 'prog-head' }, [el('div', { class: 'ph-title', text: t.progTitle }), themeBtn()]),
    el('div', { class: 'mini-stats' }, [
      miniStat(String(st.streak.count), t.streakLabel, '#F5A33C', iconImg('ic-streak', '🔥')),
      miniStat(String(st.xp), 'XP', 'var(--p-text)'),
      miniStat(String(st.heroes), plural(st.heroes, t.heroWord), 'var(--magenta)', iconImg('ic-hero', '🦸')),
    ]),
    el('div', { class: 'prog-section-title', text: t.bySection }),
    el('div', { class: 'prog-rows' }, drillSecs.map(progRow)),
    el('div', { class: 'avg-card' }, [
      el('div', { class: 'a-ic', text: '✉️' }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'a-t', text: t.avgTitle }),
        el('div', { class: 'a-s', text: w.count ? t.avgSub(w.count) : t.avgCrit }),
      ]),
      el('div', { class: 'a-v' }, avg ? [avg, el('span', { text: '/10' })] : [el('span', { text: '—' })]),
    ]),
    el('div', { class: 'prog-section-title', text: t.achTitle }),
    el('div', { class: 'ach-grid' }, achievementsStatus().map((a) =>
      el('div', { class: 'ach' + (a.done ? '' : ' off'), title: a.desc }, [
        el('div', { class: 'ach-ic' }, [iconImg('ach-' + a.id, a.icon, 'ach-img')]),
        el('div', { class: 'ach-t', text: a.title }),
      ]))),
    el('div', { class: 'prog-actions' }, [
      el('button', { class: 'act-name', text: t.changeName, onclick: () => renderWelcome(getName()) }),
      el('button', { class: 'act-reset', text: t.reset, onclick: () => {
        if (confirm(t.resetConfirm)) { resetAll(); renderProgress(); }
      } }),
    ]),
  ]));
}

// --- Награды (привилегии + скины) ---
function renderRewards() {
  document.body.classList.remove('welcome-mode');
  const skins = skinsStatus();
  const rows = skins.map((k) => {
    let btn;
    if (k.equipped) btn = el('button', { class: 's-btn equipped', text: t.skinEquipped });
    else if (k.unlocked) btn = el('button', { class: 's-btn equip', text: t.skinEquip, onclick: () => { if (setSkin(k.id)) renderRewards(); } });
    else btn = el('button', { class: 's-btn lock', text: '🔒 ' + k.need });
    return el('div', { class: 'skin' + (k.unlocked ? '' : ' locked') }, [
      el('div', { class: 's-top' }, [
        el('div', {}, [el('div', { class: 's-name', text: k.name }), el('div', { class: 's-desc', text: k.desc })]),
        btn,
      ]),
      el('div', { class: 's-prev' }, [el('i', { style: { background: k.grad } })]),
    ]);
  });

  const tokens = getTokens();
  const perks = perksStatus().map((p) =>
    el('div', { class: 'perk' + (p.affordable ? '' : ' off') }, [
      el('div', { class: 'perk-ic' }, [iconImg('perk-' + p.id, p.icon, 'perk-img')]),
      el('div', { class: 'perk-info' }, [
        el('div', { class: 'perk-t', text: p.title }),
        el('div', { class: 'perk-d', text: p.desc }),
      ]),
      el('button', { class: 'perk-btn' + (p.affordable ? '' : ' lock'), disabled: !p.affordable,
        text: '🎟 ' + p.cost,
        onclick: () => { const r = redeemPerk(p.id); if (r) { showBadge(r); renderRewards(); } } }),
    ]));
  const recent = recentRedeemed().slice(0, 5);
  const recentBlock = recent.length ? el('div', { class: 'redeemed' },
    [el('div', { class: 'redeemed-h', text: t.redeemedTitle }),
      ...recent.map((r) => el('div', { class: 'red-row' }, [
        el('span', { text: (r.perk ? r.perk.icon + ' ' + r.perk.title : '—') }),
        el('span', { class: 'red-meta', text: r.code + ' · ' + fmtDate(r.ts) }),
      ]))]) : null;

  mount(view, el('div', { class: 'wrap view' }, [
    el('div', { class: 'rew-title', text: t.rewards + ' 🎖' }),
    el('div', { class: 'tokens-bar' }, [
      iconImg('perk-ticket', '🎟', 'tok-ic'),
      el('span', { class: 'tok-n', text: String(tokens) }),
      el('span', { class: 'tok-l', text: t.tokensLabel(tokens, plural(tokens, t.tokenWord)) }),
    ]),
    el('div', { class: 'rew-sub', text: t.perksSub }),
    el('div', { class: 'perk-list' }, perks),
    recentBlock,
    el('div', { class: 'rew-skins-title', text: t.skinsTitle }),
    el('div', { class: 'skin-list' }, rows),
  ]));
}

function fmtDate(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

function showBadge(r) {
  const overlay = el('div', { class: 'badge-screen' });
  const fallback = el('div', { class: 'badge-ic', text: r.perk.icon });
  const spiky = el('img', { class: 'badge-img', src: './assets/spiky-gift.png', alt: '' });
  spiky.addEventListener('error', () => spiky.replaceWith(fallback));
  overlay.appendChild(el('div', { class: 'badge-card' }, [
    spiky,
    el('div', { class: 'badge-t', text: r.perk.title }),
    el('div', { class: 'badge-show', text: t.badgeShow }),
    el('div', { class: 'badge-code', text: r.code }),
    el('div', { class: 'badge-date', text: fmtDate(r.ts) }),
    el('button', { class: 'btn btn-honey btn-block', text: t.badgeDone, onclick: () => overlay.remove() }),
  ]));
  document.body.appendChild(overlay);
}

// --- Splash / знакомство ---
function renderWelcome(prefill) {
  document.body.classList.add('welcome-mode');
  const input = el('input', { class: 'name-input', type: 'text', placeholder: t.namePlaceholder,
    maxlength: '24', autocomplete: 'off', value: prefill || '' });
  const go = el('button', { class: 'go', text: t.go, disabled: !(prefill && prefill.trim()) });
  const submit = () => {
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    setName(n);
    goHome();
  };
  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => { go.disabled = !input.value.trim(); });

  mount(view, el('div', { class: 'splash' }, [
    el('div', { class: 'shine' }),
    el('div', { class: 'inner' }, [
      el('img', { src: EXAM.splashImg, alt: 'Speaky' }),
      el('div', { class: 'brandline', text: t.brandline }),
      el('div', { class: 'greet' }, [t.greetHi, el('br'), t.greetQ]),
      input, go,
      el('div', { class: 'note', text: t.offlineNote }),
    ]),
  ]));
  input.focus();
}

// --- Иконки нижнего меню (картинки с откатом на эмодзи) ---
const NAV_IC = { home: ['ic-home', '🏠'], progress: ['ic-progress', '📊'], rewards: ['ic-rewards', '🎖'] };
document.querySelectorAll('#bottom-nav a').forEach((a) => {
  const tab = a.getAttribute('data-tab'), ic = a.querySelector('.bn-ic');
  if (ic && NAV_IC[tab]) ic.replaceWith(iconImg(NAV_IC[tab][0], NAV_IC[tab][1], 'bn-ic'));
});

// --- Инициализация ---
applyTheme(getTheme());
applySkin();
window.addEventListener('hashchange', route);
if (!getName()) renderWelcome();
else route();
