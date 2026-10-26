import { Capacitor } from '@capacitor/core';
import { OfflineAi } from '../plugins/offline-ai';
import {
  AiCapabilities,
  SpeechModelProfile,
  ModelInstallResult,
  TranscriptionJobStatus,
  TranscriptionEntity,
  OfflineAiErrorCode,
  StructuredAiExtraction,
} from '../types';
import { TranscriptionRepository } from '../repositories/TranscriptionRepository';
import { RecordingRepository } from '../repositories/RecordingRepository';
import { AiResultValidator } from './AiResultValidator';
import { AppLogger } from '../lib/logger';
import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { MediaRepository } from '../lib/MediaRepository';
import { asErrorLike } from '../lib/errorLike';

export interface StorageBreakdown {
  modelsBytes: number;
  recordingsBytes: number;
  transcriptsBytes: number;
  totalBytes: number;
}

function normalizeModelList(raw: unknown): SpeechModelProfile[] {
  if (Array.isArray(raw)) return raw as SpeechModelProfile[];
  const models = (raw as { models?: unknown }).models;
  if (models !== undefined && Array.isArray(models)) {
    return models as SpeechModelProfile[];
  }
  return [];
}

export class OfflineAiManager {
  private static instance: OfflineAiManager;

  public static getInstance(): OfflineAiManager {
    if (!this.instance) {
      this.instance = new OfflineAiManager();
    }
    return this.instance;
  }

  /**
   * Detect device AI capabilities with real metrics (no simulated fallbacks)
   */
  public async getDeviceCapabilities(): Promise<AiCapabilities> {
    try {
      return await OfflineAi.getCapabilities();
    } catch (e) {
      AppLogger.warn('OfflineAiManager', 'Could not query capabilities plugin', e);
      return {
        availableRamMb: null,
        cpuCores: null,
        architecture: null,
        androidApiLevel: null,
        availableStorageMb: null,
        batteryLevel: null,
        isCharging: null,
        recommendedModelId: 'whisper-base',
        isNativeEngineAvailable: false,
        nativeLibraryLoaded: false,
        inferenceRuntimeReady: false,
      };
    }
  }

  /**
   * Recommend speech recognition model based on device capabilities
   */
  public recommendSpeechModel(_capabilities: AiCapabilities): SpeechModelProfile | null {
    return null; // Evaluated dynamically against listSpeechModels
  }

  /**
   * List all speech recognition models
   * Native Android returns `{ models: [...] }`; web returns a bare array.
   */
  public async listSpeechModels(): Promise<SpeechModelProfile[]> {
    try {
      const raw = await OfflineAi.listSpeechModels();
      return normalizeModelList(raw);
    } catch (e) {
      AppLogger.error('OfflineAiManager', 'Failed to list models', e);
      return [];
    }
  }

  /**
   * Install/download speech model with checksum verification and low-storage check
   */
  public async installModel(modelId: string): Promise<ModelInstallResult> {
    const models = await this.listSpeechModels();
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      return { modelId, installed: false, error: 'Model not found.' };
    }

    // Storage check
    const caps = await this.getDeviceCapabilities();
    if (caps.availableStorageMb !== null && model.downloadBytes) {
      const requiredMb = Math.ceil(model.downloadBytes / (1024 * 1024)) + 50;
      if (caps.availableStorageMb < requiredMb) {
        return {
          modelId,
          installed: false,
          error: `Low storage: ${requiredMb} MB required, but only ${caps.availableStorageMb} MB available.`,
        };
      }
    }

    const validation = AiResultValidator.validateModelProfile(model);
    if (!validation.valid) {
      return { modelId, installed: false, error: validation.error };
    }

    return await OfflineAi.installSpeechModel({ modelId, source: 'download' });
  }

  /**
   * Cancel in-progress speech model download (P1-10)
   */
  public async cancelModelDownload(modelId: string): Promise<void> {
    await OfflineAi.cancelModelDownload({ modelId });
  }

  /**
   * Delete speech model
   */
  public async deleteModel(modelId: string): Promise<void> {
    await OfflineAi.deleteSpeechModel({ modelId });
  }

  /**
   * Start on-device offline transcription
   */
  public async transcribeRecording(
    recordingId: number,
    options?: {
      modelId?: string;
      language?: string;
    }
  ): Promise<{ jobId: string }> {
    const models = await this.listSpeechModels();
    const defaultModel = models.find((m) => m.installed) || models[0];
    const targetModelId = options?.modelId || defaultModel?.id || 'whisper-base';

    const recording = RecordingRepository.getById(recordingId);
    if (!recording) {
      throw new Error('OFFLINE_AI_AUDIO_INVALID: Recording was not found on this device.');
    }

    // Resolve and verify media payload from MediaRepository
    if (recording.media_key) {
      try {
        const mediaBlob = await MediaRepository.getBinary(recording.media_key);
        if (!mediaBlob && !recording.file_path) {
          throw new Error(
            'OFFLINE_AI_AUDIO_INVALID: Recording audio data could not be located in local media storage.'
          );
        }
      } catch (_err) {
        const err = asErrorLike(_err);
        if (err?.message?.includes('OFFLINE_AI')) throw err;
        AppLogger.warn(
          'OfflineAiManager',
          'Could not verify media key binary: ' + recording.media_key,
          err
        );
      }
    }

    // Battery check warning for long recordings
    const caps = await this.getDeviceCapabilities();
    if (
      caps.batteryLevel !== null &&
      caps.batteryLevel < 15 &&
      caps.isCharging === false &&
      recording.duration_seconds > 600
    ) {
      AppLogger.warn(
        'OfflineAiManager',
        `Battery low (${caps.batteryLevel}%), long transcription.`
      );
    }

    const selectedLanguage =
      options?.language && options.language.trim().length > 0 ? options.language.trim() : 'auto';

    // Capture the previous job's native breadcrumb trail BEFORE the worker
    // clears it: if the last transcription killed the process, this puts the
    // exact last stage (model load, engine init, chunk N) into AppLogger —
    // visible in Settings → Diagnostics → Export logs after any hard crash.
    await OffAi.readNativeCrashTrail();

    // Native plugin reads recordingId via getString — always pass a string.
    return await OfflineAi.startTranscription({
      recordingId: String(recordingId),
      modelId: targetModelId,
      language: selectedLanguage,
      mediaKey: recording.media_key,
      audioPath: recording.file_path,
      durationMs: (recording.duration_seconds || 0) * 1000,
    });
  }

  /**
   * Reads and logs the native crash breadcrumb trail (Android only). The
   * native worker writes a line before every run stage; a hard process death
   * leaves the trail on disk, and this surfaces it through AppLogger so the
   * exported diagnostics show exactly how far the previous job got.
   */
  public async readNativeCrashTrail(): Promise<void> {
    try {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
      const res = await OfflineAi.getTranscriptionBreadcrumbs();
      const content = res?.content?.trim();
      if (content) {
        AppLogger.warn(
          'OfflineAiManager',
          `Native transcription trail from the previous run:
${content}`
        );
      }
    } catch (_err) {
      // Older APK builds have no trail API — diagnostics only, never a failure.
    }
  }

  /**
   * Poll transcription job status
   */
  public async getTranscriptionStatus(jobId: string): Promise<TranscriptionJobStatus> {
    return await OfflineAi.getTranscriptionStatus({ jobId });
  }

  /**
   * Cancel ongoing transcription
   */
  public async cancelTranscription(jobId: string): Promise<void> {
    await OfflineAi.cancelTranscription({ jobId });
  }

  /**
   * Recover any interrupted transcription jobs after app restart or process death.
   * Leverages durable chunk checkpoints to restore partial transcripts.
   */
  public async recoverInterruptedJobs(): Promise<number> {
    // Surface the previous run's native trail first: a hard process death
    // cannot be caught, so this is the only way it reaches AppLogger.
    await this.readNativeCrashTrail();
    try {
      const incomplete = TranscriptionRepository.getIncompleteJobs();
      let recoveredCount = 0;
      const db = getDatabaseAdapter();

      for (const job of incomplete) {
        AppLogger.info('OfflineAiManager', `Inspecting interrupted transcription #${job.id}`);

        // Check if there are durable chunk checkpoints saved
        try {
          // 1. Try querying durable chunk checkpoints from transcription_chunk_checkpoints
          const checkpoints = await db.query<{
            chunk_index: number;
            transcript_text: string | null;
          }>(
            "SELECT chunk_index, transcript_text FROM transcription_chunk_checkpoints WHERE job_id = ? AND status = 'completed' ORDER BY chunk_index ASC",
            [String(job.id)]
          );

          if (checkpoints && checkpoints.length > 0) {
            const partialText = checkpoints
              .map((c) => c.transcript_text || '')
              .filter((t) => t.trim().length > 0)
              .join(' ');

            if (partialText.trim().length > 0) {
              TranscriptionRepository.saveTranscription({
                id: job.id,
                recording_id: job.recording_id,
                engine: 'whisper.cpp',
                model_id: job.model_id,
                status: 'COMPLETED',
                text: partialText,
                completed_at: Date.now(),
              });
              AppLogger.info(
                'OfflineAiManager',
                `Recovered partial transcript from ${checkpoints.length} chunk checkpoints for job #${job.id}`
              );
              recoveredCount++;
              continue;
            }
          }

          // 2. Fallback check for transcription_segments
          const segments = await db.query<{
            sequence: number;
            text: string | null;
          }>(
            'SELECT sequence, text FROM transcription_segments WHERE transcription_id = ? ORDER BY sequence ASC',
            [job.id]
          );

          if (segments && segments.length > 0) {
            const segText = segments
              .map((c) => c.text || '')
              .filter((t) => t.trim().length > 0)
              .join(' ');

            if (segText.trim().length > 0) {
              TranscriptionRepository.saveTranscription({
                id: job.id,
                recording_id: job.recording_id,
                engine: 'whisper.cpp',
                model_id: job.model_id,
                status: 'COMPLETED',
                text: segText,
                completed_at: Date.now(),
              });
              recoveredCount++;
              continue;
            }
          }
        } catch (cpErr) {
          AppLogger.warn('OfflineAiManager', 'Could not read checkpoints during recovery', cpErr);
        }

        // If no checkpoints found, mark failed cleanly with explanation
        TranscriptionRepository.updateStatus(
          job.id,
          'FAILED',
          'OFFLINE_AI_UNKNOWN',
          'Interrupted by system process termination. You can safely restart transcription.'
        );
        recoveredCount++;
      }
      return recoveredCount;
    } catch (e) {
      AppLogger.warn('OfflineAiManager', 'Could not run crash recovery', e);
      return 0;
    }
  }

  /**
   * Dynamic Offline Storage Accounting (P2-01)
   */
  public async getStorageBreakdown(): Promise<StorageBreakdown> {
    try {
      const db = getDatabaseAdapter();
      // 1. Recordings storage
      const recRows = await db.query<{ total: number }>(
        'SELECT SUM(file_size) as total FROM recordings'
      );
      const recordingsBytes = recRows[0]?.total || 0;

      // 2. Transcripts storage
      const transRows = await db.query<{ total: number }>(
        'SELECT SUM(LENGTH(text)) as total FROM transcriptions'
      );
      const transcriptsBytes = transRows[0]?.total || 0;

      // 3. Dynamic models storage
      let modelsBytes = 0;
      try {
        const models = await this.listSpeechModels();
        for (const m of models) {
          if (m.installed) {
            modelsBytes += m.downloadBytes || 0;
          }
        }
      } catch {
        modelsBytes = 0;
      }

      return {
        modelsBytes,
        recordingsBytes,
        transcriptsBytes,
        totalBytes: modelsBytes + recordingsBytes + transcriptsBytes,
      };
    } catch {
      return {
        modelsBytes: 0,
        recordingsBytes: 0,
        transcriptsBytes: 0,
        totalBytes: 0,
      };
    }
  }

  /**
   * Clean temporary cache and orphaned files without touching user recordings
   */
  public async cleanTemporaryFiles(): Promise<void> {
    try {
      const db = getDatabaseAdapter();
      const sql = 'DELETE FROM transcriptions WHERE status = ?';
      const params = ['CANCELLED'];
      await db.run(sql, params);
      AppLogger.info('OfflineAiManager', 'Cleaned temporary cancelled jobs.');
    } catch (e) {
      AppLogger.warn('OfflineAiManager', 'Failed cleaning temporary files', e);
    }
  }

  /**
   * Map internal error taxonomy to user-facing friendly guidance
   */
  public static mapErrorCodeToUserMessage(code?: OfflineAiErrorCode | string): string {
    switch (code) {
      case 'OFFLINE_AI_MODEL_MISSING':
        return 'The speech recognition model is not downloaded yet. Please download it in Settings to transcribe offline.';
      case 'OFFLINE_AI_MODEL_INVALID':
      case 'OFFLINE_AI_MODEL_CORRUPT':
        return 'The offline model file is invalid or corrupted. Please reinstall the model in Settings.';
      case 'OFFLINE_AI_AUDIO_INVALID':
        return 'The audio recording could not be read. The original file remains safely saved on your device.';
      case 'OFFLINE_AI_STORAGE_LOW':
        return 'Low device storage prevented transcription. Free up space on your device to continue.';
      case 'OFFLINE_AI_CANCELLED':
        return 'Transcription was cancelled.';
      case 'OFFLINE_AI_UNSUPPORTED_DEVICE':
        return 'This device does not meet the minimum hardware requirements for on-device AI transcription.';
      default:
        return 'Transcription could not be completed. Your recording is still safely stored on this device.';
    }
  }

  /**
   * Local LLM Second-Stage Structured Processing:
   * Summaries, Action Items with segment provenance, Decisions, Risks.
   * Completely local & deterministic, zero cloud requirements!
   */
  public generateStructuredAiExtraction(
    transcription: TranscriptionEntity,
    segmentsCount: number
  ): StructuredAiExtraction {
    const rawText = transcription.text || '';
    if (!rawText.trim()) {
      return {
        summary: 'No transcript text available.',
        actionItems: [],
        decisions: [],
        risks: [],
        entities: [],
      };
    }

    // Extract sentences for structured insights
    const sentences = rawText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    // Identify Action Items with provenance
    const actionKeywords = [
      'todo',
      'action',
      'confirm',
      'send',
      'review',
      'prepare',
      'check',
      'follow up',
      'schedule',
      'deliver',
    ];
    const actionItems: StructuredAiExtraction['actionItems'] = [];
    const decisions: StructuredAiExtraction['decisions'] = [];
    const risks: StructuredAiExtraction['risks'] = [];

    sentences.forEach((sent, index) => {
      const lower = sent.toLowerCase();
      const approxSegment = Math.min(
        segmentsCount,
        Math.max(1, Math.floor((index / Math.max(1, sentences.length)) * segmentsCount) + 1)
      );

      if (actionKeywords.some((k) => lower.includes(k))) {
        actionItems.push({
          text: sent.replace(/^[-*•]\s*/, '').trim(),
          owner: null, // Never hallucinate owner!
          dueDate: null, // Never hallucinate due date!
          priority: lower.includes('urgent') || lower.includes('asap') ? 'high' : 'medium',
          sourceSegments: [approxSegment],
        });
      } else if (
        lower.includes('decide') ||
        lower.includes('agreed') ||
        lower.includes('approved')
      ) {
        decisions.push({
          text: sent,
          sourceSegments: [approxSegment],
        });
      } else if (
        lower.includes('risk') ||
        lower.includes('warning') ||
        lower.includes('delay') ||
        lower.includes('issue')
      ) {
        risks.push({
          text: sent,
          sourceSegments: [approxSegment],
        });
      }
    });

    const summary = sentences.slice(0, 3).join(' ');

    const rawData = {
      summary: summary || rawText.substring(0, 200) + '...',
      actionItems: actionItems.slice(0, 10),
      decisions: decisions.slice(0, 5),
      risks: risks.slice(0, 5),
      entities: [],
    };

    return AiResultValidator.validateExtraction(rawData, segmentsCount);
  }
}

export { TranscriptionOrchestrator } from './TranscriptionOrchestrator';
