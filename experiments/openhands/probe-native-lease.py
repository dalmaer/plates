"""Run the pinned upstream lease implementation with real filelock, no SDK runtime.
Usage: isolated-python -I experiments/openhands/probe-native-lease.py SDK_CHECKOUT
Only OpenHands' logging import is supplied by a stdlib logging shim. The complete
lease module and real file locks execute unchanged. This is not Agent Server.
"""
import hashlib
import importlib.metadata
import importlib.util
import json
import logging
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import types

sys.dont_write_bytecode = True
assert importlib.metadata.version('filelock') == '3.20.3'
root = pathlib.Path(sys.argv[1]).resolve()
relative = 'openhands-agent-server/openhands/agent_server/conversation_lease.py'
expected = json.loads(pathlib.Path(__file__).with_name('upstream-lock.json').read_text())['components']['sdk']['files'][relative]
source = root / relative
assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
package = types.ModuleType('openhands'); package.__path__ = []
sdk = types.ModuleType('openhands.sdk'); sdk.get_logger = logging.getLogger
sys.modules['openhands'] = package; sys.modules['openhands.sdk'] = sdk
spec = importlib.util.spec_from_file_location('acme_native_lease', source)
module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module
spec.loader.exec_module(module)
passed = []

def refused(error, action):
    try:
        action()
    except error:
        return
    raise AssertionError(f'expected {error.__name__}')

with tempfile.TemporaryDirectory(prefix='acme-openhands-native-lease-') as directory:
    path = pathlib.Path(directory)
    primary = module.ConversationLease(conversation_dir=path, owner_instance_id='acme-primary')
    secondary = module.ConversationLease(conversation_dir=path, owner_instance_id='acme-secondary')
    first = primary.claim()
    lease_file = path / module.LEASE_FILE_NAME
    assert first.generation == 1 and not first.takeover and lease_file.is_file()
    primary.renew(first.generation)
    assert primary.claim().generation == 1
    passed.append('claim-renew-persist-original-generation')
    refused(module.ConversationLeaseHeldError, secondary.claim)
    passed.append('live-owner-blocks-second-owner')
    payload = json.loads(lease_file.read_text()); payload['expires_at'] = 0
    lease_file.write_text(json.dumps(payload))
    next_claim = secondary.claim()
    assert next_claim.generation == 2 and next_claim.takeover
    refused(module.ConversationOwnershipLostError, lambda: primary.renew(first.generation))
    def stale_write():
        with primary.guarded_write(first.generation):
            raise AssertionError('stale owner entered guarded write')
    refused(module.ConversationOwnershipLostError, stale_write)
    passed.append('expired-takeover-fences-stale-renew-and-write')
    primary.release(first.generation)
    assert json.loads(lease_file.read_text())['owner_instance_id'] == 'acme-secondary'
    secondary.release(next_claim.generation)
    assert not lease_file.exists()
    passed.append('stale-release-preserves-current-owner')
    passed.append('current-release-removes-lease')
    first = primary.claim()
    child = subprocess.Popen([sys.executable, '-I', '-c', 'pass'], env={}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    child.wait(timeout=5)
    payload = json.loads(lease_file.read_text())
    payload.update(owner_pid=child.pid, owner_host=socket.gethostname(), expires_at=time.time()+1000)
    lease_file.write_text(json.dumps(payload))
    dead_claim = secondary.claim()
    assert dead_claim.takeover and dead_claim.generation == first.generation+1
    passed.append('confirmed-dead-local-pid-allows-takeover-before-expiry')
    lease_file.write_text('{broken')
    reset = primary.claim()
    assert reset.generation == 1 and not reset.takeover
    passed.append('corrupt-lease-observed-as-stale-and-generation-reset')

print(json.dumps({'component': 'unchanged upstream ConversationLease', 'sourceSha256': expected,
                  'dependency': 'filelock==3.20.3', 'checksPassed': passed,
                  'loggingImport': 'stdlib shim; SDK bootstrap not executed',
                  'fullAgentServer': False, 'modelCalls': 0,
                  'qualificationWarning': 'corrupt native lease resets generation; Plates must retain external epoch/effect quarantine'}, indent=2))
