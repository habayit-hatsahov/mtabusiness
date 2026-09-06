// בדיקת okUrl מ-worker/src/bizmedia.js (§422) בהרצה אמיתית.
//
// 🔒 **זו הפונקציה הרגישה ביותר ב-§422.** הכתובת מגיעה מהלקוח ונכתבת ישר למסמך העסק
// שמוצג לכל אוהד. בלי הוולידציה אפשר להזריק כתובת לכל דומיין — כלומר להפוך את כרטיס
// העסק לנקודת-הגשה של תוכן זר. `node --check` לא בודק כלום מזה.
//
// חיתוך לפי תוכן ולא לפי מספרי-שורה (הלקח של §361).
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'bizmedia.js'), 'utf8');
const a = SRC.indexOf('  const okUrl = (u) => {');
const b = SRC.indexOf('\n  };', a);
if (a < 0 || b < 0) throw new Error('העוגן של okUrl לא נמצא ב-bizmedia.js');
const BLOCK = SRC.slice(a, b + 5);

const BUCKET = 'habayit-hatsahov.firebasestorage.app';
const okUrl = new Function('bucket', BLOCK + '\n; return okUrl;')(BUCKET);

const good = (obj, q) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(obj)}${q || '?alt=media&token=abc'}`;

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      קיבלתי:  ' + JSON.stringify(got) + '\n      ציפיתי:  ' + JSON.stringify(want)); }
}
const ok = (name, u) => is(name, okUrl(u) === u, true);
const rejected = (name, u) => is(name, okUrl(u), '');

console.log('\n— מה שמותר —');
ok('כתובת תקינה מ-bizUploads', good('bizUploads/abc-123/cover_xyz'));
ok('גם עם נתיב עמוק', good('bizUploads/abc-123/gallery_0_xyz'));

console.log('\n— 🔒 דומיין זר —');
rejected('דומיין אחר לגמרי', 'https://evil.example.com/x.jpg');
rejected('דומיין שנראה דומה', 'https://firebasestorage.googleapis.com.evil.com/v0/b/' + BUCKET + '/o/bizUploads%2Fa');
rejected('תת-דומיין מזויף', 'https://evil.firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/bizUploads%2Fa');
rejected('http ולא https', good('bizUploads/a/b').replace('https:', 'http:'));
rejected('javascript:', 'javascript:alert(1)');
rejected('data:', 'data:image/png;base64,AAAA');

console.log('\n— 🔒 באקט אחר —');
rejected('באקט של פרויקט אחר', `https://firebasestorage.googleapis.com/v0/b/other-project.appspot.com/o/${encodeURIComponent('bizUploads/a/b')}?alt=media`);

console.log('\n— 🔒 נתיב אחר בתוך הבאקט שלנו —');
rejected('members/proofs — ראיות אימות', good('members/proofs/x_y'));
rejected('businesses — התיקייה החיה', good('businesses/someBiz/cover_1'));
rejected('landing', good('landing/tiles/x'));
// ⚠️ הניסיון להתחזות לתחילית: "bizUploadsX/" אינו "bizUploads/".
rejected('תחילית שנראית דומה', good('bizUploadsEvil/a/b'));
// ⚠️ escape מהתיקייה דרך ../ — הנתיב מפוענח לפני הבדיקה, ולכן זה נתפס.
rejected('יציאה מהתיקייה', good('bizUploads/../businesses/x/cover'));

console.log('\n— ערכים פסולים —');
rejected('ריק', '');
rejected('null', null);
rejected('undefined', undefined);
rejected('מספר', 12345);
rejected('לא כתובת בכלל', 'not a url');
rejected('כתובת ארוכה מדי (מעל 800)', good('bizUploads/a/' + 'x'.repeat(900)));

console.log(`\n${fail ? '✗' : '✓'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
