// ══ §804 — מימושי קוד קופון במייל (חנות בלי חיבור API, למשל MUGS ב-Wix) ═══════════════════════════
// רמי (25.11): "שהמייל שלה יגיע למייל שלנו לתיבה ייעודית ואני אראה את זה במרכז הנתונים… וכן שתשלח גם סכום".
// בעל העסק מפנה את ההתראה שהחנות שלו שולחת על הזמנה עם הקוד לכתובת אישית: <mailKey>@in.yellowzone.co.il.
// Cloudflare Email Routing (תת-הדומיין in בלבד; הדומיין הראשי והשרת הקיים לא נגעו) → email() בוורקר → כאן.
// זיהוי העסק: לפי mailKey בכתובת (onlineShops.mailKey). קודים כפולים בין עסקים (Maccabi10 ×2) – לכן לא לפי הקוד.
// נשמר ב-couponMails (סגור ללקוח – אין חוק): העסק, הקוד שנמצא, הסכום שנמצא, נושא, וקטע טקסט קצר לבדיקה.
// ⚠️ הקטע נשמר כדי שנוכל לכוון את הפענוח לפורמט האמיתי של כל חנות. ההתראה אמורה להיות בלי פרטי לקוח (ביקשנו).
import PostalMime from 'postal-mime';
import { getGoogleAccessToken } from './jwt.js';
import { firestoreCreateDoc, firestoreRunQuery, firestoreGetDoc } from './firestore.js';

export const MAIL_DOMAIN = 'in.yellowzone.co.il';
const KEY_RX = /^[a-z0-9][a-z0-9-]{1,30}$/;

const strip = h => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8362;|&#x20aa;/gi, '₪').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// סכום: קודם שורה עם "סה"כ / total / לתשלום / סכום", אחר כך כל מספר צמוד ל-₪/ILS/NIS. הכי גדול בשורת הסיכום.
const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
const money = s => Number(String(s).replace(/,/g, ''));
export function findAmount(text) {
  // §806 – Wix מכניס תווי כיווניות נסתרים (U+200F) בין המספר ל-₪: "סכום ההזמנה: ‏88.20 ‏₪". בלי ניקוי – נלקח
  // המספר הראשון בשורה, שהיה מספר ההזמנה (10019). לכן: מנקים, ובשורת הסיכום לוקחים את המספר *שאחרי* מילת הסכום.
  const t = String(text || '').replace(/[‎‏‪-‮⁦-⁩ ]/g, ' ');
  const lines = t.split('\n');
  const totalLine = /(סה["״']?כ|סך הכל|סך הכול|לתשלום|סכום ההזמנה|סכום|grand total|total|amount)/i;
  const cur = new RegExp(`(?:₪\\s*${NUM}|${NUM}\\s*(?:₪|ש["״]?ח|ils|nis))`, 'i');
  for (const ln of lines) {
    const km = ln.match(totalLine);
    if (!km) continue;
    const after = ln.slice(km.index + km[0].length);
    const m = after.match(cur) || after.match(new RegExp(NUM)) || ln.match(cur);
    if (m) { const v = money(m[1] || m[2] || m[0]); if (v > 0 && v < 100000) return v; }
  }
  const all = [...t.matchAll(new RegExp(cur.source, 'gi'))].map(m => money(m[1] || m[2])).filter(v => v > 0 && v < 100000);
  return all.length ? Math.max(...all) : null;
}

// §807 – תאריך ההזמנה מתוך ההתראה (קנייה ישנה ≠ רגע הגעת המייל) ומספר ההזמנה (התראה שנשלחה פעמיים = מימוש אחד).
// Wix: "תאריך ההזמנה: 25 בנובמבר 2026 בשעה 13:39" · "מספר הזמנה: 10019". גם 25/11/2026 ו-2026-11-25.
const HE_M = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
const clean = s => String(s || '').replace(/[‎‏‪-‮⁦-⁩ ]/g, ' ');
export function findOrderDate(text) {
  const t = clean(text);
  let m = t.match(/(\d{1,2})\s*ב?(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*(\d{4})(?:\D{1,12}(\d{1,2}):(\d{2}))?/);
  if (m) return ilDate(+m[3], HE_M[m[2]], +m[1], m[4], m[5]);
  m = t.match(/(?:תאריך|date)[^\n\d]{0,20}(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\D{1,12}(\d{1,2}):(\d{2}))?/i);
  if (m) return ilDate(+m[3], +m[2], +m[1], m[4], m[5]);
  m = t.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return ilDate(+m[1], +m[2], +m[3], m[4], m[5]);
  return null;
}
// שעון ישראל (+2 בחורף / +3 בקיץ, מספיק לדיוק של יום) → ISO
function ilDate(y, mo, d, hh, mm) {
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  const off = mo >= 4 && mo <= 10 ? 3 : 2;
  const dt = new Date(Date.UTC(y, mo - 1, d, (+hh || 12) - off, +mm || 0));
  return isNaN(dt) ? null : dt;
}
export function findOrderNo(text) {
  const m = clean(text).match(/(?:מספר הזמנה|הזמנה מס['׳]?|order\s*(?:no\.?|number|#))\s*[:#]?\s*#?(\d{3,12})/i);
  return m ? m[1] : '';
}

export async function handleCouponEmail(message, env) {
  const to = String(message.to || '').toLowerCase();
  const local = to.split('@')[0].split('+')[0];
  const raw = await new Response(message.raw).arrayBuffer();   // ⚠️ הזרם נקרא פעם אחת
  let p = {};
  try { p = await PostalMime.parse(raw); } catch (e) { console.error('couponmail parse failed', String(e)); }
  const text = (p.text && p.text.trim()) ? p.text : strip(p.html);
  const at = await getGoogleAccessToken(env);
  let bizId = null, code = '';
  if (KEY_RX.test(local)) {
    const rows = await firestoreRunQuery(env, at, 'onlineShops', 'mailKey', local, 1).catch(() => []);
    if (rows.length) bizId = rows[0].id;
  }
  if (bizId) {
    const bd = await firestoreGetDoc(env, at, 'businesses/' + bizId).catch(() => null);
    code = (bd && bd.fields.discountCode) || '';
  }
  const hay = (String(p.subject || '') + '\n' + text).toLowerCase();
  const codeFound = !!(code && hay.includes(code.toLowerCase()));
  const amount = findAmount(text), orderAt = findOrderDate(text), orderNo = findOrderNo(text);
  // §807 – פרטיות: הבטחנו לבעל העסק שלא נשמור פרטי לקוח. טקסט מהמייל נשמר רק כשהפענוח נכשל (בלי סכום),
  // כדי שנוכל לכוון את הפענוח – ורק 400 תווים. מייל שפוענח = רק המספרים.
  await firestoreCreateDoc(env, at, 'couponMails', {
    at: new Date(), to, from: String(message.from || '').slice(0, 200), subject: String(p.subject || '').slice(0, 300),
    bizId: bizId || '', mailKey: local.slice(0, 40), code, codeFound, amount: amount == null ? null : amount,
    orderAt: orderAt || null, orderNo,
    snippet: amount == null ? String(text || '').slice(0, 400) : '', messageId: String(p.messageId || '').slice(0, 300),
  });
  console.log('couponmail', JSON.stringify({ to, bizId, codeFound, amount }));
}
