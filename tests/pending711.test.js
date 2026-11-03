// §711 — "הטבה נוספת" בבקשת שינוי לא נמחקת כשמכריעים בשדות שלידה (הבוצ׳ר הכשר, 2.11).
// הקוד נחתך מ-admin-dashboard.html לפי תוכן (§361) ומורץ מול מסמך מדומה. TEST_SRC=קובץ מריץ מול גרסה אחרת של הקוד.
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
  cut('function fmtDiffVal(k, v) {', '// ממפה מסמך businesses'),
  cut('function weeklyFlagOn(v) {', '// ממפה מסמך members'),
  cut('const DIFF_FIELD_EXCLUDE = new Set([', '// ── מקור-אמת יחיד'),
  cut('// מקבל מסמך גולמי או עסק מ-hydrateBiz', '// ── סנכרון פרטי-הבעלים'),
  cut('const PENDING_COMPANION_FIELDS = {', '// היסטוריית מיילים'),
  cut('window.approveChangeField = async function', '// מה נכתב לעסק כשסוגרים'),
].join('\n');

const ASKED = [{ text: 'הטבה של קנייה מעל חמישים שקלים פחית שתייה', redeemMode: ['physical'], code: '', redeemTypes: ['physical'], builder: { type: 'other', otherText: 'הטבה של קנייה מעל חמישים שקלים פחית שתייה' } }];

// doc = המסמך הגולמי ב-Firestore. snapshot=true – בין פעולה לפעולה העסק נבנה מחדש מהמסמך, כמו onSnapshot
function build(rawDoc, snapshot) {
  const logs = [], s = { doc: rawDoc, biz: null };
  const env = {
    window: {}, db: {}, BIZ_TOKENS: {}, BIZ_PROOFS: {}, CATEGORIES: [], bizStaged: {}, QJ_DECIDED: {},
    REDEEM_MODE_LABELS_MOCK: {}, BIZ_TYPE_LABELS_MOCK: {}, SERVICE_MODE_LABELS: {},
    toRedeemArr: (v) => (Array.isArray(v) ? v : []), toJsDate: (v) => v || null, computeHealthScore: () => 0,
    DIFF_FIELD_LABELS_MOCK: { additionalDiscounts: 'הטבות נוספות', wantsBusinessOfWeek: 'עסק השבוע', wantsBenefitOfWeek: 'הטבת השבוע' },
    fmtActivityVal: (v) => JSON.stringify(v), qjItem: (label, decision) => ({ label, decision }), qjRemember: () => {},
    bizMissingCardTitle: () => false, withChangeDecision: (b, field, decision) => [...(b.changeDecisions || []), { field, decision }],
    opCloseAsksPatch: () => null, doc: (_d, c, id) => `${c}/${id}`,
    updateDoc: async (_r, u) => { s.doc = { ...s.doc, ...u }; },
    setDoc: async () => {}, deleteField: () => '__del__', serverTimestamp: () => 'TS',
    syncOwnerFieldsToMember: async () => {}, logActivity: async (_c, _id, e) => { logs.push(e); },
    renderMainPreserveScroll: () => {}, alert: (m) => { throw new Error(m); },
    findBiz: () => s.biz, bizOpenRows: () => [],
  };
  const fn = new Function(...Object.keys(env), `${CODE}\nreturn { w: window, hydrateBiz };`);
  const { w, hydrateBiz } = fn(...Object.values(env));
  s.biz = hydrateBiz('b', s.doc);
  const act = async (name, field) => { await w[name]('b', field); if (snapshot) s.biz = hydrateBiz('b', s.doc); };
  return { act, s, logs };
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
const butcher = () => ({
  id: 'b', name: 'הבוצ׳ר הכשר', status: 'pending', additionalDiscounts: [], wantsBusinessOfWeek: false, wantsBenefitOfWeek: false, pendingChangesAt: 'T',
  pendingChanges: { additionalDiscounts: ASKED, wantsBusinessOfWeek: true, wantsBenefitOfWeek: true },
});

(async () => {
  for (const snapshot of [true, false]) {
    console.log(`\n— אישור שני השדות שליד ההטבה (${snapshot ? 'עם' : 'בלי'} onSnapshot בין האישורים) —`);
    const t = build(butcher(), snapshot);
    ok(!!t.s.biz.pendingChangeDiff.additionalDiscounts, 'לפני האישורים: ההטבה הנוספת מוצגת כבקשה');
    await t.act('approveChangeField', 'wantsBusinessOfWeek');
    ok(!!(t.s.biz.pendingChangeDiff || {}).additionalDiscounts, 'אחרי האישור הראשון: ההטבה עדיין מוצגת');
    await t.act('approveChangeField', 'wantsBenefitOfWeek');
    const d = t.s.doc;
    ok(d.wantsBusinessOfWeek === true && d.wantsBenefitOfWeek === true, 'שני האישורים נכתבו');
    ok(d.pendingChanges && JSON.stringify(d.pendingChanges.additionalDiscounts) === JSON.stringify(ASKED), 'ההטבה נשארה ב-pendingChanges');
    ok(d.pendingChangesAt === 'T', 'התאריך של הבקשה נשאר');
    ok(d.additionalDiscounts.length === 0, 'ההטבה עוד לא נכתבה לעסק');
    ok(t.s.biz.hasPendingChange === true, 'העסק עדיין ברשימת הבקשות');
    ok((t.s.biz.pendingChangeDiff || {}).additionalDiscounts?.old === '–', 'בדיף "היום" ריק, לא הערך המבוקש');

    console.log('— ואז הכרעה בהטבה עצמה —');
    const a = build({ ...d }, snapshot);
    await a.act('approveChangeField', 'additionalDiscounts');
    ok(a.s.doc.additionalDiscounts === ASKED || JSON.stringify(a.s.doc.additionalDiscounts) === JSON.stringify(ASKED), '✅ נכתבה לעסק');
    ok(a.s.doc.pendingChanges === null && a.s.doc.pendingChangesAt === null, '✅ הבקשה נסגרה');
    ok(JSON.stringify(a.logs[0].before) === '[]', '✅ ביומן "לפני" הוא הערך האמיתי');
    const r = build({ ...d }, snapshot);
    await r.act('rejectChangeField', 'additionalDiscounts');
    ok(r.s.doc.additionalDiscounts.length === 0, '❌ לא נכתבה לעסק');
    ok(r.s.doc.pendingChanges === null, '❌ הבקשה נסגרה');
  }

  console.log('\n— מה שכן צריך לרדת ממשיך לרדת —');
  {
    const t = build({ id: 'b', additionalDiscounts: [], wantsBenefitOfWeek: false, pendingChangesAt: 'T', pendingChanges: { wantsBenefitOfWeek: true, discountBuilder: { type: 'other' } } }, true);
    await t.act('approveChangeField', 'wantsBenefitOfWeek');
    ok(t.s.doc.pendingChanges === null, 'שארית טכנית (discountBuilder) לא מחזיקה בקשה פתוחה');
  }
  {
    const t = build({ id: 'b', additionalDiscounts: ASKED, wantsBenefitOfWeek: false, pendingChangesAt: 'T', pendingChanges: { wantsBenefitOfWeek: true, additionalDiscounts: ASKED } }, true);
    ok(!(t.s.biz.pendingChangeDiff || {}).additionalDiscounts, 'הטבה נוספת זהה לקיימת אינה בקשה');
    await t.act('approveChangeField', 'wantsBenefitOfWeek');
    ok(t.s.doc.pendingChanges === null, 'וגם לא מחזיקה בקשה פתוחה');
  }

  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
