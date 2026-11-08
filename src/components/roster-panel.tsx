'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {filterAttendees,rosterCsv} from '@/lib/roster';
import type {RosterFilter} from '@/lib/roster';
import {formatDate} from '@/lib/model';
import type {Activity,Attendee} from '@/lib/model';

type Props={activity:Activity;loadAttendees:(id:string)=>Promise<Attendee[]>;onCheckin:(user:string)=>Promise<boolean>;actionError:string};
export default function RosterPanel({activity,loadAttendees,onCheckin,actionError}:Props){
 const [rows,setRows]=useState<Attendee[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<RosterFilter>('all');
 const [pending,setPending]=useState<Attendee|null>(null),[busy,setBusy]=useState(false),[updated,setUpdated]=useState<string|null>(null);
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);setError('');setPending(null);
  try{const data=await loadAttendees(activity.id);if(current!==generation.current)return;setRows(data);setUpdated(new Date().toISOString());}
  catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'名单读取失败，请重试');}
  finally{if(current===generation.current)setLoading(false);}
 },[activity.id,loadAttendees]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
 const visible=filterAttendees(rows,query,filter),signed=rows.filter(row=>row.checked_in_at).length;
 function download(){
  if(loading||error||!visible.length)return;
  const url=URL.createObjectURL(new Blob([rosterCsv(visible)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=activity.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60)+'-报名名单.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="roster"><span className="eyebrow">EVERY ARRIVAL MATTERS</span><h3 className="roster-title">{activity.title}</h3>
 <div className="roster-summary" aria-live="polite"><div><small>报名人数</small><strong>{loading||error?'—':rows.length}</strong></div><div><small>已签到</small><strong>{loading||error?'—':signed}</strong></div><div><small>待到场</small><strong>{loading||error?'—':rows.length-signed}</strong></div></div>
 <div className="roster-note">请先核验同学已到场，再确认签到。当前测试版本支持组织者手动签到。</div>
 <div className="roster-toolbar"><label><span className="sr-only">搜索报名同学</span><input aria-label="搜索报名同学" placeholder="搜索同学姓名…" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="secondary" disabled={loading||busy} onClick={()=>void load()}>{loading?'刷新中…':'刷新名单'}</button><button className="secondary" disabled={loading||busy||!!error||!visible.length} onClick={download}>{filter!=='all'||query.trim()?'导出筛选名单':'导出名单'}</button></div>
 <div className="roster-filters" aria-label="签到状态筛选">{([['all','全部'],['pending','待签到'],['signed','已签到']] as const).map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPending(null);}}>{label}</button>)}</div>
 {updated&&!loading&&!error&&<p className="roster-updated">更新于 {formatDate(updated)} · 当前显示 {visible.length} 人</p>}
 {loading?<p className="roster-feedback" role="status">正在读取最新报名名单…</p>:error?<div className="roster-feedback form-error" role="alert">{error}<p>名单暂不可用，请点击“刷新名单”重试。</p></div>:<>
 {pending&&<div className="checkin-confirm" role="region" aria-label="确认到场"><strong>确认 {pending.name} 已到场？</strong><p>报名时间：{formatDate(pending.registered_at)}。确认后该同学的报名将标记为已签到。</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setPending(null)}>暂不签到</button><button className="primary" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);try{if(await onCheckin(pending.user_id)){setPending(null);await load();}}finally{setBusy(false);}}}>{busy?'正在签到…':'确认到场并签到'}</button></div></div>}
 {visible.length===0?<div className="empty"><h3>{rows.length?'没有符合条件的同学':'等待第一位同学'}</h3><p>{rows.length?'试试其他姓名或签到状态。':'有人报名后，名单会出现在这里。'}</p></div>:visible.map(row=><div className="attendee" key={row.user_id}><span className="avatar">{row.name.slice(0,1)}</span><div><strong>{row.name}</strong><small>{formatDate(row.registered_at)} 报名</small>{row.checked_in_at&&<small>{formatDate(row.checked_in_at)} 签到</small>}</div><button className={row.checked_in_at?'signed':'secondary'} disabled={busy||!!row.checked_in_at} onClick={()=>setPending(row)}>{row.checked_in_at?'✓ 已签到':'核验到场'}</button></div>)}
 </>}
 {actionError&&<p className="form-error" role="alert">{actionError}</p>}
 <p className="roster-export-note">导出只包含当前筛选结果的姓名、报名与签到时间；名单仅供活动组织使用。</p>
 </div>;
}
