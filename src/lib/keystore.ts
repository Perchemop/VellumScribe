import { Capacitor } from '@capacitor/core';
import { KeystoreSecret } from '../types';
import { AppLogger } from './logger';

const KEYSTORE_STORAGE_KEY = 'vellumscribe_keystore_metadata_v2';

/**
 * Secret metadata registry, with the raw secret itself stored through a real
 * native secure-storage plugin (Android Keystore / iOS Keychain, via
 * @aparajita/capacitor-secure-storage) whenever the app is running as a
 * native Capacitor build.
 *
 * IMPORTANT - what this class does and does not do:
 *  - On a native Android/iOS build, `saveSecret` writes the raw value into
 *    the platform secure storage and only keeps a masked, non-sensitive
 *    descriptor here (alias, masked value, timestamp). `hardware_backed` is
 *    `true` in that case because the OS-level Keystore/Keychain is genuinely
 *    backing the value.
 *  - On the web build (a normal browser tab, not the packaged app), there is
 *    no browser API that provides hardware-backed secret storage. This class
 *    does NOT invent one: it only stores the masked metadata record here and
 *    `hardware_backed` is `false`. Callers are responsible for deciding
 *    whether they still need to keep the raw secret elsewhere (for example,
 *    in memory only, or in plain localStorage with the security trade-offs
 *    that implies) - this class will not silently claim a protection level
 *    it isn't providing.
 */
export class AndroidKeystoreManager {
  private static cache: KeystoreSecret[] | null = null;

  public static async isSupported(): Promise<boolean> {
    return Capacitor.isNativePlatform();
  }

  private static getStored(): KeystoreSecret[] {
    if (this.cache) {
      return this.cache;
    }
    try {
      const raw = localStorage.getItem(KEYSTORE_STORAGE_KEY);
      this.cache = raw ? JSON.parse(raw) : [];
    } catch (e) {
      AppLogger.error('Keystore', 'Failed to read keystore metadata from storage', e);
      this.cache = [];
    }
    return this.cache || [];
  }

  private static save(secrets: KeystoreSecret[]) {
    this.cache = [...secrets];
    try {
      localStorage.setItem(KEYSTORE_STORAGE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      AppLogger.error('Keystore', 'Failed to write keystore metadata to storage', e);
    }
  }

  private static maskValue(rawValue: string): string {
    return rawValue.length > 4 ? '••••••••••••••••' + rawValue.slice(-4) : '••••••••••••';
  }

  /**
   * Returns the non-sensitive metadata records only. The raw secret values
   * are never included here.
   */
  public static listSecrets(): KeystoreSecret[] {
    return [...this.getStored()];
  }

  // In-memory runtime cache for session-only secret retention on web
  private static runtimeSessionSecrets: Map<string, string> = new Map();

  /**
   * Retrieve a secret. On native platforms, reads from platform SecureStorage (Android Keystore / iOS Keychain).
   * On web, retrieves from volatile in-memory session store.
   */
  public static async getSecret(alias: string): Promise<string | null> {
    if (!alias) return null;

    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        const res = (await SecureStorage.get(`vellumscribe.secret.${alias}`)) as
          string | { value?: string } | null;
        if (typeof res === 'string') return res;
        if (res && typeof res.value === 'string') return res.value;
      } catch (e) {
        AppLogger.warn('Keystore', `[Keystore] Native secret retrieval failed for ${alias}:`, e);
      }
    }

    return this.runtimeSessionSecrets.get(alias) || null;
  }

  /**
   * Store a secret. On native platforms the raw value is written to the
   * platform secure storage; on web it is kept in volatile in-memory session
   * storage, while masked metadata is persisted for UI display.
   */
  public static async saveSecret(
    alias: string,
    rawValue: string,
    keyType: KeystoreSecret['key_type']
  ): Promise<KeystoreSecret> {
    if (!alias.trim() || !rawValue) {
      throw new Error('Secret alias and value are required.');
    }

    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      try {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        await SecureStorage.set(`vellumscribe.secret.${alias}`, rawValue);
      } catch (e) {
        AppLogger.error('Keystore', '[Keystore] Native secure storage write failed', e);
        throw new Error('Could not save this secret to the device secure storage.', { cause: e });
      }
    } else {
      this.runtimeSessionSecrets.set(alias, rawValue);
    }

    const secrets = [...this.getStored()];
    const existingIdx = secrets.findIndex((s) => s.alias === alias);
    const descriptor: KeystoreSecret = {
      alias,
      key_type: keyType,
      masked_value: this.maskValue(rawValue),
      created_at: new Date().toISOString(),
      hardware_backed: isNative,
      algorithm: 'AES-256-GCM',
    };

    if (existingIdx >= 0) {
      secrets[existingIdx] = descriptor;
    } else {
      secrets.push(descriptor);
    }

    this.save(secrets);
    return descriptor;
  }

  public static async setSecret(
    alias: string,
    rawValue: string,
    keyType: KeystoreSecret['key_type']
  ): Promise<KeystoreSecret> {
    return this.saveSecret(alias, rawValue, keyType);
  }

  public static async deleteSecret(alias: string): Promise<boolean> {
    const existed = this.getStored().some((s) => s.alias === alias);
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        await SecureStorage.remove(`vellumscribe.secret.${alias}`);
      } catch (e) {
        AppLogger.warn(
          'Keystore',
          '[Keystore] Failed to remove native secure value (continuing to clear local metadata)',
          e
        );
      }
    } else {
      this.runtimeSessionSecrets.delete(alias);
    }
    this.save(this.getStored().filter((s) => s.alias !== alias));
    return existed;
  }

  /**
   * Rotation is metadata-only unless the caller supplies a new raw value via
   * saveSecret. We deliberately do not invent a replacement credential here.
   */
  public static async rotateKey(alias: string): Promise<KeystoreSecret | null> {
    const current = this.getStored().find((s) => s.alias === alias);
    if (!current) return null;
    const rotated: KeystoreSecret = { ...current, created_at: new Date().toISOString() };
    this.save(this.getStored().map((s) => (s.alias === alias ? rotated : s)));
    return rotated;
  }

  /**
   * Scans localStorage for legacy unencrypted credentials and migrates them
   * into the Keystore (native secure storage on Android, volatile session memory on Web).
   * Strips plaintext secrets from localStorage after migration.
   */
  public static async migrateLegacyCredentials(): Promise<number> {
    let migratedCount = 0;
    try {
      // 1. Check legacy Gemini API key
      const legacyGeminiKey =
        localStorage.getItem('gemini_api_key') || localStorage.getItem('vs_gemini_api_key');
      if (legacyGeminiKey && legacyGeminiKey.trim()) {
        await this.saveSecret('gemini_api_key', legacyGeminiKey.trim(), 'api_key');
        localStorage.removeItem('gemini_api_key');
        localStorage.removeItem('vs_gemini_api_key');
        migratedCount++;
      }

      // 2. Check legacy cloud credentials in vs_cloud_accounts
      const rawAccounts = localStorage.getItem('vs_cloud_accounts');
      if (rawAccounts) {
        try {
          const accounts = JSON.parse(rawAccounts);
          if (Array.isArray(accounts)) {
            let sanitized = false;
            for (const acc of accounts) {
              if (acc.token || acc.password || acc.accessToken) {
                const secretVal = acc.token || acc.password || acc.accessToken;
                const alias = `cloud_${acc.provider}_token`;
                await this.saveSecret(alias, secretVal, 'cloud_credential');
                delete acc.token;
                delete acc.password;
                delete acc.accessToken;
                sanitized = true;
                migratedCount++;
              }
            }
            if (sanitized) {
              localStorage.setItem('vs_cloud_accounts', JSON.stringify(accounts));
            }
          }
        } catch {
          // ignore parse failure
        }
      }
    } catch (e) {
      AppLogger.warn('Keystore', '[Keystore] Legacy credential migration notice:', e);
    }
    return migratedCount;
  }
}

export const SecureKeystore = AndroidKeystoreManager;
