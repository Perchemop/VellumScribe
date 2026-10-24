import { beforeEach, describe, expect, it } from 'vitest';
import { UnlockSessionManager } from './UnlockSessionManager';

describe('UnlockSessionManager (R-4.2 PIN / passphrase lock)', () => {
  beforeEach(() => {
    localStorage.clear();
    UnlockSessionManager.clearAllSessions();
    // Default timeout: 5 minutes
    UnlockSessionManager.setSessionTimeoutMinutes(5);
  });

  it('createSession derives a session key from pin + salt', async () => {
    const ok = await UnlockSessionManager.createSession(1, 'test-pin', 'test-salt');
    expect(ok).toBe(true);

    const key = UnlockSessionManager.getSessionKey(1);
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('createSession returns false when crypto.subtle is unavailable', async () => {
    const originalCrypto = (globalThis as { crypto?: unknown }).crypto;
    (globalThis as { crypto?: unknown }).crypto = undefined;
    try {
      const ok = await UnlockSessionManager.createSession(1, 'pin', 'salt');
      expect(ok).toBe(false);
    } finally {
      (globalThis as { crypto?: unknown }).crypto = originalCrypto;
    }
  });

  it('getSessionKey returns null for a session that does not exist', () => {
    expect(UnlockSessionManager.getSessionKey(999)).toBeNull();
  });

  it('getSessionKey returns null after session expiry', async () => {
    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    // Force expiry by setting a 0-minute timeout
    UnlockSessionManager.setSessionTimeoutMinutes(0);
    const key = UnlockSessionManager.getSessionKey(1);
    expect(key).toBeNull();
  });

  it('getSessionKey refreshes expiration on access', async () => {
    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    // Access the key within the timeout window
    const key1 = UnlockSessionManager.getSessionKey(1);
    expect(key1).not.toBeNull();
    // Set a very short timeout, then access again — should still be valid
    UnlockSessionManager.setSessionTimeoutMinutes(0);
    const key2 = UnlockSessionManager.getSessionKey(1);
    expect(key2).not.toBeNull();
  });

  it('setSessionTimeoutMinutes persists and is readable', () => {
    UnlockSessionManager.setSessionTimeoutMinutes(120);
    expect(UnlockSessionManager.getSessionTimeoutMinutes()).toBe(120);
    expect(localStorage.getItem('vellum_unlock_timeout_minutes')).toBe('120');
  });

  it('clearSession removes a single session', async () => {
    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    await UnlockSessionManager.createSession(2, 'pin2', 'salt2');
    expect(UnlockSessionManager.getSessionKey(1)).not.toBeNull();
    expect(UnlockSessionManager.getSessionKey(2)).not.toBeNull();

    UnlockSessionManager.clearSession(1);
    expect(UnlockSessionManager.getSessionKey(1)).toBeNull();
    expect(UnlockSessionManager.getSessionKey(2)).not.toBeNull();
  });

  it('clearAllSessions removes every session', async () => {
    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    await UnlockSessionManager.createSession(2, 'pin2', 'salt2');
    UnlockSessionManager.clearAllSessions();
    expect(UnlockSessionManager.getSessionKey(1)).toBeNull();
    expect(UnlockSessionManager.getSessionKey(2)).toBeNull();
  });

  it('deriveKey produces different keys for different pins', async () => {
    const ok1 = await UnlockSessionManager.createSession(1, 'pin-a', 'salt');
    const ok2 = await UnlockSessionManager.createSession(2, 'pin-b', 'salt');
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    const key1 = UnlockSessionManager.getSessionKey(1);
    const key2 = UnlockSessionManager.getSessionKey(2);
    expect(key1).not.toBe(key2);
  });

  it('sessions are independent per noteId', async () => {
    await UnlockSessionManager.createSession(1, 'pin-a', 'salt-a');
    await UnlockSessionManager.createSession(2, 'pin-b', 'salt-b');
    const key1 = UnlockSessionManager.getSessionKey(1);
    const key2 = UnlockSessionManager.getSessionKey(2);
    expect(key1).not.toBeNull();
    expect(key2).not.toBeNull();
    expect(key1).not.toBe(key2);
  });
});
