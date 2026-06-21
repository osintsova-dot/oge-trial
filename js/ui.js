// ui.js — крошечные хелперы для нативного DOM (без innerHTML на пользовательских данных)

import { t } from './exam.js';
import { playFanfare, playSparkle } from './sound.js';

// el('div', {class:'card', onclick:fn}, [child, 'текст']) → HTMLElement
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;            // только для доверенного статического HTML
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// Полностью заменить содержимое контейнера
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes);
}

export function clear(node) { node.replaceChildren(); }

// Кнопка «назад»
export function backLink(text, onClick) {
  return el('button', { class: 'back-link', onclick: onClick }, ['← ', text]);
}

// Инлайн-иконка-статус: картинка ./assets/<name>.png с откатом на эмодзи, если файла нет.
export function iconImg(name, emoji, cls) {
  const span = el('span', { text: emoji });
  const img = el('img', { class: 'sic' + (cls ? ' ' + cls : ''), src: './assets/' + name + '.png', alt: '' });
  img.addEventListener('error', () => img.replaceWith(span));
  return img;
}

// true, если пользователь просит меньше движения (системная настройка)
function reduceMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Анимированный счётчик: значение «накручивается» от from до to за duration мс.
// fmt(v) форматирует целое число в строку (например, v => '+' + v).
export function countUp(node, to, { from = 0, duration = 600, fmt = (v) => String(v) } = {}) {
  if (reduceMotion() || to === from) { node.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic — быстро в начале, мягко в конце
    node.textContent = fmt(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Лёгкое CSS-конфетти на пару секунд (level-up / Герой). Без библиотек; уважает reduce-motion.
export function confetti({ count = 28, duration = 1700 } = {}) {
  if (reduceMotion()) return;
  const colors = ['#6C3FC5', '#C84B8C', '#F5C842', '#F5A03C', '#8E5BE8'];
  const layer = el('div', { class: 'confetti' });
  for (let i = 0; i < count; i++) {
    const piece = el('i');
    piece.style.left = Math.round(Math.random() * 100) + '%';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = (1.6 + Math.random() * 1.4).toFixed(2) + 's';
    piece.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), duration + 1400);
}

// Иконка момента: картинка Спики (если есть файл) с откатом на эмодзи, если файла нет.
export function spikyIcon(imgSrc, emoji) {
  const fallback = el('div', { class: 'cel-icon', text: emoji });
  if (!imgSrc) return fallback;
  const img = el('img', { class: 'cel-img', src: imgSrc, alt: '' });
  img.addEventListener('error', () => img.replaceWith(fallback)); // нет файла → эмодзи
  return img;
}

// Праздничные экраны: показываем moments по очереди (как интермедии Duolingo).
// moment: { icon, title, text, confetti?:bool }. По «Дальше» — следующий; в конце — onDone().
export function celebrate(moments, onDone) {
  const list = (moments || []).filter(Boolean);
  if (!list.length) { if (onDone) onDone(); return; }
  const overlay = el('div', { class: 'celebrate' });
  let i = 0;
  const next = () => {
    i++;
    if (i >= list.length) { overlay.remove(); if (onDone) onDone(); }
    else render();
  };
  const render = () => {
    const m = list[i];
    overlay.replaceChildren(el('div', { class: 'cel-card' }, [
      spikyIcon(m.img, m.icon),
      el('div', { class: 'cel-title', text: m.title }),
      el('div', { class: 'cel-text', text: m.text }),
      el('div', { class: 'cel-dots' }, list.map((_, k) => el('i', { class: k === i ? 'on' : '' }))),
      el('button', { class: 'btn btn-honey btn-block', text: i + 1 < list.length ? t.celNext : t.celClaim, onclick: next }),
    ]));
    if (m.confetti) { confetti({ count: 22 }); playFanfare(); }
    else playSparkle();
  };
  render();
  document.body.appendChild(overlay);
}

// Простая модалка-объяснение: иконка + заголовок + текст + статус-бейдж.
// opts: { iconName, icon, title, text, status:{label,done} }
export function infoModal(opts) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  // иконка: либо градиентный кружок (скины), либо картинка с откатом на эмодзи
  const head = opts.swatch
    ? el('div', { class: 'modal-ic' }, [el('div', { class: 'modal-swatch', style: { background: opts.swatch } })])
    : el('div', { class: 'modal-ic' }, [iconImg(opts.iconName, opts.icon, 'modal-img')]);
  const card = el('div', { class: 'modal-card' + (opts.status && !opts.status.done ? ' locked' : '') }, [
    head,
    el('div', { class: 'modal-title', text: opts.title }),
    el('div', { class: 'modal-text', text: opts.text }),
    opts.list ? el('div', { class: 'modal-list' }, opts.list.map((r) =>
      el('div', { class: 'modal-row' + (r.active ? ' active' : '') }, [
        el('span', { class: 'mr-name', text: r.left }),
        el('span', { class: 'mr-xp', text: r.right }),
      ]))) : null,
    opts.note ? el('div', { class: 'modal-note', text: opts.note }) : null,
    opts.status ? el('div', { class: 'modal-status ' + (opts.status.done ? 'done' : 'locked'), text: opts.status.label }) : null,
    el('button', { class: 'btn btn-honey btn-block', style: { marginTop: '18px' }, text: t.modalClose, onclick: close }),
  ]);
  back.appendChild(card);
  document.body.appendChild(back);
}

// Слайды-карточки (рассказ о формате экзамена). По образцу celebrate, но спокойнее:
// без конфетти/фанфар, Спики на каждой карте, кнопка «Дальше →», на последней — lastCta.
// cards = [{ img, icon, title, text }]; onDone() — по завершении.
export function slides(cards, { onDone, lastCta } = {}) {
  const list = (cards || []).filter(Boolean);
  if (!list.length) { if (onDone) onDone(); return; }
  const overlay = el('div', { class: 'celebrate slides' });
  let i = 0;
  const next = () => { i++; if (i >= list.length) { overlay.remove(); if (onDone) onDone(); } else render(); };
  const render = () => {
    const c = list[i];
    overlay.replaceChildren(el('div', { class: 'cel-card' }, [
      spikyIcon(c.img, c.icon || '🦝'),
      el('div', { class: 'cel-title', text: c.title }),
      el('div', { class: 'cel-text', text: c.text }),
      el('div', { class: 'cel-dots' }, list.map((_, k) => el('i', { class: k === i ? 'on' : '' }))),
      el('button', { class: 'btn btn-honey btn-block', text: i + 1 < list.length ? (t.celNext || 'Дальше →') : (lastCta || t.go || 'Поехали!'), onclick: next }),
    ]));
    playSparkle();
  };
  render();
  document.body.appendChild(overlay);
}
