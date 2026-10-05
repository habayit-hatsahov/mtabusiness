// §462 — בדיקת submitMember מתוך fan-register.html עצמו (הקוד נשלף מהקובץ, לא מועתק).
// הרצה: node scratch_test_submit_member_client.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./fan-register.html', import.meta.url), 'utf8');
const start = html.indexOf('  const SUBMIT_FALLBACK_MS');
const end = html.indexOf('\n  }\n', html.indexOf('  function submitMember(data)')) + 4;
if (start < 0 || end < start) throw new Error('submitMember לא נמצא ב-fan-register.html');
// הזמנים מקוצרים פי 100 — אותו קוד בדיוק, אותו יחס בין הספים.
const src = html.slice(start, end)
  .replace('SUBMIT_FALLBACK_MS = 8000', 'SUBMIT_FALLBACK_MS = 80')
  .replace('SUBMIT_CEILING_MS  = 35000', 'SUBMIT_CEILING_MS  = 350')
  .replace('SUBMIT_WORKER_MS   = 15000', 'SUBMIT_WORKER_MS   = 150');
if (!src.includes('= 80') || !src.includes('= 350')) throw new Error('החלפת הזמנים לא תפסה');

const make = new Function('setDoc', 'hbApiFetch', 'memberRef', src + '\nreturn submitMember;');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const never = () => new Promise(() => {});

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('✅', name); } else { fail++; console.log('❌', name, extra ?? ''); } };

async function run(name, { fs, wk }, expect) {
  const log = { wk: 0, body: null };
  const hbApiFetch = async (path, opts) => { log.wk++; log.body = JSON.parse(opts.body); return wk(opts); };
  const submit = make(() => fs(), hbApiFetch, { id: 'AbCdEfGhIjKlMnOpQrSt' });
  const t0 = Date.now();
  let got;
  try { got = { ok: await submit({ firstName: 'a', submittedAt: { _sentinel: 1 }, reviewFlagAt: { _sentinel: 1 } }) }; }
  catch (e) { got = { err: e.code || e.message }; }
  got.ms = Date.now() - t0; got.wk = log.wk; got.body = log.body;
  check(name, expect(got), JSON.stringify(got));
  return got;
}
const ok = () => new Response(JSON.stringify({ ok: true, created: true }), { status: 200 });
const bad = () => new Response(JSON.stringify({ error: 'bad_field' }), { status: 200 });
const denied = () => Promise.reject(Object.assign(new Error('x'), { code: 'permission-denied' }));

await run('Firestore מאשר מהר → firestore, הוורקר לא נקרא',
  { fs: () => sleep(10), wk: ok }, g => g.ok === 'firestore' && g.wk === 0);

const b = await run('Firestore תקוע, הוורקר מצליח → worker אחרי ~סף הגיבוי',
  { fs: never, wk: ok }, g => g.ok === 'worker' && g.wk === 1 && g.ms >= 75 && g.ms < 200);
check('המטען לוורקר: אותו מזהה, בלי serverTimestamp',
  b.body?.memberId === 'AbCdEfGhIjKlMnOpQrSt' && b.body.data.firstName === 'a'
  && !('submittedAt' in b.body.data) && !('reviewFlagAt' in b.body.data), JSON.stringify(b.body));

await run('Firestore תקוע, הוורקר דוחה → stuck בתקרה (לא "נשלח")',
  { fs: never, wk: bad }, g => g.err === 'stuck' && g.ms >= 340);

await run('Firestore תקוע, הוורקר זורק רשת → stuck בתקרה',
  { fs: never, wk: () => Promise.reject(new TypeError('Failed to fetch')) }, g => g.err === 'stuck');

await run('Firestore דוחה מהר (permission-denied) → השגיאה שלו, בלי וורקר',
  { fs: denied, wk: ok }, g => g.err === 'permission-denied' && g.wk === 0 && g.ms < 60);

await run('Firestore תקוע, הוורקר נכשל, ואז Firestore דוחה → השגיאה של Firestore',
  { fs: () => sleep(200).then(denied), wk: bad }, g => g.err === 'permission-denied' && g.wk === 1 && g.ms < 340);

await run('Firestore דוחה בזמן שהוורקר רץ, והוורקר מצליח → worker',
  { fs: () => sleep(100).then(denied), wk: () => sleep(60).then(ok) }, g => g.ok === 'worker');

await run('Firestore מאשר אחרי שהוורקר כבר ניצח → worker, תוצאה אחת',
  { fs: () => sleep(120), wk: ok }, g => g.ok === 'worker' && g.wk === 1);

await run('Firestore מאשר בין הסף לתשובת הוורקר → הראשון מנצח, בלי כפילות',
  { fs: () => sleep(100), wk: () => sleep(60).then(ok) }, g => g.ok === 'firestore' && g.wk === 1);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
