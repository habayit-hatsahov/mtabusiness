// §671 — הסל + "סיכום ושליחה". הקוד נחתך מ-admin-dashboard.html לפי תוכן (§361) ומורץ מול Firestore מדומה:
// ✅/❌ על בקשה לא נוגעים בעסק עד השליחה; השליחה כותבת הכול פעם אחת; 4 התוצאות לעסק מאושר ו-3 לממתין.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-dashboard.html'), 'utf8');
function cut(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  if (a < 0) throw new Error(`עוגן ההתחלה לא נמצא: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  if (b < 0) throw new Error(`עוגן הסיום לא נמצא: ${endMarker}`);
  return SRC.slice(a, b);
}
const QJ = cut('const QJ_LINE_PREFIX', '// §659ג — רמי');
const WAIT = cut('var WAIT_REASONS = [', '// הפס בראש הכרטיס');
const STAGE = cut('// ══ §671 — "הסל"', '// קפיצה מתקציר-השינויים');
const SUM = cut('// ══ §671 — "סיכום ושליחה"', '// הפס למעלה בכרטיס');
const ROUTES = cut('window.approveBiz = async function(id) {', 'async function doApproveBiz') + cut('window.rejectApprovedBiz', 'window.restoreBizToPending');

function build(biz, opts = {}) {
  const writes = [], logs = [], sent = [], calls = [];
  const els = {};
  const getEl = (id) => els[id] || null;
  const modal = { style: { display: 'none' }, set innerHTML(h) { this._h = h; parse(h); }, get innerHTML() { return this._h || ''; } };
  // מה שהחלון מצייר – כותרת, טקסט, וואטסאפ – כאלמנטים שהבדיקה יכולה לקרוא ולשנות
  function parse(h) {
    const t = /id="bnTitle"[^>]*value="([^"]*)"/.exec(h); els.bnTitle = t ? { value: t[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') } : null;
    const x = /id="bnText"[^>]*>([\s\S]*?)<\/textarea>/.exec(h); els.bnText = x ? { value: x[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') } : null;
    els.bnErr = { textContent: '' }; els.bnGo = { disabled: false, textContent: '' };
  }
  const env = {
    window: {}, db: {}, document: { getElementById: getEl },
    bizStaged: opts.staged || {}, QJ_DECIDED: opts.decided || {},
    findBiz: (id) => (id === biz.id ? biz : null),
    doc: (_db, coll, id) => `${coll}/${id}`,
    setDoc: async (ref, data) => { writes.push(['setDoc', ref, data]); },
    updateDoc: async (ref, u) => { writes.push(['updateDoc', ref, u]); },
    deleteField: () => '__del__', serverTimestamp: () => 'TS',
    logActivity: async (c, id, e) => { logs.push(e); },
    renderMain: () => {}, renderMainPreserveScroll: () => {},
    DIFF_FIELD_LABELS_MOCK: { coverPhoto: 'תמונה מייצגת', phone: 'טלפון', discountText: 'ההטבה' },
    DIFF_SECTION_NAMES: {}, fmtActivityVal: (v) => String(v),
    PENDING_COMPANION_FIELDS: { coverPhoto: ['coverPhotoThumb'] },
    bizMissingCardTitle: () => false, confirmMissingCardTitle: () => true,
    prunedPending: (_b, p) => (Object.keys(p).length ? p : null),
    withChangeDecision: (b, field, decision) => [...(b.changeDecisions || []), { field, decision }],
    syncOwnerFieldsToMember: async () => {}, hydrateBiz: (_id, b) => b, computeHealthScore: () => 0,
    qjEq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    qjNoteOpen: () => calls.push('noteOpen'), qjLoadDecided: () => {},
    qjCloseDecided: async (id, why) => { calls.push(['closeDecided', why]); delete env.QJ_DECIDED[id]; },
    bnEl: () => modal, bnClose: () => { modal.style.display = 'none'; },
    bnChannels: () => ({ app: true, push: true, mail: true }), bnChanHtml: () => '', BN_TITLE_MAX: 60,
    bnSend: async (b, title, text, mode, closes) => { sent.push({ title, text, mode, closes }); return { ok: true, text: 'נשלח' }; },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    approveBizWithMemberBatch: async (b) => { writes.push(['approveBatch', b.id]); },
    setBizStatusWithOwner: async (b, u, to, o) => { writes.push(['setBizStatusWithOwner', u, to, o]); },
    bizReviewedCount: () => 5, BIZ_REVIEW_SECTIONS: [1, 2, 3, 4, 5],
    confirmSuspectEmail: () => true, confirm: () => true,
    waLink: (p, m) => 'https://wa.me/' + p + '?text=' + encodeURIComponent(m), applyBizTpl: (t, n) => t.replace('{name}', n || ''), bizDashUrl: (t) => 'https://x/bd?token=' + t,
    bumpWaNudge: () => {}, setTimeout: (f) => f(),
    _bn: null,
  };
  const body = `${QJ}\n${WAIT}\nfunction bizStagedOf(id) { return bizStaged[id] || {}; }\n${STAGE}\n${SUM}\n${ROUTES}
    return { w: window, commitBizStaged, bizStagedEntry, bsBuildText, bsOutcomes, bizInFix, getBn: () => _bn, setBn: (v) => { _bn = v; } };`;
  const fn = new Function(...Object.keys(env), body);
  return { ...fn(...Object.values(env)), env, writes, logs, sent, calls, modal, els };
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
const bizW = (writes) => writes.filter(w => w[0] === 'updateDoc' && w[1].startsWith('businesses/'));

(async () => {
  console.log('\n— ✅/❌ על בקשה = סימון בסל, העסק לא משתנה —');
  {
    const b = { id: 'b1', name: 'גז', status: 'approved', phone: '050', coverPhoto: 'old.jpg', pendingChanges: { phone: '052', coverPhoto: 'new.jpg', coverPhotoThumb: 'new_t.jpg', discountText: 'הנחה' } };
    const t = build(b);
    await t.w.approveChangeField('b1', 'phone');
    await t.w.approveChangeField('b1', 'coverPhoto');
    await t.w.rejectChangeField('b1', 'discountText');
    ok(bizW(t.writes).length === 0, 'אין שום כתיבה לעסק');
    ok(t.writes.filter(w => w[0] === 'setDoc' && w[1] === 'settings/bizStaged').length === 3, '3 סימונים נשמרו ב-settings/bizStaged');
    ok(b.phone === '050' && b.coverPhoto === 'old.jpg', 'הערכים בעסק לא השתנו');
    ok((t.env.QJ_DECIDED.b1 || []).length === 3, '3 פריטים בסל');
    ok(t.logs.every(l => /יישמר בשליחה/.test(l.title)) && t.logs.every(l => l.noteItem), 'ביומן: "סומן… (יישמר בשליחה)" עם noteItem');
    ok(t.calls.filter(c => c === 'noteOpen').length === 3, 'חלון ההערה קופץ אחרי כל סימון (כמו היום)');

    console.log('\n— ביטול סימון —');
    await t.w.unstageChangeField('b1', 'discountText');
    ok(!t.env.bizStaged.b1.discountText && t.env.QJ_DECIDED.b1.length === 2, 'הסימון ירד מהסל');
    ok(t.logs.at(-1).noteItem.decision === 'unstaged', 'נרשם "unstaged" ביומן (כדי שרענון לא יחזיר אותו)');

    console.log('\n— השליחה כותבת הכול פעם אחת —');
    await t.w.rejectChangeField('b1', 'discountText');
    t.writes.length = 0; t.logs.length = 0;
    const okc = await t.commitBizStaged(b);
    const w = bizW(t.writes);
    ok(okc && w.length === 1, 'עדכון אחד לעסק');
    const u = w[0][2];
    ok(u.phone === '052' && u.coverPhoto === 'new.jpg' && u.coverPhotoThumb === 'new_t.jpg', 'אושרו: טלפון + תמונה עם הממוזערת');
    ok(!('discountText' in u) && u.pendingChanges === null, 'ההטבה נדחתה, pendingChanges התרוקן');
    ok(u.changeDecisions.length === 3, 'changeDecisions לבעל העסק – 3 החלטות');
    ok(t.writes.some(x => x[0] === 'setDoc' && x[2].b1 === '__del__'), 'הסל נמחק אחרי הכתיבה');
    ok(t.logs.filter(l => /^אושר שינוי/.test(l.title)).length === 2 && t.logs.filter(l => /^נדחה שינוי/.test(l.title)).length === 1, 'ביומן: "אושר שינוי" ×2, "נדחה שינוי" ×1');
  }
  {
    // בעל העסק שלח ערך אחר לאותו שדה אחרי הסימון – הסימון לא חל
    const b = { id: 'b2', name: 'x', status: 'approved', pendingChanges: { phone: '053' } };
    const t = build(b, { staged: { b2: { phone: { d: 'approved', req: '052', label: 'טלפון' } } } });
    ok(!t.bizStagedEntry(b, 'phone'), 'סימון על ערך ישן לא תקף');
    await t.commitBizStaged(b);
    ok(bizW(t.writes).length === 0, 'ולא נכתב');
  }

  console.log('\n— "סיכום ושליחה": עסק מאושר —');
  {
    const b = { id: 'nrg', name: 'N.r.g gas', status: 'approved', ownerFirst: 'נריה', ownerPhone: '0502224596', accessToken: 'tok' };
    const t = build(b, { decided: { nrg: [{ label: 'תמונות', decision: 'remark', note: 'התמונה חתוכה' }] } });
    ok(JSON.stringify(t.bsOutcomes(b)) === '["save","fixStay","fixHide","reject"]', '4 אפשרויות: לשמור / צריך לתקן נשאר / יורד / דחייה');
    t.w.bsOpen('nrg', 'fix');
    ok(t.getBn().outcome === null, '"צריך לתקן" על עסק מאושר – לא נבחר מראש נשאר/יורד');
    ok(t.getBn().other === 'התמונה חתוכה', 'ההערה על השלב נכנסה ל"מה עוד חסר"');
    t.w.bsSet('outcome', 'fixHide');
    t.w.bsReason({ checked: true, value: 'cover' });
    t.w.bsSet('reasons', t.getBn().reasons);
    // החלון מצויר מחדש – הטקסט נבנה מהסל
    ok(/תמונה ראשית לכרטיס/.test(t.els.bnText.value) && /התמונה חתוכה/.test(t.els.bnText.value), 'ההודעה: תמונה ראשית + ההערה');
    ok(/מוסתר מהאתר/.test(t.els.bnText.value), 'ההודעה אומרת שהעסק מוסתר');
    await t.w.bsGo();
    const u = bizW(t.writes)[0][2];
    ok(u.status === 'pending' && u.approvedAt === null && u.fixHidden === true, 'יורד מהאתר: pending + fixHidden');
    ok(u.inReview === true && u.inReviewReasons.includes('cover') && u.inReviewReasons.includes('other') && u.inReviewOther === 'התמונה חתוכה', 'inReview + cover + other – מה שמסך "העסק שלך אצלנו" קורא');
    ok(t.sent.length === 1 && t.sent[0].mode === 'fix' && t.sent[0].closes === true, 'הודעה אחת יצאה (fix), והסל נסגר');
    ok(t.logs.some(l => l.type === 'fixRound' && l.fixRound.hidden === true), 'הסבב נשמר ביומן (fixRound)');
    const href = (/href="([^"]*wa\.me[^"]*)"/.exec(t.modal.innerHTML) || [])[1] || '';
    const waMsg = decodeURIComponent((href.replace(/&amp;/g, '&').split('?text=')[1]) || '');
    ok(/wa\.me\/0502224596/.test(href) && /היי נריה/.test(waMsg) && /תמונה ראשית/.test(waMsg) && /token=tok/.test(waMsg), 'מסך הסיום: כפתור וואטסאפ – "היי נריה", מה חסר, קישור לדשבורד');
  }
  {
    const b = { id: 'a', name: 'א', status: 'approved' };
    const t = build(b);
    t.w.bsOpen('a', 'fix'); t.w.bsSet('outcome', 'fixStay'); t.w.bsReason({ checked: true, value: 'deal' });
    await t.w.bsGo();
    const u = bizW(t.writes)[0][2];
    ok(!('status' in u) && u.fixHidden === false && u.inReview === true, 'נשאר באתר: status לא נוגעים, fixHidden=false');
    ok(t.bizInFix({ ...b, ...u, status: 'approved' }), 'bizInFix מזהה עסק מאושר שצריך לתקן');
  }
  {
    const b = { id: 'a', name: 'א', status: 'approved' };
    const t = build(b);
    t.w.bsOpen('a', 'fix'); t.w.bsSet('outcome', 'fixStay');
    t.getBn().reasons = []; t.getBn().other = '';
    await t.w.bsGo();
    ok(bizW(t.writes).length === 0 && /סמן מה חסר/.test(t.els.bnErr.textContent), '"צריך לתקן" בלי לסמן מה חסר – לא נשמר');
  }
  {
    const b = { id: 'a', name: 'א', status: 'approved', pendingChanges: { phone: '1' } };
    const t = build(b, { staged: { a: { phone: { d: 'approved', req: '1', label: 'טלפון' } } }, decided: { a: [{ label: 'טלפון', decision: 'approved' }] } });
    t.w.bsOpen('a');
    ok(t.getBn().outcome === 'save', 'מהפס: עסק מאושר – "רק לשמור ולעדכן" מסומן');
    ok(/✅ אושר: טלפון/.test(t.els.bnText.value), 'ההודעה: ✅ אושר: טלפון');
    await t.w.bsGo();
    ok(bizW(t.writes)[0][2].phone === '1' && t.sent.length === 1 && t.sent[0].mode === 'changes', 'נשמר + הודעת "עדכון על השינויים"');
  }
  {
    const b = { id: 'a', name: 'א', status: 'approved' };
    const t = build(b);
    t.w.rejectApprovedBiz('a');
    ok(t.getBn().outcome === 'reject' && t.els.bnText.value === '', '"✗ דחייה" – נפתח עם דחייה, בלי טקסט');
    await t.w.bsGo();
    const r = t.writes.find(w => w[0] === 'setBizStatusWithOwner');
    ok(r && r[2] === 'rejected' && r[3].mail === true && r[1].inReview === false, 'נדחה; mail:true לחבר ממתין בלבד (§661), סימון התיקון נמחק');
    ok(t.sent.length === 0, 'לעסק לא נשלח כלום (החלטת רמי)');
  }

  console.log('\n— "סיכום ושליחה": עסק ממתין —');
  {
    const b = { id: 'p', name: 'פ', status: 'pending', inReview: true, inReviewReasons: ['cover'], fixHidden: true };
    const t = build(b);
    ok(JSON.stringify(t.bsOutcomes(b)) === '["approve","fix","reject"]', '3 אפשרויות: אישור / צריך לתקן / דחייה');
    t.w.approveBiz('p');
    ok(t.getBn().outcome === 'approve', '"✅ אשר" פותח את החלון עם אישור');
    await t.w.bsGo();
    ok(t.writes.some(w => w[0] === 'approveBatch'), 'אושר (approveBizWithMemberBatch)');
    ok(b.inReview === false && b.fixHidden === false, 'האישור מנקה את "צריך לתקן" ואת ההסתרה (בכתיבה – approveBizWithMemberBatch)');
    ok(t.sent.length === 0, 'בלי טקסט – בלי הודעה נוספת (מייל האישור הרגיל יוצא כרגיל)');
  }
  {
    const b = { id: 'p', name: 'פ', status: 'pending' };
    const t = build(b);
    t.w.bsOpen('p', 'fix');
    t.getBn().reasons = ['logo'];
    t.w.bsSet('reasons', ['logo']);
    await t.w.bsGo();
    const u = bizW(t.writes)[0][2];
    ok(u.inReview === true && u.fixHidden === false && !('status' in u) && u.inReviewAt === 'TS', 'ממתין → צריך לתקן: נשאר pending, inReviewAt חדש');
  }

  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
