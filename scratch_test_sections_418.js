// §418 — הרנס-בדיקה לתוספות המנוע: הוצאה ידנית מהתורנות, והעברה ידנית של מקום בתור.
//
// 🔑 **מריץ את sections-policy.js עצמו** מול נתוני פרודקשן חיים — לא לוגיקה מוקלדת כאן
// (ר' feedback_verification_must_run_the_producer). ההרנס של §414 ממשיך לרוץ בנפרד
// ומכסה את המנוע הקיים; כאן נבדק **רק מה שנוסף**, כדי ששבירה תצביע על השינוי עצמו.
//
//   node scratch_test_sections_418.js
//
const fs = require('fs');
const path = require('path');
const https = require('https');

global.window = {};
new Function(fs.readFileSync(path.join(__dirname, 'sections-policy.js'), 'utf8')).call(global);
const S = global.window.HB_SECTIONS;
if (!S) throw new Error('sections-policy.js לא חשף את window.HB_SECTIONS');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✘ ' + msg); } };

function fetchBusinesses() {
  const body = JSON.stringify({ structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 300 } });
  return new Promise((resolve, reject) => {
    const req = https.request('https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}
const V = f => f === undefined ? null
  : f.stringValue !== undefined ? f.stringValue
    : f.integerValue !== undefined ? +f.integerValue
      : f.booleanValue !== undefined ? f.booleanValue
        : f.timestampValue !== undefined ? f.timestampValue
          : f.arrayValue !== undefined ? (f.arrayValue.values || []).length : null;

(async () => {
  const raw = await fetchBusinesses();
  const BIZ = raw.filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split('/').pop(),
      name: V(f.name) || V(f.businessName) || '',
      clicks: V(f.clicks) || 0,
      likedBy: [],
      isFeatured: !!V(f.isFeatured),
      approvedAt: V(f.approvedAt),
      coverPhoto: V(f.coverPhoto), logo: V(f.logo),
      discountText: V(f.discountText), isSubscriber: V(f.isSubscriber)
    };
  });
  console.log('נטענו ' + BIZ.length + ' עסקים מאושרים · ' + BIZ.filter(b => b.isFeatured).length + ' נבחרים קבועים\n');

  const POL = S.normalizePolicy({ featured: { enabled: true, size: 10, anchors: 0, opportunity: 3, periodDays: 1, cooldown: 2, criteria: ['neverShown', 'leastClicks'] } });
  const build = (list, state) => S.buildFeatured(list, POL, { state: state || { log: [] }, periodIndex: 0, anchorIds: [] });

  console.log('── הוצאה ידנית מהתורנות (sectionTurn) ──');
  const baseline = build(BIZ);
  ok(baseline.opportunity.length === 3, 'שכבת ההזדמנות מאוישת (' + baseline.opportunity.length + ' מתוך 3)');

  const first = baseline.opportunity[0];
  const withOut = BIZ.map(b => b.id === first.id ? Object.assign({}, b, { sectionTurn: false }) : b);
  const after = build(withOut);
  ok(!after.opportunity.some(b => b.id === first.id), 'עסק שסומן "לא משתתף בתורנות" יצא מהשכבה (' + first.name + ')');
  ok(after.opportunity.length === 3, 'המקום שהתפנה אויש על-ידי הבא בתור, ולא נשאר ריק');
  ok(after.oppPoolSize === baseline.oppPoolSize - 1, 'המאגר קטן בדיוק באחד');

  // ⚠️ הבדיקה שמצדיקה את `=== false` ולא `!b.sectionTurn`
  const untouched = build(BIZ.map(b => Object.assign({}, b)));
  ok(untouched.opportunity.length === 3 && untouched.oppPoolSize === baseline.oppPoolSize,
    'עסק שהשדה מעולם לא נכתב עליו ממשיך להשתתף — ברירת-המחדל היא השתתפות');
  const explicitTrue = build(BIZ.map(b => Object.assign({}, b, { sectionTurn: true })));
  ok(explicitTrue.oppPoolSize === baseline.oppPoolSize, 'סימון מפורש "כן" זהה להיעדר סימון');

  const allOut = build(BIZ.map(b => Object.assign({}, b, { sectionTurn: false })));
  ok(allOut.opportunity.length === 0, 'הוצאת כולם מרוקנת את השכבה בלי לזרוק');
  ok(allOut.rotation.length + allOut.anchors.length === allOut.list.length && allOut.list.length > 0,
    'הסבב ממשיך לאייש את המדף גם כששכבת ההזדמנות ריקה (' + allOut.list.length + ' עסקים)');

  console.log('\n── העברה ידנית של מקום בתור (sectionQueuePos) ──');
  const waiting = baseline.oppPoolSize > 12 ? null : null;
  const ranked0 = build(BIZ);
  // עסק שאינו בשלושת הראשונים — הדרך היחידה לדעת שהדחיפה באמת שינתה משהו
  const notShown = BIZ.filter(b => !b.isFeatured && !ranked0.opportunity.some(o => o.id === b.id))[0];
  const pushed = build(BIZ.map(b => b.id === notShown.id ? Object.assign({}, b, { sectionQueuePos: 1 }) : b));
  ok(pushed.opportunity[0] && pushed.opportunity[0].id === notShown.id,
    'עסק שהועבר למקום 1 נכנס ראשון, גם אם לא היה בעשירייה (' + notShown.name + ')');
  ok(pushed.opportunity.length === 3, 'הדחיפה לא שינתה את מספר המקומות');
  ok(pushed.opportunity.slice(1).every(b => b.id !== notShown.id), 'הוא מופיע פעם אחת בלבד');
  ok(pushed.opportunity[1] && pushed.opportunity[1].id === ranked0.opportunity[0].id,
    'מי שהיה ראשון נדחף למקום 2 — דחיפה, לא דריסה');

  const pushed3 = build(BIZ.map(b => b.id === notShown.id ? Object.assign({}, b, { sectionQueuePos: 3 }) : b));
  ok(pushed3.opportunity[2] && pushed3.opportunity[2].id === notShown.id, 'העברה למקום 3 מדייקת למקום 3');

  const two = BIZ.filter(b => !b.isFeatured).slice(0, 2);
  const both = build(BIZ.map(b => {
    if (b.id === two[0].id) return Object.assign({}, b, { sectionQueuePos: 2 });
    if (b.id === two[1].id) return Object.assign({}, b, { sectionQueuePos: 1 });
    return b;
  }));
  ok(both.opportunity[0].id === two[1].id && both.opportunity[1].id === two[0].id,
    'שתי העברות מסודרות לפי המספר שנקבע, לא לפי סדר הסריקה');

  const far = build(BIZ.map(b => b.id === notShown.id ? Object.assign({}, b, { sectionQueuePos: 999 }) : b));
  ok(far.opportunity.length === 3 && !far.opportunity.some(b => b.id === notShown.id),
    'מספר גדול מאורך התור נופל לסוף במקום לזרוק או לרוקן');

  const junk = build(BIZ.map(b => b.id === notShown.id ? Object.assign({}, b, { sectionQueuePos: 'abc' }) : b));
  ok(junk.opportunity.length === 3, 'ערך לא-מספרי אינו מפיל את הבנייה');

  console.log('\n── הקריטריון שהוסר ──');
  const legacy = S.normalizePolicy({ featured: { enabled: true, size: 10, anchors: 0, opportunity: 3, periodDays: 1, cooldown: 2, criteria: ['completeProfile', 'neverShown'] } });
  const built = S.buildFeatured(BIZ, legacy, { state: { log: [] }, periodIndex: 0, anchorIds: [] });
  ok(built.opportunity.length === 3, 'מדיניות ישנה שנשמרה עם completeProfile ממשיכה לעבוד ולא מפילה את הבנייה');
  ok(!S.criterionByKey('completeProfile'), 'הקריטריון עצמו אינו קיים יותר');
  ok(S.CRITERIA.filter(c => c.kind === 'order').length === 6, 'נשארו שש דרכים לקבוע מי ראשון בתור');

  console.log('\n── §418יז — שדות-מנהל שורדים את הנרמול ──');
  // 🐛 הבאג שנתפס כאן: savePolicyDraft כותב merge:false את תוצאת normalizePolicy,
  // ולכן שדה שאינו מועתק בנרמול **נמחק מהמסמך** בשמירה הבאה, בלי שום שגיאה —
  // כלומר המתג של "הטבות שוות" היה נכבה מעצמו רגע אחרי שהודלק.
  {
    const kept = S.normalizePolicy({ dealsOptIn: true, launchDone: { push: true, review: true } });
    ok(kept.dealsOptIn === true, '🔑 dealsOptIn שורד — אחרת המעבר לבחירה ידנית מתאפס בשמירה הבאה');
    ok(kept.launchDone && kept.launchDone.push === true && kept.launchDone.review === true,
      'וסימוני מדריך ההשקה שורדים אף הם');
    const empty = S.normalizePolicy({});
    ok(empty.dealsOptIn === false, 'ברירת המחדל היא אוטומטי — מסמך ריק אינו מדליק בחירה ידנית');
    ok(empty.launchDone && Object.keys(empty.launchDone).length === 0, 'ובלי אף שלב מסומן');
    ok(S.normalizePolicy({ launchDone: 'x' }).launchDone.push === undefined, 'ערך פסול בשדה הסימונים אינו מפיל את הנרמול');
    ok(S.normalizePolicy({ launchDone: ['a'] }).launchDone.length === undefined, 'ומערך אינו מתחזה למפת-סימונים');
    // ⚠️ שדות החישוב עצמם אינם נפגעים מהמעבר הזה
    ok(S.normalizePolicy({ dealsOptIn: true }).featured.enabled === false, 'ושדה-מנהל אינו מדליק בטעות את המדיניות');
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
