// Fixed ordinary-fixture checks over captured bytes; never imports candidate code here.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, readSync, rmSync, existsSync, constants } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnContained, digest } from './containment.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = '037e13b4f78c061405cef899b528badb536584ad';
const SUITES = { 'task-a': 'tests/web-operations.test.mjs', 'task-b': 'tests/web-migration.test.mjs' };
const boundedFile = path => {
  const initial = lstatSync(path);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 || initial.size > 4 * 1024 * 1024 || realpathSync(path) !== path) throw Error('regular bounded captured file required');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > 4n * 1024n * 1024n) throw Error('captured file changed');
    const bytes = Buffer.alloc(Number(before.size) + 1); let used = 0, n;
    while (used < bytes.length && (n = readSync(fd, bytes, used, bytes.length - used, used)) > 0) used += n;
    const after = fstatSync(fd, { bigint: true });
    if (BigInt(used) !== before.size || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw Error('captured file changed');
    return bytes.subarray(0, used);
  } finally { closeSync(fd); }
};
function captureTree(root, subpath) {
  const files = new Map(); let size = 0, entries = 0;
  function walk(path, depth = 0) {
    if (++entries > 4096 || depth > 20 || realpathSync(path) !== path || lstatSync(path).isSymbolicLink()) throw Error('capture path/entry bound');
    if (lstatSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) walk(join(path, name), depth + 1); return; }
    const bytes = boundedFile(path); size += bytes.length;
    if (size > 20 * 1024 * 1024) throw Error('capture byte bound');
    files.set(relative(root, path), bytes);
  }
  walk(join(root, subpath)); return files;
}
export async function checkCandidate({ captured, task, output, regression = null }) {
  if (!Object.hasOwn(SUITES, task) && task !== 'regression') throw Error('unknown fixed check');
  if (regression !== null && !/^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(regression)) throw Error('explicit direct regression name required');
  if (task === 'regression' && !regression) throw Error('regression name required');
  captured = realpathSync(captured);
  const requested = resolve(output), parent = realpathSync(dirname(requested));
  output = join(parent, requested.slice(dirname(requested).length + 1));
  if (output === captured || output.startsWith(captured + '/')) throw Error('output must be separate from captured snapshot');
  mkdirSync(output); output = realpathSync(output);
  const snapshot = join(output, 'subject'), scratch = join(output, 'scratch');
  mkdirSync(snapshot); mkdirSync(scratch, { mode: 0o700 });
  const archive = spawnSync('/usr/bin/git', ['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','archive',BASELINE], { cwd: resolve(HERE, '../..'), env: { PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_OPTIONAL_LOCKS:'0' }, maxBuffer:128*1024*1024 });
  if (archive.status !== 0 || archive.error) throw Error('frozen archive unavailable');
  const unpack = spawnSync('/usr/bin/tar', ['-xf','-','-C',snapshot], { input:archive.stdout,env:{PATH:'/usr/bin:/bin'},maxBuffer:1024*1024 });
  if (unpack.status !== 0 || unpack.error) throw Error('frozen archive extraction failed');
  const expectedHelpers = captureTree(snapshot,'tests/helpers'), helpers = captureTree(captured,'tests/helpers');
  if (helpers.size !== expectedHelpers.size || [...expectedHelpers].some(([path, bytes]) => !helpers.get(path)?.equals(bytes))) throw Error('fixture integrity refused');
  const files = captureTree(captured,'lib');
  rmSync(join(snapshot,'lib'),{recursive:true});mkdirSync(join(snapshot,'lib'));
  const sourceHashes = {};
  for (const [path, bytes] of files) { mkdirSync(dirname(join(snapshot,path)),{recursive:true});writeFileSync(join(snapshot,path),bytes,{flag:'wx'});sourceHashes[path]=digest(bytes); }
  if (regression) {
    if (existsSync(join(snapshot,regression))) throw Error('explicit regression must be an independent added test');
    const bytes=boundedFile(join(captured,regression));writeFileSync(join(snapshot,regression),bytes,{flag:'wx'});sourceHashes[regression]=digest(bytes);
  }
  const selected=[...(SUITES[task]?[SUITES[task]]:[]),...(regression?[regression]:[])];
  const run=spawnContained({workspace:snapshot,runner:join(HERE,'check-runner.mjs'),scratch,writable:false,args:[task,...(regression?[regression]:[])],timeoutMs:60000});
  const stdout=[],stderr=[];let bytes=0,overflow=false;
  const kill=()=>{try{process.kill(-run.child.pid,'SIGKILL');}catch{}};
  for(const [stream,destination] of [[run.child.stdout,stdout],[run.child.stderr,stderr]])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){overflow=true;kill();return;}destination.push(chunk);});
  run.child.stdin.end();const exit=await run.closed;
  const out=Buffer.concat(stdout).toString('utf8'),err=Buffer.concat(stderr).toString('utf8');
  writeFileSync(join(output,'stdout.jsonl'),out);writeFileSync(join(output,'stderr.log'),err);
  let result=null,protocolError=null;
  try { const frames=out.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));const finals=frames.filter(frame=>frame.type==='fixed-check-result');if(finals.length!==1)throw Error('exactly one final test frame required');result=finals[0];if(result.task!==task||JSON.stringify(result.files)!==JSON.stringify(selected))throw Error('fixed check identity mismatch'); } catch(error){protocolError=error.message;}
  // The child has closed; no process-fork permission exists. Scratch never contains host data.
  rmSync(scratch,{recursive:true,force:true});
  const report={schema:1,kind:'plates-contained-fixed-check',baseline:BASELINE,task,captured,selected,sourceHashes,fixtureModules:[...expectedHelpers.keys()].filter(path=>path.endsWith('.mjs')).length,
    policySHA256:run.policySHA256,nodeSHA256:run.nodeSHA256,runnerSHA256:digest(readFileSync(join(HERE,'check-runner.mjs'))),archiveSHA256:digest(archive.stdout),exit,overflow,protocolError,result,
    passed:exit.code===0&&!exit.timedOut&&!overflow&&!protocolError&&result?.ok===true,scratchRemoved:!existsSync(scratch),
    qualification:'Fixed ordinary deterministic suites plus optional explicitly selected regression. Candidate executes only in read-only snapshot; separate scratch writable. Native test results are reported by that process, not adversarial-proof scoring. No full repository gate, shell, npm, fork, network, model or credentials.'};
  writeFileSync(join(output,'check.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [captured,task,output,regression,...extra]=process.argv.slice(2);
  if(!captured||!output||extra.length)throw Error('Usage: node check-candidate.mjs CAPTURED_SNAPSHOT task-a|task-b|regression NEW_OUTPUT [tests/EXPLICIT.test.mjs]');
  const report=await checkCandidate({captured,task,output,regression:regression??null});
  console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:1;
}
