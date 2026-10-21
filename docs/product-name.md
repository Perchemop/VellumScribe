# Product Name

**Locked name: VellumScribe**

| Property | Value |
| --- | --- |
| Product name | VellumScribe |
| Short name (launcher / PWA) | VellumScribe |
| Package / application ID | `com.vellumscribe.app` |
| Web manifest `short_name` | `VellumScribe` |
| Licence | MIT (see `LICENSE`) |
| Copyright line | `Copyright (c) 2026 VellumScribe` |

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
