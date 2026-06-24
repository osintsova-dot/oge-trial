// checker.js — проверка ответа по ключу (оффлайн, без API)

// Сокращённые формы ↔ полные. ОГЭ принимает ОБА варианта (didn't = did not),
// поэтому приводим к единому виду перед сравнением.
const CONTRACTIONS = {
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "won't": 'will not', "wouldn't": 'would not', "shan't": 'shall not',
  "can't": 'can not', 'cannot': 'can not', "couldn't": 'could not',
  "shouldn't": 'should not', "mustn't": 'must not', "mightn't": 'might not',
  "needn't": 'need not', "oughtn't": 'ought not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will',
  "we'll": 'we will', "they'll": 'they will', "it'll": 'it will',
  "let's": 'let us',
};

// Развернуть сокращения (по словам)
function expandContractions(s) {
  return s.replace(/\b[a-z]+(?:'[a-z]+)?\b/g, (w) => CONTRACTIONS[w] || w);
}

// Нормализация: регистр, лишние пробелы, типографские апострофы, сокращения → полная форма
export function normalize(s) {
  let t = (s || '')
    .trim()
    .toLowerCase()
    .replace(/[‘’′`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ');
  // на ОГЭ/ЕГЭ краткий ответ пишут БЕЗ пробелов (will give → WILLGIVE), поэтому
  // сверяем без пробелов вовсе — принимаем и «will give», и «willgive», и контракции.
  return expandContractions(t).replace(/\s+/g, '');
}

// keyEntry = {answer, sec, ...}. Возвращает {correct:bool, expected:string}
export function checkAnswer(userAnswer, keyEntry) {
  const expected = keyEntry ? keyEntry.answer : '';
  const correct = !!keyEntry && normalize(userAnswer) === normalize(expected);
  return { correct, expected };
}
