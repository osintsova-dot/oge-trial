// data.js — ленивая загрузка JSON-данных раздела (грузим по требованию, кешируем)

const cache = new Map();

export async function loadJSON(name) {
  if (cache.has(name)) return cache.get(name);
  const res = await fetch(`./data/${name}.json`);
  if (!res.ok) throw new Error(`Не удалось загрузить ${name}.json (HTTP ${res.status})`);
  const data = await res.json();
  cache.set(name, data);
  return data;
}
