// בדיקת app-banner.js בהרצה אמיתית מול DOM (jsdom) — לא קריאה בקוד.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'app-banner.js'), 'utf8');

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  inapp: 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 YellowZoneApp',
};

// סביבה נקייה לכל בדיקה — localStorage ו-<style> שנשארים מבדיקה קודמת היו מזהמים את הבאה.
function env(ua) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="mount"></div></body></html>',
    { url: 'https://yellowzone.co.il/home.html', userAgent: ua, pretendToBeVisual: true, runScripts: 'outside-only' });
  // jsdom 30 התעלמה מאפשרות userAgent שהעברתי לבנאי (הפלט חזר עם UA של jsdom).
  // נתפס בהרצה: שתי בדיקות נכשלו ואחת קרסה. דורסים ידנית לפני טעינת המודול.
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: ua, configurable: true });
  if (dom.window.navigator.userAgent !== ua) throw new Error('דריסת ה-UA נכשלה');
  dom.window.eval(SRC);
  return dom.window;
}

const ON = { bannerFans: true, bannerBiz: true, bannerLanding: true, androidUrl: 'https://play.google.com/x', iosUrl: 'https://apps.apple.com/x' };

let pass = 0, fail = 0;
function is(name, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  →  קיבלתי "' + got + '", ציפיתי "' + want + '"'); }
}

console.log('\n— שלושת המנעולים —');
{
  const w = env(UA.android);
  is('אין מסמך הגדרות → כבוי', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', null), 'no-config');
}
{
  const w = env(UA.android);
  is('מסמך קיים אך הדגל כבוי → כבוי', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', { bannerFans: false, androidUrl: 'https://x' }), 'flag-off');
}
{
  const w = env(UA.android);
  is('דגל דלוק אך אין כתובת → כבוי', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', { bannerFans: true, androidUrl: '' }), 'no-url');
}
{
  const w = env(UA.inapp);
  is('בתוך האפליקציה → לא מוצג', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', ON), 'in-app');
}
{
  const w = env(UA.android);
  is('הכול פתוח → מוצג', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', ON), 'shown');
}

console.log('\n— זיהוי מערכת ומטרה —');
{
  const w = env(UA.android);
  w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', ON);
  is('אנדרואיד → לינק ל-Play', w.document.querySelector('.yz-appbanner-cta').href, ON.androidUrl);
}
{
  const w = env(UA.iphone);
  w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', ON);
  is('אייפון → לינק ל-App Store', w.document.querySelector('.yz-appbanner-cta').href, ON.iosUrl);
}
{
  const w = env(UA.desktop);
  is('מחשב → אין חנות, לא מוצג', w.YZAppBanner.render(w.document.getElementById('mount'), 'fan', ON), 'no-url');
}
{
  const w = env(UA.android);
  is('דגל האוהדים אינו מדליק את באנר העסקים', w.YZAppBanner.render(w.document.getElementById('mount'), 'biz', { bannerFans: true, androidUrl: 'https://x' }), 'flag-off');
}

console.log('\n— נוסח לפי קהל —');
for (const [aud, expect] of [['fan', 'התקינו, ותדעו ראשונים על הטבות חדשות'], ['biz', 'כאן נעדכן אתכם ישירות — בלי לחפש במיילים'], ['landing', 'להוריד, ולהמשיך את ההרשמה משם']]) {
  const w = env(UA.android);
  w.YZAppBanner.render(w.document.getElementById('mount'), aud, ON);
  is('נוסח ' + aud, w.document.querySelector('.yz-appbanner-body').textContent, expect);
}

console.log('\n— סגירה וכפילות —');
{
  const w = env(UA.android);
  const m = w.document.getElementById('mount');
  w.YZAppBanner.render(m, 'fan', ON);
  is('קריאה שנייה אינה מציירת פעמיים', w.YZAppBanner.render(m, 'fan', ON), 'already');
  w.document.querySelector('.yz-appbanner-x').dispatchEvent(new w.MouseEvent('click'));
  is('סגירה מסירה מהדף', w.document.querySelectorAll('.yz-appbanner').length, 0);
  is('סגירה נזכרת בקריאה הבאה', w.YZAppBanner.render(m, 'fan', ON), 'dismissed');
  is('הסגירה היא לכל קהל בנפרד', w.YZAppBanner.render(m, 'biz', ON), 'shown');
}

console.log('\n— הזרקת תוכן מהמנהל —');
{
  const w = env(UA.android);
  const m = w.document.getElementById('mount');
  const evil = '<img src=x onerror="window.__pwned=1">';
  w.YZAppBanner.render(m, 'fan', Object.assign({}, ON, { bannerTitle: evil }));
  is('כותרת מהמסמך אינה הופכת ל-HTML', w.document.querySelector('.yz-appbanner-title').textContent, evil);
  is('לא נוצר אלמנט מהטקסט', w.document.querySelectorAll('.yz-appbanner img').length, 0);
  is('הקוד לא רץ', w.__pwned, undefined);
}

console.log('\n════════  עברו: ' + pass + '   נכשלו: ' + fail + '  ════════');
process.exit(fail ? 1 : 0);
