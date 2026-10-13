// בדיקת §522 — /send-message: ה-fetch handler האמיתי של הוורקר, מול Firestore/FCM/Brevo/Identity מדומים.
// מה נבדק: אימות מנהל · ולידציה (חבילה גדולה, בלוק, פוש בלי אפליקציה) · פריט אחד בתיבה לכל נמען במזהה
// ההודעה · עסק → פריט אצל הבעלים (myBiz עם שם העסק) · ממתין/נדחה לא באפליקציה · פוש רק למי שהפריט נכתב
// אצלו, עם data.link · טוקן מת מנוקה · מייל לכולם / רק למי שלא קיבל באפליקציה · משתנים · messageId נשמר.
import worker from '../worker/src/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };

let db, commits, fcm, mails, patches;
const reset = () => {
  commits = []; fcm = []; mails = []; patches = [];
  db = {
    'members/admin1': { isAdmin: true, status: 'approved' },
    'members/fanA': { status: 'approved', firstName: 'איל', lastName: 'מ', email: 'a@x.co', nativePushTokens: { i1: { token: 'tokA' } } },
    'members/fanB': { status: 'approved', firstName: 'נועה', lastName: 'כ', email: 'b@x.co' },
    'members/fanP': { status: 'pending', firstName: 'ממתין', email: 'p@x.co' },
    'members/fanDead': { status: 'approved', firstName: 'מת', email: '', nativePushTokens: { i1: { token: 'DEAD' }, i2: { token: 'tokOK' } } },
    'members/owner1': { status: 'approved', firstName: 'שי', nativePushTokens: { i1: { token: 'tokO' } } },
    'businesses/biz1': { status: 'approved', name: 'פלאפל הזהב', ownerMemberId: 'owner1', ownerEmail: 'owner@x.co', ownerFirst: 'שי' },
    'businesses/bizNoOwner': { status: 'approved', name: 'מוסך', ownerEmail: 'garage@x.co', ownerFirst: 'דן' },
    'memberCodes/fanA': { loginCode: '111111' }, 'memberCodes/fanB': { loginCode: '222222' },
    'bizTokens/biz1': { accessToken: 'tok-biz1' }, 'bizTokens/bizNoOwner': { accessToken: 'tok-garage' },
  };
};
const toV = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([a, b]) => [a, toV(b)])) } };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue
  : 'integerValue' in v ? Number(v.integerValue) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([a, b]) => [a, fromV(b)])) : v;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    const t = JSON.parse(opts.body).idToken;
    return new Response(JSON.stringify(t === 'ADMIN' ? { users: [{ localId: 'admin1' }] } : t === 'FAN' ? { users: [{ localId: 'fanA' }] } : {}), { status: t ? 200 : 400 });
  }
  if (u.hostname === 'fcm.googleapis.com') {
    const tok = JSON.parse(opts.body).message.token;
    fcm.push(JSON.parse(opts.body).message);
    return tok === 'DEAD' ? new Response('{"error":{"status":"NOT_FOUND","message":"UNREGISTERED"}}', { status: 404 }) : new Response('{}');
  }
  if (u.hostname === 'api.brevo.com') {
    const b = JSON.parse(opts.body); mails.push(b);
    if (b.to[0].email === 'fail@x.co') return new Response('bad', { status: 400 });
    return new Response(JSON.stringify({ messageId: '<m' + mails.length + '@brevo>' }));
  }
  if (u.pathname.endsWith(':commit')) {
    const b = JSON.parse(opts.body);
    b.writes.forEach((w) => {
      const p = w.update.name.split('/documents/')[1];
      if (w.currentDocument && w.currentDocument.exists === false && db[p]) throw new Error('exists');
      db[p] = Object.fromEntries(Object.entries(w.update.fields).map(([a, v]) => [a, fromV(v)]));
    });
    commits.push(b.writes.length);
    return new Response('{}');
  }
  const m = u.pathname.match(/documents\/(.+)$/);
  const path = decodeURIComponent(m[1]);
  if ((opts.method || 'GET') === 'GET') {
    if (!db[path]) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'x/documents/' + path, fields: Object.fromEntries(Object.entries(db[path]).map(([a, b]) => [a, toV(b)])) }));
  }
  const body = JSON.parse(opts.body); patches.push(path);
  db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(body.fields).map(([a, b]) => [a, fromV(b)])) };
  return new Response('{}');
};
const env = {
  FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', ALLOWED_ORIGIN: 'https://yellowzone.co.il', BREVO_API_KEY: 'b', SENDER_EMAIL: 'info@yellowzone.co.il',
  RATE_LIMIT_KV: { get: async () => ({ token: 'fake', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async () => {} },
};
const ctx = { waitUntil: () => {} };
const call = async (body) => {
  const r = await worker.fetch(new Request('https://api.yellowzone.co.il/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://yellowzone.co.il' }, body: JSON.stringify(body) }), env, ctx);
  return r.json();
};
const base = { idToken: 'ADMIN', messageId: 'msg_test01' };
const by = (r, id) => r.results.find((x) => x.id === id);

console.log('הרשאות וולידציה');
reset();
let r = await call({ ...base, idToken: 'FAN', block: 'members', recipients: [{ t: 'm', id: 'fanA' }], app: { title: 'ת', text: 'ט' } });
check('לא מנהל – נחסם', r.error === 'not_admin', r);
r = await call({ ...base, block: 'members', recipients: Array.from({ length: 9 }, (_, i) => ({ t: 'm', id: 'f' + i })), app: { title: 'ת', text: 'ט' } });
check('חבילה מעל 8 – נדחית', r.error === 'chunk_too_big', r);
r = await call({ ...base, block: 'xxx', recipients: [{ t: 'm', id: 'fanA' }], app: { title: 'ת', text: 'ט' } });
check('בלוק לא מוכר – נדחה', r.error === 'bad_block', r);
r = await call({ ...base, block: 'members', recipients: [{ t: 'm', id: 'fanA' }], push: { title: 'ת', body: 'ט' } });
check('פוש בלי אפליקציה – נדחה (§504ו)', r.error === 'push_needs_app', r);
r = await call({ ...base, messageId: 'a b', block: 'members', recipients: [{ t: 'm', id: 'fanA' }], app: { title: 'ת', text: 'ט' } });
check('מזהה הודעה לא תקין – נדחה', r.error === 'bad_message_id', r);
check('שום דבר לא נשלח בבקשות שנדחו', !commits.length && !fcm.length && !mails.length);

console.log('אוהדים: אפליקציה + פוש + מייל לכולם');
reset();
r = await call({ ...base, block: 'members', recipients: ['fanA', 'fanB', 'fanP', 'fanDead', 'nobody'].map((id) => ({ t: 'm', id })),
  app: { title: 'משחק בשבת', text: 'בואו לשער 11', link: 'https://yellowzone.co.il/home.html' }, push: { title: 'משחק בשבת', body: 'בואו' }, mail: { subject: 'שלום {name}', body: 'היי {name}\n\n{code}' } });
check('ok', r.ok === true, r);
check('פריט אחד לכל מאושר, במזהה ההודעה', !!db['members/fanA/inbox/msg_test01'] && !!db['members/fanB/inbox/msg_test01'] && !!db['members/fanDead/inbox/msg_test01'], Object.keys(db));
check('ממתין – לא באפליקציה', !db['members/fanP/inbox/msg_test01'] && by(r, 'fanP').app === 'none');
check('הפריט: בלוק, קישור כנתיב, pushed, readAt=null', db['members/fanA/inbox/msg_test01'].block === 'members' && db['members/fanA/inbox/msg_test01'].link === '/home.html' && db['members/fanA/inbox/msg_test01'].pushed === true && db['members/fanA/inbox/msg_test01'].readAt === null, db['members/fanA/inbox/msg_test01']);
check('כתיבה אחת מרוכזת לתיבות', commits.length === 1 && commits[0] === 3, commits);
check('פוש: fanA נשלח, fanB בלי טוקן', by(r, 'fanA').push === 'sent' && by(r, 'fanB').push === 'noToken', r.results);
check('פוש לא לממתין', by(r, 'fanP').push === 'none');
check('פוש: data.link לאזור, בערוץ yz_main', fcm[0].data.link === '/profile.html?tab=updates' && fcm[0].android.notification.channel_id === 'yz_main', fcm[0]);
check('טוקן מת נוקה, החי נשאר', by(r, 'fanDead').push === 'sent' && patches.includes('members/fanDead') && Object.keys(db['members/fanDead'].nativePushTokens).join() === 'i2', db['members/fanDead']);
check('מייל: fanA/fanB/ממתין נשלחו, fanDead בלי מייל', by(r, 'fanA').mail === 'sent' && by(r, 'fanB').mail === 'sent' && by(r, 'fanP').mail === 'sent' && by(r, 'fanDead').mail === 'noEmail', r.results);
check('מייל: משתנים הוחלפו בנושא', mails.some((m) => m.subject === 'שלום איל') && mails.some((m) => m.subject === 'שלום נועה'), mails.map((m) => m.subject));
check('מייל: הקוד של כל אחד בגוף', mails.find((m) => m.subject === 'שלום איל').htmlContent.includes('111111'));
check('מייל: תג broadcast (§415)', mails.every((m) => (m.tags || []).includes('broadcast')));
check('messageId של Brevo חוזר', /^<m\d+@brevo>$/.test(by(r, 'fanA').mailId), by(r, 'fanA'));
check('נמען שלא קיים – gone, בלי כלום', by(r, 'nobody').gone === true && by(r, 'nobody').app === 'none' && by(r, 'nobody').mail === 'none', by(r, 'nobody'));

console.log('מייל רק למי שלא קיבל באפליקציה');
reset();
r = await call({ ...base, block: 'members', recipients: ['fanA', 'fanP'].map((id) => ({ t: 'm', id })), app: { title: 'ת', text: 'ט' }, mail: { subject: 'ס', body: 'ג', scope: 'missing' } });
check('fanA קיבל באפליקציה – מייל דולג', by(r, 'fanA').mail === 'skipped', r.results);
check('הממתין – רק מייל', by(r, 'fanP').app === 'none' && by(r, 'fanP').mail === 'sent');
check('נשלח מייל אחד בלבד', mails.length === 1 && mails[0].to[0].email === 'p@x.co', mails.map((m) => m.to[0].email));

console.log('עסקים מסוימים');
reset();
r = await call({ ...base, block: 'myBiz', recipients: [{ t: 'b', id: 'biz1' }, { t: 'b', id: 'bizNoOwner' }], app: { title: 'הכרטיס שלך', text: 'חסרה תמונה' }, push: { title: 'הכרטיס', body: 'חסרה' }, mail: { subject: '{business}', body: 'היי {name}\n\n{link}' } });
check('פריט אצל הבעלים, עם שם העסק', db['members/owner1/inbox/msg_test01'] && db['members/owner1/inbox/msg_test01'].block === 'myBiz' && db['members/owner1/inbox/msg_test01'].bizName === 'פלאפל הזהב' && db['members/owner1/inbox/msg_test01'].bizId === 'biz1', db['members/owner1/inbox/msg_test01']);
check('memberId של הבעלים חוזר', by(r, 'biz1').memberId === 'owner1');
check('פוש לבעלים', by(r, 'biz1').push === 'sent' && fcm.some((m) => m.token === 'tokO'));
check('עסק בלי בעלים – לא באפליקציה, כן במייל', by(r, 'bizNoOwner').app === 'none' && by(r, 'bizNoOwner').mail === 'sent', by(r, 'bizNoOwner'));
check('מייל לכתובת שעל העסק, עם שם העסק וקישור אישי', mails.some((m) => m.to[0].email === 'owner@x.co' && m.subject === 'פלאפל הזהב' && m.htmlContent.includes('tok-biz1')), mails.map((m) => [m.to[0].email, m.subject]));

console.log('כשל מייל');
reset();
db['members/fanB'].email = 'fail@x.co';
r = await call({ ...base, block: 'personal', recipients: [{ t: 'm', id: 'fanB' }], mail: { subject: 'ס', body: 'ג' } });
check('מייל שנכשל – failed עם סיבה, בלי לזרוק', by(r, 'fanB').mail === 'failed' && /brevo_send_failed/.test(by(r, 'fanB').mailError), by(r, 'fanB'));
check('בלי אפליקציה – app null', by(r, 'fanB').app === null);

console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
