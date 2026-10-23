import { describe, it, expect } from 'vitest';
import { TranscriptionOrchestrator, resolveTranscriptionPolicy } from './TranscriptionOrchestrator';

describe('resolveTranscriptionPolicy (automatic import runs)', () => {
  it('stays offline_only when network is blocked', () => {
    expect(resolveTranscriptionPolicy({ networkAllowed: false, hasCloudAiConsent: true })).toBe(
      'offline_only'
    );
  });

  it('stays offline_only when cloud consent has not been granted', () => {
    expect(resolveTranscriptionPolicy({ networkAllowed: true, hasCloudAiConsent: false })).toBe(
      'offline_only'
    );
  });

  it('prefers local_first only when network and consent are both allowed', () => {
    expect(resolveTranscriptionPolicy({ networkAllowed: true, hasCloudAiConsent: true })).toBe(
      'local_first'
    );
  });
});

describe('TranscriptionOrchestrator Selection & Honesty Matrix', () => {
  it('rejects offline_only policy when no live dictation text is provided and native inference is unavailable', async () => {
    const orchestrator = TranscriptionOrchestrator.getInstance();

    const dummyBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' });

    await expect(
      orchestrator.orchestrate(
        {
          audioBlob: dummyBlob,
          liveTranscript: undefined,
        },
        { policy: 'offline_only' }
      )
    ).rejects.toThrow(/OFFLINE_AI_ENGINE_UNAVAILABLE/i);
  });

  it('succeeds offline when genuine live dictation transcript is provided', async () => {
    const orchestrator = TranscriptionOrchestrator.getInstance();

    const dummyBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' });
    const realDictatedWords = 'Meeting discussion regarding SQLite migration and encrypted media.';

    const result = await orchestrator.orchestrate(
      {
        audioBlob: dummyBlob,
        liveTranscript: realDictatedWords,
      },
      { policy: 'offline_only' }
    );

    expect(result.transcript).toBe(realDictatedWords);
    expect(result.isOffline).toBe(true);
    expect(result.engineId).toBe('browser_acoustic_analyzer');
  });

  it('never stores placeholder instructional text as a successful transcript', async () => {
    const orchestrator = TranscriptionOrchestrator.getInstance();

    const placeholderBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' });

    await expect(
      orchestrator.orchestrate(
        {
          audioBlob: placeholderBlob,
          liveTranscript: '',
        },
        { policy: 'offline_only' }
      )
    ).rejects.toThrow(/(OFFLINE_AI_ENGINE_UNAVAILABLE|OFFLINE_AI_NO_SPEECH|NO_ENGINE)/i);
  });

  it('verifies cloud_only recovery route enforces network privacy permission', async () => {
    const orchestrator = TranscriptionOrchestrator.getInstance();
    const { PrivacyManager } = await import('../lib/privacyManager');

    // Force network disabled in privacy manager
    const originalAllowed = PrivacyManager.isNetworkAllowed;
    PrivacyManager.isNetworkAllowed = () => false;

    try {
      const dummyBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/wav' });
      await expect(
        orchestrator.orchestrate(
          { audioBlob: dummyBlob },
          { policy: 'cloud_only', enginePreference: 'cloud_gemini_multimodal' }
        )
      ).rejects.toThrow(/(Privacy|Network|NO_ENGINE|OFFLINE_AI_ENGINE_UNAVAILABLE)/i);
    } finally {
      PrivacyManager.isNetworkAllowed = originalAllowed;
    }
  });
});
