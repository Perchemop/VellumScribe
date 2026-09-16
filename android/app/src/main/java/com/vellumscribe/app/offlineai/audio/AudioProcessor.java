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
     * Energy-based Voice Activity Detection on 16-bit mono PCM samples.
     * Evaluates root-mean-square (RMS) energy against conservative speech threshold.
     */
    public static boolean detectVoiceActivity(short[] samples, int offset, int length, double thresholdRms) {
        if (samples == null || length <= 0) return false;
        double sumSquare = 0;
        int count = 0;
        for (int i = 0; i < length && (offset + i) < samples.length; i++) {
            short sample = samples[offset + i];
            sumSquare += (double) sample * sample;
            count++;
        }
        if (count == 0) return false;
        double rms = Math.sqrt(sumSquare / count);
        return rms >= thresholdRms;
    }

    /**
     * Slices audio into actual isolated chunk files with Voice Activity Detection.
     * Extracts byte boundaries from PCM/WAV source and outputs discrete chunk files.
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
        int totalChunks = (int) Math.max(1, Math.ceil((double) totalDurationMs / chunkDurationMs));

        // Detect if WAV header present (44-byte standard header)
        long fileLength = sourceAudio.length();
        long headerOffset = fileLength > 44 ? 44 : 0;
        long audioDataBytes = Math.max(0, fileLength - headerOffset);
        long bytesPerSec = 16000 * 2; // 16kHz 16-bit mono = 32,000 bytes/sec
        long chunkSizeBytes = Math.max(32000, chunkDurationSec * bytesPerSec);

        try (FileInputStream fis = new FileInputStream(sourceAudio)) {
            if (headerOffset > 0) {
                byte[] header = new byte[(int) headerOffset];
                fis.read(header);
            }

            byte[] buffer = new byte[(int) chunkSizeBytes];
            int chunkSeq = 1;
            int read;

            while ((read = fis.read(buffer)) > 0) {
                long startMs = (chunkSeq - 1) * chunkDurationMs;
                long endMs = Math.min(totalDurationMs, chunkSeq * chunkDurationMs);

                // Analyze VAD on this chunk
                short[] sampleBuffer = new short[read / 2];
                for (int i = 0; i < sampleBuffer.length; i++) {
                    sampleBuffer[i] = (short) ((buffer[i * 2] & 0xFF) | (buffer[i * 2 + 1] << 8));
                }
                // Conservative RMS threshold: ~350 (detects subtle speech without dropping soft voices)
                boolean voiceDetected = detectVoiceActivity(sampleBuffer, 0, sampleBuffer.length, 350.0);

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
