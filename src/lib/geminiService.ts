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
  keyUsed?: string;
}

export type SummaryFormat = 'executive' | 'action_items' | 'tldr' | 'outline' | 'clean_notes';

export interface SummaryRequestOptions {
  format?: SummaryFormat;
  eventTitle?: string;
  currentBody?: string;
  transcripts?: any[];
  ocrScans?: any[];
  checklists?: any[];
  customInstructions?: string;
}

export interface SummaryResult {
  summary: string;
  format: SummaryFormat;
  source?: string;
  keyUsed?: 'custom' | 'server_env';
}

export class GeminiApiService {
  private static async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const localKey = await AiSettingsManager.getApiKeyAsync();
    if (localKey && localKey.trim()) {
      headers['Authorization'] = `Bearer ${localKey.trim()}`;
    }
    return headers;
  }

  /**
   * Handwritten note OCR using Gemini server-side endpoint
   */
  public static async scanHandwrittenNote(
    imageBase64: string,
    mimeType = 'image/jpeg'
  ): Promise<OcrResult> {
    try {
      const res = await fetch('/api/gemini/ocr', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch {}
      }

      if (res.ok && data.ocrText !== undefined) {
        return {
          ocrText: data.ocrText,
          confidence: data.confidence || 0.98,
          source: data.source || 'gemini-3.7-flash',
        };
      }

      const errorMsg = data.error || (res.status ? `OCR extraction failed (status ${res.status})` : 'OCR service is unreachable.');
      throw new Error(errorMsg);
    } catch (err: any) {
      console.error('Gemini OCR failed:', err);
      throw new Error(err.message || 'Failed to extract text from handwritten note with Gemini AI.');
    }
  }

  /**
   * Audio transcription using Gemini server-side endpoint
   */
  public static async transcribeAudio(
    audioBase64: string,
    mimeType = 'audio/webm',
    sampleDuration = 0
  ): Promise<TranscribeResult> {
    try {
      const res = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ audioBase64, mimeType, sampleDuration }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch {}
      }

      if (res.ok && data.transcript !== undefined) {
        return {
          transcript: data.transcript,
          source: data.source || 'gemini-3.5-transcribe',
        };
      }

      const errorMsg = data.error || (res.status ? `Transcription failed (status ${res.status})` : 'Transcription service is unreachable.');
      throw new Error(errorMsg);
    } catch (err: any) {
      console.error('Gemini Transcription failed:', err);
      throw new Error(err.message || 'Failed to transcribe audio with Gemini AI.');
    }
  }

  /**
   * Generate structured AI summaries in multiple formats
   */
  public static async generateSummary(options: SummaryRequestOptions): Promise<SummaryResult> {
    try {
      const res = await fetch('/api/gemini/summary', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          format: options.format || 'executive',
          eventTitle: options.eventTitle || 'Untitled Note',
          currentBody: options.currentBody || '',
          transcripts: options.transcripts || [],
          ocrScans: options.ocrScans || [],
          checklists: options.checklists || [],
          customInstructions: options.customInstructions || '',
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch {}
      }

      if (res.ok && data.summary !== undefined) {
        return {
          summary: data.summary,
          format: data.format || options.format || 'executive',
          source: data.source || 'gemini-3.7-flash',
          keyUsed: data.keyUsed,
        };
      }

      const errorMsg = data.error || (res.status ? `Summary generation failed (status ${res.status})` : 'Summary service is unreachable.');
      throw new Error(errorMsg);
    } catch (err: any) {
      console.error('Gemini Summary failed:', err);
      throw new Error(err.message || 'Failed to generate AI summary with Gemini.');
    }
  }

  /**
   * Meeting minutes and executive summary generation (backward compatible alias)
   */
  public static async generateMeetingMinutes(
    transcript: string,
    currentBody = '',
    eventTitle = 'Meeting'
  ): Promise<MeetingMinutesResult> {
    try {
      const res = await fetch('/api/gemini/meeting-minutes', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ transcript, currentBody, eventTitle }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch {}
      }

      if (res.ok && data.meetingMinutes !== undefined) {
        return {
          meetingMinutes: data.meetingMinutes,
          source: data.source || 'gemini-3.7-flash',
          keyUsed: data.keyUsed,
        };
      }

      const errorMsg = data.error || (res.status ? `Meeting summary failed (status ${res.status})` : 'Meeting minutes service is unreachable.');
      throw new Error(errorMsg);
    } catch (err: any) {
      console.error('Gemini Meeting Minutes failed:', err);
      throw new Error(err.message || 'Failed to generate meeting minutes with Gemini AI.');
    }
  }
}
