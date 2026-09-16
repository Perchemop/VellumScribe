package com.vellumscribe.app.offlineai.whisper;

import java.io.File;

/**
 * whisper.cpp native interface wrapper for on-device inference.
 * Zero network calls, local execution only.
 */
public class WhisperEngine {
    private boolean isInitialized = false;

    public boolean initialize(File modelFile) {
        if (modelFile == null || !modelFile.exists()) {
            return false;
        }
        // Native library initialization hook (e.g. System.loadLibrary("whisper"))
        this.isInitialized = true;
        return true;
    }

    public boolean isReady() {
        return isInitialized;
    }

    public void release() {
        this.isInitialized = false;
    }
}
