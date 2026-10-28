// §661 — בעל עסק = כרטיס אחד. הפונקציות נחתכות מ-admin-dashboard.html לפי תוכן (הלקח של §361)
// ומורצות מול נתונים מלאכותיים: מי יורד מרשימות האוהדים, חסימת האישור, והדחייה/השחזור יחד עם העסק.
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
const LISTS = cut('// ══ §661 — בעל עסק = כרטיס אחד', 'function fanClassCounts() {');
const BLOCK = cut('// §661 — 🔴 חסימה בכתיבה', 'window.approveFan');
const CASCADE = cut('// ══ §661 — דחייה/שחזור של עסק', '// §661 — הוצא מ-fanFullDetailHtml');
const MISMATCH = cut('function ownerMismatch(b, f) {', 'function ownerMemberCardHtml(b) {');

function build(bizList, fanList) {
  const writes = [];
  const env = {
    MOCK_BUSINESSES: bizList, MOCK_FANS: fanList,
    db: {}, CURRENT_ADMIN: { name: 'בדיקה' },
    doc: (_db, coll, id) => `${coll}/${id}`,
    serverTimestamp: () => 'TS', arrayUnion: (x) => ({ union: x }),
    fmtDateTime: () => 'DT',
    writeBatch: () => { const ops = []; return { update: (ref, u) => ops.push([ref, u]), set: (ref, u) => ops.push([ref, u]), commit: async () => { writes.push(...ops); } }; },
    logActivity: () => {},
  };
  const body = `${LISTS}\n${BLOCK}\n${CASCADE}\n${MISMATCH}
    return { ownerBizOf, isBizOwnerFan, fanCardList, fanPendingList, ownerApproveBlock, ownerFanOfBiz, ownerCascadeUpdate, setBizStatusWithOwner, ownerMismatch };`;
  const fn = new Function(...Object.keys(env), body);
  return { api: fn(...Object.values(env)), writes };
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const bizs = [
  { id: 'bP', name: 'ממתין', status: 'pending', ownerMemberId: 'oP' },
  { id: 'bA', name: 'מאושר', status: 'approved', ownerMemberId: 'oA' },
  { id: 'bR', name: 'נדחה', status: 'rejected', ownerMemberId: 'oR' },
  { id: 'bL', name: 'רק linkedBusinessId', status: 'pending' },
  { id: 'bPre', name: 'בעלים אושר לפני', status: 'pending', ownerMemberId: 'oPre' },
];
const fans = [
  { id: 'fan', name: 'אוהד רגיל', status: 'pending' },
  { id: 'oP', name: 'בעלים ממתין', status: 'pending', isBusinessOwner: true },
  { id: 'oA', name: 'בעלים מאושר', status: 'approved', isBusinessOwner: true },
  { id: 'oR', name: 'בעלים של נדחה', status: 'pending', isBusinessOwner: true },
  { id: 'oL', name: 'מקושר הפוך', status: 'pending', isBusinessOwner: true, linkedBusinessId: 'bL' },
  { id: 'orphan', name: 'העסק נמחק', status: 'approved', isBusinessOwner: true, linkedBusinessId: 'gone' },
  { id: 'oPre', name: 'אושר באישור הגורף', status: 'approved', isBusinessOwner: true },
];

console.log('\n— מי נשאר ברשימת האוהדים —');
{
  const { api } = build(bizs, fans);
  const ids = api.fanCardList().map(f => f.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(['fan', 'orphan']), `רק אוהד רגיל ובעלים שהעסק שלו נמחק (${ids})`);
  ok(api.fanPendingList().map(f => f.id).join() === 'fan', 'ממתינים: בלי אף בעל עסק, בכל סטטוס של העסק');
  ok(api.ownerBizOf(fans.find(f => f.id === 'oL')).id === 'bL', 'קישור דרך linkedBusinessId בלבד נמצא');
}

console.log('\n— חסימת אישור כאוהד —');
{
  const { api } = build(bizs, fans);
  const F = id => fans.find(f => f.id === id);
  ok(api.ownerApproveBlock(F('oP')).id === 'bP', 'בעלים של עסק ממתין – חסום');
  ok(api.ownerApproveBlock(F('oR')).id === 'bR', 'בעלים של עסק שנדחה – חסום');
  ok(api.ownerApproveBlock(F('oA')) === null, 'בעלים של עסק מאושר – לא חסום');
  ok(api.ownerApproveBlock(F('fan')) === null, 'אוהד רגיל – לא חסום');
  ok(api.ownerApproveBlock(F('orphan')) === null, 'בעלים שהעסק שלו נמחק – אוהד רגיל, לא חסום');
}

(async () => {
  console.log('\n— דחיית עסק —');
  {
    const { api, writes } = build(bizs, fans.map(f => ({ ...f })));
    await api.setBizStatusWithOwner(bizs[0], { status: 'rejected' }, 'rejected');
    ok(writes.length === 2, 'כתיבה אחת לעסק ואחת לבעלים, באותו batch');
    const m = writes.find(w => w[0] === 'members/oP');
    ok(m && m[1].status === 'rejected' && m[1].rejectKind === 'final' && m[1].retryAllowed === false, 'הבעלים נדחה – סופית');
    ok(m && m[1].rejectEmailStatus === 'pending', 'מייל דחייה יוצא');
  }
  {
    const { api, writes } = build(bizs, fans);
    await api.setBizStatusWithOwner(bizs[0], { status: 'rejected' }, 'rejected', { mail: false });
    ok(writes.find(w => w[0] === 'members/oP')[1].rejectEmailStatus === 'skipped', 'כשרמי כתב הודעה מהתיבה – בלי מייל דחייה נוסף');
  }
  {
    const { api, writes } = build(bizs, fans);
    await api.setBizStatusWithOwner(bizs[4], { status: 'rejected' }, 'rejected');
    ok(writes.length === 1 && writes[0][0] === 'businesses/bPre', 'בעלים שכבר מאושר כחבר – לא נדחה אוטומטית');
  }

  console.log('\n— שחזור עסק לממתין —');
  {
    const fs2 = fans.map(f => f.id === 'oR' ? { ...f, status: 'rejected' } : f);
    const { api, writes } = build(bizs, fs2);
    await api.setBizStatusWithOwner(bizs[2], { status: 'pending' }, 'pending');
    const m = writes.find(w => w[0] === 'members/oR');
    ok(m && m[1].status === 'pending' && m[1].rejectedAt === null, 'בעלים שנדחה חוזר לממתין יחד עם העסק');
  }
  {
    const { api, writes } = build(bizs, fans);
    await api.setBizStatusWithOwner(bizs[2], { status: 'pending' }, 'pending');
    ok(writes.length === 1, 'בעלים ממתין – אין מה לשנות');
  }

  console.log('\n— חריגות בכרטיס בעל העסק —');
  {
    const { api } = build(bizs, fans);
    const mm = (b, f) => api.ownerMismatch(b, f);
    ok(mm({ status: 'approved' }, { status: 'pending' }).to === 'approved', 'עסק מאושר + בעלים לא מאושר → כפתור אישור');
    ok(mm({ status: 'rejected' }, { status: 'pending' }).to === 'rejected', 'עסק נדחה + בעלים ממתין (Aviv Musa) → כפתור דחייה');
    ok(mm({ status: 'pending' }, { status: 'rejected' }).to === 'pending', 'עסק ממתין + בעלים נדחה → כפתור החזרה');
    const pre = mm({ status: 'pending' }, { status: 'approved' });
    ok(pre && !pre.warn && !pre.to, 'בעלים שאושר לפני העסק → לידיעה בלבד, בלי כפתור');
    ok(mm({ status: 'approved' }, { status: 'approved' }) === null, 'שניהם מאושרים → אין שורה');
    ok(mm({ status: 'pending' }, { status: 'pending' }) === null, 'שניהם ממתינים → אין שורה');
  }

  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})();
