# Current free-model map

Per guide §5 (Free Model Policy) and §5.6 (Working Protocol), the lead agent
discovers the currently available free models at the start of each session and
assigns the best one to each role. This file records the mapping for the
session that last touched it; it is **not** a hard-coded pin and must be
re-validated when models become unavailable.

Provider order: **OpenCode free first → NVIDIA free second** (§5.1). Switch to
NVIDIA free only when OpenCode free is exhausted, and record the switch in
`PROGRESS.md`.

Role → capability → current model (OpenCode free), reviewed 2026-10-27:

| Role                | Capability needed                               | Current model                              | Selection guidance                                                                               |
| ------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Orchestrator / Lead | Strong reasoning + tool calling                 | `opencode/big-pickle`                      | Best available free reasoning model; plans and delegates only, never edits or runs heavy builds. |
| Coder / Executor    | High-quality code generation & multi-file edits | `opencode/glm-5.3-flash-free#high`         | Best available free coding model; writes code + tests, never runs the toolchain locally.         |
| Explorer            | Speed + good search                             | `opencode/mimo-v2.6-flash-free`            | Fastest free model with decent quality; read-only, no builds.                                    |
| Reviewer            | Competent analysis, read-only                   | `opencode/beam-free#high`                  | Solid free model, prefer fast/cheap; read-only, no builds.                                       |
| Tester / Bulk       | High volume, lower stakes                       | `opencode/deepseek-v4.1-flash-free#high`   | Fastest / highest-quota free model; writes tests, triggers CI via `ci.sh`.                       |
| CI runner           | GitHub interaction, read results                | `opencode/beam-free#high`                  | Any capable free model; runs `ci.sh`, never changes source.                                      |
| designer (UI/UX)    | Visual review + design critique                 | `opencode/nemotron-3.5-super-vl-free#high` | Vision-capable; design + performance review of rendered CI screenshots.                          |
| Fixer               | Fix CI-reported failures                        | `opencode/glm-5.3-flash-free#high`         | Good coding model; reads CI logs, applies minimal fixes.                                         |
| Docs writer         | Process docs up to date                         | `opencode/big-pickle`                      | Reasoning model; edits Markdown only.                                                            |

## How to re-select

At session start, the orchestrator discovers available free models (OpenCode
free first) and picks the most suitable per the nature of the work:

- Strong reasoning / planning / multi-file coding → best high-quality free model.
- Fast exploration, search, simple reads, bulk review → fastest / highest-throughput free model.
- Read-only review → any capable free model (prefer cheaper/faster).
- Prefer models that support reliable tool calling when the task requires it.

Record any change here and in `PROGRESS.md`.

## Do not

- Do not use Ollama or any local model hosting (§5.1.4).
- Do not hard-code model IDs as permanent — they change over time (§5.2).
- Do not run heavy toolchains locally regardless of model (§4).

## Verified availability (re-checked 2026-10-27)

Live discovery of the OpenCode free tier (tier 1) on 2026-10-27 returned six
active, zero-cost models: `opencode/flint-40b-free`,
`opencode/nemotron-3.5-super-vl-free` (vision), `opencode/beam-free`,
`opencode/mimo-v2.6-flash-free`, `opencode/deepseek-v4.1-flash-free` and
`opencode/glm-5.3-flash-free`. `opencode/big-pickle` remains the tier-1
reasoning entry in the router even though it does not appear in a "free" name
search.

### NVIDIA free tier (re-checked 2026-10-22)

Live probes of the NVIDIA free tier, which is tier 2 in the provider order:

| Model                              | Result                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `nvidia/z-ai/glm-5.3-flash`        | reachable                                                                           |
| `nvidia/stepfun-ai/step-5-preview` | reachable                                                                           |
| `nvidia/openai/gpt-oss-20b`        | reachable, intermittently                                                           |
| `nvidia/z-ai/glm-5.3`              | **not reachable** — `socket connection was closed`; removed from the routing chains |

`nvidia/meta/llama-guard-4-12b` and `nvidia/google/google-paligemma` are guard
and vision models, not coding models, so they are not used for roles.

The router in `~/.config/opencode/failover.json` (`fallbacks` +
`fallbacksByAgent`) carries this order. It never re-chooses a model that has
already failed in the same session, and a model that stops connecting is
dropped after two attempts, so a stale ID degrades into the next tier instead
of stalling the session.
