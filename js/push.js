// push.js — веб-пуши «не теряй серию». Подписка через воркер ss-push, ключ VAPID.
// На iOS пуши работают ТОЛЬКО в установленном на «Домой» PWA (iOS 16.4+).
import { EXAM } from './exam.js';

const WORKER = 'https://ss-push.o-sintsova.workers.dev';
const VAPID_PUBLIC = 'BICAuQj9vbAHG3pq4HYX-nALnC-TJOBFkFIXEbEVTNJqiyStVVOd9Lt9vow3IsWGVYBrrzoNgeHBbQ6jbTgQT08';
const hourKey = () => EXAM.store + '_push_hour';

function urlB64ToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b); const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
  return u;
}
function tzOffset() { return -new Date().getTimezoneOffset(); } // минут восточнее UTC

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
// iOS вне установленного PWA — пуши недоступны
export function iosNeedsInstall() {
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return iOS && !standalone;
}
async function reg() { return navigator.serviceWorker.ready; }

export async function isSubscribed() {
  if (!pushSupported()) return false;
  try { const s = await (await reg()).pushManager.getSubscription(); return !!s; } catch (e) { return false; }
}

export function getHour() { try { return parseInt(localStorage.getItem(hourKey()) || '19', 10); } catch (e) { return 19; } }

export async function enablePush(name, hour) {
  if (!pushSupported()) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
  const h = hour || getHour() || 19;
  try { localStorage.setItem(hourKey(), String(h)); } catch (e) {}
  const res = await fetch(WORKER + '/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), exam: EXAM.id, name: name || '', hour: h, tzOffset: tzOffset() }),
  });
  return res.ok;
}

export async function disablePush() {
  try {
    const sub = await (await reg()).pushManager.getSubscription();
    if (sub) {
      await fetch(WORKER + '/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch (e) {}
}

// Тихий heartbeat: вызывать при активности (занимался сегодня + текущая серия).
// Шлёт только если подписка есть; ошибки глотаем.
export async function heartbeat(streak, practicedToday) {
  if (!pushSupported()) return;
  try {
    const sub = await (await reg()).pushManager.getSubscription();
    if (!sub) return;
    await fetch(WORKER + '/heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, streak: streak || 0, practicedToday: !!practicedToday, tzOffset: tzOffset() }),
    }).catch(() => {});
  } catch (e) {}
}
