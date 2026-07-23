const BASE = (projectId) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ── המרות בין ערכי JS פשוטים לבין ה-typed-value wrapper של Firestore REST ──
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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
