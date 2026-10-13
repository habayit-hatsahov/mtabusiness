// בדיקת §517ג — /link-biz-owner (worker/src/bizowner.js), הקוד האמיתי מול Firestore REST מדומה.
import { handleLinkBizOwner } from '../worker/src/bizowner.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x)); } };

// ── Firestore מדומה ──
let db;
const reset = () => {
  db = {
    'bizTokens/biz0001': { accessToken: 'tok-1111-2222-3333-4444' },
    'businesses/biz0001': { status: 'pending', name: 'עסק', ownerEmail: 'Dana@X.co', ownerPhone: '050-123-4567', ownerFirst: 'דנה', ownerLast: 'כהן' },
    'businesses/biz0002': { status: 'pending', name: 'עסק בלי טוקן', ownerEmail: 'new@x.co', ownerPhone: '0529999999', ownerFirst: 'חדש', ownerLast: 'חדש' },
    'businesses/bizAAAA': { status: 'approved', name: 'מאושר', ownerEmail: 'a@x.co' },
    'bizTokens/bizAAAA': { accessToken: 'tok-aaaa-bbbb-cccc-dddd' },
    'members/dana001': { status: 'approved', email: 'dana@x.co', phone: '0501234567', firstName: 'דנה', lastName: 'כהן', birthDate: '1990-01-01' },
    'members/noname': { status: 'approved', email: 'nn@x.co', phone: '0541112222', firstName: '' },
    'members/newm001': { status: 'pending', linkedBusinessId: 'biz0002', email: 'new@x.co' },
    'members/other01': { status: 'pending', linkedBusinessId: 'bizX' },
  };
};
const toV = (v) => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? v.timestampValue : null;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const m = u.pathname.match(/documents\/(.+)$/);
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId, f = q.where.fieldFilter, val = f.value.stringValue;
    const rows = Object.entries(db).filter(([k, d]) => k.startsWith(coll + '/') && d[f.field.fieldPath] === val)
      .map(([k, d]) => ({ document: { name: 'x/documents/' + k, fields: Object.fromEntries(Object.entries(d).map(([a, b]) => [a, toV(b)])) } }));
    return new Response(JSON.stringify(rows.length ? rows : [{ readTime: 'x' }]));
  }
  const path = decodeURIComponent(m[1]);
  if ((opts.method || 'GET') === 'GET') {
    if (!db[path]) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) }));
  }
  const body = JSON.parse(opts.body);
  db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(body.fields).map(([a, b]) => [a, fromV(b)])) };
  return new Response('{}');
};
const env = { FIREBASE_PROJECT_ID: 'p', RATE_LIMIT_KV: { get: async () => ({ token: 'fake', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async () => {} } };
const call = (x) => handleLinkBizOwner(x, env);

console.log('חבר קיים');
reset();
let r = await call({ bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444', ownerBirthDate: '1985-05-05' });
check('נמצא לפי המייל שעל העסק (אותיות גדולות)', r.memberId === 'dana001' && r.created === false, r);
check('החבר הושלם: בעל עסק + קישור', db['members/dana001'].isBusinessOwner === true && db['members/dana001'].linkedBusinessId === 'biz0001');
check('תאריך לידה קיים – לא נדרס', db['members/dana001'].birthDate === '1990-01-01');
check('שם קיים – לא נדרס', db['members/dana001'].firstName === 'דנה');
check('העסק קיבל ownerMemberId', db['businesses/biz0001'].ownerMemberId === 'dana001');
r = await call({ bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444' });
check('קריאה חוזרת – אידמפוטנטית', r.memberId === 'dana001' && r.already === true, r);

reset();
db['businesses/biz0001'].ownerEmail = 'nomatch@x.co';
r = await call({ bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444' });
check('נמצא לפי טלפון בפורמט אחר', r.memberId === 'dana001', r);

reset();
db['businesses/biz0001'].ownerEmail = 'nn@x.co';
r = await call({ bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444', ownerBirthDate: '1985-05-05' });
check('חבר בלי שם ובלי תאריך – מושלמים', r.memberId === 'noname' && db['members/noname'].firstName === 'דנה' && db['members/noname'].birthDate === '1985-05-05', db['members/noname']);

console.log('חבר חדש');
reset();
const newm = db['members/newm001']; delete db['members/newm001'];   // נוצרת רק אחרי הקריאה הראשונה, כמו בדף
r = await call({ bizId: 'biz0002', accessToken: 'tok-new-0000-1111-2222' });
check('אין חבר קיים → memberId null (והטוקן נתבע)', r.memberId === null && db['bizTokens/biz0002'].accessToken === 'tok-new-0000-1111-2222', r);
db['members/newm001'] = newm;   // הדף יצר את הרשומה (members create)
r = await call({ bizId: 'biz0002', accessToken: 'tok-new-0000-1111-2222', newMemberId: 'newm001' });
check('רשומה חדשה מקושרת לעסק → מקושר', r.memberId === 'newm001' && db['businesses/biz0002'].ownerMemberId === 'newm001', r);
reset();
db['bizTokens/biz0002'] = { accessToken: 'tok-new-0000-1111-2222' };
r = await call({ bizId: 'biz0002', accessToken: 'tok-new-0000-1111-2222', newMemberId: 'other01' });
check('רשומה של עסק אחר – נדחה', r.error === 'member_mismatch' && !db['businesses/biz0002'].ownerMemberId, r);
r = await call({ bizId: 'biz0002', accessToken: 'tok-new-0000-1111-2222', newMemberId: 'dana001' });
check('חבר מאושר קיים בתור "חדש" – נדחה', r.error === 'member_mismatch', r);

console.log('תוקף');
reset();
r = await call({ bizId: 'biz0001', accessToken: 'tok-wrong-0000-0000-0000' });
check('טוקן שגוי – נדחה, שום דבר לא נכתב', r.error === 'not_authorized' && !db['members/dana001'].isBusinessOwner && !db['businesses/biz0001'].ownerMemberId, r);
r = await call({ bizId: 'bizAAAA', accessToken: 'tok-aaaa-bbbb-cccc-dddd' });
check('עסק מאושר – נדחה', r.error === 'not_pending', r);
r = await call({ bizId: 'nope1234', accessToken: 'tok-1111-2222-3333-4444' });
check('עסק שלא קיים – נדחה', !!r.error, r);
for (const bad of [null, {}, { bizId: 'biz0001' }, { bizId: '../x', accessToken: 'tok-1111-2222-3333-4444' }, { bizId: 'biz0001', accessToken: 'short' }, { bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444', newMemberId: 5 }]) {
  r = await call(bad);
  check('קלט פגום ' + JSON.stringify(bad), r.error === 'invalid_request', r);
}
reset();
r = await call({ bizId: 'biz0001', accessToken: 'tok-1111-2222-3333-4444', ownerBirthDate: 'not-a-date' });
check('תאריך לא תקין – לא נכתב', db['members/dana001'].birthDate === '1990-01-01');

console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
