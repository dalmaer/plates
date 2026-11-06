# Separate offline test wrapper, never used for production execution.
from pathlib import Path
import json,os,sys,runpy
ROOT=Path('/Users/dionalmaer/Documents/Codex/2026-10-30/task-4')
OUT=ROOT/'sdk-trial-api-offline-contract-final'
records=[]
def audit(event,args):
 if event in {'socket.connect','socket.bind','socket.getaddrinfo','socket.gethostbyname','socket.gethostbyaddr'}:
  records.append({'kind':'network-denied','event':event})
  raise PermissionError('offline_fixture_all_network_denied')
sys.addaudithook(audit)
import httpx
RealClient=httpx.Client
calls=0

def handler(request):
 global calls
 calls+=1
 payload=json.loads(request.content)
 records.append({'kind':'request-observed','url':str(request.url),'method':request.method,'authorizationMatchesSyntheticKey':request.headers.get('authorization')=='Bearer acme-synthetic-not-a-credential','model':payload.get('model'),'stream':payload.get('stream'),'maxCompletionTokens':payload.get('max_completion_tokens'),'toolNames':[t['function']['name'] for t in payload.get('tools',[])]})
 assert calls<=2,'unexpected_http_attempt'
 assert str(request.url)=='https://acme-broker.invalid/v1/chat/completions'
 assert request.method=='POST'
 assert request.headers.get('authorization')=='Bearer acme-synthetic-not-a-credential'
 payload=json.loads(request.content)
 assert payload['model']=='gpt-4o-mini'
 assert payload.get('stream') in (None,False)
 assert payload.get('max_tokens')==4000 or payload.get('max_completion_tokens')==4000
 assert payload['tools'][0]['function']['name']=='plates_bounded_file'
 records.append({'kind':'mock-http','ordinal':calls,'url':str(request.url),'model':payload['model'],'maxTokens':payload.get('max_tokens',payload.get('max_completion_tokens')),'toolNames':[t['function']['name'] for t in payload['tools']]})
 message={'role':'assistant','content':'Synthetic offline response.'}
 if calls==1:
  message['tool_calls']=[{'id':'acme-mock-read-1','type':'function','function':{'name':'plates_bounded_file','arguments':json.dumps({'operation':'read','path':'lib/acme.mjs'})}}]
 return httpx.Response(200,json={'id':'acme-mock-response-'+str(calls),'object':'chat.completion','created':0,'model':'gpt-4o-mini','choices':[{'index':0,'message':message,'finish_reason':'tool_calls' if calls==1 else 'stop'}],'usage':{'prompt_tokens':100,'completion_tokens':20,'total_tokens':120}})

class FixtureClient(RealClient):
 def __init__(self,*args,**kwargs):
  records.append({'kind':'http-client','followRedirects':kwargs.get('follow_redirects'),'trustEnv':kwargs.get('trust_env')})
  # Every httpx client in this isolated fixture is offline, including imports.
  kwargs['transport']=httpx.MockTransport(handler)
  super().__init__(*args,**kwargs)
httpx.Client=FixtureClient
os.environ['PLATES_TRIAL_ACME_KEY']='acme-synthetic-not-a-credential'
sys.argv=[str(ROOT/'plates-openhands/experiments/openhands/sdk-trial.py'),'--sdk',str(ROOT/'upstream-sdk'),'--config',str(OUT/'config.json'),'--runtime',str(OUT/'runtime')]
try:
 runpy.run_path(sys.argv[0],run_name='__main__')
finally:
 (OUT/'transport-observations.json').write_text(json.dumps({'mockHTTPCalls':calls,'records':records},indent=2)+'\n')
