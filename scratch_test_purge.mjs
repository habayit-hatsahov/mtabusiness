// ══ §449 — בדיקות לתפוגת עותק-הגיבוי ביומן המחיקות ═══════════════════════════════════════
//
// 🔑 **מייבא את `worker/src/purge.js` האמיתי** ובודק את הפונקציות הטהורות שלו — הבחירה
// והגבול — **בלי לגעת ברשת ובלי להריץ ולו מחיקה אחת**. זו הסיבה שהבחירה נכתבה מלכתחילה
// כפונקציה טהורה: קוד שמוחק את רשת-השחזור חייב להיות ניתן לבדיקה בלי להפעיל אותו.
//
// ⚠️ **מה שהבדיקה אינה מכסה:** הקריאה ל-Firestore עצמה (`firestoreRunRangeQuery`/
// `firestorePatch`) ופעולת ה-cron בפועל. אלה נבדקים רק בריצה אמיתית אחרי `wrangler deploy`.
//
// הרצה:  node scratch_test_purge.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  cutoffDate, selectForPurge, PURGED_FIELDS,
  RETENTION_MONTHS, MAX_PER_RUN, PURGE_CRON,
} from './worker/src/purge.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

const NOW = new Date('2026-09-22T10:00:00Z');
const row = (id, over) => ({ id, fields: Object.assign({ deletedAt: '2024-01-01T00:00:00.000Z' }, over) });

console.log('\n── 1. חישוב הגבול ──');
{
  check('12 חודשים אחורה מ-22.9.2026 → 22.9.2025',
    cutoffDate(NOW).toISOString().startsWith('2025-09-22'), cutoffDate(NOW).toISOString());
  // ⚠️ גלישת שנה — הסיבה שלא לחשב 365 ימים ביד.
  check('גלישת שנה: 15.3.2026 → 15.3.2025',
    cutoffDate(new Date('2026-03-15T00:00:00Z')).toISOString().startsWith('2025-03-15'),
    cutoffDate(new Date('2026-03-15T00:00:00Z')).toISOString());
}

console.log('\n── 2. הבחירה — מי נכנס ומי לא ──');
{
  const rows = [
    row('old-1', { deletedAt: '2024-05-01T00:00:00.000Z' }),               // ישן → נבחר
    row('old-2', { deletedAt: '2025-09-21T00:00:00.000Z' }),               // יום לפני הגבול → נבחר
    row('fresh', { deletedAt: '2026-08-01T00:00:00.000Z' }),               // טרי → לא
    row('edge',  { deletedAt: '2025-09-23T00:00:00.000Z' }),               // אחרי הגבול → לא
    row('done',  { deletedAt: '2024-01-01T00:00:00.000Z', purgedAt: '2026-01-01T00:00:00.000Z' }),
    { id: 'nodate', fields: { label: 'בלי תאריך' } },                      // 🔴 לעולם לא
    row('bad',   { deletedAt: 'לא-תאריך' }),                               // 🔴 לעולם לא
  ];
  const { pick, skipped } = selectForPurge(rows, NOW);
  check('נבחרו בדיוק שתי הישנות', JSON.stringify(pick) === JSON.stringify(['old-1', 'old-2']), JSON.stringify(pick));
  check('רשומה שכבר רוקנה נספרת בנפרד', skipped.alreadyPurged === 1, JSON.stringify(skipped));
  check('🔴 רשומה בלי deletedAt אינה נבחרת', !pick.includes('nodate'));
  check('🔴 תאריך משובש אינו נבחר', !pick.includes('bad'));
  check('שתיהן נספרות כ-noDate', skipped.noDate === 2, JSON.stringify(skipped));
  check('רשומות שטרם חצו נספרות', skipped.futureDate === 2, JSON.stringify(skipped));
}

console.log('\n── 3. התקרה לכל ריצה ──');
{
  const many = Array.from({ length: MAX_PER_RUN + 25 }, (_, i) => row('r' + i));
  const { pick } = selectForPurge(many, NOW);
  check('לא יותר מ-' + MAX_PER_RUN + ' בריצה אחת', pick.length === MAX_PER_RUN, String(pick.length));
  check('התקרה נמוכה בכוונה (≤50)', MAX_PER_RUN <= 50, String(MAX_PER_RUN));
}

console.log('\n── 4. 🔴 מה מתרוקן ומה חייב להישאר ──');
{
  const keys = Object.keys(PURGED_FIELDS);
  for (const k of ['data', 'selfReason', 'actorEmail', 'label', 'actorName']) {
    check('מתרוקן: ' + k, keys.includes(k));
  }
  // 🔑 קליפת הביקורת — זה מה ש-§447 השקיע בו, וריקון שלו היה מוחק את שובל הראיות.
  for (const k of ['docId', 'collectionName', 'deletedAt', 'source', 'state']) {
    check('🔑 נשאר (ראיית ביקורת): ' + k, !keys.includes(k));
  }
  check('data מתרוקן ל-null ולא למחרוזת', PURGED_FIELDS.data === null, String(PURGED_FIELDS.data));
}

console.log('\n── 5. 🔴 המספר בקוד נעול לנוסח שבמסמך הפרטיות ──');
{
  // פער בין השניים אינו באג טכני — הוא **הבטחה שבורה לאוהד**.
  const HEB = { 6: 'שישה חודשים', 12: 'שנים עשר חודשים', 24: 'עשרים וארבעה חודשים' };
  const phrase = HEB[RETENTION_MONTHS];
  check('RETENTION_MONTHS מוכר לבדיקה', !!phrase, String(RETENTION_MONTHS));
  check('terms.html אומר "' + phrase + '"', !!phrase && read('terms.html').includes(phrase));
}

console.log('\n── 6. 🔴 ביטוי ה-cron זהה תו-בתו ל-wrangler.toml ──');
{
  // פער כאן **אינו נראה כשבור**: המיילים ימשיכו לעבוד, והניקוי פשוט לא ירוץ לעולם.
  const toml = read('worker/wrangler.toml');
  const m = toml.match(/^crons\s*=\s*\[(.+)\]\s*$/m);
  check('נמצאה שורת crons', !!m, m && m[1]);
  const list = m ? m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')) : [];
  check('הטריגר היומי רשום ב-wrangler.toml', list.includes(PURGE_CRON), JSON.stringify(list));
  check('טריגר הדקה של המיילים לא נמחק', list.includes('* * * * *'), JSON.stringify(list));
}

console.log('\n── 7. ברירת המחדל ב-scheduled נשארה תור המיילים ──');
{
  // ⚠️ הכיוון ההפוך (ברירת מחדל = ניקוי) היה מריץ מחיקות בכל דקה על ערך לא צפוי.
  const idx = read('worker/src/index.js');
  const block = idx.slice(idx.indexOf('async scheduled('), idx.indexOf('async scheduled(') + 600);
  check('הניקוי רץ רק מאחורי תנאי PURGE_CRON', /===\s*PURGE_CRON/.test(block), block.slice(0, 200));
  check('runEmailSweeps הוא הנתיב הלא-מותנה',
    block.indexOf('runEmailSweeps') > block.indexOf('runDeletionLogPurge'), 'סדר');
}

console.log('\n── 8. הבדיקה יודעת להיכשל ──');
{
  // [[feedback_guard_that_always_holds]] — מוודא שהגלאי של סעיף 2 באמת תופס.
  const { pick } = selectForPurge([row('x', { deletedAt: '2026-09-21T00:00:00.000Z' })], NOW);
  check('רשומה בת יום אחד לא נבחרת', pick.length === 0, JSON.stringify(pick));
}

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `✅ הכל עבר — ${pass}/${pass + fail}` : `❌ ${fail} נכשלו מתוך ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
