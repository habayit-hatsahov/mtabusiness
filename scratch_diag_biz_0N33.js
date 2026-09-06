// ── אבחון ממוקד: AI Out Of The Box — למה כל השרשרת שאחרי יצירת המסמך לא רצה ──────────────
// קריאה בלבד. הרצה: node scratch_diag_biz_0N33.js
//
// שלוש שאלות מכריעות, וכל אחת מפרידה בין שני תרחישים שנראים זהים מבחוץ:
//   1. יש אירועים בכלל על העסק/הנרשם?  formSubmit קיים ⇒ הקוד הגיע עד סוף handleSubmit
//      (כלומר הדף לא מת), ואז החשוד הוא נתיב-הכפילות של §366. אין כלום ⇒ הדף מת מוקדם.
//   2. קיימת רשומת-חבר לאיל מנדל?  קיימת ⇒ linkOrCreateOwnerMember כן רץ ורק updateDoc נפל.
//      לא קיימת ⇒ שום דבר אחרי setDoc של המסמך לא רץ.
//   3. יש מסמך-עסק שני של אותו בעלים?  ⇒ שליחה כפולה.

const fs = require('fs');
const crypto = require('crypto');

const BIZ_ID = '0N33cE117xAGpb5Rn2j5';
const PHONE = '0509103344';
const EMAIL = 'ayalmandel@gmail.com';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(JSON.stringify(j));
  return j.access_token;
}

const S = (v) => v === undefined || v === null ? null
  : v.stringValue !== undefined ? v.stringValue
  : v.booleanValue !== undefined ? String(v.booleanValue)
  : v.integerValue !== undefined ? v.integerValue
  : v.timestampValue !== undefined ? v.timestampValue
  : v.nullValue !== undefined ? '(null)'
  : v.arrayValue ? ((v.arrayValue.values || []).length + ' פריטים')
  : JSON.stringify(v).slice(0, 120);

const flat = (f) => Object.fromEntries(Object.keys(f || {}).sort().map((k) => [k, S(f[k])]));

(async () => {
  const token = await getToken();
  const H = { Authorization: `Bearer ${token}` };
  const q = async (body) => {
    const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 400));
    return j.filter((x) => x.document);
  };
  const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } });

  console.log('─── 1. כל האירועים שקשורים לעסק / לנרשם ───────────────────────────────');
  for (const [label, filter] of [
    ['bizId == ' + BIZ_ID, eq('bizId', BIZ_ID)],
    ['phone == ' + PHONE, eq('phone', PHONE)],
    ['email == ' + EMAIL, eq('email', EMAIL)],
  ]) {
    try {
      const ev = await q({ structuredQuery: { from: [{ collectionId: 'events' }], where: filter, limit: 60 } });
      console.log(`\n  ${label} → ${ev.length} אירועים`);
      ev.map((x) => x.document.fields || {})
        .sort((a, b) => String(S(a.createdAt)).localeCompare(String(S(b.createdAt))))
        .forEach((g) => console.log(`     ${S(g.createdAt)}  type=${S(g.type)}  blockId=${S(g.blockId)}  channel=${S(g.channel)}  path=${S(g.path)}  device=${S(g.device)}  session=${S(g.sessionId)}`));
    } catch (e) { console.log(`  ${label} → שאילתה נכשלה: ${e.message.slice(0, 200)}`); }
  }

  console.log('\n─── 2. רשומות חבר של הבעלים ───────────────────────────────────────────');
  for (const [label, filter] of [['phone', eq('phone', PHONE)], ['email', eq('email', EMAIL)]]) {
    const ms = await q({ structuredQuery: { from: [{ collectionId: 'members' }], where: filter, limit: 10 } });
    console.log(`\n  members לפי ${label} → ${ms.length}`);
    ms.forEach((x) => {
      const f = x.document.fields || {};
      console.log(`     [${x.document.name.split('/').pop()}] created=${x.document.createTime}`);
      console.log(`        ${JSON.stringify(flat(f))}`);
    });
  }

  console.log('\n─── 3. מסמכי עסק נוספים של אותו בעלים ─────────────────────────────────');
  for (const [label, filter] of [['ownerPhone', eq('ownerPhone', PHONE)], ['ownerEmail', eq('ownerEmail', EMAIL)]]) {
    const bs = await q({ structuredQuery: { from: [{ collectionId: 'businesses' }], where: filter, limit: 10 } });
    console.log(`  businesses לפי ${label} → ${bs.length}: ${bs.map((x) => `${S((x.document.fields || {}).name)}[${x.document.name.split('/').pop()}] ${S((x.document.fields || {}).submittedAt)}`).join(' | ')}`);
  }

  console.log('\n─── 4. המסמך המלא של העסק ─────────────────────────────────────────────');
  const d = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/businesses/${BIZ_ID}`, { headers: H });
  const dj = await d.json();
  console.log(`  createTime=${dj.createTime}  updateTime=${dj.updateTime}`);
  console.log(`  🔑 createTime == updateTime ? ${dj.createTime === dj.updateTime ? 'כן — המסמך נכתב פעם אחת ומעולם לא עודכן אחריו' : 'לא — היה עדכון אחרי היצירה'}`);
  console.log('  ' + JSON.stringify(flat(dj.fields), null, 2).replace(/\n/g, '\n  '));
})().catch((e) => { console.error('נכשל:', e.message); process.exit(1); });
