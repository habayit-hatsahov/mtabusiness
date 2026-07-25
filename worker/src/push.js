import { sendPushNotification } from '@mmmike/web-push/send';

// שולח Web Push בודד ל-subscription אחד. מחזיר { ok, status } — status 410 אומר שהמנוי פג/בוטל
// בצד הדפדפן, קורא לפונקציה צריך לנקות את pushSubscriptions[key] אז.
//
// ⚠️ ידוע (2026-07-26): עברית מוצגת כ-"?" בהתראות בפועל ב-iOS 26.5.2 — נבדק ונשלל שזו בעיה
// כאן: 2 ספריות הצפנה שונות, רמזי dir/lang, טקסט גולמי מול JSON, ופורמט Declarative Web Push
// (web_push:8030) — כולם נכשלים באותה צורה בדיוק, בעוד טקסט אנגלי תמיד תקין. התשתית עצמה
// (מסירה, זמן, מבנה) תקינה לחלוטין. ר' docs/PROJECT_CONTEXT.md לפירוט המלא של הבדיקות.
export async function sendWebPush(env, subscription, { title, body, url }) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  try {
    const ok = await sendPushNotification(subscription, { title, body, url }, vapid, {
      ttl: 60 * 60 * 24, // 24 שעות — אם המכשיר לא מקוון, לא נשמר יותר מזה
    });
    return { ok, status: ok ? 201 : 410 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}
