// ── תגית חדשה ב-digital + תיוג "ברקום שיווק והפצה" ──────────────────────────────────────────
// ר' docs/PROJECT_CONTEXT.md §260. הרצה: node scratch_add_telecom_tag.js         (יבשה — רק מדפיס)
//                                       node scratch_add_telecom_tag.js --apply  (כותב בפועל)
//
// מה זה עושה:
//   1. settings/tagTaxonomy — הקטלוג החי: digital + "מוצרים וציוד תקשורת לעסק ולבית".
//      התגית ממוקמת מיד אחרי "חבילות תקשורת וסלולר" כדי ששתי תגיות-התקשורת ישבו יחד ברשימה
//      (הן נבדלות במילה הראשונה: חבילות=מנוי מול מוצרים/ציוד=חומרה).
//   2. ברקום שיווק והפצה — tags: [] → [התגית החדשה], noTagFits: true → false.
//      היה העסק היחיד מתוך 50 בלי אף תגית, ולכן הכרטיס שלו רונדר בלי שבב-תגית (home.html:1951).
//   3. רשומת יומן (activity) על העסק, כדי שהשינוי לא יהיה "שקט".
//
// הסקריפט מאמת את המצב הקיים לפני כל כתיבה — הרצה חוזרת בטוחה ולא דורסת מצב שהשתנה בינתיים.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const APPLY = process.argv.includes('--apply');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const NEW_TAG   = 'מוצרים וציוד תקשורת לעסק ולבית';
const ANCHOR    = 'חבילות תקשורת וסלולר';   // התגית שאחריה נשתול
const BIZ_ID    = 'tJORugnvuZ8uum7ufA4N';
const BIZ_LABEL = 'ברקום שיווק והפצה';

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
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

function fromFs(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
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
async function getDocFields(token, path) {
  const j = await (await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  const o = {}; for (const [k, v] of Object.entries(j.fields || {})) o[k] = fromFs(v);
  return o;
}
async function listAllBiz(token) {
  const out = []; let pt = '';
  do {
    const j = await (await fetch(`${API}/businesses?pageSize=300${pt ? '&pageToken=' + pt : ''}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) { const o = { id: d.name.split('/').pop() }; for (const [k, v] of Object.entries(d.fields || {})) o[k] = fromFs(v); out.push(o); }
    pt = j.nextPageToken || '';
  } while (pt);
  return out;
}
const sameArr = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

(async () => {
  const token = await getToken();
  console.log(APPLY ? '── מצב כתיבה (--apply) ──\n' : '── הרצה יבשה — לא נכתב כלום. להרצה אמיתית: --apply ──\n');

  // ── 1. הקטלוג החי ──
  const tax = await getDocFields(token, 'settings/tagTaxonomy');
  const digital = tax.digital || [];

  if (digital.includes(NEW_TAG)) {
    console.log(`⏭️  הקטלוג — "${NEW_TAG}" כבר קיים ב-digital, מדולג.`);
  } else {
    const at = digital.indexOf(ANCHOR);
    if (at === -1) { console.log(`❌ לא נמצאה תגית-העוגן "${ANCHOR}" ב-digital — עצירה, לא מנחשים מיקום.`); process.exit(1); }
    const next = [...digital.slice(0, at + 1), NEW_TAG, ...digital.slice(at + 1)];
    console.log('קטלוג תגיות (settings/tagTaxonomy) — digital:');
    console.log('   לפני: ' + JSON.stringify(digital));
    console.log('   אחרי: ' + JSON.stringify(next));
    if (APPLY) {
      const r = await fetch(`${API}/settings/tagTaxonomy?updateMask.fieldPaths=digital`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { digital: toFs(next) } }),
      });
      if (!r.ok) { console.log('❌ כתיבת הקטלוג נכשלה: ' + (await r.text()).slice(0, 400)); process.exit(1); }
      console.log('   ✅ נכתב.');
    }
  }
  console.log('');

  // ── בדיקת-שפיות: אף עסק אחר לא אמור להחזיק את התגית החדשה כבר ──
  const allBiz = await listAllBiz(token);
  const others = allBiz.filter(b => b.id !== BIZ_ID && (b.tags || []).includes(NEW_TAG));
  if (others.length) { console.log(`⚠️ ${others.length} עסקים אחרים כבר מחזיקים את התגית — לא צפוי:`); others.forEach(o => console.log('   ' + o.name)); }
  console.log(`נסרקו ${allBiz.length} עסקים.\n`);

  // ── 2. העסק ──
  const cur = await getDocFields(token, `businesses/${BIZ_ID}`);
  const set = { tags: [NEW_TAG], noTagFits: false };

  if (sameArr(cur.tags, set.tags) && cur.noTagFits === false) {
    console.log(`⏭️  ${BIZ_LABEL} — כבר מתויג נכון, מדולג.`);
  } else if (!sameArr(cur.tags, [])) {
    console.log(`⚠️  ${BIZ_LABEL} — כבר יש לו תגיות (${JSON.stringify(cur.tags)}) — מדולג, לא נדרס.`);
  } else if (cur.categoryPrimary !== 'digital') {
    console.log(`⚠️  ${BIZ_LABEL} — categoryPrimary בפועל "${cur.categoryPrimary}" ולא "digital" — מדולג, לא נדרס.`);
  } else {
    const parts = Object.entries(set).map(([k, v]) => `${k}: ${JSON.stringify(cur[k] ?? null)} → ${JSON.stringify(v)}`);
    console.log(`✏️  ${BIZ_LABEL} (${BIZ_ID})`);
    for (const p of parts) console.log('      ' + p);
    if (APPLY) {
      const fields = {}; for (const [k, v] of Object.entries(set)) fields[k] = toFs(v);
      const mask = Object.keys(set).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      const r = await fetch(`${API}/businesses/${BIZ_ID}?${mask}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      });
      if (!r.ok) { console.log('   ❌ נכשל: ' + (await r.text()).slice(0, 400)); process.exit(1); }

      const logFields = {
        type: toFs('adminEdit'),
        title: toFs('נערך: tags, noTagFits'),
        detail: toFs(`תגית חדשה בקטלוג (2026-08-24) — ${parts.join(' · ')}`),
        field: toFs('tags'),
        before: toFs(cur.tags ?? null),
        after: toFs(set.tags),
        actorUid: toFs('Uw1Caau9QFS8Voy2V6ij'),
        actorName: toFs('רמי בנטולילה'),
        source: toFs('admin'),
        createdAt: { timestampValue: new Date().toISOString() },
      };
      const lr = await fetch(`${API}/businesses/${BIZ_ID}/activity`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: logFields }),
      });
      console.log(lr.ok ? '   ✅ נכתב (כולל רשומת יומן).' : '   ✅ נכתב, אך רשומת היומן נכשלה: ' + (await lr.text()).slice(0, 200));
    }
  }

  console.log(APPLY ? '\nסיום.' : '\nהרצה יבשה הסתיימה — לא נכתב כלום.');
})();
