import { DocumentVersion, NoteRecord } from '../types';
import { INITIAL_DOCUMENT_VERSIONS } from './sampleData';
import { StorageManager } from './storage';
import { toHex } from './cryptoUtils';

const STORAGE_KEYS = {
  VERSIONS: 'vellumscribe_doc_versions_v1',
};

/**
 * Local-only document revision history engine.
 * Captures point-in-time snapshots of notes when major changes, sketches, OCR, or AI summaries occur.
 */
export class VersionControlManager {
  public static getVersionsForNote(noteId: number): DocumentVersion[] {
    const all = StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
    return all.filter((v) => v.note_id === noteId);
  }

  public static getAllVersions(): DocumentVersion[] {
    return StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
  }

  public static async saveVersionSnapshot(
    note: NoteRecord,
    author = 'Local User',
    summary = 'Manual edit'
  ): Promise<DocumentVersion> {
    const versions = this.getAllVersions();
    const noteVersions = versions.filter((v) => v.note_id === note.id);
    const nextVersionNum = (note.version || noteVersions.length || 0) + 1;

    // Compute simple deterministic checksum of body
    let checksum = '';
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(note.body || '');
      const hashBuf = await crypto.subtle.digest('SHA-256', data);
      checksum = toHex(hashBuf).slice(0, 16);
    } catch {
      checksum = `chk_${Date.now().toString(36)}`;
    }

    const newVersion: DocumentVersion = {
      id: `ver_${note.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      version_id: nextVersionNum,
      version_number: nextVersionNum,
      note_id: note.id,
      document_id: note.id,
      title: note.title,
      body: note.body || '',
      created_at: new Date().toISOString(),
      author,
      change_summary: summary,
      checksum,
    };

    versions.unshift(newVersion);
    // Keep max 500 version records locally
    StorageManager.setItem(STORAGE_KEYS.VERSIONS, versions.slice(0, 500));

    // Update note's version count in storage
    StorageManager.updateNote(note.id, { version: nextVersionNum });

    return newVersion;
  }

  public static deleteVersionsForNote(noteId: number): void {
    const versions = this.getAllVersions().filter((v) => v.note_id !== noteId);
    StorageManager.setItem(STORAGE_KEYS.VERSIONS, versions);
  }
}
