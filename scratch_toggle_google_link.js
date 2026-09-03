// ── §408 — ניתוק/חיבור זמני של Google לרשומת חבר, לבדיקת הקישור-בלחיצה של §403 ──────────
// ⚠️ **כותב לרשומה אמיתית בפרודקשן.** הערכים נשמרים לקובץ גיבוי לפני המחיקה, ו--restore
// מחזיר אותם בדיוק. הבדיקה עצמה (לחיצה על "כן, זה אני") מחזירה אותם ממילא — הגיבוי הוא
// רשת-ביטחון למקרה שהזרימה תיכשל באמצע.
//   ניתוק:  node scratch_toggle_google_link.js <memberId>
//   שחזור:  node scratch_toggle_google_link.js <memberId> --restore
const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const ID=process.argv[2], RESTORE=process.argv[3]==='--restore';
const BAK=`scratch_google_link_backup_${ID}.json`;
if(!ID){console.error('חסר memberId');process.exit(1);}
const FIELDS=['googleSub','googleEmail','googleLinkedAt'];
(async()=>{
  const n=Math.floor(Date.now()/1e3);
  const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};
  const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);
  const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const t=(await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json()).access_token;
  const url=`https://firestore.googleapis.com/v1/${DOCS}/members/${ID}`;
  const mask='?'+FIELDS.map(f=>'updateMask.fieldPaths='+f).join('&');
  const doc=await(await fetch(url,{headers:{Authorization:'Bearer '+t}})).json();
  if(doc.error){console.error('❌ '+doc.error.message);process.exit(1);}
  const f=doc.fields||{};
  const name=(f.firstName?.stringValue||'')+' '+(f.lastName?.stringValue||'');

  if(RESTORE){
    if(!fs.existsSync(BAK)){console.error('❌ אין קובץ גיבוי — כנראה אין מה לשחזר');process.exit(1);}
    const bak=JSON.parse(fs.readFileSync(BAK,'utf8'));
    const r=await fetch(url+mask,{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({fields:bak})});
    console.log(r.ok?`✅ ${name} — החיבור שוחזר מהגיבוי.`:'❌ '+JSON.stringify(await r.json()).slice(0,200));
    return;
  }
  const present=FIELDS.filter(k=>f[k]!==undefined);
  if(!present.length){console.log(`⚪ ${name} — כבר לא מחובר ל-Google. אין מה לנתק.`);return;}
  const bak={};for(const k of present)bak[k]=f[k];
  fs.writeFileSync(BAK,JSON.stringify(bak,null,1),'utf8');
  console.log(`💾 גיבוי נשמר: ${BAK}`);
  console.log(`   ${JSON.stringify(bak).slice(0,140)}`);
  // PATCH עם updateMask ובלי השדות בגוף = מחיקה של אותם שדות בלבד
  const r=await fetch(url+mask,{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({fields:{}})});
  if(!r.ok){console.error('❌ '+JSON.stringify(await r.json()).slice(0,200));process.exit(1);}
  const after=(await(await fetch(url,{headers:{Authorization:'Bearer '+t}})).json()).fields||{};
  const left=FIELDS.filter(k=>after[k]!==undefined);
  console.log(left.length?`❌ נשארו שדות: ${left.join(', ')}`:`✅ ${name} — נותק מ-Google. סטטוס=${after.status?.stringValue} · isAdmin=${after.isAdmin?.booleanValue}`);
  console.log('\nעכשיו: פתח את welcome.html במצב פרטי, לחץ "המשך עם Google" ובחר את החשבון שלך.');
  console.log('אמורה להופיע ההצעה "מצאנו רשומה על השם רמי ב\' …" עם כפתור "כן, זה אני".');
})().catch(e=>{console.error(e.message);process.exit(1)});
