import { GeminiApiService, OcrResult } from '../../lib/geminiService';

export interface OcrServiceOptions {
  prompt?: string;
  sourceLabel?: string;
}

/**
 * OcrService: Focused domain service for document and handwritten note OCR recognition.
 * Coordinates between on-device camera capture, fallback text recognition, and Cloud Gemini OCR.
 */
export class OcrService {
  /**
   * Scans a base64 encoded image or document snapshot and extracts text.
   */
  public static async scanImage(
    imageBase64: string,
    options?: OcrServiceOptions
  ): Promise<OcrResult> {
    return GeminiApiService.scanHandwrittenNote(imageBase64, options?.prompt);
  }
}
