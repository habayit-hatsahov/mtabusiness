// ── תצוגה מקדימה של בלוק Google במודאל הכניסה, בשני מצביו ─────────────────────────────────
//
// 🔑 **הכל נשאב מ-welcome.html עצמו — אף מחרוזת אינה מוקלדת כאן.** זו כל הנקודה: ה-snippet
// שנתתי קודם בקונסול הכיל טקסט שאני כתבתי, ולכן הציג נוסח ישן והציג אותו כאילו הוא האתר.
// כלי שמצייר "בערך את המסך" גרוע מלא-לצייר בכלל.
//
// מייצר preview-google-block.html עם שני המצבים זה לצד זה:
//   א' — לפני הלחיצה (הערה קבועה, בלי הודעה)
//   ב' — אחרי כשל google_not_linked (הודעה, וההערה מוסתרת ע"י heroGMsg)
//
// הרצה: node scratch_preview_google_block.js [נתיב-לקובץ]   (ברירת מחדל: welcome.html המקומי)

const fs = require('fs');
const SRC = process.argv[2] || 'welcome.html';
const s = fs.readFileSync(SRC, 'utf8');

const die = (m) => { console.error('❌ ' + m); process.exit(1); };

// ── ה-CSS של הבלוק, כפי שהוא ─────────────────────────────────────────────────────────────
const cssStart = s.indexOf('.gs-login-host {');
if (cssStart < 0) die('לא נמצא .gs-login-host ב-' + SRC);
const cssEnd = s.indexOf('.gs-login-or::before', cssStart);
const css = s.slice(cssStart, s.indexOf('}', cssEnd) + 1);

// ── הקו-המפריד וההערה הקבועה, מתוך המרקאפ ────────────────────────────────────────────────
const orText = (s.match(/<div class="gs-login-or"><span>([^<]*)<\/span>/) || [])[1] || die('לא נמצא הקו-המפריד');
const noteHtml = (s.match(/<div class="gs-login-note" id="gsLoginNote">([\s\S]*?)<\/div>/) || [])[1] || die('לא נמצאה ההערה');

// ── הודעת google_not_linked: איחוד המחרוזות שהקוד משרשר ──────────────────────────────────
// ⚠️ שורות-הערה מנוקות לפני החילוץ — הן מצטטות בכוונה נוסחים ישנים (ר' §399ה).
const i = s.indexOf("data.error === 'google_not_linked'");
if (i < 0) die('לא נמצא הענף google_not_linked');
const branch = s.slice(i, s.indexOf('return;', i));
const clean = branch.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const lits = [...clean.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
// המחרוזת הראשונה בענף היא מזהה-הכשל ('notLinked') — לא חלק מהטקסט.
const msgHtml = lits.filter(x => !/^(notLinked|google_not_linked|loginOverlay)$/.test(x) && x.length > 2)
  .join('').replace(/\\'/g, "'");
if (!msgHtml.includes('gs-login-act')) die('הכפתור לא נמצא בהודעה — החילוץ שגוי');

const page = `<meta charset="utf-8"><title>בלוק Google — שני המצבים</title>
<style>
  body{font-family:system-ui,'Segoe UI',Arial;background:#F3F4F6;margin:0;padding:24px;direction:rtl}
  h1{font-size:17px;margin:0 0 4px}
  .src{font-size:12px;color:#6B7A9B;margin-bottom:20px}
  .row{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
  .col{flex:1;min-width:320px;max-width:420px}
  .cap{font-size:13px;font-weight:800;margin-bottom:8px;color:#0A2A66}
  .cap span{font-weight:400;color:#6B7A9B}
  .card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .fake{border:1px dashed #D6DAE3;border-radius:11px;padding:9px;color:#9AA3B2;font-size:13px;text-align:center;margin-bottom:8px}
  .fakebtn{background:#0A2A66;color:#fff;border-radius:11px;padding:12px;text-align:center;font-weight:800;font-size:14px}
  .forgot{text-align:center;font-size:13px;color:#0A2A66;text-decoration:underline;margin:10px 0}
  .gbtn{background:#1a73e8;color:#fff;border-radius:99px;padding:10px 18px;font-size:14px;font-weight:600;display:inline-block}
  :root{--ink:#0A2A66;--ink-2:#3A4C7A;--ink-3:#6B7A9B;--line:#E7E7E0;--r-field:11px}
  ${css}
  .gs-login-host{display:flex !important}
  .gs-login-msg.show{display:block}
</style>
<h1>בלוק Google במודאל הכניסה — שני המצבים</h1>
<div class="src">כל טקסט בעמוד הזה נשאב מ-<b>${SRC}</b>. שום מחרוזת לא הוקלדה בכלי.</div>
<div class="row">
  <div class="col">
    <div class="cap">א׳ — לפני הלחיצה <span>(ההערה מוצגת)</span></div>
    <div class="card">
      <div class="fake">05X-XXXXXXX</div><div class="fake">X X X X X X</div>
      <div class="fakebtn">התחברו</div>
      <div class="forgot">שכחתי את הקוד</div>
      <div class="gs-login-host">
        <div class="gs-login-or"><span>${orText}</span></div>
        <div style="display:flex;justify-content:center"><span class="gbtn">המשך עם Google</span></div>
        <div class="gs-login-note">${noteHtml}</div>
      </div>
    </div>
  </div>
  <div class="col">
    <div class="cap">ב׳ — אחרי כשל <span>(ההודעה מוצגת, ההערה מוסתרת)</span></div>
    <div class="card">
      <div class="fake">05X-XXXXXXX</div><div class="fake">X X X X X X</div>
      <div class="fakebtn">התחברו</div>
      <div class="forgot">שכחתי את הקוד</div>
      <div class="gs-login-host">
        <div class="gs-login-or"><span>${orText}</span></div>
        <div style="display:flex;justify-content:center"><span class="gbtn">המשך עם Google</span></div>
        <div class="gs-login-msg show warn">⚠️ ${msgHtml.replace(/' \+ \(data\.email[\s\S]*?: ''\) \+ '/, '')}</div>
        <div class="gs-login-note" style="display:none">${noteHtml}</div>
      </div>
    </div>
  </div>
</div>`;

fs.writeFileSync('preview-google-block.html', page, 'utf8');
console.log('✅ נוצר preview-google-block.html');
console.log('   קו-מפריד: ' + orText);
console.log('   אורך ההודעה: ' + msgHtml.replace(/<[^>]*>/g, '').length + ' תווים');
console.log('   אורך ההערה:  ' + noteHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length + ' תווים');
