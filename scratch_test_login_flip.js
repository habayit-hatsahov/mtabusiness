// ══ §415ב — בדיקת ההיפוך במסך הכניסה ═══════════════════════════════════════════════════════
// ⚠️ **בדיקה מבנית, ואומרת את זה במפורש:** ההיפוך עצמו הוא CSS + DOM, ואי אפשר להריץ אותו
// בלי דפדפן. מה שכן אפשר לאמת כאן הוא **מה שמסוכן לשבור בשקט** — ובראשו התנאי שכל ההגנה
// נשענת עליו: שמסלול הקוד פתוח כברירת-מחדל, ומתקפל **רק** בענף שאימת שכפתור גוגל צויר.
// אם מישהו יעביר יום אחד את `google-first` למרקאפ הסטטי או לענף מוקדם יותר, מי שמגיע
// מדפדפן משובץ (וואטסאפ/אינסטגרם) יקבל מסך התחברות בלי שום דרך להתחבר — §354.
// הרצה: node scratch_test_login_flip.js
const fs = require('fs');

const w = fs.readFileSync('welcome.html', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (cond ? '' : '  ← ' + (extra === undefined ? '' : extra)));
  if (!cond) fails++;
}

console.log('\n── 1. הסדר במסך: Google מעל, קוד מתחת ───────────────────');
const iGoogle = w.indexOf('id="gsLoginHost"');
const iToggle = w.indexOf('id="heroCodeToggle"');
const iCode = w.indexOf('id="heroCodePath"');
const iPhone = w.indexOf('id="heroPhoneInput"');
check('בלוק Google קיים', iGoogle > 0);
check('Google מופיע לפני כפתור "כניסה עם טלפון וקוד"', iGoogle < iToggle, `${iGoogle} < ${iToggle}`);
check('הכפתור מופיע לפני שדות הקוד', iToggle < iCode, `${iToggle} < ${iCode}`);
check('שדה הטלפון יושב בתוך מסלול הקוד', iCode < iPhone, `${iCode} < ${iPhone}`);

console.log('\n── 2. 🔴 fail-open: הקוד פתוח עד שמוכח אחרת ─────────────');
const bodyTag = w.match(/<div class="login-modal-body"[^>]*>/);
check('אלמנט login-modal-body קיים', !!bodyTag);
check('⚠️ המרקאפ הסטטי אינו נושא google-first', !!bodyTag && !bodyTag[0].includes('google-first'), bodyTag && bodyTag[0]);
const addCalls = (w.match(/classList\.add\('google-first'\)/g) || []).length;
check('יש בדיוק מקום אחד שמקפל את מסלול הקוד', addCalls === 1, addCalls);

// הקיפול חייב לשבת **אחרי** הבדיקה שהכפתור באמת צויר, בתוך אותה פונקציה.
const fnStart = w.indexOf('window.hbRenderGoogleLoginBtn = function');
const fnEnd = w.indexOf('\n};', fnStart);
const fn = w.slice(fnStart, fnEnd);
check('הקיפול נמצא בתוך hbRenderGoogleLoginBtn', fn.includes("classList.add('google-first')"));
const iVerify = fn.indexOf('childElementCount');
const iCollapse = fn.indexOf("classList.add('google-first')");
check('⚠️ הקיפול בא אחרי אימות שהכפתור צויר', iVerify > 0 && iVerify < iCollapse, `verify@${iVerify} collapse@${iCollapse}`);
check('לא מקפלים למי שכבר הקליד (בדיקת touched)', fn.includes('touched') && fn.includes('heroPhoneInput'));

console.log('\n── 3. כשל בגוגל פותח את הקוד מיד ────────────────────────');
check('heroShowCodePath מוגדר וחשוף ל-window', w.includes('window.heroShowCodePath = function'));
check('נקרא מתוך מטפל-הכשל של גוגל', w.includes('window.heroShowCodePath && window.heroShowCodePath();'));
const iFailFn = w.indexOf("heroGMsg('⚠️ ' + html, 'warn');");
check('הקריאה יושבת בענף הכשל המשותף', iFailFn > 0 && w.indexOf('window.heroShowCodePath && window.heroShowCodePath();') > iFailFn);

console.log('\n── 4. מדידת מסלול-הכניסה (תנאי 3) ───────────────────────');
check('loginOk נשלח בנקודת-הסיום היחידה', (w.match(/logEvent\('loginOk'/g) || []).length === 1);
check("המסלול נקבע ל-'code' במסלול הטלפון", w.includes("_hbLoginVia = 'code';"));
check("המסלול נקבע ל-'google' בכניסת גוגל", w.includes("_hbLoginVia = 'google';"));
check("המסלול נקבע ל-'googleLink' בקישור-ואז-כניסה", w.includes("_hbLoginVia = 'googleLink';"));
const iSend = w.indexOf("logEvent('loginOk'");
const iGoHome = w.indexOf('heroGoHome();', w.indexOf('function heroFinishLogin'));
check('האירוע נשלח לפני ההפניה לדף הבית', iSend < iGoHome, `send@${iSend} goHome@${iGoHome}`);
check("🔴 'loginOk' קיים ברשימת-ההיתר ב-firestore.rules", rules.includes("'loginOk'"),
      'בלי זה כל אירוע כזה נדחה בשקט ואפס יוצג כאילו איש לא נכנס');

console.log('\n── 5. הכיתובים שהוחלפו לא חזרו ──────────────────────────');
check('"כבר חיברתם חשבון Google?" ירד מהמסך', !w.includes('<span>כבר חיברתם חשבון Google?</span>'));
check('"למי שכבר חיבר חשבון" ירד מכותרת-המשנה', !w.includes('או עם Google, למי שכבר חיבר חשבון'));
check('הנוסח שנבחר נמצא במסך', w.includes('נכנסים עם Google — עם המייל שאיתו נרשמתם'));

console.log(fails ? `\n❌ ${fails} בדיקות נכשלו\n` : '\n✅ הכל עבר\n');
process.exit(fails ? 1 : 0);
