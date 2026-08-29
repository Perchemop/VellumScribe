import { hashPin, verifyPin } from './cryptoUtils';

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
        expiresAt: Date.now() + this.sessionTimeoutMs,
      });
      return true;
    } catch (e) {
      console.error('Failed to create unlock session', e);
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
    session.expiresAt = Date.now() + this.sessionTimeoutMs;
    return session.key;
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
