# OpenHands local dependency plan and completed component trial

Updated 2026-10-30. This is part of the already authorized isolated test branch.
Routine local installation of named, reputable dependencies into disposable
workspace directories does not require a new user authorization. Tool-level
network/filesystem sandbox approval may still be required and is distinct from
permission to use accounts, spend money or change live projects.

## Smallest native component trial — completed

The real upstream `ConversationLease` implementation was executed unchanged,
with its real `filelock` dependency. Only the SDK logging import was replaced
with Python standard-library logging to avoid bootstrapping the full SDK.
This tests native lease mechanics, not Agent Server, HTTP authentication,
conversation event recovery, model execution or sandbox termination.

| Input | Exact version/source | Dependency/license |
| --- | --- | --- |
| OpenHands source | `OpenHands/software-agent-sdk@c048a1eb82353b0586f3ce600708394a68ebb246`, declared SDK/Agent Server 1.59.0 | MIT |
| Executed module | `openhands-agent-server/openhands/agent_server/conversation_lease.py`; SHA-256 `df62403589068dee7d1a13a5cb8ea6fed9b41d13fc212aac14d48ed2783fcb43` | Complete original module, not a reimplementation |
| Lock package | `filelock==3.20.3`; official PyPI pure-Python wheel | Unlicense; wheel metadata reports no dependencies |
| Wheel | [Official wheel](https://files.pythonhosted.org/packages/b5/36/7fb70f04bf00bc646cd5bb45aa9eddb15e19437a28b8fb2b4a5249fac770/filelock-3.20.3-py3-none-any.whl) | SHA-256 `4b0dda527ee31078689fc205ec4f1c1bf7d56cf88b6dc9426c4f230e46c2dce1` |
| Source lock | SDK `uv.lock`, SHA-256 `87ff323da08fe4dc21def00bc9ddeb7a04cd6003ef3d43c985f50445acab2ac3` | Supplies exact filelock wheel/hash |
| Interpreter | Existing Homebrew CPython 3.15.2 | No Python download or global installation; upstream component requires >=3.12 |

Reproduce from this worktree; all writable installation/cache paths are under the
allocated task directory. The SDK checkout is the separate source checkout
already used for contract inspection.

```sh
uv --no-config --cache-dir /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/uv-cache venv --python /opt/homebrew/bin/python3 --no-python-downloads /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-lease-env
uv --no-config --cache-dir /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/uv-cache pip install --python /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-lease-env/bin/python --no-deps --only-binary :all: --require-hashes --index-url https://pypi.org/simple -r experiments/openhands/requirements-lease.txt
env -i PATH=/usr/bin:/bin /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-lease-env/bin/python -I experiments/openhands/probe-native-lease.py ../upstream-sdk
```

[Requirements](../../experiments/openhands/requirements-lease.txt) and
[native probe](../../experiments/openhands/probe-native-lease.py) are committed.
The virtualenv and cache are outside Git. No global setting, credential, daemon,
privileged runtime, model endpoint, browser or project checkout is installed or
used. Wheel-only installation avoids source build scripts. Installation network
access was used only for the hash-checked public package; the probe itself has
an empty inherited environment, Python isolated mode, and no network code.

The probe uses temporary Acme state, real filesystem locks and one short-lived
Python `pass` subprocess to establish a known dead PID. Temporary state is removed
by the probe. The environment/cache can be removed locally when the experiment is
finished; no external cleanup or grant revocation is needed.

Seven behavior checks passed:

1. Claim/renew persists the original generation.
2. A live owner blocks a second owner.
3. Expired takeover fences stale renew and guarded writes.
4. Stale release preserves the current owner.
5. Current-owner release removes the lease.
6. A confirmed dead same-host PID permits takeover before nominal expiry.
7. Corrupt lease bytes are treated as stale and generation resets to one.

The seventh is a **hazard observation**, not a safety acceptance pass. Native
lease generation alone cannot preserve Plates' restore/effect authority. None
of these observations proves all subprocesses or external effects have ended.

## Next no-cost server test — prepared, not executed

A larger local test remains within the user's test-branch authorization if it
uses only synthetic data, local mocked inference and isolated directories. It
does not become a paid/live trial merely because dependencies are installed.
Before execution, inspect the resolved package inventory and tests' startup paths;
that review is engineering work, not an invented approval gate.

Use the **same exact SDK Git commit and uv.lock**, with the selected workspace
packages `openhands-sdk`, `openhands-agent-server`, `openhands-tools` and
`openhands-workspace` at declared version **1.59.0**. Use a separate virtualenv and
cache; use frozen resolution, never latest. The complete transitive resolution
and wheel hashes come from that lock, rather than a second hand-maintained list.
Important locked packages include:

| Package | Locked version |
| --- | --- |
| filelock | 3.20.3 |
| pydantic / pydantic-core | 2.13.5 / 2.46.5 |
| FastAPI | 0.136.3 |
| httpx | 0.28.1 |
| uvicorn | 0.54.0 |
| pytest / pluggy | 9.0.3 / 1.6.0 |

The full lock also contains LiteLLM, MCP, telemetry, terminal and browser-related
packages. The minimal lease environment does **not** install these. Do not install
browser binaries, Docker images, Canvas or Automation for a conversation API test.
Automation remains source-pinned at
`OpenHands/automation@c1ff860fddd65e1de7c664069bede97211d5712f` (1.26.1), not running.

Run only selected in-process Agent Server tests using its dependency overrides
and mocked LLM, followed by a bounded loopback HTTP smoke test. A fresh request
should use an inline synthetic agent with no tools/plugins/MCP/hooks/secrets,
`autotitle:false`, `AlwaysConfirm`, no initial message, and explicit disposable
workspaces. This avoids loading any existing profile. Add a mock model endpoint
only for execution tests; reject every non-loopback network attempt in the test
harness. That rejection is a test assertion, not a production sandbox claim.

Set `OH_PERSISTENCE_DIR` **before SDK import** to an absolute private trial path;
the pinned `get_user_persistence_dir` supports it for profile/cache state. Supply
explicit `OH_CONVERSATIONS_PATH`, `OH_WORKSPACE_PATH`,
`OH_CONVERSATION_WORKTREE_ROOT` and `OH_BASH_EVENTS_DIR`; start with no inherited
credentials, SDK/provider environment or live webhooks. Leave memory, telemetry,
VS Code, browser and automation integrations off. Use a throwaway local session
key generated for the fixture, not an account credential. Binding is restricted
to `127.0.0.1`; no public listener or global service registration.

Validate exact create/request schema, duplicate UUID behavior, message 429/lost
acknowledgment, restart from persisted events, stale lease owner, and interrupt
semantics. Preserve unknown effects and stop status. Treat real conversation
startup/IPC as separate bounded phases in tests, and make any provider call a
hard test failure. Restore/malformed-state behavior needs negative controls.

This plan is not yet an executed dependency installation or Agent Server test.
It may reveal additional import-time dependencies or platform requirements;
resolve those locally from the pinned lock before claiming compatibility.

## Genuine new authority requirements

Explicit approval is still required for personal/provider credentials or grants,
paid model calls, access to real projects or private remote data, external
GitHub/chat writes, publishing/deployment, enabling routines, Switchboard cutover,
privileged host/container services, or changing system/global configuration.
A synthetic local session key, a disposable virtualenv, public pinned packages
and local fixture processes need none of those powers. No new permission block
remains for the completed one-dependency component trial.
