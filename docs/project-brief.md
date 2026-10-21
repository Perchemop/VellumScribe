# Project Brief

Source of truth for *why* VellumScribe exists. Answers below were confirmed
with the project owner on 2026-10-21 during guide adoption discovery.

---

## A. Product identity

**1. What is the application, in one sentence?**

VellumScribe is an offline-first, event-scoped multimodal note studio for
Android and the web: capture text, checklists, sketches, scans and voice, and
transcribe that voice on-device without sending it anywhere.

**2. Who is the primary user?**

An individual, Android-first writer/organiser who values privacy: someone in
meetings, lectures or field work who wants their notes and audio kept on the
device, without creating an account.

**3. What problem does it solve?**

Three concrete failures of mainstream notes apps:

| Failure | How VellumScribe addresses it |
| --- | --- |
| Notes live in one flat, undifferentiated list, so context is lost | Notes hang under **events** (`EventRecord` → `NoteRecord.event_id`): a meeting, lecture, sprint, interview. |
| Voice notes become unsearchable binary blobs | Recordings are transcribed into durable, FTS-indexed transcripts with per-chunk checkpoints so a killed process resumes instead of re-transcribing. |
| "Transcription" that silently produces nothing, or ships audio to a cloud service | The engine reports its real capability (`inferenceRuntimeReady`, engine provenance badges) and **rejects placeholder text**; the recovery sheet offers an explicit fallback instead of faking a transcript. |

## B. Inspiration & scope

See `docs/inspiration.md` (full clean-room statement) and `docs/scope.md`
(in/out of scope). Confirmed feature inspiration: **whisper.cpp / Whisper**
and **Obsidian**.

## C. Technical preferences

**7. Languages / frameworks** (recorded in `docs/architecture.md`)

- TypeScript + React 19 (Vite, Tailwind v4) as the whole app surface.
- Capacitor 8 for the Android shell and native plugins.
- Node/Express for the optional server-side backup path.
- SQLite everywhere: `@capacitor-community/sqlite` natively, `sql.js`
  (WASM) as the browser fallback.
- Native C/C++ (CMake) only for the vendored whisper.cpp + ggml inference.

**8. Target platforms**

Android and web. Confirmed 2026-10-21: the next major version targets
**Android + web only** — no desktop port, no iOS, no WASM engine.

**9. Must it work fully offline?**

Yes for the core loop. Notes, checklists, sketches, scans, PIN lock, search
and (on Android with a REAL native build) transcription all work with no
network. Cloud backup, Gemini AI summaries and OAuth are strictly optional and
consent-gated.

**10. Dependency / licence constraints**

All direct runtime and dev dependencies are permissively licensed (MIT,
ISC, Apache-2.0, BSD-2-Clause — see `ATTRIBUTION.md`). The vendored native
inference engine (whisper.cpp + ggml) is MIT. No proprietary code, assets or
reverse-engineered internals are used.

## D. Quality & process

**11. Importance of a polished, premium-feeling UI**

High. Every visible control must either work or be intentionally disabled and
explained. There is no tolerance for fake success states — this is why the
transcription engine reports its real status.

**12. Is the local machine resource-constrained?**

Yes. ~2.7 GiB RAM total, no JDK, no Android SDK/NDK/CMake. Therefore:

- Heavy work (Android APK build, native CMake/NDK compile) runs in **GitHub
  Actions**, never locally.
- The repository is **public** (confirmed 2026-10-21) so Actions minutes and
  the verification signal are available.
- Local work is limited to editing, typecheck, lint and the unit-test suite.

**13. Existing design system / brand / accessibility**

Yes. Brand tokens already exist and are used consistently:

| Token | Value | Where |
| --- | --- | --- |
| App / WebView background | `#121215` | `capacitor.config.json`, `index.html`, PWA manifest |
| Launcher icon background | `#09090B` | `values/ic_launcher_background.xml`, `public/favicon.svg` |
| Brand mark | white "V" + stem + dot | `public/favicon.svg`, all Android launcher/splash assets |
| Accent (emerald) | `#10B981` | UI accents, init loader |
| Type | Plus Jakarta Sans / Newsreader / JetBrains Mono | `index.html` |

Native launcher icons and splash screens are regenerated from the brand mark
with `npm run assets:brand` so web and Android cannot drift.

## E. Name

**14. Name**

Already chosen and locked: **VellumScribe**. See `docs/product-name.md`.
