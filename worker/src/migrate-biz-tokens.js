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

// כתיבה/מחיקה גנריות של שדה-סוד יחיד — משמשות את מיגרציית §248 (memberCodes). זהות בהתנהגות
// ל-writeTokenDoc/deleteTokenField מעל, רק פרמטריות: אותו טריק updateMask, ואותה מחיקת-שדה
// (השדה נמנה ב-updateMask אבל לא מופיע ב-fields — הדרך של Firestore REST למחוק שדה).
async function writeSecretDoc(env, accessToken, collectionId, docId, field, value) {
  const resp = await fetch(
    `${BASE(env.FIREBASE_PROJECT_ID)}/${collectionId}/${docId}?updateMask.fieldPaths=${field}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [field]: { stringValue: value } } }),
    }
  );
  if (!resp.ok) throw new Error('secret_write_failed: ' + (await resp.text()));
}
async function deleteFieldOn(env, accessToken, collectionId, docId, field) {
  const resp = await fetch(
    `${BASE(env.FIREBASE_PROJECT_ID)}/${collectionId}/${docId}?updateMask.fieldPaths=${field}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {} }),
    }
  );
  if (!resp.ok) throw new Error('field_delete_failed: ' + (await resp.text()));
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
  // ── §248 — קוד הכניסה של חבר יוצא מ-members אל memberCodes/{memberId} (2026-08-24) ────────
  // אותם שני מצבים ואותו סדר-הרצה בדיוק כמו §244, ומאותה סיבה: copy משאיר את הקוד גם על
  // מסמך החבר כדי שלא ייווצר רגע שבו אף אחד לא יכול להיכנס, ורק cleanup סוגר את החור.
  // cleanup מדלג על חבר שאין לו עותק — לא מוחקים קוד לפני שיש לו עותק. שניהם idempotent.
  if (mode === 'copy-member-codes' || mode === 'cleanup-member-codes') {
    const members = await listAll(env, accessToken, 'members');
    const codeDocs = await listAll(env, accessToken, 'memberCodes');
    const haveCode = new Map(
      codeDocs
        .filter((d) => d.fields.loginCode && d.fields.loginCode.stringValue)
        .map((d) => [d.id, d.fields.loginCode.stringValue])
    );
    const rep = { mode, dryRun: !!dryRun, members: members.length, done: [], skipped: [], failed: [] };

    for (const m of members) {
      if (onlyId && m.id !== onlyId) continue;
      const code = m.fields.loginCode && m.fields.loginCode.stringValue;
      const name = `${(m.fields.firstName && m.fields.firstName.stringValue) || ''} ${(m.fields.lastName && m.fields.lastName.stringValue) || ''}`.trim() || m.id;

      if (mode === 'copy-member-codes') {
        if (!code) { rep.skipped.push({ id: m.id, name, why: 'no_login_code' }); continue; }
        if (haveCode.get(m.id) === code) { rep.skipped.push({ id: m.id, name, why: 'already_copied' }); continue; }
        try {
          if (!dryRun) await writeSecretDoc(env, accessToken, 'memberCodes', m.id, 'loginCode', code);
          rep.done.push({ id: m.id, name });
        } catch (e) { rep.failed.push({ id: m.id, name, error: String(e).slice(0, 200) }); }
        continue;
      }

      if (!code) { rep.skipped.push({ id: m.id, name, why: 'already_clean' }); continue; }
      if (!haveCode.has(m.id)) {
        rep.skipped.push({ id: m.id, name, why: 'no_copy_in_memberCodes — הרץ copy-member-codes קודם' });
        continue;
      }
      try {
        if (!dryRun) await deleteFieldOn(env, accessToken, 'members', m.id, 'loginCode');
        rep.done.push({ id: m.id, name });
      } catch (e) { rep.failed.push({ id: m.id, name, error: String(e).slice(0, 200) }); }
    }

    rep.summary = `${mode}${dryRun ? ' (יבש)' : ''}: ${rep.done.length} בוצעו · ${rep.skipped.length} דולגו · ${rep.failed.length} נכשלו`;
    return rep;
  }

  // ── mode=login-readiness — האם כל בעל-עסק יכול להיכנס דרך התפריט באתר (2026-08-24) ────────
  // הכניסה דרך "העסק שלי" ב-home.html היא **מסלול מרפא-את-עצמו**: היא שולפת את הטוקן העדכני
  // מ-bizTokens בכל טעינה, ולכן היא לא נשברת מרוטציית טוקנים — בשונה מלינק ישן במייל/סימנייה.
  // אבל היא תלויה בשרשרת שלמה, ומספיק שחוליה אחת חסרה כדי שפריט-התפריט **פשוט לא יופיע, בשקט**
  // (הקריאה ל-bizTokens שם עטופה ב-catch). כאן נבדקות כל החוליות בבת-אחת, לכל העסקים.
  // זול במכוון: שלוש שליפות-אוסף וצירוף בזיכרון, ולא קריאה-לכל-עסק — כדי לא להיחתך בתקרת
  // קריאות-הרשת של Workers כמו ש-copy/cleanup נחתכו.
  if (mode === 'login-readiness') {
    const members = await listAll(env, accessToken, 'members');
    const byId = new Map(members.map((m) => [m.id, m.fields]));
    const s = (f, k) => (f && f[k] && f[k].stringValue) || '';
    const rows = [];
    for (const b of businesses) {
      const status = s(b.fields, 'status');
      if (status !== 'approved') continue;
      const name = s(b.fields, 'name') || b.id;
      const omid = s(b.fields, 'ownerMemberId');
      const mf = omid ? byId.get(omid) : null;
      const checks = {
        hasToken:        haveToken.has(b.id),
        hasOwnerMember:  !!omid,
        memberExists:    !!mf,
        memberApproved:  !!mf && s(mf, 'status') === 'approved',
        hasLoginCode:    !!(mf && mf.loginCode && mf.loginCode.stringValue),
        isBusinessOwner: !!(mf && mf.isBusinessOwner && mf.isBusinessOwner.booleanValue),
        linkPointsBack:  !!mf && s(mf, 'linkedBusinessId') === b.id,
      };
      const missing = Object.keys(checks).filter((k) => !checks[k]);
      rows.push({ id: b.id, name, ok: missing.length === 0, missing });
    }
    const broken = rows.filter((r) => !r.ok);
    return {
      mode,
      approvedBusinesses: rows.length,
      canEnterViaMenu: rows.length - broken.length,
      broken,
      summary: `${rows.length - broken.length}/${rows.length} בעלי עסקים יכולים להיכנס דרך התפריט`,
    };
  }

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
