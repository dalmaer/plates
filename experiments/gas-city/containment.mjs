// Process-local macOS Seatbelt policy. No global setting or security grant changes.
// Deny by default; never fall back to unsandboxed execution.
import {realpathSync,existsSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
export const SANDBOX_EXEC='/usr/bin/sandbox-exec';
function path(value){if(typeof value!=='string'||!isAbsolute(value)||/[\r\n\0]/.test(value))throw Error('absolute containment path required');return existsSync(value)?realpathSync(value):value;}
const quoted=value=>JSON.stringify(path(value));
export function sandboxProfile({readRoots=[],writeRoots=[],readFiles=[],writeFiles=[]}={}){
 if(process.platform!=='darwin'||!existsSync(SANDBOX_EXEC))throw Error('verified macOS sandbox required; no fallback');
 const system=['/System/Library','/usr/lib','/usr/share','/Library/Apple/System/Library'];
 return ['(version 1)','(deny default)','(import "dyld-support.sb")','(allow process-exec)','(allow process-fork)','(allow sysctl-read (sysctl-name-prefix "hw.") (sysctl-name "kern.hostname") (sysctl-name "kern.osrelease") (sysctl-name "kern.ostype") (sysctl-name "kern.osversion") (sysctl-name "kern.version") (sysctl-name "kern.argmax") (sysctl-name "kern.maxfilesperproc"))','(allow file-read-metadata)',
 '(allow signal (target self))',
 '(deny file-link)',
 '(allow file-read-data file-write-data (subpath "/dev/fd"))',
 ...[...system,...readRoots,...writeRoots].filter(existsSync).map(p=>`(allow file-read* file-map-executable (subpath ${quoted(p)}))`),
 ...['/dev/null','/dev/urandom','/dev/random',...readFiles,...writeFiles].map(p=>`(allow file-read* file-map-executable (literal ${quoted(p)}))`),
 ...writeRoots.map(p=>`(allow file-write* (subpath ${quoted(p)}))`),
 ...['/dev/null',...writeFiles].map(p=>`(allow file-write* (literal ${quoted(p)}))`),
 ].join('\n');
}
export function containmentArgs({command,args=[],...policy}){
 const executable=path(command);if(!Array.isArray(args)||args.some(v=>typeof v!=='string'||v.includes('\0')))throw Error('explicit argv required');
 return ['-p',sandboxProfile({...policy,readFiles:[...(policy.readFiles??[]),executable]}),executable,...args];
}
export function cleanEnvironment({scratch,node=process.execPath}={}){
 return {PATH:`${dirname(path(node))}:/usr/bin:/bin:/usr/sbin:/sbin`,TMPDIR:path(scratch),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.hooksPath',GIT_CONFIG_VALUE_0:'/dev/null',GIT_CONFIG_KEY_1:'core.fsmonitor',GIT_CONFIG_VALUE_1:'false'};
}
