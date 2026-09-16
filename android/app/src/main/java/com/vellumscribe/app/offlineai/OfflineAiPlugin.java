package com.vellumscribe.app.offlineai;

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
import java.util.UUID;

@CapacitorPlugin(name = "OfflineAi")
public class OfflineAiPlugin extends Plugin {
    private static final String TAG = "OfflineAiPlugin";
    private ModelManager modelManager;

    @Override
    public void load() {
        super.load();
        modelManager = new ModelManager(getContext());
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject ret = new JSObject();
        Runtime runtime = Runtime.getRuntime();
        long maxMemoryMb = runtime.maxMemory() / (1024 * 1024);
        int cores = runtime.availableProcessors();

        ret.put("availableRamMb", maxMemoryMb);
        ret.put("cpuCores", cores);
        ret.put("architecture", System.getProperty("os.arch"));
        ret.put("androidApiLevel", android.os.Build.VERSION.SDK_INT);
        ret.put("availableStorageMb", getContext().getFilesDir().getFreeSpace() / (1024 * 1024));
        ret.put("batteryLevel", null);
        ret.put("isCharging", null);
        ret.put("isNativeEngineAvailable", WhisperEngine.isNativeLibraryAvailable());
        ret.put("recommendedModelId", maxMemoryMb < 3000 ? "whisper-tiny" : "whisper-base");

        call.resolve(ret);
    }

    @PluginMethod
    public void listSpeechModels(PluginCall call) {
        JSArray arr = new JSArray();

        JSObject tiny = new JSObject();
        tiny.put("id", "whisper-tiny");
        tiny.put("displayName", "Whisper Tiny (Quantized Q5_1)");
        tiny.put("engine", "whisper.cpp");
        tiny.put("languageMode", "multilingual");
        tiny.put("quantization", "q5_1");
        tiny.put("downloadBytes", 31452000);
        tiny.put("accuracyClass", "fast");
        tiny.put("installed", modelManager.isModelInstalled("whisper-tiny"));
        tiny.put("sha256", "313426e82da9486c476722d56a31c5ab1e4cf7e7f62d8ea2e0807b1a2080fa0a");
        tiny.put("license", "MIT");
        arr.put(tiny);

        JSObject base = new JSObject();
        base.put("id", "whisper-base");
        base.put("displayName", "Whisper Base (Quantized Q5_1)");
        base.put("engine", "whisper.cpp");
        base.put("languageMode", "multilingual");
        base.put("quantization", "q5_1");
        base.put("downloadBytes", 57680000);
        base.put("accuracyClass", "balanced");
        base.put("installed", modelManager.isModelInstalled("whisper-base"));
        base.put("sha256", "41b71457492c10b7b137f8f60bfb72f85e43a91081552a488c037cb97c55127d");
        base.put("license", "MIT");
        arr.put(base);

        JSObject small = new JSObject();
        small.put("id", "whisper-small");
        small.put("displayName", "Whisper Small (Quantized Q5_1)");
        small.put("engine", "whisper.cpp");
        small.put("languageMode", "multilingual");
        small.put("quantization", "q5_1");
        small.put("downloadBytes", 182400000);
        small.put("accuracyClass", "accurate");
        small.put("installed", modelManager.isModelInstalled("whisper-small"));
        small.put("sha256", "36a8d6728c3a1059f0f9b31d87e5ccbe133cf2efb529944f2fb9a7a671ef07c7");
        small.put("license", "MIT");
        arr.put(small);

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

        // Verify if already installed and valid
        if (modelManager.isModelInstalled(modelId)) {
            JSObject ret = new JSObject();
            ret.put("modelId", modelId);
            ret.put("installed", true);
            ret.put("checksumVerified", true);
            call.resolve(ret);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("modelId", modelId);
        ret.put("installed", false);
        ret.put("checksumVerified", false);
        ret.put("error", "Model file not present on storage. Download or bundle model artifact before installation.");
        call.resolve(ret);
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
    public void startTranscription(PluginCall call) {
        String recordingId = call.getString("recordingId");
        String modelId = call.getString("modelId", "whisper-base");
        String audioPath = call.getString("audioPath");
        long durationMs = call.getInt("durationMs", 30000);

        if (!modelManager.isModelInstalled(modelId)) {
            call.reject("OFFLINE_AI_MODEL_MISSING: Model is not installed on device.");
            return;
        }

        String jobId = "job_" + recordingId + "_" + System.currentTimeMillis();

        Data inputData = new Data.Builder()
            .putString(TranscriptionWorker.KEY_JOB_ID, jobId)
            .putLong(TranscriptionWorker.KEY_RECORDING_ID, Long.parseLong(recordingId != null ? recordingId : "0"))
            .putString(TranscriptionWorker.KEY_MODEL_ID, modelId)
            .putString(TranscriptionWorker.KEY_AUDIO_PATH, audioPath != null ? audioPath : "")
            .putLong(TranscriptionWorker.KEY_DURATION_MS, durationMs)
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
                } else if (state == WorkInfo.State.FAILED) {
                    ret.put("status", "FAILED");
                    ret.put("progressPercent", 0);
                    ret.put("phaseLabel", "Failed");
                    ret.put("error", info.getOutputData().getString("error_message"));
                } else if (state == WorkInfo.State.CANCELLED) {
                    ret.put("status", "CANCELLED");
                    ret.put("phaseLabel", "Cancelled");
                } else if (state == WorkInfo.State.RUNNING) {
                    int progress = info.getProgress().getInt("progress", 50);
                    ret.put("status", "TRANSCRIBING");
                    ret.put("progressPercent", progress);
                    ret.put("phaseLabel", "Transcribing speech...");
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
