import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../src/lib/service.ts';
import {createShowcaseStore} from '../src/lib/showcase.ts';
const input={title:'发布者取消测试',description:'虚构测试',location:'测试空间',category:'技术',capacity:2,starts_at:'2099-12-02T10:00:00Z',deadline:'2099-12-01T10:00:00Z'};
test('event cancellation is owner-only, idempotent, visible and prevents new enrollment or check-in',async()=>{
 const s=await createService();try{
  const {id}=await s.create('student',input);await s.register('friend',id);
  await assert.rejects(s.cancelEvent('friend',id,'无权操作'),/权限/);
  await s.cancelEvent('student',id,'场地调整');
  const first=(await s.list('friend')).find(e=>e.id===id)!;assert.ok(first.cancelled_at);assert.equal(first.cancellation_reason,'场地调整');
  await s.cancelEvent('student',id,'重复点击');assert.deepEqual((await s.list('friend')).find(e=>e.id===id)!.cancelled_at,first.cancelled_at);
  await assert.rejects(s.register('organizer',id),/取消/);await assert.rejects(s.checkIn('student',id,'friend'),/取消/);
  await s.cancel('friend',id);assert.equal((await s.attendees('student',id)).length,0);
 }finally{await s.close();}
});
test('showcase cancellation keeps the record and follows the same owner rules',()=>{
 const s=createShowcaseStore(),{id}=s.call('student','create',input);
 s.call('friend','register',{id});assert.throws(()=>s.call('friend','cancel_activity',{id}),/权限/);
 s.call('student','cancel_activity',{id,reason:'场地调整'});
 assert.equal(s.call('friend','list').find(e=>e.id===id)!.cancellation_reason,'场地调整');
 assert.throws(()=>s.call('organizer','register',{id}),/取消/);assert.throws(()=>s.call('student','checkin',{id,user:'friend'}),/取消/);
 s.call('friend','cancel',{id});assert.equal(s.call('student','attendees',{id}).length,0);
});
