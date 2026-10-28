# Pi context inspector and evidence panel

An opt-in, source-only example for Pi 1.4.0. It adds no Plates command,
practice, runtime dependency, provider configuration or automatic activation.
All displayed Acme data is synthetic. No live model call is needed.

The original standalone experiment remains preserved at commit
`1fb90af128ddee1d5157290554a04faa9578243c`. This example replaces its pinned
vendor copies with imports of Plates' existing evidence and decision readers.

## Run the demo

From the Plates repository root, using the existing Node 24.22.1 or newer:

```sh
cd docs/examples/pi-context
npm run demo
```

Open `output/index.html` manually in a browser. The self-contained page makes
no network requests. `output/demo.json` contains the same synthetic snapshots.
Compare mixed results, changed expected commit, and missing evidence; filter
checks by status and expand instruction provenance and captured text.
Generated output is ignored by Git and is never part of the installed CLI.

## Run focused verification

From the repository root:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/pi-context-example.test.mjs
npm run check:focused -- tests/pi-context-example.test.mjs
```

The normal repository gate includes the example's tests. Optional validation
against an **already installed** Pi package uses its actual loader, prompt
builder and command context with synthetic instructions and a mock UI:

```sh
cd docs/examples/pi-context
PI_PACKAGE_ROOT=/absolute/path/to/@earendil-works/pi-coding-agent npm run verify:pi
```

This smoke check requires Pi 1.4.0 and creates no persisted session or provider
request. It does not install Pi. Do not add Pi as a Plates dependency.

## Try the command

From this example directory, an isolated manual invocation is:

```sh
PI_CODING_AGENT_DIR="$PWD/.pi-sandbox" pi --offline --no-session --no-extensions --no-mcp --no-skills --no-context-files --no-prompt-templates --no-themes --extension "$PWD/extension.mjs"
```

Run `/plates-inspect` to display the widget and detail viewer, or
`/plates-inspect-clear` to remove it. These slash commands make no model request.
The conservative command above disables context discovery, so zero context
files is the expected observation. A separately authorized normal session can
omit `--no-context-files` to inspect files Pi itself loaded. The extension never
scans disk to infer which instructions were loaded.

An optional absolute canonical directory attaches three existing shadow
evidence files: `expected.json`, `source.json`, and `artifact.json`, each limited
to 1 MiB. For example, `/plates-inspect /absolute/path/to/evidence`.
The generated `output/acme-evidence` directory contains synthetic examples only.
Read errors remain unknown. Commands named in evidence are never executed.
Captured instructions stay in the local viewer; the extension never persists
or sends them. The stock Pi editor displays details and discards returned edits.

## What is known, and what remains unknown

Pi's `ExtensionCommandContext.getSystemPromptOptions().contextFiles` supplies
base construction inputs with paths and contents. `getSystemPrompt()` supplies
the command-time effective prompt. A row says **captured** only when the exact
wrapped file content occurs in that prompt; otherwise its inclusion is unknown.
Paths are API attribution, not authenticated origin. Exact occurrence does not
prove causal insertion. Available skill metadata does not prove its body loaded.
Later hooks, provider serialization, model receipt and obedience are unverified.
Missing APIs produce unknown provenance. This command does not intercept model
requests or imply that a future request will use the captured prompt.

The installed Pi 1.4.0 APIs were checked in `docs/extensions.md`,
`dist/core/extensions/types.d.ts`, `dist/core/agent-session.js`,
`dist/core/system-prompt.js`, and `dist/cli/args.js`.
Official source: [extension API](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/extensions)
and [prompt construction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts).
Those links track upstream main; the optional smoke pins the installed version.

The evidence projection invokes `lib/validation-evidence.mjs` unchanged.
Passed/failed rows describe caller-supplied records that match the independent
expected candidate and source contract; they do not authenticate execution.
Missing records stay unknown. Only an explicitly authored plan can say not-run.
Full commit and tree identities are retained; the expected revision comes from
the supplied expectations, not a fresh read of Git HEAD. Dirty, mismatched,
expired, duplicate, incomplete or altered evidence cannot inherit a pass.
The advisory-only and `reuseAuthorized: false` boundaries remain intact.

The decision panel invokes `scripts/plates/decision-context.mjs` using a synthetic
immutable reader. It preserves source hashes, digest, accepted decisions,
proposals and gaps. Planning authority is separate from Pi-loaded instructions.
No live decision reader, authenticated CI producer, independent expectation
derivation, gate reuse, phase acceptance or deployment is implemented here.

## Scope and validation limits

This is an independent example, not a production integration or practice change.
Existing phase and acceptance records remain unchanged because it makes no claim
to complete them. A future integration needs a separately scoped design for
receipt collection and live source identity before it can imply real evidence.

Behavior and UI interaction logic are covered by automated tests. The DOM test
uses a harness rather than a browser engine. Browser layout and screenshots
remain unverified: the original execution sandbox denied a loopback listener,
and browser policy rejected its local file URL. That denial was not bypassed.
No live provider call, login configuration, network/security setting change,
automatic installation, merge or deployment is part of this example.
