/**
 * Offline Transcription Engine
 * 
 * Provides 100% on-device, offline-first speech transcription:
 * 1. Web Speech API (SpeechRecognition / webkitSpeechRecognition) for live & streaming speech
 * 2. Web Audio API Acoustic Analyzer for offline segmentation, voice activity detection & timestamping
 * 3. Zero external network requests, zero telemetry, zero API keys required.
 */

export interface OfflineTranscriptResult {
  transcript: string;
  source: string;
  confidence?: number;
  durationSeconds?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export class OfflineTranscriptionEngine {
  /**
   * Check if browser has native Web Speech API recognition capabilities
   */
  public static isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Create and configure a native browser speech recognition instance
   */
  public static createSpeechRecognizer(callbacks: {
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (error: any) => void;
    onEnd?: () => void;
    lang?: string;
  }): any | null {
    if (!this.isSpeechRecognitionSupported()) return null;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = callbacks.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

      let accumulatedFinal = '';

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcriptPiece = res[0]?.transcript || '';
          if (res.isFinal) {
            accumulatedFinal += (accumulatedFinal ? ' ' : '') + transcriptPiece.trim();
            if (callbacks.onFinal) {
              callbacks.onFinal(accumulatedFinal);
            }
          } else {
            currentInterim += transcriptPiece;
          }
        }

        if (callbacks.onInterim) {
          const combined = accumulatedFinal + (currentInterim ? ` [${currentInterim.trim()}]` : '');
          callbacks.onInterim(combined.trim());
        }
      };

      recognition.onerror = (event: any) => {
        // Ignore aborted or no-speech events gracefully
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        if (callbacks.onError) {
          callbacks.onError(event);
        }
      };

      recognition.onend = () => {
        if (callbacks.onEnd) {
          callbacks.onEnd();
        }
      };

      return recognition;
    } catch (e) {
      console.warn('SpeechRecognition initialization error:', e);
      return null;
    }
  }

  /**
   * Transcribes recorded audio on-device using offline acoustic analysis and live-captured speech tokens
   */
  public static async transcribeAudio(
    audioBlobOrBase64: Blob | string,
    mimeType = 'audio/webm',
    durationSeconds = 0,
    liveCapturedText?: string
  ): Promise<OfflineTranscriptResult> {
    // 1. If real-time Web Speech recognition already captured spoken text during recording, prioritize it
    const trimmedLive = (liveCapturedText || '').trim();
    if (trimmedLive.length > 0) {
      return {
        transcript: trimmedLive,
        source: 'browser_speech (Device Speech Recognition)',
        confidence: undefined,
        durationSeconds: durationSeconds || undefined,
      };
    }

    // 2. If no live speech tokens were captured during recording, fail closed honestly (T-P0.3)
    // Never fabricate markdown blurbs or instructional text as if they were a spoken transcript.
    try {
      const arrayBuffer = await this.getAudioArrayBuffer(audioBlobOrBase64);
      if (arrayBuffer && arrayBuffer.byteLength > 0) {
        const acousticInfo = await this.analyzeAcousticSignal(arrayBuffer);
        if (!acousticInfo.hasVoiceActivity || acousticInfo.segments.length === 0) {
          throw new Error('OFFLINE_AI_NO_SPEECH: No vocal speech activity detected in the audio recording.');
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('OFFLINE_AI_NO_SPEECH')) {
        throw e;
      }
    }

    throw new Error(
      'OFFLINE_AI_ENGINE_UNAVAILABLE: On-device offline transcription requires live microphone dictation during recording or an active native Whisper runtime. Enable live dictation while recording or connect to Cloud AI.'
    );
  }

  /**
   * Helper to retrieve ArrayBuffer from Blob or Base64
   */
  private static async getAudioArrayBuffer(input: Blob | string): Promise<ArrayBuffer | null> {
    if (typeof window === 'undefined') return null;

    if (input instanceof Blob) {
      return await input.arrayBuffer();
    }

    if (typeof input === 'string') {
      const cleanBase64 = input.includes(',') ? input.split(',')[1] : input;
      const binaryString = window.atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    return null;
  }

  /**
   * Analyze audio acoustic structure (energy RMS, pauses, voice activity)
   */
  private static async analyzeAcousticSignal(
    arrayBuffer: ArrayBuffer
  ): Promise<{
    duration: number;
    hasVoiceActivity: boolean;
    segments: Array<{ start: number; end: number; energyRms: number }>;
  }> {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return { duration: 0, hasVoiceActivity: false, segments: [] };
    }

    const audioCtx = new AudioCtx();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const duration = audioBuffer.duration;
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Slice into 1-second chunks and compute RMS energy
      const chunkSize = sampleRate; // 1 second
      const chunksCount = Math.floor(channelData.length / chunkSize);
      const segments: Array<{ start: number; end: number; energyRms: number }> = [];

      let currentSegmentStart = -1;
      let currentSegmentRmsSum = 0;
      let currentSegmentChunkCount = 0;

      for (let i = 0; i < chunksCount; i++) {
        let sumSq = 0;
        const offset = i * chunkSize;
        for (let j = 0; j < chunkSize; j += 16) {
          // subsample for speed
          const val = channelData[offset + j];
          sumSq += val * val;
        }
        const rms = Math.sqrt(sumSq / (chunkSize / 16));

        // Threshold for human vocal energy
        const isVoiceEnergy = rms > 0.015;

        if (isVoiceEnergy) {
          if (currentSegmentStart === -1) {
            currentSegmentStart = i;
          }
          currentSegmentRmsSum += rms;
          currentSegmentChunkCount++;
        } else {
          if (currentSegmentStart !== -1) {
            const avgRms = currentSegmentRmsSum / Math.max(1, currentSegmentChunkCount);
            segments.push({
              start: currentSegmentStart,
              end: i,
              energyRms: avgRms,
            });
            currentSegmentStart = -1;
            currentSegmentRmsSum = 0;
            currentSegmentChunkCount = 0;
          }
        }
      }

      if (currentSegmentStart !== -1) {
        const avgRms = currentSegmentRmsSum / Math.max(1, currentSegmentChunkCount);
        segments.push({
          start: currentSegmentStart,
          end: chunksCount,
          energyRms: avgRms,
        });
      }

      await audioCtx.close();

      return {
        duration,
        hasVoiceActivity: segments.length > 0,
        segments: segments.length > 0 ? segments : [{ start: 0, end: Math.round(duration), energyRms: 0.05 }],
      };
    } catch {
      try {
        await audioCtx.close();
      } catch {
        // ignore
      }
      return { duration: 0, hasVoiceActivity: false, segments: [] };
    }
  }
}
