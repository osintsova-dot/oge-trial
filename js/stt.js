// stt.js — распознавание речи ученика через Yandex SpeechKit (воркер-прокси).
// Запись MediaRecorder (webm/mp4/...) → декодируем Web Audio API → ресемпл 16 кГц моно →
// режем на куски ≤28 сек → каждый в сырой LPCM → POST в воркер → склеиваем текст.
// Так обходим лимит синхронного распознавания (30 сек/1 МБ) и разнобой форматов (iOS/Android).

import { fetchRetry } from './net.js';

const STT_WORKER = 'https://withered-bush-199foge-stt.o-sintsova.workers.dev';
const RATE = 16000;          // частота для SpeechKit
const CHUNK_SEC = 28;        // запас под лимит 30 сек

export function canRecognize() {
  return typeof window !== 'undefined'
    && (window.AudioContext || window.webkitAudioContext)
    && typeof OfflineAudioContext !== 'undefined';
}

// blob записи → распознанный текст (en-US). onProgress(done, total) — необязательный колбэк.
export async function recognize(blob, onProgress) {
  if (!blob) throw new Error('нет записи');
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  let decoded;
  try { decoded = await actx.decodeAudioData(buf.slice(0)); }
  finally { try { actx.close(); } catch {} }

  // ресемпл в 16 кГц моно через OfflineAudioContext
  const length = Math.max(1, Math.ceil(decoded.duration * RATE));
  const off = new OfflineAudioContext(1, length, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const full = rendered.getChannelData(0); // Float32 @16k моно

  // обрезаем тишину по краям (иначе SpeechKit галлюцинирует фантомные фразы на тишине)
  const data = trimSilence(full);

  // режем на куски ≤28 сек, почти-беззвучные куски пропускаем
  const chunkLen = CHUNK_SEC * RATE;
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkLen) {
    const ch = data.subarray(i, Math.min(i + chunkLen, data.length));
    if (rms(ch, 0, ch.length) >= 0.006) chunks.push(ch); // тихий кусок → пропуск
  }
  if (!chunks.length) throw new Error('пустая запись');

  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const lpcm = floatToLpcm(chunks[i]);
    const res = await fetchRetry(STT_WORKER + '?lang=en-US', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: lpcm,
    }, { timeoutMs: 45000, tries: 2 });
    let j;
    try { j = await res.json(); } catch { throw new Error('ответ распознавания не прочитан'); }
    if (!res.ok || j.error) throw new Error(j.error || ('ошибка распознавания ' + res.status));
    if (j.result) parts.push(j.result);
    if (onProgress) onProgress(i + 1, chunks.length);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// RMS-громкость участка
function rms(a, s, e) { let sum = 0; for (let i = s; i < e; i++) sum += a[i] * a[i]; return Math.sqrt(sum / Math.max(1, e - s)); }

// Обрезка тишины по краям по окнам 20 мс (с запасом 0.1 c). Если порог «съел» всё — вернуть как есть.
function trimSilence(data) {
  const win = Math.floor(RATE * 0.02), TH = 0.012, pad = Math.floor(RATE * 0.1);
  let s0 = 0, e0 = data.length;
  for (let i = 0; i + win <= data.length; i += win) { if (rms(data, i, i + win) > TH) { s0 = i; break; } }
  for (let i = data.length - win; i >= 0; i -= win) { if (rms(data, i, i + win) > TH) { e0 = i + win; break; } }
  s0 = Math.max(0, s0 - pad); e0 = Math.min(data.length, e0 + pad);
  const voice = data.subarray(s0, e0);
  return voice.length >= RATE * 0.3 ? voice : data;
}

// Float32 [-1..1] → сырой LPCM 16-bit little-endian
function floatToLpcm(float32) {
  const out = new ArrayBuffer(float32.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return out;
}
