// ══ §370 — כניסה עם גוגל ═══════════════════════════════════════════════════════════════
// גוגל היא **הוכחת זהות בלבד**. הקובץ הזה מאמת שהטוקן שהגיע מהדפדפן באמת הונפק ע"י
// גוגל ובאמת עבורנו — ומכאן והלאה המערכת ממשיכה בדיוק כמו היום: הוורקר מנפיק את אותו
// custom token שהוא מנפיק אחרי טלפון+קוד, ושום דבר במעלה הזרם לא יודע שגוגל הייתה
// מעורבת. ר' §368 להחלטת הארכיטקטורה המלאה.

const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

// ── למה tokeninfo ולא אימות-חתימה מקומי ──────────────────────────────────────────────────
// אפשר לאמת RS256 מקומית מול ה-JWKS של גוגל, וזה מהיר יותר. **נבחר לא לעשות את זה**,
// מאותה סיבה שבגללה `verifyAdminIdToken` (jwt.js) קורא ל-identitytoolkit ולא מאמת לבד:
// זהו נתיב כניסה, ובאג שקט באימות-חתימה שנכתב ביד אינו נתפס בשום בדיקה — הוא פשוט
// מקבל טוקנים שהיה צריך לדחות. קריאה אחת לגוגל אינה יכולה להיות "נכונה חלקית".
// המחיר: ~100ms לכניסה. בנפח שלנו זה לא נמדד.
export async function verifyGoogleIdToken(env, idToken) {
  if (!idToken || typeof idToken !== 'string') throw new Error('missing_google_token');

  const clientId = env.GOOGLE_CLIENT_ID;
  // ⚠️ בלי client id מוגדר אסור להמשיך. בדיקת ה-aud למטה היא ההגנה היחידה מפני טוקן
  // שהונפק עבור אתר אחר, וקריסה כאן עדיפה בהרבה על "עבר בלי לבדוק".
  if (!clientId) throw new Error('google_client_id_not_configured');

  const resp = await fetch(GOOGLE_TOKENINFO + encodeURIComponent(idToken));
  if (!resp.ok) throw new Error('invalid_google_token');
  const p = await resp.json();

  // ── 🔑 בדיקת aud — הבדיקה החשובה ביותר בקובץ ─────────────────────────────────────────
  // tokeninfo כבר אימת חתימה ותפוגה, אבל הוא מאמת **כל** טוקן של גוגל, גם כזה שהונפק
  // עבור אתר אחר לגמרי. בלי השורה הזאת כל אתר שמשתמש בגוגל היה יכול להנפיק טוקן
  // ולהיכנס אצלנו בשם המשתמש שלו. זו הפרצה הקלאסית של הזרימה הזאת.
  if (p.aud !== clientId) throw new Error('google_token_wrong_audience');

  // גוגל מחזירה 'true'/'false' כמחרוזות בנתיב הזה — השוואה ל-true בוליאני הייתה
  // נכשלת תמיד בשקט ומחזירה "מייל לא מאומת" לכולם.
  const emailVerified = p.email_verified === true || p.email_verified === 'true';
  if (!p.sub) throw new Error('invalid_google_token');

  return {
    sub: String(p.sub),
    email: p.email ? String(p.email).trim().toLowerCase() : '',
    emailVerified,
    name: p.name || '',
    givenName: p.given_name || '',
    familyName: p.family_name || '',
  };
}
