// בדיקת §757 – push-ask.js האמיתי ב-JSDOM: נוסח התיבה החדש לאוהד, ו-afterSubmit שולח את הטוקן ל-/reg-push
// עם המפתח מ-yz_reg (רק כשסומן + אושר + יש apiFetch), ומציג את הנוסח המתאים.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'push-ask.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x === undefined ? '' : JSON.stringify(x)); } };

async function setup({ perm = 'prompt', reg = { ok: true, token: 'fcm:tok', platform: 'android', installId: 'iabc' }, biz = false, yzReg = { memberId: 'A'.repeat(20), ticket: 'T'.repeat(43) } } = {}) {
  const dom = new JSDOM('<div id="f"><button id="submitBtn">שליחה</button></div><div id="s"></div>', { runScripts: 'outside-only', url: 'https://yellowzone.co.il/fan-register.html' });
  const w = dom.window;
  if (yzReg) w.localStorage.setItem('yz_reg', JSON.stringify(yzReg));
  w.YZNativePush = { available: () => true, permissionState: async () => perm, registerAndStash: async () => reg };
  w.eval(SRC);
  await w.YZPushAsk.mountCheckbox(w.document.getElementById('submitBtn'), biz ? { biz: true } : undefined);
  const calls = [];
  const apiFetch = async (path, opts) => { calls.push({ path, body: JSON.parse(opts.body) }); return { json: async () => ({ ok: true }) }; };
  return { w, calls, apiFetch };
}

(async () => {
  let { w, calls, apiFetch } = await setup();
  const label = w.document.querySelector('.yz-pushopt');
  check('אוהד: נוסח חדש "ברגע שההרשמה שלי מאושרת"', label && /לקבל התראה ברגע שההרשמה שלי מאושרת/.test(label.textContent), label && label.textContent);
  check('התיבה מסומנת מראש', w.document.getElementById('yzPushOpt').checked === true);
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'), { apiFetch });
  check('נשלח ל-/reg-push עם המפתח, מזהה-ההתקנה והטוקן', calls.length === 1 && calls[0].path === '/reg-push' && calls[0].body.memberId === 'A'.repeat(20) && calls[0].body.ticket === 'T'.repeat(43) && calls[0].body.installId === 'iabc' && calls[0].body.token === 'fcm:tok' && calls[0].body.platform === 'android', calls);
  check('הודעה: "נשלח לך התראה ברגע שההרשמה תאושר"', /ברגע שההרשמה תאושר/.test(w.document.getElementById('s').textContent));

  ({ w, calls, apiFetch } = await setup());
  w.document.getElementById('yzPushOpt').checked = false;
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'), { apiFetch });
  check('לא מסומן → לא שואלים ולא שולחים', calls.length === 0 && w.document.getElementById('s').textContent === '');

  ({ w, calls, apiFetch } = await setup({ reg: { ok: false, reason: 'denied' } }));
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'), { apiFetch });
  check('סירב בחלון → לא שולחים, "נעדכן אותך במייל"', calls.length === 0 && /במייל/.test(w.document.getElementById('s').textContent));

  ({ w, calls, apiFetch } = await setup({ yzReg: null }));
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'), { apiFetch });
  check('בלי yz_reg → לא שולחים (הפיקדון נשאר לכניסה הראשונה)', calls.length === 0);

  ({ w, calls, apiFetch } = await setup());
  const bad = async () => { throw new Error('net'); };
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'), { apiFetch: bad });
  check('כשל רשת ב-/reg-push → לא זורק, מסך ההצלחה ממשיך', /התראה/.test(w.document.getElementById('s').textContent));

  ({ w, calls, apiFetch } = await setup({ biz: true }));
  check('בעל עסק: הנוסח שלו לא השתנה', /עדכונים לעסק/.test(w.document.querySelector('.yz-pushopt').textContent));
  await w.YZPushAsk.afterSubmit(w.document.getElementById('s'));
  check('בעל עסק (בלי apiFetch): "✓ התראות הופעלו." ובלי /reg-push', /התראות הופעלו/.test(w.document.getElementById('s').textContent) && calls.length === 0);

  console.log(`\n${fail ? '❌' : '✅'} ${pass}/${pass + fail}`);
  if (fail) process.exit(1);
})();
