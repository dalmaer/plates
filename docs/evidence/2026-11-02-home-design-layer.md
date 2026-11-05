# Evidence: phase 169, Home is built from the design layer

- Date: 2026-11-02
- Phase: 169
- Revision: the commit titled "phase 169: Home is built from the design layer", on base `db34dd81` (working tree)
- Claim checked: `lib/web/views.mjs` holds no colour literal. Home's cards, labels and fields use the shared components. Long lists do not blur. Home's behaviour is unchanged.

## Automated checks

- `plates prove tests/web-design.test.mjs --name "home uses only tokens" --fix lib/web/views.mjs lib/web/design.mjs --base origin/main`: VERIFIED. At the base it fails on the hex literals in views.mjs.
- `tests/web-home.test.mjs`: 10 of 10 pass. Only one markup assertion changed, to accept the added `p-card` class.
- The markup golden was regenerated. Only Home and the project page changed, and only by the added classes `p-card`, `p-badge` and `p-field`. Sign-in, decision and changes are byte-identical.
- The builder ran `node --test` on web-design, web-home, web-assets, web-pwa, web-server and web-responsive: exit 0, 45 pass. `npm run check:focused` on those files plus `tests/web-activation-plan.test.mjs`: exit 0.
- The full gate, `npm run check`, runs once through `plates integrate`.

There are four new state tokens: `--warn`, `--warn-tint`, `--ok-tint` and `--sunken`. Their worst-case contrast over paper and the wash is:
- `--warn` on its tint: 6.77 (light), 8.62 (dark).
- muted on `--sunken`: 5.82 (light), 9.59 (dark).

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Conductor: fixture Home served over local http, dark, scrolled | Solid blue cards with an amber top edge, a warning-tinted sources box instead of olive, glass header over the scrolled content | As expected; inline `**owner**` renders bold | The rendering on one engine |
| Conductor: the same in light | Porcelain cards, an amber warning box, cobalt navigation | As expected | Same |
| Owner: Home on a phone | Calmer, and still clear what needs them | Not run: needs the deploy | The owner's judgement |

## Gaps and decision

The owner's look waits on the deploy, so the phase is partial and owes a walk. Blur is limited to the header and panels: `.p-card` is solid, and `.p-card.p-glass` is the opt-in. The journal change cards in `change-views.mjs` are phase 170's.
