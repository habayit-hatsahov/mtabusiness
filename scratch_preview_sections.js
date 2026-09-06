// §418 — מייצר תצוגה מקדימה סטטית של המסכים החדשים, כדי שאפשר יהיה **להסתכל עליהם**.
//
// 🔑 **הרנס שעובר אינו מסך שנראה טוב.** הבדיקות מוודאות שה-HTML נוצר ושהמספרים
// נכונים; הן אינן רואות טבלה שגולשת מהמסך, תג שנחתך, או צבע שנעלם. הקובץ הזה מריץ
// את **אותן פונקציות רינדור** מול נתוני פרודקשן, ומדביק אותן לתוך **גיליון הסגנונות
// האמיתי** של מרכז הניהול.
//
// ⚠️ מה זה **לא** בודק: את הדף החי מאחורי האימות, טעינת נתונים, ואינטראקציה.
//
//   node scratch_preview_sections.js   →   scratch_preview_sections.html
//
const fs = require('fs');
const path = require('path');

global.window = {};
new Function(fs.readFileSync(path.join(__dirname, 'sections-policy.js'), 'utf8')).call(global);
const S = global.window.HB_SECTIONS;

const html = fs.readFileSync(path.join(__dirname, 'admin-dashboard.html'), 'utf8');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
if (!styles) throw new Error('לא נמצא גיליון סגנונות ב-admin-dashboard.html');

const cut = (start, end) => {
  const i = html.indexOf(start), j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('בלוק חסר: ' + start.slice(0, 40));
  return html.slice(i, j);
};
const block = cut('// ═══ §414 — הרכב הסקשן: מדיניות, תצוגה מקדימה, תור והיסטוריה', '\nfunction renderAll() {');
const dataBlock = cut('// ═══ §418ו — הנתונים על העסק, בתוך כרטיס העסק', 'async function applySectionUpdate(');
const escSrc = (() => {
  const i = html.indexOf('function esc(v) {');
  return html.slice(i, html.indexOf(String.fromCharCode(10) + '}', i) + 2);
})();
const realEsc = new Function(escSrc + String.fromCharCode(10) + 'return esc;')();

const FS_URL = 'https://firestore.googleapis.com/v1/projects/habayit-hatsahov/databases/(default)/documents:runQuery';
const QUERY = { structuredQuery: { from: [{ collectionId: 'businesses' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } }, limit: 300 } };

(async () => {
  const res = await fetch(FS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(QUERY) });
  const g = (f, k) => { const v = f[k]; return v ? (v.stringValue ?? v.booleanValue ?? v.timestampValue ?? undefined) : undefined; };
  const arr = (f, k) => (f[k] && f[k].arrayValue && f[k].arrayValue.values) || [];
  const BIZ = (await res.json()).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split('/').pop(), name: g(f, 'name'), status: 'approved',
      isFeatured: g(f, 'isFeatured'), approvedAt: g(f, 'approvedAt'),
      clicks: Number((f.clicks && (f.clicks.integerValue ?? f.clicks.doubleValue)) || 0),
      likedBy: arr(f, 'likedBy').map(v => v.stringValue), likes: arr(f, 'likedBy').length,
      discountText: g(f, 'discountText'), sectionDeals: g(f, 'sectionDeals'), sectionTurn: g(f, 'sectionTurn'),
      exposurePriority: 0, logo: g(f, 'logo'), coverPhoto: g(f, 'coverPhoto'), isSubscriber: g(f, 'isSubscriber'),
      registeredAt: g(f, 'submittedAt') ? new Date(g(f, 'submittedAt')) : null,
      registeredAtKnown: !!g(f, 'submittedAt'),
    };
  });

  const env = {
    updateDoc: async () => {}, window: global.window, MOCK_BUSINESSES: BIZ,
    state: { featured: new Array(10).fill(null), 'new': new Array(10).fill(null) },
    isExpired: () => false, renderMain: () => {}, renderAllPreserveScroll: () => {},
    showSaving: () => {}, hideSaving: () => {}, logActivity: async () => {},
    setDoc: async () => {}, doc: () => ({}), db: {}, alert: () => {},
    activeTab: 'featured', selectTab: () => {},
    getDocs: async () => ({ forEach: () => {} }), collection: () => ({}),
    platformEvents: null, esc: realEsc,
    fmtDate: (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—',
    URL: { createObjectURL: () => '', revokeObjectURL() {} }, Blob: function () {},
  };
  const names = Object.keys(env);
  const M = new Function(...names, block + dataBlock +
    '\nreturn { sectionsTableHtml, sectionsReviewHtml, sectionsPlanHtml, sectionsTodayHtml, sectionsReportHtml, ' +
    'sectionComposeHtml, sectionModeSwitcherHtml, bizDataHtml, sectionsLaunchHtml, planAutoFill: window.planAutoFill, ' +
    '__setPolicy: (p) => { SECTION_POLICY = p; }, __setState: (st) => { SECTION_STATE = st; }, ' +
    '__setMode: (m) => { sectionViewMode = m; } };')(...names.map(n => env[n]));

  M.__setPolicy(S.normalizePolicy({
    featured: { enabled: true, size: 10, anchors: 1, opportunity: 3, periodDays: 1, cooldown: 2, criteria: ['neverShown', 'leastClicks'] },
    'new': { enabled: true, days: 15, maxShown: 12, minShown: 6 },
    launchAt: '2026-09-07T00:00:00.000Z'
  }));
  const ids = BIZ.slice(0, 8).map(b => b.id);
  M.__setState({ log: [
    { s: 'featured', p: 2, from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', ids: ids.slice(0, 4) },
    { s: 'featured', p: 1, from: '2026-08-20T00:00:00.000Z', to: '2026-08-27T00:00:00.000Z', ids: ids.slice(2, 8) },
  ] });

  const only = process.argv[2];
  const screens0 = [
    ['🚀 יום ההשקה', () => M.sectionsLaunchHtml()],
    ['📋 כל העסקים', () => M.sectionsTableHtml()],
    ['✅ מעבר על העסקים', () => M.sectionsReviewHtml()],
    ['🚀 לוח ההשקה', () => { M.planAutoFill(false); return M.sectionsPlanHtml(); }],
    ['📅 המדף היום', () => M.sectionsTodayHtml()],
    ['📄 דוח לבעל עסק', () => M.sectionsReportHtml()],
    ['הנתונים בכרטיס העסק', () => M.bizDataHtml(BIZ.sort((a, b) => b.clicks - a.clicks)[0])],
  ];

  const screens = only ? screens0.filter(x => x[0].indexOf(only) >= 0) : screens0;
  const parts = screens.map(([title, fn]) => {
    let body;
    try { body = fn(); } catch (e) { body = '<div style="color:red;padding:20px">זרק: ' + e.message + '</div>'; }
    return '<h2 class="prev-h">' + title + '</h2>' + M.sectionModeSwitcherHtml({ key: 'featured' }) + body;
  });

  const out = '<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>תצוגה מקדימה — מסכי §418</title><style>' + styles +
    '\n.prev-wrap{max-width:1180px;margin:0 auto;padding:24px}' +
    '\n.prev-h{font-size:20px;font-weight:700;margin:44px 0 14px;padding-top:18px;border-top:3px solid var(--yellow)}' +
    '\nbody{background:var(--bg);color:var(--text);font-family:system-ui,"Segoe UI",Arial,sans-serif}' +
    '</style></head><body><div class="prev-wrap">' +
    '<p style="font-size:13px;color:var(--text-sm)">תצוגה מקדימה סטטית של המסכים החדשים, מהפונקציות האמיתיות ומגיליון הסגנונות האמיתי. אינה הדף החי.</p>' +
    parts.join('') + '</div></body></html>';

  fs.writeFileSync(path.join(__dirname, only ? 'scratch_preview_part.html' : 'scratch_preview_sections.html'), out);
  console.log('נוצר ' + (only ? 'scratch_preview_part.html' : 'scratch_preview_sections.html') + ' · ' + out.length + ' תווים · ' + screens.length + ' מסכים');
})();
