import {
  AiCapabilities,
  SpeechModelProfile,
  ModelInstallResult,
  TranscriptionJobStatus,
} from '../../types';

export interface OfflineAiPlugin {
  getCapabilities(): Promise<AiCapabilities>;

  listSpeechModels(): Promise<SpeechModelProfile[]>;

  installSpeechModel(options: {
    modelId: string;
    source: 'download' | 'localFile';
  }): Promise<ModelInstallResult>;

  deleteSpeechModel(options: {
    modelId: string;
  }): Promise<void>;

  startTranscription(options: {
    recordingId: string | number;
    modelId: string;
    language?: string;
  }): Promise<{ jobId: string }>;

  getTranscriptionStatus(options: {
    jobId: string;
  }): Promise<TranscriptionJobStatus>;

  cancelTranscription(options: {
    jobId: string;
  }): Promise<void>;
}
