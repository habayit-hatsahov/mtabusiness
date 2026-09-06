// ── מצב המדיה של העסקים האחרונים שנרשמו ────────────────────────────────────────────────
// קריאה בלבד, לא כותב כלום. הרצה: node scratch_check_new_biz_media.js [כמה]
//
// עונה על שלוש שאלות שאי-אפשר לענות עליהן מקריאה ציבורית (עסק pending אינו קריא לאורח):
//   1. מה בפועל שמור על מסמך העסק — logo/coverPhoto/photos, ודגלי mediaUploadFailed.
//   2. האם ראיית-האימות הגיעה — bizProofs/{bizId} (§382 העביר אותה לשם ממסמך העסק).
//   3. האם היה בכלל טוקן להעלות איתו — bizTokens/{bizId}. בלעדיו /upload-biz-media מחזיר
//      invalid_token ו**אינו** כותב שום דגל-כשל, כלומר "אין דגל" אינו "לא היה כשל".
// בנוסף: אירועי formError עם ערוץ bm:* (כשל שלב-המדיה בצד הלקוח, §294/§381).

const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json';
const KEY = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
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
  : JSON.stringify(v).slice(0, 100);

const arr = (v) => v && v.arrayValue ? (v.arrayValue.values || []) : [];

(async () => {
  const n = Number(process.argv[2] || 6);
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

  // ⚠️ השדה הוא submittedAt — לעסקים אין createdAt (נבדק מול מסמך אמיתי, לא מהזיכרון).
  const rows = await q({ structuredQuery: {
    from: [{ collectionId: 'businesses' }],
    orderBy: [{ field: { fieldPath: 'submittedAt' }, direction: 'DESCENDING' }],
    limit: n,
  } });

  for (const row of rows) {
    const f = row.document.fields || {};
    const id = row.document.name.split('/').pop();
    const photos = arr(f.photos);
    const failed = arr(f.mediaUploadFailed).map((v) => v.stringValue);

    console.log(`\n${'='.repeat(78)}`);
    console.log(`${S(f.name)}   [${id}]`);
    console.log(`  status=${S(f.status)}  submitted=${S(f.submittedAt)}  approved=${S(f.approvedAt)}`);
    console.log(`  בעלים: ${S(f.ownerFirst)} ${S(f.ownerLast)} | ${S(f.ownerPhone)} | ${S(f.ownerEmail)}`);
    console.log(`  ownerMemberId=${S(f.ownerMemberId)}  ownerVerificationStatus=${S(f.ownerVerificationStatus)}  isSubscriber=${S(f.isSubscriber)}  subNum=${S(f.subNum)}`);
    console.log(`  --- מדיה ---`);
    console.log(`  logo=${S(f.logo) ? '✅' : '❌'}  coverPhoto=${S(f.coverPhoto) ? '✅' : '❌'}  coverPhotoThumb=${S(f.coverPhotoThumb) ? '✅' : '❌'}  photos=${photos.length}`);
    console.log(`  photoProofUrl(ישן, על המסמך הציבורי)=${S(f.photoProofUrl) ? '⚠️ קיים' : '(ריק — תקין מאז §382)'}`);
    console.log(`  mediaUploadFailed=${failed.length ? JSON.stringify(failed) : '(אין דגל כשל)'}  at=${S(f.mediaUploadFailedAt)}`);

    const p = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/bizProofs/${id}`, { headers: H });
    if (p.status === 200) {
      const pf = (await p.json()).fields || {};
      console.log(`  bizProofs/${id}: ✅ photoProofUrl=${S(pf.photoProofUrl) ? 'קיים' : '⚠️ ריק'}  at=${S(pf.at)}`);
    } else {
      console.log(`  bizProofs/${id}: ❌ לא קיים (HTTP ${p.status}) — ראיית האימות מעולם לא נכתבה`);
    }

    const t = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/bizTokens/${id}`, { headers: H });
    console.log(`  bizTokens/${id}: ${t.status === 200 ? '✅ קיים' : `❌ חסר (HTTP ${t.status}) — בלי טוקן /upload-biz-media מחזיר invalid_token ואינו רושם דגל כשל`}`);

    const w = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/businesses/${id}/writeErrors?pageSize=20`, { headers: H });
    const wj = await w.json();
    console.log(`  writeErrors: ${(wj.documents || []).length}`);
    for (const d of (wj.documents || [])) {
      console.log(`     - ${JSON.stringify(Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, String(S(v)).slice(0, 160)])))}`);
    }

    // אירועי כשל של שלב-המדיה בצד הלקוח (channel = bm:proof:… / bm:rest:…, ר' business.html)
    try {
      const ev = await q({ structuredQuery: {
        from: [{ collectionId: 'events' }],
        where: { fieldFilter: { field: { fieldPath: 'bizId' }, op: 'EQUAL', value: { stringValue: id } } },
        limit: 30,
      } });
      const rel = ev.map((x) => x.document.fields || {}).filter((g) => S(g.type) === 'formError');
      console.log(`  אירועי formError על העסק: ${rel.length}`);
      for (const g of rel) console.log(`     - channel=${S(g.channel)}  at=${S(g.createdAt)}`);
    } catch (e) { console.log(`  אירועים: שאילתה נכשלה — ${e.message.slice(0, 120)}`); }

    const om = S(f.ownerMemberId);
    if (om) {
      const m = await fetch(`https://firestore.googleapis.com/v1/${DOCS}/members/${om}`, { headers: H });
      if (m.status === 200) {
        const mf = (await m.json()).fields || {};
        console.log(`  --- רשומת החבר של הבעלים (members/${om}) ---`);
        for (const k of ['status', 'verifyMethod', 'photoProofUrl', 'isBusinessOwner', 'linkedBusinessId', 'subNum'].filter((k) => mf[k] !== undefined)) {
          console.log(`     ${k} = ${String(S(mf[k])).slice(0, 120)}`);
        }
      } else console.log(`  members/${om}: ❌ HTTP ${m.status}`);
    } else {
      console.log(`  ⚠️ אין ownerMemberId — הבעלים לא קושר לרשומת חבר`);
    }
  }
})().catch((e) => { console.error('נכשל:', e.message); process.exit(1); });
