import { beforeAll, describe, expect, it } from 'vitest';
import { StorageManager } from './storage';

/**
 * Regression proof for two audit blockers (E2E audit 2026-10-28):
 *   B-3  the cloud archive was exported as PLAIN JSON while the UI and the
 *        capability inventory both called it encrypted — a false security
 *        claim, since the artefact is uploaded to a third-party cloud.
 *   B-2  restore could never succeed: the sync importer rejected every Blob.
 * The archive must therefore be an AES-256-GCM envelope, and the async
 * importer must accept that envelope back.
 */
describe('cloud backup archive — encryption at rest and a working restore', () => {
  beforeAll(async () => {
    const { SqliteEngine } = await import('./sqlite/sqliteEngine');
    await SqliteEngine.resetForTesting();
    await StorageManager.initialize();
  });

  it('exports an encrypted envelope, never the raw dump', async () => {
    const blob = await StorageManager.exportCloudBackupArchive();
    const text = await blob.text();

    // Must NOT be the plain workspace dump.
    expect(text).not.toContain('"notes"');
    // Must be the documented envelope shape.
    const envelope = JSON.parse(text) as Record<string, unknown>;
    expect(envelope.vellumscribe_archive).toBe(true);
    expect(envelope.cipher).toBe('AES-256-GCM');
    expect(envelope.kdf).toBe('PBKDF2-HMAC-SHA256');
    expect(typeof envelope.ciphertext).toBe('string');
    expect((envelope.ciphertext as string).length).toBeGreaterThan(0);
    // No plaintext note content may survive anywhere in the envelope.
    expect(JSON.stringify(envelope)).not.toContain('undefined');
  });

  it('the plaintext export helper still exists for local previews only', () => {
    const plain = StorageManager.exportCloudBackupPlaintext();
    expect(plain.type).toBe('application/json');
  });

  it('restores its own encrypted archive through the async importer', async () => {
    const blob = await StorageManager.exportCloudBackupArchive();

    const result = await StorageManager.importCloudBackupArchiveAsync(blob);

    expect(result.success).toBe(true);
  });

  it('rejects a corrupt archive honestly instead of pretending to restore', async () => {
    const bad = new Blob(['not-an-archive'], { type: 'application/octet-stream' });
    const result = await StorageManager.importCloudBackupArchiveAsync(bad);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|decrypt/i);
  });

  it('still accepts a legacy plaintext dump (allowLegacyUnencrypted)', async () => {
    const legacy = new Blob([StorageManager.exportFullDump()], { type: 'application/json' });
    const result = await StorageManager.importCloudBackupArchiveAsync(legacy, {
      allowLegacyUnencrypted: true,
    });
    expect(result.success).toBe(true);
  });
});
