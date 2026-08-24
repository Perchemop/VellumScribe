import { AiSettingsManager } from './aiSettings';

export interface OcrResult {
  ocrText: string;
  confidence?: number;
  source?: string;
}

export interface TranscribeResult {
  transcript: string;
  source?: string;
}

export interface MeetingMinutesResult {
  meetingMinutes: string;
  source?: string;
}

export interface ConflictMergeResult {
  mergedContent: string;
  resolutionStrategy?: string;
}

export class GeminiApiService {
  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const localKey = AiSettingsManager.getApiKey();
    if (localKey) {
      headers['x-gemini-api-key'] = localKey;
    }
    return headers;
  }

  public static async scanHandwrittenNote(
    imageBase64: string,
    mimeType = 'image/jpeg'
  ): Promise<OcrResult> {
    const res = await fetch('/api/gemini/ocr', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ imageBase64, mimeType }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `OCR API request failed with status ${res.status}`);
    }

    return res.json();
  }

  public static async transcribeAudio(
    audioBase64: string,
    mimeType = 'audio/webm',
    sampleDuration = 0
  ): Promise<TranscribeResult> {
    const res = await fetch('/api/gemini/transcribe', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ audioBase64, mimeType, sampleDuration }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Transcription API request failed with status ${res.status}`);
    }

    return res.json();
  }

  public static async generateMeetingMinutes(
    transcript: string,
    currentBody = '',
    eventTitle = 'Meeting'
  ): Promise<MeetingMinutesResult> {
    const res = await fetch('/api/gemini/meeting-minutes', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ transcript, currentBody, eventTitle }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Meeting Minutes API request failed with status ${res.status}`);
    }

    return res.json();
  }

  public static async intelligent3WayMerge(
    baseContent: string,
    localContent: string,
    remoteContent: string,
    documentTitle = 'Note'
  ): Promise<ConflictMergeResult> {
    const res = await fetch('/api/gemini/intelligent-merge', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        baseContent,
        localContent,
        remoteContent,
        documentTitle,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Conflict merge API request failed with status ${res.status}`);
    }

    return res.json();
  }
}

