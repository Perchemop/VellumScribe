-- Migration 006: Offline AI Speech-to-Text & Transcriptions Architecture
-- Supports whisper.cpp, local on-device VAD, timestamped segments, and speaker diarization

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
