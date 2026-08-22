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
// אימות: אותו ADMIN_BACKFILL_SECRET של /backfill-thumbnails — ר' handleBackfillThumbnails.

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

export async function runMigrateBizTokens(env, accessToken, { mode, dryRun }) {
  const businesses = await listAll(env, accessToken, 'businesses');
  const tokenDocs = await listAll(env, accessToken, 'bizTokens');
  const haveToken = new Set(tokenDocs.map((d) => d.id));

  const report = { mode, dryRun: !!dryRun, businesses: businesses.length, done: [], skipped: [], failed: [] };

  for (const b of businesses) {
    const tok = b.fields.accessToken && b.fields.accessToken.stringValue;
    const name = (b.fields.name && b.fields.name.stringValue) || b.id;

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
