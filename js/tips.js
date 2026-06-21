// tips.js — советы Спики по разделу (формат · время · как делать · частые ошибки).
// Контент берётся из памяток EXAM.memosFile (app/data/memos.json для ОГЭ).
// Кнопка «💡» в шапке раздела + авто-показ при первом входе (флаг в gamify).

import { el, iconImg } from './ui.js';
import { loadJSON } from './data.js';
import { EXAM, t } from './exam.js';
import { hasSeenTip, markTipSeen } from './gamify.js';

// id раздела в приложении → ключ section в памятках
const SECTION_MEMO = { grammar: 'grammar', wordform: 'word_formation', reading: 'reading', writing: 'writing' };

let _memos = null;
async function loadMemos() {
  if (!EXAM.memosFile) return null;
  if (_memos) return _memos;
  try { _memos = await loadJSON(EXAM.memosFile); } catch { _memos = []; }
  return _memos;
}
function memoFor(memos, sectionId) {
  const key = SECTION_MEMO[sectionId];
  return key ? (memos || []).find((m) => m.section === key) : null;
}
function hasMemo(sectionId) { return !!(EXAM.memosFile && SECTION_MEMO[sectionId]); }

// Кнопка «💡» для шапки раздела. null, если у раздела/экзамена нет памятки.
export function tipButton(sectionId) {
  if (!hasMemo(sectionId)) return null;
  return el('button', { class: 'tip-btn', title: t.tipFormat, onclick: () => openTips(sectionId) }, [el('span', { text: '💡' })]);
}

// Авто-показ один раз при первом входе в раздел.
export async function autoTipOnce(sectionId) {
  if (!hasMemo(sectionId) || hasSeenTip(sectionId)) return;
  markTipSeen(sectionId);
  openTips(sectionId);
}

export async function openTips(sectionId) {
  const memos = await loadMemos();
  const m = memoFor(memos, sectionId);
  if (m) tipsModal(m, sectionId);
}

function bullets(items) {
  return el('ul', { class: 'tip-list' }, (items || []).map((s) => el('li', { text: s })));
}

function tipsModal(m, sectionId) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const card = el('div', { class: 'modal-card tips-card' }, [
    el('div', { class: 'modal-ic' }, [iconImg('spiky-idea', '💡', 'modal-img')]),
    el('div', { class: 'modal-title', text: t.tipsTitle(t.sections[sectionId] || '') }),
    el('div', { class: 'tip-block' }, [el('div', { class: 'tip-lbl', text: t.tipTime }), el('div', { class: 'tip-txt', text: m.time })]),
    el('div', { class: 'tip-block' }, [el('div', { class: 'tip-lbl', text: t.tipFormat }), el('div', { class: 'tip-txt', text: m.format })]),
    el('div', { class: 'tip-block' }, [el('div', { class: 'tip-lbl', text: t.tipHow }), bullets(m.strategy)]),
    el('div', { class: 'tip-block' }, [el('div', { class: 'tip-lbl', text: t.tipMistakes }), bullets(m.common_mistakes)]),
    el('button', { class: 'btn btn-honey btn-block', style: { marginTop: '6px' }, text: t.modalClose, onclick: close }),
  ]);
  back.appendChild(card);
  document.body.appendChild(back);
}
