// §486 — בדיקות ל-usage-track.js עם שעון מדומה. הקוד נטען מהקובץ עצמו.
// הרצה: node scratch_test_usage_track.js
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/usage-track.js', 'utf8');
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
};

// "מכשיר" = localStorage שנשמר בין טעינות; "סשן" = sessionStorage (נשמר במעבר דף, נמחק בסגירה)
function device() { return { local: {}, session: {}, sent: [], now: 1_000_000 }; }

// טוען "דף" על המכשיר. מחזיר פקדים: advance(ms) מריץ את ה-interval, hide()/show(), leave().
function page(d, { host = 'yellowzone.co.il', os = 'ios', surface = 'app', memberId } = {}) {
  if (memberId) d.local.hb_memberId = memberId;
  const mk = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
  const listeners = {}; const winListeners = {};
  let interval = null; let vis = 'visible';
  const doc = { get visibilityState() { return vis; }, addEventListener: (t, f) => { listeners[t] = f; } };
  const win = { hbSignupSource: { os: () => os, surface: () => surface }, addEventListener: (t, f) => { winListeners[t] = f; } };
  const DateMock = { now: () => d.now };
  const g = {
    window: win, document: doc, location: { hostname: host, pathname: '/home.html' },
    localStorage: mk(d.local), sessionStorage: mk(d.session), Date: DateMock, Math, JSON, String,
    setInterval: (f) => { interval = f; },
    fetch: (url, opt) => { const w = JSON.parse(opt.body).writes[0].update.fields; d.sent.push({ type: w.type.stringValue, channel: w.channel.stringValue, dev: w.blockId.stringValue, member: w.memberId.stringValue || null }); return Promise.resolve(); },
  };
  new Function(...Object.keys(g), code)(...Object.values(g));
  const advance = (ms) => { for (let t = 0; t < ms; t += 5000) { d.now += 5000; interval && interval(); } };
  return {
    advance,
    hide: () => { vis = 'hidden'; listeners.visibilitychange && listeners.visibilitychange(); },
    show: () => { vis = 'visible'; listeners.visibilitychange && listeners.visibilitychange(); },
    leave: () => { vis = 'hidden'; listeners.visibilitychange && listeners.visibilitychange(); winListeners.pagehide && winListeners.pagehide(); },
    // מעבר דף שבו הדפדפן יורה רק pagehide, בלי visibilitychange (קורה בניווט בחלק מה-WebView-ים)
    navPagehideOnly: () => { winListeners.pagehide && winListeners.pagehide(); },
  };
}
const types = (d) => d.sent.map((e) => `${e.type}:${e.channel}`);

// 1. התקנה ופתיחה ראשונה
let d = device();
let p = page(d);
eq('first open → visit first', types(d), ['visit:app:ios:first']);
p.advance(35e3);
eq('30s milestone', types(d).slice(1), ['engaged:app:30s']);

// 2. מעבר דף באותו ביקור — לא ביקור חדש, והשעון ממשיך (30s לא נשלח שוב, 2m כן)
p.leave(); d.now += 1000;
p = page(d);
p.advance(90e3);
eq('page nav keeps visit + clock', types(d), ['visit:app:ios:first', 'engaged:app:30s', 'engaged:app:2m']);

// 3. רקע ל-10 דק' — אותו ביקור; רקע ל-31 דק' — ביקור חדש (return)
p.hide(); d.now += 10 * 60e3; p.show();
eq('10m background: same visit', types(d).length, 3);
p.hide(); d.now += 31 * 60e3; p.show();
eq('31m background: new visit, return', types(d)[3], 'visit:app:ios:return');
p.advance(35e3);
eq('new visit restarts milestones', types(d)[4], 'engaged:app:30s');

// 4. סגירת האפליקציה ופתיחה מחר — סשן חדש, אותו מכשיר → return
const devId = d.sent[0].dev;
d.session = {}; d.now += 24 * 3600e3;
page(d, { memberId: 'M1' });
eq('next day: return', types(d).slice(-1), ['visit:app:ios:return']);
eq('same device id', d.sent.slice(-1)[0].dev, devId);
eq('memberId attached', d.sent.slice(-1)[0].member, 'M1');
eq('device id format', /^d_[a-z0-9]{12}$/.test(devId), true);

// 5. זמן ברקע לא נספר: 3 דק' מוסתר לא מייצרות 2m
d = device(); p = page(d); p.advance(20e3); p.hide(); d.now += 3 * 60e3; p.advance(0); p.show(); p.advance(5e3);
eq('hidden time not counted', types(d), ['visit:app:ios:first']);

// 6. מעבר דף, 40 דק' שימוש רציף, ואז מעבר שיורה רק pagehide — לא "ביקור חדש" בטעות.
//    בלי ניקוי hiddenAt בטעינה, נשאר hiddenAt מהמעבר הראשון (לפני 40 דק') והדף הבא היה פותח ביקור.
d = device(); p = page(d); p.leave(); d.now += 1000; p = page(d); p.advance(40 * 60e3); p.navPagehideOnly(); d.now += 1000; page(d);
eq('long continuous use + nav: one visit', types(d).filter((t) => t.startsWith('visit')).length, 1);
eq('all 5 milestones once', types(d).filter((t) => t.startsWith('engaged')), ['engaged:app:30s', 'engaged:app:2m', 'engaged:app:5m', 'engaged:app:15m', 'engaged:app:30m']);

// 7. לא מהדומיין החי — שקט מוחלט
d = device(); page(d, { host: 'localhost' }).advance(60e3);
eq('localhost: nothing sent', d.sent.length, 0);
d = device(); page(d, { host: 'mtabusiness.netlify.app' });
eq('netlify copy: nothing sent', d.sent.length, 0);

// 8. אתר בדפדפן במחשב
d = device(); page(d, { os: 'desktop', surface: 'web' });
eq('desktop web channel', types(d), ['visit:web:desktop:first']);

console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
