import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    const originalSubtle = crypto.subtle;
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
    try {
      const ok = await UnlockSessionManager.createSession(1, 'pin', 'salt');
      expect(ok).toBe(false);
    } finally {
      Object.defineProperty(crypto, 'subtle', { value: originalSubtle, configurable: true });
    }
  });

  it('getSessionKey returns null for a session that does not exist', () => {
    expect(UnlockSessionManager.getSessionKey(999)).toBeNull();
  });

  it('getSessionKey returns null after session expiry', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    // Default timeout is 5 minutes; key should be valid now
    expect(UnlockSessionManager.getSessionKey(1)).not.toBeNull();

    // Advance past the 5-minute timeout
    vi.setSystemTime(now + 6 * 60 * 1000);
    const key = UnlockSessionManager.getSessionKey(1);
    expect(key).toBeNull();

    vi.useRealTimers();
  });

  it('getSessionKey refreshes expiration on access', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    await UnlockSessionManager.createSession(1, 'pin', 'salt');
    const key1 = UnlockSessionManager.getSessionKey(1);
    expect(key1).not.toBeNull();

    // Access again before expiry (4 min later, within 5-min window) — refreshes expiration
    vi.setSystemTime(now + 4 * 60 * 1000);
    const key2 = UnlockSessionManager.getSessionKey(1);
    expect(key2).not.toBeNull();

    // Advance past the refreshed expiry (4 min + 5 min = 9 min from start)
    vi.setSystemTime(now + 10 * 60 * 1000);
    const key3 = UnlockSessionManager.getSessionKey(1);
    expect(key3).toBeNull();

    vi.useRealTimers();
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
