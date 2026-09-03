// אימות end-to-end של כלל ה-email: כותב כגולש **לא מאומת** (כלומר הכללים חלים),
// ומוחק מיד עם ה-Admin SDK. ⚠️ שני אירועי-בדיקה נכתבים לפרודקשן ונמחקים בסוף הריצה.
const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const PROJ=KEY.project_id, DOCS=`projects/${PROJ}/databases/(default)/documents`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const API_KEY='AIzaSyBfG7AU4BzSAbBpwPyKfA_NzUpy2pxzFu8';   // המפתח הציבורי מ-firebase-config.js

// כתיבה ללא Authorization = גולש אנונימי, בדיוק כמו welcome.html
async function tryWrite(id, fields) {
  const body={writes:[{
    update:{name:`${DOCS}/events/${id}`,fields},
    updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],
    currentDocument:{exists:false},
  }]};
  const r=await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit?key=${API_KEY}`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();
  return {ok:r.ok, err:j.error?j.error.message.slice(0,60):''};
}
const S=v=>({stringValue:v});
(async()=>{
  const base=()=>({type:S('loginFail'),sessionId:S('hb_rulescheck'),device:S('desktop'),
                   channel:S('google:notLinked'),blockId:S('rules-test')});
  const id1='rulescheck_with_email', id2='rulescheck_bogus_field';

  const a=await tryWrite(id1,{...base(),email:S('rules.check@example.com')});
  console.log((a.ok?'✅':'❌')+' אירוע **עם** email התקבל   '+(a.err||''));

  const b=await tryWrite(id2,{...base(),somethingNew:S('x')});
  console.log((!b.ok?'✅':'❌')+' שדה שאינו ברשימה עדיין נדחה   '+(b.err||'(התקבל — זו בעיה!)'));

  const c=await tryWrite('rulescheck_long_email',{...base(),email:S('x'.repeat(90)+'@example.com')});
  console.log((!c.ok?'✅':'❌')+' מייל ארוך מ-80 תווים נדחה   '+(c.err||'(התקבל)'));

  // ── ניקוי: מחיקה דרך Admin SDK (הכללים אוסרים delete על אף אחד) ──────────────────────
  const now=Math.floor(Date.now()/1e3);
  const cl={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now};
  const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(cl);
  const sig=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const tok=(await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+sig})})).json()).access_token;
  let deleted=0;
  for(const id of [id1,id2,'rulescheck_long_email']){
    const r=await fetch(`https://firestore.googleapis.com/v1/${DOCS}/events/${id}`,{method:'DELETE',headers:{Authorization:'Bearer '+tok}});
    if(r.ok)deleted++;
  }
  console.log(`\n🧹 ניקוי: ${deleted} מסמכי-בדיקה נמחקו מהפרודקשן.`);
  // ואימות שהניקוי באמת עבד
  const left=[];
  for(const id of [id1,id2,'rulescheck_long_email']){
    const r=await fetch(`https://firestore.googleapis.com/v1/${DOCS}/events/${id}`,{headers:{Authorization:'Bearer '+tok}});
    if(r.ok)left.push(id);
  }
  console.log(left.length?('❌ נשארו: '+left.join(', ')):'✅ אומת: לא נשאר אף מסמך-בדיקה.');
})().catch(e=>{console.error(e.message);process.exit(1)});
