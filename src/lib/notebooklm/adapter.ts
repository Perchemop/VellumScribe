import { getDatabaseAdapter } from '../sqlite/databaseAdapter';
import { AppLogger } from '../logger';
import { generatePrefixedId } from '../uuid';

export interface NotebookLMConnection {
  id: number;
  name: string;
  backend: string;
  notebook_id?: string | null;
  notebook_url?: string | null;
  status: 'connected' | 'disconnected' | 'pending';
  created_at: number;
  updated_at: number;
}

export interface NotebookLMSource {
  id: number;
  connection_id: number;
  local_entity_type: 'note' | 'transcript' | 'summary' | 'action_items' | 'bundle';
  local_entity_id: number;
  remote_source_id?: string | null;
  content_hash: string;
  sync_status: 'synced' | 'pending' | 'failed' | 'modified';
  last_synced_at?: number | null;
  error_code?: string | null;
}

export interface NotebookLMBundle {
  title: string;
  createdAt: string;
  sourceType: string;
  metadata: Record<string, any>;
  content: string;
  sha256Hash: string;
}

export class NotebookLMAdapter {
  /**
   * Computes SHA-256 hash for content synchronization tracking
   */
  public static async computeHash(content: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback hash if WebCrypto is unavailable
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Format structured note content for optimal ingestion by Google NotebookLM
   */
  public static formatNoteForNotebookLM(note: {
    id: number;
    title: string;
    content: string;
    tags?: string[];
    created_at?: string | number;
    updated_at?: string | number;
  }): string {
    const createdDate = note.created_at ? new Date(note.created_at).toISOString() : new Date().toISOString();
    const updatedDate = note.updated_at ? new Date(note.updated_at).toISOString() : createdDate;
    const tagsStr = note.tags && note.tags.length > 0 ? note.tags.map((t) => `#${t}`).join(' ') : 'None';

    return `# ${note.title || 'Untitled Note'}

---
**Source System:** VellumScribe On-Device Knowledge Base
**Entity Type:** Note
**Document ID:** ${note.id}
**Created:** ${createdDate}
**Last Modified:** ${updatedDate}
**Tags:** ${tagsStr}
---

## Note Content

${note.content || '(Empty content)'}
`;
  }

  /**
   * Format transcript with timestamped speaker segments for NotebookLM ingestion
   */
  public static formatTranscriptForNotebookLM(params: {
    noteTitle?: string;
    transcriptionId: number;
    recordingId: number;
    engine: string;
    modelId: string;
    durationMs?: number;
    segments: Array<{ sequence: number; start_ms: number; end_ms: number; speaker_id?: string | null; text: string }>;
    speakers?: Array<{ speaker_id: string; label: string; name?: string | null }>;
    summary?: string;
    actionItems?: Array<{ text: string; priority?: string }>;
  }): string {
    const speakerMap = new Map<string, string>();
    if (params.speakers) {
      params.speakers.forEach((s) => {
        speakerMap.set(s.speaker_id, s.name || s.label);
      });
    }

    const durationSec = Math.round((params.durationMs || 0) / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

    let formatted = `# Transcript: ${params.noteTitle || 'Audio Recording #' + params.recordingId}

---
**Source System:** VellumScribe Offline AI
**Transcription ID:** ${params.transcriptionId}
**Recording ID:** ${params.recordingId}
**Speech Engine:** ${params.engine} (${params.modelId})
**Audio Duration:** ${durationStr}
**Provenance:** 100% On-Device Whisper Execution
---

`;

    if (params.summary) {
      formatted += `## Executive Summary\n\n${params.summary}\n\n---\n\n`;
    }

    if (params.actionItems && params.actionItems.length > 0) {
      formatted += `## Extracted Action Items\n\n`;
      params.actionItems.forEach((item, idx) => {
        const priorityTag = item.priority ? ` [${item.priority.toUpperCase()}]` : '';
        formatted += `- [ ] **Task ${idx + 1}:** ${item.text}${priorityTag}\n`;
      });
      formatted += `\n---\n\n`;
    }

    formatted += `## Timestamped Dialogue Transcript\n\n`;
    if (params.segments.length === 0) {
      formatted += `*(No dialogue segments found)*\n`;
    } else {
      params.segments.forEach((seg) => {
        const startMin = Math.floor(seg.start_ms / 60000);
        const startSec = Math.floor((seg.start_ms % 60000) / 1000);
        const timecode = `${startMin.toString().padStart(2, '0')}:${startSec.toString().padStart(2, '0')}`;
        const speakerName = seg.speaker_id ? speakerMap.get(seg.speaker_id) || seg.speaker_id : 'Speaker';
        formatted += `**[${timecode}] ${speakerName}:** ${seg.text}\n\n`;
      });
    }

    return formatted;
  }

  /**
   * Generates a self-contained NotebookLM bundle ready for ingestion
   */
  public static async createBundle(params: {
    title: string;
    sourceType: 'note' | 'transcript' | 'bundle';
    content: string;
    metadata?: Record<string, any>;
  }): Promise<NotebookLMBundle> {
    const sha256Hash = await this.computeHash(params.content);
    return {
      title: params.title,
      createdAt: new Date().toISOString(),
      sourceType: params.sourceType,
      metadata: params.metadata || {},
      content: params.content,
      sha256Hash,
    };
  }

  /**
   * Save or update NotebookLM connection in SQLite
   */
  public static saveConnection(conn: {
    name: string;
    backend?: string;
    notebook_id?: string | null;
    notebook_url?: string | null;
    status?: 'connected' | 'disconnected' | 'pending';
  }): NotebookLMConnection {
    const now = Date.now();
    const db = getDatabaseAdapter();
    const sql = `INSERT INTO notebooklm_connections (name, backend, notebook_id, notebook_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      conn.name,
      conn.backend || 'notebooklm-py',
      conn.notebook_id || null,
      conn.notebook_url || null,
      conn.status || 'connected',
      now,
      now,
    ];

    let id = 0;
    if (db.runSync) {
      const res = db.runSync(sql, params);
      id = res.lastInsertRowId || db.getLastInsertId?.() || 0;
    } else {
      db.run(sql, params).then((res) => {
        id = res.lastInsertRowId || 0;
      }).catch((e) => AppLogger.warn('NotebookLMAdapter', 'Async saveConnection failed', e));
    }

    return {
      id,
      name: conn.name,
      backend: conn.backend || 'notebooklm-py',
      notebook_id: conn.notebook_id || null,
      notebook_url: conn.notebook_url || null,
      status: conn.status || 'connected',
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * List all configured NotebookLM connections
   */
  public static listConnections(): NotebookLMConnection[] {
    const db = getDatabaseAdapter();
    const sql = `SELECT id, name, backend, notebook_id, notebook_url, status, created_at, updated_at
       FROM notebooklm_connections ORDER BY id ASC`;
    const rows = db.querySync ? db.querySync<any>(sql) : [];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      backend: r.backend,
      notebook_id: r.notebook_id,
      notebook_url: r.notebook_url,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  /**
   * Upsert a NotebookLM source mapping in SQLite (P1-03)
   */
  public static upsertSourceMapping(params: {
    connectionId: number;
    entityType: 'note' | 'transcript' | 'summary' | 'action_items' | 'bundle';
    entityId: number;
    contentHash: string;
    remoteSourceId?: string | null;
    status: 'synced' | 'pending' | 'failed' | 'modified';
    errorCode?: string | null;
  }): NotebookLMSource {
    const now = Date.now();
    const db = getDatabaseAdapter();
    const existing = db.querySync
      ? db.querySync<NotebookLMSource>(
          `SELECT * FROM notebooklm_sources 
           WHERE connection_id = ? AND local_entity_type = ? AND local_entity_id = ?`,
          [params.connectionId, params.entityType, params.entityId]
        )
      : [];

    if (existing && existing.length > 0) {
      const existingId = existing[0].id;
      const sql = `UPDATE notebooklm_sources 
         SET remote_source_id = COALESCE(?, remote_source_id),
             content_hash = ?,
             sync_status = ?,
             last_synced_at = ?,
             error_code = ?
         WHERE id = ?`;
      const updateParams = [
        params.remoteSourceId || null,
        params.contentHash,
        params.status,
        now,
        params.errorCode || null,
        existingId,
      ];
      if (db.runSync) {
        db.runSync(sql, updateParams);
      } else {
        db.run(sql, updateParams).catch((e) => AppLogger.warn('NotebookLMAdapter', 'Async update source failed', e));
      }

      return {
        id: existingId,
        connection_id: params.connectionId,
        local_entity_type: params.entityType,
        local_entity_id: params.entityId,
        remote_source_id: params.remoteSourceId || existing[0].remote_source_id,
        content_hash: params.contentHash,
        sync_status: params.status,
        last_synced_at: now,
        error_code: params.errorCode || null,
      };
    } else {
      const sql = `INSERT INTO notebooklm_sources (connection_id, local_entity_type, local_entity_id, remote_source_id, content_hash, sync_status, last_synced_at, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const insertParams = [
        params.connectionId,
        params.entityType,
        params.entityId,
        params.remoteSourceId || null,
        params.contentHash,
        params.status,
        now,
        params.errorCode || null,
      ];

      let id = 0;
      if (db.runSync) {
        const res = db.runSync(sql, insertParams);
        id = res.lastInsertRowId || db.getLastInsertId?.() || 0;
      } else {
        db.run(sql, insertParams).then((res) => {
          id = res.lastInsertRowId || 0;
        }).catch((e) => AppLogger.warn('NotebookLMAdapter', 'Async insert source failed', e));
      }

      return {
        id,
        connection_id: params.connectionId,
        local_entity_type: params.entityType,
        local_entity_id: params.entityId,
        remote_source_id: params.remoteSourceId || null,
        content_hash: params.contentHash,
        sync_status: params.status,
        last_synced_at: now,
        error_code: params.errorCode || null,
      };
    }
  }

  /**
   * Get existing source mapping for entity
   */
  public static getSourceMapping(
    connectionId: number,
    entityType: string,
    entityId: number
  ): NotebookLMSource | null {
    const db = getDatabaseAdapter();
    const sql = `SELECT * FROM notebooklm_sources 
       WHERE connection_id = ? AND local_entity_type = ? AND local_entity_id = ?`;
    const rows = db.querySync
      ? db.querySync<NotebookLMSource>(sql, [connectionId, entityType, entityId])
      : [];
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * List all sources mapped to a connection
   */
  public static listSourcesForConnection(connectionId: number): NotebookLMSource[] {
    const db = getDatabaseAdapter();
    const sql = `SELECT * FROM notebooklm_sources WHERE connection_id = ? ORDER BY id DESC`;
    return db.querySync ? db.querySync<NotebookLMSource>(sql, [connectionId]) : [];
  }

  /**
   * Real NotebookLM Transport: validate connection (P1-01)
   */
  public static async validateConnection(connection: NotebookLMConnection): Promise<boolean> {
    try {
      const res = await fetch('/api/notebooklm/validate-notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookUrl: connection.notebook_url,
          notebookId: connection.notebook_id,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.valid;
    } catch {
      return false;
    }
  }

  /**
   * Real NotebookLM Transport: upload document source (P1-01)
   */
  public static async uploadSource(params: {
    connection: NotebookLMConnection;
    title: string;
    content: string;
    sourceType?: string;
    metadata?: Record<string, any>;
  }): Promise<{ remoteSourceId: string; contentHash: string; syncedAt: number }> {
    const res = await fetch('/api/notebooklm/upload-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notebookId: params.connection.notebook_id,
        title: params.title,
        content: params.content,
        sourceType: params.sourceType || 'note',
        metadata: params.metadata || {},
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload to NotebookLM failed' }));
      throw new Error(err.error || `HTTP ${res.status}: Upload failed`);
    }

    const data = await res.json();
    return {
      remoteSourceId: data.remoteSourceId,
      contentHash: data.contentHash,
      syncedAt: data.syncedAt || Date.now(),
    };
  }

  /**
   * Real NotebookLM Transport: delete remote source (P1-01)
   */
  public static async deleteRemoteSource(remoteSourceId: string): Promise<boolean> {
    const res = await fetch('/api/notebooklm/delete-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteSourceId }),
    });
    return res.ok;
  }

  /**
   * Enqueue a durable sync job in SQLite (P1-04)
   */
  public static enqueueSyncJob(params: {
    connectionId: number;
    entityType: 'note' | 'transcript' | 'summary' | 'action_items' | 'bundle';
    entityId: number;
    action: 'create' | 'update' | 'delete';
    contentPayload?: string;
  }): string {
    const jobId = generatePrefixedId('nlm_job');
    const now = Date.now();
    const db = getDatabaseAdapter();

    const sql = `INSERT INTO notebooklm_sync_jobs 
       (id, connection_id, local_entity_type, local_entity_id, status, action, content_payload, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const sqlParams = [
      jobId,
      params.connectionId,
      params.entityType,
      params.entityId,
      'queued',
      params.action,
      params.contentPayload || null,
      0,
      now,
      now,
    ];

    if (db.runSync) {
      db.runSync(sql, sqlParams);
    } else {
      db.run(sql, sqlParams).catch((e) => AppLogger.warn('NotebookLMAdapter', 'Async enqueueSyncJob failed', e));
    }

    AppLogger.info('NotebookLMAdapter', `Enqueued durable NotebookLM sync job: ${jobId}`);
    return jobId;
  }

  /**
   * Process a durable sync job with retry handling (P1-04)
   */
  public static async processSyncJob(jobId: string): Promise<boolean> {
    const db = getDatabaseAdapter();
    const jobs = await db.query<any>(
      `SELECT * FROM notebooklm_sync_jobs WHERE id = ?`,
      [jobId]
    );
    if (!jobs || jobs.length === 0) return false;

    const job = jobs[0];
    const connections = this.listConnections().filter((c) => c.id === job.connection_id);
    if (connections.length === 0) {
      await db.run(
        `UPDATE notebooklm_sync_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
        ['Connection not found', Date.now(), jobId]
      );
      return false;
    }

    const connection = connections[0];

    // Mark syncing
    await db.run(
      `UPDATE notebooklm_sync_jobs SET status = 'syncing', updated_at = ? WHERE id = ?`,
      [Date.now(), jobId]
    );

    try {
      if (job.action === 'create' || job.action === 'update') {
        const payload = job.content_payload || '';
        const title = `${job.local_entity_type.toUpperCase()} #${job.local_entity_id}`;
        
        const uploadResult = await this.uploadSource({
          connection,
          title,
          content: payload,
          sourceType: job.local_entity_type,
        });

        // Upsert source mapping
        this.upsertSourceMapping({
          connectionId: job.connection_id,
          entityType: job.local_entity_type,
          entityId: job.local_entity_id,
          contentHash: uploadResult.contentHash,
          remoteSourceId: uploadResult.remoteSourceId,
          status: 'synced',
        });

        await db.run(
          `UPDATE notebooklm_sync_jobs SET status = 'completed', error_message = NULL, updated_at = ? WHERE id = ?`,
          [Date.now(), jobId]
        );
        return true;
      } else if (job.action === 'delete') {
        const existingMapping = this.getSourceMapping(job.connection_id, job.local_entity_type, job.local_entity_id);
        if (existingMapping && existingMapping.remote_source_id) {
          await this.deleteRemoteSource(existingMapping.remote_source_id);
        }
        await db.run(
          `DELETE FROM notebooklm_sources WHERE connection_id = ? AND local_entity_type = ? AND local_entity_id = ?`,
          [job.connection_id, job.local_entity_type, job.local_entity_id]
        );
        await db.run(
          `UPDATE notebooklm_sync_jobs SET status = 'completed', error_message = NULL, updated_at = ? WHERE id = ?`,
          [Date.now(), jobId]
        );
        return true;
      }
      return false;
    } catch (err: any) {
      const errMsg = err?.message || 'Sync failed';
      const newRetries = (job.retry_count || 0) + 1;
      await db.run(
        `UPDATE notebooklm_sync_jobs 
         SET status = ?, error_message = ?, retry_count = ?, updated_at = ? 
         WHERE id = ?`,
        [newRetries >= 3 ? 'failed' : 'queued', errMsg, newRetries, Date.now(), jobId]
      );
      return false;
    }
  }

  /**
   * Process all pending durable sync jobs in queue (P1-04)
   */
  public static async processAllPendingJobs(): Promise<{ succeeded: number; failed: number }> {
    const db = getDatabaseAdapter();
    const pending = await db.query<{ id: string }>(
      `SELECT id FROM notebooklm_sync_jobs WHERE status IN ('queued', 'failed') AND retry_count < 3 ORDER BY created_at ASC LIMIT 10`
    );

    let succeeded = 0;
    let failed = 0;

    for (const item of pending) {
      const ok = await this.processSyncJob(item.id);
      if (ok) succeeded++;
      else failed++;
    }

    return { succeeded, failed };
  }

  /**
   * List recent NotebookLM sync jobs
   */
  public static listSyncJobs(limit = 20): any[] {
    const db = getDatabaseAdapter();
    const sql = `SELECT * FROM notebooklm_sync_jobs ORDER BY created_at DESC LIMIT ?`;
    return db.querySync ? db.querySync(sql, [limit]) : [];
  }

  /**
   * Record a synchronized source in SQLite (legacy alias)
   */
  public static recordSourceSync(params: {
    connectionId: number;
    entityType: 'note' | 'transcript' | 'summary' | 'bundle';
    entityId: number;
    contentHash: string;
    remoteSourceId?: string | null;
    status: 'synced' | 'pending' | 'failed' | 'modified';
  }): void {
    this.upsertSourceMapping({
      connectionId: params.connectionId,
      entityType: params.entityType,
      entityId: params.entityId,
      contentHash: params.contentHash,
      remoteSourceId: params.remoteSourceId,
      status: params.status,
    });
  }

  /**
   * Download or export bundle as a file
   */
  public static exportBundleToFile(bundle: NotebookLMBundle, filename?: string): void {
    const targetFilename = filename || `${bundle.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_notebooklm.md`;
    const blob = new Blob([bundle.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    AppLogger.info('NotebookLMAdapter', `Exported NotebookLM source: ${targetFilename}`);
  }
}
