# performance — 2026-11-23

Measured by `node scripts/plates/persona.mjs run` at `d645b7d9`. A run changes nothing but this page.

| Goal | Bound | Now | Verdict |
| --- | --- | --- | --- |
| CLI interaction | at most 100ms | 66ms (was 48ms on 2026-10-16) | met |
| published package | at most 1000kB | 2764kB (was 946kB on 2026-10-16) | **missed** |

## For the next night

- triage: published package: back to at most 1000kB (measured 2764kB) (`persona:performance:published-package`)
