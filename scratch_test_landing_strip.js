// §413 — הרנס-בדיקה לרצועת "עסקים נבחרים" בדף הנחיתה (welcome.html).
//
// 🔑 **הבדיקה מריצה את הקוד מתוך welcome.html עצמו**, לא עותק שהוקלד כאן — ר'
// feedback_verification_must_run_the_producer: שלושה ניסיונות-אימות קודמים בפרויקט צבעו
// מסך בלי להריץ את המפיק, והראו נוסח ישן. הבלוקים נשלפים לפי **תוכן** ולא לפי מספרי-שורה
// (feedback_test_harness_anchor_by_content) — slice על מספרי-שורה זז בכל עריכה.
//
// הנתונים אמיתיים: קריאה ציבורית ל-Firestore (reference_firestore_public_read_diagnostics).
//
//   node scratch_test_landing_strip.js
//
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/welcome.html', 'utf8');

function extract(startTok, endTok, what) {
  const i = html.indexOf(startTok);
  if (i < 0) throw new Error('לא נמצא בקובץ: ' + what);
  const j = html.indexOf(endTok, i);
  if (j < 0) throw new Error('לא נמצא הסוף של: ' + what);
  return html.slice(i, j + endTok.length);
}

const orderingSrc = extract('  const _lpSeed = ', '].slice(0, 10);', 'בלוק הסידור');
const mapLine = (() => {
  const k = html.indexOf('      isFeatured: !!(b.isFeatured');
  if (k < 0) throw new Error('לא נמצאה שורת המיפוי isFeatured');
  return html.slice(k, html.indexOf('\n', k)).trim().replace(/,$/, '');
})();

const isFeaturedFn = new Function('b', 'return ' + mapLine.replace(/^isFeatured:\s*/, '') + ';');
// _lpMembers נוסף ב-§414: null = אין מדיניות פעילה, כלומר בדיוק ההתנהגות ש-§413 בדק.
// כשמעבירים Set, הרצועה אמורה להציג את החברוּת שנרשמה במקום את כל המסומנים ⭐.
const runStrip = (data, dayIdx, members) =>
  new Function('data', '_lpMembers', orderingSrc.replace(/const _lpDayIdx = [^;]+;/, 'const _lpDayIdx = ' + dayIdx + ';') + '\n return ordered;')(
    data.map(b => ({ ...b })), members || null);

const FS_URL = 'https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery';
const QUERY = { structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 300 } };

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✘ ' + msg); } };

(async () => {
  const res = await fetch(FS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(QUERY) });
  const raw = (await res.json()).filter(x => x.document);
  const g = (f, k) => { const v = f[k]; return v ? (v.stringValue ?? v.booleanValue ?? v.timestampValue ?? undefined) : undefined; };

  const data = raw.map(x => {
    const f = x.document.fields || {};
    return { id: x.document.name.split('/').pop(), name: g(f, 'name'), isFeatured: isFeaturedFn({ isFeatured: g(f, 'isFeatured'), featuredUntil: g(f, 'featuredUntil') }) };
  });

  console.log('\n── באג 1: featuredUntil ──');
  const rawFeatured = raw.filter(x => g(x.document.fields, 'isFeatured') === true);
  const expired = rawFeatured.filter(x => { const u = g(x.document.fields, 'featuredUntil'); return u && new Date(u) < new Date(); });
  console.log('  ' + raw.length + ' מאושרים · ' + rawFeatured.length + ' מסומנים isFeatured · ' + data.filter(d => d.isFeatured).length + ' פעילים');
  ok(mapLine.includes('featuredUntil'), 'שורת המיפוי בקובץ בודקת featuredUntil');
  expired.forEach(x => {
    const nm = g(x.document.fields, 'name');
    ok(!data.find(d => d.name === nm).isFeatured, 'נבחרות שפגה אינה מוצגת: ' + nm);
  });
  if (!expired.length) console.log('  · אין כרגע נבחרות שפגה במסד (הבדיקה תתפוס אותה כשתהיה)');

  console.log('\n── באג 2: הוגנות הסבב ──');
  const featured = data.filter(d => d.isFeatured);
  const N = featured.length;
  const seen = Object.fromEntries(featured.map(f => [f.id, 0]));
  let sizeOk = true, dupOk = true;
  for (let d = 0; d < N; d++) {
    const out = runStrip(data, d);
    if (out.length !== Math.min(10, data.length)) sizeOk = false;
    if (new Set(out.map(o => o.id)).size !== out.length) dupOk = false;
    out.forEach(o => { if (o.id in seen) seen[o.id]++; });
  }
  const counts = Object.values(seen);
  ok(sizeOk, 'הרצועה מחזירה 10 כרטיסים בכל יום בסבב');
  ok(dupOk, 'אין כפילות עסק בתוך רצועה');
  ok(counts.every(c => c > 0), 'כל ' + N + ' הנבחרים מופיעים לפחות פעם אחת בסבב (' + counts.filter(c => !c).length + ' לא הופיעו)');
  ok(Math.max(...counts) - Math.min(...counts) <= 1, 'החשיפה מתחלקת שווה: מינ׳=' + Math.min(...counts) + ' מקס׳=' + Math.max(...counts) + ' מתוך ' + N + ' ימים');
  ok(runStrip(data, 7).map(o => o.id).join() === runStrip(data, 7).map(o => o.id).join(), 'אותו יום → אותה רצועה (יציב)');
  ok(runStrip(data, 7).map(o => o.id).join() !== runStrip(data, 8).map(o => o.id).join(), 'יום עוקב → רצועה אחרת (מתחלף)');
  ok(runStrip(data, 3).slice(0, N > 10 ? 10 : N).every(o => o.isFeatured) || N < 10, 'נבחרים קודמים ללא-נבחרים ברצועה');

  console.log('\n── §414: הרצועה מכבדת את החברוּת שנרשמה ──');
  const picked = featured.slice(0, 4).map(f => f.id);
  const withMembers = runStrip(data, 3, new Set(picked));
  const top = withMembers.slice(0, picked.length).map(o => o.id);
  ok(picked.every(id => top.includes(id)),
     'כשמועברת חברוּת רשומה (' + picked.length + ' עסקים) — הם אלה שפותחים את הרצועה, לא כל המסומנים ⭐');
  ok(runStrip(data, 3, null).map(o => o.id).join() === runStrip(data, 3).map(o => o.id).join(),
     'בלי חברוּת רשומה — הרצועה זהה לחלוטין להתנהגות של §413');

  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  console.log('\nהרצועה שתוצג היום:');
  runStrip(data, today).forEach((o, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + o.name + (o.isFeatured ? '' : '  (משלים — לא נבחר)')));

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
