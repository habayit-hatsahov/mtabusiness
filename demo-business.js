// ══ §516 — עסק לדוגמה ל"האזור של בעל עסק" בלינק התצוגה ═══════════════════════════════════
// מומצא לגמרי, לא קיים ב-Firestore ולא מופיע באינדקס. business-dashboard.html?demo=1 מציג אותו
// כאילו נטען מהשרת – כך האורח רואה את הדשבורד האמיתי (אותו קוד, אותו עיצוב) בלי לגעת בעסק אמיתי.
// ⚠️ מבנה השדות זהה לעסק מאושר אמיתי (נדגם 13.10). שדה חדש בדשבורד שחסר כאן = ריק בתצוגה, לא שגיאה.
(function () {
  'use strict';
  var day = function (open, close) { return { closed: false, open: open, close: close }; };
  var now = new Date();
  var approved = new Date(now.getTime() - 40 * 86400e3);
  window.YZ_DEMO_BIZ = {
    id: 'yz-demo-business',
    status: 'approved',
    name: 'קפה הצפון',
    desc: 'בית קפה שכונתי עם מאפים טריים כל בוקר, קפה מקלייה מקומית וארוחות בוקר עד הצהריים. אוהדי מכבי מקבלים יחס של בית.',
    categoryPrimary: 'food',
    tags: ['מסעדות וברים'],
    bizTypes: ['physical'],
    phone: '03-0000000',
    whatsapp: '050-0000000',
    instagram: '',
    facebook: '',
    website: '',
    branches: [{ city: 'תל אביב', address: 'רחוב הדוגמה 12' }],
    hoursMode: 'fixed',
    hoursDays: [day('07:00', '20:00'), day('07:00', '20:00'), day('07:00', '20:00'), day('07:00', '20:00'),
                day('07:00', '20:00'), day('07:00', '14:00'), { closed: true, open: '', close: '' }],
    hasDiscount: true,
    discountText: '15% הנחה',
    discountTextFull: '15% הנחה על כל התפריט',
    discountCode: '',
    discountTypes: ['physical'],
    discountRedeemMode: ['physical'],
    discountBuilder: { type: 'percent', percent: '15', otherText: '' },
    additionalDiscounts: [],
    ownerFirst: 'ישראל',
    ownerLast: 'ישראלי',
    tier: '',
    photos: [],
    coverPhoto: 'images/landing/benefits-crowd.jpg',
    coverPhotoThumb: 'images/landing/benefits-crowd.jpg',
    coverPhotoPosition: '50% 50%',
    logo: '',
    approvedAt: approved,
    submittedAt: new Date(approved.getTime() - 2 * 86400e3),
    agreedTermsAt: approved,
    hoursNoticeFirstSeen: approved,
    wantsBusinessOfWeek: true,
    wantsBenefitOfWeek: true,
    note: '',
    pendingChanges: null,
  };
  // "השבוע אצלך" – 6 שבועות מומצאים, מהנוכחי לאחור (אותו מבנה כמו /biz-weekly-stats)
  var weeks = [], d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());   // ראשון של השבוע הנוכחי
  var sample = [[412, 63, 11, 7], [388, 57, 9, 5], [341, 49, 12, 6], [296, 41, 7, 4], [270, 35, 6, 3], [198, 22, 3, 2]];
  sample.forEach(function (s, i) {
    var w = new Date(d); w.setUTCDate(d.getUTCDate() - 7 * i);
    weeks.push({ start: w.toISOString().slice(0, 10), imp: s[0], open: s[1], contact: s[2], hearts: s[3] });
  });
  window.YZ_DEMO_BIZ_STATS = { ok: true, weeks: weeks };
})();
