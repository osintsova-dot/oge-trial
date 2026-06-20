// sound.js — звуки результата на Web Audio API (без mp3-файлов).
// «та-да!» на верный ответ и «па-па-па-пам» (sad trombone) на неверный.
// Уважает настройку звука (gamify.getSound); проигрывается только по жесту пользователя.
import { getSound } from './gamify.js';

let ctx = null;

// Контекст создаём лениво — строго внутри пользовательского жеста (тап «Проверить»),
// иначе iOS Safari не даст звук. Если контекст «уснул» — будим.
function audio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// Одна нота: тип волны, частота(ы) для глиссандо, тайминги и громкость.
function note(ac, { type = 'sine', f0, f1, t, dur, vol = 0.2, cutoff = 0 }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  // мягкая огибающая: быстрый подъём, плавное затухание (без щелчков)
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let last = gain;
  if (cutoff) { // лёгкий «духовой» окрас для sad trombone
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    osc.connect(lp); lp.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return last;
}

// Верно — бодрое мажорное арпеджио C5–E5–G5–C6 («та-да-да-дам!»).
export function playCorrect() {
  if (!getSound()) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime;
  const seq = [523.25, 659.25, 783.99, 1046.5];
  seq.forEach((f, i) => note(ac, { type: 'triangle', f0: f, t: t + i * 0.09, dur: i === 3 ? 0.32 : 0.1, vol: 0.22 }));
}

// Неверно — нисходящий «па-па-па-пам» (sad trombone) с фирменным сползанием на последней ноте.
export function playWrong() {
  if (!getSound()) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime;
  const steps = [233.08, 220.0, 207.65]; // Bb3 → A3 → G#3 (короткие «па-па-па»)
  steps.forEach((f, i) => note(ac, { type: 'sawtooth', f0: f, t: t + i * 0.16, dur: 0.14, vol: 0.16, cutoff: 1100 }));
  // финальное «пам» с глиссандо вниз
  note(ac, { type: 'sawtooth', f0: 196.0, f1: 138.59, t: t + 0.5, dur: 0.5, vol: 0.18, cutoff: 1000 });
}

// Аккорд: несколько нот разом (для финала фанфары).
function chord(ac, freqs, t, dur, vol) {
  freqs.forEach((f) => note(ac, { type: 'triangle', f0: f, t, dur, vol }));
}

// Праздник со Спики (достижение/Герой/уровень/жетон) — триумфальная фанфара с финальным аккордом.
export function playFanfare() {
  if (!getSound()) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime;
  // разбег «та-та-та-ДАМ» → восходящее арпеджио
  const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  run.forEach((f, i) => note(ac, { type: 'triangle', f0: f, t: t + i * 0.11, dur: 0.12, vol: 0.2 }));
  // финальный мажорный аккорд C6–E6–G6 с подзвоном
  chord(ac, [1046.5, 1318.51, 1567.98], t + 0.46, 0.6, 0.16);
  note(ac, { type: 'sine', f0: 2093.0, t: t + 0.46, dur: 0.5, vol: 0.08 });
}

// Лёгкий «переливчик» для второстепенных праздничных карточек (цель дня и т.п.).
export function playSparkle() {
  if (!getSound()) return;
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime;
  [1318.51, 1567.98, 2093.0].forEach((f, i) => note(ac, { type: 'sine', f0: f, t: t + i * 0.07, dur: 0.16, vol: 0.12 }));
}
