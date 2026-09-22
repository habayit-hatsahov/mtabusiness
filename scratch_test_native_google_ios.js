// ══ §451 — בדיקות לשער ה-iOS ב-native-google.js ══════════════════════════════════════════
//
// 🔑 **מריץ את `native-google.js` האמיתי** בתוך jsdom, מול גשר Capacitor מדומה.
// הרקע: `npx cap add ios` (22.9) אישר שתוסף Google **נארז לאייפון** — הוא ב-`package.json`
// מאז אנדרואיד, ו-SPM אינו מפריד לפי פלטפורמה. כלומר `hasPlugin()` אמת באייפון **בלי
// שאיש בחר בזה**, וה-mode היה מחזיר 'native'.
//
// 🔴 **מה שהבדיקה הזאת שומרת עליו יותר מכל:** שאייפון **בספארי** ימשיך לקבל 'web'.
// חסימה לפי מערכת-הפעלה בלבד הייתה מכבה את הכניסה עם גוגל לכל גולשי האייפון באתר.
//
// הרצה:  node scratch_test_native_google_ios.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const SRC = fs.readFileSync(path.join(__dirname, 'native-google.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

// opts: { ua, plugin, platform (getPlatform), noGetPlatform }
function build(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: opts.ua || 'Mozilla/5.0', configurable: true });

  if (opts.bridge) {
    const cap = {
      nativePromise: () => Promise.resolve({}),
      Plugins: opts.plugin ? { GoogleSignIn: {} } : {},
      isPluginAvailable: (n) => !!opts.plugin && n === 'GoogleSignIn',
    };
    // ⚠️ ניתן להשמיט את getPlatform בכוונה — כדי לבדוק את הנפילה-לאחור ל-UA.
    if (!opts.noGetPlatform) cap.getPlatform = () => opts.platform || 'android';
    w.Capacitor = cap;
  }

  const s = w.document.createElement('script');
  s.textContent = SRC;
  w.document.head.appendChild(s);
  return w.YZNativeGoogle;
}

const UA_IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) YellowZoneApp';
const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605 Safari/604';
const UA_ANDROID_APP = 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/140';

console.log('\n── 1. 🔴 אייפון: אפליקציה מול ספארי ──');
{
  const iosApp = build({ ua: UA_IPHONE_APP, bridge: true, plugin: true, platform: 'ios' });
  check("אפליקציית אייפון + תוסף → 'blocked' (אין כפתור Google)", iosApp.mode() === 'blocked', iosApp.mode());

  // 🔴 זו הבדיקה שמגינה על 88.2% מהאוהדים.
  const iosSafari = build({ ua: UA_IPHONE_SAFARI });
  check("🔑 אייפון בספארי → 'web' (הכפתור נשאר!)", iosSafari.mode() === 'web', iosSafari.mode());
}

console.log('\n── 2. אנדרואיד לא נפגע ──');
{
  const androidApp = build({ ua: UA_ANDROID_APP, bridge: true, plugin: true, platform: 'android' });
  check("אפליקציית אנדרואיד + תוסף → 'native'", androidApp.mode() === 'native', androidApp.mode());

  const androidOld = build({ ua: UA_ANDROID_APP, bridge: true, plugin: false, platform: 'android' });
  check("אנדרואיד בלי תוסף (גרסה 1.0) → 'blocked'", androidOld.mode() === 'blocked', androidOld.mode());

  const desktop = build({ ua: UA_DESKTOP });
  check("דפדפן רגיל → 'web'", desktop.mode() === 'web', desktop.mode());
}

console.log('\n── 3. הנפילה-לאחור כשאין getPlatform בגשר ──');
{
  // גרסת-גשר ישנה. בלי הנפילה-לאחור `getPlatform` היה undefined והכפתור השבור היה חוזר.
  const iosNoApi = build({ ua: UA_IPHONE_APP, bridge: true, plugin: true, noGetPlatform: true });
  check("אייפון בלי getPlatform → עדיין 'blocked' (זוהה מה-UA)", iosNoApi.mode() === 'blocked', iosNoApi.mode());

  const androidNoApi = build({ ua: UA_ANDROID_APP, bridge: true, plugin: true, noGetPlatform: true });
  check("אנדרואיד בלי getPlatform → עדיין 'native'", androidNoApi.mode() === 'native', androidNoApi.mode());
}

console.log('\n── 4. getPlatform גובר על ה-UA ──');
{
  // ⚠️ iPad מדווח לפעמים UA של מק. הגשר הוא מקור-האמת כשהוא קיים.
  const ipadDesktopUa = build({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) YellowZoneApp',
    bridge: true, plugin: true, platform: 'ios',
  });
  check("UA של מק אבל getPlatform='ios' → 'blocked'", ipadDesktopUa.mode() === 'blocked', ipadDesktopUa.mode());
}

console.log('\n── 5. inApp/surface לא השתנו ──');
{
  // ⚠️ `welcome.html` ו-`apple-signup.js` גוזרים "בתוך אפליקציה" מ-`mode() !== 'web'`.
  // אם השער היה מחזיר 'web' באייפון, **כפתור אפל של ה-web היה חוזר לאפליקציה** —
  // כלומר הדף הלבן של §434. 'blocked' הוא מה ששומר על הגזירה הזאת.
  const iosApp = build({ ua: UA_IPHONE_APP, bridge: true, plugin: true, platform: 'ios' });
  check("🔑 mode() !== 'web' — הגוזרים ממשיכים לזהות אפליקציה", iosApp.mode() !== 'web', iosApp.mode());
  check('inApp() עדיין true', iosApp.inApp() === true);
  check("surface() עדיין 'app'", iosApp.surface() === 'app', iosApp.surface());
}

console.log('\n── 6. ההחלטה מתועדת בקוד ולא רק בתיעוד ──');
{
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('isIosApp קיימת בקוד', /function isIosApp\(\)/.test(CODE));
  check('mode משתמשת בה', /!isIosApp\(\)/.test(CODE));
  check('getPlatform נקראת דרך typeof (לא גישה עיוורת)', /typeof c\.getPlatform === 'function'/.test(CODE));

  // ⚠️ 🔑 **הבהרה שנקנתה בשבירה מכוונת, ולא הנחה:** הוצאת `if (!inApp()) return false;`
  // מתוך `isIosApp` **אינה מפילה אף בדיקה כאן** — כי `mode()` קוראת לה רק אחרי
  // `c && hasPlugin(c)`, ובאייפון בספארי אין גשר ולכן היא לא נקראת בכלל.
  //
  // כלומר **ההגנה על ספארי מגיעה ממבנה `mode()` ולא מהשורה ההיא.** השורה נשארת כדי
  // שהפונקציה תהיה נכונה **בשם שלה** — `isIosApp` שמחזירה true לאייפון בספארי היא
  // מלכודת לכל קורא עתידי. הבדיקה למטה נועלת את שני החלקים בנפרד.
  check('🔑 ההגנה על ספארי היא במבנה mode(): hasPlugin נבדקת לפני isIosApp',
        /hasPlugin\(c\)\s*&&\s*!isIosApp\(\)/.test(CODE), 'הסדר ב-mode()');
  check('ו-isIosApp נכונה גם לבדה (שער inApp בתוכה)',
        /function isIosApp\(\)\s*\{\s*if \(!inApp\(\)\) return false;/.test(CODE));
}

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `✅ הכל עבר — ${pass}/${pass + fail}` : `❌ ${fail} נכשלו מתוך ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
