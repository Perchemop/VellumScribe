import { toHex, fromHex, generateSalt } from './cryptoUtils';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';

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

/** Fields read from an encrypted backup envelope (the rest is ignored). */
interface BackupEnvelope {
  vellumscribe_archive?: boolean;
  schema?: string;
  version?: string | number;
  ciphertext?: string;
  iv?: string;
  salt?: string;
}

export class CloudBackupCrypto {
  private static cachedVaultKey: string | null = null;
  private static readonly BACKUP_PASSPHRASE_SESSION = 'vs_cloud_backup_passphrase';
  private static readonly BACKUP_PASSPHRASE_HINT = 'vs_cloud_backup_passphrase_hint';

  public static setUserBackupPassphrase(passphrase: string | null): void {
    try {
      if (!passphrase || !passphrase.trim()) {
        sessionStorage.removeItem(this.BACKUP_PASSPHRASE_SESSION);
        localStorage.removeItem(this.BACKUP_PASSPHRASE_HINT);
        return;
      }
      const trimmed = passphrase.trim();
      sessionStorage.setItem(this.BACKUP_PASSPHRASE_SESSION, trimmed);
      localStorage.setItem(this.BACKUP_PASSPHRASE_HINT, String(trimmed.length));
    } catch {
      /* ignore */
    }
  }

  public static getUserBackupPassphrase(): string | undefined {
    try {
      return sessionStorage.getItem(this.BACKUP_PASSPHRASE_SESSION) || undefined;
    } catch {
      return undefined;
    }
  }

  public static hasUserBackupPassphraseConfigured(): boolean {
    try {
      return Boolean(localStorage.getItem(this.BACKUP_PASSPHRASE_HINT));
    } catch {
      return false;
    }
  }

  public static async getClientVaultKeyAsync(): Promise<string> {
    if (this.cachedVaultKey) return this.cachedVaultKey;
    try {
      const { AndroidKeystoreManager } = await import('./keystore');
      const allSecrets = AndroidKeystoreManager.listSecrets();
      const vaultSecretMeta = allSecrets.find((s) => s.alias === 'client_vault_key');

      let key = await AndroidKeystoreManager.getSecret('client_vault_key');
      if (!key) {
        if (vaultSecretMeta) {
          throw new Error(
            'Device master vault key is registered in secure storage metadata but could not be decrypted. Failing closed to prevent data corruption.'
          );
        }

        const legacyKey = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_VAULT_KEY_STORAGE) : null;
        if (legacyKey && legacyKey.trim()) {
          key = legacyKey.trim();
          await AndroidKeystoreManager.saveSecret('client_vault_key', key, 'sqlite_cipher_key');
          const verified = await AndroidKeystoreManager.getSecret('client_vault_key');
          if (verified === key && typeof localStorage !== 'undefined') {
            localStorage.removeItem(CLIENT_VAULT_KEY_STORAGE);
          }
        } else {
          key = generateSalt() + generateSalt();
          await AndroidKeystoreManager.saveSecret('client_vault_key', key, 'sqlite_cipher_key');
        }
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CLIENT_VAULT_KEY_STORAGE);
      }
      this.cachedVaultKey = key;
      return key;
    } catch (_err) {
      const err = asErrorLike(_err);
      if (err?.message?.includes('Failing closed')) {
        throw err;
      }
      return this.getOrCreateClientVaultKey();
    }
  }

  public static getOrCreateClientVaultKey(): string {
    if (this.cachedVaultKey) return this.cachedVaultKey;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vellumscribe_keystore_metadata_v2') : null;
      if (raw && raw.includes('"alias":"client_vault_key"')) {
        throw new Error(
          'Device master vault key is registered in secure storage metadata but could not be retrieved synchronously. Refusing to create ephemeral key.'
        );
      }
    } catch (_e) {
      const e = asErrorLike(_e);
      if (e?.message?.includes('Refusing')) throw e;
    }

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

  /** TS 5.7+ widens Uint8Array over its buffer; the DOM lib narrows BufferSource. */
  private static asBufferSource(data: Uint8Array): BufferSource {
    return data as unknown as BufferSource;
  }

  public static async compressGzip(data: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(this.asBufferSource(data));
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

  public static async decompressGzip(data: Uint8Array): Promise<Uint8Array> {
    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(this.asBufferSource(data));
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
        salt: this.asBufferSource(fromHex(saltHex)),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  public static async encryptArchive(jsonString: string, userPassphrase?: string): Promise<Blob> {
    const passphrase =
      userPassphrase?.trim() ||
      this.getUserBackupPassphrase() ||
      (await this.getClientVaultKeyAsync());
    const saltHex = generateSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(jsonString);
    const compressedBytes = await this.compressGzip(rawBytes);
    const key = await this.deriveKey(passphrase, saltHex);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      this.asBufferSource(compressedBytes)
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
    return new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
  }

  public static async decryptArchive(
    data: Blob | ArrayBuffer | string,
    passphraseOrOptions?: string | { userPassphrase?: string; allowLegacyUnencrypted?: boolean }
  ): Promise<string> {
    const userPassphrase =
      typeof passphraseOrOptions === 'string' ? passphraseOrOptions : passphraseOrOptions?.userPassphrase;
    const allowLegacy =
      typeof passphraseOrOptions === 'object' ? Boolean(passphraseOrOptions?.allowLegacyUnencrypted) : false;

    let rawText: string;
    if (typeof data === 'string') {
      rawText = data;
    } else if (data instanceof Blob) {
      rawText = await data.text();
    } else {
      rawText = new TextDecoder().decode(data);
    }

    let envelope: BackupEnvelope;
    try {
      envelope = JSON.parse(rawText) as BackupEnvelope;
    } catch {
      throw new Error('Invalid backup archive: Content is not valid JSON or encrypted envelope.');
    }

    if (!envelope.vellumscribe_archive && (envelope.schema || envelope.version)) {
      if (!allowLegacy) {
        throw new Error(
          'Legacy unencrypted backup detected. Unencrypted backups cannot be restored via encrypted cloud restore. Please use explicit Legacy Unencrypted Import mode.'
        );
      }
      AppLogger.warn('CloudBackupCrypto', 'Importing legacy unencrypted backup bundle via explicit migration mode.');
      return rawText;
    }

    const { ciphertext: cipherHex, iv: ivHex, salt: saltHex } = envelope;
    if (envelope.vellumscribe_archive !== true || !cipherHex || !ivHex || !saltHex) {
      throw new Error('Unsupported or corrupted encrypted backup envelope.');
    }

    const passphrase =
      userPassphrase?.trim() ||
      this.getUserBackupPassphrase() ||
      (await this.getClientVaultKeyAsync());
    const key = await this.deriveKey(passphrase, saltHex);
    const iv = fromHex(ivHex);
    const ciphertext = fromHex(cipherHex);

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.asBufferSource(iv) },
        key,
        this.asBufferSource(ciphertext)
      );
    } catch {
      throw new Error('Backup decryption failed: Incorrect encryption key or corrupted ciphertext.');
    }

    const decompressedBytes = await this.decompressGzip(new Uint8Array(decryptedBuffer));
    return new TextDecoder().decode(decompressedBytes);
  }
}
