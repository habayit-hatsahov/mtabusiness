import { buildPushPayload } from '@block65/webcrypto-web-push';

// שולח Web Push בודד ל-subscription אחד. מחזיר { ok, status } — 410/404 מה-endpoint
// אומר שהמנוי פג/בוטל בצד הדפדפן, קורא לפונקציה צריך לנקות את pushSubscription אז.
export async function sendWebPush(env, subscription, { title, body, url }) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const message = {
    data: JSON.stringify({ title, body, url }),
    options: { ttl: 60 * 60 * 24 }, // 24 שעות — אם המכשיר לא מקוון, לא נשמר יותר מזה
  };
  const payload = await buildPushPayload(message, subscription, vapid);
  const res = await fetch(subscription.endpoint, payload);
  return { ok: res.ok, status: res.status };
}
