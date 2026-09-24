import { StorageManager } from './storage';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { AppLogger } from './logger';
import { EventRecord, NoteRecord, RecordingRecord, TranscriptRecord, OcrScanRecord } from '../types';

export interface ImportPreviewResult {
  valid: boolean;
  format: string;
  version: string;
  counts: {
    notes: number;
    events: number;
    recordings: number;
    transcripts: number;
    ocrScans: number;
  };
  warnings: string[];
  error?: string;
  payload?: any;
}

export interface ImportExecutionResult {
  success: boolean;
  message: string;
  counts?: {
    notes: number;
    events: number;
    recordings: number;
    transcripts: number;
    ocrScans: number;
  };
  error?: string;
  rollbackOccurred?: boolean;
}

export class ImportSafetyPipeline {
  private static lastSafetyBackup: string | null = null;

  /**
   * Stage 1 & 2 & 3: Validate Format, Validate Version, and Generate Entity Preview
   */
  public static validateAndPreview(rawJson: string): ImportPreviewResult {
    const warnings: string[] = [];

    // Stage 1: Validate Format (JSON Structure)
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e: any) {
      return {
        valid: false,
        format: 'unknown',
        version: 'unknown',
        counts: { notes: 0, events: 0, recordings: 0, transcripts: 0, ocrScans: 0 },
        warnings: [],
        error: `Invalid JSON syntax: ${e?.message || 'Failed to parse file.'}`,
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        format: 'unknown',
        version: 'unknown',
        counts: { notes: 0, events: 0, recordings: 0, transcripts: 0, ocrScans: 0 },
        warnings: [],
        error: 'Invalid payload: Root must be an object.',
      };
    }

    // Identify format & schema container
    let format = parsed.format || (parsed.database_type ? 'sqlite_dump' : 'vellumscribe_generic');
    let version = String(parsed.version || '3.0');
    let schema = parsed.schema || parsed;

    // Direct notes array support
    if (Array.isArray(parsed)) {
      schema = { notes: parsed };
      format = 'raw_notes_array';
      version = '1.0';
      warnings.push('Legacy flat array detected. Default categories will be assigned.');
    }

    // Stage 2: Validate Version
    const majorVersion = parseInt(version.split('.')[0], 10);
    if (!isNaN(majorVersion) && majorVersion > 3) {
      return {
        valid: false,
        format,
        version,
        counts: { notes: 0, events: 0, recordings: 0, transcripts: 0, ocrScans: 0 },
        warnings,
        error: `Incompatible future schema version v${version}. This build supports schema versions up to v3.x.`,
      };
    }

    if (!schema.notes && !Array.isArray(parsed.notes)) {
      return {
        valid: false,
        format,
        version,
        counts: { notes: 0, events: 0, recordings: 0, transcripts: 0, ocrScans: 0 },
        warnings,
        error: 'Missing notes collection: The backup contains no recognizable note records.',
      };
    }

    const notesList: NoteRecord[] = Array.isArray(schema.notes) ? schema.notes : Array.isArray(parsed.notes) ? parsed.notes : [];
    const eventsList: EventRecord[] = Array.isArray(schema.events) ? schema.events : [];
    const recordingsList: RecordingRecord[] = Array.isArray(schema.recordings) ? schema.recordings : [];
    const transcriptsList: TranscriptRecord[] = Array.isArray(schema.transcripts) ? schema.transcripts : [];
    const ocrScansList: OcrScanRecord[] = Array.isArray(schema.ocr_scans) ? schema.ocr_scans : [];

    // Check basic entity structure
    for (const note of notesList) {
      if (!note || typeof note !== 'object') {
        warnings.push('Encountered non-object note item in array.');
        continue;
      }
      if (typeof note.body !== 'string' && typeof (note as any).content !== 'string') {
        warnings.push(`Note ID ${note.id || 'unassigned'} is missing body text.`);
      }
    }

    return {
      valid: true,
      format,
      version,
      counts: {
        notes: notesList.length,
        events: eventsList.length,
        recordings: recordingsList.length,
        transcripts: transcriptsList.length,
        ocrScans: ocrScansList.length,
      },
      warnings,
      payload: {
        events: eventsList,
        notes: notesList,
        recordings: recordingsList,
        transcripts: transcriptsList,
        ocrScans: ocrScansList,
      },
    };
  }

  /**
   * Stage 4: Take Pre-Import Safety Snapshot Backup
   */
  public static createSafetyBackup(): string {
    const backup = StorageManager.exportFullDump();
    this.lastSafetyBackup = backup;
    AppLogger.info('ImportSafetyPipeline', 'Created pre-import safety backup snapshot.');
    return backup;
  }

  /**
   * Get the last safety backup for rollback if needed
   */
  public static getLastSafetyBackup(): string | null {
    return this.lastSafetyBackup;
  }

  /**
   * Stage 5 & 6: Execute Transactional Import and Run SQLite Integrity Check
   */
  public static async executeImport(rawJson: string): Promise<ImportExecutionResult> {
    // 1. Validate Format & Version
    const preview = this.validateAndPreview(rawJson);
    if (!preview.valid || !preview.payload) {
      return {
        success: false,
        message: preview.error || 'Validation failed.',
        error: preview.error,
      };
    }

    // 2. Safety Backup
    const safetySnapshot = this.createSafetyBackup();

    // 3. Execute Transactional Import
    const { events, notes, recordings, transcripts, ocrScans } = preview.payload;
    const db = getDatabaseAdapter();
    await db.initialize();

    try {
      await db.transaction(async () => {
        // Import events first
        if (Array.isArray(events)) {
          for (const ev of events) {
            SqliteRepository.saveEvent(ev);
          }
        }

        // Import notes
        for (const note of notes) {
          // Normalize legacy fields if present
          const normalizedNote: NoteRecord = {
            ...note,
            body: typeof note.body === 'string' ? note.body : ((note as any).content || ''),
            title: typeof note.title === 'string' ? note.title : 'Untitled',
            updated_at: note.updated_at || new Date().toISOString(),
          };
          SqliteRepository.saveNote(normalizedNote);
        }

        // Import recordings
        if (Array.isArray(recordings)) {
          for (const rec of recordings) {
            SqliteRepository.saveRecording(rec);
          }
        }

        // Import transcripts
        if (Array.isArray(transcripts)) {
          for (const tr of transcripts) {
            SqliteRepository.saveTranscript(tr);
          }
        }

        // Import OCR scans
        if (Array.isArray(ocrScans)) {
          for (const scan of ocrScans) {
            SqliteRepository.saveOcrScan(scan);
          }
        }
      });

      // Stage 6: Database Integrity Check via DatabaseAdapter
      const integrity = await db.checkIntegrity();
      if (!integrity.ok) {
        throw new Error(`Database integrity failure after import: ${integrity.result}`);
      }

      // Flush to disk/IndexedDB if supported
      if (db.flush) {
        await db.flush();
      }
      StorageManager.refreshCaches();

      AppLogger.info('ImportSafetyPipeline', `Successfully imported ${notes.length} notes with full integrity verification.`);

      return {
        success: true,
        message: `Successfully verified and imported ${notes.length} notes and ${events.length} categories.`,
        counts: preview.counts,
      };
    } catch (importErr: any) {
      AppLogger.error('ImportSafetyPipeline', 'Import execution failed; initiating automatic rollback', importErr);

      // Rollback to safety snapshot
      try {
        if (safetySnapshot) {
          StorageManager.importFullDump(safetySnapshot);
          if (db.flush) {
            await db.flush();
          }
          StorageManager.refreshCaches();
        }
      } catch (rollbackErr) {
        AppLogger.error('ImportSafetyPipeline', 'Rollback attempt encountered error', rollbackErr);
      }

      return {
        success: false,
        message: `Import failed and changes were safely rolled back: ${importErr?.message || 'Database error'}`,
        error: importErr?.message,
        rollbackOccurred: true,
      };
    }
  }
}
