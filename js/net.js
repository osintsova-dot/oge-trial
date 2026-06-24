// net.js — устойчивые сетевые вызовы для AI/OCR/STT-воркеров: таймаут + ретраи.
// Без этого зависший воркер вешает UI на «Оцениваю…» без выхода.

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// fetch с AbortController-таймаутом и ретраями на 429/5xx/сетевой сбой.
// Возвращает Response (последнюю попытку — как есть; вызывающий проверяет .ok). Бросает при сети/таймауте.
export async function fetchRetry(url, init = {}, { timeoutMs = 60000, tries = 2, retryDelayMs = 1200 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if ((r.status === 429 || r.status >= 500) && attempt < tries - 1) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return r;
    } catch (e) {
      clearTimeout(timer);
      lastErr = (e && e.name === 'AbortError') ? new Error('превышено время ожидания сервера') : e;
      if (attempt < tries - 1) { await sleep(retryDelayMs * (attempt + 1)); continue; }
      throw lastErr;
    }
  }
  throw lastErr || new Error('сетевая ошибка');
}

// Безопасный разбор JSON из ответа LLM (вокруг бывает markdown/пояснения/обрыв по лимиту токенов).
export function parseModelJSON(text) {
  const cleaned = (text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const m = cleaned.match(/\{[\s\S]*\}/); // вытащить первый объект
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  throw new Error('не удалось разобрать оценку (попробуй ещё раз)');
}
