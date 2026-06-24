// ocr.js — распознавание текста с фото письма через Yandex Vision OCR (воркер-прокси).
// Фото с телефона бывает 5–10 МБ → сжимаем через canvas (макс. сторона 2200px, JPEG q0.85),
// шлём сырые байты в воркер → воркер кодирует в base64 и зовёт Vision → возвращает текст.
// Рукопись распознаётся с ошибками — поэтому в UI ОБЯЗАТЕЛЕН шаг «сверь и поправь».

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
  const res = await fetch(OCR_WORKER + '?lang=ru,en&model=handwritten&mime=' + encodeURIComponent(mime), {
    method: 'POST', headers: { 'Content-Type': mime }, body: buf,
  });
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
  const res = await fetch(OCR_WORKER + '?lang=en&model=handwritten&boxes=1&mime=' + encodeURIComponent(mime), {
    method: 'POST', headers: { 'Content-Type': mime }, body: buf,
  });
  let j;
  try { j = await res.json(); } catch { throw new Error('ответ распознавания не прочитан'); }
  if (!res.ok || j.error) throw new Error(j.error || ('ошибка распознавания ' + res.status));
  return { text: (j.result || '').trim(), words: j.words || [] };
}

// Разбор сетки: слова с координатами → { номер_задания: ответ }. Кластеризует по строкам (y),
// в строке сортирует по x, первый числовой токен = номер задания, остальное = ответ (склейка букв).
export function parseAnswerGrid(words) {
  const ws = (words || []).filter((w) => w.t && w.t.trim());
  if (!ws.length) return {};
  const hs = ws.map((w) => w.y2 - w.y).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)] || 30;
  const thr = Math.max(18, medH * 0.6);
  ws.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const w of ws) {
    const cy = (w.y + w.y2) / 2;
    let r = rows.find((r) => Math.abs(r.cy - cy) < thr);
    if (!r) { r = { cy, items: [] }; rows.push(r); }
    r.items.push(w);
    r.cy = r.items.reduce((s, x) => s + (x.y + x.y2) / 2, 0) / r.items.length;
  }
  const out = {};
  for (const r of rows) {
    const toks = r.items.sort((a, b) => a.x - b.x).map((w) => w.t.trim());
    const mi = toks.findIndex((tk) => /^\d{1,3}$/.test(tk));
    if (mi < 0) continue;
    const ans = toks.slice(mi + 1).join('').replace(/\s+/g, '');
    if (!ans) continue;
    if (/\d{8,}/.test(ans)) continue; // образец цифр «1234567890» из шапки ФИПИ — не ответ
    out[toks[mi]] = ans; // строки идут сверху вниз: нижняя (реальная сетка) перезапишет шумы шапки

  }
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
