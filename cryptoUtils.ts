/** Secure PIN hashing using PBKDF2-HMAC-SHA-256. Legacy SHA-256 PIN hashes remain readable for migration. */

const PBKDF2_ITERATIONS = 210_000;

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt = randomSalt()): Promise<{ hash: string; salt: string }> {
  if (!crypto?.subtle) throw new Error('Secure cryptography is unavailable on this device.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return { hash: `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(bits)}`, salt };
}

async function verifyLegacySha256(pin: string, storedHash: string, salt: string): Promise<boolean> {
  const data = new TextEncoder().encode(`${pin}:${salt}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return toHex(buffer) === storedHash;
}

export async function verifyPin(
  enteredPin: string,
  storedHash?: string,
  storedSalt?: string,
  legacyPlaintextPin?: string
): Promise<boolean> {
  if (legacyPlaintextPin && !storedHash) return enteredPin === legacyPlaintextPin;
  if (!storedHash || !storedSalt || !crypto?.subtle) return false;

  if (storedHash.startsWith('pbkdf2-sha256$')) {
    const parts = storedHash.split('$');
    const iterations = Number(parts[1]);
    if (!iterations || !parts[2]) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(enteredPin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new TextEncoder().encode(storedSalt), iterations, hash: 'SHA-256' },
      key,
      256
    );
    return toHex(bits) === parts[2];
  }

  return verifyLegacySha256(enteredPin, storedHash, storedSalt);
}
