// ocr.js — распознавание текста с фото письма через Yandex Vision OCR (воркер-прокси).
// Фото с телефона бывает 5–10 МБ → сжимаем через canvas (макс. сторона 2200px, JPEG q0.85),
// шлём сырые байты в воркер → воркер кодирует в base64 и зовёт Vision → возвращает текст.
// Рукопись распознаётся с ошибками — поэтому в UI ОБЯЗАТЕЛЕН шаг «сверь и поправь».

import { fetchRetry } from './net.js';

// Воркер yandex-ocr.js (Cloudflare, аккаунт o-sintsova). Прокси к Yandex Vision OCR.
const OCR_WORKER = 'https://oge-ocr.o-sintsova.workers.dev';

const MAX_SIDE = 2200;   // макс. сторона после сжатия (хватает Vision, payload небольшой)
const Q = 0.85;          // качество JPEG

// Доступно ли распознавание фото (есть canvas + прописан URL воркера).
export function canRecognizePhoto() {
  return !!OCR_WORKER && typeof document !== 'undefined' && !!document.createElement('canvas').getContext;
}

// File (из <input type=file capture>) → распознанный текст. Бросает Error при сбое.
export async function recognizePhoto(file) {
  if (!OCR_WORKER) throw new Error('OCR-воркер не настроен');
  if (!file) throw new Error('нет фото');
  const { blob, mime } = await shrink(file);
  const buf = await blob.arrayBuffer();
  const res = await fetchRetry(OCR_WORKER + '?lang=ru,en&model=handwritten&mime=' + encodeURIComponent(mime), {
    method: 'POST', headers: { 'Content-Type': mime }, body: buf,
  }, { timeoutMs: 60000, tries: 2 });
  let j;
  try { j = await res.json(); } catch { throw new Error('ответ распознавания не прочитан'); }
  if (!res.ok || j.error) throw new Error(j.error || ('ошибка распознавания ' + res.status));
  const text = (j.result || '').trim();
  if (!text) throw new Error('на фото не нашлось текста — сними поближе и при хорошем свете');
  return text;
}

// Распознать бланк ответов-сетку: возвращает {text, words:[{t,x,y,x2,y2}]} (координаты для разбора по клеткам).
export async function recognizeBlank(file) {
  if (!OCR_WORKER) throw new Error('OCR-воркер не настроен');
  if (!file) throw new Error('нет фото');
  const { blob, mime } = await shrink(file);
  const buf = await blob.arrayBuffer();
  const res = await fetchRetry(OCR_WORKER + '?lang=en&model=handwritten&boxes=1&mime=' + encodeURIComponent(mime), {
    method: 'POST', headers: { 'Content-Type': mime }, body: buf,
  }, { timeoutMs: 60000, tries: 2 });
  let j;
  try { j = await res.json(); } catch { throw new Error('ответ распознавания не прочитан'); }
  if (!res.ok || j.error) throw new Error(j.error || ('ошибка распознавания ' + res.status));
  return { text: (j.result || '').trim(), words: j.words || [] };
}

// Разбор бланка-сетки: слова с координатами → { номер_задания: ответ }.
// Надёжность: ответ = ЗАГЛАВНЫЕ ЛАТИНСКИЕ буквы строки (склейка по x), а НОМЕР задания —
// по вертикальной позиции строки (линейная регрессия по печатным номерам строк, которые
// читаются стабильно даже у пустых строк). Зона — ниже полосы «…КРАТКИМ ОТВЕТОМ» (отсекает шапку).
// expectedNums — номера заданий из worksheet (для границ и запасного присвоения по порядку).
export function parseAnswerGrid(words, expectedNums) {
  const ws = (words || []).filter((w) => w.t && w.t.trim());
  if (!ws.length) return {};
  const maxN = (expectedNums && expectedNums.length) ? Math.max(...expectedNums) : 60;
  const hs = ws.map((w) => w.y2 - w.y).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)] || 20;
  const thr = Math.max(14, medH * 0.7);
  // кластеризация токенов в строки по y
  ws.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const w of ws) {
    const cy = (w.y + w.y2) / 2;
    let r = rows.find((rr) => Math.abs(rr.cy - cy) < thr);
    if (!r) { r = { cy, items: [] }; rows.push(r); }
    r.items.push(w);
    r.cy = r.items.reduce((s, x) => s + (x.y + x.y2) / 2, 0) / r.items.length;
  }
  // зона ответов = ниже полосы «КРАТКИМ ОТВЕТОМ» (если нашли)
  let bandY = 0;
  for (const r of rows) {
    const txt = r.items.map((w) => w.t).join(' ').toLowerCase();
    if (/кратк|ответом/.test(txt)) bandY = Math.max(bandY, r.cy);
  }
  const zone = rows.filter((r) => r.cy > bandY + 6);
  // якоря-позиции: одиночные печатные цифры 1..maxN → (номер, y)
  const anchors = [];
  for (const r of zone) for (const w of r.items) {
    const tk = w.t.trim();
    if (/^\d{1,2}$/.test(tk)) { const v = +tk; if (v >= 1 && v <= maxN) anchors.push({ num: v, y: (w.y + w.y2) / 2 }); }
  }
  // линейная регрессия y = a*num + b (номер строки из её позиции)
  let a = 0, b = 0;
  if (anchors.length >= 2) {
    const n = anchors.length;
    const sx = anchors.reduce((s, p) => s + p.num, 0), sy = anchors.reduce((s, p) => s + p.y, 0);
    const sxx = anchors.reduce((s, p) => s + p.num * p.num, 0), sxy = anchors.reduce((s, p) => s + p.num * p.y, 0);
    const den = n * sxx - sx * sx;
    if (den) { a = (n * sxy - sx * sy) / den; b = (sy - a * sx) / n; }
  }
  // строки с латинскими буквами = ответы; номер по позиции
  const got = [];
  for (const r of zone) {
    const lat = r.items.filter((w) => /^[A-Za-z]+$/.test(w.t.trim())).sort((x, y) => x.x - y.x);
    if (!lat.length) continue;
    const ans = lat.map((w) => w.t.trim().toUpperCase()).join('');
    if (ans.length > 18) continue; // строка алфавита-образца ABCDEF…Z из шапки — не ответ
    got.push({ cy: r.cy, ans, num: a ? Math.round((r.cy - b) / a) : null });
  }
  // запасной вариант (нет регрессии): присвоить по порядку сверху вниз
  if (!a && expectedNums && expectedNums.length) {
    got.sort((p, q) => p.cy - q.cy);
    got.forEach((p, i) => { if (i < expectedNums.length) p.num = expectedNums[i]; });
  }
  const out = {};
  for (const p of got) if (p.num != null && p.num >= 1 && p.num <= maxN && p.ans) out[String(p.num)] = p.ans;
  return out;
}

// Сжать картинку: вписать в MAX_SIDE, перекодировать в JPEG. PNG/HEIC с телефона тоже пройдут.
async function shrink(file) {
  const img = await loadImage(file);
  let { width: w, height: h } = img;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  if (img.close) try { img.close(); } catch {}
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', Q));
  if (!blob) throw new Error('не удалось обработать фото');
  return { blob, mime: 'image/jpeg' };
}

function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaTag(file));
  }
  return loadViaTag(file);
}

function loadViaTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); }; // декодировано → URL больше не нужен
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не удалось открыть фото')); };
    im.src = url;
  });
}
