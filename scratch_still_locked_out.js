// ── מי נכשל בכניסה ו**מעולם לא נכנס מאז** ────────────────────────────────────────────────
// 🔑 המדד אינו "אותו סשן" אלא `lastSeenAt` על רשומת החבר — home.html כותב אותו בכל טעינה
// (§367), ולכן הוא עונה על "האם הוא היה בפנים אי-פעם מאז", בלי תלות בטאב או במכשיר.
// ⚠️ מי שאינו רשום אצלנו כלל אינו נמדד כאן — אין לו רשומה שנושאת lastSeenAt.
const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const S=(f,k)=>(f&&f[k]&&f[k].stringValue)||'';
const TS=(f,k)=>f&&f[k]&&f[k].timestampValue?new Date(f[k].timestampValue).getTime():0;
const T=f=>TS(f,'createdAt');
const key=p=>String(p||'').replace(/[^0-9]/g,'').slice(-9);
(async()=>{
  const n=Math.floor(Date.now()/1e3);
  const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};
  const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);
  const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');
  const t=(await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json()).access_token;
  const members=[];let pt='';
  do{const j=await(await fetch(`https://firestore.googleapis.com/v1/${DOCS}/members?pageSize=300${pt?'&pageToken='+pt:''}`,{headers:{Authorization:'Bearer '+t}})).json();
     for(const d of j.documents||[])members.push({id:d.name.split('/').pop(),f:d.fields||{}});pt=j.nextPageToken||'';}while(pt);
  const byPhone=new Map(members.map(m=>[key(S(m.f,'phone')),m]));
  const byId=new Map(members.map(m=>[m.id,m]));

  const evs=[];let cur=new Date(Date.now()-90*864e5).toISOString();
  for(;;){const body={structuredQuery:{from:[{collectionId:'events'}],where:{fieldFilter:{field:{fieldPath:'createdAt'},op:'GREATER_THAN',value:{timestampValue:cur}}},orderBy:[{field:{fieldPath:'createdAt'},direction:'ASCENDING'}],limit:1000}};
    const j=await(await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    const d=(Array.isArray(j)?j:[]).filter(x=>x.document).map(x=>x.document);if(!d.length)break;
    for(const x of d)evs.push(x.fields);cur=d[d.length-1].fields.createdAt.timestampValue;if(d.length<1000)break;}

  // הכשל **האחרון** לכל אדם — קודמים לו כבר לא מעניינים אם הוא נכנס אחריהם
  const last=new Map();
  for(const e of evs){
    if(S(e,'type')!=='loginFail')continue;
    // שני מקורות-זיהוי: הטלפון שהוקלד, או memberId שנרשם על הכשל (§404).
    const who = (S(e,'phone') && byPhone.get(key(S(e,'phone')))) ||
                (S(e,'memberId') && byId.get(S(e,'memberId'))) || null;
    if(!who)continue;
    const prev=last.get(who.id);
    if(!prev||T(e)>T(prev.e))last.set(who.id,{who,e});
  }
  const rows=[...last.values()].map(({who,e})=>{
    const seen=TS(who.f,'lastSeenAt');
    return {name:`${S(who.f,'firstName')} ${S(who.f,'lastName')}`.trim(),phone:S(who.f,'phone'),
            email:S(who.f,'email'),status:S(who.f,'status'),
            failAt:e.createdAt.timestampValue.slice(0,16).replace('T',' '),
            ch:S(e,'channel'),seen,failT:T(e),
            inSince: seen>0 && seen>T(e)};
  }).sort((a,b)=>b.failT-a.failT);

  console.log(`נבדקו ${rows.length} אנשים שנכשלו בכניסה ב-90 יום ויש להם רשומה.\n`);
  const out=rows.filter(r=>!r.inSince);
  const ok=rows.filter(r=>r.inSince);
  console.log(`✅ ${ok.length} נכנסו מאז הכשל האחרון שלהם.`);
  // ⚠️ מודפסים גם מי שכן נכנסו — אחרת "0 תקועים" הוא מספר שאי אפשר לאמת: רשימה ריקה
  // נראית זהה בין "כולם בסדר" לבין "השדה lastSeenAt לא נטען בכלל".
  console.log('   מי שנכשל ומתי, ומתי נראה לאחרונה:');
  for(const r of ok)
    console.log(`   ✅ ${r.name.padEnd(18)} ${r.phone.padEnd(11)} נכשל ${r.failAt} (${r.ch.padEnd(18)})  →  נכנס ${new Date(r.seen).toISOString().slice(0,16).replace('T',' ')}`);
  console.log(`\n🔴 ${out.length} **לא נכנסו מאז** — אלה שצריך לפנות אליהם:\n`);
  for(const r of out)
    console.log(`   ${r.name.padEnd(18)} ${r.phone.padEnd(11)} ${r.email.padEnd(30)} סטטוס=${r.status.padEnd(9)} נכשל ${r.failAt} (${r.ch})   נראה לאחרונה: ${r.seen?new Date(r.seen).toISOString().slice(0,16).replace('T',' '):'מעולם'}`);
})().catch(e=>{console.error(e.message);process.exit(1)});
