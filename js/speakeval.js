// speakeval.js — оценка устного ответа по критериям ОГЭ (общий модуль для раздела
// «Говорение» и «Пробного экзамена»). На вход — распознанный текст (см. stt.js),
// на выход — {totalScore, max, criteria:[{code,name,score,max,comment}], verdict}.
// Оценивает DeepSeek-воркер (тот же, что проверяет письмо).

const EVAL_WORKER = 'https://purple-cake-2966.o-sintsova.workers.dev';

// критерии по типу задания ОГЭ-говорения
export function speakingCriteria(kind, item) {
  if (kind === 'survey') {
    return (item.questions || []).map((q, i) => ({ code: 'В' + (i + 1), name: 'Ответ на вопрос ' + (i + 1), max: 1 }));
  }
  if (kind === 'monologue') {
    return [
      { code: 'К1', name: 'Решение задачи (раскрыты все пункты плана)', max: 3 },
      { code: 'К2', name: 'Организация (вступление, связки, вывод)', max: 2 },
      { code: 'К3', name: 'Языковое оформление', max: 2 },
    ];
  }
  return [{ code: 'Чт', name: 'Полнота прочтения (произношение оценивает преподаватель)', max: 2 }];
}

export function speakingMax(kind, item) {
  return speakingCriteria(kind, item).reduce((s, c) => s + c.max, 0);
}

export async function evalSpeaking(kind, item, transcript) {
  const crit = speakingCriteria(kind, item);
  let task;
  if (kind === 'survey') {
    task = `ОГЭ говорение, задание 2 (телефонный опрос). Вопросы (ученик отвечает на каждый полным предложением, 1 балл за уместный полный ответ):\n${(item.questions || []).map((q, i) => (i + 1) + '. ' + q).join('\n')}`;
  } else if (kind === 'monologue') {
    task = `ОГЭ говорение, задание 3 (монолог) на тему "${item.topic}". План:\n${(item.plan || []).map((p, i) => (i + 1) + '. ' + p).join('\n')}`;
  } else {
    task = `ОГЭ говорение, задание 1 — чтение текста ВСЛУХ. Исходный текст:\n"""${item.text}"""\n\n⚠️ ОЧЕНЬ ВАЖНО: ниже — результат АВТОМАТИЧЕСКОГО распознавания речи (ASR). Оно регулярно искажает слова: превращает числительные в цифры (first→«1st»), коверкает имена собственные (Moscow Zoo→«moskozu»), теряет артикли, склеивает/разбивает слова, путает начало фразы. Это ОШИБКИ РАСПОЗНАВАНИЯ, а НЕ ученика — за них балл НЕ снижай. Оценивай ТОЛЬКО полноту: прочитан ли практически весь текст по порядку. Ставь 2, если текст прочитан целиком (мелкие расхождения = шум ASR); 1, если явно пропущены большие куски; 0, если прочитана лишь малая часть. Произношение, беглость и интонацию по тексту оценить НЕВОЗМОЖНО — обязательно напиши это в вердикте и не занижай за них.`;
  }
  const critJson = crit.map((c) => `{"code":"${c.code}","name":"${c.name}","score":<0-${c.max}>,"max":${c.max},"comment":"<кратко по-русски>"}`).join(',');
  const mx = crit.reduce((s, c) => s + c.max, 0);
  const sys = 'Ты опытный экзаменатор ОГЭ по английскому (устная часть). Оцениваешь по официальным критериям ФИПИ. Возвращаешь ТОЛЬКО валидный JSON, без markdown. Комментарии — по-русски, доброжелательно.';
  const user = `${task}\n\nРаспознанная речь ученика (через автоматическое распознавание, возможны мелкие ошибки распознавания — будь снисходителен к ним). ВАЖНО: если самые первые слова не вяжутся с темой/заданием — это почти наверняка артефакт распознавания (фантомная фраза на тишине в начале), НЕ считай их частью ответа и не снижай за них балл:\n"""${transcript}"""\n\nВерни JSON строго так:\n{"totalScore":<0-${mx}>,"criteria":[${critJson}],"verdict":"<2-3 предложения: что хорошо и что улучшить>"}\ntotalScore = сумма по критериям.`;
  const r = await fetch(EVAL_WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1200, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'err');
  if (!d.choices || !d.choices[0]) throw new Error('пустой ответ');
  const res = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
  res.max = mx;
  return res;
}

// EGE speaking — официальные максимумы ФИПИ-2026: зад.1=1, зад.2=4, зад.3=5, зад.4=10 (4+3+3).
function egeCriteria(kind, item) {
  if (kind === 'ask') {
    const n = (item && item.sampleQuestions && item.sampleQuestions.length) || 4;
    return Array.from({ length: n }, (_, i) => ({ code: 'Q' + (i + 1), name: 'Question ' + (i + 1), max: 1 }));
  }
  if (kind === 'interview') return [1, 2, 3, 4, 5].map((i) => ({ code: 'A' + i, name: 'Answer ' + i, max: 1 }));
  if (kind === 'compare') return [{ code: 'K1', name: 'Task completion / content (all plan points)', max: 4 }, { code: 'K2', name: 'Organisation', max: 3 }, { code: 'K3', name: 'Language', max: 3 }];
  return [{ code: 'R', name: 'Reading (pronunciation: a teacher checks it best)', max: 1 }];
}

export async function evalEgeSpeaking(kind, item, transcript) {
  const crit = egeCriteria(kind, item);
  const mx = crit.reduce((s, c) => s + c.max, 0);
  const instr = item.instruction || '';
  let task;
  if (kind === 'ask') task = `EGE Speaking task 2: the student must ask direct questions about an advertisement on the given points. Task & points:\n"""${instr}"""\nScore 1 per grammatically correct, relevant DIRECT question matching a required point.`;
  else if (kind === 'interview') task = `EGE Speaking task 3: the student answers 5 interview questions (heard from audio) with full answers (2-3 sentences each). Score 1 per full, relevant answer. Task:\n"""${instr}"""`;
  else if (kind === 'compare') task = `EGE Speaking task 4: the student compares two photos as a monologue following the plan in the task. Judge content (plan points covered), organisation (opening, linkers, conclusion) and language. Task:\n"""${instr}"""`;
  else task = `EGE Speaking task 1: reading a text aloud. The text is shown as an image, so the reference text is NOT available. Judge ONLY rough completeness/fluency from the recognised words; word-level mismatches are ASR errors, not the student's. Pronunciation/intonation CANNOT be judged here — say so.`;
  const critJson = crit.map((c) => `{"code":"${c.code}","name":"${c.name}","score":<0-${c.max}>,"max":${c.max},"comment":"<short, English>"}`).join(',');
  const sys = 'You are an experienced EGE English examiner (speaking). Reply ONLY with valid JSON, no markdown. Comments in clear B1 English. Be fair: this is auto speech recognition, ignore minor ASR errors; if the very first words are off-topic, treat them as an ASR artifact, not part of the answer.';
  const user = `${task}\n\nRecognised speech of the student:\n"""${transcript}"""\n\nReturn JSON exactly:\n{"totalScore":<0-${mx}>,"criteria":[${critJson}],"verdict":"<2-3 sentences: strengths and what to improve>"}\ntotalScore = sum of criteria.`;
  const r = await fetch(EVAL_WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1300, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'err');
  if (!d.choices || !d.choices[0]) throw new Error('empty');
  const res = JSON.parse(d.choices[0].message.content.replace(/```json|```/g, '').trim());
  res.max = mx;
  return res;
}
