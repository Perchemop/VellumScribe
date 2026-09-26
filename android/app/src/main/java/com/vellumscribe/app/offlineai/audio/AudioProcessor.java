package com.vellumscribe.app.offlineai.audio;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import android.util.Log;

/**
 * Audio Processor & Voice Activity Detector (VAD)
 * Performs 16kHz 16-bit mono PCM conversion, energy-based voice activity detection,
 * and extracts individual audio chunk buffers to prevent multi-hour memory bloat.
 */
public class AudioProcessor {
    private static final String TAG = "AudioProcessor";
    public static final int TARGET_SAMPLE_RATE = 16000;
    public static final int FRAME_SIZE_MS = 30; // 30ms VAD frame
    public static final int SAMPLES_PER_FRAME = (TARGET_SAMPLE_RATE * FRAME_SIZE_MS) / 1000; // 480 samples

    public static class AudioChunk {
        public final int sequence;
        public final long startMs;
        public final long endMs;
        public final File chunkFile;
        public final boolean hasVoiceActivity;

        public AudioChunk(int sequence, long startMs, long endMs, File chunkFile, boolean hasVoiceActivity) {
            this.sequence = sequence;
            this.startMs = startMs;
            this.endMs = endMs;
            this.chunkFile = chunkFile;
            this.hasVoiceActivity = hasVoiceActivity;
        }
    }

    /**
     * Frame-based Voice Activity Detection on 16-bit mono PCM samples.
     * Evaluates root-mean-square (RMS) energy across 30ms frames (480 samples at 16kHz).
     * Voice is confirmed if at least 3 consecutive frames or >= 3% of frames exceed threshold.
     */
    public static boolean detectVoiceActivity(short[] samples, int offset, int length, double thresholdRms) {
        if (samples == null || length <= 0) return false;
        
        int totalFrames = length / SAMPLES_PER_FRAME;
        if (totalFrames <= 0) {
            // For very short buffers (< 30ms), compute single frame RMS
            double sumSq = 0;
            for (int i = 0; i < length && (offset + i) < samples.length; i++) {
                short s = samples[offset + i];
                sumSq += (double) s * s;
            }
            return Math.sqrt(sumSq / length) >= thresholdRms;
        }

        int voicedFrames = 0;
        int consecutiveVoiced = 0;
        int maxConsecutiveVoiced = 0;

        for (int f = 0; f < totalFrames; f++) {
            int frameOffset = offset + (f * SAMPLES_PER_FRAME);
            double sumSq = 0;
            for (int i = 0; i < SAMPLES_PER_FRAME && (frameOffset + i) < samples.length; i++) {
                short s = samples[frameOffset + i];
                sumSq += (double) s * s;
            }
            double frameRms = Math.sqrt(sumSq / SAMPLES_PER_FRAME);
            if (frameRms >= thresholdRms) {
                voicedFrames++;
                consecutiveVoiced++;
                if (consecutiveVoiced > maxConsecutiveVoiced) {
                    maxConsecutiveVoiced = consecutiveVoiced;
                }
            } else {
                consecutiveVoiced = 0;
            }
        }

        double voicedRatio = (double) voicedFrames / totalFrames;
        return maxConsecutiveVoiced >= 3 || voicedRatio >= 0.03;
    }

    /**
     * Determines audio data byte offset by parsing RIFF WAV chunks or defaulting to 0 for raw PCM.
     */
    public static long determineAudioDataOffset(File sourceAudio) {
        if (sourceAudio == null || !sourceAudio.exists() || sourceAudio.length() < 12) {
            return 0;
        }

        try (FileInputStream fis = new FileInputStream(sourceAudio)) {
            byte[] header = new byte[12];
            int read = fis.read(header);
            if (read < 12) return 0;

            // Check if RIFF....WAVE
            boolean isRiff = header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F';
            boolean isWave = header[8] == 'W' && header[9] == 'A' && header[10] == 'V' && header[11] == 'E';

            if (!isRiff || !isWave) {
                return 0; // Raw PCM or unsupported container, start from byte 0
            }

            // Search for "data" subchunk
            long currentOffset = 12;
            byte[] chunkHeader = new byte[8];
            while (fis.read(chunkHeader) == 8) {
                currentOffset += 8;
                boolean isDataChunk = chunkHeader[0] == 'd' && chunkHeader[1] == 'a' &&
                                      chunkHeader[2] == 't' && chunkHeader[3] == 'a';
                int chunkSize = (chunkHeader[4] & 0xFF) |
                                ((chunkHeader[5] & 0xFF) << 8) |
                                ((chunkHeader[6] & 0xFF) << 16) |
                                ((chunkHeader[7] & 0xFF) << 24);

                if (isDataChunk) {
                    return currentOffset;
                }

                if (chunkSize <= 0 || chunkSize > 100_000_000) {
                    break; // Invalid chunk size, bail safely
                }

                // Skip non-data chunk (e.g. fmt, JUNK, bext)
                long skipped = fis.skip(chunkSize);
                currentOffset += skipped;
            }
        } catch (Exception e) {
            Log.w(TAG, "Error parsing RIFF WAV header, defaulting to safe offset: " + e.getMessage());
        }

        return sourceAudio.length() > 44 ? 44 : 0;
    }

    /**
     * Slices audio into actual isolated chunk files with Voice Activity Detection.
     * Evaluates frame-based VAD and outputs bounded discrete chunk files.
     */
    public static List<AudioChunk> segmentAudio(File sourceAudio, File outputDir, long totalDurationMs, int chunkDurationSec) {
        List<AudioChunk> chunks = new ArrayList<>();
        if (sourceAudio == null || !sourceAudio.exists()) {
            return chunks;
        }

        if (!outputDir.exists()) {
            outputDir.mkdirs();
        }

        long chunkDurationMs = chunkDurationSec * 1000L;
        long headerOffset = determineAudioDataOffset(sourceAudio);
        long bytesPerSec = 16000 * 2; // 16kHz 16-bit mono = 32,000 bytes/sec
        long chunkSizeBytes = Math.max(32000, chunkDurationSec * bytesPerSec);

        try (FileInputStream fis = new FileInputStream(sourceAudio)) {
            if (headerOffset > 0) {
                long skipped = fis.skip(headerOffset);
                if (skipped < headerOffset) {
                    Log.w(TAG, "Could not skip entire header offset: " + skipped + " / " + headerOffset);
                }
            }

            byte[] buffer = new byte[(int) chunkSizeBytes];
            int chunkSeq = 1;
            int read;

            while ((read = fis.read(buffer)) > 0) {
                long startMs = (chunkSeq - 1) * chunkDurationMs;
                long endMs = totalDurationMs > 0 ? Math.min(totalDurationMs, chunkSeq * chunkDurationMs) : chunkSeq * chunkDurationMs;

                // Frame-based VAD analysis on 30ms frames
                short[] sampleBuffer = new short[read / 2];
                for (int i = 0; i < sampleBuffer.length; i++) {
                    sampleBuffer[i] = (short) ((buffer[i * 2] & 0xFF) | (buffer[i * 2 + 1] << 8));
                }
                // Conservative RMS threshold: ~300.0 (frame-based)
                boolean voiceDetected = detectVoiceActivity(sampleBuffer, 0, sampleBuffer.length, 300.0);

                // Write actual chunk slice file
                File chunkFile = new File(outputDir, String.format("chunk_%04d.raw", chunkSeq));
                try (FileOutputStream fos = new FileOutputStream(chunkFile)) {
                    fos.write(buffer, 0, read);
                    fos.flush();
                }

                chunks.add(new AudioChunk(chunkSeq, startMs, endMs, chunkFile, voiceDetected));
                chunkSeq++;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to segment audio file into chunks", e);
        }

        return chunks;
    }
}
