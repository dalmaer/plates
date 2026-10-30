// Verify retained source hashes and execute the actual dependency-free upstream
// create-idempotency cache/tests, plus our explicit server-restart negative control.
// Never downloads, installs or launches a city. Usage: node ... <upstream-dir> --json
import { readFileSync, mkdtempSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const here=fileURLToPath(new URL('.',import.meta.url));
const source=process.argv[2];
if(!source||process.argv[3]!=='--json')throw new Error('Usage: node experiments/gas-city/check-upstream.mjs <upstream-dir> --json');
const pin=JSON.parse(readFileSync(join(here,'upstream.json'),'utf8'));
for(const [path,expected] of Object.entries(pin.files)){
  if(createHash('sha256').update(readFileSync(join(resolve(source),path))).digest('hex')!==expected)throw new Error(`upstream-contract-drift: ${path}`);
}
const scratch=mkdtempSync(join(tmpdir(),'plates-gascity-upstream-'));
try {
  const files=['idempotency.go','idempotency_hash.go','http_helpers.go','idempotency_test.go'];
  for(const file of files)copyFileSync(join(resolve(source),'internal/api',file),join(scratch,file));
  copyFileSync(join(here,'restart_test.go'),join(scratch,'restart_test.go'));files.push('restart_test.go');
  const cache=join(tmpdir(),'plates-gascity-go-cache');mkdirSync(cache,{recursive:true});
  const result=spawnSync('go',['test',...files,'-count=1','-v'],{cwd:scratch,encoding:'utf8',timeout:120000,env:{PATH:process.env.PATH,TMPDIR:tmpdir(),GO111MODULE:'off',GOTOOLCHAIN:'local',GOPROXY:'off',GOSUMDB:'off',GOCACHE:cache,GOMODCACHE:join(scratch,'modules')}});
  console.log(JSON.stringify({revision:pin.revision,hashesVerified:Object.keys(pin.files).length,scope:'upstream create cache only; not city/runtime integration',status:result.status,signal:result.signal,error:result.error?.message??null,stdout:result.stdout,stderr:result.stderr},null,2));process.exitCode=result.status??1;
}finally{rmSync(scratch,{recursive:true,force:true});}
