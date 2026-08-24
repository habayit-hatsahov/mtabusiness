// ── מיגרציה חד-פעמית: accessToken יוצא ממסמך העסק אל bizTokens/{businessId} (2026-08-23, §244)
//
// למה: firestore.rules מתיר get+list ציבורי על כל מסמך עסק שה-status שלו 'approved', ו-Firestore
// לא יודע לסנן שדות ברמת ה-rule. כלומר accessToken — טוקן-הכניסה שה-Worker מנפיק מולו Firebase
// custom token עם uid=businessId — היה נקרא ב-curl אנונימי, ואיתו אפשר היה להיכנס לדשבורד של כל
// עסק ולערוך אותו. אומת חי (2026-08-22).
//
// ⚠️ שני מצבים נפרדים בכוונה, ולא פעולה אחת — כדי שלא יהיה **רגע אחד** שבו הכניסה שבורה:
//
//   mode=copy     כותב bizTokens/{id} ומשאיר את accessToken על מסמך העסק. אפשר להריץ בזמן
//                 שה-Worker הישן עדיין חי — הוא ממשיך לקרוא מהמקום הישן ולא נשבר כלום.
//   mode=cleanup  מוחק את השדה accessToken ממסמכי העסקים. להריץ **רק אחרי** שה-Worker החדש,
//                 ה-rules והאתר כבר בחוץ ואומת שכניסה לדשבורד עובדת. זה הרגע שבו החור נסגר.
//
// שניהם idempotent: אפשר להריץ שוב בלי נזק. mode=cleanup מדלג על עסק שאין לו רשומה ב-bizTokens
// (הגנה: לא מוחקים טוקן לפני שיש לו עותק), ומדווח עליו ב-skipped.
//
// ✅ **שני המצבים האלה כבר רצו והושלמו** (copy: 2026-08-23 · cleanup: 2026-08-24, 53/53 נקיים).
// הם נשארים כאן כתיעוד-מריץ ולא נמחקים, כי הם idempotent ולא-מזיקים.
//
//   mode=mint-missing  מנפיק accessToken **חדש** (crypto.randomUUID, בדיוק כמו business.html)
//                      לכל עסק שאין לו מסמך ב-bizTokens בכלל. נוסף ב-2026-08-24 כי §244 גילה
//                      שאין שום ממשק להנפקת טוקן — RON MOTORS מעולם לא יכול היה להיכנס לדשבורד
//                      שלו, המייל שקיבל הכיל לינק שנבנה משדה ריק. **לעולם לא דורס טוקן קיים**
//                      (זו לא רוטציה — רוטציה הורגת כל לינק שנשלח עד היום, ר' §244). מקבל
//                      `onlyId` אופציונלי כדי לטפל בעסק בודד, ומחזיר את הטוקן בגוף התשובה
//                      (הוא הרי דרוש לבניית הלינק שנשלח לבעל העסק).
//
// אימות: אותו ADMIN_BACKFILL_SECRET של /backfill-thumbnails — ר' handleBackfillThumbnails.

import { firestoreRunQuery } from './firestore.js';

const BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// רשימת כל מסמכי אוסף עם עימוד — firestoreRunQuery יודע רק שאילתות-שוויון, וכאן צריך *הכול*
// (גם pending וגם rejected — לכולם יש accessToken, ר' ההערה ב-firestore.rules סעיף ב).
async function listAll(env, accessToken, collectionId) {
  const out = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ pageSize: '300' });
    if (pageToken) qs.set('pageToken', pageToken);
    const resp = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/${collectionId}?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error('list_failed: ' + (await resp.text()));
    const data = await resp.json();
    for (const d of data.documents || []) {
      out.push({ id: d.name.split('/').pop(), fields: d.fields || {} });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function writeTokenDoc(env, accessToken, bizId, token) {
  const resp = await fetch(
    `${BASE(env.FIREBASE_PROJECT_ID)}/bizTokens/${bizId}?updateMask.fieldPaths=accessToken`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { accessToken: { stringValue: token } } }),
    }
  );
  if (!resp.ok) throw new Error('token_write_failed: ' + (await resp.text()));
}

// מחיקת שדה בודד: השדה נמנה ב-updateMask אבל **לא** מופיע ב-fields — זו הדרך של Firestore REST
// למחוק שדה. firestorePatch הרגיל לא יודע לעשות את זה (הוא בונה את שניהם מאותו אובייקט).
async function deleteTokenField(env, accessToken, bizId) {
  const resp = await fetch(
    `${BASE(env.FIREBASE_PROJECT_ID)}/businesses/${bizId}?updateMask.fieldPaths=accessToken`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {} }),
    }
  );
  if (!resp.ok) throw new Error('field_delete_failed: ' + (await resp.text()));
}

export async function runMigrateBizTokens(env, accessToken, { mode, dryRun, onlyId }) {
  const businesses = await listAll(env, accessToken, 'businesses');
  const tokenDocs = await listAll(env, accessToken, 'bizTokens');
  // ⚠️ "יש מסמך" ≠ "יש טוקן". מסמך ב-bizTokens עם accessToken ריק/חסר הוא חסר-טוקן לכל דבר,
  // ולכן נדרש כאן **ערך לא-ריק** ולא רק קיום המסמך: אחרת mint-missing היה מדלג על עסק שאין לו
  // טוקן בפועל, ורשת-הביטחון של cleanup הייתה מוחקת טוקן מול "עותק" ריק.
  const haveToken = new Set(
    tokenDocs
      .filter((d) => d.fields.accessToken && d.fields.accessToken.stringValue)
      .map((d) => d.id)
  );

  const report = { mode, dryRun: !!dryRun, businesses: businesses.length, done: [], skipped: [], failed: [] };

  // ── mode=probe — בדיקת-בריאות קריאה-בלבד לשרשרת-הכניסה של עסק בודד (2026-08-24) ──────────
  // עונה על "למה בעל-עסק X לא מצליח להיכנס לדשבורד" בקריאה אחת: יש לו מסמך ב-bizTokens? יש בו
  // ערך? ו-**האם runQuery מוצא את הערך הזה** — כלומר בדיוק המסלול ש-bizIdFromToken עובר בכניסה
  // (`/mint-biz-token`). מחזיר אורכים ובוליאנים בלבד, לא את הטוקן עצמו.
  // onlyId = מזהה העסק. שים לב שזה בודק את הטוקן ה**שמור** — אם הבדיקה כאן ירוקה אבל הכניסה
  // נכשלת, הטוקן שביד בעל-העסק שונה מהשמור (לינק ישן), לא תקלה בצד השרת.
  if (mode === 'probe') {
    const target = tokenDocs.find((d) => d.id === onlyId);
    const stored = (target && target.fields.accessToken && target.fields.accessToken.stringValue) || '';
    const viaQuery = stored
      ? await firestoreRunQuery(env, accessToken, 'bizTokens', 'accessToken', stored, 1)
      : [];

    // ── הקישור הדו-כיווני חבר↔עסק, ושתי הצלעות שלו **נפרדות לגמרי** ────────────────────────
    // צלע א' (`businesses/{id}.ownerMemberId`) היא מה שחוקי-Firestore בודקים ב-isOwnerMemberOf —
    // בלעדיה החבר לא יכול לקרוא את bizTokens בכלל.
    // צלע ב' (`members/{id}.isBusinessOwner` + `.linkedBusinessId`) היא מה ש-home.html בודק כדי
    // להציג "העסק שלי" בתפריט הצד.
    // קישור חד-צדדי = "העסק שלי" **פשוט לא מופיע, בשקט** (הקריאה ל-bizTokens עטופה ב-catch),
    // ולכן חייבים לראות את שתי הצלעות ולא להסיק אחת מהשנייה.
    const bizDoc = businesses.find((b) => b.id === onlyId);
    const ownerMemberId = (bizDoc && bizDoc.fields.ownerMemberId && bizDoc.fields.ownerMemberId.stringValue) || '';
    let member = null;
    if (ownerMemberId) {
      const resp = await fetch(`${BASE(env.FIREBASE_PROJECT_ID)}/members/${ownerMemberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) member = (await resp.json()).fields || {};
    }
    const mStr = (k) => (member && member[k] && member[k].stringValue) || '';

    return {
      mode,
      onlyId,
      tokenDocsInCollection: tokenDocs.length,
      docExists: !!target,
      storedLength: stored.length,
      queryFoundIds: viaQuery.map((r) => r.id),
      querySeesItsOwnValue: viaQuery.length > 0 && viaQuery[0].id === onlyId,
      // צלע א' — שער ההרשאות
      ownerMemberId,
      // צלע ב' — התנאים להצגת "העסק שלי" בתפריט
      memberDocExists: !!member,
      memberIsBusinessOwner: !!(member && member.isBusinessOwner && member.isBusinessOwner.booleanValue),
      memberLinkedBusinessId: mStr('linkedBusinessId'),
      linkPointsBack: mStr('linkedBusinessId') === onlyId,
      memberHasLoginCode: mStr('loginCode').length > 0,   // בלי הקוד עצמו
      bizStatus: (bizDoc && bizDoc.fields.status && bizDoc.fields.status.stringValue) || '',
    };
  }

  for (const b of businesses) {
    const tok = b.fields.accessToken && b.fields.accessToken.stringValue;
    const name = (b.fields.name && b.fields.name.stringValue) || b.id;

    if (onlyId && b.id !== onlyId) continue;

    if (mode === 'mint-missing') {
      // לא דורסים טוקן קיים בשום מצב — גם לא אחד שנשאר בטעות על מסמך העסק (אחרי cleanup
      // אין כאלה, אבל אם יופיע אחד, הוא סימן לתקלה ולא הזמנה להנפיק שני טוקנים לאותו עסק).
      if (haveToken.has(b.id)) { report.skipped.push({ id: b.id, name, why: 'has_token' }); continue; }
      if (tok) { report.skipped.push({ id: b.id, name, why: 'legacy_token_on_biz_doc — הרץ mode=copy' }); continue; }
      const status = (b.fields.status && b.fields.status.stringValue) || '';
      const fresh = crypto.randomUUID();
      try {
        if (!dryRun) await writeTokenDoc(env, accessToken, b.id, fresh);
        // הטוקן חוזר בגוף התשובה כי בלעדיו אין איך לבנות את הלינק לבעל העסק. התשובה
        // מוגנת ב-ADMIN_BACKFILL_SECRET ונקראת ידנית בלבד (curl), לא מהאתר.
        report.done.push({ id: b.id, name, status, accessToken: dryRun ? '(dry-run)' : fresh });
      } catch (e) { report.failed.push({ id: b.id, name, error: String(e).slice(0, 200) }); }
      continue;
    }

    if (mode === 'copy') {
      if (!tok) { report.skipped.push({ id: b.id, name, why: 'no_access_token' }); continue; }
      // כבר הועתק וזהה — לא נוגעים (idempotent, וגם לא דורסים רוטציה שנעשתה בינתיים)
      const existing = tokenDocs.find((d) => d.id === b.id);
      if (existing && existing.fields.accessToken && existing.fields.accessToken.stringValue === tok) {
        report.skipped.push({ id: b.id, name, why: 'already_copied' });
        continue;
      }
      try {
        if (!dryRun) await writeTokenDoc(env, accessToken, b.id, tok);
        report.done.push({ id: b.id, name });
      } catch (e) { report.failed.push({ id: b.id, name, error: String(e).slice(0, 200) }); }
      continue;
    }

    if (mode === 'cleanup') {
      if (!tok) { report.skipped.push({ id: b.id, name, why: 'already_clean' }); continue; }
      // רשת-הביטחון המרכזית: לא מוחקים טוקן שאין לו עותק — עסק כזה היה מאבד גישה לדשבורד.
      if (!haveToken.has(b.id)) {
        report.skipped.push({ id: b.id, name, why: 'no_copy_in_bizTokens — הרץ mode=copy קודם' });
        continue;
      }
      try {
        if (!dryRun) await deleteTokenField(env, accessToken, b.id);
        report.done.push({ id: b.id, name });
      } catch (e) { report.failed.push({ id: b.id, name, error: String(e).slice(0, 200) }); }
      continue;
    }
  }

  report.summary = `${mode}${dryRun ? ' (יבש)' : ''}: ${report.done.length} בוצעו · ${report.skipped.length} דולגו · ${report.failed.length} נכשלו`;
  return report;
}
