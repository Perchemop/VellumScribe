/**
 * Cryptographic utility functions for secure PIN hashing,
 * salt derivation, and key generation using the Web Crypto API.
 */

export async function hashPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const activeSalt =
    salt ||
    (typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${pin}:${activeSalt}`);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return { hash, salt: activeSalt };
  }

  // Fallback hash implementation if WebCrypto subtle is unavailable in legacy WebViews
  let hashNum = 0;
  const combined = `${pin}:${activeSalt}`;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hashNum = (hashNum << 5) - hashNum + char;
    hashNum |= 0;
  }
  return { hash: `fallback_${Math.abs(hashNum).toString(16)}`, salt: activeSalt };
}

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

  const { hash } = await hashPin(enteredPin, storedSalt);
  return hash === storedHash;
}
