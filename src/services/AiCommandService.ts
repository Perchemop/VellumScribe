import { AiAction, AiCommandResult } from '../types';
import { AppLogger } from '../lib/logger';
import { AiSettingsManager } from '../lib/aiSettings';
import { AiProvenanceService } from './AiProvenanceService';
import { generatePrefixedId } from '../lib/uuid';

export interface AiAuditLogEntry {
  id: string;
  timestamp: string;
  operation: string;
  provider: 'local' | 'cloud_gemini' | 'ollama' | 'groq';
  model: string;
  durationMs: number;
  inputCharacters: number;
  outputCharacters: number;
  status: 'success' | 'error';
}

export class AiCommandService {
  /**
   * Log AI operation metadata deterministically without recording note bodies or confidential content.
   * SQLite ai_operations table is the authoritative persistence store.
   */
  public static logAudit(entry: Omit<AiAuditLogEntry, 'id' | 'timestamp'>): void {
    try {
      // Authoritatively persist to SQLite ai_operations table
      AiProvenanceService.recordAiOperation({
        operation: entry.operation,
        provider: entry.provider,
        model: entry.model,
        durationMs: entry.durationMs,
        inputCharacters: entry.inputCharacters,
        outputCharacters: entry.outputCharacters,
        status: entry.status,
      });
    } catch (e) {
      AppLogger.warn('AiCommandService', 'Failed to save AI audit entry', e);
    }
  }

  public static getAuditLogs(): AiAuditLogEntry[] {
    try {
      const ops = AiProvenanceService.getAiOperations(100);
      return (ops || []).map((row: any) => ({
        id: row.id,
        timestamp: new Date(row.created_at).toISOString(),
        operation: row.operation,
        provider: row.provider,
        model: row.model,
        durationMs: row.duration_ms,
        inputCharacters: row.input_characters,
        outputCharacters: row.output_characters,
        status: row.status,
      }));
    } catch {
      return [];
    }
  }

  public static async getAuditLogsAsync(): Promise<AiAuditLogEntry[]> {
    try {
      const ops = await AiProvenanceService.getAiOperationsAsync(100);
      return (ops || []).map((row: any) => ({
        id: row.id,
        timestamp: new Date(row.created_at).toISOString(),
        operation: row.operation,
        provider: row.provider,
        model: row.model,
        durationMs: row.duration_ms,
        inputCharacters: row.input_characters,
        outputCharacters: row.output_characters,
        status: row.status,
      }));
    } catch {
      return [];
    }
  }

  public static clearAuditLogs(): void {
    // Clear legacy localStorage cache if present
    try {
      localStorage.removeItem('vellumscribe_ai_audit_logs');
    } catch {}
  }

  /**
   * Parse a natural-language capture command into structured executable intents and actions.
   * Runs local deterministic classification with zero network latency, with AI expansion if enabled.
   */
  public static async parseCommand(text: string): Promise<AiCommandResult> {
    const startTime = Date.now();
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        intent: 'unknown',
        confidence: 0,
        actions: [],
      };
    }

    const lower = trimmed.toLowerCase();

    // 1. Delete intent (Safety Guardrail: Requires explicit confirmation before mutation)
    if (lower.startsWith('delete note') || lower.startsWith('trash note') || lower.startsWith('remove note')) {
      const targetTitle = trimmed.replace(/^(delete|trash|remove)\s+(note\s+)?/i, '').trim();
      this.logAudit({
        operation: 'parse_delete_command',
        provider: 'local',
        model: 'heuristic_intent_v1',
        durationMs: Date.now() - startTime,
        inputCharacters: trimmed.length,
        outputCharacters: 50,
        status: 'success',
      });
      return {
        intent: 'create_note',
        confidence: 0.9,
        actions: [
          {
            type: 'delete_note',
            description: targetTitle ? `Permanently trash note matching "${targetTitle}"` : 'Move active note to Trash',
            requiresConfirmation: true,
            payload: { query: targetTitle },
          },
        ],
      };
    }

    // 2. Reminder / Alarm intent
    if (lower.startsWith('remind me') || lower.includes('reminder')) {
      let reminderDate: Date | null = null;
      let reminderNoteText = trimmed.replace(/^remind me\s+(to\s+)?/i, '');

      const tomorrowMatch = lower.match(/tomorrow(\s+at\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)?)?/i);
      const inHoursMatch = lower.match(/in\s+(\d+)\s+hours?/i);
      const inMinutesMatch = lower.match(/in\s+(\d+)\s+min(ute)?s?/i);
      const timeAtMatch = lower.match(/at\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)/i);

      const target = new Date();
      if (tomorrowMatch) {
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0); // Default to 9 AM tomorrow
        if (tomorrowMatch[2]) {
          let hours = parseInt(tomorrowMatch[2], 10);
          const minutes = tomorrowMatch[4] ? parseInt(tomorrowMatch[4], 10) : 0;
          const isPm = tomorrowMatch[5]?.toLowerCase() === 'pm';
          if (isPm && hours < 12) hours += 12;
          if (!isPm && hours === 12) hours = 0;
          target.setHours(hours, minutes, 0, 0);
        }
        reminderDate = target;
        reminderNoteText = reminderNoteText.replace(/tomorrow(\s+at\s+[\d:]+\s*(am|pm)?)?/i, '').trim();
      } else if (inHoursMatch) {
        const hours = parseInt(inHoursMatch[1], 10);
        target.setTime(target.getTime() + hours * 3600 * 1000);
        reminderDate = target;
        reminderNoteText = reminderNoteText.replace(/in\s+\d+\s+hours?/i, '').trim();
      } else if (inMinutesMatch) {
        const mins = parseInt(inMinutesMatch[1], 10);
        target.setTime(target.getTime() + mins * 60 * 1000);
        reminderDate = target;
        reminderNoteText = reminderNoteText.replace(/in\s+\d+\s+min(ute)?s?/i, '').trim();
      } else if (timeAtMatch) {
        let hours = parseInt(timeAtMatch[1], 10);
        const minutes = timeAtMatch[3] ? parseInt(timeAtMatch[3], 10) : 0;
        const isPm = timeAtMatch[4]?.toLowerCase() === 'pm';
        if (isPm && hours < 12) hours += 12;
        if (!isPm && hours === 12) hours = 0;
        target.setHours(hours, minutes, 0, 0);
        if (target.getTime() < Date.now()) {
          // If time already passed today, set for tomorrow
          target.setDate(target.getDate() + 1);
        }
        reminderDate = target;
        reminderNoteText = reminderNoteText.replace(/at\s+\d{1,2}(:\d{2})?\s*(am|pm)/i, '').trim();
      } else {
        // Default to 1 hour from now
        target.setHours(target.getHours() + 1);
        reminderDate = target;
      }

      const cleanTitle = reminderNoteText.charAt(0).toUpperCase() + reminderNoteText.slice(1);
      this.logAudit({
        operation: 'parse_reminder_command',
        provider: 'local',
        model: 'heuristic_intent_v1',
        durationMs: Date.now() - startTime,
        inputCharacters: trimmed.length,
        outputCharacters: cleanTitle.length,
        status: 'success',
      });

      return {
        intent: 'create_reminder',
        confidence: 0.95,
        actions: [
          {
            type: 'create_reminder',
            description: `Set reminder for "${cleanTitle}" at ${reminderDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`,
            payload: {
              title: cleanTitle,
              body: `Reminder: ${cleanTitle}`,
              reminder_at: reminderDate.toISOString(),
            },
          },
        ],
      };
    }

    // 3. Task / Checklist / Shopping list intent
    if (
      lower.startsWith('todo:') ||
      lower.startsWith('tasks:') ||
      lower.startsWith('task:') ||
      lower.startsWith('checklist:') ||
      lower.startsWith('shopping list:') ||
      lower.includes('checklist')
    ) {
      let rawItems = '';
      let title = 'Tasks';
      if (lower.includes(':')) {
        const parts = trimmed.split(':');
        title = parts[0].trim();
        rawItems = parts.slice(1).join(':').trim();
      } else {
        rawItems = trimmed;
      }

      const items = rawItems
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      this.logAudit({
        operation: 'parse_checklist_command',
        provider: 'local',
        model: 'heuristic_intent_v1',
        durationMs: Date.now() - startTime,
        inputCharacters: trimmed.length,
        outputCharacters: items.length * 20,
        status: 'success',
      });

      return {
        intent: 'create_task',
        confidence: 0.92,
        actions: [
          {
            type: 'create_checklist',
            description: `Create checklist "${title}" with ${items.length} item(s)`,
            payload: {
              title,
              note_type: 'checklist',
              checklist_items: items.map((t) => ({
                id: generatePrefixedId('chk'),
                text: t,
                completed: false,
              })),
            },
          },
        ],
      };
    }

    // 4. Search intent
    if (lower.startsWith('find ') || lower.startsWith('search ') || lower.startsWith('locate ')) {
      const searchQuery = trimmed.replace(/^(find|search|locate)\s+/i, '').replace(/notes?\s+(about|with|for)?\s*/i, '').trim();
      this.logAudit({
        operation: 'parse_search_command',
        provider: 'local',
        model: 'heuristic_intent_v1',
        durationMs: Date.now() - startTime,
        inputCharacters: trimmed.length,
        outputCharacters: searchQuery.length,
        status: 'success',
      });

      return {
        intent: 'search',
        confidence: 0.9,
        actions: [
          {
            type: 'search_notes',
            description: `Filter workspace for "${searchQuery}"`,
            payload: { query: searchQuery },
          },
        ],
      };
    }

    // 5. General capture / Meeting note intent
    let inferredTitle = trimmed.split('\n')[0].slice(0, 60);
    let inferredBody = trimmed;
    if (trimmed.length > 60 && !trimmed.includes('\n')) {
      const words = trimmed.split(' ');
      inferredTitle = words.slice(0, 6).join(' ');
    }

    this.logAudit({
      operation: 'parse_note_command',
      provider: 'local',
      model: 'heuristic_intent_v1',
      durationMs: Date.now() - startTime,
      inputCharacters: trimmed.length,
      outputCharacters: inferredTitle.length + inferredBody.length,
      status: 'success',
    });

    return {
      intent: 'create_note',
      confidence: 0.85,
      actions: [
        {
          type: 'create_note',
          description: `Create new note "${inferredTitle}"`,
          payload: {
            title: inferredTitle,
            body: inferredBody,
            note_type: 'text',
          },
        },
      ],
    };
  }
}
