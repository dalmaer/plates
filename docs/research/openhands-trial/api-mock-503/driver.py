from pathlib import Path
import json,subprocess
root=Path('/Users/dionalmaer/Documents/Codex/2026-10-30/task-4');out=root/'sdk-trial-api-offline-contract-503';out.mkdir();(out/'workspace/lib').mkdir(parents=True);(out/'runtime').mkdir()
cfg={'workspace':str(out/'workspace'),'prompt':'Read lib/acme.mjs through the bounded file tool, then finish.','mode':'api','model':'openai/gpt-4o-mini','maxRequests':3,'maxInputTokens':64000,'maxOutputTokens':4000,'maxSeconds':40,'requestTimeoutSeconds':5,'liveAuthorized':True,'apiBase':'https://acme-broker.invalid/v1','apiKeyEnv':'PLATES_TRIAL_ACME_KEY'}
(out/'config.json').write_text(json.dumps(cfg)); events=[]
with (out/'stderr.log').open('w') as err:
 child=subprocess.Popen([str(root/'openhands-sdk-env/bin/python'),'/tmp/openhands-api-transport-fixture-503.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True,env={'PATH':'/usr/bin:/bin'})
 for line in child.stdout:
  event=json.loads(line);events.append(event)
  if event['kind']=='fatal':break
  response={'rpcId':event['rpcId'],'ok':True}
  if event['kind']=='approval-request':response['approvedActionSHA256']=[a['actionSHA256'] for a in event['actions']]
  if event['kind']=='tool':response['result']={'ok':True,'content':'synthetic mocked file result'}
  child.stdin.write(json.dumps(response)+'\n');child.stdin.flush()
 code=child.wait(timeout=50)
report={'exitCode':code,'events':events,'qualification':'HTTPX in-process mock; all sockets denied; synthetic key and usage; no real provider or credentials.'}
(out/'events.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'exitCode':code,'kinds':[e['kind'] for e in events],'output':str(out)}))
