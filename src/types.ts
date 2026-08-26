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
  cloud_save_enabled?: boolean; // When false or undefined, stored strictly on local device
  version?: number;
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

export type CloudStorageProvider = 
  | 'google_drive' 
  | 'dropbox' 
  | 'onedrive' 
  | 'icloud' 
  | 'nextcloud' 
  | 's3';

export type BackupFrequency = 'never' | '5m' | '15m' | '1h' | 'daily' | 'manual';

export interface CloudAccount {
  id?: string;
  provider: CloudStorageProvider;
  connected: boolean;
  user_email?: string;
  user_name?: string;
  account_email?: string;
  display_name?: string;
  access_token?: string;
  refresh_token_alias?: string;
  token_expiry?: string;
  oauth_scopes?: string[];
  oauth_token_type?: string;
  oauth_client_id?: string;
  cloud_backup_path: string;
  last_synced_at?: string;
  storage_used_bytes?: number;
  storage_total_bytes?: number;
  quota_used_bytes?: number;
  quota_total_bytes?: number;
  auth_status?: string;
  sso_provider?: string;
  sso_auth_mode?: 'sso_oauth' | 'sso_oidc' | 'sso_saml' | 'api_credential';
  sso_session_id?: string;
  sso_idp_name?: string;
  server_url?: string; // For WebDAV/Nextcloud/S3 custom endpoints
  bucket_name?: string; // For S3/MinIO
}

export type ConflictStrategy = 
  | 'last_write_wins' 
  | 'gemini_intelligent_merge' 
  | 'local_priority' 
  | 'remote_priority' 
  | 'manual_diff';

export interface ConflictLog {
  id: string;
  timestamp?: string;
  created_at?: string;
  resolved_at?: string;
  document_type?: 'note' | 'sqlite_db' | 'recording';
  document_id: number;
  document_title: string;
  local_version_id?: number;
  remote_version_id?: number;
  local_version?: number;
  remote_version?: number;
  local_content: string;
  remote_content: string;
  base_content?: string;
  resolution_strategy?: ConflictStrategy;
  strategy_used?: ConflictStrategy;
  resolved_content?: string;
  status: 'resolved' | 'pending' | 'flagged';
  resolved_by?: 'system_auto' | 'gemini_ai' | 'user_manual';
  notes?: string;
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

export interface SyncTelemetry {
  sync_id: string;
  timestamp: string;
  provider: CloudStorageProvider | 'dual_cloud' | 'multi_cloud';
  status: 'success' | 'failed' | 'conflict_detected' | 'stalled';
  duration_ms: number;
  bytes_transferred: number;
  items_synced?: number;
  records_uploaded?: number;
  records_downloaded?: number;
  conflicts_encountered: number;
  auto_triggered?: boolean;
  error_message?: string;
  backup_file_name?: string;
}

export interface KeystoreSecret {
  alias: string;
  key_type: 'api_key' | 'oauth_refresh_token' | 'sqlite_cipher_key';
  masked_value: string;
  created_at: string;
  hardware_backed: boolean;
  algorithm: 'AES-256-GCM' | 'RSA-4096';
}
