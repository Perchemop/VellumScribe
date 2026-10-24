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

VellumScribe is an original name; no competitor's name, logo or trade dress is
used or implied (§18, §27.5). Renaming has a real cost: it changes the Android
`applicationId`, making every future APK a "new app" (users must uninstall and
lose local data), and invalidates the F-Droid metadata.
