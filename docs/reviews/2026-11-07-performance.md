# performance — 2026-11-07

Measured by `node scripts/plates/persona.mjs run` at `9b3c2342`. A run changes nothing but this page.

| Goal | Bound | Now | Verdict |
| --- | --- | --- | --- |
| CLI interaction | at most 100ms | 70ms (was 48ms on 2026-10-16) | met |
| published package | at most 1000kB | 2469kB (was 946kB on 2026-10-16) | **missed** |

## For the next night

- triage: published package: back to at most 1000kB (measured 2469kB) (`persona:performance:published-package`)
