import { Capacitor } from '@capacitor/core';
import { KeystoreSecret } from '../types';

const META_KEY = 'vellumscribe_secure_secret_metadata_v2';

/**
 * Secure secret manager. On Android/iOS the raw secret is stored through a
 * native secure-storage plugin backed by the platform keystore/keychain.
 * Web development keeps only the legacy metadata fallback and must not be
 * used for production secrets.
 */
export class AndroidKeystoreManager {
  private static cache: KeystoreSecret[] | null = null;

  private static getStored(): KeystoreSecret[] {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(META_KEY);
      this.cache = raw ? JSON.parse(raw) : [];
    } catch {
      this.cache = [];
    }
    return this.cache || [];
  }

  private static saveMetadata(secrets: KeystoreSecret[]) {
    this.cache = [...secrets];
    try { localStorage.setItem(META_KEY, JSON.stringify(this.cache)); } catch { /* metadata is non-critical */ }
  }

  public static listSecrets(): KeystoreSecret[] {
    return [...this.getStored()];
  }

  public static async saveSecret(alias: string, rawValue: string, keyType: KeystoreSecret['key_type']): Promise<KeystoreSecret> {
    if (!alias.trim() || !rawValue) throw new Error('Secret alias and value are required.');
    if (Capacitor.isNativePlatform()) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(`vellumscribe.secret.${alias}`, rawValue);
    } else {
      console.warn('[Keystore] Secure native storage is unavailable on web; raw secrets are not persisted.');
    }

    const secrets = [...this.getStored()];
    const existing = secrets.findIndex((s) => s.alias === alias);
    const descriptor: KeystoreSecret = {
      alias,
      key_type: keyType,
      masked_value: rawValue.length > 4 ? `••••••••••••••••${rawValue.slice(-4)}` : '••••••••••••',
      created_at: new Date().toISOString(),
      hardware_backed: Capacitor.isNativePlatform(),
      algorithm: 'AES-256-GCM',
    };
    if (existing >= 0) secrets[existing] = descriptor; else secrets.push(descriptor);
    this.saveMetadata(secrets);
    return descriptor;
  }

  public static async deleteSecret(alias: string): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        await SecureStorage.remove(`vellumscribe.secret.${alias}`);
      } catch (error) { console.warn('[Keystore] Failed to delete secure value', error); }
    }
    this.saveMetadata(this.getStored().filter((s) => s.alias !== alias));
    return true;
  }

  public static async rotateKey(alias: string): Promise<KeystoreSecret | null> {
    const current = this.getStored().find((s) => s.alias === alias);
    if (!current) return null;
    // Rotation is metadata-only unless the caller supplies a new credential.
    // We deliberately do not invent a replacement API credential.
    const rotated = { ...current, created_at: new Date().toISOString() };
    this.saveMetadata(this.getStored().map((s) => s.alias === alias ? rotated : s));
    return rotated;
  }
}
