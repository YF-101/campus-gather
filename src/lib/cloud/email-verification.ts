import {verificationFailure} from './verification-error.ts';
// Verification and sudo tokens stay in this closure and are never persisted or logged.
interface VerificationAuth {
 getUser():Promise<{data?:{user?:{id?:string;email?:string}|null};error?:unknown}>;
 getVerification(input:{email:string;target:string}):Promise<{verification_id?:string}>;
 verify(input:{verification_id:string;verification_code:string}):Promise<{verification_token?:string}>;
 sudo(input:{verification_token:string}):Promise<{sudo_token?:string}>;
 bindEmail(input:{email:string;verification_token:string;sudo_token:string}):Promise<void>;
}
export async function prepareEmailVerification(auth:VerificationAuth,backendStatus:()=>Promise<boolean>){
 const initial=await auth.getUser();if(initial.error)throw initial.error;
 const user=initial.data?.user;
 if(!user?.id||!user.email)throw Error('请先登录绑定了邮箱的账号');
 const {id,email}=user;
 const sent=await auth.getVerification({email,target:'USER'});
 if(!sent.verification_id)throw Error('未获取验证码请求，请稍后重试');
 let consumed=false,busy=false;
 return async(code:string)=>{
  if(consumed)throw Error('此验证码请求已使用，请重新获取验证码');
  if(busy)throw Error('正在验证，请稍候');
  busy=true;
  try{
   const current=await auth.getUser();if(current.error)throw current.error;
   if(current.data?.user?.id!==id||current.data.user.email!==email)throw Error('登录账号或邮箱已变化，请重新获取验证码');
   const proof=await auth.verify({verification_id:sent.verification_id!,verification_code:code}).catch(e=>{throw verificationFailure('验证码校验',e);});
   consumed=true;
   if(!proof.verification_token)throw Error('平台未返回邮箱验证凭证，请重新获取验证码');
   const elevated=await auth.sudo({verification_token:proof.verification_token}).catch(e=>{throw verificationFailure('账号二次确认',e);});
   if(!elevated.sudo_token)throw Error('未获取账号确认凭证，请重新获取验证码');
   await auth.bindEmail({email,verification_token:proof.verification_token,sudo_token:elevated.sudo_token}).catch(e=>{throw verificationFailure('邮箱绑定',e);});
   if(!await backendStatus())throw Error('平台已处理邮箱绑定，但后端尚未确认验证状态。请勿重复提交；可稍后重新检查状态。');
  }finally{busy=false;}
 };
}
