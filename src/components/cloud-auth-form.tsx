'use client';
import {useEffect,useState} from 'react';
import CloudEmailVerification from './cloud-email-verification';
import {appBase,cloudAuth,cloudCall} from '@/lib/cloud/client';
export default function CloudAuthForm(){
 const [emailLogin,setEmailLogin]=useState(false);
 const [emailVerification,setEmailVerification]=useState(false);
 useEffect(()=>{setEmailVerification(new URL(window.location.href).searchParams.has('email'));},[]);
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[verify,setVerify]=useState<((token:string)=>Promise<void>)|null>(null);
 const message=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String(e.message):'请求失败，请稍后重试';
 if(emailVerification)return <CloudEmailVerification/>;
 return <main className="auth-layout"><section className="auth-art"><a href={appBase+'/'} className="brand"><span className="brand-symbol">集</span><span>集刻<small>CAMPUS GATHER</small></span></a><span className="auth-flower">✳</span><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE.</span><h1>让每一次相遇，<br/>都有你的名字。</h1><p>独立账号，真实云端。<br/>和同频的人，一起把校园过得更有意思。</p></div><small>CLOUD EDITION / 免费测试</small></section><section className="auth-card"><span className="eyebrow">A SPACE FOR YOUR CURIOSITY</span><h2>{verify?'验证邮箱':emailLogin?'邮箱验证码登录':register?'创建你的集刻账号':'欢迎回来'}</h2><p>{verify?'查看收件箱与垃圾邮件，先不要刷新页面。':register?'新账号默认是学生，完成注册并登录后即可报名。':'与时光小屋共用云账号，校园活动权限单独检查。'}</p>
 {!verify?<form onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');setBusy(true);const form=e.currentTarget,data=new FormData(form),email=String(data.get('email')).trim(),password=String(data.get('password')),name=String(data.get('name')||'校园同学').trim();try{
 if(emailLogin){const result=await cloudAuth().signInWithOtp({email,options:{shouldCreateUser:false}});if(result.error)throw result.error;const check=result.data?.verifyOtp;if(!check)throw Error('验证码请求未准备好');setVerify(()=>async(token:string)=>{const done=await check({token});if(done.error)throw done.error;await cloudCall('profile');});form.reset();}
 else if(register){if(password!==data.get('confirmation'))throw Error('两次密码不一致');const result=await cloudAuth().signUp({email,password,name});if(result.error)throw result.error;const check=result.data?.verifyOtp;if(!check)throw Error('验证请求未准备好，请重试');setVerify(()=>async(token:string)=>{const done=await check({token});if(done.error)throw done.error;await cloudCall('profile',{name});});form.reset();}
 else{const result=await cloudAuth().signInWithPassword({username:email,password});if(result.error)throw result.error;window.location.assign(appBase+'/');}
 }catch(e){setError(message(e));}finally{setBusy(false);}}}>
 {register&&!emailLogin&&<label>你的昵称<input name="name" maxLength={24} required autoComplete="nickname" placeholder="怎么称呼你"/></label>}
 <label>{register?'邮箱':'用户名或邮箱'}<input name="email" type={register||emailLogin?'email':'text'} required autoComplete="username" placeholder="你的云账号"/></label>
 {!emailLogin&&<label>密码<input name="password" type="password" required minLength={register?10:1} maxLength={128} autoComplete={register?'new-password':'current-password'} placeholder={register?'设置 10–128 位密码':'输入密码'}/></label>}
 {register&&!emailLogin&&<label>再次输入密码<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label>}
 {error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'正在处理…':register||emailLogin?'发送邮箱验证码':'登录集刻'} ↗</button>
 </form>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await verify(String(new FormData(e.currentTarget).get('code')));window.location.assign(appBase+'/');}catch(e){setError(message(e));}finally{setBusy(false);}}}><label>邮件验证码<input name="code" required pattern="[0-9]{4,8}" inputMode="numeric" autoComplete="one-time-code"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'正在验证…':'验证并进入集刻'}</button></form>}
 <button className="auth-toggle" disabled={busy} onClick={()=>{setVerify(null);setRegister(!register);setEmailLogin(false);setError('');}}>{register?'已有账号？返回登录':'第一次来？注册学生账号'}</button><button className="auth-toggle" disabled={busy} onClick={()=>{setEmailLogin(!emailLogin);setRegister(false);setVerify(null);setError('');}}>{emailLogin?'返回密码登录':'用邮箱验证码登录'}</button><a className="auth-toggle" href={appBase+'/demo/'}>免登录体验交互演示 ↗</a><div className="auth-note">免费云端测试，环境当前有效期至 2027 年 5 月 6 日；额度用尽或维护可能暂停。与时光小屋共用云账号，退出可能影响同浏览器其他页面的登录状态。已有邮箱通过验证码流程登录时不会覆盖原密码。</div></section></main>;
}
