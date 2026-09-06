// ══ §423 — כניסה עם Apple ═══════════════════════════════════════════════════════════════
// אותו תפקיד בדיוק כמו `google.js`: **אפל היא הוכחת זהות בלבד.** הקובץ מאמת שהטוקן שהגיע
// מהדפדפן או מהאפליקציה באמת הונפק ע"י אפל ובאמת עבורנו — ומכאן המערכת ממשיכה כרגיל,
// הוורקר מנפיק את אותו custom token שהוא מנפיק אחרי טלפון+קוד. ר' §370 להחלטה המקורית.
//
// ⚠️ **זו דרישת אישור של אפל ולא פיצ'ר**: אפליקציה שמציעה התחברות של צד שלישי (אצלנו —
// גוגל) חייבת להציע גם "התחברות עם Apple", בכל מקום שבו האחרת מוצעת.

import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

// ── למה כאן כן מאמתים חתימה מקומית, בניגוד ל-`google.js` ────────────────────────────────
// `google.js` מתעד החלטה מפורשת **לא** לאמת RS256 ביד, אלא לקרוא ל-tokeninfo — כי באג שקט
// באימות שנכתב ביד אינו נתפס בשום בדיקה: הוא פשוט **מקבל** טוקנים שהיה צריך לדחות.
// לאפל אין endpoint מקביל, ולכן אין ברירה — אבל גם אין צורך לכתוב קריפטו:
// `jose` כבר תלות של הוורקר (`jwt.js` משתמשת בה), והיא מטפלת בשליפת המפתחות, בבחירת
// המפתח לפי `kid`, ובאימות החתימה והתפוגה. כלומר הסיכון שההחלטה ההיא נועדה למנוע —
// קוד קריפטוגרפי כתוב-ביד — אינו קיים כאן.
//
// ה-JWKS נשמר במטמון בתוך ה-isolate ומתרענן לבד כשמופיע `kid` לא מוכר (אפל מחליפה
// מפתחות מדי פעם). קריאה יחידה, ולכן משתנה ברמת המודול ולא חדש בכל בקשה.
let jwks = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return jwks;
}

// ── ⚠️ שני קהלים לגיטימיים, וזו לא סרבול ────────────────────────────────────────────────
// ה-`aud` של טוקן מאפל אינו זהה בשני המסלולים:
//   • באתר (Sign in with Apple JS) הוא ה-**Services ID**  — לדוגמה il.co.yellowzone.web
//   • באפליקציה (התוסף הנייטיב)  הוא ה-**Bundle ID**      — il.co.yellowzone.app
// בדיקה מול ערך יחיד הייתה עוברת באחד המסלולים ו**נכשלת בשקט בשני** — כלומר בדיוק
// המסלול שלא נבדק ידנית הוא זה שיישבר. לכן רשימה, ולכן היא נדרשת במפורש.
function allowedAudiences(env) {
  const raw = String(env.APPLE_CLIENT_IDS || '').trim();
  if (!raw) throw new Error('apple_client_ids_not_configured');
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) throw new Error('apple_client_ids_not_configured');
  return list;
}

// אפל מחזירה חלק מהשדות הבוליאניים כמחרוזות, בדיוק כמו גוגל ב-tokeninfo. השוואה ל-true
// בוליאני בלבד הייתה מחזירה "לא מאומת" לכולם, בשקט. ר' אותו לקח ב-`google.js`.
function truthy(v) {
  return v === true || v === 'true';
}

/**
 * מאמת identity token של אפל ומחזיר את הזהות שבתוכו.
 * זורק על כל כשל — הקורא הופך זאת ל-`invalid_apple_token` ואינו מבחין בין הסיבות,
 * כדי לא לספר לתוקף איזה חלק בטוקן שלו נדחה.
 */
export async function verifyAppleIdToken(env, idToken) {
  if (!idToken || typeof idToken !== 'string') throw new Error('missing_apple_token');

  // ⚠️ נקרא **לפני** האימות ובמכוון: בלי קהל מוגדר אסור להמשיך. זו ההגנה היחידה מפני
  // טוקן שהונפק עבור אפליקציה אחרת לגמרי, וקריסה כאן עדיפה בהרבה על "עבר בלי לבדוק".
  // אותו נימוק בדיוק כמו `google_client_id_not_configured`.
  const audiences = allowedAudiences(env);

  // 🔑 `jwtVerify` בודק חתימה, `iss`, `aud` ותפוגה יחד. `aud` ו-`issuer` נמסרים לו
  // כפרמטרים ולא נבדקים אחריו ביד — בדיקה ידנית אחרי האימות היא בדיוק המקום שבו
  // "שכחתי להשוות" עובר בלי שאיש ישים לב.
  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });

  if (!payload.sub) throw new Error('invalid_apple_token');

  const email = payload.email ? String(payload.email).trim().toLowerCase() : '';

  // ── 🔴 "הסתר את המייל שלי" ──────────────────────────────────────────────────────────
  // אפל מציעה למשתמש כתובת-ממסר (`@privaterelay.appleid.com`) במקום המייל האמיתי.
  // כתובת כזאת **לעולם לא תהיה זהה** למייל שעל רשומת החבר — כלומר שער-הקישור של
  // `/google-attach` ("המייל על הרשומה זהה למייל המאומת") לא יכול לעבור איתה **אף פעם**.
  // בלי הדגל הזה, המסלול היה נכשל תמיד בהודעה 'email_mismatch' שאינה מסבירה כלום,
  // והמשתמש היה מחפש תקלה שאינה קיימת. ר' [[feedback_state_not_event_detection]].
  //
  // ⚠️ שני מקורות ולא אחד: `is_private_email` הוא ההצהרה הרשמית, אבל הוא אינו מופיע
  // בכל גרסאות הטוקן. סיומת הדומיין היא הגיבוי, והיא נכונה תמיד.
  const isPrivateRelay = truthy(payload.is_private_email) ||
                         /@privaterelay\.appleid\.com$/i.test(email);

  return {
    sub: String(payload.sub),
    email,
    // ⚠️ כתובת-ממסר היא כתובת מתפקדת שאפל מעבירה ממנה דואר — אבל היא **אינה** ראיה
    // לשליטה בתיבה שעל הרשומה, וזה מה שהשער בודק. לכן היא לעולם לא נחשבת "מאומתת"
    // לצורך קישור. ר' [[feedback_never_auto_decide_membership]].
    emailVerified: truthy(payload.email_verified) && !isPrivateRelay,
    isPrivateRelay,
  };
}

// ── ⚠️ מה שאין כאן, ולמה ────────────────────────────────────────────────────────────────
// **שם המשתמש אינו מגיע בטוקן.** אפל מוסרת שם פרטי/משפחה רק בגוף התשובה של ההרשאה
// ו**רק בפעם הראשונה בחיים** שהמשתמש מאשר את האפליקציה. מהפעם השנייה מגיע `sub` בלבד.
// מודול הלקוח הוא שמקבל אותו וממלא איתו את הטופס; כאן אין לו מקום, ופונקציה שהייתה
// מחזירה `name: ''` הייתה נראית כאילו אפל פשוט לא שלחה שם — ולא כאילו זה הצפוי.
