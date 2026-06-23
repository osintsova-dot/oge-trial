// writeeval.js — ИИ-проверка письма (DeepSeek через воркер). Общая для раздела «Письмо» и ДЗ.
// opts = { lang:'ru'|'en', sectionId:'writing'|'email'|'essay', criteria:[{code,name,max}], max, words:[min,max], stim }

const WORKER = 'https://purple-cake-2966.o-sintsova.workers.dev'; // прокси DeepSeek

export async function evalWriting(text, opts) {
  const { lang, sectionId, criteria, max, words, stim } = opts;
  const [wMin, wMax] = words || [100, 140];
  const wcN = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const critSpec = criteria.map((c) => `${c.code} (max ${c.max}): ${c.name}`).join('; ');
  const critJson = criteria.map((c) => `{"code":"${c.code}","name":"${c.name}","score":<0-${c.max}>,"max":${c.max},"comment":"<...>"}`).join(',');

  let sys, user;
  if (lang === 'en') {
    const kind = sectionId === 'essay'
      ? 'task 38, a data-based opinion essay (200-250 words). The student must follow the plan: opening statement, report 2-3 facts, 1-2 comparisons with comments, outline a problem and a solution, and a conclusion with their opinion.'
      : 'task 37, a personal email (100-140 words). The student must answer the friend\'s questions AND ask 3 questions, with a correct opening, closing phrase and name.';
    sys = 'You are a strict but kind English exam examiner. You assess a student\'s writing strictly by the official criteria and reply ONLY with valid JSON, no markdown. All comments must be IN ENGLISH at B1 level — short and clear.';
    user =
`Task: ${kind}
Criteria: ${critSpec}
Word limit: ${wMin}-${wMax} words.

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
К1 — решение задачи (полные ответы, объём, вежливость, стиль). К2 — организация, абзацы, связки, обращение/подпись. К3 — лексика+грамматика. К4 — орфография и пунктуация. В ОГЭ встречные вопросы НЕ требуются. totalScore = сумма по критериям. ВАЖНО (правило ФИПИ): если К1=0 (коммуникативная задача не решена), то ВСЁ задание оценивается в 0 — остальные критерии тоже выставь 0 и totalScore=0.`;
  }

  const r = await fetch(WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 2200,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  if (!d.choices || !d.choices[0]) throw new Error('empty response');
  return JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
}
