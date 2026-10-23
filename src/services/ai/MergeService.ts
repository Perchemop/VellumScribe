import { NoteRecord, ChecklistItem } from '../../types';

export interface MergeResult {
  mergedNote: NoteRecord;
  hasConflict: boolean;
  conflictDetails?: string[];
}

/**
 * MergeService: Deterministic, offline-safe note merging and conflict resolution service.
 * Reconciles local and remote changes across title, markdown body, tags, and checklist items.
 */
export class MergeService {
  /**
   * Merges two versions of a note (e.g. local and incoming sync/revision).
   */
  public static mergeNotes(base: NoteRecord, incoming: Partial<NoteRecord>): MergeResult {
    const conflictDetails: string[] = [];
    let hasConflict = false;

    // Title reconciliation
    let title = base.title;
    if (incoming.title && incoming.title !== base.title) {
      if (!base.title || base.title === 'Untitled Note') {
        title = incoming.title;
      } else {
        // Concatenate if significantly different
        title = `${base.title} / ${incoming.title}`;
        hasConflict = true;
        conflictDetails.push(
          `Title merged from conflicting inputs: "${base.title}" vs "${incoming.title}"`
        );
      }
    }

    // Markdown body reconciliation
    const mergedBody = this.mergeBodies(base.body || '', incoming.body || '');

    // Tags reconciliation: union of distinct tags
    const mergedTags = Array.from(new Set([...(base.tags || []), ...(incoming.tags || [])]));

    // Checklist items reconciliation: match by text or id, prefer checked status if either is completed
    const mergedChecklists = this.mergeChecklists(
      base.checklist_items || [],
      incoming.checklist_items || []
    );

    const mergedNote: NoteRecord = {
      ...base,
      ...incoming,
      title,
      body: mergedBody,
      tags: mergedTags,
      checklist_items: mergedChecklists,
      updated_at: new Date().toISOString(),
    };

    return {
      mergedNote,
      hasConflict,
      conflictDetails: conflictDetails.length > 0 ? conflictDetails : undefined,
    };
  }

  /**
   * Concatenates non-overlapping markdown sections or appends new content.
   */
  public static mergeBodies(baseBody: string, incomingBody: string): string {
    if (!incomingBody || incomingBody.trim() === baseBody.trim()) {
      return baseBody;
    }
    if (!baseBody || !baseBody.trim()) {
      return incomingBody;
    }

    // If incoming contains base as prefix/suffix, take the longer one
    if (incomingBody.includes(baseBody.trim())) return incomingBody;
    if (baseBody.includes(incomingBody.trim())) return baseBody;

    // Otherwise append with clear markdown separation
    return `${baseBody.trim()}\n\n---\n\n### Synchronized Additional Notes\n\n${incomingBody.trim()}`;
  }

  /**
   * Reconciles checklist items from two versions.
   */
  public static mergeChecklists(base: ChecklistItem[], incoming: ChecklistItem[]): ChecklistItem[] {
    const map = new Map<string, ChecklistItem>();

    base.forEach((item) => {
      const key = item.text.trim().toLowerCase();
      map.set(key, { ...item });
    });

    incoming.forEach((item) => {
      const key = item.text.trim().toLowerCase();
      if (map.has(key)) {
        const existing = map.get(key)!;
        // If either is completed, mark as completed
        map.set(key, {
          ...existing,
          completed: existing.completed || item.completed,
        });
      } else {
        map.set(key, { ...item });
      }
    });

    return Array.from(map.values());
  }
}
