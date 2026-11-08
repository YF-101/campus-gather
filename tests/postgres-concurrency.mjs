// Disposable PostgreSQL only. No cloud credentials, host ports or data mounts.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const image=process.env.CAMPUS_TEST_POSTGRES_IMAGE||'postgres:16-alpine';
const container=`campus-pg-test-${randomUUID()}`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const children=new Set();
function start(args){
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
 children.add(child);
 let stdout='',stderr='';
 child.stdout.on('data',data=>{stdout+=data;});
 child.stderr.on('data',data=>{stderr+=data;});
 const result=new Promise((resolve,reject)=>{
  child.on('error',reject);
  child.on('close',code=>{children.delete(child);resolve({code,stdout:stdout.trim(),stderr:stderr.trim()});});
 });
 // Callers can await the result after sending interactive transaction input.
 return {child,result,output:()=>stdout};
}
async function docker(args){const p=start(args);p.child.stdin.end();const r=await p.result;assert.equal(r.code,0,r.stderr);return r.stdout;}
function session(name='observer'){
 const p=start(['exec','-i','-e',`PGAPPNAME=campus-${name}`,container,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']);
 p.child.stdin.write("set statement_timeout='15s';set lock_timeout='12s';\n");
 return p;
}
async function sql(text,name){const p=session(name);p.child.stdin.end(text+'\n');const r=await p.result;assert.equal(r.code,0,r.stderr);return r.stdout;}
function identity(uid){assert.match(uid,/^[a-z-]+$/);return `set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`;}
function call(action,id,user){return `select public.cg_call('${action}',jsonb_build_object('id','${id}'${user?`, 'user','${user}'`:''}));`;}
async function until(check,label){
 const end=Date.now()+8000;
 while(Date.now()<end){if(await check())return;await delay(40);}
 throw Error(`Timed out waiting for ${label}`);
}
async function gate(statement){
 const p=session('gate');p.child.stdin.write(`begin;${statement}\n\\echo GATE_READY\n`);
 await until(()=>p.output().includes('GATE_READY'),'transaction gate');
 return async()=>{p.child.stdin.end('commit;\n');const r=await p.result;assert.equal(r.code,0,r.stderr);};
}
async function race(id,operations,{before='',advisory=false,profile=false}={}){
 const release=await gate(advisory?'select pg_advisory_xact_lock(814017);':profile?"select id from public.cg_profiles where id='teacher' for update;":`select id from public.cg_activities where id='${id}' for update;${before}`);
 const tag=randomUUID();
 const work=operations.map(({uid,statement},i)=>{
  const p=session(`${tag}-${i}`);p.child.stdin.end(identity(uid)+statement+'\n');return p.result;
 });
 try{
  await until(async()=>Number(await sql(`select count(*) from pg_stat_activity where application_name like 'campus-${tag}-%' and wait_event_type='Lock';`))===operations.length,'independent blocked PostgreSQL sessions');
 }finally{await release();}
 return Promise.all(work);
}
async function event(){
 const output=await sql(identity('teacher')+`select public.cg_call('create','{"title":"多连接测试","description":"仅临时数据库","location":"测试容器","category":"技术","capacity":1,"starts_at":"2099-12-02T10:00:00Z","deadline":"2099-12-01T10:00:00Z"}'::jsonb)->>'id';`);
 const id=output.split('\n').at(-1);assert.match(id,/^[0-9a-f-]{36}$/);return id;
}
const active=id=>sql(`select count(*) from public.cg_registrations where activity_id='${id}' and status='registered';`).then(Number);
const oneSeat=count=>assert.equal(count,1,'one-seat activity must have exactly one active registration');
let created=false;
try{
 await docker(['run','--detach','--name',container,'--network','none','--memory','256m','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 // The image's initialization server only opens a Unix socket. Check TCP
 // inside the isolated container so we wait for the final server instead.
 await until(async()=>{const p=start(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);p.child.stdin.end();return (await p.result).code===0;},'PostgreSQL readiness');
 console.log(await sql('select version();'));
 await sql(`create role anon;create role authenticated;create schema auth;create table auth.users(sub text,email_verified boolean);create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('teacher',true),('student-a',false),('student-b',false);`);
 for(const file of ['202611080001_campus.sql','202611080002_email_status.sql','202611080003_account_enrollment.sql','202611080004_member_publishing.sql','202611080005_activity_cancellation.sql'])await sql(await readFile(new URL(`../cloudbase/migrations/${file}`,import.meta.url),'utf8'));
 for(const uid of ['teacher','student-a','student-b'])await sql(identity(uid)+"select public.cg_call('profile');");
 await sql("update public.cg_profiles set role='organizer' where id='teacher';");

 let id=await event();
 let results=await race(id,['student-a','student-b'].map(uid=>({uid,statement:call('register',id)})));
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).stderr,/名额已满/);oneSeat(await active(id));
 console.log('PASS: two independent students contend for the final seat; exactly one succeeds.');

 const winner=(await sql(`select user_id from public.cg_registrations where activity_id='${id}' and status='registered';`));
 await sql(identity(winner)+call('cancel',id));assert.equal(await active(id),0);
 results=await race(id,['student-a','student-b'].map(uid=>({uid,statement:call('register',id)})));
 assert.equal(results.filter(r=>r.code===0).length,1);oneSeat(await active(id));
 console.log('PASS: cancellation releases the seat; concurrent re-enrollment cannot overbook.');

 id=await event();results=await race(id,[0,1].map(()=>({uid:'student-a',statement:call('register',id)})));
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).stderr,/已经报名/);oneSeat(await active(id));
 console.log('PASS: duplicate requests from the same student create only one enrollment.');

 results=await race(id,[{uid:'student-a',statement:call('cancel',id)}],{before:identity('teacher')+call('checkin',id,'student-a')});
 assert.notEqual(results[0].code,0);assert.match(results[0].stderr,/签到/);oneSeat(await active(id));
 const checked=await sql(`select checked_in_at::text from public.cg_registrations where activity_id='${id}' and user_id='student-a';`);assert.ok(checked);
 await sql(identity('teacher')+call('checkin',id,'student-a'));assert.equal(await sql(`select checked_in_at::text from public.cg_registrations where activity_id='${id}' and user_id='student-a';`),checked);
 console.log('PASS: committed check-in blocks a waiting cancellation; repeated check-in is idempotent.');

 id=await event();await sql(identity('student-a')+call('register',id));
 results=await race(id,[{uid:'teacher',statement:call('checkin',id,'student-a')}],{before:identity('student-a')+call('cancel',id)});
 assert.notEqual(results[0].code,0);assert.match(results[0].stderr,/有效报名/);assert.equal(await active(id),0);
 console.log('PASS: committed cancellation prevents a waiting check-in from checking in a cancelled record.');

 // Negative control only in this disposable database: clone the RPC, remove
 // its activity lock, and hold both sessions after reading the zero count.
 await sql(`do $control$ declare definition text;begin
 select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) into definition;
 if strpos(definition,'where id=eid for update;')=0 then raise exception 'Lock mutation target missing';end if;
 definition:=replace(definition,'FUNCTION public.cg_call(','FUNCTION public.cg_call_unsafe_control(');
 definition:=replace(definition,'where id=eid for update;','where id=eid;');
 definition:=replace(definition,'if total>=event.capacity then','perform pg_advisory_xact_lock_shared(814017); if total>=event.capacity then');
 execute definition;end;$control$;grant execute on function public.cg_call_unsafe_control(text,jsonb) to authenticated;`);
 id=await event();results=await race(id,['student-a','student-b'].map(uid=>({uid,statement:call('register',id).replace('public.cg_call(','public.cg_call_unsafe_control(')})),{advisory:true});
 assert.equal(results.filter(r=>r.code===0).length,2);const unsafeCount=await active(id);assert.equal(unsafeCount,2);assert.throws(()=>oneSeat(unsafeCount),/one-seat/);
 console.log('PASS: negative control detects overbooking when the activity lock is removed.');
 assert.equal(Number(await sql("select count(*) from public.cg_activities where owner_id='teacher';")),4);
 const publication="select public.cg_call('create','{\"title\":\"限额竞争测试\",\"description\":\"虚构测试\",\"location\":\"测试容器\",\"category\":\"技术\",\"capacity\":1,\"starts_at\":\"2099-12-02T10:00:00Z\",\"deadline\":\"2099-12-01T10:00:00Z\"}'::jsonb);";
 results=await race(id,[0,1].map(()=>({uid:'teacher',statement:publication})),{profile:true});
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).stderr,/24 小时.*5/);
 assert.equal(Number(await sql("select count(*) from public.cg_activities where owner_id='teacher';")),5);
 console.log('PASS: concurrent publications cannot bypass the per-member rolling publication limit.');
 console.log('7 PostgreSQL multi-connection scenarios passed. This is isolated database testing, not real CloudBase login or load testing.');
}finally{
 for(const child of children)child.kill('SIGTERM');
 if(created)await docker(['rm','--force','--volumes',container]);
}
