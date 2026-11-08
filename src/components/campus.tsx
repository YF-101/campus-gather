'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {cloudEnabled,cloudMe,cloudRequest,cloudAuth,appBase} from '@/lib/cloud/client';
import { actors, categories, formatDate } from '@/lib/model';
import {commitThenRefresh} from '@/lib/activity-mutation';
import RosterPanel from './roster-panel';
import {createShowcaseStore,transportFor} from '@/lib/showcase';
import type {CampusMode} from '@/lib/showcase';
import type { Activity, Attendee } from '@/lib/model';
type View = 'explore' | 'mine' | 'manage';
const paths: Record<string, string> = { grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', ticket: 'M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4z M14 5v3m0 3v2m0 3v3', chart: 'M4 20V10m8 10V4m8 16v-7', arrow: 'M5 12h14m-6-6 6 6-6 6', clock: 'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0', plus: 'M12 5v14M5 12h14', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', check: 'm5 12 4 4L19 6', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', close: 'm6 6 12 12M6 18 18 6' };
function Icon({ name, size = 20 }: {
    name: string;
    size?: number;
}) { return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.grid}/></svg>; }
function Modal({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
    return <dialog ref={ref} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => {
            if (e.target === e.currentTarget)
                onClose();
        }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
function Cover({ category, large = false }: {
    category: string;
    large?: boolean;
}) { const names: Record<string, string[]> = { '技术': ['MAKE', 'IT REAL.', 'BUILD SOMETHING THAT MATTERS'], '艺术': ['FIND', 'YOUR LIGHT.', 'A LITTLE CURIOSITY GOES A LONG WAY'], '运动': ['MOVE', 'TOGETHER.', 'GOOD ENERGY, GREAT COMPANY'], '公益': ['SMALL', 'ACTS. BIG LOVE.', 'A LITTLE KINDNESS, A BETTER CAMPUS'], '生活': ['MEET', 'SOMETHING NEW.', 'PEOPLE, IDEAS & EVERYDAY MOMENTS'] }; return <div className={`cover cover-${categories.indexOf(category as typeof categories[number])} ${large ? 'large' : ''}`} aria-hidden="true"><div className="cover-grain"/><span className="cover-label">CAMPUS / GATHER</span><span className="cover-serial">0{categories.indexOf(category as typeof categories[number]) + 1} — 26</span><div className="cover-type">{(names[category] || names['生活']).slice(0, 2).map(t => <span key={t}>{t}</span>)}</div><div className="cover-sculpture"><i /><i /><i /></div><small>{(names[category] || names['生活'])[2]}</small><span className="cover-star">✳</span></div>; }
function state(a: Activity) {
    if(a.cancelled_at)return '活动已取消';
    if (Date.parse(a.starts_at) <= Date.now())
        return '已开始';
    if (Date.parse(a.deadline) <= Date.now())
        return '已截止';
    if (a.enrolled >= a.capacity)
        return '名额已满';
    return '报名中';
}
export default function Campus({ mode = 'demo' }: {
    mode?: CampusMode;
}) {
    const mutationActive=useRef(false),listVersion=useRef(0);
    const [endingId,setEndingId]=useState<string|null>(null),[syncWarning,setSyncWarning]=useState('');
    const isDemo=mode==='demo'||mode==='showcase', isShowcase=mode==='showcase';
    const transport=transportFor(mode,cloudEnabled),useCloud=transport==='cloud';
    const showcase=useRef<ReturnType<typeof createShowcaseStore>|null>(null);
    const [uid, setUid] = useState(isDemo ? 'student' : ''), [view, setView] = useState<View>('explore'), [activities, setActivities] = useState<Activity[]>([]), [search, setSearch] = useState(''), [category, setCategory] = useState('全部'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState(''), [busy, setBusy] = useState(false), [detail, setDetail] = useState<string | null>(null), [creating, setCreating] = useState(false), [roster, setRoster] = useState<string | null>(null), [cancelId, setCancelId] = useState<string | null>(null);
    const [account, setAccount] = useState<{
        id: string;
        name: string;
        role: 'student' | 'organizer';
    } | null>(null);
    const me = account || (isDemo?actors.find(a => a.id === uid):null) || {id:'',name:'正在加载',role:'student'};
    useEffect(() => { if (isDemo)
        return; (useCloud?cloudMe().then(user=>({user})):fetch('/api/auth').then(r=>r.json())).then(data => { if (!data.user) {
        window.location.replace(appBase+'/auth/');
        return;
    } setAccount(data.user); setUid(data.user.id); }).catch(() => setError('登录状态加载失败，请刷新页面。')); }, [mode,isDemo,useCloud]);
    const request=useCallback(async (path: string, options: RequestInit = {}, user = uid) => {
        if(isShowcase){
            const store=showcase.current??=createShowcaseStore();
            if(options.method==='POST'){const body=JSON.parse(String(options.body));return store.call(user,body.action,body.action==='create'?body.input:{id:body.id,user:body.user,reason:body.input?.reason});}
            const id=new URLSearchParams(path.replace(/^\?/, '')).get('attendees');return id?store.call(user,'attendees',{id}):store.call(user,'list');
        }
        if(useCloud)return cloudRequest(path,options);
        const r = await fetch('/api/activities' + path, { ...options, headers: { 'Content-Type': 'application/json', 'x-demo-user': user } });
        if (r.status === 401) {
            window.location.replace(appBase+'/auth/');
            throw Error('登录已过期，请重新登录');
        }
        const body = await r.json();
        if (!r.ok)
            throw Error(body.error || '请求失败');
        return body.data;
    },[uid,isShowcase,useCloud]);
    const requestRoster=useCallback((id:string):Promise<Attendee[]>=>request('?attendees='+encodeURIComponent(id)),[request]);
    const refresh=useCallback(async()=>{const version=++listVersion.current;const data=await request('');if(version===listVersion.current)setActivities(data);},[request]);
    useEffect(() => {
        if (!uid)
            return;
        const controller = new AbortController(),version=++listVersion.current;
        setEndingId(null);
        setLoading(true);
        setError('');
        setDetail(null);
        setRoster(null);
        setCreating(false);
        setToast('');
        request('',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted&&version===listVersion.current)setActivities(data);}).catch(e => {
            if (e.name !== 'AbortError')
                setError(e.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [uid,request]);
    useEffect(() => {
        if (!toast)
            return;
        const t = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(t);
    }, [toast]);
    useEffect(()=>{
        if(!useCloud||!uid)return;
        let stopped=false;
        const sync=async()=>{if(stopped||mutationActive.current||document.hidden)return;try{await refresh();if(!stopped)setSyncWarning('');}catch{if(!stopped)setSyncWarning('自动更新暂未成功，当前内容可能不是最新，请稍后刷新。');}};
        const timer=setInterval(()=>void sync(),30_000);
        window.addEventListener('focus',sync);window.addEventListener('online',sync);
        return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);};
    },[useCloud,uid,refresh]);
    async function mutate(action: string, id?: string, user?: string, input?: unknown) {
        if (mutationActive.current)
            return false;
        mutationActive.current=true;listVersion.current++;
        setBusy(true);
        setError('');
        try {
            const result=await commitThenRefresh(()=>request('', { method: 'POST', body: JSON.stringify({ action, id, user, input }) }),refresh);
            setSyncWarning(result.synchronized?'':'操作已成功提交，但列表暂未更新。请刷新列表，不要重复提交。');
            setToast(({ cancel_activity:'活动已取消，原有记录保留。', register: '报名成功，期待和你见面！', cancel: '已取消报名，名额已释放。', create: '活动已发布，可以开始接受报名。', checkin: '签到成功，欢迎来到活动现场。' } as Record<string, string>)[action]);
            return true;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '操作失败');
            return false;
        }
        finally {
            mutationActive.current=false;setBusy(false);
        }
    }
    function openRoster(id:string){setError('');setRoster(id);}
    const selected = activities.find(a => a.id === detail), rosterActivity = activities.find(a => a.id === roster);
    const mine = activities.filter(a => a.registered), owned = activities.filter(a => a.owner_id === uid);
    const shown = (view === 'mine' ? mine : view === 'manage' ? owned : activities).filter(a => (category === '全部' || a.category === category) && `${a.title} ${a.description} ${a.location}`.toLowerCase().includes(search.toLowerCase().trim()));
    const title = view === 'explore' ? '活动大厅' : view === 'mine' ? '我的报名' : '活动管理';
    const featured = activities.find(a => state(a) === '报名中');
    return <div className="app-shell">
 <aside className="sidebar"><a href={appBase+(isShowcase?'/demo/':'/')} className="brand"><span className="brand-symbol">集</span><span>集刻<small>CAMPUS GATHER</small></span></a><div className="workspace-label">你的校园，正在发生</div><nav aria-label="主导航"><button className={view === 'explore' ? 'active' : ''} onClick={() => { setView('explore'); setCategory('全部'); setSearch(''); }}><Icon name="grid"/>活动大厅<span>Explore</span></button><button className={view === 'mine' ? 'active' : ''} onClick={() => { setView('mine'); setCategory('全部'); setSearch(''); }}><Icon name="ticket"/>我的报名{mine.length > 0 && <b>{mine.length}</b>}</button><button className={view === 'manage' ? 'active' : ''} onClick={() => { setView('manage'); setCategory('全部'); setSearch(''); }}><Icon name="chart"/>我发布的活动</button></nav><div className="sidebar-note"><span>✳</span><h3>让相遇，<br />不止于路过。</h3><p>走出日常的小圈子，<br />下一段故事就在这里。</p></div><div className="sidebar-bottom"><span className="live-dot"/>校园生活 · 此刻出发<small>{isShowcase?'INTERACTIVE DEMO / 01':useCloud?'CLOUD EDITION / 01':'LOCAL EDITION / 01'}</small></div></aside>
 <div className="workspace"><header className="topbar"><div className="breadcrumb">工作空间<span>/</span><strong>{title}</strong></div><div className="account"><span className="demo-pill">{isShowcase?'交互演示':isDemo?'本机演示':'独立账号'}</span>{isDemo ? <label className="account-label"><span className="sr-only">切换演示身份</span><select value={uid} disabled={busy} onChange={e => { setUid(e.target.value); setView('explore'); setCategory('全部'); setSearch(''); }}>{actors.map(a => <option key={a.id} value={a.id}>{a.name} · {a.label}</option>)}</select></label> : <><span className="account-name">{me.name}</span><button className="text-link" onClick={async () => { try {
        if(useCloud){const result=await cloudAuth().signOut();if(result&&'error' in result&&result.error)throw result.error;window.location.assign(appBase+'/auth/');return;}
        const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
        if (!r.ok)
            throw Error('退出失败，请重试');
        window.location.assign('/auth');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '退出失败');
    } }}>退出登录</button></>}{isShowcase&&<a className="text-link" href={appBase+'/auth/'}>真实账号登录</a>}<span className="avatar">{me.name.slice(0, 1)}</span></div></header>
 <main><div className="demo-notice"><span className="live-dot"/><span>{isShowcase?'公开交互演示 · 全部为虚构数据，可切换身份自由体验；刷新后重置，与真实账号数据隔离。':mode === 'demo' ? '本机演示 · 身份为模拟账号，报名保存在本机服务器。尚未接入真实登录与云端服务。' : useCloud?'账号登录后可报名，也可发起活动；只有发布者能查看自己活动的名单。初始活动为演示内容。':'独立账号本机版 · 使用服务端会话验证身份；账号和报名保存在这台电脑，活动为演示内容，尚未接入云端。'}</span></div>
 <section className="page-title"><div><span className="eyebrow">A LITTLE CURIOSITY. A NEW CONNECTION.</span><h1>{view === 'explore' ? <>把校园，过得<span>更有意思。</span></> : title}</h1><p>{view === 'explore' ? '发现值得奔赴的活动，遇见和你同频的人。' : view === 'mine' ? '把期待留给下一次见面，你的活动安排都在这里。' : '每一次精心准备，都值得一场热闹的相遇。'}</p></div>{<button className="primary" onClick={() => setCreating(true)} disabled={busy||!uid}><Icon name="plus" size={18}/>发布活动</button>}</section>
 {syncWarning&&<div className="form-error" role="status">{syncWarning}<button className="text-link" disabled={busy} onClick={()=>void refresh().then(()=>setSyncWarning('')).catch(()=>setSyncWarning('列表仍未更新，请稍后重试，不要重复提交。'))}>刷新列表</button></div>}
 {error && <div className="error" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
 {loading ? <div className="loading" role="status"><span className="spinner"/>正在准备校园里的精彩…</div> : <>
 {view === 'explore' && featured && <section className="feature-row"><button className="featured" onClick={() => setDetail(featured.id)}><Cover category={featured.category} large/><div className="featured-overlay"><span className="featured-tag">本期精选 / FEATURED</span><h2>{featured.title}</h2><p><Icon name="clock" size={16}/>{formatDate(featured.starts_at)}<span>·</span>{featured.location}</p><span className="featured-link">一起去看看 <Icon name="arrow" size={18}/></span></div></button><div className="invitation-card"><div className="card-kicker">YOUR NEXT CHAPTER</div><div className="orbit">✳<span>↗</span></div><h2>留一点时间，<br />给新的可能。</h2><p>一场讲座，一次共创，<br />或者一段不期而遇的友谊。</p><div className="mini-avatars"><span>林</span><span>周</span><span>许</span><small>好奇的人，已经出发</small></div></div></section>}
 <div className="metrics"><div><span className="metric-icon"><Icon name="grid"/></span><div><small>{view === 'manage' ? '我发布的活动' : '校园活动'}</small><strong>{view === 'manage' ? owned.length : activities.length}<em>场</em></strong></div><span className="metric-hint">期待发生</span></div><div><span className="metric-icon mint"><Icon name="ticket"/></span><div><small>{view === 'manage' ? '累计报名人次' : '我的报名'}</small><strong>{view === 'manage' ? owned.reduce((n, a) => n + a.enrolled, 0) : mine.length}<em>{view === 'manage' ? '人次' : '场'}</em></strong></div><span className="metric-hint">{view === 'manage' ? '每一份期待' : '留给相遇'}</span></div><div><span className="metric-icon peach"><Icon name="clock"/></span><div><small>{view === 'manage' ? '仍在招募' : '开放报名'}</small><strong>{(view === 'manage' ? owned : activities).filter(a => state(a) === '报名中').length}<em>场</em></strong></div><span className="metric-hint">现在加入</span></div></div>
 <section className="activity-section"><div className="section-top"><div><h2>{view === 'explore' ? '发现活动' : view === 'mine' ? '我的活动安排' : '我发布的活动'}<span>{shown.length.toString().padStart(2, '0')}</span></h2><p>{view === 'explore' ? '从感兴趣的小事开始，发现不一样的校园生活。' : view === 'mine' ? '报名成功后，在活动现场找组织者签到。' : '查看报名名单，为每一位到场同学签到。'}</p></div><label className="search"><Icon name="search" size={18}/><span className="sr-only">搜索活动</span><input placeholder="搜索活动、地点…" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className="filters" aria-label="活动分类">{['全部', ...categories].map(c => <button aria-pressed={category === c} className={category === c ? 'selected' : ''} key={c} onClick={() => setCategory(c)}>{c === '全部' ? '全部活动' : c}</button>)}</div>
 {shown.length === 0 ? <div className="empty"><span>✳</span><h3>{view === 'mine' ? '还没有活动安排' : '这里暂时安静了一点'}</h3><p>{view === 'mine' ? '去活动大厅，找到让你心动的下一场活动。' : '试试其他关键词或分类，或者发布一场新活动。'}</p><button className="secondary" onClick={() => { setView('explore'); setSearch(''); setCategory('全部'); }}>浏览全部活动<Icon name="arrow" size={16}/></button></div> : <div className="activity-grid">{shown.map(a => <article className="activity-card" key={a.id}><button className="card-cover" aria-label={'查看活动：' + a.title} onClick={() => setDetail(a.id)}><Cover category={a.category}/><span className={'activity-state ' + (state(a) === '报名中' ? 'open' : '')}>{a.cancelled_at?'活动已取消':a.checked_in_at ? '已签到' : a.registered ? '已报名' : state(a)}</span></button><div className="card-body"><div className="category-line"><span>{a.category}</span><small>{formatDate(a.starts_at, { month: '2-digit', day: '2-digit', weekday: 'short' })}</small></div><button className="card-title" onClick={() => setDetail(a.id)}><h3>{a.title}</h3></button><p className="description">{a.description}</p><div className="meta"><Icon name="clock" size={15}/>{formatDate(a.starts_at)}</div><div className="meta"><Icon name="pin" size={15}/>{a.location}</div><div className="capacity"><div><span>已报名 <strong>{a.enrolled}</strong> / {a.capacity} 人</span><small>{a.capacity - a.enrolled > 0 ? `余 ${a.capacity - a.enrolled} 位` : '下次早一点'}</small></div><div className="progress"><i style={{ width: `${Math.min(100, a.enrolled / a.capacity * 100)}%` }}/></div></div><div className="card-footer"><span><i className="organizer-avatar">{a.organizer.slice(0, 1)}</i>{a.organizer}</span>{view === 'manage' ? <button className="text-link" onClick={() => void openRoster(a.id)}>报名与签到<Icon name="arrow" size={15}/></button> : <button className="text-link" onClick={() => setDetail(a.id)}>{a.registered ? '查看报名' : '活动详情'}<Icon name="arrow" size={15}/></button>}</div></div></article>)}</div>}
 </section></>}
 <footer><span>集刻 CAMPUS GATHER</span><span>让每一份好奇，都找到去处。<b>✳</b></span></footer>
 </main></div>
 {toast && <div className="toast" role="status"><Icon name="check"/>{toast}</div>}
 {selected && <Modal title="下一场，与你相遇" onClose={() => setDetail(null)}><Cover category={selected.category}/><div className="detail-content"><span className="detail-category">{selected.category} · {state(selected)}</span><h2>{selected.title}</h2><p className="detail-description">{selected.description}</p><div className="detail-meta"><p><Icon name="clock"/>活动时间<span>{formatDate(selected.starts_at)}</span></p><p><Icon name="pin"/>活动地点<span>{selected.location}</span></p><p><Icon name="users"/>活动名额<span>{selected.enrolled} / {selected.capacity} 人</span></p></div><p className="deadline">报名截止：{formatDate(selected.deadline)}（北京时间）</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="detail-actions">{selected.cancelled_at&&<p className="form-error" role="status">活动已取消：{selected.cancellation_reason||'发布者取消了活动'}</p>}{selected.owner_id === uid ? <><button className="primary full" onClick={()=>{setDetail(null);setView('manage');void openRoster(selected.id);}}>管理报名与签到</button>{!selected.cancelled_at&&<button className="secondary" disabled={busy} onClick={()=>setEndingId(selected.id)}>取消这场活动</button>}</> : selected.registered ? <><span className="registered"><Icon name="check"/>{selected.cancelled_at?'该活动已取消':selected.checked_in_at ? '已完成签到' : '报名成功，期待见面'}</span>{!selected.checked_in_at && <button disabled={busy} className="secondary" onClick={() => setCancelId(selected.id)}>取消报名</button>}</> : <button className="primary full" disabled={busy || state(selected) !== '报名中'} onClick={() => void mutate('register', selected.id)}>{busy ? '正在确认…' : state(selected) === '报名中' ? '报名参加这场活动' : state(selected)}<Icon name="arrow" size={17}/></button>}</div></div></Modal>}
 {cancelId && <Modal title="确认取消报名？" onClose={() => setCancelId(null)}><div className="detail-content"><p>取消后名额会释放给其他同学。若还有名额且未截止，你仍可以重新报名。</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setCancelId(null)}>保留报名</button><button className="primary" disabled={busy} onClick={async () => {
                if (await mutate('cancel', cancelId))
                    setCancelId(null);
            }}>确认取消</button></div></div></Modal>}
 {creating && <Modal title="让一个好想法，成为一场活动" onClose={() => {
                if (!busy)
                    setCreating(false);
            }}><form className="create-form" onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const input = { title: String(f.get('title')), description: String(f.get('description')), location: String(f.get('location')), category: String(f.get('category')), capacity: Number(f.get('capacity')), starts_at: String(f.get('starts_at')) + ':00+08:00', deadline: String(f.get('deadline')) + ':00+08:00' };
                if (await mutate('create', undefined, undefined, input)) {
                    setCreating(false);
                    setView('manage');
                }
            }}><label>活动名称<input name="title" required minLength={2} maxLength={60} placeholder="给这场相遇取个名字"/></label><div className="form-row"><label>活动分类<select name="category">{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>开放名额<input name="capacity" type="number" min={1} max={500} defaultValue={20} required/></label></div><label>活动地点<input name="location" maxLength={80} required placeholder="例如：创客中心 · 302"/></label><div className="form-row"><label>开始时间<input type="datetime-local" name="starts_at" required/></label><label>报名截止<input type="datetime-local" name="deadline" required/></label></div><p className="small">以上时间均按北京时间保存；截止时间不得晚于开始时间。云端每个账号每 24 小时最多发布 5 场活动。</p><label>活动介绍<textarea name="description" required maxLength={2000} rows={4} placeholder="介绍活动内容、适合人群和需要携带的物品…"/></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setCreating(false)}>先想一想</button><button className="primary" disabled={busy}>{busy ? '正在发布…' : '发布活动'}<Icon name="arrow" size={16}/></button></div></form></Modal>}
 {endingId&&<Modal title="确认取消这场活动？" onClose={()=>{if(!busy)setEndingId(null);}}><form className="create-form" onSubmit={event=>{event.preventDefault();const reason=String(new FormData(event.currentTarget).get('reason')||'');void (async()=>{if(await mutate('cancel_activity',endingId,undefined,{reason}))setEndingId(null);})();}}><p>取消后停止接受报名与签到，参与者可以在活动中查看原因。原有报名和签到记录保留。</p><label>取消原因<textarea name="reason" required maxLength={200} rows={3} placeholder="向已报名同学说明原因"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={()=>setEndingId(null)}>保留活动</button><button className="primary" disabled={busy}>{busy?'正在取消…':'确认取消活动'}</button></div></form></Modal>}
 {rosterActivity && <Modal title="报名名单与签到" onClose={() => setRoster(null)}><RosterPanel key={rosterActivity.id} activity={rosterActivity} loadAttendees={requestRoster} onCheckin={user=>mutate('checkin',rosterActivity.id,user)} actionError={error}/></Modal>}
 </div>;
}
