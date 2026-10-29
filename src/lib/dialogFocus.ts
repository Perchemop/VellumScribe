import { useEffect, useRef } from 'react';

/**
 * Focus containment for modal dialogs (GUI audit finding M-4).
 *
 * Keyboard focus must not escape an open dialog: Tab cycles inside it, the
 * first focusable element receives focus when the dialog opens, and focus
 * returns to the element that opened it on close.
 *
 * The cycling decision is a pure function (`nextCyclicIndex`) so it is
 * testable headlessly (this repo's test env is node, no DOM).
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pure: which focusable index should receive focus next. Wraps at the edges. */
export function nextCyclicIndex(count: number, currentIndex: number, backwards: boolean): number {
  if (count <= 0) return -1;
  // Nothing focused: forward starts at the first item (base -1 → 0), backward
  // starts at the last item (base count → count-1).
  const base = currentIndex < 0 ? (backwards ? count : -1) : currentIndex;
  return (base + (backwards ? -1 : 1) + count) % count;
}

/** Collect the currently focusable elements inside a dialog root. */
export function getDialogFocusables(root: ParentNode): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Traps focus inside the dialog while `active` is true.
 * Returns the ref to attach to the dialog card element.
 */
export function useDialogFocusTrap<T extends HTMLElement>(
  active: boolean
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const dialog = ref.current;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Initial focus: first focusable in the dialog (or the card itself).
    const focusables = getDialogFocusables(dialog);
    (focusables[0] ?? dialog).focus({ preventScroll: true });

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = getDialogFocusables(dialog);
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIdx = nextCyclicIndex(items.length, currentIndex, event.shiftKey);
      event.preventDefault();
      items[nextIdx]?.focus();
    };

    document.addEventListener('keydown', handleKeydown, true);
    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      previouslyFocused.current?.focus({ preventScroll: true });
    };
  }, [active]);

  return ref;
}
