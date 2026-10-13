// בדיקת §517ב — ההעתק הציבורי (worker/src/bizpublic.js), הקוד האמיתי.
// 1. מסמך סינתטי עם **כל** השדות הפרטיים – אף אחד לא עובר להעתק; כל השדות הציבוריים עוברים.
// 2. קודי הקופון: לא בהעתק הציבורי (גם לא בתוך additionalDiscounts), כן ב-bizCodes; hasCode נכון.
// 3. ערכים מועתקים בטיפוס המקורי (timestamp נשאר timestamp).
import { publicProjection, codesProjection, PUBLIC_FIELDS } from '../worker/src/bizpublic.js';

let pass = 0, fail = 0;
const check = (n, ok, x) => { if (ok) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n, x ?? ''); } };
const S = (v) => ({ stringValue: v });

const PRIVATE = ['ownerPhone', 'ownerEmail', 'ownerLast', 'ownerRelation', 'ownerMemberId', 'fanSport', 'verifiedSport', 'gate', 'tier',
  'verifyRoute', 'subNum', 'seatArea', 'seatBlock', 'seatRow', 'seatNumber', 'verifyNote', 'fbUrl', 'fanInstagram', 'photoProofUrl',
  'ownerVerificationStatus', 'note', 'noteAt', 'noteHandled', 'pendingChanges', 'pendingChangesAt', 'changeDecisions',
  'ownerEmailStatus', 'ownerEmailSentAt', 'ownerEmailDelivery', 'ownerEmailOpenedAt', 'welcomeEmailKind', 'reviewedSections',
  'sectionAnswers', 'agreedTermsAt', 'submittedAt', 'discountCode', 'discountBuilder', 'tagSuggestion', 'serviceEmailPrivate', 'accessToken'];

const doc = {};
for (const k of PRIVATE) doc[k] = S('SECRET-' + k);
for (const k of PUBLIC_FIELDS) doc[k] = S('pub-' + k);
doc.approvedAt = { timestampValue: '2026-10-01T10:00:00Z' };
doc.discountCode = S('MACCABI10');
doc.additionalDiscounts = { arrayValue: { values: [
  { mapValue: { fields: { text: S('עוד הטבה'), code: S('EXTRA5'), redeemMode: S('online') } } },
  { mapValue: { fields: { text: S('בלי קוד'), code: S('') } } },
] } };

const p = publicProjection(doc);
const json = JSON.stringify(p);
console.log('העתק ציבורי');
for (const k of PRIVATE) check(`${k} לא עובר`, !(k in p));
check('אף ערך "SECRET" בכל ההעתק', !json.includes('SECRET'), json.match(/SECRET-\w+/g));
check('קודי הקופון לא מופיעים בשום מקום', !json.includes('MACCABI10') && !json.includes('EXTRA5'));
for (const k of PUBLIC_FIELDS) check(`${k} עובר`, k in p);
check('hasCode=true לקוד ראשי', p.hasCode.booleanValue === true);
check('הטבה נוספת: hasCode לפי הקוד, בלי code', p.additionalDiscounts.arrayValue.values[0].mapValue.fields.hasCode.booleanValue === true &&
  !('code' in p.additionalDiscounts.arrayValue.values[0].mapValue.fields) && p.additionalDiscounts.arrayValue.values[1].mapValue.fields.hasCode.booleanValue === false);
check('טקסט ההטבה הנוספת נשמר', p.additionalDiscounts.arrayValue.values[0].mapValue.fields.text.stringValue === 'עוד הטבה');
check('approvedAt נשאר timestamp', p.approvedAt.timestampValue === '2026-10-01T10:00:00Z');

console.log('קודים');
const c = codesProjection(doc);
check('bizCodes מחזיק את הקוד הראשי', c.discountCode.stringValue === 'MACCABI10');
check('bizCodes מחזיק את הקודים הנוספים בסדר', c.extraCodes.arrayValue.values.map((v) => v.stringValue).join(',') === 'EXTRA5,');
check('bizCodes בלי שום שדה אחר', Object.keys(c).sort().join(',') === 'discountCode,extraCodes');
check('עסק בלי קודים – אין bizCodes', codesProjection({ name: S('x') }) === null);
check('עסק בלי קודים – hasCode=false', publicProjection({ name: S('x') }).hasCode.booleanValue === false);

console.log(`\n${fail ? '❌' : '✅'} ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
