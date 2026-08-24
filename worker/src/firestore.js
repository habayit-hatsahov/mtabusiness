const BASE = (projectId) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ── המרות בין ערכי JS פשוטים לבין ה-typed-value wrapper של Firestore REST ──
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, toFirestoreValue(vv)])) } };
  }
  throw new Error('unsupported value type for firestore write: ' + typeof v);
}

function fromFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fieldsToObject(v.mapValue.fields);
  return null;
}

function docIdFromName(name) {
  return name.split('/').pop();
}

function fieldsToObject(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFirestoreValue(v);
  return out;
}

// שאילתת equality בודדת על collection ברמת השורש — { id, fields: {...} }[]
// limit ברירת מחדל (10) נשאר זהה לכל הקריאות הקיימות — פרמטר אופציונלי חדש, לא משנה התנהגות קיימת.
export async function firestoreRunQuery(env, accessToken, collectionId, fieldPath, value, limit = 10) {
  const resp = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: toFirestoreValue(value),
          },
        },
        limit,
      },
    }),
  });
  if (!resp.ok) throw new Error('firestore_query_failed: ' + (await resp.text()));
  const rows = await resp.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: docIdFromName(r.document.name), fields: fieldsToObject(r.document.fields) }));
}

// שליפת מסמך בודד לפי path (למשל 'businesses/abc123') — מחזיר null אם לא קיים
export async function firestoreGetDoc(env, accessToken, path) {
  const resp = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error('firestore_get_failed: ' + (await resp.text()));
  const doc = await resp.json();
  return { id: docIdFromName(doc.name), fields: fieldsToObject(doc.fields) };
}

// ── טוקן הכניסה לדשבורד העסק — bizTokens/{businessId} (2026-08-23, §244) ────────────────────
// עד היום accessToken ישב על מסמך העסק עצמו. מסמך של עסק approved קריא **ציבורית לגמרי**
// (firestore.rules), ולכן כל אדם יכול היה לשלוף את הטוקן ב-curl אנונימי ולהיכנס לדשבורד של כל
// עסק. הטוקן עבר לאוסף נפרד שקריא רק למנהל/לעסק עצמו/לחבר המקושר.
//
// שני הכיוונים מרוכזים כאן בכוונה: כל צרכן ב-Worker חייב לעבור דרכם, כדי שלא ייווצר שוב מצב
// שבו מקום אחד קורא את הטוקן ממקור אחר וממשיך לעבוד גם כשהמקור הנכון השתנה.
//
// ⚠️ **אין כאן נפילה-לאחור ל-businesses.accessToken, ולא להוסיף אחת.** בזמן המיגרציה כן הייתה
// כזו (כדי שלא ייווצר חלון שבו הכניסה שבורה בין ה-deploy לבין mode=copy), והיא נמחקה ב-2026-08-24
// אחרי ש-mode=cleanup רץ ואומת: 53/53 עסקים `already_clean`, וקריאה ציבורית אנונימית מחזירה
// אפס מופעים של accessToken. כל נפילה-לאחור כזאת מחזירה בדיוק את הפרצה — טוקן שנשאר בטעות על
// מסמך עסק ציבורי היה שוב מספיק לכניסה. עסק בלי מסמך ב-bizTokens פשוט אין לו טוקן (ר' RON
// MOTORS ב-§244) — הפתרון הוא להנפיק לו אחד, לא לקרוא מהמקום הישן.
export async function bizIdFromToken(env, accessToken, bizToken) {
  if (!bizToken) return null;
  const rows = await firestoreRunQuery(env, accessToken, 'bizTokens', 'accessToken', bizToken, 1);
  return rows.length ? rows[0].id : null;   // מזהה-המסמך *הוא* ה-businessId
}
export async function bizTokenFor(env, accessToken, businessId) {
  if (!businessId) return '';
  const d = await firestoreGetDoc(env, accessToken, `bizTokens/${businessId}`);
  return (d && d.fields.accessToken) || '';
}

// ── קוד הכניסה של חבר — memberCodes/{memberId} (2026-08-24, §248) ───────────────────────────
// אותו דפוס ואותו נימוק כמו bizTokens מעל: מסמך members נקרא **בשלמותו**, והוא קריא גם
// לזהות-העסק המקושרת (isLinkedBusinessOwnerOf) — כלומר טוקן דשבורד היה שווה-ערך לקוד הכניסה
// האישי של בעל העסק. הקוד עבר לאוסף שקריא רק למנהל ולחבר עצמו.
//
// ⚠️ נפילה-לאחור זמנית ל-members.loginCode — ר' LEGACY למטה. בלעדיה נוצר חלון שבו אף חבר לא
// יכול להיכנס: ה-Worker החדש עולה ב-deploy, אבל memberCodes ריק עד שהמיגרציה רצה.
// **למחוק אחרי ש-cleanup-member-codes רץ בהצלחה.**
export async function memberIdFromLoginCode(env, accessToken, code) {
  if (!code) return null;
  const rows = await firestoreRunQuery(env, accessToken, 'memberCodes', 'loginCode', String(code), 1);
  if (rows.length) return rows[0].id;   // מזהה-המסמך *הוא* ה-memberId
  // LEGACY
  const old = await firestoreRunQuery(env, accessToken, 'members', 'loginCode', String(code), 1);
  return old.length ? old[0].id : null;
}
export async function loginCodeFor(env, accessToken, memberId) {
  if (!memberId) return '';
  const d = await firestoreGetDoc(env, accessToken, `memberCodes/${memberId}`);
  if (d && d.fields.loginCode) return d.fields.loginCode;
  // LEGACY
  const m = await firestoreGetDoc(env, accessToken, `members/${memberId}`);
  return (m && m.fields.loginCode) || '';
}

// עדכון חלקי (updateMask) — לא נוגע בשדות שלא נמנים ב-fieldsObj
export async function firestorePatch(env, accessToken, path, fieldsObj) {
  const maskParams = Object.keys(fieldsObj)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const body = {
    fields: Object.fromEntries(Object.entries(fieldsObj).map(([k, v]) => [k, toFirestoreValue(v)])),
  };
  const resp = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${path}?${maskParams}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error('firestore_patch_failed: ' + (await resp.text()));
  return resp.json();
}
