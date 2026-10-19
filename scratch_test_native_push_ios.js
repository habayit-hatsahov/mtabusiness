// §457 — native-push.js: באייפון אין פוש (עדיין), באנדרואיד ללא שינוי.
//
// 🔑 מריץ את `native-push.js` האמיתי (ה-harness של scratch_test_push_menu מדמה את
// `available()` — כלומר הוא אינו יכול לתפוס שינוי בשער עצמו). גשר Capacitor מדומה לפי פלטפורמה,
// שרושם כל קריאה לתוסף — כדי לוודא שבאייפון **לא** נשלחת אף בקשת-הרשאה.
//
//   node scratch_test_native_push_ios.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'native-push.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

function load(platform, ua) {
  const calls = [];
  const store = {};
  const win = {
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  };
  if (platform) {
    win.Capacitor = {
      getPlatform: () => platform,
      nativePromise: async (plugin, method) => { calls.push(plugin + '.' + method);
        if (method === 'checkPermissions') return { receive: 'prompt' };
        if (method === 'requestPermissions') return { receive: 'granted' };
        return {}; },
      addListener: (plugin, ev, cb) => { calls.push('listen:' + ev);
        if (ev === 'registration') setTimeout(() => cb({ value: 'tok-' + platform }), 5);
        return { remove() {} }; },
    };
  }
  const ctx = { window: win, navigator: { userAgent: ua || '' }, localStorage: win.localStorage, setTimeout, clearTimeout, console, Promise };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { api: win.YZNativePush, calls };
}

(async () => {
  console.log('\n── השער לפי פלטפורמה ──');
  const ios = load('ios');
  check('🔑 iOS → available() = false', ios.api.available() === false);
  const r = await ios.api.register();
  check('iOS → register() מחזיר no_bridge', r.ok === false && r.reason === 'no_bridge', JSON.stringify(r));
  // מאזיני הלחיצה/החזית (§501) נרשמים בכל טעינה ואינם בקשה – נספרות רק קריאות לתוסף
  const iosReq = ios.calls.filter((c) => !c.startsWith('listen:pushNotification'));
  check('🔑 iOS → אף קריאה לתוסף (לא נשרפה בקשת-הרשאה)', iosReq.length === 0, iosReq.join(','));
  check('iOS → permissionState = unavailable', (await ios.api.permissionState()) === 'unavailable');

  // §558 — בנייה חדשה (YZPush/1 ב-User-Agent): באייפון נפתח ונרשם
  const ios2 = load('ios', 'Mozilla/5.0 (iPhone) AppleWebKit YellowZoneApp YZPush/1');
  check('🔑 iOS עם YZPush/1 → available() = true', ios2.api.available() === true);
  const r2 = await ios2.api.register();
  check('iOS עם YZPush/1 → register() מחזיר טוקן', r2.ok === true && r2.token === 'tok-ios' && r2.platform === 'ios', JSON.stringify(r2));
  const ios3 = load('ios', 'Mozilla/5.0 (iPhone) AppleWebKit YellowZoneApp');
  check('🔑 iOS בנייה ישנה (בלי YZPush) → available() = false', ios3.api.available() === false);
  const and2 = load('android', 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp YZSplash/2');
  check('אנדרואיד עם UA אמיתי → available() = true', and2.api.available() === true);

  const and = load('android');
  check('אנדרואיד → available() = true (ללא שינוי)', and.api.available() === true);
  const ra = await and.api.register();
  check('אנדרואיד → register() עדיין מצליח ומחזיר טוקן', ra.ok === true && ra.token === 'tok-android' && ra.platform === 'android', JSON.stringify(ra));

  const web = load(null);
  check('דפדפן (בלי Capacitor) → available() = false', web.api.available() === false);

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail ? 1 : 0);
})();
