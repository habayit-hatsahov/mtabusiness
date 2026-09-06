// §420ב — הרנס לזיהוי "מי רואה את שורת המחיקה".
//
// 🔑 **למה הרנס ולא בדיקה בדפדפן:** שתי ההסתעפויות המסוכנות אינן ניתנות לדימוי בדפדפן
// הפנימי — `window.Capacitor` חייב להתקיים **לפני** שהמודול רץ, ו-User Agent אינו ניתן
// לשינוי לפני טעינה. בדפדפן אומתו שני המצבים הנצפים (אתר רגיל = מוסתר, ?delete=1 = גלוי);
// כאן נבדקות ארבע ההסתעפויות הפנימיות.
//
// ⚠️ **הקוד נשלף מ-profile.html עצמו** ולא משוכפל לכאן — הרנס עם עותק של הלוגיקה בודק
// את העותק. ר' feedback_verification_must_run_the_producer.
//
//   node scratch_test_delete_gate.js
//
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf8');
const START = 'function yzInApp() {';
const END = 'if (document.readyState !== \'loading\') revealDeleteRow();';
const i = html.indexOf(START);
const j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצא בלוק ההסתרה ב-profile.html');
const block = html.slice(i, j);   // בלי שתי שורות ההפעלה — ההרנס קורא ידנית

function run({ hasCapacitor, ua, bannerInApp, bannerMissing, search }) {
  const row = { style: { display: 'none' } };
  const win = {};
  if (hasCapacitor) win.Capacitor = {};
  if (!bannerMissing) win.YZAppBanner = { inApp: () => bannerInApp };

  const sandbox = {
    window: win,
    navigator: { userAgent: ua },
    // ההרנס קורא ל-revealDeleteRow ידנית; המאזין עצמו נבלע (הבלוק הנשלף כולל אותו)
    document: { getElementById: (id) => (id === 'deleteAccountRow' ? row : null), addEventListener: () => {} },
    location: { search },
    URLSearchParams,
  };
  // הפניה עצמית, כדי ש-`window.Capacitor` בתוך הקוד יפתור נכון
  sandbox.window = win;

  const fn = new Function('window', 'navigator', 'document', 'location', 'URLSearchParams',
    block + '\nreturn { yzInApp: yzInApp, revealDeleteRow: revealDeleteRow };');
  const api = fn(sandbox.window, sandbox.navigator, sandbox.document, sandbox.location, URLSearchParams);
  api.revealDeleteRow();
  return { inApp: api.yzInApp(), visible: row.style.display !== 'none' };
}

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const APPUA = CHROME + ' YellowZoneApp';

const CASES = [
  { t: 'אתר רגיל — מוסתר',
    o: { hasCapacitor: false, ua: CHROME, bannerInApp: false, search: '' }, want: false },
  { t: 'בתוך האפליקציה (Capacitor) — גלוי',
    o: { hasCapacitor: true, ua: CHROME, bannerInApp: true, search: '' }, want: true },
  { t: 'בתוך האפליקציה (UA בלבד, לפני שהגשר הוזרק) — גלוי',
    o: { hasCapacitor: false, ua: APPUA, bannerInApp: true, search: '' }, want: true },
  { t: '?delete=1 מהדף הציבורי — גלוי',
    o: { hasCapacitor: false, ua: CHROME, bannerInApp: false, search: '?delete=1' }, want: true },
  { t: '?delete=0 — לא נפתח על כל ערך',
    o: { hasCapacitor: false, ua: CHROME, bannerInApp: false, search: '?delete=0' }, want: false },
  // 🔑 שתי הבדיקות שבשבילן הנפילה-לאחור נכתבה
  { t: 'app-banner.js לא נטען + UA של האפליקציה — גלוי (אחרת Play דוחה)',
    o: { hasCapacitor: false, ua: APPUA, bannerMissing: true, search: '' }, want: true },
  { t: 'app-banner.js לא נטען + דפדפן רגיל — עדיין מוסתר',
    o: { hasCapacitor: false, ua: CHROME, bannerMissing: true, search: '' }, want: false },
  { t: 'app-banner.js זורק — לא מפיל את הדף, נופל ל-UA',
    o: { hasCapacitor: false, ua: APPUA, bannerInApp: null, search: '',
         throwing: true }, want: true },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  let res, err = null;
  try {
    if (c.o.throwing) {
      // גרסה מיוחדת: המודול קיים אבל inApp זורק
      const row = { style: { display: 'none' } };
      const win = { YZAppBanner: { inApp: () => { throw new Error('boom'); } } };
      const fn = new Function('window', 'navigator', 'document', 'location', 'URLSearchParams',
        block + '\nreturn { yzInApp: yzInApp, revealDeleteRow: revealDeleteRow };');
      const api = fn(win, { userAgent: c.o.ua },
        { getElementById: () => row, addEventListener: () => {} }, { search: '' }, URLSearchParams);
      api.revealDeleteRow();
      res = { visible: row.style.display !== 'none' };
    } else {
      res = run(c.o);
    }
  } catch (e) { err = e; }
  if (err) { console.log(`✗ ${c.t} — זרקה: ${err.message}`); fail++; continue; }
  if (res.visible !== c.want) {
    console.log(`✗ ${c.t} — ציפינו visible=${c.want}, קיבלנו ${res.visible}`); fail++; continue;
  }
  console.log(`✓ ${c.t}`);
  pass++;
}
console.log(`\n${pass}/${CASES.length} עברו${fail ? ` · ${fail} נכשלו` : ''}`);
process.exit(fail ? 1 : 0);
