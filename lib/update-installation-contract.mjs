// Closed compatibility contract: exact shipped managed targets, preserved owner
// configuration, and no unclassified migrations. A green PR is not this proof.
import { createHash } from 'node:crypto';
import { targets, fill, practiceVersion, load } from './practices.mjs';
import { renamePath } from './rename.mjs';
import { updatePath } from './update-artifact.mjs';
import { concurrencyOf, workflowName } from '../practices/delivery/files/scripts/plates/delivery.mjs';
export const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const digest = value => hash(JSON.stringify(canonical(value)));
export const oid = value => /^[a-f0-9]{40}$/.test(value ?? '');
export const fail = reason => { throw new Error(reason); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const workflow = path => /^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(path);
const groups = text => {
  const blocks = concurrencyOf(text);
  if (blocks.some(b => b.unreadable || !b.group || b.level!=='workflow') || /(?:^|\s)[&*][\w-]+|(?:^|\n)\s*<<:/.test(text)) fail('workflow concurrency unsupported');
  return blocks.map(({level, group}) => ({level, group, ...(group.includes('github.workflow') ? {workflowName:workflowName(text)} : {})}));
};
export async function installationContract({repo, files, read}, {practices, version} = {}) {
  practices ??= await load(); version ??= practiceVersion();
  const configPath = '.plates/plates.json', lockPath = '.plates/lock.json';
  const source = async (side, path) => {
    const f = await read(side, path);
    if (f === null) return null;
    if (!['100644', '100755'].includes(f.mode) || typeof f.text !== 'string') fail(`unsupported file type: ${path}`);
    return f.text;
  };
  const configs = await Promise.all(['base','head'].map(async side => JSON.parse(await source(side, configPath))));
  const locks = await Promise.all(['base','head'].map(async side => JSON.parse(await source(side, lockPath))));
  if (configs.some(c => !object(c) || c.repo !== repo || !Array.isArray(c.practices)) || locks.some(l => !object(l?.files))) fail('managed configuration/lock unavailable');
  const [before, after] = configs, [oldLock, newLock] = locks;
  if (after.practice !== version || newLock.practice !== version || oldLock.practice !== before.practice) fail('target release/lock mismatch');
  const policy = c => { const {practice, ...rest} = c; return rest; };
  if (digest(policy(before)) !== digest(policy(after))) fail('configuration policy or migration change unsupported');
  const expected = new Map(targets(after, practices).filter(f => f.kind === 'managed' && f.link === undefined).map(f => [f.path, {practice:f.practice, text:fill(f.template,after,f.path)}]));
  if (!Array.isArray(files) || !files.length || files.length > 200 || new Set(files).size !== files.length || files.some(p => !updatePath(p))) fail('diff coverage invalid');
  const installed = [], barrier = [], replacements = new Map();
  // The owning migration maps only exact old lock entries here. The selected
  // shipped target and complete diff must independently agree; no second table.
  for (const oldPath of Object.keys(oldLock.files).filter(workflow)) {
    const newPath=renamePath(oldPath);
    if(oldPath===newPath || !expected.has(newPath))continue;
    if (files.includes(oldPath) && files.includes(newPath) && await source('head',oldPath)===null && await source('base',newPath)===null) replacements.set(newPath,oldPath);
  }
  const removed = new Set(replacements.values());
  for (const path of files.slice().sort()) {
    if(removed.has(path)){installed.push({path,absent:true});continue;}
    const oldPath=replacements.get(path)??path;
    const [oldText, newText] = await Promise.all([source('base',oldPath),source('head',path)]);
    if (oldText === null || newText === null || oldPath===path && oldText === newText) fail(`addition/deletion or empty diff unsupported: ${path}`);
    if (![configPath,lockPath].includes(path)) {
      const target = expected.get(path), old = oldLock.files[oldPath], next = newLock.files[path];
      if (!target || old?.practice !== target.practice || next?.practice !== target.practice || old.sha256 !== hash(oldText) || next.sha256 !== hash(newText) || newText !== target.text) fail(`unproven managed compatibility: ${path}`);
      if (workflow(path)) {
        const oldGroups = groups(oldText), newGroups = groups(newText);
        if (digest(oldGroups) !== digest(newGroups)) barrier.push({oldPath,newPath:path,oldGroups,newGroups,oldSha256:hash(oldText),oldMode:(await read('base',oldPath)).mode});
        else if(oldPath!==path)fail('replacement without an explicit concurrency transition unsupported');
      }
    }
    installed.push({path,sha256:hash(newText),mode:(await read('head',path)).mode});
  }
  // No forged lock entry may claim an untouched owner file, nor hide an edit.
  const expectedKeys=Object.keys(oldLock.files).map(path=>[...replacements].find(([,old])=>old===path)?.[0]??path).sort();
  if (digest(expectedKeys) !== digest(Object.keys(newLock.files).sort())) fail('lock ownership change unsupported');
  for (const path of Object.keys(oldLock.files)) {
    if (digest(oldLock.files[path]) !== digest(newLock.files[path]??null) && !files.includes(path)) fail(`lock change without managed diff: ${path}`);
  }
  // Always read back lock/config, even if one was unchanged in this update.
  for (const path of [configPath,lockPath]) if (!installed.some(f=>f.path===path)) installed.push({path,sha256:hash(await source('head',path)),mode:(await read('head',path)).mode});
  return {policy:'managed-compatible-v1',targetRelease:version,installed,barrier,configuration:digest(policy(after)),migrations:'unchanged'};
}
