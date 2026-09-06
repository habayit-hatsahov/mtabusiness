// §423 — בדיקות "כניסה עם Apple", צד השרת.
//
// 🔑 **מריץ את הקוד האמיתי**: `verifyAppleIdToken` נטענת מ-`worker/src/apple.js` עצמו,
// ו-`jose` היא אותה ספרייה שתרוץ בפרודקשן. הטוקנים נחתמים במפתח אמיתי שנוצר כאן,
// ו-`fetch` מסונן כדי להגיש את ה-JWKS המתאים לו — כלומר נתיב האימות רץ במלואו, כולל
// בחירת מפתח לפי `kid`. בדיקה שהייתה מחקה את הפונקציה הייתה מאשרת את המוק בלבד.
// ר' [[feedback_verification_must_run_the_producer]].
//
// ⚠️ **הרצה חייבת להיות עם `--conditions=workerd`:**
//
//     node --conditions=workerd scratch_test_apple_login.mjs
//
// 🐛 נתפס בהרצה, ולא בקריאה. ל-`jose` שתי גרסאות-בנייה נפרדות: זו של Node מביאה את
// ה-JWKS דרך `node:https`, וזו של הדפדפן/workerd דרך `fetch` הגלובלי. Cloudflare
// Workers טוענת את השנייה (תנאי `worker`/`workerd` ב-package.json של jose) — כלומר
// הרצה רגילה של Node הייתה בודקת **נתיב קוד אחר מזה שרץ בפרודקשן**, ומסנן ה-fetch
// כאן לא היה נקרא כלל. הדגל מיישר את הבדיקה לקוד האמיתי.
// ר' [[feedback_verification_must_run_the_producer]].

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from './worker/node_modules/jose/dist/browser/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
async function throws(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

const ISS = 'https://appleid.apple.com';
const JWKS_URL = 'https://appleid.apple.com/auth/keys';
const SERVICES_ID = 'il.co.yellowzone.web';   // המסלול של האתר
const BUNDLE_ID = 'il.co.yellowzone.app';     // המסלול של האפליקציה

// ── מפתח אמיתי + JWKS שמוגש דרך fetch ────────────────────────────────────────────────
const good = await generateKeyPair('RS256');
const evil = await generateKeyPair('RS256');          // חותם "מזויף" — לא ב-JWKS
const goodJwk = { ...(await exportJWK(good.publicKey)), kid: 'yz-test-1', alg: 'RS256', use: 'sig' };

let jwksHits = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url);
  if (u === JWKS_URL) {
    jwksHits++;
    return new Response(JSON.stringify({ keys: [goodJwk] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error('unexpected_network_call: ' + u);
};

async function makeToken(claims = {}, opts = {}) {
  const key = opts.key || good.privateKey;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'apple-sub-001', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid || 'yz-test-1' })
    .setIssuer(opts.iss || ISS)
    .setAudience(opts.aud || SERVICES_ID)
    .setIssuedAt(now)
    .setExpirationTime(opts.exp || now + 600)
    .sign(key);
}

const { verifyAppleIdToken } = await import(
  pathToFileURL(path.join(__dirname, 'worker', 'src', 'apple.js')).href
);

const ENV = { APPLE_CLIENT_IDS: SERVICES_ID + ',' + BUNDLE_ID };

console.log('\n== אימות תקין ==');
{
  const t = await makeToken({ email: 'fan@example.com', email_verified: true });
  const r = await verifyAppleIdToken(ENV, t);
  check('טוקן תקין עובר', r.sub === 'apple-sub-001', JSON.stringify(r));
  check('מייל מוחזר בלואר-קייס', r.email === 'fan@example.com');
  check('emailVerified אמיתי', r.emailVerified === true);
  check('לא סומן כממסר', r.isPrivateRelay === false);
  check('ה-JWKS נשלף מהרשת', jwksHits >= 1, 'hits=' + jwksHits);
}

console.log('\n== 🔑 שני הקהלים — האתר והאפליקציה ==');
{
  const web = await verifyAppleIdToken(ENV, await makeToken({}, { aud: SERVICES_ID }));
  check('טוקן של האתר (Services ID) מתקבל', web.sub === 'apple-sub-001');
  const app = await verifyAppleIdToken(ENV, await makeToken({}, { aud: BUNDLE_ID }));
  check('טוקן של האפליקציה (Bundle ID) מתקבל', app.sub === 'apple-sub-001');
  // 🔴 הבדיקה שמצדיקה את הרשימה: בדיקה מול ערך יחיד הייתה מפילה את אחד המסלולים בשקט.
  const only = { APPLE_CLIENT_IDS: SERVICES_ID };
  const e = await throws(async () => verifyAppleIdToken(only, await makeToken({}, { aud: BUNDLE_ID })));
  check('קהל שאינו ברשימה נדחה', !!e, 'לא נזרקה שגיאה');
}

console.log('\n== דחיות ==');
{
  const e1 = await throws(async () => verifyAppleIdToken(ENV, await makeToken({}, { aud: 'com.someone.else' })));
  check('aud של אפליקציה אחרת נדחה', !!e1);

  const e2 = await throws(async () => verifyAppleIdToken(ENV, await makeToken({}, { iss: 'https://evil.example.com' })));
  check('issuer שאינו אפל נדחה', !!e2);

  const now = Math.floor(Date.now() / 1000);
  const e3 = await throws(async () => verifyAppleIdToken(ENV, await makeToken({}, { exp: now - 60 })));
  check('טוקן שפג נדחה', !!e3);

  // חתום במפתח שאינו ב-JWKS — הבדיקה החשובה ביותר בקובץ.
  const e4 = await throws(async () => verifyAppleIdToken(ENV, await makeToken({}, { key: evil.privateKey })));
  check('🔴 חתימה במפתח זר נדחית', !!e4);

  const e5 = await throws(async () => verifyAppleIdToken(ENV, 'not-a-jwt'));
  check('מחרוזת שאינה JWT נדחית', !!e5);

  const e6 = await throws(async () => verifyAppleIdToken(ENV, ''));
  check('טוקן ריק נדחה', !!e6);

  const e7 = await throws(async () => verifyAppleIdToken({}, await makeToken()));
  check('🔴 בלי APPLE_CLIENT_IDS — זורק ולא "עובר בלי לבדוק"', !!e7,
        'זו ההגנה היחידה מפני טוקן של אפליקציה אחרת');
  check('   ...והשגיאה מסבירה מה חסר', /apple_client_ids_not_configured/.test(String(e7 && e7.message)),
        String(e7 && e7.message));
}

console.log('\n== 🔴 הסתר את המייל שלי ==');
{
  const relay = await verifyAppleIdToken(ENV, await makeToken({
    email: 'abc123@privaterelay.appleid.com', email_verified: true,
  }));
  check('כתובת ממסר מזוהה לפי הדומיין', relay.isPrivateRelay === true);
  check('   ...ואינה נחשבת מאומתת', relay.emailVerified === false,
        'שער הקישור נשען על זה — ממסר אינו ראיה לשליטה בתיבה');

  const flagged = await verifyAppleIdToken(ENV, await makeToken({
    email: 'looks-real@example.com', email_verified: true, is_private_email: true,
  }));
  check('כתובת ממסר מזוהה גם לפי הדגל בלבד', flagged.isPrivateRelay === true,
        'is_private_email הוא ההצהרה הרשמית; הדומיין הוא הגיבוי');
  check('   ...וגם היא אינה מאומתת', flagged.emailVerified === false);
}

console.log('\n== בוליאני כמחרוזת (המלכודת של גוגל, שוב) ==');
{
  const s = await verifyAppleIdToken(ENV, await makeToken({
    email: 'fan@example.com', email_verified: 'true',
  }));
  check("email_verified='true' כמחרוזת מזוהה", s.emailVerified === true,
        'השוואה ל-true בוליאני בלבד הייתה מחזירה "לא מאומת" לכולם');

  const f = await verifyAppleIdToken(ENV, await makeToken({
    email: 'fan@example.com', email_verified: 'false',
  }));
  check("email_verified='false' אינו נחשב מאומת", f.emailVerified === false);

  const p = await verifyAppleIdToken(ENV, await makeToken({
    email: 'x@example.com', email_verified: true, is_private_email: 'true',
  }));
  check("is_private_email='true' כמחרוזת מזוהה", p.isPrivateRelay === true);
}

console.log('\n== חיווט ב-index.js ==');
{
  // הערות מוסרות תחילה — מחרוזת שמוזכרת בהערה "עוברת" אחרת בלי שהקוד עושה זאת.
  const raw = fs.readFileSync(path.join(__dirname, 'worker', 'src', 'index.js'), 'utf8');
  const code = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  ['/apple-login', '/apple-link', '/apple-attach'].forEach((p) => {
    check('נתיב רשום: ' + p, code.includes("url.pathname === '" + p + "'"));
  });
  check('verifyAppleIdToken מיובאת', code.includes("from './apple.js'"));
  check('השאילתה לפי appleSub', code.includes("'members', 'appleSub'"));
  check('הקישור כותב appleSub', code.includes('appleSub: a.sub'));

  // 🔑 סדר השערים — בדיקה אמיתית ולא נוכחות מחרוזת.
  const attach = code.slice(code.indexOf('async function handleAppleAttach'));
  const iRelay = attach.indexOf('isPrivateRelay');
  const iVerified = attach.indexOf('emailVerified');
  const iMismatch = attach.indexOf('email_mismatch');
  check('🔴 בדיקת הממסר קודמת לבדיקה הכללית', iRelay > -1 && iRelay < iVerified,
        'relay@' + iRelay + ' verified@' + iVerified);
  check('🔴 ...וגם קודמת להשוואת המיילים', iRelay > -1 && iRelay < iMismatch,
        'אחרת ממסר היה מקבל email_mismatch — הודעה ששולחת לחפש טעות שאינה קיימת');
  check('קוד שגיאה נפרד לממסר', attach.includes("'apple_private_email'"));

  // הנתיב החזק חייב **לא** לחסום ממסר.
  const link = code.slice(code.indexOf('async function handleAppleLink'),
                          code.indexOf('async function handleAppleAttach'));
  check('🔑 הנתיב המחובר אינו חוסם ממסר', !link.includes('isPrivateRelay'),
        'הזהות שם מוכחת בטוקן החבר, לא במייל');
  check('הנתיב המחובר דורש טוקן חבר', link.includes('uidFromIdToken'));

  // §423 — הפרמטר שנוסף ל-linkableByVerifiedEmail חייב להיות מועבר בשני הצדדים.
  check('גוגל מעבירה googleSub במפורש', code.includes("linkableByVerifiedEmail(env, accessToken, g, 'googleSub')"));
  check('אפל מעבירה appleSub במפורש', code.includes("linkableByVerifiedEmail(env, accessToken, a, 'appleSub')"));
  check('🔴 אין ברירת-מחדל לשדה — חסר זורק', code.includes('linkable_sub_field_required'));
}

globalThis.fetch = realFetch;
console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + '/' + (pass + fail) + ' עברו');
process.exit(fail === 0 ? 0 : 1);
