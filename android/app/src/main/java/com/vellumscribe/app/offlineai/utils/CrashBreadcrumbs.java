package com.vellumscribe.app.offlineai.utils;

import android.content.Context;
import android.util.Log;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Append-only breadcrumb log that survives hard process death.
 *
 * Native crashes (SIGSEGV in libwhisper, OOM killer, WebView renderer death)
 * cannot be caught in Java or JS, but these lines are flushed to disk after
 * every stage. {@code OfflineAiPlugin.getTranscriptionBreadcrumbs} hands the
 * file back to the WebView so it can be surfaced through AppLogger and the
 * existing "Export logs (JSON)" diagnostics — the client can share the exact
 * last stage without a developer environment.
 */
public final class CrashBreadcrumbs {
    private static final String TAG = "CrashBreadcrumbs";
    private static final String FILE_NAME = "transcription_breadcrumbs.txt";
    /** Keep the file small: drop the oldest entries when it exceeds this size. */
    private static final long MAX_BYTES = 16 * 1024;

    private CrashBreadcrumbs() {}

    /** Appends one timestamped line. Never throws. */
    public static synchronized void write(Context context, String stage, String detail) {
        if (context == null) return;
        try {
            String stamp = stamp();
            String line = stamp + " | " + stage
                + (detail != null && !detail.isEmpty()
                ? " | " + detail.replace('\n', ' ')
                : "")
                + "\n";

            try (BufferedWriter w = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(file(context), true), StandardCharsets.UTF_8))) {
                w.write(line);
                w.flush();
            }
            trimIfNeeded(context);
        } catch (Exception e) {
            Log.w(TAG, "Failed to write breadcrumb: " + stage, e);
        }
    }

    /** Clears the file at the start of each new transcription job. */
    public static synchronized void clear(Context context) {
        try {
            File f = file(context);
            if (f.exists()) {
                new FileOutputStream(f, false).close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to clear breadcrumbs", e);
        }
    }

    /** Returns the full trail, or null when none exists (never throws). */
    public static synchronized String read(Context context) {
        if (context == null) return null;
        File f = file(context);
        if (!f.exists() || f.length() == 0) return null;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
            new FileInputStream(f), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            Log.w(TAG, "Failed to read breadcrumbs", e);
            return null;
        }
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }

    private static String stamp() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd-HHmmss.SSS", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    /** Best-effort: rewrite the file dropping the oldest half on overflow. */
    private static void trimIfNeeded(Context context) {
        try {
            File f = file(context);
            if (f.length() <= MAX_BYTES) return;
            String all = read(context);
            if (all == null) return;
            String[] lines = all.split("\n");
            int keep = lines.length / 2;
            StringBuilder sb = new StringBuilder();
            for (int i = keep; i < lines.length; i++) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(lines[i]);
            }
            try (BufferedWriter w = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(f, false), StandardCharsets.UTF_8))) {
                w.write(sb.toString());
                w.flush();
            }
        } catch (Exception ignored) {
            // Trimming is best-effort; the original trail stays intact on failure.
        }
    }
}
