// §665 — "כבר נרשמת" שאומר איך: worker/src/regmethod.js
// הרצה: node tests/regmethod665.test.mjs
import { maskEmail, isStrongMatch, loginMethodOf, describeRegistration } from '../worker/src/regmethod.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`));
};

const rec = { firstName: 'דני', lastName: 'דוגמה', phone: '0500000000', email: 'dani@example.com', status: 'approved' };

// מייל מוסתר
eq('mask רגיל', maskEmail('dani@example.com'), 'da•••@example.com');
eq('mask קצר', maskEmail('abc@x.co'), 'a•••@x.co');
eq('mask ריק', maskEmail(''), '');
eq('mask בלי @', maskEmail('nope'), '');

// התאמה חזקה – הכלל שמגן על הפרטיות
eq('טלפון+מייל', isStrongMatch(rec, { phone: '050-000-0000', email: 'DANI@example.com' }), true);
eq('טלפון+שם', isStrongMatch(rec, { phone: '+972500000000', email: 'other@x.com', firstName: ' דני ', lastName: 'דוגמה' }), true);
eq('מייל+שם', isStrongMatch(rec, { phone: '0529999999', email: 'dani@example.com', firstName: 'דני', lastName: 'דוגמה' }), true);
eq('טלפון בלבד – לא', isStrongMatch(rec, { phone: '0500000000', email: 'other@x.com', firstName: 'משה', lastName: 'כהן' }), false);
eq('טלפון + שם פרטי בלבד – לא', isStrongMatch(rec, { phone: '0500000000', firstName: 'דני', lastName: '' }), false);
eq('מייל בלבד – לא', isStrongMatch(rec, { email: 'dani@example.com' }), false);
eq('שם בלבד – לא', isStrongMatch(rec, { phone: '0529999999', email: 'x@y.com', firstName: 'דני', lastName: 'דוגמה' }), false);

// הדרך שעובדת
eq('קוד', loginMethodOf({ signupMethod: 'manual' }), 'code');
eq('ישן בלי signupMethod', loginMethodOf({}), 'code');
eq('google מחובר', loginMethodOf({ signupMethod: 'google', googleSub: 'g' }), 'google');
eq('google לא מחובר → קוד', loginMethodOf({ signupMethod: 'google' }), 'code');
eq('apple מחובר', loginMethodOf({ signupMethod: 'apple', appleSub: 'a' }), 'apple');
eq('נרשם בקוד, חיבר Apple אחר כך', loginMethodOf({ signupMethod: 'manual', appleSub: 'a' }), 'apple');
eq('נרשם google, חיבר גם apple', loginMethodOf({ signupMethod: 'google', googleSub: 'g', appleSub: 'a' }), 'google');

// התשובה
eq('מאושר בקוד', describeRegistration({ ...rec, signupMethod: 'manual' }), { status: 'approved', first: 'דני', method: 'code', mail: 'da•••@example.com' });
eq('google – המייל של google', describeRegistration({ ...rec, signupMethod: 'google', googleSub: 'g', googleEmail: 'dd@gmail.com' }),
  { status: 'approved', first: 'דני', method: 'google', mail: 'd•••@gmail.com' });
eq('apple – בלי מייל', describeRegistration({ ...rec, signupMethod: 'apple', appleSub: 'a', email: 'x@privaterelay.appleid.com' }),
  { status: 'approved', first: 'דני', method: 'apple' });
eq('בעל עסק מאושר', describeRegistration({ ...rec, isBusinessOwner: true, signupMethod: 'manual' }, 'פרגולות הדוגמה'),
  { status: 'approved', first: 'דני', biz: 'פרגולות הדוגמה', method: 'code', mail: 'da•••@example.com' });
eq('שם עסק בלי isBusinessOwner – לא מוצג', describeRegistration({ ...rec }, 'עסק').biz, undefined);
eq('ממתין – תאריך, בלי דרך ובלי מייל', describeRegistration({ ...rec, status: 'pending', submittedAt: '2026-10-27T18:48:17.737Z' }),
  { status: 'pending', first: 'דני', since: '27.10' });
eq('ממתין בעל עסק', describeRegistration({ ...rec, status: 'pending', isBusinessOwner: true }, 'פרגולות').biz, 'פרגולות');

console.log(`\n${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
