// exam.js — конфиг экзамена. Один движок, два экзамена (ОГЭ ru / ЕГЭ en).
// Точка входа задаёт window.EXAM ('oge' | 'ege') ДО загрузки app.js; по умолчанию — oge.
// Структура (разделы/данные/шкалы/пак/хранилище) — здесь; тексты — в strings.js по exam.lang.

import { STRINGS } from './strings.js';

const CONFIGS = {
  oge: {
    id: 'oge', lang: 'ru', badge: 'ОГЭ · English', store: 'oge', splashImg: './assets/spiky-cool.png',
    examShort: 'ОГЭ', memosFile: 'memos',
    keysFile: 'keys', topicsFile: 'topics', explainFile: 'explanations',
    // type: 'drill' — закрытые задания по ключу; 'writing' — письмо с AI-проверкой
    sections: [
      { id: 'vocab',    type: 'vocab',   dataFile: 'vocab', tile: 'vocab', iconKey: 'vocab', icon: '🗂' },
      { id: 'grammar',  type: 'drill',   dataFile: 'grammar',  topicKey: 'Грамматика',       tile: 'grammar',  icon: '📝' },
      { id: 'wordform', type: 'drill',   dataFile: 'wordform', topicKey: 'Словообразование', tile: 'wordform', icon: '🔤' },
      { id: 'reading',  type: 'reading', dataFile: 'reading',  tile: 'reading', iconKey: 'reading', icon: '📖' },
      { id: 'writing',  type: 'writing', tile: 'writing', icon: '✉️' },
      { id: 'speaking', type: 'soon',    tile: 'speaking', iconKey: 'speaking', icon: '🎤' },
    ],
    pack: ['grammar', 'wordform', 'reading', 'writing'],
    soonTile: true,
    // Письмо ОГЭ — одно задание (личное письмо, задание 35, К1–К4, макс 10)
    writing: {
      kind: 'oge',
      tasks: [{
        id: 'letter', dataFile: 'writing', sectionId: 'writing', max: 10, words: [100, 120],
        criteria: [
          { code: 'К1', name: 'Решение коммуникативной задачи', max: 3 },
          { code: 'К2', name: 'Организация текста', max: 2 },
          { code: 'К3', name: 'Лексико-грамматическое оформление', max: 3 },
          { code: 'К4', name: 'Орфография и пунктуация', max: 2 },
        ],
      }],
    },
  },

  ege: {
    id: 'ege', lang: 'en', badge: 'ЕГЭ · English', store: 'ege', splashImg: './assets/spiky-cool.png',
    examShort: 'ЕГЭ', memosFile: null,
    keysFile: 'ege_keys', topicsFile: 'ege_topics', explainFile: 'ege_explanations',
    sections: [
      { id: 'vocab',   type: 'vocab',   dataFile: 'ege_vocab',   tile: 'vocab', iconKey: 'vocab', icon: '🗂' },
      { id: 'grammar', type: 'drill',   dataFile: 'ege_grammar', topicKey: 'Грамматика',       tile: 'grammar',  icon: '📝' },
      { id: 'lexis',   type: 'drill',   dataFile: 'ege_lexis',   topicKey: 'Лексика/словообр.', tile: 'wordform', icon: '🔤' },
      { id: 'reading', type: 'reading', dataFile: 'ege_reading', tile: 'reading', iconKey: 'reading', icon: '📖' },
      { id: 'email',   type: 'writing', tile: 'writing', icon: '✉️' },
      { id: 'essay',   type: 'writing', tile: 'grammar', iconKey: 'essay', icon: '📝' },
    ],
    pack: ['grammar', 'lexis', 'reading', 'email', 'essay'],
    soonTile: true,
    // Письмо ЕГЭ — ДВА задания: e-mail (зад.37, К1–К3, макс 6) и эссе (зад.38, К1–К5, макс 14)
    writing: {
      kind: 'ege',
      tasks: [
        { id: 'email', dataFile: 'ege_email', sectionId: 'email', max: 6, words: [100, 140],
          criteria: [
            { code: 'К1', name: 'Solving the communicative task', max: 2 },
            { code: 'К2', name: 'Text organisation', max: 2 },
            { code: 'К3', name: 'Language', max: 2 },
          ] },
        { id: 'essay', dataFile: 'ege_essay', sectionId: 'essay', max: 14, words: [200, 250],
          criteria: [
            { code: 'К1', name: 'Solving the communicative task', max: 3 },
            { code: 'К2', name: 'Text organisation', max: 3 },
            { code: 'К3', name: 'Vocabulary', max: 3 },
            { code: 'К4', name: 'Grammar', max: 3 },
            { code: 'К5', name: 'Spelling and punctuation', max: 2 },
          ] },
      ],
    },
  },
};

const which = (typeof window !== 'undefined' && window.EXAM) || 'oge';
export const EXAM = CONFIGS[which] || CONFIGS.oge;
export const t = STRINGS[EXAM.lang];
// раздел по id
export function sectionById(id) { return EXAM.sections.find((s) => s.id === id); }

// Язык-зависимое склонение: forms = [одно, мало(2-4), много]. Для en: 1 → одно, иначе → много.
export function plural(n, forms) {
  if (EXAM.lang === 'en') return n === 1 ? forms[0] : forms[2];
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
