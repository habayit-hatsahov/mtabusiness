const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
async function tok(){const n=Math.floor(Date.now()/1e3);const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');const j=await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json();return j.access_token;}
const S=(f,k)=>(f&&f[k]&&(f[k].stringValue??f[k].timestampValue))||'';
(async()=>{const t=await tok();
 const q=async(body)=>{const r=await fetch(`https://firestore.googleapis.com/v1/${DOCS}:runQuery`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(j.error){console.log('ERR',JSON.stringify(j.error).slice(0,400));return[];}return (Array.isArray(j)?j:[]).filter(x=>x.document).map(x=>x.document.fields||{});};
 const recent=await q({structuredQuery:{from:[{collectionId:'events'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:15}});
 console.log('— 15 האירועים האחרונים במערכת —');
 recent.forEach(f=>console.log(S(f,'createdAt'),'|',S(f,'type'),'|',S(f,'memberId')||'—','|',S(f,'device'),'|',S(f,'path')));
 const hearts=await q({structuredQuery:{from:[{collectionId:'events'}],where:{fieldFilter:{field:{fieldPath:'type'},op:'EQUAL',value:{stringValue:'heart'}}},orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:20}});
 console.log('\n— 20 אירועי heart אחרונים —', hearts.length);
 hearts.forEach(f=>console.log(S(f,'createdAt'),'|',S(f,'memberId')||'—','|',S(f,'bizId'),'|',S(f,'device')));
})();
