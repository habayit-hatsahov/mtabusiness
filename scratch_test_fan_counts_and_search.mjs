// ── §429 — בדיקות ל-fanCounts ול-matchesSearch ────────────────────────────────────────────
// הרצה:  node scratch_test_fan_counts_and_search.mjs
//
// 🔑 **שתי החבילות מחלצות את הפונקציות מ-`admin-dashboard.html` עצמו** ולא מריצות עותק
// מודבק. בדיקה על snippet מועתק בודקת את ההעתק — ר' §399ט. העיגון הוא על **תוכן** (שם
// הפונקציה), ולכן שינוי מספרי-שורות אינו שובר את ההרנס; שינוי שם הפונקציה כן ייפול
// במפורש עם הודעה, ולא יעבור בשקט.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), 'admin-dashboard.html');
const html = fs.readFileSync(HTML, 'utf8');

function slice(fromMarker, toMarker) {
  const a = html.indexOf(fromMarker), b = html.indexOf(toMarker);
  if (a < 0) throw new Error(`לא נמצא בקובץ: ${fromMarker}`);
  if (b < 0 || b < a) throw new Error(`לא נמצא (או לפני ההתחלה): ${toMarker}`);
  return html.slice(a, b);
}
const load = (src, exports) => import('data:text/javascript;base64,' +
  Buffer.from(`${src}\nexport { ${exports} };`, 'utf8').toString('base64'));

let pass = 0, fail = 0;
const t = (desc, got, want) => {
  if (got === want) pass++;
  else { fail++; console.log(`❌ ${desc}  (קיבלתי ${JSON.stringify(got)}, ציפיתי ${JSON.stringify(want)})`); }
};

// ══ 1. matchesSearch ═══════════════════════════════════════════════════════════════════════
const { matchesSearch } = await load(
  slice('function normSearch(s) {', 'function bizFilteredList()'),
  'normSearch, normDigits, isPhoneQuery, matchesSearch');

const B = {
  name: 'Cafe Mizrahi', city: 'תל אביב', cat: 'מסעדות ובתי קפה',
  ownerFirst: 'רון', ownerLast: 'לוי', ownerEmail: 'Ron.Levi@Gmail.com',
  ownerPhone: '052-123-4567', phone: '03 5551234',
};
const F = { name: 'שרה כהן', email: 'sara@x.co.il', phone: '0541234567', memberNumber: '10432' };
const bizF = o => [o.name, o.city, o.cat, o.ownerFirst, o.ownerLast, o.ownerEmail];
const bizP = o => [o.ownerPhone, o.phone];
const fanF = o => [o.name, o.email, o.memberNumber];

console.log('── matchesSearch ──');
// הבאג המרכזי: רגישות לאותיות גדולות
t('cafe קטן מוצא Cafe',              matchesSearch('cafe', bizF(B), bizP(B)), true);
t('CAFE גדול מוצא Cafe',             matchesSearch('CAFE', bizF(B), bizP(B)), true);
t('מייל ברישיות מעורבת',             matchesSearch('ron.levi@gmail', bizF(B), bizP(B)), true);
// הבקשה המפורשת: שם בעל העסק
t('שם פרטי של הבעלים',               matchesSearch('רון', bizF(B), bizP(B)), true);
t('שם משפחה של הבעלים',              matchesSearch('לוי', bizF(B), bizP(B)), true);
// טלפון בכל פורמט
t('052-123-4567',                    matchesSearch('052-123-4567', bizF(B), bizP(B)), true);
t('0521234567 רצוף',                 matchesSearch('0521234567', bizF(B), bizP(B)), true);
t('052 123 4567 עם רווחים',          matchesSearch('052 123 4567', bizF(B), bizP(B)), true);
t('טלפון אוהד עם מקפים',             matchesSearch('054-1234567', fanF(F), [F.phone]), true);
t('מספר חבר',                        matchesSearch('10432', fanF(F), [F.phone]), true);
// ⚠️ מה שאסור להימצא — חיפוש שמוצא יותר מדי אינו פחות מבלבל
t('טלפון של מישהו אחר',              matchesSearch('0509999999', bizF(B), bizP(B)), false);
t('מילה שאינה קיימת',                matchesSearch('פיצה', bizF(B), bizP(B)), false);
t('אין התאמה על התפר בין שדות',      matchesSearch('אביבן', ['אבי', 'בן שמן'], []), false);
t('שאילתה מעורבת לא נופלת לטלפון',   matchesSearch('דנה 052', bizF(B), bizP(B)), false);
t('ספרה בודדת אינה שאילתת-טלפון',    matchesSearch('5', bizF(B), bizP(B)), false);
// שאילתה ריקה = אין סינון, לא "לא נמצא"
t('ריק מחזיר הכול',                  matchesSearch('', bizF(B), bizP(B)), true);
t('רווחים בלבד מחזיר הכול',          matchesSearch('   ', bizF(B), bizP(B)), true);
// רשומות ישנות עם שדות חסרים
t('שדות null אינם קורסים',           matchesSearch('רון', [null, undefined, 'רון כהן'], [null]), true);
t('phoneFields חסר לגמרי',           matchesSearch('052123', ['עסק'], undefined), false);
t('גרש עברי מול אפוסטרוף',           matchesSearch('בית"ר', ['ביתר ירושלים'], []), true);

// ══ 2. fanCounts ═══════════════════════════════════════════════════════════════════════════
// ownerMemberOfPendingBiz מסופק כאן במימוש **זהה** לזה שבקובץ (§427).
const shim = `
let MOCK_FANS = [], MOCK_BUSINESSES = [];
function ownerMemberOfPendingBiz(f) {
  if (!f || f.status !== 'pending' || !f.isBusinessOwner) return false;
  const b = (MOCK_BUSINESSES || []).find(x => x.ownerMemberId === f.id || (f.linkedBusinessId && x.id === f.linkedBusinessId));
  return !!b && b.status === 'pending';
}
export function __set(f, b) { MOCK_FANS = f; MOCK_BUSINESSES = b; }
`;
const cm = await load(shim + slice('function fanCounts() {', 'function fanEntryStats()'), 'fanCounts');
const M = (id, status, extra = {}) => ({ id, status, registeredAt: new Date('2020-01-01'), ...extra });

console.log('\n── fanCounts ──');
// 6 חברים · 6 עסקים. m1 מחזיק **שני** עסקים מאושרים · b4 בעלים לא-מאושר · b5 בלי קישור.
cm.__set(
  [M('m1', 'approved', { isBusinessOwner: true }), M('m2', 'approved', { isBusinessOwner: true }),
   M('m3', 'approved', { isSubscriber: true }),    M('m4', 'pending', { isBusinessOwner: true, linkedBusinessId: 'b3' }),
   M('m5', 'rejected'),                            M('m6', 'pending', { isBusinessOwner: true })],
  [{ id: 'b1', status: 'approved', ownerMemberId: 'm1' }, { id: 'b1b', status: 'approved', ownerMemberId: 'm1' },
   { id: 'b2', status: 'approved', ownerMemberId: 'm2' }, { id: 'b3', status: 'pending',  ownerMemberId: 'm4' },
   { id: 'b4', status: 'approved', ownerMemberId: 'm6' }, { id: 'b5', status: 'approved', ownerMemberId: '' }]
);
const c = cm.fanCounts();
t('total = כל הרשומות',                    c.total, 6);
t('approved = מאושרים בלבד',               c.approved, 3);
t('pending',                               c.pending, 2);
t('rejected',                              c.rejected, 1);
t('activeBiz סופר עסקים (ישויות)',         c.activeBiz, 5);
t('ownerOfActiveBiz סופר אנשים',           c.ownerOfActiveBiz, 2);   // m1 עם 2 עסקים + m2
t('plainFans = מאושרים שאינם בעלי עסק',    c.plainFans, 1);
t('ownerGap = עסק מאושר בלי בעלים מאושר',  c.ownerGap, 2);           // b4 + b5
t('🔑 הפירוק מסתכם למספר שמעליו',          c.plainFans + c.ownerOfActiveBiz, c.approved);
t('hiddenPendingOwners (§427)',            c.hiddenPendingOwners, 1);
t('subscriberPct מתוך כל הרשומות',         c.subscriberPct, Math.round(100 / 6));

cm.__set([], []);
const z = cm.fanCounts();
t('ריק: approved',      z.approved, 0);
t('ריק: subscriberPct', z.subscriberPct, 0);   // בלי חלוקה באפס
t('ריק: ownerGap',      z.ownerGap, 0);

cm.__set([M('a', 'approved', { registeredAt: new Date(Date.now() - 2 * 864e5) }),
          M('b', 'approved', { registeredAt: new Date(Date.now() - 20 * 864e5) })], []);
t('newThisWeek — שבוע אחרון בלבד', cm.fanCounts().newThisWeek, 1);

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
