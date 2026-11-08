import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('campus cloud authorization and atomic enrollment',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(sub text,email_verified boolean);create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('teacher',true),('teacher-other',true),('student-a',true),('student-b',true),('unverified',false);`);
 console.log('Applying isolated schema');await db.exec(await readFile(new URL('../cloudbase/migrations/202611080001_campus.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../cloudbase/migrations/202611080002_email_status.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../cloudbase/migrations/202611080003_account_enrollment.sql',import.meta.url),'utf8'));
 console.log('Schema ready');const as=async(uid)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
 const call=async(action,payload={})=>(await db.query('select public.cg_call($1,$2::jsonb) as value',[action,JSON.stringify(payload)])).rows[0].value;
 await db.exec('set role anon');await assert.rejects(call('list'),/permission/);await assert.rejects(db.query('select public.cg_email_verified()'),/permission/);
 console.log('Teacher setup');await as('teacher');await call('profile');await db.exec("reset role;update public.cg_profiles set role='organizer' where id='teacher';set role authenticated;");
 const event=await call('create',{title:'测试活动',description:'并发报名验证',location:'校园中心',category:'技术',capacity:1,starts_at:'2099-12-02T10:00:00+08:00',deadline:'2099-12-01T10:00:00+08:00'});
 await as('teacher-other');await call('profile');await db.exec("reset role;update public.cg_profiles set role='organizer' where id='teacher-other';set role authenticated;");await assert.rejects(call('attendees',{id:event.id}),/权限/);await assert.rejects(call('checkin',{id:event.id,user:'student-a'}),/权限/);
 console.log('Student checks');await as('student-a');const profile=await call('profile',{role:'organizer'});assert.equal((await db.query('select public.cg_email_verified() as verified')).rows[0].verified,true);assert.equal(profile.role,'student');await assert.rejects(call('create',{}),/组织者/);
 await assert.rejects(db.query("update public.cg_profiles set role='organizer'"),/permission/);
 await call('register',{id:event.id});await assert.rejects(call('register',{id:event.id}),/已经报名/);
 console.log('Capacity checks');await as('student-b');await assert.rejects(call('register',{id:event.id}),/名额已满/);await assert.rejects(call('attendees',{id:event.id}),/权限/);
 assert.equal((await db.query('select * from public.cg_registrations')).rows.length,0);
 await as('student-a');await call('cancel',{id:event.id});await as('student-b');await call('register',{id:event.id});
 await as('teacher');const roster=await call('attendees',{id:event.id});assert.equal(roster.length,1);assert.equal(roster[0].user_id,'student-b');await call('checkin',{id:event.id,user:'student-b'});const firstCheckin=(await call('attendees',{id:event.id}))[0].checked_in_at;await call('checkin',{id:event.id,user:'student-b'});assert.equal((await call('attendees',{id:event.id}))[0].checked_in_at,firstCheckin);await assert.rejects(call('checkin',{id:event.id,user:'student-a'}),/有效报名/);
 await as('student-b');await assert.rejects(call('cancel',{id:event.id}),/签到/);
 console.log('Verification checks');await as('unverified');assert.equal((await db.query('select public.cg_email_verified() as verified')).rows[0].verified,false);await assert.rejects(call('register',{id:event.id}),/名额已满/);
 await db.exec('reset role');assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'cg_%' and rowsecurity")).rows[0].n,3);
 const beforeAudit=(await db.query("select (select count(*) from public.cg_activities)::int events,(select count(*) from public.cg_registrations)::int registrations,(select count(*) from public.cg_profiles)::int profiles")).rows;
 await db.exec(await readFile(new URL('../cloudbase/verify-organizer-rollback.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query("select (select count(*) from public.cg_activities)::int events,(select count(*) from public.cg_registrations)::int registrations,(select count(*) from public.cg_profiles)::int profiles")).rows,beforeAudit);
 }finally{await db.close();}
});
