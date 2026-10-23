import { describe, it, expect } from 'vitest';
import { MergeService } from './MergeService';
import { NoteRecord, ChecklistItem } from '../../types';

describe('MergeService', () => {
  const baseNote: NoteRecord = {
    id: 101,
    title: 'Design Review',
    body: '## Architecture\n\nInitial notes on SQLite architecture.',
    event_id: 1,
    tags: ['work', 'android'],
    checklist_items: [
      { id: 'c1', text: 'Verify NDK build', completed: true },
      { id: 'c2', text: 'Review ProGuard keep rules', completed: false },
    ],
    is_locked: false,
    created_at: new Date('2026-09-20').toISOString(),
    updated_at: new Date('2026-09-20').toISOString(),
  };

  it('merges markdown bodies without duplicating identical content', () => {
    const merged = MergeService.mergeBodies(baseNote.body, baseNote.body);
    expect(merged).toBe(baseNote.body);
  });

  it('appends non-overlapping markdown sections with clear headings', () => {
    const incomingBody = '## Next Steps\n\nSubmit release AAB bundle.';
    const merged = MergeService.mergeBodies(baseNote.body, incomingBody);
    expect(merged).toContain('Initial notes on SQLite architecture.');
    expect(merged).toContain('Submit release AAB bundle.');
    expect(merged).toContain('Synchronized Additional Notes');
  });

  it('reconciles checklists by unionizing items and prioritizing completed status', () => {
    const incomingChecklists: ChecklistItem[] = [
      { id: 'c2', text: 'Review ProGuard keep rules', completed: true }, // Completed remotely
      { id: 'c3', text: 'Run cold-start integrity audit', completed: false },
    ];

    const result = MergeService.mergeChecklists(baseNote.checklist_items!, incomingChecklists);

    expect(result.length).toBe(3);
    const c2 = result.find((item) => item.text === 'Review ProGuard keep rules');
    expect(c2?.completed).toBe(true);
    const c3 = result.find((item) => item.text === 'Run cold-start integrity audit');
    expect(c3).toBeDefined();
  });

  it('reconciles entire note records and unionizes distinct tags', () => {
    const incoming: Partial<NoteRecord> = {
      title: 'Design Review',
      tags: ['android', 'release', 'foss'],
      body: '## Architecture\n\nInitial notes on SQLite architecture.\n\nAdditional notes.',
    };

    const res = MergeService.mergeNotes(baseNote, incoming);
    expect(res.mergedNote.tags).toEqual(
      expect.arrayContaining(['work', 'android', 'release', 'foss'])
    );
    expect(res.hasConflict).toBe(false);
  });
});
