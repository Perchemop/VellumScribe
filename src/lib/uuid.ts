/**
 * Cryptographically secure UUID generation for VellumScribe.
 * Replaces insecure Math.random() implementations.
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

  // Pure fallback for extreme edge cases
  const timestamp = Date.now().toString(16);
  const randomHex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `vs-${timestamp}-${randomHex}`;
}

export function generatePrefixedId(prefix: string): string {
  const uuid = generateUUID();
  return `${prefix}_${uuid}`;
}
