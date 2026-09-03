import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  DocumentVersion,
} from '../types';

/**
 * Clean baseline data structures for fresh workspaces.
 * Starts completely empty by default.
 */
export const INITIAL_EVENTS: EventRecord[] = [];
export const INITIAL_NOTES: NoteRecord[] = [];
export const INITIAL_RECORDINGS: RecordingRecord[] = [];
export const INITIAL_TRANSCRIPTS: TranscriptRecord[] = [];
export const INITIAL_OCR_SCANS: OcrScanRecord[] = [];
export const INITIAL_VERSIONS: DocumentVersion[] = [];
export const INITIAL_DOCUMENT_VERSIONS = INITIAL_VERSIONS;

/**
 * Opt-in Sample Demo Data for users who wish to explore features with preloaded notes
 */
export const DEMO_SAMPLE_EVENTS: EventRecord[] = [
  {
    id: 1,
    title: 'Design & Architecture',
    event_date: new Date().toISOString().slice(0, 10),
    category: 'sprint',
    color: '#3b82f6',
    description: 'VellumScribe engineering & architecture notes',
  },
  {
    id: 2,
    title: 'Personal Journal',
    event_date: new Date().toISOString().slice(0, 10),
    category: 'personal',
    color: '#10b981',
    description: 'Daily reflections and personal checklists',
  },
];

export const DEMO_SAMPLE_NOTES: NoteRecord[] = [
  {
    id: 101,
    event_id: 1,
    title: 'Welcome to VellumScribe (SQLite-Powered)',
    body: `### Welcome to VellumScribe 3.0\n\nVellumScribe is a 100% offline-first, private multimodal notes studio backed by **SQLite** as its authoritative relational database engine.\n\n#### Key Capabilities:\n- **Authoritative SQLite Engine**: Versioned migrations, relational tables for notes, tags, checklists, recordings, and OCR.\n- **Full-Text Search (FTS)**: Fast on-device search across note titles, Markdown bodies, checklists, and transcripts.\n- **Private Offline Mode**: Full air-gapped protection blocking all external network traffic.\n- **Multimodal**: Audio recording, interactive checklists, sketch canvas, OCR scans, and local AI synthesis.`,
    note_type: 'text',
    color: '#e0e7ff',
    is_pinned: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    tags: ['welcome', 'sqlite', 'offline'],
    checklist_items: [
      { id: 'chk_1', text: 'Explore SQLite Full-Text Search', completed: true },
      { id: 'chk_2', text: 'Try Private Offline Mode in Settings', completed: false },
      { id: 'chk_3', text: 'Test Audio Recording or OCR Scanner', completed: false },
    ],
  },
  {
    id: 102,
    event_id: 2,
    title: 'Daily Goals & Checklist',
    body: 'Priority focus items for today. Check items off as they are completed.',
    note_type: 'checklist',
    color: '#d1fae5',
    is_pinned: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    tags: ['goals', 'productivity'],
    checklist_items: [
      { id: 'chk_4', text: 'Review project architecture findings', completed: true },
      { id: 'chk_5', text: 'Verify database integrity in Storage Dashboard', completed: false },
    ],
  },
];
