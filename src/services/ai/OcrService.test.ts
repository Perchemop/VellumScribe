import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OcrService } from './OcrService';
import type { OcrResult } from '../../lib/geminiService';

const mockScanHandwrittenNote = vi.fn();

vi.mock('../../lib/geminiService', () => ({
  GeminiApiService: {
    scanHandwrittenNote: (...args: unknown[]) => mockScanHandwrittenNote(...args),
  },
}));

describe('OcrService (R-2.3 document scanning / OCR)', () => {
  beforeEach(() => {
    mockScanHandwrittenNote.mockReset();
  });

  it('delegates to GeminiApiService.scanHandwrittenNote with the image and prompt', async () => {
    const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
    const expected: OcrResult = {
      ocrText: 'Meeting notes: project kickoff at 10am.',
      confidence: 0.98,
      source: 'gemini-3.6-flash',
    };
    mockScanHandwrittenNote.mockResolvedValue(expected);

    const result = await OcrService.scanImage(imageBase64, {
      prompt: 'Extract meeting details.',
      sourceLabel: 'document_scan',
    });

    expect(mockScanHandwrittenNote).toHaveBeenCalledTimes(1);
    expect(mockScanHandwrittenNote).toHaveBeenCalledWith(imageBase64, 'Extract meeting details.');
    expect(result).toEqual(expected);
    expect(result.ocrText).toBe('Meeting notes: project kickoff at 10am.');
  });

  it('uses the default prompt when none is supplied', async () => {
    mockScanHandwrittenNote.mockResolvedValue({
      ocrText: 'Extracted text',
      confidence: 0.95,
    });
    await OcrService.scanImage('data:image/png;base64,iVBORw0KGgo=');
    expect(mockScanHandwrittenNote).toHaveBeenCalledWith(
      'data:image/png;base64,iVBORw0KGgo=',
      undefined
    );
  });

  it('propagates OCR errors to the caller', async () => {
    mockScanHandwrittenNote.mockRejectedValue(new Error('Gemini API unavailable'));
    await expect(OcrService.scanImage('data:image/jpeg;base64,abc')).rejects.toThrow(
      'Gemini API unavailable'
    );
  });
});
