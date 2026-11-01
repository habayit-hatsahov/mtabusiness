// ══ §666 — בעל עסק ממתין שמתחבר: "העסק שלך אצלנו" גם בלי המכשיר שנרשם ════════════════════════
// §664/§665 עובדים רק במכשיר שנרשם (yz_biz_reg). 35 העסקים שממתינים היום נרשמו לפני כן, ומי מהם
// שמנסה Google/Apple מקבל רק "הבקשה שלכם עדיין ממתינה". כאן – כשהוורקר כבר מחזיר 'pending'
// ל-/google-login או ל-/apple-login – מצרפים את מה שהמסך של §664 צריך: העסק, טוקן העסק, ומפתח-
// מכשיר (§612) לכניסה לבד באישור.
// 🔑 רק אחרי הוכחת זהות אצל הספק: חשבון מקושר (googleSub/appleSub) או מייל מאומת שזהה למייל
//    שעל הרשומה (unapprovedByVerifiedEmail). מסלול הקוד (טלפון בלבד) לא מגיע לכאן.
// 🔑 המפתח נוצר רק אם לרשומה אין עדיין regTicketHash – כדי לא לבטל מפתח שכבר יושב במכשיר אחר.
import { firestoreGetDoc, firestorePatch, bizTokenFor } from './firestore.js';
import { sha256Hex } from './regstatus.js';

const BIZ_ID_RE = /^[A-Za-z0-9]{20}$/;

function newTicket() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// row = { id, fields } של רשומת החבר הממתינה. מחזיר null אם הוא לא בעל עסק עם עסק ממתין.
export async function pendingOwnerExtras(env, accessToken, row) {
  const f = (row && row.fields) || {};
  if (f.status !== 'pending' || f.isBusinessOwner !== true) return null;
  const bizId = f.linkedBusinessId;
  if (typeof bizId !== 'string' || !BIZ_ID_RE.test(bizId)) return null;
  const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!b || b.fields.status !== 'pending' || b.fields.ownerMemberId !== row.id) return null;
  const token = await bizTokenFor(env, accessToken, bizId);
  if (!token) return null;
  const out = {
    bizId, token,
    name: String(b.fields.name || '').slice(0, 80),
    ownerFirst: String(b.fields.ownerFirst || f.firstName || '').slice(0, 40),
  };
  if (!f.regTicketHash) {
    const ticket = newTicket();
    await firestorePatch(env, accessToken, `members/${row.id}`, { regTicketHash: await sha256Hex(ticket) });
    out.memberId = row.id;
    out.ticket = ticket;
  }
  return out;
}

// ══ §709 — אותו בעל עסק ממתין, במסלול הקוד (טלפון בלבד) ═══════════════════════════════════════
// I.B.I (1.11): נרשם לפני §664, בלי Google – וכל מה שהאפליקציה אמרה לו היה "הבקשה עדיין ממתינה".
// הטלפון אינו הוכחת זהות, ולכן לא מחזירים כאן טוקן או מפתח: שולחים את הקישור לדשבורד **למייל
// שברשומה** (שם רואים מה חסר ומתקנים), ומחזירים רק את הכתובת המוסתרת. מי שמקיש טלפון של אחר
// לא מקבל כלום מלבד "יש כאן עסק ממתין" + yo•••@gmail.com. בלי שם העסק.
// תקרה: 3 מיילים בשעה לעסק; מעבר לזה – אותה תשובה עם already, בלי מייל נוסף.
export function maskEmail(email) {
  const [u, d] = String(email || '').split('@');
  if (!u || !d) return '';
  return (u.length > 2 ? u.slice(0, 2) : u.slice(0, 1)) + '•••@' + d;
}

export async function pendingOwnerMailLink(env, accessToken, row, send) {
  const f = (row && row.fields) || {};
  if (f.status !== 'pending' || f.isBusinessOwner !== true) return null;
  const bizId = f.linkedBusinessId;
  if (typeof bizId !== 'string' || !BIZ_ID_RE.test(bizId)) return null;
  const b = await firestoreGetDoc(env, accessToken, `businesses/${bizId}`);
  if (!b || b.fields.status !== 'pending' || b.fields.ownerMemberId !== row.id) return null;
  const toEmail = String(f.email || b.fields.ownerEmail || '').trim();
  if (!toEmail.includes('@')) return null;
  const token = await bizTokenFor(env, accessToken, bizId);
  if (!token) return null;
  const out = { sentTo: maskEmail(toEmail) };
  const rlKey = 'pendlink:' + bizId;
  const n = parseInt((await env.RATE_LIMIT_KV.get(rlKey)) || '0', 10);
  if (n >= 3) return { ...out, already: true };
  await env.RATE_LIMIT_KV.put(rlKey, String(n + 1), { expirationTtl: 3600 });
  await send(env, {
    toEmail, toName: String(f.firstName || b.fields.ownerFirst || '').trim(), businessName: String(b.fields.name || ''),
    link: `https://yellowzone.co.il/business-dashboard.html?token=${encodeURIComponent(token)}`,
  });
  return out;
}
