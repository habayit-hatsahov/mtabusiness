// ── "מיזוג אוויר ומנעולנים" → "חשמל, מיזוג אוויר ומנעולנים" + תיוג איציק דנה חשמלאי ──────────
// ר' docs/PROJECT_CONTEXT.md §233. הרצה: node scratch_fix_electrician_tag.js         (יבשה)
//                                        node scratch_fix_electrician_tag.js --apply  (כותב)
//
// למה שינוי-שם ולא תגית חדשה: לא רצינו תגית שתשרת עסק בודד. התגית הזו היא כבר "הטכנאי שמגיע
// אליך הביתה" (מנעולן + מיזוג), וחשמלאי יושב בה טבעי. שני העסקים הקיימים בה ממשיכים להתאים.
//
// מאמת את המצב הקיים לפני כל כתיבה ומדלג על מה שכבר תוקן — הרצה חוזרת בטוחה.

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const APPLY = process.argv.includes('--apply');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const OLD_TAG = 'מיזוג אוויר ומנעולנים';
const NEW_TAG = 'חשמל, מיזוג אוויר ומנעולנים';
// המצב החדש המלא של home — מסונכרן לקטלוג החי, לא לרשימה הקשיחה המיושנת שבקוד
const HOME_TAGS = ['בנייה ושיפוצים', 'נגרות וריהוט', 'עבודת גינון והדברה', 'ניקיון ואחזקה',
                   NEW_TAG, 'חנות חיות', 'נדל״ן — קבלנים ויזמים'];

const ELECTRICIAN = {
  id: 'msLNjkk8q0DH23vuWoCK', label: 'איציק דנה חשמלאי מוסמך',
  expect: { categoryPrimary: 'pro', tags: [] },
  set: { categoryPrimary: 'home', cat: 'home', tags: [NEW_TAG] },
};

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
function fromFs(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  if ('timestampValue' in v) return v.timestampValue;
  if ('doubleValue' in v) return v.doubleValue;
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
const sameArr = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

(async () => {
  const token = await getToken();
  console.log(APPLY ? '── מצב כתיבה (--apply) ──\n' : '── הרצה יבשה — לא נכתב כלום. להרצה אמיתית: --apply ──\n');

  const allBiz = await listAllBiz(token);
  const tax = await getDocFields(token, 'settings/tagTaxonomy');

  // ── 1. הקטלוג ──
  console.log('settings/tagTaxonomy.home:');
  console.log(`   לפני: ${JSON.stringify(tax.home)}`);
  console.log(`   אחרי: ${JSON.stringify(HOME_TAGS)}`);
  if (sameArr(tax.home, HOME_TAGS)) console.log('   ⏭️  כבר מעודכן.');
  else if (APPLY) { await patch(token, 'settings/tagTaxonomy', { home: HOME_TAGS }); console.log('   ✅ נכתב.'); }

  // ── 2. עסקים שמחזיקים את התגית הישנה (כולל שדות ההצעה) ──
  const holders = allBiz.filter(b => (b.tags || []).includes(OLD_TAG) || b.tagSuggestion === OLD_TAG || b.tagSecondSuggestion === OLD_TAG);
  console.log(`\n${holders.length} עסקים מחזיקים את "${OLD_TAG}":`);
  for (const b of holders) {
    const upd = {};
    if ((b.tags || []).includes(OLD_TAG)) upd.tags = b.tags.map(t => t === OLD_TAG ? NEW_TAG : t);
    if (b.tagSuggestion === OLD_TAG) upd.tagSuggestion = NEW_TAG;
    if (b.tagSecondSuggestion === OLD_TAG) upd.tagSecondSuggestion = NEW_TAG;
    console.log(`   ✏️  ${b.name}: ${JSON.stringify(b.tags)} → ${JSON.stringify(upd.tags || b.tags)}`);
    if (!APPLY) continue;
    await patch(token, `businesses/${b.id}`, upd);
    await logActivity(token, b.id, {
      type: 'adminEdit', field: 'tags', title: 'נערך: תגיות',
      detail: `שינוי שם תגית: "${OLD_TAG}" → "${NEW_TAG}"`,
      before: b.tags || [], after: upd.tags || b.tags || [],
    });
    console.log('      ✅ נכתב.');
  }

  // ── 3. החשמלאי ──
  const e = await getDocFields(token, `businesses/${ELECTRICIAN.id}`);
  console.log(`\n${ELECTRICIAN.label}:`);
  if (sameArr(e.tags, ELECTRICIAN.set.tags) && e.categoryPrimary === ELECTRICIAN.set.categoryPrimary) {
    console.log('   ⏭️  כבר מתויג נכון.');
  } else if (!sameArr(e.tags, ELECTRICIAN.expect.tags) || e.categoryPrimary !== ELECTRICIAN.expect.categoryPrimary) {
    console.log(`   ⚠️  המצב בפועל שונה מהצפוי (cat=${JSON.stringify(e.categoryPrimary)}, tags=${JSON.stringify(e.tags)}) — מדולג, לא נדרס.`);
  } else {
    for (const [k, v] of Object.entries(ELECTRICIAN.set)) console.log(`   ✏️  ${k}: ${JSON.stringify(e[k] ?? null)} → ${JSON.stringify(v)}`);
    if (APPLY) {
      await patch(token, `businesses/${ELECTRICIAN.id}`, ELECTRICIAN.set);
      await logActivity(token, ELECTRICIAN.id, {
        type: 'adminEdit', field: 'categoryPrimary', title: 'נערך: קטגוריה ראשית, תגיות',
        detail: `קטגוריה ראשית: "pro" (מפתח ישן) → "home" · תגיות: "—" → "${NEW_TAG}"`,
        before: 'pro', after: 'home',
      });
      console.log('   ✅ נכתב (כולל רשומת יומן).');
    }
  }

  console.log(APPLY ? '\nסיום.' : '\nהרצה יבשה הסתיימה — לא נכתב כלום.');
})();
