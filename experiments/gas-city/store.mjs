// Local experimental journal. SQLite transactions serialize concurrent bridge instances.
// Not a replacement for Plates' production job/effect/funding stores.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export function journal(path) {
  mkdirSync(dirname(path), {recursive:true, mode:0o700});
  const db = new DatabaseSync(path); chmodSync(path,0o600);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY(kind,id))');
  const read = (kind,id) => { const row=db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id); return row ? JSON.parse(row.value) : null; };
  const all = kind => db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.value));
  const put = (kind,id,value) => db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value));
  return {read,all,put,close:()=>db.close(), atomic(fn) {db.exec('BEGIN IMMEDIATE');try {const result=fn();db.exec('COMMIT');return result;} catch(e){db.exec('ROLLBACK');throw e;}}};
}
