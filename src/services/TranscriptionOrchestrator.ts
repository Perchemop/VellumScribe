/**
 * Transcription Orchestrator
 * Single authoritative pipeline for speech transcription across platforms and privacy policies.
 * 
 * Enforces:
 * - Privacy Policy: 'offline_only' | 'local_first' | 'cloud_allowed'
 * - Offline network gating: Never calls remote transcription in 'offline_only' mode or when PrivacyManager blocks network.
 * - Genuine Engine Selection: Distinguishes on-device native Whisper, browser offline acoustic analyzer, and cloud AI.
 * - Immutable Raw Transcripts: Keeps raw transcript intact; AI-derived insights (summaries, actions, entities) are separate proposals.
 * - Durable Checkpointing & Recovery.
 */

import { Capacitor } from '@capacitor/core';
import { PrivacyManager } from '../lib/privacyManager';
import { AppLogger } from '../lib/logger';
import { OfflineAiManager } from './OfflineAiManager';
import { RecordingRepository } from '../repositories/RecordingRepository';
import { TranscriptionRepository } from '../repositories/TranscriptionRepository';
import { MediaRepository } from '../lib/MediaRepository';
import { GeminiService } from '../lib/geminiService';
import {
  RecordingRecord,
  TranscriptionEntity,
  StructuredAiExtraction,
  OfflineAiErrorCode,
} from '../types';

export type TranscriptionPolicy = 'offline_only' | 'local_first' | 'cloud_allowed';

export interface TranscriptionInput {
  recordingId?: number;
  noteId?: number;
  audioBlob?: Blob;
  mediaKey?: string;
  audioPath?: string;
  mimeType?: string;
  durationSeconds?: number;
  language?: string;
  liveTranscript?: string;
  liveCapturedText?: string;
}

export interface TranscriptionOptions {
  modelId?: string;
  policy?: TranscriptionPolicy;
  onProgress?: (progress: { percent: number; phase: string; status: string }) => void;
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  transcript: string;
  engineId: string;
  engineVersion: string;
  modelId: string;
  source: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  isOffline: boolean;
  metadata?: Record<string, unknown>;
}

export interface TranscriptionEngine {
  id: string;
  version: string;
  isAvailable(): Promise<boolean>;
  transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult>;
}

/**
 * On-Device Android Whisper Native Engine
 */
export class AndroidWhisperEngine implements TranscriptionEngine {
  public id = 'whisper.cpp';
  public version = '1.5.4';

  public async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }
    const caps = await OfflineAiManager.getInstance().getDeviceCapabilities();
    return Boolean(caps.isNativeEngineAvailable && caps.inferenceRuntimeReady);
  }

  public async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const aiMgr = OfflineAiManager.getInstance();
    const caps = await aiMgr.getDeviceCapabilities();

    if (!caps.isNativeEngineAvailable || !caps.inferenceRuntimeReady) {
      throw new Error('OFFLINE_AI_ENGINE_UNAVAILABLE: Native Whisper tensor execution runtime is not available on this device.');
    }

    if (!input.recordingId) {
      throw new Error('OFFLINE_AI_AUDIO_INVALID: Native Whisper engine requires a persistent recording ID.');
    }

    const startRes = await aiMgr.transcribeRecording(input.recordingId, {
      modelId: options.modelId || 'whisper-base',
      language: input.language || 'auto',
    });

    const jobId = startRes.jobId;
    let pollCount = 0;

    // Poll until completion, failure, or cancellation
    while (true) {
      if (options.signal?.aborted) {
        await aiMgr.cancelTranscription(jobId);
        throw new Error('OFFLINE_AI_CANCELLED: Transcription cancelled by user.');
      }

      const status = await aiMgr.getTranscriptionStatus(jobId);

      if (options.onProgress) {
        options.onProgress({
          percent: status.progressPercent || 0,
          phase: status.status,
          status: status.phaseLabel || 'Processing offline audio...',
        });
      }

      if (status.status === 'COMPLETED') {
        const fullText = (status.transcript || '').trim();
        if (!fullText) {
          throw new Error('OFFLINE_AI_NO_SPEECH: No speech activity was detected in the audio recording.');
        }

        return {
          transcript: fullText,
          engineId: this.id,
          engineVersion: this.version,
          modelId: options.modelId || 'whisper-base',
          source: 'on_device_whisper',
          isOffline: true,
          metadata: {
            jobId,
            totalChunks: status.totalChunks || 1,
          },
        };
      }

      if (status.status === 'FAILED') {
        throw new Error(status.error || 'OFFLINE_AI_ENGINE_UNAVAILABLE: On-device speech recognition failed.');
      }

      if (status.status === 'CANCELLED') {
        throw new Error('OFFLINE_AI_CANCELLED: Transcription was cancelled.');
      }

      await new Promise((r) => setTimeout(r, 600));
      pollCount++;
      if (pollCount > 1000) {
        throw new Error('OFFLINE_AI_TIMEOUT: Transcription exceeded allowable timeout.');
      }
    }
  }
}

/**
 * On-Device Browser Acoustic & Dictation Engine
 */
export class WebOfflineEngine implements TranscriptionEngine {
  public id = 'browser_acoustic_analyzer';
  public version = '2.0.0';

  public async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined';
  }

  public async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const { OfflineTranscriptionEngine } = await import('../lib/offlineTranscription');

    let audioPayload: Blob | string = '';
    if (input.audioBlob) {
      audioPayload = input.audioBlob;
    } else if (input.mediaKey) {
      const blob = await MediaRepository.getBinary(input.mediaKey);
      if (blob) {
        audioPayload = blob;
      }
    }

    if (!audioPayload) {
      throw new Error('OFFLINE_AI_AUDIO_INVALID: Audio binary is missing from local storage.');
    }

    options.onProgress?.({
      percent: 50,
      phase: 'analyzing',
      status: 'Analyzing acoustic speech structure offline...',
    });

    const liveText = input.liveCapturedText || input.liveTranscript;
    const offlineRes = await OfflineTranscriptionEngine.transcribeAudio(
      audioPayload,
      input.mimeType || 'audio/webm',
      input.durationSeconds || 0,
      liveText
    );

    options.onProgress?.({
      percent: 100,
      phase: 'completed',
      status: 'Acoustic analysis complete.',
    });

    return {
      transcript: offlineRes.transcript,
      engineId: this.id,
      engineVersion: this.version,
      modelId: 'web_acoustic_v2',
      source: offlineRes.source,
      segments: offlineRes.segments,
      isOffline: true,
    };
  }
}

/**
 * Cloud Gemini Multimodal Audio Engine
 */
export class CloudGeminiEngine implements TranscriptionEngine {
  public id = 'cloud_gemini_multimodal';
  public version = 'gemini-2.5';

  public async isAvailable(): Promise<boolean> {
    return PrivacyManager.isNetworkAllowed();
  }

  public async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    // Assert explicit privacy permissions
    PrivacyManager.assertNetworkAllowed('Cloud Gemini Audio Transcription');

    let audioBlob = input.audioBlob;
    if (!audioBlob && input.mediaKey) {
      audioBlob = (await MediaRepository.getBinary(input.mediaKey)) || undefined;
    }

    if (!audioBlob) {
      throw new Error('AUDIO_NOT_FOUND: Audio binary is missing.');
    }

    const geminiService = GeminiService.getInstance();
    const result = await geminiService.transcribeAudio(audioBlob, {
      mimeType: input.mimeType || 'audio/webm',
      originalFileName: input.mediaKey || `recording_${input.recordingId}.webm`,
      recordingId: input.recordingId,
      signal: options.signal,
      onProgress: (p: any) => {
        options.onProgress?.({
          percent: p.percent,
          phase: p.phase,
          status: p.status,
        });
      },
    });

    return {
      transcript: result.transcript,
      engineId: this.id,
      engineVersion: this.version,
      modelId: 'gemini-multimodal',
      source: result.source || 'cloud_gemini',
      isOffline: false,
    };
  }
}

/**
 * Main Orchestrator Singleton
 */
export class TranscriptionOrchestrator {
  private static instance: TranscriptionOrchestrator;
  private engines: Map<string, TranscriptionEngine> = new Map();

  private constructor() {
    this.registerEngine(new AndroidWhisperEngine());
    this.registerEngine(new WebOfflineEngine());
    this.registerEngine(new CloudGeminiEngine());
  }

  public static getInstance(): TranscriptionOrchestrator {
    if (!this.instance) {
      this.instance = new TranscriptionOrchestrator();
    }
    return this.instance;
  }

  public registerEngine(engine: TranscriptionEngine): void {
    this.engines.set(engine.id, engine);
  }

  /**
   * Orchestrates transcription based on policy, hardware availability, and audio source.
   */
  public async orchestrate(
    input: TranscriptionInput,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const policy: TranscriptionPolicy = options.policy || 'local_first';

    // 1. Verify recording existence if recordingId provided, or synthesize
    let recording: RecordingRecord | null = null;
    if (input.recordingId) {
      recording = await RecordingRepository.getByIdAsync(input.recordingId);
      if (!recording) {
        recording = RecordingRepository.getById(input.recordingId);
      }
    }

    if (!recording && input.recordingId) {
      throw new Error(`OFFLINE_AI_AUDIO_INVALID: Recording #${input.recordingId} was not found on this device.`);
    }

    // Merge metadata
    const mergedInput: TranscriptionInput = {
      ...input,
      mediaKey: input.mediaKey || recording?.media_key,
      audioPath: input.audioPath || recording?.file_path,
      durationSeconds: input.durationSeconds || recording?.duration_seconds || 0,
      mimeType: input.mimeType || recording?.mime_type || 'audio/wav',
    };

    // 2. Select appropriate engine
    const engine = await this.selectEngine(policy, mergedInput);
    AppLogger.info('TranscriptionOrchestrator', `Selected engine: ${engine.id} under policy: ${policy}`);

    // 3. Register initial durable job in SQLite if recordingId exists
    let durableRecord: TranscriptionEntity | null = null;
    if (input.recordingId) {
      try {
        durableRecord = TranscriptionRepository.save({
          recording_id: input.recordingId,
          engine: engine.id,
          engine_version: engine.version,
          model_id: options.modelId || 'default',
          language: input.language || 'auto',
          status: 'PREPARING',
          started_at: Date.now(),
        });
      } catch (saveErr) {
        AppLogger.warn('TranscriptionOrchestrator', 'Failed to register initial durable job record', saveErr);
      }
    }

    try {
      // 4. Run real inference via chosen engine
      const result = await engine.transcribe(mergedInput, options);

      // Strict validation: Reject synthetic text or VAD instructional placeholders (T-P0.3)
      const text = (result.transcript || '').trim();
      const looksLikePlaceholder =
        /verbatim speech-to-text transcription requires/i.test(text) ||
        /speech activity detected across/i.test(text) ||
        text.startsWith('### Audio Recording') ||
        text.startsWith('### Audio Voice Memo') ||
        /captured locally on-device/i.test(text);

      if (!text || looksLikePlaceholder) {
        throw new Error(
          result.isOffline
            ? 'OFFLINE_AI_ENGINE_UNAVAILABLE: No on-device speech engine produced a transcript. Use live dictation during recording, install a working Whisper runtime, or enable Cloud AI.'
            : 'OFFLINE_AI_NO_SPEECH: Empty transcript.'
        );
      }

      // 5. Persist durable completion
      if (durableRecord?.id) {
        try {
          TranscriptionRepository.updateStatus(
            durableRecord.id,
            'COMPLETED',
            undefined,
            undefined
          );
          // Persist immutable raw transcript
          TranscriptionRepository.saveTranscription({
            id: durableRecord.id,
            recording_id: input.recordingId || 0,
            engine: engine.id,
            engine_version: engine.version,
            model_id: result.modelId,
            language: input.language || 'auto',
            status: 'COMPLETED',
            text: result.transcript,
            completed_at: Date.now(),
          });
        } catch (updateErr) {
          AppLogger.warn('TranscriptionOrchestrator', 'Failed updating durable transcript completion', updateErr);
        }
      }

      return result;
    } catch (err: any) {
      AppLogger.error('TranscriptionOrchestrator', 'Transcription failed', err);
      if (durableRecord?.id) {
        try {
          const errorCode = err?.message?.includes('OFFLINE_AI')
            ? (err.message.split(':')[0] as OfflineAiErrorCode)
            : 'OFFLINE_AI_UNKNOWN';
          TranscriptionRepository.updateStatus(
            durableRecord.id,
            'FAILED',
            errorCode,
            err?.message || 'Transcription failed'
          );
        } catch (failErr) {
          AppLogger.warn('TranscriptionOrchestrator', 'Failed to record failed status', failErr);
        }
      }
      throw err;
    }
  }

  /**
   * Determine the optimal engine based on policy, hardware capability, and available speech tokens
   */
  private async selectEngine(
    policy: TranscriptionPolicy,
    input?: TranscriptionInput
  ): Promise<TranscriptionEngine> {
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const isOfflineMode = !PrivacyManager.isNetworkAllowed() || policy === 'offline_only';
    const liveText = input?.liveCapturedText || input?.liveTranscript;
    const hasLiveText = Boolean(liveText && liveText.trim().length > 0);

    // 1. Android Native Platform
    if (isAndroid) {
      const whisper = this.engines.get('whisper.cpp');
      if (whisper && (await whisper.isAvailable())) {
        return whisper;
      }
    }

    // 2. Strict Offline Mode: Never call remote network
    if (isOfflineMode) {
      const whisper = this.engines.get('whisper.cpp');
      if (whisper && (await whisper.isAvailable())) {
        return whisper;
      }
      if (hasLiveText) {
        const webOffline = this.engines.get('browser_acoustic_analyzer');
        if (webOffline && (await webOffline.isAvailable())) {
          return webOffline;
        }
      }
      throw new Error(
        'OFFLINE_AI_ENGINE_UNAVAILABLE: Offline transcription requires live microphone dictation during recording or an active native Whisper runtime. Neither is available for this recording.'
      );
    }

    // 3. Local-First Mode
    if (policy === 'local_first') {
      const whisper = this.engines.get('whisper.cpp');
      if (whisper && (await whisper.isAvailable())) {
        return whisper;
      }
      if (hasLiveText) {
        const webOffline = this.engines.get('browser_acoustic_analyzer');
        if (webOffline && (await webOffline.isAvailable())) {
          return webOffline;
        }
      }
      // If network is allowed and cloud is permitted, use Cloud AI
      const cloud = this.engines.get('cloud_gemini_multimodal');
      if (cloud && (await cloud.isAvailable())) {
        return cloud;
      }
    }

    // 4. Cloud Allowed
    if (policy === 'cloud_allowed') {
      const cloud = this.engines.get('cloud_gemini_multimodal');
      if (cloud && (await cloud.isAvailable())) {
        return cloud;
      }
      if (hasLiveText) {
        const webOffline = this.engines.get('browser_acoustic_analyzer');
        if (webOffline && (await webOffline.isAvailable())) {
          return webOffline;
        }
      }
    }

    throw new Error(
      'OFFLINE_AI_ENGINE_UNAVAILABLE: No compatible transcription engine could be initialized. Use live dictation during recording, install a Whisper runtime, or enable Cloud AI.'
    );
  }
}
