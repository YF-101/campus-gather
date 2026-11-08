import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../src/lib/service.ts';
import {createShowcaseStore} from '../src/lib/showcase.ts';
const input={title:'同学发起的活动',description:'真实权限规则测试夹具',location:'校园共享空间',category:'技术',capacity:4,starts_at:'2099-12-02T10:00:00Z',deadline:'2099-12-01T10:00:00Z'};
test('any local account can publish, participate and manage only its own events',async()=>{
 const s=await createService();try{
  const event=await s.create('student',input);
  await s.register('organizer',event.id);
  assert.equal((await s.attendees('student',event.id)).length,1);
  await assert.rejects(s.attendees('friend',event.id),/权限/);
  await assert.rejects(s.checkIn('other-organizer',event.id,'organizer'),/权限/);
  await s.checkIn('student',event.id,'organizer');
  await assert.rejects(s.cancel('organizer',event.id),/签到/);
 }finally{await s.close();}
});
test('showcase follows the same member publishing and ownership rules',()=>{
 const store=createShowcaseStore(),{id}=store.call('student','create',input);
 store.call('organizer','register',{id});
 assert.equal(store.call('student','attendees',{id}).length,1);
 assert.throws(()=>store.call('friend','attendees',{id}),/权限/);
 store.call('student','checkin',{id,user:'organizer'});
 assert.throws(()=>store.call('organizer','cancel',{id}),/签到/);
});
