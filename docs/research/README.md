# Research Notes

This directory holds **public** research that informs feature work: capability
studies, standards, format specifications, and platform documentation.

## The rules (guide §2, §6.1)

Research is **human-gated** and **public-information only**.

1. **Summaries and URLs only.** Never paste large verbatim excerpts, source
   code, proprietary content, or anything you do not hold the rights to
   redistribute. A note is: what was learned, why it matters here, and the URL.
2. **No reverse engineering.** Do not disassemble, decompile, or otherwise
   derive material from a commercial product. Behavioural inspiration at the
   capability level (guide §2.2) is allowed and recorded in
   `docs/inspiration.md`; copying implementation is not.
3. **Human gate before large feature work.** A research note must be reviewed
   and accepted by the maintainer (or recorded as accepted in `DECISIONS.md`)
   **before** it drives a slice. An agent may _propose_ a note; it may not
   treat its own proposal as approved.
4. **Attribution.** Any third-party asset, dataset, or specification used in
   the product is also listed in `ATTRIBUTION.md` with its licence (guide
   §19.3).
5. **No secrets, no personal data, no user content.** Never place real note
   content, credentials, or personal data here.

## File naming

`YYYY-MM-DD-topic.md`, e.g. `2026-10-24-webdav-propfind-auth.md`.

Each note should contain: **Question**, **Finding** (the summary),
**Relevance** (what it changes about VellumScribe), **Sources** (URLs),
**Status** (`proposed` / `accepted` / `rejected` — set by the human).

## Index

| Date | Topic          | Status |
| ---- | -------------- | ------ |
| —    | (no notes yet) | —      |
