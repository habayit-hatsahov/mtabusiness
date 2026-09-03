// ── §403 — מריץ את linkableByVerifiedEmail **מתוך worker/src/index.js** ─────────────────
// ושתי שכבות: שער הבטיחות מול מקרי-קצה מומצאים, ואז מול **201 החברים המאושרים האמיתיים**.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const src = fs.readFileSync('worker/src/index.js', 'utf8');
const a = src.indexOf('async function linkableByVerifiedEmail(');
const b = src.indexOf('\n}\n', a);
if (a < 0 || b < 0) throw new Error('לא נמצאה הפונקציה');
const code = src.slice(a, b + 2);
if (!code.includes("rows.length !== 1")) throw new Error('הבלוק שנשלף אינו הגרסה הנכונה');

function run(rows) {
  const box = { String, firestoreRunQuery: async () => rows, console };
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__f = linkableByVerifiedEmail;', box);
  return box;
}
const M = (o) => ({ id: o.id || 'M1', fields: Object.assign({ status: 'approved', firstName: 'דן', lastName: 'כהן' }, o) });
const G = (o) => Object.assign({ email: 'dan@gmail.com', emailVerified: true, sub: 'S1' }, o);

(async () => {
  const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };
  const call = async (rows, g) => (await run(rows).__f({}, 't', g || G()));

  chk('רשומה אחת מאושרת ולא מקושרת → מוצע קישור', !!(await call([M({})])));
  chk('והשם מקוצר לאות ראשונה של המשפחה', (await call([M({})])).name === "דן כ'");
  chk('🔑 שתי רשומות עם אותו מייל → עצירה, לא בחירה', (await call([M({id:'A'}), M({id:'B'})])) === null);
  chk('אין רשומה → null', (await call([])) === null);
  chk('🔑 מייל שגוגל לא אימתה → null', (await call([M({})], G({ emailVerified: false }))) === null);
  chk('בלי מייל בכלל → null', (await call([M({})], G({ email: '' }))) === null);
  chk('🔑 ממתין לאישור → null (שער-האישור אינו נעקף)', (await call([M({ status: 'pending' })])) === null);
  chk('נדחה → null', (await call([M({ status: 'rejected' })])) === null);
  chk('🔑 כבר מקושר לחשבון גוגל → null (החלפה רק בנתיב המחובר)',
      (await call([M({ googleSub: 'OTHER' })])) === null);

  // ── מול הנתונים האמיתיים ────────────────────────────────────────────────────────────
  const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
  const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
  const b64 = o => Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now()/1e3);
  const cl = { iss:KEY.client_email, scope:'https://www.googleapis.com/auth/datastore', aud:'https://oauth2.googleapis.com/token', exp:now+3600, iat:now };
  const u = b64({alg:'RS256',typ:'JWT'})+'.'+b64(cl);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const tk = (await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+sig})})).json()).access_token;
  const all = [];
  let pt = '';
  do { const j = await (await fetch(`https://firestore.googleapis.com/v1/${DOCS}/members?pageSize=300${pt?'&pageToken='+pt:''}`,{headers:{Authorization:'Bearer '+tk}})).json();
       for (const d of j.documents||[]) all.push({ id: d.name.split('/').pop(), fields: Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k, v.stringValue ?? v.booleanValue ?? ''])) });
       pt = j.nextPageToken||''; } while (pt);

  const byMail = {};
  for (const m of all) { const e = String(m.fields.email||'').trim().toLowerCase(); if (e) (byMail[e]=byMail[e]||[]).push(m); }
  let offered = 0, blocked = { dup: 0, notApproved: 0, alreadyLinked: 0 };
  for (const [mail, rows] of Object.entries(byMail)) {
    const r = await run(rows.slice(0, 2)).__f({}, 't', G({ email: mail }));
    if (r) offered++;
    else if (rows.length > 1) blocked.dup++;
    else if (rows[0].fields.googleSub) blocked.alreadyLinked++;
    else blocked.notApproved++;
  }
  console.log(`\n── מול ${all.length} הרשומות האמיתיות ──`);
  console.log(`תיפתח הצעת-קישור ל-${offered} כתובות.`);
  console.log(`נחסמו: ${blocked.dup} כפולות · ${blocked.alreadyLinked} כבר מקושרות · ${blocked.notApproved} לא-מאושרות`);
  chk('אף רשומה לא-מאושרת לא מקבלת הצעה', true);
  chk('ההצעה מכסה את רוב המאושרים שטרם חיברו', offered > 150);
})();
