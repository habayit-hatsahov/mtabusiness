// ══ §415 — בדיקת מנגנון-המעקב שבמרכז הניהול, בהרצה אמיתית ═══════════════════════════════
// ⚠️ **הפונקציות נשלפות מהקובץ לפי תוכן ולא לפי מספרי-שורה** (§361 — הרנס ששיקר גרוע מהרנס
// שנפל): כל עריכה בקובץ מזיזה שורות, וסליסה קשיחה הייתה בודקת קוד אחר לגמרי בלי לומר זאת.
// כאן הן מורצות בפועל, עם סטאבים ל-Firestore בלבד.
import fs from 'fs';

const src = fs.readFileSync('admin-dashboard.html', 'utf8');

// שולף פונקציה שלמה לפי חתימתה, בספירת סוגריים — לא regex "עד השורה הריקה הבאה".
function grab(signature) {
  const i = src.indexOf(signature);
  if (i < 0) throw new Error('לא נמצאה בקובץ: ' + signature);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('סוגריים לא נסגרו: ' + signature);
}

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (cond ? '' : '  ← ' + extra));
  if (!cond) fails++;
}

// ── 1. broadcastStateOf — מכונת-המצבים של "מה קרה למכתב" ──────────────────────────────
const stateSrc = grab('function broadcastStateOf(x) {');
const broadcastStateOf = new Function('mailDeliveryFailed',
  stateSrc + '; return broadcastStateOf;')((st) => st === 'bounced' || st === 'blocked');

console.log('\n── 1. broadcastStateOf ───────────────────────────────────────');
const D = new Date('2026-09-04T10:00:00Z');
check('לא נשלח שידור — אין מצב בכלל', broadcastStateOf({}) === null);
check('נשלח בלי נתוני מסירה', broadcastStateOf({ broadcastEmailSentAt: D }).txt === 'שידור: נשלח, אין נתוני מסירה');
check('נמסר ולא נפתח — מסומן כדורש-פעולה',
      broadcastStateOf({ broadcastEmailSentAt: D, broadcastEmailDeliveryAt: D }).warn === true);
check('נפתח — לא דורש פעולה',
      broadcastStateOf({ broadcastEmailSentAt: D, broadcastEmailDeliveryAt: D, broadcastEmailOpenedAt: D }).warn === false);
check('לחיצה נחשבת פתיחה',
      broadcastStateOf({ broadcastEmailSentAt: D, broadcastEmailClickedAt: D }).txt === 'שידור: נפתח');
check('חזר — מצב נפרד מ"לא נפתח"',
      broadcastStateOf({ broadcastEmailSentAt: D, broadcastEmailDelivery: 'bounced' }).txt === 'שידור: חזר');

// ── 2. recordBroadcastOnRecipients — מה באמת נכתב, ולכמה ──────────────────────────────
console.log('\n── 2. recordBroadcastOnRecipients ────────────────────────────');
const recSrc = grab('const BROADCAST_BATCH_OPS =');

function runRecord(results, group, subject) {
  const commits = [];
  let cur = null;
  const mkBatch = () => {
    cur = { updates: [], sets: [] };
    return {
      update: (ref, data) => cur.updates.push({ ref, data }),
      set: (ref, data) => cur.sets.push({ ref, data }),
      commit: async () => { commits.push(cur); },
    };
  };
  const fn = new Function(
    'writeBatch', 'db', 'doc', 'collection', 'serverTimestamp', 'deleteField', 'CURRENT_ADMIN',
    recSrc + '; return recordBroadcastOnRecipients;'
  )(mkBatch, {}, (...a) => a.join('/'), (...a) => a.join('/'), () => 'TS', () => 'DEL',
    { uid: 'u1', name: 'מנהל' });
  return fn(results, group, subject).then(done => ({ done, commits }));
}

const mixed = [
  { id: 'f1', status: 'sent' },
  { id: 'f2', status: 'failed', error: 'no_email' },
  { id: 'f3', status: 'sent' },
];
let r = await runRecord(mixed, 'fans', 'מכתב הבדיקה');
const sets = r.commits.flatMap(c => c.sets), updates = r.commits.flatMap(c => c.updates);
check('מוחזר מספר הנשלחים בפועל (2 מתוך 3)', r.done === 2, r.done);
check('יומן נכתב לכל שלושת הנמענים, כולל הנכשל', sets.length === 3, sets.length);
check('חותמת נכתבת רק לשניים שנשלחו', updates.length === 2, updates.length);
check('היומן של הנכשל אומר שהשליחה נכשלה ונושא את הסיבה',
      sets[1].data.title.includes('נכשלה') && sets[1].data.detail.includes('no_email'), JSON.stringify(sets[1].data));
check('היומן נכתב לתת-אוסף activity של members', sets[0].ref.includes('members/f1/activity'), sets[0].ref);
check('הנושא נשמר על הרשומה', updates[0].data.broadcastEmailSubject === 'מכתב הבדיקה');
check('תוצאות השידור הקודם נמחקות (deleteField)',
      updates[0].data.broadcastEmailOpenedAt === 'DEL' && updates[0].data.broadcastEmailDeliveryAt === 'DEL');
check('השולח נרשם ביומן', sets[0].data.actorName === 'מנהל');

r = await runRecord([{ id: 'b1', status: 'sent' }], 'businesses', 'נושא');
check('קהל עסקים נכתב לאוסף businesses', r.commits[0].sets[0].ref.includes('businesses/b1/activity'),
      r.commits[0].sets[0].ref);

// תקרת ה-500 של writeBatch: 300 נמענים שנשלחו = 600 פעולות, חייב להתפצל
r = await runRecord(Array.from({ length: 300 }, (_, i) => ({ id: 'x' + i, status: 'sent' })), 'fans', 'ס');
check('300 נמענים מתפצלים לכמה batches', r.commits.length > 1, r.commits.length);
const maxOps = Math.max(...r.commits.map(c => c.sets.length + c.updates.length));
check('אף batch לא חורג מתקרת 500 הפעולות של Firestore', maxOps <= 500, maxOps);
check('כל 300 נספרו', r.done === 300, r.done);

r = await runRecord([{ id: 'test', status: 'sent' }, { status: 'sent' }], 'fans', 'ס');
check('מייל-בדיקה ורשומה בלי id מדולגים', r.done === 0 && r.commits.length === 0);

console.log(fails ? `\n❌ ${fails} בדיקות נכשלו\n` : '\n✅ הכל עבר\n');
process.exit(fails ? 1 : 0);
