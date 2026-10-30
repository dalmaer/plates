# Task A — Project operation receipt authorization

A private project operation receipt can remain visible when its caller loses
workspace membership while the receipt read is in flight. Reproduce and close
that disclosure window for API and HTML receipt reads. Keep authorized recovery
of the same original operation working and do not redispatch source writes.

Use this repository's existing synthetic providers for testing. Add meaningful
regression coverage, verify it fails on the original code, then run the affected
checks required by the repository. Report changed files, test commands and actual
results. Do not contact external providers, use personal credentials, enable
routines, deploy, publish or change global configuration.

This is a bounded local production-code task on the frozen Plates baseline
`037e13b4f78c061405cef899b528badb536584ad`.

For this bounded evaluation, leave every existing `tests/helpers/**/*.mjs` file
byte-for-byte unchanged and add no files under that helper directory. You may add
independent test files and edit production code for the requested defect. The
external evaluator verifies fixture integrity before importing candidate code.
