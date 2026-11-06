"""Source contract probes; NOT a running Agent Server or installed SDK test.
Usage: python3 experiments/openhands/probe-upstream.py SDK_CHECKOUT AUTOMATION_CHECKOUT
Uses stdlib only. Verifies all pinned bytes, then executes the upstream FIFO lock
module and the exact local-user function AST with an inert data constructor.
No network, package installation, provider credentials, or upstream entrypoints.
"""
import ast
import hashlib
import importlib.util
import json
import pathlib
import sys
import types
import uuid

lock = json.loads(pathlib.Path(__file__).with_name('upstream-lock.json').read_text())
roots = {'sdk': pathlib.Path(sys.argv[1]), 'automation': pathlib.Path(sys.argv[2])}
verified = 0
for name, component in lock['components'].items():
    for path, expected in component['files'].items():
        actual = hashlib.sha256((roots[name] / path).read_bytes()).hexdigest()
        assert actual == expected, f'pinned source mismatch: {name}/{path}'
        verified += 1

def parse(component, path):
    return ast.parse((roots[component] / path).read_text())

def class_node(tree, name):
    return next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == name)

def field(node, name):
    return next(n.value for n in node.body if isinstance(n, ast.AnnAssign) and getattr(n.target, 'id', None) == name)

request = parse('sdk', 'openhands-sdk/openhands/sdk/conversation/request.py')
config = class_node(request, 'ConversationConfig')
assert isinstance(field(config, 'workspace').args[0], ast.Constant) and field(config, 'workspace').args[0].value is Ellipsis
assert field(config, 'conversation_id') is not None
assert field(config, 'initial_message') is not None
start = class_node(request, 'StartConversationRequest')
assert field(start, 'agent_profile_id') is not None
message = class_node(parse('sdk', 'openhands-sdk/openhands/sdk/conversation/message_request.py'), 'SendMessageRequest')
assert {n.target.id for n in message.body if isinstance(n, ast.AnnAssign)} == {'role', 'content', 'run'}, 'revisit message idempotency'
policy = class_node(parse('sdk', 'openhands-sdk/openhands/sdk/security/confirmation_policy.py'), 'AlwaysConfirm')
method = next(n for n in policy.body if isinstance(n, ast.FunctionDef) and n.name == 'should_confirm')
assert isinstance(method.body[-1], ast.Return) and method.body[-1].value.value is True

# Actual dependency-free SDK component loaded directly, bypassing package imports.
path = roots['sdk'] / 'openhands-sdk/openhands/sdk/conversation/fifo_lock.py'
spec = importlib.util.spec_from_file_location('acme_upstream_fifo', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
mutex = module.FIFOLock()
assert mutex.acquire() and mutex.acquire()
assert mutex.release_all() == 2 and not mutex.locked()
mutex.reacquire(2)
mutex.release()
assert mutex.locked()
mutex.release()
assert not mutex.locked()

# Exact upstream function body, inert return constructor. Not API authentication.
auth = parse('automation', 'openhands/automation/auth.py')
local_user = next(n for n in auth.body if isinstance(n, ast.FunctionDef) and n.name == '_get_local_user')
scope = {'uuid': uuid, 'AuthenticatedUser': types.SimpleNamespace, 'AuthMethod': types.SimpleNamespace(LOCAL_API_KEY='local_api_key')}
exec(compile(ast.Module(body=[local_user], type_ignores=[]), '<pinned-local-user>', 'exec'), scope)
a = scope['_get_local_user'](); b = scope['_get_local_user']()
assert a.user_id == b.user_id == uuid.uuid5(uuid.NAMESPACE_DNS, 'openhands-local-user')
assert a.role == 'admin' and 'manage_automations' in a.permissions
print(json.dumps({'pinnedFiles': verified, 'sourceContracts': ['required-workspace', 'caller-conversation-id', 'no-message-idempotency-field', 'AlwaysConfirm'], 'nativeComponent': 'FIFO reentrancy/release/reacquire passed', 'extractedFunction': 'local shared key maps to one deterministic admin identity', 'fullServerExecuted': False, 'modelCalls': 0}, indent=2))
