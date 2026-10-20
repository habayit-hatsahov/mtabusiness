// בדיקת §562 — "שכחתי קוד" (/resend-login-code) מכניס את המייל לתור עם חותמת-תור חדשה, כך שגלאי
// "יצא באיחור" במרכז הניהול מודד מהבקשה ולא מהאישור המקורי. מריץ את הוורקר האמיתי מול Firestore מדומה.
import worker from '../worker/src/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };

let db, fcm = [], mails = [], failInbox = false;
const toV = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([a, b]) => [a, toV(b)])) } };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue
  : 'integerValue' in v ? Number(v.integerValue) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([a, b]) => [a, fromV(b)])) : v;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }));
  if (u.hostname === 'fcm.googleapis.com') { fcm.push(JSON.parse(opts.body).message); return new Response('{}'); }
  if (u.hostname === 'api.brevo.com') {
    const b = JSON.parse(opts.body); mails.push(b);
    if (b.to[0].email === 'fail@x.co') return new Response('bad', { status: 400 });
    return new Response(JSON.stringify({ messageId: '<m' + mails.length + '@brevo>' }));
  }
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery;
    const coll = q.from[0].collectionId, ff = q.where.fieldFilter, val = fromV(ff.value);
    const out = Object.entries(db).filter(([p, d]) => p.split('/').length === 2 && p.startsWith(coll + '/') && d[ff.field.fieldPath] === val)
      .map(([p, d]) => ({ document: { name: 'x/documents/' + p, fields: Object.fromEntries(Object.entries(d).map(([a, b]) => [a, toV(b)])) } }));
    return new Response(JSON.stringify(out.length ? out : [{}]));
  }
  const m = u.pathname.match(/documents\/(.+)$/);
  if (!m) return new Response('{}', { status: 404 });
  const path = decodeURIComponent(m[1]);
  if ((opts.method || 'GET') === 'GET') {
    if (!db[path]) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) }));
  }
  if (failInbox && /\/inbox\//.test(path)) return new Response('boom', { status: 500 });
  const body = JSON.parse(opts.body);
  db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(body.fields).map(([a, b]) => [a, fromV(b)])) };
  return new Response('{}');
};
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGIN: 'https://yellowzone.co.il', BREVO_API_KEY: 'b', SENDER_EMAIL: 'info@yellowzone.co.il',
  RATE_LIMIT_KV: { get: async () => ({ token: 'fake', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async () => {} },
};
async function sweep() {
  const ps = [];
  await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: (p) => ps.push(p) });
  await ps[0];   // runEmailSweeps (השני – סנכרון bizPublic – לא נבדק כאן)
}
const sept = '2026-09-03T08:50:02.304Z';
db = {
  'settings/messageTemplates': {},
  'members/fanR': { status: 'approved', firstName: 'רון', email: 'r@x.co', phone: '0541234567', loginCodeEmailStatus: 'sent',
                    loginCodeEmailQueuedAt: sept, loginCodeEmailSentAt: sept },
  'memberCodes/fanR': { loginCode: '222222' },
};
const t0 = Date.now();
const res = await worker.fetch(new Request('https://w/resend-login-code', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' }, body: JSON.stringify({ phone: '0541234567' }) }), env, { waitUntil() {} });
check('הבקשה התקבלה', res.status === 200, res.status);
const m = db['members/fanR'];
check('חזר לתור (pending, resend)', m.loginCodeEmailStatus === 'pending' && m.loginCodeEmailKind === 'resend', m);
const q = Date.parse(m.loginCodeEmailQueuedAt);
check('חותמת-התור חודשה לרגע הבקשה (לא ספטמבר)', q >= t0 - 1000 && q <= Date.now() + 1000, m.loginCodeEmailQueuedAt);
await sweep();
const s = Date.parse(db['members/fanR'].loginCodeEmailSentAt);
check('המייל יצא בסריקה', db['members/fanR'].loginCodeEmailStatus === 'sent' && mails.length === 1);
check('הפרש תור→שליחה < 15 דק׳ (לא "יצא באיחור")', (s - Date.parse(db['members/fanR'].loginCodeEmailQueuedAt)) / 60000 < 15);
console.log(fail ? `\n❌ ${fail} נכשלו, ${pass} עברו` : `\n✅ ${pass}/${pass}`);
process.exit(fail ? 1 : 0);
