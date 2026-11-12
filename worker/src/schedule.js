// ══ §775 — משימות חד-פעמיות בתאריך (הוורקר, כל 5 דק') ═══════════════════════════════════════════
// רמי (12.11): "תעביר את Glory לקרוסלה האמיתית ל-16.11 ותחליף את ה-10% בכרטיס ב-50 ₪ מתנה – תעשה שזה יקרה לבד בתאריך הזה".
// • כל משימה רצה פעם אחת, מהיום שלה (שעון ישראל) ועד until. אחרי שרצה – scheduledJobs/{id} (רק לשרת; בלי חוקים
//   = סגור לכולם) עם התוצאה והגיבוי, וזה גם הסימן שלא להריץ שוב. מחוץ לחלון – בלי שום קריאה ל-Firestore.
// • glory-2611-start (16.11): ההטבה בקרוסלה (homeCarousel/current.ben – כל ה-map, כמו הדמו המאושר glory-preview.html,
//   בלי הקוד: הקוד נקרא מ-bizCodes, לחברים בלבד) + בכרטיס העסק: הטקסט והקוד (MTA50). הערכים הקודמים נשמרים בגיבוי.
// • glory-2611-end (2.12): מחזיר לכרטיס את הטקסט והקוד הקודמים – רק אם לא השתנו מאז (עריכה של רמי / בעל העסק נשארת).
//   הקרוסלה לא משתנה: אחרי 1.12 ההטבה לא בתוקף והתיבה מציגה "בקרוב" לבד.
import { getGoogleAccessToken } from './jwt.js';
import { firestoreGetDoc, firestorePatch, firestoreCreateDocWithId } from './firestore.js';

const GLORY = 'UN1zkEcAjbDaXKl3XYmV';
const GLORY_CARD = { discountText: '50 ₪ מתנה על כל האתר', discountTextFull: '50 ₪ מתנה על כל האתר – ללא הגבלה, כולל כפל מבצעים', discountCode: 'MTA50' };
export const GLORY_BEN = {
  "start": "2026-11-16",
  "end": "2026-12-01",
  "badge": "הטבת אונליין בלעדית",
  "tag2": "",
  "slideTitle": "50 ₪ מתנה",
  "slideHint": "בקוד קופון · באתר",
  "brandLogo": "images/weekly/glory-logo.png",
  "brandLogoCrop": [
    26,
    160,
    660,
    58,
    625
  ],
  "brandLogoClear": true,
  "titleBottom": true,
  "slidePrice": "ללא הגבלה · כולל כפל מבצעים",
  "sizeExtra": "",
  "more": "לפרטים",
  "prices": [],
  "options": [],
  "after": "",
  "img": "",
  "heroImg": "",
  "bg": "",
  "photo": "images/weekly/bull-glory.jpg",
  "photoBg": "#FEDB05",
  "photoH": 300,
  "photoTop": -10,
  "photoLeft": -24,
  "photoFadeBottom": 0,
  "slidePhoto": {
    "photoH": 262,
    "photoTop": 2,
    "photoLeft": -6,
    "photoFadeBottom": 0
  },
  "heroWide": "images/weekly/bull-glory-trio.jpg",
  "title": "50 ₪ מתנה ב-Glory Street",
  "hint": "הטבת אונליין · ללא הגבלה · כולל כפל מבצעים",
  "intro": "Glory Street – מותג אופנת רחוב בהשראת אייקונים מעולם הכדורגל, הכדורסל, ההיפ הופ וה-UFC. לחברי Yellow Zone, לזמן מוגבל, באתר:",
  "gifts": [
    {
      "big": "50 ₪",
      "line": "מתנה",
      "sub": ""
    }
  ],
  "promo": {
    "title": "ובנוסף – המבצע באתר",
    "text": "• 2 חולצות – 50 ₪ הנחה\n• 3 חולצות – 100 ₪ הנחה\nוה-50 ₪ שלנו מצטרפים גם למבצע."
  },
  "shop": {
    "title": "החולצות של Glory Street",
    "url": "https://glory-street.com/",
    "max": 16,
    "site": "glory"
  },
  "cycNote": "ב-1 וב-16 בכל חודש עולה הטבה בלעדית חדשה, רק לחברי Yellow Zone ולזמן מוגבל.",
  "whereTitle": "איפה מממשים · הטבת אונליין",
  "biz": [
    {
      "id": "UN1zkEcAjbDaXKl3XYmV",
      "name": "Glory Street",
      "area": "חנות אונליין · glory-street.com",
      "logo": "https://firebasestorage.googleapis.com/v0/b/habayit-hatsahov.firebasestorage.app/o/businesses%2FUN1zkEcAjbDaXKl3XYmV%2Flogo_1786989109477_thumb?alt=media&token=db86b096-3d25-4708-aedd-2d3c67eee0a3"
    }
  ],
  "coupon": {
    "url": "https://glory-street.com/",
    "siteLabel": "לאתר",
    "btn": "לקבלת קוד הקופון",
    "note": "מזינים את הקוד בקופה באתר – 50 ₪ יורדים מהסכום.",
    "guestLine": "הקוד לחברי Yellow Zone בלבד. מתחברים ומקבלים אותו מיד."
  },
  "howTitle": "איך זה עובד",
  "how": "• לוחצים \"לקבלת קוד הקופון\" ומעתיקים את הקוד\n• נכנסים לאתר Glory Street ובוחרים מה שאוהבים\n• בקופה מזינים את הקוד – 50 ₪ יורדים, גם על מבצעי האתר\n• בתוקף עד {end}",
  "bizNoun": "עסקים"
};

const pick = (f, keys) => Object.fromEntries(keys.map(k => [k, typeof f[k] === 'string' ? f[k] : '']));

export const JOBS = [
  { id: 'glory-2611-start', day: '2026-11-16', until: '2026-11-20', async run(env, t) {
    const b = await firestoreGetDoc(env, t, `businesses/${GLORY}`);
    if (!b) throw new Error('glory_missing');
    const before = pick(b.fields, Object.keys(GLORY_CARD));
    await firestorePatch(env, t, 'homeCarousel/current', { ben: GLORY_BEN, updatedAt: new Date(), updatedBy: 'schedule:glory-2611' });
    await firestorePatch(env, t, `businesses/${GLORY}`, GLORY_CARD);
    return { before };
  } },
  { id: 'glory-2611-end', day: '2026-12-02', until: '2026-12-06', async run(env, t) {
    const st = await firestoreGetDoc(env, t, 'scheduledJobs/glory-2611-start');
    const before = st && st.fields && st.fields.before;
    if (!before) return { skipped: 'no_backup' };
    const b = await firestoreGetDoc(env, t, `businesses/${GLORY}`);
    const restore = {}, kept = [];
    for (const k of Object.keys(GLORY_CARD)) { if (b && b.fields[k] === GLORY_CARD[k]) restore[k] = before[k] || ''; else kept.push(k); }
    if (Object.keys(restore).length) await firestorePatch(env, t, `businesses/${GLORY}`, restore);
    return { restored: Object.keys(restore), kept };
  } },
];

export function ilDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function runScheduledJobs(env, now = new Date(), jobs = JOBS) {
  const day = ilDay(now), due = jobs.filter(j => day >= j.day && day <= j.until), ran = [];
  if (!due.length) return { day, ran };
  const t = await getGoogleAccessToken(env);
  for (const j of due) {
    if (await firestoreGetDoc(env, t, `scheduledJobs/${j.id}`)) continue;   // כבר רצה
    const res = await j.run(env, t);
    await firestoreCreateDocWithId(env, t, 'scheduledJobs', j.id, { ...res, ranAt: now, day });
    ran.push(j.id);
  }
  return { day, ran };
}
