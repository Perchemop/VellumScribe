# Process Feedback Log

Append-only log of agent-reported process friction (addendum §N). **Never edit
or delete an existing entry.** Feedback is advisory until the client promotes it
into the local guide/addendum; suggestions that weaken safety are logged and
then ignored in practice.

Template (addendum §N.2):

```text
PROCESS FEEDBACK
Date / session:
What I was trying to do:
Block or friction:
Why the current guide/addendum caused it (or did not cover it):
Suggested change (one concrete edit):
Severity: blocks-release | slows-work | nice-to-have
Workaround I used (if any):
Confirm: did NOT violate clean-room / v0.1.0 gate / no-secrets / CI-before-client-try / no meta-guide push
```

---

## Entry 1 — 2026-10-26 — GitHub MCP requires a client PAT the agent cannot mint

```text
PROCESS FEEDBACK
Date / session: 2026-10-26 (VellumScribe, post-3.3.0)
What I was trying to do: Satisfy addendum §C Phase 0 step 5 and §D ("Confirm
MCP: GitHub + Context7 connected. If not, configure before coding").
Block or friction: The GitHub MCP server requires a fine-scoped personal access
token in the OpenCode config headers. Per addendum §A.1/§D.2, pasting tokens
into secure config is explicitly a *client* action, so the agent cannot complete
the GitHub MCP half of the setup on its own.
Why the current guide/addendum caused it (or did not cover it): §D mandates the
connection but does not say what the agent should do when the client has not
yet supplied a PAT, and the same document also says to prefer the smallest MCP
set (§J.6, §D.1).
Suggested change (one concrete edit): In §D.1, add: "If the client has not yet
supplied a PAT, the agent scaffolds the config with the server disabled and
records the pending step; the existing `gh` CLI satisfies GitHub operations in
the meantime."
Severity: slows-work
Workaround I used (if any): Scaffolded `~/.config/opencode/opencode.json` with
Context7 enabled and the GitHub server present but `enabled: false` pending the
client PAT. All GitHub operations (PRs, issues, Actions, Releases, secrets)
already work through the authenticated `gh` CLI, and library-documentation
lookups work through webfetch/websearch, so no capability is blocked.
Confirm: did NOT violate clean-room / v0.1.0 gate / no-secrets / CI-before-client-try / no meta-guide push
```

## Entry 2 — 2026-10-26 — Rust-specific addendum sections need a web-app equivalent

```text
PROCESS FEEDBACK
Date / session: 2026-10-26 (VellumScribe, post-3.3.0)
What I was trying to do: Apply addendum §K/§M (Rust QA gates) to this repo.
Block or friction: §K/§M are written for Rust Cargo workspaces (`crates/*-core`,
`rust-toolchain.toml`, `clippy -D warnings`, `tempfile`). VellumScribe is a
TypeScript/React app (Vite + Capacitor), so none of those gates can be applied
literally, and §M.2 blocks tagging v0.1.0 on them.
Why the current guide/addendum caused it (or did not cover it): §K/§M do not
state the equivalent gates for a non-Rust stack.
Suggested change (one concrete edit): In §M.2, add a parenthetical: "(non-Rust
stacks: the equivalent gate is a tested core/domain layer with no UI imports,
deterministic headless tests in CI, a pinned toolchain file, and a
download-without-toolchain path in the README)".
Severity: nice-to-have
Workaround I used (if any): VellumScribe already satisfies the *intent*: logic
lives in `src/lib` / `src/repositories` / `src/services` with no component
imports and is tested headless in CI (30/34 requirements); `package.json`
`engines` pins Node/npm; the README documents the no-toolchain path (download
the signed APK artefact). Recorded in `docs/development.md`.
Confirm: did NOT violate clean-room / v0.1.0 gate / no-secrets / CI-before-client-try / no meta-guide push
```

## Entry 3 — 2026-10-28 — History rewrite must re-clone its mirror at push time

PROCESS FEEDBACK
Date / session: 2026-10-28 (VellumScribe, §II.29.4 history purge)
What I was trying to do: execute the owner-approved history purge
(filter-repo + force-push) while other merged work continued landing.
Block or friction: the mirror clone used for the rewrite had been created
before PRs #119/#120 merged; force-pushing its `main` silently reverted those
two PRs from the default branch. Detected only because the post-purge
verification step re-checked recent history.
Why the current guide/addendum caused it (or did not cover it): guide §II.29.4
prescribes the rewrite steps but says nothing about the mirror's freshness
relative to concurrent merges — and agent sessions are frequently interrupted
and resumed, so "clone then act later" spans turns.
Suggested change (one concrete edit): add one sentence to §II.29.4 step 3 —
"clone the mirror immediately before the force-push, and re-verify the remote
tip equals the rewritten tip (`git ls-remote`) in the same command sequence."
Severity: slows-work (recovery cost one extra slice; no data lost)
Workaround I used (if any): recovered both PRs' content from the immutable
refs/pull refs and re-landed it.
Confirm: did NOT violate clean-room / v0.1.0 gate / no-secrets / CI-before-client-try / no meta-guide push
