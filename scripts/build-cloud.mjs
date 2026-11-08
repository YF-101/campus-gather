import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const env=process.env.NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID;
if(!env)throw Error('请先设置 NEXT_PUBLIC_CAMPUS_CLOUDBASE_ENV_ID');
const backup=await mkdtemp(join(tmpdir(),'campus-cloud-'));
const original=await readFile('src/app/page.tsx','utf8');let moved=false,outMoved=false,success=false;
try{
 try{await rename('out',join(backup,'out'));outMoved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 await rename('src/app/api',join(backup,'api'));moved=true;
 await writeFile('src/app/page.tsx',"import Campus from '@/components/campus';\nexport default function Page(){return <Campus mode='cloud'/>;}\n");
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:{...process.env,CAMPUS_STATIC:'1',NEXT_PUBLIC_CAMPUS_BASE_PATH:'/campus'}});child.once('error',reject);child.once('exit',resolve);});
 if(code!==0)throw Error('云端静态构建失败');
 success=true;
}finally{
 await writeFile('src/app/page.tsx',original);if(moved)await rename(join(backup,'api'),'src/app/api');
 if(!success){await rm('out',{recursive:true,force:true});if(outMoved)await rename(join(backup,'out'),'out');}
 await rm(backup,{recursive:true,force:true});
}
