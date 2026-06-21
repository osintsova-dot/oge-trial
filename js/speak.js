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
  const prefer = ['Daniel', 'Kate', 'Serena', 'Sonia', 'Arthur', 'Oliver', 'Libby', 'George', 'Martha', 'Stephanie'];
  for (const p of prefer) { const m = gb.find((v) => v.name.includes(p)); if (m) return m; }
  return gb[0] || voices.find((v) => /^en/i.test(v.lang)) || null;
}

// Произнести английский текст британским голосом.
export function speak(text) {
  if (!canSpeak() || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = 'en-GB';
    u.rate = 0.9;
    synth.speak(u);
  } catch {}
}
