// ── §403 — מריץ את מסלול הכניסה-עם-Google **מתוך welcome.html** ─────────────────────────
// הענף שנבדק: תשובת `google_not_linked` שנושאת `linkable` → הצעת חיבור-בלחיצה → הלחיצה
// עצמה → כניסה. ⚠️ נשלף לפי תוכן, ומאומת שהוא נושא את הענף החדש.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('welcome.html', 'utf8');
// ⚠️ העוגן חייב להתחיל ב-`heroGoogleBusy` ולא ב-heroGoogleAttachAndEnter: הנעילה מוצהרת
// מעליה, ובלעדיה heroGoogleLogin זורק ReferenceError. שניהם נכללים בפרוסה ממילא.
const a = src.indexOf('let heroGoogleBusy = false;');
const endMark = '\nfunction heroEsc(v) {';
const b = src.indexOf(endMark, a);
if (a < 0 || b < 0) throw new Error('לא נמצא הבלוק');
const code = src.slice(a, b);
for (const must of ['heroGoogleAttachAndEnter', 'data.linkable', "'google:canLink'", "gStage = 'link'"])
  if (!code.includes(must)) throw new Error('הבלוק שנשלף חסר: ' + must);

function build(apiResponses) {
  const calls = [], msgs = [], events = [], entered = [];
  const box = {
    console, setTimeout, clearTimeout, AbortController, Promise, JSON, Date, String,
    window: {}, document: { getElementById: () => null },
    HERO_TIMEOUT_MS: 8000, HERO_HARD_ABORT_MS: 35000,
    // §405 — מוגדר מעל הבלוק שנשלף (ליד heroProgress), ולכן חייב להגיע כאן כ-stub.
    // ⚠️ בלעדיו הענף "יש טוקן" זורק ReferenceError — וזה בדיוק מה שההרנס תפס.
    HERO_AUTH_PROGRESS: 'הקוד אושר — נכנסים…',
    // §409 — גם הוא מוגדר מעל הפרוסה. ⚠️ בלעדיו heroGoogleAttachAndEnter זורק, והכשל
    // מתחפש ל"לא הצלחנו להתחבר" — כלומר ההרנס היה מדווח על באג שאינו קיים.
    HERO_CHAIN_TIMEOUT_MS: 12000,
    HERO_G_MSGS: {},
    heroGMsg: (h, w) => msgs.push((w ? '[warn] ' : '') + String(h).replace(/<[^>]+>/g, '')),
    heroHideErr: () => {},
    heroEsc: (v) => String(v == null ? '' : v),
    heroEnvTagAt: () => 'web|idb-ok|0.1s',
    heroIsTimeout: (e) => !!e && (e.name === 'AbortError' || e.message === 'hb_timeout'),
    heroWithTimeout: (p) => p,
    heroProgress: () => () => {},
    heroRunAuth: (tok, fin) => ({ settled: Promise.resolve('uid-' + tok), done: (u) => fin(u), giveUp: () => {} }),
    heroFinishLogin: (uid) => entered.push(uid),
    hbApiFetch: (path, opts) => {
      calls.push({ path, body: JSON.parse(opts.body) });
      return Promise.resolve({ json: () => Promise.resolve(apiResponses[path]) });
    },
  };
  // §407 — נשמר האובייקט המלא ולא רק הערוץ: הבדיקה היא שהמייל **נוסע** על האירוע.
  box.window.logEvent = (t, e) => { events.push(t + ':' + e.channel); events.last = e; };
  box.window.hbBumpNetFail = () => 1;
  vm.createContext(box);
  vm.runInContext(code + '\n; globalThis.__login = heroGoogleLogin;', box);
  return { box, calls, msgs, events, entered };
}
(async () => {
  const chk = (t, c) => { console.log((c ? '✅' : '❌') + ' ' + t); if (!c) process.exitCode = 1; };

  // ── 1. יש רשומה תואמת → הצעה, ואז לחיצה שמכניסה ──────────────────────────────────────
  let t = build({
    '/google-login':  { error: 'google_not_linked', email: 'dan@gmail.com',
                        linkable: { memberId: 'M123', name: "דן כ'" } },
    '/google-attach': { ok: true, customToken: 'TOK' },
  });
  await t.box.__login({ credential: 'IDT' });
  console.log('מה שהוצג: ' + t.msgs.join(' | '));
  // §409 — 🔑 **אין יותר הצעה ואין לחיצה**: קריאה אחת ל-heroGoogleLogin מסתיימת בכניסה.
  chk('🔑 §409 — נכנס בלי שום לחיצה נוספת', t.entered.length === 1);
  chk('ובלי שהוצג כפתור אישור', !t.msgs.some(m => m.includes('כן, זה אני')));
  chk('המסך אומר מה קורה בזמן אמת', t.msgs.some(m => m.includes('מחברים את חשבון ה-Google')));
  chk("נרשם ערוץ 'canLink' ולא 'notLinked'", t.events.includes('loginFail:google:canLink'));
  chk('§407 — המייל נוסע גם על אירוע canLink', t.events.last.email === 'dan@gmail.com');
  chk('§404 — וגם הזיהוי, למקרה שהקישור ייכשל', t.events.last.memberId === 'M123');
  const attach = t.calls.find(c => c.path === '/google-attach');
  chk('נשלחה בקשת /google-attach', !!attach);
  chk('ושולחת את שני השדות שהשער דורש', attach && attach.body.memberId === 'M123' && attach.body.idToken === 'IDT');
  chk('🔑 שתי קריאות בסך הכל — בלי /google-login שני', t.calls.length === 2);

  // ── 2. אין רשומה תואמת → ההודעה הישנה של §399, בלי שינוי ─────────────────────────────
  t = build({ '/google-login': { error: 'google_not_linked', email: 'x@gmail.com' } });
  await t.box.__login({ credential: 'IDT' });
  chk("בלי linkable — נשארת הודעת §399", t.msgs.some(m => m.includes('עדיין לא חיברתם')));
  chk('🔑 §407 — המייל נוסע על אירוע notLinked', t.events.last.email === 'x@gmail.com');
  chk("והערוץ נשאר 'notLinked'", t.events.includes('loginFail:google:notLinked'));
  chk('ולא נשלחה בקשת קישור בכלל', !t.calls.some(c => c.path === '/google-attach'));

  // ── 3. ⚠️ הוורקר פסל את הקישור אחרי שאישר אותו — סתירה, ולא טעות של האדם ─────────────
  t = build({
    '/google-login':  { error: 'google_not_linked', email: 'dan@gmail.com',
                        linkable: { memberId: 'M123', name: "דן כ'" } },
    '/google-attach': { error: 'email_mismatch' },
  });
  await t.box.__login({ credential: 'IDT' });
  chk('כשל-קישור נרשם בערוץ נפרד', t.events.includes('loginFail:google:link:email_mismatch'));
  chk('והאדם מופנה למסלול שבטוח עובד', t.msgs.some(m => m.includes('הטלפון והקוד')));
  chk('ולא נכנס', t.entered.length === 0);

  // ── 4. מקושר כבר → כניסה רגילה, בלי לגעת בכלום ───────────────────────────────────────
  t = build({ '/google-login': { customToken: 'TOK2' } });
  await t.box.__login({ credential: 'IDT' });
  chk('חשבון מקושר — נכנס כרגיל', t.entered.length === 1 && t.calls.length === 1);

  // ── 5. ⚠️ ענף בלי תשובה מהוורקר בכלל: אסור שיישלח email ריק/undefined ────────────────
  t = build({});
  t.box.hbApiFetch = () => Promise.reject(Object.assign(new Error('net'), { name: 'TypeError' }));
  await t.box.__login({ credential: 'IDT' });
  chk('§407 — כשל-רשת אינו שולח שדה email כלל',
      t.events.length > 0 && !('email' in t.events.last));
})();
