import { describe, expect, it } from 'vitest';
import {
  decryptNotePayload,
  encryptNotePayload,
  fromHex,
  generateSalt,
  hashPin,
  toHex,
  verifyPin,
} from './cryptoUtils';

describe('generateSalt', () => {
  it('produces a non-empty hex-looking string', () => {
    const salt = generateSalt();
    expect(salt).toBeTruthy();
    expect(salt.length).toBeGreaterThanOrEqual(16);
  });

  it('produces different values on each call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
  });
});

describe('toHex / fromHex', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 254, 255, 16, 128]);
    const hex = toHex(original);
    const back = fromHex(hex);
    expect(Array.from(back)).toEqual(Array.from(original));
  });
});

describe('hashPin / verifyPin', () => {
  it('produces a hash and salt for a PIN', async () => {
    const { hash, salt } = await hashPin('1234');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    // SHA-256 digest as hex should be 64 characters.
    expect(hash).toHaveLength(64);
  });

  it('produces a different hash for the same PIN with a different salt', async () => {
    const first = await hashPin('1234');
    const second = await hashPin('1234');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('verifies a correct PIN against its own stored hash/salt', async () => {
    const { hash, salt } = await hashPin('4242');
    await expect(verifyPin('4242', hash, salt)).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const { hash, salt } = await hashPin('4242');
    await expect(verifyPin('0000', hash, salt)).resolves.toBe(false);
  });

  it('rejects when no stored hash/salt is provided', async () => {
    await expect(verifyPin('4242', undefined, undefined)).resolves.toBe(false);
  });

  it('supports legacy plaintext PIN migration when no hash is stored yet', async () => {
    await expect(verifyPin('9999', undefined, undefined, '9999')).resolves.toBe(true);
    await expect(verifyPin('1111', undefined, undefined, '9999')).resolves.toBe(false);
  });
});

describe('encryptNotePayload / decryptNotePayload', () => {
  const payload = {
    body: 'Secret meeting notes',
    checklist_items: [{ id: 'chk_1', text: 'Ship it', completed: false }],
  };

  it('round-trips a note payload with the correct PIN and salt', async () => {
    const salt = generateSalt();
    const encrypted = await encryptNotePayload(payload, '1234', salt);
    expect(encrypted).toContain('"v":1');

    const decrypted = await decryptNotePayload(encrypted, '1234', salt);
    expect(decrypted).toEqual(payload);
  });

  it('fails to decrypt with the wrong PIN', async () => {
    const salt = generateSalt();
    const encrypted = await encryptNotePayload(payload, 'correct-pin', salt);
    const decrypted = await decryptNotePayload(encrypted, 'wrong-pin', salt);
    expect(decrypted).toBeNull();
  });

  it('does not store the plaintext body anywhere in the encrypted output', async () => {
    const salt = generateSalt();
    const encrypted = await encryptNotePayload(payload, '1234', salt);
    expect(encrypted).not.toContain('Secret meeting notes');
  });
});
