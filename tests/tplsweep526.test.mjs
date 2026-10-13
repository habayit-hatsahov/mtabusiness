// בדיקת §526 — התבניות האוטומטיות באותה זרימה: ה-scheduled האמיתי של הוורקר (runEmailSweeps), מול
// Firestore/FCM/Brevo מדומים. מה נבדק: המייל יוצא כמו קודם + תג msg_tpl_<id> · שורת סטטיסטיקה לכל שליחה
// (מזהה = מי שהמייל נשלח אליו) · "התראה באפליקציה" רק כשהיא דלוקה בתבנית ורק לרשומה מאושרת · פוש רק
// יחד איתה, רק בתבניות שמותר (לא login/resend) · {name}/{business} מוחלפים · כשל במייל → שורה 'failed'
// · כשל בכתיבת הפריט לא מסמן את המייל כנכשל · תבנית בלי App/Push = רק מייל (התנהגות היום).
import worker from '../worker/src/index.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };

let db, fcm, mails, failInbox;
const old = new Date(Date.now() - 5 * 60000).toISOString();
const reset = (tpl) => {
  fcm = []; mails = []; failInbox = false;
  db = {
    'settings/messageTemplates': tpl || {},
    // אוהד חדש שאושר → login
    'members/fanA': { status: 'approved', firstName: 'איל', lastName: 'מ', email: 'a@x.co', loginCodeEmailStatus: 'pending', nativePushTokens: { i1: { token: 'tokA' } } },
    // שכחתי קוד → resend
    'members/fanR': { status: 'approved', firstName: 'רון', lastName: 'ש', email: 'r@x.co', loginCodeEmailStatus: 'pending', loginCodeEmailKind: 'resend' },
    // אוהד + עסק שאושרו יחד → combined מלולאת החברים
    'members/own1': { status: 'approved', firstName: 'שי', lastName: 'ל', email: 'own1@x.co', loginCodeEmailStatus: 'pending', isBusinessOwner: true, linkedBusinessId: 'biz1', nativePushTokens: { i1: { token: 'tokO' } } },
    'businesses/biz1': { status: 'approved', approvedAt: old, name: 'פלאפל הזהב', ownerMemberId: 'own1', ownerEmail: 'own1@x.co', ownerFirst: 'שי', ownerEmailStatus: 'pending' },
    // עסק שהבעלים שלו בלי קוד (נכנס עם Google) → biz
    'members/own2': { status: 'approved', firstName: 'דנה', lastName: 'ב', email: 'own2@x.co', googleEmail: 'own2@gmail.com', nativePushTokens: { i1: { token: 'tokD' } } },
    'businesses/biz2': { status: 'approved', approvedAt: old, name: 'מוסך דנה', ownerMemberId: 'own2', ownerEmail: 'garage@x.co', ownerFirst: 'דנה', ownerEmailStatus: 'pending' },
    'memberCodes/fanA': { loginCode: '111111' }, 'memberCodes/fanR': { loginCode: '222222' }, 'memberCodes/own1': { loginCode: '333333' },
    'bizTokens/biz1': { accessToken: 'tok-biz1' }, 'bizTokens/biz2': { accessToken: 'tok-biz2' },
  };
};
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
const mailTo = (e) => mails.find((x) => x.to[0].email === e);
const row = (id, rid) => db[`messages/tpl_${id}/recipients/${rid}`];

console.log('בלי App/Push בתבניות – רק מייל, כמו היום, + תג ושורה');
reset();
await sweep();
check('4 מיילים יצאו (login, resend, combined, biz)', mails.length === 4, mails.map((x) => x.to[0].email));
check('login: תג login + msg_tpl_login', JSON.stringify(mailTo('a@x.co').tags) === '["login","msg_tpl_login"]', mailTo('a@x.co').tags);
check('resend: תג msg_tpl_resend', mailTo('r@x.co').tags.includes('msg_tpl_resend'));
check('combined: תג combined + msg_tpl_combined', JSON.stringify(mailTo('own1@x.co').tags) === '["combined","msg_tpl_combined"]');
check('biz: תג bizApproved + msg_tpl_biz', JSON.stringify(mailTo('garage@x.co').tags) === '["bizApproved","msg_tpl_biz"]');
check('שורה login לפי מזהה החבר, mail=sent + messageId', row('login', 'fanA') && row('login', 'fanA').mail === 'sent' && /brevo/.test(row('login', 'fanA').mailId), row('login', 'fanA'));
check('שורה resend', row('resend', 'fanR') && row('resend', 'fanR').mail === 'sent');
check('שורה combined לפי מזהה החבר (הכתובת שלו)', row('combined', 'own1') && row('combined', 'own1').memberId === 'own1');
check('שורה biz לפי מזהה העסק (ownerEmail)', row('biz', 'biz2') && row('biz', 'biz2').t === 'b' && row('biz', 'biz2').name === 'מוסך דנה');
check('אין פריט באפליקציה כשלא דלוק', !Object.keys(db).some((p) => /\/inbox\//.test(p)));
check('אין פוש', fcm.length === 0);
check('app/push בשורה = null', row('login', 'fanA').app === null && row('login', 'fanA').push === null);
check('הסטטוסים הישנים עודכנו כרגיל', db['members/fanA'].loginCodeEmailStatus === 'sent' && db['businesses/biz2'].ownerEmailStatus === 'sent' && db['businesses/biz1'].welcomeEmailKind === 'combined');

console.log('\nApp+Push דלוקים בכל התבניות');
const on = (title, text) => ({ on: true, title, text, link: 'https://yellowzone.co.il/home.html' });
const pon = (title, body) => ({ on: true, title, body });
reset({
  loginApp: on('ברוך הבא {name}', 'שלום {name}, אושרת!'), loginPush: pon('פוש לוגין', 'לא אמור לצאת'),
  resendApp: on('לא אמור', 'לצאת'), resendPush: pon('לא', 'לא'),
  combinedApp: on('{business} אושר', 'היי {name}, {business} באינדקס'), combinedPush: pon('העסק שלך אושר', 'לחצו לפרטים'),
  bizApp: on('{business} אושר', 'היי {name}'), bizPush: pon('העסק אושר', 'פרטים'),
});
await sweep();
const inbox = (mid, id) => db[`members/${mid}/inbox/tpl_${id}`];
check('login: פריט אצל האוהד, personal, משתנים הוחלפו', inbox('fanA', 'login') && inbox('fanA', 'login').block === 'personal' && inbox('fanA', 'login').title === 'ברוך הבא איל' && inbox('fanA', 'login').link === '/home.html', inbox('fanA', 'login'));
check('login: אין פוש (אסור בתבנית הזאת) גם עם טוקן', !fcm.some((x) => x.token === 'tokA') && row('login', 'fanA').push === null && inbox('fanA', 'login').pushed === false);
check('resend: אין פריט ואין פוש (שכח קוד = לא מחובר)', !inbox('fanR', 'resend') && row('resend', 'fanR').app === null);
check('combined: פריט myBiz עם העסק', inbox('own1', 'combined') && inbox('own1', 'combined').block === 'myBiz' && inbox('own1', 'combined').bizId === 'biz1' && inbox('own1', 'combined').title === 'פלאפל הזהב אושר');
check('combined: פוש לבעלים עם קישור לפריט', fcm.some((x) => x.token === 'tokO' && x.data && x.data.link === '/profile.html?tab=msgs&item=tpl_combined'), fcm);
check('combined: שורה app=written push=sent', row('combined', 'own1').app === 'written' && row('combined', 'own1').push === 'sent');
check('biz: פריט אצל הבעלים own2 (שורה לפי העסק)', inbox('own2', 'biz') && row('biz', 'biz2').app === 'written' && row('biz', 'biz2').memberId === 'own2');
check('biz: פוש לבעלים', fcm.some((x) => x.token === 'tokD'));
check('readAt מאופס בפריט', inbox('fanA', 'login').readAt === null);

console.log('\nקצוות');
reset({ bizApp: on('א', 'ב'), bizPush: pon('ג', 'ד') });
db['members/own2'].status = 'pending';
await sweep();
check('biz: בעלים לא מאושר → אין פריט, app=none, פוש none', !inbox('own2', 'biz') && row('biz', 'biz2').app === 'none' && row('biz', 'biz2').push === 'none', row('biz', 'biz2'));
check('…והמייל עדיין יצא', mailTo('garage@x.co') && row('biz', 'biz2').mail === 'sent');

reset({ loginApp: { on: false, title: 'כבוי', text: 'כבוי' } });
await sweep();
check('App כבוי (on:false) → אין פריט', !inbox('fanA', 'login'));

reset({ loginApp: on('', 'בלי כותרת') });
await sweep();
check('App בלי כותרת → לא נשלח', !inbox('fanA', 'login'));

reset({ combinedApp: on('ת', 'ט'), combinedPush: pon('פ', 'ש') });
delete db['members/own1'].nativePushTokens;
await sweep();
check('בלי טוקן → push=noToken, הפריט נכתב', row('combined', 'own1').app === 'written' && row('combined', 'own1').push === 'noToken');

reset({ loginApp: on('ת', 'ט') });
failInbox = true;
await sweep();
check('כשל בכתיבת הפריט → app=failed, המייל נשאר sent', row('login', 'fanA').app === 'failed' && row('login', 'fanA').mail === 'sent' && db['members/fanA'].loginCodeEmailStatus === 'sent', row('login', 'fanA'));

reset();
db['members/fanA'].email = 'fail@x.co';
await sweep();
check('מייל שנכשל → שורה mail=failed עם שגיאה', row('login', 'fanA') && row('login', 'fanA').mail === 'failed' && /brevo/.test(row('login', 'fanA').mailError || ''), row('login', 'fanA'));
check('…והסטטוס הישן failed כמו היום', db['members/fanA'].loginCodeEmailStatus === 'failed');

reset();
db['messages/tpl_login/recipients/fanA'] = { mail: 'sent', mailDelivery: 'delivered', mailOpenedAt: 'x' };
await sweep();
check('שליחה חוזרת מאפסת את נתוני המסירה הישנים בשורה', row('login', 'fanA').mailDelivery === null && row('login', 'fanA').mailOpenedAt === null);

console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
