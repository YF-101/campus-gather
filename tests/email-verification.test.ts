import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareEmailVerification} from '../src/lib/cloud/email-verification.ts';

function fixture({verified=true,fail=''}={}){
 const calls:string[]=[];
 const auth={
  async getUser(){return {data:{user:{id:'self',email:'test@example.invalid'}},error:null};},
  async getVerification(input:unknown){calls.push('send');assert.deepEqual(input,{email:'test@example.invalid',target:'USER'});return {verification_id:'message'};},
  async verify(input:unknown){calls.push('verify');assert.deepEqual(input,{verification_id:'message',verification_code:'123456'});if(fail==='code')throw Error('验证码错误');return {verification_token:'proof'};},
  async sudo(input:unknown){calls.push('sudo');assert.deepEqual(input,{verification_token:'proof'});return {sudo_token:'sudo'};},
  async bindEmail(input:unknown){calls.push('bind');assert.deepEqual(input,{email:'test@example.invalid',verification_token:'proof',sudo_token:'sudo'});if(fail==='bind')throw Error('绑定失败');},
 };
 return {calls,auth,status:async()=>verified};
}
test('verifies and binds current email, then requires authoritative backend confirmation',async()=>{
 const f=fixture();const finish=await prepareEmailVerification(f.auth,f.status);assert.deepEqual(f.calls,['send']);await finish('123456');assert.deepEqual(f.calls,['send','verify','sudo','bind']);
});
test('invalid code stops before binding; a failed attempt can retry',async()=>{
 const f=fixture({fail:'code'});const finish=await prepareEmailVerification(f.auth,f.status);await assert.rejects(finish('123456'),/验证码校验失败/);assert.deepEqual(f.calls,['send','verify']);
});
test('platform binding error is not reported as success',async()=>{
 const f=fixture({fail:'bind'});const finish=await prepareEmailVerification(f.auth,f.status);await assert.rejects(finish('123456'),/绑定失败/);
});
test('successful SDK response with unverified database remains blocked',async()=>{
 const f=fixture({verified:false});const finish=await prepareEmailVerification(f.auth,f.status);await assert.rejects(finish('123456'),/尚未确认/);await assert.rejects(finish('123456'),/重新获取/);
});
test('missing logged-in email fails before sending any code',async()=>{
 const f=fixture();f.auth.getUser=async()=>({data:{user:{id:'self',email:''}},error:null});await assert.rejects(prepareEmailVerification(f.auth,f.status),/登录/);assert.deepEqual(f.calls,[]);
});
test('account switching before submission cannot bind another account',async()=>{
 const f=fixture();const finish=await prepareEmailVerification(f.auth,f.status);f.auth.getUser=async()=>({data:{user:{id:'other',email:'test@example.invalid'}},error:null});await assert.rejects(finish('123456'),/账号或邮箱已变化/);assert.deepEqual(f.calls,['send']);
});

import {verificationFailure} from '../src/lib/cloud/verification-error.ts';
test('provider JSON-string errors show stage and safe code without exposing credentials',()=>{
 const error=verificationFailure('账号二次确认',JSON.stringify({error:'failed_precondition',error_description:'sensitive proof and email',verification_token:'private'}));
 assert.match(error.message,/账号二次确认失败（failed_precondition）/);assert.doesNotMatch(error.message,/private|sensitive/);
 assert.doesNotMatch(verificationFailure('邮箱绑定',{message:'secret',code:'arbitrary-secret'}).message,/secret/);
});
