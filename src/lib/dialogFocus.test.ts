import { describe, expect, it } from 'vitest';
import { nextCyclicIndex } from './dialogFocus';

/**
 * Focus containment cycling for modal dialogs (GUI audit M-4). The pure
 * decision is pinned here; the DOM wiring lives in useDialogFocusTrap.
 */
describe('nextCyclicIndex — Tab cycling inside a dialog', () => {
  it('moves forward and wraps to the first item', () => {
    expect(nextCyclicIndex(3, 0, false)).toBe(1);
    expect(nextCyclicIndex(3, 1, false)).toBe(2);
    expect(nextCyclicIndex(3, 2, false)).toBe(0);
  });

  it('moves backward with Shift+Tab and wraps to the last item', () => {
    expect(nextCyclicIndex(3, 2, true)).toBe(1);
    expect(nextCyclicIndex(3, 1, true)).toBe(0);
    expect(nextCyclicIndex(3, 0, true)).toBe(2);
  });

  it('starts from the first item when nothing is focused yet', () => {
    expect(nextCyclicIndex(3, -1, false)).toBe(0);
  });

  it('starts from the last item when nothing is focused and moving backward', () => {
    expect(nextCyclicIndex(3, -1, true)).toBe(2);
  });

  it('handles single-item and empty dialogs without escaping', () => {
    expect(nextCyclicIndex(1, 0, false)).toBe(0);
    expect(nextCyclicIndex(1, 0, true)).toBe(0);
    expect(nextCyclicIndex(0, 0, false)).toBe(-1);
  });
});
