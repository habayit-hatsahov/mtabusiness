// ══ §587 — platformDaily: סיכום יומי של פאנל הפלטפורמה ═══════════════════════════════════════
// רץ על הטריגר היומי (PURGE_CRON, 03:17 UTC = 05:17/06:17 בישראל – אחרי שהיום הקודם נסגר).
// מחשב את אתמול תמיד, ומשלים ימים חסרים מהימים שלפניו (תקלה בריצה של לילה אחד לא משאירה חור).
// החישוב עצמו ב-platform-agg.js, **אותו קובץ** שמרכז הניהול מריץ על היום הנוכחי.
import { aggregatePlatformDay, ilDayKey, ilDayRange, PLATFORM_AGG_VERSION } from '../../platform-agg.js';
import { firestoreRunQuery, firestoreGetDoc, firestorePatch } from './firestore.js';

const BASE = (projectId) => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const FILL_BACK_DAYS = 3;     // כמה ימים אחורה להשלים בריצה רגילה
const PAGE = 1000;
const MAX_PAGES = 30;         // 30,000 אירועים ליום – פי 8 מהיום העמוס ביותר שנמדד (20.10: 5,116)

const val = (v) => v == null ? null
  : 'stringValue' in v ? v.stringValue
  : 'timestampValue' in v ? v.timestampValue
  : 'booleanValue' in v ? v.booleanValue
  : 'integerValue' in v ? Number(v.integerValue) : null;

// כל אירועי היום, בדפים לפי createdAt. רק השדות שהחישוב צריך.
async function eventsOfDay(env, token, key) {
  const [start, end] = ilDayRange(key);
  const out = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = { structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: start.toISOString() } } },
        { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { timestampValue: end.toISOString() } } },
      ] } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
      ...(cursor ? { startAt: { values: [{ timestampValue: cursor }], before: false } } : {}),
      limit: PAGE,
    } };
    const r = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('platformDaily query failed: ' + (await r.text()).slice(0, 300));
    const docs = (await r.json()).filter(x => x.document).map(x => x.document.fields || {});
    for (const f of docs) {
      const at = val(f.createdAt);
      out.push({ type: val(f.type), path: val(f.path), blockId: val(f.blockId), memberId: val(f.memberId),
                 sessionId: val(f.sessionId), device: val(f.device), referrer: val(f.referrer),
                 channel: val(f.channel), at: at ? new Date(at) : null });
    }
    if (docs.length < PAGE) return out;
    cursor = val(docs[docs.length - 1].createdAt);
  }
  throw new Error('platformDaily: ' + key + ' עבר את ' + (PAGE * MAX_PAGES) + ' אירועים');
}

export async function computePlatformDay(env, token, key, adminIds) {
  const evs = await eventsOfDay(env, token, key);
  const agg = aggregatePlatformDay(evs, adminIds);
  await firestorePatch(env, token, `platformDaily/${key}`, { ...agg, day: key, computedAt: new Date() });
  return evs.length;
}

export async function runPlatformDaily(env, token, now = new Date()) {
  const admins = (await firestoreRunQuery(env, token, 'members', 'isAdmin', true, 50)).map(m => m.id);
  const done = {};
  for (let i = 1; i <= FILL_BACK_DAYS; i++) {
    const key = ilDayKey(new Date(now.getTime() - i * 864e5));
    if (done[key] !== undefined) continue;
    // אתמול – תמיד (אירועים מאוחרים של אפליקציה שחזרה לרשת נוחתים עם createdAt של השרת,
    // כלומר ביום שבו נשלחו). ימים קודמים – רק אם חסרים או חושבו בגרסה ישנה.
    if (i > 1) {
      const d = await firestoreGetDoc(env, token, `platformDaily/${key}`).catch(() => null);
      if (d && Number(d.fields && d.fields.v) === PLATFORM_AGG_VERSION) { done[key] = 'kept'; continue; }
    }
    done[key] = await computePlatformDay(env, token, key, admins);
  }
  return done;
}
