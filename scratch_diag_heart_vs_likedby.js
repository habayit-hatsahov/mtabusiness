// §431 — האם כל לחיצת-לב שנרשמה כאירוע באמת נכתבה ל-likedBy?
const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const API=`https://firestore.googleapis.com/v1/${DOCS}`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
async function tok(){const n=Math.floor(Date.now()/1e3);const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');const j=await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json();return j.access_token;}
const S=(f,k)=>(f&&f[k]&&(f[k].stringValue??f[k].timestampValue))||'';
(async()=>{const t=await tok();const ME=process.argv[2]||'4SfxMCljhYKMLjsk2SOL';
 // כל העסקים
 const biz=[];let p='';do{const j=await(await fetch(`${API}/businesses?pageSize=300${p?'&pageToken='+p:''}`,{headers:{Authorization:`Bearer ${t}`}})).json();for(const d of j.documents||[])biz.push({id:d.name.split('/').pop(),f:d.fields||{}});p=j.nextPageToken||'';}while(p);
 const byId=new Map(biz.map(b=>[b.id,b]));
 const likedByMe=new Set(biz.filter(b=>(b.f.likedBy?.arrayValue?.values||[]).some(v=>v.stringValue===ME)).map(b=>b.id));
 // 400 האירועים האחרונים
 const r=await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'events'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:400}})});
 const j=await r.json();
 const ev=(Array.isArray(j)?j:[]).filter(x=>x.document).map(x=>x.document.fields||{});
 console.log('אירועים שנשלפו:',ev.length,'| טווח:',S(ev[ev.length-1],'createdAt'),'→',S(ev[0],'createdAt'));
 const mine=ev.filter(f=>S(f,'memberId')===ME);
 console.log('מתוכם שלו:',mine.length);
 const hearts=mine.filter(f=>S(f,'type')==='heart');
 console.log('לחיצות-לב שנרשמו:',hearts.length,'| עסקים שונים:',new Set(hearts.map(f=>S(f,'bizId'))).size);
 console.log('\nזמן | עסק | האם נשמר ב-likedBy?');
 for(const f of hearts.slice().reverse()){
   const id=S(f,'bizId');const b=byId.get(id);
   console.log(S(f,'createdAt'),'|',(S(b?.f||{},'name')||id),'|',likedByMe.has(id)?'✅ כן':'❌ לא');
 }
 const missing=[...new Set(hearts.map(f=>S(f,'bizId')))].filter(id=>!likedByMe.has(id));
 console.log('\nלחצו-לב ולא נשמר:',missing.length);
 console.log('סה"כ שמור ב-likedBy:',likedByMe.size);
 // שאר האירועים שלו לפי סוג
 const byType={};for(const f of mine)byType[S(f,'type')]=(byType[S(f,'type')]||0)+1;
 console.log('כל האירועים שלו לפי סוג:',JSON.stringify(byType));
})();
