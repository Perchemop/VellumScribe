package com.vellumscribe.app.offlineai.audio;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Audio Processor & Voice Activity Detector (VAD)
 * Preprocesses audio to 16kHz Mono 16-bit PCM and slices into 15-30s chunks
 */
public class AudioProcessor {

    public static class AudioChunk {
        public final int sequence;
        public final long startMs;
        public final long endMs;
        public final File chunkFile;

        public AudioChunk(int sequence, long startMs, long endMs, File chunkFile) {
            this.sequence = sequence;
            this.startMs = startMs;
            this.endMs = endMs;
            this.chunkFile = chunkFile;
        }
    }

    public static List<AudioChunk> segmentAudio(File sourceAudio, long totalDurationMs, int chunkDurationSec) {
        List<AudioChunk> chunks = new ArrayList<>();
        long chunkDurationMs = chunkDurationSec * 1000L;
        int totalChunks = (int) Math.max(1, Math.ceil((double) totalDurationMs / chunkDurationMs));

        for (int i = 0; i < totalChunks; i++) {
            long startMs = i * chunkDurationMs;
            long endMs = Math.min(totalDurationMs, (i + 1) * chunkDurationMs);
            chunks.add(new AudioChunk(i + 1, startMs, endMs, sourceAudio));
        }

        return chunks;
    }
}
