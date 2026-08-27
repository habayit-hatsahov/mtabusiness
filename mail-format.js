// ── mail-format.js — מנוע העיצוב היחיד של גוף המייל ────────────────────────────────────────
// מקור-אמת אחד לשני צרכנים:
//   1. worker/src/brevo.js  — מה שנשלח בפועל ללקוח (Brevo)
//   2. admin-dashboard.html — התצוגה המקדימה ב"מרכז הודעות"
// עד עכשיו הקוד הזה היה מוכפל בשניהם ("קוד מוכפל בכוונה — אין שיתוף-קוד בין Worker ל-admin"),
// וכל תוספת-עיצוב הייתה חייבת להיכתב פעמיים כדי שהתצוגה לא תשקר. עם סרגל העיצוב (§311) המנוע
// גדל מדי בשביל זה, ולכן הוא עבר לכאן — קובץ ES module רגיל בשורש, בדיוק כמו hours.js/
// social-links.js/categories.js, שגם הדפדפן וגם ה-bundler של wrangler יודעים לייבא.
//
// למה סימוני-טקסט ולא עורך WYSIWYG: גוף ההודעה נשמר ב-Firestore כטקסט חופשי, עובר escapeHtml
// לפני הרינדור (הגנת XSS), ונשלח גם כגרסת-טקסט-חלופית (textContent). עורך שמייצר HTML היה
// מוצג ללקוח כתגיות מילוליות ושובר את שלוש התכונות האלה בבת אחת.
//
// ── התחביר המלא ────────────────────────────────────────────────────────────────────────────
//   *מודגש*                 → מודגש (קיים מאז ומתמיד, סגנון וואטסאפ)
//   _נטוי_                  → נטוי
//   - פריט                  → שורה ברשימת נקודות (גם • פריט)
//   > טקסט                  → תיבת הדגשה צהובה
//   ---                     → קו מפריד (שורה משל עצמה)
//   {big} / {mid} / {small} → גודל הכתב של הפסקה (בתחילת הפסקה)
//   {center}                → מרכוז הפסקה
//   {font:tahoma}           → גופן לכל המכתב (שורה ראשונה בגוף ההודעה בלבד)
//   {code} {link} {login_link} {social} — בפסקה נפרדת: הבלוקים הממותגים (ללא שינוי)
// כל מה שאין לו סימון מרונדר בדיוק כמו קודם — פסקה = <p>, שורה בתוך פסקה = <br>.

const LOGO_HORIZONTAL_URL = 'https://yellowzone.co.il/images/yellowzone-logo-horizontal.png';
const SITE_URL = 'https://yellowzone.co.il';

// הרשתות החברתיות של Yellow Zone — ערך ריק = הקישור לא מוצג כלל (עדיף חסר על קישור שבור).
const INSTAGRAM_URL = 'https://instagram.com/Yellowzone.mta';
const FACEBOOK_URL = 'https://www.facebook.com/share/1C5yYf44z6/?mibextid=wwXIfr';

// ── גופנים ────────────────────────────────────────────────────────────────────────────────
// רק גופני-מערכת שמותקנים כברירת מחדל ב-Windows/Mac **ויש להם אותיות עבריות**. גופן-רשת
// (Google Fonts וכו) לא נטען כמעט בשום לקוח מייל — הבחירה הייתה מתעלמת מעצמה בשקט.
// הערכים ב-css חייבים גרש בודד ולא כפול: הם נכנסים לתוך style="..." של תגית HTML.
export const MAIL_FONTS = [
  { key: 'default', label: 'ברירת מחדל (Arial)', css: 'Arial, Helvetica, sans-serif' },
  { key: 'tahoma',  label: 'Tahoma',             css: 'Tahoma, Arial, sans-serif' },
  { key: 'times',   label: 'Times New Roman',    css: "'Times New Roman', Times, serif" },
  { key: 'verdana', label: 'Verdana',            css: 'Verdana, Arial, sans-serif' },
  { key: 'courier', label: 'Courier New',        css: "'Courier New', Courier, monospace" },
];

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function applyVars(text, vars) {
  return Object.entries(vars || {}).reduce((s, [k, v]) => s.split(`{${k}}`).join(v ?? ''), String(text == null ? '' : text));
}

// ── בלוקים ממותגים ────────────────────────────────────────────────────────────────────────
// ריבוע צהוב עם קוד הכניסה. אין ולא יכול להיות "כפתור העתקה" במייל — Gmail/Outlook מסירים
// JavaScript לפני שהמייל מוצג. הקוד עצמו הוא הממשק: גופן גדול ומרווח, בלי שום דבר שמתחרה בו.
export function codeBoxHtml(code) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto">
      <tr><td style="width:260px;background:#FFDE00;border-radius:20px;padding:22px 20px;text-align:center">
        <div style="font-size:38px;font-weight:900;letter-spacing:8px;color:#0A2A66;line-height:1.15;direction:ltr;unicode-bidi:isolate">${escapeHtml(code)}</div>
      </td></tr>
    </table>`;
}

// כפתור-הכניסה מציג את *כתובת האתר* ולא "כניסה לאתר" — כדי שהנמען יזכור אותה ויוכל להקליד
// אותה בעצמו בפעם הבאה.
export function loginButtonHtml() {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:16px auto">
      <tr><td style="background:#FFDE00;border-radius:14px">
        <a href="${SITE_URL}" style="display:inline-block;color:#16130a;text-decoration:none;padding:11px 28px;text-align:center;line-height:1.35">
          <span style="font-size:12px;font-weight:700">לכניסה לחצו</span><br>
          <span style="font-size:18px;font-weight:900;direction:ltr;unicode-bidi:isolate">yellowzone.co.il</span>
        </a>
      </td></tr>
    </table>`;
}

// כל מקום שמציג קוד מקבל גם את כפתור-הכניסה מתחתיו. אם התבנית כבר כוללת {login_link} משלה,
// היא מקבלת false ומציבה את הכפתור בעצמה במקום שבחרה — כדי שלא יופיעו שני כפתורים זהים.
export function codeBlockHtml(code, withButton = true) {
  return codeBoxHtml(code) + (withButton ? loginButtonHtml() : '');
}

// כפתור צהוב ממותג — משמש כש-{link} יושב על שורה נפרדת (פסקה משלו) בתבנית מותאמת-אישית
export function linkButtonHtml(link, label) {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:16px auto">
      <tr><td style="background:#FFDE00;border-radius:14px">
        <a href="${escapeHtml(link)}" style="display:inline-block;color:#16130a;font-weight:900;text-decoration:none;padding:12px 28px;font-size:15px">${escapeHtml(label)}</a>
      </td></tr>
    </table>`;
}

// שורת "עקבו אחרינו" — בפוטר של *כל* מייל יוצא (ר' footerHtml) ולא בגוף תבנית מסוימת, כדי
// שתבנית חדשה לא תישכח בלי הקריאה לעקוב. data-social-row הוא הסמן שלפיו footerHtml יודע
// שהשורה כבר הוצגה בגוף המכתב ({social}) ולכן לא לכפול אותה.
export function socialRowHtml(inBody = false) {
  const links = [
    INSTAGRAM_URL && `<a href="${INSTAGRAM_URL}" style="color:#0A2A66;font-weight:700;text-decoration:underline">אינסטגרם</a>`,
    FACEBOOK_URL && `<a href="${FACEBOOK_URL}" style="color:#0A2A66;font-weight:700;text-decoration:underline">פייסבוק</a>`,
  ].filter(Boolean);
  if (!links.length) return '';
  const frame = inBody
    ? 'text-align:center;margin:24px 0'
    : 'text-align:center;margin-top:26px;padding-top:18px;border-top:1px solid #eee';
  return `<div data-social-row style="${frame}">
    <div style="font-size:13px;color:#555;margin-bottom:10px">לחצו למעקב אחרינו</div>
    <div style="font-size:15px">${links.join(' <span style="color:#ccc">·</span> ')}</div>
  </div>`;
}

// כתובת-פיזית קטנה בתחתית כל מייל — לא לשם יצירת-קשר בפועל (הפרויקט קהילתי, בלי משרד רשום),
// רק כי Gmail/פילטרי-ספאם מצפים לראות כתובת-דואר-כלשהי בפוטר מייל אוטומטי; חסרה = סמן-ספאם.
export function footerHtml(bodyHtml) {
  const socialInBody = String(bodyHtml || '').includes('data-social-row');
  return (socialInBody ? '' : socialRowHtml()) + `<div style="text-align:center;color:#999;font-size:11px;margin-top:20px;line-height:1.6">
    אם המייל הזה נחת בתיקיית הספאם/קידומים, נשמח שתסמנו אותו כ"לא ספאם" — כך מיילים עתידיים יגיעו ישר לתיבה הראשית.<br>
    Yellow Zone · תל אביב, ישראל
  </div>`;
}

// הלוגו הרוחבי בפינה — בכוונה בצד שמאל, מול כיוון-הקריאה RTL של שאר הגוף.
export function brandHeaderHtml() {
  return `<div style="text-align:left;margin:0 0 18px 0"><img src="${LOGO_HORIZONTAL_URL}" height="26" alt="Yellow Zone" /></div>`;
}

// עוטף את הגוף בעמודה ברוחב קבוע (לא נמתח על פני כל רוחב חלון-הדואל) — כדי שאורך השורות
// יהיה עקבי. תיבת-הקוד/כפתורים נשארים ממורכזים בתוכה.
export function boundedColumnHtml(innerHtml) {
  return `<div style="max-width:480px;margin:0 auto;text-align:right">${innerHtml}</div>`;
}

// ── עיצוב-תוך-שורה ────────────────────────────────────────────────────────────────────────
// הכל רץ **אחרי** escapeHtml בכוונה: הסימנים עצמם (*, _) לא מושפעים מ-escape, ולכן בטוח להפוך
// אותם ל-HTML אחרי כן בלי לפתוח פרצת-XSS על שאר הטקסט.
function applyBold(escapedText) {
  return escapedText.replace(/\*(.+?)\*/g, '<b>$1</b>');
}

// נטוי — הקו-התחתון חייב לשבת על גבול-מילה משני הצדדים, אחרת כתובת כמו
// example.com/a_b_c היתה נשברת באמצע (הקו-התחתון בתוך URL מוקף בתווי-מילה ולכן לא נתפס כאן).
function applyItalic(escapedText) {
  return escapedText.replace(/(^|[\s(\[־–—])_([^_\n]+)_(?=$|[\s.,!?:;)\]־–—])/g, '$1<i>$2</i>');
}

// הופך כתובות-אתר בתוך טקסט חופשי לקישורים לחיצים — גם URL מלא וגם דומיין חשוף בלי פרוטוקול,
// כי כותבים תוכן-מייל בטקסט רגיל בלי להקליד https:// בכל פעם. רץ אחרון (הטקסט כבר-HTML-בטוח).
function linkifyUrls(text) {
  return text.replace(/(https?:\/\/[^\s<]+|(?:www\.)?[a-zA-Z0-9-]+\.(?:com|co\.il|net|org|io)(?:\/[^\s<]*)?)/g, (match) => {
    const href = match.startsWith('http') ? match : `https://${match}`;
    return `<a href="${href}" style="color:#16130a;font-weight:700;text-decoration:underline">${match}</a>`;
  });
}

function inlineHtml(rawLine, vars) {
  return linkifyUrls(applyItalic(applyBold(escapeHtml(applyVars(rawLine, vars)))));
}

// ── גופן לכל המכתב ────────────────────────────────────────────────────────────────────────
// הגופן הוא מאפיין של המכתב כולו ולא של פסקה, ולכן הוא יושב בשורה הראשונה של גוף ההודעה
// ולא בפרמטר נפרד: כך הוא נוסע יחד עם הטקסט דרך **כל** הצינור הקיים (טיוטה ב-Firestore,
// שידור, מייל-בדיקה, שליחה-חוזרת, היסטוריה, תבניות קבועות) בלי להוסיף שדה בשום מקום.
const FONT_DIRECTIVE_RX = /^[ \t]*\{font:\s*([a-zA-Z ]+)\}[ \t]*(\r?\n)*/;

export function mailFontKey(body) {
  const m = String(body == null ? '' : body).match(FONT_DIRECTIVE_RX);
  const key = m ? m[1].trim().toLowerCase() : 'default';
  return MAIL_FONTS.some(f => f.key === key) ? key : 'default';
}
export function mailFontCss(body) {
  const key = mailFontKey(body);
  return (MAIL_FONTS.find(f => f.key === key) || MAIL_FONTS[0]).css;
}
export function stripFontDirective(body) {
  return String(body == null ? '' : body).replace(FONT_DIRECTIVE_RX, '');
}

// ── סימוני-פסקה ───────────────────────────────────────────────────────────────────────────
// נקראים מתחילת הפסקה, כמה שיש, בכל סדר. עוצרים בסימון הראשון שאינו מוכר — כך "{name} היקר"
// (משתנה, לא סימון-עיצוב) ממשיך להתנהג בדיוק כמו קודם.
const PARA_MARKER_RX = /^[ \t]*\{(center|big|mid|small)\}/;
function readParaMarkers(para) {
  const marks = {};
  let rest = para;
  let m;
  while ((m = rest.match(PARA_MARKER_RX))) {
    marks[m[1]] = true;
    rest = rest.slice(m[0].length);
  }
  return { marks, rest: rest.replace(/^[ \t]+/, '') };
}

function blockStyle(marks, extra) {
  const s = ['margin:0 0 16px 0'];
  if (marks.center) s.push('text-align:center');
  if (marks.big) s.push('font-size:22px', 'font-weight:900', 'line-height:1.35');
  else if (marks.mid) s.push('font-size:17px', 'font-weight:800', 'line-height:1.45');
  else if (marks.small) s.push('font-size:13px');
  return s.concat(extra || []).join(';');
}

// קו מפריד בטבלה ולא ב-<hr>/div-ריק: Outlook (מנוע Word) מקריס גובה של div ריק, ו-<hr> מקבל
// שם צבע-ברירת-מחדל משלו. תא-טבלה עם border-top הוא הגרסה שעובדת בכל לקוח.
function dividerHtml() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="border-top:1px solid #e6e6e6;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

// רשימת נקודות כשורות-div עם תו • ולא כ-<ul>/<li>: ההזחה של רשימות ב-Outlook וב-Gmail-נייד
// שונה בעשרות פיקסלים, וגם גרסת-הטקסט-החלופית (stripHtml) מאבדת שם את הנקודה. text-indent
// שלילי נותן את ההזחה-התלויה, ואם לקוח מייל מתעלם ממנו זו עדיין שורה קריאה לגמרי.
function bulletsHtml(items, marks, vars) {
  const inner = items.map(t => `<div style="margin:0 0 6px 0;padding-right:14px;text-indent:-14px">• ${inlineHtml(t, vars)}</div>`).join('');
  return `<div style="${blockStyle(marks)}">${inner}</div>`;
}

function quoteHtml(lines, marks, vars) {
  const style = blockStyle(marks, ['background:#FFF9DA', 'border-right:4px solid #FFDE00', 'border-radius:10px', 'padding:12px 14px']);
  return `<div style="${style}">${lines.map(l => inlineHtml(l, vars)).join('<br>')}</div>`;
}

function plainHtml(lines, marks, vars) {
  return `<p style="${blockStyle(marks)}">${lines.map(l => inlineHtml(l, vars)).join('<br>')}</p>`;
}

const BULLET_RX = /^[ \t]*[-•][ \t]+(.*)$/;
const QUOTE_RX = /^[ \t]*>[ \t]+(.*)$/;
const DIVIDER_RX = /^[ \t]*-{3,}[ \t]*$/;

// פסקה אחת -> בלוק אחד או יותר. שורות רגילות נשארות <p> אחד עם <br> ביניהן (בדיוק כמו קודם);
// רשימה/תיבת-הדגשה/קו-מפריד שוברים את הפסקה לבלוק משלהם.
function paragraphHtml(para, vars) {
  const { marks, rest } = readParaMarkers(para);
  const out = [];
  let plain = [], bullets = [], quote = [];
  const flushPlain = () => { if (plain.length) { out.push(plainHtml(plain, marks, vars)); plain = []; } };
  const flushBullets = () => { if (bullets.length) { out.push(bulletsHtml(bullets, marks, vars)); bullets = []; } };
  const flushQuote = () => { if (quote.length) { out.push(quoteHtml(quote, marks, vars)); quote = []; } };
  const flushAll = () => { flushPlain(); flushBullets(); flushQuote(); };

  for (const line of rest.split('\n')) {
    if (DIVIDER_RX.test(line)) { flushAll(); out.push(dividerHtml()); continue; }
    const b = line.match(BULLET_RX);
    if (b) { flushPlain(); flushQuote(); bullets.push(b[1]); continue; }
    const q = line.match(QUOTE_RX);
    if (q) { flushPlain(); flushBullets(); quote.push(q[1]); continue; }
    flushBullets(); flushQuote();
    plain.push(line);
  }
  flushAll();
  return out.join('');
}

// ── גוף המכתב ─────────────────────────────────────────────────────────────────────────────
// פסקה שהיא בדיוק "{code}"/"{link}"/"{login_link}"/"{social}" בשורה משל עצמה מקבלת את העיצוב
// הממותג (תיבת-קוד/כפתור/שורת-רשתות) במקום טקסט רגיל. שימוש רגיל של המשתנים בתוך משפט
// ממשיך להתחלף לטקסט פשוט כרגיל.
export function richBodyHtml(bodyTemplate, vars, linkLabel) {
  const paras = stripFontDirective(bodyTemplate).split('\n\n');
  // האם התבנית מציגה כפתור-כניסה משלה? אם כן, תיבת-הקוד לא תחזור על כתובת האתר מתחתיה.
  const hasLoginButton = paras.some((p) => p.trim() === '{login_link}');
  return paras.map((para) => {
    const trimmed = para.trim();
    if (trimmed === '{code}' && vars && vars.code) return codeBlockHtml(vars.code, !hasLoginButton);
    if (trimmed === '{link}' && vars && vars.link) return linkButtonHtml(vars.link, linkLabel || 'כניסה');
    if (trimmed === '{login_link}') return loginButtonHtml();
    if (trimmed === '{social}') return socialRowHtml(true);
    return paragraphHtml(para, vars);
  }).join('');
}

// המכתב השלם (בלי הפוטר — הוא נוסף ריכוזית ב-sendBrevoEmail, ובתצוגה המקדימה בנפרד).
// lineHeight נשאר פרמטר ולא ערך-קבוע כדי לא לשנות בדרך-אגב את מרווח-השורות של המיילים
// האוטומטיים הקיימים (רק השידור ההמוני משתמש ב-1.7 מאז ומתמיד).
export function renderMailHtml(body, vars, opts = {}) {
  const { linkLabel, lineHeight, padding = '24px', extraStyle = '' } = opts;
  const style = `font-family:${mailFontCss(body)};padding:${padding}`
    + (lineHeight ? `;line-height:${lineHeight}` : '') + (extraStyle ? ';' + extraStyle : '');
  return `<div dir="rtl" style="${style}">${boundedColumnHtml(brandHeaderHtml() + richBodyHtml(body, vars, linkLabel))}</div>`;
}
