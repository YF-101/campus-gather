import {actors,categories} from './model.ts';
import type {Activity,Attendee} from './model.ts';
export type CampusMode='demo'|'accounts'|'cloud'|'showcase';
export function transportFor(mode:CampusMode,cloudConfigured:boolean){
 if(mode==='showcase')return 'showcase';
 if(mode==='cloud'||(mode==='accounts'&&cloudConfigured))return 'cloud';
 return 'local';
}
type Event=Omit<Activity,'enrolled'|'registered'|'checked_in_at'>;
type Payload=Record<string,unknown>;
// Fictional, per-page data only. This module has no network or storage access.
export function createShowcaseStore(clock:()=>number=Date.now){
 const initial=clock();let serial=0;
 const later=(days:number)=>{const date=new Date(initial+days*86400000);date.setUTCHours(10,0,0,0);return date.toISOString();};
 const people=new Map<string,string>(actors.map(a=>[a.id,a.name]));
 const seeds=[
  ['把想法，写成第一个网页','一次轻松的共创体验，和同学一起把小想法变成作品。','创客中心 · 302','技术','organizer',6],
  ['周末，和胶片一起散步','用镜头寻找校园里的光与影。这场活动已满，可体验名额限制。','图书馆南门','艺术','organizer',2],
  ['傍晚六点，操场见','慢跑与晚风的约定。这场活动已截止，可体验截止状态。','东区田径场','运动','organizer',12],
  ['咖啡与灵感交换所','分享一个正在琢磨的小问题，发现不一样的专业视角。','校园咖啡馆','生活','other-organizer',8],
 ] as const;
 const events:Event[]=seeds.map(([title,description,location,category,owner_id,capacity],i)=>({id:`showcase-${i+1}`,owner_id,title,description,location,category,capacity,starts_at:later(i+2),deadline:i===2?new Date(initial-3600000).toISOString():later(i+1),organizer:people.get(owner_id)!}));
 const registrations=new Map<string,Map<string,Attendee>>(events.map(event=>[event.id,new Map()]));
 function rows(id:string){return registrations.get(id)!;}
 function seed(id:string,user:string,name:string,signed=false){people.set(user,name);rows(id).set(user,{user_id:user,name,registered_at:new Date(initial-7200000).toISOString(),checked_in_at:signed?new Date(initial-3600000).toISOString():null});}
 seed('showcase-1','student','林同学');seed('showcase-1','showcase-person-1','体验同学 1',true);
 seed('showcase-2','showcase-person-2','体验同学 2');seed('showcase-2','showcase-person-3','体验同学 3');seed('showcase-4','friend','周同学');
 function eventById(id:unknown){const event=events.find(e=>e.id===id);if(!event)throw Error('演示活动不存在');return event;}
 function call(user:string,action:'list',payload?:Payload):Activity[];
 function call(user:string,action:'attendees',payload:Payload):Attendee[];
 function call(user:string,action:'create',payload:Payload):{id:string};
 function call(user:string,action:string,payload?:Payload):Activity[]|Attendee[]|{id:string}|{ok:boolean};
 function call(user:string,action:string,payload:Payload={}){
  const actor=actors.find(a=>a.id===user);if(!actor)throw Error('请选择有效的模拟身份');
  if(action==='list')return events.map(event=>{const reg=rows(event.id).get(user);return {...event,enrolled:rows(event.id).size,registered:Boolean(reg),checked_in_at:reg?.checked_in_at??null};});
  if(action==='create'){
   const text=(key:string,min:number,max:number)=>{const value=payload[key];if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw Error('请检查活动标题、地点和介绍');return value.trim();};
   const title=text('title',2,60),description=text('description',1,2000),location=text('location',1,80);
   const category=String(payload.category);if(!(categories as readonly string[]).includes(category))throw Error('活动分类无效');
   const capacity=Number(payload.capacity);if(!Number.isInteger(capacity)||capacity<1||capacity>500)throw Error('开放名额须为 1–500 人');
   const starts=Date.parse(String(payload.starts_at)),deadline=Date.parse(String(payload.deadline));
   if(!Number.isFinite(starts)||!Number.isFinite(deadline)||starts<=clock()||deadline<=clock()||deadline>starts)throw Error('请检查开始时间和截止时间');
   const id=`showcase-created-${++serial}`;events.push({id,owner_id:user,title,description,location,category,capacity,starts_at:new Date(starts).toISOString(),deadline:new Date(deadline).toISOString(),organizer:actor.name});registrations.set(id,new Map());return {id};
  }
  const event=eventById(payload.id),enrolled=rows(event.id);
  if(action==='cancel_activity'){
   if(event.owner_id!==user)throw Error('没有管理这场模拟活动的权限');
   const reason=payload.reason??'';if(typeof reason!=='string'||reason.length>200)throw Error('取消原因最多 200 字');
   if(!event.cancelled_at){event.cancelled_at=new Date(clock()).toISOString();event.cancellation_reason=reason.trim()||'发布者取消了活动';}return {ok:true};
  }
  if(event.cancelled_at&&(action==='register'||action==='checkin'))throw Error('活动已取消');
  if(action==='attendees'||action==='checkin'){
   if(event.owner_id!==user)throw Error('没有管理这场模拟活动的权限');
   if(action==='attendees')return [...enrolled.values()].map(row=>({...row}));
   const row=enrolled.get(String(payload.user));if(!row)throw Error('没有找到有效报名');row.checked_in_at??=new Date(clock()).toISOString();return {ok:true};
  }
  if(action==='register'){
   if(enrolled.has(user))throw Error('你已经报名此活动');
   if(Date.parse(event.deadline)<=clock())throw Error('报名已经截止');
   if(enrolled.size>=event.capacity)throw Error('名额已满');
   enrolled.set(user,{user_id:user,name:actor.name,registered_at:new Date(clock()).toISOString(),checked_in_at:null});return {ok:true};
  }
  if(action==='cancel'){
   const row=enrolled.get(user);if(!row)throw Error('你尚未报名此活动');if(row.checked_in_at)throw Error('已签到，不能取消报名');if(Date.parse(event.starts_at)<=clock()&&!event.cancelled_at)throw Error('活动已开始，不能取消报名');enrolled.delete(user);return {ok:true};
  }
  throw Error('演示操作不存在');
 }
 return {call};
}
