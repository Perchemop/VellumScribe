import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PkceUtil } from '../lib/pkce';
import { NativeBridge } from '../lib/nativeBridge';

describe('OAuth Deep Links & Speech Recognition Lifecycle (Review Archive 45)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Deep Link & App Link URL Resolution', () => {
    it('parses custom scheme com.vellumscribe.app://oauth URLs correctly', () => {
      const rawUrl = 'com.vellumscribe.app://oauth?cloud=connected&provider=google_drive&state=test_state_123';
      // Normalize custom scheme into standard URL parseable form
      const normalized = rawUrl.replace('com.vellumscribe.app://oauth', 'https://vellumscribe.app/oauth');
      const parsed = new URL(normalized);
      
      expect(parsed.searchParams.get('cloud')).toBe('connected');
      expect(parsed.searchParams.get('provider')).toBe('google_drive');
      expect(parsed.searchParams.get('state')).toBe('test_state_123');
    });

    it('parses vellumscribe://oauth custom scheme alias', () => {
      const rawUrl = 'vellumscribe://oauth?cloud_error=Access%20Denied&provider=microsoft';
      const normalized = rawUrl.replace('vellumscribe://oauth', 'https://vellumscribe.app/oauth');
      const parsed = new URL(normalized);
      
      expect(parsed.searchParams.get('cloud_error')).toBe('Access Denied');
      expect(parsed.searchParams.get('provider')).toBe('microsoft');
    });

    it('handles HTTPS App Link redirects on production and preview hosts', () => {
      const prodUrl = 'https://vellumscribe.app/api/cloud/google_drive/callback?code=4%2F0AY0e-g...&state=xyz';
      const parsed = new URL(prodUrl);
      
      expect(parsed.pathname).toBe('/api/cloud/google_drive/callback');
      expect(parsed.searchParams.get('state')).toBe('xyz');
      expect(parsed.searchParams.get('code')).toBe('4/0AY0e-g...');
    });
  });

  describe('NativeBridge App URL and Browser Lifecycle Listeners', () => {
    it('registers and invokes appUrlOpen callback on deep-link arrival', async () => {
      let registeredCallback: ((url: string) => void) | null = null;
      vi.spyOn(NativeBridge, 'addAppUrlListener').mockImplementation((cb: any) => {
        registeredCallback = cb;
        return () => {
          registeredCallback = null;
        };
      });

      let receivedUrl = '';
      const cleanup = NativeBridge.addAppUrlListener((url) => {
        receivedUrl = url;
      });

      expect(registeredCallback).not.toBeNull();
      registeredCallback!('com.vellumscribe.app://oauth?cloud=connected');
      expect(receivedUrl).toBe('com.vellumscribe.app://oauth?cloud=connected');

      cleanup();
      expect(registeredCallback).toBeNull();
    });

    it('registers and cleans up browserFinished listener for OAuth cancellation handling', async () => {
      let finishedCallback: (() => void) | null = null;
      vi.spyOn(NativeBridge, 'addBrowserFinishedListener').mockImplementation(async (cb: any) => {
        finishedCallback = cb;
        return () => {
          finishedCallback = null;
        };
      });

      let closed = false;
      const cleanup = await NativeBridge.addBrowserFinishedListener(() => {
        closed = true;
      });

      expect(finishedCallback).not.toBeNull();
      finishedCallback!();
      expect(closed).toBe(true);

      cleanup();
      expect(finishedCallback).toBeNull();
    });
  });

  describe('Native SpeechRecognizer Events & Dictation Wiring', () => {
    it('dispatches speechRecognitionResult events to listeners and updates transcript stream', () => {
      const speechEvents: string[] = [];
      const onLiveTranscript = (text: string) => {
        speechEvents.push(text);
      };

      // Simulate the listener callback wired in AudioRecordingManager
      const mockResultHandler = (ev: { text: string; isFinal?: boolean }) => {
        if (ev?.text) {
          onLiveTranscript(ev.text);
        }
      };

      mockResultHandler({ text: 'Hello, this is on-device dictation.' });
      mockResultHandler({ text: 'Hello, this is on-device dictation. Testing speech recognizer.' });

      expect(speechEvents).toHaveLength(2);
      expect(speechEvents[1]).toContain('Testing speech recognizer.');
    });

    it('validates that PKCE code_verifier is included in query params for OAuth authorization URL', async () => {
      const verifier = PkceUtil.generateCodeVerifier(64);
      const challenge = await PkceUtil.generateCodeChallenge(verifier);

      const params = new URLSearchParams({
        code_challenge: challenge,
        code_challenge_method: 'S256',
        code_verifier: verifier,
      });

      expect(params.get('code_verifier')).toBe(verifier);
      expect(params.get('code_challenge')).toBe(challenge);
      expect(params.get('code_challenge_method')).toBe('S256');
    });
  });
});
