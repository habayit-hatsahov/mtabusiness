// בדיקת §769 — runStuckLogins: מי שקיבל מפתח כניסה ולא הגיע לדף הבית → אירוע loginFail 'stuck' אחד.
import { runStuckLogins, noteMemberToken } from '../worker/src/stucklogin.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };

const NOW = Date.parse('2026-11-11T12:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60e3).toISOString();
let members = {}, created = [], patches = [];
const toV = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : /^\d{4}-\d\d-\d\dT/.test(v) ? { timestampValue: v } : { stringValue: v };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'timestampValue' in v ? v.timestampValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : v;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery; const from = Date.parse(q.where.fieldFilter.value.timestampValue);
    const docs = Object.entries(members).filter(([, f]) => f.tokenAt && Date.parse(f.tokenAt) >= from)
      .map(([id, f]) => ({ document: { name: 'p/documents/members/' + id, fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, toV(v)])) } }));
    return new Response(JSON.stringify(docs.length ? docs : [{}]));
  }
  const m = u.pathname.match(/documents\/(.+)$/); const path = decodeURIComponent(m[1]); const body = JSON.parse(opts.body || '{}');
  const fields = Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, fromV(v)]));
  if (opts.method === 'POST') { created.push({ path, fields }); return new Response(JSON.stringify({ name: 'p/documents/' + path + '/E' + created.length })); }
  if (opts.method === 'PATCH') { patches.push({ path, fields }); const id = path.split('/')[1]; members[id] = { ...(members[id] || {}), ...fields }; return new Response('{}'); }
  return new Response('{}', { status: 404 });
};
const env = { FIREBASE_PROJECT_ID: 'p' };

members = {
  stuck:    { status: 'approved', tokenAt: iso(30), tokenVia: 'regTicket', phone: '0501111111' },          // נתקע
  entered:  { status: 'approved', tokenAt: iso(30), tokenVia: 'code', lastSeenAt: iso(29), phone: '0502' },  // נכנס
  fresh:    { status: 'approved', tokenAt: iso(5), tokenVia: 'code', phone: '0503' },                       // עוד לא 10 דק'
  oldSeen:  { status: 'approved', tokenAt: iso(40), tokenVia: 'oauth', lastSeenAt: iso(3000), phone: '0504' }, // נכנס פעם, הפעם נתקע
  admin:    { status: 'approved', tokenAt: iso(30), isAdmin: true },
  pending:  { status: 'pending', tokenAt: iso(30) },
  noToken:  { status: 'approved' },
};

console.log('runStuckLogins');
let r = await runStuckLogins(env, 'tok', NOW);
const ev = (id) => created.find(c => c.fields.memberId === id);
check('נתקע (מפתח לפני 30 דק\', בלי דף הבית) → אירוע', !!ev('stuck'), created);
const e = ev('stuck') ? ev('stuck').fields : {};
check('האירוע: loginFail / stuck / טלפון / via / createdAt = זמן המפתח', e.type === 'loginFail' && e.channel === 'stuck' && e.phone === '0501111111' && e.blockId === 'via:regTicket' && e.createdAt === members.stuck.tokenAt && created.find(c => c.fields.memberId === 'stuck').path === 'events', e);
check('נכנס אחרי המפתח → בלי אירוע', !ev('entered'));
check('מפתח לפני 5 דק\' → עוד לא', !ev('fresh'));
check('נכנס בעבר אבל לא אחרי המפתח הזה → אירוע', !!ev('oldSeen'));
check('מנהל / ממתין / בלי מפתח → בלי אירוע', !ev('admin') && !ev('pending') && !ev('noToken'));
check('stuckFor נכתב על מי שדווח', members.stuck.stuckFor === members.stuck.tokenAt && members.oldSeen.stuckFor === members.oldSeen.tokenAt);
check('wrote = 2', r.wrote === 2, r);
created = [];
r = await runStuckLogins(env, 'tok', NOW + 60e3);
check('ריצה שנייה – לא מדווח שוב על אותו מפתח', created.length === 0 && r.wrote === 0, created);
members.stuck.tokenAt = new Date(NOW + 2 * 60e3).toISOString();
r = await runStuckLogins(env, 'tok', NOW + 15 * 60e3);
check('מפתח חדש שנתקע שוב → שורה חדשה (וה"טרי" מקודם – עכשיו 20 דקות → גם הוא)', created.length === 2 && created.some(c => c.fields.memberId === 'stuck' && c.fields.createdAt === members.stuck.tokenAt) && created.some(c => c.fields.memberId === 'fresh'), created);

console.log('noteMemberToken');
patches = [];
await noteMemberToken(env, 'abc', 'code', 'tok');
check('כותב tokenAt + tokenVia על הרשומה', patches.length === 1 && patches[0].path === 'members/abc' && patches[0].fields.tokenVia === 'code' && !!patches[0].fields.tokenAt, patches);
globalThis.fetch = async () => { throw new Error('network'); };
let threw = false; try { await noteMemberToken(env, 'abc', 'code', 'tok'); } catch (e2) { threw = true; }
check('כשל ברישום לא זורק (הכניסה לא נופלת)', !threw);

console.log(fail ? `❌ ${pass}/${pass + fail}` : `✅ ${pass}/${pass}`);
