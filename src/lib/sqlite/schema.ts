/**
 * VellumScribe Relational SQLite Schema & Versioned Migrations
 */

export const DB_SCHEMA_VERSION = 12;
export const CURRENT_SCHEMA_VERSION = DB_SCHEMA_VERSION;

export const SCHEMA_V1 = `
-- Workspace Metadata
CREATE TABLE IF NOT EXISTS workspace_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

-- Events / Notebooks table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Core Notes table
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  note_type TEXT DEFAULT 'text',
  color TEXT,
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  pin_hash TEXT,
  pin_salt TEXT,
  encrypted_payload TEXT,
  status TEXT DEFAULT 'active',
  archived_at TEXT,
  trashed_at TEXT,
  reminder_at TEXT,
  location_name TEXT,
  latitude REAL,
  longitude REAL,
  version INTEGER DEFAULT 1,
  sketch_media_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT
);

-- Note Tags relational link
CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_name),
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Relational Checklists items table
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  note_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Document / Note Versions history table
CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  note_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  author TEXT,
  change_summary TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Media Files relational catalog
CREATE TABLE IF NOT EXISTS media_files (
  media_key TEXT PRIMARY KEY,
  note_id INTEGER,
  media_type TEXT NOT NULL, -- 'audio' | 'sketch' | 'ocr_image' | 'attachment'
  mime_type TEXT,
  byte_size INTEGER DEFAULT 0,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE SET NULL
);

-- Voice Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  file_path TEXT,
  media_key TEXT,
  duration_seconds INTEGER DEFAULT 0,
  file_size INTEGER DEFAULT 0,
  sample_rate INTEGER,
  bitrate_kbps INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  transcript_text TEXT NOT NULL,
  confidence REAL,
  speaker_count INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

-- OCR Document Scans table
CREATE TABLE IF NOT EXISTS ocr_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  image_path TEXT,
  media_key TEXT,
  ocr_text TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT NOT NULL
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_notes_event_id ON notes(event_id);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_checklists_note_id ON checklists(note_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_media_files_note_id ON media_files(note_id);
CREATE INDEX IF NOT EXISTS idx_recordings_note_id ON recordings(note_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON transcripts(recording_id);
CREATE INDEX IF NOT EXISTS idx_ocr_scans_note_id ON ocr_scans(note_id);
`;

export const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial relational SQLite schema with core tables & foreign keys',
    sql: SCHEMA_V1,
  },
  {
    version: 2,
    description: 'Full-text search optimization and composite indices',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned);
      CREATE INDEX IF NOT EXISTS idx_notes_is_locked ON notes(is_locked);
    `,
  },
  {
    version: 3,
    description: 'Verified query plan composite indices and SQLite FTS full-text search table',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_notes_event_status ON notes(event_id, status);
      CREATE INDEX IF NOT EXISTS idx_notes_status_updated ON notes(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_reminder ON notes(reminder_at);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_name);
      CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ocr_scans_created ON ocr_scans(created_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts4(note_id, title, body, checklist_text, ocr_text, tags);
    `,
  },
  {
    version: 4,
    description: 'Add lock_mode, security_type, and cloud_save_enabled columns to notes table',
    sql: `
      ALTER TABLE notes ADD COLUMN lock_mode TEXT DEFAULT 'standard';
      ALTER TABLE notes ADD COLUMN security_type TEXT DEFAULT 'pin';
      ALTER TABLE notes ADD COLUMN cloud_save_enabled INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 5,
    description:
      'Add explicit encryption_state, encryption_version, plaintext_checksum, and ciphertext_checksum to media_files table',
    sql: `
      ALTER TABLE media_files ADD COLUMN encryption_state TEXT DEFAULT 'plaintext';
      ALTER TABLE media_files ADD COLUMN encryption_version INTEGER DEFAULT 0;
      ALTER TABLE media_files ADD COLUMN plaintext_checksum TEXT;
      ALTER TABLE media_files ADD COLUMN ciphertext_checksum TEXT;
    `,
  },
  {
    version: 6,
    description: 'Offline AI Speech-to-Text: transcriptions, segments, and speaker diarization',
    sql: `
      ALTER TABLE recordings ADD COLUMN checksum TEXT;
      ALTER TABLE recordings ADD COLUMN duration_ms INTEGER;
      ALTER TABLE recordings ADD COLUMN mime_type TEXT DEFAULT 'audio/wav';
      ALTER TABLE recordings ADD COLUMN channels INTEGER DEFAULT 1;
      ALTER TABLE recordings ADD COLUMN status TEXT DEFAULT 'ready';

      CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        engine TEXT NOT NULL,
        engine_version TEXT,
        model_id TEXT NOT NULL,
        model_checksum TEXT,
        language TEXT,
        status TEXT NOT NULL,
        text TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error_code TEXT,
        error_message TEXT,
        FOREIGN KEY(recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS transcription_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcription_id INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        speaker_id TEXT,
        text TEXT NOT NULL,
        confidence REAL,
        FOREIGN KEY(transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS transcription_speakers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcription_id INTEGER NOT NULL,
        speaker_id TEXT NOT NULL,
        label TEXT NOT NULL,
        name TEXT,
        FOREIGN KEY(transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_transcriptions_recording_id ON transcriptions(recording_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);
      CREATE INDEX IF NOT EXISTS idx_segments_transcription ON transcription_segments(transcription_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_speakers_transcription ON transcription_speakers(transcription_id);
    `,
  },
  {
    version: 7,
    description:
      'Durable transcription jobs and chunk checkpointing for crash and process recovery',
    sql: `
      CREATE TABLE IF NOT EXISTS transcription_jobs (
        id TEXT PRIMARY KEY,
        transcription_id INTEGER NOT NULL,
        recording_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_chunk INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_transcription_jobs_recording ON transcription_jobs(recording_id);
    `,
  },
  {
    version: 8,
    description:
      'External Knowledge Adapter: NotebookLM connections, source mapping, and hash synchronization',
    sql: `
      CREATE TABLE IF NOT EXISTS notebooklm_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        backend TEXT NOT NULL DEFAULT 'notebooklm-py',
        notebook_id TEXT,
        notebook_url TEXT,
        status TEXT NOT NULL DEFAULT 'connected',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notebooklm_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id INTEGER NOT NULL,
        local_entity_type TEXT NOT NULL, -- 'note' | 'transcript' | 'summary' | 'action_items'
        local_entity_id INTEGER NOT NULL,
        remote_source_id TEXT,
        content_hash TEXT NOT NULL,
        sync_status TEXT NOT NULL, -- 'synced' | 'pending' | 'failed' | 'modified'
        last_synced_at INTEGER,
        error_code TEXT,
        FOREIGN KEY(connection_id) REFERENCES notebooklm_connections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notebooklm_sync_jobs (
        id TEXT PRIMARY KEY,
        connection_id INTEGER NOT NULL,
        local_entity_type TEXT NOT NULL,
        local_entity_id INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'queued' | 'syncing' | 'completed' | 'failed'
        action TEXT NOT NULL, -- 'create' | 'update' | 'delete'
        content_payload TEXT,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(connection_id) REFERENCES notebooklm_connections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notebooklm_sources_entity ON notebooklm_sources(local_entity_type, local_entity_id);
      CREATE INDEX IF NOT EXISTS idx_notebooklm_sync_jobs_status ON notebooklm_sync_jobs(status);
    `,
  },
  {
    version: 9,
    description: 'Durable transcription chunk checkpoints and SQLite cloud sync queue',
    sql: `
      CREATE TABLE IF NOT EXISTS transcription_chunk_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'pending' | 'completed' | 'failed'
        transcript_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(job_id) REFERENCES transcription_jobs(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_checkpoints_job_chunk ON transcription_chunk_checkpoints(job_id, chunk_index);
      CREATE INDEX IF NOT EXISTS idx_chunk_checkpoints_job ON transcription_chunk_checkpoints(job_id);

      CREATE TABLE IF NOT EXISTS cloud_sync_queue (
        id TEXT PRIMARY KEY,
        providers_json TEXT NOT NULL,
        reason TEXT,
        filename TEXT,
        staged_storage_key TEXT,
        checksum TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'failed'
        last_error TEXT,
        queued_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cloud_sync_queue_status ON cloud_sync_queue(status, queued_at);
    `,
  },
  {
    version: 10,
    description: 'Durable FTS search index jobs, AI data provenance, and media file metadata',
    sql: `
      CREATE TABLE IF NOT EXISTS search_index_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_search_index_jobs_status ON search_index_jobs(status, updated_at);

      CREATE TABLE IF NOT EXISTS ai_provenance (
        id TEXT PRIMARY KEY,
        target_entity_type TEXT NOT NULL, -- 'note' | 'checklist' | 'transcript' | 'summary'
        target_entity_id INTEGER NOT NULL,
        source_entity_type TEXT,
        source_entity_id INTEGER,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        prompt_hash TEXT,
        generated_at INTEGER NOT NULL,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ai_provenance_target ON ai_provenance(target_entity_type, target_entity_id);

      CREATE TABLE IF NOT EXISTS media_files (
        media_key TEXT PRIMARY KEY,
        note_id INTEGER,
        file_path TEXT,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        checksum TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_media_files_note ON media_files(note_id);
    `,
  },
  {
    version: 11,
    description:
      'Item changes log, AI operations audit in SQLite, note revisions, sync conflicts, and local snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS item_changes (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        version INTEGER NOT NULL,
        changed_at INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_item_changes_state ON item_changes(sync_state, changed_at);
      CREATE INDEX IF NOT EXISTS idx_item_changes_entity ON item_changes(entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS ai_operations (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        input_characters INTEGER NOT NULL,
        output_characters INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_operations_created ON ai_operations(created_at DESC);

      ALTER TABLE cloud_sync_queue ADD COLUMN next_attempt_at INTEGER;
      ALTER TABLE cloud_sync_queue ADD COLUMN error_code TEXT;

      CREATE TABLE IF NOT EXISTS note_revisions (
        id TEXT PRIMARY KEY,
        note_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        reason TEXT,
        source TEXT,
        content_hash TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, version_number DESC);

      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_version_id TEXT NOT NULL,
        remote_version_id TEXT NOT NULL,
        local_payload TEXT NOT NULL,
        remote_payload TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
      );

      CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status);

      CREATE TABLE IF NOT EXISTS local_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_type TEXT NOT NULL,
        notes_count INTEGER NOT NULL,
        events_count INTEGER NOT NULL,
        payload_blob TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_snapshots_type ON local_snapshots(snapshot_type, created_at DESC);
    `,
  },
  {
    version: 12,
    description:
      'Durable search index job recovery fields, AI mutations log, and unified capture inbox',
    sql: `
      ALTER TABLE search_index_jobs ADD COLUMN next_attempt_at INTEGER;
      ALTER TABLE search_index_jobs ADD COLUMN locked_at INTEGER;

      CREATE TABLE IF NOT EXISTS ai_mutations (
        operation_id TEXT PRIMARY KEY,
        note_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_revision_id TEXT,
        diff_summary TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_mutations_note ON ai_mutations(note_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS capture_inbox (
        id TEXT PRIMARY KEY,
        input_type TEXT NOT NULL,
        raw_content TEXT,
        source TEXT,
        proposal_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        note_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_capture_inbox_status ON capture_inbox(status, created_at DESC);
    `,
  },
];
