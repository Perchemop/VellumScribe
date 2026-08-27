import { webcrypto } from 'node:crypto';

// jsdom's built-in `crypto` global historically lacks a working
// `crypto.subtle` (SubtleCrypto). Since src/lib/cryptoUtils.ts depends on
// crypto.subtle for PBKDF2/AES-GCM/SHA-256, and we deliberately made that
// code throw a clear error rather than silently fall back to a weaker
// scheme when it's missing (see AUDIT.md), tests need a real
// implementation here or every crypto test would hit that intentional
// "unsupported device" error path instead of the real one.
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
