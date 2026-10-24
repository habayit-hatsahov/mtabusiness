/* weekly-render.js – §539 דמו: הקרוסלה בדף הבית (הטבה בלעדית · האוהד שמאחורי העסק · מי אנחנו ·
   איך מממשים · לבעלי עסקים · הזמינו חברים).
   מקור אחד לעיצוב ולתוכן: דמו דף הבית (weekly-demo.html) מרנדר מכאן, ודמו הניהול
   (weekly-admin-demo.html) מרנדר מכאן את התצוגה המקדימה – כדי שמה שעורכים שם ייראה בול כמו כאן.
   בדמו התוכן נשמר במכשיר בלבד (localStorage, wkDemoData); בבנייה – אוסף ציבורי נפרד (דפוס bizPublic). */
(function () {
  'use strict';
  var KEY = 'wkDemoData30';
  var STORAGE = 'https://firebasestorage.googleapis.com/v0/b/habayit-hatsahov.firebasestorage.app/o/';
  var IMG = {
    patrix: STORAGE + 'businesses%2FPSp6yTsBMgJv2u6H6u7f%2FcoverPhoto_1788329641575?alt=media&token=c4e8f62c-8bfc-4130-9f8e-e3384478950c',
    chompy: STORAGE + 'businesses%2Fa1QIIkYOZBGdWKpLTkKe%2Flogo_1787466418285_thumb?alt=media&token=869d67b7-fe6d-44c8-b299-8faf901f796f',
    casual: STORAGE + 'businesses%2F20rLIqD5Pym3Tt3h3kXZ%2FlogoThumb_1791410240041.webp?alt=media&token=9cfff386-e684-496e-a476-f569c3166177'
  };
  // עסקים שמוכרים לדמו (שם → מזהה/תמונה), כדי שבחירה בשם בדמו הניהול תפתח את הכרטיס האמיתי
  var KNOWN = {
    'פטריקס פארק רחובות': { id: 'PSp6yTsBMgJv2u6H6u7f', cover: IMG.patrix },
    "צ'ומפי": { id: 'a1QIIkYOZBGdWKpLTkKe', logo: IMG.chompy, area: 'ירושלים · רחובות' },
    'Casual tattoo': { id: '20rLIqD5Pym3Tt3h3kXZ', logo: IMG.casual, area: 'רחובות' },
    'אולטראס טאטו': { id: 'AmOjD8WcCP3Zw5SvdDHh' },
    'Kind tattoo shop': { id: 'VLGLZPgme3rNgsG72z57', logo: STORAGE + 'bizUploads%2F183513db-16b1-4bf5-830b-34364f4c10ba%2Flogo_ffcf5294-0ad1-418a-8aed-efd545607fe6?alt=media&token=e95678c8-e145-485f-b985-7315fcc6b6b4' },
    'לארט אופנועים - LS2': { id: 'Tk69An2mwkpNMSjZYVEa' }
  };

  // ── שלושה כיווני נוסח ל"מי אנחנו" (§539 סבב 6; נכתבו מחדש 24.10 לפי הנקודות של רמי: למה קם,
  //    הערך לקהילה, לאוהד, לעסק, בחינם, מה יש בפנים). שורות שמתחילות ב-"• " מוצגות כרשימה.
  var US_DIRS = {
    // א – הכיוון שרמי בחר (24.10), מחובר עם ב: הציטוט, "למה זה חשוב", ההיכרות והבמה
    // (רמי, 24.10) "אוהדים קונים מאוהדים" ביחד בשורה האחרונה – ירידת שורה אחרי המקף
    a: { slideLine: 'קונים כחול צהוב –\nאוהדים קונים מאוהדים', heroTag: 'אוהד שקונה מאוהד – מקבל יותר', quote: 'ביציע אנחנו עומדים כתף אל כתף. כאן זה ממשיך גם ביום-יום.', sections: [
      { h: 'איך זה התחיל', p: 'מחוויות אישיות: שוב ושוב עבדנו עם בעלי מקצוע שהם אוהדי מכבי – ותמיד קיבלנו קצת יותר. הנחה בלי שביקשנו, שירות מעל המצופה וחוויה טובה. Yellow Zone קמה כדי שכל אוהד ייהנה מזה.' },
      { h: 'למה זה חשוב', p: 'כל קנייה אצל אוהד מחזקת עוד משפחה מהיציע. ככה בונים קהילה – לא רק ב-90 דקות.' },
      { h: 'מה זה נותן לכם', p: '• הטבה אמיתית כמעט אצל כל עסק\n• בעל עסק שמבין אתכם מהמשפט הראשון\n• היכרות עם האנשים שמאחורי העסקים\n• כסף שנשאר בתוך המשפחה הצהובה' },
      { h: 'ולבעלי העסקים', p: '• לקוחות שכיף לעבוד איתם – ושחוזרים\n• חיבורים עם בעלי מקצוע אוהדים\n• הזדמנויות עסקיות מתוך הקהילה\n• במה בראש דף הבית – פעמיים בחודש' },
      { h: 'מה קורה כאן', p: '• מעל 100 עסקים של אוהדים, כל אחד באישור הצוות\n• פעמיים בחודש – הטבה בלעדית חדשה\n• פעמיים בחודש – מכירים את האוהד שמאחורי העסק' },
      // (רמי, 24.10) "ההרשמה סגורה – רק לצהובים, ועוברים אימות"
      { h: 'הרשמה סגורה', p: 'רק לצהובים: כל אוהד וכל עסק עוברים אימות לפני שהם בפנים.' },
      { h: 'כמה זה עולה?', p: 'כלום. בחינם לאוהדים ולעסקים – בלי אותיות קטנות.' }
    ] },
    b: { slideLine: 'כשאוהדים קונים מאוהדים – כולנו מרוויחים', heroTag: 'הקהילה הצהובה, גם מחוץ למגרש', quote: 'ביציע אנחנו עומדים כתף אל כתף. כאן זה ממשיך גם ביום-יום.', sections: [
      { h: 'למה זה חשוב', p: 'כל קנייה אצל אוהד מחזקת עוד משפחה מהיציע. ככה בונים קהילה – לא רק ב-90 דקות. והכול התחיל מחוויות שלנו: אצל בעלי מקצוע אוהדי מכבי תמיד קיבלנו קצת יותר.' },
      { h: 'לאוהד', p: '• הטבות אצל עסקים של אוהדים\n• שירות של "אחד משלנו"\n• היכרות עם האנשים שמאחורי העסקים' },
      { h: 'לעסק', p: '• לקוחות מהקהילה, שכיף לעבוד איתם\n• חיבורים עם בעלי מקצוע כמוך\n• במה: פעמיים בחודש עסק אחר בראש דף הבית' },
      { h: 'מה מחכה לכם בפנים', p: '• מעל 100 עסקים של אוהדים\n• הטבה בלעדית שמתחלפת כל חצי חודש\n• "האוהד שמאחורי העסק" – 2 סיפורים בחודש' },
      { h: 'ובחינם', p: 'לאוהדים ולעסקים. בלי אותיות קטנות.' }
    ] },
    c: { slideLine: 'עסקים של אוהדים. הטבות לאוהדים. בחינם.', heroTag: 'עסקים של אוהדים. הטבות לאוהדים. בחינם.', sections: [
      { h: 'בשורה אחת', p: 'גילינו שוב ושוב שאצל בעל מקצוע שהוא אוהד מכבי מקבלים יותר – הנחה, יחס, חוויה. אז ריכזנו את כולם במקום אחד.' },
      { h: 'אוהד מקבל', p: '• הטבות אצל מעל 100 עסקים\n• הטבה בלעדית חדשה כל חצי חודש\n• עסק שמדבר את השפה שלו' },
      { h: 'עסק מקבל', p: '• לקוחות שכיף לעבוד איתם\n• חיבורים והזדמנויות עסקיות בקהילה\n• במה בראש דף הבית – פעמיים בחודש' },
      { h: 'כמה זה עולה?', p: 'כלום. בחינם לאוהדים ולעסקים.' }
    ] }
  };

  function DEFAULTS() {
    return {
      ben: {
        // (רמי, 24.10) בינתיים רק "בקרוב" – null = מציגים את ההטבה עצמה
        // הלוגיקה (רמי, 24.10): 2 הטבות בחודש – אחת עולה ב-1 ואחת ב-16, וכל אחת בתוקף חצי חודש
        soon: { tag: 'בקרוב', kicker: 'הטבות בלעדיות לזמן מוגבל', title: '2 הטבות בלעדיות בכל חודש',
          // (רמי, 24.10) "יותר מדי תוכן על הכרטיס" – קוצר
          line: 'ב-1 וב-16 – הטבה חדשה לחצי חודש' },
        badge: 'הטבה בלעדית משתנה', tag2: 'מבצע השקה',
        slideTitle: 'קעקוע של מכבי במחיר מוזל',
        hint: '{n} מקעקעים מאזורים שונים',   // רמז בתיבה במקום השמות; {n} = מספר המקומות (רמי, 24.10) – דמו: להשוואה בין חלופות לתיבה
        explainTitle: 'הטבה בלעדית שמתחלפת כל חצי חודש',
        explain: 'ב-1 וב-16 בכל חודש – הטבה בלעדית חדשה, רק לחברי Yellow Zone ורק לזמן מוגבל.',
        title: 'קעקוע של מכבי',
        intro: 'קעקוע של מכבי במחיר מיוחד לחברי Yellow Zone – לזמן מוגבל.',
        prices: [{ size: '6 ס"מ', price: '400 ₪', was: '' }, { size: '12 ס"מ', price: '800 ₪', was: '' }],
        after: 'רוצים להוסיף כיתוב, דמות או סקיצה? 20% הנחה על התוספת.',
        whereTitle: 'איפה מממשים', bizNoun: 'מקעקעים',
        howTo: 'בוחרים את הקרוב אליכם ולוחצים על הכרטיס שלו כדי לפנות אליו.',
        // (רמי, 24.10) בחוץ: "+ הנחה על תוספות" אחרי הגדלים, "לפרטים" ליד החץ, השור עם סמל מכבי על הזרוע.
        // התמונות – הדמיה זמנית (סמל מכבי הודבק על הזרוע של השור); השור המקעקע בפנים – ממתין לתמונה מרמי.
        sizeExtra: '+ הנחה על תוספות', more: 'לפרטים',
        bg: 'images/weekly/emblem-bg.png',   // סמל מכבי כרקע בתיבה, כמו בתפריט הקטגוריות (רמי, 24.10)
        img: '', heroImg: '',   // (רמי, 24.10) השור הורד – בלי תמונה בתיבה ובגיליון
        howTitle: 'איך זה עובד',
        how: '• ההטבה לכל מי שקובע תור לקעקוע אצל אחד המקעקעים, עד {end}\n• את הכול – העיצוב, המועד והתשלום – סוגרים ישירות מול המקעקע\n• לוחצים על הכרטיס של המקעקע ופונים אליו',
        biz: [
          { name: "צ'ומפי", area: 'ירושלים · רחובות' },
          { name: 'Casual tattoo', area: 'רחובות' },
          { name: 'אולטראס טאטו', area: '' },
          { name: 'Kind tattoo shop', area: '' },
          { name: '', area: '' }
        ]
      },
      fan: {
        soon: { tag: 'בקרוב', kicker: 'האוהד שמאחורי העסק', title: 'מהיציע – אל העסק',
          line: 'הסיפור של האוהדים שמאחורי העסקים' },
        biz: 'פטריקס פארק רחובות', owner: 'דורון', fanTag: 'מנוי מכבי ת"א בכדורגל', showFan: true,
        cadence: '2 בחודש · הבא ב-{next}',
        explainTitle: '2 אוהדים עם עסק בכל חודש',
        title: 'מהיציע אל הבר',
        slideLine: 'מהיציע אל הבר – פאב-מסעדה עם ליין אחר בכל ערב',
        text: 'דורון, מנוי של מכבי בכדורגל, מחזיק ברחובות פאב-מסעדה עם ליין אחר בכל ערב.',
        chips: 'פאב · מסעדה, רחובות, א–ה מ-18:00 · ש מ-20:30',
        hasStory: true, quote: '', stand: '', how: '', why: '',
        cadenceNote: 'כל חודש אנחנו מכירים לכם 2 אוהדים שיש להם עסק – אחד ב-1 ואחד ב-16. הכירו את הסיפור, תנו להם לייק, והבא מגיע ב-{next}.'
      },
      usDir: 'a',
      pages: {
        // (רמי, 24.10) עד ההשקה – תיבה אחת במקום שתי תיבות "בקרוב" (ההטבה + האוהד שמאחורי העסק):
        // "פעמיים בחודש" ואז מה עושים, נפתחת להסבר קצר. מוצגת כל עוד ben.soon וגם fan.soon (ר' order).
        launch: {
          theme: 'yellow', badge: 'בקרוב', badgeInline: true, slideTitle: 'פעמיים בחודש',
          slideLine: 'הטבה בלעדית חדשה\nואוהד עם עסק שכדאי להכיר',
          photo: 'images/weekly/bull-drum.jpg', photoBg: '#EFCD50', photoFade: 24, photoH: 285, photoTop: -22, photoLeft: 28,
          heroWho: 'מתחילים בהשקה', heroTitle: 'פעמיים בחודש', heroTag: 'הטבה בלעדית ואוהד עם עסק – רק ב-Yellow Zone',
          sections: [
            { h: 'הטבה בלעדית משתנה', p: '• ב-1 וב-16 בחודש עולה הטבה חדשה\n• רק לחברי Yellow Zone\n• כל הטבה בתוקף חצי חודש – ואז מתחלפת' },
            { h: 'האוהד שמאחורי העסק', p: '• פעמיים בחודש נכיר לכם אוהד עם עסק – אחד ב-1 ואחד ב-16\n• הסיפור שלו, היציע והעסק' },
            { h: 'יש לכם עסק?', p: 'רוצים לתת הטבה בלעדית או להופיע כאוהד שמאחורי העסק? מסמנים עניין בטופס ההרשמה או ב"האזור שלי".' }
          ],
          cta: { label: '', act: '' }
        },
        us: pageFromDir('a'),
        redeem: {
          // למשתמשים ולבעלי עסקים – המדריך מכוון גם את בעל העסק (רמי, 24.10)
          // (רמי, 24.10) השור עם הלפיד בצד שמאל. שולי התמונה בצד הטקסט כחולים (עשן), ולכן התיבה כחולה
          // (slideTheme – גם בראש הגיליון). התווית הוחזרה (רמי), הכיתוב בחוץ קוצר.
          theme: 'soft', slideTheme: 'navy', badge: 'לאוהדים ולעסקים', slideTitle: 'איך מממשים הטבה?', slideLine: 'בחנות, אצל בעל מקצוע\nאו באתר',
          photo: 'images/weekly/bull-flare.jpg', photoBg: '#1A3B80', photoFade: 70, photoH: 330, photoTop: -20, photoLeft: 0,
          heroWho: 'מדריך קצר', heroTitle: 'איך מממשים הטבה', heroTag: '3 צעדים – וההטבה אצלכם', steps: true,
          // (רמי, 24.10) "ממוקד, לפי נקודות, לפי התהליך – קצר, קולע ופשוט, בלי לוותר על פרטים":
          // שלושת המסלולים (חנות / בעל מקצוע / אתר) נכנסו לצעד 2 כנקודות, ומה בודקים – צעד 3
          sections: [
            { h: 'נכנסים לכרטיס העסק', p: 'לוחצים "מימוש ההטבה" – שם מחכים תעודת החבר וקוד הקופון.' },
            { h: 'מממשים לפי איפה שקונים', p: '• בחנות – מציגים בקופה את תעודת החבר\n• בעל מקצוע או נותן שירות – במעמד הרכישה (בפגישה, בטלפון או בוואטסאפ) מציגים את התעודה, או שולחים צילום מסך שלה\n• באתר – מעתיקים את קוד הקופון, לוחצים "לרכישה באתר" ומדביקים את הקוד בהזמנה' },
            { h: 'מה בודקים', p: '• שם העסק מופיע בפס הכחול\n• השעה בתעודה עדכנית – שעון חי\n• לפעמים יבקשו גם תעודה מזהה, כדי לוודא שהשם תואם\n• קוד הקופון מוצג רק לחברים' }
          ],
          // הדוגמה בסוף, לא בין הסעיפים הממוספרים (רמי, סבב 11: "בטלפון לא נראה טוב שבין המספרים יש תמונה")
          exTitle: 'ככה נראית תעודת החבר', exBiz: 'לארט אופנועים - LS2',
          exCap: 'דוגמה: צילום מסך למימוש אצל {biz}. נותן השירות רואה את שם העסק שלו ואת השעה העדכנית בעת הרכישה.',   // {biz} = שם העסק בדוגמה
          // לבעל העסק: המדריך להורדה באזור האישי של העסק – קיים (biz-guides.js → redemption-guide.html, §507)
          bizNote: 'יש לכם עסק ב-Yellow Zone? באזור האישי של העסק מחכה לכם מדריך להורדה – עם שם העסק שלכם ודוגמה איך זה נראה אצלכם. לכם ולצוות.',
          note: 'משהו לא עבד? כתבו לנו ב"האזור שלי" ← "הודעות".',
          cta: { label: '', act: '' }
        },
        forbiz: {
          // (רמי, 24.10) התמונה מדף הנחיתה – האוהדים בבר, האריח שפונה לבעלי עסקים
          // (רמי, 24.10) במקום תמונת הבר – השור בעל המקצוע, על רקע צהוב, כמו שאר השוורים
          photo: 'images/weekly/bull-worker2.jpg', photoBg: '#F2CC45', photoFade: 30, photoH: 350, photoTop: -10, photoLeft: 8,
          // (רמי, 24.10) התווית בחוץ "לא יפה שם" – רק בגיליון (noSlideBadge)
          theme: 'yellow', badge: 'לבעלי עסקים', noSlideBadge: true, slideTitle: 'יש לכם עסק?', slideLine: 'לקוחות, חיבורים והזדמנויות – והרישום בחינם',
          // (רמי) "לבעלי עסקים" הופיע פעמיים בראש הגיליון – נשארת רק התווית
          heroWho: '', heroTitle: 'העסק שלכם ב-Yellow Zone', heroTag: 'אוהדים קונים מאוהדים',
          // הערך לעסק (רמי, 24.10): הזדמנויות עסקיות, חיבורים עם בעלי מקצוע, הלקוחות, רישום בחינם
          sections: [
            { h: 'מה מקבלים', p: '• לקוחות מהקהילה – אוהדים שכיף לעבוד איתם, ושחוזרים\n• חיבורים עם בעלי מקצוע אוהדים כמוך\n• הזדמנויות עסקיות ושיתופי פעולה בתוך הקהילה\n• כרטיס עסק באפליקציה עם תמונות, פרטים וההטבה שלכם' },
            // רמי, 24.10 – סטטיסטיקות ירדו (עוד אין); "המלצות" = טיפים לחשיפה
            { h: 'בניהול העסק שלכם', p: '• עריכה זמינה בכל רגע – תמונות, פרטים והטבה\n• טיפים לקבלת חשיפה גדולה וקידום העסק' },
            // (רמי, 24.10) "הרשמה סגורה – אוהדים אמיתיים"
            { h: 'איך מצטרפים', p: 'ההרשמה סגורה – רק לאוהדים אמיתיים. ממלאים טופס קצר עם פרטי העסק וההטבה. הצוות עובר ומאשר, ואז העסק עולה לאוויר. הרישום בחינם.' },
            { h: 'להופיע בראש דף הבית', p: 'פעמיים בחודש אנחנו מציגים בראש דף הבית הטבה בלעדית ועסק של אוהד עם הסיפור שלו. רוצים להשתתף? מסמנים עניין בטופס או ב"האזור שלי".' }
          ],
          cta: { label: 'לרישום העסק – בחינם', act: 'bizSignup' }
        },
        invite: {
          // "שתפו ועקבו" (רמי, 24.10) – שיתוף + מעקב ברשתות באותה תיבה, לא תיבה שביעית
          // (רמי, 24.10) "תביאו את החבר'ה" – ההזמנה במרכז, העקיבה ברשתות בפנים מתחת לכפתורי השיתוף;
          // השור עם הטלפון בצד שמאל, כמו ב"מי אנחנו" (רקע התמונה #FFD205)
          theme: 'yellow', badge: 'קהילה', slideTitle: 'תביאו את החבר\'ה', slideLine: 'שתפו את האפליקציה\nעם אוהד שעוד לא כאן',
          photo: 'images/weekly/bull-phone.jpg?v=2', photoBg: '#FFD205', photoH: 290, photoTop: -25, photoLeft: 18,
          heroWho: 'שתפו ועקבו', heroTitle: 'תביאו את החבר\'ה', heroTag: 'כל מי שמצטרף מחזק את כולנו',
          followTitle: 'עקבו אחרינו',   // כתובת ריקה = הכפתור לא מוצג
          follow: [{ label: 'אינסטגרם', url: 'https://www.instagram.com/Yellowzone.mta' }, { label: 'פייסבוק', url: 'https://www.facebook.com/profile.php?id=61593146773605' }],
          sections: [
            { h: 'חבר אוהד', p: 'כל אוהד שמצטרף מחזק את העסקים של כולנו – ומקבל הטבות אצלם.' },
            { h: 'מכירים אוהד עם עסק?', p: 'שלחו לו – כל עסק חדש זה עוד הטבה לקהילה.' }
          ],
          cta: { label: 'שיתוף לחבר אוהד', act: 'shareFan' },
          cta2: { label: 'שיתוף לאוהד בעל עסק', act: 'shareBiz' },
          fanText: 'אוהדי מכבי קונים כחול־צהוב 💛\nכל העסקים של אוהדי מכבי תל אביב במקום אחד – עם הטבות בלעדיות לחברים. מורידים ונרשמים:',
          bizText: 'יש לך עסק ואתה אוהד מכבי? 💛\nב-Yellow Zone העסקים של האוהדים מגיעים לאוהדים, עם הטבה לחברי הקהילה. נרשמים בכמה דקות:'
        }
      },
      future: {}
    };
  }
  function pageFromDir(d) {
    var v = US_DIRS[d];
    // (רמי, 24.10) המגפון ירד – השור עם שלט Yellow Zone כרקע. רקע התמונה צהוב, ולכן התיבה צהובה
    // באותו גוון (photoBg) והטקסט כחול; הלוגו ירד – הוא כבר על השלט שהשור מחזיק.
    return { theme: 'yellow', badge: '', logo: false, slideTitle: 'מי אנחנו? ', slideAccent: 'Yellow Zone', slideLine: v.slideLine,
      heroWho: 'מי אנחנו', heroTitle: 'Yellow Zone', heroTag: v.heroTag, tagBottom: true, quote: v.quote || '',
      sections: v.sections.map(function (s) { return { h: s.h, p: s.p }; }),
      photo: 'images/weekly/bull-yz.jpg', photoBg: '#EACA4F', photoH: 373, photoTop: -32, photoLeft: -15,
      cta: { label: 'לרישום העסק', act: 'bizSignup' } };
  }

  // ── שמירה (דמו: במכשיר בלבד) ──────────────────────────────────────────────────────────
  function load() {
    var d = DEFAULTS();
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        ['ben', 'fan'].forEach(function (k) { if (s[k]) d[k] = Object.assign(d[k], s[k]); });
        if (s.pages) Object.keys(d.pages).forEach(function (k) { if (s.pages[k]) d.pages[k] = Object.assign(d.pages[k], s.pages[k]); });
        if (s.future) d.future = s.future;
        if (s.usDir) d.usDir = s.usDir;
      }
    } catch (e) {}
    return d;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ── תקופה = חצי חודש: 1–15 / 16–סוף החודש ──────────────────────────────────────────────
  function period(dt) {
    var y = dt.getFullYear(), m = dt.getMonth(), first = dt.getDate() <= 15;
    var start = new Date(y, m, first ? 1 : 16), next = first ? new Date(y, m, 16) : new Date(y, m + 1, 1);
    return { start: start, next: next, last: new Date(next - 1) };
  }
  function dm(x) { return x.getDate() + '.' + (x.getMonth() + 1); }
  function timing(now) {
    var p = period(now), left = Math.ceil((p.next - now) / 86400000);
    return { p: p, left: left, pct: Math.min(100, Math.max(0, (now - p.start) / (p.next - p.start) * 100)), end: dm(p.last), next: dm(p.next) };
  }

  // ── עזרי רינדור ────────────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fill(s, ph) { return s ? esc(s) : '<span class="wk-fill">' + esc(ph) + '</span>'; }
  var GO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m14 6-6 6 6 6"/></svg>';
  var X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function act(ctx, js) { return ctx.preview ? '' : ' onclick="' + js + '"'; }
  function bizInfo(b) { var k = KNOWN[b.name] || {}; return { id: k.id || '', logo: k.logo || '', area: b.area || k.area || '' }; }
  function tok(s, t) { return String(s || '').split('{end}').join(t.end).split('{next}').join(t.next); }
  function leftHtml(t) { return t.left === 1 ? '<b>היום אחרון!</b>' : 'נשארו <b>' + t.left + '</b> ימים'; }
  var ORDER = ['ben', 'fan', 'us', 'redeem', 'forbiz', 'invite'];
  // עד ההשקה (שתיהן במצב "בקרוב") – תיבת "פעמיים בחודש" אחת במקומן
  function order(d) { return d && d.ben.soon && d.fan.soon && d.pages.launch ? ['launch'].concat(ORDER.slice(2)) : ORDER; }
  // תמונה בצד שמאל: photoTop מזיז אותה למעלה/למטה, photoFade – כמה פיקסלים השוליים בצד הטקסט נמוגים לצבע התיבה
  function photoStyle(p) {
    var s = '';
    // (רמי, 24.10) "השור באותו גודל בכל הקרוסלה": כל תמונה מצולמת אחרת, ולכן לכל אחת גובה ומיקום
    // משלה (photoH / photoTop / photoLeft) – כך שהראש יוצא באותו גודל ובאותו מקום בכל התיבות
    if (p.photoH) s += 'height:' + Number(p.photoH) + 'px;';
    if (p.photoTop != null) s += 'top:' + Number(p.photoTop) + 'px;';
    if (p.photoLeft != null) s += 'left:' + Number(p.photoLeft) + 'px;';
    if (p.photoFade) { var m = 'linear-gradient(to left,transparent 0,#000 ' + Number(p.photoFade) + 'px)'; s += '-webkit-mask-image:' + m + ';mask-image:' + m + ';'; }
    return s ? ' style="' + s + '"' : '';
  }

  function slideHtml(kind, d, ctx) {
    var t = ctx.t, o = act(ctx, "WK.open('" + kind + "')");
    // (רמי, 24.10) "לא נציג את ההטבה ואת האוהד שמאחורי העסק – כן נציג שזה בקרוב יקרה".
    // התיבה לא נלחצת ואין לה גיליון; כל התוכן האמיתי נשאר שמור ויחזור כש-soon יכובה.
    if ((kind === 'ben' || kind === 'fan') && d[kind].soon) {
      var sn = d[kind].soon;
      // (רמי, 24.10) בלי סמל מכבי; כותרת ימין למעלה, כיתוב ימין למטה, "בקרוב" שמאל למעלה
      // (רמי, 24.10) הרקע: צעיף כחול-צהוב באלכסון בצד שמאל, במקום העיגול
      return '<div class="wk-slide wk-s-soon ' + kind + '">' +
        '<span class="wk-soon-tag wk-corner"><i></i>' + esc(sn.tag || 'בקרוב') + '</span>' +
        '<div class="has-corner"><div class="wk-soon-k">' + esc(sn.kicker || '') + '</div><div class="t">' + esc(sn.title || '') + '</div></div>' +
        (sn.line ? '<div class="s">' + esc(sn.line) + '</div>' : '<span></span>') + '</div>';
    }
    if (kind === 'ben') {
      // (רמי, 24.10) בלי שמות המקעקעים בחוץ – רק רמז ("אצל 5 מקעקעים מאזורים שונים"); השמות בגיליון.
      // מבנה: למעלה מימין תווית + כותרת + רמז, למעלה משמאל עיגול הימים; למטה מימין המחיר, משמאל החץ.
      // "מבצע השקה" (tag2) מוצג רק בפנים.
      var b = d.ben;
      // המחיר כטווח (רמי, 24.10): "400–800 ₪" ו"6–12 ס"מ"; מחיר אחד – כמו שהוא
      var pr = b.prices.map(function (p) { return { n: parseFloat(String(p.price).replace(/[^\d.]/g, '')), s: parseFloat(p.size), p: p }; })
        .filter(function (x) { return !isNaN(x.n); }).sort(function (x, y) { return x.n - y.n; });
      var lo = pr[0], hi = pr[pr.length - 1], range = pr.length > 1 && hi.n > lo.n;
      var ring = '<div class="wk-ring" style="--p:' + (100 - t.pct).toFixed(1) + '"><span class="cap">' + (t.left === 1 ? 'יום אחרון!' : 'מתחלפת בעוד') + '</span>' +
        '<span class="dial"><b>' + t.left + '</b><small>' + (t.left === 1 ? 'יום' : 'ימים') + '</small></span></div>';
      var price = !lo ? '' : '<div class="wk-pfrom"><div><b>' + (range ? '<bdi dir="ltr">' + lo.n + '–' + hi.n + '</bdi>&nbsp;' + esc(String(hi.p.price).replace(/^[\d.,\s]+/, '')) : esc(lo.p.price)) + '</b>' +
        '<span>' + (range && !isNaN(lo.s) && !isNaN(hi.s) ? lo.s + ' עד ' + hi.s + ' ' + esc(String(hi.p.size).replace(/^[\d.\s]+/, '')) : esc(lo.p.size)) +
        (b.sizeExtra ? ' ' + esc(b.sizeExtra) : '') + '</span></div></div>';
      // (רמי, 24.10) השור עם סמל מכבי על הזרוע – משמאל למטה; החץ הופך ל"לפרטים"
      return '<div class="wk-slide wk-s-ben' + (b.img ? ' has-img' : '') + '"' + o + '>' +
        (b.bg ? '<span class="wk-bgwrap"><img class="wk-bgmark" src="' + esc(b.bg) + '" alt=""></span>' : '') +
        (b.img ? '<img class="wk-ben-img" src="' + esc(b.img) + '" alt="">' : '') +
        '<div class="wk-ben-top"><span class="wk-badge">' + esc(b.badge) + '</span><div class="t">' + esc(b.slideTitle) + '</div>' +
        (b.hint ? '<div class="wk-hint">' + esc(String(b.hint).split('{n}').join(b.biz.length)) + '</div>' : '') + '</div>' +
        // עם השור – העיגול מכסה את הראש, אז הספירה עוברת לתווית קטנה בפינה עם עיגול זעיר
        (b.img ? '<div class="wk-days" style="--p:' + (100 - t.pct).toFixed(1) + '"><i></i>' + (t.left === 1 ? 'יום אחרון!' : 'עוד ' + t.left + ' ימים') + '</div>' : ring) + price +
        (b.more ? '<span class="wk-more">' + esc(b.more) + GO + '</span>' : '<span class="wk-go">' + GO + '</span>') + '</div>';
    }
    if (kind === 'fan') {
      var f = d.fan, cover = (KNOWN[f.biz] || {}).cover || '';
      return '<div class="wk-slide wk-s-fan"' + o + (cover ? ' style="background-image:url(\'' + esc(cover) + '\')"' : '') + '>' +
        '<div class="wk-fan-top"><span class="wk-badge">האוהד שמאחורי העסק</span>' + (f.cadence ? '<span class="wk-cad">' + esc(tok(f.cadence, t)) + '</span>' : '') + '</div>' +
        (f.owner ? '<div class="who">' + esc(f.owner) + (f.showFan && f.fanTag ? ' · ' + esc(f.fanTag) : '') + '</div>' : '') +
        '<div class="t">' + esc(f.biz || 'בחרו עסק') + '</div>' +
        (f.slideLine ? '<div class="s">' + esc(f.slideLine) + '</div>' : '') +
        '<span class="wk-go">' + GO + '</span></div>';
    }
    var p = d.pages[kind];
    // slideTheme – צבע התיבה בחוץ כשהוא שונה מהגיליון בפנים (איך מממשים: כחול בחוץ, בהיר בפנים)
    return '<div class="wk-slide wk-s-page wk-th-' + esc(p.slideTheme || p.theme || 'navy') + (p.bg || p.photo ? ' has-bg' : '') + (p.photo ? ' has-photo' : '') + (p.cover ? ' has-cover' : '') + ((p.badge && !p.noSlideBadge && !p.badgeInline) || p.logo ? ' has-badge' : '') + '"' + o +
      (p.photo && p.photoBg ? ' style="background:' + esc(p.photoBg) + '"' : '') +
      (p.cover ? ' style="background-image:linear-gradient(180deg,rgba(10,42,102,.88) 0,rgba(10,42,102,.25) 42%,rgba(10,42,102,.3) 58%,rgba(10,42,102,.9) 100%),url(\'' + esc(p.cover) + '\')"' : '') + '>' +
      (p.bg ? '<span class="wk-bgwrap"><img class="wk-bgmark" src="' + esc(p.bg) + '" alt=""></span>' : '') +
      (p.photo ? '<span class="wk-bgwrap"><img class="wk-photo" src="' + esc(p.photo) + '" alt=""' + photoStyle(p) + '></span>' : '') +
      // (רמי, 24.10) סדר אחד לכל הקרוסלה: כותרת – ימין למעלה, כיתוב – ימין למטה, תווית – שמאל למעלה, חץ – שמאל למטה
      // noSlideBadge – התווית רק בגיליון (יש לכם עסק: "לא יפה בתווית שם"); badgeInline – "בקרוב" מעל הכותרת
      (p.logo ? '<img class="logo wk-corner" src="images/yellowzone-mark-square.png" alt="">' : (p.badge && !p.noSlideBadge && !p.badgeInline ? '<span class="wk-badge wk-corner">' + esc(p.badge) + '</span>' : '')) +
      '<div class="wk-tblock">' + (p.badgeInline ? '<span class="wk-soon-tag wk-inl"><i></i>' + esc(p.badge) + '</span>' : '') +
      '<div class="t' + ((p.badge && !p.noSlideBadge && !p.badgeInline) || p.logo ? ' has-corner' : '') + '">' + esc(p.slideTitle) + (p.slideAccent ? '<span>' + esc(p.slideAccent) + '</span>' : '') + '</div></div>' +
      (p.slideLine ? '<div class="s">' + esc(p.slideLine) + '</div>' : '<span></span>') +
      '<span class="wk-go">' + GO + '</span></div>';
  }

  // דוגמה לתעודת החבר במימוש – אותו מראה כמו ב-redemption-guide.html (תעודה צהובה + פס כחול עם שם העסק ושעה)
  function passHtml(bizName, cap) {
    var n = new Date(), clk = n.toLocaleDateString('he-IL') + ' · ' + n.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return '<div class="wk-pass"><div class="wk-pass-ph">' +
      '<div class="yz"><img class="wm" src="images/yellowzone-watermark.png" alt=""><div class="in"><div class="mid"><div><div class="lab">תעודת חבר</div><div class="nm">שומע מ</div></div>' +
      '<img class="logo" src="images/yellowzone-logo-horizontal.png" alt=""></div><div class="flds"><div><div class="fl">מספר חבר</div><div class="fv">#00042</div></div><div><div class="fl">הצטרפות</div><div class="fv">07/26</div></div></div></div></div>' +
      '<div class="st"><div class="h"><div class="r1"><span class="dot"></span><span class="cap">אימות בתוקף עבור ההטבה</span></div><span class="mk">YELLOW ZONE</span></div>' +
      '<div class="ft"><span class="bz">' + esc(bizName) + '</span><span class="clk">' + esc(clk) + '</span></div></div>' +
      '</div>' + (cap ? '<div class="wk-pass-cap">' + esc(String(cap).split('{biz}').join(bizName)) + '</div>' : '') + '</div>';
  }

  // טקסט סעיף: שורות שמתחילות ב-"• " הופכות לרשימה (אפשר לערבב עם שורות רגילות)
  function paraHtml(txt) {
    var lines = String(txt || '').split('\n'), out = '', li = [];
    var flush = function () { if (li.length) { out += '<ul class="wk-ul">' + li.join('') + '</ul>'; li = []; } };
    lines.forEach(function (l) {
      var m = /^\s*•\s*(.*)$/.exec(l);
      if (m) li.push('<li>' + esc(m[1]) + '</li>');
      else { flush(); if (l.trim()) out += '<p>' + esc(l) + '</p>'; }
    });
    flush();
    return out;
  }

  // "עקבו אחרינו" – כפתורי רשתות; כתובת ריקה = לא מוצג
  function followHtml(p, ctx) {
    var f = (p.follow || []).filter(function (x) { return x && x.url; });
    if (!f.length) return '';
    return '<div class="wk-sec wk-follow">' + (p.followTitle ? '<h3>' + esc(p.followTitle) + '</h3>' : '') + '<div>' + f.map(function (x) {
      return '<a class="wk-fbtn" href="' + esc(x.url) + '" target="_blank" rel="noopener"' + (ctx.preview ? ' tabindex="-1" style="pointer-events:none"' : '') + '>' + esc(x.label) + '</a>';
    }).join('') + '</div></div>';
  }

  function closeBtn(kind, ctx) { return ctx.preview ? '' : '<button type="button" class="wk-close" onclick="WK.close(\'' + kind + '\')" aria-label="סגירה">' + X + '</button>'; }

  function sheetInner(kind, d, ctx) {
    var t = ctx.t;
    if (kind === 'ben') {
      var b = d.ben;
      // (רמי, 24.10) בלי עיגול-הדמיית-הגודל ליד כל מחיר – גודל ומחיר בלבד
      var prices = b.prices.map(function (p) {
        return '<div class="wk-pc"><b>' + esc(p.size) + '</b>' + (p.was ? '<s>' + esc(p.was) + '</s>' : '') + '<span>' + esc(p.price) + '</span></div>';
      }).join('');
      var rows = b.biz.map(function (x, i) {
        var inf = bizInfo(x);
        if (!x.name) return '<div class="wk-row wk-row-tbd"><div class="wk-logo"></div><div class="wk-row-main"><div class="wk-row-name">מקום שמור ' + (i + 1) + '</div><div class="wk-row-sub">ייקבע בקרוב</div></div></div>';
        return '<div class="wk-row"' + (inf.id ? act(ctx, "WK.biz('" + inf.id + "')") : '') + '>' +
          (inf.logo ? '<img class="wk-logo" src="' + esc(inf.logo) + '" alt="">' : '<div class="wk-logo wk-logo-l">' + esc(x.name.charAt(0)) + '</div>') +
          '<div class="wk-row-main"><div class="wk-row-name">' + esc(x.name) + '</div>' + (inf.area ? '<div class="wk-row-sub">' + esc(inf.area) + '</div>' : '') + '</div>' + GO + '</div>';
      }).join('');
      return '<div class="wk-hero ben' + (b.heroImg ? ' has-img' : '') + '">' + closeBtn(kind, ctx) + (b.heroImg ? '<img class="wk-hero-img" src="' + esc(b.heroImg) + '" alt="">' : '') +
        '<span class="wk-badge">' + esc(b.badge) + (b.tag2 ? ' · ' + esc(b.tag2) : '') + '</span><div class="t">' + esc(b.title) + '</div></div>' +
        '<div class="wk-in">' +
        (b.explain ? '<div class="wk-rot"><b>' + esc(b.explainTitle || '') + '</b><p>' + esc(tok(b.explain, t)) + '</p></div>' : '') +
        // (רמי, 24.10) המקעקעים גם למעלה – שורה קומפקטית של לוגואים, בלי לדחוק את ההסבר; הרשימה המלאה נשארת למטה
        '<div class="wk-strip"><h3>' + b.biz.length + ' ' + esc(b.bizNoun || 'עסקים') + ' בהטבה</h3><div>' + b.biz.map(function (x) {
          var inf = bizInfo(x);
          if (!x.name) return '<span class="wk-av tbd"><i>?</i><em>בקרוב</em></span>';
          return '<span class="wk-av"' + (inf.id ? act(ctx, "WK.biz('" + inf.id + "')") : '') + '>' +
            (inf.logo ? '<img src="' + esc(inf.logo) + '" alt="">' : '<i>' + esc(x.name.charAt(0)) + '</i>') + '<em>' + esc(x.name) + '</em></span>';
        }).join('') + '</div></div>' +
        '<div class="wk-timer"><div class="row"><span>' + leftHtml(t) + '</span><span>עד ' + t.end + '</span></div><div class="bar"><i style="width:' + t.pct.toFixed(1) + '%"></i></div></div>' +
        (b.intro ? '<p class="wk-p">' + esc(b.intro) + '</p>' : '') +
        '<div class="wk-price">' + prices + '</div>' +
        (b.after ? '<p class="wk-p">' + esc(b.after) + '</p>' : '') +
        // איך זה עובד – סוגרים מול המקעקע (רמי, 24.10)
        (b.how ? '<div class="wk-rot navy"><b>' + esc(b.howTitle || '') + '</b>' + paraHtml(tok(b.how, t)) + '</div>' : '') +
        '<div class="wk-sec"><h3>' + esc(b.whereTitle) + ' · ' + b.biz.length + ' ' + esc(b.bizNoun || 'עסקים') + '</h3><div class="wk-rows">' + rows + '</div>' +
        (b.howTo ? '<div class="wk-small" style="margin-top:8px">' + esc(b.howTo) + '</div>' : '') + '</div>' +
        '<div class="wk-small">כל חצי חודש – ב-1 וב-16 – הטבה בלעדית חדשה. הבאה מתחילה ב-' + t.next + '.</div>' +
        '</div>';
    }
    if (kind === 'fan') {
      var f = d.fan, cover = (KNOWN[f.biz] || {}).cover || '', story = f.hasStory;
      var chips = String(f.chips || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var bizId = (KNOWN[f.biz] || {}).id || '';
      return '<div class="wk-hero"' + (cover ? ' style="background-image:url(\'' + esc(cover) + '\')"' : '') + '>' + closeBtn(kind, ctx) +
        '<span class="wk-badge">האוהד שמאחורי העסק</span><div class="who">עד ' + t.end + (f.cadence ? ' · ' + esc(tok(f.cadence, t)) : '') + '</div><div class="t">' + esc(f.biz || 'בחרו עסק') + '</div></div>' +
        '<div class="wk-in">' +
        (f.cadenceNote ? '<div class="wk-rot navy"><b>' + esc(f.explainTitle || '') + '</b><p>' + esc(tok(f.cadenceNote, t)) + '</p></div>' : '') +
        (f.owner ? '<div class="wk-owner"><div class="wk-avatar">' + esc(f.owner.charAt(0)) + '</div><div><div class="wk-owner-name">' + esc(f.owner) + '</div>' +
          '<div class="wk-owner-role">בעל העסק' + (f.showFan && f.fanTag ? ' <span class="wk-fan">✓ ' + esc(f.fanTag) + '</span>' : '') + '</div></div></div>' : '') +
        '<div class="wk-lead">' + (f.title ? '<b>' + esc(f.title) + '</b>' : '') + fill(f.text, 'טקסט על האוהד ועל העסק') + '</div>' +
        (chips.length ? '<div class="wk-chips">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        (story ? '<div class="wk-quote">"' + fill(f.quote, 'משפט אחד שלו – מה מכבי בשבילו') + '"</div>' +
          '<div class="wk-sec"><h3>ביציע</h3><p>' + fill(f.stand, 'ממתי במגרש, איפה יושב, עם מי, רגע שלא יישכח – ימולא אחרי השיחה') + '</p></div>' +
          '<div class="wk-sec"><h3>איך הגיע לעסק</h3><p>' + fill(f.how, 'איך נפתח העסק ומה הקשר ליציע – ימולא אחרי השיחה') + '</p></div>' +
          '<div class="wk-sec"><h3>למה Yellow Zone</h3><p>' + fill(f.why, 'במילים שלו: למה חשוב שאוהדים יקנו מאוהדים') + '</p></div>' : '') +
                '</div>' +
        '<div class="wk-bar-btn"><button type="button"' + (bizId ? act(ctx, "WK.biz('" + bizId + "')") : '') + '>לכרטיס העסק וההטבה</button></div>';
    }
    var p = d.pages[kind];
    var secs = p.steps
      // שורות "• " בצעד = נקודות (paraHtml), כמו בשאר הגיליונות
      ? '<ol class="wk-steps">' + p.sections.map(function (s, i) { return '<li><i>' + (i + 1) + '</i><div><b>' + esc(s.h) + '</b><div class="wk-sp">' + paraHtml(s.p) + '</div>' + (s.img ? passHtml(s.img, s.imgCap) : '') + '</div></li>'; }).join('') + '</ol>'
      : p.sections.map(function (s) { return '<div class="wk-sec">' + (s.h ? '<h3>' + esc(s.h) + '</h3>' : '') + paraHtml(s.p) + (s.img ? passHtml(s.img, s.imgCap) : '') + '</div>'; }).join('');
    if (p.introTitle || p.intro) secs = '<div class="wk-rot"><b>' + esc(p.introTitle || '') + '</b>' + (p.intro ? '<p>' + esc(p.intro) + '</p>' : '') + '</div>' + secs;
    secs += p.exBiz ? '<div class="wk-sec wk-ex">' + (p.exTitle ? '<h3>' + esc(p.exTitle) + '</h3>' : '') + passHtml(p.exBiz, p.exCap) + '</div>' : '';
    secs += p.bizNote ? '<div class="wk-rot navy"><b>לבעלי עסקים</b><p>' + esc(p.bizNote) + '</p></div>' : '';
    secs += p.note ? '<div class="wk-small">' + esc(p.note) + '</div>' : '';
    var cta = function (c) { return c && c.label ? '<button type="button" class="wk-cta"' + act(ctx, "WK.act('" + esc(c.act) + "')") + '>' + esc(c.label) + '</button>' : ''; };
    // (רמי, 24.10) ראש הגיליון בעיצוב של התיבה בחוץ: אותו צבע, אותו שור / אותה תמונה, אותה תווית
    var hs = p.photo && p.photoBg ? ' style="background:' + esc(p.photoBg) + '"'
      : p.cover ? ' style="background-image:linear-gradient(180deg,rgba(10,42,102,.55) 0,rgba(10,42,102,.2) 40%,rgba(10,42,102,.92) 100%),url(\'' + esc(p.cover) + '\')"' : '';
    return '<div class="wk-hero page wk-th-' + esc(p.slideTheme || p.theme || 'navy') + (p.photo ? ' has-photo' : '') + (p.cover ? ' has-cover' : '') + '"' + hs + '>' + closeBtn(kind, ctx) +
      (p.photo ? '<span class="wk-bgwrap"><img class="wk-photo" src="' + esc(p.photo) + '" alt=""' + photoStyle(p) + '></span>' : '') +
      (p.badge ? '<span class="wk-badge">' + esc(p.badge) + '</span>' : '') +
      (p.heroWho ? '<div class="who">' + esc(p.heroWho) + '</div>' : '') + '<div class="t">' + esc(p.heroTitle) + '</div>' +
      // (רמי, 24.10) ב"מי אנחנו" המשפט "אוהד שקונה מאוהד – מקבל יותר" נשאר בכותרת – בחלק התחתון שלה
      (p.heroTag ? '<div class="tag' + (p.tagBottom ? ' low' : '') + '">' + esc(p.heroTag) + '</div>' : '') + '</div>' +
      '<div class="wk-in">' + (p.quote ? '<div class="wk-quote">' + esc(p.quote) + '</div>' : '') + secs +
      (cta(p.cta) || cta(p.cta2) ? '<div class="wk-ctas">' + cta(p.cta) + cta(p.cta2) + '</div>' : '') + followHtml(p, ctx) + '</div>';
  }

  // ── עיצוב (משותף לשני הדמואים) ─────────────────────────────────────────────────────────
  var CSS = [
    '.wk{padding:16px 0 4px}',
    '.wk-track{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:2px 16px 4px;scroll-padding:0 16px;scrollbar-width:none}',
    '.wk-track::-webkit-scrollbar{display:none}',
    '.wk-slide{position:relative;flex:0 0 86%;height:212px;border-radius:20px;overflow:hidden;scroll-snap-align:start;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;padding:14px 16px;color:#fff;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 2px rgba(10,42,102,.08);box-sizing:border-box;font-family:Rubik,sans-serif}',
    '.wk-slide:active{transform:scale(.985)}',
    '.wk-dots{display:flex;justify-content:center;gap:5px;margin-top:10px}',
    '.wk-dots i{width:6px;height:6px;border-radius:999px;background:#D5D9E2;transition:width .2s,background .2s}',
    '.wk-dots i.on{width:18px;background:#0A2A66}',
    '.wk-badge{display:inline-block;align-self:flex-start;padding:4px 10px;border-radius:999px;background:#FFD400;color:#0A2A66;font-size:11px;font-weight:800;letter-spacing:.02em}',
    '.wk-tags{display:flex;gap:5px;flex-wrap:wrap}',
    '.wk-s-ben .wk-badge2{background:#fff;color:#0A2A66}',
    '.wk-rot{background:#FFF7DB;border:1px solid #FFE9A3;border-radius:14px;padding:12px 14px}',
    '.wk-rot b{display:block;font-size:15px;color:#0A2A66;margin-bottom:3px}',
    '.wk-rot p{margin:0;font-size:14px;line-height:1.6;color:#3A4C7A}',
    '.wk-rot.navy{background:#0A2A66;border-color:#0A2A66}.wk-rot.navy b{color:#FFD400}.wk-rot.navy p{color:#fff;opacity:.92}',
    '.wk{position:relative}',
    '.wk-arr{display:none;position:absolute;top:calc(50% - 30px);width:40px;height:40px;border-radius:50%;border:0;background:#fff;color:#0A2A66;box-shadow:0 2px 10px rgba(10,42,102,.22);cursor:pointer;z-index:2;align-items:center;justify-content:center}',
    '.wk-arr[hidden]{display:none!important}',
    '.wk-arr.prev{right:6px}.wk-arr.next{left:6px}',
    '@media (hover:hover) and (pointer:fine){.wk-arr{display:flex}}',
    '.wk-fill{background:#FFF0B3;color:#6B5200;border-radius:4px;padding:0 4px;font-weight:700}',
    '.wk-go{position:absolute;left:14px;bottom:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center}',
    // 1 – הטבה
    '.wk-s-ben{background:#FFD400;color:#0A2A66;justify-content:space-between}',
    '.wk-s-ben .wk-badge{background:#0A2A66;color:#FFD400}',
    // (24.10) למעלה מימין: תווית + כותרת + רמז; למעלה משמאל: עיגול הימים; למטה מימין: המחיר; למטה משמאל: החץ
    '.wk-ben-top{display:flex;flex-direction:column;align-items:flex-start;margin-inline-end:80px}',
    '.wk-s-ben .t{font-size:23px;font-weight:800;letter-spacing:-.02em;line-height:1.12;margin-top:8px;text-wrap:balance}',
    '.wk-hint{font-size:13px;font-weight:700;margin-top:6px;opacity:.78}',
    '.wk-ring{position:absolute;left:14px;top:12px;display:flex;flex-direction:column;align-items:center;gap:3px}',
    '.wk-ring .cap{font-size:10.5px;font-weight:800;white-space:nowrap}',
    '.wk-ring .dial{width:62px;height:62px;border-radius:50%;background:conic-gradient(#0A2A66 calc(var(--p) * 1%),rgba(10,42,102,.16) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;line-height:1}',
    '.wk-ring .dial::before{content:"";position:absolute;inset:6px;border-radius:50%;background:#FFD400}',
    '.wk-ring .dial b,.wk-ring .dial small{position:relative}',
    '.wk-ring .dial b{font-size:23px;font-weight:800}',
    '.wk-ring .dial small{font-size:10.5px;font-weight:800;margin-top:1px}',
    '.wk-pfrom{line-height:1.05;margin-inline-end:96px}',
    '.wk-pfrom small{display:block;font-size:11.5px;font-weight:800;opacity:.75;margin-bottom:1px}',
    '.wk-pfrom div{display:flex;flex-direction:column;align-items:flex-start;gap:2px}',
    // השור עם סמל מכבי על הזרוע (משמאל למטה) + "לפרטים" ליד החץ (רמי, 24.10)
    '.wk-ben-img{position:absolute;left:0;bottom:0;height:100%;width:auto;z-index:0;pointer-events:none;-webkit-mask-image:linear-gradient(to right,#000 62%,transparent);mask-image:linear-gradient(to right,#000 62%,transparent)}',
    '.wk-s-ben .wk-ben-top,.wk-s-ben .wk-pfrom{position:relative;z-index:1}.wk-s-ben .wk-ring,.wk-s-ben .wk-go,.wk-more{z-index:1}',
    '.wk-s-ben.has-img .wk-ben-top,.wk-s-ben.has-img .wk-pfrom{margin-inline-end:112px}',
    '.wk-s-ben.has-img .wk-ring{position:absolute}',
    '.wk-days{position:absolute;left:10px;top:10px;z-index:1;display:flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 5px;border-radius:999px;background:#fff;color:#0A2A66;font-size:12px;font-weight:800;box-shadow:0 1px 4px rgba(10,42,102,.18)}',
    '.wk-days i{width:16px;height:16px;border-radius:50%;background:conic-gradient(#0A2A66 calc(var(--p) * 1%),rgba(10,42,102,.18) 0);-webkit-mask:radial-gradient(circle,transparent 4px,#000 4.5px);mask:radial-gradient(circle,transparent 4px,#000 4.5px)}',
    '.wk-more{position:absolute!important;left:10px;bottom:12px;display:flex;align-items:center;gap:2px;height:32px;padding:0 11px 0 6px;border-radius:999px;background:#0A2A66;color:#FFD400;font-size:13px;font-weight:800;box-shadow:0 2px 8px rgba(10,42,102,.25)}',
    '.wk-hero.ben.has-img{min-height:230px;padding-top:70px;justify-content:flex-end}',
    '.wk-hero-img{position:absolute!important;left:0;bottom:0;height:100%;width:auto;pointer-events:none;-webkit-mask-image:linear-gradient(to right,#000 65%,transparent);mask-image:linear-gradient(to right,#000 65%,transparent)}',
    '.wk-hero.ben.has-img > .t{margin-inline-end:42%}',
    '.wk-rot.navy .wk-ul li{color:#fff}',
    '.wk-rot.navy .wk-ul li::before{background:#FFD400;box-shadow:none}',
    '.wk-pfrom b{font-size:26px;font-weight:800;letter-spacing:-.02em;white-space:nowrap}',
    '.wk-pfrom span{font-size:12.5px;font-weight:700;opacity:.8;white-space:nowrap}',
    // דוגמת תעודת החבר
    '.wk-pass{margin-top:12px}',
    '.wk-pass-ph{border:3px solid #0A2A66;border-radius:24px;padding:12px 10px;background:#FBF8EE;max-width:280px;margin:0 auto;color:#0A2A66}',
    '.wk-pass .yz{border-radius:14px;position:relative;overflow:hidden;background:#FFD400}',
    '.wk-pass .yz img.wm{position:absolute;top:-24px;left:-28px;width:150px;opacity:.13;mix-blend-mode:multiply}',
    '.wk-pass .in{position:relative;padding:13px 15px 14px}',
    '.wk-pass .mid{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}',
    '.wk-pass .lab,.wk-pass .fl{color:rgba(10,42,102,.62);font-size:9.5px;font-weight:700;letter-spacing:.1em}',
    '.wk-pass .nm{font-size:18px;font-weight:800}',
    '.wk-pass .logo{height:15px}',
    '.wk-pass .flds{margin-top:18px;display:flex;gap:16px}',
    '.wk-pass .fv{font-size:14px;font-weight:800;direction:ltr;unicode-bidi:isolate}',
    '.wk-pass .st{margin-top:8px;background:linear-gradient(140deg,#0A2A66 0%,#123A82 100%);border-radius:12px;padding:10px 12px 9px;color:#fff}',
    '.wk-pass .st .h{display:flex;justify-content:space-between;align-items:center;gap:6px}',
    '.wk-pass .r1{display:flex;align-items:center;gap:6px}',
    '.wk-pass .dot{width:7px;height:7px;border-radius:50%;background:#22C55E}',
    '.wk-pass .cap,.wk-pass .mk{font-size:9.5px;font-weight:700;color:#FFD400}',
    '.wk-pass .mk{font-size:9px;font-weight:800;letter-spacing:.06em}',
    '.wk-pass .ft{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.14)}',
    '.wk-pass .bz{font-size:15px;font-weight:800}',
    '.wk-pass .clk{font-size:9.5px;font-weight:700;color:#C9D8F5;background:rgba(255,255,255,.1);border-radius:6px;padding:3px 7px;direction:ltr;white-space:nowrap}',
    '.wk-pass-cap{font-size:12px;color:#6B7A9B;text-align:center;margin-top:8px;line-height:1.5}',
    '.wk-s-ben .wk-go{background:#0A2A66;color:#FFD400}',
    // 2 – האוהד שמאחורי העסק
    '.wk-s-fan{background:#0A2A66 center/cover no-repeat}',
    '.wk-s-fan::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,22,56,.94) 0%,rgba(6,22,56,.45) 55%,rgba(6,22,56,.1) 100%)}',
    '.wk-s-fan > *{position:relative}',
    '.wk-fan-top{position:absolute!important;top:14px;right:16px;left:16px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.wk-cad{font-size:11px;font-weight:800;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:3px 9px;backdrop-filter:blur(4px)}',
    '.wk-s-fan .who{font-size:12px;font-weight:700;color:#FFD400;margin-bottom:3px}',
    '.wk-s-fan .t{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1}',
    '.wk-s-fan .s{font-size:13px;opacity:.88;margin-top:4px;margin-inline-end:44px;line-height:1.4}',
    '.wk-s-fan > .wk-go{position:absolute;background:#FFD400;color:#0A2A66}',
    // 3–6 – עמודים קבועים
    '.wk-s-page{justify-content:space-between}',
    '.wk-s-page::after{content:"";position:absolute;left:-40px;top:-40px;width:170px;height:170px;border-radius:50%;background:rgba(255,212,0,.12)}',
    // סמל ברקע התיבה (רמי, 24.10): מכבי בהטבה, מגפון ב"מי אנחנו"
    '.wk-bgwrap{position:absolute!important;inset:0;overflow:hidden;z-index:0!important;pointer-events:none;border-radius:inherit}',
    '.wk-bgmark{position:absolute;pointer-events:none;user-select:none}',
    '.wk-s-ben .wk-bgmark{width:280px;height:280px;left:-20px;top:-40px;opacity:.16;transform:rotate(-12deg)}',
    '.wk-s-page.has-bg::after{display:none}',
    '.wk-s-page .wk-bgmark{width:300px;height:300px;left:-30px;top:-50px;opacity:.11;transform:rotate(-14deg);filter:brightness(0) invert(1)}',
    '.wk-s-page > *{position:relative;z-index:1}',
    // השור ב"מי אנחנו": משמאל, חתוך מלמטה (ראש + שלט + גוף), הטקסט מימין
    '.wk-photo{position:absolute;left:-4px;top:-6px;height:356px;width:auto;pointer-events:none;user-select:none;-webkit-mask-image:linear-gradient(to left,transparent 0,#000 22px);mask-image:linear-gradient(to left,transparent 0,#000 22px)}',
    '.wk-s-page.has-photo .t,.wk-s-page.has-photo .s{margin-inline-end:142px}',
    '.wk-s-page .s{white-space:pre-line}',
    '.wk-s-page.has-photo .s{font-size:12.5px}',
    // תמונת רקע מלאה (יש לכם עסק?) – הצללה כחולה למעלה ולמטה כדי שהכותרת והכיתוב ייקראו
    '.wk-s-page.has-cover{background-color:#0A2A66;background-position:center 30%;background-size:cover;background-repeat:no-repeat}',
    '.wk-s-page.has-cover::after{display:none}',
    '.wk-s-page.has-cover .t,.wk-s-page.has-cover .s{text-shadow:0 1px 6px rgba(0,0,0,.45)}',
    '.wk-s-page.has-photo.wk-th-yellow .t span{color:#0A2A66}',
    '.wk-s-page.has-photo .wk-go{z-index:2;box-shadow:0 2px 8px rgba(10,42,102,.3)}',
    // בלי תווית (מי אנחנו) – החץ עולה לפינה, כדי לא לכסות את השלט שהשור מחזיק
    '.wk-s-page.has-photo:not(.has-badge) .wk-go{top:14px;bottom:auto}',
    '.wk-s-page.has-photo .wk-badge.wk-corner{box-shadow:0 1px 6px rgba(10,42,102,.3)}',
    // ראש הגיליון עם שור / תמונה – כמו בחוץ
    '.wk-hero.page.has-photo{min-height:250px;justify-content:flex-start;padding-top:64px}',
    '.wk-hero.page.has-photo > .who,.wk-hero.page.has-photo > .t,.wk-hero.page.has-photo > .tag{margin-inline-end:44%}',
    '.wk-hero.page.has-photo .wk-photo{height:400px;top:-10px}',
    '.wk-hero.page.has-photo > .wk-close{z-index:3}',
    '.wk-hero.page.has-cover{min-height:250px;background-color:#0A2A66;background-position:center 30%;background-size:cover;background-repeat:no-repeat}',
    '.wk-hero.page.has-cover .t,.wk-hero.page.has-cover .tag{text-shadow:0 1px 6px rgba(0,0,0,.45)}',
    // מצב "בקרוב" (רמי, 24.10): ההטבה והאוהד שמאחורי העסק עוד לא עולים – רק מודיעים שזה מגיע
    '.wk-s-soon{justify-content:space-between;cursor:default}',
    '.wk-s-soon > *{position:relative;z-index:1}',
    '.wk-s-soon .t{font-size:22px;font-weight:800;line-height:1.15}',
    '.wk-s-soon .s{font-size:13px;margin-top:5px;line-height:1.45;opacity:.9;max-width:300px}',
    '.wk-soon-tag{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:800}',
    '.wk-soon-tag i{width:7px;height:7px;border-radius:50%;background:currentColor;animation:wkPulse 1.6s ease-in-out infinite}',
    '@keyframes wkPulse{0%,100%{opacity:1}50%{opacity:.25}}',
    '.wk-s-soon.ben{background:#FFD400;color:#0A2A66}.wk-s-soon.ben .wk-soon-tag{background:#0A2A66;color:#FFD400}',
    // סדר אחד לכל הקרוסלה (רמי, 24.10): התווית בפינה השמאלית העליונה, והכותרת לידה לא נכנסת מתחתיה
    '.wk-corner{position:absolute!important;left:14px;top:14px;z-index:2!important;margin:0}',
    '.wk-s-page .t.has-corner{margin-inline-end:118px}',
    '.wk-s-soon .has-corner{margin-inline-end:86px}',
    '.wk-s-soon.fan{background:#0A2A66;color:#fff}.wk-s-soon.fan .wk-soon-tag{background:#FFD400;color:#0A2A66}',
    '.wk-scarf{position:absolute;left:34px;top:-40px;width:62px;height:300px;transform:rotate(18deg);border-radius:3px;' +
      'background:repeating-linear-gradient(180deg,#0A2A66 0 24px,#FFD400 24px 48px);box-shadow:0 0 0 3px #fff,0 4px 14px rgba(10,42,102,.25)}',
    // (רמי, 24.10) הצעיף ירד מתיבות "בקרוב" – רקע חלק
    '.wk-corner.low{top:auto!important;bottom:20px;left:58px}',
    '.wk-hero .tag.low{margin-top:auto;padding-top:14px;font-weight:700}',
    '.wk-tblock{display:flex;flex-direction:column;align-items:flex-start}',
    '.wk-inl{margin-bottom:7px}',
    '.wk-th-yellow .wk-inl{background:#0A2A66;color:#FFD400}',
    '.wk-th-navy .wk-inl{background:#FFD400;color:#0A2A66}',
    '.wk-soon-k{font-size:12px;font-weight:700;opacity:.75;margin-bottom:3px}',
    '.wk-s-page .logo{width:46px;height:46px;border-radius:12px;background:#fff;padding:6px;box-sizing:border-box}',
    '.wk-s-page .t{font-size:22px;font-weight:800;line-height:1.15}',
    '.wk-s-page .t span{color:#FFD400}',
    '.wk-s-page .s{font-size:13px;opacity:.85;margin-top:4px;margin-inline-end:44px;line-height:1.4}',
    '.wk-s-page .wk-go{position:absolute;background:#FFD400;color:#0A2A66}',
    '.wk-th-navy{background:#0A2A66;color:#fff}',
    '.wk-th-soft{background:#FFF7DB;color:#0A2A66;border:1px solid #FFE9A3}',
    '.wk-th-soft .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-s-page.wk-th-soft .t span{color:#0A2A66}.wk-s-page.wk-th-soft::after{background:rgba(255,212,0,.35)}',
    '.wk-s-page.wk-th-soft .wk-go,.wk-s-page.wk-th-yellow .wk-go{background:#0A2A66;color:#FFD400}',
    '.wk-th-yellow{background:#FFD400;color:#0A2A66}',
    '.wk-th-yellow .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-s-page.wk-th-yellow::after{background:rgba(10,42,102,.08)}',
    '@media (min-width:761px){.wk{width:100%;max-width:1410px;margin-inline:auto;padding:22px 0 4px}.wk-track{padding:2px 20px 4px;scroll-padding:0 20px}.wk-slide{flex-basis:calc((100% - 20px) / 2.6);height:228px}}',
    // גיליונות
    '.wk-sheet{position:fixed;inset:0;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;transform:translateY(100%);transition:transform .28s ease;font-family:Rubik,sans-serif;color:#3A4C7A}',
    '.wk-sheet.open{transform:none}',
    '.wk-sheet.wk-inline{position:relative;inset:auto;transform:none;transition:none;overflow:visible;z-index:auto}',
    '.wk-close{position:absolute;top:14px;left:14px;z-index:3;width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#0A2A66;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.15)}',
    '.wk-hero{position:relative;min-height:260px;background:#0A2A66 center/cover;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:18px;box-sizing:border-box}',
    '.wk-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,22,56,.92),rgba(6,22,56,.2) 60%,rgba(6,22,56,.35))}',
    '.wk-hero > *{position:relative}',
    '.wk-hero > .wk-badge{position:absolute;top:18px;right:18px}',
    '.wk-hero > .wk-close{position:absolute}',
    '.wk-hero .who{font-size:12.5px;font-weight:700;color:#FFD400;margin-bottom:4px}',
    '.wk-hero .t{font-size:28px;font-weight:800;line-height:1.1}',
    '.wk-hero .tag{font-size:15px;opacity:.9;margin-top:6px}',
    '.wk-hero.ben{background:#FFD400;color:#0A2A66;min-height:0;padding-top:70px}',
    '.wk-hero.ben::before,.wk-hero.page::before{display:none}',
    '.wk-hero.ben > .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-hero.page{min-height:0;padding-top:70px}',
    '.wk-hero.page.wk-th-soft .who,.wk-hero.page.wk-th-yellow .who{color:#6B5200}',
    // ראש גיליון על רקע צהוב (התמונה) – טקסט כחול, אחרת הלבן של .wk-hero לא נקרא
    '.wk-hero.page.wk-th-yellow,.wk-hero.page.wk-th-soft{color:#0A2A66}',
    '.wk-hero.page.wk-th-yellow > .wk-badge{background:#0A2A66;color:#FFD400}',
    '.wk-in{padding:18px 18px 120px;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:18px;color:#3A4C7A}',
    '.wk-inline .wk-in{padding-bottom:24px}',
    '.wk-p{font-size:15.5px;line-height:1.65;margin:0;white-space:pre-line}',
    '.wk-owner{display:flex;align-items:center;gap:10px}',
    '.wk-avatar{width:46px;height:46px;flex:none;border-radius:50%;background:#FFD400;color:#0A2A66;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;border:2px solid #0A2A66}',
    '.wk-owner-name{font-size:16px;font-weight:800;color:#0A2A66}',
    '.wk-owner-role{font-size:12.5px;color:#6B7A9B;margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.wk-fan{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#0A2A66;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:999px;padding:2px 8px}',
    '.wk-lead{font-size:16px;line-height:1.65;white-space:pre-line}',
    '.wk-lead b{display:block;font-size:19px;color:#0A2A66;margin-bottom:4px}',
    '.wk-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.wk-chips span{font-size:12px;font-weight:700;color:#0A2A66;background:#F2F2EC;border-radius:999px;padding:4px 10px}',
    '.wk-quote{font-size:20px;font-weight:800;line-height:1.4;color:#0A2A66;padding-right:14px;border-right:4px solid #FFD400}',
    '.wk-strip h3{font-size:13px;font-weight:800;letter-spacing:.04em;color:#6B7A9B;margin:0 0 8px}',
    '.wk-strip > div{display:flex;gap:6px}',
    '.wk-av{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}',
    '.wk-av img,.wk-av i{width:52px;height:52px;border-radius:50%;border:2px solid #FFD400;background:#fff;object-fit:contain;padding:4px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:18px;color:#0A2A66}',
    '.wk-av i{background:#FFF7DB}',
    '.wk-av em{font-style:normal;font-size:11px;font-weight:700;line-height:1.25;color:#0A2A66;max-width:100%;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;unicode-bidi:plaintext}',
    '.wk-av.tbd{cursor:default}.wk-av.tbd i{border:2px dashed #C9CFDB;background:#F2F2EC;color:#98A2B3}.wk-av.tbd em{color:#98A2B3}',
    '.wk-sec h3{font-size:13px;font-weight:800;letter-spacing:.04em;color:#6B7A9B;margin:0 0 6px}',
    '.wk-sec p{font-size:15.5px;line-height:1.7;margin:0;white-space:pre-line}',
    '.wk-sec p+p,.wk-sec p+.wk-ul,.wk-sec .wk-ul+p{margin-top:6px}',
    '.wk-ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
    '.wk-ul li{position:relative;padding-right:18px;font-size:15.5px;line-height:1.55;color:#3A4C7A}',
    '.wk-ul li::before{content:"";position:absolute;right:2px;top:.62em;width:7px;height:7px;border-radius:50%;background:#FFD400;box-shadow:0 0 0 1.5px #0A2A66}',
    '.wk-timer{background:#fff;border:1px solid #FFE9A3;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
    '.wk-timer .row{display:flex;justify-content:space-between;font-weight:800;color:#0A2A66}',
    '.wk-timer .row span:last-child{font-size:12px;color:#6B7A9B}',
    '.wk-timer .bar{height:6px;background:#EFE7C4;border-radius:999px;overflow:hidden}',
    '.wk-timer .bar i{display:block;height:100%;background:#0A2A66}',
    '.wk-price{display:flex;gap:8px}',
    '.wk-pc{flex:1;background:#FFF7DB;border:1px solid #FFE9A3;border-radius:14px;padding:12px 8px;text-align:center;display:flex;flex-direction:column;align-items:center}',
    '.wk-pc .ring{height:58px;display:flex;align-items:center;justify-content:center}',
    '.wk-pc .ring i{display:block;border-radius:50%;border:2.5px dashed #0A2A66;background:#fff}',
    '.wk-pc b{font-size:15px;color:#6B7A9B;font-weight:800;margin-top:6px}',
    '.wk-pc s{font-size:13px;color:#98A2B3;margin-top:2px}',
    '.wk-pc span{font-size:28px;font-weight:800;color:#0A2A66;line-height:1.1}',
    '.wk-rows{display:flex;flex-direction:column;gap:8px}',
    '.wk-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E7E7E0;border-radius:13px;padding:9px 11px;cursor:pointer;color:#0A2A66}',
    '.wk-logo{width:42px;height:42px;flex:none;border-radius:12px;border:1px solid #E7E7E0;background:#fff;object-fit:contain;padding:3px;box-sizing:border-box}',
    '.wk-logo-l{display:flex;align-items:center;justify-content:center;font-weight:800;background:#FFF7DB}',
    '.wk-row-main{flex:1;min-width:0}',
    '.wk-row-name{font-size:15px;font-weight:800;color:#0A2A66}',
    '.wk-row-sub{font-size:12px;color:#6B7A9B}',
    '.wk-row-tbd{border-style:dashed;cursor:default}',
    '.wk-row-tbd .wk-logo{background:#F2F2EC;border-style:dashed}',
    '.wk-row-tbd .wk-row-name{color:#6B7A9B}',
    '.wk-small{font-size:12.5px;color:#6B7A9B;line-height:1.5}',
    '.wk-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px}',
    '.wk-steps li{display:flex;gap:12px;align-items:flex-start;font-size:15.5px;line-height:1.6}',
    '.wk-steps li i{flex:none;width:28px;height:28px;border-radius:50%;background:#FFD400;color:#0A2A66;font:800 14px Rubik,sans-serif;display:flex;align-items:center;justify-content:center;font-style:normal}',
    '.wk-steps li b{display:block;color:#0A2A66;font-size:17px;font-weight:800;margin-bottom:3px}',
    '.wk-steps li > div{flex:1;min-width:0}',
    '.wk-sp{white-space:pre-line}',
    '.wk-ctas{display:flex;flex-direction:column;gap:8px}',
    '.wk-follow > div{display:flex;gap:8px}',
    '.wk-fbtn{flex:1;display:flex;align-items:center;justify-content:center;height:44px;border-radius:12px;border:1.5px solid #0A2A66;background:#fff;color:#0A2A66;font:800 15px Rubik,sans-serif;text-decoration:none}',
    '.wk-cta{display:block;width:100%;height:48px;border-radius:12px;border:0;background:#0A2A66;color:#fff;font:800 16px Rubik,sans-serif;cursor:pointer}',
    '.wk-ctas .wk-cta + .wk-cta{background:#FFD400;color:#0A2A66}',
    '.wk-bar-btn{position:fixed;bottom:0;left:0;right:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,#fff 70%,rgba(255,255,255,0));z-index:3}',
    '.wk-inline .wk-bar-btn{position:sticky}',
    '.wk-bar-btn button{width:100%;max-width:640px;display:block;margin:0 auto;height:50px;border:0;border-radius:13px;background:#FFD400;color:#0A2A66;font:800 16px Rubik,sans-serif}'
  ].join('\n');
  function injectCss() {
    if (document.getElementById('wk-style')) return;
    var s = document.createElement('style'); s.id = 'wk-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ── הרכבה בדף הבית ──────────────────────────────────────────────────────────────────
  var state = { d: null, open: null };
  function mount(root) {
    injectCss();
    var d = state.d = load(), ctx = { t: timing(new Date()) };
    root.innerHTML = '<section class="wk" aria-label="הטבה בלעדית, האוהד שמאחורי העסק, Yellow Zone"><div class="wk-track" id="wkTrack">' +
      order(d).map(function (k) { return slideHtml(k, d, ctx); }).join('') + '</div><div class="wk-dots" id="wkDots">' +
      order(d).map(function (k, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div>' +
      '<button type="button" class="wk-arr prev" aria-label="הקודם" onclick="WK.step(-1)" hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m10 6 6 6-6 6"/></svg></button>' +
      '<button type="button" class="wk-arr next" aria-label="הבא" onclick="WK.step(1)">' + GO + '</button></section>';
    order(d).forEach(function (k) {
      var old = document.getElementById('wkSheet-' + k); if (old) old.remove();
      var el = document.createElement('div'); el.className = 'wk-sheet'; el.id = 'wkSheet-' + k; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = sheetInner(k, d, ctx); document.body.appendChild(el);
    });
    var tr = document.getElementById('wkTrack'), dots = document.getElementById('wkDots').children;
    tr.addEventListener('scroll', function () {
      var s = tr.children, best = 0, bd = 1e9, r = tr.getBoundingClientRect();
      for (var i = 0; i < s.length; i++) { var b = s[i].getBoundingClientRect(), dd = Math.abs(b.right - r.right); if (dd < bd) { bd = dd; best = i; } }
      for (var j = 0; j < dots.length; j++) dots[j].classList.toggle('on', j === best);
      arrows();
    }, { passive: true });
    arrows();
  }
  // RTL: scrollLeft מתחיל ב-0 ויורד לשליליים כשמתקדמים שמאלה
  function arrows() {
    var tr = document.getElementById('wkTrack'); if (!tr) return;
    var max = tr.scrollWidth - tr.clientWidth, pos = Math.abs(tr.scrollLeft);
    var p = document.querySelector('.wk-arr.prev'), n = document.querySelector('.wk-arr.next');
    if (p) p.hidden = pos < 8; if (n) n.hidden = pos > max - 8;
  }
  function step(dir) {
    var tr = document.getElementById('wkTrack'), sl = tr && tr.children[0]; if (!sl) return;
    var from = tr.scrollLeft, to = from - dir * (sl.getBoundingClientRect().width + 10);
    tr.scrollTo({ left: to, behavior: 'smooth' });
    // גלילה חלקה לא זזה בכל דפדפן (נמדד: נשארה על 0) – אם לא זזה, קופצים ישר
    setTimeout(function () { if (Math.abs(tr.scrollLeft - from) < 2) { tr.scrollLeft = to; arrows(); } }, 450);
  }
  // דמו: החלפת כיוון הנוסח של "מי אנחנו" ישר מדף הבית (נשמר כמו עריכה בניהול)
  function setUsDir(dir) {
    if (!state.d || !US_DIRS[dir]) return;
    var theme = state.d.pages.us.theme;
    state.d.pages.us = pageFromDir(dir); state.d.pages.us.theme = theme; state.d.usDir = dir; save(state.d);
    var ctx = { t: timing(new Date()) }, sh = document.getElementById('wkSheet-us'), tr = document.getElementById('wkTrack');
    if (sh) { var top = sh.scrollTop; sh.innerHTML = sheetInner('us', state.d, ctx); sh.scrollTop = top; }
    if (tr) { var i = order(state.d).indexOf('us'), tmp = document.createElement('div'); tmp.innerHTML = slideHtml('us', state.d, ctx); tr.replaceChild(tmp.firstChild, tr.children[i]); }
  }
  function open(k) {
    var el = document.getElementById('wkSheet-' + k); if (!el) return;
    state.open = k; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); el.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
  }
  function close(k) {
    var el = document.getElementById('wkSheet-' + k); if (!el) return;
    el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); state.open = null;
    document.documentElement.style.overflow = '';
    ['bizOverlay', 'shareOverlay'].forEach(function (oid) { var o = document.getElementById(oid); if (o) o.style.zIndex = ''; });
  }
  // כרטיס העסק נפתח **מעל** הגיליון (לא סוגרים אותו), כך שסגירת הכרטיס מחזירה בדיוק לאותו מקום ברשימה
  function biz(id) {
    if (typeof window.openBiz !== 'function') return;
    ['bizOverlay', 'shareOverlay'].forEach(function (oid, i) { var o = document.getElementById(oid); if (o) o.style.zIndex = state.open ? String(10050 + i * 10) : ''; });
    window.openBiz(id);
  }
  function share(text) {
    var url = 'https://yellowzone.co.il/download?src=share';
    if (navigator.share) { navigator.share({ title: 'Yellow Zone', text: text, url: url }).catch(function () {}); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank');
  }
  function doAct(a) {
    var inv = state.d && state.d.pages.invite;
    if (a === 'bizSignup') location.href = 'business.html';
    else if (a === 'shareFan') share(inv.fanText);
    else if (a === 'shareBiz') share(inv.bizText);
  }

  window.WK = {
    KEY: KEY, KNOWN: KNOWN, US_DIRS: US_DIRS, ORDER: ORDER,
    DEFAULTS: DEFAULTS, pageFromDir: pageFromDir, load: load, save: save, reset: reset,
    period: period, dm: dm, timing: timing, esc: esc,
    slideHtml: slideHtml, sheetInner: sheetInner, injectCss: injectCss,
    mount: mount, step: step, tok: tok, setUsDir: setUsDir, usDir: function () { return state.d && state.d.usDir; }, open: open, close: close, biz: biz, act: doAct
  };
})();
