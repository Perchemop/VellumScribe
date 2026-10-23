# VellumScribe Architectural Blueprint

This document details the system design, data flow, cryptographic guarantees, and offline persistence layers of VellumScribe.

---

## 1. High-Level System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React SPA (TypeScript)                          │
│                                                                        │
│   ┌────────────────┐   ┌──────────────────┐   ┌────────────────────┐   │
│   │   NoteEditor   │   │  ChecklistEditor │   │  Audio/OCR Studio  │   │
│   └───────┬────────┘   └────────┬─────────┘   └─────────┬──────────┘   │
│           │                     │                       │              │
│           ▼                     ▼                       ▼              │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │             StorageManager (Authoritative Gateway)             │   │
│   │         In-memory read cache + optimistic UI updates           │   │
│   └───────┬─────────────────────┬───────────────────────┬──────────┘   │
└───────────┼─────────────────────┼───────────────────────┼──────────────┘
            │                     │                       │
     (Atomic Metadata)     (Binary Blobs)          (Speech Jobs)
            │                     │                       │
            ▼                     ▼                       ▼
┌───────────────────────┐ ┌──────────────┐ ┌─────────────────────────────┐
│    DatabaseAdapter    │ │    Media     │ │       OfflineAiPlugin       │
│  (Native SQLite /     │ │  Repository  │ │  (Capacitor Android Bridge) │
│   SqliteEngine WASM)  │ │ (IndexedDB / │ └──────────────┬──────────────┘
│  PRAGMA WAL + Checkpt │ │ Filesystem)  │                │
└───────────────────────┘ └──────────────┘                ▼
                                           ┌─────────────────────────────┐
                                           │     TranscriptionWorker     │
                                           │  - Chunk Checkpoints        │
                                           │  - Battery / Thermal aware  │
                                           │  - Direct SQLite Writes     │
                                           └──────────────┬──────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │      libwhisper.so JNI      │
                                           │ (Vendored whisper.cpp GGML) │
                                           └─────────────────────────────┘
```

---

## 2. Relational SQLite Layer & Migrations

Authoritative local state is stored in an SQLite relational database (`vellumscribeSQLite.db` on Android, WebAssembly `sql.js` in browser).

- **Current Schema Version:** `12`
- **Full-Text Search (FTS):** SQLite FTS virtual table indexing notes, checklists, and transcripts.
- **Durable Checkpoints:** `transcription_chunk_checkpoints` and `transcription_jobs` track background speech processing per 20-second chunk so jobs resume seamlessly after process death.
- **Audit Logs:** `item_changes` logs all creations, updates, and soft deletes for reliable sync resolution.

---

## 3. Cryptographic Specification

VellumScribe enforces a strict zero-knowledge security model for locked notes:

| Property             | Value                          | Rationale                                                   |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| **Cipher**           | AES-256-GCM                    | Authenticated symmetric encryption with 96-bit unique IVs   |
| **KDF Algorithm**    | PBKDF2-HMAC-SHA-256            | High iteration count defense against hardware brute-force   |
| **KDF Work Factor**  | **600,000 iterations**         | Meets modern OWASP & NIST mobile cryptographic standards    |
| **Salt Separation**  | Verification vs Encryption     | Independent 16-byte random salts prevent cross-key exposure |
| **Session Lifetime** | 5m, 15m, 30m, 60m, or app exit | Configurable via `UnlockSessionManager` in volatile memory  |
| **Hardware Binding** | Android Keystore               | Master credential migration via `AndroidKeystoreManager`    |

---

## 4. Durability & Process-Death Consistency

Android OS aggressively kills background apps under thermal or memory pressure. VellumScribe protects user data through:

1. **Capacitor `appStateChange` Listener (`NativeLifecycle.ts`):** Automatically executes `PRAGMA wal_checkpoint(PASSIVE);` and flushes all pending memory queues when the app enters the background.
2. **Two-Phase Media Atomicity (`StorageManager.updateNoteWithMedia`):** Ensures media files are written to disk before committing the SQLite note row update.
3. **Cold-Start Integrity Check:** Automatically detects and repairs orphaned media keys upon app launch.
4. **Resumable Audio Chunks:** `TranscriptionWorker` records each 20-second segment into SQLite. If killed, the worker resumes from the last completed chunk without re-transcribing from scratch.
