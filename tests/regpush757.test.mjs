// בדיקת §757 – טוקן פוש על רשומה ממתינה (/reg-push) ואז הפוש "ההרשמה אושרה" מהתבנית login, מקצה לקצה:
// ה-fetch האמיתי של הוורקר + ה-scheduled האמיתי (runEmailSweeps), מול Firestore/FCM/Brevo מדומים.
import worker from '../worker/src/index.js';
import { sha256Hex } from '../worker/src/regstatus.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
let db, fcm = [], mails = [];
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
  const body = JSON.parse(opts.body);
  db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(body.fields).map(([a, b]) => [a, fromV(b)])) };
  return new Response('{}');
};
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGIN: 'https://yellowzone.co.il', BREVO_API_KEY: 'b', SENDER_EMAIL: 'info@yellowzone.co.il',
  RATE_LIMIT_KV: { get: async () => ({ token: 'fake', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async () => {} },
};
let ipN = 0;
const post = async (body, ip) => {
  const r = await worker.fetch(new Request('https://w/reg-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il', 'CF-Connecting-IP': ip || ('10.0.0.' + (++ipN)) }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  return { status: r.status, j: await r.json() };
};
const ID = 'A'.repeat(20), TICKET = 'T'.repeat(43), TOKEN = 'fcm:' + 'x'.repeat(60);
const HASH = await sha256Hex(TICKET);
db = {
  'settings/messageTemplates': {
    loginApp: { on: true, title: 'ההרשמה אושרה – ברוכים הבאים! 💛', text: 'היי {name}, אישרנו אותך', link: '' },
    loginPush: { on: true, title: '{name}, ההרשמה אושרה! 💛', body: 'ההטבות של Yellow Zone פתוחות לך. לחיצה – ונכנסים.' },
  },
  ['members/' + ID]: { status: 'pending', firstName: 'דניאל', lastName: 'כ', email: 'd@x.co', regTicketHash: HASH },
  ['members/' + 'R'.repeat(20)]: { status: 'rejected', firstName: 'ר', regTicketHash: HASH },
};
const good = { memberId: ID, ticket: TICKET, installId: 'iabc123', token: TOKEN, platform: 'android' };

console.log('/reg-push');
let r = await post({ ...good, ticket: 'W'.repeat(43) });
check('מפתח שגוי → invalid, לא נכתב', r.j.error === 'invalid' && !db['members/' + ID].nativePushTokens, r);
r = await post({ ...good, token: 'bad token!' });
check('טוקן לא תקין → invalid', r.j.error === 'invalid');
r = await post({ ...good, installId: '../x' });
check('מזהה התקנה לא תקין → invalid', r.j.error === 'invalid');
r = await post({ ...good, memberId: 'Z'.repeat(20) });
check('רשומה לא קיימת → gone', r.j.status === 'gone', r);
r = await post({ ...good, memberId: 'R'.repeat(20) });
check('רשומה שנדחתה → לא נכתב', r.j.ok === false && r.j.reason === 'rejected' && !db['members/' + 'R'.repeat(20)].nativePushTokens, r);
r = await post(good);
const tk = db['members/' + ID].nativePushTokens;
check('תקין → ok, הטוקן על הרשומה הממתינה לפי מזהה-ההתקנה', r.j.ok === true && tk && tk.iabc123 && tk.iabc123.token === TOKEN && tk.iabc123.platform === 'android', { r, tk });
check('הסטטוס נשאר pending ושאר השדות לא נגעו', db['members/' + ID].status === 'pending' && db['members/' + ID].firstName === 'דניאל' && db['members/' + ID].regTicketHash === HASH);
r = await post({ ...good, token: TOKEN + 'b' });
check('אותה התקנה שוב → מתעדכן, לא מתווסף', Object.keys(db['members/' + ID].nativePushTokens).length === 1 && db['members/' + ID].nativePushTokens.iabc123.token === TOKEN + 'b');
for (let i = 2; i <= 5; i++) await post({ ...good, installId: 'inst' + i });
r = await post({ ...good, installId: 'inst6' });
check('התקנה שישית → too_many', r.j.reason === 'too_many' && Object.keys(db['members/' + ID].nativePushTokens).length === 5, r);
let limited = false;
for (let i = 0; i < 12; i++) { const x = await post(good, '9.9.9.9'); if (x.status === 429) limited = true; }
check('מונה קצב: 10 ל-IP ב-15 דק\'', limited);

console.log('\nהאישור → הפוש מהתבנית login');
db['members/' + ID].nativePushTokens = { iabc123: { token: TOKEN, platform: 'android' } };
Object.assign(db['members/' + ID], { status: 'approved', loginCodeEmailStatus: 'pending' });
db['memberCodes/' + ID] = { loginCode: '123456' };
const ps = [];
await worker.scheduled({ cron: '* * * * *' }, env, { waitUntil: (p) => ps.push(p) });
await ps[0];
check('המייל יצא כמו היום', mails.some((m) => m.to[0].email === 'd@x.co') && db['members/' + ID].loginCodeEmailStatus === 'sent');
const p = fcm.find((x) => x.token === TOKEN);
check('פוש לטוקן שנשמר בהרשמה, עם השם', p && p.notification && p.notification.title === 'דניאל, ההרשמה אושרה! 💛' && p.notification.body === 'ההטבות של Yellow Zone פתוחות לך. לחיצה – ונכנסים.', fcm);
check('הלחיצה מובילה לפריט ב"הודעות"', p && p.data && p.data.link === '/profile.html?tab=msgs&item=tpl_login');
check('פריט באפליקציה נכתב עם השם', db[`members/${ID}/inbox/tpl_login`] && db[`members/${ID}/inbox/tpl_login`].text === 'היי דניאל, אישרנו אותך');
const row = db[`messages/tpl_login/recipients/${ID}`];
check('שורת סטטיסטיקה push=sent', row && row.push === 'sent' && row.pushDevices === 1, row);

console.log(`\n${fail ? '❌' : '✅'} ${pass}/${pass + fail}`);
if (fail) process.exit(1);
