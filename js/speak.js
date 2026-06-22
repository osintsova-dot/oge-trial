// speak.js — британское произношение слов через встроенный Web Speech API (без файлов/бэкенда).
// Голос en-GB подбирается из доступных в системе; на iOS/Android они есть (Daniel, Kate, Serena…).

let voices = [];
function loadVoices() { try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; } }
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function canSpeak() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }

function pickVoice() {
  if (!voices.length) loadVoices();
  const gb = voices.filter((v) => /en[-_]?GB/i.test(v.lang) || /british|united kingdom|\(uk\)/i.test(v.name));
  // женские британские голоса в приоритете
  const female = ['Kate', 'Serena', 'Sonia', 'Libby', 'Hazel', 'Stephanie', 'Martha', 'Amy', 'Emma'];
  for (const p of female) { const m = gb.find((v) => v.name.includes(p)); if (m) return m; }
  const f2 = gb.find((v) => /female|женск/i.test(v.name));
  return f2 || gb[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
}

// Произнести английский текст британским голосом.
// opts.onend / opts.onstart — колбэки для управления кнопками (плей/пауза/стоп).
export function speak(text, opts) {
  if (!canSpeak() || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = 'en-GB';
    u.rate = 0.9;
    if (opts && opts.onstart) u.onstart = opts.onstart;
    if (opts && opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
    synth.speak(u);
  } catch {}
}

// Пауза / продолжить / стоп — управление воспроизведением эталона в любой момент.
export function pauseSpeak() { try { window.speechSynthesis.pause(); } catch {} }
export function resumeSpeak() { try { window.speechSynthesis.resume(); } catch {} }
export function stopSpeak() { try { window.speechSynthesis.cancel(); } catch {} }
export function isSpeaking() { try { return window.speechSynthesis.speaking; } catch { return false; } }
export function isPaused() { try { return window.speechSynthesis.paused; } catch { return false; } }
