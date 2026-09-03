// ── מיזוג רשומה כפולה: בן גולדשטיין ────────────────────────────────────────────────────────
// הרשמה שנייה (3.9.26) נוצרה כי הכניסה לא הצליחה. הרשומה החדשה עשירה יותר מהמאושרת:
// יש בה תאריך לידה ופרטי מושב מלאים, בעוד שבמאושרת subscriberNumber הוא "00000" (מומצא).
// לכן: מעבירים את שדות-האמת לרשומה המאושרת (מספר חבר 68), ואז מוחקים את הכפולה.
//
// 🔑 **הסדר: מעבירים → מוודאים שהמעבר נכתב → רושמים ביומן → מוחקים.** מחיקה לפני שהמיזוג
// אומת הייתה מאבדת את פרטי המושב לצמיתות — הם קיימים *רק* על הרשומה שנמחקת.
//
// ⚠️ הרישום ל-deletionLog מחקה מדויקת של logAndDelete ב-deletion-log.js (§393), כולל שם
// השדות ו-state:'attempted'→'deleted', כדי שכפתור "שחזור" במרכז הניהול יעבוד על הרשומה הזאת
// בדיוק כמו על כל מחיקה אחרת. הצילום נשמר בפורמט REST הגולמי — setDoc בשחזור מקבל את
// אותם טיפוסים בדיוק (timestamp נשאר timestamp, null נשאר null).
//
// הרצה: node scratch_merge_dup_ben.js          → תוכנית בלבד, לא כותב כלום
//        node scratch_merge_dup_ben.js --apply  → מבצע

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const TARGET_ID = 'rxxfYQfp7nfidmc04vmy';   // המאושרת, מספר חבר 68
const DUP_ID    = 'PJDqMBOor1ueOvYF7TyB';   // הכפולה מ-3.9.26
const APPLY     = process.argv.includes('--apply');

// השדות שעוברים. ⚠️ מועתקים כערך REST גולמי ולא ממופים ידנית — מיפוי ידני היה הופך
// integerValue ל-stringValue בשקט, ואז הקובייה במרכז הניהול הייתה מציגה מספר כטקסט.
const MOVE = ['birthDate', 'seatArea', 'seatBlock', 'seatRow', 'seatNumber', 'verifyMethod', 'verifyTrust'];

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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function getDoc(token, path) {
  const r = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

// ערך "ריק" לצורך ההחלטה אם מותר לכתוב מעליו: חסר, null, או מחרוזת ריקה.
const isEmpty = (v) => v === undefined || v.nullValue !== undefined || (v.stringValue !== undefined && v.stringValue.trim() === '');
const show = (v) => v === undefined ? '(חסר)'
  : v.nullValue !== undefined ? 'null'
  : v.stringValue !== undefined ? `"${v.stringValue}"`
  : v.integerValue !== undefined ? v.integerValue
  : v.booleanValue !== undefined ? String(v.booleanValue)
  : v.timestampValue || JSON.stringify(v);

(async () => {
  const token = await getToken();
  const [target, dup] = await Promise.all([
    getDoc(token, `members/${TARGET_ID}`),
    getDoc(token, `members/${DUP_ID}`),
  ]);

  // ── שערי-בטיחות. כל אחד מהם עוצר לגמרי, כי כולם אומרים "המצב אינו מה שהנחתי" ──────────
  if (!target) throw new Error('הרשומה המאושרת לא נמצאה — עצירה');
  if (!dup)    { console.log('הרשומה הכפולה כבר לא קיימת — אין מה לעשות.'); return; }
  const tf = target.fields || {}, df = dup.fields || {};
  if (tf.status?.stringValue !== 'approved') throw new Error('היעד אינו approved — עצירה');
  if (df.status?.stringValue !== 'pending')  throw new Error('הכפולה אינה pending — עצירה');
  if (df.duplicateOfId?.stringValue !== TARGET_ID) throw new Error('duplicateOfId אינו מצביע ליעד — עצירה');
  if (tf.phone?.stringValue !== df.phone?.stringValue) throw new Error('הטלפונים אינם זהים — עצירה');
  if (tf.email?.stringValue !== df.email?.stringValue) throw new Error('המיילים אינם זהים — עצירה');

  console.log(`יעד:   members/${TARGET_ID}  ${tf.firstName?.stringValue} ${tf.lastName?.stringValue}  חבר #${tf.memberNumber?.integerValue}  (${tf.status?.stringValue})`);
  console.log(`כפולה: members/${DUP_ID}  ${df.firstName?.stringValue} ${df.lastName?.stringValue}  (${df.status?.stringValue}, ${df.reviewFlag?.stringValue})`);
  console.log('');

  const updates = {}, skipped = [];
  for (const f of MOVE) {
    const from = df[f], to = tf[f];
    if (isEmpty(from)) { skipped.push(`${f}: אין ערך בכפולה`); continue; }
    // ⚠️ לא דורסים ערך קיים ביעד. אם יש התנגשות אמיתית — היא נאמרת ולא נבלעת.
    if (!isEmpty(to)) { skipped.push(`⚠️ ${f}: ליעד כבר יש ${show(to)} — לא נדרס (בכפולה: ${show(from)})`); continue; }
    updates[f] = from;
    console.log(`   ${f}: ${show(to)} → ${show(from)}`);
  }
  if (skipped.length) { console.log('\nלא הועבר:'); for (const s of skipped) console.log('   ' + s); }

  if (!APPLY) {
    console.log(`\n— תוכנית בלבד. ${Object.keys(updates).length} שדות יועברו, ואז הכפולה תירשם ביומן ותימחק.`);
    console.log('  להרצה בפועל: node scratch_merge_dup_ben.js --apply');
    return;
  }

  // ── 1. העברת השדות ────────────────────────────────────────────────────────────────────
  if (Object.keys(updates).length) {
    const mask = Object.keys(updates).map(f => `updateMask.fieldPaths=${f}`).join('&');
    const r = await fetch(`${API}/members/${TARGET_ID}?${mask}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: updates }),
    });
    if (!r.ok) throw new Error('העברת השדות נכשלה — ' + r.status + ': ' + (await r.text()).slice(0, 300));
    console.log('\n✅ השדות הועברו.');
  }

  // ── 2. אימות חי שהם באמת שם, לפני שנוגעים במחיקה ──────────────────────────────────────
  // 🔑 בלי זה, PATCH שהצליח חלקית היה מוחק את המקור היחיד של פרטי המושב.
  const after = await getDoc(token, `members/${TARGET_ID}`);
  const missing = Object.keys(updates).filter(f => isEmpty((after.fields || {})[f]));
  if (missing.length) throw new Error('שדות לא נכתבו ביעד: ' + missing.join(', ') + ' — המחיקה מבוטלת');
  console.log('✅ אומת ביעד: ' + Object.keys(updates).map(f => `${f}=${show(after.fields[f])}`).join(', '));

  // ── 3. רישום ביומן המחיקות, ורק אז מחיקה (§393) ───────────────────────────────────────
  const label = `${df.firstName?.stringValue || ''} ${df.lastName?.stringValue || ''}`.trim() || '(ללא שם)';
  const logDoc = {
    fields: {
      collectionName: { stringValue: 'members' },
      docId:          { stringValue: DUP_ID },
      data:           { mapValue: { fields: df } },      // הצילום הגולמי, כפי שהוא
      label:          { stringValue: label },
      actorUid:       { nullValue: null },
      actorName:      { stringValue: 'סקריפט — מיזוג רשומה כפולה' },
      actorEmail:     { stringValue: 'ramibentl@gmail.com' },
      source:         { stringValue: 'script:duplicate-merge' },
      deletedAt:      { timestampValue: new Date().toISOString() },
      state:          { stringValue: 'attempted' },
      restoredAt:     { nullValue: null },
      restoredBy:     { nullValue: null },
    },
  };
  const lr = await fetch(`${API}/deletionLog`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(logDoc),
  });
  if (!lr.ok) throw new Error('הרישום ביומן נכשל — המחיקה מבוטלת. ' + lr.status + ': ' + (await lr.text()).slice(0, 300));
  const logId = (await lr.json()).name.split('/').pop();
  console.log(`✅ נרשם ביומן המחיקות: deletionLog/${logId}`);

  const dr = await fetch(`${API}/members/${DUP_ID}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!dr.ok) throw new Error('המחיקה נכשלה — היומן נשאר על attempted. ' + dr.status);
  await fetch(`${API}/deletionLog/${logId}?updateMask.fieldPaths=state`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { state: { stringValue: 'deleted' } } }),
  });
  console.log(`✅ members/${DUP_ID} נמחקה. ניתן לשחזר מיומן המחיקות במרכז הניהול.`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
