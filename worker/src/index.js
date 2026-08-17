import { corsHeaders, handlePreflight, json } from './cors.js';
import { getGoogleAccessToken, mintFirebaseCustomToken, verifyAdminIdToken } from './jwt.js';
import { firestoreRunQuery, firestoreGetDoc, firestorePatch } from './firestore.js';
import { normalizePhoneDigits, phoneCandidates } from './phone.js';
import { isRateLimited, recordAttempt } from './ratelimit.js';
import { sendLoginCodeEmail, sendBusinessApprovedEmail, sendCombinedWelcomeEmail, sendBroadcastEmail } from './brevo.js';
import { shortenBenefitText } from './anthropic.js';
import { suggestFallbackImages } from './pexels.js';
import { runBackfillThumbnails } from './backfill.js';
import { sendWebPush } from './push.js';
import { handleDownloadImage, handleViewImage } from './download.js';
import { handleUploadBizMedia } from './bizmedia.js';
import { handleBrevoWebhook, handleSetupBrevoWebhook } from './brevo-webhook.js';

const SITE_BASE = 'https://yellowzone.co.il/';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return handlePreflight(env, request);

    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/mint-member-token') {
        return json(await handleMemberLogin(await request.json(), request, env), env, request);
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
      if (request.method === 'POST' && url.pathname === '/resend-login-code') {
        return json(await handleResendCode(await request.json(), env), env, request);
      }
      if (request.method === 'POST' && url.pathname === '/check-member-exists') {
        return json(await handleCheckMemberExists(await request.json(), env), env, request);
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
      if (request.method === 'POST' && url.pathname === '/send-test-push') {
        return json(await handleSendTestPush(request, env), env, request);
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
      if (request.method === 'GET' && url.pathname === '/download-image') {
        return handleDownloadImage(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/view-image') {
        return handleViewImage(request, env);
      }
      return json({ error: 'not_found' }, env, request, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'internal_error' }, env, request, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runEmailSweeps(env));
  },
};

async function handleMemberLogin({ phone, code }, request, env) {
  if (!phone || !code || String(code).length !== 6) return { error: 'invalid_request' };

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const normPhone = normalizePhoneDigits(phone);

  if (await isRateLimited(env.RATE_LIMIT_KV, normPhone, ip)) {
    return { error: 'too_many_attempts' };
  }

  const accessToken = await getGoogleAccessToken(env);
  const candidates = phoneCandidates(phone);
  const matches = await firestoreRunQuery(env, accessToken, 'members', 'loginCode', String(code));
  const match = matches.find(
    (m) => candidates.includes(normalizePhoneDigits(m.fields.phone)) && m.fields.status === 'approved'
  );

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

async function handleBusinessLogin({ accessToken: bizToken }, env) {
  if (!bizToken) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);
  const matches = await firestoreRunQuery(env, accessToken, 'businesses', 'accessToken', bizToken);
  if (!matches.length) return { error: 'invalid_token' };

  const customToken = await mintFirebaseCustomToken(env, {
    uid: matches[0].id,
    claims: { role: 'business_owner' },
  });

  return { customToken, ownerMemberId: matches[0].fields.ownerMemberId || null };
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
  const matches = await firestoreRunQuery(env, accessToken, 'businesses', 'accessToken', bizToken);
  if (!matches.length) return { error: 'invalid_token' };
  const biz = matches[0];

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
  let found = null;
  for (const c of candidates) {
    const matches = await firestoreRunQuery(env, accessToken, 'members', 'phone', c);
    found = matches.find((m) => m.fields.status === 'approved' && m.fields.loginCode);
    if (found) break;
  }

  // הודעה זהה בין "נמצא" ל"לא נמצא" — כמו שהיה קודם, כדי לא לחשוף אילו מספרים רשומים
  if (found) {
    const lastSent = found.fields.lastCodeResendAt ? new Date(found.fields.lastCodeResendAt) : null;
    const cooldownMs = 60 * 1000;
    if (!lastSent || Date.now() - lastSent.getTime() >= cooldownMs) {
      await firestorePatch(env, accessToken, `members/${found.id}`, {
        loginCodeEmailStatus: 'pending',
        lastCodeResendAt: new Date(),
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

async function handleCheckMemberExists({ phone, email, firstName, lastName }, env) {
  if (!phone && !email) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);

  // דגל ל-admin: טלפון/מייל תואמים רשומה קיימת, אך השם שהוזן שונה מהותית מהשם
  // הרשום עליה — כנראה שני אנשים שונים חולקים טלפון/מייל, לא אותו אדם שנרשם
  // שוב (fan-register.html אחרת ידרוס בשקט firstName/lastName על הרשומה הקיימת).
  const nameMismatch = (existing) =>
    !!(firstName || lastName) &&
    (normName(existing.firstName) !== normName(firstName) || normName(existing.lastName) !== normName(lastName));

  const emailLower = (email || '').trim().toLowerCase();
  if (emailLower) {
    const byEmail = await firestoreRunQuery(env, accessToken, 'members', 'email', emailLower);
    if (byEmail.length) return { exists: true, memberId: byEmail[0].id, nameMismatch: nameMismatch(byEmail[0].fields), hasName: !!byEmail[0].fields.firstName };
  }

  if (phone) {
    for (const candidate of phoneCandidates(phone)) {
      const byPhone = await firestoreRunQuery(env, accessToken, 'members', 'phone', candidate);
      if (byPhone.length) return { exists: true, memberId: byPhone[0].id, nameMismatch: nameMismatch(byPhone[0].fields), hasName: !!byPhone[0].fields.firstName };
    }
  }

  return { exists: false, memberId: null };
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

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
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

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
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

// שידור מייל — לכל בעלי העסקים/אוהדים המאושרים כברירת מחדל, או לרשימת מזהים ספציפית שהמנהל בחר
// (מרכז הודעות, admin-dashboard.html — בורר-קהל מבוסס selectedBizIds/selectedFanIds
// הקיימים כבר ב"כל העסקים"/"כל האוהדים"). נקרא ישירות מדפדפן, לא curl בלבד, ולכן מאומת בפועל דרך
// verifyAdminIdToken (לא סוד סטטי — ר' PROJECT_CONTEXT.md). לולאה סדרתית מכוונת (לא batched) —
// מספיק ליחס הנוכחי (עשרות נמענים, לא מאות).
async function handleSendBroadcastEmail({ idToken, subject, body, audienceType, businessIds, memberIds, testEmail }, env) {
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
    const vars = isFansTest
      ? { name: 'ישראל ישראלי', code: '123456', link: `${SITE_BASE}home.html` }
      : { name: 'ישראל ישראלי', business: 'עסק לדוגמה', link: `${SITE_BASE}business-dashboard.html?token=demo` };
    try {
      await sendBroadcastEmail(env, { toEmail: testEmail, toName: 'בדיקה', subject: `[בדיקה] ${subject}`, body, vars });
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
        ? { name: r.fields.firstName || '', code: r.fields.loginCode || '', link: `${SITE_BASE}home.html` }
        : { name: r.fields.ownerFirst || '', business: r.fields.name || '', link: `${SITE_BASE}business-dashboard.html?token=${r.fields.accessToken}` };
      await sendBroadcastEmail(env, { toEmail: email, toName: isFans ? (r.fields.firstName || '') : (r.fields.ownerFirst || ''), subject, body, vars });
      results.push({ id: r.id, name, email, status: 'sent' });
    } catch (e) {
      results.push({ id: r.id, name, email, status: 'failed', error: String(e).slice(0, 300) });
    }
  }
  return { results };
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
const MAX_SWEEP_RECIPIENTS = 10;

async function runEmailSweeps(env) {
  const accessToken = await getGoogleAccessToken(env);
  const templatesDoc = await firestoreGetDoc(env, accessToken, 'settings/messageTemplates');
  const templates = templatesDoc?.fields || {};
  const pendingMembers = await firestoreRunQuery(env, accessToken, 'members', 'loginCodeEmailStatus', 'pending');
  const handledBusinessIds = new Set();
  let processed = 0;

  for (const m of pendingMembers) {
    if (processed >= MAX_SWEEP_RECIPIENTS) break;
    processed++;
    try {
      let business = null;
      if (m.fields.isBusinessOwner === true && m.fields.linkedBusinessId) {
        const biz = await firestoreGetDoc(env, accessToken, `businesses/${m.fields.linkedBusinessId}`);
        if (biz && biz.fields.ownerEmailStatus === 'pending') business = biz;
      }

      if (business) {
        await sendCombinedWelcomeEmail(env, {
          toEmail: m.fields.email,
          toName: m.fields.firstName,
          code: m.fields.loginCode,
          businessName: business.fields.name,
          dashboardLink: `${SITE_BASE}business-dashboard.html?token=${business.fields.accessToken}`,
          tpl: { subject: templates.combinedSubject, body: templates.combinedBody },
        });
        await firestorePatch(env, accessToken, `members/${m.id}`, {
          loginCodeEmailStatus: 'sent',
          loginCodeEmailSentAt: new Date(),
        });
        await firestorePatch(env, accessToken, `businesses/${business.id}`, {
          ownerEmailStatus: 'sent',
          ownerEmailSentAt: new Date(),
        });
        handledBusinessIds.add(business.id);
      } else {
        await sendLoginCodeEmail(env, {
          toEmail: m.fields.email,
          toName: m.fields.firstName,
          code: m.fields.loginCode,
          tpl: { subject: templates.loginSubject, body: templates.loginBody },
        });
        await firestorePatch(env, accessToken, `members/${m.id}`, {
          loginCodeEmailStatus: 'sent',
          loginCodeEmailSentAt: new Date(),
        });
      }
    } catch (e) {
      await firestorePatch(env, accessToken, `members/${m.id}`, {
        loginCodeEmailStatus: 'failed',
        loginCodeEmailError: String(e).slice(0, 500),
      });
    }
  }

  // עסקים שנשארו ממתינים בלי שהמייל שלהם טופל למעלה (למשל אושרו אחרי שהחבר כבר קיבל קוד כניסה בעבר)
  const pendingBiz = await firestoreRunQuery(env, accessToken, 'businesses', 'ownerEmailStatus', 'pending');
  for (const b of pendingBiz) {
    if (handledBusinessIds.has(b.id)) continue;
    if (processed >= MAX_SWEEP_RECIPIENTS) break;
    processed++;
    try {
      const ownerName = `${b.fields.ownerFirst || ''} ${b.fields.ownerLast || ''}`.trim();
      await sendBusinessApprovedEmail(env, {
        toEmail: b.fields.ownerEmail,
        ownerName,
        businessName: b.fields.name,
        dashboardLink: `${SITE_BASE}business-dashboard.html?token=${b.fields.accessToken}`,
        tpl: { subject: templates.bizSubject, body: templates.bizBody },
      });
      await firestorePatch(env, accessToken, `businesses/${b.id}`, {
        ownerEmailStatus: 'sent',
        ownerEmailSentAt: new Date(),
      });
    } catch (e) {
      await firestorePatch(env, accessToken, `businesses/${b.id}`, {
        ownerEmailStatus: 'failed',
        ownerEmailError: String(e).slice(0, 500),
      });
    }
  }
}
