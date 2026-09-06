// §418 — הרנס-רינדור לטבלת "כל העסקים" במרכז הניהול.
//
// 🔑 **מריץ את פונקציות הרינדור שנשלפות מ-admin-dashboard.html עצמו** מול נתוני
// פרודקשן חיים — בדיקת-תחביר אינה תופסת מזהה חסר, והתסמין הוא "הטאב לא נפתח"
// (ר' feedback_tab_wont_open_check_render_throw).
//
// 🔑 **והוא גם תופס את הכתיבות במקום לבצע אותן** — כך אפשר לוודא שלחיצה על סימון
// שולחת בדיוק את השדה הנכון, בלי לגעת בפרודקשן.
//
//   node scratch_test_sections_table.js
//
const fs = require('fs');
const path = require('path');

global.window = {};
new Function(fs.readFileSync(path.join(__dirname, 'sections-policy.js'), 'utf8')).call(global);
const S = global.window.HB_SECTIONS;

const html = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
const START = '// ═══ §414 — הרכב הסקשן: מדיניות, תצוגה מקדימה, תור והיסטוריה';
const END = '\nfunction renderAll() {';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error('לא נמצא בלוק הסקשנים ב-admin-dashboard.html');
const block = html.slice(i, j);

const DATA_START = '// ═══ §418ו — הנתונים על העסק, בתוך כרטיס העסק';
const DATA_END = 'async function applySectionUpdate(';
const di = html.indexOf(DATA_START), dj = html.indexOf(DATA_END, di);
if (di < 0 || dj < 0) throw new Error('לא נמצא בלוק הנתונים על העסק');
const dataBlock = html.slice(di, dj);

// ⚠️ `esc` מוגדר **מחוץ** לבלוק שנשלף, ובדפדפן הוא גלובלי. נשלף מהקובץ עצמו לפי
// תוכן ולא מוקלד כאן מחדש — אחרת ההרנס היה בודק מול הברחה שאינה זו שרצה בפועל.
const ESC_START = 'function esc(v) {';
const ei = html.indexOf(ESC_START);
if (ei < 0) throw new Error('לא נמצאה הפונקציה esc ב-admin-dashboard.html');
const escSrc = html.slice(ei, html.indexOf(String.fromCharCode(10) + '}', ei) + 2);
const realEsc = new Function(escSrc + String.fromCharCode(10) + 'return esc;')();

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
      approvedAt: g(f, 'approvedAt'),
      clicks: Number((f.clicks && (f.clicks.integerValue ?? f.clicks.doubleValue)) || 0),
      likedBy: arr(f, 'likedBy').map(v => v.stringValue),
      likes: arr(f, 'likedBy').length,   // המסך משתמש ב-b.likes שנבנה ב-hydrateBiz
      discountText: g(f, 'discountText'), sectionDeals: g(f, 'sectionDeals'),
      registeredAt: g(f, 'submittedAt') ? new Date(g(f, 'submittedAt')) : null,
      registeredAtKnown: !!g(f, 'submittedAt'),
      sectionTurn: g(f, 'sectionTurn'), sectionAnswers: undefined,
      exposurePriority: Number((f.exposurePriority && f.exposurePriority.integerValue) || 0),
      logo: g(f, 'logo'), coverPhoto: g(f, 'coverPhoto'), isSubscriber: g(f, 'isSubscriber'),
    };
  });
  console.log('נתוני פרודקשן: ' + BIZ.length + ' עסקים מאושרים · ' + BIZ.filter(b => b.isFeatured).length + ' נבחרים קבועים\n');

  const env = {
    updateDoc: async (ref, patch) => { env.__writes.push(patch); },
    __writes: [],
    window: global.window,
    MOCK_BUSINESSES: BIZ,
    state: { featured: new Array(10).fill(null), 'new': new Array(10).fill(null) },
    isExpired: () => false,
    renderMain: () => {},
    showSaving: () => {}, hideSaving: () => {},
    logActivity: async () => {}, setDoc: async (ref, data) => { env.__saves.push(data); }, doc: () => ({}), db: {},
    __saves: [],
    fmtDate: (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—',
    alert: (m) => { env.__alerts.push(m); },
    __alerts: [],
    esc: realEsc,
    getDocs: async () => { env.__statsRead++; return { size: (env.__stats || []).length, forEach: (fn) => (env.__stats || []).forEach(fn) }; },
    collection: (...p) => ({ path: p.slice(1).join('/') }),
    where: () => ({}), limit: () => ({}), query: (...a) => ({}),
    platformEvents: null,
    increment: (n) => (n < 0 ? { __dec: -n } : { __inc: n }),
    confirm: () => env.__confirm !== false,
    adminMemberIds: () => new Set(env.__adminIds || []),
    renderAllPreserveScroll: () => {},
    URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
    Blob: function () {},
    __statsRead: 0,
    __stats: [],
    activeTab: 'featured',
    selectTab: (k) => { env.__tabJumps.push(k); },
    __tabJumps: [],
  };
  const names = Object.keys(env);
  const factory = new Function(...names,
    block + dataBlock + '\nreturn { sectionsTableHtml, secSummaryHtml, secTableRows, sectionModeSwitcherHtml, sectionsReviewHtml, secReviewList, bizDataHtml, bizShelfDays, bizDailyEvents, sectionsReportHtml, reportSentences, reportData, adminClicksFor, adminClicksSummary, adminClicksPanelHtml, adminClicksHtml, sectionsPlanHtml, planJoinersHtml, livePlan, planCohort, secQuality, secStrength, planJoinRate, sectionsTodayHtml, todayFillRanking, ' +
    'setSecFilter: window.setSecFilter, setSecSort: window.setSecSort, setSecSearch: window.setSecSearch, ' +
    'secToggle: window.secToggle, secCyclePrio: window.secCyclePrio, ' +
    'secAnswer: window.secAnswer, secSetPrio: window.secSetPrio, ' +
    'secSetPlacement: window.secSetPlacement, secSetPlacementFor: window.secSetPlacementFor, ' +
    'cleanAdminClicks: window.cleanAdminClicks, cleanAdminClicksAll: window.cleanAdminClicksAll, ' +
    '__setEvents: (e) => { platformEvents = e; }, adminMemberIds: () => adminMemberIds(), ' +
    'secReviewMove: window.secReviewMove, secReviewJump: window.secReviewJump, ' +
    '__reviewIdx: () => secReviewPos(), __reviewId: () => secReviewId, ' +
    'planAutoFill: window.planAutoFill, planSetReserved: window.planSetReserved, ' +
    'planEditCell: window.planEditCell, planSetCell: window.planSetCell, planPlaceJoiner: window.planPlaceJoiner, ' +
    'savePlanDraft: window.savePlanDraft, discardPlanDraft: window.discardPlanDraft, ' +
    'todaySwap: window.todaySwap, todayPin: window.todayPin, todayReset: window.todayReset, ' +
    'setReportBiz: window.setReportBiz, setReportRange: window.setReportRange, ' +
    'setBizStatsSection: window.setBizStatsSection, setDealsOptIn: window.setDealsOptIn, ' +
    'dealsOptInCardHtml, secInDeals, dealsOptIn, ' +
    'sectionsLaunchHtml, launchBannerHtml, secLaunchDone, secLaunchOpenCount, LAUNCH_STEPS, sectionModesFor, sectionModeFor, ' +
    'secLaunchToggle: window.secLaunchToggle, secLaunchShow: window.secLaunchShow, secLaunchGo: window.secLaunchGo, ' +
    '__reportRange: () => [reportFrom, reportTo], ' +
    '__planDirty: () => planDirty(), __setPlan: (p) => { SECTION_PLAN = p; planDraft = null; }, ' +
    '__setPolicy: (p) => { SECTION_POLICY = p; }, __setState: (st) => { SECTION_STATE = st; }, ' +
    '__setMode: (m) => { sectionViewMode = m; } };');
  const M = factory(...names.map(n => env[n]));

  const pol = S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 1, opportunity: 3, periodDays: 1, cooldown: 2, criteria: ['neverShown', 'leastClicks'] },
    'new': { enabled: true, days: 15, maxShown: 12, minShown: 6 },
    launchAt: '2026-09-07T00:00:00.000Z'
  });
  // יומן קצר, כדי שעמודות ההיסטוריה לא יהיו ריקות
  const ids = BIZ.slice(0, 8).map(b => b.id);
  M.__setPolicy(pol);
  M.__setState({ log: [
    { s: 'featured', p: 2, from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', ids: ids.slice(0, 4) },
    { s: 'featured', p: 1, from: '2026-08-20T00:00:00.000Z', to: '2026-08-27T00:00:00.000Z', ids: ids.slice(2, 8) },
  ] });

  const render = (label, fn) => {
    try {
      const out = fn();
      const good = typeof out === 'string' && out.length > 100 && !/undefined|NaN|\[object Object\]/.test(out);
      ok(good, label + (good ? ' (' + out.length + ' תווים)' : ' — פלט חשוד: ' + String(out).slice(0, 200)));
      return out;
    } catch (e) { ok(false, label + ' — זרק: ' + e.message); return ''; }
  };

  // 🔑 **הרנס שמריץ פרוסה אינו בודק את הקובץ.** פעמיים כבר עבר כאן קוד שבור:
  // פעם דרך הזרקת שרת-הפיתוח לתוך מחרוזת JS, ופעם דרך גרשיים מקוננים ב-template
  // literal — ושני המקרים הפילו את **כל** מרכז הניהול בזמן שכל הבדיקות היו ירוקות.
  console.log('── שלמות הקובץ ──');
  ok((function () {
    const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    if (!m) return false;
    const tmp = require('path').join(require('os').tmpdir(), 'yz-admin-check.mjs');
    fs.writeFileSync(tmp, m[1]);
    try { require('child_process').execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); return true; }
    catch (e) { console.log('       ' + String(e.stderr || e.message).split('\n').slice(0, 2).join(' | ')); return false; }
  })(), 'בלוק המודול של מרכז הניהול נפרס במלואו');
  ok((html.match(/<\/body>/g) || []).length === 1,
    '⚠️ </body> אחד בלבד בקובץ — server.ps1 מזריק live-reload לכל אחד, ומחרוזת JS שמכילה אותו שוברת את הדף');

  console.log('── רינדור ──');
  const table = render('טבלת כל העסקים', () => M.sectionsTableHtml());
  render('שורת הסיכום', () => M.secSummaryHtml());

  const rowCount = (table.match(/<tr class="/g) || []).length;
  ok(rowCount === BIZ.length, 'שורה לכל עסק (' + rowCount + ' מתוך ' + BIZ.length + ')');
  const esc = realEsc;
  const missing = BIZ.filter(b => table.indexOf(esc(b.name)) < 0);
  ok(!missing.length, 'כל שמות העסקים מופיעים' + (missing.length ? ' — חסרים ' + missing.length : ''));

  console.log('\n── שורת הסיכום ──');
  const sum = M.secSummaryHtml();
  ok((sum.match(/<tr>/g) || []).length === 3, 'שלוש שורות — סקשן לכל שורה');
  ['⭐ עסקים נבחרים', '💛 הטבות שוות', '✨ חדש אצלנו'].forEach(n =>
    ok(sum.indexOf(n) >= 0, 'הסקשן "' + n + '" מופיע'));
  ['נבחרים קבועים', 'בתורנות', 'מחוץ לסקשן'].forEach(gname =>
    ok(sum.indexOf(gname) >= 0, 'הקבוצה "' + gname + '" יושבת בשורת הנבחרים'));
  ok(sum.indexOf('מאגר') < 0, 'המונח "מאגר" אינו מופיע על המסך');
  ok(sum.indexOf('>' + BIZ.filter(b => b.isFeatured).length + '</b>') >= 0
    || sum.indexOf('<b>' + BIZ.filter(b => b.isFeatured).length + '</b>') >= 0,
    'מספר הנבחרים הקבועים תואם לנתונים (' + BIZ.filter(b => b.isFeatured).length + ')');

  console.log('\n── סינון ──');
  const count = () => M.secTableRows().length;
  M.setSecFilter('all'); const nAll = count();
  M.setSecFilter('star');
  ok(count() === BIZ.filter(b => b.isFeatured).length, 'סינון "נבחרים קבועים" מחזיר בדיוק את המסומנים (' + count() + ')');
  M.setSecFilter('turn');
  ok(count() === BIZ.filter(b => !b.isFeatured && b.sectionTurn !== false).length, 'סינון "בתורנות" מחזיר את מי שאינו נבחר קבוע ולא הוצא');
  M.setSecFilter('out');
  ok(count() === BIZ.filter(b => !b.isFeatured && b.sectionTurn === false).length, 'סינון "מחוץ לסקשן" מחזיר רק את מי שהוצא במפורש');
  M.setSecFilter('deals');
  const dealsExpected = BIZ.filter(b => (b.discountText || '').trim() && b.sectionDeals !== false).length;
  ok(count() === dealsExpected, 'סינון "בהטבות שוות" תואם לחישוב של home.html (' + count() + ')');
  M.setSecFilter('undef');
  ok(count() === BIZ.length, 'כל העסקים מסומנים "טרם הוגדרו" — אף אחד לא נשאל עדיין');
  M.setSecFilter('all');
  ok(count() === nAll && nAll === BIZ.length, 'חזרה ל"כל העסקים" מחזירה את כולם');

  console.log('\n── חיפוש ומיון ──');
  const someName = (BIZ.find(b => (b.name || '').length > 3) || {}).name || '';
  M.setSecSearch(someName.slice(0, 3));
  ok(count() > 0 && count() <= BIZ.length, 'חיפוש מצמצם ולא מרוקן (' + count() + ')');
  M.setSecSearch('');
  M.setSecSort('clicks'); M.setSecSort('clicks');
  const byClicks = M.secTableRows().map(b => Number(b.clicks) || 0);
  ok(byClicks.every((v, k) => k === 0 || v <= byClicks[k - 1]), 'מיון לפי כניסות — מהגבוה לנמוך');
  M.setSecSort('name');
  ok(M.secTableRows()[0] !== undefined, 'מיון לפי שם אינו מרוקן');
  M.setSecSort('columnThatDoesNotExist');
  ok(M.secTableRows().length === BIZ.length, 'מפתח מיון שאינו קיים אינו מרוקן את הטבלה');
  M.setSecSort('clicks');

  console.log('\n── כתיבות: מה בדיוק נשלח ──');
  const target = BIZ.find(b => !b.isFeatured) || BIZ[0];
  env.__writes.length = 0;
  await M.secToggle(target.id, 'star');
  ok(env.__writes.length === 1 && env.__writes[0].isFeatured === true, 'סימון נבחר קבוע שולח isFeatured:true');
  ok(env.__writes[0].featuredUntil === null, 'ומנקה featuredUntil, כדי שלא יישאר תאריך-תפוגה ישן');
  env.__writes.length = 0;
  await M.secToggle(target.id, 'turn');
  ok(env.__writes.length === 1 && env.__writes[0].sectionTurn === false, 'הוצאה מהתורנות שולחת sectionTurn:false');
  ok(Object.keys(env.__writes[0]).length === 1, 'שדה אחד בלבד — לא merge של אובייקט שלם שידרוס סימון אחר');
  env.__writes.length = 0;
  await M.secToggle(target.id, 'turn');
  ok(env.__writes[0].sectionTurn === true, 'לחיצה שנייה מחזירה לתורנות');

  // ⚠️ בפרודקשן כבר יש עסקים עם sectionDeals:false — הבדיקה חייבת לגזור את הציפייה
  // מהמצב בפועל, אחרת היא נכשלת על נתון תקין לגמרי.
  const shownInDeals = BIZ.find(b => (b.discountText || '').trim() && b.sectionDeals !== false);
  const hiddenInDeals = BIZ.find(b => (b.discountText || '').trim() && b.sectionDeals === false);
  if (shownInDeals) {
    env.__writes.length = 0;
    await M.secToggle(shownInDeals.id, 'deals');
    ok(env.__writes.length === 1 && env.__writes[0].sectionDeals === false, 'הוצאה מ"הטבות שוות" שולחת sectionDeals:false');
    await M.secToggle(shownInDeals.id, 'deals');
  }
  if (hiddenInDeals) {
    env.__writes.length = 0;
    await M.secToggle(hiddenInDeals.id, 'deals');
    ok(env.__writes.length === 1 && env.__writes[0].sectionDeals === true, 'החזרה ל"הטבות שוות" שולחת sectionDeals:true (' + hiddenInDeals.name + ')');
    await M.secToggle(hiddenInDeals.id, 'deals');
  }

  env.__writes.length = 0;
  const p0 = Number(target.exposurePriority) || 0;
  await M.secCyclePrio(target.id);
  ok(env.__writes.length === 1 && env.__writes[0].exposurePriority === (p0 + 1) % 4, 'עדיפות חשיפה מתקדמת ב-1 ומתאפסת אחרי 3');

  console.log('\n── ההשפעה חוזרת למסך ──');
  const before = M.secTableRows().filter(b => b.isFeatured).length;
  const other = BIZ.find(b => !b.isFeatured);
  await M.secToggle(other.id, 'star');
  ok(M.secTableRows().filter(b => b.isFeatured).length === before + 1, 'הסימון משתקף מיד ברשימה, בלי להמתין ל-onSnapshot');
  ok(M.secSummaryHtml().indexOf('<b>' + (before + 1) + '</b> נבחרים קבועים') >= 0, 'ושורת הסיכום מתעדכנת איתו');
  await M.secToggle(other.id, 'star');

  console.log('\n── מעבר על העסקים ──');
  const review = render('מסך המעבר', () => M.sectionsReviewHtml());
  ok(review.indexOf('מעבר על העסקים') >= 0, 'הכותרת מופיעה');
  ['איפה העסק מופיע בסקשן הנבחרים', 'הטבות שוות', 'עדיפות חשיפה'].forEach(q =>
    ok(review.indexOf(q) >= 0, 'השאלה "' + q + '" מופיעה'));

  // ⚠️ אף עסק לא נשאל עדיין — כל השאלות פתוחות, והאישור חסום.
  ok(review.indexOf('לא ניתן לאשר את העסק') >= 0, 'האישור חסום כל עוד יש שאלה פתוחה');
  ok((review.match(/טרם נענה/g) || []).length === 2, 'שתי השאלות מסומנות "טרם נענה"');
  ['⭐ נבחר קבוע', 'בתורנות', '🚫 מחוץ לסקשן'].forEach(o =>
    ok(review.indexOf(o) >= 0, 'האפשרות "' + o + '" מוצגת בבורר המקום'));
  ok(!/class="sc-ans on"/.test(review.split('עדיפות חשיפה')[0]),
    'אף תשובה אינה נראית מסומנת כשלא נענתה — ברירת-מחדל אינה תשובה');

  const first = M.secReviewList()[0];
  env.__writes.length = 0;
  await M.secSetPlacement('out');
  ok(env.__writes.length === 1, 'בחירת מקום שולחת כתיבה אחת');
  const w = env.__writes[0];
  // 🔑 שלוש האפשרויות סוגרות — כל אחת כותבת את **שני** השדות, כדי שלא ייווצר
  // "נבחר קבוע שגם הוצא מהתורנות". זו בדיוק הסתירה שהמשתמש הצביע עליה.
  ok(w.isFeatured === false && w.sectionTurn === false, '"מחוץ לסקשן" כותב את שני השדות יחד');
  ok(w['sectionAnswers.st'] === true && w['sectionAnswers.turn'] === true, 'ושתי התשובות מסומנות כנענו');
  ok(Object.keys(w).indexOf('sectionAnswers') < 0, '⚠️ לא נכתבת המפה השלמה');
  env.__writes.length = 0;
  await M.secSetPlacement('star');
  ok(env.__writes[0].isFeatured === true && env.__writes[0].sectionTurn === true,
    '🔑 "נבחר קבוע" אינו יכול להישאר מוחרג מהתורנות — שני השדות נכתבים יחד');

  const after = M.sectionsReviewHtml();
  ok((after.match(/טרם נענה/g) || []).length === 1, 'נשארה שאלה אחת פתוחה');
  ok(after.indexOf('לא ניתן לאשר את העסק') >= 0, 'האישור עדיין חסום');
  ok(first.sectionAnswers && first.sectionAnswers.turn === true,
    'העדכון המקומי קינן נכון ולא יצר שדה בשם "sectionAnswers.turn"');

  const stayId = M.__reviewId();
  await M.secAnswer('deals', true);
  ok(M.__reviewId() === stayId, '🐛 הכרטיס נשאר על אותו עסק גם אחרי שהוא עבר לסוף הרשימה');
  const done = M.sectionsReviewHtml();
  ok(done.indexOf(realEsc(first.name)) >= 0, 'ועדיין מוצג שמו של אותו עסק');
  ok(done.indexOf('כל השאלות נענו') >= 0, 'אחרי שלוש התשובות — השער נפתח');
  ok(done.indexOf('לא ניתן לאשר') < 0, 'והחסימה נעלמה');
  ok(done.indexOf('טרם נענה') < 0, 'ואין יותר שאלות פתוחות');

  env.__writes.length = 0;
  await M.secSetPrio(2);
  ok(env.__writes.length === 1 && env.__writes[0].exposurePriority === 2, 'עדיפות חשיפה נשמרת מהמסך');
  ok(M.sectionsReviewHtml().indexOf('פי שלושה') >= 0, 'וההסבר של הרמה שנבחרה מוצג');

  M.setSecFilter('undef');
  ok(M.secTableRows().indexOf(first) < 0, 'העסק שהוגדר יצא מהמסנן "טרם הוגדרו" בטבלה');
  M.setSecFilter('all');

  const beforeIdx = M.__reviewIdx();
  M.secReviewMove(1);
  ok(M.__reviewIdx() !== beforeIdx, 'מעבר לעסק הבא עובד');
  M.secReviewJump();
  ok(!(function () { const l = M.secReviewList(); const b = l[M.__reviewIdx()]; return b && b.sectionAnswers && b.sectionAnswers.st && b.sectionAnswers.turn && b.sectionAnswers.deals; })(),
    '"לעסק הבא שטרם הוגדר" מדלג על מי שכבר הוגדר');

  const sw2 = M.sectionModeSwitcherHtml({ key: 'featured' });
  ok(sw2.indexOf('מעבר על העסקים') >= 0, 'הלשונית של מסך המעבר קיימת');

  console.log('\n── לוח ההשקה ──');
  M.__setPlan(null);
  const plan0 = render('מסך לוח ההשקה', () => M.sectionsPlanHtml());
  const cfgDays = 15, cfgSlots = 12;
  // ⚠️ לפני שנבנה לוח — מצב-ריק מפורש, ולא ספירת-כיסוי אדומה שנקראת ככשל.
  ok(plan0.indexOf('טרם נבנה') >= 0, 'בפתיחה ראשונה מוצג מצב-ריק ולא אזהרה');
  ok(plan0.indexOf('עסקים אינם מופיעים באף יום') < 0, '🐛 ואין אזהרה אדומה לפני שהמשתמש עשה משהו');
  ok((plan0.match(/class="sc-day"/g) || []).length === 0, 'ואין רשת ימים לפני שנבנתה');


  M.planAutoFill(false);
  const filled = M.sectionsPlanHtml();
  ok((filled.match(/class="sc-day"/g) || []).length === cfgDays, cfgDays + " ימים מרונדרים אחרי מילוי");
  const cells = (filled.match(/class="sc-cell /g) || []).length;
  ok(cells === cfgDays * cfgSlots, 'כל ' + (cfgDays * cfgSlots) + ' המשבצות מרונדרות (' + cells + ')');
  ok(M.__planDirty(), 'המילוי מייצר טיוטה שלא נשמרה');
  ok(filled.indexOf('יש שינויים שלא נשמרו') >= 0, 'והמסך אומר את זה');

  // 🔑 המבחן המרכזי: אף יום אינו "היום החלש"
  const strongPerDay = [...filled.matchAll(/class="sg">(\d+) חזקים/g)].map(m => Number(m[1]));
  ok(strongPerDay.length === cfgDays, 'לכל יום מוצגת ספירת חזקים');
  const spread = Math.max.apply(null, strongPerDay) - Math.min.apply(null, strongPerDay);
  ok(spread <= 2, 'המילוי המעורב מפזר את החזקים בין הימים (פער ' + spread + ')');
  ok(Math.min.apply(null, strongPerDay) > 0, 'אין יום בלי אף עסק חזק');

  M.planAutoFill(true);
  const byQ = [...M.sectionsPlanHtml().matchAll(/class="sg">(\d+) חזקים/g)].map(m => Number(m[1]));
  const qSpread = Math.max.apply(null, byQ) - Math.min.apply(null, byQ);
  ok(qSpread > spread, 'מילוי "לפי חוזק" מפוזר פחות — כלומר המעורב באמת עושה משהו');
  M.planAutoFill(false);

  // כיסוי
  const cohort = M.planCohort();
  const planned = M.livePlan();
  const seen = {};
  planned.days.forEach(r => r.forEach(id => { if (id) seen[id] = (seen[id] || 0) + 1; }));
  ok(cohort.every(b => seen[b.id] > 0), 'כל עסק בקבוצה מופיע לפחות פעם אחת בלוח');
  ok(M.sectionsPlanHtml().indexOf('עסקים שלא מופיעים כלל') >= 0, 'הכיסוי מדווח על המסך');

  // מקומות שמורים
  M.planSetReserved(2);
  const res2 = (M.sectionsPlanHtml().match(/sc-cell res/g) || []).length;
  ok(res2 === 2 * cfgDays, 'שני מקומות שמורים בכל יום = ' + (2 * cfgDays) + ' משבצות (' + res2 + ')');
  M.planSetReserved(0);
  ok((M.sectionsPlanHtml().match(/sc-cell res/g) || []).length === 0, '0 שמורים — הלוח מלא לגמרי');
  M.planSetReserved(1);

  // החלפה ידנית
  const swapTo = M.planCohort()[M.planCohort().length - 1];
  M.planEditCell(0, 0);
  ok(M.sectionsPlanHtml().indexOf('sc-cell-sel') >= 0, 'לחיצה על משבצת פותחת רשימת בחירה');
  ok(/— (חזק|בינוני|חלש) \(/.test(M.sectionsPlanHtml()), 'וברשימה מסומן חוזק כל עסק');
  M.planSetCell(0, 0, swapTo.id);
  ok(M.livePlan().days[0][0] === swapTo.id, 'הבחירה נשמרת בטיוטה');
  M.planSetCell(0, 0, '');
  ok(M.livePlan().days[0][0] === null, 'ואפשר להחזיר את המשבצת למצב "שמור לעסק חדש"');

  // שמירה
  env.__saves.length = 0;
  await M.savePlanDraft();
  ok(env.__saves.length === 1, 'שמירה כותבת מסמך אחד');
  ok(Array.isArray(env.__saves[0].days) && env.__saves[0].days.length === cfgDays, 'המסמך מכיל את כל הימים');
  ok(typeof env.__saves[0].reserved === 'number', 'ואת מספר המקומות השמורים');
  ok(!M.__planDirty(), 'ואחרי השמירה אין טיוטה פתוחה');

  console.log('\n── הממתינים לתור וההמלצה ──');
  const joiners = render('רשימת הממתינים', () => M.planJoinersHtml());
  ok(joiners.indexOf('הצטרפו לאחרונה וממתינים לתור') >= 0, 'הרשימה מופיעה');
  ok(joiners.indexOf('עדיין לא משובצים') >= 0, 'עם ספירת מי שלא משובץ');
  const rate = M.planJoinRate();
  ok(joiners.indexOf('בשבוע האחרון נרשמו <b>' + rate.w1 + '</b>') >= 0,
    'הקצב שמוצג הוא הקצב שנמדד בפועל (' + rate.w1 + ' בשבוע האחרון)');
  ok(rate.fast >= rate.calm, 'קצב מהיר דורש לפחות כמו הקצב הרגיל');
  ok(rate.pick >= 1 && rate.pick <= Math.max(1, rate.fast), 'ההמלצה בין 1 לקצה המהיר (' + rate.pick + ')');
  ok(rate.w1 > 0, 'יש נתוני הרשמה אמיתיים בשבוע האחרון (' + rate.w1 + ') — אחרת הבדיקה חסרת ערך');
  ok(joiners.indexOf('ההמלצה: ' + rate.pick) >= 0, 'וההמלצה מוצגת עם מספר');
  ok(joiners.indexOf('planSetReserved(' + rate.pick + ')') >= 0, 'ויש כפתור שמחיל אותה');
  ok(joiners.indexOf('ובקצב הרגיל') >= 0, '⚠️ שני הקצבים מוצגים ולא ממוצע אחד שמסתיר את הפער');

  const sw3 = M.sectionModeSwitcherHtml({ key: 'featured' });
  ok(sw3.indexOf('לוח ההשקה') >= 0, 'הלשונית של לוח ההשקה קיימת');

  console.log('\n── המדף היום ──');
  const today = render('מסך המדף היום', () => M.sectionsTodayHtml());
  const shelfCount = () => (M.sectionsTodayHtml().match(/class="sc-shelf/g) || []).length;
  const slots = 12;
  ok(shelfCount() === slots, 'המדף מלא — ' + slots + ' מקומות (' + shelfCount() + ')');
  ok(today.indexOf('בחלון') >= 0, 'מסומן מי בחלון');
  ok(today.indexOf('להיום בלבד') >= 0, '⚠️ נאמר במפורש ששינוי כאן אינו נשמר למחר');

  // מי בחלון תמיד לפני ההשלמות
  const marks = [...M.sectionsTodayHtml().matchAll(/class="sc-shelf( new)?"/g)].map(m => !!m[1]);
  const firstFill = marks.indexOf(false);
  ok(firstFill < 0 || !marks.slice(firstFill).some(Boolean),
    'כל מי שבחלון מופיע לפני ההשלמות — "נכנס מיד" גובר תמיד');

  const cand = M.todayFillRanking();
  ok(cand.length > 0, 'יש מועמדים להשלמה (' + cand.length + ')');
  ok(today.indexOf('למה הוא') >= 0, 'ולכל מועמד מוצג נימוק');
  ok(/מהאחרונים שאושרו|מעולם לא קיבל חשיפה|כמעט לא נכנסו|ותיק יחסית/.test(today), 'הנימוק מנוסח בפועל');

  // החלפה
  const swapId = (M.sectionsTodayHtml().match(/todaySwap\('([^']+)'\)/) || [])[1];
  ok(!!swapId, 'יש כפתור החלפה על המדף');
  const swapName = BIZ.find(b => b.id === swapId).name;
  M.todaySwap(swapId);
  ok(M.sectionsTodayHtml().indexOf(realEsc(swapName)) < 0, 'העסק שהוחלף ירד מהמדף');
  ok(shelfCount() === slots, 'והמדף נשאר מלא — מישהו אחר נכנס במקומו');
  ok(M.sectionsTodayHtml().indexOf('חזרה לאוטומטי') >= 0, 'ומוצג שהמדף שונה ידנית');

  // 🐛 הצמדה חייבת להיכנע להוצאה — אחרת "החלף" לא עושה כלום על עסק שהוצמד
  M.todayPin(swapId);
  ok(M.sectionsTodayHtml().indexOf(realEsc(swapName)) >= 0, 'הצמדה ידנית מחזירה אותו למדף');
  M.todaySwap(swapId);
  ok(M.sectionsTodayHtml().indexOf(realEsc(swapName)) < 0, '🐛 והחלפה גוברת על ההצמדה');

  M.todayReset();
  ok(M.sectionsTodayHtml().indexOf('חזרה לאוטומטי') < 0, 'איפוס מחזיר לאוטומטי');
  ok(shelfCount() === slots, 'והמדף עדיין מלא');

  const sw4 = M.sectionModeSwitcherHtml({ key: 'featured' });
  ok(sw4.indexOf('המדף היום') >= 0, 'הלשונית של המדף היומי קיימת');

  console.log('\n── הנתונים בכרטיס העסק ──');
  const someBiz = BIZ.find(b => b.name) || BIZ[0];
  const data = render('עמוד הנתונים', () => M.bizDataHtml(someBiz));
  ok(data.indexOf('הנתונים על העסק') >= 0, 'הכותרת מופיעה');
  ok(data.indexOf('<svg') >= 0, 'הגרף מרונדר');
  ok(data.indexOf('ייצוא לאקסל') >= 0, 'יש ייצוא');

  // ⚠️ המדידה עדיין לא אוספת — והמסך חייב לומר את זה ולא להציג אפס כאילו זו מדידה
  ok(data.indexOf('מדידת החשיפות טרם החלה לאסוף') >= 0,
    '🔑 כשאין חשיפות המסך אומר זאת במפורש, במקום להציג 0 כאילו נמדד');
  ok(data.indexOf('נטענת בטאב <b>פלטפורמה</b>') >= 0,
    'וכשהמדידה היומית לא נטענה — נאמר איפה טוענים אותה');
  ok(!/>—<\/b>/.test(data.split('חשיפות')[0] || ''), 'הכותרות עצמן אינן ריקות');

  // כל 63 העסקים, כדי לתפוס זריקה על נתון חסר
  let threwOn = null;
  BIZ.forEach(b => { try { M.bizDataHtml(b); } catch (e) { if (!threwOn) threwOn = b.name + ': ' + e.message; } });
  ok(!threwOn, 'עמוד הנתונים מרונדר לכל 63 העסקים בלי לזרוק' + (threwOn ? ' — ' + threwOn : ''));

  // ימים בסקשן נגזרים מהיומן
  const withHist = BIZ.find(b => M.secReviewList() && Object.keys(M.bizShelfDays(b.id)).length > 0);
  ok(!!withHist, 'יש עסק שהיומן מכיל עבורו ימים בסקשן');
  if (withHist) {
    const shelf = M.bizShelfDays(withHist.id);
    ok(Object.keys(shelf).every(k => /^\d{4}-\d{2}-\d{2}$/.test(k)), 'הימים נגזרים כתאריכים מלאים ולא כאינדקסים');
    const dh = M.bizDataHtml(withHist);
    ok(dh.indexOf('הופעה 1') >= 0, 'וטבלת ההופעות מציגה כל הופעה בנפרד');
  }

  // ⚠️ הפקדים הידניים ירדו מכרטיס העסק
  ok(html.indexOf("activateSectionFlag('") < 0 || html.indexOf('<div class="flag-box-h">⭐ נבחר</div>') < 0,
    '🔑 שלושת הסימונים הידניים ירדו מכרטיס העסק');
  // ⚠️ **איחוד:** "המיקום באינדקס" ו"מיקום בסקשנים" ענו על אותה שאלה משני צדדים.
  // עכשיו כל שורת-סקשן אומרת גם את המצב וגם את העיגון.
  ok(html.indexOf('function bizSectionState(') > 0, 'מצב העסק בכל סקשן מחושב במקום אחד');
  ok(html.indexOf('מיקום בסקשנים') < 0, 'והבלוק הכפול ירד מהכרטיס');
  ok(html.indexOf('const secStatus = [') < 0, 'ולא נשאר קוד מת מאחוריו');
  ['⭐ נבחר קבוע', '🚫 הוצא מהתורנות', 'בתורנות', '💛 מוצג', 'אין הטבה', '✨ בחלון'].forEach(st =>
    ok(html.indexOf(st) > 0, 'המצב "' + st + '" מנוסח בשורת הסקשן'));
  ok(html.indexOf("anchorStandingRowHtml('new'") > 0, '✨ חדש אצלנו קיבל שורה משלו — לא הייתה לו');
  ok(html.indexOf('📊 נתונים והגדרות') > 0, 'השאלות והנתונים עברו לטאב משלהם, ליד "החלטות ויומן"');
  ok(html.indexOf('💙 לבבות') > 0, '⚠️ דריסת הלבבות נשארה — היא אינה סימון-סקשן ואין לה מקום אחר');

  console.log('\n── הדוח לבעל העסק ──');
  const rep1 = render('מסך הדוח', () => M.sectionsReportHtml());
  ok(rep1.indexOf('דוח לבעל העסק') >= 0, 'הכותרת מופיעה');
  ok(rep1.indexOf('הדפסה / PDF') >= 0, 'יש כפתור הדפסה');

  // 🔑 הכלל הראשון: אף מונח פנימי לא דולף לדף שבעל-עסק רואה
  const sheet = rep1.split('rp-sheet')[1] || '';
  const jargon = ['תורנות', 'נבחר קבוע', 'קריטריון', 'סבב', 'תקרה', 'עדיפות חשיפה', 'סקשן'];
  const leaked = jargon.filter(w => sheet.indexOf(w) >= 0);
  ok(!leaked.length, '🔑 אף מונח פנימי אינו דולף לדוח' + (leaked.length ? ' — דלפו: ' + leaked.join(', ') : ''));
  ok(sheet.indexOf('<table') < 0, 'ואין בו טבלה — הדוח בנוי ממשפטים');

  // 🔑 הכלל השני: תוצאה חלשה נאמרת כמו שהיא
  let sawFlat = false, sawUp = false, sawNone = false;
  BIZ.forEach(b => {
    const d = M.reportData(b);
    const st = M.reportSentences(b, d);
    if (st.tone === 'flat') sawFlat = true;
    if (st.tone === 'up') sawUp = true;
    if (!d.on.length) sawNone = true;
    if (st.tone !== 'up' && st.bottom.indexOf('הביא לך בערך') >= 0) throw new Error('תוצאה חלשה מתהדרת בכניסות נוספות: ' + b.name);
    if (/NaN|Infinity|undefined/.test(st.lead + st.bottom + st.lines.join(''))) throw new Error('מספר שבור אצל ' + b.name);
  });
  ok(true, 'אף עסק אינו מייצר מספר שבור או ניסוח שמייפה תוצאה חלשה');
  ok(sawNone, 'יש עסקים שלא קודמו בטווח — ולהם נאמר במפורש שלא קודמו');

  const never = BIZ.find(b => M.reportData(b).on.length === 0);
  const stNever = M.reportSentences(never, M.reportData(never));
  ok(stNever.lead.indexOf('לא קודם') >= 0, 'תקופה בלי קידום אומרת זאת במשפט הראשון');
  ok(!/פי [\d.]+/.test(stNever.lead + stNever.bottom), 'ולא מוצג שום יחס כשאין מה להשוות אליו');

  // טווח תאריכים
  M.setReportRange('2026-08-01', null);
  M.setReportRange(null, '2026-08-10');
  const narrow = M.reportData(BIZ[0]).rows.length;
  M.setReportRange('2026-07-08', null);
  M.setReportRange(null, '2026-09-06');
  const wide = M.reportData(BIZ[0]).rows.length;
  ok(wide > narrow, 'טווח רחב יותר מייצר יותר ימים (' + narrow + ' → ' + wide + ')');

  // ⚠️ טווח הפוך — טעות הקלדה נפוצה
  M.setReportRange('2026-09-01', null);
  M.setReportRange(null, '2026-08-01');
  const flipped = M.__reportRange();
  ok(flipped[0] <= flipped[1], '⚠️ טווח הפוך מיושר במקום להציג דוח ריק (' + flipped.join(' → ') + ')');

  const sw5 = M.sectionModeSwitcherHtml({ key: 'featured' });
  ok(sw5.indexOf('דוח לבעל עסק') >= 0, 'הלשונית של הדוח קיימת');

  console.log('\n── תקלות שנמצאו בבדיקה חיה ──');

  // 🐛 1+3: כותרת-טבלה דביקה כיסתה את סרגל הלשוניות ובלעה קליקים
  ok(html.indexOf('.sc-grid th { position: sticky') < 0,
    '🐛 כותרת הטבלה אינה דביקה יותר — היא כיסתה את הלשוניות ובלעה את הקליקים');
  ok(html.indexOf('.filter-toolbar-row { position: relative; z-index: 3; }') > 0,
    'ולסרגל הלשוניות יש z-index מפורש, כהגנה מפני חזרה של אותה תקלה');

  // 🐛 2: לחיצה על 'חדש אצלנו' בסיכום קפצה ל'כל העסקים'
  const sum2 = M.secSummaryHtml();
  const newRow = sum2.split('✨ חדש אצלנו')[1] || '';
  ok(newRow.indexOf("setSecFilter('newin')") >= 0, '🐛 קבוצת "מוצגים היום" מסננת לעצמה ולא ל"כל העסקים"');
  ok(newRow.indexOf("setSecFilter('newout')") >= 0, 'וגם "בחלון ולא מוצגים"');
  ok(newRow.indexOf("setSecFilter('all')") < 0, 'ואף אחת מהן אינה מצביעה יותר על "הכל"');

  M.setSecFilter('newin');
  const inNew = M.secTableRows();
  M.setSecFilter('newout');
  const outNew = M.secTableRows();
  M.setSecFilter('all');
  ok(inNew.length > 0, 'המסנן "מוצגים בחדש אצלנו" מחזיר עסקים (' + inNew.length + ')');
  ok(inNew.length <= 12, 'ולא יותר מהתקרה');
  const cross = inNew.filter(b => outNew.some(x => x.id === b.id));
  ok(!cross.length, '⚠️ אין עסק שמופיע גם כמוצג וגם כמעל-התקרה');
  ok(M.sectionsTableHtml().indexOf('מוצגים בחדש אצלנו') >= 0, 'והמסנן מופיע בסרגל');

  console.log('\n── ניקוי הקליקים שלנו ──');
  // 🔑 הדיווח: *"אני רואה כל הזמן את אותם העסקים בהכי פופולריים — אלה שעשינו עליהם
  // בדיקות"*. "הכי פופולריים" ממוין לפי `clicks`, ולכן קליקי-הבדיקה שלנו קובעים
  // בפועל מה האוהדים רואים.
  ok(M.adminClicksFor(BIZ[0]) === null, '⚠️ בלי מדידה טעונה — מחזיר null ולא 0, כדי שלא יוצג "אין" כעובדה');
  ok(M.adminClicksPanelHtml().indexOf('עדיין לא נטענה') >= 0, 'והמסך אומר שהמדידה לא נטענה');

  // מדידה מדומה: שני מנהלים, שלושה עסקים
  const clkBiz = BIZ[0], clkOther = BIZ[1];
  env.__adminIds = ['admin-1', 'admin-2'];
  const d = (n) => new Date(Date.now() - n * 86400000);
  M.__setEvents([
    { type: 'bizClick', bizId: clkBiz.id, memberId: 'admin-1', at: d(3) },
    { type: 'bizClick', bizId: clkBiz.id, memberId: 'admin-2', at: d(2) },
    { type: 'bizClick', bizId: clkBiz.id, memberId: 'fan-9',   at: d(1) },
    { type: 'bizClick', bizId: clkOther.id,  memberId: 'admin-1', at: d(5) },
    { type: 'heart',    bizId: clkBiz.id, memberId: 'admin-1', at: d(1) },
  ]);
  const info = M.adminClicksFor(clkBiz);
  ok(info.n === 2, 'נספרים רק קליקים של מנהלים (' + info.n + ' מתוך 3)');
  ok(M.adminClicksFor({ ...clkBiz, clicksAdminCleanedUpTo: d(2.5).toISOString() }).n === 1,
    '🔑 מה שכבר נוקה אינו נספר שוב — אחרת המונה היה יורד מתחת לאמת');

  const clkSum = M.adminClicksSummary();
  ok(clkSum.rows.length === 2 && clkSum.total === 3, 'הסיכום מכסה את כל העסקים (' + clkSum.total + ' קליקים מ-' + clkSum.rows.length + ')');
  const panel = M.adminClicksPanelHtml();
  ok(panel.indexOf('הקליקים שלנו במונה') >= 0, 'הכרטיס מרונדר');
  // ⚠️ אין כפתור בכוונה — הניקוי אוטומטי (בקשת המשתמש: 'שלא נתייחס ללחיצות שלנו בכלל').
  ok(panel.indexOf('ינוכו מעצמם') >= 0, 'הכרטיס מדווח שהניקוי אוטומטי ולא מבקש פעולה');
  ok(panel.indexOf('הורד את כולם מהמונה') < 0, 'ואין כפתור ידני');
  ok(panel.indexOf('30 יום בלבד') >= 0, '⚠️ ומגבלת 30 הימים כתובה על המסך ולא רק בקוד');

  env.__writes.length = 0;
  env.__confirm = true;
  await M.cleanAdminClicks(clkBiz.id);
  ok(env.__writes.length === 1, 'ניקוי עסק בודד — כתיבה אחת');
  const cw = env.__writes[0];
  ok(cw.clicks && cw.clicks.__dec === 2, 'המונה יורד בדיוק במספר הקליקים שלנו');
  ok(!!cw.clicksAdminCleanedUpTo, 'ונרשם עד מתי נוקה — כדי שלא ינוכה פעמיים');

  console.log('\n── בורר הסקשן בעמוד הנתונים ──');
  const withShelf = BIZ.find(x => Object.keys(M.bizShelfDays(x.id)).length > 0) || BIZ[0];
  const secView = M.bizDataHtml(withShelf);
  ok(secView.indexOf('⭐ נבחרים') >= 0 && secView.indexOf('✨ חדש אצלנו') >= 0, 'הבורר מציג את שני הסקשנים');
  ok(secView.indexOf('💛 הטבות שוות') >= 0, '💛 הטבות שוות נוסף לבורר — החברות בו נבחרת ידנית');
  // ⚠️ אין לו תקופות, ולומר '0 ימים' היה מצג-שווא — ההסבר מוצג כשבוחרים אותו.
  M.setBizStatsSection && M.setBizStatsSection('deals');
  const dealsView = M.bizDataHtml(withShelf);
  ok(dealsView.indexOf('אין ימים למדוד') >= 0,
    '🔑 ובבחירתו נאמר במפורש שאין שם תקופות והמספרים הם של העסק כולו');
  M.setBizStatsSection && M.setBizStatsSection('all');
  ok(secView.indexOf("setBizStatsSection('featured')") >= 0
     && secView.indexOf("setBizStatsSection('new')") >= 0, 'שני הכפתורים פעילים');

  console.log('\n── 💛 הטבות שוות: מעבר לבחירה ידנית ──');
  // 🔑 **המלכודת המרכזית:** לרוב העסקים אין `sectionDeals` כלל. מעבר לאופט-אין בלי
  // סימון מוקדם היה **מרוקן את הסקשן באתר החי באותו רגע**.
  ok(M.dealsOptIn() === false, 'ברירת המחדל היא האוטומטי הישן — שום דבר לא משתנה מעצמו');
  const beforeCount = BIZ.filter(M.secInDeals).length;
  ok(beforeCount > 0, 'ובמצב הזה הסקשן מלא (' + beforeCount + ')');
  const card = M.dealsOptInCardHtml();
  ok(card.indexOf('אוטומטי') >= 0, 'הכרטיס אומר שהמצב הנוכחי אוטומטי');
  ok(card.indexOf('יסמן קודם') >= 0, '🔑 והוא מסביר שהמעבר מסמן קודם ורק אחר כך מדליק');
  ok(card.indexOf('היה מרוקן את הסקשן') >= 0, '⚠️ והסכנה נאמרת במפורש ולא רק בקוד');

  console.log('\n── חסימת האישור ──');
  // ⚠️ `approveBizWithMemberBatch` יושבת **מחוץ** לבלוק הסקשנים, ולכן נשלפת בנפרד
  // לפי תוכן — היא המסלול היחיד שדרכו עוברים שני כפתורי האישור (בודד ומרובה).
  const AP = 'async function approveBizWithMemberBatch(b) {';
  const ai = html.indexOf(AP);
  ok(ai > 0, 'פונקציית האישור נמצאה בקובץ');
  const apSrc = html.slice(ai, html.indexOf(String.fromCharCode(10) + '}', ai) + 2);
  ok(apSrc.indexOf('secOpenQuestions') > 0, 'החסימה יושבת בתוך פונקציית האישור עצמה');

  const mkApprove = (openQs) => {
    const calls = { batches: 0, alerts: [] };
    const fn = new Function('secOpenQuestions', 'alert', 'prepareLinkedMemberApproval', 'writeBatch', 'db', 'doc', 'serverTimestamp', '__calls',
      apSrc + String.fromCharCode(10) + 'return approveBizWithMemberBatch;')(
      () => openQs,
      (m) => calls.alerts.push(m),
      async () => null,
      () => ({ update: () => {}, set: () => {}, commit: async () => { calls.batches++; } }),
      {}, () => ({}), () => 'ts', calls);
    return { fn, calls };
  };

  const blocked = mkApprove([['turn', 'שישתתף בתורנות?']]);
  let threw = false;
  try { await blocked.fn({ id: 'x', name: 'עסק לבדיקה' }); } catch (e) { threw = true; }
  ok(threw, 'אישור עסק עם שאלה פתוחה נחסם ולא מתבצע');
  ok(blocked.calls.batches === 0, 'ולא נכתבה שום כתיבה למסד');
  ok(blocked.calls.alerts.length === 1 && blocked.calls.alerts[0].indexOf('שישתתף בתורנות') >= 0,
    'ההודעה אומרת בדיוק איזו שאלה נותרה פתוחה');
  ok(blocked.calls.alerts[0].indexOf('מעבר על העסקים') >= 0, 'ומפנה למסך שבו עונים');

  const allowed = mkApprove([]);
  let ok2 = true;
  try { await allowed.fn({ id: 'x', name: 'עסק לבדיקה' }); } catch (e) { ok2 = false; }
  ok(ok2 && allowed.calls.batches === 1, 'עסק שכל שאלותיו נענו מאושר כרגיל');
  ok(allowed.calls.alerts.length === 0, 'ובלי שום הודעה');

  ok((html.match(/approveBizWithMemberBatch\(/g) || []).length >= 3,
    'שני מסלולי האישור עוברים דרך אותה פונקציה — אין מסלול שעוקף את החסימה');

  console.log('\n── לשונית המסך ──');
  const sw = M.sectionModeSwitcherHtml({ key: 'featured' });
  ok(sw.indexOf('כל העסקים') >= 0, 'הכפתור למסך החדש קיים בסרגל הלשוניות');
  ok(sw.indexOf("setSectionViewMode('table')") >= 0, 'והוא מפעיל את המסך הנכון');

  console.log('\n── §418יז — מדריך יום ההשקה ──');
  {
    M.__setPolicy(Object.assign({}, pol, { launchDone: {} }));
    const open = M.sectionsLaunchHtml();
    ok(open.indexOf('5 שלבים נותרו') > 0, 'חמישה שלבים פתוחים כשאין סימונים');
    ok(open.indexOf('git push') < 0, '⚠️ שלב הדחיפה כבר אינו במדריך — הקוד נדחף');
    ok(open.indexOf('לכל עסק שלוש שאלות') > 0, 'והשלב הראשון הוא המעבר על העסקים');
    ok(open.indexOf('לכבות את המדיניות ולשמור') > 0, '⚠️ דרך-החזרה מופיעה תמיד, לא רק כשמשהו משתבש');
    ok(open.indexOf('הצג') < 0, 'ואין כפתור "הצג שסומנו" כשעוד לא סומן דבר');

    M.__setPolicy(Object.assign({}, pol, { launchDone: { push: true, review: true, deals: true } }));
    const partial = M.sectionsLaunchHtml();
    ok(partial.indexOf('3 שלבים נותרו') > 0, '🔑 שני סימונים מורידים את המונה לשלושה — ו-push היתום אינו נספר');
    ok(partial.indexOf('לכל עסק שלוש שאלות') < 0, '🔑 שלב שסומן **נעלם** מהרשימה — זו כל הבקשה');
    ok(partial.indexOf('הצג 2 שסומנו') > 0, 'ואפשר להחזיר אותם למסך');
    ok(partial.indexOf('2</b> הושלמו') > 0, 'הכותרת סופרת את שהושלמו');

    M.__setPolicy(Object.assign({}, pol, { launchDone: { review: 1, deals: 1, plan: 1, enable: 1, verify: 1 } }));
    const all = M.sectionsLaunchHtml();
    ok(all.indexOf('הכול סומן') > 0, 'כשהכול סומן הכותרת אומרת זאת');
    ok(M.launchBannerHtml() === '', '⚠️ והבאנר נעלם לגמרי — אחרי ההשקה הוא לא מלכלך את המסך');

    M.__setPolicy(Object.assign({}, pol, { launchDone: {} }));
    ok(M.launchBannerHtml().indexOf('5</b> שלבים') > 0, 'לפני כן הבאנר מוביל למדריך');
  }

  console.log('\n── הסימון נשמר ──');
  {
    M.__setPolicy(Object.assign({}, pol, { launchDone: {} }));
    env.__saves.length = 0;
    await M.secLaunchToggle('deals');
    ok(env.__saves.length === 1 && env.__saves[0].launchDone && env.__saves[0].launchDone.deals === true,
      'לחיצה כותבת את השלב שסומן');
    ok(Object.keys(env.__saves[0]).length === 1,
      '🔑 **הכתיבה נוגעת רק ב-launchDone** — סימון של שלב אינו יכול לשנות את המדיניות עצמה');
    ok(M.secLaunchDone().deals === true, 'והמצב המקומי מתעדכן מיד, בלי להמתין ל-onSnapshot');

    await M.secLaunchToggle('deals');
    ok(env.__saves[1].launchDone.deals === false, 'לחיצה חוזרת מבטלת');
  }

  console.log('\n── קפיצה למסך הנכון ──');
  {
    env.__tabJumps.length = 0;
    M.secLaunchGo('review', 'featured');
    ok(env.__tabJumps.length === 0, 'קפיצה בתוך אותו טאב אינה מחליפה טאב');
    M.secLaunchGo('deals', 'deals');
    ok(env.__tabJumps.length === 1 && env.__tabJumps[0] === 'deals',
      '⚠️ אבל מסך שאינו קיים בטאב הנוכחי מחליף גם את הטאב — אחרת הכפתור נראה מת');
    M.LAUNCH_STEPS.filter(st => st.go).forEach(st => {
      ok(M.sectionModesFor(st.go[1]).some(m => m[0] === st.go[0]),
        'היעד "' + st.go[0] + '" באמת קיים בטאב "' + st.go[1] + '"');
    });
  }

  console.log('\n── ברירת המחדל של הטאב ──');
  {
    M.__setMode('launch');
    ok(M.sectionModeFor('featured') === 'launch', 'המדריך נפתח כשבוחרים בו');
    M.__setMode('report');
    ok(M.sectionModeFor('deals') !== 'launch',
      '🔑 טאב שלא תומך במצב הנוכחי אינו נופל למדריך — אחרת המדריך היה הופך למסך-הפתיחה של הטאב');
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' עברו' + (fail ? ' · ' + fail + ' נכשלו' : ''));
  process.exit(fail ? 1 : 0);
})();
