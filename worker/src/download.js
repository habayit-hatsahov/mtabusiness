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
// ── §317 — קאש ב-edge ────────────────────────────────────────────────────────────────────
// עד היום התגובה חזרה עם `Cache-Control: private, max-age=3600`, ושתי בעיות נבעו מזה:
//  1. **`private` מונע קאש ב-edge**, ותגובה שחוזרת מ-Worker ממילא אינה נשמרת אוטומטית —
//     נמדד בפועל: שתי בקשות רצופות, ואין אפילו כותרת `CF-Cache-Status`. כלומר כל צפייה
//     בתמונה עלתה קריאת-KV לטוקן + הבאה מלאה מ-GCS, גם אם אותה תמונה נצפתה לפני שנייה.
//  2. שעה אחת בדפדפן זה קצר מדי למסך שנפתח עשרות פעמים ביום.
// התיקון: Cache API מפורש (`caches.default`) + `public`. מפתח-הקאש הוא כתובת-הבקשה המלאה,
// שכוללת את נתיב-האובייקט ב-Storage — בלתי-ניתן לניחוש, בדיוק כמו מודל-האבטחה של כתובות
// ההורדה של Firebase עצמן. **יום אחד ולא שנה** בכוונה: תמונה של עסק שנדחה/נמחק לא תישאר
// בקאש לזמן בלתי-מוגבל.
const VIEW_IMAGE_TTL = 86400;
const VIEW_MAX_WIDTH = 1600;

// ── §317 — `?w=` : הקטנה בזמן ריצה ──────────────────────────────────────────────────────
// מרכז הניהול מציג את תמונות הגלריה בריבוע של 72px, אבל טען עד היום את **המקור המלא**:
// 168 תמונות, 49MB בסך הכל, ממוצע 299KB, ולעסק אחד 11.8MB בגיליון בודד. לתמונה המייצגת
// יש coverPhotoThumb — לגלריה מעולם לא נוצרה ממוזערת.
// במקום הגירה של 168 קבצים: אותו env.IMAGES שכבר משמש את runBackfillThumbnails (src/
// backfill.js), רק בזמן-ריצה. התוצאה נשמרת ב-edge לפי הכתובת המלאה — כולל ה-`w` — ולכן
// כל מידה מחושבת פעם אחת בלבד לכל העולם.
// ⚠️ נפילה-לאחור מכוונת: פורמט ש-Images לא יודע לפענח (HEIC של אייפון, למשל) מחזיר את
// המקור כמו שהוא, בדיוק כמו קודם. הקטנה היא אופטימיזציה — היא לא רשאית להפוך תמונה
// שנטענה היום לתמונה שבורה.
async function resizeOrOriginal(env, upstream, width) {
  const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
  if (!width || !env.IMAGES) return { body: upstream.body, contentType };
  // clone() **לפני** הקריאה: גוף התגובה הוא stream חד-פעמי, ובלי העותק הזה נתיב-הנפילה-לאחור
  // מקבל stream שכבר נקרא ונופל על "This ReadableStream is disturbed" — כלומר דווקא התמונות
  // שה-resize לא הצליח עליהן היו נשברות לגמרי במקום לחזור למקור.
  const fallback = upstream.clone();
  try {
    // format/quality שייכים ל-output(), לא ל-transform(), ו-format הוא MIME מלא.
    const out = await env.IMAGES.input(upstream.body)
      .transform({ width, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 78 });
    return { body: out.response().body, contentType: 'image/webp' };
  } catch (e) {
    console.warn('view-image resize failed, serving original:', String(e));
    return { body: fallback.body, contentType };
  }
}

export async function handleViewImage(request, env, ctx) {
  const url = new URL(request.url);
  const imgUrl = url.searchParams.get('url') || '';
  const width = Math.min(Math.max(parseInt(url.searchParams.get('w') || '0', 10) || 0, 0), VIEW_MAX_WIDTH);

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetchStorageObject(env, imgUrl);
  } catch (e) {
    return new Response('View failed: ' + String(e), { status: 502 });
  }
  if (!upstream) return new Response('Invalid or disallowed url', { status: 400 });
  if (!upstream.ok) return new Response('View failed: upstream status ' + upstream.status, { status: 502 });

  const { body, contentType } = await resizeOrOriginal(env, upstream, width);
  const resp = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${VIEW_IMAGE_TTL}`,
    },
  });
  // clone() לפני ההחזרה — הגוף הוא stream שניתן לקריאה פעם אחת בלבד. waitUntil כדי
  // שהכתיבה לקאש לא תעכב את התגובה למשתמש.
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(request, resp.clone()));
  return resp;
}
