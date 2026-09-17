import { AppLogger } from './logger';
import { SqliteRepository } from './sqlite/sqliteRepository';

/**
 * SearchIndexQueue
 * Decouples FTS full-text search indexing from user typing latency.
 * Queues modified note IDs and batches index re-computations asynchronously.
 */
export class SearchIndexQueue {
  private static pendingIds: Set<number> = new Set();
  private static debounceTimer: any = null;
  private static readonly BATCH_DEBOUNCE_MS = 1000;

  /**
   * Enqueue a note ID for asynchronous FTS re-indexing
   */
  public static enqueue(noteId: number): void {
    if (!noteId) return;
    this.pendingIds.add(noteId);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush().catch((err) => {
        AppLogger.warn('SearchIndexQueue', 'Error during batched search reindexing', err);
      });
    }, this.BATCH_DEBOUNCE_MS);
  }

  /**
   * Drain and return all currently pending IDs immediately
   */
  public static drain(): number[] {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const ids = Array.from(this.pendingIds);
    this.pendingIds.clear();
    return ids;
  }

  /**
   * Immediately re-index all pending notes
   */
  public static async flush(): Promise<void> {
    const ids = this.drain();
    if (ids.length === 0) return;

    try {
      SqliteRepository.reindexNotes(ids);
      AppLogger.info('SearchIndexQueue', `Successfully indexed ${ids.length} note(s) into SQLite FTS`);
    } catch (e) {
      AppLogger.error('SearchIndexQueue', 'Failed to batch reindex notes in FTS', e);
    }
  }
}
