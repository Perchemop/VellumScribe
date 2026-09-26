# Database Migrations

This directory contains standalone SQL migration files applied across the VellumScribe SQLite storage architecture.

### Migration History & Layout
- **Migrations 001–005**: Foundational relational schema migrations (v1 initial core schema, v2 FTS optimization & composite indices, v3 query plan indexing, v4 security & lock modes, v5 media file checksums & encryption metadata) are implemented programmatically within `src/lib/sqlite/migrationManager.ts` to ensure zero-latency WebAssembly bootstrapping across web and native Android runtimes.
- **Migration 006 (`006_offline_ai_transcription.sql`)**: Introduces offline AI speech-to-text transcriptions, timestamped audio segments, speaker diarization tables, and indexing for Whisper.cpp.
- **Subsequent Migrations (v7–v12+)**: Managed deterministically through `MigrationManager` to maintain cross-runtime schema integrity between SQLite WebAssembly (`sql.js`) and Capacitor native SQLite.
