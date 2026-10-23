export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  is_completed?: boolean;
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
  sketch_media_key?: string; // Reference to binary sketch payload
  status?: 'active' | 'archived' | 'trash'; // Omni-Notes lifecycle
  archived_at?: string;
  trashed_at?: string;
  color?: string; // Card tint / label color
  reminder_at?: string; // ISO timestamp for alarms/reminders
  location_name?: string; // Geotag place name / address
  latitude?: number;
  longitude?: number;
  is_locked?: boolean; // Password/PIN protected
  lock_mode?: 'standard' | 'private'; // 'standard': body/attachments encrypted; 'private': title/tags/metadata masked and encrypted
  security_type?: 'pin' | 'passphrase'; // 'pin': 4-8 digits; 'passphrase': 12+ characters
  pin_hash?: string; // Salted PBKDF2 hash of security PIN or passphrase
  pin_salt?: string; // Cryptographic salt for PIN/passphrase hashing
  lock_pin?: string; // Legacy plaintext PIN (automatically upgraded on verification)
  encrypted_payload?: string; // AES-256-GCM encrypted payload { title?, body, checklist_items, sketch_data, tags? }
  created_at: string; // ISO string
  updated_at?: string;
  tags?: string[];
  is_pinned?: boolean;
  version?: number;
  cloud_save_enabled?: boolean;
}

export type CloudStorageProvider = 'google_drive' | 'microsoft' | 'nextcloud' | 'webdav';

export type SyncState = 'idle' | 'queued' | 'preparing' | 'uploading' | 'verifying' | 'completed' | 'partial_failure' | 'failed';

export interface SyncHistoryRecord {
  id: string;
  provider: CloudStorageProvider;
  startTime: string; // ISO string
  endTime: string; // ISO string
  backupSize: number; // in bytes
  dbVersion: number;
  checksum: string;
  status: 'completed' | 'failed' | 'partial_failure';
  errorMessage?: string;
}

export interface CloudAccount {
  provider: CloudStorageProvider;
  accountId: string;
  email: string;
  displayName: string;
  connectedAt: string; // ISO timestamp
  serverUrl?: string; // WebDAV / Nextcloud instance URL
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
  media_key?: string;
  sample_rate?: number;
  bitrate_kbps?: number;
  created_at: string;
  checksum?: string;
  duration_ms?: number;
  mime_type?: string;
  channels?: number;
  status?: string;
}

export interface TranscriptRecord {
  id: number;
  recording_id: number;
  transcript_text: string;
  created_at: string;
  confidence?: number;
  speaker_count?: number;
  is_partial?: boolean;
  completed_segments?: number;
  total_segments?: number;
  session_id?: string;
}

export interface TranscriptionSegment {
  index: number;
  startSec: number;
  endSec: number;
  startStr: string;
  endStr: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  text?: string;
  error?: string;
}

export interface TranscriptionProgress {
  percent: number; // 0 to 100
  status: string; // User-facing status label
  phase: 'idle' | 'preparing' | 'uploading' | 'transcribing' | 'completed' | 'error' | 'paused';
  currentSegment?: number;
  totalSegments?: number;
  startStr?: string;
  endStr?: string;
  partialTranscript?: string;
  completedSegmentsCount?: number;
  sessionId?: string;
  error?: string;
  canResume?: boolean;
}

export interface PartialTranscriptionSession {
  sessionId: string;
  recordingId?: number | string;
  mediaKey?: string;
  audioDurationSeconds: number;
  totalSegments: number;
  completedSegments: {
    index: number;
    startStr: string;
    endStr: string;
    text: string;
  }[];
  nextSegmentIndex: number;
  partialTranscript: string;
  lastError?: string;
  status: 'in_progress' | 'paused' | 'failed' | 'completed';
  updatedAt: string;
}

export interface OcrScanRecord {
  id: number;
  note_id: number;
  image_path: string;
  ocr_text: string;
  created_at: string;
  image_preview?: string;
  media_key?: string;
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
  key_type: 'api_key' | 'sqlite_cipher_key' | 'cloud_credential';
  masked_value: string;
  created_at: string;
  hardware_backed: boolean;
  algorithm: 'AES-256-GCM' | 'RSA-4096';
}

// --- OFFLINE ON-DEVICE AI TRANSCRIPTION SPECIFICATION TYPES ---

export type SpeechModelEngine = 'whisper.cpp' | 'local_whisper' | 'offline_acoustic';

export type SpeechModelProfile = {
  id: string;
  displayName: string;
  engine: SpeechModelEngine;
  languageMode: 'multilingual' | 'english';
  quantization?: string;
  downloadBytes: number | null;
  minimumRamMb: number | null;
  recommendedRamMb: number | null;
  accuracyClass: 'fast' | 'balanced' | 'accurate';
  installed: boolean;
  installedSizeBytes?: number;
  sha256: string;
  license: string;
  version?: string;
  description?: string;
};

export interface AiCapabilities {
  availableRamMb: number | null;
  totalRamMb?: number | null;
  cpuCores: number | null;
  architecture: string | null;
  androidApiLevel: number | null;
  availableStorageMb: number | null;
  freeSpaceMb?: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  recommendedModelId: string;
  isNativeEngineAvailable?: boolean;
  nativeLibraryLoaded?: boolean;
  inferenceRuntimeReady?: boolean;
}

export type TranscriptionDurableStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'PREPROCESSING'
  | 'TRANSCRIBING'
  | 'MERGING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'WAITING_FOR_MODEL';

export type OfflineAiErrorCode =
  | 'OFFLINE_AI_MODEL_MISSING'
  | 'OFFLINE_AI_MODEL_INVALID'
  | 'OFFLINE_AI_MODEL_CORRUPT'
  | 'OFFLINE_AI_UNSUPPORTED_DEVICE'
  | 'OFFLINE_AI_AUDIO_INVALID'
  | 'OFFLINE_AI_AUDIO_TOO_LARGE'
  | 'OFFLINE_AI_STORAGE_LOW'
  | 'OFFLINE_AI_CANCELLED'
  | 'OFFLINE_AI_ENGINE_FAILURE'
  | 'OFFLINE_AI_DATABASE_FAILURE'
  | 'OFFLINE_AI_ENCRYPTION_FAILURE'
  | 'OFFLINE_AI_UNKNOWN';

export interface TranscriptionEntity {
  id: number;
  recording_id: number;
  engine: string;
  engine_version?: string;
  model_id: string;
  model_checksum?: string;
  language?: string;
  status: TranscriptionDurableStatus;
  text?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error_code?: OfflineAiErrorCode | string;
  error_message?: string;
}

export interface TranscriptionSegmentRecord {
  id?: number;
  transcription_id: number;
  sequence: number;
  start_ms: number;
  end_ms: number;
  speaker_id?: string | null;
  text: string;
  confidence?: number | null; // Never fabricate; null when unavailable
}

export interface TranscriptionSpeakerRecord {
  id?: number;
  transcription_id: number;
  speaker_id: string;
  label: string;
  name?: string | null;
}

export interface VadSegment {
  startMs: number;
  endMs: number;
  speechProbability?: number | null;
}

export interface ModelInstallResult {
  modelId: string;
  installed: boolean;
  bytesWritten?: number;
  checksumVerified?: boolean;
  error?: string;
}

export interface TranscriptionJobStatus {
  jobId: string;
  recordingId: number;
  status: TranscriptionDurableStatus;
  progressPercent: number;
  currentChunk?: number;
  totalChunks?: number;
  phaseLabel: string;
  transcript?: string;
  error?: string;
}

export interface StructuredAiActionItem {
  text: string;
  owner: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'unknown';
  sourceSegments: number[];
}

export interface StructuredAiExtraction {
  summary: string;
  actionItems: StructuredAiActionItem[];
  decisions: Array<{ text: string; sourceSegments: number[] }>;
  risks: Array<{ text: string; sourceSegments: number[] }>;
  entities: Array<{ name: string; type: string; sourceSegments: number[] }>;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; cause?: unknown };

export interface AiAction {
  type: 'create_note' | 'update_note' | 'create_checklist' | 'create_reminder' | 'search_notes' | 'delete_note';
  description: string;
  requiresConfirmation?: boolean;
  payload: Record<string, unknown>;
}

export interface AiCommandResult {
  intent:
    | 'create_note'
    | 'update_note'
    | 'create_task'
    | 'create_reminder'
    | 'summarize'
    | 'search'
    | 'unknown';
  confidence: number;
  actions: AiAction[];
  clarification?: string;
}

export interface ItemChangeRecord {
  id: string;
  entity_type: 'note' | 'event' | 'recording' | 'checklist' | 'media';
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  version: number;
  changed_at: number;
  payload_hash: string;
  sync_state: 'pending' | 'syncing' | 'synced' | 'failed';
}

export interface AiOperationRecord {
  id: string;
  operation: string;
  provider: string;
  model: string;
  duration_ms: number;
  input_characters: number;
  output_characters: number;
  status: 'success' | 'error';
  created_at: number;
}

export interface NoteRevisionRecord {
  id: string;
  note_id: number;
  version_number: number;
  title: string;
  body: string;
  created_at: number;
  reason?: string;
  source?: string;
  content_hash: string;
}

export interface SyncConflictRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  local_version_id: string;
  remote_version_id: string;
  local_payload: string;
  remote_payload: string;
  detected_at: number;
  status: 'open' | 'resolved' | 'ignored';
}

export interface LocalSnapshotRecord {
  id: string;
  snapshot_type: 'latest' | 'yesterday' | '7days' | '4weeks' | 'manual';
  notes_count: number;
  events_count: number;
  payload_blob: string;
  created_at: number;
}


