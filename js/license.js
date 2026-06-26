// license.js — доступ к тренажёру по ключу (лицензия). Ключ в localStorage <store>_lic.
// Проверка через воркер ss-license; офлайн — грейс по кешу. Лицензия привязана к экзамену (EXAM.id).
import { EXAM } from './exam.js';

const WORKER = 'https://ss-license.o-sintsova.workers.dev';
const GRACE_MS = 3 * 86400000;     // офлайн-доверие к кешу: 3 дня (в пределах срока ключа)
const RECHECK_MS = 86400000;       // онлайн-перепроверка не чаще раза в сутки
const keyName = () => EXAM.store + '_lic';
const cacheName = () => EXAM.store + '_lic_v';

export function getKey() { try { return localStorage.getItem(keyName()) || ''; } catch (e) { return ''; } }
export function setKey(k) { try { localStorage.setItem(keyName(), (k || '').trim().toUpperCase()); } catch (e) {} }
export function clearKey() { try { localStorage.removeItem(keyName()); localStorage.removeItem(cacheName()); } catch (e) {} }
function readCache() { try { return JSON.parse(localStorage.getItem(cacheName()) || '{}'); } catch (e) { return {}; } }
function writeCache(c) { try { localStorage.setItem(cacheName(), JSON.stringify(c)); } catch (e) {} }

// Прямой запрос к воркеру (используется и paywall'ом при вводе ключа)
export async function checkKey(key) {
  const r = await fetch(WORKER + '/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: (key || '').trim().toUpperCase(), exam: EXAM.id }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Есть ли доступ сейчас. Онлайн — проверяет и кеширует; офлайн — доверяет свежему валидному кешу.
export async function hasAccess() {
  const key = getKey();
  if (!key) return false;
  const c = readCache();
  const now = Date.now();
  // недавняя валидная проверка и срок не вышел → не дёргаем сеть
  if (c.valid && c.expiresAt && now < c.expiresAt && c.checkedAt && now - c.checkedAt < RECHECK_MS) return true;
  try {
    const res = await checkKey(key);
    writeCache({ valid: !!res.valid, expiresAt: res.expiresAt || null, checkedAt: now });
    return !!res.valid;
  } catch (e) {
    // офлайн: верим кешу, если он валиден, не истёк и проверялся недавно
    if (c.valid && (!c.expiresAt || now < c.expiresAt) && c.checkedAt && now - c.checkedAt < GRACE_MS) return true;
    return false;
  }
}

// Сохранить статус из явной проверки ключа (после ввода в paywall)
export function rememberCheck(res) {
  writeCache({ valid: !!res.valid, expiresAt: res.expiresAt || null, checkedAt: Date.now() });
}
