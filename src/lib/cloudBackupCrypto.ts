import { toHex, fromHex, generateSalt } from './cryptoUtils';
import { AppLogger } from './logger';

const CLIENT_VAULT_KEY_STORAGE = 'vs_client_vault_key_v1';
const PBKDF2_ITERATIONS = 210000;

export interface EncryptedCloudBackupEnvelope {
  vellumscribe_archive: true;
  version: 3;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-HMAC-SHA256';
  iterations: number;
  compression: 'gzip';
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

/**
 * CloudBackupCrypto: End-to-End Client-Side Backup Encryption & Compression Engine
 * Enforces AES-256-GCM outer envelope encryption paired with GZIP compression.
 * Cloud backup archives leaving this device contain only encrypted ciphertext.
 */
export class CloudBackupCrypto {
  private static cachedVaultKey: string | null = null;

  /**
   * Retrieves or creates a secure client-side master vault key unique to this device.
   * Leverages AndroidKeystoreManager (hardware-backed AES/GCM) when available.
   */
  public static async getClientVaultKeyAsync(): Promise<string> {
    if (this.cachedVaultKey) return this.cachedVaultKey;
    try {
      const { AndroidKeystoreManager } = await import('./keystore');
      let key = await AndroidKeystoreManager.getSecret('client_vault_key');
      if (!key) {
        const legacyKey = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_VAULT_KEY_STORAGE) : null;
        if (legacyKey && legacyKey.trim()) {
          key = legacyKey.trim();
          await AndroidKeystoreManager.saveSecret('client_vault_key', key, 'sqlite_cipher_key');
          const verified = await AndroidKeystoreManager.getSecret('client_vault_key');
          if (verified === key && typeof localStorage !== 'undefined') {
            localStorage.removeItem(CLIENT_VAULT_KEY_STORAGE);
          }
        } else {
          key = generateSalt() + generateSalt(); // 64 hex characters (256-bit entropy)
          await AndroidKeystoreManager.saveSecret('client_vault_key', key, 'sqlite_cipher_key');
        }
      } else if (typeof localStorage !== 'undefined') {
        // Ensure any legacy plaintext key in localStorage is purged
        localStorage.removeItem(CLIENT_VAULT_KEY_STORAGE);
      }
      this.cachedVaultKey = key;
      return key;
    } catch {
      return this.getOrCreateClientVaultKey();
    }
  }

  public static getOrCreateClientVaultKey(): string {
    if (this.cachedVaultKey) return this.cachedVaultKey;
    // Volatile in-memory vault key - never stored in localStorage
    if (typeof localStorage !== 'undefined') {
      const legacyKey = localStorage.getItem(CLIENT_VAULT_KEY_STORAGE);
      if (legacyKey && legacyKey.trim()) {
        this.cachedVaultKey = legacyKey.trim();
        localStorage.removeItem(CLIENT_VAULT_KEY_STORAGE);
        return this.cachedVaultKey;
      }
    }
    const ephemeralKey = generateSalt() + generateSalt();
    this.cachedVaultKey = ephemeralKey;
    return ephemeralKey;
  }

  /**
   * Compresses data using browser-native CompressionStream('gzip')
   */
  public static async compressGzip(data: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(data as any);
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = cs.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          result.set(c, offset);
          offset += c.length;
        }
        return result;
      } catch (e) {
        AppLogger.warn('CloudBackupCrypto', 'GZIP compression failed, falling back to raw bytes', e);
      }
    }
    return data;
  }

  /**
   * Decompresses gzip data using browser-native DecompressionStream('gzip')
   */
  public static async decompressGzip(data: Uint8Array): Promise<Uint8Array> {
    // Check gzip magic bytes (0x1f, 0x8b)
    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(data as any);
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = ds.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          result.set(c, offset);
          offset += c.length;
        }
        return result;
      } catch (e) {
        AppLogger.warn('CloudBackupCrypto', 'Decompression stream failed', e);
      }
    }
    return data;
  }

  /**
   * Derives an AES-256-GCM CryptoKey using PBKDF2 (210,000 iterations)
   */
  private static async deriveKey(passphrase: string, saltHex: string): Promise<CryptoKey> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API is required for secure client-side backup encryption.');
    }

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: fromHex(saltHex) as any,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Compresses with GZIP and encrypts with AES-256-GCM.
   * Returns a binary Blob ready for cloud upload.
   */
  public static async encryptArchive(jsonString: string, userPassphrase?: string): Promise<Blob> {
    const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());
    const saltHex = generateSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(jsonString);
    const compressedBytes = await this.compressGzip(rawBytes);

    const key = await this.deriveKey(passphrase, saltHex);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      compressedBytes as any
    );

    const envelope: EncryptedCloudBackupEnvelope = {
      vellumscribe_archive: true,
      version: 3,
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-HMAC-SHA256',
      iterations: PBKDF2_ITERATIONS,
      compression: 'gzip',
      salt: saltHex,
      iv: toHex(iv),
      ciphertext: toHex(ciphertextBuffer),
      createdAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(envelope);
    return new Blob([serialized], { type: 'application/octet-stream' });
  }

  /**
   * Decrypts AES-256-GCM envelope and decompresses GZIP archive back to JSON string.
   */
  public static async decryptArchive(data: Blob | ArrayBuffer | string, userPassphrase?: string): Promise<string> {
    let rawText = '';
    if (typeof data === 'string') {
      rawText = data;
    } else if (data instanceof Blob) {
      rawText = await data.text();
    } else {
      const decoder = new TextDecoder();
      rawText = decoder.decode(data);
    }

    let envelope: any = null;
    try {
      envelope = JSON.parse(rawText);
    } catch {
      throw new Error('Invalid backup archive: Content is not valid JSON or encrypted envelope.');
    }

    // Legacy unencrypted JSON fallback support for pre-v3 exports
    if (!envelope.vellumscribe_archive && (envelope.schema || envelope.version)) {
      AppLogger.warn('CloudBackupCrypto', 'Importing legacy unencrypted backup bundle.');
      return rawText;
    }

    if (envelope.vellumscribe_archive !== true || !envelope.ciphertext || !envelope.iv || !envelope.salt) {
      throw new Error('Unsupported or corrupted encrypted backup envelope.');
    }

    const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());
    const key = await this.deriveKey(passphrase, envelope.salt);

    const iv = fromHex(envelope.iv);
    const ciphertext = fromHex(envelope.ciphertext);

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as any },
        key,
        ciphertext as any
      );
    } catch (e: any) {
      throw new Error('Backup decryption failed: Incorrect encryption key or corrupted ciphertext.');
    }

    const decompressedBytes = await this.decompressGzip(new Uint8Array(decryptedBuffer));
    const decoder = new TextDecoder();
    return decoder.decode(decompressedBytes);
  }
}
