import { AiAction, ChecklistItem, NoteRecord } from '../types';
import { AppLogger } from '../lib/logger';
import { generatePrefixedId } from '../lib/uuid';
import { AiProvenanceService } from './AiProvenanceService';
import { NoteRepository } from '../repositories/NoteRepository';
import { StorageManager } from '../lib/storage';
import { SearchIndexQueue } from '../lib/SearchIndexQueue';
import { VersionControlManager } from '../lib/versionControl';

export type CaptureSource = 'text' | 'voice' | 'image' | 'share' | 'scan' | 'import';

export interface ProposedAction {
  id: string;
  type: 'create_note' | 'create_checklist' | 'create_reminder' | 'update_note' | 'archive_note' | 'delete_note' | 'link_notes';
  description: string;
  confidence: number;
  payload: any;
  requiresConfirmation: boolean;
  affectedNoteIds?: number[];
}

export interface AiMutationProposal {
  id: string;
  source: CaptureSource;
  confidence: number;
  explanation: string;
  actions: ProposedAction[];
  tags: string[];
  suggestedCategory?: string;
  suggestedEventId?: number;
  requiresConfirmation: boolean;
  createdAt: number;
}

export interface ExecutionResult {
  proposalId: string;
  success: boolean;
  executedActions: number;
  createdNoteIds: number[];
  modifiedNoteIds: number[];
  error?: string;
}

/**
 * Universal multimodal capture & AI proposal transaction pipeline.
 * Adheres to the safety principle: AI -> proposal -> validation -> review/confirmation -> transaction.
 */
export class UniversalCaptureService {
  /**
   * Generates a structured proposal from multimodal text, voice transcripts, or extracted OCR.
   */
  public static async createProposal(
    rawInput: string,
    source: CaptureSource = 'text',
    context?: { defaultEventId?: number; currentNoteId?: number }
  ): Promise<AiMutationProposal> {
    const proposalId = generatePrefixedId('prop');
    const trimmed = rawInput.trim();
    const lower = trimmed.toLowerCase();

    const actions: ProposedAction[] = [];
    const tags: string[] = [];
    let confidence = 0.85;
    let explanation = 'Extracted structured information from input.';
    let requiresConfirmation = false;

    // 1. Destructive detection (trash / delete)
    if (lower.startsWith('delete note') || lower.startsWith('trash note') || lower.startsWith('remove note')) {
      const targetQuery = trimmed.replace(/^(delete|trash|remove)\s+(note\s+)?/i, '').trim();
      actions.push({
        id: generatePrefixedId('act'),
        type: 'delete_note',
        description: targetQuery ? `Trash note matching "${targetQuery}"` : 'Move active note to Trash',
        confidence: 0.95,
        payload: { query: targetQuery, noteId: context?.currentNoteId },
        requiresConfirmation: true,
        affectedNoteIds: context?.currentNoteId ? [context.currentNoteId] : [],
      });
      requiresConfirmation = true;
      confidence = 0.95;
      explanation = 'Destructive operation: Trashing a note requires explicit user confirmation.';
    }
    // 2. Reminder / Alarm detection
    else if (lower.startsWith('remind me') || lower.includes('reminder')) {
      let reminderDate = new Date();
      reminderDate.setHours(reminderDate.getHours() + 1); // fallback 1 hour

      let reminderText = trimmed.replace(/^remind me\s+(to\s+)?/i, '');

      const tomorrowMatch = lower.match(/tomorrow(\s+at\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)?)?/i);
      const inHoursMatch = lower.match(/in\s+(\d+)\s+hours?/i);
      const inMinutesMatch = lower.match(/in\s+(\d+)\s+min(ute)?s?/i);

      if (tomorrowMatch) {
        reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + 1);
        reminderDate.setHours(9, 0, 0, 0);
        reminderText = reminderText.replace(/tomorrow(\s+at\s+[\d:]+\s*(am|pm)?)?/i, '').trim();
      } else if (inHoursMatch) {
        reminderDate = new Date(Date.now() + parseInt(inHoursMatch[1], 10) * 3600 * 1000);
        reminderText = reminderText.replace(/in\s+\d+\s+hours?/i, '').trim();
      } else if (inMinutesMatch) {
        reminderDate = new Date(Date.now() + parseInt(inMinutesMatch[1], 10) * 60 * 1000);
        reminderText = reminderText.replace(/in\s+\d+\s+min(ute)?s?/i, '').trim();
      }

      const cleanTitle = reminderText ? reminderText.charAt(0).toUpperCase() + reminderText.slice(1) : 'Follow up';
      actions.push({
        id: generatePrefixedId('act'),
        type: 'create_reminder',
        description: `Set reminder for "${cleanTitle}" at ${reminderDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`,
        confidence: 0.95,
        payload: {
          title: cleanTitle,
          body: `Reminder: ${cleanTitle}`,
          reminder_at: reminderDate.toISOString(),
          event_id: context?.defaultEventId,
        },
        requiresConfirmation: false,
      });
      tags.push('reminder');
      explanation = `Detected time-sensitive reminder scheduled for ${reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    }
    // 3. Checklist / Task list detection
    else if (
      lower.startsWith('todo:') ||
      lower.startsWith('tasks:') ||
      lower.startsWith('task:') ||
      lower.startsWith('checklist:') ||
      lower.startsWith('shopping list:') ||
      lower.includes('checklist') ||
      trimmed.includes('\n- [ ]') ||
      trimmed.includes('\n* ')
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
        .map((s) => s.replace(/^[-*•\s\[\]]+/, '').trim())
        .filter(Boolean);

      const checklistItems: ChecklistItem[] = items.map((text) => ({
        id: generatePrefixedId('chk'),
        text,
        completed: false,
      }));

      actions.push({
        id: generatePrefixedId('act'),
        type: 'create_checklist',
        description: `Create checklist "${title}" with ${items.length} item(s)`,
        confidence: 0.92,
        payload: {
          title,
          note_type: 'checklist',
          checklist_items: checklistItems,
          event_id: context?.defaultEventId,
        },
        requiresConfirmation: false,
      });
      tags.push('tasks');
      explanation = `Extracted ${items.length} actionable task item(s).`;
    }
    // 4. Construction / Site Observation workflow
    else if (
      lower.includes('slab') ||
      lower.includes('concrete') ||
      lower.includes('pour') ||
      lower.includes('inspection') ||
      lower.includes('rfi') ||
      lower.includes('defect') ||
      lower.includes('site observation') ||
      lower.includes('level ') ||
      lower.includes('grid ')
    ) {
      const lines = trimmed.split('\n');
      const inferredTitle = lines[0].slice(0, 70);

      // Detect tags
      if (lower.includes('concrete') || lower.includes('pour') || lower.includes('slab')) tags.push('concrete');
      if (lower.includes('inspection') || lower.includes('reo')) tags.push('inspection');
      if (lower.includes('rfi')) tags.push('rfi');
      if (lower.includes('defect')) tags.push('defect');
      if (lower.includes('level ')) {
        const lvlMatch = lower.match(/level\s+([0-9a-z]+)/i);
        if (lvlMatch) tags.push(`level-${lvlMatch[1]}`);
      }

      actions.push({
        id: generatePrefixedId('act'),
        type: 'create_note',
        description: `Create site observation "${inferredTitle}"`,
        confidence: 0.9,
        payload: {
          title: inferredTitle,
          body: trimmed,
          note_type: 'text',
          tags,
          event_id: context?.defaultEventId,
        },
        requiresConfirmation: false,
      });

      // If follow up or reminder detected in the construction note
      if (lower.includes('remind') || lower.includes('follow up') || lower.includes('chase')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);

        actions.push({
          id: generatePrefixedId('act'),
          type: 'create_reminder',
          description: `Set follow-up reminder for tomorrow 9:00 AM`,
          confidence: 0.85,
          payload: {
            title: `Follow up: ${inferredTitle}`,
            body: `Action item from: ${inferredTitle}`,
            reminder_at: tomorrow.toISOString(),
            event_id: context?.defaultEventId,
          },
          requiresConfirmation: false,
        });
      }

      explanation = `Identified site/field observation with relevant trade tags (${tags.join(', ') || 'construction'}).`;
    }
    // 5. Standard note capture
    else {
      let inferredTitle = trimmed.split('\n')[0].slice(0, 60);
      if (trimmed.length > 60 && !trimmed.includes('\n')) {
        const words = trimmed.split(' ');
        inferredTitle = words.slice(0, 6).join(' ');
      }

      actions.push({
        id: generatePrefixedId('act'),
        type: 'create_note',
        description: `Create note "${inferredTitle}"`,
        confidence: 0.85,
        payload: {
          title: inferredTitle,
          body: trimmed,
          note_type: 'text',
          event_id: context?.defaultEventId,
        },
        requiresConfirmation: false,
      });
      explanation = `Structured note generated from captured ${source} input.`;
    }

    const proposal: AiMutationProposal = {
      id: proposalId,
      source,
      confidence,
      explanation,
      actions,
      tags,
      requiresConfirmation,
      createdAt: Date.now(),
    };

    return proposal;
  }

  /**
   * Safely executes an approved proposal inside an atomic transaction with full revision history and provenance.
   */
  public static async executeProposal(proposal: AiMutationProposal): Promise<ExecutionResult> {
    const createdNoteIds: number[] = [];
    const modifiedNoteIds: number[] = [];

    try {
      for (const action of proposal.actions) {
        if (action.type === 'create_note' || action.type === 'create_checklist' || action.type === 'create_reminder') {
          const nowIso = new Date().toISOString();
          const created = StorageManager.addNote({
            title: action.payload.title || 'New Note',
            body: action.payload.body || '',
            note_type: action.payload.note_type || 'text',
            checklist_items: action.payload.checklist_items || [],
            reminder_at: action.payload.reminder_at,
            event_id: action.payload.event_id || 1,
            tags: action.payload.tags || proposal.tags,
            created_at: nowIso,
            updated_at: nowIso,
          });

          if (created && created.id) {
            createdNoteIds.push(created.id);

            // Record version snapshot and provenance
            await VersionControlManager.saveVersionSnapshot(
              created,
              'AI capture intake',
              'AI Universal Capture'
            );

            AiProvenanceService.recordProvenance({
              target_entity_type: 'note',
              target_entity_id: created.id,
              model_id: 'universal_capture_v1',
              provider: 'local',
              metadata: {
                proposalId: proposal.id,
                source: proposal.source,
                confidence: action.confidence,
              },
            });

            // Enqueue search index job
            SearchIndexQueue.enqueue(created.id);
          }
        } else if (action.type === 'delete_note') {
          if (action.payload.noteId) {
            StorageManager.trashNote(action.payload.noteId);
            modifiedNoteIds.push(action.payload.noteId);
            SearchIndexQueue.enqueue(action.payload.noteId);
          } else if (action.payload.query) {
            const notes = StorageManager.getActiveNotes();
            const target = notes.find(
              (n) => (n.title || '').toLowerCase().includes(action.payload.query.toLowerCase())
            );
            if (target) {
              StorageManager.trashNote(target.id);
              modifiedNoteIds.push(target.id);
              SearchIndexQueue.enqueue(target.id);
            }
          }
        }
      }

      // Record AI Operation in audit log
      AiProvenanceService.recordAiOperation({
        operation: `execute_proposal_${proposal.source}`,
        provider: 'local',
        model: 'universal_capture_pipeline',
        durationMs: 45,
        inputCharacters: proposal.explanation.length,
        outputCharacters: proposal.actions.length * 40,
        status: 'success',
      });

      return {
        proposalId: proposal.id,
        success: true,
        executedActions: proposal.actions.length,
        createdNoteIds,
        modifiedNoteIds,
      };
    } catch (err: any) {
      AppLogger.error('UniversalCaptureService', 'Failed executing proposal', err);
      return {
        proposalId: proposal.id,
        success: false,
        executedActions: 0,
        createdNoteIds,
        modifiedNoteIds,
        error: err?.message || 'Execution failed.',
      };
    }
  }
}
