import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createShowcaseStore,transportFor} from '../src/lib/showcase.ts';
let now=Date.UTC(2026,10,8,4);
const input=()=>({title:'演示共创活动',description:'全部为虚构内容',location:'演示空间',category:'技术',capacity:1,starts_at:new Date(now+86400000*3).toISOString(),deadline:new Date(now+86400000*2).toISOString()});
test('public showcase always selects its isolated transport even in a cloud build',()=>{
 assert.equal(transportFor('showcase',true),'showcase');assert.equal(transportFor('cloud',true),'cloud');assert.equal(transportFor('demo',true),'local');assert.equal(transportFor('accounts',false),'local');
});
test('showcase starts with fictional data, independent instances, and detached returned rows',()=>{
 const first=createShowcaseStore(()=>now),second=createShowcaseStore(()=>now);
 const list=first.call('student','list');assert.equal(list.length,4);assert.equal(list.filter(a=>a.registered).length,1);list[0].title='changed';assert.notEqual(first.call('student','list')[0].title,'changed');
 first.call('organizer','create',input());assert.equal(first.call('student','list').length,5);assert.equal(second.call('student','list').length,4);
 assert.throws(()=>first.call('real-cloud-account','list'),/模拟身份/);
});
test('showcase enforces organizer ownership and student capacity rules',()=>{
 const store=createShowcaseStore(()=>now);assert.throws(()=>store.call('student','create',input()),/组织者/);
 const {id}=store.call('organizer','create',input());assert.throws(()=>store.call('other-organizer','attendees',{id}),/权限/);
 store.call('student','register',{id});assert.throws(()=>store.call('student','register',{id}),/已经报名/);assert.throws(()=>store.call('friend','register',{id}),/名额已满/);
 store.call('student','cancel',{id});store.call('friend','register',{id});assert.equal(store.call('organizer','attendees',{id}).length,1);
 assert.throws(()=>store.call('other-organizer','checkin',{id,user:'friend'}),/权限/);
 store.call('organizer','checkin',{id,user:'friend'});const timestamp=store.call('organizer','attendees',{id})[0].checked_in_at;
 now+=1000;store.call('organizer','checkin',{id,user:'friend'});assert.equal(store.call('organizer','attendees',{id})[0].checked_in_at,timestamp);
 assert.throws(()=>store.call('friend','cancel',{id}),/签到/);
});
test('showcase rejects invalid dates/capacity and checks deadlines at submission',()=>{
 const store=createShowcaseStore(()=>now);assert.throws(()=>store.call('organizer','create',{...input(),capacity:0}),/名额/);assert.throws(()=>store.call('organizer','create',{...input(),starts_at:'bad'}),/时间/);
 const {id}=store.call('organizer','create',input());now+=86400000*2+1;assert.throws(()=>store.call('student','register',{id}),/截止/);
});
