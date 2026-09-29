import { PluginListenerHandle } from '@capacitor/core';
import {
  AiCapabilities,
  SpeechModelProfile,
  ModelInstallResult,
  TranscriptionJobStatus,
} from '../../types';

export interface ModelDownloadProgressEvent {
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
}

export interface OfflineAiPlugin {
  getCapabilities(): Promise<AiCapabilities>;

  listSpeechModels(): Promise<SpeechModelProfile[]>;

  installSpeechModel(options: {
    modelId: string;
    source: 'download' | 'localFile';
  }): Promise<ModelInstallResult>;

  cancelModelDownload(options: {
    modelId: string;
  }): Promise<void>;

  deleteSpeechModel(options: {
    modelId: string;
  }): Promise<void>;

  startTranscription(options: {
    recordingId: string | number;
    modelId: string;
    language?: string;
    audioPath?: string;
    mediaKey?: string;
    durationMs?: number;
    startChunk?: number;
    preferBatteryOverSpeed?: boolean;
  }): Promise<{ jobId: string }>;

  getTranscriptionStatus(options: {
    jobId: string;
  }): Promise<TranscriptionJobStatus>;

  cancelTranscription(options: {
    jobId: string;
  }): Promise<void>;

  isSpeechRecognitionAvailable(): Promise<{ available: boolean }>;

  startListening(options?: { language?: string }): Promise<void>;

  stopListening(): Promise<void>;

  addListener(
    eventName: 'modelDownloadProgress',
    listenerFunc: (event: ModelDownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'speechRecognitionResult',
    listenerFunc: (event: { text: string; isFinal: boolean }) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'speechRecognitionError',
    listenerFunc: (event: { error: number | string }) => void
  ): Promise<PluginListenerHandle>;
}
