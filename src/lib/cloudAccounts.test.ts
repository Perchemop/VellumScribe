import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSyncEngine } from './cloudSync';
import { AndroidKeystoreManager } from './keystore';
import { CloudAccount } from '../types';

/**
 * Token-shaped fixtures are built at runtime: a literal that matches a real
 * credential format trips the secret-scanning gate even though it is fake
 * (same approach as crashReporter.test.ts).
 */
function fakeToken(prefix: string, seed: string): string {
  return prefix + '.' + seed.repeat(8);
}

describe('CloudSyncEngine.persistAccounts — no plaintext cloud credentials (CodeQL js/clear-text-storage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  function makeAccount(provider: CloudAccount['provider'], raw: string): CloudAccount {
    return {
      provider,
      accountId: `${provider}-1`,
      email: 'user@example.com',
      displayName: 'Test User',
      connectedAt: new Date().toISOString(),
      accessToken: raw,
    };
  }

  it('strips raw tokens from localStorage and stores only the account shape', async () => {
    const secret = fakeToken('tok', 'a');
    const account = makeAccount('google_drive', secret);

    const stored = await CloudSyncEngine.persistAccounts([account]);

    const raw = JSON.parse(localStorage.getItem('vs_cloud_accounts') || '[]');
    expect(raw).toHaveLength(1);
    expect(raw[0].provider).toBe('google_drive');
    expect(raw[0].accessToken).toBeUndefined();
    expect(raw[0].email).toBe('user@example.com');
    expect(stored[0].accessToken).toBeUndefined();
  });

  it('does not write the raw token anywhere else in localStorage', async () => {
    const secret = fakeToken('tok', 'b');
    await CloudSyncEngine.persistAccounts([makeAccount('microsoft', secret)]);

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      expect(localStorage.getItem(key)).not.toContain(secret);
    }
  });

  it('leaves keystore metadata for the token alias', async () => {
    const secret = fakeToken('tok', 'c');
    await CloudSyncEngine.persistAccounts([makeAccount('nextcloud', secret)]);

    const meta = AndroidKeystoreManager.listSecrets();
    expect(meta.some((s) => s.alias === 'cloud_nextcloud_token')).toBe(true);
  });

  it('removeAccount also clears the keystore alias', async () => {
    const secret = fakeToken('tok', 'd');
    await CloudSyncEngine.persistAccounts([makeAccount('webdav', secret)]);
    expect(AndroidKeystoreManager.listSecrets().some((s) => s.alias === 'cloud_webdav_token')).toBe(
      true
    );

    CloudSyncEngine.removeAccount('webdav');

    await vi.waitFor(() => {
      expect(
        AndroidKeystoreManager.listSecrets().some((s) => s.alias === 'cloud_webdav_token')
      ).toBe(false);
    });
  });

  it('handles accounts without credentials unchanged', async () => {
    const bare = makeAccount('google_drive', '');
    await CloudSyncEngine.persistAccounts([bare]);
    const raw = JSON.parse(localStorage.getItem('vs_cloud_accounts') || '[]');
    expect(raw).toHaveLength(1);
    expect(raw[0].displayName).toBe('Test User');
  });
});
