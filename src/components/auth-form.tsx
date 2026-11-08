'use client';
import { useState } from 'react';
import {cloudEnabled} from '@/lib/cloud/client';
import CloudAuthForm from './cloud-auth-form';
export default function AuthForm() {
    if(cloudEnabled)return <CloudAuthForm/>;
    return <LocalAuthForm/>;
}
function LocalAuthForm(){
    const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <main className="auth-layout"><section className="auth-art"><a href="/" className="brand"><span className="brand-symbol">集</span><span>集刻<small>CAMPUS GATHER</small></span></a><span className="auth-flower">✳</span><div><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE.</span><h1>让每一次相遇，<br />都有你的名字。</h1><p>发现活动，留住期待。<br />和同频的人，一起把校园过得更有意思。</p></div><small>LOCAL ACCOUNTS / 学习与功能验证版本</small></section><section className="auth-card"><span className="eyebrow">A SPACE FOR YOUR CURIOSITY</span><h2>{register ? '创建你的集刻账号' : '欢迎回来'}</h2><p>{register ? '新账号默认是学生，可以浏览和报名活动。' : '登录后，查看只属于你的活动安排。'}</p><form onSubmit={async (e) => {
            e.preventDefault();
            if (busy)
                return;
            setError('');
            const data = new FormData(e.currentTarget);
            if (register && data.get('password') !== data.get('confirmation')) {
                setError('两次输入的密码不一致');
                return;
            }
            setBusy(true);
            try {
                const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: register ? 'register' : 'login', name: data.get('name'), email: data.get('email'), password: data.get('password') }) });
                const result = await r.json();
                if (!r.ok)
                    throw Error(result.error);
                window.location.assign('/');
            }
            catch (e) {
                setError(e instanceof Error ? e.message : '暂时无法登录，请稍后重试。');
            }
            finally {
                setBusy(false);
            }
        }}>
 {register && <label>你的昵称<input name="name" autoComplete="nickname" maxLength={24} required placeholder="怎么称呼你"/></label>}
 <label>邮箱<input name="email" type="email" autoComplete="username" maxLength={254} required placeholder="you@example.com"/></label>
 <label>密码<input key={String(register)} name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={128} placeholder={register ? '设置 10–128 位密码' : '输入你的密码'}/></label>
 {register && <label>再次输入密码<input name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required placeholder="再次确认密码"/></label>}
 {error && <p className="form-error" role="alert">{error}</p>}
 <button className="primary full" disabled={busy}>{busy ? '正在处理…' : register ? '注册并进入集刻' : '登录集刻'}<span>↗</span></button>
 </form><button className="auth-toggle" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? '已有账号？返回登录' : '第一次来？创建学生账号'}</button><div className="auth-note">这是独立账号的本机验证版，资料保存在当前电脑，尚未提供邮箱验证或密码找回。请使用专门的测试密码。组织者权限需后续由管理员授权。</div></section></main>;
}
