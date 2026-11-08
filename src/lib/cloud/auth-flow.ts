import {verificationFailure} from './verification-error.ts';

type Result={data?:{session?:unknown;verifyOtp?:((input:{token:string})=>Promise<Result>)|null;updateUser?:((input:{nonce:string;password:string})=>Promise<Result>)|null}|null;error?:unknown};
export type CloudAuthProvider={
 signUp(input:{email:string;password:string;name:string}):Promise<Result>;
 signInWithOtp(input:{email:string;options:{shouldCreateUser:boolean}}):Promise<Result>;
 signInWithPassword(input:{email:string;password:string}|{username:string;password:string}):Promise<Result>;
 resetPasswordForEmail(email:string):Promise<Result>;
 getSession():Promise<Result>;
};
export type AuthMode='password'|'register'|'otp'|'recovery';
type Input={mode:AuthMode;identifier:string;password?:string;confirmation?:string;name?:string};
type Submission={code?:string;password?:string;confirmation?:string};
export type CloudAuthFlow={
 kind:'code'|'ready';identifier:string;mode:AuthMode;
 stage:()=> 'code'|'profile'|'complete';
 submit:(input:Submission)=>Promise<unknown>;
};

export function passwordCredentials(identifier:string,password:string){
 const value=identifier.trim();
 return value.includes('@')?{email:value,password}:{username:value,password};
}
function checkPassword(password:string,confirmation:string){
 if(password.length<10||password.length>128)throw Error('密码需要 10–128 位');
 if(password!==confirmation)throw Error('两次密码不一致');
}
async function invoke(label:string,operation:()=>Promise<Result>){
 try{const result=await operation();if(result.error)throw result.error;return result.data;}
 catch(error){throw verificationFailure(label,error);}
}

export async function beginCloudAuth(auth:CloudAuthProvider,profile:(input:Record<string,unknown>)=>Promise<unknown>,input:Input):Promise<CloudAuthFlow>{
 const identifier=input.identifier.trim(),name=input.name?.trim()||'';
 if(!identifier)throw Error('请填写用户名或邮箱');
 if(input.mode!=='password'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))throw Error('请填写有效邮箱');
 if(input.mode==='register'){
  if(!name||name.length>24)throw Error('昵称需要 1–24 个字');
  checkPassword(input.password||'',input.confirmation||'');
 }
 if(input.mode==='password'&&!input.password)throw Error('请填写密码');
 const data=await invoke(input.mode==='password'?'登录':'发送验证码',()=>{
  if(input.mode==='password')return auth.signInWithPassword(passwordCredentials(identifier,input.password!));
  if(input.mode==='register')return auth.signUp({email:identifier,password:input.password!,name});
  if(input.mode==='recovery')return auth.resetPasswordForEmail(identifier);
  return auth.signInWithOtp({email:identifier,options:{shouldCreateUser:false}});
 });
 const verify=data?.verifyOtp,update=data?.updateUser;
 const requiresCode=input.mode!=='password'&&!data?.session;
 if(requiresCode&&!(input.mode==='recovery'?update:verify))throw Error('验证码请求未准备好，请稍后重新发送');
 let stage:'code'|'profile'|'complete'=requiresCode?'code':'profile',busy=false,completed:unknown;
 return {kind:requiresCode?'code':'ready',identifier,mode:input.mode,stage:()=>stage,
  async submit(submission){
   if(busy)throw Error('正在处理，请勿重复提交');
   if(stage==='complete')return completed;
   busy=true;
   try{
    if(stage==='code'){
     const code=submission.code?.trim()||'';
     if(!/^\d{4,8}$/.test(code))throw Error('请输入 4–8 位验证码');
     if(input.mode==='recovery'){
      checkPassword(submission.password||'',submission.confirmation||'');
      await invoke('密码重置',()=>update!({nonce:code,password:submission.password!}));
     }else await invoke('验证码验证',()=>verify!({token:code}));
     stage='profile';
    }
    const session=await invoke('检查登录状态',()=>auth.getSession());
    if(!session?.session)throw Error('登录状态尚未建立，请重试；仍失败时返回登录');
    try{completed=await profile(input.mode==='register'?{name}:{});}
    catch{throw Error('身份验证已完成，集刻资料暂未准备好，请重试进入，无需再次输入验证码');}
    stage='complete';return completed;
   }finally{busy=false;}
  },
 };
}
