// ══ §423 — כניסה עם Apple ═══════════════════════════════════════════════════════════════
// אותו תפקיד בדיוק כמו `google.js`: **אפל היא הוכחת זהות בלבד.** הקובץ מאמת שהטוקן שהגיע
// מהדפדפן או מהאפליקציה באמת הונפק ע"י אפל ובאמת עבורנו — ומכאן המערכת ממשיכה כרגיל,
// הוורקר מנפיק את אותו custom token שהוא מנפיק אחרי טלפון+קוד. ר' §370 להחלטה המקורית.
//
// ⚠️ **זו דרישת אישור של אפל ולא פיצ'ר**: אפליקציה שמציעה התחברות של צד שלישי (אצלנו —
// גוגל) חייבת להציע גם "התחברות עם Apple", בכל מקום שבו האחרת מוצעת.

import { createRemoteJWKSet, jwtVerify, importPKCS8, SignJWT } from 'jose';

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
    // §455 — ה-client_id שעבורו הונפק הטוקן. נדרש להחלפת הקוד ולביטול: שניהם חייבים
    // להיחתם עבור **אותו** מזהה (Services ID באתר, Bundle ID באפליקציה). מאומת כבר ע"י
    // `jwtVerify` מול הרשימה, כלומר זה אינו קלט של המשתמש.
    aud: Array.isArray(payload.aud) ? String(payload.aud[0]) : String(payload.aud),
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

// ══ §455 — ביטול הטוקן במחיקת חשבון (Guideline 5.1.1(v)) ═══════════════════════════════════
//
// 🔑 **אפל דורשת שמחיקת חשבון של מי שנכנס עם Apple תבטל את ההרשאה אצלה**, דרך
// `/auth/revoke`. ביטול דורש `refresh_token` — ואותו מקבלים **רק** מהחלפת ה-
// `authorizationCode`, קוד חד-פעמי ש**פג אחרי 5 דקות**. כלומר ההחלפה חייבת לקרות ברגע
// ההרשאה עצמה, ולא ביום המחיקה ולא בשליחת הטופס (שיכולה לבוא עשר דקות אחרי).
// עד §455 אף נתיב לא שלח את הקוד לשרת — כלומר גם עם מפתח `.p8` לא היה מה לבטל.
//
// ⚠️ **לכן שומרים לפי `sub` של אפל ולא לפי uid שלנו:** ברגע ההרשאה בטופס ההרשמה עוד
// אין רשומת חבר. ב-`/delete-account` ה-`sub` נקרא מ-`members.appleSub`.
//
// ⚠️ **שני הסודות אינם ה-`APPLE_CLIENT_IDS`:** לאימות טוקן (כניסה) לא נדרש שום סוד.
// להחלפה ולביטול נדרש `client_secret` — JWT בחתימת ES256 במפתח `.p8` מהפורטל.
//   APPLE_TEAM_ID     — [vars], לא סוד (MX427CFSV2)
//   APPLE_KEY_ID      — [vars], לא סוד (10 תווים, מופיע ליד המפתח בפורטל)
//   APPLE_PRIVATE_KEY — secret, תוכן קובץ ה-.p8 כולו כולל שורות BEGIN/END

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
// §bound-every-network-await — אפל אינה בנתיב שהאדם ממתין לו, אבל מחיקת חשבון כן.
const APPLE_HTTP_TIMEOUT_MS = 8000;

// "לא מוגדר" הוא מצב תקין (עד שייווצר מפתח) ולא חריגה — הקוראים מדווחים עליו בשמו,
// כדי ש"לא הוגדר" לא ייראה בנתונים כמו "אפל דחתה".
export function appleKeyConfigured(env) {
  return !!(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

// ⚠️ **לא נשמר במטמון לפי client_id** — ה-`sub` של ה-JWT הוא ה-client_id, ויש שניים.
// המפתח עצמו כן נשמר: ייבוא PKCS8 הוא הצעד היקר.
let cachedAppleKey = null;
async function appleClientSecret(env, clientId) {
  if (!cachedAppleKey) {
    // 🐛 מלכודת PowerShell/pipe ידועה (ר' feedback_powershell_secret_and_json_traps):
    // CRLF בסוד. PEM סובל שורות-חדשות, אבל `\r` שנשאר באמצע ה-base64 שובר את הייבוא.
    const pem = String(env.APPLE_PRIVATE_KEY).replace(/\r/g, '').replace(/\\n/g, '\n').trim();
    cachedAppleKey = await importPKCS8(pem, 'ES256');
  }
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)       // חד-פעמי לבקשה; אין סיבה להחזיק סוד ארוך-חיים
    .sign(cachedAppleKey);
}

async function applePost(url, params) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS),
  });
  let body = null;
  try { body = await resp.json(); } catch (e) { body = null; }
  return { status: resp.status, ok: resp.ok, body };
}

/**
 * מחליף authorizationCode ב-refresh_token.
 * `verified` הוא התוצאה של `verifyAppleIdToken` על ה-id_token שהגיע **יחד** עם הקוד.
 * מחזיר { ok:true, refreshToken, clientId } או { ok:false, reason, detail }. אינו זורק.
 */
export async function exchangeAppleCode(env, verified, code, redirectUri) {
  if (!appleKeyConfigured(env)) return { ok: false, reason: 'apple_key_not_configured' };
  if (!code || typeof code !== 'string') return { ok: false, reason: 'missing_code' };
  const clientId = verified.aud;
  try {
    const params = {
      client_id: clientId,
      client_secret: await appleClientSecret(env, clientId),
      code,
      grant_type: 'authorization_code',
    };
    // ⚠️ באתר (Services ID) אפל דורשת את **אותה** redirect_uri שנמסרה ל-`AppleID.auth.init`.
    // באפליקציה אין כזו, ושליחתה שם הייתה נדחית.
    if (redirectUri) params.redirect_uri = redirectUri;
    const r = await applePost(APPLE_TOKEN_URL, params);
    if (!r.ok || !r.body || !r.body.refresh_token) {
      return { ok: false, reason: 'apple_exchange_rejected',
               detail: `${r.status}:${(r.body && r.body.error) || ''}` };
    }
    // 🔑 **הקוד אינו נושא זהות שאפשר לסמוך עליה מצד הלקוח.** תוקף יכול לשלוח id_token
    // אמיתי שלו יחד עם קוד של מישהו אחר (או להפך). ה-id_token שחוזר **מאפל עצמה** הוא
    // הראיה: ה-`sub` שלו חייב להיות זהה למה שאומת, אחרת לא נשמר כלום.
    let fresh;
    try { fresh = await verifyAppleIdToken(env, r.body.id_token); }
    catch (e) { return { ok: false, reason: 'apple_exchange_bad_id_token' }; }
    if (fresh.sub !== verified.sub) return { ok: false, reason: 'apple_exchange_sub_mismatch' };
    return { ok: true, refreshToken: String(r.body.refresh_token), clientId };
  } catch (e) {
    return { ok: false, reason: 'apple_exchange_error', detail: String((e && e.name) || e).slice(0, 80) };
  }
}

/**
 * מבטל refresh_token אצל אפל, **ומוכיח שהביטול קרה.**
 * מחזיר { ok:true } רק כשהטוקן הוכח כמת, אחרת { ok:false, reason, detail }. אינו זורק.
 *
 * 🔴 **200 מ-`/auth/revoke` אינו ראיה לכלום — נמדד מול אפל החיה (23.9.2026):**
 * `client_secret=x`, `client_id` שאינו קיים וטוקן `bogus` — **כולם מחזירים 200**.
 * כלומר מפתח שגוי, `kid` שגוי או client_id שגוי היו נרשמים ביומן כ"בוטל" בזמן שההרשאה
 * חיה לגמרי — הגנה שמתקיימת תמיד. ר' [[feedback_guard_that_always_holds]].
 *
 * 🔑 **ההוכחה: לנסות להשתמש בטוקן אחרי הביטול** (`grant_type=refresh_token`).
 * באותה מדידה התברר שאפל בודקת את ה-grant **לפני** את ה-client (קוד מזויף עם סוד
 * מזויף → `invalid_grant`, לא `invalid_client`). ולכן:
 *   • `invalid_grant`  → הטוקן מת. זו ההצלחה היחידה.
 *   • `invalid_client` → הטוקן **חי** והסוד שלנו נדחה — כלומר גם הביטול לא עשה כלום.
 *   • 200              → הטוקן חי והסוד תקין — הביטול לא נקלט.
 * ⚠️ שני הענפים האחרונים **נגזרו מהסדר שנמדד, ולא נצפו** — הם דורשים `.p8` אמיתי.
 */
export async function revokeAppleToken(env, clientId, refreshToken) {
  if (!appleKeyConfigured(env)) return { ok: false, reason: 'apple_key_not_configured' };
  try {
    const r = await applePost(APPLE_REVOKE_URL, {
      client_id: clientId,
      client_secret: await appleClientSecret(env, clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    if (!r.ok) {
      return { ok: false, reason: 'apple_revoke_rejected',
               detail: `${r.status}:${(r.body && r.body.error) || ''}` };
    }
    const v = await applePost(APPLE_TOKEN_URL, {
      client_id: clientId,
      client_secret: await appleClientSecret(env, clientId),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const err = (v.body && v.body.error) || '';
    if (v.status === 400 && err === 'invalid_grant') return { ok: true };
    if (v.ok) return { ok: false, reason: 'apple_revoke_not_effective' };
    return { ok: false, reason: 'apple_revoke_unconfirmed', detail: `${v.status}:${err}` };
  } catch (e) {
    return { ok: false, reason: 'apple_revoke_error', detail: String((e && e.name) || e).slice(0, 80) };
  }
}

// נחשף לבדיקות בלבד — מאפשר לבדוק את ה-JWT בלי רשת.
export const _appleClientSecretForTest = appleClientSecret;
export function _resetAppleKeyCacheForTest() { cachedAppleKey = null; }
