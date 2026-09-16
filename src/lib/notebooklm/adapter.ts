import { SqliteEngine } from '../sqlite/sqliteEngine';
import { AppLogger } from '../logger';

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
  local_entity_type: 'note' | 'transcript' | 'summary' | 'bundle';
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
    SqliteEngine.run(
      `INSERT INTO notebooklm_connections (name, backend, notebook_id, notebook_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        conn.name,
        conn.backend || 'notebooklm-py',
        conn.notebook_id || null,
        conn.notebook_url || null,
        conn.status || 'connected',
        now,
        now,
      ]
    );
    const id = SqliteEngine.getLastInsertId();
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
    const rows = SqliteEngine.query<any>(
      `SELECT id, name, backend, notebook_id, notebook_url, status, created_at, updated_at
       FROM notebooklm_connections ORDER BY id ASC`
    );
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
   * Record a synchronized source in SQLite
   */
  public static recordSourceSync(params: {
    connectionId: number;
    entityType: 'note' | 'transcript' | 'summary' | 'bundle';
    entityId: number;
    contentHash: string;
    remoteSourceId?: string | null;
    status: 'synced' | 'pending' | 'failed' | 'modified';
  }): void {
    const now = Date.now();
    SqliteEngine.run(
      `INSERT INTO notebooklm_sources (connection_id, local_entity_type, local_entity_id, remote_source_id, content_hash, sync_status, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.connectionId,
        params.entityType,
        params.entityId,
        params.remoteSourceId || null,
        params.contentHash,
        params.status,
        now,
      ]
    );
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
