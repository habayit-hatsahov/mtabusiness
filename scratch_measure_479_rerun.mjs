// §479 הרצה חוזרת — קריאה בלבד. הרשמות מ-24.9: submitPath, ומייל האישור: מצב {login} ("בלי קוד" מול קוד).
import fs from 'fs';
import crypto from 'crypto';
import { loginModeFor } from './mail-format.js';

const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const API = `https://firestore.googleapis.com/v1/projects/${KEY.project_id}/databases/(default)/documents`;
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
async function listAll(token, coll) {
  const out = []; let pageToken = '';
  do {
    const j = await (await fetch(`${API}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (j.error) throw new Error(j.error.message);
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), f: d.fields || {} });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
const S = (f, k) => f[k]?.stringValue ?? f[k]?.timestampValue ?? f[k]?.integerValue ?? (f[k]?.booleanValue !== undefined ? String(f[k].booleanValue) : '');
const SINCE = '2026-09-24';

const token = await getToken();
const members = await listAll(token, 'members');
console.log('members total:', members.length, '| pending:', members.filter(m => S(m.f, 'status') === 'pending').length);

const worker = members.filter(m => S(m.f, 'submitPath') === 'worker');
console.log('\nsubmitPath==worker:', worker.length, worker.map(m => m.id).join(', '));

const recent = members.filter(m => S(m.f, 'submittedAt') >= SINCE || S(m.f, 'approvedAt') >= SINCE || S(m.f, 'loginCodeEmailSentAt') >= SINCE);
console.log(`\nactivity since ${SINCE}:`, recent.length);
for (const m of recent.sort((a, b) => S(a.f, 'submittedAt').localeCompare(S(b.f, 'submittedAt')))) {
  const f = m.f;
  const email = S(f, 'email');
  const mode = loginModeFor({ email, googleEmail: S(f, 'googleEmail'), appleSub: S(f, 'appleSub') });
  console.log([
    '#' + S(f, 'memberNumber'), m.id, S(f, 'status'),
    'sub=' + S(f, 'submittedAt').slice(0, 16), 'appr=' + S(f, 'approvedAt').slice(0, 16),
    'path=' + (S(f, 'submitPath') || '-'),
    'mail=' + (S(f, 'loginCodeEmailStatus') || '-') + '/' + (S(f, 'loginCodeEmailKind') || '-') + '@' + S(f, 'loginCodeEmailSentAt').slice(0, 16),
    'deliv=' + (S(f, 'loginCodeEmailDelivery') || S(f, 'emailDeliveryStatus') || '-'),
    'mode=' + mode,
    'domain=' + email.split('@')[1], 'google=' + (S(f, 'googleEmail') ? 'Y' : '-'), 'apple=' + (S(f, 'appleSub') ? 'Y' : '-'),
  ].join(' | '));
}

// הרשמות בדרך — אירועי formSubmit/formError מ-24.9 (שליחות שלא הגיעו ל-members)
const ev = await (await fetch(`${API}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: 'events' }],
  where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: SINCE + 'T00:00:00Z' } } },
  limit: 10000,
} }) })).json();
const evs = ev.filter(r => r.document).map(r => r.document.fields);
console.log('\nevents since', SINCE, ':', evs.length, ev[0]?.error ? JSON.stringify(ev[0].error) : '');
const count = {};
for (const e of evs) { const t = S(e, 'type'); if (/^form|submit|stuck/i.test(t)) count[t] = (count[t] || 0) + 1; }
console.log('form events:', count);
for (const e of evs.filter(e => /formError|formSubmit/.test(S(e, 'type')))) console.log('  ', S(e, 'createdAt').slice(0, 16), S(e, 'type'), S(e, 'channel'), S(e, 'blockId') + ' ' + S(e, 'sessionId') + ' ' + S(e, 'memberId') || '');
