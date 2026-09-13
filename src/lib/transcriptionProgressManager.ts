import { PartialTranscriptionSession } from '../types';

const STORAGE_KEY = 'vellumscribe_transcription_sessions_v1';

type Listener = (session: PartialTranscriptionSession | null) => void;

class TranscriptionProgressManagerImpl {
  private listeners = new Map<string, Set<Listener>>();

  private getStore(): Record<string, PartialTranscriptionSession> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private setStore(store: Record<string, PartialTranscriptionSession>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('Failed to save transcription sessions store:', e);
    }
  }

  public saveSession(key: string, session: PartialTranscriptionSession): void {
    if (!key) return;
    const store = this.getStore();
    store[key] = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    this.setStore(store);
    this.notify(key, store[key]);
  }

  public getSession(key: string): PartialTranscriptionSession | null {
    if (!key) return null;
    const store = this.getStore();
    return store[key] || null;
  }

  public removeSession(key: string): void {
    if (!key) return;
    const store = this.getStore();
    if (store[key]) {
      delete store[key];
      this.setStore(store);
      this.notify(key, null);
    }
  }

  public clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.listeners.forEach((listeners, key) => {
        listeners.forEach((fn) => fn(null));
      });
    } catch (e) {
      console.warn('Failed to clear transcription sessions:', e);
    }
  }

  public subscribe(key: string, listener: Listener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    // Initial trigger with current state
    listener(this.getSession(key));

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  private notify(key: string, session: PartialTranscriptionSession | null): void {
    const set = this.listeners.get(key);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(session);
        } catch (err) {
          console.error('TranscriptionProgressManager listener error:', err);
        }
      });
    }
  }
}

export const TranscriptionProgressManager = new TranscriptionProgressManagerImpl();
