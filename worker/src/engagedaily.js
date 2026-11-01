// ══ §702 — engageDaily: חשיפות לכל עסק ליום, לסיכום של לשונית "מעורבות" ═══════════════════════════
// החשיפות נשמרות ב-businesses/{id}/statsDaily/{YYYY-MM-DD UTC}.imp (§418ה, home.html) – לא באוסף
// events, ואין בהן שדה תאריך משותף. כאן: רשימת העסקים (שאילתה אחת, בלי שדות) + batchGet אחד
// לכל המסמכים של היום – 2 בקשות, ~150 קריאות ליום.
// ⚠️ מזהה המסמך הוא תאריך **UTC** (כך home.html כותב), וימי הסיכום הם ימי ישראל – הפרש של 2–3 שעות
// בקצה היום. נאמר על המסך.
const BASE = (p) => `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;

export async function impressionsOfDay(env, token, key) {
  const base = BASE(env.FIREBASE_PROJECT_ID);
  const q = await fetch(`${base}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'businesses' }], select: { fields: [{ fieldPath: '__name__' }] }, limit: 2000 } }) });
  if (!q.ok) throw new Error('engageDaily businesses query failed: ' + (await q.text()).slice(0, 200));
  const names = (await q.json()).filter(x => x.document).map(x => x.document.name).filter(nm => !/\/zz-rule-probe$/.test(nm));
  const imp = {};
  let total = 0;
  for (let i = 0; i < names.length; i += 300) {
    const r = await fetch(`${base}:batchGet`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: names.slice(i, i + 300).map(nm => `${nm}/statsDaily/${key}`) }) });
    if (!r.ok) throw new Error('engageDaily batchGet failed: ' + (await r.text()).slice(0, 200));
    for (const x of await r.json()) {
      if (!x.found) continue;
      const f = x.found.fields || {}, v = f.imp ? Number(f.imp.integerValue || f.imp.doubleValue || 0) : 0;
      if (!v) continue;
      const id = x.found.name.split('/businesses/')[1].split('/')[0];
      imp[id] = v; total += v;
    }
  }
  return { imp, impTotal: total };
}
