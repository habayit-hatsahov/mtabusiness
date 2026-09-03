// ── §402/§403 — מריץ את hbApiFetch **מתוך כל אחד משמונת הקבצים** ─────────────────────────
// ⚠️ נשלף לפי תוכן ולא לפי מספרי שורה (feedback_test_harness_anchor_by_content), ומאומת
// שהוא אכן נושא את הדד-ליין — אחרת העוגן תפס גרסה ישנה וההרנס היה מדווח "עבר" על קוד שגוי.
const fs = require('fs'), vm = require('vm');
const FILES = ['welcome.html', 'home.html', 'profile.html', 'business.html',
               'business-dashboard.html', 'fan-register.html', 'terms.html', 'admin-dashboard.html'];
const H1 = 'api.yellowzone.co.il', H2 = 'habayit-hatsahov.web.app', H3 = 'habayit-hatsahov-worker.yellowzone.workers.dev';

function extract(file) {
  const src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf('HB_API_HOSTS = [');
  const start = src.lastIndexOf('const', a);
  const endMark = 'return tryHost(0);';
  const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error(file + ': לא נמצא הבלוק');
  const close = src.indexOf('};', b);
  const code = src.slice(start, close + 2);
  if (!code.includes('HB_HOST_TIMEOUT_MS')) throw new Error(file + ': נשלף בלוק בלי דד-ליין');
  return code;
}
function makeFetch(behavior, log) {
  return (url, opts) => new Promise((resolve, reject) => {
    const host = new URL(url).host;
    const b = behavior(host);
    log.push(host + ' (' + b.kind + ')');
    if (b.kind === 'reject') setTimeout(() => reject(Object.assign(new Error('net'), { name: 'TypeError' })), b.ms || 40);
    else if (b.kind === 'ok') setTimeout(() => resolve({ ok: true, host }), b.ms || 80);
    if (opts && opts.signal) opts.signal.addEventListener('abort',
      () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}
async function run(code, behavior, outerMs) {
  const log = [];
  const box = { fetch: makeFetch(behavior, log), setTimeout, clearTimeout, AbortController, console,
                window: {}, URL };
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__f = hbApiFetch;', box);
  const st = {}, ac = new AbortController();
  const ot = outerMs ? setTimeout(() => ac.abort(), outerMs) : null;
  const t0 = Date.now();
  let host = null, err = null;
  try { host = (await box.__f('/mint-member-token', { method: 'POST', signal: ac.signal }, st)).host; }
  catch (e) { err = e.name; }
  if (ot) clearTimeout(ot);
  return { host, err, via: st.via, ms: Date.now() - t0, log };
}
(async () => {
  let bad = 0;
  for (const f of FILES) {
    const code = extract(f);
    const hasSt = code.includes('state.via');
    const r1 = await run(code, h => h === H1 ? { kind: 'hang' } : { kind: 'ok', ms: 300 }, 35000);
    const r2 = await run(code, h => (h === H1 || h === H2) ? { kind: 'hang' } : { kind: 'ok', ms: 400 }, 35000);
    const r3 = await run(code, h => h === H1 ? { kind: 'reject' } : { kind: 'ok' }, 35000);
    const r4 = await run(code, () => ({ kind: 'hang' }), 1200);
    const r5 = await run(code, () => ({ kind: 'ok' }), 35000);
    const checks = [
      ['תלייה → כתובת 2',            r1.host === H2 && r1.ms < 8000 && (!hasSt || r1.via === 1)],
      ['שתי תליות → כתובת 3, <8 שנ\'', r2.host === H3 && r2.ms < 8000 && (!hasSt || r2.via === 2)],
      ['כשל מהיר מקדם מיד',          r3.host === H2 && r3.ms < 1000],
      ['ביטול הקורא עוצר ולא מקדם',  r4.err === 'AbortError' && (!hasSt || r4.via === 0)],
      ['מסלול תקין — בלי קפיצה',      r5.host === H1 && (!hasSt || r5.via === 0)],
    ];
    const fail = checks.filter(c => !c[1]);
    if (fail.length) { bad++; console.log('❌ ' + f + '  →  ' + fail.map(c => c[0]).join(' · ')); console.log('   ' + JSON.stringify({r1,r2,r3,r4,r5})); }
    else console.log('✔ ' + f.padEnd(24) + '5/5' + (hasSt ? '  (כולל state.via)' : '  (בלי st)')
                     + '   תלייה נפתרה ב-' + r1.ms + 'ms, שתי תליות ב-' + r2.ms + 'ms');
  }
  console.log(bad ? '\n❌ ' + bad + ' קבצים נכשלו' : '\n✅ כל 8 הקבצים — 5/5');

  // ══ §403 — החימום ═══════════════════════════════════════════════════════════════════
  // רק ב-welcome.html: הוא הדף היחיד שבו אדם ממתין מול מסך-כניסה.
  console.log('\n══ §403 — חימום ══');
  const code = extract('welcome.html');
  async function warmRun(pingBehavior, callBehavior) {
    const log = [];
    const box = { fetch: makeFetch(pingBehavior, log), setTimeout, clearTimeout, AbortController,
                  console, window: {}, URL, Promise };
    vm.createContext(box);
    vm.runInContext(code + '\n; globalThis.__f = hbApiFetch;', box);
    box.window.hbApiWarm();
    await new Promise(r => setTimeout(r, 4300));   // מעבר ל-HB_WARM_MS
    const log2 = [];
    box.fetch = makeFetch(callBehavior, log2);
    const st = {};
    let host = null;
    try { host = (await box.__f('/mint-member-token', { method: 'POST' }, st)).host; } catch (e) {}
    return { host, via: st.via, warm: st.warm, ping: log, call: log2 };
  }
  const wChecks = [];
  // 1. הראשית חסומה בחימום → הכניסה מתחילה מהשנייה, בלי לשלם 3.5 שניות
  const w1 = await warmRun(h => h === H1 ? { kind: 'reject' } : { kind: 'ok' },
                           h => h === H1 ? { kind: 'hang' } : { kind: 'ok' });
  wChecks.push(['חימום מדלג על כתובת חסומה', w1.host === H2 && w1.via === 1 && w1.warm === true]);
  wChecks.push(['ובלי לגעת בכתובת החסומה בכלל', w1.call.length === 1]);
  // 2. הראשית עונה → שום דבר לא משתנה, גם אם היא האיטית
  const w2 = await warmRun(h => h === H1 ? { kind: 'ok', ms: 900 } : { kind: 'ok', ms: 50 },
                           () => ({ kind: 'ok' }));
  wChecks.push(['הראשית ענתה — הסדר נשאר, גם כשהיא האיטית', w2.host === H1 && w2.via === 0 && w2.warm === false]);
  // 3. אף אחת לא ענתה בחימום → נופלים בדיוק להתנהגות של §402
  const w3 = await warmRun(() => ({ kind: 'reject' }),
                           h => h === H1 ? { kind: 'hang' } : { kind: 'ok' });
  wChecks.push(['חימום שנכשל כולו — חוזרים להתנהגות §402', w3.host === H2 && w3.warm === false]);
  // 4. החימום פונה לשלוש הכתובות, ולנתיב /ping
  wChecks.push(['החימום בדק את שלוש הכתובות', w1.ping.length === 3]);
  for (const [t, ok] of wChecks) console.log((ok ? '✅' : '❌') + ' ' + t);
  if (wChecks.some(c => !c[1])) { console.log(JSON.stringify({ w1, w2, w3 }, null, 1)); process.exit(1); }
})();
