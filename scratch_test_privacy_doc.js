// §421 — בדיקת מסמך מדיניות הפרטיות (terms.html?doc=privacy)
//
// הבדיקה מריצה את renderTermsSections האמיתית מ-terms-render.js על התוכן האמיתי
// שנשלף מ-terms.html לפי שם הקבוע — ולא על העתק שנכתב כאן. העתק היה ממשיך לעבור
// גם אחרי שהמסמך באתר ישתנה. ר' [[feedback_verification_must_run_the_producer]]
// ו-[[feedback_test_harness_anchor_by_content]].
//
// הרצה:  node scratch_test_privacy_doc.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, 'tests', 'node_modules', 'jsdom'));

const TERMS_PATH = path.join(__dirname, 'terms.html');
const src = fs.readFileSync(TERMS_PATH, 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}

// ── שליפת קבוע לפי שמו, מתוך תבנית-מחרוזת שגבולותיה גרש-הפוך ──
function extractConst(name) {
  const marker = 'const ' + name + ' = `';
  const start = src.indexOf(marker);
  if (start === -1) return null;
  const from = start + marker.length;
  const end = src.indexOf('`;', from);
  if (end === -1) return null;
  return src.slice(from, end);
}

(async () => {
  console.log('\n== שליפת התוכן ==');

  const privacy = extractConst('DEFAULT_TERMS_PRIVACY');
  const fan = extractConst('DEFAULT_TERMS_FAN');
  const biz = extractConst('DEFAULT_TERMS_BIZ');

  check('DEFAULT_TERMS_PRIVACY נשלף מ-terms.html', !!privacy && privacy.length > 500,
        privacy ? 'אורך ' + privacy.length : 'לא נמצא');
  check('DEFAULT_TERMS_FAN עדיין נשלף (רגרסיה)', !!fan && fan.length > 500);
  check('DEFAULT_TERMS_BIZ עדיין נשלף (רגרסיה)', !!biz && biz.length > 500);
  if (!privacy) { console.log('\nלא ניתן להמשיך.'); process.exit(1); }

  // ── טעינת מנוע הרינדור האמיתי ──
  const mod = await import('file://' + path.join(__dirname, 'terms-render.js').replace(/\\/g, '/'));
  const { renderTermsSections } = mod;
  check('renderTermsSections נטענה מהמודול האמיתי', typeof renderTermsSections === 'function');

  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  global.document = dom.window.document;
  const container = dom.window.document.getElementById('c');

  function render(raw) {
    renderTermsSections(raw, container);
    return container;
  }

  console.log('\n== מבנה המסמך ==');
  render(privacy);

  const secs = [...container.querySelectorAll('.terms-sec')];
  check('13 סעיפים נרנדרו', secs.length === 13, 'התקבלו ' + secs.length);

  const badges = [...container.querySelectorAll('.terms-badge')].map(b => b.textContent);
  const expectedBadges = Array.from({ length: 13 }, (_, i) => String(i + 1));
  check('הבאדג׳ים ממוספרים 1..13', JSON.stringify(badges) === JSON.stringify(expectedBadges),
        badges.join(','));

  const heads = [...container.querySelectorAll('.terms-sec-head h2')].map(h => h.textContent);
  check('אין כותרת שנשאר בה מספר-סעיף', heads.every(h => !/^\d+\./.test(h)),
        heads.filter(h => /^\d+\./.test(h)).join(' | '));
  check('הכותרת הראשונה היא "על מה חל המסמך הזה"', heads[0] === 'על מה חל המסמך הזה', heads[0]);

  console.log('\n== תיבות-הדגשה ולייבלים ==');

  const callouts = [...container.querySelectorAll('.terms-callout')];
  const bangLines = privacy.split('\n').map(l => l.trim()).filter(l => l.startsWith('!'));
  check('כל שורת "!" הפכה לתיבת-הדגשה', callouts.length === bangLines.length,
        'callouts=' + callouts.length + ' bang=' + bangLines.length);
  check('אף תיבת-הדגשה אינה מציגה את סימן הקריאה', callouts.every(c => !c.textContent.startsWith('!')));

  const bold = [...container.querySelectorAll('strong')].map(s => s.textContent.replace(/: $/, ''));
  ['יצירת קשר', 'פרטי זיהוי', 'התחברות עם גוגל', 'Google Firebase', 'Cloudflare', 'Brevo',
   'מחיקה', 'מה אינו נמחק'].forEach(label => {
    check('ליבל מודגש: ' + label, bold.includes(label));
  });

  // 🐛 נתפס באימות חזותי: ההירו של terms.html מקבע "עדכון אחרון: יולי 2026", והמסמך
  // הזה נכתב בספטמבר — כלומר הדף הציג שני תאריכים סותרים. התאריך חי עכשיו בהירו בלבד,
  // והבדיקה נועלת את זה כדי שלא יחזור עותק שני לתוך הטקסט.
  check('אין תאריך-עדכון שני בתוך גוף המסמך', !privacy.includes('עדכון אחרון'),
        'התאריך צריך להופיע רק בהירו');

  // 🔑 הבדיקה ההפוכה — נקודתיים מקריות בשורה רגילה הופכות אותה בשקט ל"ליבל" מודגש.
  // סעיף 5 הוא רשימת שורות שכולן אמורות להישאר טקסט רגיל, ולכן הוא הגלאי הרגיש.
  const sec5 = secs[4];
  const sec5Bold = [...sec5.querySelectorAll('.terms-p strong')];
  check('סעיף 5 — אף שורת-רשימה לא הודגשה בטעות', sec5Bold.length === 0,
        sec5Bold.map(b => b.textContent).join(' | '));

  console.log('\n== תוכן שהחנויות דורשות ==');

  const text = container.textContent;
  check('כתובת ליצירת קשר מופיעה', text.includes('yellowzonemta@gmail.com'));
  check('מוצהר שאין מכירת מידע', text.includes('איננו מוכרים מידע אישי'));
  check('מוצהר מסלול מחיקה עצמאי', text.includes('למחוק את החשבון') && text.includes('בלי להמתין לאישור מנהל'));
  check('מפורטת תקופת שמירה', text.includes('שנים עשר חודשים'));
  check('מצוין גיל מינימלי', text.includes('שש עשרה'));
  check('מפורטים ספקי צד-שלישי', ['Google Firebase', 'Cloudflare', 'Brevo', 'Firebase Cloud Messaging']
        .every(v => text.includes(v)));

  console.log('\n== חיווט הקוד ==');

  // ההשוואה על הקוד בלבד — הערות מוסרות תחילה, אחרת מחרוזת שמוזכרת בהערה
  // "עוברת" את הבדיקה בלי שהקוד באמת עושה זאת. ר' [[feedback_verification_must_run_the_producer]]
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('doc=privacy מזוהה', code.includes("get('doc') === 'privacy'"));
  check('שדה Firestore נבחר לפי המסמך', code.includes("isPrivacyDoc ? 'termsPrivacy'"));
  check('דריסת localStorage נפרדת למסמך', code.includes('_hb_tpl_terms_privacy'));
  check('כותרת הדף נקבעת', code.includes("'מדיניות פרטיות'"));
  check('ההירו מקבל תאריך משלו למסמך הפרטיות', code.includes('עדכון אחרון: ספטמבר 2026'));
  check('הירו נושא id שניתן לפנות אליו', code.includes('id="heroUpdated"'));

  console.log('\n== רגרסיה — שני המסמכים הקיימים ==');
  render(fan);
  check('תקנון אוהדים — 8 סעיפים', container.querySelectorAll('.terms-sec').length === 8,
        String(container.querySelectorAll('.terms-sec').length));
  render(biz);
  check('תקנון עסקים — 7 סעיפים', container.querySelectorAll('.terms-sec').length === 7,
        String(container.querySelectorAll('.terms-sec').length));

  console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + '/' + (pass + fail) + ' עברו');
  process.exit(fail === 0 ? 0 : 1);
})();
