#!/usr/bin/env python3
"""Trusted native SDK worker. All model admission and effects use parent JSON RPC.

No shell, ACP, plugins, MCP, automatic retry, or implicit human approval. The
controller owns identity, durable intents, limits, exact approvals and effects.
API mode is deliberately limited to one explicitly approved OpenAI-compatible
chat endpoint; this file is not authorization to use an account.
"""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sys
import time
import uuid
from typing import ClassVar, Literal
from urllib.parse import urlparse

REVISION = 'c048a1eb82353b0586f3ce600708394a68ebb246'
MAX_RPC = 2 * 1024 * 1024
WIRE = sys.stdout


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('sdk', 'config', 'runtime'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    paths = {}
    for name in ('sdk', 'config', 'runtime'):
        path = getattr(args, name)
        if not path.is_absolute() or path.is_symlink():
            raise ValueError('trusted_absolute_path_required:' + name)
        paths[name] = path.resolve(strict=True)
    source, runtime = paths['sdk'], paths['runtime']
    cfg = json.loads(paths['config'].read_text())
    mode = cfg.get('mode')
    if mode not in ('scripted', 'api'):
        raise ValueError('mode_required')
    workspace = Path(cfg['workspace']).resolve(strict=True)
    if workspace == runtime or workspace in runtime.parents or workspace in paths['config'].parents:
        raise ValueError('private_runtime_and_config_must_be_outside_worker')
    if not isinstance(cfg.get('prompt'), str) or not cfg['prompt'] or len(cfg['prompt'].encode()) > 256 * 1024:
        raise ValueError('bounded_prompt_required')
    ceilings = {'maxRequests': 100, 'maxInputTokens': 128000, 'maxOutputTokens': 16000, 'maxSeconds': 3600, 'requestTimeoutSeconds': 300}
    for key, maximum in ceilings.items():
        if type(cfg.get(key)) is not int or not 1 <= cfg[key] <= maximum:
            raise ValueError('invalid_limit:' + key)
    if cfg['requestTimeoutSeconds'] > cfg['maxSeconds']:
        raise ValueError('request_timeout_exceeds_run')
    if cfg.get('model') is None or not isinstance(cfg['model'], str):
        raise ValueError('model_required')
    if mode == 'api':
        parsed = urlparse(cfg.get('apiBase', ''))
        if cfg.get('liveAuthorized') is not True or not re.fullmatch(r'openai/[a-zA-Z0-9_.:-]+', cfg['model']) or parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('explicit_api_authorization_and_https_chat_route_required')
        key_name = cfg.get('apiKeyEnv', '')
        if not re.fullmatch(r'PLATES_TRIAL_[A-Z0-9_]+', key_name):
            raise ValueError('dedicated_key_environment_required')
        key = os.environ.get(key_name)
        if not key:
            raise ValueError('authorized_api_key_unavailable')
    else:
        key = 'acme-not-a-real-key'
        if not isinstance(cfg.get('script'), list) or not cfg['script']:
            raise ValueError('script_required')
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
            raise ValueError('sdk_source_changed:' + name)
    os.environ.clear()
    os.environ.update({'OH_PERSISTENCE_DIR': str(runtime), 'OPENHANDS_SUPPRESS_BANNER': '1', 'LITELLM_LOCAL_MODEL_COST_MAP': 'True', 'DO_NOT_TRACK': '1', 'PYTHONDONTWRITEBYTECODE': '1'})
    if mode == 'api':
        # Provider exception bodies/headers must not be copied to SDK log sinks.
        # Durable parent RPC retains only error class and unknown-usage state.
        logging.disable(logging.CRITICAL)
    sys.dont_write_bytecode = True
    started = time.monotonic()
    state = {'rpc': 0, 'requests': 0, 'tokens': 0, 'uncertain': False, 'approved': [], 'transport': 0, 'dispatching': False}

    def deadline():
        if time.monotonic() - started >= cfg['maxSeconds']:
            raise TimeoutError('trial_wall_deadline')

    def rpc(kind, **payload):
        deadline()
        state['rpc'] += 1
        request = {'rpcId': state['rpc'], 'kind': kind, **payload}
        encoded = canonical(request)
        if len(encoded.encode()) > MAX_RPC:
            raise ValueError('rpc_request_bound')
        WIRE.write(encoded + '\n'); WIRE.flush()
        # The parent owns a hard process deadline covering this blocking read.
        line = sys.stdin.buffer.readline(MAX_RPC + 1)
        if not line or len(line) > MAX_RPC or not line.endswith(b'\n'):
            raise ValueError('rpc_response_bound_or_eof')
        response = json.loads(line)
        if response.get('rpcId') != state['rpc'] or response.get('ok') is not True:
            raise PermissionError('parent_refused:' + kind)
        deadline()
        return response

    def audit(event, values):
        if event in {'subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec', 'os.fork', 'os.forkpty'}:
            raise PermissionError('worker_process_launch_forbidden')
        if event in {'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'socket.gethostbyname', 'socket.gethostbyaddr'}:
            if mode != 'api' or not state['dispatching'] or event == 'socket.bind':
                raise PermissionError('worker_network_not_admitted')
            if event == 'socket.getaddrinfo' and values[0] != parsed.hostname:
                raise PermissionError('provider_hostname_changed')
    sys.addaudithook(audit)
    sys.path.insert(0, str(source / 'openhands-sdk'))
    from pydantic import ConfigDict
    from openhands.sdk import LLM, Agent, Conversation
    from openhands.sdk.conversation.state import ConversationState
    from openhands.sdk.llm import Message, MessageToolCall, TextContent
    from openhands.sdk.llm.llm_response import LLMResponse
    from openhands.sdk.llm.utils.metrics import MetricsSnapshot, TokenUsage
    from openhands.sdk.security.confirmation_policy import AlwaysConfirm
    from openhands.sdk.tool import Action, Observation, Tool, ToolDefinition, ToolExecutor, register_tool
    from litellm.types.utils import ModelResponse

    class FileAction(Action):
        model_config = ConfigDict(extra='forbid')
        operation: Literal['read', 'list', 'write']
        path: str
        content: str | None = None
        expectedSha256: str | None = None

    def file_payload(action):
        payload = {'operation': action.operation, 'path': action.path}
        if action.operation == 'write':
            if action.content is None:
                raise ValueError('write_content_required')
            payload.update(content=action.content, expectedSha256=action.expectedSha256)
        elif action.content is not None or action.expectedSha256 is not None:
            raise ValueError('read_or_list_has_write_fields')
        return payload

    class FileObservation(Observation):
        result: str
        @property
        def to_llm_content(self):
            return [TextContent(text=self.result)]

    class FileExecutor(ToolExecutor[FileAction, FileObservation]):
        def __call__(self, action, conversation=None):
            payload = file_payload(action)
            fingerprint = digest(payload)
            if not state['approved'] or state['approved'][0]['actionSHA256'] != fingerprint:
                raise PermissionError('exact_pending_action_not_approved')
            approved = state['approved'].pop(0)
            answer = rpc('tool', **approved)
            return FileObservation(result=canonical(answer['result']))

    class FileTool(ToolDefinition[FileAction, FileObservation]):
        name: ClassVar[str] = 'plates_bounded_file'
        @classmethod
        def create(cls, conv_state=None, **params):
            return [cls(description='Read/list repository files or propose bounded content edits. Every action needs exact human approval. No command, root, credentials or authority fields.', action_type=FileAction, observation_type=FileObservation, executor=FileExecutor())]

    for item in (FileAction, FileObservation, FileExecutor, FileTool):
        item.__qualname__ = item.__name__; globals()[item.__name__] = item
    register_tool('plates_bounded_file', FileTool)
    original_completion, original_transport = LLM.completion, LLM._transport_call

    def guarded_transport(llm, **kwargs):
        if mode != 'api' or not state['dispatching'] or state['transport']:
            raise PermissionError('transport_attempt_already_used_or_unadmitted')
        state['transport'] += 1
        # Prevent library-level retry and redirecting a completion to another base.
        from openai import OpenAI
        import httpx
        # An explicit client also disables HTTP redirects and inherited proxy
        # settings; LiteLLM's default OpenAI client follows redirects.
        http = httpx.Client(timeout=cfg['requestTimeoutSeconds'], follow_redirects=False, trust_env=False)
        client = OpenAI(api_key=key, base_url=cfg['apiBase'], max_retries=0, timeout=cfg['requestTimeoutSeconds'], http_client=http)
        kwargs.update(num_retries=0, max_retries=0, api_base=cfg['apiBase'], api_key=key, stream=False, timeout=cfg['requestTimeoutSeconds'], client=client)
        try:
            return original_transport(llm, **kwargs)
        finally:
            client.close()

    def bounded_completion(llm, messages, tools=None, add_security_risk_prediction=False, **kwargs):
        deadline()
        if state['uncertain'] or state['requests'] >= cfg['maxRequests']:
            raise PermissionError('request_budget_exhausted_or_uncertain')
        serialized = {'messages': [m.model_dump(mode='json') for m in messages], 'tools': [t.to_openai_tool(add_security_risk_prediction=add_security_risk_prediction) for t in tools or []]}
        if mode == 'scripted':
            # Offline byte bound deliberately does not claim provider-billed tokens.
            count = len(canonical(serialized).encode()) + 1024 * (len(messages) + len(tools or []) + 1)
            counting = 'scripted-utf8-bytes-plus-framing-upper-bound'
        else:
            count = llm.get_token_count(messages, tools, add_security_risk_prediction)
            counting = 'sdk-model-token-estimate-including-tools'
            if type(count) is not int or count <= 0:
                raise ValueError('tokenizer_unavailable_fail_closed')
        if count > cfg['maxInputTokens']:
            raise PermissionError('input_token_bound')
        index = state['requests'] + 1
        request_hash = digest({'model': cfg['model'], 'messagesAndTools': serialized, 'maxOutputTokens': cfg['maxOutputTokens']})
        rpc('provider-intent', index=index, inputTokens=count, inputCounting=counting, maxOutputTokens=cfg['maxOutputTokens'], requestSHA256=request_hash)
        state['requests'] = index
        state['transport'] = 0
        try:
            if mode == 'scripted':
                if index > len(cfg['script']):
                    raise ValueError('script_exhausted')
                step = cfg['script'][index - 1]
                if step.get('error'):
                    raise RuntimeError('scripted_uncertain_provider_failure')
                text = step.get('text', '')
                calls = []
                raw_message = {'role': 'assistant', 'content': text}
                if 'action' in step:
                    action = step['action']
                    calls = [MessageToolCall(id='plates-script-' + str(index), name='plates_bounded_file', arguments=canonical(action), origin='completion')]
                    raw_message['tool_calls'] = [{'id': calls[0].id, 'type': 'function', 'function': {'name': 'plates_bounded_file', 'arguments': canonical(action)}}]
                # Byte-based response ceiling, not an invented measured token total.
                if len(canonical(raw_message).encode()) > cfg['maxOutputTokens']:
                    raise ValueError('scripted_output_bound')
                raw = ModelResponse(id='plates-script-' + str(index), created=0, model=cfg['model'], choices=[{'index': 0, 'message': raw_message, 'finish_reason': 'tool_calls' if calls else 'stop'}])
                result = LLMResponse(message=Message(role='assistant', content=[TextContent(text=text)], tool_calls=calls), raw_response=raw, metrics=MetricsSnapshot(model_name='scripted-acme', accumulated_cost=0, accumulated_token_usage=TokenUsage(model='scripted-acme', prompt_tokens=0, completion_tokens=0)))
                tokens = None
            else:
                state['dispatching'] = True
                result = original_completion(llm, messages, tools, add_security_risk_prediction, **kwargs)
                usage = getattr(result.raw_response, 'usage', None)
                tokens = getattr(usage, 'total_tokens', None)
                output_tokens = getattr(usage, 'completion_tokens', None)
                if type(output_tokens) is not int or output_tokens < 0:
                    raise ValueError('provider_output_usage_unknown_stop_before_tools')
                if output_tokens > cfg['maxOutputTokens']:
                    raise ValueError('provider_output_bound_exceeded')
                if type(tokens) is not int or tokens < 0:
                    tokens = None
            deadline()
            rpc('provider-result', index=index, tokens=tokens, synthetic=mode == 'scripted', requestSHA256=request_hash)
            return result
        except BaseException as error:
            state['uncertain'] = True
            # Redacted exception class only: provider exception strings can contain keys.
            try:
                rpc('provider-error', index=index, errorClass=type(error).__name__, uncertain=True, requestSHA256=request_hash)
            except BaseException:
                pass
            raise
        finally:
            state['dispatching'] = False

    LLM.completion = bounded_completion
    LLM._transport_call = guarded_transport
    conversation = None
    try:
        # The real key stays only in the dispatch closure/client; conversation
        # persistence must never serialize an account credential.
        llm = LLM(model=cfg['model'], api_key='acme-route-key-not-used', base_url=cfg.get('apiBase') if mode == 'api' else None, num_retries=0, timeout=cfg['requestTimeoutSeconds'], stream=False, max_input_tokens=cfg['maxInputTokens'], max_output_tokens=cfg['maxOutputTokens'], caching_prompt=False, fallback_strategy=None, log_completions=False, api_mode='chat')
        agent = Agent(llm=llm, tools=[Tool(name='plates_bounded_file')], include_default_tools=[], mcp_config={}, condenser=None)
        conversation_id = uuid.UUID(cfg['conversationId']) if cfg.get('conversationId') else None
        conversation = Conversation(agent=agent, workspace=str(workspace), conversation_id=conversation_id, persistence_dir=runtime / 'conversation', visualizer=None, delete_on_close=False, max_iteration_per_run=cfg['maxRequests'], secrets={}, plugins=[])
        conversation.set_confirmation_policy(AlwaysConfirm())
        conversation.send_message(Message(role='user', content=[TextContent(text=cfg['prompt'])]))
        while True:
            deadline()
            conversation.run()
            status = conversation.state.execution_status.value
            if state['uncertain']:
                raise RuntimeError('uncertain_provider_request_stop')
            if status != 'waiting_for_confirmation':
                rpc('finished', status=status, conversationId=str(conversation.id), requestCount=state['requests'], providerCalls=state['requests'] if mode == 'api' else 0)
                return
            pending = ConversationState.get_unmatched_actions(conversation.state.active_branch())
            actions = []
            for event in pending:
                if event.tool_name != 'plates_bounded_file' or event.action is None:
                    raise PermissionError('unexpected_pending_tool')
                payload = file_payload(event.action)
                actions.append({'eventId': str(event.id), 'toolCallId': str(event.tool_call_id), 'actionSHA256': digest(payload), 'action': payload})
            if not actions or state['approved']:
                raise ValueError('pending_action_state_conflict')
            response = rpc('approval-request', actions=actions)
            if response.get('approvedActionSHA256') != [a['actionSHA256'] for a in actions]:
                raise PermissionError('exact_approval_required')
            state['approved'] = actions
    finally:
        LLM.completion, LLM._transport_call = original_completion, original_transport
        if conversation is not None:
            conversation.close()


if __name__ == '__main__':
    try:
        with contextlib.redirect_stdout(sys.stderr):
            main()
    except BaseException as error:
        # No traceback or exception text can expose provider credentials.
        WIRE.write(canonical({'kind': 'fatal', 'errorClass': type(error).__name__}) + '\n'); WIRE.flush()
        sys.exit(1)
