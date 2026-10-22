import { AppLogger } from './logger';
/**
 * Cryptographic utility functions for secure PIN hashing,
 * salt derivation, and AES-256-GCM note payload encryption using the Web Crypto API.
 */

// Salt context separator to ensure verification hash and encryption key derivations never collide
const VERIFICATION_SALT_PREFIX = 'v1:verify:';
const ENCRYPTION_SALT_PREFIX = 'v1:encrypt:';
export const PBKDF2_ITERATIONS = 600000;
export const LEGACY_PBKDF2_ITERATIONS = 210000;

export function generateSalt(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('Web Crypto API (crypto.getRandomValues) is required for cryptographically secure salt generation.');
}

export function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Hash a PIN using PBKDF2-HMAC-SHA256 (600,000 rounds standard, configurable) for verification storage.
 */
export async function hashPin(pin: string, salt?: string, iterations = PBKDF2_ITERATIONS): Promise<{ hash: string; salt: string }> {
  const rawSalt = salt ? (salt.startsWith(VERIFICATION_SALT_PREFIX) ? salt.replace(VERIFICATION_SALT_PREFIX, '') : salt) : generateSalt();
  const activeSalt = rawSalt;

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.importKey && crypto.subtle.deriveBits) {
    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin),
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: encoder.encode(VERIFICATION_SALT_PREFIX + activeSalt),
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      return { hash: toHex(derivedBits), salt: activeSalt };
    } catch (e) {
      // PBKDF2 itself failed (e.g. restricted in a locked-down WebView). Do not
      // silently downgrade to a weaker scheme - surface the failure so the
      // caller can tell the user PIN protection is unavailable here.
      throw new Error('Secure PIN hashing (PBKDF2) failed on this device: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // No Web Crypto API available at all.
  throw new Error(
    'This device does not support the Web Crypto API, so a security PIN cannot be safely created. ' +
    'Please update your browser/WebView or use an unlocked note.'
  );
}

/**
 * Verify an entered PIN against a stored hash and salt, with legacy migration support.
 */
export async function verifyPin(
  enteredPin: string,
  storedHash?: string,
  storedSalt?: string,
  legacyPlaintextPin?: string
): Promise<boolean> {
  // Support migration for legacy records that had plaintext lock_pin
  if (legacyPlaintextPin && !storedHash) {
    return enteredPin === legacyPlaintextPin;
  }

  if (!storedHash || !storedSalt) {
    return false;
  }

  // 1. Try modern OWASP recommended 600,000 PBKDF2 rounds
  const { hash: modernHash } = await hashPin(enteredPin, storedSalt, PBKDF2_ITERATIONS);
  if (modernHash === storedHash) {
    return true;
  }

  // 2. Try legacy 210,000 PBKDF2 rounds for existing notes
  const { hash: legacyHash } = await hashPin(enteredPin, storedSalt, LEGACY_PBKDF2_ITERATIONS);
  if (legacyHash === storedHash) {
    return true;
  }

  // 3. Check legacy un-prefixed SHA-256 fallback verification
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const encoder = new TextEncoder();
      const legacyData = encoder.encode(`${enteredPin}:${storedSalt}`);
      const legacyBuffer = await crypto.subtle.digest('SHA-256', legacyData);
      if (toHex(legacyBuffer) === storedHash) {
        return true;
      }
    } catch { /* ignore */ }
  }

  return false;
}

/**
 * Derive an AES-256-GCM CryptoKey from the user's PIN and salt.
 */
export async function deriveAesKey(pin: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.subtle.importKey || !crypto.subtle.deriveKey) {
    return null;
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPTION_SALT_PREFIX + salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface PrivateNotePayloadV1 {
  payload_version: 1;
  title?: string;
  body: string;
  tags?: string[];
  checklist_items?: any[];
  sketch_data?: string;
  sketch_media_key?: string;
  attachment_references?: string[];
  protected_metadata?: {
    security_type?: string;
    reminder_at?: string;
    location_name?: string;
    latitude?: number;
    longitude?: number;
  };
  lock_mode?: 'standard' | 'private';
}

export interface NotePayloadData {
  payload_version?: number;
  title?: string;
  body: string;
  checklist_items?: any[];
  sketch_data?: string;
  sketch_media_key?: string;
  attachment_references?: string[];
  tags?: string[];
  protected_metadata?: {
    security_type?: string;
    reminder_at?: string;
    location_name?: string;
    latitude?: number;
    longitude?: number;
  };
  lock_mode?: 'standard' | 'private';
}

/**
 * Encrypt note content (body, checklist items, sketch) using AES-256-GCM.
 * Returns a serialized string containing { iv, ciphertext, tag }.
 */
export async function encryptNotePayloadV2(
  payload: NotePayloadData,
  key: CryptoKey
): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(jsonStr);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return JSON.stringify({
    v: 2,
    iv: toHex(iv),
    data: toHex(ciphertext),
  });
}

export async function decryptNotePayloadV2(
  encryptedPayload: string,
  key: CryptoKey
): Promise<NotePayloadData | null> {
  try {
    const parsed = JSON.parse(encryptedPayload);
    if (parsed.v === 2 && parsed.iv && parsed.data) {
      const iv = fromHex(parsed.iv);
      const ciphertext = fromHex(parsed.data);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ciphertext as BufferSource
      );
      const decoder = new TextDecoder();
      const decoded = decoder.decode(decryptedBuffer);
      return JSON.parse(decoded);
    }
  } catch (e) {
    AppLogger.error('CryptoUtils', 'Failed to decrypt v2 note payload', e);
  }
  return null;
}

export async function encryptNotePayload(
  payload: NotePayloadData,
  pin: string,
  salt: string
): Promise<string> {
  const jsonStr = JSON.stringify(payload);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.getRandomValues) {
    const key = await deriveAesKey(pin, salt);
    if (key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encoded = encoder.encode(jsonStr);

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
      );

      return JSON.stringify({
        v: 1,
        iv: toHex(iv),
        data: toHex(ciphertext),
      });
    }
  }

  // Earlier versions of this function fell back to a reversible XOR
  // "obfuscation" scheme when AES-GCM wasn't available, which is not
  // meaningfully more secure than storing the note in plain text. A PIN
  // lock that silently downgrades to XOR would tell the user their note is
  // encrypted when it isn't. Fail loudly instead so the caller can tell the
  // user PIN protection isn't available on this device rather than storing
  // content under a false sense of security.
  throw new Error(
    'This device does not support AES-256-GCM encryption (Web Crypto API), so this note cannot be safely locked.'
  );
}

/**
 * Decrypt note content using AES-256-GCM.
 */
export async function decryptNotePayload(
  encryptedPayload: string,
  pin: string,
  salt: string
): Promise<NotePayloadData | null> {
  try {
    const parsed = JSON.parse(encryptedPayload);

    if (parsed.v === 1 && parsed.iv && parsed.data) {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const key = await deriveAesKey(pin, salt);
        if (key) {
          const iv = fromHex(parsed.iv);
          const ciphertext = fromHex(parsed.data);

          const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            ciphertext as BufferSource
          );

          const decoder = new TextDecoder();
          const decoded = decoder.decode(decryptedBuffer);
          return JSON.parse(decoded);
        }
      }
    }
  } catch (e) {
    AppLogger.error('CryptoUtils', 'Failed to decrypt note payload', e);
  }
  return null;
}

/**
 * Migration-only importer for legacy v0 XOR payloads.
 * Decrypts strictly to allow immediate re-encryption into AES-256-GCM v2.
 * Never called during regular note reading or writing.
 */
export async function migrateLegacyV0NotePayload(
  encryptedPayload: string,
  pin: string,
  salt: string
): Promise<NotePayloadData | null> {
  try {
    const parsed = JSON.parse(encryptedPayload);
    if (parsed.v !== 0 || !parsed.data) return null;

    const ciphertext = fromHex(parsed.data);
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(pin + salt);
    const decryptedBytes = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      decryptedBytes[i] = ciphertext[i] ^ keyBytes[i % keyBytes.length];
    }
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBytes));
  } catch {
    return null;
  }
}

export async function encryptBinaryPayloadWithKey(payload: Uint8Array, key: CryptoKey): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload as any
  );
  return {
    iv: toHex(iv),
    data: toHex(ciphertext)
  };
}

export async function decryptBinaryPayloadWithKey(encryptedDataHex: string, ivHex: string, key: CryptoKey): Promise<Uint8Array | null> {
  try {
    const iv = fromHex(ivHex);
    const ciphertext = fromHex(encryptedDataHex);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    );
    return new Uint8Array(decryptedBuffer);
  } catch (e) {
    return null;
  }
}

/**
 * In-memory attempt throttling and lockout to prevent brute-force attacks on PIN-protected notes.
 */
export class PinRateLimiter {
  private static failedAttempts: Map<string, { count: number; lockUntilMs: number }> = new Map();

  public static checkLockout(targetId: number | string): { isLocked: boolean; remainingSeconds: number } {
    const key = String(targetId);
    const state = this.failedAttempts.get(key);
    if (!state) return { isLocked: false, remainingSeconds: 0 };
    const now = Date.now();
    if (state.lockUntilMs > now) {
      return { isLocked: true, remainingSeconds: Math.ceil((state.lockUntilMs - now) / 1000) };
    }
    return { isLocked: false, remainingSeconds: 0 };
  }

  public static recordFailure(targetId: number | string): { count: number; lockSeconds: number } {
    const key = String(targetId);
    const now = Date.now();
    const current = this.failedAttempts.get(key) || { count: 0, lockUntilMs: 0 };
    current.count += 1;

    let lockSeconds = 0;
    if (current.count >= 10) {
      lockSeconds = 300; // 5-minute lockout
    } else if (current.count >= 5) {
      lockSeconds = 30; // 30-second lockout
    }

    current.lockUntilMs = lockSeconds > 0 ? now + lockSeconds * 1000 : 0;
    this.failedAttempts.set(key, current);
    return { count: current.count, lockSeconds };
  }

  public static recordSuccess(targetId: number | string): void {
    this.failedAttempts.delete(String(targetId));
  }

  public static resetAll(): void {
    this.failedAttempts.clear();
  }
}

export { deriveAesKey as deriveEncryptionKey };

