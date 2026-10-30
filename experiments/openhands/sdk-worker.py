#!/usr/bin/env python3
"""Bounded native SDK experiment. Only LLM.completion is replaced with a script.

The optional --approval-token is a fixture host signal, NOT authentication.
No token: persist WAITING_FOR_CONFIRMATION without editing output.json.
Exact token: resume the real SDK pending action, perform one bounded effect, test.
A retained effect intent is never automatically replayed after uncertainty.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

SDK_REVISION = "c048a1eb82353b0586f3ce600708394a68ebb246"
APPROVAL_TOKEN = "acme-approve-bounded-edit"
HUMAN_MESSAGE = "Trim whitespace only when the acceptance contract permits; no network."
COORDINATOR_MESSAGE = "Implement the greeting acceptance contract in this synthetic repository."


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic_json(path, data):
    temporary = path.with_name(path.name + ".next")
    if temporary.is_symlink() or path.is_symlink():
        raise ValueError("symlink_receipt_refused")
    with open(temporary, "x", encoding="utf-8") as stream:
        json.dump(data, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def pinned_sdk(source):
    git = source / ".git"
    if not git.is_dir():
        raise ValueError("sdk_checkout_git_directory_required")
    head = (git / "HEAD").read_text().strip()
    if head.startswith("ref: "):
        ref = head.removeprefix("ref: ")
        ref_path = git / ref
        if ref_path.is_file():
            head = ref_path.read_text().strip()
        else:
            packed = (git / "packed-refs").read_text().splitlines()
            head = next(line.split(" ")[0] for line in packed if line.endswith(" " + ref))
    if head != SDK_REVISION:
        raise ValueError("sdk_revision_mismatch")
    manifest = json.loads(Path(__file__).with_name("upstream-lock.json").read_text())
    for name, expected in manifest["components"]["sdk"]["files"].items():
        if sha((source / name).read_bytes()) != expected:
            raise ValueError("sdk_pinned_source_changed:" + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--strategy", choices=["raw", "normalize"], required=True)
    parser.add_argument("--approval-token")
    parser.add_argument("--messages", type=Path)
    args = parser.parse_args()
    if args.approval_token not in (None, APPROVAL_TOKEN):
        raise ValueError("invalid_fixture_approval")
    source = args.sdk.resolve(strict=True)
    workspace = args.workspace.resolve(strict=True)
    if not workspace.is_dir() or args.workspace.is_symlink():
        raise ValueError("regular_workspace_required")
    if args.receipt.is_symlink():
        raise ValueError("symlink_receipt_refused")
    receipt_path = args.receipt.parent.resolve(strict=True) / args.receipt.name
    input_path, output_path = workspace / "input.json", workspace / "output.json"
    if input_path.is_symlink() or output_path.is_symlink() or not input_path.is_file():
        raise ValueError("regular_synthetic_input_required")
    if receipt_path in (input_path, output_path):
        raise ValueError("receipt_must_not_replace_project_files")
    input_bytes = input_path.read_bytes()
    if len(input_bytes) > 16384:
        raise ValueError("synthetic_input_too_large")
    supplied = json.loads(input_bytes)
    if not isinstance(supplied, dict) or set(supplied) - {"name", "preserveWhitespace"} or not isinstance(supplied.get("name"), str) or len(supplied["name"]) > 1000 or not isinstance(supplied.get("preserveWhitespace", False), bool):
        raise ValueError("invalid_synthetic_input")
    messages = [{"role": "user", "text": COORDINATOR_MESSAGE}, {"role": "user", "text": HUMAN_MESSAGE}]
    if args.messages is not None:
        if args.messages.is_symlink() or args.messages.resolve(strict=True) != workspace / "messages.json":
            raise ValueError("messages_must_be_workspace_fixture")
        message_bytes = args.messages.read_bytes()
        if len(message_bytes) > 20000:
            raise ValueError("messages_too_large")
        messages = json.loads(message_bytes)
        if not isinstance(messages, list) or not 1 <= len(messages) <= 8 or any(not isinstance(m, dict) or set(m) != {"role", "text"} or m["role"] != "user" or not isinstance(m["text"], str) or len(m["text"]) > 8000 for m in messages):
            raise ValueError("messages_are_unprivileged_user_text_only")
    pinned_sdk(source)
    binding = {"workspace": str(workspace), "strategy": args.strategy, "inputSha256": sha(input_bytes), "workerSha256": sha(Path(__file__).read_bytes()), "messagesSha256": sha(json.dumps(messages, sort_keys=True).encode())}
    effect_path = receipt_path.with_name(receipt_path.name + ".effect.json")
    lock_path = receipt_path.with_name(receipt_path.name + ".lock")
    if effect_path.is_symlink() or lock_path.is_symlink():
        raise ValueError("symlink_state_refused")
    with open(lock_path, "a", encoding="utf-8") as process_lock:
        fcntl.flock(process_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            if str(uuid.UUID(receipt["operationId"])) != receipt["operationId"]:
                raise ValueError("invalid_original_operation")
            if receipt.get("binding") != binding or receipt.get("sdkRevision") != SDK_REVISION:
                raise ValueError("original_receipt_binding_mismatch")
            if receipt["status"] == "completed":
                effect = json.loads(effect_path.read_text())
                if effect.get("state") != "applied" or effect.get("binding") != binding or not output_path.is_file() or sha(output_path.read_bytes()) != effect.get("outputSha256"):
                    raise ValueError("completed_effect_evidence_changed")
                print(json.dumps({**receipt, "recovered": True, "invocationEffectExecutions": 0}))
                return
            if receipt["status"] == "awaiting-approval" and args.approval_token is None:
                print(json.dumps({**receipt, "recovered": True, "invocationEffectExecutions": 0}))
                return
            if receipt["status"] != "awaiting-approval" or effect_path.exists():
                raise ValueError("uncertain_original_operation_requires_reconciliation")
        else:
            if output_path.exists() or effect_path.exists():
                raise ValueError("existing_output_or_effect_without_original_receipt")
            operation = str(uuid.uuid4())
            receipt = {"schema": 1, "backend": "openhands-sdk", "sdkRevision": SDK_REVISION,
                "operationId": operation, "binding": binding, "status": "preparing", "pass": None,
                "effectCount": 0, "invocationEffectExecutions": 0,
                "effect": {"id": operation, "state": "none", "executions": 0},
                "confirmation": {"waitingBeforeApproval": False, "outputExistedBeforeApproval": False, "approved": False, "authority": "fixture-host-token-only"},
                "model": {"kind": "scripted-completion", "calls": 0, "tokens": 0, "inputTokens": 0, "outputTokens": 0, "synthetic": True, "tokensSynthetic": True, "providerCalls": 0},
                "events": [], "scriptedResponses": [], "toolCalls": [], "test": None,
                "startedAt": timestamp(), "finishedAt": None, "blockedSystemEvents": []}
            atomic_json(receipt_path, receipt)
        runtime = receipt_path.parent / (".sdk-runtime-" + receipt["operationId"])
        runtime.mkdir(mode=0o700, exist_ok=True)
        if runtime.is_symlink():
            raise ValueError("symlink_runtime_refused")
        # Process-only configuration, set before importing any SDK dependency.
        # No credentials are inherited or copied into the SDK environment.
        os.environ.clear()
        os.environ.update({"OH_PERSISTENCE_DIR": str(runtime), "OPENHANDS_SUPPRESS_BANNER": "1",
            "LITELLM_LOCAL_MODEL_COST_MAP": "True", "DO_NOT_TRACK": "1", "PYTHONDONTWRITEBYTECODE": "1"})
        sys.dont_write_bytecode = True
        blocked = receipt["blockedSystemEvents"]
        def audit(event, values):
            if event in {"socket.connect", "socket.bind", "socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyaddr", "subprocess.Popen", "os.system", "os.posix_spawn", "os.exec", "os.fork", "os.forkpty"}:
                blocked.append({"event": event, "at": timestamp()})
                raise PermissionError("bounded_sdk_worker_denied:" + event)
        sys.addaudithook(audit)
        sys.path.insert(0, str(source / "openhands-sdk"))
        # These are actual pinned upstream types. Only completion is mocked below.
        from openhands.sdk import LLM, Agent, Conversation
        from openhands.sdk.llm import Message, MessageToolCall, TextContent
        from openhands.sdk.llm.llm_response import LLMResponse
        from openhands.sdk.llm.utils.metrics import MetricsSnapshot, TokenUsage
        from openhands.sdk.security.confirmation_policy import AlwaysConfirm
        from openhands.sdk.tool import Action, Observation, Tool, ToolDefinition, ToolExecutor, register_tool
        from litellm.types.utils import ModelResponse
        from typing import ClassVar

        class BoundedEditAction(Action):
            """No model-supplied path, shell command, strategy or identity."""

        class BoundedEditObservation(Observation):
            result: str
            @property
            def to_llm_content(self):
                return [TextContent(text=self.result)]

        class BoundedEditExecutor(ToolExecutor[BoundedEditAction, BoundedEditObservation]):
            def __call__(self, action, conversation=None):
                if not receipt["confirmation"]["approved"]:
                    raise PermissionError("fixture_host_approval_required")
                if effect_path.exists():
                    raise RuntimeError("effect_already_reserved_no_replay")
                if input_path.is_symlink() or input_path.read_bytes() != input_bytes or output_path.exists() or output_path.is_symlink():
                    raise RuntimeError("synthetic_source_changed")
                intent = {"id": receipt["operationId"], "binding": binding, "state": "intent", "startedAt": timestamp()}
                # Exclusive durable intent is retained through every uncertain exit.
                with open(effect_path, "x", encoding="utf-8") as stream:
                    json.dump(intent, stream); stream.flush(); os.fsync(stream.fileno())
                receipt["effect"] = {"id": receipt["operationId"], "state": "intent", "executions": 0}
                atomic_json(receipt_path, receipt)
                name = supplied["name"].strip() if args.strategy == "normalize" else supplied["name"]
                result = {"greeting": "Hello " + name + "!"}
                with open(output_path, "x", encoding="utf-8") as stream:
                    json.dump(result, stream, sort_keys=True); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
                intent.update({"state": "applied", "outputSha256": sha(output_path.read_bytes()), "finishedAt": timestamp()})
                atomic_json(effect_path, intent)
                receipt["effectCount"] = 1; receipt["invocationEffectExecutions"] = 1
                receipt["effect"] = {"id": receipt["operationId"], "state": "applied", "executions": 1}
                receipt["toolCalls"].append({"name": "acme_bounded_edit", "arguments": {}, "strategy": args.strategy, "path": "output.json", "at": timestamp()})
                return BoundedEditObservation(result="Wrote output.json using the host-selected bounded strategy.")

        class BoundedEditTool(ToolDefinition[BoundedEditAction, BoundedEditObservation]):
            name: ClassVar[str] = "acme_bounded_edit"
            @classmethod
            def create(cls, conv_state=None, **params):
                return [cls(description="Write exactly the synthetic greeting output with the trusted host strategy. No arguments.", action_type=BoundedEditAction, observation_type=BoundedEditObservation, executor=BoundedEditExecutor())]

        # Delayed imports keep the audit guard ahead of SDK initialization.
        # Expose our tool types at module scope for native persisted-event decoding.
        for tool_type in (BoundedEditAction, BoundedEditObservation, BoundedEditExecutor, BoundedEditTool):
            tool_type.__qualname__ = tool_type.__name__
            globals()[tool_type.__name__] = tool_type
        register_tool("acme_bounded_edit", BoundedEditTool)
        def scripted_completion(llm, messages, **kwargs):
            if receipt["model"]["calls"] >= 2:
                raise RuntimeError("scripted_model_exhausted")
            if effect_path.exists() and json.loads(effect_path.read_text()).get("state") == "applied":
                response = Message(role="assistant", content=[TextContent(text="The bounded edit is complete. Host tests decide whether it is correct.")])
            else:
                response = Message(role="assistant", content=[TextContent(text="Request the single bounded edit; await host approval.")], tool_calls=[MessageToolCall(id="acme-edit-1", name="acme_bounded_edit", arguments="{}", origin="completion")])
            receipt["model"]["calls"] += 1
            # Fixed synthetic counters: these are neither tokenizer output nor a bill.
            receipt["model"]["inputTokens"] += 100; receipt["model"]["outputTokens"] += 20; receipt["model"]["tokens"] += 120
            receipt["scriptedResponses"].append(response.model_dump(mode="json"))
            raw_message = {"role": "assistant", "content": "scripted fixture response"}
            if response.tool_calls:
                raw_message["tool_calls"] = [{"id": "acme-edit-1", "type": "function", "function": {"name": "acme_bounded_edit", "arguments": "{}"}}]
            raw = ModelResponse(id="acme-response-" + str(receipt["model"]["calls"]), created=0, model="gpt-4o-mini", choices=[{"index": 0, "message": raw_message, "finish_reason": "tool_calls" if response.tool_calls else "stop"}])
            return LLMResponse(message=response, raw_response=raw, metrics=MetricsSnapshot(model_name="scripted-acme", accumulated_cost=0, accumulated_token_usage=TokenUsage(model="scripted-acme", prompt_tokens=receipt["model"]["inputTokens"], completion_tokens=receipt["model"]["outputTokens"])))

        def on_event(event):
            payload = event.model_dump(mode="json")
            if not any(existing.get("id") == payload.get("id") for existing in receipt["events"]):
                receipt["events"].append(payload)

        original_completion = LLM.completion
        LLM.completion = scripted_completion
        conversation = None
        try:
            llm = LLM(model="gpt-4o-mini", api_key="acme-not-a-real-key", usage_id="acme-scripted", num_retries=0, stream=False)
            agent = Agent(llm=llm, tools=[Tool(name="acme_bounded_edit")], include_default_tools=[], mcp_config={})
            conversation = Conversation(agent=agent, workspace=str(workspace), conversation_id=uuid.UUID(receipt["operationId"]),
                persistence_dir=runtime / "conversations", callbacks=[on_event], visualizer=None, delete_on_close=False,
                max_iteration_per_run=4, secrets={}, plugins=[])
            conversation.set_confirmation_policy(AlwaysConfirm())
            if receipt["status"] == "preparing":
                for supplied_message in messages:
                    conversation.send_message(Message(role="user", content=[TextContent(text=supplied_message["text"])]))
                conversation.run()
            status = conversation.state.execution_status.value
            if status != "waiting_for_confirmation" or output_path.exists() or effect_path.exists():
                raise RuntimeError("native_confirmation_boundary_not_observed:" + status)
            receipt["confirmation"].update({"waitingBeforeApproval": True, "outputExistedBeforeApproval": False})
            receipt["status"] = "awaiting-approval"
            atomic_json(receipt_path, receipt)
            if args.approval_token is None:
                print(json.dumps(receipt)); return
            receipt["confirmation"]["approved"] = True
            receipt["status"] = "executing"
            atomic_json(receipt_path, receipt)
            # Upstream run() explicitly treats this second call as host confirmation.
            conversation.run()
            if conversation.state.execution_status.value != "finished" or receipt["effectCount"] != 1:
                raise RuntimeError("native_sdk_did_not_finish_one_effect")
            actual = json.loads(output_path.read_text())
            expected_name = supplied["name"] if supplied.get("preserveWhitespace", False) else supplied["name"].strip()
            expected = {"greeting": "Hello " + expected_name + "!"}
            receipt["test"] = {"name": "synthetic-greeting-predicate", "passed": actual == expected, "expected": expected, "actual": actual, "preserveWhitespace": supplied.get("preserveWhitespace", False)}
            receipt["pass"] = receipt["test"]["passed"]
            receipt["status"] = "completed"; receipt["finishedAt"] = timestamp()
            atomic_json(receipt_path, receipt)
            print(json.dumps(receipt))
        except Exception:
            receipt["status"] = "uncertain"; receipt["finishedAt"] = timestamp()
            atomic_json(receipt_path, receipt)
            raise
        finally:
            if conversation is not None:
                conversation.close()
            LLM.completion = original_completion


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": type(error).__name__, "reason": str(error)}), file=sys.stderr)
        raise SystemExit(2)
