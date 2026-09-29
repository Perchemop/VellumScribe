package com.vellumscribe.app.offlineai.whisper;

import java.io.File;
import android.util.Log;

/**
 * whisper.cpp native JNI interface wrapper for on-device inference.
 * Zero network calls, 100% local execution.
 * Fails honestly if native binary or model file is unavailable.
 */
public class WhisperEngine {
    private static final String TAG = "WhisperEngine";
    private static boolean isNativeLibraryLoaded = false;

    static {
        try {
            System.loadLibrary("whisper");
            isNativeLibraryLoaded = true;
            Log.i(TAG, "whisper.cpp native library loaded successfully.");
        } catch (UnsatisfiedLinkError e) {
            isNativeLibraryLoaded = false;
            Log.w(TAG, "whisper.cpp native library not found in APK. Native inference requires compiled libwhisper.so.");
        }
    }

    private long contextPtr = 0;
    private boolean isInitialized = false;

    public static boolean isNativeLibraryAvailable() {
        return isNativeLibraryLoaded;
    }

    /**
     * Probes whether the compiled native library contains an active GGML tensor execution runtime.
     * Prevents misleading capability claims when only a non-inferencing stub is linked.
     */
    public static boolean probeInferenceRuntime() {
        if (!isNativeLibraryLoaded) return false;
        try {
            return nativeHasTensorRuntime();
        } catch (UnsatisfiedLinkError | Exception e) {
            Log.w(TAG, "Native tensor runtime probe failed: " + e.getMessage());
            return false;
        }
    }

    public synchronized boolean initialize(File modelFile) {
        if (!isNativeLibraryLoaded) {
            Log.e(TAG, "Cannot initialize WhisperEngine: native library libwhisper.so is not loaded.");
            this.isInitialized = false;
            return false;
        }

        if (!probeInferenceRuntime()) {
            Log.w(TAG, "Cannot initialize WhisperEngine: native library loaded but tensor execution runtime is unavailable.");
            this.isInitialized = false;
            return false;
        }

        if (modelFile == null || !modelFile.exists() || modelFile.length() == 0) {
            Log.e(TAG, "Cannot initialize WhisperEngine: model file missing or empty.");
            this.isInitialized = false;
            return false;
        }

        try {
            this.contextPtr = nativeInit(modelFile.getAbsolutePath());
            this.isInitialized = (this.contextPtr != 0);
            return this.isInitialized;
        } catch (Exception e) {
            Log.e(TAG, "Native whisper context initialization failed: " + e.getMessage(), e);
            this.contextPtr = 0;
            this.isInitialized = false;
            return false;
        }
    }

    public synchronized String transcribe(float[] pcmData, String language, int nThreads) throws Exception {
        if (!isReady()) {
            throw new IllegalStateException("OFFLINE_AI_ENGINE_NOT_READY: whisper.cpp context is not initialized or tensor runtime is unavailable.");
        }
        if (pcmData == null || pcmData.length == 0) {
            throw new IllegalArgumentException("OFFLINE_AI_AUDIO_INVALID: Empty PCM audio buffer provided.");
        }

        return nativeTranscribe(this.contextPtr, pcmData, language != null ? language : "auto", Math.max(1, nThreads));
    }

    public boolean isReady() {
        return isNativeLibraryLoaded && probeInferenceRuntime() && isInitialized && contextPtr != 0;
    }

    public synchronized void release() {
        if (contextPtr != 0 && isNativeLibraryLoaded) {
            try {
                nativeFree(contextPtr);
            } catch (Exception e) {
                Log.w(TAG, "Error freeing native whisper context", e);
            }
        }
        this.contextPtr = 0;
        this.isInitialized = false;
    }

    // JNI Native declarations for whisper.cpp
    private static native long nativeInit(String modelPath);
    private static native String nativeTranscribe(long contextPtr, float[] pcmData, String language, int nThreads);
    private static native void nativeFree(long contextPtr);
    private static native boolean nativeHasTensorRuntime();
}
