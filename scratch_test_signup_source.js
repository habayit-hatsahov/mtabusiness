// §485 — בדיקות ל-signup-source.js ול-signupSourceNoteHtml (admin-dashboard.html).
// הקוד נשלף מהקבצים עצמם, לא מועתק. הרצה: node scratch_test_signup_source.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/signup-source.js', 'utf8');
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

function load({ ua, touch = 0, cap = false, standalone = false, nativeSurface = null, store = {} }) {
  const ss = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const win = {};
  if (cap) win.Capacitor = {};
  if (nativeSurface) win.YZNativeGoogle = { surface: () => nativeSurface };
  win.matchMedia = () => ({ matches: standalone });
  const g = { window: win, navigator: { userAgent: ua, maxTouchPoints: touch }, sessionStorage: ss, matchMedia: win.matchMedia };
  new Function(...Object.keys(g), src)(...Object.values(g));
  return win.hbSignupSource;
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A526B) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128';

eq('iPhone Safari, manual', load({ ua: IPHONE }).fields(), { signupOs: 'ios', signupSurface: 'web', signupMethod: 'manual' });
eq('Android app (UA marker)', load({ ua: ANDROID + ' YellowZoneApp' }).fields().signupSurface, 'app');
eq('Android app (Capacitor)', load({ ua: ANDROID, cap: true }).fields(), { signupOs: 'android', signupSurface: 'app', signupMethod: 'manual' });
eq('iPad as Mac + touch', load({ ua: MAC, touch: 5 }).os(), 'ios');
eq('real Mac', load({ ua: MAC }).os(), 'desktop');
eq('Windows', load({ ua: WIN }).os(), 'desktop');
eq('PWA standalone', load({ ua: ANDROID, standalone: true }).surface(), 'pwa');
eq('native-google surface wins', load({ ua: WIN, nativeSurface: 'app' }).surface(), 'app');

// שיטה: נשמרת בין טעינות (sessionStorage משותף) — המסלול של אפל באייפון שיוצא וחוזר
const store = {};
load({ ua: IPHONE, store }).markMethod('apple');
eq('apple survives reload', load({ ua: IPHONE, store }).fields().signupMethod, 'apple');
eq('google', (() => { const s = {}; load({ ua: ANDROID, store: s }).markMethod('google'); return load({ ua: ANDROID, store: s }).method(); })(), 'google');
eq('junk value → manual', load({ ua: IPHONE, store: { yz_signup_method: 'evil' } }).method(), 'manual');

// sessionStorage חסום (Safari פרטי ישן) — לא זורק
eq('storage throws', (() => {
  const win = {}; const g = { window: win, navigator: { userAgent: IPHONE, maxTouchPoints: 0 }, sessionStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } };
  new Function(...Object.keys(g), src)(...Object.values(g));
  win.hbSignupSource.markMethod('apple');
  return win.hbSignupSource.fields().signupMethod;
})(), 'manual');

// ── הכרטיס במרכז הניהול ──
const html = fs.readFileSync(__dirname + '/admin-dashboard.html', 'utf8');
const start = html.indexOf('const SIGNUP_OS_LABEL');
const end = html.indexOf('// אישור-אנוש לפני אישור נמען');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const note = new Function('esc', html.slice(start, end) + '; return signupSourceNoteHtml;')(esc);
const v = (m) => (note(m).match(/identity-note-v">(.*)<\/div><\/div>$/) || [])[1];
eq('card: full', v({ signupOs: 'ios', signupSurface: 'app', signupMethod: 'apple' }), 'אייפון – מהאפליקציה<br>עם Apple');
eq('card: old record', v({ firstName: 'x' }), 'לא נמדד (נרשם לפני 11.10.2026)');
eq('card: null member', note(null), '');
eq('card: unknown values ignored', v({ signupOs: '<b>', signupMethod: 'manual' }), 'מילוי ידני');

console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
