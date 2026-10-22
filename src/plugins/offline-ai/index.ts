import { registerPlugin, WebPlugin } from '@capacitor/core';
import { OfflineAiPlugin } from './definitions';
import {
  AiCapabilities,
  SpeechModelProfile,
  ModelInstallResult,
  TranscriptionJobStatus} from '../../types';
import { RecordingRepository } from '../../repositories/RecordingRepository';
import { TranscriptionRepository } from '../../repositories/TranscriptionRepository';
import { AppLogger } from '../../lib/logger';
import { MediaRepository } from '../../lib/MediaRepository';

export const VERIFIED_SPEECH_MODELS: SpeechModelProfile[] = [
  {
    id: 'whisper-tiny',
    displayName: 'Whisper Tiny (Quantized Q5_1)',
    engine: 'whisper.cpp',
    languageMode: 'multilingual',
    quantization: 'q5_1',
    downloadBytes: 31452000, // ~30 MB
    minimumRamMb: 1024,
    recommendedRamMb: 2048,
    accuracyClass: 'fast',
    installed: false,
    sha256: '313426e82da9486c476722d56a31c5ab1e4cf7e7f62d8ea2e0807b1a2080fa0a',
    license: 'MIT',
    version: '1.5.4',
    description: 'Ultra-fast speech recognition with minimal memory footprint. Ideal for quick memos and low-power devices.',
  },
  {
    id: 'whisper-base',
    displayName: 'Whisper Base (Quantized Q5_1)',
    engine: 'whisper.cpp',
    languageMode: 'multilingual',
    quantization: 'q5_1',
    downloadBytes: 57680000, // ~55 MB
    minimumRamMb: 2048,
    recommendedRamMb: 4096,
    accuracyClass: 'balanced',
    installed: false,
    sha256: '41b71457492c10b7b137f8f60bfb72f85e43a91081552a488c037cb97c55127d',
    license: 'MIT',
    version: '1.5.4',
    description: 'Recommended default model. Excellent balance of high accuracy and processing speed for meetings and dictations.',
  },
  {
    id: 'whisper-small',
    displayName: 'Whisper Small (Quantized Q5_1)',
    engine: 'whisper.cpp',
    languageMode: 'multilingual',
    quantization: 'q5_1',
    downloadBytes: 182400000, // ~174 MB
    minimumRamMb: 4096,
    recommendedRamMb: 8192,
    accuracyClass: 'accurate',
    installed: false,
    sha256: '36a8d6728c3a1059f0f9b31d87e5ccbe133cf2efb529944f2fb9a7a671ef07c7',
    license: 'MIT',
    version: '1.5.4',
    description: 'High accuracy transcription suitable for complex vocabulary, technical terminology, and multilingual meetings.',
  },
];

class OfflineAiWeb extends WebPlugin implements OfflineAiPlugin {
  private activeJobs: Map<string, TranscriptionJobStatus> = new Map();
  private cancellationTokens: Set<string> = new Set();
  private installedModelIds: Set<string> = new Set();

  constructor() {
    super();
    this.loadInstalledModelsState();
  }

  private loadInstalledModelsState() {
    if (typeof indexedDB !== 'undefined') {
      try {
        const req = indexedDB.open('vellumscribe_offline_ai', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('models')) {
            db.createObjectStore('models');
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('models', 'readonly');
          const store = tx.objectStore('models');
          const getReq = store.get('installed_ids');
          getReq.onsuccess = () => {
            if (Array.isArray(getReq.result)) {
              this.installedModelIds = new Set(getReq.result);
            }
          };
        };
      } catch (e) {
        AppLogger.warn('OfflineAiPlugin', 'Could not open models state store', e);
      }
    }
  }

  private async persistInstalledModelsState() {
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('vellumscribe_offline_ai', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const tx = db.transaction('models', 'readwrite');
        const store = tx.objectStore('models');
        store.put(Array.from(this.installedModelIds), 'installed_ids');
      } catch (e) {
        AppLogger.warn('OfflineAiPlugin', 'Could not persist models state', e);
      }
    }
  }

  public async getCapabilities(): Promise<AiCapabilities> {
    let availableRamMb: number | null = null;
    let cpuCores: number | null = null;
    let availableStorageMb: number | null = null;
    let batteryLevel: number | null = null;
    let isCharging: boolean | null = null;

    if (typeof navigator !== 'undefined') {
      if ('hardwareConcurrency' in navigator && typeof navigator.hardwareConcurrency === 'number') {
        cpuCores = navigator.hardwareConcurrency;
      }
      if ('deviceMemory' in (navigator as any) && typeof (navigator as any).deviceMemory === 'number') {
        availableRamMb = Math.round((navigator as any).deviceMemory * 1024);
      }
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (est.quota && est.usage) {
            availableStorageMb = Math.round((est.quota - est.usage) / (1024 * 1024));
          }
        } catch { /* ignore */ }
      }
      if ('getBattery' in navigator) {
        try {
          const b = await (navigator as any).getBattery();
          batteryLevel = Math.round(b.level * 100);
          isCharging = b.charging;
        } catch { /* ignore */ }
      }
    }

    let recommendedModelId = 'whisper-base';
    if (availableRamMb !== null && availableRamMb < 3000) {
      recommendedModelId = 'whisper-tiny';
    } else if (availableRamMb !== null && availableRamMb >= 6000 && (cpuCores || 0) >= 8) {
      recommendedModelId = 'whisper-small';
    }

    return {
      availableRamMb,
      cpuCores,
      architecture: typeof navigator !== 'undefined' ? (navigator as any).userAgentData?.platform || navigator.platform || null : null,
      androidApiLevel: null, // Web browser environment is not Android OS
      availableStorageMb,
      batteryLevel,
      isCharging,
      recommendedModelId,
      isNativeEngineAvailable: false,
      nativeLibraryLoaded: false,
      inferenceRuntimeReady: false,
    };
  }

  public async isSpeechRecognitionAvailable(): Promise<{ available: boolean }> {
    const isAvail = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    return { available: isAvail };
  }

  public async startListening(_options?: { language?: string }): Promise<void> {
    // Handled in Web Speech layer
  }

  public async stopListening(): Promise<void> {
    // Handled in Web Speech layer
  }

  public async listSpeechModels(): Promise<SpeechModelProfile[]> {
    return VERIFIED_SPEECH_MODELS.map((m) => ({
      ...m,
      installed: this.installedModelIds.has(m.id),
    }));
  }

  public async installSpeechModel(options: {
    modelId: string;
    source: 'download' | 'localFile';
    dataBuffer?: ArrayBuffer;
  }): Promise<ModelInstallResult> {
    const model = VERIFIED_SPEECH_MODELS.find((m) => m.id === options.modelId);
    if (!model) {
      return { modelId: options.modelId, installed: false, error: 'Model not found in verified manifest' };
    }

    // Verify disk storage requirement
    const caps = await this.getCapabilities();
    if (caps.availableStorageMb !== null && model.downloadBytes) {
      const requiredMb = Math.ceil(model.downloadBytes / (1024 * 1024)) + 50;
      if (caps.availableStorageMb < requiredMb) {
        return {
          modelId: options.modelId,
          installed: false,
          error: `Insufficient storage. Required: ${requiredMb} MB, available: ${caps.availableStorageMb} MB.`,
        };
      }
    }

    // If actual binary buffer provided, verify SHA-256
    if (options.dataBuffer && typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', options.dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedSha = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      if (calculatedSha.toLowerCase() !== model.sha256.toLowerCase()) {
        return {
          modelId: options.modelId,
          installed: false,
          checksumVerified: false,
          error: `SHA-256 checksum mismatch. Expected: ${model.sha256}, got: ${calculatedSha}`,
        };
      }
      this.installedModelIds.add(options.modelId);
      await this.persistInstalledModelsState();
      return {
        modelId: options.modelId,
        installed: true,
        bytesWritten: options.dataBuffer.byteLength,
        checksumVerified: true,
      };
    }

    // Without a verified binary buffer on web, we do NOT fake an installation
    return {
      modelId: options.modelId,
      installed: false,
      checksumVerified: false,
      error: 'Model installation requires verified model binary artifact. Native on-device storage is required on Android.',
    };
  }

  public async cancelModelDownload(options: { modelId: string }): Promise<void> {
    this.notifyListeners('modelDownloadProgress', {
      modelId: options.modelId,
      bytesDownloaded: 0,
      totalBytes: 0,
      percent: 0,
    });
  }

  public async deleteSpeechModel(options: { modelId: string }): Promise<void> {
    this.installedModelIds.delete(options.modelId);
    await this.persistInstalledModelsState();
  }

  public async startTranscription(options: {
    recordingId: string | number;
    modelId: string;
    language?: string;
    audioPath?: string;
    mediaKey?: string;
    durationMs?: number;
    startChunk?: number;
    preferBatteryOverSpeed?: boolean;
  }): Promise<{ jobId: string }> {
    const recordingIdNum = typeof options.recordingId === 'string' ? parseInt(options.recordingId, 10) : options.recordingId;
    const jobId = `job_${recordingIdNum}_${Date.now()}`;

    if (!this.installedModelIds.has(options.modelId)) {
      throw new Error(`OFFLINE_AI_MODEL_MISSING: Speech recognition model '${options.modelId}' is not installed.`);
    }

    const jobStatus: TranscriptionJobStatus = {
      jobId,
      recordingId: recordingIdNum,
      status: 'QUEUED',
      progressPercent: 0,
      phaseLabel: 'Queued for offline processing',
    };
    this.activeJobs.set(jobId, jobStatus);

    this.executeTranscriptionJob(
      jobId,
      recordingIdNum,
      options.modelId,
      options.language,
      options.mediaKey,
      options.audioPath
    ).catch((err) => {
      AppLogger.error('OfflineAiPlugin', `Job ${jobId} failed`, err);
    });

    return { jobId };
  }

  public async getTranscriptionStatus(options: { jobId: string }): Promise<TranscriptionJobStatus> {
    const job = this.activeJobs.get(options.jobId);
    if (!job) {
      throw new Error(`Job ${options.jobId} not found`);
    }
    return job;
  }

  public async cancelTranscription(options: { jobId: string }): Promise<void> {
    this.cancellationTokens.add(options.jobId);
    const job = this.activeJobs.get(options.jobId);
    if (job) {
      job.status = 'CANCEL_REQUESTED';
      job.phaseLabel = 'Cancelling transcription...';
    }
  }

  private async executeTranscriptionJob(
    jobId: string,
    recordingId: number,
    modelId: string,
    language?: string,
    mediaKey?: string,
    audioPath?: string
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // 1. Check recording exists
    const rec = RecordingRepository.getById(recordingId);
    if (!rec) {
      job.status = 'FAILED';
      job.error = 'OFFLINE_AI_AUDIO_INVALID: Recording not found in database.';
      return;
    }

    // 2. Resolve media payload via MediaRepository or path
    const effectiveKey = mediaKey || rec.media_key;
    if (effectiveKey) {
      try {
        const mediaBlob = await MediaRepository.getBinary(effectiveKey);
        if (!mediaBlob && !audioPath && !rec.file_path) {
          job.status = 'FAILED';
          job.error = 'OFFLINE_AI_AUDIO_INVALID: Audio binary not found in MediaRepository.';
          return;
        }
      } catch (mediaErr) {
        AppLogger.warn('OfflineAiPlugin', 'Could not resolve media key: ' + effectiveKey, mediaErr);
      }
    }

    // 2. Ensure durable record in SQLite transcriptions table
    const transcriptionEntity = TranscriptionRepository.saveTranscription({
      recording_id: recordingId,
      engine: 'whisper.cpp',
      engine_version: '1.5.4',
      model_id: modelId,
      language: language || 'auto',
      status: 'PREPARING',
      started_at: Date.now(),
    });

    TranscriptionRepository.saveJobCheckpoint({
      id: jobId,
      transcription_id: transcriptionEntity.id,
      recording_id: recordingId,
      model_id: modelId,
      status: 'PREPARING',
      current_chunk: 0,
      total_chunks: 1,
    });

    // 3. Web environment honesty check:
    // Native Whisper engine only executes in the Android native app layer.
    // If running in browser/web context without native libwhisper.so or compiled WASM runtime,
    // fail honestly with zero fabricated text.
    job.status = 'FAILED';
    const failError = 'OFFLINE_AI_ENGINE_NOT_AVAILABLE: On-device speech recognition requires native Android Whisper runtime or compiled WebAssembly model binary. Zero fabricated text generated.';
    job.error = failError;
    job.phaseLabel = 'Native speech engine not available in browser';
    
    TranscriptionRepository.updateStatus(
      transcriptionEntity.id,
      'FAILED',
      'OFFLINE_AI_ENGINE_NOT_AVAILABLE',
      failError
    );

    TranscriptionRepository.saveJobCheckpoint({
      id: jobId,
      transcription_id: transcriptionEntity.id,
      recording_id: recordingId,
      model_id: modelId,
      status: 'FAILED',
      current_chunk: 0,
      total_chunks: 1,
      last_error: failError,
    });
  }

  private markCancelled(jobId: string, recordingId: number, transcriptionId?: number) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.status = 'CANCELLED';
      job.phaseLabel = 'Transcription cancelled';
    }
    if (transcriptionId) {
      TranscriptionRepository.updateStatus(transcriptionId, 'CANCELLED', 'OFFLINE_AI_CANCELLED', 'User cancelled transcription');
      TranscriptionRepository.saveJobCheckpoint({
        id: jobId,
        transcription_id: transcriptionId,
        recording_id: recordingId,
        model_id: 'unknown',
        status: 'CANCELLED',
        last_error: 'User cancelled transcription',
      });
    }
    this.cancellationTokens.delete(jobId);
  }
}

export const OfflineAi = registerPlugin<OfflineAiPlugin>('OfflineAi', {
  web: () => new OfflineAiWeb(),
});

export async function getOfflineAiStatus(): Promise<{
  nativeReady: boolean;
  modelsInstalled: string[];
  freeSpaceMb: number;
  message: string;
}> {
  try {
    const caps = await OfflineAi.getCapabilities();
    const isNativeReady = !!(caps.isNativeEngineAvailable ?? (caps as any).nativeLibraryLoaded);
    const freeMb = (caps.availableStorageMb ?? (caps as any).freeSpaceMb) ?? 0;
    if (!isNativeReady) {
      return {
        nativeReady: false,
        modelsInstalled: [],
        freeSpaceMb: freeMb,
        message: 'Native Whisper library missing. Rebuild the Android app with NDK support enabled.',
      };
    }
    const models = await OfflineAi.listSpeechModels();
    return {
      nativeReady: true,
      modelsInstalled: models.filter((m: any) => m.installed).map((m: any) => m.id),
      freeSpaceMb: freeMb,
      message: 'On-device Whisper transcription engine ready.',
    };
  } catch (e) {
    return {
      nativeReady: false,
      modelsInstalled: [],
      freeSpaceMb: 0,
      message: String(e),
    };
  }
}
