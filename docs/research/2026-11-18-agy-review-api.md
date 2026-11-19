# AGY review API route — 2026-11-18

Phase 197 extends the existing cross-review job. This is source research, not a
successful hosted review or proof of this project's model entitlement.

| Source inspected | Observation | Decision |
| --- | --- | --- |
| [AGY authentication](https://antigravity.google/docs/install?tab=cli), accessed 2026-11-18 | `modelProvider: gemini` plus `GEMINI_API_KEY` selects direct API requests without an account session. A nonempty key is not validated until a model request. | Use a dedicated CI credential and isolated settings; never copy desktop login. |
| [Neon announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-neon/), 2026-11-18 | Neon is rolling out on the Gemini API paid tier. | Family support is documented; exact AGY slug and project access still need a real check. |
| [Carbon announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/), accessed 2026-11-18 | Carbon API access is documented for paying developers. | Same entitlement boundary; subscription access is not API access. |
| [Hydrogen developer guide](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-4-hydrogen/), accessed 2026-11-18 | Hydrogen is available through the Gemini API. | Include only explicitly configured, catalog-listed model identifiers. |
| [Headless contract](https://antigravity.google/docs/cli/headless/), accessed 2026-11-18 | Stream input, structured output and model selection are supported. | Validate complete output and actual model; no successful review inferred from process exit alone. |
| [Custom agents](https://antigravity.google/docs/subagents/), accessed 2026-11-18 | Main agents support explicit tools and customization configuration. | Initial reviewer uses no tools, skills, plugins or MCP servers; frozen patch only. |

## Distribution inspection

Pinned Linux x64 CLI version: **1.5.12**. The public archive was downloaded without
executing it; `shasum -a 512` matched:

```
26de25fccb3fbf0b093e090ce14a14ac1df1ec3e90ef4ea6106887d3a81b0cc9edb0dadea7b9101d07f9606eba159062a6fb7b78e91b73f7520684a24db73428
```

`tar -tzf` listed exactly `antigravity`. The workflow pins both the URL and this
checksum. The URL is
https://storage.googleapis.com/antigravity-public/antigravity-cli/1.5.12-5281398513336320/linux-x64/cli_linux_x64.tar.gz.
This establishes inspected archive identity, not execution compatibility.

## Unverified boundary

No Gemini credential or live model trial was used for these observations. The
configured AGY identifiers end in `-high`; they are CLI identifiers, not an
assertion that the raw Gemini API accepts those names. A current catalog and a
successful attributed response through the pinned CLI must establish that route.
A catalog listing alone is not inference entitlement. Unknown usage cost stays
unknown. No failed or uncertain generation permits a second model dispatch.
