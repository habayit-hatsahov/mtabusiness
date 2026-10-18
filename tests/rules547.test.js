// בדיקת §547 מול אמולטור Firestore אמיתי — הרשמת עסק נדחתה 13.10–18.10.
//
// 🔴 הבאג: business.html שלח `pendingChanges: null`, ו-§517 אסר את המפתח ביצירה (`keys().hasAny`).
//    הבדיקה של §517 בנתה "כמו בפועל" ביד ופספסה את השדה. לכן כאן **רשימת השדות נשלפת מ-business.html
//    עצמו** — אובייקט ה-data ומה שמוצב עליו עד ה-setDoc — ולא נכתבת ביד.
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, serverTimestamp } = require('firebase/firestore');

const ROOT = path.join(__dirname, '..');
const RULES = path.join(ROOT, 'firestore.rules');
const HTML = fs.readFileSync(path.join(ROOT, 'business.html'), 'utf8');

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  →  ' + String(e.message).slice(0, 140)); }
}

// ── שליפת המפתחות מהקוד ─────────────────────────────────────────────────────────────────
function formKeys() {
  const start = HTML.indexOf('    const data = {');
  const end = HTML.indexOf('\n    };', start);
  const save = HTML.indexOf('await setDoc(bizRef, data)');
  if (start < 0 || end < 0 || save < 0) throw new Error('לא נמצא אובייקט data / setDoc ב-business.html');
  const keys = [...HTML.slice(start, end).matchAll(/^ {6}([A-Za-z_]+)\s*:/gm)].map(m => m[1]);
  // הצבות אחרי האובייקט — רק שורות קוד, לא הערות
  for (const line of HTML.slice(end, save).split('\n')) {
    if (/^\s*\/\//.test(line)) continue;
    const m = line.match(/\bdata\.([A-Za-z_]+)\s*=[^=]/);
    if (m) keys.push(m[1]);
  }
  return [...new Set(keys)];
}

const sample = (k) => {
  if (k === 'status') return 'pending';
  if (/At$/.test(k)) return serverTimestamp();
  if (['bizTypes', 'branches', 'regions', 'tags', 'discountTypes', 'additionalDiscounts', 'photos'].includes(k)) return [];
  if (['hasDiscount', 'wantsBusinessOfWeek', 'wantsBenefitOfWeek'].includes(k)) return false;
  if (k === 'discountBuilder') return null;
  return 'x';
};

(async () => {
  const keys = formKeys();
  console.log(`מפתחות שהטופס שולח (${keys.length}): ${keys.join(', ')}`);
  const biz = Object.fromEntries(keys.map(k => [k, sample(k)]));

  const env = await initializeTestEnvironment({
    projectId: 'demo-yellowzone',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  const anon = env.unauthenticatedContext().firestore();

  console.log('יצירת עסק מטופס ההרשמה');
  await check('אין pendingChanges ברשימה שנשלפה', keys.includes('pendingChanges') ? Promise.reject(new Error('pendingChanges עדיין נשלח')) : Promise.resolve());
  await check('🔑 המסמך שהטופס שולח בפועל – נוצר', assertSucceeds(setDoc(doc(anon, 'businesses/form547'), biz)));
  await check('שבירה מכוונת: עם pendingChanges: null – נחסם (זה היה הבאג)', assertFails(setDoc(doc(anon, 'businesses/form547b'), { ...biz, pendingChanges: null })));
  await check('רגרסיה: עדיין לא נוצר כ-approved', assertFails(setDoc(doc(anon, 'businesses/form547c'), { ...biz, status: 'approved' })));
  await check('רגרסיה: עדיין לא נוצר עם ownerMemberId', assertFails(setDoc(doc(anon, 'businesses/form547d'), { ...biz, ownerMemberId: 'victim' })));

  await env.cleanup();
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
