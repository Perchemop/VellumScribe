import {
  GeminiApiService,
  SummaryRequestOptions,
  SummaryResult,
  MeetingMinutesResult,
} from '../../lib/geminiService';

/**
 * SummaryService: Focused domain service for AI summaries, action item extraction, and meeting minutes.
 * Supports both on-device rule-based synthesis and cloud Gemini AI generation.
 */
export class SummaryService {
  /**
   * Generates a structured summary according to the specified format.
   */
  public static async generateSummary(options: SummaryRequestOptions): Promise<SummaryResult> {
    return GeminiApiService.generateSummary(options);
  }

  /**
   * Generates formal meeting minutes from transcripts and note contents.
   */
  public static async generateMeetingMinutes(
    transcripts: string | string[],
    noteTitle: string = 'Meeting',
    currentBody: string = ''
  ): Promise<MeetingMinutesResult> {
    const combinedTranscript = Array.isArray(transcripts) ? transcripts.join('\n\n') : transcripts;
    return GeminiApiService.generateMeetingMinutes(combinedTranscript, currentBody, noteTitle);
  }
}
