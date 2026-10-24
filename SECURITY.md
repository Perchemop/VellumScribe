# Security Policy

## Supported versions

Only the latest tagged release (`v*.*.*` on the Releases page) receives
security fixes. The `main` branch is development code.

## Reporting a vulnerability — privately, please

**Do not open a public GitHub issue for anything you believe is a security
problem.**

1. **Preferred:** use GitHub's **private vulnerability reporting** on this
   repository (Security tab → "Report a vulnerability"). This creates a
   private fork and a draft advisory visible only to maintainers.
2. Alternatively, contact the maintainer privately via GitHub
   (`@Perchemop` → profile → "..." → Message).

Please include: what you found, how to reproduce it (a PoC is ideal but not
required), which version/build it affects, and whether you intend to disclose
publicly and when.

## What to expect

| Stage                         | Target                                        |
| ----------------------------- | --------------------------------------------- |
| Acknowledgement of the report | within 72 hours                               |
| Triage + severity decision    | within 7 days                                 |
| Fix + coordinated disclosure  | depends on severity; critical targets 14 days |

We credit reporters in the release notes and the security advisory unless you
ask not to be named.

## Threat model (lightweight, so researchers know what counts)

**What VellumScribe is:** an offline-first, local-storage note-taking app
(TypeScript/React + Capacitor on Android; the same code serves the web build).
Notes, audio, and transcripts are stored **on the device**. Cloud backup and
BYOK AI providers exist but are **off by default** and consent-gated.

**What we treat as in scope:**

- Anything that reads, exfiltrates, or destroys local note data without the
  user's explicit consent — the local store is the crown jewel.
- The optional server proxy (`server.ts`): SSRF, path traversal, command
  injection, XSS, missing authorisation/rate limits. It runs on the public
  internet, so it gets internet-grade scrutiny.
- The Android APK update path: signature handling, update-check response
  parsing, anything that could swap or spoof an update.
- Secrets handling: API keys (user-supplied, BYOK), the cloud-backup
  passphrase, keystore material.
- The import path (`ImportSafetyPipeline`): a malicious "backup" file must not
  be able to corrupt or escape the store.

**Out of scope:**

- The user's own device being compromised (physical access, rooted device) —
  we use platform storage; we do not defend against the OS.
- Attacks requiring the user to deliberately paste attacker-controlled data
  into a _local-only_ feature with no sync, though we still fix crashes.
- Social engineering of the maintainer.
- Vulnerabilities in pinned third-party dependencies that are already fixed
  upstream — report those upstream; we track them via the Dependency Audit CI
  job and Dependabot.

**What it trusts:** the local SQLite store and filesystem are trusted;
everything crossing a boundary (import files, server responses, cloud
accounts, AI outputs) is untrusted and must be validated.

## Incident response

1. **Triage** — the maintainer classifies severity and confirms reproduction
   with the reporter.
2. **Mitigate** — a fix is prepared on a private branch if disclosure risk is
   high, otherwise on a normal PR with CI verification.
3. **Release** — severity decides the timeline; a patch release is cut, and a
   GitHub Security Advisory is published with the fix.
4. **Notify** — the advisory plus the release notes carry a plain-language
   description of the impact; users on auto-update receive the patch through
   the normal update path (once signed releases exist — see `ROADMAP.md`).

## Attribution

Parts of this policy follow public community guidance
(<https://opensource.guide/security-best-practices-for-your-project/>);
the wording is original to this project.
