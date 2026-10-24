import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => false),
  },
}));

describe('AndroidKeystoreManager (R-4.3 hardware-backed key storage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('isSupported returns false on non-native (web) platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    expect(await AKM.isSupported()).toBe(false);
  });

  it('listSecrets returns an empty array when no secrets are stored', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    expect(AKM.listSecrets()).toEqual([]);
  });

  it('saveSecret stores masked metadata with hardware_backed=false on web', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    const desc = await AKM.saveSecret('my-alias', 'super-secret-value', 'api_key');
    expect(desc.alias).toBe('my-alias');
    expect(desc.key_type).toBe('api_key');
    expect(desc.hardware_backed).toBe(false);
    expect(desc.masked_value).toBe('••••••••••••••••ue');
    expect(desc.algorithm).toBe('AES-256-GCM');
    expect(desc.created_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('getSecret returns null for an unknown alias on web', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    const result = await AKM.getSecret('does-not-exist');
    expect(result).toBeNull();
  });

  it('saveSecret then getSecret round-trips the raw value on web (in-memory)', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    await AKM.saveSecret('my-alias', 'super-secret-value', 'api_key');
    const retrieved = await AKM.getSecret('my-alias');
    expect(retrieved).toBe('super-secret-value');
  });

  it('maskValue obscures the secret value, keeping only the last 4 chars', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    // Access the private method via saveSecret's masked_value output
    await AKM.saveSecret('test', '0123456789abcdef', 'api_key');
    const secrets = AKM.listSecrets();
    expect(secrets[0].masked_value).toBe('••••••••••••••••cdef');
    // Short values are fully masked
    await AKM.saveSecret('short', 'abcd', 'api_key');
    const shortSecrets = AKM.listSecrets();
    expect(shortSecrets[1].masked_value).toBe('••••••••••••');
  });

  it('deleteSecret removes the secret from metadata and runtime store', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    await AKM.saveSecret('to-delete', 'secret-value', 'cloud_credential');
    expect(AKM.listSecrets()).toHaveLength(1);
    expect(await AKM.getSecret('to-delete')).toBe('secret-value');

    const deleted = await AKM.deleteSecret('to-delete');
    expect(deleted).toBe(true);
    expect(AKM.listSecrets()).toHaveLength(0);
    expect(await AKM.getSecret('to-delete')).toBeNull();
  });

  it('deleteSecret returns false for an unknown alias', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    const deleted = await AKM.deleteSecret('does-not-exist');
    expect(deleted).toBe(false);
  });

  it('saveSecret throws when alias or value is empty', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    await expect(AKM.saveSecret('', 'value', 'api_key')).rejects.toThrow(
      'Secret alias and value are required.'
    );
    await expect(AKM.saveSecret('alias', '', 'api_key')).rejects.toThrow(
      'Secret alias and value are required.'
    );
  });

  it('overwriting a secret updates the descriptor in place', async () => {
    const { AndroidKeystoreManager: AKM } = await import('./keystore');
    await AKM.saveSecret('alias', 'first-value', 'api_key');
    await AKM.saveSecret('alias', 'second-value', 'cloud_credential');
    const secrets = AKM.listSecrets();
    expect(secrets).toHaveLength(1);
    expect(secrets[0].key_type).toBe('cloud_credential');
    const retrieved = await AKM.getSecret('alias');
    expect(retrieved).toBe('second-value');
  });
});
