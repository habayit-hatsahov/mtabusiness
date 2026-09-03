// האם אפשר לקשר חשבון Google לחבר לפי המייל המאומת מגוגל, בלי לסכן התאמה שגויה?
// השאלה המכריעה: כמה מהמאושרים נושאים מייל שהוא **ייחודי** באוסף.
const fs = require('fs'); const crypto = require('crypto');
const KEY = JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS = `projects/${KEY.project_id}/databases/(default)/documents`;
const b64 = o => Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
async function getToken(){const now=Math.floor(Date.now()/1e3);const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now};const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})});const j=await r.json();if(!j.access_token)throw new Error(JSON.stringify(j));return j.access_token;}
async function listAll(t,coll){const out=[];let pt='';do{const j=await(await fetch(`https://firestore.googleapis.com/v1/${DOCS}/${coll}?pageSize=300${pt?'&pageToken='+pt:''}`,{headers:{Authorization:`Bearer ${t}`}})).json();if(j.error)throw new Error(j.error.message);for(const d of j.documents||[])out.push({id:d.name.split('/').pop(),f:d.fields||{}});pt=j.nextPageToken||'';}while(pt);return out;}
const S=(f,k)=>f[k]?.stringValue||'';
(async()=>{
  const t=await getToken();
  const ms=await listAll(t,'members');
  const appr=ms.filter(m=>S(m.f,'status')==='approved');
  const linked=appr.filter(m=>S(m.f,'googleEmail'));
  console.log(`רשומות: ${ms.length}  מאושרים: ${appr.length}  חיברו Google: ${linked.length} (${(linked.length/appr.length*100).toFixed(1)}%)`);
  const emailKeys = ['email','mail','userEmail','contactEmail'];
  const key = emailKeys.find(k=>appr.some(m=>S(m.f,k)));
  console.log(`שדה-מייל בשימוש: ${key||'(לא נמצא)'}`);
  const withMail = appr.filter(m=>S(m.f,key));
  console.log(`מאושרים עם מייל: ${withMail.length} מתוך ${appr.length}`);
  const byMail={};
  for(const m of withMail){const e=S(m.f,key).trim().toLowerCase();(byMail[e]=byMail[e]||[]).push(m);}
  const dups=Object.entries(byMail).filter(([,a])=>a.length>1);
  console.log(`כתובות ייחודיות: ${Object.keys(byMail).length}   כתובות שחוזרות ביותר מרשומה אחת: ${dups.length}`);
  for(const [e,a] of dups) console.log(`   ⚠️ ${e} → ${a.map(m=>S(m.f,'firstName')+' '+S(m.f,'lastName')).join(' | ')}`);
  const uniq = withMail.filter(m=>byMail[S(m.f,key).trim().toLowerCase()].length===1);
  console.log(`\n🔑 מאושרים שמייל שלהם ייחודי ולא מקושר עדיין ל-Google: ${uniq.filter(m=>!S(m.f,'googleEmail')).length}`);
  // כמה מהמיילים בכלל נראים כמו gmail (סיכוי גבוה שיש להם חשבון גוגל)
  const g = withMail.filter(m=>/gmail\.com$|googlemail\.com$/i.test(S(m.f,key)));
  console.log(`מתוכם gmail: ${g.length}`);
})().catch(e=>{console.error('❌ '+e.message);process.exit(1);});
