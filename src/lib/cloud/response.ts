// CloudBase transport 已解码 JSON；交给 PostgREST 时必须重新编码，包括字符串标量。
export function cloudbaseJsonResponse(data:unknown,status:number,headers?:HeadersInit):Response {
 const body = status === 204 || status === 205 || status === 304 ? null : JSON.stringify(data) ?? null;
 return new Response(body,{status,headers});
}
