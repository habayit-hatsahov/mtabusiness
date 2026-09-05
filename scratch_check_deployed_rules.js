// ── §415ב — מה באמת פרוס ב-Firestore ברגע זה ───────────────────────────────────────────────
// קריאה בלבד. 🔑 **למה זה קיים ולא "הרצתי deploy אז זה שם":** §374 — `firebase deploy`
// העלה קבצים ו-Hosting **לא שוחרר**, בזמן שהפלט נראה מוצלח לגמרי. פריסה שנעצרה על אזהרה
// היא מצב חלקי, והדרך היחידה לדעת היא לשאול את השרת מה הוא מחזיק עכשיו.
//
// מושך את ה-ruleset **החי** דרך firebaserules API ומשווה מול הקובץ המקומי.
// הרצה: node scratch_check_deployed_rules.js
const fs = require('fs'), crypto = require('crypto');
const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json', 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function getToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: KEY.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64(claim);
  const sig = crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: u + '.' + sig }) });
  const j = await r.json(); if (!j.access_token) throw new Error(JSON.stringify(j)); return j.access_token;
}

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? '  OK  ' : '  !!  ') + name + (cond ? '' : '  <- ' + (extra || '')));
  if (!cond) fails++;
};

(async () => {
  const token = await getToken('https://www.googleapis.com/auth/cloud-platform');
  const H = { Authorization: `Bearer ${token}` };
  const P = `projects/${KEY.project_id}`;

  const rel = await (await fetch(`https://firebaserules.googleapis.com/v1/${P}/releases`, { headers: H })).json();
  if (rel.error) { console.log('שגיאה בקריאת ה-releases:', rel.error.message); process.exit(1); }
  const firestoreRel = (rel.releases || []).find(r => /cloud\.firestore$/.test(r.name));
  if (!firestoreRel) { console.log('לא נמצא release של cloud.firestore'); process.exit(1); }

  console.log(`\nהגרסה החיה עודכנה: ${firestoreRel.updateTime}`);
  const rs = await (await fetch(`https://firebaserules.googleapis.com/v1/${firestoreRel.rulesetName}`, { headers: H })).json();
  const live = (rs.source?.files || []).map(f => f.content).join('\n');
  const local = fs.readFileSync('firestore.rules', 'utf8');

  console.log(`\n── מה שאמור להיות שם ──`);
  check("'loginOk' ברשימת סוגי-האירועים (§415ב)", live.includes("'loginOk'"),
        'בלי זה כל אירוע loginOk נדחה בשקט והפאנל יראה אפס');
  check("settings/sectionPolicy (§414)", live.includes('match /settings/sectionPolicy'));
  check("settings/sectionState (§414)", live.includes('match /settings/sectionState'));

  // השוואה מלאה — מזהה גם שינוי שנפרס מסשן אחר ואינו אצלנו, וגם ההפך.
  const norm = (t) => t.replace(/\r\n/g, '\n').trim();
  const same = norm(live) === norm(local);
  check('הקובץ המקומי זהה בדיוק לפרוס', same,
        `חי ${norm(live).length} תווים · מקומי ${norm(local).length} תווים`);
  if (!same) {
    const a = norm(live).split('\n'), b = norm(local).split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.log(`\n  ההבדל הראשון בשורה ${i + 1}:\n    חי:    ${a[i] ?? '(אין)'}\n    מקומי: ${b[i] ?? '(אין)'}`); break; }
    }
  }
  console.log(fails ? `\n${fails} בדיקות נכשלו\n` : '\nהכל תואם\n');
  process.exit(fails ? 1 : 0);
})();
