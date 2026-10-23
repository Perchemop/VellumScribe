import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { AppLogger } from '../lib/logger';
import { generatePrefixedId } from '../lib/uuid';

export interface AiProvenanceRecord {
  id: string;
  target_entity_type: 'note' | 'checklist' | 'transcript' | 'summary';
  target_entity_id: number;
  source_entity_type?: string;
  source_entity_id?: number;
  model_id: string;
  provider: string;
  prompt_hash?: string;
  generated_at: number;
  metadata?: Record<string, unknown>;
}

/** Raw rows from the `ai_provenance` table (see schema.ts). */
interface AiProvenanceRow {
  id: string;
  // constrained by the writer; the column itself is free text
  target_entity_type: 'note' | 'checklist' | 'transcript' | 'summary';
  target_entity_id: number;
  source_entity_type?: string;
  source_entity_id?: number;
  model_id: string;
  provider: string;
  prompt_hash?: string;
  generated_at: number;
  metadata_json?: string;
}

/** Raw rows from the `ai_operations` telemetry table. */
export interface AiOperationRow {
  id: string;
  operation: string;
  provider: string;
  model: string;
  duration_ms: number;
  input_characters: number;
  output_characters: number;
  status: string;
  created_at: number;
}

export class AiProvenanceService {
  /**
   * Records provenance for any AI-generated artifact in the SQLite database
   */
  public static recordProvenance(data: Omit<AiProvenanceRecord, 'id' | 'generated_at'>): void {
    try {
      const id = generatePrefixedId('prov');
      const now = Date.now();
      const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;
      const db = getDatabaseAdapter();

      const sql = `INSERT OR REPLACE INTO ai_provenance 
          (id, target_entity_type, target_entity_id, source_entity_type, source_entity_id, model_id, provider, prompt_hash, generated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        id,
        data.target_entity_type,
        data.target_entity_id,
        data.source_entity_type || null,
        data.source_entity_id || null,
        data.model_id,
        data.provider,
        data.prompt_hash || null,
        now,
        metadataJson,
      ];

      if (db.runSync) {
        db.runSync(sql, params);
      } else {
        db.run(sql, params).catch((err) =>
          AppLogger.warn('AiProvenanceService', 'Async recordProvenance failed', err)
        );
      }
      AppLogger.debug(
        'AiProvenanceService',
        `Recorded AI provenance for ${data.target_entity_type} #${data.target_entity_id} (${data.model_id})`
      );
    } catch (e) {
      AppLogger.warn('AiProvenanceService', 'Failed to record AI provenance', e);
    }
  }

  /**
   * Retrieves provenance records for a given entity
   */
  public static getProvenance(
    targetEntityType: string,
    targetEntityId: number
  ): AiProvenanceRecord | null {
    try {
      const db = getDatabaseAdapter();
      const sql = `SELECT * FROM ai_provenance WHERE target_entity_type = ? AND target_entity_id = ? ORDER BY generated_at DESC LIMIT 1`;
      const params = [targetEntityType, targetEntityId];

      const rows = db.querySync ? db.querySync<AiProvenanceRow>(sql, params) : [];
      if (!rows || rows.length === 0) return null;

      const r = rows[0];
      let metadata: Record<string, unknown> | undefined;
      if (r.metadata_json) {
        try {
          metadata = JSON.parse(r.metadata_json);
        } catch {
          /* ignore */
        }
      }

      return {
        id: r.id,
        target_entity_type: r.target_entity_type,
        target_entity_id: r.target_entity_id,
        source_entity_type: r.source_entity_type || undefined,
        source_entity_id: r.source_entity_id || undefined,
        model_id: r.model_id,
        provider: r.provider,
        prompt_hash: r.prompt_hash || undefined,
        generated_at: r.generated_at,
        metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Async variant to retrieve provenance records for a given entity
   */
  public static async getProvenanceAsync(
    targetEntityType: string,
    targetEntityId: number
  ): Promise<AiProvenanceRecord | null> {
    try {
      const db = getDatabaseAdapter();
      const sql = `SELECT * FROM ai_provenance WHERE target_entity_type = ? AND target_entity_id = ? ORDER BY generated_at DESC LIMIT 1`;
      const params = [targetEntityType, targetEntityId];

      const rows = await db.query<AiProvenanceRow>(sql, params);
      if (!rows || rows.length === 0) return null;

      const r = rows[0];
      let metadata: Record<string, unknown> | undefined;
      if (r.metadata_json) {
        try {
          metadata = JSON.parse(r.metadata_json);
        } catch {
          /* ignore */
        }
      }

      return {
        id: r.id,
        target_entity_type: r.target_entity_type,
        target_entity_id: r.target_entity_id,
        source_entity_type: r.source_entity_type || undefined,
        source_entity_id: r.source_entity_id || undefined,
        model_id: r.model_id,
        provider: r.provider,
        prompt_hash: r.prompt_hash || undefined,
        generated_at: r.generated_at,
        metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Log an AI operation in the durable SQLite ai_operations table
   */
  public static recordAiOperation(data: {
    operation: string;
    provider: string;
    model: string;
    durationMs: number;
    inputCharacters: number;
    outputCharacters: number;
    status: 'success' | 'error';
  }): void {
    try {
      const id = generatePrefixedId('aiop');
      const db = getDatabaseAdapter();
      const sql = `INSERT INTO ai_operations (id, operation, provider, model, duration_ms, input_characters, output_characters, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
      const params = [
        id,
        data.operation,
        data.provider,
        data.model,
        data.durationMs,
        data.inputCharacters,
        data.outputCharacters,
        data.status,
        Date.now(),
      ];

      if (db.runSync) {
        db.runSync(sql, params);
      } else {
        db.run(sql, params).catch((err) =>
          AppLogger.warn('AiProvenanceService', 'Async recordAiOperation failed', err)
        );
      }
    } catch (e) {
      AppLogger.warn('AiProvenanceService', 'Failed to log AI operation to SQLite', e);
    }
  }

  public static getAiOperations(limit = 50): AiOperationRow[] {
    try {
      const db = getDatabaseAdapter();
      const sql = `SELECT * FROM ai_operations ORDER BY created_at DESC LIMIT ?;`;
      if (db.querySync) {
        return db.querySync<AiOperationRow>(sql, [limit]);
      }
      return [];
    } catch {
      return [];
    }
  }

  public static async getAiOperationsAsync(limit = 50): Promise<AiOperationRow[]> {
    try {
      const db = getDatabaseAdapter();
      return await db.query<AiOperationRow>(
        `SELECT * FROM ai_operations ORDER BY created_at DESC LIMIT ?;`,
        [limit]
      );
    } catch {
      return [];
    }
  }
}
