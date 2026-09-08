const fs=require('fs'),crypto=require('crypto');
const KEY=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/habayit-hatsahov-firebase-adminsdk-fbsvc-435903db31.json','utf8'));
const DOCS=`projects/${KEY.project_id}/databases/(default)/documents`;
const API=`https://firestore.googleapis.com/v1/${DOCS}`;
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
async function tok(){const n=Math.floor(Date.now()/1e3);const c={iss:KEY.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n};const u=b64({alg:'RS256',typ:'JWT'})+'.'+b64(c);const s=crypto.createSign('RSA-SHA256').update(u).sign(KEY.private_key).toString('base64url');const j=await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+s})})).json();return j.access_token;}
const S=(f,k)=>(f&&f[k]&&(f[k].stringValue??f[k].timestampValue??f[k].integerValue))||'';
const names=['DJ Adidor - HYPE','ספורט אנד פול . אינטקס חולון','Kaneti insurance','XRAY TLV','חומוס אליהו קריית אונו'];
(async()=>{const t=await tok();const out=[];let p='';
 do{const j=await(await fetch(`${API}/businesses?pageSize=300${p?'&pageToken='+p:''}`,{headers:{Authorization:`Bearer ${t}`}})).json();for(const d of j.documents||[])out.push({id:d.name.split('/').pop(),f:d.fields||{},t:d.updateTime,c:d.createTime});p=j.nextPageToken||'';}while(p);
 for(const n of names){const b=out.find(x=>S(x.f,'name')===n);if(!b){console.log('לא נמצא',n);continue;}
  const lb=(b.f.likedBy?.arrayValue?.values||[]).map(v=>v.stringValue);
  console.log('\n■',n,'|',b.id);
  console.log('  status:',S(b.f,'status'),'| clicks:',S(b.f,'clicks'),'| likedBy:',lb.length,'| updateTime:',b.t);
  console.log('  likesOverride:',JSON.stringify(b.f.likesOverride||null),'| likesOverrideUntil:',S(b.f,'likesOverrideUntil'));
  console.log('  יש 4SfxMCljhYKMLjsk2SOL?',lb.includes('4SfxMCljhYKMLjsk2SOL'));
  console.log('  מספר שדות:',Object.keys(b.f).length);
 }
})();
