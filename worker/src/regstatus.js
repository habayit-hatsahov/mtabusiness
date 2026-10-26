// ── §612 — "הבקשה שלך בבדיקה": כניסה בלי תלות במייל ───────────────────────────────────────
// בהרשמה (fan-register.html) הטלפון מייצר מפתח סודי אקראי (32 בתים), שומר אותו אצלו
// (localStorage `yz_reg`), ושומר ברשומת החבר רק את ה-SHA-256 שלו (`regTicketHash`).
// בכל פתיחה של welcome.html, כל עוד אין התחברות, הדף שואל כאן מה מצב הבקשה:
//   pending  → כרטיס "הבקשה שלך בבדיקה" במקום ההרשמה וההתחברות.
//   approved → custom token, בדיוק כמו /mint-member-token, ונכנסים לבד. בלי קוד ובלי מייל.
//   rejected → כרטיס עם פנייה לצוות.
// 🔑 **המפתח הוא הוכחת-זהות של המכשיר שנרשם**, כמו סשן. מי שאין לו את המפתח לא יכול
// לגזור אותו מה-hash, וה-hash לבדו (גם אם נחשף) לא מכניס.
// ⚠️ שתילת hash ברשומה של אחר בלתי אפשרית מהטופס: ה-create הציבורי יוצר רק רשומה חדשה
// (pending) – מי ששותל hash ברשומה שהוא עצמו יצר מקבל כניסה לרשומה של עצמו, אחרי שאישרנו אותה.
// ⚠️ מונה הקצב בזיכרון (memQuota) ולא ב-KV: הבדיקה רצה בכל פתיחת אפליקציה של כל ממתין,
// ותקרת הכתיבות החינמית של KV היא 1,000 ביום (§611).
import { getGoogleAccessToken, mintFirebaseCustomToken } from './jwt.js';
import { firestoreGetDoc, firestorePatch } from './firestore.js';

const MEMBER_ID_RE = /^[A-Za-z0-9]{20}$/;
const TICKET_RE = /^[A-Za-z0-9_-]{40,64}$/;

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// השוואה בזמן קבוע (שני hash-ים באורך 64)
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function handleRegStatus({ memberId, ticket, v } = {}, env) {
  if (typeof memberId !== 'string' || !MEMBER_ID_RE.test(memberId)) return { error: 'invalid' };
  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) return { error: 'invalid' };

  const accessToken = await getGoogleAccessToken(env);
  const m = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  // הרשומה לא קיימת: נמחקה, או שהכתיבה עוד לא הגיעה. הלקוח מנקה רק על 'gone'.
  if (!m) return { status: 'gone' };
  const f = m.fields || {};
  if (!f.regTicketHash || !sameHex(f.regTicketHash, await sha256Hex(ticket))) return { error: 'invalid' };

  const firstName = typeof f.firstName === 'string' ? f.firstName.slice(0, 40) : '';
  if (f.status === 'approved') {
    const customToken = await mintFirebaseCustomToken(env, {
      uid: memberId,
      claims: { role: 'member', isBusinessOwner: f.isBusinessOwner === true },
    });
    return { status: 'approved', customToken, firstName };
  }
  // §628 – דחייה עם הזדמנות שנייה: הכרטיס מציג טופס תיקון (handleRegRetry למטה)
  // ⚠️ רק לדף שמכיר את המצב (v>=2). דף ישן מהמטמון מקבל 'rejected' – לא מצב שהוא לא יודע לצייר.
  if (f.status === 'rejected' && f.retryAllowed === true && Number(v) >= 2) return { status: 'retry', firstName };
  if (f.status === 'rejected') return { status: 'rejected', firstName };
  return { status: 'pending', firstName };
}

// ══ §628 — "האימות לא עבר": הזדמנות שנייה, רק למי שרמי בחר ══════════════════════════════════
// מרכז הניהול דוחה עם retryAllowed:true (או false = דחייה סופית). /reg-status מחזיר אז 'retry'
// והכרטיס ב-welcome.html מציג טופס: תמונה ביציע שרואים בה אותך + קישור לפרופיל – **שניהם חובה**.
// התמונה עולה קודם דרך /upload-member-proof (כמו בהרשמה) – כאן מגיעה רק הכתובת שלה.
// 🔑 אותה הוכחת-מכשיר של §612 (ticket ↔ regTicketHash). פעם אחת בלבד: retryAllowed נסגר.
const PROOF_URL_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/';
const PROFILE_HOSTS = { instagram: /^(www\.)?instagram\.com$/, facebook: /^(www\.|m\.)?facebook\.com$/ };

export async function handleRegRetry({ memberId, ticket, photoUrl, net, profileUrl } = {}, env) {
  if (typeof memberId !== 'string' || !MEMBER_ID_RE.test(memberId)) return { error: 'invalid' };
  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) return { error: 'invalid' };
  // התמונה: רק קובץ שהועלה ל-members/proofs/<אותו מזהה>_… (זה מה ש-/upload-member-proof מחזיר)
  let pu;
  try { pu = new URL(String(photoUrl || '')); } catch (e) { return { error: 'bad_photo' }; }
  const path = decodeURIComponent((pu.pathname.split('/o/')[1] || ''));
  if (!String(photoUrl).startsWith(PROOF_URL_PREFIX) || !path.startsWith(`members/proofs/${memberId}_`)) return { error: 'bad_photo' };
  // הפרופיל: קישור מלא לאינסטגרם או לפייסבוק, לא קישור-שיתוף (§628 – 64/76 לא נפתחו)
  if (net !== 'instagram' && net !== 'facebook') return { error: 'bad_profile' };
  let pr;
  try { pr = new URL(String(profileUrl || '')); } catch (e) { return { error: 'bad_profile' }; }
  if (pr.protocol !== 'https:' || !PROFILE_HOSTS[net].test(pr.hostname) || pr.pathname.length < 3 || /^\/share\//.test(pr.pathname) || String(profileUrl).length > 300) return { error: 'bad_profile' };

  const accessToken = await getGoogleAccessToken(env);
  const m = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  if (!m) return { error: 'gone' };
  const f = m.fields || {};
  if (!f.regTicketHash || !sameHex(f.regTicketHash, await sha256Hex(ticket))) return { error: 'invalid' };
  if (f.status !== 'rejected' || f.retryAllowed !== true) return { error: 'not_allowed' };

  await firestorePatch(env, accessToken, `members/${memberId}`, {
    status: 'pending',
    retryAllowed: false,
    fixedAt: new Date(),
    fixPrevPhotoUrl: f.photoProofUrl || '',
    fixPrevProfile: f.instagramUrl || f.facebookUrl || f.profileRaw || '',
    photoProofUrl: String(photoUrl),
    instagramUrl: net === 'instagram' ? pr.toString() : '',
    facebookUrl: net === 'facebook' ? pr.toString() : '',
    profileRaw: String(profileUrl).slice(0, 300),
    profileSource: 'retry',
  });
  return { ok: true, status: 'pending' };
}
