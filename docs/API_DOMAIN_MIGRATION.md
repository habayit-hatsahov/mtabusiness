# מעבר ה-API לכתובת משלנו — `api.yellowzone.co.il`

> נכתב 2026-09-01 (§359). **מסמך הרצה** — לא תיאור. כל שלב כאן נועד להתבצע לפי הסדר.
> הרקע המלא: `docs/PROJECT_CONTEXT.md` §359.

---

## 1. למה

אוהד מאושר (שחר קאשי, 0526624053) לא הצליח להיכנס בחמישה ניסיונות ב-1.9. הוורקר עצמו
נמדד באותן דקות ב-0.6–0.9 שנ', **ואירועי ה-`loginFail` שלו עצמם נכתבו ל-Firestore בהצלחה** —
כלומר האינטרנט שלו תקין לגמרי. פתיחה ידנית של הכתובת הישירה מהטלפון שלו החזירה
**"לא ניתן לגשת לאתר הזה"**.

**המסקנה:** הסיומת הגנרית `*.workers.dev` מסוננת אצלו (סינון-תוכן סלולרי / הגנת-דפדפן).
הדומיין שלנו `yellowzone.co.il` נגיש, ולכן API על תת-דומיין שלו עוקף את החסימה לגמרי.

⚠️ **מה זה לא פותר:** אם התקלה אצל אוהד מסוים היא נתיב-רשת שבור אל Cloudflare (ולא סינון
לפי שם), הכתובת החדשה יושבת על אותם שרתים ולא תעזור לו. זו הסיבה ששלב 6 משאיר את
`workers.dev` כרשת-גיבוי ולא מוחק אותו.

---

## 2. גיבוי DNS — הרשומות הקיימות, כפי שנקראו ב-1.9.2026

**זו רשת-הביטחון של כל המהלך.** מעבר שרתי-שמות מעביר את *כל* הרשומות, ורשומה שנשכחת
מפילה שירות אחר לגמרי. ⚠️ שלוש מהן הן **מייל** — אובדן שלהן שובר את מיילי הקוד לאוהדים
ואת תיבת הדואר של הדומיין.

| סוג | שם | ערך | למה זה קיים |
|---|---|---|---|
| NS | `yellowzone.co.il` | `ns1.sitesdepot.com`, `ns2.sitesdepot.com` | **זה מה שמשתנה** |
| A | `yellowzone.co.il` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` | GitHub Pages — האתר עצמו |
| CNAME | `www` | `yellowzone.co.il` | |
| MX | `yellowzone.co.il` | `mail.yellowzone.co.il` (עדיפות 50) | 📧 תיבת הדואר |
| A | `mail` | `80.244.162.32` | 📧 שרת הדואר עצמו |
| TXT | `yellowzone.co.il` | `v=spf1 include:spf.brevo.com mx ~all` | 📧 SPF — בלעדיו מיילי הקוד נופלים לספאם |
| TXT | `yellowzone.co.il` | `brevo-code:5f6e40b5b40d770fe178d73173774ac9` | 📧 אימות Brevo |
| TXT | `yellowzone.co.il` | `google-site-verification=wmR1jm7kXdH81O_EgwJyV1Jsa27h0myM-gQEiWxKpkA` | |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | 📧 DMARC |
| CNAME | `brevo1._domainkey` | `b1.yellowzone-co-il.dkim.brevo.com` | 📧 DKIM |
| CNAME | `brevo2._domainkey` | `b2.yellowzone-co-il.dkim.brevo.com` | 📧 DKIM |

---

## 3. השלבים (לפי הסדר — אין לדלג)

### שלב 1 — הוספת הדומיין ל-Cloudflare
בחשבון ה-Cloudflare שבו כבר יושב הוורקר: **Add a site** → `yellowzone.co.il` → תוכנית **Free**.

### שלב 2 — ⚠️ אימות הסריקה מול הטבלה שלמעלה
Cloudflare סורק את הרשומות הקיימות ומייבא אותן. **הסריקה לא תמיד מלאה.**
לעבור רשומה-רשומה מול הטבלה בסעיף 2 ולהשלים ידנית כל מה שחסר — **במיוחד את חמש
רשומות המייל (MX, A של `mail`, SPF, DMARC, שני ה-DKIM).**

**ענן אפור (DNS only) לרשומות האלה:**
- `mail` — ⚠️ **חובה.** ענן כתום על רשומת דואר שובר SMTP.
- `yellowzone.co.il` ו-`www` — מומלץ אפור בשלב הזה. GitHub Pages מנפיק תעודת HTTPS משלו,
  וענן כתום מוסיף שכבת-TLS שנייה שדורשת הגדרת SSL mode נכונה. **אפור = שום דבר לא משתנה
  באתר עצמו**, וזה בדיוק מה שאנחנו רוצים במהלך הזה.

### שלב 3 — החלפת שרתי-השמות אצל הרשם
בממשק של **sitesdepot** להחליף את `ns1/ns2.sitesdepot.com` בשני השרתים ש-Cloudflare נותן.
ההפעלה לוקחת בין דקות לכמה שעות.

⏱️ **לעשות בשעה שקטה** (ערב/סוף-שבוע), לא באמצע יום עם תנועה.

### שלב 4 — בדיקה אחרי ההפעלה, **לפני** שנוגעים בקוד
```bash
nslookup yellowzone.co.il 8.8.8.8
```
```bash
nslookup -type=MX yellowzone.co.il 8.8.8.8
```
```bash
nslookup -type=TXT yellowzone.co.il 8.8.8.8
```
האתר חייב לעלות כרגיל, **ובדיקת מייל אמיתית אחת** ("שליחה חוזרת" של קוד כניסה לעצמך)
חייבת להגיע לתיבה. ⚠️ אם המייל לא הגיע — לעצור כאן ולתקן DNS. שלב 5 לא מתקן מייל.

### שלב 5 — חיבור הוורקר לכתובת החדשה
Cloudflare → Workers & Pages → `habayit-hatsahov-worker` → Settings → Domains & Routes →
**Add → Custom Domain** → `api.yellowzone.co.il`. התעודה מונפקת אוטומטית.

בדיקה:
```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://api.yellowzone.co.il/
```
תשובה תקינה = `404` (זה ה-`not_found` של הוורקר — כלומר הוא ענה).

### שלב 6 — הקוד: הכתובת החדשה **בתוספת** גיבוי, לא במקום
⚠️ **לא להחליף מחרוזת אחת בכל הקבצים.** אם `api.yellowzone.co.il` ייפול, החלפה מלאה נועלת
את **כל** האוהדים בחוץ — כלומר החלפנו תקלה של אדם אחד בתקלה של כולם. הצורה הנכונה:
כתובת ראשית `api.yellowzone.co.il`, ונפילה-לאחור ל-`workers.dev` על כשל-רשת בלבד.

**עשרה מקומות, בשבעה קבצים חיים ובשלושה דמו** (`grep -rn "workers.dev" --include=*.html`):

| קובץ | מה |
|---|---|
| `welcome.html` | `WORKER_URL` + `<link rel="preconnect">` |
| `fan-register.html` | `WORKER_URL` + `<link rel="preconnect">` |
| `profile.html` | `WORKER_URL` |
| `business.html` | `WORKER_URL` |
| `business-dashboard.html` | `WORKER_URL` |
| `admin-businesses.html` | `WORKER_URL` |
| `admin-dashboard.html` | `WORKER_URL` |
| `benefit-ai-demo.html`, `demo-redesign-business.html`, `demo-redesign-landing.html` | דמו — להשלים כדי שלא ייסחפו |

`ALLOWED_ORIGIN` בוורקר **לא משתנה** — הוא מתאר מאיפה הדפדפן פונה (`yellowzone.co.il`),
ולא לאן.

### שלב 7 — `CACHE_NAME` ב-`sw.js`
באמפ חובה, כמו בכל שינוי HTML. בלעדיו מכשיר על רשת איטית ימשיך לקבל את הגרסה הישנה
עם הכתובת הישנה — כלומר בדיוק האוהדים החסומים לא יקבלו את התיקון (§352).

---

## 4. מה מודדים אחרי

בקובייה **"תקלות כניסה"** במרכז הניהול: שורה עם `🔴 כשל-רשת רצוף מס' 2` ומעלה (§359) היא
אוהד שבאמת נשאר בחוץ. **אם המהלך הצליח — התווית הזאת מפסיקה להופיע.**

לחזור לשחר קאשי (`shaharkashi3@walla.com`, 0526624053) ולבקש שינסה שוב — הוא מקרה-הבוחן
היחיד שיש לנו שבו ידוע בוודאות שהכתובת הישנה חסומה.
