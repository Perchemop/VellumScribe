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

| Check                                 | Status                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Memorable and descriptive             | ✅ fuses the two capabilities (vellum/scribe)                                                                                                                            |
| Handles reserved (repo, package ids)  | ✅ repo + `com.vellumscribe.app`; no separate domain or org reserved yet                                                                                                 |
| Conflict-free in package registries   | ⚠ npm `vellum` exists; PyPI `vellum`, `vellum-ai` exist; no exact `vellumscribe` package found in a quick search. Formal registry check still required — **Q-019**       |
| Trademark-cleared (WIPO / registries) | ⚠ Quick web search finds Vellum-related brands (`vellum-dev`, `vellum-ai`, `vellum.pub`) but no exact `VellumScribe` hits. Formal WIPO/USPTO search required — **Q-019** |

VellumScribe is an original name; no competitor's name, logo or trade dress is
used or implied (§18, §27.5). Name clearance remains an open human/legal task.
