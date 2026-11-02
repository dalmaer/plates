// Synthetic worker protocol fixture: native SQLite cannot finish before cancellation.
// No networking, extensions, writes, host SQL input or external credentials.
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
const [input] = await once(process, 'message');
const db = new DatabaseSync(input.path, { readOnly: true, allowExtension: false });
db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
db.function('acme_started', () => { process.send('query-started'); return 0; });
db.prepare('WITH RECURSIVE work(n) AS (VALUES(acme_started()) UNION ALL SELECT n+1 FROM work) SELECT max(n) FROM work').get();
throw Error('nonterminating native fixture unexpectedly returned');
