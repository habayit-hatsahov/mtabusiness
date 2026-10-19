// §556 — בדיקה של storedl.js בלי רשת: fetch מדומה שמחזיר תשובות בפורמט של אפל (JSON + TSV מכווץ) ושל גוגל
// (CSV ב-UTF-16 עם BOM, אותן עמודות כמו בקובץ האמיתי של §554). הרצה: node --conditions=workerd test/storedl.test.mjs
import { gzipSync } from 'node:zlib';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { fetchAppleByDate, fetchGoogleByDate } from '../src/storedl.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fails++; };

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const today = new Date().toISOString().slice(0, 10);
const d1 = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
const d2 = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

const TSV = ['Date\tApp Name\tApp Apple Identifier\tDownload Type\tApp Version\tDevice\tPlatform Version\tSource Type\tSource Info\tCampaign\tPage Type\tPage Title\tPre-Order\tTerritory\tCounts',
  `${d1}\tYellow Zone\t6815345699\tFirst-time download\t1.0\tiPhone\tiOS 18\tWeb referrer\t\tig\t\t\t\tIL\t3`,
  `${d1}\tYellow Zone\t6815345699\tFirst-time download\t1.0\tiPad\tiOS 18\tWeb referrer\t\tig\t\t\t\tIL\t1`,
  `${d1}\tYellow Zone\t6815345699\tRedownload\t1.0\tiPhone\tiOS 18\tWeb referrer\t\tig\t\t\t\tIL\t9`,
  `${d2}\tYellow Zone\t6815345699\tFirst-time download\t1.0\tiPhone\tiOS 18\tApp Store search\t\t\t\t\t\tIL\t5`,
  `${d2}\tYellow Zone\t6815345699\tFirst-time download\t1.0\tiPhone\tiOS 18\tWeb referrer\t\twa\t\t\t\tIL\t2`].join('\n');
const CSV = '﻿Date,Package name,Traffic source,Search term,UTM source,UTM campaign,Store listing acquisitions,Store listing visitors,Store listing conversion rate\n'
  + `${d1},il.co.yellowzone.app,Third-party referrals,Other,fb,fb,4,6,0.66\n`
  + `${d1},il.co.yellowzone.app,Google Play search,"yellow, zone",Other,Other,2,3,0.66\n`
  + `${d2},il.co.yellowzone.app,Third-party referrals,Other,Other,Other,1,1,1.0\n`;
const utf16 = (s) => { const b = Buffer.from(s.replace(/^﻿/, ''), 'utf16le'); return Buffer.concat([Buffer.from([0xff, 0xfe]), b]); };

let jwtSeen = null;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.startsWith('https://api.appstoreconnect.apple.com')) jwtSeen = (opt.headers || {}).Authorization;
  const J = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (url.includes('/analyticsReportRequests/REQ/reports')) return J({ data: [{ id: 'R1', attributes: { name: 'App Downloads Standard' } }, { id: 'R2', attributes: { name: 'App Downloads Detailed' } }] });
  if (url.includes('/analyticsReports/R2/instances')) return J({ data: [{ id: 'I1', attributes: { processingDate: d2 } }, { id: 'I0', attributes: { processingDate: '2020-01-01' } }] });
  if (url.includes('/analyticsReportInstances/I1/segments')) return J({ data: [{ attributes: { url: 'https://seg.example/1' } }] });
  if (url.includes('/analyticsReportInstances/I0/')) throw new Error('old instance should be skipped');
  if (url === 'https://seg.example/1') return new Response(gzipSync(Buffer.from(TSV)), { status: 200 });
  if (url.includes('storage.googleapis.com')) {
    const ym = today.slice(0, 7).replace('-', '');
    return url.includes('_' + ym + '_') ? new Response(utf16(CSV), { status: 200 }) : new Response('nope', { status: 404 });
  }
  return new Response('unexpected ' + url, { status: 500 });
};

const env = { ASC_API_KEY_P8: pem, ASC_KEY_ID: 'K1', ASC_ISSUER_ID: 'ISS', ASC_REPORT_REQUEST_ID: 'REQ', PLAY_REPORTS_BUCKET: 'B', PLAY_PACKAGE: 'il.co.yellowzone.app' };

const a = await fetchAppleByDate(env);
ok(a.byDate[d1] && a.byDate[d1].ig === 4, `אפל: ${d1} ig = 4 (3 אייפון + 1 אייפד; Redownload לא נספר) → ${JSON.stringify(a.byDate[d1])}`);
ok(a.byDate[d2] && a.byDate[d2].direct === 5 && a.byDate[d2].wa === 2, `אפל: ${d2} direct 5, wa 2 → ${JSON.stringify(a.byDate[d2])}`);
ok(a.instances === 1, 'אפל: מופע ישן מ-2020 דולג');
ok(a.through === d2, 'אפל: through = התאריך האחרון');
// החתימה תקינה (ES256, r||s) – מאמתים מול המפתח הציבורי
const [h, p, s] = jwtSeen.replace('Bearer ', '').split('.');
const v = createVerify('SHA256'); v.update(h + '.' + p);
ok(v.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'אפל: חתימת ה-JWT מאומתת מול המפתח הציבורי');
const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
ok(payload.aud === 'appstoreconnect-v1' && payload.iss === 'ISS' && payload.exp - payload.iat <= 1200, 'אפל: aud / iss / תוקף ≤ 20 דק׳');

const g = await fetchGoogleByDate(env, 'TOKEN');
ok(g.byDate[d1] && g.byDate[d1].fb === 4 && g.byDate[d1].direct === 2, `גוגל: ${d1} fb 4, direct 2 (שדה עם פסיק במרכאות) → ${JSON.stringify(g.byDate[d1])}`);
ok(g.byDate[d2] && g.byDate[d2].hidden === 1, `גוגל: ${d2} hidden 1 (הפניה חיצונית בלי UTM) → ${JSON.stringify(g.byDate[d2])}`);
ok(g.files === 1, 'גוגל: חודש בלי קובץ (404) מדולג');

let threw = '';
try { await fetchAppleByDate({ ...env, ASC_API_KEY_P8: '' }); } catch (e) { threw = e.message; }
ok(threw === 'asc_not_configured', 'אפל: בלי מפתח – שגיאה ברורה, לא קריסה');

console.log(fails ? `\n${fails} נכשלו` : '\nהכל עבר');
process.exit(fails ? 1 : 0);
