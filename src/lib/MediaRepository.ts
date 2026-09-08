import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const DB_NAME = 'vellumscribe_media';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

class IndexedDBStore {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve();
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async put(key: string, blob: Blob): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<Blob | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAllKeys(): Promise<string[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => reject(req.error);
    });
  }
}

const idb = new IndexedDBStore();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export class MediaRepository {
  static async putBinary(key: string, blob: Blob): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: `media/${key}`,
        data: base64,
        directory: Directory.Data,
        recursive: true
      });
    } else {
      await idb.put(key, blob);
    }
  }

  static async getBinary(key: string, mimeType: string = 'application/octet-stream'): Promise<Blob | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await Filesystem.readFile({
          path: `media/${key}`,
          directory: Directory.Data,
        });
        return base64ToBlob(res.data as string, mimeType);
      } catch (e) {
        return null;
      }
    } else {
      return idb.get(key);
    }
  }

  static async deleteBinary(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.deleteFile({
          path: `media/${key}`,
          directory: Directory.Data,
        });
      } catch (e) {}
    } else {
      await idb.delete(key);
    }
  }

  static async listAllKeys(): Promise<string[]> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await Filesystem.readdir({
          path: 'media',
          directory: Directory.Data,
        });
        return res.files.map((f) => (typeof f === 'string' ? f : f.name));
      } catch {
        return [];
      }
    } else {
      return idb.getAllKeys();
    }
  }
}

import { encryptBinaryPayloadWithKey, decryptBinaryPayloadWithKey } from './cryptoUtils';

export class SecureMediaRepository {
  static async encryptBlobWithKey(blob: Blob, cryptoKey: CryptoKey): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const payload = new Uint8Array(arrayBuffer);
    const { iv, data } = await encryptBinaryPayloadWithKey(payload, cryptoKey);
    const envelope = JSON.stringify({ magic: 'vellum_enc_v1', mimeType: blob.type, iv, data });
    return new Blob([envelope], { type: 'application/json' });
  }

  static async decryptBlobWithKey(envelopeBlob: Blob, cryptoKey: CryptoKey): Promise<Blob | null> {
    try {
      const text = await envelopeBlob.text();
      const envelope = JSON.parse(text);
      if (envelope.magic !== 'vellum_enc_v1') return null;
      const decrypted = await decryptBinaryPayloadWithKey(envelope.data, envelope.iv, cryptoKey);
      if (!decrypted) return null;
      return new Blob([decrypted as any], { type: envelope.mimeType });
    } catch {
      return null;
    }
  }

  static async putEncryptedWithKey(key: string, blob: Blob, cryptoKey: CryptoKey): Promise<void> {
    const envelopeBlob = await this.encryptBlobWithKey(blob, cryptoKey);
    await MediaRepository.putBinary(key, envelopeBlob);
  }

  static async getEncryptedWithKey(key: string, cryptoKey: CryptoKey): Promise<Blob | null> {
    const blob = await MediaRepository.getBinary(key, 'application/json');
    if (!blob) return null;
    return this.decryptBlobWithKey(blob, cryptoKey);
  }
}
