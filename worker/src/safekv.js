// ── 25.10 (ערב ההשקה) — KV שלא מפיל את הוורקר ─────────────────────────────────────────────
// RATE_LIMIT_KV משמש רק למונים (ניסיונות כניסה, מכסות IP) ולמטמונים (טוקן גוגל, hashes של bizPublic).
// בתוכנית החינמית של Cloudflare יש תקרה של 1,000 כתיבות ביום (שיא שנמדד: 387, 20.10). מעבר לתקרה
// put() זורק, ובלי הגנה זה הפיל את כל הבקשה – כניסה בקוד, בדיקת כפילות בהרשמה, ואפילו
// getGoogleAccessToken (שכותב את הטוקן למטמון) = כל קריאה ל-Firestore.
// כאן: get שנכשל → null (כאילו אין ערך), put/delete שנכשלו → נבלעים ונרשמים בלוג.
// ⚠️ המחיר: כשה-KV למטה, המונים לא סופרים (fail-open). עדיף על כניסה שנופלת לכולם ביום ההשקה.
const SAFE = Symbol('safeKv');

export function safeKv(kv) {
  if (!kv || kv[SAFE]) return kv;
  return {
    [SAFE]: true,
    async get(key, opts) {
      try { return await kv.get(key, opts); }
      catch (e) { console.error('kv get failed', key, String(e)); return null; }
    },
    async put(key, value, opts) {
      try { return await kv.put(key, value, opts); }
      catch (e) { console.error('kv put failed', key, String(e)); }
    },
    async delete(key) {
      try { return await kv.delete(key); }
      catch (e) { console.error('kv delete failed', key, String(e)); }
    },
    list: (opts) => kv.list(opts),
  };
}

// עוטף פעם אחת לכל אובייקט env (ה-env משותף בין בקשות באותו isolate).
export function wrapEnvKv(env) {
  if (env && env.RATE_LIMIT_KV && !env.RATE_LIMIT_KV[SAFE]) env.RATE_LIMIT_KV = safeKv(env.RATE_LIMIT_KV);
  return env;
}
