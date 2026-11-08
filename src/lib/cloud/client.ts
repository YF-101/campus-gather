import cloudbase from '@cloudbase/js-sdk';
import {PostgrestClient} from '@supabase/postgrest-js';
import {cloudbaseJsonResponse} from './response';
export const cloudEnabled=Boolean(process.env.NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID);
export const appBase=process.env.NEXT_PUBLIC_CAMPUS_BASE_PATH||'';
let app:ReturnType<typeof cloudbase.init>|undefined;
function cloud(){const env=process.env.NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID;if(!env)throw Error('尚未配置校园云环境');app??=cloudbase.init({env,region:'ap-shanghai',persistence:'local',auth:{detectSessionInUrl:false}});return app;}
export const cloudAuth=()=>cloud().auth();
type Transport={request:{fetch(options:RequestInit & {url:string;headers:Record<string,string>;shouldThrowOnError:boolean}):Promise<{data:unknown;statusCode?:number;header?:HeadersInit}>}};
async function cloudRpc(name:string,args:Record<string,unknown>={}){
 const a=cloud(),end=a.getEndPointWithKey('GATEWAY'),base=`${end.PROTOCOL}${end.BASE_URL}`;
 const db=new PostgrestClient(base+'/rdb/rest',{fetch:async(url,init)=>{const r=await (a as unknown as Transport).request.fetch({...init,url:String(url),headers:Object.fromEntries(new Headers(init?.headers).entries()),shouldThrowOnError:false});return cloudbaseJsonResponse(await r.data,r.statusCode??200,r.header);}});
 const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data;
}
export const cloudCall=(action:string,payload:Record<string,unknown>={})=>cloudRpc('cg_call',{action,payload});
export const cloudEmailVerified=async():Promise<boolean>=>(await cloudRpc('cg_email_verified'))===true;
export async function cloudMe(){const result=await cloudAuth().getSession();if(result.error&&result.error.message!=='credentials not found')throw result.error;if(!result.data?.session)return null;return cloudCall('profile');}
export async function cloudRequest(path:string,options:RequestInit={}){if(options.method==='POST'){const body=JSON.parse(String(options.body));return cloudCall(body.action,body.action==='create'?body.input:{id:body.id,user:body.user});}const query=new URLSearchParams(path.replace(/^\?/,'')),id=query.get('attendees');return id?cloudCall('attendees',{id}):cloudCall('list');}
