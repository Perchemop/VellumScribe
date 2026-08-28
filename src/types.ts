export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface EventRecord {
  id: number;
  title: string;
  event_date: string; // ISO string e.g. "2026-08-22"
  description?: string;
  location?: string;
  category?: 'meeting' | 'sprint' | 'interview' | 'lecture' | 'brainstorm' | 'personal' | 'todo';
  color?: string; // Hex color tag (e.g. #3b82f6, #10b981, #f59e0b, #ec4899, #8b5cf6)
}

export interface NoteRecord {
  id: number;
  event_id: number;
  title?: string;
  body: string; // Markdown text
  note_type?: 'text' | 'checklist' | 'sketch';
  checklist_items?: ChecklistItem[];
  sketch_data?: string; // Data URL for sketch drawing canvas
  status?: 'active' | 'archived' | 'trash'; // Omni-Notes lifecycle
  archived_at?: string;
  trashed_at?: string;
  color?: string; // Card tint / label color
  reminder_at?: string; // ISO timestamp for alarms/reminders
  location_name?: string; // Geotag place name / address
  latitude?: number;
  longitude?: number;
  is_locked?: boolean; // Password/PIN protected
  pin_hash?: string; // Salted PBKDF2 hash of security PIN
  pin_salt?: string; // Cryptographic salt for PIN hashing
  lock_pin?: string; // Legacy plaintext PIN (automatically upgraded on verification)
  encrypted_payload?: string; // AES-256-GCM encrypted payload { body, checklist_items, sketch_data }
  created_at: string; // ISO string
  updated_at?: string;
  tags?: string[];
  is_pinned?: boolean;
  version?: number;
  cloud_save_enabled?: boolean;
}

export type CloudStorageProvider = 'google_drive' | 'microsoft';

export interface CloudAccount {
  provider: CloudStorageProvider;
  accountId: string;
  email: string;
  displayName: string;
  connectedAt: string; // ISO timestamp
}

export interface SyncTelemetry {
  provider: CloudStorageProvider;
  lastSyncAt: string; // ISO timestamp
  lastSyncStatus: 'success' | 'error';
  lastSyncError?: string;
  lastTransferBytes?: number;
  lastTransferDurationMs?: number;
}

export interface RecordingRecord {
  id: number;
  note_id: number;
  file_path: string;
  file_size: number; // in bytes
  duration_seconds: number;
  audio_url?: string;
  sample_rate?: number;
  bitrate_kbps?: number;
  created_at: string;
}

export interface TranscriptRecord {
  id: number;
  recording_id: number;
  transcript_text: string;
  created_at: string;
  confidence?: number;
  speaker_count?: number;
}

export interface OcrScanRecord {
  id: number;
  note_id: number;
  image_path: string;
  ocr_text: string;
  created_at: string;
  image_preview?: string;
  confidence?: number;
}

export interface DocumentVersion {
  id?: string;
  version_id?: number;
  version_number?: number;
  note_id?: number;
  document_id?: number;
  title?: string;
  body: string;
  created_at: string;
  author: string;
  change_summary: string;
  checksum?: string;
}

export interface KeystoreSecret {
  alias: string;
  key_type: 'api_key' | 'sqlite_cipher_key';
  masked_value: string;
  created_at: string;
  hardware_backed: boolean;
  algorithm: 'AES-256-GCM' | 'RSA-4096';
}
