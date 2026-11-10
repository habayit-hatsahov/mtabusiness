# iOS 1.0.2 (Build 5) – "לידי" בחיפוש: הרשאת מיקום

**מה חדש בגרסה:** הרשאת מיקום לכפתור "לידי" בחיפוש (מציג קודם את העסקים הקרובים). בלי הגרסה הזו "לידי" לא מופיע באפליקציה.
מה השתנה בקוד: `Info.plist` (מפתח `NSLocationWhenInUseUsageDescription`), גרסה `1.0.2` / Build `5`, וסימון `YZGeo/1` ב-`capacitor.config.json`.
באנדרואיד הגרסה המקבילה (1.4) כבר נשלחה לבדיקה של גוגל (10.11).

---

## 1. עדכון הקוד ופתיחה ב-Xcode (טרמינל)

```bash
cd ~/Documents/GitHub/mtabusiness && git pull && cd app && npm install && npx cap sync ios && npx cap open ios
```

⚠️ **`npx cap sync ios` חובה.** הקובץ `ios/App/App/capacitor.config.json` לא נמצא ב-git – הוא נוצר מהפקודה הזו. בלעדיה הסימון `YZGeo/1` לא ייכנס לגרסה, והאתר לא יציג את "לידי" גם בגרסה החדשה.

## 2. בדיקה לפני הבנייה (דקה אחת)

בטרמינל, מתוך `app`:

```bash
grep -c "YZGeo/1" ios/App/App/capacitor.config.json
```

אמור להדפיס **2**. אם יוצא 0 – להריץ שוב `npx cap sync ios`.

ב-Xcode ← הפרויקט **App** ← Target **App**:
- **General**: Version = **1.0.2**, Build = **5**
- **Info**: יש שורה **Privacy - Location When In Use Usage Description** עם הטקסט "Yellow Zone משתמשת במיקום רק כשלוחצים 'לידי' בחיפוש…"

## 3. בנייה והעלאה

1. למעלה בבחירת המכשיר: **Any iOS Device (arm64)**
2. **Product → Archive**
3. בחלון Organizer: **Distribute App → App Store Connect → Upload**
4. אם קופץ "Install Required" / Components אחרי עדכון Xcode – לאשר (רק iOS). זה לא התקנה מחדש.

## 4. App Store Connect

1. **Apps → Yellow Zone → "+" ליד iOS App → גרסה 1.0.2**
2. **What's New** (מה חדש):
   > חדש: חיפוש חי, מפת עסקים ו"לידי" – העסקים הקרובים אליכם קודם.
3. **Build**: לבחור את **5** (מופיע 15–30 דקות אחרי ההעלאה, כשהעיבוד מסתיים)
4. **App Privacy → Edit** (בתפריט הצד, לא בדף הגרסה):
   - להוסיף **Location → Coarse Location** (מיקום משוער)
   - Purposes: **App Functionality** + **Analytics**
   - Linked to the user's identity: **Yes**
   - Used for tracking: **No**
   - **Precise Location – לא לסמן**: הקואורדינטות לא נשמרות אצלנו, ואפל לא סופרת עיבוד זמני כאיסוף. ב-Play הוא סומן כ"זמני", וגוגל לא מציגים אותו למשתמשים.
   - **Publish** את השינוי בפרטיות
5. **Add for Review → Submit**

## 5. בדיקה (אם יש TestFlight לפני ההגשה)

חיפוש (הזכוכית) ← **"לידי"** מופיע בשורת הקיצורים ← לחיצה ← iOS שואל על מיקום עם הטקסט בעברית ← "אפשר בזמן השימוש" ← מופיע "📍 מצאנו אותך ב…" והעסקים הקרובים ראשונים.

---

שאלות → רמי. פירוט טכני: `docs/PROJECT_CONTEXT.md` §762ה.
