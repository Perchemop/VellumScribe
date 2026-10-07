import { webcrypto } from 'node:crypto';

// Provide Web Crypto for PBKDF2 / AES-GCM / SHA-256 tests under Node.
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}

// Minimal localStorage for unit tests that touch persistence helpers.
// (Vitest runs in the node environment to avoid jsdom/undici crashes on CI.)
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = localStorageMock;
}
