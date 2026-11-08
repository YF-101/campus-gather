// Copy an explicit public allowlist; never copy databases, credentials or logs.
import {cp,mkdir,lstat,readdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const source=process.cwd();
const target=process.argv[2]&&resolve(process.argv[2]);
assert.ok(target,'Usage: node scripts/prepare-open-source.mjs /path/to/new-directory');
assert.ok(target!==source&&!target.startsWith(source+'/'),'Release directory must be outside the source project');
try{await access(target);throw Error('Destination already exists; choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
const paths=[
 'src','tests','scripts','.github','cloudbase/migrations','cloudbase/verify-organizer-rollback.sql',
 '.env.example','.gitignore','.nvmrc','next-env.d.ts','next.config.ts','tsconfig.json','postcss.config.mjs',
 'package.json','package-lock.json','README.md','LICENSE','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md',
 'docs/ARCHITECTURE.md','docs/SELF_HOSTING.md','docs/SHOWCASE.md','docs/TESTING.md','docs/PORTFOLIO.md','docs/POSTGRES_CONCURRENCY.md',
 'docs/screenshots/showcase-online-home.png','docs/screenshots/showcase-mobile.png','docs/screenshots/showcase-online-roster.png',
];
async function noSymlinks(path){
 const stat=await lstat(path);assert.ok(!stat.isSymbolicLink(),`Symlinks not allowed: ${path}`);
 if(stat.isDirectory())for(const name of await readdir(path))await noSymlinks(join(path,name));
}
// Validate the complete allowlist before creating a destination.
for(const path of paths)await noSymlinks(join(source,path));
await mkdir(target);
for(const path of paths){await mkdir(resolve(target,path,'..'),{recursive:true});await cp(join(source,path),join(target,path),{recursive:true,errorOnExist:true,force:false});}
console.log(`Public source copy prepared at ${target}. Review files and run tests before publishing.`);
