'use client';

import {useEffect,useRef,useState} from 'react';
import CloudEmailVerification from './cloud-email-verification';
import {appBase,cloudAuth,cloudCall} from '@/lib/cloud/client';
import {beginCloudAuth} from '@/lib/cloud/auth-flow';
import type {AuthMode,CloudAuthFlow} from '@/lib/cloud/auth-flow';

type RequestInput={mode:AuthMode;identifier:string;name?:string;password?:string;confirmation?:string};
export default function CloudAuthForm(){
 const [mode,setMode]=useState<AuthMode>('password');
 const [legacy,setLegacy]=useState(false),[flow,setFlow]=useState<CloudAuthFlow|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState(0);
 const lock=useRef(false),requestInput=useRef<RequestInput|null>(null),resendAt=useRef(0);
 const errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{setLegacy(new URL(window.location.href).searchParams.has('email'));},[]);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 useEffect(()=>{
  if(!flow)return;
  const update=()=>setRemaining(Math.max(0,Math.ceil((resendAt.current-Date.now())/1000)));
  update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
 },[flow]);
 async function run(operation:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await operation();}catch(cause){setError(cause instanceof Error?cause.message:'暂时无法完成，请稍后重试');}
  finally{lock.current=false;setBusy(false);}
 }
 function switchMode(next:AuthMode){
  if(lock.current)return;requestInput.current=null;setFlow(null);setMode(next);setError('');
 }
 async function prepare(input:RequestInput){
  const next=await beginCloudAuth(cloudAuth(),payload=>cloudCall('profile',payload),input);
  setFlow(next);
  if(next.kind==='ready'){
   await next.submit({});requestInput.current=null;window.location.assign(appBase+'/');
  }else{resendAt.current=Date.now()+60_000;setRemaining(60);}
 }
 if(legacy)return <CloudEmailVerification/>;
 const preparing=flow?.stage()==='profile';
 const heading=preparing?'准备进入集刻':flow?(mode==='recovery'?'验证邮箱并设置新密码':'输入邮件验证码'):({password:'欢迎回来',register:'创建你的集刻账号',otp:'邮箱验证码登录',recovery:'找回账号密码'}[mode]);
 return <main className="auth-layout">
  <section className="auth-art">
   <a href={appBase+'/'} className="brand"><span className="brand-symbol">集</span><span>集刻<small>CAMPUS GATHER</small></span></a>
   <span className="auth-flower">✳</span>
   <div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE.</span><h1>让每一次相遇，<br/>都有你的名字。</h1><p>发现活动，安排期待。<br/>和同频的人，一起把校园过得更有意思。</p></div>
   <small>CLOUD EDITION / 账号与活动</small>
  </section>
  <section className="auth-card">
   <span className="eyebrow">A SPACE FOR YOUR CURIOSITY</span><h2>{heading}</h2>
   <p>{preparing?'身份验证已完成。若资料加载失败，可重试进入，无需重复使用验证码。':flow?`验证码已发送至 ${flow.identifier}。请检查收件箱与垃圾邮件；过期后可重新发送。`:mode==='register'?'注册成功后可报名，也能发起和管理自己的活动。':mode==='recovery'?'通过账号绑定的邮箱验证码设置新密码。':'登录后，查看你的活动安排。'}</p>
   {!flow?<form onSubmit={event=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const input={mode,identifier:String(data.get('identifier')||''),name:String(data.get('name')||''),password:String(data.get('password')||''),confirmation:String(data.get('confirmation')||'')};
    void run(async()=>{requestInput.current=input;await prepare(input);form.reset();});
   }}>
    {mode==='register'&&<label>你的昵称<input name="name" maxLength={24} required autoComplete="nickname" placeholder="怎么称呼你"/></label>}
    <label>{mode==='password'?'用户名或邮箱':'邮箱'}<input name="identifier" type={mode==='password'?'text':'email'} required maxLength={254} autoComplete="username" placeholder={mode==='password'?'你的用户名或邮箱':'你的账号邮箱'}/></label>
    {(mode==='password'||mode==='register')&&<label>密码<input name="password" type="password" required minLength={mode==='register'?10:1} maxLength={128} autoComplete={mode==='register'?'new-password':'current-password'} placeholder={mode==='register'?'设置 10–128 位密码':'输入密码'}/></label>}
    {mode==='register'&&<><label>再次输入密码<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label><p className="auth-note">已有账号请返回登录。注册流程不会覆盖已有账号密码，忘记密码请使用找回入口。</p></>}
    <button className="primary full" disabled={busy}>{busy?'正在处理…':mode==='password'?'登录集刻':'发送邮箱验证码'} ↗</button>
   </form>:<form onSubmit={event=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    void run(async()=>{await flow.submit({code:String(data.get('code')||''),password:String(data.get('password')||''),confirmation:String(data.get('confirmation')||'')});form.reset();requestInput.current=null;window.location.assign(appBase+'/');});
   }}>
    {!preparing&&<label>邮件验证码<input name="code" required pattern="[0-9]{4,8}" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="输入邮件中的验证码"/></label>}
    {!preparing&&mode==='recovery'&&<>
     <label>新密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="设置 10–128 位新密码"/></label>
     <label>再次输入新密码<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label>
     <p className="auth-note">该云账号与时光小屋共用，修改密码也会影响使用同一云账号的其他页面。请由账号本人操作。</p>
    </>}
    <button className="primary full" disabled={busy}>{busy?'正在处理…':preparing?'重试进入集刻':mode==='recovery'?'确认重置并进入集刻':'验证并进入集刻'}</button>
    {!preparing&&<button type="button" className="auth-toggle" disabled={busy||remaining>0} onClick={()=>void run(async()=>{if(requestInput.current)await prepare(requestInput.current);})}>{remaining>0?`${remaining} 秒后可重新发送`:'重新发送验证码'}</button>}
    <button type="button" className="auth-toggle" disabled={busy} onClick={()=>switchMode(mode==='recovery'?'recovery':mode)}>重新填写{mode==='password'?'登录信息':'邮箱'}</button>
   </form>}
   {error&&<p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
   {mode==='password'?<>
    <button className="auth-toggle" disabled={busy} onClick={()=>switchMode('register')}>第一次来？创建账号</button>
    <button className="auth-toggle" disabled={busy} onClick={()=>switchMode('otp')}>用邮箱验证码登录</button>
    <button className="auth-toggle" disabled={busy} onClick={()=>switchMode('recovery')}>忘记密码？</button>
   </>:<button className="auth-toggle" disabled={busy} onClick={()=>switchMode('password')}>返回密码登录</button>}
   <a className="auth-toggle" href={appBase+'/demo/'}>先了解集刻 ↗</a>
   <div className="auth-note">当前为共享云环境，服务期限记录至 2027 年 5 月 6 日，额度或维护可能影响可用性。请在页面中输入验证码与密码，不要向他人提供。</div>
  </section>
 </main>;
}
