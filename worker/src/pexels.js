const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
const RESULTS_PER_QUERY = 5;

// תגית עברית (כמו ב-business.html/business-dashboard.html) → מונח חיפוש באנגלית — Pexels היא ספריית
// תמונות סטוק גנרית ומחפשת לפי מושגים ויזואליים באנגלית, לא לפי טקסט עברי חופשי. אותה רשימה בדיוק
// כמו ב-image-fallback-demo.html, כדי שלא תהיה סטייה בין הדמו לבין הקוד האמיתי.
const TAG_TO_QUERY = {
  'מסעדות וברים': 'restaurant bar interior',
  'בתי קפה ומאפיות': 'cafe bakery pastries',
  'קצביות ודגים': 'butcher fish market',
  'קייטרינג ומשלוחים': 'catering food delivery',
  'מתוקים וקינוחים': 'desserts sweets bakery',
  'מוזיקה ודיג\'יי': 'dj music concert',
  'אטרקציות ומתנפחים': 'party inflatable attraction',
  'אוכל ואלכוהול לאירועים': 'event catering bar drinks',
  'צילום ומדיה': 'photography camera studio',
  'עיצוב והפקת אירועים': 'event decoration design',
  'מוסכים וחלקי חילוף': 'car garage mechanic auto parts',
  'מצברים וחשמלאות': 'car battery electrician',
  'ציוד ואביזרי רכיבה': 'motorcycle riding gear',
  'שליחויות ולוגיסטיקה': 'delivery logistics van',
  'שירותי דרך וגרר': 'tow truck roadside assistance',
  'בנייה ושיפוצים': 'construction renovation tools',
  'נגרות וריהוט': 'carpentry furniture workshop',
  'עיצוב ופיתוח גינות': 'garden landscaping design',
  'ניקיון ואחזקה': 'cleaning service home',
  'הדברה ומנעולנים': 'pest control locksmith',
  'בגדים ואופנה': 'fashion clothing store',
  'תכשיטים ויהלומים': 'jewelry diamonds store',
  'משקפיים ואביזרי אופנה': 'eyewear glasses store',
  'מספרות וטיפוח': 'hair salon barber',
  'מרפאות ורופאים': 'medical clinic doctor',
  'רפואה משלימה וטיפול קנאביס': 'alternative medicine wellness therapy',
  'קעקועים': 'tattoo studio',
  'חנויות ספורט וגלישה': 'sports surf shop',
  'אטרקציות ופנאי': 'leisure activity fun',
  'כושר ותזונה': 'gym fitness nutrition',
  'פיתוח ואוטומציות': 'software development coding',
  'בניית אתרים ודיגיטל': 'web design digital agency',
  'חבילות תקשורת וסלולר': 'mobile phone telecom',
  'מחשוב ומעבדות תיקון': 'computer repair lab',
  'חנות טלפונים': 'phone store electronics',
  'עורכי דין ומשפט': 'law office lawyer',
  'סוכני ביטוח': 'insurance agent office',
  'ייעוץ משכנתאות ופיננסים': 'financial advisor mortgage',
  'רואי חשבון ומיסוי': 'accountant tax office',
};

// תמונת ברירת מחדל לעסק שלא העלה תמונה משלו — מחפשת לפי התגית הספציפית של העסק (לא הקטגוריה
// הרחבה), כי Pexels היא ספריית תמונות סטוק גנרית ולא מכירה את העסק עצמו. מחזירה כמה מועמדות
// כדי שמנהל יבחר את המתאימה ביותר (ר' docs/PROJECT_CONTEXT.md — אישור עצמאי, לא דרך pendingChanges).
export async function suggestFallbackImages(env, tag) {
  // "modern professional" מוסיף הטיה בדירוג הרלוונטיות של Pexels לכיוון תמונות עדכניות וברמה
  // מקצועית — בלי זה התוצאות נוטות להיות ישנות/גנריות מדי לקהל היעד (ר' docs/PROJECT_CONTEXT.md).
  const query = `${TAG_TO_QUERY[tag] || tag} modern professional`;
  const resp = await fetch(
    `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=${RESULTS_PER_QUERY}&orientation=landscape`,
    { headers: { Authorization: env.PEXELS_API_KEY } }
  );
  if (!resp.ok) throw new Error('pexels_call_failed: ' + (await resp.text()));

  const data = await resp.json();
  const photos = data.photos || [];
  return photos.map((p) => ({
    url:       p.src.large,
    thumbUrl:  p.src.medium,
    credit:    p.photographer,
    creditUrl: p.photographer_url || p.url,
  }));
}
