# Product Name

**Locked name: VellumScribe**

| Property                    | Value                             |
| --------------------------- | --------------------------------- |
| Product name                | VellumScribe                      |
| Short name (launcher / PWA) | VellumScribe                      |
| Package / application ID    | `com.vellumscribe.app`            |
| Web manifest `short_name`   | `VellumScribe`                    |
| Licence                     | MIT (see `LICENSE`)               |
| Copyright line              | `Copyright (c) 2026 VellumScribe` |

## Rationale

- **Vellum** — the writing surface; signals permanence and a local, physical
  medium rather than a cloud service.
- **Scribe** — the agent that writes on your behalf; signals capture
  (dictation, transcription, scanning) rather than just storage.

The two halves mirror the product's two capabilities: **structured writing** and
**multimodal capture**.

## Usage rules

- Always spelled `VellumScribe` (camel capital V, capital S, no space, no hyphen).
- Never "Vellum Scribe", "Vellum-Scribe" or "vellumscribe" in user-facing copy.
- Lowercase `vellumscribe` is acceptable only in identifiers, URLs, package IDs
  and log prefixes (e.g. `[vellumscribe]`, `vellumscribe-boot-warning`).

## Name status

This name is already in use across the repository (Android application ID,
Capacitor config, PWA manifest, database filename `vellumscribeSQLite.db`,
native package `com.vellumscribe.app`). Changing it would break in-place APK
updates, so it is treated as **immutable**.

## Naming checks (guide §18, §25.1)

| Check                                 | Status                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Memorable and descriptive             | ✅ fuses the two capabilities (vellum/scribe)                                                                                                    |
| Handles reserved (repo, package ids)  | ✅ repo + `com.vellumscribe.app`; no separate domain or org reserved yet                                                                         |
| Conflict-free in package registries   | ⚠ npm `vellum` exists; PyPI `vellum`, `vellum-ai` exist; no exact `vellumscribe` package found. Formal registry check still required — **Q-019** |
| Trademark-cleared (WIPO / registries) | ⚠ Existing uses found in **unrelated** categories (see below); no notes-app conflict. Formal WIPO/USPTO search required — **Q-019**              |

### Q-019 investigation (2026-10-25)

A name re-investigation found existing uses of "VellumScribe":

| Existing use                                                                       | Category                 | Risk to a notes app                                        |
| ---------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `vellumscribe.co.uk` — Applied Art (David Truzzi-Franconi), heraldry & calligraphy | Art/design services (UK) | Low — unrelated class; owns the domain and `@vellumscribe` |
| _The Vellum Scribe_ — historical mystery novel by Zara Altair (2018)               | Fiction publishing       | Low — different class                                      |
| `VellumScribe` — fan-fiction author handle (AO3)                                   | Hobby/fan content        | Low                                                        |
| `vellum-dev/vellum`, `vellum-ai`, `vellum.pub`                                     | Software (not notes)     | Low–medium — same broad space, different name/scope        |

Alternatives checked were **also taken** by existing notes/writing apps:

| Candidate   | Existing use                                                        |
| ----------- | ------------------------------------------------------------------- |
| Marginalia  | Multiple notes/reading apps (incl. Android, iOS)                    |
| Scriptorium | Multiple writing/notes apps (desktop + iOS)                         |
| Palimpsest  | Encrypted-notes app on F-Droid (`app.palimpsest`) + writing studios |
| Codex       | Note-taking app for programmers (codexnotes.com)                    |

**Conclusion:** no obviously clearer free name exists among the common "scribe"
candidates, and VellumScribe's existing uses are in **unrelated product
categories**. Keeping the name is defensible, but a formal trademark search in
software classes (Nice 9/42) is still required. Tracked as **Q-019**.

### Automated clearance pass (2026-10-29, owner-approved)

The registry/public-web half of the check was executed by the agent (the
formal legal search remains the owner's):

| Surface                    | Result                                                                                                                                                                                     | Evidence                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| npm registry               | **Free** — `registry.npmjs.org/vellumscribe` returns 404                                                                                                                                   | URL above (checked 2026-10-29)                               |
| PyPI                       | **Free** — `pypi.org/pypi/vellumscribe/json` returns 404                                                                                                                                   | URL above (checked 2026-10-29)                               |
| GitHub                     | Only this repository matches a repo search                                                                                                                                                 | `gh search repos vellumscribe`                               |
| Public web                 | Same prior uses as the 2026-10-25 table; nothing new in software. The heraldry artist's `vellumscribe.co.uk` / `@vellumscribe` remains the one established prior user (different category) | https://www.vellumscribe.co.uk/ ; https://x.com/vellumscribe |
| WIPO Global Brand Database | JS portal — **cannot be queried programmatically**; run manually at https://branddb.wipo.int/ (Similar mode, Nice classes 9 + 42, designated countries = your markets)                     | portal URL (checked 2026-10-29, page loads)                  |

**Residual risk (honest).** A clear WIPO result is not an all-clear: the
database omits purely national marks, and common-law/prior-use rights are not
reflected. The UK heraldry artist has used the name publicly since before this
project in a different class — coexistence is plausible but is a legal
judgement, not an agent's. **Q-019 stays open** for the formal search; the
automated pass removes the "never checked" part of that risk.

VellumScribe is an original name; no competitor's name, logo or trade dress is
used or implied (§18, §27.5). Renaming has a real cost: it changes the Android
`applicationId`, making every future APK a "new app" (users must uninstall and
lose local data), and invalidates the F-Droid metadata.
