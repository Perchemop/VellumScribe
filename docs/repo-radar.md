# Repository radar

Periodic build-vs-adopt pass over public GitHub projects (guide.md §4A). One
section per pass; verdicts are `adopt`, `pilot`, `watch` or `reject`, and a
rejected candidate is not re-proposed unless its reason has changed.

## 2026-10-25 — first pass

Scope: transcription, note search, rich-text editing, multi-device sync, and
the build/lint/test toolchain.

Already covered in this repository (no action, do not re-propose): whisper.cpp
vendored through `scripts/setup-whisper-third-party.sh` (the `whisper-rs` Rust
binding is archived, so the direct integration is the right call),
`@capacitor-community/sqlite` for storage, the Gemini SDK for generation,
ESLint + Prettier, Vitest, and the licence/SBOM/secret-scan workflows.

| Candidate | Verdict | Reason |
| --- | --- | --- |
| `asg017/sqlite-vec` | **watch** | Semantic search over transcripts is a plausible feature, but the extension is native per platform and this app ships through Capacitor SQLite, so it needs a custom build for every target. Revisit when semantic search is on the roadmap, and then as a pilot with a brute-force cosine fallback. |
| `loro-dev/loro` / `automerge/automerge` | **watch** | CRDT sync is only worth adopting when there is a multi-device sync requirement; adding one now buys conflict UX and a storage migration with no consumer. |
| `biomejs/biome` | **watch** | One fast linter+formatter instead of ESLint + Prettier, but the migration rewrites every rule override and the formatting of the whole tree mid-release. Adopt the next time the lint stack is deliberately touched. |
| `ueberdosis/tiptap` | **reject** | No rich-text editing requirement in the app; the current note editor works. |

Re-check date for the radar as a whole: 2027-01-25.
