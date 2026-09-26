import { PartialTranscriptionSession } from '../types';

const STORAGE_KEY = 'vellumscribe_transcription_sessions_v1';

type Listener = (session: PartialTranscriptionSession | null) => void;

class TranscriptionProgressManagerImpl {
  private listeners = new Map<string, Set<Listener>>();
  private sessions = new Map<string, PartialTranscriptionSession>();

  constructor() {
    // Purge legacy unencrypted localStorage entry if present
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }

  public saveSession(key: string, session: PartialTranscriptionSession): void {
    if (!key) return;
    const updated: PartialTranscriptionSession = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(key, updated);
    this.notify(key, updated);
  }

  public getSession(key: string): PartialTranscriptionSession | null {
    if (!key) return null;
    return this.sessions.get(key) || null;
  }

  public removeSession(key: string): void {
    if (!key) return;
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
      this.notify(key, null);
    }
  }

  public clearAll(): void {
    this.sessions.clear();
    this.listeners.forEach((listeners) => {
      listeners.forEach((fn) => fn(null));
    });
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
