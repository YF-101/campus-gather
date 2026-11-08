import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commitThenRefresh} from '../src/lib/activity-mutation.ts';
test('confirmed writes remain successful when a subsequent list refresh fails',async()=>{
 let writes=0;
 const result=await commitThenRefresh(async()=>{writes++;return {id:'confirmed-event'};},async()=>{throw Error('list temporarily unavailable');});
 assert.deepEqual(result,{data:{id:'confirmed-event'},synchronized:false});assert.equal(writes,1);
});
test('a rejected write does not trigger list synchronization or report success',async()=>{
 let refreshes=0;
 await assert.rejects(commitThenRefresh(async()=>{throw Error('名额已满');},async()=>{refreshes++;}),/名额已满/);
 assert.equal(refreshes,0);
});
test('successful mutations and list reloads report synchronization',async()=>{
 assert.deepEqual(await commitThenRefresh(async()=>({ok:true}),async()=>{}),{data:{ok:true},synchronized:true});
});
