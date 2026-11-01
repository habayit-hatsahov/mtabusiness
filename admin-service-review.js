// ══ §710 – "איך מקבלים את השירות": מעבר אחד-אחד על נותני השירות ═══════════════════════════
// הדמו המאושר: service-review-demo.html + המילון service-terms-demo.html (§710, סבבים 2–7).
// לכל עסק שסימן "בעל מקצוע" (bizTypes כולל 'pro'): התיאור, מה סימן היום, הצעה שנכתבה מתוך התיאור,
// ואותה שאלה בדיוק כמו בטופס ההרשמה. "אישור" שומר בעסק:
//   serviceModes: ['toClient' | 'atMine' | 'remote', ...]  – מה שמוצג ללקוחות (עד אליך / מגיעים אליו / מרחוק)
//   serviceSetBy: 'admin', serviceSetAt: ISO               – הכרטיס הצהוב לבעל העסק נשען על זה (שלב 2)
//   regions (כשסומן "אני מגיע ללקוח") · branches (כשסומן "הלקוח מגיע אליי" ואין לו סניף)
// השמירה עוברת ב-saveSectionUpdates (יומן + ניקוי בקשה ממתינה על אותו שדה), בלי חלון "לסל" (§705ה) –
// לבעל העסק יוצאים הכרטיס הצהוב (שלב 2) והודעה משלנו (שלב 3).
// אין "אשר הכול" – בכוונה (רמי: "אני חייב לעבור אחד אחד").
// ⚠️ השדות עדיין לא ב-PUBLIC_FIELDS (worker/src/bizpublic.js) – לא מוצגים באתר עד שלב 5.

let C = null;
export function init(ctx) { C = ctx; }

// המילון: בעל העסק (וכאן – אתה בשמו) עונה בגוף ראשון; ליד כל תשובה – מה יופיע ללקוחות
const MODES = [
  ['toClient', 'אני מגיע ללקוח', 'לבית, למשרד, לאירוע'],
  ['atMine', 'הלקוח מגיע אליי', 'סטודיו, קליניקה, משרד'],
  ['remote', 'מרחוק', 'טלפון, זום, משלוח'],
];
export const LABEL = { toClient: '🚗 עד אליך', atMine: '📍 מגיעים אליו', remote: '💻 מרחוק' };
const REGIONS = ['כל הארץ', 'גוש דן', 'ירושלים והסביבה', 'השפלה', 'השרון', 'חיפה והצפון', 'הדרום'];
const CONF = { n: 'אין הצעה', u: 'לא ברור', l: 'סביר', s: 'בטוח' };
const ORDER = { n: 0, u: 1, l: 2, s: 3 };
const TYPE_HE = { physical: 'חנות', online: 'אונליין', pro: 'בעל מקצוע' };

const S = { filter: 'todo', draft: {}, editing: {}, busy: null };

// ההצעות – נכתבו ב-1.11.2026 מתוך התיאור של כל אחד מ-80 העסקים (id → [מצבים, ביטחון, הציטוט/הנימוק])
const SUG = {
  // 13 עסקים שממתינים לאישור (נמצאו בבדיקה ב-1.11 – לא היו ב-bizPublic)
  "IxkYnh7qKVlIXFzuTh5o":["toClient","s","\"יעוץ, אספקה והתקנת מערכות אזעקה, מצלמות\""],
  "9edl8eaWFRW5utVpDGiP":["toClient","s","\"חלונות, דלתות, פרגולות... סגירת מרפסות\""],
  "mkNdQgu6UtyCQkd5NS5n":["remote","s","\"בניית אתרים, שיווק ברשתות... תמונות וסרטונים ב-AI\""],
  "NbXduwZT8NK5i01b1bRS":["atMine,remote","u","סוכנות ביטוח – סימן גם חנות (ראשון לציון), לא כתוב איך עובדים"],
  "ym1Qd1ClpOnnkfIVhCtW":["toClient","l","\"מערכות טיהור מים... החלפת מסננים לבית או לעסק\""],
  "YYgtMQtWW2fWnMgjzGVe":["toClient","s","\"אתם מארחים אנחנו מביאים את איטליה\""],
  "CsdEmHbLfztYBvpgNuCH":["atMine","s","\"על המקום: קליניקה לעיסוי רפואי בכפר חב״ד\""],
  "ckyGYDCVoQfeyMsW7HDw":["toClient","s","\"שף בשריים פרטי עד בית הלקוח\""],
  "C4yPpAaatvImKQri06G2":["toClient","u","מעסה – לא כתוב אם יש קליניקה או שמגיע הביתה"],
  "awcaQqiIH81EqikIOxG9":["toClient","s","\"הפעלות ימי הולדת\""],
  "HTqgZjIhXVrjbJ39P10H":["remote","l","\"שקיות צ׳ייסרים... בעיצוב אישי\" – נשלח"],
  "qQU7setVawTKNmGfU54P":["atMine,toClient","l","\"מודלים בעיצוב אישי עד בית הלקוח\" + עיר ראשון לציון"],
  "bjxGVrOI8RF6NSL0lz9n":["remote","l","\"מלווה ארגונים... אוטומציות, סוכני AI\""],
 "0N33cE117xAGpb5Rn2j5":["remote","s","\"סרטונים... מותאמים אישית\" – נשלח, לא מגיע"],
  "0p84vreMd0SEuL76Z0CA":["atMine","l","\"ממוקדת באזור, בסמוך לבלומפילד\" – משרד"],
  "1qgJMbJkYgcubAnNKs9I":["remote","u","אין רמז בתיאור – סוכן ביטוח, כנראה בטלפון"],
  "3LtqAKMRjeENUu9VHrkN":["toClient","s","\"נקיון ספות, מזרנים... נקיון בתים\""],
  "3RLFmfEqJ8NL8n6jDvQo":["toClient","s","\"מכירה, התקנה, ניקוי ותיקונים\""],
  "3bo1ALEJiLf3j2JCnif9":["remote","u","אין רמז בתיאור – סוכנות ביטוח"],
  "4FtUMFawUaLUM9Oip8ni":["remote","u","אין רמז בתיאור – סוכן ביטוח"],
  "4SUNYjFbLELFFOTj3egx":["toClient","s","DJ לאירועים"],
  "4jCvU8WT15wm0L81VwVT":["remote","u","ייעוץ עסקי – לא כתוב איפה"],
  "4xipe2kJkpbrrMDgEFXa":["toClient","l","\"מדריך טיולים... ברחבי ישראל\""],
  "5FnZnUgZAdJOsZ2D4sd3":["toClient","s","\"דייגי לכל סוגי האירועים\""],
  "6EhqOzAUQE30Jztm4noZ":["toClient","s","\"עבודות הנדימן... חידושי דקים\""],
  "75EBtdQGAGnU88XYQqon":["toClient","s","\"בר קוקטיילים נייד לאירועים\""],
  "7YsyJz2nYFuOxXoy2rAt":["toClient","s","\"הנדימן ושיפוצים... הבית שלכם\""],
  "87E13CbmbhOnBtVjt1zF":["toClient","l","\"מפיק אירועים פרטי\""],
  "8A9BRilHUSoaqRlZkxQf":["toClient","s","\"מגיעים לכל חלקי הארץ\" – סימן גם חנות (נס ציונה)"],
  "8b5iTxq7messECFdZ5U5":["atMine,remote","u","\"ליווי אישי\" – יש עיר (חולון), לא כתוב איך"],
  "AScHbFfRlB8Al3wyAtzS":["atMine","u","\"תכשיטי יהלומים בעיצוב אישי\" – אין כתובת בכלל"],
  "ATqj3It1irQJkDOtaF0r":["toClient","u","\"שיקום וטיפול פציעות\" + בחר אזורים (גוש דן, השפלה) ולא מילא כתובת – כנראה מגיע ללקוח"],
  "BRbkOdjX9FgiKZdXrsSf":["toClient","l","מתווך – מראה נכסים, \"מתמחה בראשל״צ\""],
  "BSam4To3xfqtFqBm1cno":["toClient","s","\"הפקות אירועים מוזיקה לחתונות\""],
  "BoTjIZw1enBJLjxCv7Zv":["toClient","l","\"תכנון, עיצוב והפקה\" – יש גם משרד בתל אביב"],
  "EQAZJApt4hOdjek9iU6t":["atMine,remote","u","עורך דין – משרד, לא כתוב"],
  "FKu286BmpLwzKhjZHxkO":["remote","l","\"מוצרי פרסום... בהדפסה אישית\" – נשלח"],
  "FzQaYTLD4dLLrsrSTw7N":["remote","l","\"מיתוג, שיווק, קריאייטיב וסושיאל\""],
  "GPNfKxdGggwIYQUq820s":["remote","l","\"סוכנות פרסום\""],
  "Gdi0KHLHlq9nvzsuYnCe":["atMine","u","\"עוגות מעוצבות... מראשון לציון\" – איסוף או משלוח?"],
  "IWCYFGiFxGKJHav40zTX":["remote","l","\"שילוח בינלאומי ועמילות מכס\" – יש משרד בפ\"ת"],
  "KyA8WrXkv6s83tQH6Zjz":["toClient","s","\"השכרת מתנפחים, דוכני מזון\""],
  "Lbcdo3M7SGpMZ8wdATZ2":["toClient","s","\"שירותי מנוף להרמת רהיטים\""],
  "MW6l51vWecy2btKSGb0v":["toClient","s","\"פרגולות, סגירת מרפסות, תיקוני תריסים\""],
  "NvGpTo4IoWxe78ua8NlE":["remote","l","\"מערך מכירות ושירות הכולל צוות נציגים\""],
  "Oo3cIGmQ4rwwrUBEzeNn":["atMine,remote","u","\"משרד משפחתי... לייעוץ מס\""],
  "Or6rtDLeI6ZSkqYghVxq":["toClient","l","\"צלם ועורך וידאו: צילומי תדמית, זוגות\""],
  "PoBjzZlgTS4xZP8h5cS2":["remote","l","\"עובדים עם כל החברות\""],
  "Pqv9vKkqJ0WhoCDlEMnz":["toClient","s","DJ"],
  "Ra4upZfqvilfC7Y2nR0Q":["toClient","s","\"חברת הדברה\""],
  "RzE1eQj3e4i8b0fzo9Fu":["toClient","l","\"שדרוג לובי בנייני מגורים\""],
  "Tkx5xgnxO8w6Ht5sAlJ5":["toClient","s","\"מגיעים עד אליכם הביתה\""],
  "Ty6TM5SHFyGkqwl72w2k":["atMine,remote","s","\"ניתן להגיע פיזית אלינו... גם בצורה דיגיטלית\""],
  "Va05Y90CEzq595kVGmKp":["toClient","s","\"מתנפחי ספורט וקרנבל\""],
  "XXLj89LcL5ON90lB0Mq3":["toClient","s","\"פרגולות דקים\""],
  "ZygPRGkWu4ZvIJtVQyLj":["toClient","s","\"עמדות צילום... לאירועים שלכם\""],
  "a1QIIkYOZBGdWKpLTkKe":["atMine","l","\"קעקועים\" – סטודיו בירושלים (ציורי קיר אצל הלקוח?)"],
  "bvPyPt7LBB329I8Epvsm":["toClient","s","\"סנפלינג איטום שיקום\""],
  "cy7g8MaRgK2eokkrXLjf":["toClient","s","\"נגרות בהתאמה אישית... תכנון וביצוע\""],
  "eBz4FVmPktcwHUSgnT3T":["toClient","s","\"מעצב גינות... כולל ביצוע\""],
  "eKI9bxmYjOdJgFLQXYHN":["toClient","s","\"דיג׳יי... חתונות\""],
  "euX2q4aoTeihj2KBb119":["atMine","s","\"האימונים מתקיימים בחדר כושר\""],
  "fZPkPGeaxa0ShPcarKB9":["toClient","s","\"התקנת מצלמות אבטחה\""],
  "fdfp1v5ZrhhstDDpFSN9":["toClient","s","\"טכנאי גז למגזר הפרטי\""],
  "g0wIxqhZIlANRaZTn8Lq":["toClient","l","\"מופיע ברחבי הארץ\""],
  "hWICcMLswB7o8i0BzBYi":["toClient","l","מתווך – \"בחולון, בת ים, ראשון\""],
  "hk8mcFfo30naKPVXbBw3":["atMine","l","\"קיים משרד לפגישות והזמנות בבורסה ברמת גן\" – לא כתוב שמגיע"],
  "iTAPUYSEd4IOhNJfTuwg":["toClient","s","\"מנעולן - פריצת דלתות\""],
  "jdXI8IL3pvs9NkoVmo0R":["toClient","s","\"משלוחים והפצה בפריסה ארצית\""],
  "jnJ6l8p4hw9tyHJvtmpn":["toClient","s","\"עד בית הלקוח\""],
  "jwVFrjXyy6ow5gGtca8k":["toClient,remote","s","\"אישורי הגעה ב־WhatsApp... מגיעים עד לאירוע שלכם\""],
  "k9ze75reNJUTQaat802k":["atMine","s","\"סוכנות רכבים\" – מגרש בחולון"],
  "ki5zPkwAafXqUe3hAIcE":["toClient","s","\"מעטפות, חבילות, מסירות משפטיות\""],
  "mKQbmIcQWi1TC8jnuCGi":["toClient","l","אילוף כלבים – בדרך כלל בבית"],
  "mRrm0K4K1KQh34iA2Orn":["toClient","s","\"הכל לבית כל התיקונים\""],
  "mkqXY3yYZtiAEwonZcyL":["atMine,toClient","l","\"אין צורך בהגעה לחנות\" + חנות במודיעין"],
  "msLNjkk8q0DH23vuWoCK":["toClient","s","\"כל עבודות החשמל לבית ולעסק\""],
  "mzHPKa7Qi4n13kB2gLah":["atMine,remote","u","עורך דין – לא כתוב"],
  "nEgf4ccSlGfO6ZO3b8RY":["toClient","s","\"צילום אירועים\""],
  "qFNyqQa6jKT7DPFsejv7":["toClient","s","\"דיגיי לאירועים\" – אין אזורים, צריך לבחור"],
  "qaxmMnLhYZ6kYve38ePX":["toClient","s","\"מנעולן מוסמך\""],
  "snmDsqGhMRca7eTKiOuM":["toClient","s","\"התקנה, שירות ותיקון של כל סוגי המזגנים\""],
  "t4O5xUzCvxqAt0qJ7J0h":["remote","s","\"מיתוג ועיצובים... פתרונות AI\""],
  "taTSoFEYMqzM4VbdR7Jl":["toClient","l","\"שמאות מקרקעין\" – מגיע לנכס"],
  "uYqDS1X77BfriptLwHY0":["remote","l","\"מכירה לאינטרנט ביתי\" – בטלפון"],
  "vthc6LdLrTyEhOSC3lTO":["toClient","s","\"דייגי חתונות\""],
  "wuUHZyBAWU1a1v21PZwu":["toClient","s","\"לבנייני מגורים, למשרדים\""],
  "wv5QEtF3RYJHZMO5uqnd":["toClient","l","\"Dj לימי הולדת אפטרים של חתונות\""],
  "wxrz5Vyux3b1KIMssffS":["toClient","s","\"מגיעות עד האירוע שלכם\""],
  "y2qRrl7F6EvibRhSTWgf":["remote","s","\"פיתוח ועיצוב אתרים\""],
  "yiMuMp20NcspznMSINcg":["toClient","s","\"קרונות שירותים... לאירועים בטבע\""],
  "z5RUoys6RsoWd9aG50zz":["remote","u","סוכן ביטוח – לא כתוב"],
  "zRlxLLBHen8m7KNLoblm":["remote,toClient","l","\"צילום ועריכה | ניהול דיגיטל\""]};

const esc = (v) => C.esc(v == null ? '' : String(v));
const sug = (b) => { const s = SUG[b.id]; return s ? { modes: s[0].split(','), conf: s[1], why: s[2] } : { modes: [], conf: 'n', why: '' }; };
const isDone = (b) => Array.isArray(b.serviceModes) && b.serviceModes.length > 0 && !!b.serviceSetBy;
const cities = (b) => (b.branches || []).map((x) => x && x.city).filter(Boolean);

function list() {
  return C.biz().filter((b) => (b.bizTypes || []).includes('pro') && (b.status === 'approved' || b.status === 'pending'));
}
export function pendingCount() { return C ? list().filter((b) => !isDone(b)).length : 0; }

// טיוטת עבודה לכל עסק: מה שכבר שמור בו, ואם עוד לא – ההצעה + האזורים שכבר אצלו
function draft(b) {
  if (!S.draft[b.id]) {
    S.draft[b.id] = {
      modes: isDone(b) ? [...b.serviceModes] : [...sug(b).modes],
      regions: [...(b.regions || [])],
      city: '', address: '',
    };
  }
  return S.draft[b.id];
}
function problems(b, d) {
  const p = [];
  if (!d.modes.length) p.push('לבחור לפחות תשובה אחת');
  if (d.modes.includes('toClient') && !d.regions.length) p.push('"אני מגיע ללקוח" – חסר אזור');
  if (d.modes.includes('atMine') && !cities(b).length && !(d.city.trim() && d.address.trim())) p.push('"הלקוח מגיע אליי" – חסרים עיר וכתובת');
  return p;
}
// שלב 2 – מה בעל העסק עשה עם הכרטיס הצהוב (business-dashboard.html)
function ownerState(b) {
  if (b.serviceSetBy !== 'admin') return '';
  if (b.pendingChanges && 'serviceModes' in b.pendingChanges) return '<span class="svr-own wait">⏳ בעל העסק ביקש לשנות – ב"מה פתוח בעסק הזה"</span>';
  if (b.serviceOwnerAckAt) return '<span class="svr-own ok">✓ בעל העסק אישר</span>';
  return '<span class="svr-own">בעל העסק עוד לא ענה</span>';
}
export function lineOf(modes, regions) {
  return (modes || []).map((m) => LABEL[m] + (m === 'toClient' && regions && regions.length ? ' · ' + regions.join(', ') : '')).join(' + ');
}

function cardHtml(b) {
  const sg = sug(b), done = isDone(b) && !S.editing[b.id];
  // כתובת – תמיד מוצגת, גם כשאין. ⚠️ טופס ההרשמה מעולם לא שאל נותן שירות כתובת (רק אזורים),
  // אז "לא מילא" לא מוכיח שאין לו קליניקה – רק רמז, יחד עם האזורים שבחר.
  const addr = (b.branches || []).map((x) => x && [x.city, x.address].filter(Boolean).join(' ')).filter(Boolean);
  const nowLine = `<b>היום:</b> ${(b.bizTypes || []).map((t) => TYPE_HE[t] || t).join(' + ')}` +
    ((b.regions || []).length ? ` · אזורים: ${esc(b.regions.join(', '))}` : ' · <span class="svr-warn">בלי אזורים</span>') +
    (b.status === 'pending' ? ' · <span class="svr-warn">ממתין לאישור</span>' : '') +
    `<br><b>כתובת:</b> ${addr.length ? '📍 ' + esc(addr.join(' | ')) : '<span class="svr-noaddr">לא מילא כתובת</span>'}` +
    ` · <a class="svr-card" href="admin-dashboard.html?biz=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">כרטיס העסק ↗</a>`;
  const head = `
    <div class="svr-hd">
      ${b.coverPhotoThumb || b.coverPhoto ? `<img src="${esc(b.coverPhotoThumb || b.coverPhoto)}" alt="" loading="lazy">` : '<span class="svr-noimg"></span>'}
      <div class="svr-hd-t">
        <div class="svr-nm">${esc(b.name)}</div>
        <div class="svr-tg">${esc((b.tags || []).join(' · '))}</div>
        <div class="svr-now">${nowLine}</div>
      </div>
      ${done
        ? `<div class="svr-done-t">✓ ${esc(lineOf(b.serviceModes, b.regions))}<small>${b.serviceSetBy === 'owner' ? 'בעל העסק עדכן' : 'אישרת'}${b.serviceSetAt ? ' · ' + esc(new Date(b.serviceSetAt).toLocaleDateString('he-IL')) : ''}</small>${ownerState(b)}</div>
           <button class="svr-redo" onclick="svrEdit('${b.id}')">לשנות</button>`
        : `<span class="svr-conf ${sg.conf}">${CONF[sg.conf]}</span>`}
    </div>`;
  if (done) return `<div class="svr-biz done" data-id="${b.id}">${head}</div>`;
  const d = draft(b), pr = problems(b, d);
  return `
  <div class="svr-biz" data-id="${b.id}">${head}
    <div class="svr-desc" onclick="this.classList.toggle('open')">${esc(b.desc) || '<i>אין תיאור</i>'}</div>
    <div class="svr-why"><b>ההצעה שלי:</b> ${sg.modes.length ? esc(sg.modes.map((m) => LABEL[m]).join(' + ')) + ' – ' + esc(sg.why) : 'אין הצעה (עסק שנרשם אחרי 1.11) – תבחר לפי התיאור'}</div>
    <div class="svr-q">איפה הוא נותן את השירות? <span>(אפשר כמה)</span></div>
    <div class="svr-modes">${MODES.map(([k, h, s]) => `
      <div class="svr-mode${d.modes.includes(k) ? ' on' : ''}${sg.modes.includes(k) ? ' sug' : ''}" onclick="svrMode('${b.id}','${k}')">
        <b>${h}</b><span>${s}</span><span class="svr-shows">ללקוחות: <b>${LABEL[k]}</b></span></div>`).join('')}</div>
    ${d.modes.includes('toClient') ? `<div class="svr-sf"><label>לאיזה אזורים?</label><div class="svr-rg">${REGIONS.map((r) =>
      `<span class="${d.regions.includes(r) ? 'on' : ''}" onclick="svrReg('${b.id}','${r}')">${r}</span>`).join('')}</div></div>` : ''}
    ${d.modes.includes('atMine') ? (cities(b).length
      ? `<div class="svr-sf"><label>כתובת</label><div class="svr-has">מהסניפים שלו: ${esc((b.branches || []).map((x) => [x.city, x.address].filter(Boolean).join(' ')).join(' | '))}</div></div>`
      : `<div class="svr-sf"><label>כתובת <span>(אין לו סניף – תיכנס כסניף 1)</span></label><div class="svr-addr">
          <input id="svrIn_c_${b.id}" placeholder="עיר" value="${esc(d.city)}" oninput="svrAddr('${b.id}','city',this.value)">
          <input id="svrIn_a_${b.id}" placeholder="רחוב ומספר" value="${esc(d.address)}" oninput="svrAddr('${b.id}','address',this.value)"></div></div>`) : ''}
    ${(b.bizTypes || []).includes('physical') ? '<div class="svr-store">ℹ️ סימן גם "חנות" – הסניפים שלו נשארים כמו שהם. אם הוא לא באמת חנות, משנים בכרטיס העסק.</div>' : ''}
    <div class="svr-act">
      <button class="svr-ok" onclick="svrSave('${b.id}')"${pr.length || S.busy === b.id ? ' disabled' : ''}>${S.busy === b.id ? 'שומר…' : 'אישור'}</button>
      ${S.editing[b.id] ? `<button class="svr-cancel" onclick="svrCancel('${b.id}')">ביטול</button>` : ''}
      <span class="svr-err">${pr.join(' · ')}</span>
    </div>
  </div>`;
}

export function html() {
  const all = list();
  const done = all.filter(isDone);
  const left = (c) => all.filter((b) => !isDone(b) && sug(b).conf === c).length;
  const f = S.filter;
  const shown = all
    .filter((b) => f === 'all' ? true : f === 'done' ? isDone(b) : f === 'todo' ? !isDone(b) : (!isDone(b) && (sug(b).conf === f || (f === 'u' && sug(b).conf === 'n'))))
    .sort((a, b) => (ORDER[sug(a).conf] - ORDER[sug(b).conf]) || String(a.name).localeCompare(String(b.name), 'he'));
  const pct = all.length ? Math.round(done.length / all.length * 100) : 0;
  // מספר על כל תגית (רמי: "ואם אני מאשר – תוריד"); 0 = בלי מספר
  const cnt = { todo: all.length - done.length, u: left('u') + left('n'), l: left('l'), s: left('s'), done: done.length, all: all.length };
  const btn = (k, t) => `<button class="${f === k ? 'on' : ''}" onclick="svrFilter('${k}')">${t}${cnt[k] ? ` <span class="svr-n">${cnt[k]}</span>` : ''}</button>`;
  return `${STYLE}<div class="svr">
    <h2>איך מקבלים את השירות – מעבר על נותני השירות</h2>
    <p class="svr-sub">כל עסק שסימן "בעל מקצוע". לכל אחד: התיאור שכתב, ההצעה שלי (עם הציטוט שעליו נשענתי), ואותה שאלה כמו בטופס – מסומנת מראש. משנים אם צריך ולוחצים "אישור" – נשמר בעסק מיד ונרשם ביומן שלו. הלא ברורים ראשונים.<br>
    עדיין לא מוצג באתר – זה יעלה כשכולם יעודכנו (שלב 5). הכרטיס הצהוב לבעל העסק וההודעה – בשלבים 2–3.</p>
    <div class="svr-top">
      <div class="svr-prog"><i style="width:${pct}%"></i></div>
      <div class="svr-prog-t">אושרו ${done.length} מתוך ${all.length} · נשארו: ${left('n') ? left('n') + ' בלי הצעה, ' : ''}${left('u')} לא ברור, ${left('l')} סביר, ${left('s')} בטוח</div>
      <div class="svr-flt">${btn('todo', 'ממתינים')}${btn('u', 'לא ברור')}${btn('l', 'סביר')}${btn('s', 'בטוח')}${btn('done', 'אושרו')}${btn('all', 'הכול')}</div>
    </div>
    ${shown.map(cardHtml).join('') || '<div class="svr-empty">אין כאן כלום 🎉</div>'}
  </div>`;
}

// ── פעולות (onclick בתוך ה-HTML – חשופות ל-window, ר' feedback_module_scope_onclick) ──
const rerender = () => C.rerender();
const byId = (id) => C.biz().find((b) => b.id === id);
window.svrFilter = (k) => { S.filter = k; rerender(); };
window.svrMode = (id, k) => { const d = draft(byId(id)); d.modes = d.modes.includes(k) ? d.modes.filter((x) => x !== k) : [...d.modes, k]; rerender(); };
window.svrReg = (id, r) => { const d = draft(byId(id)); d.regions = d.regions.includes(r) ? d.regions.filter((x) => x !== r) : [...d.regions, r]; rerender(); };
// הקלדה – בלי ציור מחדש (שומר את הפוקוס); רק הכפתור והשגיאה מתעדכנים
window.svrAddr = (id, k, v) => {
  const b = byId(id), d = draft(b); d[k] = v;
  const el = document.querySelector(`.svr-biz[data-id="${id}"]`); if (!el) return;
  const pr = problems(b, d);
  el.querySelector('.svr-ok').disabled = !!pr.length;
  el.querySelector('.svr-err').textContent = pr.join(' · ');
};
window.svrEdit = (id) => { const b = byId(id); S.editing[id] = true; S.draft[id] = { modes: [...(b.serviceModes || [])], regions: [...(b.regions || [])], city: '', address: '' }; rerender(); };
window.svrCancel = (id) => { delete S.editing[id]; delete S.draft[id]; rerender(); };
window.svrSave = async (id) => {
  const b = byId(id), d = draft(b);
  if (!b || problems(b, d).length || S.busy) return;
  const ORDERED = MODES.map((m) => m[0]).filter((k) => d.modes.includes(k));
  const upd = { serviceModes: ORDERED, serviceSetBy: 'admin', serviceSetAt: new Date().toISOString() };
  if (d.modes.includes('toClient') && JSON.stringify(d.regions) !== JSON.stringify(b.regions || [])) upd.regions = d.regions;
  if (d.modes.includes('atMine') && !cities(b).length) upd.branches = [{ city: d.city.trim(), address: d.address.trim() }];
  S.busy = id; rerender();
  const ok = await C.save(id, upd);
  S.busy = null;
  if (ok) { delete S.editing[id]; delete S.draft[id]; }
  rerender();
};

const STYLE = `<style>
.svr { max-width: 860px; color: var(--text); }
.svr h2 { margin: 0 0 4px; font-size: 21px; color: var(--accent); }
.svr-sub { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; margin: 0 0 10px; }
.svr-top { position: sticky; top: 0; z-index: 4; background: var(--bg); padding: 8px 0 10px; }
.svr-prog { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.svr-prog i { display: block; height: 100%; background: var(--green); }
.svr-prog-t { font-size: 13px; font-weight: 700; margin-top: 6px; color: var(--accent); }
.svr-flt { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.svr-flt button { border: 1.5px solid var(--border); background: #fff; color: var(--accent); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.svr-flt button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.svr-n { display: inline-block; min-width: 20px; padding: 0 6px; margin-right: 3px; border-radius: 999px; background: var(--accent-cta); color: var(--accent); font-size: 11.5px; font-weight: 800; }
.svr-biz { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 13px; margin-top: 10px; }
.svr-biz.done { background: #FBFCFD; }
.svr-hd { display: flex; gap: 12px; align-items: flex-start; }
.svr-hd img, .svr-noimg { width: 64px; height: 48px; object-fit: cover; border-radius: 8px; background: var(--border); flex-shrink: 0; display: block; }
.svr-hd-t { flex: 1; min-width: 0; }
.svr-nm { font-weight: 800; font-size: 15.5px; color: var(--accent); }
.svr-tg { font-size: 12.5px; color: var(--text-muted); margin-top: 1px; }
.svr-now { font-size: 12.5px; color: var(--text-sm); margin-top: 3px; }
.svr-warn { color: var(--orange); font-weight: 700; }
.svr-noaddr { color: var(--text-muted); font-style: italic; }
.svr-own { display: block; margin-top: 3px; font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.svr-own.ok { color: var(--green); }
.svr-own.wait { color: var(--orange); }
.svr-card { color: var(--accent); font-weight: 700; text-decoration: underline; white-space: nowrap; }
.svr-conf { font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.svr-conf.n, .svr-conf.u { background: #FDE7DA; color: var(--orange); }
.svr-conf.l { background: #FFF4C2; color: #7A5B00; }
.svr-conf.s { background: #DFF3E6; color: var(--green); }
.svr-done-t { font-size: 13px; font-weight: 800; color: var(--green); text-align: left; }
.svr-done-t small { display: block; font-weight: 600; color: var(--text-muted); font-size: 11.5px; }
.svr-redo, .svr-cancel { border: 0; background: none; color: var(--accent); font: inherit; font-size: 12.5px; text-decoration: underline; cursor: pointer; white-space: nowrap; }
.svr-desc { margin-top: 10px; font-size: 13.5px; line-height: 1.6; background: var(--bg); border-radius: 10px; padding: 8px 11px; color: var(--text-sm); white-space: pre-line;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
.svr-desc.open { display: block; }
.svr-why { margin-top: 8px; font-size: 13px; }
.svr-q { margin-top: 10px; font-size: 13.5px; font-weight: 800; color: var(--accent); }
.svr-q span, .svr-sf label span { font-weight: 500; color: var(--text-muted); }
.svr-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
.svr-mode { border: 1.5px solid var(--border); border-radius: 12px; padding: 8px; cursor: pointer; text-align: center; user-select: none; }
.svr-mode.on { border-color: var(--accent); background: var(--accent-bg); }
.svr-mode b { display: block; font-size: 13.5px; color: var(--accent); }
.svr-mode > span { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.svr-mode .svr-shows { display: inline-block; margin-top: 5px; background: #fff; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; color: var(--text-sm); }
.svr-mode .svr-shows b { display: inline; font-size: 11px; }
.svr-mode.sug::after { content: 'הוצע'; display: block; width: max-content; margin: 4px auto 0; font-size: 10px; font-weight: 800; background: var(--accent-cta); color: var(--accent); padding: 0 6px; border-radius: 999px; }
.svr-sf { margin-top: 8px; }
.svr-sf label { font-size: 12.5px; font-weight: 700; display: block; margin-bottom: 5px; color: var(--accent); }
.svr-rg { display: flex; flex-wrap: wrap; gap: 5px; }
.svr-rg span { border: 1.5px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; user-select: none; }
.svr-rg span.on { border-color: #E6C200; background: rgba(255,212,0,.22); }
.svr-addr { display: flex; gap: 6px; }
.svr-addr input { flex: 1; border: 1.5px solid var(--border); border-radius: 10px; height: 36px; padding: 0 10px; font: inherit; font-size: 13px; min-width: 0; }
.svr-has { font-size: 13px; color: var(--text-sm); }
.svr-store { margin-top: 8px; font-size: 12.5px; background: var(--warn-bg); border: 1px solid var(--warn-border); border-radius: 8px; padding: 7px 10px; }
.svr-act { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.svr-ok { height: 38px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font: inherit; font-weight: 800; padding: 0 20px; cursor: pointer; }
.svr-ok:disabled { background: #B9C1D3; cursor: not-allowed; }
.svr-err { font-size: 12.5px; color: var(--orange); font-weight: 600; }
.svr-empty { text-align: center; color: var(--text-muted); padding: 30px; }
@media (max-width: 600px) { .svr-modes { grid-template-columns: 1fr; } }
</style>`;
