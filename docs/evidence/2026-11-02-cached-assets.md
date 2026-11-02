# Evidence: phase 165 — workspace pages load from cache after the first visit

- Date: 2026-11-02
- Phase: 165
- Revision: the commit titled "phase 165: Workspace pages load from cache after the first visit", on `claude/phase-165`. Built by a subagent from `3bbd51d9`.
- Claim being checked:
  - Every asset reference in pages, the manifest, the worker shell and served modules is a digest URL answered `public, max-age=31536000, immutable`.
  - A non-current digest is 404.
  - Nothing private becomes cacheable.

## Automated checks

- `plates prove tests/web-assets.test.mjs --name <each> --fix lib/web/assets.mjs lib/web/server.mjs lib/web/pwa.mjs lib/web/pwa-client.mjs --base HEAD~1`. All three printed `VERIFIED red without the fix, green with it`:
  - "every page references immutable digest assets"
  - "a digest names exactly one asset"
  - "nothing private becomes cacheable"
- The reference test crawls 30 routes, signed in and out (60 HTML responses, including error pages), plus the manifest and the worker shell. It fetches every digest asset and every import inside the modules it receives, and checks bytes against the digest.
- `node --test tests/web-*.test.mjs tests/names.test.mjs`: exit 0, 784 pass. This includes phase 164's four tests.
- `npm run check:focused -- tests/web-assets.test.mjs tests/web-pwa.test.mjs tests/web-server.test.mjs`: exit 0.
- `npm run typecheck`: exit 0.
- The whole gate, `npm run check`, runs once after this record, through `plates integrate`.

Some pages need fixtures the basic harness lacks: walks, decisions, model and connections. For those, the crawl sees their 503/400 error pages. Every module those pages load is still checked through the asset table.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `curl -sI` a digest asset on the deployed workspace | `cache-control: public, max-age=31536000, immutable` | Not run: needs the owner's deploy | The live header |
| Reload a signed-in page with the network panel open | Assets served from cache | Not run | The second-visit cost |

## Gaps and decision

The live checks wait on the owner's deploy. The phase is partial, `owes: walk`. Edge caching (`s-maxage`) stays deliberately open.
