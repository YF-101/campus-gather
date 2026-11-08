import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('account-only campus enrollment retains authentication and ownership controls',async()=>{
 const db=new PGlite();
 try{
  await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(sub text,email_verified boolean);create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('a',null),('b',false);`);
  await db.exec(await readFile(new URL('../cloudbase/migrations/202611080001_campus.sql',import.meta.url),'utf8'));
  const call=async(action,payload={})=>(await db.query('select public.cg_call($1,$2::jsonb) as value',[action,JSON.stringify(payload)])).rows[0].value;
  const as=async(uid)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
  const id=(await db.query('select id from public.cg_activities limit 1')).rows[0].id;
  await as('a');await assert.rejects(call('register',{id}),/验证邮箱/);
  await db.exec('reset role');
  const before=(await db.query("select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) as definition")).rows[0].definition;
  await db.exec(await readFile(new URL('../cloudbase/migrations/202611080003_account_enrollment.sql',import.meta.url),'utf8'));
  const after=(await db.query("select pg_get_functiondef('public.cg_call(text,jsonb)'::regprocedure) as definition")).rows[0].definition;
  assert.equal(after,before.replace("  if not exists(select 1 from auth.users where sub=uid and email_verified is true) then raise exception '请先验证邮箱，再报名活动';end if;",'  -- Campus enrollment requires an authenticated student account.'));
  await db.exec('set role anon');await assert.rejects(call('register',{id}),/permission/);
  await as('unknown');await assert.rejects(call('register',{id}),/登录有效账号/);
  await as('a');await call('register',{id,user:'b',role:'organizer'});await assert.rejects(call('register',{id}),/已经报名/);await assert.rejects(call('create',{}),/组织者/);await assert.rejects(call('attendees',{id}),/权限/);await assert.rejects(db.exec("update public.cg_profiles set role='organizer'"),/permission/);
  await as('b');assert.equal((await db.query('select * from public.cg_registrations')).rows.length,0);await assert.rejects(call('cancel',{id,user:'a'}),/尚未报名/);await call('register',{id});
  await as('a');await call('cancel',{id});assert.equal((await call('list')).find(x=>x.id===id).enrolled,1);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'cg_%' and rowsecurity")).rows[0].n,3);assert.equal((await db.query("select email_verified from auth.users where sub='a'")).rows[0].email_verified,null);
 }finally{await db.close();}
});
