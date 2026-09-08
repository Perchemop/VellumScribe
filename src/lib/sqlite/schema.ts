/**
 * VellumScribe Relational SQLite Schema & Versioned Migrations
 */

export const DB_SCHEMA_VERSION = 4;
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
      ALTER TABLE notes ADD COLUMN cloud_save_enabled INTEGER NOT NULL DEFAULT 1;
    `,
  },
];
