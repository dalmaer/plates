# Public evaluation packet — 1 November 2026

Phase119 preparation component only: no live CLI, provider request, spend,
execution authority or measured agent outcome is established.

The pure packet builder accepts only a branded public view, uses a fixed versioned
instruction template, and delegates wire identity to the provider-owned helper.
The result converter validates UTF-8, strict JSON, existing writable paths,
unchanged modes, replacement bounds and the reconstructed public artifact before
returning the unchanged schema-1 base64 envelope. The original partition remains
responsible for combined public/private reconstruction bounds.

## Focused proof

The initial command passed 42 tests with clean test-ledger hygiene:
`node --import ./tests/helpers/hermetic.mjs --test tests/evaluation-public-packet.test.mjs tests/evaluation-provider.test.mjs tests/evaluation-input-partition.test.mjs`
with repository spec and test-ledger reporters. Log:
`/tmp/phase119-public-packet-focused-01.log`.
A subsequently added shared-README-bytes control passed alone, one test:
`/tmp/phase119-public-packet-shared-bytes-01.log`. This is not a claim that a later
combined 43-test command ran. No production bytes changed between those runs.

Seven isolated causal controls failed their intended assertions: bypassing view
branding, omitting resolved model from packet identity, permissive JSON parsing,
allowing changed modes, expanding writable paths, omitting reconstructed-public
bounds, and repairing malformed UTF-8. The UTF-8 control explicitly removed both
redundant decoding protections. Exact commands, isolated paths and outcomes are
retained in `/tmp/phase119-public-packet-proof.md` and
`/tmp/phase119-public-packet-controls.json`. No initial implementation test failure
occurred in these focused runs.

## Review and limits

Independent contract review clarified that uniquely private canaries must not leak;
reviewed public bytes shared with evaluator support must remain unchanged. No
content filtering was introduced. Independent read-only code review found no
concrete defect; it did not rerun focused tests or causal controls.
The shared fixture extraction preserved existing partition assertions. The newer
canonical repository guard was integrated in e894b5b7 before the final gate; its
reviewed source subsequently merged through PR #310 at 621949e4. The combined
focused preflight and typecheck passed after integration (logs
`/tmp/phase119-packet-focused-preflight.log` and
`/tmp/phase119-packet-typecheck.log`). These are not a full-gate result.

No real provider, Docker, credential read, hosted activation or paid trial occurred.
Private bindings, current frozen-ledger authority, separate transfer approval,
provider recovery and the end-to-end live CLI remain orchestration responsibilities.
