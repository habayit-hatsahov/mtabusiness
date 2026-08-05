// ── קטגוריות — מקור-אמת יחיד ──
// לפני זה: אותו מערך (מפתח/אימוג'י/תמונה/תגיות) היה מוקלד בנפרד ב-6 קבצים (home/business/
// business-dashboard/admin-businesses/admin-dashboard/welcome), וסרגל-הקטגוריות העגול בראש
// home.html+welcome.html היה HTML קשיח לגמרי, בלי שום קשר למערך. שינוי עתידי (קטגוריה חדשה/אייקון
// אחר) דרש לזכור לגעת בכל המקומות בנפרד — ר' docs/PROJECT_CONTEXT.md §12 לתיעוד הבעיה.
//
// script קלאסי (לא type="module") בכוונה — כדי שיהיה נגיש כ-window.CATEGORIES גם לסקריפטים
// רגילים וגם לסקריפטים מסוג module באותו דף, בלי תלות בסדר-טעינה בין השניים.
//
// img הוא שם-בסיס בלבד, בלי סיומת-צבע — כל אייקון קיים בפועל תחת images/categories/ בשלושה
// גוונים: {img}-navy.png / {img}-yellow.png / {img}-white.png. להרכבת הנתיב המלא ר' catIconFile().
//
// circleBg — צבע-הרקע של העיגול בסרגל-הקטגוריות המתחלף בראש home.html/welcome.html. זו בחירה
// מפורשת פר-קטגוריה (לא naive/even — כבר היה מתועד ככה ב-home.html לפני המיזוג), לא לחשב-לבד.
// לא רלוונטי לבוררי-הרישום (business/business-dashboard/admin-businesses/admin-dashboard) — שם
// הרקע תמיד בהיר-ניטרלי והאייקון תמיד navy, בלי תלות ב-circleBg.
window.CATEGORIES = [
  { key: 'food',    icon: '🍕', img: 'hotdog',      circleBg: 'navy',   label: 'אוכל ומסעדות',        tags: ['מסעדות וברים', 'בתי קפה ומאפיות', 'קצביות ודגים', 'קייטרינג ומשלוחים', 'מתוקים וקינוחים'] },
  { key: 'events',  icon: '🎉', img: 'drum',        circleBg: 'yellow', label: 'אירועים והפקות',       tags: ['מוזיקה ודיג\'יי', 'אטרקציות ומתנפחים', 'אוכל ואלכוהול לאירועים', 'צילום ומדיה', 'עיצוב והפקת אירועים'] },
  { key: 'vehicle', icon: '🚗', img: 'fanbus',      circleBg: 'navy',   label: 'רכב ותחבורה',          tags: ['מוסכים וחלקי חילוף', 'מצברים וחשמלאות', 'ציוד ואביזרי רכיבה', 'שליחויות ולוגיסטיקה', 'שירותי דרך וגרר'] },
  { key: 'home',    icon: '🏠', img: 'seat',        circleBg: 'yellow', label: 'בית וניקיון',           tags: ['בנייה ושיפוצים', 'נגרות וריהוט', 'עיצוב ופיתוח גינות', 'ניקיון ואחזקה', 'הדברה ומנעולנים'] },
  { key: 'fashion', icon: '👕', img: 'bucket',      circleBg: 'navy',   label: 'אופנה, יופי ובריאות',  tags: ['בגדים ואופנה', 'תכשיטים ויהלומים', 'משקפיים ואביזרי אופנה', 'מספרות וטיפוח', 'מרפאות ורופאים', 'רפואה משלימה וטיפול קנאביס', 'קעקועים'] },
  { key: 'sport',   icon: '⚽', img: 'ball',        circleBg: 'yellow', label: 'ספורט ופנאי',          tags: ['חנויות ספורט וגלישה', 'אטרקציות ופנאי', 'כושר ותזונה'] },
  { key: 'digital', icon: '💻', img: 'wreath',      circleBg: 'navy',   label: 'דיגיטל וטכנולוגיה',    tags: ['פיתוח ואוטומציות', 'בניית אתרים ועיצוב גרפי', 'חבילות תקשורת וסלולר', 'מחשוב ומעבדות תיקון', 'חנות טלפונים'] },
  { key: 'finance', icon: '⚖️', img: 'flare2-flat', circleBg: 'yellow', label: 'פיננסים ומשפט',        tags: ['עורכי דין ומשפט', 'סוכני ביטוח', 'ייעוץ משכנתאות ופיננסים', 'רואי חשבון ומיסוי'] },
];

// שם-קובץ מלא לאייקון (עם סיומת-צבע) — variant: 'navy'|'yellow'|'white', ברירת-מחדל 'navy'
// (הגוון בשימוש בכל בוררי-הרישום, על רקע בהיר-ניטרלי).
window.catIconFile = function (cat, variant) {
  return cat.img + '-' + (variant || 'navy') + '.png';
};
