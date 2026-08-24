import { KeystoreSecret } from '../types';

const KEYSTORE_STORAGE_KEY = 'omninote_android_keystore_v1';

const INITIAL_SECRETS: KeystoreSecret[] = [
  {
    alias: 'gemini_api_key',
    key_type: 'api_key',
    masked_value: 'AIzaSy************************xK9Q',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    hardware_backed: true,
    algorithm: 'AES-256-GCM',
  },
  {
    alias: 'google_drive_refresh_token',
    key_type: 'oauth_refresh_token',
    masked_value: '1//0gM************************aB7x',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    hardware_backed: true,
    algorithm: 'AES-256-GCM',
  },
  {
    alias: 'dropbox_refresh_token',
    key_type: 'oauth_refresh_token',
    masked_value: 'sl.u.A************************9L2k',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    hardware_backed: true,
    algorithm: 'AES-256-GCM',
  },
  {
    alias: 'sqlite_sqlcipher_master_key',
    key_type: 'sqlite_cipher_key',
    masked_value: 'sec_k_************************99f1',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    hardware_backed: true,
    algorithm: 'AES-256-GCM',
  },
];

export class AndroidKeystoreManager {
  private static getStored(): KeystoreSecret[] {
    try {
      const raw = localStorage.getItem(KEYSTORE_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to read keystore from localStorage', e);
    }
    return INITIAL_SECRETS;
  }

  private static save(secrets: KeystoreSecret[]) {
    try {
      localStorage.setItem(KEYSTORE_STORAGE_KEY, JSON.stringify(secrets));
    } catch (e) {
      console.error('Failed to write to keystore', e);
    }
  }

  public static listSecrets(): KeystoreSecret[] {
    return this.getStored();
  }

  public static saveSecret(alias: string, rawValue: string, keyType: KeystoreSecret['key_type']): KeystoreSecret {
    const secrets = this.getStored();
    const masked = rawValue.length > 8 
      ? rawValue.slice(0, 6) + '************************' + rawValue.slice(-4)
      : '********';

    const existingIdx = secrets.findIndex(s => s.alias === alias);
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

  public static deleteSecret(alias: string): boolean {
    const secrets = this.getStored().filter(s => s.alias !== alias);
    this.save(secrets);
    return true;
  }

  public static rotateKey(alias: string): KeystoreSecret | null {
    const secrets = this.getStored();
    const idx = secrets.findIndex(s => s.alias === alias);
    if (idx < 0) return null;

    secrets[idx].created_at = new Date().toISOString();
    secrets[idx].masked_value = secrets[idx].masked_value.slice(0, 6) + '***[ROTATED]***' + Math.random().toString(36).substring(2, 6);
    this.save(secrets);
    return secrets[idx];
  }
}
