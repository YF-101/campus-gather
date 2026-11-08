import {readdir,readFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('out');
async function walk(dir,prefix=''){let names=[];for(const item of await readdir(dir,{withFileTypes:true})){const relative=prefix+item.name;if(item.isDirectory())names.push(...await walk(join(dir,item.name),relative+'/'));else names.push(relative);}return names;}
const files=await walk(root);
assert.ok(files.length>0);
for(const path of files)assert.ok(!/(^|\/)(?:\.env[^/]*|\.data|node_modules|api)(\/|$)/.test(path),`Unexpected private/server artifact path: ${path}`);
const assets=new Set();
for(const page of ['index.html','auth/index.html','demo/index.html']){
 const html=await readFile(join(root,page),'utf8');
 if(page.startsWith('demo/'))assert.match(html,/公开交互演示/);
 for(const match of html.matchAll(/(?:src|href)="([^"<>]+\.(?:js|css)(?:\?[^"<>]*)?)"/g)){
  const url=new URL(match[1],'https://static.invalid');
  assert.equal(url.origin,'https://static.invalid','Unexpected external script or stylesheet');
  assert.ok(url.pathname.startsWith('/campus/_next/'),'Unexpected static asset prefix');
  assets.add(decodeURIComponent(url.pathname.slice('/campus/'.length)));
 }
}
assert.ok(assets.size>0);
for(const file of assets){const path=resolve(root,file);assert.ok(path.startsWith(root+'/'));await access(path);}
console.log(`Static artifact passed: ${files.length} files, ${assets.size} referenced assets; root/auth/demo pages present; no API, environment-file, data-directory or node_modules paths.`);
