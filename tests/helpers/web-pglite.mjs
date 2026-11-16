// Shared local PGlite migration snapshot helper for web SQL tests.
// Runs lib/web/migrations/*.sql once per schema target in a process, captures
// PGlite dumpDataDir('none'), and restores isolated instances via loadDataDir.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = new URL('../../lib/web/migrations/', import.meta.url);
const ROLES_SQL = 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;';

let fsBundlePromise = null;
let migrationFilesPromise = null;
const snapshotCache = new Map();
const sharedCache = new Map();
let buildQueue = Promise.resolve();
const stats = { donorBoots: 0, sqlFilesExecuted: 0, snapshotsCaptured: 0, restores: 0 };

function loadFsBundle() {
  fsBundlePromise ??= readFile(new URL('./pglite.data', import.meta.resolve('@electric-sql/pglite'))).then(buf => {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const blob = new Blob([ab]);
    Object.defineProperty(blob, 'arrayBuffer', { value: async () => ab });
    return blob;
  });
  return fsBundlePromise;
}

export function listMigrationFiles() {
  migrationFilesPromise ??= readdir(MIGRATIONS).then(files => files.filter(f => f.endsWith('.sql')).sort());
  return migrationFilesPromise;
}

async function resolveTarget(upTo) {
  const files = await listMigrationFiles();
  assert.ok(files.length > 0, 'expected SQL migrations in lib/web/migrations');
  const target = upTo ?? files.at(-1);
  assert.ok(files.includes(target), `unknown migration target: ${target}`);
  return { files, target };
}

async function captureSnapshot(db) {
  const blob = await db.dumpDataDir('none');
  const ab = await blob.arrayBuffer();
  Object.defineProperty(blob, 'arrayBuffer', { value: async () => ab });
  stats.snapshotsCaptured++;
  return blob;
}

export async function primeMigratedSnapshots(targets = [undefined]) {
  const files = await listMigrationFiles();
  assert.ok(files.length > 0, 'expected SQL migrations in lib/web/migrations');
  const resolved = [...new Set(targets.map(t => t ?? files.at(-1)))];
  for (const target of resolved) assert.ok(files.includes(target), `unknown migration target: ${target}`);
  if (resolved.every(target => snapshotCache.has(target))) return;

  const job = buildQueue.then(async () => {
    const missing = resolved.filter(target => !snapshotCache.has(target));
    if (missing.length === 0) return;
    const wanted = new Set(missing);
    const maxIndex = Math.max(...missing.map(target => files.indexOf(target)));
    const fsBundle = await loadFsBundle();
    stats.donorBoots++;
    const donor = await PGlite.create({ fsBundle });
    try {
      await donor.exec(ROLES_SQL);
      for (let i = 0; i <= maxIndex; i++) {
        const file = files[i];
        await donor.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'));
        stats.sqlFilesExecuted++;
        if (wanted.has(file)) snapshotCache.set(file, await captureSnapshot(donor));
      }
    } finally {
      await donor.close();
    }
  });
  buildQueue = job.catch(() => {});
  await job;
}

export async function migratedSnapshot({ upTo } = {}) {
  const { target } = await resolveTarget(upTo);
  if (!snapshotCache.has(target)) await primeMigratedSnapshots([target]);
  return snapshotCache.get(target);
}

export async function restoreMigratedPGlite({ upTo } = {}) {
  const [fsBundle, loadDataDir] = await Promise.all([loadFsBundle(), migratedSnapshot({ upTo })]);
  stats.restores++;
  return PGlite.create({ fsBundle, loadDataDir });
}

export async function sharedMigratedPGlite({ upTo } = {}) {
  const { target } = await resolveTarget(upTo);
  let pending = sharedCache.get(target);
  if (!pending) {
    pending = restoreMigratedPGlite({ upTo: target });
    sharedCache.set(target, pending);
  }
  return pending;
}

export async function closeSharedMigratedPGlites() {
  const entries = [...sharedCache.values()];
  sharedCache.clear();
  for (const pending of entries) {
    const db = await pending;
    if (!db.closed) await db.close();
  }
}

export function pgliteSnapshotStats() {
  return { ...stats, cachedTargets: snapshotCache.size };
}
