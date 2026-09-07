import { useEffect } from 'react';

type ModalCloseHandler = () => void;

interface ModalEntry {
  id: string;
  close: ModalCloseHandler;
}

class ModalBackStackManager {
  private stack: ModalEntry[] = [];
  private ignoreNextPopState = false;

  public registerModal(id: string, close: ModalCloseHandler): () => void {
    const existingIdx = this.stack.findIndex((item) => item.id === id);
    if (existingIdx !== -1) {
      this.stack[existingIdx].close = close;
    } else {
      this.stack.push({ id, close });
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({ vellumscribe: 'modal', modalId: id }, '');
      }
    }

    return () => {
      this.unregisterModal(id);
    };
  }

  public unregisterModal(id: string): void {
    const idx = this.stack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
      // If modal was closed through on-screen UI (X button / backdrop) instead of popstate,
      // revert the history entry so the browser history stack stays clean.
      if (typeof window !== 'undefined' && window.history && window.history.state?.modalId === id) {
        this.ignoreNextPopState = true;
        window.history.back();
      }
    }
  }

  /**
   * Called when a window 'popstate' event occurs (e.g. Android back gesture or hardware back button).
   * Returns true if a modal was on the stack and was dismissed, meaning the event was consumed.
   */
  public handlePopState(): boolean {
    if (this.ignoreNextPopState) {
      this.ignoreNextPopState = false;
      return true;
    }

    if (this.stack.length > 0) {
      const top = this.stack.pop();
      if (top && typeof top.close === 'function') {
        top.close();
      }
      return true;
    }
    return false;
  }

  public hasOpenModals(): boolean {
    return this.stack.length > 0;
  }
}

export const ModalBackStack = new ModalBackStackManager();

/**
 * Custom React hook for Android hardware/gesture Back navigation integration.
 * When `isOpen` is true, registers the modal on the back stack and pushes a history state.
 * When Android Back button or gesture is used, `onClose` is called to dismiss the modal.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void, modalId: string) {
  useEffect(() => {
    if (!isOpen) return;
    const unregister = ModalBackStack.registerModal(modalId, onClose);
    return () => {
      unregister();
    };
  }, [isOpen, onClose, modalId]);
}
