import { AppLogger } from './logger';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { SqliteEngine } from './sqlite/sqliteEngine';

/**
 * SearchIndexQueue
 * Decouples FTS full-text search indexing from user typing latency.
 * Uses a durable SQLite queue table (search_index_jobs) so pending index jobs
 * survive app restarts and reloads without index drift.
 */
export class SearchIndexQueue {
  private static debounceTimer: any = null;
  private static readonly BATCH_DEBOUNCE_MS = 1000;
  private static isProcessing = false;

  /**
   * Enqueue a note ID into durable SQLite queue for asynchronous FTS re-indexing
   */
  public static enqueue(noteId: number): void {
    if (!noteId) return;

    try {
      const now = Date.now();
      SqliteEngine.run(
        `INSERT INTO search_index_jobs (note_id, status, attempts, created_at, updated_at)
         VALUES (?, 'pending', 0, ?, ?)
         ON CONFLICT(note_id) DO UPDATE SET status = 'pending', updated_at = ?`,
        [noteId, now, now, now]
      );
    } catch (err) {
      AppLogger.warn('SearchIndexQueue', `Failed to enqueue note ${noteId} to SQLite queue`, err);
    }

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
   * Drain and return pending note IDs from the durable SQLite table
   */
  public static getPendingNoteIds(limit: number = 50): number[] {
    try {
      const rows = SqliteEngine.query<{ note_id: number }>(
        `SELECT note_id FROM search_index_jobs WHERE status = 'pending' ORDER BY updated_at ASC LIMIT ?`,
        [limit]
      );
      return rows.map((r) => r.note_id);
    } catch {
      return [];
    }
  }

  /**
   * Immediately re-index all pending notes from the durable SQLite queue
   */
  public static async flush(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    try {
      const ids = this.getPendingNoteIds(50);
      if (ids.length === 0) {
        this.isProcessing = false;
        return;
      }

      SqliteRepository.reindexNotes(ids);

      const placeholders = ids.map(() => '?').join(',');
      const now = Date.now();
      SqliteEngine.run(
        `UPDATE search_index_jobs SET status = 'completed', updated_at = ? WHERE note_id IN (${placeholders})`,
        [now, ...ids]
      );

      // Clean up old completed jobs periodically
      SqliteEngine.run(
        `DELETE FROM search_index_jobs WHERE status = 'completed' AND updated_at < ?`,
        [now - 24 * 3600 * 1000]
      );

      AppLogger.info('SearchIndexQueue', `Successfully indexed ${ids.length} note(s) into SQLite FTS`);
    } catch (e) {
      AppLogger.error('SearchIndexQueue', 'Failed to batch reindex notes in FTS', e);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Full search index rebuild: Reconstructs the entire FTS table from scratch
   * for self-healing in case of any index corruption or drift.
   */
  public static rebuildFullIndex(): { indexedCount: number } {
    try {
      AppLogger.info('SearchIndexQueue', 'Rebuilding complete SQLite FTS search index...');
      const allNotes = SqliteRepository.getAllNotes();
      const ids = allNotes.map((n) => n.id);

      // Re-index all notes batch
      if (ids.length > 0) {
        SqliteRepository.reindexNotes(ids);
      }

      // Mark all jobs as completed
      const now = Date.now();
      SqliteEngine.run(`DELETE FROM search_index_jobs`);

      AppLogger.info('SearchIndexQueue', `Full FTS index rebuild completed for ${ids.length} note(s).`);
      return { indexedCount: ids.length };
    } catch (err) {
      AppLogger.error('SearchIndexQueue', 'Failed to perform full FTS index rebuild', err);
      throw err;
    }
  }
}
