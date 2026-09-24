/**
 * Cryptographically secure UUID generation for VellumScribe.
 * Uses Web Crypto API crypto.randomUUID() or crypto.getRandomValues().
 */

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set UUID version 4 and variant RFC4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // If running in an environment without crypto, throw controlled error rather than insecure fallback
  throw new Error('Cryptographically secure randomness is unavailable in this runtime.');
}

export function generatePrefixedId(prefix: string): string {
  const uuid = generateUUID();
  return `${prefix}_${uuid}`;
}

