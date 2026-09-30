import { describe, it, expect } from 'vitest';
import { PkceUtil, generatePKCE } from './pkce';

describe('PKCE OAuth 2.0 State Machine (RFC 7636)', () => {
  it('generates a valid code verifier with unreserved characters and correct length', () => {
    const verifier = PkceUtil.generateCodeVerifier(64);
    expect(verifier).toBeDefined();
    expect(verifier.length).toBe(64);
    // RFC 7636 unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generates distinct verifiers on subsequent invocations', () => {
    const verifierA = PkceUtil.generateCodeVerifier(64);
    const verifierB = PkceUtil.generateCodeVerifier(64);
    expect(verifierA).not.toBe(verifierB);
  });

  it('computes S256 code challenge with correct base64url format', async () => {
    const pkce = await generatePKCE();
    expect(pkce.codeVerifier).toBeDefined();
    expect(pkce.codeChallenge).toBeDefined();
    expect(pkce.codeChallengeMethod).toBe('S256');

    // Base64url should not have padding '=', '+' or '/'
    expect(pkce.codeChallenge).not.toContain('=');
    expect(pkce.codeChallenge).not.toContain('+');
    expect(pkce.codeChallenge).not.toContain('/');
    expect(pkce.codeChallenge.length).toBeGreaterThan(20);
  });

  it('computes deterministic challenge for a fixed known verifier', async () => {
    const fixedVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge1 = await PkceUtil.generateCodeChallenge(fixedVerifier);
    const challenge2 = await PkceUtil.generateCodeChallenge(fixedVerifier);
    expect(challenge1).toBe(challenge2);
  });
});
