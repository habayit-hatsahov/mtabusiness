// ══ §453 — בדיקות לכניסה עם Google באפליקציית iOS ════════════════════════════════════════
//
// 🔑 **הקובץ הזה נולד ב-§451 כדי לנעול את ההפך** — ששום כפתור Google לא יוצג באייפון.
// §453 הפך את ההחלטה (נוצר iOS OAuth client), ולכן הבדיקות הפוכות. **מה שנשאר זהה הוא
// הדבר היחיד שבאמת מסוכן כאן: התצורה.**
//
// 🔴 **הסיכון שהקובץ הזה קיים בשבילו:** ב-iOS יש **שני** מזהים שונים —
//   · `GIDClientID` + URL scheme ב-`Info.plist` = ה-**iOS client**
//   · `initialize()` ב-`native-google.js`       = ה-**web client** (וגם ה-aud שהוורקר מאמת)
// החלפה ביניהם, או תו אחד שגוי ב-scheme ההפוך, **אינה נראית כשגיאת תצורה**: הבורר
// הנייטיב כן נפתח, והכשל מגיע רק אחרי בחירת החשבון. זה בדיוק §439 (ה-SHA-1) בלבוש אחר,
// והוא עלה שם שעות. ר' [[feedback_absence_of_evidence]].
//
// ⚠️ **מה שלא ניתן לבדוק כאן:** שהמזהים באמת רשומים אצל Google, ושהזרימה עובדת על מכשיר.
//
// הרצה:  node scratch_test_native_google_ios.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const SRC = fs.readFileSync(path.join(__dirname, 'native-google.js'), 'utf8');
const PLIST = fs.readFileSync(path.join(__dirname, 'app', 'ios', 'App', 'App', 'Info.plist'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + detail : '')); }
}

function build(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: opts.ua || 'Mozilla/5.0', configurable: true });
  if (opts.bridge) {
    w.Capacitor = {
      nativePromise: () => Promise.resolve({}),
      Plugins: opts.plugin ? { GoogleSignIn: {} } : {},
      isPluginAvailable: (n) => !!opts.plugin && n === 'GoogleSignIn',
      getPlatform: () => opts.platform || 'android',
    };
  }
  const s = w.document.createElement('script');
  s.textContent = SRC;
  w.document.head.appendChild(s);
  return w.YZNativeGoogle;
}

const UA_IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) YellowZoneApp';
const UA_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605 Safari/604';
const UA_ANDROID_APP = 'Mozilla/5.0 (Linux; Android 14) YellowZoneApp';

console.log('\n── 1. §453 — אייפון מקבל Google, וספארי לא נפגע ──');
{
  const iosApp = build({ ua: UA_IPHONE_APP, bridge: true, plugin: true, platform: 'ios' });
  check("אפליקציית אייפון + תוסף → 'native'", iosApp.mode() === 'native', iosApp.mode());

  // 🔴 הבדיקה ששמרה עלינו ב-§451 וממשיכה לשמור: אייפון בספארי הוא דפדפן רגיל.
  const iosSafari = build({ ua: UA_IPHONE_SAFARI });
  check("אייפון בספארי → 'web' (ה-SDK הרגיל)", iosSafari.mode() === 'web', iosSafari.mode());
}

console.log('\n── 2. אנדרואיד לא נגע ──');
{
  const androidApp = build({ ua: UA_ANDROID_APP, bridge: true, plugin: true, platform: 'android' });
  check("אפליקציית אנדרואיד + תוסף → 'native'", androidApp.mode() === 'native', androidApp.mode());

  const androidOld = build({ ua: UA_ANDROID_APP, bridge: true, plugin: false, platform: 'android' });
  check("אנדרואיד בלי תוסף (גרסה 1.0) → 'blocked'", androidOld.mode() === 'blocked', androidOld.mode());

  const desktop = build({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' });
  check("דפדפן רגיל → 'web'", desktop.mode() === 'web', desktop.mode());
}

console.log('\n── 3. השער של §451 אכן הוסר ולא רוכך ──');
{
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('אין יותר isIosApp בקוד', !/isIosApp/.test(CODE));
  check('mode() פשוטה: hasPlugin בלבד', /if \(c && hasPlugin\(c\)\) return 'native';/.test(CODE));
  check('ההיסטוריה כן תועדה (§451/§453 בהערות)', /§451/.test(SRC) && /§453/.test(SRC));
}

// ══ 4. 🔴 נעילת התצורה — זה הלב של הקובץ ═════════════════════════════════════════════════
console.log('\n── 4. 🔴 שלושת המזהים נעולים זה לזה ──');
{
  const gid = (PLIST.match(/<key>GIDClientID<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
  const scheme = (PLIST.match(/<string>(com\.googleusercontent\.apps\.[^<]+)<\/string>/) || [])[1];
  const webId = (SRC.match(/var CLIENT_ID = '([^']+)'/) || [])[1];

  check('GIDClientID קיים ב-Info.plist', !!gid, gid);
  check('URL scheme קיים ב-Info.plist', !!scheme, scheme);
  check('CLIENT_ID קיים ב-native-google.js', !!webId, webId && webId.slice(0, 22) + '…');

  // ⚠️ **ה-scheme הוא ה-id ההפוך.** תו אחד שגוי והבורר ייפתח ויתפוצץ אחרי בחירת החשבון.
  const expected = 'com.googleusercontent.apps.' + String(gid).replace('.apps.googleusercontent.com', '');
  check('🔑 ה-URL scheme הוא בדיוק ה-GIDClientID ההפוך', scheme === expected, scheme + '\n     צפוי: ' + expected);

  // 🔴 **ואסור שיהיו זהים.** החלפה ביניהם היא הטעות הקלה ביותר לעשות וקשה ביותר לאבחן.
  check('🔴 ה-web client שונה מה-iOS client', !!webId && !!gid && webId !== gid);
  check('web client מסתיים ב-.apps.googleusercontent.com', /\.apps\.googleusercontent\.com$/.test(webId || ''));

  // שניהם חייבים לשבת באותו פרויקט — הקידומת היא מספר הפרויקט.
  const proj = (s) => String(s).split('-')[0];
  check('🔑 שני המזהים מאותו פרויקט (אותה קידומת)', proj(webId) === proj(gid),
        proj(webId) + ' מול ' + proj(gid));

  // ⚠️ עוגן מפורש: אם מספר הפרויקט ישתנה אי-פעם, שיישבר כאן ולא על מכשיר.
  check('מספר הפרויקט הוא 459607487972', proj(gid) === '459607487972', proj(gid));
}

console.log('\n── 5. Info.plist תקין מבנית ──');
{
  check('CFBundleURLTypes קיים', /<key>CFBundleURLTypes<\/key>/.test(PLIST));
  check('CFBundleURLSchemes בתוכו', /<key>CFBundleURLSchemes<\/key>/.test(PLIST));
  // ⚠️ plist פגום אינו נכשל בבנייה — הוא פשוט מתעלם מהמפתח. ספירת תגיות היא הגלאי הזול.
  const open = (PLIST.match(/<dict>/g) || []).length, close = (PLIST.match(/<\/dict>/g) || []).length;
  check('מאזן תגיות <dict>', open === close, open + ' פתוחות מול ' + close + ' סגורות');
  const aOpen = (PLIST.match(/<array>/g) || []).length, aClose = (PLIST.match(/<\/array>/g) || []).length;
  check('מאזן תגיות <array>', aOpen === aClose, aOpen + ' מול ' + aClose);
}

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `✅ הכל עבר — ${pass}/${pass + fail}` : `❌ ${fail} נכשלו מתוך ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
