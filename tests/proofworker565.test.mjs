// בדיקת §565 — הגיבוי של תמונת-האימות דרך הוורקר (fan-register.html → uploadFile).
// הפונקציות האמיתיות נשלפות מהקובץ **לפי תוכן** (לא מספרי-שורות), והזמנים מקוצרים פי 100.
// ה-SDK של Storage ו-fetch מדומים. התרחישים: SDK מהיר · SDK תקוע → גיבוי · SDK תקוע וגם הגיבוי
// נכשל → דחייה עם אחוז/מצב · כשל מהיר של SDK → גיבוי מיד · כתובת ראשונה נופלת · התקדמות איטית
// אך רציפה → בלי גיבוי.
import fs from 'fs';
const html = fs.readFileSync(new URL('../fan-register.html', import.meta.url), 'utf8');
const grab = (start, end) => { const a = html.indexOf(start), b = html.indexOf(end, a); if (a < 0 || b < 0) throw new Error('anchor: ' + start); return html.slice(a, b); };
let src = grab('const PROOF_DEADLINE_MS', '// ⚠️ המזהה נוצר') +
  grab('  function withTimeout(p, ms, code)', '  // ── VALIDATION HELPERS');
// זמנים מקוצרים: 45ש'→450ms, 12ש'→120ms, 10ש'→100ms...
src = src.replace(/= (\d+);(\s*\/\/)/g, (m, n, c) => `= ${Math.max(1, Math.round(+n / 100))};${c}`);
src = src.replace('setTimeout(() => hc.abort(), 12000)', 'setTimeout(() => hc.abort(), 120)').replace('Math.max(3000,', 'Math.max(30,');
src = src.replace('}, 1000);', '}, 10);');   // מרווח ה-watchdog

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeEnv(sdk, hosts) {
  const calls = { worker: [], events: [] };
  const env = {
    HB_API_HOSTS: hosts.map(h => h.url),
    memberRef: { id: 'A'.repeat(20) },
    logEvent: (t, e) => calls.events.push(e.channel),
    ref: () => ({}), getStorageLazy: async () => ({}),
    getDownloadURL: () => sdk.landed ? Promise.resolve('https://sdk/url') : Promise.reject(Object.assign(new Error('nf'), { code: 'storage/object-not-found' })),
    uploadBytesResumable: () => {
      const subs = [];
      const task = { on: (_, cb) => subs.push(cb), then: (a, b) => sdk.promise.then(a, b) };
      sdk.progress = (p) => subs.forEach(cb => cb({ totalBytes: 100, bytesTransferred: p }));
      return task;
    },
    fetch: async (url, opts) => {
      const h = hosts.find(x => url.startsWith(x.url));
      calls.worker.push(h.url);
      return h.handler(opts);
    },
  };
  const fn = new Function(...Object.keys(env), src + '; return uploadFile;')(...Object.values(env));
  return { fn, calls };
}
const deferred = () => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { promise: p, res, rej }; };
const okHost = (url, body = { ok: true, url: 'https://worker/url' }) => ({ url, handler: async () => ({ ok: true, status: 200, json: async () => body }) });
const file = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' });

console.log('1. SDK מהיר');
{ const d = deferred(); const sdk = { promise: d.promise, landed: true }; const { fn, calls } = makeEnv(sdk, [okHost('https://a')]);
  const p = fn(file, 'x', Date.now() + 450, () => {}); setTimeout(() => { sdk.progress(100); d.res(); }, 20);
  const url = await p; check('הכתובת מה-SDK', url === 'https://sdk/url', url); check('הגיבוי לא נקרא', calls.worker.length === 0, calls.worker); }

console.log('2. SDK תקוע (0%) → גיבוי');
{ const d = deferred(); const sdk = { promise: d.promise }; const { fn, calls } = makeEnv(sdk, [okHost('https://a')]);
  const t0 = Date.now(); const url = await fn(file, 'x', Date.now() + 450, () => {});
  check('הכתובת מהוורקר', url === 'https://worker/url', url);
  check('הגיבוי הופעל אחרי ~STALL (100ms) ולא מיד', Date.now() - t0 >= 90 && Date.now() - t0 < 300, Date.now() - t0);
  check('נרשם proofWorker:0', calls.events.includes('proofWorker:0'), calls.events); }

console.log('3. SDK תקוע וגם הגיבוי נדחה');
{ const d = deferred(); const sdk = { promise: d.promise };
  const { fn } = makeEnv(sdk, [{ url: 'https://a', handler: async () => ({ ok: false, status: 400, json: async () => ({ error: 'not_image' }) }) }]);
  setTimeout(() => sdk.progress(30), 5);
  let err = null; try { await fn(file, 'x', Date.now() + 450, () => {}); } catch (e) { err = e; }
  check('נדחה עם קוד ה-SDK', err && err.code === 'upload-timeout', err && err.code);
  check('אחוז = 30', err && err.proofPct === 30, err && err.proofPct);
  check('מצב גיבוי = f', err && err.proofWorker === 'f', err && err.proofWorker); }

console.log('4. כשל מהיר של SDK → גיבוי מיד');
{ const d = deferred(); const sdk = { promise: d.promise }; const { fn, calls } = makeEnv(sdk, [okHost('https://a')]);
  const t0 = Date.now(); setTimeout(() => d.rej(Object.assign(new Error('x'), { code: 'storage/unknown' })), 5);
  const url = await fn(file, 'x', Date.now() + 450, () => {});
  check('הכתובת מהוורקר', url === 'https://worker/url', url);
  check('ממתין רק לחלון-ההצלה (~120ms) ולא ל-STALL+דד-ליין', Date.now() - t0 < 300, Date.now() - t0); }

console.log('5. כתובת ראשונה נופלת ברשת → השנייה');
{ const d = deferred(); const sdk = { promise: d.promise };
  const { fn, calls } = makeEnv(sdk, [{ url: 'https://a', handler: async () => { throw new TypeError('net'); } }, okHost('https://b')]);
  const url = await fn(file, 'x', Date.now() + 450, () => {});
  check('הכתובת מהשנייה', url === 'https://worker/url' && calls.worker.join() === 'https://a,https://b', calls.worker); }

console.log('6. התקדמות איטית אך רציפה → בלי גיבוי');
{ const d = deferred(); const sdk = { promise: d.promise, landed: true }; const { fn, calls } = makeEnv(sdk, [okHost('https://a')]);
  let p = 0; const iv = setInterval(() => { p += 10; sdk.progress(p); if (p >= 100) { clearInterval(iv); d.res(); } }, 50);
  const url = await fn(file, 'x', Date.now() + 900, () => {});
  check('הכתובת מה-SDK', url === 'https://sdk/url', url); check('הגיבוי לא נקרא', calls.worker.length === 0, calls.worker); }

console.log(fail ? `\n❌ ${fail} נכשלו, ${pass} עברו` : `\n✅ ${pass}/${pass}`);
process.exit(fail ? 1 : 0);
