import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  CloudAccount,
  ConflictLog,
  DocumentVersion,
  SyncTelemetry,
} from '../types';

/**
 * Clean baseline data structures for a fresh install.
 * Starts completely empty so the user experiences the raw app immediately.
 */
export const INITIAL_EVENTS: EventRecord[] = [];

export const INITIAL_NOTES: NoteRecord[] = [];

export const INITIAL_RECORDINGS: RecordingRecord[] = [];

export const INITIAL_TRANSCRIPTS: TranscriptRecord[] = [];

export const INITIAL_OCR_SCANS: OcrScanRecord[] = [];

export const INITIAL_CLOUD_ACCOUNTS: CloudAccount[] = [
  {
    provider: 'google_drive',
    connected: false,
    cloud_backup_path: '/Google Drive/VellumScribe_Backups/',
  },
  {
    provider: 'dropbox',
    connected: false,
    cloud_backup_path: '/Dropbox/Apps/VellumScribe_Backups/',
  },
  {
    provider: 'onedrive',
    connected: false,
    cloud_backup_path: '/OneDrive/Apps/VellumScribe/',
  },
  {
    provider: 'icloud',
    connected: false,
    cloud_backup_path: '/iCloud Drive/VellumScribe/',
  },
  {
    provider: 'nextcloud',
    connected: false,
    cloud_backup_path: '/remote.php/dav/files/user/VellumScribe/',
  },
  {
    provider: 's3',
    connected: false,
    cloud_backup_path: 's3://vellumscribe-backups/',
  },
];

export const INITIAL_CONFLICT_LOGS: ConflictLog[] = [];

export const INITIAL_VERSIONS: DocumentVersion[] = [];

export const INITIAL_DOCUMENT_VERSIONS = INITIAL_VERSIONS;

export const INITIAL_TELEMETRY: SyncTelemetry[] = [];

export const INITIAL_SYNC_TELEMETRY = INITIAL_TELEMETRY;
