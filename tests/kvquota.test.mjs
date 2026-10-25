import worker from '../worker/src/index.js';
import { getGoogleAccessToken } from '../worker/src/jwt.js';
import { overIpQuota, recordAttempt } from '../worker/src/ratelimit.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };
const boom = { get: async () => { throw new Error('KV get() limit exceeded'); }, put: async () => { throw new Error('KV put() limit exceeded for the day.'); }, delete: async () => { throw new Error('x'); } };
const env = { RATE_LIMIT_KV: boom, ALLOWED_ORIGINS: 'https://yellowzone.co.il' };
const r = await worker.fetch(new Request('https://w/x', { method: 'OPTIONS', headers: { Origin: 'https://yellowzone.co.il' } }), env, { waitUntil() {} });
ok(r.status < 500, 'OPTIONS עובד');
ok(env.RATE_LIMIT_KV !== boom, 'env.RATE_LIMIT_KV נעטף');
const w1 = env.RATE_LIMIT_KV; worker.fetch(new Request('https://w/x', { method: 'OPTIONS' }), env, { waitUntil() {} }); ok(env.RATE_LIMIT_KV === w1, 'לא נעטף פעמיים');
let threw = false; try { ok(await overIpQuota(env.RATE_LIMIT_KV, 'checkmember', '1.2.3.4', 30, 900) === false, 'overIpQuota לא חוסם כשה-KV נופל'); await recordAttempt(env.RATE_LIMIT_KV, '0501234567', '1.2.3.4'); } catch (e) { threw = true; } ok(!threw, 'ratelimit לא זורק');
// getGoogleAccessToken: הכתיבה למטמון נופלת אחרי fetch מוצלח
const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
const { generateKeyPair, exportPKCS8 } = await import('../worker/node_modules/jose/dist/node/esm/index.js');
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ private_key: await exportPKCS8(privateKey), client_email: 'a@b' });
env.FIREBASE_SA_PRIVATE_KEY = await exportPKCS8(privateKey); env.FIREBASE_SA_CLIENT_EMAIL = 'a@b'; env.FIREBASE_CLIENT_EMAIL='a@b'; env.FIREBASE_PRIVATE_KEY=env.FIREBASE_SA_PRIVATE_KEY;
let tok = null, err = null; try { tok = await getGoogleAccessToken(env); } catch (e) { err = String(e); }
ok(tok === 'tok', 'getGoogleAccessToken מחזיר טוקן גם כשהמטמון נופל ' + (err || ''));
globalThis.fetch = realFetch;
// בלי העטיפה – מוכיח שהבדיקה תופסת
let raw = false; try { await overIpQuota(boom, 'x', 'ip', 3, 60); } catch { raw = true; } ok(raw, 'בקרה: בלי העטיפה זה זורק');
process.exit(fail ? 1 : 0);
