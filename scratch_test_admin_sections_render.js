// §414ב — הרנס-רינדור למסך "הרכב הסקשן" במרכז הניהול.
//
// 🔑 **בדיקת-תחביר אינה תופסת מזהה חסר.** הבאג הכי נפוץ במסך הזה הוא בדיוק זה:
// פונקציית-רינדור שזורקת ReferenceError, והטאב פשוט "לא נפתח" — ר'
// feedback_tab_wont_open_check_render_throw. לכן ההרנס **מריץ** את פונקציות הרינדור
// שנשלפות מ-admin-dashboard.html עצמו, מול נתוני פרודקשן חיים, ובודק שיוצא HTML.
//
//   node scratch_test_admin_sections_render.js
//
const fs = require('fs');
const path = require('path');

global.window = {};
new Function(fs.readFileSync(path.join(__dirname, 'sections-policy.js'), 'utf8')).call(global);
const S = global.window.HB_SECTIONS;

const html = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
// הבלוק נשלף לפי תוכן ולא לפי מספרי-שורה (feedback_test_harness_anchor_by_content)
const START = '// ═══ §414 — הרכב הסקשן: מדיניות, תצוגה מקדימה, תור והיסטוריה';
const END = '\nfunction renderAll() {';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצא בלוק §414 ב-admin-dashboard.html');
const block = html.slice(i, j);

const FS_URL = 'https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery';
const QUERY = { structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 300 } };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

(async () => {
  const res = await fetch(FS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(QUERY) });
  const g = (f, k) => { const v = f[k]; return v ? (v.stringValue ?? v.booleanValue ?? v.timestampValue ?? undefined) : undefined; };
  const arr = (f, k) => (f[k] && f[k].arrayValue && f[k].arrayValue.values) || [];
  const BIZ = (await res.json()).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split('/').pop(), name: g(f, 'name'), status: 'approved',
      isFeatured: g(f, 'isFeatured'), featuredUntil: g(f, 'featuredUntil'),
      isNew: g(f, 'isNew'), newUntil: g(f, 'newUntil'), approvedAt: g(f, 'approvedAt'),
      clicks: Number((f.clicks && (f.clicks.integerValue ?? f.clicks.doubleValue)) || 0),
      likedBy: arr(f, 'likedBy').map(v => v.stringValue),
      hasDiscount: g(f, 'hasDiscount'), discountText: g(f, 'discountText'),
      logo: g(f, 'logo'), coverPhoto: g(f, 'coverPhoto'), desc: g(f, 'desc'),
      hours: g(f, 'hours'), tags: arr(f, 'tags').map(v => v.stringValue),
      isSubscriber: g(f, 'isSubscriber'),
    };
  });
  console.log('נתוני פרודקשן: ' + BIZ.length + ' עסקים מאושרים\n');

  // ── סביבה: כל מה שהבלוק מצפה לו מהקובץ הגדול, כדי שהוא ירוץ בבידוד ──
  const env = {
    updateDoc: async () => {},
    window: global.window,
    MOCK_BUSINESSES: BIZ,
    state: { featured: new Array(10).fill(null), 'new': new Array(10).fill(null) },
    isExpired: () => false,
    renderMain: () => {},
    showSaving: () => {}, hideSaving: () => {},
    logActivity: async () => {}, setDoc: async () => {}, doc: () => ({}), db: {},
    fmtDate: (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—',
    alert: () => {},
  };
  const names = Object.keys(env);
  const exported = ['policyCardHtml', 'previewCardHtml', 'criteriaCardHtml', 'queueCardHtml',
                    'historyCardHtml', 'sectionComposeHtml', 'sectionGuideHtml',
                    'newWindowCardHtml', 'sectionModeSwitcherHtml'];
  const factory = new Function(...names,
    block + '\nreturn { ' + exported.join(', ') + ', setPolicyField: window.setPolicyField, ' +
    'togglePolicyCriterion: window.togglePolicyCriterion, __setPolicy: (p) => { SECTION_POLICY = p; }, ' +
    '__setState: (st) => { SECTION_STATE = st; }, __draft: () => policyDraft };');
  const M = factory(...names.map(n => env[n]));

  const tabF = { key: 'featured', label: '⭐ נבחרים', type: 'section' };
  const tabN = { key: 'new', label: '✨ חדש אצלנו', type: 'section' };

  const render = (label, fn) => {
    try {
      const out = fn();
      const good = typeof out === 'string' && out.length > 100 && !/undefined|NaN|\[object Object\]/.test(out);
      ok(good, label + (good ? ' (' + out.length + ' תווים)' : ' — פלט חשוד: ' + String(out).slice(0, 160)));
      return out;
    } catch (e) {
      ok(false, label + ' — זרק: ' + e.message);
      return '';
    }
  };

  console.log('── מדיניות כבויה (מצב הפתיחה בפרודקשן) ──');
  M.__setPolicy(null); M.__setState({ log: [] });
  render('מדריך · נבחרים', () => M.sectionGuideHtml('featured'));
  render('מדריך · חדש אצלנו', () => M.sectionGuideHtml('new'));
  render('מסך מלא · נבחרים', () => M.sectionComposeHtml(tabF));
  render('מסך מלא · חדש אצלנו', () => M.sectionComposeHtml(tabN));

  console.log('\n── מדיניות פעילה ──');
  const pol = S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 2, opportunity: 2, periodDays: 7, cooldown: 2, criteria: ['neverShown', 'leastClicks', 'onlyWithCover'] },
    'new': { enabled: true, days: 15, maxShown: 0 },
    launchAt: '2026-09-07T00:00:00.000Z',
  });
  M.__setPolicy(pol);
  const pIdx = S.periodIndex(pol, 'featured', Date.now());
  const b1 = S.buildFeatured(BIZ, pol, { state: { log: [] }, periodIndex: pIdx });
  M.__setState({ log: [{ s: 'featured', p: pIdx, from: new Date().toISOString(), to: new Date().toISOString(), ids: b1.list.map(b => b.id) }] });

  const fullF = render('מסך מלא · נבחרים', () => M.sectionComposeHtml(tabF));
  const fullN = render('מסך מלא · חדש אצלנו', () => M.sectionComposeHtml(tabN));
  render('מתג לשוניות', () => M.sectionModeSwitcherHtml(tabF));

  console.log('\n── תוכן שחייב להופיע במסך ──');
  ok(fullF.includes('מחוץ למאגר'), 'נבחרים: מוצגת רשימת מי-שמחוץ-למאגר (מסלול ההזדמנות)');
  ok(fullF.includes('שכבה אחת בלבד') && fullF.includes('אינו</b> נוגע בעוגנים'),
     'נבחרים: כרטיס הקריטריונים אומר במפורש על מה הוא משפיע — ועל מה לא');
  ok(fullF.includes('מאגר גדול מהסקשן'), 'נבחרים: המדריך מסביר למה המאגר גדול מהסקשן');
  ok(S.CRITERIA.every(c => fullF.includes(c.label)), 'נבחרים: כל ' + S.CRITERIA.length + ' הקריטריונים מוצגים עם השם שלהם');
  ok(S.CRITERIA.every(c => fullF.includes(c.why)), 'נבחרים: לכל קריטריון מוצג גם הנימוק');
  ok(fullN.includes('נכנס מיד'), 'חדש אצלנו: המדריך מבטיח כניסה מיידית');
  ok(fullN.includes('נקודת האפס'), 'חדש אצלנו: המדריך מסביר את יום ההשקה');
    ok(fullN.includes('7.9.2026'), 'חדש אצלנו: תאריך ההשקה שהוגדר מוצג בפועל במדריך');
    ok(fullF.includes('אחת ל-') && fullF.includes('תקופות'), 'נבחרים: המדריך מחשב כל כמה זמן עסק מקבל תור');
    ok(fullF.includes('8 סבב + 2 הזדמנות') && fullF.includes('4 סבב + 6 הזדמנות'), 'נבחרים: שתי הדוגמאות המספריות מוצגות');
    ok(fullF.includes('מתחלף <b>אחת ל-'), 'נבחרים: המדריך אומר מתי ההרכב מתחלף');
    ok(fullF.includes('עדיפות ידנית'), 'נבחרים: הקריטריון הידני החדש מוצג');
  ok(!fullN.includes('תור החשיפה') && !fullN.includes('מהתור'), 'חדש אצלנו: אין שריד למנגנון-התור שנדחה');
  ok(!fullN.includes('טריים'), 'חדש אצלנו: אין שריד לשכבת ה"טריים"');

  console.log('\n── אינטראקציה: שינוי ערך מייצר טיוטה ומשתקף מיד ──');
  try {
    M.setPolicyField('featured', 'opportunity', 4);
    ok(M.__draft() && M.__draft().featured.opportunity === 4, 'שינוי מספר מקומות ההזדמנות נשמר בטיוטה');
    const after = M.sectionComposeHtml(tabF);
    ok(after.includes('שינויים שלא נשמרו'), 'המסך מציג שיש שינויים שלא נשמרו');
    M.togglePolicyCriterion('featured', 'completeProfile');
    ok(M.__draft().featured.criteria.includes('completeProfile'), 'סימון קריטריון מתווסף לטיוטה');
    render('מסך מלא אחרי שינויים', () => M.sectionComposeHtml(tabF));
  } catch (e) {
    ok(false, 'אינטראקציה זרקה: ' + e.message);
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
