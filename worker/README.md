# הבית הצהוב — Worker (Cloudflare)

מנפיק Firebase custom tokens לחברים ולבעלי עסקים (אחרי אימות מול Firestore בצד-שרת), ושולח מיילי קוד כניסה דרך Brevo (cron כל דקה).

## הקמה (חד-פעמי, פעולות שרק אתה יכול לבצע)

1. **התקנת תלויות** (מתוך תיקיית `worker/`):
   ```
   npm install
   ```

2. **התחברות ל-Cloudflare** (פותח דפדפן להתחברות/הרשמה):
   ```
   npx wrangler login
   ```

3. **יצירת KV namespace** (ל-rate-limit ולקאשינג טוקן Google):
   ```
   npx wrangler kv namespace create RATE_LIMIT_KV
   ```
   הפקודה תחזיר `id` — יש להעתיק אותו לתוך `wrangler.toml`, במקום `REPLACE_WITH_REAL_KV_NAMESPACE_ID`.

4. **הורדת Service Account JSON מ-Firebase:**
   Firebase Console → ⚙️ Project Settings → Service Accounts → "Generate new private key" → מוריד קובץ JSON.
   **אל תשלח לי את התוכן של הקובץ הזה בצ'אט** — זה מפתח סודי לכל הפרויקט. הפקודה בשלב הבא תבקש להדביק אותו ישירות בטרמינל שלך, בלי שהוא עובר בשום מקום אחר.

5. **הזנת הסודות** (כל פקודה תבקש להדביק ערך; לא נשמר בקוד/git):
   ```
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
   ```
   (הדבק את **כל** תוכן קובץ ה-JSON שהורדת בשלב 4)
   ```
   npx wrangler secret put BREVO_API_KEY
   ```
   (מפתח ה-API מ-Brevo — Settings → SMTP & API → API Keys)
   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   (מפתח ה-API מ-console.anthropic.com — **בשימוש פעיל היום**. **אל תשלח לי אותו בצ'אט**, בדיוק כמו שאר הסודות למעלה — הדבק ישירות בטרמינל)

   **אופציונלי, לעתיד:** אם/כש-`src/gemini.js` יופעל (ר' `docs/PROJECT_CONTEXT.md` — ממתין לפרויקט Google Cloud עם מכסת פרויקטים פנויה), יידרש גם:
   ```
   npx wrangler secret put GEMINI_API_KEY
   ```
   (מ-aistudio.google.com/apikey — כבר מוגדר היום, אך לא בשימוש כרגע)

   **חדש (2026-07-23) — נדרש לפני שאפשר להריץ את ה-backfill למטה:**
   ```
   npx wrangler secret put ADMIN_BACKFILL_SECRET
   ```
   (ערך לבחירתך — סוד שרירותי, לא קשור לחשבון Firebase/Google; משמש רק כדי ש-`/backfill-thumbnails` לא יהיה פתוח לכל האינטרנט. שמור אותו בצד — תצטרך אותו בכל קריאה ל-endpoint)

   **גם: יש להפעיל את המוצר "Cloudflare Images" בחשבון Cloudflare** (Dashboard → Images) — נדרש כדי ש-binding ה-`[images]` ב-`wrangler.toml` יעבוד בפריסה. זה לא קשור לזהות ה-DNS/proxy של הדומיין yellowzone.co.il.

6. **פריסה:**
   ```
   npm run deploy
   ```
   הפקודה תדפיס כתובת מהצורה `https://habayit-hatsahov-worker.<your-subdomain>.workers.dev` — זו הכתובת שצריך להזין בקוד הלקוח (login.html/business-dashboard.html) בשלב הבא.

## בדיקה מהירה (curl) — לפני שנוגעים בקוד האתר

```
curl -X POST https://<worker-url>/mint-member-token \
  -H "Content-Type: application/json" \
  -d '{"phone":"0501234567","code":"123456"}'
```
תשובה תקינה: `{"customToken":"..."}` (טוקן ארוך). תשובת שגיאה: `{"error":"invalid_credentials"}` וכו'.

```
curl -X POST https://<worker-url>/mint-biz-token \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"<uuid-אמיתי-של-עסק>"}'
```

## Backfill thumbnails לעסקים ישנים (חד-פעמי)

משלים `coverPhotoThumb`/`logoThumb` לכל עסק approved שחסר לו — ר' `docs/PROJECT_CONTEXT.md` סעיף 12 להסבר המלא. מריצים **פעם אחת** אחרי הפריסה (לא cron, לא רץ לבד):

```
curl -X POST https://<worker-url>/backfill-thumbnails \
  -H "x-admin-secret: <הערך שהזנת ב-ADMIN_BACKFILL_SECRET>"
```

תשובה: `{"total":..,"updated":..,"skipped":..,"errors":[...]}`. אם `errors` לא ריק — אפשר להריץ שוב (רק העסקים שעדיין חסרים thumb יעובדו, לא כפילות).

## פיתוח מקומי

```
npm run dev
```
מריץ את ה-Worker לוקאלית (`wrangler dev`) — שימושי לבדיקות לפני `deploy`.
