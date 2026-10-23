# Inspiration (clean-room statement)

## Clean-room rules (non-negotiable)

1. VellumScribe is built **clean-room**: no proprietary source code, resources,
   icons, layouts, strings, or internal algorithms from any commercial product
   are ever read, decompiled, disassembled, copied, or fed into an agent.
2. Inspiration may be drawn only from:
   - publicly documented algorithms and standards,
   - publicly observable external behaviour (black-box),
   - this file and `docs/scope.md`.
3. All data models, commands, UI design, interaction patterns and visual design
   in VellumScribe are **original**.
4. Any third-party asset is permissively licensed and listed in
   `ATTRIBUTION.md`.

A violation of these rules invalidates the clean-room nature of the project.

---

## 1. whisper.cpp / Whisper — inspiration **and** approved dependency

**Licence:** MIT (Copyright (c) 2023–2026 The ggml authors).
**Status:** open-source, not proprietary. Vendored as a normal third-party
dependency under `android/app/src/main/cpp/third_party/whisper.cpp/`.

Because it is MIT-licensed open source, using it is a licence-compliant
dependency, not a clean-room concern. It is listed in `ATTRIBUTION.md`.

### Capabilities we take inspiration from

- **On-device speech-to-text with no upload** — the audio never leaves the
  device.
- **Explicit model-size trade-offs** — small quantised models for phones;
  the user downloads a model deliberately, not silently.
- **16 kHz mono PCM input contract** — the reason the audio import pipeline
  resamples to 16 kHz mono WAV before inference.
- **Honest failure** — inference availability is a runtime capability that must
  be checked, not assumed; when it is unavailable the app must say so.

### What is _not_ taken

No UI, no layout, no iconography, no product concept. The inspiration is the
inference contract and the input format only.

---

## 2. Obsidian — inspiration only (proprietary product)

**Status:** a commercial/proprietary application. Referenced strictly as
black-box behavioural inspiration. **No part of Obsidian is used as a
dependency**, and no Obsidian code, asset, icon, layout or string has ever
been read or copied.

### Capabilities we take inspiration from (publicly observable behaviour only)

- **Local-first ownership** — the user's data lives on their own device; there
  is no mandatory account and no forced sync.
- **Markdown as the durable body format** — note bodies are plain Markdown so
  they stay readable and portable outside the app.
- **Linking between notes** — notes can reference each other rather than
  existing in isolation.
- **Fast capture over filing** — writing a note must never require setting up
  structure first.

### What is _not_ taken

- Obsidian's visual design, theme, iconography or branding — VellumScribe's
  brand (`#121215` / `#09090B` / white "V" mark) is original.
- Its vault file format, plugin API, sync service or licensing model.
- Its graph view, canvas or publish features — these are not in
  `docs/scope.md`.

---

## 3. Originality statement

VellumScribe's own organising concept is **not** derived from either
inspiration: the event-scoped model (`EventRecord` → `NoteRecord`), the
colour/category taxonomy, the two lock modes, the engine-provenance badges and
the resumable chunked transcription checkpoints are original designs specific
to this product.
