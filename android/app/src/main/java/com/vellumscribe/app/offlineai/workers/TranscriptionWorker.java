package com.vellumscribe.app.offlineai.workers;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.BatteryManager;
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

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.List;

/**
 * Durable Android Background Worker for Speech Transcription.
 * Features:
 * - Durable chunk checkpointing to SQLite database
 * - Resume-after-process-death: skips already processed chunks
 * - Streamed memory-efficient audio reading
 * - Language propagation to Whisper native engine
 * - Battery & thermal aware thread scheduling
 * - Direct persistence of worker results to SQLite
 */
public class TranscriptionWorker extends Worker {
    private static final String TAG = "TranscriptionWorker";
    public static final String CHANNEL_ID = "vellum_transcription_channel";
    public static final int NOTIFICATION_ID = 8192;

    public static final String KEY_RECORDING_ID = "recording_id";
    public static final String KEY_MODEL_ID = "model_id";
    public static final String KEY_JOB_ID = "job_id";
    public static final String KEY_LANGUAGE = "language";
    public static final String KEY_TRANSCRIPTION_ID = "transcription_id";
    public static final String KEY_AUDIO_PATH = "audio_path";
    public static final String KEY_DURATION_MS = "duration_ms";
    public static final String KEY_START_CHUNK = "start_chunk";

    private final Context context;

    public TranscriptionWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
        this.context = context;
    }

    private SQLiteDatabase openDatabaseSafely() {
        try {
            String[] candidateNames = new String[] {
                "vellumscribeSQLite.db",
                "vellumscribe.db",
                "vellumscribe_relational_v3.sqlite"
            };

            for (String name : candidateNames) {
                File dbFile = context.getDatabasePath(name);
                if (dbFile != null && dbFile.exists()) {
                    return SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
                }
                File filesFallback = new File(context.getFilesDir(), name);
                if (filesFallback.exists()) {
                    return SQLiteDatabase.openDatabase(filesFallback.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
                }
            }

            // Check database parent directory for any existing .db / .sqlite database
            File dbDir = context.getDatabasePath("dummy").getParentFile();
            if (dbDir != null && dbDir.exists()) {
                File[] list = dbDir.listFiles();
                if (list != null) {
                    for (File f : list) {
                        if (f.getName().endsWith(".db") || f.getName().endsWith(".sqlite")) {
                            return SQLiteDatabase.openDatabase(f.getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not open SQLite database directly: " + e.getMessage());
        }
        return null;
    }

    private int determineOptimalThreadCount() {
        int defaultThreads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1));
        try {
            Intent batteryIntent = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batteryIntent != null) {
                int rawLevel = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                int status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                boolean isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
                if (rawLevel >= 0 && scale > 0) {
                    int pct = (int) ((rawLevel / (float) scale) * 100);
                    if (pct < 15 && !isCharging) {
                        Log.i(TAG, "Battery is critical (" + pct + "%); throttling whisper threads to 1.");
                        return 1;
                    }
                }
            }
        } catch (Exception ignored) {}
        return defaultThreads;
    }

    @NonNull
    @Override
    public Result doWork() {
        String jobId = getInputData().getString(KEY_JOB_ID);
        long recordingId = getInputData().getLong(KEY_RECORDING_ID, -1);
        String modelId = getInputData().getString(KEY_MODEL_ID);
        String language = getInputData().getString(KEY_LANGUAGE);
        if (language == null || language.trim().isEmpty()) {
            language = "auto";
        }
        String audioPath = getInputData().getString(KEY_AUDIO_PATH);
        long durationMs = getInputData().getLong(KEY_DURATION_MS, 30000L);
        int inputStartChunk = getInputData().getInt(KEY_START_CHUNK, 1);

        Log.i(TAG, "Starting transcription worker. Job: " + jobId + ", Lang: " + language + ", Model: " + modelId);

        try {
            setForegroundAsync(createForegroundInfo("Preparing offline speech recognition..."));
        } catch (Exception e) {
            Log.w(TAG, "Could not set foreground info", e);
        }

        if (modelId == null || audioPath == null) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_PARAM_MISSING")
                .putString("error_message", "Required worker parameters were null.")
                .build());
        }

        File audioFile = null;
        if (audioPath != null && !audioPath.trim().isEmpty()) {
            File directFile = new File(audioPath);
            if (directFile.exists()) {
                audioFile = directFile;
            } else {
                File relFile = new File(context.getFilesDir(), audioPath);
                if (relFile.exists()) {
                    audioFile = relFile;
                }
            }
        }

        if (audioFile == null) {
            String mediaKey = getInputData().getString("media_key");
            if (mediaKey != null && !mediaKey.trim().isEmpty()) {
                File keyFile = new File(context.getFilesDir(), mediaKey);
                if (keyFile.exists()) {
                    audioFile = keyFile;
                } else {
                    File mediaSubdir = new File(new File(context.getFilesDir(), "media"), mediaKey);
                    if (mediaSubdir.exists()) {
                        audioFile = mediaSubdir;
                    }
                }
            }
        }

        if (audioFile == null || !audioFile.exists() || audioFile.length() == 0) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_AUDIO_MISSING")
                .putString("error_message", "Audio recording file does not exist on disk: " + (audioPath != null ? audioPath : "unresolved"))
                .build());
        }

        ModelManager modelManager = new ModelManager(context);
        File modelFile = modelManager.getModelFile(modelId);
        if (!modelFile.exists() || !modelManager.isModelInstalled(modelId)) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_MODEL_MISSING")
                .putString("error_message", "Whisper model '" + modelId + "' is not installed on device.")
                .build());
        }

        WhisperEngine engine = new WhisperEngine();
        if (!WhisperEngine.isNativeLibraryAvailable() || !engine.initialize(modelFile)) {
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_ENGINE_FAILURE")
                .putString("error_message", "Failed to initialize whisper.cpp native engine.")
                .build());
        }

        File chunksDir = new File(context.getCacheDir(), "chunks_" + jobId);
        SQLiteDatabase db = openDatabaseSafely();

        try {
            List<AudioProcessor.AudioChunk> chunks = AudioProcessor.segmentAudio(audioFile, chunksDir, durationMs, 20);
            int totalChunks = chunks.size();

            // Resume-after-process-death: check durable SQLite checkpoints
            StringBuilder fullTranscript = new StringBuilder();
            int resumeChunkIndex = inputStartChunk;

            if (db != null && db.isOpen()) {
                try {
                    Cursor cursor = db.rawQuery(
                        "SELECT chunk_index, transcript_text FROM transcription_chunk_checkpoints WHERE job_id = ? AND status = 'completed' ORDER BY chunk_index ASC",
                        new String[]{jobId}
                    );
                    if (cursor != null) {
                        while (cursor.moveToNext()) {
                            int cIndex = cursor.getInt(0);
                            String text = cursor.getString(1);
                            if (text != null && !text.trim().isEmpty()) {
                                if (fullTranscript.length() > 0) fullTranscript.append(" ");
                                fullTranscript.append(text.trim());
                            }
                            if (cIndex >= resumeChunkIndex) {
                                resumeChunkIndex = cIndex + 1;
                            }
                        }
                        cursor.close();
                        if (resumeChunkIndex > 1) {
                            Log.i(TAG, "Resuming job " + jobId + " from chunk checkpoint: " + resumeChunkIndex);
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Error checking chunk checkpoints: " + e.getMessage());
                }
            }

            int nThreads = determineOptimalThreadCount();

            for (int i = resumeChunkIndex - 1; i < totalChunks; i++) {
                if (isStopped()) {
                    Log.i(TAG, "TranscriptionWorker stopped at chunk " + (i + 1));
                    engine.release();
                    if (db != null && db.isOpen()) db.close();
                    return Result.failure(new Data.Builder()
                        .putString("error_code", "OFFLINE_AI_CANCELLED")
                        .putInt("last_completed_chunk", i)
                        .build());
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
                    setForegroundAsync(createForegroundInfo("Transcribing speech (" + language + "): Chunk " + currentChunk + " of " + totalChunks));
                } catch (Exception ignored) {}

                String chunkText = "";
                if (chunk.hasVoiceActivity && chunk.chunkFile.exists()) {
                    long fileLen = chunk.chunkFile.length();
                    int numSamples = (int) (fileLen / 2);
                    float[] pcmFloats = new float[numSamples];

                    // Streamed memory-efficient reading
                    try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(chunk.chunkFile), 8192)) {
                        byte[] bytePair = new byte[2];
                        for (int s = 0; s < numSamples; s++) {
                            int r = bis.read(bytePair);
                            if (r < 2) break;
                            short sample = (short) ((bytePair[0] & 0xFF) | (bytePair[1] << 8));
                            pcmFloats[s] = sample / 32768.0f;
                        }

                        // Execute native whisper with selected language!
                        chunkText = engine.transcribe(pcmFloats, language, nThreads);
                        if (chunkText != null && !chunkText.trim().isEmpty()) {
                            if (fullTranscript.length() > 0) fullTranscript.append(" ");
                            fullTranscript.append(chunkText.trim());
                        }
                    } catch (Exception ex) {
                        Log.w(TAG, "Error processing chunk " + currentChunk, ex);
                    }
                }

                // Persist chunk checkpoint to SQLite
                if (db != null && db.isOpen()) {
                    try {
                        long now = System.currentTimeMillis();
                        ContentValues cv = new ContentValues();
                        cv.put("job_id", jobId);
                        cv.put("chunk_index", currentChunk);
                        cv.put("start_ms", chunk.startMs);
                        cv.put("end_ms", chunk.endMs);
                        cv.put("status", "completed");
                        cv.put("transcript_text", chunkText != null ? chunkText.trim() : "");
                        cv.put("created_at", now);
                        cv.put("updated_at", now);
                        db.insertWithOnConflict("transcription_chunk_checkpoints", null, cv, SQLiteDatabase.CONFLICT_REPLACE);

                        ContentValues jobCv = new ContentValues();
                        jobCv.put("current_chunk", currentChunk);
                        jobCv.put("total_chunks", totalChunks);
                        jobCv.put("updated_at", now);
                        db.update("transcription_jobs", jobCv, "id = ?", new String[]{jobId});
                    } catch (Exception e) {
                        Log.w(TAG, "Could not save chunk checkpoint: " + e.getMessage());
                    }
                }
            }

            engine.release();

            // Persist final completion directly to SQLite
            if (db != null && db.isOpen()) {
                try {
                    long now = System.currentTimeMillis();
                    ContentValues jobCv = new ContentValues();
                    jobCv.put("status", "COMPLETED");
                    jobCv.put("current_chunk", totalChunks);
                    jobCv.put("updated_at", now);
                    db.update("transcription_jobs", jobCv, "id = ?", new String[]{jobId});

                    // Update transcriptions table if transcription_id exists
                    db.execSQL(
                        "UPDATE transcriptions SET status = 'COMPLETED', text = ?, completed_at = ? WHERE id = (SELECT transcription_id FROM transcription_jobs WHERE id = ?)",
                        new Object[]{fullTranscript.toString(), now, jobId}
                    );
                    Log.i(TAG, "Durable SQLite persistence completed for job: " + jobId);
                } catch (Exception e) {
                    Log.w(TAG, "Could not write final status to SQLite: " + e.getMessage());
                } finally {
                    db.close();
                }
            }

            return Result.success(new Data.Builder()
                .putString("job_id", jobId)
                .putLong("recording_id", recordingId)
                .putString("transcript", fullTranscript.toString())
                .putInt("total_chunks", totalChunks)
                .build());

        } catch (Exception e) {
            Log.e(TAG, "TranscriptionWorker execution failed", e);
            engine.release();
            if (db != null && db.isOpen()) db.close();
            return Result.failure(new Data.Builder()
                .putString("error_code", "OFFLINE_AI_RUNTIME_ERROR")
                .putString("error_message", e.getMessage())
                .build());
        } finally {
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
