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
