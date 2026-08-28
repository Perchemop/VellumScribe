import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  DocumentVersion,
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

export const INITIAL_VERSIONS: DocumentVersion[] = [];

export const INITIAL_DOCUMENT_VERSIONS = INITIAL_VERSIONS;
