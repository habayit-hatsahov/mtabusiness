// ── כמה שורות תייצר קוביית "תמונה לא עלתה" בתקלות? ──────────────────────────────────────
// קריאה בלבד. הרצה: node scratch_measure_missing_proof.js
//
// משכפל **בכוונה** את היגיון-ההכרעה של admin-dashboard.html (PHOTO_ROUTES / fanVerifyMethod /
// ownerAsFan) כדי למדוד לפני שכותבים. אם המספרים כאן גדולים — הקובייה חייבת סינון-תאריך,
// אחרת היא נולדת כרשימה שאי-אפשר לעבוד איתה ומאמנת את העין לדלג עליה.

const fs = require('fs');
const crypto = require('crypto');

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

const s = (f, k) => (f[k] && f[k].stringValue) || '';
const ts = (f, k) => (f[k] && f[k].timestampValue) || '';
const bool = (f, k) => !!(f[k] && f[k].booleanValue);
const len = (f, k) => (f[k] && f[k].arrayValue ? (f[k].arrayValue.values || []).length : 0);

// admin-dashboard.html:2644
const PHOTO_ROUTES = new Set(['passScreenshot', 'purchaseEmail', 'standsPhoto']);
// admin-dashboard.html:2612
const fanVerifyMethod = (f) => f.verifyMethod ? f.verifyMethod : (f.isSubscriber ? (f.subscriberNumber ? 'subNumber' : null) : 'standsPhoto');
// admin-dashboard.html:2629
const ownerRoute = (raw) => s(raw, 'verifyRoute') || (s(raw, 'isSubscriber') === 'yes' ? null : 'standsPhoto');

const month = (iso) => (iso || '').slice(0, 7) || '(ללא תאריך)';
const tally = (rows, keyFn) => {
  const m = {};
  rows.forEach((r) => { const k = keyFn(r); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('  ');
};

(async () => {
  const token = await getToken();
  const H = { Authorization: `Bearer ${token}` };

  const listAll = async (coll) => {
    const out = [];
    let pageToken = '';
    for (;;) {
      const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: H });
      const j = await r.json();
      (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), f: d.fields || {} }));
      if (!j.nextPageToken) break;
      pageToken = j.nextPageToken;
    }
    return out;
  };

  const [biz, fans, proofs] = await Promise.all([listAll('businesses'), listAll('members'), listAll('bizProofs')]);
  const PROOF = {};
  proofs.forEach((p) => { if (s(p.f, 'photoProofUrl')) PROOF[p.id] = s(p.f, 'photoProofUrl'); });
  const bizById = Object.fromEntries(biz.map((b) => [b.id, b]));

  console.log(`נתונים: ${biz.length} עסקים · ${fans.length} חברים · ${proofs.length} מסמכי bizProofs (${Object.keys(PROOF).length} עם כתובת)\n`);

  // ── עסקים: המסלול דורש תמונה ואין ראיה בשום מקום ──────────────────────────────────────
  const bizMissingProof = biz.filter((b) => {
    if (s(b.f, 'status') === 'rejected') return false;
    if (!PHOTO_ROUTES.has(ownerRoute(b.f))) return false;
    return !PROOF[b.id] && !s(b.f, 'photoProofUrl');
  }).map((b) => ({ id: b.id, name: s(b.f, 'name'), at: ts(b.f, 'submittedAt'), status: s(b.f, 'status'), route: ownerRoute(b.f) }));

  console.log(`── עסקים · "המסלול דורש תמונה — אין ראיה": ${bizMissingProof.length} מתוך ${biz.length}`);
  console.log(`   לפי חודש:  ${tally(bizMissingProof, (r) => month(r.at))}`);
  console.log(`   לפי סטטוס: ${tally(bizMissingProof, (r) => r.status)}`);
  console.log(`   לפי מסלול: ${tally(bizMissingProof, (r) => r.route)}`);
  bizMissingProof.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12)
    .forEach((r) => console.log(`     ${String(r.at).slice(0, 10)}  ${r.status.padEnd(9)} ${r.route.padEnd(15)} ${r.name}`));

  // ── עסקים: אפס תמונות בכלל (תמונה מייצגת היא חובה בהרשמה מאז §237) ────────────────────
  const bizNoImages = biz.filter((b) => s(b.f, 'status') !== 'rejected'
    && !s(b.f, 'coverPhoto') && !s(b.f, 'logo') && len(b.f, 'photos') === 0)
    .map((b) => ({ id: b.id, name: s(b.f, 'name'), at: ts(b.f, 'submittedAt'), status: s(b.f, 'status') }));

  console.log(`\n── עסקים · "אפס תמונות בכלל": ${bizNoImages.length} מתוך ${biz.length}`);
  console.log(`   לפי חודש:  ${tally(bizNoImages, (r) => month(r.at))}`);
  console.log(`   לפי סטטוס: ${tally(bizNoImages, (r) => r.status)}`);
  bizNoImages.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12)
    .forEach((r) => console.log(`     ${String(r.at).slice(0, 10)}  ${r.status.padEnd(9)} ${r.name}`));

  // ── אוהדים: המסלול דורש תמונה ואין ─────────────────────────────────────────────────────
  // ⚠️ נפילה-לאחור לראיה של העסק המקושר — §361. בלעדיה **כל בעל-עסק** נספר כאן בטעות.
  const fanMissing = fans.filter((m) => {
    if (s(m.f, 'status') === 'rejected') return false;
    const route = fanVerifyMethod({
      verifyMethod: s(m.f, 'verifyMethod'),
      isSubscriber: bool(m.f, 'isSubscriber') || s(m.f, 'isSubscriber') === 'yes',
      subscriberNumber: s(m.f, 'subscriberNumber'),
    });
    if (!PHOTO_ROUTES.has(route)) return false;
    if (s(m.f, 'photoProofUrl')) return false;
    const lb = s(m.f, 'linkedBusinessId');
    if (lb && (PROOF[lb] || (bizById[lb] && s(bizById[lb].f, 'photoProofUrl')))) return false;
    return true;
  }).map((m) => ({
    id: m.id, name: (s(m.f, 'firstName') + ' ' + s(m.f, 'lastName')).trim() || s(m.f, 'name'),
    at: ts(m.f, 'registeredAt') || ts(m.f, 'createdAt'), status: s(m.f, 'status'),
    owner: bool(m.f, 'isBusinessOwner'),
  }));

  console.log(`\n── אוהדים · "המסלול דורש תמונה — לא הועלתה": ${fanMissing.length} מתוך ${fans.length}`);
  console.log(`   לפי חודש:  ${tally(fanMissing, (r) => month(r.at))}`);
  console.log(`   לפי סטטוס: ${tally(fanMissing, (r) => r.status)}`);
  console.log(`   מתוכם בעלי-עסק: ${fanMissing.filter((r) => r.owner).length}`);
  fanMissing.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12)
    .forEach((r) => console.log(`     ${String(r.at).slice(0, 10)}  ${r.status.padEnd(9)}${r.owner ? ' בעל-עסק' : '        '} ${r.name}`));

  console.log(`\n🔑 סה"כ שורות שהקובייה הייתה מציגה היום: ${bizMissingProof.length + bizNoImages.length + fanMissing.length}`);
})().catch((e) => { console.error('נכשל:', e.message); process.exit(1); });
