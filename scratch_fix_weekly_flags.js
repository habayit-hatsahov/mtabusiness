// ── נרמול wantsBusinessOfWeek / wantsBenefitOfWeek: מחרוזות עברית → boolean ─────────────────
// ר' docs/PROJECT_CONTEXT.md §263.5. הרצה: node scratch_fix_weekly_flags.js         (יבשה)
//                                          node scratch_fix_weekly_flags.js --apply  (כותב)
//
// למה: השדות שמורים בשני פורמטים — גרסה מוקדמת של טופס ההרשמה שמרה 'כן'/'לא' כמחרוזות,
// והגרסה הנוכחית שומרת boolean. הקוד עשה `!!value`, ומחרוזת לא-ריקה היא truthy ב-JS — ולכן
// 'לא' נקרא כ-true. הקוד כבר תוקן (weeklyFlagOn) וסובלני לשני הפורמטים; הסקריפט הזה מנרמל
// את **הנתונים עצמם** כדי שיישאר פורמט אחד בלבד.
//
// מאמת את המצב הקיים לפני כל כתיבה ומדלג על מה שכבר boolean — הרצה חוזרת בטוחה.
// **לא נוגע** בעסקים שאין להם את השדה כלל — היעדר-שדה אינו "לא", הם פשוט מעולם לא נשאלו.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const APPLY = process.argv.includes('--apply');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const FLAGS = ['wantsBusinessOfWeek', 'wantsBenefitOfWeek'];
const LABEL = { wantsBusinessOfWeek: '🏆 עסק השבוע', wantsBenefitOfWeek: '🎁 הטבת השבוע' };

// אותה טבלת-הכרעה בדיוק כמו weeklyFlagOn() ב-admin-dashboard.html / business-dashboard.html.
// כל ערך-מחרוזת שאינו ברשימה הזו נחשב false — אבל הסקריפט **עוצר** על ערך לא-מוכר במקום
// להמיר אותו בשקט, כדי שלא נהפוך משהו שלא הבנּו ל-false בטעות.
const TRUE_WORDS = ['כן', 'yes', 'true'];
const FALSE_WORDS = ['לא', 'no', 'false', ''];

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j));
  return j.access_token;
}
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  const fields = {}; for (const [k, x] of Object.entries(v)) fields[k] = toFs(x);
  return { mapValue: { fields } };
}
// **גולמי בכוונה** — לא ממיר דרך fromFs, כי כל העניין כאן הוא *באיזה טיפוס* השדה שמור.
async function listAllBizRaw(token) {
  const out = []; let pt = '';
  do {
    const j = await (await fetch(`${API}/businesses?pageSize=300${pt ? '&pageToken=' + pt : ''}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) {
      out.push({ id: d.name.split('/').pop(), name: d.fields?.name?.stringValue || '(ללא שם)', status: d.fields?.status?.stringValue || '?', fields: d.fields || {} });
    }
    pt = j.nextPageToken || '';
  } while (pt);
  return out;
}
async function patch(token, path, obj) {
  const fields = {}; for (const [k, v] of Object.entries(obj)) fields[k] = toFs(v);
  const mask = Object.keys(obj).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${API}/${path}?${mask}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}
async function logActivity(token, bizId, entry) {
  const fields = {};
  for (const [k, v] of Object.entries({ source: 'admin', actorUid: 'Uw1Caau9QFS8Voy2V6ij', actorName: 'רמי בנטולילה', ...entry })) fields[k] = toFs(v);
  fields.createdAt = { timestampValue: new Date().toISOString() };
  await fetch(`${API}/businesses/${bizId}/activity`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
}

(async () => {
  const token = await getToken();
  console.log(APPLY ? '── מצב כתיבה (--apply) ──\n' : '── הרצה יבשה — לא נכתב כלום. להרצה אמיתית: --apply ──\n');

  const all = await listAllBizRaw(token);
  console.log(`נסרקו ${all.length} עסקים (כל הסטטוסים, לא רק approved).\n`);

  const plan = [];       // { biz, updates:{}, before:{} }
  const unknown = [];    // ערכי-מחרוזת שלא זיהינו — עוצרים עליהם
  let alreadyBool = 0, noField = 0;

  for (const b of all) {
    const updates = {}, before = {};
    let hasAny = false, allBool = true;

    for (const key of FLAGS) {
      const raw = b.fields[key];
      if (raw === undefined) continue;
      hasAny = true;
      if ('booleanValue' in raw) continue;
      allBool = false;
      if (!('stringValue' in raw)) {
        unknown.push(`${b.name} · ${key} · טיפוס לא צפוי: ${JSON.stringify(raw)}`);
        continue;
      }
      const s = raw.stringValue.trim().toLowerCase();
      if (TRUE_WORDS.includes(s)) { updates[key] = true; before[key] = raw.stringValue; }
      else if (FALSE_WORDS.includes(s)) { updates[key] = false; before[key] = raw.stringValue; }
      else unknown.push(`${b.name} · ${key} · ערך לא מוכר: "${raw.stringValue}"`);
    }

    if (!hasAny) { noField++; continue; }
    if (allBool) { alreadyBool++; continue; }
    if (Object.keys(updates).length) plan.push({ biz: b, updates, before });
  }

  console.log(`⏭️  ${noField} עסקים בלי השדה כלל — לא נוגעים בהם (היעדר-שדה אינו "לא").`);
  console.log(`⏭️  ${alreadyBool} עסקים כבר שמורים כ-boolean — אין מה להמיר.`);
  console.log(`✏️  ${plan.length} עסקים להמרה.\n`);

  if (unknown.length) {
    console.log('❌ ערכים לא מוכרים — הסקריפט נעצר, לא נכתב כלום:');
    unknown.forEach(u => console.log('   ' + u));
    console.log('\nיש להחליט ידנית מה כל ערך כזה אומר לפני שממירים.');
    process.exit(1);
  }

  for (const { biz, updates, before } of plan) {
    console.log(`${biz.name}  [${biz.status}]`);
    for (const key of Object.keys(updates)) {
      console.log(`   ${LABEL[key]}: "${before[key]}"  →  ${updates[key]}`);
    }
    if (!APPLY) { console.log(''); continue; }
    await patch(token, `businesses/${biz.id}`, updates);
    for (const key of Object.keys(updates)) {
      await logActivity(token, biz.id, {
        type: 'adminEdit', field: key, title: `נערך: ${LABEL[key]}`,
        detail: `נרמול פורמט — מחרוזת "${before[key]}" הומרה ל-boolean (§263.5)`,
        before: before[key], after: updates[key],
      });
    }
    console.log('   ✅ נכתב.\n');
  }

  // ── אימות אחרי כתיבה: קריאה חוזרת, לא הסתמכות על מה ששלחנו ──
  if (APPLY && plan.length) {
    console.log('── אימות: קריאה חוזרת מ-Firestore ──');
    const after = await listAllBizRaw(token);
    let bad = 0, strings = 0;
    for (const b of after) {
      for (const key of FLAGS) {
        const raw = b.fields[key];
        if (raw === undefined) continue;
        if ('stringValue' in raw) { strings++; console.log(`   ❌ ${b.name} · ${key} עדיין מחרוזת: "${raw.stringValue}"`); bad++; }
      }
    }
    console.log(strings === 0
      ? `   ✅ אפס שדות שנותרו כמחרוזת. ${plan.length} עסקים הומרו.`
      : `   ❌ נותרו ${bad} שדות כמחרוזת.`);
  }

  if (!APPLY) console.log('להרצה אמיתית:  node scratch_fix_weekly_flags.js --apply');
})().catch(e => { console.error('שגיאה:', e.message); process.exit(1); });
