// Local preparation only: one frozen commit, independent objects, no hidden branch history.
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertDestination} from './prepare-real-trial.mjs';
import {cleanEnvironment} from './containment.mjs';
export const BASELINE='037e13b4f78c061405cef899b528badb536584ad';
export function prepareWorkerCopy(source,destination) {
 if(!isAbsolute(source)||!isAbsolute(destination))throw Error('absolute paths required');
 const repo=realpathSync(source),dest=assertDestination(repo,destination);
 if(existsSync(dest))throw Error('new destination required; never reset uncertain work');
 mkdirSync(dest,{recursive:true,mode:0o700});
 const scratch=mkdtempSync('/tmp/plates-git-copy-'),env=cleanEnvironment({scratch});
 function git(args){const r=spawnSync('/usr/bin/git',args,{cwd:dest,env,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});if(r.error||r.status!==0)throw Error(`local preparation failed: ${r.error?.message??r.stderr}`);return r.stdout.trim();}
 // Fetch exactly one local commit, never copy refs/objects of experiment branches.
 git(['init','--quiet']);git(['-c','protocol.file.allow=always','fetch','--quiet','--depth=1',pathToFileURL(repo).href,BASELINE]);git(['checkout','--quiet','--detach',BASELINE]);
 const facts={head:git(['rev-parse','HEAD']),commits:git(['rev-list','--all','--count']),shallow:git(['rev-parse','--is-shallow-repository']),remotes:git(['remote']),refs:git(['for-each-ref','--format=%(refname)']),dirty:git(['status','--porcelain']),alternates:existsSync(join(dest,'.git/objects/info/alternates'))};
 if(facts.head!==BASELINE||facts.commits!=='1'||facts.shallow!=='true'||facts.remotes||facts.refs||facts.dirty||facts.alternates)throw Error(`worker isolation verification failed: ${JSON.stringify(facts)}`);
 const config=readFileSync(join(dest,'.git/config'),'utf8');
 return {schema:1,mode:'preparation-only',modelExecution:'not-authorized',baseline:BASELINE,destination:dest,scratch,facts,gitConfigSHA256:createHash('sha256').update(config).digest('hex'),scope:'Independent shallow detached checkout; evaluator and held-out material remain outside. Model CLI and repository-tool sandbox compatibility remain separate checks.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [source,destination,report,...rest]=process.argv.slice(2);
 if(!source||!destination||!report||rest.length||!isAbsolute(report)||existsSync(report))throw Error('Usage: prepare-worker-copy.mjs <absolute-local-source> <new-absolute-worker-root> <new-absolute-report>');
 let result;try{result=prepareWorkerCopy(source,destination);}catch(error){result={schema:1,status:'failed',modelExecution:'not-authorized',destination,error:error.message};process.exitCode=1;}
 writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result,null,2));
}
