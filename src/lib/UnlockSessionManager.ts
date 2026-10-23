import { AppLogger } from './logger';

export class UnlockSessionManager {
  private static activeSessions: Map<number, { key: CryptoKey; expiresAt: number }> = new Map();
  private static sessionTimeoutMs = 5 * 60 * 1000;

  static async createSession(noteId: number, pin: string, salt: string): Promise<boolean> {
    if (typeof crypto === 'undefined' || !crypto.subtle) return false;
    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      const sessionKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: encoder.encode('v1:encrypt:' + salt),
          iterations: 210000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, // non-exportable
        ['encrypt', 'decrypt']
      );

      this.activeSessions.set(noteId, {
        key: sessionKey,
        expiresAt: Date.now() + this.getEffectiveTimeoutMs(),
      });
      return true;
    } catch (e) {
      AppLogger.error('UnlockSessionManager', 'Failed to create unlock session', e);
      return false;
    }
  }

  static getSessionKey(noteId: number): CryptoKey | null {
    const session = this.activeSessions.get(noteId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(noteId);
      return null;
    }
    // Refresh expiration
    session.expiresAt = Date.now() + this.getEffectiveTimeoutMs();
    return session.key;
  }

  private static getEffectiveTimeoutMs(): number {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('vellum_unlock_timeout_minutes')
        : null;
    const mins = stored ? parseInt(stored, 10) : 5;
    return mins <= 0 ? 24 * 60 * 60 * 1000 : mins * 60 * 1000;
  }

  static getSessionTimeoutMinutes(): number {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('vellum_unlock_timeout_minutes')
        : null;
    return stored ? parseInt(stored, 10) : 5;
  }

  static setSessionTimeoutMinutes(minutes: number): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vellum_unlock_timeout_minutes', String(minutes));
    }
  }

  static clearSession(noteId: number) {
    this.activeSessions.delete(noteId);
  }

  static clearAllSessions() {
    this.activeSessions.clear();
  }
}

// Clear sessions on background
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      UnlockSessionManager.clearAllSessions();
    }
  });
}
