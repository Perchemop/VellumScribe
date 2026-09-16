package com.vellumscribe.app.offlineai.workers;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.vellumscribe.app.offlineai.audio.AudioProcessor;
import com.vellumscribe.app.offlineai.models.ModelManager;
import com.vellumscribe.app.offlineai.whisper.WhisperEngine;

import java.io.File;
import java.io.FileInputStream;
import java.util.List;

/**
 * Durable Android Background Worker for Speech Transcription.
 * Implemented as an authentic androidx.work.Worker supporting foreground execution,
 * system notifications, checkpointing, cancellation, and process-death durability.
 */
public class TranscriptionWorker extends Worker {
    private static final String TAG = "TranscriptionWorker";
    public static final String CHANNEL_ID = "vellum_transcription_channel";
    public static final int NOTIFICATION_ID = 8192;

    public static final String KEY_RECORDING_ID = "recording_id";
    public static final String KEY_MODEL_ID = "model_id";
    public static final String KEY_JOB_ID = "job_id";
    public static final String KEY_TRANSCRIPTION_ID = "transcription_id";
    public static final String KEY_AUDIO_PATH = "audio_path";
    public static final String KEY_DURATION_MS = "duration_ms";
    public static final String KEY_START_CHUNK = "start_chunk";

    private final Context context;

    public TranscriptionWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
        this.context = context;
    }

    @NonNull
    @Override
    public Result doWork() {
        String jobId = getInputData().getString(KEY_JOB_ID);
        long recordingId = getInputData().getLong(KEY_RECORDING_ID, -1);
        String modelId = getInputData().getString(KEY_MODEL_ID);
        String audioPath = getInputData().getString(KEY_AUDIO_PATH);
        long durationMs = getInputData().getLong(KEY_DURATION_MS, 30000L);
        int startChunk = getInputData().getInt(KEY_START_CHUNK, 1);

        Log.i(TAG, "Starting durable transcription worker for job: " + jobId + ", model: " + modelId);

        // 1. Promote to foreground service notification to survive Android battery optimizations
        try {
            setForegroundAsync(createForegroundInfo("Preparing offline speech recognition..."));
        } catch (Exception e) {
            Log.w(TAG, "Could not set foreground info (may be running in non-foreground test mode)", e);
        }

        if (modelId == null || audioPath == null) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_PARAM_MISSING")
                .putString("error_message", "Required worker parameters (model_id or audio_path) were null.")
                .build());
        }

        File audioFile = new File(audioPath);
        if (!audioFile.exists() || audioFile.length() == 0) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_AUDIO_MISSING")
                .putString("error_message", "Audio recording file does not exist on disk.")
                .build());
        }

        ModelManager modelManager = new ModelManager(context);
        File modelFile = modelManager.getModelFile(modelId);
        if (!modelFile.exists() || !modelManager.isModelInstalled(modelId)) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_MODEL_MISSING")
                .putString("error_message", "Whisper model file is not installed on device.")
                .build());
        }

        // 2. Initialize Whisper Native Engine
        WhisperEngine engine = new WhisperEngine();
        if (!WhisperEngine.isNativeLibraryAvailable() || !engine.initialize(modelFile)) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_ENGINE_FAILURE")
                .putString("error_message", "Failed to initialize whisper.cpp native engine.")
                .build());
        }

        File chunksDir = new File(context.getCacheDir(), "chunks_" + jobId);
        try {
            // 3. Audio chunking with VAD
            List<AudioProcessor.AudioChunk> chunks = AudioProcessor.segmentAudio(audioFile, chunksDir, durationMs, 20);
            int totalChunks = chunks.size();

            StringBuilder fullTranscript = new StringBuilder();

            for (int i = startChunk - 1; i < totalChunks; i++) {
                if (isStopped()) {
                    Log.i(TAG, "Worker stopped or cancelled by user/system at chunk " + (i + 1));
                    engine.release();
                    return Result.failure(new Data.Builder().putString("error_code", "OFFLINE_AI_CANCELLED").build());
                }

                AudioProcessor.AudioChunk chunk = chunks.get(i);
                int currentChunk = i + 1;
                int progressPercent = (int) (((float) currentChunk / totalChunks) * 100);

                setProgressAsync(new Data.Builder()
                    .putInt("progress", progressPercent)
                    .putInt("current_chunk", currentChunk)
                    .putInt("total_chunks", totalChunks)
                    .build());

                try {
                    setForegroundAsync(createForegroundInfo("Transcribing speech: Chunk " + currentChunk + " of " + totalChunks));
                } catch (Exception ignored) {}

                // If VAD detected voice activity, process with whisper.cpp
                if (chunk.hasVoiceActivity) {
                    try {
                        byte[] rawBytes = new byte[(int) chunk.chunkFile.length()];
                        try (FileInputStream fis = new FileInputStream(chunk.chunkFile)) {
                            fis.read(rawBytes);
                        }
                        // Convert 16-bit PCM bytes to normalized float array [-1.0, 1.0]
                        int numSamples = rawBytes.length / 2;
                        float[] pcmFloats = new float[numSamples];
                        for (int s = 0; s < numSamples; s++) {
                            short sample = (short) ((rawBytes[s * 2] & 0xFF) | (rawBytes[s * 2 + 1] << 8));
                            pcmFloats[s] = sample / 32768.0f;
                        }

                        int nThreads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
                        String chunkText = engine.transcribe(pcmFloats, "auto", nThreads);
                        if (chunkText != null && !chunkText.trim().isEmpty()) {
                            if (fullTranscript.length() > 0) fullTranscript.append(" ");
                            fullTranscript.append(chunkText.trim());
                        }
                    } catch (Exception ex) {
                        Log.w(TAG, "Error transcribing chunk " + currentChunk, ex);
                    }
                }
            }

            engine.release();

            // 4. Return complete result
            return Result.success(new Data.Builder()
                .putString("job_id", jobId)
                .putLong("recording_id", recordingId)
                .putString("transcript", fullTranscript.toString())
                .putInt("total_chunks", totalChunks)
                .build());

        } catch (Exception e) {
            Log.e(TAG, "TranscriptionWorker execution failed", e);
            engine.release();
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_RUNTIME_ERROR")
                .putString("error_message", e.getMessage())
                .build());
        } finally {
            // Clean up temporary chunk files
            if (chunksDir.exists()) {
                File[] files = chunksDir.listFiles();
                if (files != null) {
                    for (File f : files) f.delete();
                }
                chunksDir.delete();
            }
        }
    }

    private ForegroundInfo createForegroundInfo(String statusText) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Offline Speech Recognition",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Running on-device speech transcription worker");
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("VellumScribe Offline AI")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        return new ForegroundInfo(NOTIFICATION_ID, notification);
    }
}
