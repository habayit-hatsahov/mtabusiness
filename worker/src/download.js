import { getGoogleAccessToken } from './jwt.js';

// מביא אובייקט מה-bucket שלנו בצד-שרת. ⚠️ ניסיון ראשון (2026-08-12) — Bearer token על
// firebasestorage.googleapis.com (אותה כתובת ציבורית שהדפדפן פונה אליה) — נכשל עם 403 בכל
// מקרה: storage.rules מזהות את הבקשה הזו כ-request.auth==null (כמו כל בקשה לא-Firebase-Auth,
// גם עם Bearer token של service account — request.auth שם מתייחס אך ורק ל-Firebase Auth ID
// token, לא ל-Google IAM credentials), אז אין הבדל בינה לבין fetch אנונימי רגיל מהדפדפן.
// הפתרון בפועל: לפנות ל-storage.googleapis.com — ה-Google Cloud Storage JSON API הגולמי, שלא
// עובר דרך שכבת-האכיפה של Firebase Storage Rules בכלל. שם ה-scope ב-getGoogleAccessToken
// (devstorage.read_write) מספיק כדי לגשת ב-IAM ישירות לבאקט — אותו מנגנון-בדיוק שבו Admin SDK
// אמיתי עוקף Security Rules בצד-שרת. מוגבל במפורש רק לאובייקטים מתוך ה-bucket שלנו (לא open
// proxy לכתובת שרירותית כלשהי) — מקבל את כתובת ה-firebasestorage.googleapis.com הרגילה
// (בדיוק כמו שהיא שמורה ב-Firestore) ומתרגם אותה לנתיב המקביל ב-storage.googleapis.com.
function extractObjectPath(imgUrl, bucket) {
  const allowedPrefix = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`;
  if (!imgUrl || !imgUrl.startsWith(allowedPrefix)) return null;
  const rest = imgUrl.slice(allowedPrefix.length);
  const encodedPath = rest.split('?')[0];
  return encodedPath || null;
}

async function fetchStorageObject(env, imgUrl) {
  const encodedPath = extractObjectPath(imgUrl, env.FIREBASE_STORAGE_BUCKET);
  if (!encodedPath) return null;
  const accessToken = await getGoogleAccessToken(env);
  const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${env.FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media`;
  return fetch(gcsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
}

// פרוקסי הורדת תמונה — עוקף את חסימת ה-CORS של הדפדפן על fetch() ישיר לכתובת Firebase Storage
// (ר' docs/PROJECT_CONTEXT.md סעיף 12 — כפתור ⬇ ב-admin-businesses.html). מדובר בניווט <a href>
// רגיל (לא fetch/XHR), אז CORS לא רלוונטי בכלל לתגובה עצמה — ה-Worker רק מביא את הקובץ
// בצד-שרת (שם אין הגבלת CORS) ומחזיר אותו עם Content-Disposition כדי שהדפדפן ישמור אותו.
//
// ⚠️ 2026-08-12: נוסף Bearer token לבקשה ל-Storage (לפני זה fetch אנונימי) — אירוע אמיתי גילה
// שתמונה של עסק pending/rejected מחזירה 403 מ-storage.rules בלי אימות (בכוונה, ר' storage.rules),
// אז גם ההורדה נכשלה בשקט לכל עסק שעדיין לא אושר.
export async function handleDownloadImage(request, env) {
  const url = new URL(request.url);
  const imgUrl = url.searchParams.get('url') || '';
  const filename = (url.searchParams.get('filename') || 'image.jpg').replace(/[\r\n"]/g, '');

  let upstream;
  try {
    upstream = await fetchStorageObject(env, imgUrl);
  } catch (e) {
    return new Response('Download failed: ' + String(e), { status: 502 });
  }
  if (!upstream) return new Response('Invalid or disallowed url', { status: 400 });
  if (!upstream.ok) return new Response('Download failed: upstream status ' + upstream.status, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ── תצוגה מוטמעת (<img src>) — אותו מנגנון בדיוק כמו handleDownloadImage, בלי
// Content-Disposition:attachment כדי שהתמונה תוצג inline ולא תוריד קובץ. נחוץ ל-
// admin-dashboard.html (פאנל-אישור, תמונות של עסק pending) ול-business-dashboard.html (בעל-עסק
// צופה בתמונות-שהעלה לפני שהעסק אושר) — תג <img> רגיל שמצביע ישירות ל-Firebase Storage לא יודע
// לצרף אימות לבקשה, אז גם מנהל/בעל-עסק מחוברים רואים תמונה שבורה עד שהעסק מאושר (ואז storage.rules
// כבר מתירים read פומבי, ר' storage.rules:46-48). ה-<img> צריך להצביע ל-Worker כאן, לא ל-Storage
// ישירות — הוא זה שמביא את הקובץ בצד-שרת עם הרשאת ה-service-account.
export async function handleViewImage(request, env) {
  const url = new URL(request.url);
  const imgUrl = url.searchParams.get('url') || '';

  let upstream;
  try {
    upstream = await fetchStorageObject(env, imgUrl);
  } catch (e) {
    return new Response('View failed: ' + String(e), { status: 502 });
  }
  if (!upstream) return new Response('Invalid or disallowed url', { status: 400 });
  if (!upstream.ok) return new Response('View failed: upstream status ' + upstream.status, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
