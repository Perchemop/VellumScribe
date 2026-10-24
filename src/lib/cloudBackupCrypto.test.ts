import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudBackupCrypto } from './cloudBackupCrypto';

describe('CloudBackupCrypto (R-5.4 client-side backup encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    CloudBackupCrypto.setUserBackupPassphrase(null);
    vi.restoreAllMocks();
  });

  it('encrypts an archive into an AES-256-GCM envelope, never plaintext', async () => {
    const plaintext = JSON.stringify({ notes: [{ id: 1, body: 'secret note body' }] });
    const blob = await CloudBackupCrypto.encryptArchive(plaintext, 'correct horse battery staple');
    const text = await blob.text();

    // The plaintext must not appear anywhere in the output.
    expect(text).not.toContain('secret note body');

    const envelope = JSON.parse(text);
    expect(envelope.vellumscribe_archive).toBe(true);
    expect(envelope.cipher).toBe('AES-256-GCM');
    expect(envelope.kdf).toBe('PBKDF2-HMAC-SHA256');
    expect(envelope.compression).toBe('gzip');
    expect(envelope.iterations).toBeGreaterThanOrEqual(210000);
    expect(typeof envelope.salt).toBe('string');
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
    expect(typeof envelope.createdAt).toBe('string');
  });

  it('round-trips an archive with the correct passphrase', async () => {
    const plaintext = JSON.stringify({ notes: [{ id: 7, body: 'round trip' }] });
    const blob = await CloudBackupCrypto.encryptArchive(plaintext, 'my-passphrase');
    const restored = await CloudBackupCrypto.decryptArchive(blob, 'my-passphrase');
    expect(restored).toBe(plaintext);
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const blob = await CloudBackupCrypto.encryptArchive('{"a":1}', 'right-passphrase');
    await expect(CloudBackupCrypto.decryptArchive(blob, 'wrong-passphrase')).rejects.toThrow(
      /decryption failed/i
    );
  });

  it('uses the session passphrase when none is passed explicitly', async () => {
    CloudBackupCrypto.setUserBackupPassphrase('session-pass');
    const blob = await CloudBackupCrypto.encryptArchive('{"b":2}');
    const restored = await CloudBackupCrypto.decryptArchive(blob);
    expect(restored).toBe('{"b":2}');
  });

  it('rejects a legacy unencrypted backup unless explicitly allowed', async () => {
    const legacy = JSON.stringify({ schema: 'vellumscribe-v1', notes: [] });
    await expect(CloudBackupCrypto.decryptArchive(legacy, 'whatever')).rejects.toThrow(
      /legacy unencrypted backup/i
    );

    const accepted = await CloudBackupCrypto.decryptArchive(legacy, {
      allowLegacyUnencrypted: true,
    });
    expect(accepted).toBe(legacy);
  });

  it('rejects invalid JSON as a backup archive', async () => {
    await expect(CloudBackupCrypto.decryptArchive('not json at all')).rejects.toThrow(
      /not valid JSON/i
    );
  });

  it('rejects a corrupted envelope missing cipher fields', async () => {
    const corrupted = JSON.stringify({ vellumscribe_archive: true, version: 3 });
    await expect(CloudBackupCrypto.decryptArchive(corrupted)).rejects.toThrow(
      /Unsupported or corrupted/i
    );
  });

  it('compresses and decompresses gzip payloads', async () => {
    const data = new TextEncoder().encode('hello '.repeat(200));
    const compressed = await CloudBackupCrypto.compressGzip(data);
    // gzip magic bytes
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    const restored = await CloudBackupCrypto.decompressGzip(compressed);
    expect(new TextDecoder().decode(restored)).toBe('hello '.repeat(200));
  });
});
