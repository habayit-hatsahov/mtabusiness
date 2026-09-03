// האם באג-הזהות של §406 ירה אי-פעם בפועל?
// טביעת-האצבע: סשן שבו הוקלד טלפון של חבר X, ואחר כך נרשם אירוע עם memberId של Y≠X.
const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const S=(f,k)=>(f&&f[k]&&f[k].stringValue)||'';
const T=f=>f.createdAt&&f.createdAt.timestampValue?new Date(f.createdAt.timestampValue).getTime():0;
const key=p=>String(p||'').replace(/[^0-9]/g,'').slice(-9);
(async()=>{
  const n=Math.floor(Date.now()/1e3);
  const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};
  const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);
  const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const t=(await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json()).access_token;
  const all=[];let pt='';
  do{const j=await(await fetch(`https://firestore.googleapis.com/v1/${DOCS}/members?pageSize=300${pt?'&pageToken='+pt:''}`,{headers:{Authorization:'Bearer '+t}})).json();
     for(const d of j.documents||[])all.push({id:d.name.split('/').pop(),f:d.fields||{}});pt=j.nextPageToken||'';}while(pt);
  const byPhone=new Map(all.map(m=>[key(S(m.f,'phone')),m]));
  const evs=[];let cur=new Date(Date.now()-90*864e5).toISOString();
  for(;;){const body={structuredQuery:{from:[{collectionId:'events'}],where:{fieldFilter:{field:{fieldPath:'createdAt'},op:'GREATER_THAN',value:{timestampValue:cur}}},orderBy:[{field:{fieldPath:'createdAt'},direction:'ASCENDING'}],limit:1000}};
    const j=await(await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    const d=(Array.isArray(j)?j:[]).filter(x=>x.document).map(x=>x.document);if(!d.length)break;
    for(const x of d)evs.push(x.fields);cur=d[d.length-1].fields.createdAt.timestampValue;if(d.length<1000)break;}
  const bySess=new Map();
  for(const e of evs){const sid=S(e,'sessionId');if(!sid)continue;(bySess.get(sid)||bySess.set(sid,[]).get(sid)).push(e);}
  let checked=0,hits=0;
  for(const e of evs.filter(x=>S(x,'type')==='loginFail'&&S(x,'phone'))){
    const owner=byPhone.get(key(S(e,'phone')));if(!owner)continue;
    checked++;
    const later=(bySess.get(S(e,'sessionId'))||[]).filter(x=>T(x)>T(e)&&S(x,'memberId')&&S(x,'type')!=='loginFail');
    for(const l of later) if(S(l,'memberId')!==owner.id){
      // ⚠️ המרוץ של §406 מוכרע במילישניות. פער של דקות אינו הבאג אלא החלפת-חשבון מכוונת
      // (בדיקה, מכשיר משפחתי) — וסינון רופף היה מציג אותה כאירוע-אבטחה.
      const gap = Math.round((T(l)-T(e))/1000);
      if (gap > 120) { console.log('⚪ ' + e.createdAt.timestampValue.slice(0,16) + '  פער ' + gap + 's — החלפת-חשבון מכוונת, לא המרוץ'); continue; }
      hits++;
      console.log(`🔴 ${e.createdAt.timestampValue.slice(0,16)}  הוקלד הטלפון של ${S(owner.f,'firstName')} ${S(owner.f,'lastName')} (${owner.id.slice(0,8)}) → נכנס כ-${S(l,'memberId').slice(0,8)}`);
    }
  }
  console.log(`\nנבדקו ${checked} כשלים שנושאים טלפון של חבר מוכר.`);
  console.log(hits?`❌ ${hits} אי-התאמות זהות.`:'✅ אפס אי-התאמות — אין ראיה שהבאג ירה בפועל בטווח שנמדד.');
  console.log('⚠️ העדר ראיה אינו ראיה: כניסה מוצלחת אינה רושמת אירוע, ולכן מקרה שבו ההחלפה');
  console.log('   קרתה **בלי** כשל שקדם לה אינו נראה כאן בכלל.');
})().catch(e=>{console.error(e.message);process.exit(1)});
