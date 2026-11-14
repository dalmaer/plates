# performance — 2026-11-14

Measured by `node scripts/plates/persona.mjs run` at `d9646519`. A run changes nothing but this page.

| Goal | Bound | Now | Verdict |
| --- | --- | --- | --- |
| CLI interaction | at most 100ms | 67ms (was 48ms on 2026-10-16) | met |
| published package | at most 1000kB | 2535kB (was 946kB on 2026-10-16) | **missed** |

## For the next night

- triage: published package: back to at most 1000kB (measured 2535kB) (`persona:performance:published-package`)
