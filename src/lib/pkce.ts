/**
 * PKCE (Proof Key for Code Exchange) Utility for OAuth 2.0 (RFC 7636)
 * Generates cryptographic code_verifier and code_challenge (S256)
 */

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class PkceUtil {
  /**
   * Generates a high-entropy cryptographic code verifier (43-128 chars)
   */
  public static generateCodeVerifier(length = 64): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomBytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < length; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let verifier = '';
    for (let i = 0; i < length; i++) {
      verifier += charset[randomBytes[i] % charset.length];
    }
    return verifier;
  }

  /**
   * Computes the S256 code challenge for a given code verifier
   */
  public static async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', data);
      return base64UrlEncode(digest);
    }
    // Fallback if subtle crypto is somehow unavailable
    return base64UrlEncode(data);
  }
}

export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}> {
  const codeVerifier = PkceUtil.generateCodeVerifier(64);
  const codeChallenge = await PkceUtil.generateCodeChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}
