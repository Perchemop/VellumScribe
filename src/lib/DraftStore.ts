import { AppLogger } from './logger';

export interface DraftJournalEntry {
  noteId: number;
  revision: number;
  title: string;
  body: string;
  savedAt: number;
}

export type NoteDraft = DraftJournalEntry;

const STORAGE_KEY_PREFIX = 'vellumscribe_draft_';

/**
 * DraftStore manages volatile editor drafts to protect against accidental browser crashes,
 * tab closures, or sudden process death before SQLite transactions commit.
 */
export class DraftStore {
  /**
   * Save a draft journal entry
   */
  public static write(entry: DraftJournalEntry): void {
    if (typeof sessionStorage === 'undefined' && typeof localStorage === 'undefined') return;
    try {
      const serialized = JSON.stringify(entry);
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${entry.noteId}`, serialized);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${entry.noteId}`, serialized);
    } catch (e) {
      AppLogger.warn('DraftStore', 'Failed to write draft journal entry', e);
    }
  }

  /**
   * Find a draft newer than the persisted note updated_at timestamp
   */
  public static findNewerDraft(noteId: number, lastSavedAtIso?: string): DraftJournalEntry | null {
    if (typeof sessionStorage === 'undefined' && typeof localStorage === 'undefined') return null;
    try {
      const key = `${STORAGE_KEY_PREFIX}${noteId}`;
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) return null;

      const draft: DraftJournalEntry = JSON.parse(raw);
      if (!draft || draft.noteId !== noteId) return null;

      if (!lastSavedAtIso) return draft;
      const lastSavedTime = new Date(lastSavedAtIso).getTime();

      // If draft was recorded at least 1.5s after the last persisted database timestamp
      if (draft.savedAt > lastSavedTime + 1500) {
        return draft;
      }
      return null;
    } catch (e) {
      AppLogger.warn('DraftStore', 'Failed to read draft journal entry', e);
      return null;
    }
  }

  /**
   * Clear draft journal entry once persisted or explicitly discarded
   */
  public static clear(noteId: number): void {
    if (typeof sessionStorage === 'undefined' && typeof localStorage === 'undefined') return;
    try {
      const key = `${STORAGE_KEY_PREFIX}${noteId}`;
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch (e) {
      AppLogger.warn('DraftStore', 'Failed to clear draft journal entry', e);
    }
  }
}
