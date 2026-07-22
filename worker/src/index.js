import { corsHeaders, handlePreflight, json } from './cors.js';
import { getGoogleAccessToken, mintFirebaseCustomToken } from './jwt.js';
import { firestoreRunQuery, firestoreGetDoc, firestorePatch } from './firestore.js';
import { normalizePhoneDigits, phoneCandidates } from './phone.js';
import { isRateLimited, recordAttempt } from './ratelimit.js';
import { sendLoginCodeEmail, sendBusinessApprovedEmail, sendCombinedWelcomeEmail } from './brevo.js';
import { shortenBenefitText } from './anthropic.js';
import { suggestFallbackImages } from './pexels.js';

const SITE_BASE = 'https://habayit-hatsahov.github.io/mtabusiness/';

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
// account (עוקפת rules), אך מחזיר החוצה רק exists+memberId — לעולם לא שדה נוסף.
async function handleCheckMemberExists({ phone, email }, env) {
  if (!phone && !email) return { error: 'invalid_request' };

  const accessToken = await getGoogleAccessToken(env);

  const emailLower = (email || '').trim().toLowerCase();
  if (emailLower) {
    const byEmail = await firestoreRunQuery(env, accessToken, 'members', 'email', emailLower);
    if (byEmail.length) return { exists: true, memberId: byEmail[0].id };
  }

  if (phone) {
    for (const candidate of phoneCandidates(phone)) {
      const byPhone = await firestoreRunQuery(env, accessToken, 'members', 'phone', candidate);
      if (byPhone.length) return { exists: true, memberId: byPhone[0].id };
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
async function handleShortenBenefit({ text }, request, env) {
  if (!text || typeof text !== 'string' || !text.trim()) return { error: 'invalid_request' };
  if (text.length > 500) return { error: 'text_too_long' };

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await ipIsRateLimited(env.RATE_LIMIT_KV, 'shorten', ip)) return { error: 'too_many_attempts' };
  await ipRecordAttempt(env.RATE_LIMIT_KV, 'shorten', ip);

  try {
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

// כשחבר הוא גם בעל עסק שממתין לאותו מייל אישור — נשלח מייל אחד מאוחד (קוד כניסה + קישור לדשבורד)
// במקום שני מיילים נפרדים. אם רק צד אחד ממתין (למשל בעל עסק שכבר יש לו קוד מוקדם יותר), נשלח בנפרד כרגיל.
async function runEmailSweeps(env) {
  const accessToken = await getGoogleAccessToken(env);
  const templatesDoc = await firestoreGetDoc(env, accessToken, 'settings/messageTemplates');
  const templates = templatesDoc?.fields || {};
  const pendingMembers = await firestoreRunQuery(env, accessToken, 'members', 'loginCodeEmailStatus', 'pending');
  const handledBusinessIds = new Set();

  for (const m of pendingMembers) {
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
