// ══ §516 — לינק תצוגה לאורח ═══════════════════════════════════════════════════════════════
// אורח (משקיע/עיתונאי/שותף) מסייר באתר האמיתי בלי להיות חבר ובלי הטבות.
// הלינק: demo.html?t=<token>. ה-token הוא מזהה המסמך ב-demoLinks (אקראי, 24 תווים) – נוצר ע"י
// מנהל במרכז הניהול, ו-firestore.rules מתירות לקרוא את האוסף למנהל בלבד.
//
// נתיב אחד, שני מצבים:
//   • mint (ברירת מחדל) – כניסה מהלינק: מאמת, רושם מכשיר, ומחזיר custom token עם uid=demo_… ו-role:'demo'.
//   • ping:true – בכל טעינת דף (demo-mode.js): האם הלינק עדיין תקף. כך כיבוי/תפוגה מנתקים גם
//     את מי שכבר בפנים (הסשן של Firebase עצמו מתחדש לבד ולא יודע על הלינק).
//
// 🔑 תשובה אחת לכל כשל ('invalid') – לא מסגירים למי שקיבל לינק מועבר אם הוא פג, כובה או נחסם
//    בגלל מכשיר עודף. הסיבה נרשמת על המסמך למנהל.
// 🔑 החוקים חוסמים כל כתיבה של role:'demo' (isDemo() ב-firestore.rules) – הנעילה בממשק היא UX בלבד.
import { getGoogleAccessToken, mintFirebaseCustomToken } from './jwt.js';
import { firestoreGetDoc, firestorePatch } from './firestore.js';

const TOKEN_RE = /^[A-Za-z0-9]{20,40}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const FAIL_LIMIT = 20;            // ניחושי טוקן לכל IP
const FAIL_WINDOW_SEC = 15 * 60;

export function demoUidFor(token) {
  return 'demo_' + token.slice(0, 12);
}

export async function handleDemoSession(input, ip, env) {
  const { t, deviceId, ping } = (input && typeof input === 'object') ? input : {};
  if (typeof t !== 'string' || !TOKEN_RE.test(t) || typeof deviceId !== 'string' || !DEVICE_RE.test(deviceId)) {
    return { error: 'invalid' };
  }
  const kv = env.RATE_LIMIT_KV;
  const failKey = `attempts:demo-ip:${ip || 'unknown'}`;
  const fails = parseInt((await kv.get(failKey)) || '0', 10);
  if (fails >= FAIL_LIMIT) return { error: 'too_many_attempts' };
  const fail = async () => {
    await kv.put(failKey, String(fails + 1), { expirationTtl: FAIL_WINDOW_SEC });
    return { error: 'invalid' };
  };

  const accessToken = await getGoogleAccessToken(env);
  const path = `demoLinks/${t}`;
  const d = await firestoreGetDoc(env, accessToken, path);
  if (!d) return fail();
  const f = d.fields;
  const now = new Date();
  const exp = Date.parse(f.expiresAt || '');
  if (f.revoked === true || !exp || exp <= now.getTime()) return { error: 'invalid' };

  const devices = Array.isArray(f.devices) ? f.devices : [];
  const max = Number.isInteger(f.maxDevices) && f.maxDevices > 0 ? f.maxDevices : 2;
  const known = devices.includes(deviceId);
  if (!known && devices.length >= max) {
    // מכשיר עודף – כנראה שהלינק הועבר הלאה. נרשם למנהל, והאורח מקבל את אותה תשובה כמו לינק שפג.
    await firestorePatch(env, accessToken, path, {
      blockedAt: now, blockedCount: (Number(f.blockedCount) || 0) + 1,
    });
    return { error: 'invalid' };
  }

  const firstName = String(f.guestName || '').trim().slice(0, 40);
  if (ping) {
    // מכשיר שלא נרשם בכניסה לא "מתקבל" ב-ping – רק דרך הכניסה מהלינק.
    if (!known) return { error: 'invalid' };
    await firestorePatch(env, accessToken, path, { views: (Number(f.views) || 0) + 1, lastSeenAt: now });
    return { ok: true, name: firstName, expiresAt: f.expiresAt };
  }

  await firestorePatch(env, accessToken, path, {
    ...(known ? {} : { devices: [...devices, deviceId] }),
    entries: (Number(f.entries) || 0) + 1,
    lastSeenAt: now,
    ...(f.firstSeenAt ? {} : { firstSeenAt: now }),
  });
  const customToken = await mintFirebaseCustomToken(env, { uid: demoUidFor(t), claims: { role: 'demo' } });
  return { customToken, name: firstName, expiresAt: f.expiresAt };
}
