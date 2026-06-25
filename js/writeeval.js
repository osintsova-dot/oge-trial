// writeeval.js — ИИ-проверка письма (DeepSeek через воркер). Общая для раздела «Письмо» и ДЗ.
// opts = { lang:'ru'|'en', sectionId:'writing'|'email'|'essay', criteria:[{code,name,max}], max, words:[min,max], stim }

import { fetchRetry, parseModelJSON } from './net.js';

const WORKER = 'https://oge-eval.o-sintsova.workers.dev'; // прокси DeepSeek

export async function evalWriting(text, opts) {
  const { lang, sectionId, criteria, max, words, stim, essayKind } = opts;
  const [wMin, wMax] = words || [100, 140];
  const wcN = (text || '').trim().split(/\s+/).filter(Boolean).length;
  // допуск объёма по ФИПИ ±10%: в этих границах балл за объём НЕ снижается
  const wLo = Math.round(wMin * 0.9), wHi = Math.round(wMax * 1.1);
  const critSpec = criteria.map((c) => `${c.code} (max ${c.max}): ${c.name}`).join('; ');
  const critJson = criteria.map((c) => `{"code":"${c.code}","name":"${c.name}","score":<0-${c.max}>,"max":${c.max},"comment":"<...>"}`).join(',');

  let sys, user;
  if (lang === 'en') {
    const kind = sectionId !== 'essay'
      ? 'task 37, a personal email (100-140 words). The student must answer the friend\'s questions AND ask 3 questions, with a correct opening, closing phrase and name.'
      : (essayKind === 'opinion'
        ? 'an opinion essay (200-250 words, OLD format). Plan: 1) introduction stating the problem; 2) the student\'s personal opinion with 2-3 reasons; 3) an opposing opinion with 1-2 reasons; 4) explanation why the student disagrees with the opposing opinion; 5) a conclusion restating the position. There is NO data table here — do NOT require reporting figures.'
        : 'task 38, a data-based essay (200-250 words) on the survey data (a table or a pie chart). Plan: 1) opening statement on the subject; 2) select and report 2-3 facts from the data; 3) make 1-2 comparisons with comments; 4) outline a problem and suggest a solution; 5) conclude with the student\'s opinion.');
    sys = 'You are a strict but kind English exam examiner. You assess a student\'s writing strictly by the official criteria and reply ONLY with valid JSON, no markdown. All comments must be IN ENGLISH at B1 level — short and clear.';
    user =
`Task: ${kind}
Criteria: ${critSpec}
Word limit: ${wMin}-${wMax} words. Tolerance ±10%: ${wLo}-${wHi} words is fine — do NOT lower the score for length if the count is within ${wLo}-${wHi}. Under ${wLo} → the whole task scores 0. Over ${wHi} → only the first ${wMax} words are assessed.

Prompt the student answered:
"""${stim}"""

Student's writing (${wcN} words):
"""${text}"""

Return JSON exactly like this:
{"totalScore":<sum 0-${max}>,"criteria":[${critJson}],"verdict":"<1-2 sentences in English, encouraging>","errors":[{"quote":"<exact phrase from the text>","what":"<what is wrong, in English>","fix":"<correct version>"}],"corrected":"<the full corrected text>"}
Score every criterion within its max. totalScore = sum of criteria scores. Give 2-5 concrete errors if there are any. IMPORTANT (official rule): if К1 (solving the communicative task) is 0, the whole task scores 0 — set every other criterion to 0 and totalScore = 0.`;
  } else {
    sys = 'Ты строгий экзаменатор ОГЭ по английскому. Оцениваешь личное письмо (задание 35) строго по официальным критериям ФИПИ. Возвращаешь ТОЛЬКО валидный JSON, без markdown. Комментарии — по-русски.';
    user =
`Критерии: ${critSpec}. Объём ${wMin}–${wMax} слов.
Контекст письма друга: ${stim}

Письмо ученика (${wcN} слов):
"""${text}"""

Верни JSON строго так:
{"totalScore":<сумма 0-${max}>,"criteria":[${critJson}],"verdict":"<1-2 предложения по-русски>","errors":[{"quote":"<точная фраза>","what":"<что не так>","fix":"<как правильно>"}],"corrected":"<полный исправленный текст>"}
ОЦЕНИВАЙ СТРОГО ПО ШКАЛЕ ФИПИ:
К1 — РЕШЕНИЕ КОММУНИКАТИВНОЙ ЗАДАЧИ (макс 3): 3 — даны полные ответы на ВСЕ вопросы друга и соблюдены нормы вежливости (благодарность за письмо, ссылка на прошлые/будущие контакты); 2 — мелкие недочёты (один аспект раскрыт неполно ИЛИ 1–2 нарушения вежливости); 1 — не дан ответ на часть вопросов; 0 — задача не решена. ⚠️ ПРО ОБЪЁМ: норма ${wMin}–${wMax} слов, но диапазон ${wLo}–${wHi} слов считается НОРМОЙ — НЕ снижай К1 за объём, если слов ${wLo}–${wHi}. Меньше ${wLo} → всё задание 0. Больше ${wHi} → проверяются только первые ${wMax} слов (тоже без штрафа за объём как таковой).
К2 — ОРГАНИЗАЦИЯ (макс 2): 2 — ТОЛЬКО при чётком делении на смысловые абзацы И уместных средствах связи И правильном оформлении (обращение/завершающая фраза/подпись на отдельных строках); 1 — есть недочёты (нет явного деления на абзацы ИЛИ слабые/формальные связки вроде простого 'Firstly/Then'); 0 — текст сплошной и плохо связан. ⚠️ Если деление на абзацы неочевидно — ставь 1, НЕ 2.
К3 — ЛЕКСИКА+ГРАММАТИКА (макс 3): 3 — 1–2 негрубые ошибки; 2 — 2–4 ошибки, НЕ затрудняющие понимание; 1 — 4+ ошибки ИЛИ есть ошибки, мешающие понять; 0 — МНОГО ошибок (≈5+) в коротком письме, особенно в базовых вещах (порядок слов, согласование, выбор слова, артикли, время глагола) ИЛИ повторяющиеся — ДАЖЕ если общий смысл угадывается. ⚠️ НЕ завышай: при 5+ грам/лекс-ошибках ставь 0–1, НЕ 2; если среди них есть искажающие смысл — ставь 0.
К4 — ОРФОГРАФИЯ И ПУНКТУАЦИЯ (макс 2): 2 — почти нет ошибок (1–2); 1 — несколько (3–4); 0 — много (5+).
В ОГЭ встречные вопросы НЕ требуются. totalScore = сумма по критериям. ВАЖНО (правило ФИПИ): если К1=0 (коммуникативная задача не решена), то ВСЁ задание = 0 — остальные критерии тоже 0 и totalScore=0.`;
  }

  // эссе длиннее (200-250 слов + corrected) → больше токенов, иначе JSON обрывается
  const maxTok = sectionId === 'essay' ? 3500 : 2400;
  const r = await fetchRetry(WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: maxTok,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  }, { timeoutMs: 60000, tries: 2 });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  if (!d.choices || !d.choices[0]) throw new Error('empty response');
  return parseModelJSON(d.choices[0].message.content);
}
