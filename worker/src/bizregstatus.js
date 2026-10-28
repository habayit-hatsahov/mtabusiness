// ── §664 — "העסק שלך ממתין · התמונות לא עלו" באפליקציה ────────────────────────────────────────
// רמי (28.10): "שיחכה לו גם באפליקציה במקום ההתחבר והכניסה שהוא ממתין לאישור שהתמונות לא עלו
// וצריך לעלות תמונות". Aviv Production: `bm:rest:TypeError` – כל התמונות וראיית-האימות אבדו,
// והבעלים ראה בפתיחה הבאה רק את מסך הכניסה.
// business.html שומר במכשיר שנרשם `yz_biz_reg` = { bizId, token } (token = טוקן העסק, אותו
// טוקן שבזכותו /upload-biz-media מקבל את התמונות). welcome.html שואל כאן מה מצב העסק ומה חסר,
// ומעלה את החסר ישירות ל-/upload-biz-media עם אותו טוקן. הכתיבה היחידה – claimBizToken (ר' למטה).
// 🔑 הזיהוי – הטוקן בלבד, מול bizTokens (כמו /upload-biz-media). bizId גולמי לא מספיק.
// ⚠️ מחזיר רק מה שהמסך צריך: שם, שם פרטי של הבעלים, סטטוס ודגלי "חסר". בלי טלפון/מייל/כתובות.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreGetDoc, bizIdFromToken, claimBizToken } from './firestore.js';

const BIZ_ID_RE = /^[A-Za-z0-9]{20}$/;
// אותם מסלולים כמו PHOTO_ROUTES במרכז הניהול: רק בהם ראיית-האימות היא תמונה
const PHOTO_ROUTES = new Set(['passScreenshot', 'purchaseEmail', 'standsPhoto']);

// firestoreGetDoc מחזיר ערכים רגילים (fieldsToObject), לא את מבנה ה-REST
const str = (f, k) => (typeof f[k] === 'string' ? f[k] : '');

export async function handleBizRegStatus({ bizId, token } = {}, env) {
  if (typeof bizId !== 'string' || !BIZ_ID_RE.test(bizId)) return { error: 'invalid' };
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return { error: 'invalid' };

  const accessToken = await getGoogleAccessToken(env);
  // הטוקן חייב להצביע בדיוק על העסק הזה. נפילה-לאחור כמו ב-/upload-biz-media (§419): כתיבת
  // bizTokens מהדפדפן נכשלה – claimBizToken מאמת שהמסמך לא קיים ושהעסק pending, ורק אז רושם.
  let owned = await bizIdFromToken(env, accessToken, token);
  if (!owned) owned = await claimBizToken(env, accessToken, bizId, token);
  if (owned !== bizId) return { error: 'invalid' };

  const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!b) return { status: 'gone' };
  const f = b.fields || {};
  const status = str(f, 'status') || 'pending';
  const out = { status, name: str(f, 'name').slice(0, 80), ownerFirst: str(f, 'ownerFirst').slice(0, 40) };
  if (status !== 'pending') return out;

  const photos = Array.isArray(f.photos) ? f.photos : [];
  const proofNeeded = PHOTO_ROUTES.has(str(f, 'verifyRoute'));
  // §382 – הראיה יושבת ב-bizProofs/{bizId}; photoProofUrl על העסק – רק בעסקים ישנים
  let hasProof = !!str(f, 'photoProofUrl');
  if (proofNeeded && !hasProof) {
    const p = await firestoreGetDoc(env, accessToken, `bizProofs/${bizId}`);
    hasProof = !!(p && p.fields && str(p.fields, 'photoProofUrl'));
  }
  out.missing = {
    cover: !str(f, 'coverPhoto'),          // חובה
    proof: proofNeeded && !hasProof,       // חובה – רק במסלול אימות בתמונה
    logo: !str(f, 'logo'),                 // רשות
    gallery: !photos.length,               // רשות
  };
  return out;
}
