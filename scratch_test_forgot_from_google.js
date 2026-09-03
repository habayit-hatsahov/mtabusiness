// ── בדיקת §399ב — הכפתור "לא זוכרים את הקוד?" בהודעת-הכשל של Google ──────────────────────
// ⚠️ הפונקציה מחולצת **לפי שם** ולא לפי מספרי-שורה: slice על מספרים זז בכל עריכה, והרנס
// ששיקר גרוע מהרנס שנפל.
// ⚠️ node --check אינו תופס מזהה חסר — לכן הבדיקה **מריצה** את הפונקציה, ובנוסף מוודאת
// שכל onclick בהודעה מצביע על שם שבאמת נחשף ל-window באותו קובץ.
//
// הרצה: node scratch_test_forgot_from_google.js

const fs = require('fs');
const src = fs.readFileSync('welcome.html', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

// ── חילוץ הפונקציה לפי שם ────────────────────────────────────────────────────────────────
function extract(name) {
  const start = src.indexOf(`window.${name} = function`);
  if (start < 0) throw new Error(`לא נמצאה הפונקציה ${name}`);
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error(`סוגריים לא נסגרו ב-${name}`);
  return src.slice(start, end) + ';';
}

// ── DOM מזויף מינימלי ────────────────────────────────────────────────────────────────────
function makeEnv(panelOpen) {
  const calls = { toggle: 0, focus: 0, scroll: 0 };
  const cls = new Set(panelOpen ? ['forgot-panel', 'show'] : ['forgot-panel']);
  const panel = { classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), toggle: (c) => (cls.has(c) ? cls.delete(c) : cls.add(c)) } };
  const input = { focus: () => calls.focus++, scrollIntoView: () => calls.scroll++ };
  const win = {
    heroToggleForgot: () => { calls.toggle++; cls.add('show'); },
  };
  const document = {
    getElementById: (id) => id === 'heroForgotPanel' ? panel : id === 'heroForgotPhoneInput' ? input : null,
  };
  return { calls, cls, win, document };
}

function run(env) {
  const fn = new Function('window', 'document', extract('heroOpenForgotFromGoogle') + '\nreturn window.heroOpenForgotFromGoogle;');
  fn(env.win, env.document)();
}

console.log('§399ב — heroOpenForgotFromGoogle\n');

console.log('הפאנל סגור → נפתח, והשדה ממוקד:');
let e = makeEnv(false);
run(e);
ok('heroToggleForgot נקרא פעם אחת', e.calls.toggle === 1, `נקרא ${e.calls.toggle}`);
ok('הפאנל פתוח בסוף', e.cls.has('show'));
ok('השדה קיבל focus', e.calls.focus === 1);
ok('נגלל לשדה הראייה', e.calls.scroll === 1);

console.log('\n🔑 הפאנל כבר פתוח → **לא** נסגר (toggle היה סוגר אותו):');
e = makeEnv(true);
run(e);
ok('heroToggleForgot לא נקרא', e.calls.toggle === 0, `נקרא ${e.calls.toggle}`);
ok('הפאנל נשאר פתוח', e.cls.has('show'));
ok('השדה קיבל focus גם כשהיה פתוח', e.calls.focus === 1);

console.log('\nההודעה עצמה:');
// 🔑 **ההערות מנוקות לפני הבדיקה.** הן מצטטות בכוונה את הנוסח הישן ("מהתפריט", "באנר
// שיקפוץ") כדי להסביר למה הוא ירד — ובדיקה שסורקת אותן נכשלת על ההסבר במקום על הקוד.
// זו הייתה נפילה אמיתית של הרנס הזה, לא של המוצר.
const rawMsg = src.slice(src.indexOf("data.error === 'google_not_linked'"), src.indexOf("data.error === 'google_not_linked'") + 2600);
const msg = rawMsg.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
ok('הכפתור קיים בהודעה', /class="gs-login-act"/.test(msg));
ok('"מהתפריט" הוסר', !/מהתפריט/.test(msg), 'עדיין מפנה לפריט תפריט שאינו קיים');
ok('אינו מבטיח באנר קופץ', !/יקפוץ|יופיע.*באנר/.test(msg));

// §399ה — ההבטחה על העתיד ירדה **מההודעה** ועברה להערה הקבועה, שנקראת לפני הלחיצה.
// ⚠️ הטענה הישנה כאן ("ההודעה מפנה לדף הבית") הייתה נכונה ל-§399ב **והתיישנה** —
// בדיקה שממשיכה לאכוף כוונה שהוחלפה הופכת לשומר של העבר, לא של המוצר.
ok('ההודעה אינה נושאת את ההבטחה לעתיד', !/מדף הבית/.test(msg), 'המשפט חזר להודעה');
ok('ההערה הקבועה כן נושאת אותה', /gs-login-note[\s\S]{0,400}בדף הבית/.test(src), 'ההבטחה נעלמה משני המקומות');

console.log('\n🔑 §399ה — ההערה מתחלפת בהודעה ולא מצטרפת אליה:');
ok('לפתק יש id', /class="gs-login-note" id="gsLoginNote"/.test(src));
ok('heroGMsg מסתיר את ההערה', /m\.classList\.add\('show'\);\s*\n\s*heroGToggleNote\(true\)/.test(src));
ok('heroGClearMsg מחזיר אותה', /heroGToggleNote\(false\)/.test(src));
ok('ההחלפה יושבת בפונקציות ההודעה ולא בקורא', (src.match(/heroGToggleNote\(/g) || []).length === 3,
   'צפוי 3 מופעים: ההגדרה + שתי הקריאות');

console.log('\n🔑 כל onclick בהודעה מצביע על שם שנחשף ל-window:');
for (const m of msg.matchAll(/onclick=\\?"([a-zA-Z_$][\w$]*)\(/g)) {
  const name = m[1];
  ok(`window.${name} מוגדר בקובץ`, src.includes(`window.${name} =`), 'מזהה חסר — הכפתור יזרוק בלחיצה');
}

console.log('\nה-CSS:');
ok('.gs-login-act מוגדר', /\.gs-login-act\s*\{/.test(src));

console.log(`\n${fail ? '❌' : '✅'} ${pass} עוברות, ${fail} נכשלות`);
process.exit(fail ? 1 : 0);
