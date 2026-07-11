// מגן על /mint-member-token מפני ניחוש קוד 6 ספרות: מגבלה per-טלפון (חד יעדי) + per-IP (רחבה יותר)
const PHONE_LIMIT = 8;
const PHONE_WINDOW_SEC = 15 * 60;
const IP_LIMIT = 30;
const IP_WINDOW_SEC = 15 * 60;

async function bump(kv, key, windowSec) {
  const current = parseInt((await kv.get(key)) || '0', 10);
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: windowSec });
  return next;
}

export async function isRateLimited(kv, phoneDigits, ip) {
  const phoneKey = `attempts:phone:${phoneDigits}`;
  const ipKey = `attempts:ip:${ip || 'unknown'}`;
  const [phoneCount, ipCount] = await Promise.all([kv.get(phoneKey), kv.get(ipKey)]);
  return (parseInt(phoneCount || '0', 10) >= PHONE_LIMIT) || (parseInt(ipCount || '0', 10) >= IP_LIMIT);
}

export async function recordAttempt(kv, phoneDigits, ip) {
  await Promise.all([
    bump(kv, `attempts:phone:${phoneDigits}`, PHONE_WINDOW_SEC),
    bump(kv, `attempts:ip:${ip || 'unknown'}`, IP_WINDOW_SEC),
  ]);
}
