import { AppLogger } from './logger';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { asErrorLike } from './errorLike';

/**
 * SearchIndexQueue
 * Decouples FTS full-text search indexing from user typing latency.
 * Uses a durable SQLite queue table (search_index_jobs) via DatabaseAdapter so pending index jobs
 * survive app restarts, crashes, and reloads without index drift.
 */
export class SearchIndexQueue {
  private static debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BATCH_DEBOUNCE_MS = 1000;
  private static isProcessing = false;

  /**
   * Recover jobs left in 'processing' or locked state after crash / force-close
   */
  public static async recoverStaleJobs(): Promise<number> {
    try {
      const db = getDatabaseAdapter();
      const staleThreshold = Date.now() - 60_000; // 1 minute
      const res = await db.run(
        `UPDATE search_index_jobs
         SET status = 'pending', locked_at = NULL
         WHERE status = 'processing' AND (locked_at IS NULL OR locked_at < ?);`,
        [staleThreshold]
      );
      if ((res.changes || 0) > 0) {
        AppLogger.info('SearchIndexQueue', `Recovered ${res.changes} stale search index job(s) left in processing state.`);
      }
      return res.changes || 0;
    } catch (e) {
      AppLogger.warn('SearchIndexQueue', 'Failed to recover stale jobs', e);
      return 0;
    }
  }

  /**
   * Enqueue a note ID into durable SQLite queue for asynchronous FTS re-indexing
   */
  public static enqueue(noteId: number): void {
    if (!noteId) return;

    const db = getDatabaseAdapter();
    const now = Date.now();

    try {
      if (db.runSync) {
        db.runSync(
          `INSERT INTO search_index_jobs (note_id, status, attempts, created_at, updated_at)
           VALUES (?, 'pending', 0, ?, ?)
           ON CONFLICT(note_id) DO UPDATE SET status = 'pending', locked_at = NULL, updated_at = ?;`,
          [noteId, now, now, now]
        );
      } else {
        db.run(
          `INSERT INTO search_index_jobs (note_id, status, attempts, created_at, updated_at)
           VALUES (?, 'pending', 0, ?, ?)
           ON CONFLICT(note_id) DO UPDATE SET status = 'pending', locked_at = NULL, updated_at = ?;`,
          [noteId, now, now, now]
        ).catch((err) => AppLogger.warn('SearchIndexQueue', `Failed to enqueue note ${noteId} asynchronously`, err));
      }
    } catch {
      db.run(
        `INSERT INTO search_index_jobs (note_id, status, attempts, created_at, updated_at)
         VALUES (?, 'pending', 0, ?, ?)
         ON CONFLICT(note_id) DO UPDATE SET status = 'pending', locked_at = NULL, updated_at = ?;`,
        [noteId, now, now, now]
      ).catch((e) => AppLogger.warn('SearchIndexQueue', `Failed to enqueue note ${noteId}`, e));
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
  public static async getPendingNoteIds(limit: number = 50): Promise<number[]> {
    try {
      const db = getDatabaseAdapter();
      const rows = await db.query<{ note_id: number }>(
        `SELECT note_id FROM search_index_jobs 
         WHERE status = 'pending' 
         ORDER BY updated_at ASC LIMIT ?;`,
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

    const db = getDatabaseAdapter();

    try {
      await this.recoverStaleJobs();

      const ids = await this.getPendingNoteIds(50);
      if (ids.length === 0) {
        this.isProcessing = false;
        return;
      }

      const placeholders = ids.map(() => '?').join(',');
      const now = Date.now();

      // Lock jobs into 'processing' state with locked_at timestamp
      await db.run(
        `UPDATE search_index_jobs
         SET status = 'processing', locked_at = ?, attempts = attempts + 1, updated_at = ?
         WHERE note_id IN (${placeholders});`,
        [now, now, ...ids]
      );

      // Execute FTS reindexing
      SqliteRepository.reindexNotes(ids);

      // Mark completed
      await db.run(
        `UPDATE search_index_jobs
         SET status = 'completed', locked_at = NULL, updated_at = ?
         WHERE note_id IN (${placeholders});`,
        [Date.now(), ...ids]
      );

      // Clean up old completed jobs periodically (> 24 hours)
      await db.run(
        `DELETE FROM search_index_jobs WHERE status = 'completed' AND updated_at < ?;`,
        [Date.now() - 24 * 3600 * 1000]
      );

      AppLogger.info('SearchIndexQueue', `Successfully indexed ${ids.length} note(s) into SQLite FTS`);
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.error('SearchIndexQueue', 'Failed to batch reindex notes in FTS', e);
      try {
        await db.run(
          `UPDATE search_index_jobs
           SET status = 'failed', locked_at = NULL, last_error = ?, updated_at = ?
           WHERE status = 'processing';`,
          [e?.message || String(e), Date.now()]
        );
      } catch {
        // Suppress secondary error
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Full search index rebuild: Reconstructs the entire FTS table from scratch
   * for self-healing in case of any index corruption or drift.
   */
  public static async rebuildFullIndex(): Promise<{ indexedCount: number }> {
    try {
      AppLogger.info('SearchIndexQueue', 'Rebuilding complete SQLite FTS search index...');
      const allNotes = SqliteRepository.getAllNotes();
      const ids = allNotes.map((n) => n.id);

      // Re-index all notes batch
      if (ids.length > 0) {
        SqliteRepository.reindexNotes(ids);
      }

      // Mark all jobs as completed
      const db = getDatabaseAdapter();
      await db.run(`DELETE FROM search_index_jobs;`);

      AppLogger.info('SearchIndexQueue', `Full FTS index rebuild completed for ${ids.length} note(s).`);
      return { indexedCount: ids.length };
    } catch (err) {
      AppLogger.error('SearchIndexQueue', 'Failed to perform full FTS index rebuild', err);
      throw err;
    }
  }
}
