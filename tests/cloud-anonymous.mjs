import assert from 'node:assert/strict';
const env=process.env.NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID;
if(!env||!/^[a-z0-9-]+$/.test(env))throw Error('Set the public NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID for your own environment.');
const base=`https://${env}.api.tcloudbasegateway.com/v1/rdb/rest`;
const checks=[
 ...['cg_profiles','cg_registrations','cg_activities'].map(table=>({name:`anonymous ${table}`,path:`/${table}?select=*&limit=1`,init:{}})),
 {name:'anonymous activity list',path:'/rpc/cg_call',init:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',payload:{}})}},
 {name:'forged demo identity',path:'/rpc/cg_call',init:{method:'POST',headers:{'Content-Type':'application/json','x-demo-user':'organizer'},body:JSON.stringify({action:'list',payload:{role:'organizer'}})}},
 {name:'invalid bearer token',path:'/rpc/cg_call',init:{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer intentionally-invalid-test-token'},body:JSON.stringify({action:'list',payload:{}})}},
];
for(const check of checks){
 const response=await fetch(base+check.path,{...check.init,redirect:'error',signal:AbortSignal.timeout(15000)});
 const status=response.status;await response.body?.cancel();
 assert.ok(status===401||status===403,`${check.name}: expected access denied, received HTTP ${status}`);
 console.log(`${check.name}: HTTP ${status} denied`);
}
console.log('6 read-only cloud access checks passed; no credentials or response bodies printed.');
