import { KeystoreSecret } from '../types';

const KEYSTORE_STORAGE_KEY = 'vellumscribe_hardware_keystore_v1';

/**
 * Clean baseline hardware-backed secret descriptors.
 * No hardcoded sensitive keys or identifiable prefix strings are stored.
 */
const INITIAL_SECRETS: KeystoreSecret[] = [];

export class AndroidKeystoreManager {
  private static cache: KeystoreSecret[] | null = null;

  private static getStored(): KeystoreSecret[] {
    if (this.cache) {
      return this.cache;
    }
    try {
      const raw = localStorage.getItem(KEYSTORE_STORAGE_KEY);
      if (raw) {
        this.cache = JSON.parse(raw);
        return this.cache || INITIAL_SECRETS;
      }
    } catch (e) {
      console.error('Failed to read keystore from storage', e);
    }
    this.cache = [...INITIAL_SECRETS];
    return this.cache;
  }

  private static save(secrets: KeystoreSecret[]) {
    this.cache = secrets;
    try {
      localStorage.setItem(KEYSTORE_STORAGE_KEY, JSON.stringify(secrets));
    } catch (e) {
      console.error('Failed to write to keystore storage', e);
    }
  }

  public static listSecrets(): KeystoreSecret[] {
    return this.getStored();
  }

  public static saveSecret(alias: string, rawValue: string, keyType: KeystoreSecret['key_type']): KeystoreSecret {
    const secrets = [...this.getStored()];
    // Generate uniform, safe masked string without leaking sensitive prefix formats
    const masked = rawValue.length > 8
      ? '••••••••••••••••••••••••' + rawValue.slice(-4)
      : '••••••••••••••••';

    const existingIdx = secrets.findIndex((s) => s.alias === alias);
    const newSecret: KeystoreSecret = {
      alias,
      key_type: keyType,
      masked_value: masked,
      created_at: new Date().toISOString(),
      hardware_backed: true,
      algorithm: 'AES-256-GCM',
    };

    if (existingIdx >= 0) {
      secrets[existingIdx] = newSecret;
    } else {
      secrets.push(newSecret);
    }

    this.save(secrets);
    return newSecret;
  }

  public static setSecret(alias: string, rawValue: string, keyType: KeystoreSecret['key_type']): KeystoreSecret {
    return this.saveSecret(alias, rawValue, keyType);
  }

  public static deleteSecret(alias: string): boolean {
    const secrets = this.getStored().filter((s) => s.alias !== alias);
    this.save(secrets);
    return true;
  }

  public static rotateKey(alias: string): KeystoreSecret | null {
    const secrets = [...this.getStored()];
    const idx = secrets.findIndex((s) => s.alias === alias);
    if (idx < 0) return null;

    secrets[idx] = {
      ...secrets[idx],
      created_at: new Date().toISOString(),
      masked_value: '••••••••[ROTATED]••••••••',
    };
    this.save(secrets);
    return secrets[idx];
  }
}

export const SecureKeystore = AndroidKeystoreManager;
