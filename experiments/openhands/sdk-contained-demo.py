#!/usr/bin/env python3
"""Scripted native SDK -> fixed host -> contained bounded file tool demonstration."""
from __future__ import annotations
import argparse
import contextlib
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from typing import ClassVar

REVISION = 'c048a1eb82353b0586f3ce600708394a68ebb246'
CONTENT = 'export const synthetic = 1;\n'
ACTION = {'operation': 'write', 'path': 'lib/acme.mjs', 'content': CONTENT, 'expectedSha256': None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['sdk', 'workspace', 'node', 'host']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    paths = {}
    for name in ['sdk', 'workspace', 'node', 'host']:
        supplied = getattr(args, name)
        if not supplied.is_absolute() or supplied.is_symlink():
            raise ValueError('trusted_absolute_regular_path_required:' + name)
        paths[name] = supplied.resolve(strict=True)
    workspace, source = paths['workspace'], paths['sdk']
    if sorted(p.name for p in workspace.iterdir()) != ['lib'] or (workspace / 'lib').is_symlink() or not (workspace / 'lib').is_dir() or list((workspace / 'lib').iterdir()):
        raise ValueError('new_synthetic_workspace_with_only_empty_lib_required')
    git = source / '.git'
    head = (git / 'HEAD').read_text().strip()
    if head.startswith('ref: '):
        ref = head[5:]
        head = (git / ref).read_text().strip() if (git / ref).exists() else next(line.split()[0] for line in (git / 'packed-refs').read_text().splitlines() if line.endswith(' ' + ref))
    if head != REVISION:
        raise ValueError('pinned_sdk_revision_required')
    pins = json.loads(Path(__file__).with_name('upstream-lock.json').read_text())['components']['sdk']['files']
    for name, expected in pins.items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise ValueError('sdk_pinned_file_changed:' + name)
    runtime = workspace.parent / ('.sdk-contained-' + str(uuid.uuid4()))
    runtime.mkdir(mode=0o700)
    os.environ.clear()
    os.environ.update({'OH_PERSISTENCE_DIR': str(runtime), 'OPENHANDS_SUPPRESS_BANNER': '1', 'LITELLM_LOCAL_MODEL_COST_MAP': 'True', 'DO_NOT_TRACK': '1', 'PYTHONDONTWRITEBYTECODE': '1'})
    sys.dont_write_bytecode = True
    command = [str(paths['node']), str(paths['host']), str(workspace)]
    receipt = {'schema': 1, 'kind': 'openhands-native-contained-file-demo', 'sdkRevision': REVISION, 'providerCalls': 0,
        'model': {'synthetic': True, 'calls': 0, 'tokens': 0}, 'events': [], 'hostCalls': [], 'blockedEvents': [],
        'confirmation': {'authority': 'trusted-fixture-control-only', 'waitingBeforeApproval': False, 'outputExistedBeforeApproval': False, 'approved': False},
        'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    allowed_launches = 0
    def audit(event, values):
        nonlocal allowed_launches
        if event == 'subprocess.Popen':
            if values[0] != command[0] or list(values[1]) != command or not receipt['confirmation']['approved'] or allowed_launches != 0:
                receipt['blockedEvents'].append(event)
                raise PermissionError('only_exact_trusted_host_command_allowed')
            allowed_launches += 1
        elif event in {'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'socket.gethostbyname', 'socket.gethostbyaddr', 'os.system', 'os.posix_spawn', 'os.exec', 'os.fork', 'os.forkpty'}:
            receipt['blockedEvents'].append(event)
            raise PermissionError('demo_denied:' + event)
    sys.addaudithook(audit)
    sys.path.insert(0, str(source / 'openhands-sdk'))
    from openhands.sdk import LLM, Agent, Conversation
    from openhands.sdk.llm import Message, MessageToolCall, TextContent
    from openhands.sdk.llm.llm_response import LLMResponse
    from openhands.sdk.llm.utils.metrics import MetricsSnapshot, TokenUsage
    from openhands.sdk.security.confirmation_policy import AlwaysConfirm
    from openhands.sdk.tool import Action, Observation, Tool, ToolDefinition, ToolExecutor, register_tool
    from litellm.types.utils import ModelResponse

    class FileAction(Action):
        """Only the bounded JSON file request; no command, root or actor fields."""
        operation: str
        path: str
        content: str
        # Native SDK drops null-valued arguments before Action validation.
        # This fixed create-only demo preserves null explicitly at the host seam.
        expectedSha256: str | None = None

    class FileObservation(Observation):
        result: str
        @property
        def to_llm_content(self):
            return [TextContent(text=self.result)]

    class FileExecutor(ToolExecutor[FileAction, FileObservation]):
        def __call__(self, action, conversation=None):
            payload = {key: getattr(action, key) for key in ACTION}
            if payload != ACTION or receipt['hostCalls'] or not receipt['confirmation']['approved']:
                raise ValueError('demo_single_exact_action_required')
            result = subprocess.run(command, input=json.dumps(payload), text=True, capture_output=True, timeout=30,
                cwd=str(workspace), env={'PATH': '/usr/bin:/bin', 'TMPDIR': str(runtime)})
            if result.returncode != 0:
                raise RuntimeError('contained_host_failed:' + result.stderr[-2000:])
            host = json.loads(result.stdout)
            body = json.loads(host['body']) if isinstance(host['body'], str) else host['body']
            policy = host.get('policySHA256')
            exit_status = host.get('exit', {})
            if exit_status.get('code') != 0 or exit_status.get('signal') is not None or exit_status.get('timedOut') is not False or not isinstance(policy, str) or len(policy) != 64 or any(c not in '0123456789abcdef' for c in policy) or not body.get('ok') or body.get('sha256') != hashlib.sha256(CONTENT.encode()).hexdigest():
                raise RuntimeError('contained_host_receipt_invalid')
            receipt['hostCalls'].append({'action': payload, 'exit': host['exit'], 'body': body, 'policySHA256': policy})
            return FileObservation(result=json.dumps(body))

    class FileTool(ToolDefinition[FileAction, FileObservation]):
        name: ClassVar[str] = 'acme_contained_file'
        @classmethod
        def create(cls, conv_state=None, **params):
            return [cls(description='Write the one synthetic fixture file through the bounded host capability.', action_type=FileAction, observation_type=FileObservation, executor=FileExecutor())]

    for item in [FileAction, FileObservation, FileExecutor, FileTool]:
        item.__qualname__ = item.__name__
        globals()[item.__name__] = item
    register_tool('acme_contained_file', FileTool)
    def scripted(llm, messages, **kwargs):
        if receipt['model']['calls'] >= 2:
            raise RuntimeError('script_exhausted')
        pending = not receipt['hostCalls']
        text = 'Request the synthetic bounded edit.' if pending else 'Synthetic edit completed.'
        calls = [MessageToolCall(id='acme-contained-1', name='acme_contained_file', arguments=json.dumps(ACTION), origin='completion')] if pending else []
        message = Message(role='assistant', content=[TextContent(text=text)], tool_calls=calls)
        raw_message = {'role': 'assistant', 'content': text}
        if pending:
            raw_message['tool_calls'] = [{'id': 'acme-contained-1', 'type': 'function', 'function': {'name': 'acme_contained_file', 'arguments': json.dumps(ACTION)}}]
        receipt['model']['calls'] += 1
        receipt['model']['tokens'] += 120  # Invented fixture counters, not measured usage.
        raw = ModelResponse(id='acme-script-' + str(receipt['model']['calls']), created=0, model='gpt-4o-mini', choices=[{'index': 0, 'message': raw_message, 'finish_reason': 'tool_calls' if pending else 'stop'}])
        return LLMResponse(message=message, raw_response=raw, metrics=MetricsSnapshot(model_name='scripted-acme', accumulated_cost=0, accumulated_token_usage=TokenUsage(model='scripted-acme', prompt_tokens=100 * receipt['model']['calls'], completion_tokens=20 * receipt['model']['calls'])))
    original = LLM.completion
    LLM.completion = scripted
    conversation = None
    try:
        agent = Agent(llm=LLM(model='gpt-4o-mini', api_key='acme-not-a-real-key', num_retries=0, stream=False), tools=[Tool(name='acme_contained_file')], include_default_tools=[], mcp_config={})
        conversation = Conversation(agent=agent, workspace=str(workspace), persistence_dir=runtime / 'conversations', callbacks=[lambda e: receipt['events'].append(e.model_dump(mode='json'))], visualizer=None, delete_on_close=False, max_iteration_per_run=4, secrets={}, plugins=[])
        conversation.set_confirmation_policy(AlwaysConfirm())
        conversation.send_message(Message(role='user', content=[TextContent(text='Create only the synthetic lib/acme.mjs fixture through the bounded file capability. No network.')]))
        conversation.run()
        output = workspace / 'lib/acme.mjs'
        if conversation.state.execution_status.value != 'waiting_for_confirmation' or output.exists() or receipt['hostCalls'] or allowed_launches:
            raise RuntimeError('native_wait_before_effect_not_observed')
        receipt['confirmation']['waitingBeforeApproval'] = True
        receipt['confirmation']['approved'] = True  # Trusted fixture control, never model text.
        conversation.run()
        if conversation.state.execution_status.value != 'finished' or len(receipt['hostCalls']) != 1 or output.read_text() != CONTENT:
            raise RuntimeError('native_contained_effect_not_completed')
        receipt.update({'status': 'finished', 'pass': True, 'effectCount': 1, 'policySHA256': receipt['hostCalls'][0]['policySHA256'], 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    finally:
        LLM.completion = original
        if conversation is not None:
            conversation.close()
    return receipt


if __name__ == '__main__':
    with contextlib.redirect_stdout(sys.stderr):
        result = main()
    print(json.dumps(result))
