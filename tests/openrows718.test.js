// §718 — "מה פתוח": מה שבעל העסק שלח מופיע מתחת לבקשה שלנו (לה ורה, 3.11), בלי להיבלע בקבוצה הלא נכונה.
// הקוד נחתך מ-admin-dashboard.html לפי תוכן (§361). TEST_SRC=קובץ מריץ מול גרסה אחרת של הקוד.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(process.env.TEST_SRC || path.join(__dirname, '..', 'admin-dashboard.html'), 'utf8');
function cut(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error(`עוגן ההתחלה לא נמצא: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error(`עוגן הסיום לא נמצא: ${endMarker}`);
  return SRC.slice(a, b);
}
const CODE = [
  cut('var WAIT_REASONS = [', 'function bizWaitLines('),
  cut('function bizSentItems(b) {', '// §689 – לאיזה שדה'),
  cut('const OP_GROUPS = [', 'const OP_STEP_LBL ='),
  cut('function bizOpenRows(b) {', 'function opValHtml('),
].join('\n');

const LABELS = { facebook: 'פייסבוק', instagram: 'אינסטגרם', phone: 'טלפון', coverPhoto: 'תמונה', name: 'שם העסק', logo: 'לוגו' };
const STEP = { facebook: 2, instagram: 2, phone: 2, coverPhoto: 5, logo: 5, name: 3 };
function rowsFor(biz, fields) {
  const env = {
    QJ_STEP_NAMES: { 2: 'פרטים ויצירת קשר', 3: 'העסק · קטגוריה ותגיות', 4: 'הטבות', 5: 'תמונות' },
    bizInFix: () => true, bizOwnerVerifOpen: () => false, kosherMissing: () => false,
    bizPendingChangeItems: () => fields.map(f => ({ field: f, label: LABELS[f], section: STEP[f] })),
  };
  const fn = new Function(...Object.keys(env), `${CODE}\nreturn bizOpenRows;`);
  return fn(...Object.values(env))(biz);
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
const fields = (r) => r.items.map(i => i.field).sort().join(',');

console.log('\n— לה ורה: הנתונים האמיתיים של 3.11 —');
{
  const ASK_COVER = 'תמונה ראשית – זה לא תמונה טובה, תשים תמונה של שולחן עם פיצות והאוכל שאתה עושה, או טאבון או רק פיצה אבל משהו שאתה מכין.';
  const ASK_LINKS = 'פרטים ויצירת קשר – אינסטגרם לא נפתח, אין לך פייסבוק גם? תתקן את זה בבקשה';
  const rows = rowsFor({ inReviewReasons: ['other'], inReviewOther: `${ASK_COVER} · ${ASK_LINKS}` }, ['facebook', 'instagram']);
  ok(rows.length === 2, 'שתי שורות: קישורים ותמונה, בלי שורות כפולות');
  const links = rows.find(r => r.k === 'contact');
  ok(links && fields(links) === 'facebook,instagram', 'אינסטגרם ופייסבוק באותה שורה');
  ok(links && links.asks.length === 1 && links.asks[0].text === ASK_LINKS, 'והבקשה שלנו מעליהם');
  const cover = rows.find(r => r.k === 'cover');
  ok(cover && !cover.items.length && cover.asks[0].text === ASK_COVER, 'התמונה נשארת "מחכים לו" – לא שלח תמונה');
  ok(rows[0].k === 'contact', 'השורה שיש בה מה להכריע ראשונה');
}

console.log('\n— בקשה על שלב שלם —');
{
  const rows = rowsFor({ inReviewReasons: ['other'], inReviewOther: 'קטגוריה ותגיות – השם לא מדויק' }, ['name']);
  ok(rows.length === 1 && rows[0].asks.length === 1 && fields(rows[0]) === 'name', 'השם שלו נכנס מתחת לבקשה על השלב');
  const r2 = rowsFor({ inReviewReasons: ['other'], inReviewOther: 'תמונות – לא ברור מה רואים' }, ['coverPhoto']);
  ok(r2.length === 1 && r2[0].k === 'cover' && r2[0].asks.length === 1, 'התמונה שלו נכנסת מתחת לבקשה על שלב התמונות');
}

console.log('\n— לא לקשר מה שלא קשור —');
{
  const rows = rowsFor({ inReviewReasons: ['other'], inReviewOther: 'ההודעה לא ברורה' }, ['facebook']);
  ok(rows.length === 2 && rows.every(r => !(r.items.length && r.asks.length)), 'בקשה כללית לא נדבקת לפייסבוק');
  const r2 = rowsFor({ inReviewReasons: ['other'], inReviewOther: 'להסתיר באתר את המחיר' }, ['facebook']);
  ok(r2.every(r => !(r.items.length && r.asks.length)), '"באתר" אינו בקשה על כתובת האתר');
  const r3 = rowsFor({ inReviewReasons: ['other'], inReviewOther: 'הפייסבוק לא נפתח' }, ['coverPhoto']);
  ok(r3.every(r => !(r.items.length && r.asks.length)), 'בקשה על פייסבוק לא נדבקת לתמונה');
  const r4 = rowsFor({ inReviewReasons: ['cover'], inReviewOther: '' }, ['coverPhoto']);
  ok(r4.length === 1 && r4[0].k === 'cover' && r4[0].asks.length === 1, 'מה שעבד נשאר: תמונה ראשית מתחת לבקשה');
}

// מריץ את הפונקציות האמיתיות של הרינדור; כל שם שלא הוגדר כאן הוא פונקציה שמחזירה ריק
function renderEnv(extra) {
  const base = {
    esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    IMAGE_DIFF_FIELDS: new Set(['coverPhoto', 'logo']), qjCollapsedIds: new Set(), DIFF_SECTION_NAMES: {}, _bizPins: {},
    QJ_STEP_NAMES: { 2: 'פרטים ויצירת קשר', 3: 'העסק · קטגוריה ותגיות', 4: 'הטבות', 5: 'תמונות' },
    fmtDiffVal: (_k, v) => (v == null || v === '' ? '–' : String(v)), fmtDateTime: () => '2.11.2026 17:29', toJsDate: (v) => v,
    brokenLinksFor: () => [], bizInFix: () => true, bizOwnerVerifOpen: () => false, kosherMissing: () => false,
    bizHasUnhandledNote: (b) => !!b.note, bizStagedEntry: () => null, bizFixedAt: () => null, bizMissingCardTitle: () => false,
    ...extra,
  };
  return new Proxy(base, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : () => ''),
  });
}
const RENDER_CODE = [
  cut('var WAIT_REASONS = [', 'function bizWaitLines('),
  cut('function bizSentItems(b) {', '// §689 – לאיזה שדה'),
  cut('const OP_GROUPS = [', 'function opValHtml('),
  cut('function opValHtml(', '// §716 – '),
  cut('function opTagReqActsHtml(b, f) {', 'window.opApprove = async'),
  cut('function qjTextDiffHtml(oldStr, newStr) {', 'window.qjOpenEdit ='),
  cut('function quickJudgmentHtml(b) {', '// ── "טופל מבחוץ"'),
  cut('const OP_TILE_NOTE', 'function dealTilesHtml('),
  cut('function bizTileFix(b, k) {', '// 🚩 לוגו / תמונה מייצגת'),
].join('\n');
function render(biz, items, mock = true) {
  const env = renderEnv({ MOCK_BUSINESSES: mock ? [biz] : [], bizPendingChangeItems: () => items });
  env.QJ_DECIDED = {}; env.TILE_FIELD = { cover: 'coverPhoto', logo: 'logo', gallery: 'photos' }; env.TILE_WORDS = { cover: /תמונה/, logo: /לוגו/, gallery: /גלרי/ };
  const fn = new Function('env', `with (env) { ${RENDER_CODE}\nreturn { op: bizOpenRows(__b).map(r => opRowHtml(__b, r)).join(''), qj: quickJudgmentHtml(__b), dealTile: dealTileStateHtml(__b, { basket: null, sent: null, pend: bizPendingChangeItems(__b) }), mediaTile: bizTileFixHtml(__b, 'cover') }; }`);
  env.__b = biz;
  return fn(env);
}
const IG = { field: 'instagram', label: 'אינסטגרם', section: 2, display: 2, old: 'Laverapizzaexperience', new: 'https://www.instagram.com/laverapizza' };
const FB = { field: 'facebook', label: 'פייסבוק', section: 2, display: 2, old: '–', new: 'https://www.facebook.com/share/1' };
const LAVERA = () => ({
  id: 'b', name: 'לה ורה', status: 'pending', ownerFirst: 'x', instagram: IG.old, facebook: '',
  inReviewReasons: ['other'], inReviewOther: 'פרטים ויצירת קשר – אינסטגרם לא נפתח, אין לך פייסבוק גם?',
  pendingChanges: { instagram: IG.new, facebook: FB.new }, pendingChangeDiff: { instagram: IG, facebook: FB },
});

console.log('\n— הרינדור: בלי כפילות, ובלי לאבד יכולת —');
{
  const { op, qj } = render(LAVERA(), [IG, FB]);
  const bodyOf = (h) => (h.split('class="qj-body"')[1] || '');
  ok(op.includes('ביקשנו ← הוא שלח') && op.indexOf('מה ביקשנו') < op.indexOf('החדש ששלח'), 'ב"מה פתוח": הבקשה ומתחתיה מה ששלח');
  ok(!op.includes('עוד לא שלח כלום'), 'לא כתוב "עוד לא שלח כלום" ליד מה ששלח');
  ok(op.includes(`qjApproveText('b','instagram')`) && op.includes(`qjApproveText('b','facebook')`), 'לכל שדה אישור משלו');
  ok(op.includes(`rejectChangeField('b','instagram')`) && op.includes(`rejectChangeField('b','facebook')`), 'לכל שדה דחייה משלו');
  ok(!op.includes('opApprove('), 'אין אישור אחד לכל השורה');
  ok(op.includes(`qjOpenEdit('qjEdit_b_instagram')`) && op.includes('id="qjEdit_b_instagram"'), 'עריכה לפני אישור עברה ל"מה פתוח"');
  ok(op.includes('<ins>'), 'המילים שהשתנו מסומנות');
  ok(!qj.includes('qjEdit_b_') && !bodyOf(qj).includes('אינסטגרם'), 'ב"שיפוט מהיר" הבקשה לא מופיעה שוב');
  ok(qj.includes('הבקשות שלו למעלה'), 'וכתוב שם איפה הן');

  const n = render({ ...LAVERA(), note: 'שלום' }, [IG]);
  ok(!n.qj.includes('העסק כתב לנו'), '"כתב לנו" לא מופיע שוב ב"שיפוט מהיר"');

  const TAG = { field: 'tagSecondSuggestion', label: 'תגית שנייה', section: 3, display: 1, detail: 'x' };
  const t = render({ ...LAVERA(), tagSecondSuggestion: 'פיצה' }, [IG, TAG]);
  ok(t.op.includes(`approveTagSecondSuggestion('b')`) && t.op.includes(`rejectTagSecondSuggestion('b')`), '§721: הצעת תגית שנייה – הפעולות האמיתיות ב"מה פתוח"');
  ok(!t.qj.includes('approveTagSecondSuggestion'), '§721: ולא שוב ב"שיפוט מהיר"');
  const TS = { field: 'tagSuggestion', label: 'תגית חדשה', section: 3, display: 1, detail: 'הציע/ה: "עיסוי רפואי"' };
  const ts = render({ ...LAVERA(), pendingChanges: null, pendingChangeDiff: null, inReviewReasons: [], inReviewOther: '', tagSuggestion: 'עיסוי רפואי' }, [TS]);
  ok(ts.op.includes(`qjApproveTagFlow('b','new')`) && ts.op.includes(`qjApproveTagFlow('b','map')`) && ts.op.includes(`rejectTagSuggestion('b')`), '§721: תגית חדשה – אישור, מיפוי ודחייה אמיתיים');
  ok(!ts.op.includes('approveChangeField') && !ts.op.includes('opApprove('), '§721: בלי ✅/❌ של בקשת שינוי');
  ok(ts.dealTile.includes('מה פתוח בעסק הזה') && !ts.dealTile.includes('approveChangeField'), '§721: באריח – הפניה, בלי כפתורים שלא עושים כלום');
  const ACN = { field: 'alsoCategoryNote', label: 'הערה', section: 3, display: 1, detail: 'x' };
  ok(render(LAVERA(), [ACN]).op.includes(`clearAlsoCategoryNote('b')`), '§721: הערה על קטגוריה – סימון כטופל');
  const noOpBox = render({ ...LAVERA(), tagSecondSuggestion: 'פיצה' }, [TAG], false);
  ok(noOpBox.qj.includes('approveTagSecondSuggestion'), '§721: עסק שלא מוצג לו "מה פתוח" – נשאר ב"שיפוט מהיר"');

  const fallback = render(LAVERA(), [IG, FB], false);
  ok(fallback.qj.includes('qjEdit_b_instagram'), 'עסק שלא מוצג לו "מה פתוח" – השורות נשארות, לא נעלמות');

  const one = render({ ...LAVERA(), pendingChanges: { instagram: IG.new }, pendingChangeDiff: { instagram: IG } }, [IG]);
  ok(one.op.includes(`opApprove('b','contact')`), 'שדה יחיד בשורה – הכפתור הרגיל');

  console.log('\n— האריחים —');
  const a = render(LAVERA(), [IG, FB]);
  ok(a.dealTile.includes('מה פתוח בעסק הזה'), 'אריח: הפניה ל"מה פתוח"');
  ok(!a.dealTile.includes('approveChangeField') && !a.dealTile.includes('rejectChangeField') && !a.dealTile.includes('mtile-cmp'), 'אריח: בלי השוואה ובלי ✅/❌');
  ok(a.dealTile.split('מה פתוח בעסק הזה').length === 2, 'אריח: הפניה אחת גם כשיש שני שדות');
  const COV = { field: 'coverPhoto', label: 'תמונה', section: 5, display: 4, old: 'a', new: 'b' };
  const cov = { ...LAVERA(), coverPhoto: 'a.jpg', pendingChanges: { coverPhoto: 'b.jpg' }, pendingChangeDiff: { coverPhoto: COV } };
  const m = render(cov, [COV]);
  ok(m.mediaTile.includes('מה פתוח בעסק הזה') && !m.mediaTile.includes('approveChangeField'), 'אריח תמונה: הפניה בלי ✅/❌');
  const noOp = render(LAVERA(), [IG, FB], false);
  ok(noOp.dealTile.includes(`approveChangeField('b','instagram')`), 'עסק שלא מוצג לו "מה פתוח" – באריח נשארים הכפתורים');
  const m2 = render(cov, [COV], false);
  ok(m2.mediaTile.includes(`approveChangeField('b','coverPhoto')`), 'וגם באריח התמונה');
  if (process.env.DUMP)fs.writeFileSync(process.env.DUMP, render(LAVERA(), [IG, FB]).op);
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
