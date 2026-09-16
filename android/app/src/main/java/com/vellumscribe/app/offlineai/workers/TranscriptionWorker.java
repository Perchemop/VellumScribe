package com.vellumscribe.app.offlineai.workers;

import android.content.Context;

/**
 * Durable Android Background Worker for Long Transcriptions.
 * Designed for WorkManager long-running foreground execution with user notification,
 * cancellation, and crash checkpoint recovery.
 */
public class TranscriptionWorker {
    private final Context context;

    public TranscriptionWorker(Context context) {
        this.context = context;
    }

    public static final String KEY_RECORDING_ID = "recording_id";
    public static final String KEY_MODEL_ID = "model_id";
    public static final String KEY_JOB_ID = "job_id";
}
