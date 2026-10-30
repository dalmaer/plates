# Gas City local evaluation

This is an opt-in experiment, outside the production CLI and web route graph.
It starts no scheduler and contains no provider credentials. Run from repository root:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/gas-city-evaluation.test.mjs
node experiments/gas-city/check-upstream.mjs /absolute/path/to/gascity --json
```

The first command uses two synthetic Acme projects, two synthetic accounts,
a transactional SQLite journal, in-process provider failures and one actual
127.0.0.1 HTTP fixture. It does **not** start Gas City or execute an LLM.
The second checks all pinned contract hashes and runs unchanged upstream Go
idempotency-cache code/tests with an additional process-restart negative control.
It downloads nothing; Go 1.27.3 is the inspected local toolchain.

`client.mjs` implements the inspected city-scoped create, exact-session read,
event snapshot, external-message registration/binding/inbound/transcript and kill
requests. `events()` is a snapshot, not a resumable stream. `bridge.mjs` exposes
a local evaluator API and a read-only Mission Control view model. `store.mjs`
uses synchronous SQLite transactions to persist intent before dispatch. It is
experimental storage, not a migration of Plates' production stores.

The caller must supply `authorize` as a synchronous trusted server function;
never derive it from issue/chat text. `observeCreate`, `complete`, `terminated`
and `usage` require trusted attestation authority. A string naming evidence is
not a runtime verifier: the tests inject that boundary. `callbackUrl` is trusted
server configuration, shared across the experiment, never chat input. There is
no callback receiver or outbound reply delivery implementation yet.

An uncertain POST is never automatically retried. Unknown launch identity keeps
the project lane occupied; manual reconciliation is required. Stop intent is
preserved before the session is known; after attaching its original session,
call `stop` again to issue the one retained kill attempt. A kill acknowledgment,
closed session read, worker timeout or absent worker is not termination proof.
Execution lane release requires a trusted matching session/fence attestation;
capacity reservations remain held until a future reconciliation implementation.
This intentionally favors stopping over unsafe automatic recovery.

Message acknowledgment means **routed-accepted**, not agent delivery. Duplicate
provider IDs retain their original receipt. Conflicting human revisions are
visible and never automatically resolved. Identity and text are separate; text
is passed as data, never interpreted as policy or an effect command.

Learning and usage are local evaluation records. Lesson promotion requires the
injected reviewer permission on both source and destinations; rollback retains
provenance. Usage totals remain unknown because no native completeness receipt
or production ledger import exists. Neither is a replacement for Plates' reviewed
learning or full lifecycle accounting.

See [the dated evaluation](../../docs/research/2026-10-30-gas-city-experiment.md)
for findings, commands, limitations and adoption criteria.
