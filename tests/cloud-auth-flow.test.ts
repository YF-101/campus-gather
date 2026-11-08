import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginCloudAuth,passwordCredentials} from '../src/lib/cloud/auth-flow.ts';
import type {CloudAuthProvider} from '../src/lib/cloud/auth-flow.ts';

function fixture(){
 const calls:string[]=[];
 let session:unknown=null,verifyFailures=0,profileFailures=0;
 const result=()=>({data:{session},error:null});
 const verify=async({token}:{token:string})=>{
  calls.push('verify');
  if(verifyFailures-- > 0)return {data:null,error:{code:'invalid_argument',message:'private provider response'}};
  assert.equal(token,'123456');session={user:{id:'fictional-student'}};return result();
 };
 return {calls,
  auth:{
   signUp:async()=>{calls.push('signup');return {data:{verifyOtp:verify},error:null};},
   signInWithOtp:async()=>{calls.push('otp');return {data:{verifyOtp:verify},error:null};},
   signInWithPassword:async(input:unknown)=>{calls.push('password');session={user:{id:'fictional-student'}};return result();},
   resetPasswordForEmail:async()=>{calls.push('recovery');return {data:{updateUser:async({nonce,password}:{nonce:string;password:string})=>{assert.equal(nonce,'123456');assert.equal(password,'NewPassword123');calls.push('reset');session={user:{id:'fictional-student'}};return result();}},error:null};},
   getSession:async()=>{calls.push('session');return result();},
  } as CloudAuthProvider,
  profile:async(input:Record<string,unknown>)=>{calls.push('profile');if(profileFailures-- > 0)throw Error('private database response');return {id:'fictional-student',...input};},
  failVerify:()=>{verifyFailures=1;},failProfile:()=>{profileFailures=1;},clearSession:()=>{session=null;},
 };
}
const signup={mode:'register' as const,identifier:' student@example.test ',password:'Password123',confirmation:'Password123',name:' 新同学 '};

test('password credentials distinguish email and username without changing passwords',()=>{
 assert.deepEqual(passwordCredentials(' Student@Example.test ',' keep spaces '),{email:'Student@Example.test',password:' keep spaces '});
 assert.deepEqual(passwordCredentials(' campus-user ','Password123'),{username:'campus-user',password:'Password123'});
});
test('registration verifies before profile creation and preserves nickname',async()=>{
 const f=fixture(),flow=await beginCloudAuth(f.auth,f.profile,signup);
 assert.equal(flow.kind,'code');assert.equal(flow.identifier,'student@example.test');assert.deepEqual(f.calls,['signup']);
 assert.deepEqual(await flow.submit({code:'123456'}),{id:'fictional-student',name:'新同学'});assert.deepEqual(f.calls,['signup','verify','session','profile']);assert.equal(flow.stage(),'complete');
 await flow.submit({code:'123456'});assert.equal(f.calls.filter(x=>x==='verify').length,1);
});
test('wrong OTP can retry; safe errors never contain raw provider detail',async()=>{
 const f=fixture();f.failVerify();const flow=await beginCloudAuth(f.auth,f.profile,signup);
 await assert.rejects(flow.submit({code:'123456'}),error=>!String(error).includes('private provider')&&String(error).includes('验证码'));
 assert.equal(flow.stage(),'code');assert.ok(!f.calls.includes('profile'));
 await flow.submit({code:'123456'});assert.equal(flow.stage(),'complete');
});
test('profile preparation failure retries profile without consuming OTP again',async()=>{
 const f=fixture();f.failProfile();const flow=await beginCloudAuth(f.auth,f.profile,signup);
 await assert.rejects(flow.submit({code:'123456'}),/资料/);assert.equal(flow.stage(),'profile');
 await flow.submit({});assert.equal(f.calls.filter(x=>x==='verify').length,1);assert.equal(f.calls.filter(x=>x==='profile').length,2);
});
test('a provider success without a session cannot initialize the campus profile',async()=>{
 const f=fixture();f.auth.signInWithPassword=async()=>({data:{session:null},error:null});
 const flow=await beginCloudAuth(f.auth,f.profile,{mode:'password',identifier:'student@example.test',password:'Password123'});
 await assert.rejects(flow.submit({}),/登录状态/);assert.ok(!f.calls.includes('profile'));
});
test('email OTP login never silently creates an account',async()=>{
 const f=fixture();f.auth.signInWithOtp=async(input:{email:string;options:{shouldCreateUser:boolean}})=>{assert.equal(input.options.shouldCreateUser,false);return {data:{verifyOtp:async()=>{throw Error('not submitted');}},error:null};};
 const flow=await beginCloudAuth(f.auth,f.profile,{mode:'otp',identifier:'student@example.test'});assert.equal(flow.kind,'code');
});
test('recovery validates a new password before changing a credential',async()=>{
 const f=fixture(),flow=await beginCloudAuth(f.auth,f.profile,{mode:'recovery',identifier:'student@example.test'});
 await assert.rejects(flow.submit({code:'123456',password:'short',confirmation:'short'}),/10/);assert.ok(!f.calls.includes('reset'));
 await assert.rejects(flow.submit({code:'123456',password:'NewPassword123',confirmation:'Different123'}),/不一致/);assert.ok(!f.calls.includes('reset'));
 await flow.submit({code:'123456',password:'NewPassword123',confirmation:'NewPassword123'});assert.equal(flow.stage(),'complete');assert.equal(f.calls.filter(x=>x==='reset').length,1);
});
test('client validation rejects missing nickname or mismatch before sending registration',async()=>{
 const f=fixture();await assert.rejects(beginCloudAuth(f.auth,f.profile,{...signup,name:' '}),/昵称/);
 await assert.rejects(beginCloudAuth(f.auth,f.profile,{...signup,confirmation:'different'}),/不一致/);assert.equal(f.calls.length,0);
});
test('a code callback is required unless the provider has already established a session',async()=>{
 const f=fixture();f.auth.signUp=async()=>({data:{verifyOtp:null,session:null},error:null});
 await assert.rejects(beginCloudAuth(f.auth,f.profile,signup),/未准备好/);assert.ok(!f.calls.includes('profile'));
});
test('concurrent verification submissions cannot consume a code twice',async()=>{
 const f=fixture();let release!:()=>void;
 const blocked=new Promise<void>(resolve=>{release=resolve;});
 const original=f.auth.getSession;
 f.auth.getSession=async()=>{await blocked;return original();};
 const flow=await beginCloudAuth(f.auth,f.profile,signup),first=flow.submit({code:'123456'});
 await assert.rejects(flow.submit({code:'123456'}),/重复提交/);release();await first;
 assert.equal(f.calls.filter(x=>x==='verify').length,1);
});
