'use client';
import {appBase} from '@/lib/cloud/client';

// Keep old verification links useful without sending users back into the
// unsupported provider binding flow. Enrollment still checks login on server.
export default function CloudEmailVerification(){
 return <main className="auth-layout"><section className="auth-art"><a href={appBase+'/'} className="brand"><span className="brand-symbol">集</span><span>集刻<small>CAMPUS GATHER</small></span></a><span className="auth-flower">✳</span><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE.</span><h1>准备好，<br/>就出发吧。</h1><p>和同频的人，<br/>一起把校园过得更有意思。</p></div><small>CLOUD EDITION / 免费测试</small></section><section className="auth-card"><span className="eyebrow">LET'S GET STARTED</span><h2>登录后，即可报名</h2><p>校园活动报名已取消额外的邮箱验证步骤。使用你的独立学生账号登录，就可以查看活动和报名。</p><div className="auth-note">新账号注册仍需完成页面要求的注册流程。已有账号无需在此重复收取验证码；报名名额、截止时间和操作权限仍由服务器检查。</div><a className="primary full" href={appBase+'/'}>进入活动大厅 ↗</a><a className="auth-toggle" href={appBase+'/auth/'}>前往登录</a><div className="auth-note">免费云端测试 · 初始活动为功能演示内容。</div></section></main>;
}
