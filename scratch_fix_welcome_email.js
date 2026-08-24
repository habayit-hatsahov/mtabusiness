// ── שליחת מכתב-הפתיחה המאוחד לשני בעלי-העסקים שקיבלו במקומו מיילים קצרים נפרדים ──────────────
// ר' docs/PROJECT_CONTEXT.md §221. הרצה: node scratch_fix_welcome_email.js
//
// מה זה עושה: מחזיר את מסמך העסק ואת מסמך החבר שמאחוריו ל-'pending' **בכתיבה אטומית אחת**
// (Firestore :commit). ה-cron של ה-Worker רץ כל דקה, מוצא את שניהם ממתינים יחד, ושולח את
// המייל המאוחד (combinedBody) — קוד הכניסה + מה לעשות עכשיו + הקישור לדשבורד.
// זו בדיוק ההתנהגות של הכפתור החדש "שליחת מכתב הפתיחה" במרכז תקלות המייל; צריך סקריפט רק כי
// שתי הרשומות האלה קדמו לשדה welcomeEmailKind ולכן לא יופיעו שם מעצמן.
//
// אחרי ההרצה: המייל יוצא תוך דקה. אפשר לוודא בכרטיס העסק במרכז הניהול — הסטטוס יחזור ל"נשלח"
// עם שעה חדשה, וכעבור דקות ספורות גם "נמסר".

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';

// [שם לתצוגה, מזהה עסק, מזהה חבר]
const TARGETS = [
  ['Kaneti insurance — גל קנטי',        'z5RUoys6RsoWd9aG50zz', 'LScpz9dLBqnBjxfFjxbj'],
  ['בני שליחויות אקספרס — בני אפרמיאן', 'ki5zPkwAafXqUe3hAIcE', 'l8uNUIKv6VdcLcdXSGTK'],
];

const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: KEY.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + sig,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j));
  return j.access_token;
}

const NOW = new Date().toISOString();
const NULL = { nullValue: null };

function bizWrite(bizId) {
  const fields = {
    ownerEmailStatus: { stringValue: 'pending' },
    ownerEmailQueuedAt: { timestampValue: NOW },
    ownerEmailError: NULL,
    ownerEmailDelivery: NULL,
    ownerEmailDeliveryAt: NULL,
    ownerEmailDeliveryReason: NULL,
    ownerEmailOpenedAt: NULL,
    ownerEmailClickedAt: NULL,
    welcomeEmailKind: NULL,
  };
  return { update: { name: `${DOCS}/businesses/${bizId}`, fields }, updateMask: { fieldPaths: Object.keys(fields) } };
}

function memberWrite(memberId, bizId) {
  const fields = {
    loginCodeEmailStatus: { stringValue: 'pending' },
    loginCodeEmailQueuedAt: { timestampValue: NOW },
    loginCodeEmailError: NULL,
    loginCodeEmailDelivery: NULL,
    loginCodeEmailDeliveryAt: NULL,
    loginCodeEmailDeliveryReason: NULL,
    loginCodeEmailOpenedAt: NULL,
    loginCodeEmailClickedAt: NULL,
    isBusinessOwner: { booleanValue: true },
    linkedBusinessId: { stringValue: bizId },
  };
  return { update: { name: `${DOCS}/members/${memberId}`, fields }, updateMask: { fieldPaths: Object.keys(fields) } };
}

(async () => {
  const token = await getToken();
  const base = `https://firestore.googleapis.com/v1/${DOCS}`;

  for (const [label, bizId, memberId] of TARGETS) {
    // בדיקה לפני כתיבה — שהחבר מאושר ויש לו קוד, אחרת המייל המאוחד יֵצא בלי הקוד
    const m = await (await fetch(`${base}/members/${memberId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const mf = m.fields || {};
    if (mf.status?.stringValue !== 'approved' || !mf.loginCode?.stringValue) {
      console.log(`⏭  ${label} — דילוג: החבר לא מאושר או בלי קוד כניסה`);
      continue;
    }

    const resp = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [bizWrite(bizId), memberWrite(memberId, bizId)] }),
    });
    if (!resp.ok) { console.log(`❌ ${label} — ${resp.status}: ${(await resp.text()).slice(0, 300)}`); continue; }
    console.log(`✅ ${label} — נכנס לתור (קוד ${mf.loginCode.stringValue}), המייל המאוחד יוצא תוך דקה`);
  }
})();
