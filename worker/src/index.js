import { corsHeaders, handlePreflight, json } from './cors.js';
import { getGoogleAccessToken, mintFirebaseCustomToken, verifyAdminIdToken, uidFromIdToken } from './jwt.js';
import { verifyGoogleIdToken } from './google.js';
import { verifyAppleIdToken, exchangeAppleCode, revokeAppleToken, appleKeyConfigured } from './apple.js';
import { firestoreRunQuery, firestoreGetDoc, firestorePatch, firestoreBatchCreate, firestoreListDocs, bizIdFromToken, bizTokenFor,
         memberIdFromLoginCode, loginCodeFor,
         firestoreGetDocForSnapshot, firestoreCreateDoc, firestoreDeleteDoc,
         firestoreCreateDocWithId } from './firestore.js';
import { normalizePhoneDigits, phoneCandidates } from './phone.js';
import { isRateLimited, recordAttempt, overIpQuota } from './ratelimit.js';
import { wrapEnvKv } from './safekv.js';
import { handleRegStatus, handleRegRetry } from './regstatus.js';
import { handleBizRegStatus } from './bizregstatus.js';
import { isStrongMatch, describeRegistration } from './regmethod.js';
import { pendingOwnerExtras } from './ownerpending.js';
import { sendLoginCodeEmail, sendBusinessApprovedEmail, sendCombinedWelcomeEmail, sendBroadcastEmail, sendConversationReplyEmail, sendDashboardLinkEmail, sendRejectEmail } from './brevo.js';
import { loginModeFor } from '../../mail-format.js';
import { shortenBenefitText } from './anthropic.js';
import { suggestFallbackImages } from './pexels.js';
import { runBackfillThumbnails } from './backfill.js';
import { runMigrateBizTokens } from './migrate-biz-tokens.js';
import { runDeletionLogPurge, PURGE_CRON } from './purge.js';
import { sendWebPush } from './push.js';
import { sendFcmToMember } from './fcm.js';
import { handleDownloadImage, handleViewImage } from './download.js';
import { handleUploadBizMedia } from './bizmedia.js';
import { handleUploadMemberProof } from './memberproof.js';
import { handleBrevoWebhook, handleSetupBrevoWebhook } from './brevo-webhook.js';
import { handleDemoSession } from './demo.js';
import { syncBizPublic, handlePublicBizList } from './bizpublic.js';
import { handleLinkBizOwner, handleBizShortTitle } from './bizowner.js';
import { handleEvent } from './events.js';
import { handleBizRegFailed } from './bizregfail.js';
import { APPCHECK_PATHS, sampleAppCheck } from './appcheck.js';
import { runStoreDownloadsSync } from './storedl.js';
import { runPlatformDaily } from './platformdaily.js';   // §587

const SITE_BASE = 'https://yellowzone.co.il/';

// §519 — מונה קצב בזיכרון (לכל isolate). לא מדויק בין מופעים, אבל בלי עלות ובלי מכסת KV.
const _memQ = new Map();
function memQuota(bucket, ip, limit, windowSec) {
  const k = bucket + ':' + (ip || 'unknown'), now = Date.now();
  let e = _memQ.get(k);
  if (!e || e.reset <= now) { e = { n: 0, reset: now + windowSec * 1000 }; _memQ.set(k, e); if (_memQ.size > 5000) _memQ.clear(); }
  e.n++;
  return e.n > limit;
}

// ── §374 — מי הלקוח, כשהבקשה הגיעה דרך הכתובת השלישית ────────────────────────────────────
// §364 העביר את ה-API ל-`api.yellowzone.co.il` והשאיר את `workers.dev` כגיבוי — **ושתיהן
// על קלאודפלייר**. אוהד שהנתיב שלו לקלאודפלייר חסום (שובל צרפתי, 2.9 10:31) נכשל בשתיהן
// באותה דקה. הכתובת השלישית יושבת אצל גוגל (`functions/index.js`) ומעבירה לכאן.
//
// ⚠️ **בלי הפונקציה הזאת מגבלת-הקצב מתמוטטת.** `CF-Connecting-IP` של בקשה שעברה במתווך הוא
// של **המתווך**, כלומר כל האוהדים שנכנסים דרכו נראים כתובת אחת — ואחרי 30 ניסיונות ב-15
// דקות (`IP_LIMIT` ב-ratelimit.js) כולם נחסמים ביחד, בדיוק אלה שכבר לא הצליחו להיכנס.
//
// ⚠️ **הכותרת נאמנת רק כשהסוד המשותף תואם.** בלי הבדיקה הזאת כל אחד היה יכול לשלוח
// `X-YZ-Client-IP` מזויף ולעקוף את מכסת-ה-IP לגמרי. מכסת-הטלפון (8 ל-15 דק') אינה תלויה
// בזה ונשארת ההגנה האמיתית מפני ניחוש קוד — אבל זו לא סיבה לוותר על השנייה.
function clientIp(request, env) {
  const secret = env.PROXY_SECRET;
  const real = request.headers.get('X-YZ-Client-IP');
  if (secret && real && request.headers.get('X-YZ-Proxy-Secret') === secret) return real;
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

export default {
  async fetch(request, env, ctx) {
    wrapEnvKv(env); // ר' safekv.js – תקרת הכתיבות של KV לא מפילה בקשות
    if (request.method === 'OPTIONS') return handlePreflight(env, request);

    const url = new URL(request.url);
    // §519 — מדידת App Check (מדגם, ברקע, לא חוסם). ר' appcheck.js
    if (request.method === 'POST' && APPCHECK_PATHS.has(url.pathname)) {
      ctx.waitUntil(sampleAppCheck(request, env, url.pathname).catch(() => {}));
    }
    try {
      // §519 — open.html: רשימת העסקים לטיזר, דרך הוורקר (App Check). אותו פורמט כמו runQuery.
      if (request.method === 'POST' && url.pathname === '/public-biz-list') {
        if (memQuota('publist', clientIp(request, env), 120, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request, 429);
        const text = await handlePublicBizList(env, await getGoogleAccessToken(env), ctx);
        return new Response(text, { status: 200, headers: corsHeaders(env, request) });
      }
      // §519 — אירועי מדידה מהדפים הקלים (בלי SDK). מכסה נדיבה: usage-track שולח כמה לכל ביקור.
      if (request.method === 'POST' && url.pathname === '/event') {
        // ⚠️ לא KV: מכסת הכתיבה החינמית של KV היא 1,000 ליום, ואירוע לכל ביקור היה מכלה אותה (ואז כל
        //    הנתיבים שנשענים על KV נופלים). מונה בזיכרון ה-isolate – מאמץ-סביר; ההגנה האמיתית: App Check.
        if (memQuota('event', clientIp(request, env), 300, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request, 429);
        return json(await handleEvent(await request.json(), env), env, request);
      }
      // §517ג — קישור בעל העסק לרשומת חבר בהרשמת עסק (במקום כתיבה אנונימית מהדף). ר' bizowner.js.
      if (request.method === 'POST' && url.pathname === '/link-biz-owner') {
        if (await overIpQuota(env.RATE_LIMIT_KV, 'linkowner', clientIp(request, env), 20, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request);
        return json(await handleLinkBizOwner(await request.json(), env), env, request);
      }
      // 13.10 — כותרת ההטבה הקצרה בהרשמת עסק (במקום כתיבה מהדף שהחוקים דחו). ר' bizowner.js.
      if (request.method === 'POST' && url.pathname === '/biz-short-title') {
        if (await overIpQuota(env.RATE_LIMIT_KV, 'bizshort', clientIp(request, env), 20, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request);
        return json(await handleBizShortTitle(await request.json(), env), env, request);
      }
      // §548 — תקלה בהרשמת עסק: גיבוי הטופס + מייל ופוש למנהל. ר' bizregfail.js.
      if (request.method === 'POST' && url.pathname === '/biz-reg-failed') {
        if (await overIpQuota(env.RATE_LIMIT_KV, 'bizregfail', clientIp(request, env), 8, 60 * 60)) return json({ error: 'too_many_attempts' }, env, request);
        return json(await handleBizRegFailed(await request.json(), env, await getGoogleAccessToken(env)), env, request);
      }
      // §516 — לינק תצוגה לאורח (demo.html / demo-mode.js). ר' demo.js.
      if (request.method === 'POST' && url.pathname === '/demo-session') {
        return json(await handleDemoSession(await request.json(), clientIp(request, env), env), env, request);
      }
      // §612 — "הבקשה שלך בבדיקה": מצב הבקשה לפי המפתח שנשמר במכשיר, וכניסה לבד אחרי האישור.
      if (request.method === 'POST' && url.pathname === '/reg-status') {
        if (memQuota('regstatus', clientIp(request, env), 60, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request, 429);
        return json(await handleRegStatus(await request.json(), env), env, request);
      }
      // §664 — בעל עסק ממתין: מצב העסק ומה חסר בו (תמונות), לפי טוקן העסק שנשמר במכשיר שנרשם.
      if (request.method === 'POST' && url.pathname === '/biz-reg-status') {
        if (memQuota('bizregstatus', clientIp(request, env), 60, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request, 429);
        return json(await handleBizRegStatus(await request.json(), env), env, request);
      }
      // §628 – "האימות לא עבר": תיקון מהמכשיר שנרשם (תמונה + פרופיל), פעם אחת.
      if (request.method === 'POST' && url.pathname === '/reg-retry') {
        if (memQuota('regretry', clientIp(request, env), 10, 60 * 60)) return json({ error: 'too_many_attempts' }, env, request, 429);
        return json(await handleRegRetry(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/mint-member-token') {
        return json(await handleMemberLogin(await request.json(), request, env), env, request);
      }
      // §370 — כניסה עם גוגל. שני נתיבים **נפרדים בכוונה**, כי רמת-האמון שלהם שונה:
      // /google-login רק קורא, /google-link ו-/google-attach כותבים זהות על רשומת חבר.
      if (request.method === 'POST' && url.pathname === '/google-login') {
        return json(await handleGoogleLogin(await request.json(), request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/google-link') {
        return json(await handleGoogleLink(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/google-attach') {
        return json(await handleGoogleAttach(await request.json(), request, env), env, request);
      }
      // §423 — כניסה עם Apple. שלושה נתיבים במקביל מדויק לשל גוגל, ומאותו נימוק:
      // /apple-login רק קורא, /apple-link ו-/apple-attach כותבים זהות על רשומת חבר.
      if (request.method === 'POST' && url.pathname === '/apple-login') {
        return json(await handleAppleLogin(await request.json(), request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/apple-link') {
        return json(await handleAppleLink(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/apple-attach') {
        return json(await handleAppleAttach(await request.json(), request, env), env, request);
      }
      // §455 — החלפת ה-authorizationCode ב-refresh_token, ברגע ההרשאה. ר' apple.js.
      if (request.method === 'POST' && url.pathname === '/apple-exchange') {
        return json(await handleAppleExchange(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/mint-biz-token') {
        return json(await handleBusinessLogin(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/log-biz-error') {
        return json(await handleLogBizError(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/upload-biz-media') {
        return json(await handleUploadBizMedia(request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/upload-member-proof') {
        // §565 — גיבוי לתמונת-האימות כשה-SDK של Storage תקוע. 8 ל-IP ב-15 דק': נרשם אחד מעלה
        // תמונה אחת, ולכל היותר מחליף אותה כמה פעמים. ר' memberproof.js.
        if (await overIpQuota(env.RATE_LIMIT_KV, 'proofup', clientIp(request, env), 8, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request);
        try {
          return json(await handleUploadMemberProof(request, env), env, request);
        } catch (e) {
          console.error('upload-member-proof failed:', e.message);
          return json({ error: 'upload_failed' }, env, request);
        }
      }
      if (request.method === 'POST' && url.pathname === '/resend-login-code') {
        // §517 — 10 ל-IP ב-15 דק' (הקירור של 60 שנ' הוא לכל חבר, לא לכל שולח)
        if (await overIpQuota(env.RATE_LIMIT_KV, 'resend', clientIp(request, env), 10, 15 * 60)) return json({ ok: true }, env, request);
        return json(await handleResendCode(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/check-member-exists') {
        // §517 — 30 ל-IP ב-15 דק' (טופס הרשמה קורא כמה פעמים לכל היותר)
        if (await overIpQuota(env.RATE_LIMIT_KV, 'checkmember', clientIp(request, env), 30, 15 * 60)) return json({ error: 'too_many_attempts' }, env, request);
        return json(await handleCheckMemberExists(await request.json(), env), env, request);
      }
      // §462 — נתיב-גיבוי לשליחת טופס האוהד כש-Firestore בדפדפן לא מאשר את הכתיבה.
      if (request.method === 'POST' && url.pathname === '/submit-member') {
        return json(await handleSubmitMember(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/check-biz-exists') {
        return json(await handleCheckBizExists(await request.json(), request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/shorten-benefit') {
        return json(await handleShortenBenefit(await request.json(), request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/suggest-fallback-images') {
        return json(await handleSuggestFallbackImages(await request.json(), request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/backfill-thumbnails') {
        return json(await handleBackfillThumbnails(request, env), env, request);
      }
      // מיגרציה חד-פעמית §244 — ר' src/migrate-biz-tokens.js לסדר-ההרצה הנכון
      if (request.method === 'POST' && url.pathname === '/migrate-biz-tokens') {
        return json(await handleMigrateBizTokens(request, env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/send-test-push') {
        return json(await handleSendTestPush(request, env), env, request);
      }
      // §420 — מחיקת חשבון עצמית (דרישת Google Play). מאומת ב-idToken של המוחק עצמו.
      if (request.method === 'POST' && url.pathname === '/delete-account') {
        return json(await handleDeleteAccount(await request.json(), request, env), env, request);
      }
      // §460ח — ביטול הרשאת Apple אחרי מחיקה ע"י מנהל. מאומת כמנהל.
      if (request.method === 'POST' && url.pathname === '/admin-apple-revoke') {
        return json(await handleAdminAppleRevoke(await request.json(), env), env, request);
      }
      // §556 — "רענון עכשיו" במסך "הורדות לפי מקור". מאומת כמנהל.
      if (request.method === 'POST' && url.pathname === '/admin-store-sync') {
        const { idToken } = await request.json();
        try { await verifyAdminIdToken(env, idToken); } catch (e) { return json({ error: 'not_admin' }, env, request, 403); }
        return json({ ok: true, status: await runStoreDownloadsSync(env) }, env, request);
      }
      // §508 — "השבוע אצלך": הנתונים השבועיים של העסק, לבעלים בלבד.
      if (request.method === 'POST' && url.pathname === '/biz-weekly-stats') {
        return json(await handleBizWeeklyStats(await request.json(), env), env, request);
      }
      // §505 — "שלחו לי במייל" את קישור הניהול. מאומת בטוקן העסק עצמו.
      if (request.method === 'POST' && url.pathname === '/send-dash-link') {
        return json(await handleSendDashLink(await request.json(), env), env, request);
      }
      // §501 — מייל+פוש אחרי תשובה בשיחה. מאומת כמנהל.
      if (request.method === 'POST' && url.pathname === '/notify-conv-reply') {
        return json(await handleNotifyConvReply(await request.json(), env), env, request);
      }
      // §522 — "שליחה עכשיו" החדשה: אפליקציה + פוש + מייל לחבילת נמענים. מאומת כמנהל.
      if (request.method === 'POST' && url.pathname === '/send-message') {
        return json(await handleSendMessage(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/send-broadcast-email') {
        return json(await handleSendBroadcastEmail(await request.json(), env), env, request);
      }
      // נקרא ע"י Brevo עצמו (לא מהאתר) — אימות דרך ?key=BREVO_WEBHOOK_SECRET, ר' src/brevo-webhook.js
      if (request.method === 'POST' && url.pathname === '/brevo-webhook') {
        return json(await handleBrevoWebhook(request, env), env, request);
      }
      // הרצה חד-פעמית ידנית (curl) — רושמת את ה-webhook אצל Brevo במקום להגדיר אותו בממשק שלהם
      if (request.method === 'POST' && url.pathname === '/setup-brevo-webhook') {
        return json(await handleSetupBrevoWebhook(request, env), env, request);
      }
      // ── §403 — חימום ────────────────────────────────────────────────────────────────
      // הזול ביותר שאפשר: בלי Firestore, בלי KV, בלי getGoogleAccessToken. מטרתו אינה
      // להחזיר מידע אלא **לשלם מראש** את DNS + TLS + קר-סטארט, בזמן שהאוהד עוד מקליד.
      // ⚠️ **הוא גם מזהה איזו כתובת בכלל נגישה מהמכשיר הזה**, וזה החלק החשוב יותר: מכשיר
      // שהראשית חסומה אצלו (§359/§374) לא ישלם 3.5 שניות בזמן הכניסה עצמה.
      // ⚠️ אין כאן שום סוד ואין תופעות-לוואי, ולכן אין מגבלת-קצב: קריאה חוזרת עולה כלום
      // ואינה נוגעת ב-`recordAttempt`.
      if (request.method === 'GET' && url.pathname === '/ping') {
        return json({ ok: true }, env, request);
      }
      if (request.method === 'GET' && url.pathname === '/download-image') {
        return handleDownloadImage(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/view-image') {
        return handleViewImage(request, env, ctx); // ctx — נדרש ל-cache.put, ר' §317
      }
      return json({ error: 'not_found' }, env, request, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'internal_error' }, env, request, 500);
    }
  },

  // ══ §449 — שני טריגרים, ו-`event.cron` הוא מה שמבדיל ביניהם ═══════════════════════════
  //
  // 🔑 **גזירה מהטריגר ולא משעון פנימי.** החלופה הייתה לשמור "מתי רצתי לאחרונה" ב-KV
  // ולבדוק בכל דקה — כלומר מצב שצריך לתחזק, שיכול להיתקע, ושכשל בו נראה בדיוק כמו
  // "עדיין לא הגיע הזמן". Cloudflare כבר מוסרת את זה ב-`event.cron`.
  //
  // ⚠️ **ברירת המחדל היא התנהגות היום**: כל ערך שאינו הטריגר היומי מריץ את תור המיילים,
  // ולכן שינוי או הסרה של ה-cron החדש אינם יכולים לשתק את המיילים. הכיוון ההפוך
  // (ברירת מחדל = ניקוי) היה מריץ מחיקות כל דקה על ערך לא צפוי.
  async scheduled(event, env, ctx) {
    wrapEnvKv(env);
    if (event && event.cron === PURGE_CRON) {
      ctx.waitUntil(runDeletionLogPurge(env));
      // §582 – כרטיסי-זיהוי של Apple שפגו (3 שעות) ולא נוצלו.
      ctx.waitUntil(purgeExpiredAppleTickets(env).then((n) => console.log('appleTickets purged', n)).catch((e) => console.error('appleTickets purge failed', String(e))));
      // §556 – הורדות לפי מקור מהחנויות, פעם ביום על אותו טריגר. כשל כאן לא נוגע בניקוי.
      ctx.waitUntil(runStoreDownloadsSync(env).then((r) => console.log('storeDownloads', JSON.stringify(r))).catch((e) => console.error('storeDownloads failed', String(e))));
      // §587 – סיכום יומי לפאנל הפלטפורמה (platformDaily/{יום}). כשל כאן לא נוגע בשאר.
      ctx.waitUntil(getGoogleAccessToken(env).then((t) => runPlatformDaily(env, t))
        .then((r) => console.log('platformDaily', JSON.stringify(r))).catch((e) => console.error('platformDaily failed', String(e))));
      return;
    }
    ctx.waitUntil(runEmailSweeps(env));
    // §517ב — העתק ציבורי של העסקים (bizPublic) + קודים לחברים (bizCodes). כשל כאן לא נוגע במיילים.
    // §649 – כל דקה רק המאושרים; פעם בחצי שעה (ובהפעלה בלי זמן מתוזמן) השוואה מלאה מול ההעתקים
    const full = !(event && event.scheduledTime) || new Date(event.scheduledTime).getUTCMinutes() % 30 === 0;
    ctx.waitUntil(getGoogleAccessToken(env).then((t) => syncBizPublic(env, t, { full }))
      .then((r) => { if (r.wrote || r.removed) console.log('bizPublic sync', JSON.stringify(r)); })
      .catch((e) => console.error('bizPublic sync failed', String(e))));
  },
};

async function handleMemberLogin({ phone, code }, request, env) {
  if (!phone || !code || String(code).length !== 6) return { error: 'invalid_request' };

  const ip = clientIp(request, env);
  const normPhone = normalizePhoneDigits(phone);

  if (await isRateLimited(env.RATE_LIMIT_KV, normPhone, ip)) {
    return { error: 'too_many_attempts' };
  }

  const accessToken = await getGoogleAccessToken(env);
  const candidates = phoneCandidates(phone);
  // §248 — הקוד כבר לא על מסמך החבר אלא ב-memberCodes/{memberId}, ר' memberIdFromLoginCode.
  // הטלפון והסטטוס עדיין נבדקים על מסמך החבר עצמו — הקוד לבדו לעולם לא מספיק לכניסה.
  const codeMemberId = await memberIdFromLoginCode(env, accessToken, code);
  const codeMember = codeMemberId ? await firestoreGetDoc(env, accessToken, `members/${codeMemberId}`) : null;
  const match = (codeMember &&
    candidates.includes(normalizePhoneDigits(codeMember.fields.phone)) &&
    codeMember.fields.status === 'approved') ? codeMember : null;

  if (match) {
    const customToken = await mintFirebaseCustomToken(env, {
      uid: match.id,
      claims: { role: 'member', isBusinessOwner: match.fields.isBusinessOwner === true },
    });
    return { customToken };
  }

  await recordAttempt(env.RATE_LIMIT_KV, normPhone, ip);

  // קוד/טלפון לא תואמים — בדיקה נוספת רק לפי טלפון, כדי להחזיר הודעה מדויקת
  // (חבר ממתין לאישור עדיין לא קיבל loginCode בכלל, לכן לא יימצא בשאילתה למעלה)
  let phoneDoc = null;
  for (const c of candidates) {
    const rows = await firestoreRunQuery(env, accessToken, 'members', 'phone', c);
    phoneDoc = rows.find((m) => m.fields.status !== 'approved');
    if (phoneDoc) break;
  }
  if (phoneDoc) {
    return { error: phoneDoc.fields.status === 'pending' ? 'pending' : 'rejected' };
  }

  return { error: 'invalid_credentials' };
}

// ══ §370 — כניסה עם גוגל ═══════════════════════════════════════════════════════════════
// גוגל היא הוכחת זהות בלבד (ר' google.js ו-§368). כל הנתיבים כאן מסתיימים באותו
// custom token שמונפק אחרי טלפון+קוד — אין uid חדש, אין rules חדשים, אין מסך שמשתנה.

// חיפוש חבר לפי מזהה-גוגל. ⚠️ מוחזר **מערך**, ובכוונה: שתי רשומות עם אותו googleSub
// הן תקלת-נתונים שבה זהות אחת מצביעה על שני אנשים. הקוראים למטה עוצרים במקרה כזה
// במקום לבחור אחת — 'לנחש' כאן פירושו להכניס אדם לחשבון שאינו שלו.
async function membersByGoogleSub(env, accessToken, sub) {
  return firestoreRunQuery(env, accessToken, 'members', 'googleSub', sub, 2);
}

async function handleGoogleLogin({ idToken }, request, env) {
  let g;
  try { g = await verifyGoogleIdToken(env, idToken); }
  catch (e) { return { error: 'invalid_google_token' }; }

  const accessToken = await getGoogleAccessToken(env);
  const rows = await membersByGoogleSub(env, accessToken, g.sub);
  if (rows.length > 1) return { error: 'google_ambiguous' };

  const member = rows[0];
  // ⚠️ 'לא מקושר' אינו שגיאה — זו הפעם הראשונה שלו. הקליינט הופך את זה למסך שמסביר
  // איך לקשור, ולכן המייל מוחזר: כדי שהמסך יוכל לומר לו באיזה חשבון הוא השתמש.
  if (!member) {
    const linkable = await linkableByVerifiedEmail(env, accessToken, g, 'googleSub');
    // §586 — ר' unapprovedByVerifiedEmail: נרשם עם המייל הזה ועדיין לא אושר.
    const un = linkable ? null : await unapprovedByVerifiedEmail(env, accessToken, g);
    if (un) return await pendingReply(env, accessToken, un);
    return { error: 'google_not_linked', email: g.email, linkable };
  }
  if (member.fields.status !== 'approved') {
    return await pendingReply(env, accessToken, { reason: member.fields.status === 'pending' ? 'pending' : 'rejected', row: member });
  }

  const customToken = await mintFirebaseCustomToken(env, {
    uid: member.id,
    claims: { role: 'member', isBusinessOwner: member.fields.isBusinessOwner === true },
  });
  return { customToken };
}

// ══ §403 — מי שהמייל המאומת שלו כבר יושב על רשומה, בלחיצה אחת ═══════════════════════════
// 🔑 **זה אינו שער חדש — זה בדיוק השער של `handleGoogleAttach` למטה**, שקיים מ-§370 ומנוסח
// שם במפורש: *"אפשר לקשור חשבון גוגל רק לרשומה שנושאת את הכתובת של אותו חשבון"*. מה שנוסף
// כאן הוא רק **מציאת** הרשומה ההיא לפי המייל, במקום לדרוש מהקליינט לדעת את ה-memberId.
//
// למה זה בטוח באותה מידה: המייל שגוגל אימתה הוא **אותה תיבה בדיוק** שאליה אנחנו כבר שולחים
// את קוד-הכניסה ב-`/resend-login-code`. מי ששולט בה יכול להיכנס גם היום, בשתי לחיצות נוספות.
// ⚠️ ולכן גם החולשה זהה ואינה חדשה: רשומה שנרשמה ע"י בן-משפחה עם **המייל שלו** תיפתח לו —
// בדיוק כפי שקוד-הכניסה שלה כבר מגיע אליו היום. זה מתועד ב-§368 ולא נפתר כאן.
//
// שלושה תנאים, וכולם חייבים להתקיים. ⚠️ **`rows.length !== 1` הוא עצירה ולא בחירה**: שתי
// רשומות עם אותו מייל פירושן שאיננו יודעים מי מהן, ו'לנחש' כאן = להכניס אדם לחשבון של
// מישהו אחר (אותו נימוק כמו `membersByGoogleSub` למעלה). נמדד ב-3.9: 200 מתוך 201 הכתובות
// ייחודיות, והכפילות היחידה היא אותה אדם פעמיים.
// §423 — `subField` נוסף כשהמסלול הזה נפתח גם לאפל, והוא **פרמטר חובה בלי ברירת-מחדל
// בכוונה**: ברירת-מחדל `'googleSub'` הייתה גורמת לכניסת-אפל שנשכחה לבדוק את השדה של
// גוגל — כלומר לאשר קישור על רשומה שכבר מקושרת לחשבון אפל אחר, בשקט ובלי שגיאה. זריקה
// כאן היא הדבר היחיד שנתפס. ר' [[feedback_empty_catch_on_a_guard]].
// §437 — תקרת הסריקה החסינה-לרישיות. 3,000 מול ~250 חברים היום, כלומר מרווח של פי עשרה,
// ועדיין הרחק מתקרת השאילתה של Firestore. ר' ההערה בגוף הפונקציה.
const MEMBER_EMAIL_SCAN_LIMIT = 3000;

// ── §586 — נרשם עם המייל הזה, ועדיין לא אושר ─────────────────────────────────────────────
// נמדד 20.10: אוהד שנרשם וחיכה לאישור לחץ 7 פעמים על Google עם **אותו מייל שעל הרשומה**,
// וכל פעם קיבל "עדיין לא חיברתם את חשבון ה-Google… עדיין לא נרשמתם? הצטרפו כאן" – כי
// linkableByVerifiedEmail מסנן (בצדק) רשומה שלא אושרה, והתוצאה נראתה כמו "לא רשום".
// התשובה הנכונה היא אותה 'pending' ש-/google-login מחזיר למי שכבר מקושר.
// ⚠️ חושף "יש הרשמה ממתינה" רק למי שהוכיח עכשיו שליטה בתיבה (מייל מאומת אצל הספק) –
// אותה ראיה שעליה נשען כל המסלול. רשומה מאושרת עם אותו מייל = לא כאן (זה מסלול הקישור).
// §666 — מחזיר גם את הרשומה הממתינה (row), בשביל pendingReply.
async function unapprovedByVerifiedEmail(env, accessToken, g) {
  if (!g.emailVerified || !g.email) return null;
  const rows = await firestoreRunQuery(env, accessToken, 'members', 'email', String(g.email).toLowerCase(), 3);
  if (!rows.length || rows.some((m) => m.fields.status === 'approved')) return null;
  const row = rows.find((m) => m.fields.status === 'pending');
  return { reason: row ? 'pending' : 'rejected', row: row || null };
}

// §666 — תשובת 'pending'/'rejected' של Google/Apple. לבעל עסק ממתין (אחרי הוכחת זהות אצל הספק)
// מצורף `biz` = מה שמסך "העסק שלך אצלנו" צריך (ownerpending.js). כשל בצירוף לא מפיל את התשובה.
async function pendingReply(env, accessToken, { reason, row }) {
  const out = { error: reason };
  if (reason !== 'pending' || !row) return out;
  try {
    const biz = await pendingOwnerExtras(env, accessToken, row);
    if (biz) out.biz = biz;
  } catch (e) { console.warn('pendingOwnerExtras:', e.message); }
  return out;
}

async function linkableByVerifiedEmail(env, accessToken, g, subField) {
  if (!subField) throw new Error('linkable_sub_field_required');
  // מייל שהספק לא אימת אינו ראיה לכלום, וכל הגדר נשען עליו.
  // §460ב — כתובת-ממסר של אפל עוברת כאן (מאומתת), ותמצא רק רשומה שנרשמה איתה — כלומר
  // של מי שנרשם עם "הסתר" וה-attach שלו לא הושלם. חבר ותיק עם מייל אמיתי לא יימצא. ר' `apple.js`.
  if (!g.emailVerified || !g.email) return null;
  let rows = await firestoreRunQuery(env, accessToken, 'members', 'email', g.email, 2);
  // ── §437 — 🔴 **שאילתת Firestore רגישה לרישיות, והמייל מהספק תמיד באותיות קטנות** ────
  // דווח חי (2026-09-16): חבר **מאושר** לחץ על Google, בחר חשבון, וחזר למסך הכניסה עם
  // "עדיין לא חיברתם". רשומה ששמורה כ-`Israel@Gmail.com` אינה נמצאת בחיפוש של
  // `israel@gmail.com`, **ואין שום סימן לכך** — התוצאה נראית בדיוק כמו חשבון לא-מקושר.
  // הרשמות חדשות נשמרות `trim().toLowerCase()` (fan-register.html / business.html), אבל
  // רשומות ישנות ורשומות שהוזנו ידנית במרכז הניהול אינן מנורמלות.
  // ⚠️ **הסריקה רצה רק כשהמסלול המהיר לא מצא כלום** — כלומר במקרה הנדיר ולא בכל כניסה.
  // ⚠️ **ההגנה נשמרת במלואה:** יותר מהתאמה אחת = עצירה, מאותו נימוק בדיוק שלמעלה.
  // 🔲 פער ידוע שלא נסגר כאן: בדיקת-הכפילות בהרשמה מחפשת גם היא במייל מנורמל, ולכן רשומה
  //    ישנה עם אות גדולה אינה נתפסת כקיימת. ר' §437 במסמך.
  if (rows.length === 0) {
    const approved = await firestoreRunQuery(env, accessToken, 'members', 'status', 'approved', MEMBER_EMAIL_SCAN_LIMIT);
    // ⚠️ תקרה שנגמרה היא סריקה חלקית, כלומר "לא נמצא" שאינו אמין. לא משנה את ההחלטה
    // (עצירה היא עדיין הצד הבטוח), אבל **חייב להיראות בלוג** — אחרת הוא ייעלם בשקט.
    if (approved.length >= MEMBER_EMAIL_SCAN_LIMIT) {
      console.warn('linkableByVerifiedEmail: סריקת המיילים הגיעה לתקרה – ייתכן שההתאמה פוספסה');
    }
    rows = approved.filter((m) => String(m.fields.email || '').trim().toLowerCase() === g.email);
  }
  // ── §456ב — גם המייל של חשבון ה-Google המחובר, ורק לכניסת Apple ────────────────────
  // 🔴 נמדד אצל רמי (23.9): Apple מסרה `ramibentl@gmail.com`, ו-`members.email` הוא כתובת
  // אחרת — אבל `googleEmail` על אותה רשומה הוא בדיוק `ramibentl@gmail.com`. כלומר אותו אדם,
  // שכבר נכנס עם Google, קיבל "לא מחובר" מ-Apple. המשתמש: *"זה אמור לזהות ולעבוד"*.
  // 🔑 **זו אותה ראיה בדיוק, לא החלשה:** `googleEmail` נכתב רק ע"י הוורקר, רק אחרי שגוגל
  // אימתה שהאדם שולט בתיבה (§370/§377). מי שמוכיח עכשיו מול Apple שליטה באותה תיבה (מייל
  // מאומת, לא ממסר — נבדק למעלה) הוא אותו אדם באותה ודאות שבה `email` מוכיח זאת.
  // ⚠️ **רק כשהמסלול הרגיל לא מצא כלום**, ועם אותו שער `rows.length !== 1` — כפילות = עצירה.
  // ⚠️ **לא לכניסת Google:** שם `googleEmail` שווה למייל רק אם `googleSub` כבר מקושר, כלומר
  // `/google-login` היה נכנס ישירות — והשדה היה נבדק מול עצמו.
  if (rows.length === 0 && subField === 'appleSub') {
    rows = await firestoreRunQuery(env, accessToken, 'members', 'googleEmail', g.email, 2);
  }
  if (rows.length !== 1) return null;
  const m = rows[0];
  // ⚠️ כבר מקושר לחשבון **אחר של אותו ספק** — החלפה מותרת רק בנתיב המחובר.
  if (m.fields[subField]) return null;
  // ⚠️ ממתין/נדחה אינו נכנס. `/google-login` כבר מחזיר 'pending'/'rejected' למי שמקושר,
  // וזה חייב להיות זהה גם כאן — אחרת הקישור היה עוקף את שער-האישור.
  if (m.fields.status !== 'approved') return null;
  // רק שם פרטי + אות ראשונה של המשפחה: מספיק כדי שהקורא יזהה את עצמו, ולא רשימת-פרטים
  // על אדם שאולי אינו הוא. (מי שמגיע לכאן ממילא שולט בתיבה, אבל אין סיבה להרחיב.)
  const fn = String(m.fields.firstName || '').trim();
  const ln = String(m.fields.lastName || '').trim();
  return { memberId: m.id, name: (fn + ' ' + (ln ? ln[0] + "'" : '')).trim() };
}

// ── קישור ע"י חבר שכבר מחובר — הנתיב החזק ──────────────────────────────────────────────
// דורש **שני** טוקנים: אחד שמוכיח מי הוא אצל גוגל, ואחד שמוכיח מי הוא אצלנו.
// זה הנתיב של 'חבר את חשבון הגוגל שלי' בפרופיל, ושל כל חבר ותיק שנרשם לפני §370.
async function handleGoogleLink({ idToken, memberIdToken }, env) {
  let g, uid;
  try { g = await verifyGoogleIdToken(env, idToken); } catch (e) { return { error: 'invalid_google_token' }; }
  try { uid = await uidFromIdToken(env, memberIdToken); } catch (e) { return { error: 'not_signed_in' }; }

  const accessToken = await getGoogleAccessToken(env);
  // ⚠️ חשבון גוגל אחד = אדם אחד. אם הוא כבר קשור לחבר **אחר**, קישור נוסף היה נותן
  // לאותה זהות שתי רשומות — ואז 'עם מי להיכנס' הופכת לשאלה שאין לה תשובה נכונה.
  const existing = await membersByGoogleSub(env, accessToken, g.sub);
  if (existing.some((m) => m.id !== uid)) return { error: 'google_already_linked' };

  const me = await firestoreGetDoc(env, accessToken, `members/${uid}`);
  if (!me) return { error: 'member_not_found' };

  await firestorePatch(env, accessToken, `members/${uid}`, {
    googleSub: g.sub, googleEmail: g.email, googleLinkedAt: new Date(),
  });
  return { ok: true, email: g.email };
}

// ── קישור בזמן הרשמה — הנתיב החלש, ולכן החסום ביותר ────────────────────────────────────
// בהרשמה אין עדיין session: הנרשם יצר רשומת pending ואין לו טוקן שלנו. לכן הנתיב הזה
// אינו יכול לדרוש הוכחת-זהות שלנו, ובלי גדר הוא היה מאפשר לתוקף לקשור את חשבון
// **הגוגל שלו** לרשומה של **מישהו אחר** — ואז להיכנס בשמו ברגע שיאושר.
//
// 🔑 הגדר: המייל השמור על הרשומה חייב להיות **זהה** למייל שגוגל אימתה. כלומר אפשר
// לקשור חשבון גוגל רק לרשומה שנושאת את הכתובת של אותו חשבון — כלומר רק לרשומה
// שהנרשם עצמו יצר. תוקף אינו יכול לייצר מייל מאומת של אדם אחר.
// ⚠️ ובנוסף: רק אם אין עדיין googleSub. חיבור **החלפה** מותר רק בנתיב המחובר למעלה.
async function handleGoogleAttach({ idToken, memberId }, request, env) {
  let g;
  try { g = await verifyGoogleIdToken(env, idToken); } catch (e) { return { error: 'invalid_google_token' }; }
  if (!memberId || typeof memberId !== 'string') return { error: 'invalid_request' };
  // מייל לא מאומת אצל גוגל אינו ראיה לכלום, וכל הגדר כאן נשען עליו.
  if (!g.emailVerified || !g.email) return { error: 'google_email_unverified' };

  const accessToken = await getGoogleAccessToken(env);
  const existing = await membersByGoogleSub(env, accessToken, g.sub);
  if (existing.some((m) => m.id !== memberId)) return { error: 'google_already_linked' };

  const me = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  if (!me) return { error: 'member_not_found' };
  if (me.fields.googleSub) return { error: 'already_attached' };

  const onRecord = String(me.fields.email || '').trim().toLowerCase();
  if (!onRecord || onRecord !== g.email) return { error: 'email_mismatch' };

  await firestorePatch(env, accessToken, `members/${memberId}`, {
    googleSub: g.sub, googleEmail: g.email, googleLinkedAt: new Date(),
  });

  // ── §403 — ומיד גם נכנסים, באותה קריאה ───────────────────────────────────────────────
  // 🔑 **אין כאן הרחבת-הרשאה, יש חיסכון בסיבוב.** מי שעבר את השער למעלה כבר הוכיח שליטה
  // בתיבה שעל הרשומה — כלומר בדיוק מה שנדרש כדי לקבל קוד-כניסה ב-`/resend-login-code`
  // ולהיכנס איתו. חזרה בלי טוקן הייתה מכריחה קריאה שנייה ל-`/google-login` על אותה עובדה
  // עצמה: רשת נוספת, המתנה נוספת, ועוד נקודת-כשל — למי שכבר נכשל פעם אחת בכניסה.
  //
  // ⚠️ **רק ל-approved**, וזה שומר על הנתיב המקורי של §370: בהרשמה הרשומה היא `pending`,
  // אין לה עדיין קוד-כניסה, והיא מקבלת כאן `{ ok: true }` בלבד — בדיוק כמו קודם. שער
  // האישור אינו נעקף, הוא רק לא נשאל פעמיים.
  const canEnter = me.fields.status === 'approved';
  return canEnter
    ? { ok: true, customToken: await mintFirebaseCustomToken(env, {
        uid: memberId,
        claims: { role: 'member', isBusinessOwner: me.fields.isBusinessOwner === true },
      }) }
    : { ok: true };
}

// ══ §423 — כניסה עם Apple ═══════════════════════════════════════════════════════════════
// מקביל מדויק לשלושת נתיבי גוגל שלמעלה, ובכוונה: הפרדה בין "קורא" ל"כותב זהות", אותם
// שערים, אותם קודי-שגיאה במבנה. **ההבדל היחיד הוא כתובת-הממסר**, והוא מסומן בכל מקום.
//
// 🔑 **מדוע אפל בכלל:** אפל מחייבת "התחברות עם Apple" בכל אפליקציה שמציעה התחברות של צד
// שלישי. אצלנו יש גוגל — כלומר זה תנאי לאישור בחנות, לא פיצ'ר.

async function membersByAppleSub(env, accessToken, sub) {
  return firestoreRunQuery(env, accessToken, 'members', 'appleSub', sub, 2);
}

// ── §582 — כרטיס-זיהוי של Apple, להרשמה שלוקחת יותר מ-10 דקות ─────────────────────────────
// 🔴 נמדד (20.10): שני אוהדים לחצו Apple, מילאו את הטופס כשעה, ונרשמו – אבל `/apple-attach`
// דחה (הטוקן של אפל פג אחרי 10 דק'), ו-Apple לא חובר. רמי: "תסדר שהרשמה עם Apple תתחבר גם
// אם לקחה יותר מ-10 דקות". 🔑 כשאנחנו מאמתים את הטוקן של אפל, נשמר `appleTickets/{מזהה אקראי}`
// עם מה שאפל אישרה (sub, מייל), לשלוש שעות. attach מקבל את הכרטיס במקום טוקן שפג – **ושאר
// הבדיקות זהות** (המייל על הרשומה חייב להיות המייל שאפל אישרה). האוסף בלי `allow` – לקוח לא
// קורא ולא כותב. 192 ביט אקראיים – לא ניתן לניחוש. נמחק אחרי שימוש.
const APPLE_TICKET_TTL_MS = 3 * 60 * 60 * 1000;
async function mintAppleTicket(env, accessToken, a) {
  try {
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    const id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    await firestorePatch(env, accessToken, `appleTickets/${id}`, {
      sub: a.sub, email: a.email || '', emailVerified: !!a.emailVerified, isPrivateRelay: !!a.isPrivateRelay,
      createdAt: new Date(), expiresAtMs: Date.now() + APPLE_TICKET_TTL_MS,
    });
    return id;
  } catch (e) { console.error('apple ticket mint failed', e); return null; }
}
async function purgeExpiredAppleTickets(env) {
  const accessToken = await getGoogleAccessToken(env);
  const rows = await firestoreListDocs(env, accessToken, 'appleTickets', 2000);
  let n = 0;
  for (const r of rows) {
    if (Number(r.fields && r.fields.expiresAtMs) > Date.now()) continue;
    await firestoreDeleteDoc(env, accessToken, `appleTickets/${r.id}`).catch(() => {});
    n++;
  }
  return n;
}
async function appleFromTicket(env, accessToken, ticket) {
  if (typeof ticket !== 'string' || !/^[0-9a-f]{48}$/.test(ticket)) return null;
  const d = await firestoreGetDoc(env, accessToken, `appleTickets/${ticket}`).catch(() => null);
  if (!d || !d.fields || !d.fields.sub) return null;
  if (!(Number(d.fields.expiresAtMs) > Date.now())) return null;
  return { sub: d.fields.sub, email: d.fields.email || '', emailVerified: d.fields.emailVerified === true,
           isPrivateRelay: d.fields.isPrivateRelay === true };
}

async function handleAppleLogin({ idToken }, request, env) {
  let a;
  try { a = await verifyAppleIdToken(env, idToken); }
  catch (e) { return { error: 'invalid_apple_token' }; }

  const accessToken = await getGoogleAccessToken(env);
  const rows = await membersByAppleSub(env, accessToken, a.sub);
  if (rows.length > 1) return { error: 'apple_ambiguous' };

  const member = rows[0];
  // ⚠️ 'לא מקושר' אינו שגיאה — זו הפעם הראשונה שלו. `isPrivateRelay` מוחזר כדי שהמסך
  // יוכל לומר לו **למה** אין לו מסלול-קישור מהיר: לא תקלה, אלא שהוא בחר להסתיר את המייל.
  // בלי הדגל הזה המסך היה מציג "לא מצאנו רשומה" למי שהרשומה שלו קיימת ומחכה לו.
  if (!member) {
    const linkable = await linkableByVerifiedEmail(env, accessToken, a, 'appleSub');
    const un = linkable ? null : await unapprovedByVerifiedEmail(env, accessToken, a);   // §586
    if (un) return await pendingReply(env, accessToken, un);
    return { error: 'apple_not_linked', email: a.email,
             isPrivateRelay: a.isPrivateRelay, linkable,
             ticket: await mintAppleTicket(env, accessToken, a) };   // §582 – להרשמה שתבוא אחרי
  }
  if (member.fields.status !== 'approved') {
    return await pendingReply(env, accessToken, { reason: member.fields.status === 'pending' ? 'pending' : 'rejected', row: member });
  }

  const customToken = await mintFirebaseCustomToken(env, {
    uid: member.id,
    claims: { role: 'member', isBusinessOwner: member.fields.isBusinessOwner === true },
  });
  return { customToken };
}

// ── קישור ע"י חבר שכבר מחובר — הנתיב החזק ──────────────────────────────────────────────
// דורש **שני** טוקנים: אחד שמוכיח מי הוא אצל אפל, ואחד שמוכיח מי הוא אצלנו.
//
// 🔑 **וכאן כתובת-ממסר מותרת במפורש, בניגוד ל-`/apple-attach`.** הזהות כאן מוכחת ע"י
// טוקן החבר שלנו ולא ע"י המייל — כלומר שאלת "האם הוא שולט בתיבה" אינה נשאלת בכלל, ואין
// שום דבר שכתובת-הממסר מחלישה. חסימתה כאן הייתה מונעת מבעל חשבון אפל פרטי לקשר את
// עצמו לנצח, בלי שום רווח באבטחה.
async function handleAppleLink({ idToken, memberIdToken }, env) {
  let a, uid;
  try { a = await verifyAppleIdToken(env, idToken); } catch (e) { return { error: 'invalid_apple_token' }; }
  try { uid = await uidFromIdToken(env, memberIdToken); } catch (e) { return { error: 'not_signed_in' }; }

  const accessToken = await getGoogleAccessToken(env);
  // ⚠️ חשבון אפל אחד = אדם אחד. אותו נימוק בדיוק כמו בגוגל.
  const existing = await membersByAppleSub(env, accessToken, a.sub);
  if (existing.some((m) => m.id !== uid)) return { error: 'apple_already_linked' };

  const me = await firestoreGetDoc(env, accessToken, `members/${uid}`);
  if (!me) return { error: 'member_not_found' };

  await firestorePatch(env, accessToken, `members/${uid}`, {
    appleSub: a.sub, appleEmail: a.email, appleLinkedAt: new Date(),
  });
  return { ok: true, email: a.email };
}

// ── קישור בזמן הרשמה — הנתיב החלש, ולכן החסום ביותר ────────────────────────────────────
// אותו שער של `handleGoogleAttach`: המייל שעל הרשומה חייב להיות **זהה** למייל שאפל
// אימתה, כלומר אפשר לקשור רק לרשומה שהנרשם עצמו יצר. בלעדיו תוקף היה קושר את חשבון
// **האפל שלו** לרשומה של אדם אחר ונכנס בשמו ברגע שתאושר.
//
// §460ב — **כתובת-ממסר עוברת כאן כמו כל מייל.** טופס ההרשמה ממלא אותה כמייל של הרשומה
// ונועל אותה, ולכן ההשוואה למטה מצליחה. (עד §460ב נחסמה ב-`apple_private_email` —
// Guideline 4.8 של אפל דורשת שמי שבחר להסתיר את המייל יוכל להירשם ולהיכנס.)
async function handleAppleAttach({ idToken, memberId, ticket }, request, env) {
  let a = null;
  try { a = await verifyAppleIdToken(env, idToken); } catch (e) { if (!ticket) return { error: 'invalid_apple_token' }; }
  if (!memberId || typeof memberId !== 'string') return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);
  // §582 — הטוקן של אפל פג (10 דק') אבל יש כרטיס-זיהוי שהנפקנו כשאפל אימתה אותו.
  let fromTicket = false;
  if (!a) {
    a = await appleFromTicket(env, accessToken, ticket);
    if (!a) return { error: 'invalid_apple_token' };
    fromTicket = true;
  }

  if (!a.emailVerified || !a.email) return { error: 'apple_email_unverified' };

  const existing = await membersByAppleSub(env, accessToken, a.sub);
  if (existing.some((m) => m.id !== memberId)) return { error: 'apple_already_linked' };

  const me = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  if (!me) return { error: 'member_not_found' };
  if (me.fields.appleSub) return { error: 'already_attached' };

  const onRecord = String(me.fields.email || '').trim().toLowerCase();
  // §456ב — אותה הרחבה של `linkableByVerifiedEmail`, ומאותו נימוק: `googleEmail` הוא מייל
  // שגוגל כבר אימתה עבור הרשומה הזאת. ⚠️ בלעדיה המסך היה מציע "מחברים ונכנסים…" (linkable
  // מצא את הרשומה לפי googleEmail) — ו-attach היה דוחה את אותה רשומה ב-email_mismatch.
  const onRecordGoogle = String(me.fields.googleEmail || '').trim().toLowerCase();
  const matches = (onRecord && onRecord === a.email) || (onRecordGoogle && onRecordGoogle === a.email);
  if (!matches) return { error: 'email_mismatch' };

  await firestorePatch(env, accessToken, `members/${memberId}`, {
    appleSub: a.sub, appleEmail: a.email, appleLinkedAt: new Date(),
  });
  // §582 — כרטיס מנוצל פעם אחת. (גם כשהקישור נעשה בטוקן החי – אין בו עוד צורך.)
  if (typeof ticket === 'string' && /^[0-9a-f]{48}$/.test(ticket)) {
    await firestoreDeleteDoc(env, accessToken, `appleTickets/${ticket}`).catch(() => {});
  }
  if (fromTicket) console.log('apple-attach: linked via ticket');

  // ⚠️ **רק ל-approved** — זהה לנתיב של גוגל (§403). מי שעבר את השער כבר הוכיח שליטה
  // בתיבה שעל הרשומה, כלומר בדיוק מה שנדרש כדי לקבל קוד-כניסה ולהיכנס איתו. רשומה
  // `pending` מקבלת `{ ok: true }` בלבד — שער האישור אינו נעקף.
  const canEnter = me.fields.status === 'approved';
  return canEnter
    ? { ok: true, customToken: await mintFirebaseCustomToken(env, {
        uid: memberId,
        claims: { role: 'member', isBusinessOwner: me.fields.isBusinessOwner === true },
      }) }
    : { ok: true };
}

// ── §455 — שמירת ה-refresh_token, כדי שמחיקת חשבון תוכל לבטל אותו אצל אפל ──────────────
// נקרא ע"י הלקוח **מיד** כשאפל מחזירה תשובה — בטופס ההרשמה ובמסך הכניסה, באתר ובאפליקציה.
// הקוד פג אחרי 5 דקות, ולכן אי-אפשר לחכות לשליחת הטופס (`/apple-attach`).
//
// 🔑 **הלקוח אינו ממתין לתשובה ואינו מציג אותה.** כשל כאן אינו כשל כניסה ואינו כשל הרשמה;
// הוא נרשם בלוג, ובמחיקה יופיע כ-`no_token` ביומן. אותו עיקרון של `attach`.
//
// ⚠️ **אינו יוצר ואינו משנה רשומת חבר.** כותב רק את `appleTokens/{sub}` — אוסף שאין לו
// שום `allow` ב-firestore.rules (כלומר סגור ללקוח לגמרי), לפי הכלל "כל שדה-סוד באוסף משלו".
// מסמך בלי חבר (נרשם שלא סיים) הוא יתום שאינו מזיק: הוא מחזיק הרשאה שהאדם עצמו נתן.
const APPLE_REDIRECT_OK = /^https:\/\/yellowzone\.co\.il\/[a-z-]+\.html$/;

// ── §469 — השם מאפל נשמר ברגע שמגיע, ומוחזר בכל הרשאה אחריו ─────────────────────────────
// 🔴 **הדחייה של אפל (6.10, Guideline 4):** "users are required to provide their name … after
// using Sign in with Apple". אפל מוסרת שם **רק בהרשאה הראשונה בחיים**, ועד כאן הוא חי רק
// בטופס — מי שלחץ, יצא וחזר (הבודק) קיבל טופס שדורש להקליד שם.
// 🔑 נשמר על `appleTokens/{sub}` — אותו אוסף סגור, ונמחק איתו כשההרשאה מבוטלת (ואז אפל
// תשלח את השם שוב בהרשאה הבאה). `firestorePatch` עם updateMask — אינו דורס את הטוקן.
// ⚠️ השם מגיע מהלקוח ואינו חתום — אבל רק מי שמחזיק טוקן מאומת של ה-sub הזה כותב לו.
// ⚠️ לפני בדיקת המפתח ולפני ההחלפה, במכוון: כשל בהחלפה אינו סיבה לאבד את השם.
function cleanAppleName(n) {
  if (!n || typeof n !== 'object') return null;
  const f = String(n.firstName || '').trim().slice(0, 60);
  const l = String(n.lastName || '').trim().slice(0, 60);
  return (f || l) ? { firstName: f, lastName: l } : null;
}
async function rememberAppleName(env, accessToken, sub, name) {
  try {
    const n = cleanAppleName(name);
    if (n) {
      await firestorePatch(env, accessToken, `appleTokens/${sub}`, { firstName: n.firstName, lastName: n.lastName, nameAt: new Date() });
      return n;
    }
    const d = await firestoreGetDoc(env, accessToken, `appleTokens/${sub}`);
    const f = d && d.fields;
    return f && (f.firstName || f.lastName) ? { firstName: f.firstName || '', lastName: f.lastName || '' } : null;
  } catch (e) {
    console.error('apple-name: failed', e);
    return null;
  }
}

async function handleAppleExchange({ idToken, code, redirectUri, name }, env) {
  let a;
  try { a = await verifyAppleIdToken(env, idToken); }
  catch (e) { return { error: 'invalid_apple_token' }; }
  const accessToken = await getGoogleAccessToken(env);
  const nm = await rememberAppleName(env, accessToken, a.sub, name);   // §469
  // §582 — כרטיס-זיהוי לכל תשובה (גם כשההחלפה נכשלה): הקישור בהרשמה לא תלוי בה.
  const tk = await mintAppleTicket(env, accessToken, a);
  const withName = (o) => { const x = tk ? { ...o, ticket: tk } : o; return nm ? { ...x, name: nm } : x; };
  // נבדק **אחרי** האימות, במכוון: "לא הוגדר מפתח" אינו מידע שמגיע למי שלא הוכיח זהות.
  if (!appleKeyConfigured(env)) {
    console.log('apple-exchange: skipped – apple_key_not_configured');
    return withName({ skipped: 'apple_key_not_configured' });
  }
  const ru = typeof redirectUri === 'string' && APPLE_REDIRECT_OK.test(redirectUri) ? redirectUri : '';

  const x = await exchangeAppleCode(env, a, code, ru);
  if (!x.ok) {
    // ⚠️ בלי sub ובלי מייל בשורה — ר' ההערה על [observability] ב-wrangler.toml.
    console.log('apple-exchange: failed –', x.reason, x.detail || '', 'aud=' + a.aud);
    return withName({ error: x.reason });
  }

  // ⚠️ דורס טוקן קודם של אותו אדם, במכוון: אפל מנפיקה refresh_token חדש בכל הרשאה, וביטול
  // של כל אחד מהם מבטל את ההרשאה כולה. החדש ביותר הוא הבטוח ביותר שעוד תקף.
  await firestorePatch(env, accessToken, `appleTokens/${a.sub}`, {
    refreshToken: x.refreshToken,
    clientId: x.clientId,
    updatedAt: new Date(),
  });
  console.log('apple-exchange: stored aud=' + x.clientId);
  return withName({ ok: true });
}

async function handleBusinessLogin({ accessToken: bizToken }, env) {
  if (!bizToken) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);
  // §244 — הטוקן כבר לא על מסמך העסק אלא ב-bizTokens/{businessId}, ר' bizIdFromToken.
  const bizId = await bizIdFromToken(env, accessToken, bizToken);
  if (!bizId) return { error: 'invalid_token' };
  const biz = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!biz) return { error: 'invalid_token' };

  const customToken = await mintFirebaseCustomToken(env, {
    uid: bizId,
    claims: { role: 'business_owner' },
  });

  return { customToken, ownerMemberId: biz.fields.ownerMemberId || null };
}

// ── רישום כשל-כתיבה מדשבורד העסק (§215) ─────────────────────────────────────────────────────
// למה בכלל צד-שרת: כשכתיבה של בעל-עסק נכשלת, לרוב *הוא לא יכול לכתוב כלום* (זו בדיוק התקלה),
// אז אי אפשר לרשום את השגיאה מהדפדפן שלו ל-Firestore. ה-Worker כותב עם service-account ולכן
// לא מושפע מ-firestore.rules. עד היום האבחון נשען על צילומי-מסך מבעלי עסקים — שני מקרים ביום
// אחד ("Dj & music producter" §213, "Casual tattoo" §215) עלו כך, ובשניהם קוד-השגיאה אבד.
//
// אימות: אותו accessToken של הדשבורד (בדיוק כמו handleBusinessLogin) — בלעדיו אין רישום.
// הרשומות נשמרות במערך על מסמך העסק (writeErrors), עד 20 האחרונות, בלי אוסף חדש ובלי שינוי
// rules — אותו דפוס כמו requestsHandledLog. השדות נחתכים באורך כדי שמסמך לא יתנפח מלוג.
const WRITE_ERRORS_KEEP = 20;
async function handleLogBizError({ accessToken: bizToken, action, code, message, detail }, env) {
  if (!bizToken) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);
  const bizId = await bizIdFromToken(env, accessToken, bizToken);   // §244
  if (!bizId) return { error: 'invalid_token' };
  const biz = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!biz) return { error: 'invalid_token' };

  const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
  const entry = {
    at: new Date().toISOString(),
    action: cut(action, 40) || 'unknown',       // איזו פעולה נכשלה (submitChanges/saveMedia/acceptTerms)
    code: cut(code, 60) || 'unknown',           // קוד Firebase האמיתי — זה מה שחיפשנו ולא היה
    message: cut(message, 300),
    detail: cut(detail, 300),                   // אילו שדות ניסו להישלח, מצב רשת וכו'
  };
  const prev = Array.isArray(biz.fields.writeErrors) ? biz.fields.writeErrors : [];
  await firestorePatch(env, accessToken, `businesses/${biz.id}`, {
    writeErrors: [...prev, entry].slice(-WRITE_ERRORS_KEEP),
    lastWriteErrorAt: new Date(),
  });
  return { ok: true };
}

// מחליף את הכתיבה האנונימית הישירה שהייתה קודם ב-login.html (lastCodeResendAt/loginCodeEmailStatus) —
// הרולס החדשים חוסמים כתיבה אנונימית ל-members, אז זה עובר לצד-שרת
async function handleResendCode({ phone }, env) {
  if (!phone) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);
  const candidates = phoneCandidates(phone);
  // §248 — התנאי "יש לו קוד" נבדק עכשיו מול memberCodes ולא מול השדה על מסמך החבר. בלי זה,
  // אחרי cleanup אף חבר לא היה נמצא כאן ו"שליחה חוזרת" הייתה מפסיקה לעבוד בשקט מוחלט —
  // הפונקציה מחזירה ok:true בכוונה גם כשלא נמצא, כדי לא לחשוף אילו מספרים רשומים.
  let found = null;
  for (const c of candidates) {
    const matches = await firestoreRunQuery(env, accessToken, 'members', 'phone', c);
    for (const m of matches) {
      if (m.fields.status !== 'approved') continue;
      if (!(await loginCodeFor(env, accessToken, m.id))) continue;
      found = m;
      break;
    }
    if (found) break;
  }

  // הודעה זהה בין "נמצא" ל"לא נמצא" — כמו שהיה קודם, כדי לא לחשוף אילו מספרים רשומים
  if (found) {
    const lastSent = found.fields.lastCodeResendAt ? new Date(found.fields.lastCodeResendAt) : null;
    const cooldownMs = 60 * 1000;
    if (!lastSent || Date.now() - lastSent.getTime() >= cooldownMs) {
      await firestorePatch(env, accessToken, `members/${found.id}`, {
        loginCodeEmailStatus: 'pending',
        // §306 — מבדיל בין "שכחתי קוד" לאישור ראשוני. הסריקה בוחרת לפיו את התבנית,
        // ומאפסת אותו אחרי השליחה כדי שאישור-מחדש עתידי יקבל שוב את מכתב-הפתיחה.
        loginCodeEmailKind: 'resend',
        lastCodeResendAt: new Date(),
        // §562 — כניסה חדשה לתור. בלעדיה גלאי "יצא באיחור" מדד מהאישור המקורי (לפני שבועות)
        // וכל "שכחתי קוד" של אוהד ותיק הופיע כאיחור של מאות שעות.
        loginCodeEmailQueuedAt: new Date(),
      });
    }
  }

  return { ok: true };
}

// דדופ בהרשמה (fan-register.html/business.html) — מחליף שאילתה ישירה מהקליינט על members
// לפי טלפון/מייל (חשפה PII של חברים אחרים ללא אימות). מריץ מול Firestore עם הרשאת ה-service
// account (עוקפת rules), אך מחזיר החוצה רק exists+memberId+nameMismatch — לעולם לא שדה נוסף
// (nameMismatch הוא בוליאני בלבד, לא חושף את השם הקיים בפועל).
const normName = (s) => (s || '').trim().toLowerCase();

// כל רשומות החבר עם אותו מייל (אותיות קטנות) או אחת מווריאציות הטלפון.
// משותף ל-/check-member-exists ול-/submit-member (§530) – אותה הגדרה של "אותו אדם" בשניהם.
async function findMembersByContact(env, accessToken, phone, email) {
  const matches = [];
  const emailLower = (email || '').trim().toLowerCase();
  if (emailLower) {
    matches.push(...await firestoreRunQuery(env, accessToken, 'members', 'email', emailLower));
  }
  if (phone) {
    for (const candidate of phoneCandidates(phone)) {
      matches.push(...await firestoreRunQuery(env, accessToken, 'members', 'phone', candidate));
    }
  }
  return matches;
}

// ══ §517 — **בלי memberId בתשובה.** הנתיב פתוח לכל אחד, והחזרת המזהה מיפתה כל טלפון/מייל למזהה-חבר.
// business.html כבר לא צריך אותו (הקישור בוורקר, /link-biz-owner); fan-register מסמן כפילות לפי exists,
// ומרכז הניהול מוצא את הרשומה הקיימת בעצמו; profile.html שולח excludeMemberId (המזהה שלו) ומקבל רק כן/לא.
async function handleCheckMemberExists({ phone, email, firstName, lastName, excludeMemberId }, env) {
  if (!phone && !email) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);

  // דגל ל-admin: טלפון/מייל תואמים רשומה קיימת, אך השם שהוזן שונה מהותית מהשם
  // הרשום עליה — כנראה שני אנשים שונים חולקים טלפון/מייל, לא אותו אדם שנרשם
  // שוב (fan-register.html אחרת ידרוס בשקט firstName/lastName על הרשומה הקיימת).
  const nameMismatch = (existing) =>
    !!(firstName || lastName) &&
    (normName(existing.firstName) !== normName(firstName) || normName(existing.lastName) !== normName(lastName));

  // §510 — כל ההתאמות נאספות (ולא רק הראשונה), בשביל `registered`: רשומה פעילה (לא 'rejected')
  // עם אותו מייל **או** טלפון. fan-register.html חוסם לפיו הרשמה שנייה ("כנראה כבר רשום") —
  // ורשומה שנדחתה לא תסתיר רשומה פעילה שנמצאה בשאילתה אחרת.
  // השדות האחרים — **ללא שינוי**: ההתאמה הראשונה, מייל לפני טלפון (business.html מקשר לפיה).
  // business.html **לא** חוסם לפי registered — בעל עסק רשאי להוסיף עסק שני (רמי, 12.10).
  const matches = await findMembersByContact(env, accessToken, phone, email);

  const exclude = typeof excludeMemberId === 'string' ? excludeMemberId : '';
  const others = exclude ? matches.filter((m) => m.id !== exclude) : matches;
  if (!others.length) return { exists: false, registered: false };
  const first = others[0];
  const out = {
    exists: true,
    nameMismatch: nameMismatch(first.fields),
    hasName: !!first.fields.firstName,
    hasBirthDate: !!first.fields.birthDate,
    registered: others.some(m => m.fields.status !== 'rejected'),
  };
  // §665 — איך הוא רשום (קוד/Google/Apple, מייל מוסתר, שם העסק) – רק בהתאמה חזקה (regmethod.js)
  const strong = others.find((m) => m.fields.status !== 'rejected' && isStrongMatch(m.fields, { phone, email, firstName, lastName }));
  if (strong) {
    let bizName = '';
    const bizId = strong.fields.isBusinessOwner === true ? strong.fields.linkedBusinessId : '';
    if (typeof bizId === 'string' && /^[A-Za-z0-9]{20}$/.test(bizId)) {
      try { const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`); bizName = (b && b.fields && b.fields.name) || ''; }
      catch (e) { console.warn('check-member-exists: biz name', e.message); }
    }
    out.how = describeRegistration(strong.fields, bizName);
  }
  return out;
}

// ── §462 — נתיב-גיבוי לשליחת טופס האוהד ────────────────────────────────────────────────────
// ב-4.10 נתקעה שליחה בדפדפן מובייל: כל כתיבה ל-Firestore מהדף נעצרה בלי שגיאה (Firestore
// ממתין לנצח, לא נכשל), בזמן ש-/check-member-exists עבר באותה דקה. fan-register.html שולח
// לכאן את אותה רשומה כשאין אישור מ-Firestore אחרי כמה שניות.
// 🔑 **אותו מזהה (`memberId`) שהדפדפן יצר מראש**, ויצירה רק-אם-לא-קיים: אם הכתיבה המקורית
// כבר נקלטה — מחזירים הצלחה בלי לגעת; אם היא תסונכרן אחר כך — היא כבר לא יכולה ליצור כפולה.
// ⚠️ **לא רופף יותר מ-firestore.rules** (create ציבורי: status=='pending' ובלי isAdmin), ובפועל
// מחמיר: רשימת-היתר של שדות הטופס בלבד. השרת כותב בהרשאות-מנהל, ולכן שדה שלא ברשימה
// (appleSub, googleEmail, isAdmin...) היה הופך את הנתיב הזה לדלת אחורית לזהות של אחר.
// האורכים נדיבים בכוונה: ל-rules אין גבול בכלל, וגבול הדוק מדי כאן היה הופך הצלה לכישלון.
const SUBMIT_MEMBER_STRING_FIELDS = {
  firstName: 200, lastName: 200, birthDate: 20, phone: 40, email: 254,
  fanSport: 60, verifiedSport: 60, subscriberSection: 200, subscriberTier: 60, wasSubscriber: 60,
  photoProofUrl: 2000, verifyMethod: 60, verifyTrust: 60, subscriberNumber: 100,
  seatArea: 100, seatBlock: 100, seatRow: 100, seatNumber: 100, verifyNote: 0,
  facebookUrl: 2000, instagramUrl: 2000, profileRaw: 2000, profileSource: 60,
  reviewFlag: 60, duplicateOfId: 40,
  // §485 — מקור ההרשמה (signup-source.js). בלעדיהם כל הרשמה שנפלה לגיבוי נדחית ב-bad_field.
  signupOs: 20, signupSurface: 20, signupMethod: 20,
  // §612 — ה-hash של המפתח שבמכשיר (regstatus.js). בלעדיו הרשמה שנפלה לגיבוי נדחית ב-bad_field.
  regTicketHash: 64,
};
const PROOF_URL_PREFIX = 'https://firebasestorage.googleapis.com/';

async function handleSubmitMember({ memberId, data } = {}, env) {
  if (typeof memberId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(memberId)) return { error: 'bad_member_id' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'invalid_request' };

  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'isSubscriber') {
      if (typeof v !== 'boolean') return { error: 'bad_field', field: k };
      out[k] = v;
      continue;
    }
    if (k === 'status') continue;   // נכפה למטה — לא נלקח מהדפדפן
    if (!(k in SUBMIT_MEMBER_STRING_FIELDS)) return { error: 'bad_field', field: k };
    if (v === null) { out[k] = null; continue; }
    if (typeof v !== 'string' || v.length > SUBMIT_MEMBER_STRING_FIELDS[k]) return { error: 'bad_field', field: k };
    out[k] = v;
  }
  if (!out.firstName || !out.lastName || (!out.phone && !out.email)) return { error: 'missing_fields' };
  if (out.photoProofUrl && !out.photoProofUrl.startsWith(PROOF_URL_PREFIX)) return { error: 'bad_field', field: 'photoProofUrl' };
  if (out.reviewFlag && out.reviewFlag !== 'possible_duplicate') return { error: 'bad_field', field: 'reviewFlag' };
  if (out.regTicketHash && !/^[0-9a-f]{64}$/.test(out.regTicketHash)) return { error: 'bad_field', field: 'regTicketHash' };

  const now = new Date();
  out.status = 'pending';
  out.submittedAt = now;                       // מקביל ל-serverTimestamp() בדפדפן
  if (out.reviewFlag) out.reviewFlagAt = now;
  // 🔑 סימן-מקור. גם מדידה (כמה הרשמות ניצלו דרך כאן), וגם בלם: כתיבה מאוחרת מהדפדפן
  // (setDoc בלי merge) הייתה מוחקת את השדה, ושדה שאינו ברשימת ה-update הציבורית ב-rules
  // גורם לדחייתה — כלומר היא לא יכולה לדרוס את מה שנשמר כאן.
  out.submitPath = 'worker';

  const accessToken = await getGoogleAccessToken(env);

  // §530 — אוהד לא נרשם פעמיים (§510) גם כשעוקפים את הטופס: רשומה פעילה (לא 'rejected') עם אותו
  // טלפון או מייל → לא נוצרת. הרשומה עצמה (אותו memberId, כשהכתיבה מהדפדפן כבר נקלטה) לא נספרת –
  // אחרת הגיבוי היה חוסם את ההרשמה של עצמו. מי שנדחה רשאי לנסות שוב, כמו בטופס.
  const others = (await findMembersByContact(env, accessToken, out.phone, out.email)).filter((m) => m.id !== memberId);
  if (others.some((m) => m.fields.status !== 'rejected')) {
    console.log(`submit-member: already_registered ${memberId}`);
    return { error: 'already_registered' };
  }

  const created = await firestoreCreateDocWithId(env, accessToken, 'members', memberId, out);
  console.log(`submit-member: ${created ? 'created' : 'already_exists'} ${memberId}`);
  return { ok: true, created };
}

// ── §366 — "כבר נרשמתם?" לעסקים ───────────────────────────────────────────────────────────
// §361 מנע הרשמה כפולה דרך חותם ב-localStorage. זה נכשל בבדיקה אמיתית: הגנה שיושבת בזיכרון
// הדפדפן נשברת מדפדפן אחר, ממכשיר אחר, מחלון פרטי ומאחסון מלא — וכל אלה שכיחים אצל בעל-עסק
// שמתייאש ופותח את הקישור שוב. הבדיקה עברה לשרת, בדיוק כמו שכבר קיים לאוהדים.
//
// ⚠️⚠️ **מה שהפונקציה הזאת מחזירה הוא ההחלטה החשובה ביותר בה: בוליאני בלבד.**
// הפיתוי היה להחזיר גם `bizId` ו-`accessToken`, כדי שהשליחה החוזרת תוכל לכתוב לאותו מסמך
// ולהעלות את התמונות. **זו הייתה פרצת אבטחה חמורה:**
//   • `accessToken` הוא **קוד הכניסה לדשבורד העסק**. החזרתו למי שיודע טלפון+מייל+שם הייתה
//     מחזירה בדיוק את הפרצה ש-§244 סגר (טוקן שנשלף בלי אימות), רק דרך דלת אחרת.
//   • `bizId` של עסק pending מאפשר לאורח לכתוב `photos/logo/coverPhoto/photoProofUrl` על
//     אותו עסק (firestore.rules, allow update (א)) — כלומר להחליף לעסק את התמונות.
// המחיר: בשליחה חוזרת שנתפסה **בשרת** אי אפשר להעלות תמונות. זה מחיר סביר — התמונות של
// השליחה הראשונה כבר אצלנו, ומי שנתקל בכשל-העלאה מקבל ממילא את כרטיס-המייל של §285.
//
// ── ⚠️ מפתח-ההתאמה: שם-העסק + (טלפון **או** מייל) ────────────────────────────────────────
// הגרסה הראשונה דרשה את **שלושת** השדות, מתוך חשש שהטלפון והשם של עסק מאושר מפורסמים
// באינדקס. **זה היה שגוי בפועל, ונתפס רק כי המשתמש אמר "נרשמתי עם מיילים שונים":**
//   1. **הוא לא היה תופס את המקרה שהוא נבנה בשבילו.** אחת הסיבות השכיחות למילוי הטופס
//      מחדש היא בדיוק תיקון של המייל או הטלפון שהוקלד לא נכון בפעם הראשונה — כלומר
//      דרישת-שלושה נכשלת דווקא כשהיא הכי נחוצה.
//   2. **החשש עצמו לא החזיק:** הפילטר על `pending` הוא שמנטרל אותו. עסק מאושר לעולם
//      אינו מוחזר, ולכן אי אפשר לגלות מכאן דבר על מה שמפורסם באינדקס. מה שכן אפשר
//      ללמוד הוא ביט אחד — "יש בקשה ממתינה בשם הזה" — ולשם כך צריך לדעת כבר את שם-העסק
//      המדויק וגם את הטלפון או המייל, כלומר מידע של הבעלים עצמו.
// שם-העסק נדרש תמיד; הטלפון או המייל — אחד מהם מספיק. זהה בדיוק לחותם המקומי, וזו
// גם הסיבה שהם מסכימים ביניהם במקום לתת שתי תשובות שונות על אותה שליחה.
//
// ⚠️ `status == 'pending'` בלבד. עסק שכבר אושר אינו "שליחה שנתקעה" אלא עסק קיים, ובעליו
// רשאי להוסיף עסק שני (אדיר אילן — שני עסקים על אותו טלפון ואותו מייל).
async function handleCheckBizExists({ phone, email, name }, request, env) {
  // שם-העסק הוא היחיד שחייב להגיע; די בטלפון **או** במייל לצדו.
  if (!name || (!phone && !email)) return { error: 'invalid_request' };

  // מכסת-IP: הנקודה חושפת ביט על צירוף שם+טלפון/מייל, וזה מספיק כדי להצדיק תקרה.
  const ip = clientIp(request, env);
  if (await ipIsRateLimited(env.RATE_LIMIT_KV, 'bizexists', ip)) return { error: 'too_many_attempts' };
  await ipRecordAttempt(env.RATE_LIMIT_KV, 'bizexists', ip);

  const accessToken = await getGoogleAccessToken(env);

  // ⚠️ שתי שאילתות נפרדות ולא אחת: Firestore אינו יודע OR על שני שדות שונים בשאילתה אחת,
  // והטלפון נשמר בכמה וריאציות היסטוריות (ר' phoneCandidates ב-src/phone.js) — בדיוק כמו
  // ב-handleCheckMemberExists שמעל.
  const rows = [];
  const emailLower = String(email || '').trim().toLowerCase();
  if (emailLower) {
    rows.push(...await firestoreRunQuery(env, accessToken, 'businesses', 'ownerEmail', emailLower, 20));
  }
  if (phone) {
    for (const candidate of phoneCandidates(phone)) {
      rows.push(...await firestoreRunQuery(env, accessToken, 'businesses', 'ownerPhone', candidate, 20));
    }
  }

  const norm = (v) => String(v == null ? '' : v).trim().replace(/[\s]+/g, ' ').toLowerCase();
  const wanted = norm(name);
  // ⚠️ `status === 'pending'` בלבד — ר' ההערה למעלה. זה מה שמנטרל את חשש-הדליפה.
  const match = rows.some((r) => r.fields.status === 'pending' && norm(r.fields.name) === wanted);

  return { exists: match };
}

// הגנה על עלות קריאות ה-AI/API חיצוני — מכסה נפרדת מ-isRateLimited/recordAttempt (ratelimit.js), שנועד
// ספציפית לניחוש קוד-כניסה (מפתחות phone/ip). כאן אין טלפון בכלל, רק IP, אז מכסה ייעודית פשוטה על אותו KV,
// לפי פעולה (action) כדי ש-shorten-benefit ו-suggest-fallback-images לא ישתפו מכסה ביניהם.
const IP_LIMIT = 20;
const IP_WINDOW_SEC = 15 * 60;

async function ipIsRateLimited(kv, action, ip) {
  const count = parseInt((await kv.get(`attempts:${action}-ip:${ip || 'unknown'}`)) || '0', 10);
  return count >= IP_LIMIT;
}
async function ipRecordAttempt(kv, action, ip) {
  const key = `attempts:${action}-ip:${ip || 'unknown'}`;
  const current = parseInt((await kv.get(key)) || '0', 10);
  await kv.put(key, String(current + 1), { expirationTtl: IP_WINDOW_SEC });
}

// מקבל טקסט הטבה ארוך וחופשי מבעל העסק, מחזיר כותרת מקוצרת (עד 35 תווים) שנוצרה ע"י Claude —
// לפי docs/PROJECT_CONTEXT.md (2026-07-20): המנהל רואה טקסט מקור + הצעה זה-לצד-זה ומאשר/עורך,
// בעל העסק לא רואה את השלב הזה בכלל. עדיין בשלב דמו — לא מחובר לטופסי business.html/business-dashboard.html.
async function handleShortenBenefit({ text, count }, request, env) {
  if (!text || typeof text !== 'string' || !text.trim()) return { error: 'invalid_request' };
  if (text.length > 500) return { error: 'text_too_long' };
  // count — כמה חלופות ניסוח לבקש בקריאה אחת (מסך המנהל מבקש 3 לבחירה); ברירת מחדל 1, זהה להתנהגות הקיימת
  const n = Math.max(1, Math.min(5, parseInt(count, 10) || 1));

  const ip = clientIp(request, env);
  if (await ipIsRateLimited(env.RATE_LIMIT_KV, 'shorten', ip)) return { error: 'too_many_attempts' };
  await ipRecordAttempt(env.RATE_LIMIT_KV, 'shorten', ip);

  try {
    if (n > 1) {
      const shortTitles = await shortenBenefitText(env, text.trim(), n);
      return { shortTitles };
    }
    const shortTitle = await shortenBenefitText(env, text.trim());
    return { shortTitle };
  } catch (e) {
    console.error(e);
    return { error: 'ai_failed' };
  }
}

// מקבל תגית עסק (למשל "משקפיים ואביזרי אופנה") ומחזיר 5 תמונות סטוק מ-Pexels כמועמדות לתמונת ברירת
// מחדל — לעסק שלא העלה תמונה משלו. המנהל בוחר אחת ומאשר בנפרד מ-pendingChanges (ר' docs/PROJECT_CONTEXT.md).
async function handleSuggestFallbackImages({ tag }, request, env) {
  if (!tag || typeof tag !== 'string' || !tag.trim()) return { error: 'invalid_request' };
  if (tag.length > 100) return { error: 'invalid_request' };

  const ip = clientIp(request, env);
  if (await ipIsRateLimited(env.RATE_LIMIT_KV, 'fallback-img', ip)) return { error: 'too_many_attempts' };
  await ipRecordAttempt(env.RATE_LIMIT_KV, 'fallback-img', ip);

  try {
    const options = await suggestFallbackImages(env, tag.trim());
    return { options };
  } catch (e) {
    console.error(e);
    return { error: 'image_search_failed' };
  }
}

// ריצה חד-פעמית (לא cron, לא נקרא מהאתר הציבורי) — משלימה coverPhotoThumb/logoThumb לעסקים ישנים
// שאין להם (ר' src/backfill.js לפירוט מלא). מוגן בסוד סטטי (ADMIN_BACKFILL_SECRET) כי אין כאן שכבת
// Firebase Auth/isAdmin כמו בשאר הדפים — זה נקרא ישירות (curl/כפתור זמני), לא מהקליינט הרגיל.
async function handleBackfillThumbnails(request, env) {
  const secret = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_BACKFILL_SECRET || secret !== env.ADMIN_BACKFILL_SECRET) {
    return { error: 'unauthorized' };
  }
  return await runBackfillThumbnails(env);
}

// מיגרציית §244 — אותו סוד ואותו דפוס בדיוק כמו /backfill-thumbnails מעל (ריצה ידנית ב-curl,
// לא כפתור בדשבורד ולא cron). mode חובה ומפורש — בלי ברירת-מחדל, כדי ש-cleanup לעולם לא יקרה
// בטעות: הוא זה שמוחק את הטוקן ממסמך העסק.
async function handleMigrateBizTokens(request, env) {
  const secret = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_BACKFILL_SECRET || secret !== env.ADMIN_BACKFILL_SECRET) {
    return { error: 'unauthorized' };
  }
  const { mode, dryRun, onlyId, confirm } = await request.json().catch(() => ({}));
  const MODES = ['copy', 'cleanup', 'mint-missing', 'probe', 'login-readiness',
                 'copy-member-codes', 'cleanup-member-codes', 'probe-member-code',
                 'rotate'];   // §248-249
  if (!MODES.includes(mode)) return { error: 'mode must be one of: ' + MODES.join(', ') };
  const accessToken = await getGoogleAccessToken(env);
  return await runMigrateBizTokens(env, accessToken, { mode, dryRun: !!dryRun, onlyId: onlyId || '', confirm: confirm || '' });
}

// בדיקה ידנית בלבד (curl/Postman) לוודא שצינור ה-Web Push עובד קצה-לקצה — לא כפתור בדשבורד,
// לא שולח לקהל. סוד ייעודי נפרד (לא ADMIN_BACKFILL_SECRET) כדי לא לגעת בסוד קיים של פיצ'ר אחר.
async function handleSendTestPush(request, env) {
  const secret = request.headers.get('x-admin-secret') || '';
  if (!env.PUSH_TEST_SECRET || secret !== env.PUSH_TEST_SECRET) {
    return { error: 'unauthorized' };
  }
  const { memberId, title, body, url } = await request.json();
  if (!memberId) return { error: 'missing_memberId' };

  const accessToken = await getGoogleAccessToken(env);
  const member = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  const subs = member?.fields?.pushSubscriptions || {}; // מיפוי מכשיר→מנוי (ר' home.html enablePushNotifications)
  const deviceKeys = Object.keys(subs).filter((k) => subs[k]?.endpoint);
  if (!deviceKeys.length) return { error: 'no_subscription_for_member' };

  const results = {};
  const staleKeys = [];
  for (const key of deviceKeys) {
    const result = await sendWebPush(env, subs[key], {
      title: title || 'Yellow Zone',
      body: body || 'התראת בדיקה 🔔',
      url: url || SITE_BASE,
    });
    results[key] = result;
    if (result.status === 404 || result.status === 410) staleKeys.push(key);
  }

  if (staleKeys.length) {
    const remaining = Object.fromEntries(Object.entries(subs).filter(([k]) => !staleKeys.includes(k)));
    await firestorePatch(env, accessToken, `members/${memberId}`, { pushSubscriptions: remaining });
  }
  return { sentTo: deviceKeys.length, results };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  §420 — מחיקת חשבון עצמית  (POST /delete-account)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  Google Play דורש שכל אפליקציה שבה ניתן ליצור חשבון תאפשר גם למחוק אותו — **מתוך
//  האפליקציה**, ולא דרך פנייה לתמיכה. עד §420 לא היה בפרויקט שום מסלול כזה.
//
//  🔑 **למה בוורקר ולא בדפדפן:** שלוש סיבות, וכל אחת מהן מכריעה לבדה:
//  (1) `deletionLog` פתוח לכתיבה **למנהל בלבד** (firestore.rules). פתיחתו לכל חבר הייתה
//      הופכת את יומן-הביקורת למשהו שכל אחד יכול לכתוב בו — בדיוק מה ש-§393 מזהיר ממנו
//      ("מי שיכול לשכתב אותם יכול להפוך את היומן לעדות שקרית").
//  (2) `memberCodes/{uid}` — קוד הכניסה — אינו ניתן למחיקה מהלקוח. בלעדיו הקוד שורד את
//      החשבון שנמחק.
//  (3) סימון העסק של בעל-החשבון דורש כתיבה למסמך שהמוחק אינו בעליו מבחינת החוקים.
//
//  🔑 **הסדר הוא כל העניין: רושמים, ורק אם הרישום הצליח — מוחקים.**
//  זהה לחלוטין ל-`logAndDelete` בצד הלקוח, ומאותה סיבה (§392: רשומה נעלמה ולא היתה
//  שום דרך לברר מי מחק אותה). כשל ברישום מפיל את הפונקציה — והמחיקה לא רצה.
//
//  ⚠️ **מנהל אינו יכול למחוק את עצמו מכאן.** `isAdmin()` ב-firestore.rules נשען על קיום
//  מסמך החבר עם `isAdmin===true`; מחיקתו בלחיצה אחת נועלת את המערכת בלי דרך חזרה
//  מהממשק. השחזור ביומן דורש מנהל — כלומר האדם היחיד שיכול לתקן את זה הוא זה שנמחק.
async function handleDeleteAccount({ idToken, reason }, request, env) {
  let uid;
  try { uid = await uidFromIdToken(env, idToken); }
  catch (e) { return { error: 'invalid_id_token' }; }

  const accessToken = await getGoogleAccessToken(env);
  const snap = await firestoreGetDocForSnapshot(env, accessToken, `members/${uid}`);
  if (!snap) return { error: 'member_not_found' };
  const d = snap.data;
  if (d.isAdmin === true) return { error: 'admin_cannot_self_delete' };

  const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || d.email || '(ללא שם)';
  const cleanReason = String(reason || '').trim().slice(0, 500);

  // ⚠️ בלי catch, ובכוונה — זו הנקודה ש-§393 קיים בשבילה. שדות הרשומה זהים למה
  // ש-logAndDelete כותב, כדי ששתי הדלתות יזינו יומן אחד — עם תוספת אחת:
  // `selfReason`, התשובה לשאלת "למה?" שנשאלה בחלון האישור.
  const logId = await firestoreCreateDoc(env, accessToken, 'deletionLog', {
    collectionName: 'members',
    docId: uid,
    data: d,
    label: name,
    actorUid: uid,
    actorName: name,
    actorEmail: d.email || '',
    source: 'self-delete',
    selfReason: cleanReason,
    deletedAt: new Date(),
    state: 'attempted',
    restoredAt: null,
    restoredBy: null,
  });

  await firestoreDeleteDoc(env, accessToken, `members/${uid}`);
  await firestoreDeleteDoc(env, accessToken, `memberCodes/${uid}`);

  // ── העסק שלו נשאר, ומסומן למנהל ─────────────────────────────────────────────────────
  // החלטה מוצרית: מחיקת חשבון **אישי** אינה מורידה עסק שאוהדים רואים והטבות שלהם.
  //
  // 🔑 **החיפוש הוא לפי ownerMemberId, ולא לפי linkedBusinessId שעל מסמך החבר.**
  // הקישור הדו-כיווני נמדד (§397ב): `ownerMemberId` שלם 58/58, ודווקא `linkedBusinessId`
  // ההפוך **חסר לוותיקים**. שאילתה על הצד החסר הייתה משאירה בדיוק את העסקים הוותיקים
  // בלי סימון — בלי שגיאה, ובלי שאדע על כך.
  let flaggedBusinesses = [];
  try {
    const owned = await firestoreRunQuery(env, accessToken, 'businesses', 'ownerMemberId', uid, 10);
    for (const biz of owned) {
      await firestorePatch(env, accessToken, `businesses/${biz.id}`, {
        ownerAccountDeletedAt: new Date(),
        ownerAccountDeletedName: name,
        ownerAccountDeletedReason: cleanReason,
      });
      flaggedBusinesses.push(biz.id);
    }
  } catch (e) {
    // המחיקה כבר קרתה ואי-אפשר להחזיר אותה — כאן catch הוא הנכון, בדיוק כמו ב-logActivity.
    // הכשל נרשם על הרשומה עצמה למטה, כדי שלא ייעלם בשקט.
    console.error('flag owned businesses failed:', e);
    flaggedBusinesses = null;
  }

  // ── §455 — ביטול ההרשאה אצל אפל (Guideline 5.1.1(v)) ──────────────────────────────
  // ⚠️ **אחרי המחיקה ולא לפניה, ואינו חוסם אותה:** האדם ביקש למחוק, וכשל אצל אפל אינו
  // סיבה להשאיר את הנתונים שלו אצלנו. התוצאה נרשמת ביומן בשמה — `no_token` (נרשם לפני
  // §455, או שההחלפה נכשלה), `apple_key_not_configured`, או כשל של אפל — כדי שאפשר יהיה
  // להבדיל "אין מה לבטל" מ"ניסינו ונכשלנו". ר' [[feedback_failed_read_rendered_as_fact]].
  //
  // ⚠️ **המסמך נמחק רק כשהביטול הצליח.** טוקן שלא בוטל נשאר, כדי שאפשר יהיה לנסות שוב
  // ידנית; מחיקתו הייתה הופכת כשל זמני לכשל סופי.
  let appleRevoke = 'not_apple';
  if (d.appleSub) {
    appleRevoke = await revokeAppleForSub(env, accessToken, d.appleSub);
    console.log('delete-account: apple revoke –', appleRevoke);
  }

  // ── חשבון ה-Auth עצמו ───────────────────────────────────────────────────────────────
  // מסמך החבר נמחק, אבל זהות ה-Firebase Auth שרדה — ואדם שנכנס שוב עם אותה זהות
  // מגיע למצב שבו הוא "מחובר" בלי שום רשומה. accounts:delete עם הטוקן שלו מאשר
  // את עצמו — אין כאן הרשאה חדשה.
  //
  // ⚠️ **אחרון בתור, ולא ראשון.** כשל כאן משאיר זהות יתומה — מצב שניתן לנקות.
  // מחיקתו ראשון הייתה שוללת את הטוקן שכל השאר נשען עליו.
  let authDeleted = false;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${env.FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    authDeleted = r.ok;
  } catch (e) { authDeleted = false; }

  try {
    await firestorePatch(env, accessToken, `deletionLog/${logId}`, {
      state: 'deleted',
      selfFlaggedBusinesses: flaggedBusinesses === null ? ['כשל'] : flaggedBusinesses,
      selfAuthDeleted: authDeleted,
      selfAppleRevoke: appleRevoke,
    });
  } catch (e) { console.error('deletion-log state update failed:', e); }

  return { ok: true, flaggedBusinesses: flaggedBusinesses || [], authDeleted };
}

// ── ביטול ההרשאה אצל אפל לפי `sub` — משותף למחיקה עצמית ולמחיקת מנהל ──────────────────────
// מחזיר מחרוזת-תוצאה ליומן ולא זורק: `revoked` (אומת ב-refresh שנדחה, ר' apple.js),
// `no_token`, `error`, או סיבת הכשל של אפל. המסמך נמחק **רק** כשהביטול הצליח — ר' למעלה.
async function revokeAppleForSub(env, accessToken, sub) {
  try {
    const t = await firestoreGetDoc(env, accessToken, `appleTokens/${sub}`);
    if (!t || !t.fields.refreshToken) return 'no_token';
    const r = await revokeAppleToken(env, t.fields.clientId, t.fields.refreshToken);
    if (r.ok) await firestoreDeleteDoc(env, accessToken, `appleTokens/${sub}`);
    return r.ok ? 'revoked' : (r.reason + (r.detail ? ':' + r.detail : ''));
  } catch (e) {
    console.error('apple revoke failed:', e);
    return 'error';
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  §460ח — ביטול הרשאת Apple אחרי מחיקה ע"י מנהל  (POST /admin-apple-revoke)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  מחיקת מנהל רצה בדפדפן (`deletion-log.js` → `logAndDelete`), ולכן לא נגעה באפל: הטוקן
//  נשאר ב-`appleTokens` ו-Yellow Zone נשאר ברשימה של האדם (נצפה ב-§460ו). הנתיב הזה נקרא
//  **אחרי** שהמחיקה הצליחה, ואינו חוסם אותה — אותו עיקרון כמו במחיקה העצמית.
//
//  🔑 **הקלט הוא `logId` בלבד — ה-`sub` נקרא מהצילום ביומן, לא מהדפדפן.** כך אי-אפשר לבקש
//  ביטול ל-sub שרירותי: רק למי שנמחק בפועל, ורק כשהמסמך שלו באמת כבר לא קיים.
//
//  🔑 **לא מבטלים כשרשומה חיה אחרת מחזיקה את אותו `appleSub`.** ההרשאה אצל אפל היא של
//  **האדם**, לא של הרשומה; מחיקת כפולה (המקרה הנפוץ של מחיקת מנהל) הייתה מנתקת את החשבון
//  האמיתי שלו. נרשם `kept_other_member`.
//
//  ⚠️ שחזור מהיומן מחזיר את `appleSub` לרשומה — הכניסה עם Apple ממשיכה לעבוד (אותו sub),
//  ואפל רק תשאל שוב שתף/הסתר. החלטת המשתמש (§460ח).
async function handleAdminAppleRevoke({ idToken, logId }, env) {
  try { await verifyAdminIdToken(env, idToken); }
  catch (e) { return { error: 'not_admin' }; }
  if (!logId || typeof logId !== 'string' || logId.includes('/')) return { error: 'bad_log_id' };

  const accessToken = await getGoogleAccessToken(env);
  const entry = await firestoreGetDoc(env, accessToken, `deletionLog/${logId}`);
  if (!entry) return { error: 'log_not_found' };
  const e = entry.fields;
  if (e.collectionName !== 'members' || !e.docId) return { error: 'not_member_deletion' };
  const sub = e.data && e.data.appleSub;

  let result;
  if (!sub) {
    result = 'not_apple';
  } else if (await firestoreGetDoc(env, accessToken, `members/${e.docId}`)) {
    // המחיקה לא הושלמה (או שוחזרה) — אין מה לבטל.
    result = 'member_still_exists';
  } else if ((await membersByAppleSub(env, accessToken, sub)).length > 0) {
    result = 'kept_other_member';
  } else {
    result = await revokeAppleForSub(env, accessToken, sub);
  }
  console.log('admin-apple-revoke:', logId, '–', result);

  try { await firestorePatch(env, accessToken, `deletionLog/${logId}`, { adminAppleRevoke: result }); }
  catch (err) { console.error('deletion-log adminAppleRevoke update failed:', err); }
  return { ok: true, result };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  §420ג — פוש נייטיב (הנתיב /send-native-push הוסר ב-§529; היום: /send-message, התבניות ו-/notify-conv-reply)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  🔑 **הנתיב הזה נבנה *לפני* שמבקשים מאף אחד הרשאה, וזה לא סדר שרירותי.**
//  §283 תיעד בדיוק את הכשל ההפוך: הכפתור "הפעל התראות" הוסתר מכולם כי *"אין היום שום
//  נתיב ששולח פוש לאוהדים... ולכן מי שנתן הרשאה לא מקבל כלום — וזה שורף את ההרשאה לפעם
//  הבאה שבאמת נרצה לבקש"*. בנייטיב זה חמור יותר: סירוב במערכת ההפעלה הוא **סופי**, ובקשה
//  נוספת אינה מציגה דבר. יש ירייה אחת לכל אדם, ואסור לירות בה לתוך ערוץ ריק.
//
//  ⚠️ **מאומת ב-verifyAdminIdToken ולא בסוד סטטי.** הקוד הקורא (admin-dashboard.html) הוא
//  קובץ סטטי שניתן להורדה, כלומר סוד מוטבע בו אינו סוד. אותו שיקול בדיוק כמו
//  /send-broadcast-email.
//
//  ⚠️ **בחירת הנמענים זהה ל-/send-broadcast-email במכוון** (memberIds או כל המאושרים,
//  תקרה 500). שני מסכים ששולחים "לאותו קהל" בשתי הגדרות שונות הוא בדיוק המקום שבו
//  מגלים אחרי ההשקה שחצי מהאנשים לא קיבלו.
// ── §501 — "הצוות ענה לך": מייל + פוש אחרי תשובה בשיחה ───────────────────────────────────
// התשובה עצמה כבר נכתבה ל-Firestore ע"י מרכז הניהול (זה המקור; היא מופיעה באפליקציה גם אם
// הקריאה הזאת נכשלה כולה). כאן רק ההודעה עליה, בשני ערוצים **בלתי תלויים**: כשל במייל לא מבטל
// את הפוש ולהפך, וכל ערוץ מדווח את התוצאה שלו — מסך שמראה "נשלח" כשרק אחד יצא היה משקר.
//
// 🔑 הנמען נשלף מהשיחה (memberId) ולא מהבקשה: מרכז הניהול לא אומר "למי", רק "על איזו שיחה".
// כך אי אפשר לשלוח בטעות תשובה של אדם אחד למייל של אחר.
// ⚠️ הפוש נושא את הקישור ב-data.link בלבד (native-push.js מנווט אליו בלחיצה) — **לא**
// ב-click_action, שבאנדרואיד הוא שם של intent ולא כתובת.
async function handleNotifyConvReply({ idToken, convId, text }, env) {
  if (!convId || typeof convId !== 'string' || !text) return { error: 'missing_fields' };
  try { await verifyAdminIdToken(env, idToken); }
  catch (e) { return { error: 'not_admin' }; }

  const accessToken = await getGoogleAccessToken(env);
  const conv = await firestoreGetDoc(env, accessToken, `conversations/${encodeURIComponent(convId)}`);
  if (!conv) return { error: 'conv_not_found' };
  const memberId = conv.fields && conv.fields.memberId;
  const member = memberId ? await firestoreGetDoc(env, accessToken, `members/${memberId}`) : null;
  if (!member) return { ok: true, email: 'no_member', push: 'no_member' };

  const f = member.fields || {};
  const name = String(f.firstName || '').trim();
  const out = { ok: true, email: 'no_email', push: 'no_token' };

  // ── מייל ──
  const email = String(f.email || '').trim();
  if (email) {
    try {
      await sendConversationReplyEmail(env, {
        toEmail: email, toName: name, replyText: String(text).slice(0, 2000),
        link: `https://yellowzone.co.il/open?conv=${encodeURIComponent(convId)}`,
      });
      out.email = 'sent';
    } catch (e) {
      console.error('conv reply email failed', convId, e);
      out.email = 'failed';
    }
  }

  // ── פוש (נייטיב; באייפון עדיין אין ערוץ — §457) ──
  const tokens = f.nativePushTokens || {};
  if (Object.keys(tokens).length) {
    try {
      const r = await sendFcmToMember(env, accessToken, tokens, {
        title: 'יש לך תשובה מהצוות',
        body: (name ? name + ', ' : '') + 'הצוות של Yellow Zone ענה להודעה שלך. לחצו לקריאה.',
        data: { link: `/profile.html?conv=${encodeURIComponent(convId)}` },
      });
      out.push = r.sent ? 'sent' : 'failed';
      out.pushDevices = r.sent;
      // ניקוי טוקנים מתים — רק על UNREGISTERED (אותו כלל של /send-message).
      if (r.deadKeys.length) {
        const remaining = Object.fromEntries(Object.entries(tokens).filter(([k]) => !r.deadKeys.includes(k)));
        try { await firestorePatch(env, accessToken, `members/${memberId}`, { nativePushTokens: remaining }); }
        catch (e) { console.error('conv push cleanup failed', memberId, e); }
      }
    } catch (e) {
      console.error('conv reply push failed', convId, e);
      out.push = 'failed';
    }
  }
  return out;
}

// ── §508 — "השבוע אצלך": 4 הנתונים לבעל העסק, לפי שבוע (§473יא/טז) ─────────────────────────
// 👀 חשיפות — businesses/{id}/statsDaily/{YYYY-MM-DD}.imp (§418ה) · 👆 פתיחות — אירועי bizClick ·
// 📞 פניות — bizContact (לחיצה על חיוג/וואטסאפ, לא שיחה שהתקיימה) · ❤ לבבות חדשים — heart.
// 🔑 **לכל בעל עסק — רק את שלו:** events ו-statsDaily קריאים למנהל בלבד, ולכן הסיכום כאן.
// 🔑 **לא נספרים (0+ב):** מנהלים, ובעל העסק בכרטיס של עצמו — באירועים לפי memberId. ⚠️ החשיפות
// הן מונה יומי מצטבר בלי "מי" — שם הסינון קורה בלקוח מ-§508 והלאה, ומה שנספר לפני כן נשאר.
// שבוע = ראשון עד שבת, בשעון ישראל. מוחזרים עד 26 שבועות, מהשבוע הנוכחי אחורה, עד השבוע הראשון
// שיש בו נתונים — הדפדוף בין השבועות בלקוח, בלי בקשה נוספת.
// אימות: טוקן העסק (הקישור הישיר / האפליקציה), או idToken של חבר שהוא הבעלים (כניסה כחבר, §397).
const IL_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
function ilDay(d) { return IL_DATE.format(d); }                       // 'YYYY-MM-DD' בשעון ישראל
function weekStartOf(dayStr) {                                         // ראשון של השבוע של היום הזה
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
async function handleBizWeeklyStats({ accessToken: bizToken, idToken, bizId: reqBizId }, env) {
  const accessToken = await getGoogleAccessToken(env);
  let bizId = null;
  if (bizToken) bizId = await bizIdFromToken(env, accessToken, bizToken);
  else if (idToken && reqBizId) {
    let uid = null;
    try { uid = await uidFromIdToken(env, idToken); } catch (e) { return { error: 'invalid_id_token' }; }
    const b = await firestoreGetDoc(env, accessToken, `businesses/${encodeURIComponent(reqBizId)}`);
    if (b && b.fields.ownerMemberId === uid) bizId = b.id;
  }
  if (!bizId) return { error: 'not_owner' };
  const biz = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!biz) return { error: 'not_owner' };
  const ownerId = biz.fields.ownerMemberId || '';

  const [admins, events, days] = await Promise.all([
    firestoreRunQuery(env, accessToken, 'members', 'isAdmin', true, 50),
    firestoreRunQuery(env, accessToken, 'events', 'bizId', bizId, 5000),
    firestoreListDocs(env, accessToken, `businesses/${bizId}/statsDaily`, 1000),
  ]);
  const skip = new Set(admins.map((a) => a.id));
  if (ownerId) skip.add(ownerId);

  const weeks = new Map();   // weekStart → { imp, open, contact, hearts }
  const W = (k) => { if (!weeks.has(k)) weeks.set(k, { imp: 0, open: 0, contact: 0, hearts: 0 }); return weeks.get(k); };
  const KIND = { bizClick: 'open', bizContact: 'contact', heart: 'hearts' };
  let skipped = 0;
  for (const e of events) {
    const k = KIND[e.fields.type];
    if (!k || !e.fields.createdAt) continue;
    if (e.fields.memberId && skip.has(e.fields.memberId)) { skipped++; continue; }
    W(weekStartOf(ilDay(new Date(e.fields.createdAt))))[k]++;
  }
  // ⚠️ מזהה המסמך היומי הוא תאריך UTC (home.html: toISOString) — הפרש של 2–3 שעות בחצות; זניח לשבוע.
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.id)) continue;
    W(weekStartOf(d.id)).imp += Number(d.fields.imp) || 0;
  }

  const thisWeek = weekStartOf(ilDay(new Date()));
  const first = [...weeks.keys()].sort()[0] || thisWeek;
  const out = [];
  for (let k = thisWeek, i = 0; i < 26 && k >= first; i++) {
    out.push({ start: k, ...(weeks.get(k) || { imp: 0, open: 0, contact: 0, hearts: 0 }) });
    const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); k = d.toISOString().slice(0, 10);
  }
  return { ok: true, weeks: out, impSince: [...days.map((d) => d.id)].sort()[0] || null, skipped };
}

// ── §505 — "מעדיפים לנהל מהמחשב?": הקישור הישיר נשלח למייל של הבעלים ─────────────────────
// 🔑 המייל יוצא **רק לכתובת שברשומה** (החבר הבעלים, ואם אין — ownerEmail של העסק), ולא לכתובת
// שהלקוח שולח: מי שמחזיק טוקן לא יכול להשתמש בזה כדי לשלוח את המפתח למישהו אחר.
// תקרה: 5 לשעה לעסק — כפתור שנלחץ שוב ושוב לא יציף את התיבה.
async function handleSendDashLink({ accessToken: bizToken }, env) {
  if (!bizToken || typeof bizToken !== 'string') return { error: 'missing_token' };
  const accessToken = await getGoogleAccessToken(env);
  const bizId = await bizIdFromToken(env, accessToken, bizToken);
  if (!bizId) return { error: 'invalid_token' };
  const rlKey = 'dashlink:' + bizId;
  const n = parseInt((await env.RATE_LIMIT_KV.get(rlKey)) || '0', 10);
  if (n >= 5) return { error: 'rate_limited' };
  await env.RATE_LIMIT_KV.put(rlKey, String(n + 1), { expirationTtl: 3600 });
  const biz = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!biz) return { error: 'invalid_token' };
  const bf = biz.fields || {};
  const owner = bf.ownerMemberId ? await firestoreGetDoc(env, accessToken, `members/${bf.ownerMemberId}`) : null;
  const of = (owner && owner.fields) || {};
  const toEmail = String(of.email || bf.ownerEmail || '').trim();
  if (!toEmail) return { error: 'no_email' };
  await sendDashboardLinkEmail(env, {
    toEmail, toName: String(of.firstName || bf.ownerFirst || '').trim(), businessName: String(bf.name || ''),
    link: `https://yellowzone.co.il/business-dashboard.html?token=${encodeURIComponent(bizToken)}`,
  });
  // הכתובת מוסתרת חלקית — הלקוח רק צריך לדעת לאן לחפש.
  const [u, d] = toEmail.split('@');
  return { ok: true, sentTo: (u.length > 2 ? u.slice(0, 2) : u.slice(0, 1)) + '•••@' + d };
}

// §501 — קישור הפוש הידני → נתיב יחסי ב-data.link (native-push.js מנווט אליו בלחיצה).
// 🔴 **עד §501 הקישור נשלח ב-click_action**, שבאנדרואיד הוא *שם של intent* ולא כתובת — כלומר
// לחיצה על פוש עם קישור לא פתחה אותו. כתובת שלנו (yellowzone.co.il) הופכת לנתיב; קישור חיצוני
// **לא נשלח** (native-push.js מסרב לנווט החוצה מתוך האפליקציה) ומדווח בתשובה, כדי שהמנהל ידע.
function pushLinkPath(link) {
  const s = String(link || '').trim();
  if (!s) return { path: '' };
  if (s.charAt(0) === '/' && s.charAt(1) !== '/') return { path: s };
  try {
    const u = new URL(s);
    if (/^(www\.)?yellowzone\.co\.il$/.test(u.hostname)) return { path: (u.pathname || '/') + u.search };
  } catch (e) {}
  return { path: '', dropped: s };
}

// שידור מייל — לכל בעלי העסקים/אוהדים המאושרים כברירת מחדל, או לרשימת מזהים ספציפית שהמנהל בחר
// (מרכז הודעות, admin-dashboard.html — בורר-קהל מבוסס selectedBizIds/selectedFanIds
// הקיימים כבר ב"כל העסקים"/"כל האוהדים"). נקרא ישירות מדפדפן, לא curl בלבד, ולכן מאומת בפועל דרך
// verifyAdminIdToken (לא סוד סטטי — ר' PROJECT_CONTEXT.md). לולאה סדרתית מכוונת (לא batched) —
// מספיק ליחס הנוכחי (עשרות נמענים, לא מאות).
async function handleSendBroadcastEmail({ idToken, subject, body, audienceType, businessIds, memberIds, testEmail, personal }, env) {
  if (!subject || !body) return { error: 'missing_fields' };
  try {
    await verifyAdminIdToken(env, idToken);
  } catch (e) {
    return { error: 'unauthorized' };
  }

  // מייל בדיקה עצמי (§8 במפרט, מרכז ההודעות) — נמען יחיד, כתובת גולמית שלא בהכרח קיימת ב-Firestore
  // (אין רשומת businesses/members אמיתית לחפש), אז ערכי-placeholder לדוגמה בלבד, לא נתוני-אמת.
  if (testEmail) {
    const isFansTest = audienceType === 'fans';
    // §444 — בלוק {login} במצב שנגזר מכתובת הבדיקה עצמה, כדי שמייל הבדיקה יראה כמו המכתב האמיתי.
    const loginTestVars = { login_mode: loginModeFor({ email: testEmail }), login_account: testEmail };
    const vars = isFansTest
      ? { name: 'ישראל ישראלי', code: '123456', link: `${SITE_BASE}download?src=broadcast`, ...loginTestVars }
      : { name: 'ישראל ישראלי', business: 'עסק לדוגמה', link: `${SITE_BASE}business-dashboard.html?token=demo`, ...loginTestVars };
    try {
      await sendBroadcastEmail(env, { toEmail: testEmail, toName: 'בדיקה', subject: `[בדיקה] ${subject}`, body, vars, personal: personal === true });   // §560
      return { results: [{ id: 'test', name: testEmail, email: testEmail, status: 'sent' }], isTest: true };
    } catch (e) {
      return { results: [{ id: 'test', name: testEmail, email: testEmail, status: 'failed', error: String(e).slice(0, 300) }], isTest: true };
    }
  }

  const accessToken = await getGoogleAccessToken(env);
  const isFans = audienceType === 'fans';
  let recipients;
  if (isFans) {
    if (Array.isArray(memberIds) && memberIds.length) {
      const docs = await Promise.all(memberIds.map((id) => firestoreGetDoc(env, accessToken, `members/${id}`)));
      recipients = docs.filter(Boolean);
    } else {
      recipients = await firestoreRunQuery(env, accessToken, 'members', 'status', 'approved', 500);
    }
  } else if (Array.isArray(businessIds) && businessIds.length) {
    const docs = await Promise.all(businessIds.map((id) => firestoreGetDoc(env, accessToken, `businesses/${id}`)));
    recipients = docs.filter(Boolean);
  } else {
    recipients = await firestoreRunQuery(env, accessToken, 'businesses', 'status', 'approved', 500);
  }

  const results = [];
  for (const r of recipients) {
    const email = isFans ? r.fields.email : r.fields.ownerEmail;
    const name = isFans ? r.fields.firstName : r.fields.name;
    if (!email) {
      results.push({ id: r.id, name, status: 'failed', error: 'no_email' });
      continue;
    }
    try {
      const vars = isFans
        ? { name: r.fields.firstName || '', code: await loginCodeFor(env, accessToken, r.id), link: `${SITE_BASE}download?src=broadcast` }   // §248; §499 — לאפליקציה (home.html סגור לאוהדים בדפדפן מאז §497)
        : { name: r.fields.ownerFirst || '', business: r.fields.name || '', link: `${SITE_BASE}business-dashboard.html?token=${await bizTokenFor(env, accessToken, r.id)}` };   // §244
      await sendBroadcastEmail(env, { toEmail: email, toName: isFans ? (r.fields.firstName || '') : (r.fields.ownerFirst || ''), subject, body, vars });
      results.push({ id: r.id, name, email, status: 'sent' });
    } catch (e) {
      results.push({ id: r.id, name, email, status: 'failed', error: String(e).slice(0, 300) });
    }
  }
  return { results };
}

// ══ §522 — "שליחה עכשיו" החדשה: הודעה אחת, כמה ערוצים, בבקשה אחת (§504) ══════════════════════
// החליף את /send-area-update + /send-native-push (הוסרו ב-§529) ואת /send-broadcast-email ב"שליחה עכשיו"
// (הישנים נשארים – התבניות והשיחות עדיין משתמשות בחלק מהם).
//
// 🔑 **מרכז הניהול שולח בחבילות קטנות (MSG_CHUNK) ולא את כל הקהל בבקשה אחת.** לכל נמען עד ~5
// קריאות-משנה (המסמך, בעלים, קוד/טוקן, Brevo, FCM), וחבילה של 8 נשארת מתחת ל-50 גם בתוכנית
// החינמית. הדף מציג התקדמות, וכשל בחבילה אחת לא מפיל את האחרות.
// 🔑 **הוורקר שולח ומחזיר תוצאה לכל נמען – ולא רושם.** הרישום (שורת הנמען, היומן בכרטיס, חותמת
// המייל של §415) נכתב מהדפדפן ב-writeBatch, כמו השידור הישן – אותו נימוק של תקרת הקריאות.
//
// recipients: [{ t: 'm' | 'b', id }] — 'b' = עסק; ההודעה באפליקציה/בפוש הולכת לבעלים (ownerMemberId),
//   המייל – ל-ownerEmail של העסק (כמו השידור הישן). מרכז הניהול כבר איחד בעלים כפולים.
// block: members (לכל האוהדים) · personal (אוהדים נבחרים) · allBiz · myBiz (עם bizId/bizName).
// פוש **רק יחד עם app** (§504ו) – הוא ה"צלצול" של הפריט, ו-data.link פותח **את הפריט עצמו** ב"הודעות" (§523).
// mail.scope: 'all' | 'missing' — 'missing' = רק מי שלא קיבל באפליקציה (§504ז).
const MSG_CHUNK = 8;
const MSG_BLOCKS = ['members', 'personal', 'allBiz', 'myBiz'];
async function handleSendMessage({ idToken, messageId, block, recipients, app, push, mail }, env) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(String(messageId || ''))) return { error: 'bad_message_id' };
  if (!MSG_BLOCKS.includes(block)) return { error: 'bad_block' };
  if (!Array.isArray(recipients) || !recipients.length) return { error: 'no_recipients' };
  if (recipients.length > MSG_CHUNK) return { error: 'chunk_too_big' };
  const A = app && String(app.title || '').trim() && String(app.text || '').trim()
    ? { title: String(app.title).trim().slice(0, 80), text: String(app.text).trim().slice(0, 1500), link: pushLinkPath(app.link) } : null;
  const P = A && push && String(push.title || '').trim() && String(push.body || '').trim()
    ? { title: String(push.title).trim().slice(0, 60), body: String(push.body).trim().slice(0, 160) } : null;
  const M = mail && String(mail.subject || '').trim() && String(mail.body || '').trim()
    ? { subject: String(mail.subject).trim().slice(0, 150), body: String(mail.body), scope: mail.scope === 'missing' ? 'missing' : 'all', personal: mail.personal === true } : null;   // §560 personal = "מכתב אישי"
  if (push && !A) return { error: 'push_needs_app' };
  if (!A && !M) return { error: 'no_channel' };
  try { await verifyAdminIdToken(env, idToken); }
  catch (e) { return { error: 'not_admin' }; }

  const accessToken = await getGoogleAccessToken(env);
  const sentAt = new Date();
  // 1) המסמכים – אוהד: הרשומה; עסק: העסק + רשומת הבעלים (שם הטוקנים והתיבה)
  const rows = await Promise.all(recipients.filter((r) => r && (r.t === 'm' || r.t === 'b') && typeof r.id === 'string' && r.id)
    .map(async (r) => {
      if (r.t === 'm') {
        const m = await firestoreGetDoc(env, accessToken, `members/${encodeURIComponent(r.id)}`);
        return { r, member: m, biz: null };
      }
      const b = await firestoreGetDoc(env, accessToken, `businesses/${encodeURIComponent(r.id)}`);
      const ownerId = b && b.fields && b.fields.ownerMemberId;
      const m = ownerId ? await firestoreGetDoc(env, accessToken, `members/${encodeURIComponent(ownerId)}`) : null;
      return { r, member: m, biz: b };
    }));

  const out = rows.map(({ r, member, biz }) => {
    const mf = (member && member.fields) || {}, bf = (biz && biz.fields) || {};
    const gone = r.t === 'm' ? !member : !biz;
    // באפליקציה: רק לרשומת חבר מאושרת (כמו "עדכון לאזור"); עסק – גם העסק מאושר.
    const appOk = !gone && !!member && mf.status === 'approved' && (r.t === 'm' || bf.status === 'approved');
    return {
      id: r.id, t: r.t, memberId: member ? member.id : null, gone,
      name: r.t === 'm' ? `${mf.firstName || ''} ${mf.lastName || ''}`.trim() : String(bf.name || ''),
      email: r.t === 'm' ? (mf.email || '') : (bf.ownerEmail || ''),
      appOk, tokens: appOk ? (mf.nativePushTokens || {}) : {}, mf, bf,
      app: A ? (appOk ? 'pending' : 'none') : null, push: P ? 'none' : null, mail: M ? 'none' : null,
    };
  });

  // 2) באפליקציה – פריט אחד לכל נמען, באותו מזהה של ההודעה (הפוש מפנה אליו)
  if (A) {
    const docs = out.filter((o) => o.app === 'pending').map((o) => ({
      path: `members/${o.memberId}/inbox/${messageId}`,
      fields: {
        kind: 'update', block, title: A.title, text: A.text, link: A.link.path || '',
        bizId: block === 'myBiz' && o.t === 'b' ? o.id : null,
        bizName: block === 'myBiz' && o.t === 'b' ? String(o.bf.name || '') : null,
        pushed: !!P, sentAt, readAt: null,
      },
    }));
    let ok = true;
    if (docs.length) {
      try { await firestoreBatchCreate(env, accessToken, docs); }
      catch (e) { console.error('message inbox write failed', e); ok = false; }
    }
    out.forEach((o) => { if (o.app === 'pending') o.app = ok ? 'written' : 'failed'; });
  }

  // 3) פוש – רק למי שהפריט נכתב אצלו
  if (P) {
    for (const o of out) {
      if (o.app !== 'written') continue;
      if (!Object.keys(o.tokens).length) { o.push = 'noToken'; continue; }
      const res = await sendFcmToMember(env, accessToken, o.tokens, { title: P.title, body: P.body, data: { link: `/profile.html?tab=msgs&item=${messageId}` } });
      o.push = res.sent ? 'sent' : 'failed';
      o.pushDevices = res.sent;
      if (res.deadKeys.length) {
        const remaining = Object.fromEntries(Object.entries(o.tokens).filter(([k]) => !res.deadKeys.includes(k)));
        await firestorePatch(env, accessToken, `members/${o.memberId}`, { nativePushTokens: remaining })
          .catch((e) => console.error('native push cleanup failed for', o.memberId, e));
      }
    }
  }

  // 4) מייל – כמו השידור הישן (אותם משתנים, תג broadcast), עם הגבלת "רק מי שלא קיבל באפליקציה"
  if (M) {
    for (const o of out) {
      if (o.gone) continue;
      if (M.scope === 'missing' && o.app === 'written') { o.mail = 'skipped'; continue; }
      if (!o.email) { o.mail = 'noEmail'; continue; }
      try {
        const vars = o.t === 'm'
          ? { name: o.mf.firstName || '', code: await loginCodeFor(env, accessToken, o.id), link: `${SITE_BASE}download?src=broadcast` }
          : { name: o.bf.ownerFirst || '', business: o.bf.name || '', link: `${SITE_BASE}business-dashboard.html?token=${await bizTokenFor(env, accessToken, o.id)}` };
        const r = await sendBroadcastEmail(env, { toEmail: o.email, toName: vars.name, subject: M.subject, body: M.body, vars, msgTag: 'msg_' + messageId, personal: M.personal });
        o.mail = 'sent';
        if (r && r.messageId) o.mailId = String(r.messageId);
      } catch (e) {
        o.mail = 'failed';
        o.mailError = String((e && e.message) || e).slice(0, 200);
      }
    }
  }

  return {
    ok: true,
    results: out.map(({ id, t, memberId, gone, name, email, app, push, pushDevices, mail, mailId, mailError }) =>
      ({ id, t, memberId, gone, name, email, app, push, pushDevices, mail, mailId, mailError })),
  };
}

// כשחבר הוא גם בעל עסק שממתין לאותו מייל אישור — נשלח מייל אחד מאוחד (קוד כניסה + קישור לדשבורד)
// במקום שני מיילים נפרדים. אם רק צד אחד ממתין (למשל בעל עסק שכבר יש לו קוד מוקדם יותר), נשלח בנפרד כרגיל.
//
// MAX_SWEEP_RECIPIENTS — תקרה על כמות הנמענים המטופלים בהרצת-cron בודדת (רץ כל דקה, ר' wrangler.toml
// [triggers]). בלי תקרה, אישור-המוני של הרבה עסקים/חברים בבת-אחת (למשל 46 עסקים בישיבה אחת) עלול
// לגרום להרצה בודדת לבצע מאות קריאות-משנה (עד ~4 ל-Firestore+Brevo לכל נמען) — חוצה את מכסת
// ה-subrequests של Cloudflare Workers (50 בתוכנית חינמית להרצה) ומפיל את ההרצה באמצע, עם נמענים
// שנשארים 'failed' לצמיתות בלי ניסיון-חוזר אוטומטי. עם התקרה, השאר פשוט נשארים 'pending' ומטופלים
// בהרצת-הדקה הבאה — תור גדול מתרוקן תוך כמה דקות, בלי סיכון למכסה בשום תוכנית.
// §526 — ירד מ-10 ל-6: לכל נמען נוספו עד 3 קריאות (פריט באפליקציה, פוש, שורת סטטיסטיקה). 6 בדקה עדיין
// מרוקן אישור של 46 עסקים בפחות מ-8 דקות.
const MAX_SWEEP_RECIPIENTS = 6;

// BIZ_SEND_GRACE_MS — כמה זמן להמתין אחרי אישור עסק לפני שמותר לשלוח לו מייל-עסק *בודד*.
// אישור עסק במרכז הניהול כותב את מסמך העסק ואת מסמך החבר המקושר; מאז 18.8 זו כתיבה אטומית אחת
// (writeBatch), אבל אישור מגרסת-דף ישנה שנשארה פתוחה בטאב, או תיקון ידני של שדה בודד, עדיין
// יכולים לייצר פער. דקת-חסד מבטיחה שהעסק ייבחן שוב רק כשמצב החבר יציב — ואז לולאת-החברים או
// רשת-ביטחון ב' למטה שולחות את המייל המאוחד במקום מייל-עסק קצר לבדו.
const BIZ_SEND_GRACE_MS = 60 * 1000;

// §444 — מצב בלוק הכניסה `{login}` במייל (mail-format.js → loginBlockHtml).
// ⚠️ **רק לרשומה מאושרת** — אותו תנאי-אמת של §391/§415: ל-pending הכניסה מחזירה "ממתין
// לאישור", כלומר המכתב היה מבטיח דלת נעולה. mode ריק = הבלוק לא מוצג.
function memberLoginFor(fields) {
  if (!fields || fields.status !== 'approved') return null;
  return {
    mode: loginModeFor({ email: fields.email, googleEmail: fields.googleEmail, appleSub: fields.appleSub }),   // §465
    account: fields.googleEmail || fields.email || '',
  };
}

// ══ §526 — התבניות הקבועות באותה זרימה (§504ג, שלב 5) ══════════════════════════════════════════
// לכל תבנית אוטומטית, מעבר למייל: "התראה באפליקציה" ופוש (settings/messageTemplates:
// <id>App = { on, title, text, link } · <id>Push = { on, title, body }), ושורה לכל שליחה ב-
// messages/tpl_<id>/recipients/<rowId> – ממנה מרכז הניהול מציג "ב-30 הימים האחרונים".
// 🔑 **רץ אחרי שהמייל יצא, ולא זורק אף פעם.** המייל הוא העיקר (בו הקוד/הקישור); כשל באפליקציה,
//   בפוש או בשורה לא יסמן אותו 'failed' ולא יחזיר אותו לתור (= מייל כפול).
// 🔑 **מזהה השורה = מזהה מי שהמייל נשלח לכתובת שלו** (חבר ב-login/resend/combined, עסק ב-biz):
//   ה-webhook מתאים לפי כתובת ומעדכן רק שורה קיימת (תג msg_tpl_<id>, ר' brevo-webhook.js §524).
//   שליחה חוזרת לאותו אדם דורסת את השורה – "מה קרה בפעם האחרונה" – ומאפסת את נתוני המסירה הישנים.
// מי יכול לקבל מה: שכחתי-קוד = לא מחובר → רק מייל. §526ב – פוש פתוח גם ב-login (רמי, 14.10): אוהד חדש לרוב
// עוד בלי טוקן (push=noToken), אבל שליחה חוזרת למי שכבר באפליקציה כן מגיעה – ושתי התבניות מתנהגות אותו דבר.
const TPL_APP_OK = { login: true, resend: false, biz: true, combined: true };
const TPL_PUSH_OK = { login: true, resend: false, biz: true, combined: true };
export function tplExtras(templates, id) {
  const a = templates[id + 'App'], p = templates[id + 'Push'];
  const A = TPL_APP_OK[id] && a && a.on === true && String(a.title || '').trim() && String(a.text || '').trim()
    ? { title: String(a.title).trim().slice(0, 80), text: String(a.text).trim().slice(0, 1500), link: pushLinkPath(a.link).path || '' } : null;
  const P = A && TPL_PUSH_OK[id] && p && p.on === true && String(p.title || '').trim() && String(p.body || '').trim()
    ? { title: String(p.title).trim().slice(0, 60), body: String(p.body).trim().slice(0, 160) } : null;
  return { A, P };
}
const tplFill = (str, v) => String(str || '').replace(/\{(name|business)\}/g, (m, k) => v[k] || '');
export async function tplDeliver(env, accessToken, templates, { id, rowId, t, member, biz, email, name, mail, mailId = null, mailError = null }) {
  const msgId = 'tpl_' + id;
  const row = {
    id: rowId, t, memberId: member ? member.id : null, name: name || '', email: email || '', tpl: id,
    mail, mailId: mailId ? String(mailId) : null, mailError: mailError ? String(mailError).slice(0, 200) : null,
    app: null, push: null, pushDevices: 0, sentAt: new Date(),
    mailDelivery: null, mailDeliveryAt: null, mailDeliveryReason: null, mailOpenedAt: null, mailClickedAt: null,
  };
  try {
    const { A, P } = mail === 'sent' ? tplExtras(templates, id) : { A: null, P: null };
    const mf = (member && member.fields) || {};
    if (A) {
      row.app = 'none';
      // רק לרשומת חבר מאושרת (ובעסק – גם העסק מאושר), כמו handleSendMessage
      if (member && mf.status === 'approved' && (!biz || biz.fields.status === 'approved')) {
        const v = { name: mf.firstName || '', business: biz ? (biz.fields.name || '') : '' };
        try {
          await firestorePatch(env, accessToken, `members/${member.id}/inbox/${msgId}`, {
            kind: 'update', block: biz ? 'myBiz' : 'personal',
            title: tplFill(A.title, v).slice(0, 80), text: tplFill(A.text, v).slice(0, 1500), link: A.link,
            bizId: biz ? biz.id : null, bizName: biz ? String(biz.fields.name || '') : null,
            pushed: !!P, sentAt: new Date(), readAt: null, clickedAt: null, pushOpenedAt: null, tpl: id,
          });
          row.app = 'written';
        } catch (e) { console.error('tpl inbox write failed', id, rowId, e); row.app = 'failed'; }
      }
    }
    if (P) {
      row.push = 'none';
      if (row.app === 'written') {
        const tokens = mf.nativePushTokens || {};
        if (!Object.keys(tokens).length) row.push = 'noToken';
        else {
          const res = await sendFcmToMember(env, accessToken, tokens, { title: P.title, body: P.body, data: { link: `/profile.html?tab=msgs&item=${msgId}` } });
          row.push = res.sent ? 'sent' : 'failed';
          row.pushDevices = res.sent || 0;
          if (res.deadKeys && res.deadKeys.length) {
            const remaining = Object.fromEntries(Object.entries(tokens).filter(([k]) => !res.deadKeys.includes(k)));
            await firestorePatch(env, accessToken, `members/${member.id}`, { nativePushTokens: remaining })
              .catch((e) => console.error('native push cleanup failed for', member.id, e));
          }
        }
      }
    }
  } catch (e) { console.error('tpl extras failed', id, rowId, e); }
  try { await firestorePatch(env, accessToken, `messages/${msgId}/recipients/${rowId}`, row); }
  catch (e) { console.error('tpl stats row failed', id, rowId, e); }
  return row;
}
const tplName = (f) => `${(f && f.firstName) || ''} ${(f && f.lastName) || ''}`.trim();

async function runEmailSweeps(env) {
  const accessToken = await getGoogleAccessToken(env);
  const templatesDoc = await firestoreGetDoc(env, accessToken, 'settings/messageTemplates');
  const templates = templatesDoc?.fields || {};
  const pendingMembers = await firestoreRunQuery(env, accessToken, 'members', 'loginCodeEmailStatus', 'pending');
  const handledBusinessIds = new Set();
  let processed = 0;

  for (const m of pendingMembers) {
    if (processed >= MAX_SWEEP_RECIPIENTS) break;
    // §517 — רק חבר מאושר שיש לו קוד. בלי זה כל אחד יכול היה ליצור רשומה עם
    // loginCodeEmailStatus:'pending' ומייל של מישהו אחר – והסריקה שולחת (ממסר ספאם בשם האתר,
    // ומרעיב את המיילים האמיתיים: 10 לדקה). הרשומה מסומנת ולא נשארת בתור לנצח.
    if (m.fields.status !== 'approved') {
      await firestorePatch(env, accessToken, `members/${m.id}`, { loginCodeEmailStatus: 'skipped', loginCodeEmailError: 'not_approved' });
      continue;
    }
    // מאושר בלי קוד (עדיין) – לא שולחים מייל עם קוד ריק; נשאר בתור לסבב הבא (באישור הקוד נשמר לפני הדגל).
    if (!(await loginCodeFor(env, accessToken, m.id))) continue;
    processed++;
    let att = null;   // §526 — מה ניסינו לשלוח, לשורת הסטטיסטיקה גם כשנכשל
    try {
      let business = null;
      if (m.fields.isBusinessOwner === true && m.fields.linkedBusinessId) {
        const biz = await firestoreGetDoc(env, accessToken, `businesses/${m.fields.linkedBusinessId}`);
        // §517 — וגם עסק מאושר שהחבר הזה הוא באמת הבעלים שלו (linkedBusinessId לבד ניתן לכתיבה בהרשמה).
        if (biz && biz.fields.ownerEmailStatus === 'pending' && biz.fields.status === 'approved' &&
            biz.fields.ownerMemberId === m.id) business = biz;
      }

      if (business) {
        att = { id: 'combined', rowId: m.id, t: 'm', member: m, biz: business, email: m.fields.email, name: tplName(m.fields) };
        const sent = await sendCombinedWelcomeEmail(env, {
          msgTag: 'msg_tpl_combined',
          toEmail: m.fields.email,
          toName: m.fields.firstName,
          code: await loginCodeFor(env, accessToken, m.id),   // §248
          businessName: business.fields.name,
          dashboardLink: `${SITE_BASE}business-dashboard.html?token=${await bizTokenFor(env, accessToken, business.id)}`,   // §244
          tpl: { subject: templates.combinedSubject, body: templates.combinedBody },
          login: memberLoginFor(m.fields),   // §444
        });
        await firestorePatch(env, accessToken, `members/${m.id}`, {
          loginCodeEmailStatus: 'sent',
          loginCodeEmailSentAt: new Date(),
        });
        await firestorePatch(env, accessToken, `businesses/${business.id}`, {
          ownerEmailStatus: 'sent',
          ownerEmailSentAt: new Date(),
          welcomeEmailKind: 'combined',
        });
        handledBusinessIds.add(business.id);
        await tplDeliver(env, accessToken, templates, { ...att, mail: 'sent', mailId: sent && sent.messageId });
      } else {
        // §306 — שני מכתבים נפרדים: אישור ראשוני מול "שכחתי קוד". נפילה-לאחור לתבנית
        // הראשית אם השדות החדשים עוד לא נשמרו ב-Firestore (מסמך התבניות נערך ידנית).
        const isResend = m.fields.loginCodeEmailKind === 'resend';
        const loginTpl = isResend
          ? { subject: templates.resendSubject || templates.loginSubject, body: templates.resendBody || templates.loginBody }
          : { subject: templates.loginSubject, body: templates.loginBody };
        att = { id: isResend ? 'resend' : 'login', rowId: m.id, t: 'm', member: m, biz: null, email: m.fields.email, name: tplName(m.fields) };
        const sent = await sendLoginCodeEmail(env, {
          msgTag: 'msg_tpl_' + att.id,
          toEmail: m.fields.email,
          toName: m.fields.firstName,
          code: await loginCodeFor(env, accessToken, m.id),   // §248
          tpl: loginTpl,
          kind: isResend ? 'resend' : 'welcome',
          login: memberLoginFor(m.fields),   // §444 — גם ב'שכחתי קוד'; התבנית קובעת אם להציג
        });
        await firestorePatch(env, accessToken, `members/${m.id}`, {
          loginCodeEmailStatus: 'sent',
          loginCodeEmailSentAt: new Date(),
          loginCodeEmailKind: null,
        });
        await tplDeliver(env, accessToken, templates, { ...att, mail: 'sent', mailId: sent && sent.messageId });
      }
    } catch (e) {
      await firestorePatch(env, accessToken, `members/${m.id}`, {
        loginCodeEmailStatus: 'failed',
        loginCodeEmailError: String(e).slice(0, 500),
      });
      if (att) await tplDeliver(env, accessToken, templates, { ...att, mail: 'failed', mailError: String(e) });
    }
  }

  // עסקים שנשארו ממתינים בלי שהמייל שלהם טופל למעלה (למשל אושרו אחרי שהחבר כבר קיבל קוד כניסה בעבר)
  const pendingBiz = await firestoreRunQuery(env, accessToken, 'businesses', 'ownerEmailStatus', 'pending');
  for (const b of pendingBiz) {
    if (handledBusinessIds.has(b.id)) continue;
    if (processed >= MAX_SWEEP_RECIPIENTS) break;
    // §517 — רק עסק שאושר בפועל. עד כאן עסק pending (שכל אחד יוצר, עם כל ownerEmail) קיבל
    // "ברוכים הבאים" עם קישור לדשבורד – לכתובת שהיוצר בחר.
    if (b.fields.status !== 'approved' || !b.fields.approvedAt) {
      await firestorePatch(env, accessToken, `businesses/${b.id}`, { ownerEmailStatus: 'skipped', ownerEmailError: 'not_approved' });
      continue;
    }

    // ── רשת-ביטחון א': חלון-חסד אחרי האישור ──────────────────────────────────────────────────
    // הלולאה הזו רואה מצב-עולם *מאוחר* מזה של לולאת-החברים למעלה (השאילתה שלה רצה עד ~40 שניות
    // אחריה). עסק שאושר בין שתי השאילתות נמצא כאן כממתין, בזמן שהחבר המקושר שלו עוד לא היה
    // ממתין למעלה — ואז יוצא מייל-עסק קצר לבדו, והחבר מקבל מייל קוד-כניסה נפרד בדקה הבאה,
    // במקום מכתב-הפתיחה המאוחד שכל השאר מקבלים. באג-אמת: Kaneti insurance (17.8) ובני שליחויות
    // (16.8). דילוג של דקה על עסק טרי מחזיר אותו ללולאת-החברים בסריקה הבאה, שם הוא נשלח מאוחד.
    const approvedAtMs = b.fields.approvedAt ? Date.parse(b.fields.approvedAt) : 0;
    if (approvedAtMs && Date.now() - approvedAtMs < BIZ_SEND_GRACE_MS) continue;

    processed++;
    let att = null;   // §526
    try {
      const ownerName = `${b.fields.ownerFirst || ''} ${b.fields.ownerLast || ''}`.trim();
      const dashboardLink = `${SITE_BASE}business-dashboard.html?token=${await bizTokenFor(env, accessToken, b.id)}`;   // §244

      // ── רשת-ביטחון ב': בדיקה חיה של החבר המקושר ─────────────────────────────────────────────
      // גם אחרי חלון-החסד, ה-snapshot של לולאת-החברים כבר לא מעודכן. קריאה נקודתית אחת כאן
      // (לא שאילתה) אומרת בוודאות מה מצב החבר — ואם יש לו קוד כניסה, זה בדיוק המקרה של המייל
      // המאוחד, גם אם הגענו אליו מהצד של העסק ולא מהצד של החבר.
      //
      // ⚠️ עד 22.8 התנאי דרש גם loginCodeEmailStatus==='pending', ולכן **כל שליחה חוזרת לעסק**
      // (שמחזירה ל-pending רק את מסמך העסק) נפלה למייל-העסק הקצר למטה: בעל העסק קיבל מייל
      // *פחות* טוב מזה שכבר קיבל — בלי קוד הכניסה ובלי "מה לעשות עכשיו". באג-אמת "לארט
      // אופנועים" (20.8), וזה קרה לעוד בעלי עסקים. הכלל עכשיו: בעל עסק שיש לו קוד כניסה מקבל
      // תמיד את מכתב-הפתיחה המאוחד, ומייל-העסק הקצר נשאר רק למי שאין מאחוריו רשומת-חבר.
      const ownerMemberId = b.fields.ownerMemberId || null;
      const owner = ownerMemberId ? await firestoreGetDoc(env, accessToken, `members/${ownerMemberId}`) : null;
      // §248 — הקוד נשלף מ-memberCodes ולא מהשדה על מסמך החבר. קריטי כאן: הקוד הזה הוא **התנאי**
      // לבחירה בין המכתב המאוחד למייל-העסק הקצר, ולא רק ערך שמוצג. אחרי cleanup, קריאה מהשדה
      // הישן הייתה מחזירה ריק ומחזירה את הבאג של §239 — בעל עסק עם קוד שמקבל את המכתב הקצר.
      const ownerCode = owner ? await loginCodeFor(env, accessToken, owner.id) : '';
      const ownerHasCode = !!owner && owner.fields.status === 'approved' && !!ownerCode;

      if (ownerHasCode) {
        att = { id: 'combined', rowId: owner.id, t: 'm', member: owner, biz: b, email: owner.fields.email || b.fields.ownerEmail, name: tplName(owner.fields) };
        const sent = await sendCombinedWelcomeEmail(env, {
          msgTag: 'msg_tpl_combined',
          toEmail: owner.fields.email || b.fields.ownerEmail,
          toName: owner.fields.firstName,
          code: ownerCode,
          businessName: b.fields.name,
          dashboardLink,
          tpl: { subject: templates.combinedSubject, body: templates.combinedBody },
          login: memberLoginFor(owner.fields),   // §444 — עד כאן המסלול הזה לא העביר את מצב ה-Google כלל
        });
        // רק כשהחבר באמת המתין — אחרת (שליחה חוזרת של העסק בלבד) אין לדרוס לו את חותמת
        // השליחה המקורית ואת נתוני המסירה/פתיחה שנצברו עליה.
        if (owner.fields.loginCodeEmailStatus === 'pending') {
          await firestorePatch(env, accessToken, `members/${owner.id}`, {
            loginCodeEmailStatus: 'sent',
            loginCodeEmailSentAt: new Date(),
          });
        }
        await firestorePatch(env, accessToken, `businesses/${b.id}`, {
          ownerEmailStatus: 'sent',
          ownerEmailSentAt: new Date(),
          welcomeEmailKind: 'combined',
        });
        await tplDeliver(env, accessToken, templates, { ...att, mail: 'sent', mailId: sent && sent.messageId });
        continue;
      }

      att = { id: 'biz', rowId: b.id, t: 'b', member: owner, biz: b, email: b.fields.ownerEmail, name: String(b.fields.name || '') };
      const sent = await sendBusinessApprovedEmail(env, {
        msgTag: 'msg_tpl_biz',
        toEmail: b.fields.ownerEmail,
        ownerName,
        businessName: b.fields.name,
        dashboardLink,
        tpl: { subject: templates.bizSubject, body: templates.bizBody },
        // §444 — המכתב הזה יוצא רק למי שאין לו קוד (ר' ownerHasCode), ולכן בפועל בלוק הכניסה
        // מוצג כאן רק כשיש רשומה מאושרת עם Google. בלי רשומה מאושרת — אין למי להבטיח כניסה.
        login: owner ? memberLoginFor(owner.fields) : null,
      });
      await firestorePatch(env, accessToken, `businesses/${b.id}`, {
        ownerEmailStatus: 'sent',
        ownerEmailSentAt: new Date(),
        // 'bizOnly' = יצא מייל-העסק הקצר לבדו ולא מכתב-הפתיחה המאוחד. נשמר כדי שמרכז תקלות
        // המייל (admin-dashboard.html) יוכל להצביע על זה בוודאות במקום לנחש מהפרשי-זמנים —
        // שליחה חוזרת דורסת את ownerEmailSentAt ומטשטשת כל ניחוש כזה.
        welcomeEmailKind: 'bizOnly',
      });
      await tplDeliver(env, accessToken, templates, { ...att, mail: 'sent', mailId: sent && sent.messageId });
    } catch (e) {
      await firestorePatch(env, accessToken, `businesses/${b.id}`, {
        ownerEmailStatus: 'failed',
        ownerEmailError: String(e).slice(0, 500),
      });
      if (att) await tplDeliver(env, accessToken, templates, { ...att, mail: 'failed', mailError: String(e) });
    }
  }

  // ── §628 — מיילי דחייה ("האימות לא עבר" / "לא אושרה"). תקציב נפרד, אחרי מיילי האישור. ──
  // 🔑 רק רשומה שבאמת נדחתה: rejectEmailStatus:'pending' על רשומה אחרת מסומן ולא נשלח
  // (אותו עיקרון של §517 – דגל-מייל לבדו לא הופך את הסריקה לממסר).
  try {
    const pendingRejects = await firestoreRunQuery(env, accessToken, 'members', 'rejectEmailStatus', 'pending');
    let sentRejects = 0;
    for (const m of pendingRejects) {
      if (sentRejects >= MAX_SWEEP_RECIPIENTS) break;
      const kind = m.fields.retryAllowed === true ? 'retry' : 'final';
      if (m.fields.status !== 'rejected' || !m.fields.email) {
        await firestorePatch(env, accessToken, `members/${m.id}`, { rejectEmailStatus: 'skipped' });
        continue;
      }
      sentRejects++;
      const att = { id: kind === 'retry' ? 'rejectRetry' : 'rejectFinal', rowId: m.id, t: 'm', member: m, biz: null, email: m.fields.email, name: tplName(m.fields) };
      try {
        const sent = await sendRejectEmail(env, { toEmail: m.fields.email, toName: m.fields.firstName, kind, templates, msgTag: 'msg_tpl_' + att.id });
        await firestorePatch(env, accessToken, `members/${m.id}`, { rejectEmailStatus: 'sent', rejectEmailSentAt: new Date(), rejectEmailKind: kind });
        await tplDeliver(env, accessToken, templates, { ...att, mail: 'sent', mailId: sent && sent.messageId });
      } catch (e) {
        await firestorePatch(env, accessToken, `members/${m.id}`, { rejectEmailStatus: 'failed', rejectEmailError: String(e).slice(0, 500) });
        await tplDeliver(env, accessToken, templates, { ...att, mail: 'failed', mailError: String(e) });
      }
    }
  } catch (e) { console.error('reject sweep failed', String(e)); }
}
