// בדיקת §524 — brevo-webhook.js האמיתי: אירוע עם תג msg_<id> נכתב גם לשורת הנמען של ההודעה.
import { handleBrevoWebhook } from '../worker/src/brevo-webhook.js';
import { sendBroadcastEmail } from '../worker/src/brevo.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
let db, brevoBodies;
const reset = () => {
  brevoBodies = [];
  db = {
    'members/fanA': { email: 'a@x.co', status: 'approved' },
    'businesses/biz1': { ownerEmail: 'own@x.co', status: 'approved' },
    'members/own1': { email: 'own@x.co', status: 'approved' },   // אותה כתובת גם לחבר – לא היה בהודעה
    'messages/MSG123456/recipients/fanA': { app: 'written', mail: 'sent' },
    'messages/MSG123456/recipients/biz1': { app: 'none', mail: 'sent' },
  };
};
const toV = (v) => v == null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : { booleanValue: !!v };
const fromV = (v) => 'stringValue' in v ? v.stringValue : 'timestampValue' in v ? v.timestampValue : 'nullValue' in v ? null : v;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'api.brevo.com') { brevoBodies.push(JSON.parse(opts.body)); return new Response('{"messageId":"<x>"}'); }
  if (u.pathname.endsWith(':runQuery')) {
    const q = JSON.parse(opts.body).structuredQuery, coll = q.from[0].collectionId, f = q.where.fieldFilter;
    const rows = Object.entries(db).filter(([k, d]) => k.split('/').length === 2 && k.startsWith(coll + '/') && d[f.field.fieldPath] === f.value.stringValue)
      .map(([k, d]) => ({ document: { name: 'x/documents/' + k, fields: Object.fromEntries(Object.entries(d).map(([a, b]) => [a, toV(b)])) } }));
    return new Response(JSON.stringify(rows.length ? rows : [{ readTime: 'x' }]));
  }
  const path = decodeURIComponent(u.pathname.match(/documents\/(.+)$/)[1]);
  if (opts.method === 'PATCH') {
    if (u.searchParams.get('currentDocument.exists') === 'true' && !db[path]) return new Response('{"error":{"code":404}}', { status: 404 });
    db[path] = { ...(db[path] || {}), ...Object.fromEntries(Object.entries(JSON.parse(opts.body).fields).map(([a, b]) => [a, fromV(b)])) };
    return new Response('{}');
  }
  return new Response('{}', { status: 404 });
};
const env = { FIREBASE_PROJECT_ID: 'p', BREVO_WEBHOOK_SECRET: 'S', BREVO_API_KEY: 'k', SENDER_EMAIL: 's@x', RATE_LIMIT_KV: { get: async () => ({ token: 't', exp: Math.floor(Date.now() / 1000) + 3600 }), put: async () => {} } };
const hook = (ev) => handleBrevoWebhook(new Request('https://api.yellowzone.co.il/brevo-webhook?key=S', { method: 'POST', body: JSON.stringify(ev) }), env);

console.log('שליחה: שני תגים');
reset();
await sendBroadcastEmail(env, { toEmail: 'a@x.co', toName: 'א', subject: 'ס', body: 'ג', vars: { name: 'א' }, msgTag: 'msg_MSG123456' });
check('Brevo קיבל tags = [broadcast, msg_…]', JSON.stringify(brevoBodies[0].tags) === '["broadcast","msg_MSG123456"]', brevoBodies[0].tags);
await sendBroadcastEmail(env, { toEmail: 'a@x.co', toName: 'א', subject: 'ס', body: 'ג', vars: { name: 'א' } });
check('בלי msgTag – כמו קודם, רק broadcast', JSON.stringify(brevoBodies[1].tags) === '["broadcast"]');

console.log('אירועים');
reset();
await hook({ event: 'delivered', email: 'a@x.co', tags: ['broadcast', 'msg_MSG123456'], ts: 1700000000 });
check('נמסר → שורת הנמען', db['messages/MSG123456/recipients/fanA'].mailDelivery === 'delivered' && !!db['messages/MSG123456/recipients/fanA'].mailDeliveryAt, db['messages/MSG123456/recipients/fanA']);
check('וגם השדות הישנים על החבר (§415)', db['members/fanA'].broadcastEmailDelivery === 'delivered');
await hook({ event: 'unique_opened', email: 'a@x.co', tag: '["broadcast","msg_MSG123456"]', ts: 1700000100 });
check('נפתח (תג כמחרוזת JSON) → mailOpenedAt בשורה', !!db['messages/MSG123456/recipients/fanA'].mailOpenedAt);
await hook({ event: 'click', email: 'a@x.co', tags: ['broadcast', 'msg_MSG123456'], ts: 1700000200 });
check('לחיצה → mailClickedAt', !!db['messages/MSG123456/recipients/fanA'].mailClickedAt);
await hook({ event: 'hard_bounce', email: 'own@x.co', tags: ['broadcast', 'msg_MSG123456'], reason: 'no such user', ts: 1700000300 });
check('חזר → שורת העסק, עם סיבה', db['messages/MSG123456/recipients/biz1'].mailDelivery === 'bounced' && db['messages/MSG123456/recipients/biz1'].mailDeliveryReason === 'no such user', db['messages/MSG123456/recipients/biz1']);
check('לא נוצרה שורת-רפאים לחבר עם אותה כתובת', !db['messages/MSG123456/recipients/own1']);
await hook({ event: 'delivered', email: 'a@x.co', tags: ['broadcast', 'msg_OTHER999'], ts: 1700000400 });
check('הודעה אחרת שאין לה שורה – לא נוצר כלום', !Object.keys(db).some((k) => k.startsWith('messages/OTHER999')));
await hook({ event: 'delivered', email: 'a@x.co', tags: ['login'] });
check('מייל קוד (בלי msg_) – לא נוגע בשורות', db['members/fanA'].loginCodeEmailDelivery === 'delivered' && db['messages/MSG123456/recipients/fanA'].mailDelivery === 'delivered');

console.log(`\n${fail ? '✗' : '✅'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
