import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('cloud members publish without role elevation, retain owner isolation and publication limits',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(sub text,email_verified boolean);create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;grant usage on schema auth to authenticated;insert into auth.users values('member-a',false),('member-b',false);`);
  for(const file of ['202611080001_campus.sql','202611080002_email_status.sql','202611080003_account_enrollment.sql','202611080004_member_publishing.sql','202611080005_activity_cancellation.sql'])await db.exec(await readFile(new URL(`../cloudbase/migrations/${file}`,import.meta.url),'utf8'));
  const as=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
  const call=async(action,payload={})=>(await db.query('select public.cg_call($1,$2::jsonb) value',[action,JSON.stringify(payload)])).rows[0].value;
  const input={title:'用户发起活动',description:'仅虚构数据',location:'测试环境',category:'技术',capacity:2,starts_at:'2099-12-02T10:00:00Z',deadline:'2099-12-01T10:00:00Z'};
  await db.exec('set role anon');await assert.rejects(call('create',input),/permission/);
  await as('unknown');await assert.rejects(call('create',input),/有效账号/);
  await as('member-a');const event=await call('create',{...input,owner_id:'member-b',role:'organizer'});assert.equal((await call('profile')).role,'student');
  assert.equal((await call('list')).find(e=>e.id===event.id).owner_id,'member-a');
  await as('member-b');await call('register',{id:event.id});await assert.rejects(call('attendees',{id:event.id}),/权限/);await assert.rejects(call('checkin',{id:event.id,user:'member-b'}),/权限/);
  await assert.rejects(db.exec("update public.cg_profiles set role='organizer'"),/permission/);
  await as('member-a');assert.equal((await call('attendees',{id:event.id})).length,1);await call('checkin',{id:event.id,user:'member-b'});
  for(let i=0;i<4;i++)await call('create',input);
  await assert.rejects(call('create',input),/24 小时.*5/);
  await as('member-b');const other=await call('create',input);assert.ok(other.id);
  await as('member-a');await call('register',{id:other.id});await assert.rejects(call('attendees',{id:other.id}),/权限/);
  await assert.rejects(call('cancel_activity',{id:other.id,reason:'越权'}),/权限/);
  await as('member-b');await call('cancel_activity',{id:other.id,reason:'场地调整'});
  const cancelled=(await call('list')).find(e=>e.id===other.id);assert.ok(cancelled.cancelled_at);assert.equal(cancelled.cancellation_reason,'场地调整');
  await call('cancel_activity',{id:other.id,reason:'重复操作'});assert.equal((await call('list')).find(e=>e.id===other.id).cancelled_at,cancelled.cancelled_at);
  await assert.rejects(call('checkin',{id:other.id,user:'member-a'}),/取消/);
  await as('member-a');await assert.rejects(call('register',{id:other.id}),/取消/);await call('cancel',{id:other.id});
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'cg_%' and rowsecurity")).rows[0].n,3);
 }finally{await db.close();}
});
