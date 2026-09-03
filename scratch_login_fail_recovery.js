// ── האם מי שנכשל בכניסה נכנס בסוף? ────────────────────────────────────────────────────
// קריאה בלבד. לכל אירוע loginFail — האם באותו sessionId נרשם מאוחר יותר אירוע כלשהו עם
// memberId (כלומר הדף כבר ידע מי הוא = הוא בפנים), וכמה זמן אחרי.
// ⚠️ sessionId נשמר ב-sessionStorage ולכן שורד ניווט באותו טאב, אך לא סגירת טאב.
//    "לא נכנס באותו סשן" אינו "לא נכנס לעולם" — הוא "לא נכנס בלי לפתוח דף מחדש".
// הרצה: node scratch_login_fail_recovery.js [ימים]
const fs = require('fs');
const crypto = require('crypto');
const DAYS = Number(process.argv[2] || 30);
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
// שאילתה מדפדפת לפי createdAt — startAfter על הערך האחרון, בלי cursor tokens.
async function queryEvents(token, sinceIso) {
  const out = [];
  let cursor = sinceIso;
  for (;;) {
    const body = { structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN', value: { timestampValue: cursor } } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
      limit: 1000,
    }};
    const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const docs = (Array.isArray(j) ? j : []).filter(x => x.document).map(x => x.document);
    if (!docs.length) break;
    for (const d of docs) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    cursor = docs[docs.length - 1].fields.createdAt.timestampValue;
    if (docs.length < 1000) break;
  }
  return out;
}
const S = (f, k) => f[k]?.stringValue || '';
const T = (f) => f.createdAt?.timestampValue ? new Date(f.createdAt.timestampValue).getTime() : 0;

(async () => {
  const token = await getToken();
  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  const evs = await queryEvents(token, since);
  console.log(`אירועים ב-${DAYS} הימים האחרונים: ${evs.length}`);

  // אינדקס: סשן → כל האירועים שלו, ממוינים בזמן
  const bySess = new Map();
  for (const e of evs) {
    const s = S(e.f, 'sessionId'); if (!s) continue;
    (bySess.get(s) || bySess.set(s, []).get(s)).push(e);
  }
  for (const arr of bySess.values()) arr.sort((a, b) => T(a.f) - T(b.f));

  const fails = evs.filter(e => S(e.f, 'type') === 'loginFail').sort((a, b) => T(a.f) - T(b.f));
  console.log(`loginFail: ${fails.length}\n`);

  const agg = {};
  const rows = [];
  for (const f of fails) {
    const ch = S(f.f, 'channel') || 'unknown';
    const t = T(f.f);
    const sess = bySess.get(S(f.f, 'sessionId')) || [];
    // "נכנס" = אירוע מאוחר יותר באותו סשן שנושא memberId
    const win = sess.filter(e => T(e.f) > t && S(e.f, 'memberId'));
    const got = win[0] || null;
    // ניסיון נוסף שנכשל אחרי הכשל הזה, באותו סשן
    const retryFail = sess.find(e => T(e.f) > t && S(e.f, 'type') === 'loginFail');
    const a = agg[ch] || (agg[ch] = { n: 0, ok: 0, retry: 0, secs: [] });
    a.n++;
    if (got) { a.ok++; a.secs.push((T(got.f) - t) / 1000); }
    if (retryFail) a.retry++;
    rows.push({ ch, when: new Date(t).toISOString().slice(0, 16).replace('T', ' '),
      dev: S(f.f, 'device'), phone: S(f.f, 'phone'), env: S(f.f, 'blockId'),
      got: got ? Math.round((T(got.f) - t) / 1000) + 's → ' + S(got.f, 'memberId').slice(0, 10) : '—',
      sess: S(f.f, 'sessionId').slice(0, 16) });
  }

  console.log('── לפי ערוץ: כמה נכשלו, וכמה מהם נכנסו בכל זאת באותו סשן ──────────────');
  for (const [ch, a] of Object.entries(agg).sort((x, y) => y[1].n - x[1].n)) {
    const med = a.secs.length ? a.secs.slice().sort((p, q) => p - q)[Math.floor(a.secs.length / 2)] : null;
    console.log(`${ch.padEnd(24)} n=${String(a.n).padStart(3)}  נכנסו=${String(a.ok).padStart(3)} (${(a.ok / a.n * 100).toFixed(0)}%)  ניסו שוב ונכשלו=${a.retry}${med != null ? `  חציון עד כניסה: ${Math.round(med)}s` : ''}`);
  }

  console.log('\n── 40 האחרונים ────────────────────────────────────────────────────────');
  for (const r of rows.slice(-40).reverse())
    console.log(`${r.when}  ${r.ch.padEnd(22)} ${(r.dev || '').padEnd(8)} ${(r.phone || '·').padEnd(11)} ${r.got.padEnd(22)} ${r.env}`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
