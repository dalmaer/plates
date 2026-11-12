# performance — 2026-11-12

Measured by `node scripts/plates/persona.mjs run` at `8bc08bd1`. A run changes nothing but this page.

| Goal | Bound | Now | Verdict |
| --- | --- | --- | --- |
| CLI interaction | at most 100ms | 59ms (was 48ms on 2026-10-16) | met |
| published package | at most 1000kB | 2483kB (was 946kB on 2026-10-16) | **missed** |

## For the next night

- triage: published package: back to at most 1000kB (measured 2483kB) (`persona:performance:published-package`)
