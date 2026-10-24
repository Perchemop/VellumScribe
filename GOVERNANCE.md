# Governance

## Who decides

VellumScribe currently runs a **BDFL model** (see `VISION.md`):

| Role               | Who                                                       | Decides                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintainer (BDFL)  | [@Perchemop](https://github.com/Perchemop)                | Final say on scope, architecture, releases, security, and conduct.                                                                                                                  |
| Maintainer (agent) | the OpenCode agent team (see `docs/current-model-map.md`) | Implements, verifies on CI, and drafts decisions — but **never** decides scope, policy, or releases unilaterally; each non-obvious choice is recorded in `DECISIONS.md` for review. |
| Contributors       | anyone who opens a quality issue, PR, or research note    | Influence by contribution; see below.                                                                                                                                               |

**Note on agents:** agents are automation, not governance. They hold scoped
credentials (least privilege), and their work always lands through a
pull request with CI verification. The owner delegated PR-merge authority to
the agent under `DECISIONS.md` **D-410**; that authority ends at required
checks being green and does not cover licence changes, security policy,
scope, or releases.

## How decisions are made

1. **Consensus-seeking first** (`DECISIONS.md` D-numbered records). A proposal
   is discussed on an issue until serious concerns are answered; it moves
   forward when only minor concerns remain.
2. **The BDFL breaks ties.** If consensus stalls, the maintainer decides and
   the reasoning is written into `DECISIONS.md`.
3. **The vision anchors debates.** Scope disputes re-anchor on `VISION.md` —
   "does this make VellumScribe more private, more honest, more local?"

## Commit access

- The agent pipeline commits via the `opencode/ci` verification branch and
  merges its own PRs only when **required** checks (`verify` ×3 OS, `format`)
  are green (D-410).
- Human contributors gain commit access after two merged contributions of
  reasonable substance, and keep it while active. Access is reviewed
  periodically (least privilege, `SECURITY.md`).

## Earning roles

- **Contributor:** one merged PR or a well-investigated issue with a
  reproduction.
- **Committer:** sustained quality contributions; can be assigned to an area
  (security, a11y, transcription, storage).
- **Maintainer:** demonstrated judgement over months, plus the owner's trust.

## Disputes

Re-read the vision; keep the discussion on the contribution, not the people
(`CODE_OF_CONDUCT.md`). If a thread is not converging, the BDFL closes it with
an explanation. A tiebreaker is defined **here, in advance**: the BDFL's call,
recorded in `DECISIONS.md`.

## Commercial participation

None currently. If it happens: commercial contributions are welcome and get no
special treatment; every change is judged on its merits, and the relationship
is recorded here.

## Legal & funding

MIT-licensed (`LICENSE`). No legal entity, no funding channel at present.
GitHub Sponsors is the lightest on-ramp if funding is ever added; nothing
changes about licence or governance without a recorded decision.

## Maintainer sustainability (guide §24)

The human owns the outcome, so the project is set up so the human is not the
bottleneck and does not burn out:

- **The human does judgement work** — decisions, scope, releases and review —
  while agents do the repetitive implementation and GitHub Actions does the
  heavy verification.
- **Response expectations are public** (`CONTRIBUTING.md`: first response within
  **7 days**; the project gets **a few hours a week**), so boundaries can be
  pointed at rather than re-argued.
- **The vision is written down** (`VISION.md`) so work can continue without the
  maintainer, and "no" stays impersonal.
- **It is fine to pause.** Hand over, or point at an active fork, if stepping
  away permanently.
- **AWS-style "never say no" is avoided:** declining a contribution is normal
  and documented (`CONTRIBUTING.md`, guide §17.7).
