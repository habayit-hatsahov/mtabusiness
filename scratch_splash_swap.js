// §536יא — מחליף ב-settings/splashScreen את תמונות 1–6 לגרסאות "דמות קטנה" (splash-N-s.jpg), באישור רמי (16.10).
// משנה רק את ה-url של פריטים שה-url שלהם בדיוק images/splash/splash-[1-6].jpg; סדר/הפעלה/שאר הפריטים – כמו שהם.
// הרצה: node scratch_splash_swap.js        (בלי --write = רק מציג מה ישתנה)
const fs = require('fs');
const crypto = require('crypto');

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const DOC = `projects/${KEY.project_id}/databases/(default)/documents/settings/splashScreen`;
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

(async () => {
  const write = process.argv.includes('--write');
  const token = await getToken();
  const doc = await (await fetch(`https://firestore.googleapis.com/v1/${DOC}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const items = doc.fields.items.arrayValue.values;
  let changed = 0;
  for (const v of items) {
    const url = v.mapValue.fields.url.stringValue;
    // §536יא: 1–6 → -s · §536יב: 7 (אבוקה, עשן צהוב-כחול) → 8-s (אבוקה כחולה חדשה מרמי, רקע רק למטה)
    const m = /^https:\/\/yellowzone\.co\.il\/images\/splash\/splash-([1-7])\.jpg$/.exec(url);
    if (!m) { console.log('  =', url); continue; }
    v.mapValue.fields.url.stringValue = m[1] === '7'
      ? 'https://yellowzone.co.il/images/splash/splash-8-s.jpg'
      : `https://yellowzone.co.il/images/splash/splash-${m[1]}-s.jpg`;
    changed++;
    console.log('  →', v.mapValue.fields.url.stringValue);
  }
  console.log(`${changed} ישתנו`);
  if (!write || !changed) return;
  const body = { fields: { items: doc.fields.items, updatedAt: { timestampValue: new Date().toISOString() } } };
  const r = await fetch(`https://firestore.googleapis.com/v1/${DOC}?updateMask.fieldPaths=items&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  console.log('PATCH', r.status, r.ok ? 'נשמר' : await r.text());
})();
