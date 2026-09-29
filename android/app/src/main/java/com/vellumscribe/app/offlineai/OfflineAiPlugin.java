package com.vellumscribe.app.offlineai;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.vellumscribe.app.offlineai.models.ModelManager;
import com.vellumscribe.app.offlineai.whisper.WhisperEngine;
import com.vellumscribe.app.offlineai.workers.TranscriptionWorker;

import java.io.File;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "OfflineAi")
public class OfflineAiPlugin extends Plugin {
    private static final String TAG = "OfflineAiPlugin";
    private ModelManager modelManager;
    private ExecutorService downloadExecutor;
    private final Map<String, AtomicBoolean> activeDownloads = new ConcurrentHashMap<>();
    private SpeechRecognizer speechRecognizer;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        super.load();
        modelManager = new ModelManager(getContext());
        downloadExecutor = Executors.newFixedThreadPool(2);
    }

    @Override
    protected void handleOnDestroy() {
        if (downloadExecutor != null) {
            downloadExecutor.shutdownNow();
        }
        if (speechRecognizer != null) {
            mainHandler.post(() -> {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                    speechRecognizer = null;
                }
            });
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isSpeechRecognitionAvailable(PluginCall call) {
        boolean available = SpeechRecognizer.isRecognitionAvailable(getContext());
        JSObject ret = new JSObject();
        ret.put("available", available);
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        String language = call.getString("language", "en-US");
        mainHandler.post(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                }
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override
                    public void onError(int error) {
                        JSObject data = new JSObject();
                        data.put("error", error);
                        notifyListeners("speechRecognitionError", data);
                    }
                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        JSObject data = new JSObject();
                        data.put("text", text);
                        data.put("isFinal", true);
                        notifyListeners("speechRecognitionResult", data);
                    }
                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        JSObject data = new JSObject();
                        data.put("text", text);
                        data.put("isFinal", false);
                        notifyListeners("speechRecognitionResult", data);
                    }
                    @Override public void onEvent(int eventType, Bundle params) {}
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Failed starting SpeechRecognizer", e);
                call.reject("SPEECH_RECOGNITION_ERROR", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.stopListening();
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("SPEECH_STOP_ERROR", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject ret = new JSObject();

        // 1. Real RAM via ActivityManager
        long totalRamMb = 0;
        long availRamMb = 0;
        try {
            ActivityManager actManager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (actManager != null) {
                ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
                actManager.getMemoryInfo(memInfo);
                totalRamMb = memInfo.totalMem / (1024 * 1024);
                availRamMb = memInfo.availMem / (1024 * 1024);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed reading memory info", e);
        }

        int cores = Runtime.getRuntime().availableProcessors();
        long freeStorageMb = getContext().getFilesDir().getFreeSpace() / (1024 * 1024);

        // 2. Real Battery status via BatteryManager
        Integer batteryLevel = null;
        Boolean isCharging = null;
        try {
            Intent batteryIntent = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batteryIntent != null) {
                int rawLevel = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                int status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (rawLevel >= 0 && scale > 0) {
                    batteryLevel = (int) ((rawLevel / (float) scale) * 100);
                }
                isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed reading battery status", e);
        }

        // T-P0.2: Split capability flags: library loaded vs genuine GGML tensor inference runtime ready
        boolean libLoaded = WhisperEngine.isNativeLibraryAvailable();
        boolean inferenceReady = libLoaded && WhisperEngine.probeInferenceRuntime();

        ret.put("availableRamMb", availRamMb > 0 ? availRamMb : null);
        ret.put("totalRamMb", totalRamMb > 0 ? totalRamMb : null);
        ret.put("cpuCores", cores);
        ret.put("architecture", System.getProperty("os.arch"));
        ret.put("androidApiLevel", android.os.Build.VERSION.SDK_INT);
        ret.put("availableStorageMb", freeStorageMb);
        ret.put("batteryLevel", batteryLevel);
        ret.put("isCharging", isCharging);
        ret.put("nativeLibraryLoaded", libLoaded);
        ret.put("inferenceRuntimeReady", inferenceReady);
        ret.put("isNativeEngineAvailable", inferenceReady);

        String recommended = "whisper-base";
        if (availRamMb > 0 && availRamMb < 3000) {
            recommended = "whisper-tiny";
        } else if (availRamMb >= 6000 && cores >= 8) {
            recommended = "whisper-small";
        }
        ret.put("recommendedModelId", recommended);

        call.resolve(ret);
    }

    @PluginMethod
    public void listSpeechModels(PluginCall call) {
        JSArray arr = new JSArray();

        for (Map.Entry<String, ModelManager.ModelMeta> entry : ModelManager.VERIFIED_MODELS.entrySet()) {
            String key = entry.getKey();
            ModelManager.ModelMeta meta = entry.getValue();

            JSObject item = new JSObject();
            item.put("id", meta.id);
            item.put("filename", meta.filename);
            item.put("downloadUrl", meta.downloadUrl);
            item.put("engine", "whisper.cpp");
            item.put("languageMode", "multilingual");
            item.put("quantization", "q5_1");
            item.put("downloadBytes", meta.expectedBytes);
            item.put("installed", modelManager.isModelInstalled(meta.id));
            item.put("installedSizeBytes", modelManager.getModelStorageSize(meta.id));
            item.put("sha256", meta.expectedSha256);
            item.put("license", "MIT");

            if ("whisper-tiny".equals(meta.id)) {
                item.put("displayName", "Whisper Tiny (Quantized Q5_1)");
                item.put("accuracyClass", "fast");
                item.put("minimumRamMb", 1024);
                item.put("recommendedRamMb", 2048);
                item.put("description", "Ultra-fast speech recognition with minimal memory footprint. Ideal for quick memos and low-power devices.");
            } else if ("whisper-base".equals(meta.id)) {
                item.put("displayName", "Whisper Base (Quantized Q5_1)");
                item.put("accuracyClass", "balanced");
                item.put("minimumRamMb", 2048);
                item.put("recommendedRamMb", 4096);
                item.put("description", "Recommended default model. Excellent balance of high accuracy and processing speed for meetings and dictations.");
            } else if ("whisper-small".equals(meta.id)) {
                item.put("displayName", "Whisper Small (Quantized Q5_1)");
                item.put("accuracyClass", "accurate");
                item.put("minimumRamMb", 4096);
                item.put("recommendedRamMb", 8192);
                item.put("description", "High accuracy transcription suitable for complex vocabulary, technical terminology, and multilingual meetings.");
            }

            arr.put(item);
        }

        JSObject res = new JSObject();
        res.put("models", arr);
        call.resolve(res);
    }

    @PluginMethod
    public void installSpeechModel(PluginCall call) {
        String modelId = call.getString("modelId");
        if (modelId == null) {
            call.reject("Model ID is required");
            return;
        }

        ModelManager.ModelMeta meta = ModelManager.VERIFIED_MODELS.get(modelId);
        if (meta == null) {
            JSObject ret = new JSObject();
            ret.put("modelId", modelId);
            ret.put("installed", false);
            ret.put("checksumVerified", false);
            ret.put("error", "Model not recognized in verified manifest");
            call.resolve(ret);
            return;
        }

        if (modelManager.isModelInstalled(modelId)) {
            JSObject ret = new JSObject();
            ret.put("modelId", modelId);
            ret.put("installed", true);
            ret.put("checksumVerified", true);
            call.resolve(ret);
            return;
        }

        // Check disk space before starting
        long freeMb = getContext().getFilesDir().getFreeSpace() / (1024 * 1024);
        long requiredMb = (meta.expectedBytes / (1024 * 1024)) + 50;
        if (freeMb < requiredMb) {
            JSObject ret = new JSObject();
            ret.put("modelId", modelId);
            ret.put("installed", false);
            ret.put("error", "Insufficient storage: " + requiredMb + " MB required, " + freeMb + " MB available.");
            call.resolve(ret);
            return;
        }

        AtomicBoolean cancelToken = new AtomicBoolean(false);
        activeDownloads.put(modelId, cancelToken);

        downloadExecutor.execute(() -> {
            try {
                ModelManager.DownloadResult result = modelManager.downloadAndInstallModel(
                    modelId,
                    (bytesDownloaded, totalBytes, percent) -> {
                        JSObject progressObj = new JSObject();
                        progressObj.put("modelId", modelId);
                        progressObj.put("bytesDownloaded", bytesDownloaded);
                        progressObj.put("totalBytes", totalBytes);
                        progressObj.put("percent", percent);
                        notifyListeners("modelDownloadProgress", progressObj);
                    },
                    cancelToken
                );

                activeDownloads.remove(modelId);

                JSObject ret = new JSObject();
                ret.put("modelId", modelId);
                ret.put("installed", result.success);
                ret.put("checksumVerified", result.checksumVerified);
                ret.put("bytesWritten", result.bytesWritten);
                if (result.errorMessage != null) {
                    ret.put("error", result.errorMessage);
                }
                call.resolve(ret);
            } catch (Exception e) {
                activeDownloads.remove(modelId);
                Log.e(TAG, "Download execution failed for " + modelId, e);
                JSObject ret = new JSObject();
                ret.put("modelId", modelId);
                ret.put("installed", false);
                ret.put("error", "Download failed: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void cancelModelDownload(PluginCall call) {
        String modelId = call.getString("modelId");
        if (modelId != null) {
            AtomicBoolean token = activeDownloads.get(modelId);
            if (token != null) {
                token.set(true);
                activeDownloads.remove(modelId);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteSpeechModel(PluginCall call) {
        String modelId = call.getString("modelId");
        if (modelId != null) {
            modelManager.deleteModel(modelId);
        }
        call.resolve();
    }

    @PluginMethod
    public void getModelStorageUsage(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("totalBytes", modelManager.getTotalModelsStorageSize());
        JSObject perModel = new JSObject();
        for (String id : ModelManager.VERIFIED_MODELS.keySet()) {
            perModel.put(id, modelManager.getModelStorageSize(id));
        }
        ret.put("models", perModel);
        call.resolve(ret);
    }

    @PluginMethod
    public void startTranscription(PluginCall call) {
        String recordingId = call.getString("recordingId");
        String modelId = call.getString("modelId", "whisper-base");
        String language = call.getString("language", "auto"); // Propagate language parameter!
        String audioPath = call.getString("audioPath");
        String mediaKey = call.getString("mediaKey");
        long durationMs = call.getInt("durationMs", 30000);
        int startChunk = call.getInt("startChunk", 1); // Resume support!

        if ((audioPath == null || audioPath.trim().isEmpty()) && mediaKey != null && !mediaKey.trim().isEmpty()) {
            File directKey = new File(getContext().getFilesDir(), mediaKey);
            if (directKey.exists()) {
                audioPath = directKey.getAbsolutePath();
            } else {
                File mediaSub = new File(new File(getContext().getFilesDir(), "media"), mediaKey);
                if (mediaSub.exists()) {
                    audioPath = mediaSub.getAbsolutePath();
                }
            }
        }

        if (!modelManager.isModelInstalled(modelId)) {
            call.reject("OFFLINE_AI_MODEL_MISSING: Model '" + modelId + "' is not installed on device.");
            return;
        }

        String jobId = "job_" + recordingId + "_" + System.currentTimeMillis();

        boolean preferBatteryOverSpeed = Boolean.TRUE.equals(call.getBoolean("preferBatteryOverSpeed", false));

        Data inputData = new Data.Builder()
            .putString(TranscriptionWorker.KEY_JOB_ID, jobId)
            .putLong(TranscriptionWorker.KEY_RECORDING_ID, Long.parseLong(recordingId != null ? recordingId : "0"))
            .putString(TranscriptionWorker.KEY_MODEL_ID, modelId)
            .putString(TranscriptionWorker.KEY_LANGUAGE, language != null ? language : "auto")
            .putString(TranscriptionWorker.KEY_AUDIO_PATH, audioPath != null ? audioPath : "")
            .putString("media_key", mediaKey != null ? mediaKey : "")
            .putLong(TranscriptionWorker.KEY_DURATION_MS, durationMs)
            .putInt(TranscriptionWorker.KEY_START_CHUNK, startChunk)
            .putBoolean("prefer_battery_over_speed", preferBatteryOverSpeed)
            .build();

        OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(TranscriptionWorker.class)
            .setInputData(inputData)
            .addTag(jobId)
            .build();

        WorkManager.getInstance(getContext()).enqueueUniqueWork(
            jobId,
            ExistingWorkPolicy.REPLACE,
            workRequest
        );

        JSObject ret = new JSObject();
        ret.put("jobId", jobId);
        ret.put("workId", workRequest.getId().toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void getTranscriptionStatus(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("Missing jobId");
            return;
        }

        try {
            java.util.List<WorkInfo> infos = WorkManager.getInstance(getContext()).getWorkInfosByTag(jobId).get();
            if (infos != null && !infos.isEmpty()) {
                WorkInfo info = infos.get(0);
                WorkInfo.State state = info.getState();

                JSObject ret = new JSObject();
                ret.put("jobId", jobId);

                if (state == WorkInfo.State.SUCCEEDED) {
                    ret.put("status", "COMPLETED");
                    ret.put("progressPercent", 100);
                    ret.put("phaseLabel", "Complete");
                    ret.put("transcript", info.getOutputData().getString("transcript"));
                    ret.put("totalChunks", info.getOutputData().getInt("total_chunks", 1));
                } else if (state == WorkInfo.State.FAILED) {
                    ret.put("status", "FAILED");
                    ret.put("progressPercent", 0);
                    ret.put("phaseLabel", "Failed");
                    ret.put("error", info.getOutputData().getString("error_message"));
                    ret.put("lastCompletedChunk", info.getOutputData().getInt("last_completed_chunk", 0));
                } else if (state == WorkInfo.State.CANCELLED) {
                    ret.put("status", "CANCELLED");
                    ret.put("phaseLabel", "Cancelled");
                } else if (state == WorkInfo.State.RUNNING) {
                    int progress = info.getProgress().getInt("progress", 50);
                    int currentChunk = info.getProgress().getInt("current_chunk", 0);
                    int totalChunks = info.getProgress().getInt("total_chunks", 0);
                    ret.put("status", "TRANSCRIBING");
                    ret.put("progressPercent", progress);
                    ret.put("currentChunk", currentChunk);
                    ret.put("totalChunks", totalChunks);
                    ret.put("phaseLabel", "Transcribing speech: chunk " + currentChunk + " of " + totalChunks);
                } else {
                    ret.put("status", "QUEUED");
                    ret.put("progressPercent", 5);
                    ret.put("phaseLabel", "Queued");
                }
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "Error fetching work info for job " + jobId, e);
        }

        JSObject fallback = new JSObject();
        fallback.put("jobId", jobId);
        fallback.put("status", "FAILED");
        fallback.put("error", "Job not found in background queue");
        call.resolve(fallback);
    }

    @PluginMethod
    public void cancelTranscription(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId != null) {
            WorkManager.getInstance(getContext()).cancelAllWorkByTag(jobId);
        }
        call.resolve();
    }
}
