// ══ §665 — "כבר נרשמת" שאומר איך ═══════════════════════════════════════════════════════════
// עץ אורן (28.10): נרשם עם קוד מטופס העסק, פתח את האפליקציה, מילא את טופס האוהד, קיבל "כבר נרשמת"
// בלי שום פרט – וניסה Apple פעמיים (כי דקה קודם השתמש ב-Apple בתוך הטופס). 9 דקות עד שמצא את הקוד.
// /check-member-exists מחזיר עכשיו `how` = איך הוא נכנס: קוד / Google / Apple, המייל (מוסתר חלקית),
// שם העסק אם הוא בעל עסק, ומצב הבקשה.
// 🔑 הנתיב פתוח לכל אחד. לכן `how` מוחזר רק כשההתאמה חזקה: טלפון **וגם** מייל, או אחד מהם **וגם**
//    שם פרטי + שם משפחה זהים. מי שמקליד טלפון של אחר בלי לדעת את שמו – מקבל רק את ה"כבר רשום" של היום.
import { normalizePhoneDigits } from './phone.js';

const norm = (s) => String(s || '').trim().toLowerCase();

// "da•••@gmail.com" – שתי אותיות ראשונות ושם הדומיין. כתובת קצרה מאוד – אות אחת.
export function maskEmail(email) {
  const e = String(email || '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  const local = e.slice(0, at);
  return local.slice(0, local.length > 3 ? 2 : 1) + '•••' + e.slice(at);
}

export function isStrongMatch(fields, { phone, email, firstName, lastName }) {
  const f = fields || {};
  const em = !!norm(email) && norm(f.email) === norm(email);
  const ph = !!phone && !!f.phone && normalizePhoneDigits(f.phone) === normalizePhoneDigits(phone);
  const nm = !!norm(firstName) && !!norm(lastName) && norm(f.firstName) === norm(firstName) && norm(f.lastName) === norm(lastName);
  return (em && ph) || ((em || ph) && nm);
}

// הדרך שעובדת אצלו: הספק שאיתו נרשם, אם הוא מחובר לרשומה; אחרת ספק מחובר אחר; אחרת קוד.
// (חבר מאושר תמיד מקבל קוד – גם מי שנרשם עם Google/Apple.)
export function loginMethodOf(f) {
  const google = !!f.googleSub, apple = !!f.appleSub;
  if (f.signupMethod === 'apple' && apple) return 'apple';
  if (f.signupMethod === 'google' && google) return 'google';
  if (apple) return 'apple';
  if (google) return 'google';
  return 'code';
}

// fields = רשומת החבר (ערכים רגילים, כמו ש-firestoreRunQuery מחזיר) · bizName = שם העסק המקושר, אם יש
export function describeRegistration(fields, bizName) {
  const f = fields || {};
  const out = { status: f.status === 'approved' ? 'approved' : 'pending', first: String(f.firstName || '').slice(0, 40) };
  if (f.isBusinessOwner === true && bizName) out.biz = String(bizName).slice(0, 80);
  if (out.status === 'pending') {
    const d = f.submittedAt ? new Date(f.submittedAt) : null;
    if (d && !isNaN(d)) out.since = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
    return out;
  }
  out.method = loginMethodOf(f);
  // Apple – בלי מייל: כתובת-ממסר מוסתרת לא אומרת לו כלום, והכניסה היא לפי ה-Apple ID
  if (out.method === 'google') out.mail = maskEmail(f.googleEmail || f.email);
  else if (out.method === 'code') out.mail = maskEmail(f.email);
  return out;
}
