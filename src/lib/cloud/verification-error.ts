const codes=new Set(['invalid_argument','failed_precondition','unauthenticated','permission_denied','not_found','resource_exhausted','unimplemented','internal','unavailable','unreachable','INVALID_PARAM','INVALID_ACCESS_TOKEN']);
// Only allowlisted provider codes are displayed. Never stringify a response,
// since it may contain the user's email, OTP or temporary credentials.
export function verificationFailure(stage:string,cause:unknown):Error{
 let value=cause;
 if(typeof value==='string'&&value.length<4096){try{value=JSON.parse(value);}catch{/* Unknown strings are not displayed. */}}
 let code:unknown;
 if(value&&typeof value==='object'){
  const error=value as Record<string,unknown>;
  code=error.code??(typeof error.error==='string'?error.error:typeof error.error==='object'&&error.error?(error.error as Record<string,unknown>).code:undefined);
 }
 const label=typeof code==='string'&&codes.has(code)?`（${code}）`:'';
 return Error(`${stage}失败${label}。${code==='invalid_argument'?'平台拒绝了本次验证请求，请检查验证码是否正确或已过期。':code==='failed_precondition'?'平台不满足此操作的前置条件，请暂停重试。':code==='unauthenticated'?'登录状态已过期，请重新登录。':'请保留这个提示，以便检查失败步骤。'}`);
}
