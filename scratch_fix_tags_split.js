// ── פיצול תגית הספורט + 2 תגיות חדשות + תיוג 2 עסקים שהיו בלי תגית ─────────────────────────
// ר' docs/PROJECT_CONTEXT.md. הרצה: node scratch_fix_tags_split.js         (הרצה יבשה — רק מדפיס)
//                                  node scratch_fix_tags_split.js --apply  (כותב בפועל)
//
// מה זה עושה:
//   1. settings/tagTaxonomy — הקטלוג החי (מקור-האמת שכל 4 הדפים קוראים ממנו בזמן ריצה):
//      • sport:   "חנויות ספורט וגלישה" → "חנויות ספורט ובריכות" + תגית חדשה "גלישה"
//      • vehicle: + "מכירת רכבים וסוכנויות"
//      • home:    + "נדל״ן — קבלנים ויזמים"
//   2. עסקים:
//      • RON MOTORS   — categoryPrimary 'other' → 'vehicle' + תגית "מכירת רכבים וסוכנויות"
//      • קבוצת טלניר  — categoryPrimary 'other' → 'home'    + תגית "נדל״ן — קבלנים ויזמים"
//      • ספורט אנד פול — תגית ראשית מוסבת ל"חנויות ספורט ובריכות" (השנייה, "אטרקציות ופנאי", נשמרת)
//      • סרף אין      — תגית מוסבת ל"גלישה"
//   3. רשומת יומן (activity) לכל עסק, כדי שהשינוי יהיה עקיב ב"החלטות ויומן".
//
// הסקריפט מאמת את המצב הקיים לפני כל כתיבה — עסק שכבר תוקן/שהמצב שלו שונה מהצפוי ידווח וידולג,
// כך שהרצה חוזרת בטוחה.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const APPLY = process.argv.includes('--apply');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const OLD_SPORT_TAG = 'חנויות ספורט וגלישה';
const TAG_POOL      = 'חנויות ספורט ובריכות';
const TAG_SURF      = 'גלישה';
const TAG_CARS      = 'מכירת רכבים וסוכנויות';
const TAG_REALESTATE = 'נדל״ן — קבלנים ויזמים';

// המצב החדש המלא של 3 הקטגוריות שנגענו בהן (שאר הקטגוריות לא נכתבות כלל — updateMask)
const TAXONOMY_PATCH = {
  sport:   [TAG_POOL, TAG_SURF, 'אטרקציות ופנאי', 'כושר ותזונה'],
  vehicle: ['מוסכים וחלקי חילוף', 'מצברים וחשמלאות', 'ציוד ואביזרי רכיבה', 'שליחויות ולוגיסטיקה', 'שירותי דרך וגרר', TAG_CARS],
  home:    ['בנייה ושיפוצים', 'נגרות וריהוט', 'עבודת גינון והדברה', 'ניקיון ואחזקה', 'מיזוג אוויר ומנעולנים', 'חנות חיות', TAG_REALESTATE],
};

// expect — מה חייב להיות במסמך *לפני* השינוי, כדי שלא נדרוס מצב שהשתנה בינתיים
const BIZ_JOBS = [
  { id: 'k9ze75reNJUTQaat802k', label: 'RON MOTORS',
    expect: { tags: [], categoryPrimary: 'other' },
    set:    { categoryPrimary: 'vehicle', cat: 'vehicle', tags: [TAG_CARS] } },
  { id: 'jrrkzPQqBVsOu67izA9Q', label: 'קבוצת טלניר',
    expect: { tags: [], categoryPrimary: 'other' },
    set:    { categoryPrimary: 'home', cat: 'home', tags: [TAG_REALESTATE] } },
  { id: 'dfpUSqgQNtV2xabz8rgR', label: 'ספורט אנד פול . אינטקס חולון',
    expect: { tags: [OLD_SPORT_TAG, 'אטרקציות ופנאי'] },
    set:    { tags: [TAG_POOL, 'אטרקציות ופנאי'] } },
  { id: 'n2dQETepkZVA7DVHGW9z', label: "סרף אין בע''מ",
    expect: { tags: [OLD_SPORT_TAG] },
    set:    { tags: [TAG_SURF] } },
];

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

  // ── בדיקת-שפיות: מי עוד משתמש בתגית הישנה, מעבר ל-2 העסקים המוכרים ──
  const allBiz = await listAllBiz(token);
  const known = new Set(BIZ_JOBS.map(j => j.id));
  const strays = allBiz.filter(b => !known.has(b.id) && (
    (b.tags || []).includes(OLD_SPORT_TAG) || b.tagSuggestion === OLD_SPORT_TAG || b.tagSecondSuggestion === OLD_SPORT_TAG));
  if (strays.length) {
    console.log(`⚠️ עוד ${strays.length} עסקים משתמשים ב"${OLD_SPORT_TAG}" ולא נכללו בסקריפט — עצירה:`);
    for (const s of strays) console.log(`   ${s.name} (${s.id}) tags=${JSON.stringify(s.tags)}`);
    process.exit(1);
  }
  console.log(`נסרקו ${allBiz.length} עסקים — אין משתמשים נוספים בתגית הישנה מעבר ל-2 המטופלים.\n`);

  // ── 1. קטלוג התגיות ──
  const tax = await getDocFields(token, 'settings/tagTaxonomy');
  console.log('קטלוג תגיות (settings/tagTaxonomy):');
  for (const [cat, arr] of Object.entries(TAXONOMY_PATCH)) {
    console.log(`   ${cat}:\n      לפני: ${JSON.stringify(tax[cat])}\n      אחרי: ${JSON.stringify(arr)}`);
  }
  if (APPLY) {
    const fields = {}; for (const [k, v] of Object.entries(TAXONOMY_PATCH)) fields[k] = toFs(v);
    const mask = Object.keys(TAXONOMY_PATCH).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const r = await fetch(`${API}/settings/tagTaxonomy?${mask}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    });
    if (!r.ok) { console.log('❌ כתיבת הקטלוג נכשלה: ' + (await r.text()).slice(0, 400)); process.exit(1); }
    console.log('   ✅ נכתב.');
  }
  console.log('');

  // ── 2. עסקים ──
  for (const job of BIZ_JOBS) {
    const cur = await getDocFields(token, `businesses/${job.id}`);
    const curTags = cur.tags || [];
    if (sameArr(curTags, job.set.tags)) { console.log(`⏭️  ${job.label} — כבר מתויג נכון (${JSON.stringify(curTags)}), מדולג.`); continue; }
    if (!sameArr(curTags, job.expect.tags)) {
      console.log(`⚠️  ${job.label} — המצב בפועל שונה מהצפוי (בפועל ${JSON.stringify(curTags)}, ציפינו ${JSON.stringify(job.expect.tags)}) — מדולג, לא נדרס.`);
      continue;
    }
    if (job.expect.categoryPrimary && cur.categoryPrimary !== job.expect.categoryPrimary) {
      console.log(`⚠️  ${job.label} — categoryPrimary בפועל "${cur.categoryPrimary}" ולא "${job.expect.categoryPrimary}" — מדולג, לא נדרס.`);
      continue;
    }
    const parts = Object.entries(job.set).map(([k, v]) => `${k}: ${JSON.stringify(cur[k] ?? null)} → ${JSON.stringify(v)}`);
    console.log(`✏️  ${job.label} (${job.id})`);
    for (const p of parts) console.log(`      ${p}`);
    if (!APPLY) continue;

    const fields = {}; for (const [k, v] of Object.entries(job.set)) fields[k] = toFs(v);
    const mask = Object.keys(job.set).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const r = await fetch(`${API}/businesses/${job.id}?${mask}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    });
    if (!r.ok) { console.log('   ❌ נכשל: ' + (await r.text()).slice(0, 400)); continue; }

    // רשומת יומן — כדי שהשינוי יופיע ב"החלטות ויומן" של העסק ולא ישתנה "בשקט"
    const logFields = {
      type: toFs('adminEdit'),
      title: toFs('נערך: ' + Object.keys(job.set).join(', ')),
      detail: toFs('עדכון קטלוג תגיות (2026-08-20) — ' + parts.join(' · ')),
      field: toFs(Object.keys(job.set)[0]),
      before: toFs(cur[Object.keys(job.set)[0]] ?? null),
      after: toFs(Object.values(job.set)[0]),
      actorUid: toFs('Uw1Caau9QFS8Voy2V6ij'),
      actorName: toFs('רמי בנטולילה'),
      source: toFs('admin'),
      createdAt: { timestampValue: new Date().toISOString() },
    };
    const lr = await fetch(`${API}/businesses/${job.id}/activity`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: logFields }),
    });
    console.log(lr.ok ? '   ✅ נכתב (כולל רשומת יומן).' : '   ✅ נכתב, אך רשומת היומן נכשלה: ' + (await lr.text()).slice(0, 200));
  }

  console.log(APPLY ? '\nסיום.' : '\nהרצה יבשה הסתיימה — לא נכתב כלום.');
})();
