// Fixed metadata queries on a private copy in an OS-killable process. No supplied SQL.
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
let db;
try {
  const [input]=await once(process,'message');
  db=new DatabaseSync(input.path,{readOnly:true,allowExtension:false,timeout:100});
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
  const table=input.query.kind==='automations'?'automations':input.query.kind==='threads'?'threads':null;
  if(!table)throw Error();
  const schema=db.prepare('SELECT type, sql FROM sqlite_schema WHERE name=?').get(table);
  if(schema?.type!=='table'||!/^CREATE\s+TABLE\b/i.test(schema.sql??''))throw Error();
  // Views, virtual tables and generated columns can execute expensive expressions.
  // Only ordinary stored columns belong to these supported source formats.
  if(db.prepare(`PRAGMA table_xinfo(${table})`).all().some(column=>column.hidden!==0))throw Error();
  let statement,args=[];
  if(table==='automations')statement=db.prepare('SELECT id, status, rrule, target_thread_id FROM automations ORDER BY id LIMIT 501');
  else {
    const ids=input.query.ids;
    if(!Array.isArray(ids)||ids.length>500||!ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=500))throw Error();
    statement=db.prepare(`SELECT id, rollout_path FROM threads WHERE id IN (${ids.map(()=>'?').join(',')}) LIMIT 501`);args=ids;
  }
  process.send?.('query-started');
  const rows=[];let bytes=12,error=null;
  for(const row of statement.iterate(...args)) {
    if(rows.length===500){error='entry_limit';break;}
    const size=Buffer.byteLength(JSON.stringify(row))+1;
    if(bytes+size>4*1024*1024){error='byte_limit';break;}
    bytes+=size;rows.push(row);
  }
  process.stdout.write(JSON.stringify(error?{error}:{rows}));
}catch{process.stdout.write(JSON.stringify({error:'unsupported_format'}));}
finally{try{db?.close();}catch{}process.disconnect?.();}
