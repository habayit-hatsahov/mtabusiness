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
import { firestoreGetDoc } from './firestore.js';

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

export async function handleRegStatus({ memberId, ticket } = {}, env) {
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
  if (f.status === 'rejected') return { status: 'rejected', firstName };
  return { status: 'pending', firstName };
}
