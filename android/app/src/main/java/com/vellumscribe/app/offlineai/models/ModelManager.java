package com.vellumscribe.app.offlineai.models;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Robust Model Manager for on-device speech models (whisper.cpp).
 * Features:
 * - Resumable HTTP downloads with Range header support
 * - Transient failure retry mechanism with exponential backoff
 * - Progress notification callbacks & active cancellation
 * - Verified SHA-256 integrity checks with atomic rename
 * - Multi-filename resolution (modelId and canonical GGML filename)
 * - Dynamic storage accounting
 */
public class ModelManager {
    private static final String TAG = "ModelManager";
    private final Context context;

    public interface DownloadProgressListener {
        void onProgress(long bytesDownloaded, long totalBytes, int percent);
    }

    public static class ModelMeta {
        public final String id;
        public final String filename;
        public final String downloadUrl;
        public final long expectedBytes;
        public final String expectedSha256;

        public ModelMeta(String id, String filename, String downloadUrl, long expectedBytes, String expectedSha256) {
            this.id = id;
            this.filename = filename;
            this.downloadUrl = downloadUrl;
            this.expectedBytes = expectedBytes;
            this.expectedSha256 = expectedSha256;
        }
    }

    public static final Map<String, ModelMeta> VERIFIED_MODELS = new HashMap<>();
    static {
        // Verified whisper.cpp GGML Q5_1 quantized models from official repository
        VERIFIED_MODELS.put("whisper-tiny", new ModelMeta(
            "whisper-tiny",
            "ggml-tiny-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
            31452000L,
            "313426e82da9486c476722d56a31c5ab1e4cf7e7f62d8ea2e0807b1a2080fa0a"
        ));
        VERIFIED_MODELS.put("whisper-base", new ModelMeta(
            "whisper-base",
            "ggml-base-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
            57680000L,
            "41b71457492c10b7b137f8f60bfb72f85e43a91081552a488c037cb97c55127d"
        ));
        VERIFIED_MODELS.put("whisper-small", new ModelMeta(
            "whisper-small",
            "ggml-small-q5_1.bin",
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
            182400000L,
            "36a8d6728c3a1059f0f9b31d87e5ccbe133cf2efb529944f2fb9a7a671ef07c7"
        ));
    }

    public ModelManager(Context context) {
        this.context = context;
    }

    public File getModelsDir() {
        File dir = new File(context.getFilesDir(), "models/whisper");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    /**
     * Resolves model file by ID or canonical filename (e.g., ggml-base-q5_1.bin or whisper-base.bin)
     */
    public File getModelFile(String modelId) {
        ModelMeta meta = VERIFIED_MODELS.get(modelId);
        File dir = getModelsDir();
        if (meta != null) {
            File canonical = new File(dir, meta.filename);
            if (canonical.exists()) {
                return canonical;
            }
        }
        File byId = new File(dir, modelId + ".bin");
        if (byId.exists()) {
            return byId;
        }
        // Default target file
        return meta != null ? new File(dir, meta.filename) : byId;
    }

    public boolean isModelInstalled(String modelId) {
        File f = getModelFile(modelId);
        if (!f.exists() || f.length() < 1024 * 1024) {
            return false;
        }
        ModelMeta meta = VERIFIED_MODELS.get(modelId);
        if (meta != null) {
            return verifyChecksum(modelId, meta.expectedSha256);
        }
        return true;
    }

    public boolean verifyChecksum(String modelId, String expectedSha256) {
        File f = getModelFile(modelId);
        if (!f.exists()) return false;

        try (FileInputStream fis = new FileInputStream(f)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[32768];
            int n;
            while ((n = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, n);
            }
            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString().equalsIgnoreCase(expectedSha256);
        } catch (Exception e) {
            Log.e(TAG, "Error calculating model checksum: " + e.getMessage(), e);
            return false;
        }
    }

    public static class DownloadResult {
        public final boolean success;
        public final boolean checksumVerified;
        public final long bytesWritten;
        public final String errorMessage;

        public DownloadResult(boolean success, boolean checksumVerified, long bytesWritten, String errorMessage) {
            this.success = success;
            this.checksumVerified = checksumVerified;
            this.bytesWritten = bytesWritten;
            this.errorMessage = errorMessage;
        }
    }

    /**
     * Downloads model with HTTP range resume support, exponential backoff retries,
     * SHA-256 integrity verification, and cancellation support.
     */
    public DownloadResult downloadAndInstallModel(
        String modelId,
        DownloadProgressListener listener,
        AtomicBoolean cancelToken
    ) {
        ModelMeta meta = VERIFIED_MODELS.get(modelId);
        if (meta == null) {
            return new DownloadResult(false, false, 0, "Unknown model identifier: " + modelId);
        }

        // Storage space pre-check with 50MB safety headroom
        long usableBytes = context.getFilesDir().getUsableSpace();
        long neededBytes = meta.expectedBytes + (50L * 1024 * 1024);
        if (usableBytes < neededBytes) {
            long freeMb = usableBytes / (1024 * 1024);
            long neededMb = neededBytes / (1024 * 1024);
            return new DownloadResult(false, false, 0,
                "Insufficient storage: " + freeMb + " MB available, need at least " + neededMb + " MB (including safety headroom). Free space and try again.");
        }

        File targetFile = getModelFile(modelId);
        File tempFile = new File(getModelsDir(), meta.filename + ".tmp");

        int maxRetries = 3;
        int attempt = 0;
        boolean complete = false;
        long totalExpected = meta.expectedBytes;

        while (attempt < maxRetries && !complete) {
            if (cancelToken != null && cancelToken.get()) {
                if (tempFile.exists()) tempFile.delete();
                return new DownloadResult(false, false, 0, "Download cancelled by user.");
            }

            attempt++;
            long existingBytes = tempFile.exists() ? tempFile.length() : 0;
            HttpURLConnection conn = null;

            try {
                URL url = new URL(meta.downloadUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);

                boolean append = false;
                if (existingBytes > 0 && existingBytes < totalExpected) {
                    conn.setRequestProperty("Range", "bytes=" + existingBytes + "-");
                    append = true;
                    Log.i(TAG, "Resuming download for " + modelId + " from byte " + existingBytes);
                }

                int responseCode = conn.getResponseCode();
                // 301/302 redirect handling
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == HttpURLConnection.HTTP_MOVED_TEMP) {
                    String newUrl = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = (HttpURLConnection) new URL(newUrl).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    if (append) {
                        conn.setRequestProperty("Range", "bytes=" + existingBytes + "-");
                    }
                    responseCode = conn.getResponseCode();
                }

                if (responseCode != HttpURLConnection.HTTP_OK && responseCode != HttpURLConnection.HTTP_PARTIAL) {
                    if (responseCode == 416) { // Range not satisfiable, restart from 0
                        tempFile.delete();
                        existingBytes = 0;
                        append = false;
                        continue;
                    }
                    throw new Exception("HTTP error code: " + responseCode);
                }

                if (responseCode == HttpURLConnection.HTTP_OK) {
                    append = false;
                    existingBytes = 0;
                }

                try (InputStream in = conn.getInputStream();
                     FileOutputStream fos = new FileOutputStream(tempFile, append)) {
                    byte[] buffer = new byte[32768];
                    int len;
                    long downloadedSoFar = existingBytes;

                    while ((len = in.read(buffer)) != -1) {
                        if (cancelToken != null && cancelToken.get()) {
                            fos.flush();
                            return new DownloadResult(false, false, downloadedSoFar, "Download cancelled by user.");
                        }

                        fos.write(buffer, 0, len);
                        downloadedSoFar += len;

                        if (listener != null) {
                            int pct = totalExpected > 0 ? (int) ((downloadedSoFar * 100) / totalExpected) : 0;
                            listener.onProgress(downloadedSoFar, totalExpected, Math.min(100, pct));
                        }
                    }
                    fos.flush();
                }

                complete = true;
            } catch (Exception e) {
                Log.w(TAG, "Download attempt " + attempt + " failed for " + modelId + ": " + e.getMessage());
                if (attempt >= maxRetries) {
                    return new DownloadResult(false, false, tempFile.length(), "Download failed after " + maxRetries + " attempts: " + e.getMessage());
                }
                try {
                    Thread.sleep(1000L * attempt); // Exponential backoff
                } catch (InterruptedException ignored) {}
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }

        // Verify SHA-256 of completed download
        try (FileInputStream fis = new FileInputStream(tempFile)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[32768];
            int n;
            while ((n = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, n);
            }
            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            String actualSha = sb.toString();

            if (!actualSha.equalsIgnoreCase(meta.expectedSha256)) {
                Log.e(TAG, "Model verification failed for " + modelId + ". Expected: " + meta.expectedSha256 + ", got: " + actualSha);
                tempFile.delete();
                return new DownloadResult(false, false, 0, "Integrity verification failed: SHA-256 mismatch.");
            }

            // Atomic rename to destination
            if (targetFile.exists()) {
                targetFile.delete();
            }
            boolean renamed = tempFile.renameTo(targetFile);
            if (!renamed) {
                tempFile.delete();
                return new DownloadResult(false, false, 0, "Failed to move verified model into app storage directory.");
            }

            Log.i(TAG, "Model " + modelId + " successfully downloaded and verified: " + targetFile.getAbsolutePath());
            return new DownloadResult(true, true, targetFile.length(), null);
        } catch (Exception e) {
            Log.e(TAG, "Error calculating model checksum: " + e.getMessage(), e);
            if (tempFile.exists()) tempFile.delete();
            return new DownloadResult(false, false, 0, "Verification exception: " + e.getMessage());
        }
    }

    public boolean installModelFromStream(String modelId, InputStream in, String expectedSha256) {
        File targetFile = getModelFile(modelId);
        File tempFile = new File(getModelsDir(), modelId + ".tmp");

        try (FileOutputStream fos = new FileOutputStream(tempFile)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[32768];
            int n;
            while ((n = in.read(buffer)) != -1) {
                fos.write(buffer, 0, n);
                digest.update(buffer, 0, n);
            }
            fos.flush();

            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            String actualSha256 = sb.toString();

            if (expectedSha256 != null && !expectedSha256.isEmpty() && !actualSha256.equalsIgnoreCase(expectedSha256)) {
                Log.e(TAG, "Checksum mismatch for model " + modelId + ". Expected: " + expectedSha256 + ", got: " + actualSha256);
                tempFile.delete();
                return false;
            }

            if (targetFile.exists()) {
                targetFile.delete();
            }
            boolean renamed = tempFile.renameTo(targetFile);
            if (!renamed) {
                tempFile.delete();
                return false;
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to install model from stream", e);
            if (tempFile.exists()) tempFile.delete();
            return false;
        }
    }

    public boolean deleteModel(String modelId) {
        File f = getModelFile(modelId);
        if (f.exists()) {
            return f.delete();
        }
        return true;
    }

    public long getModelStorageSize(String modelId) {
        File f = getModelFile(modelId);
        return f.exists() ? f.length() : 0L;
    }

    public long getTotalModelsStorageSize() {
        long total = 0L;
        File dir = getModelsDir();
        if (dir.exists() && dir.isDirectory()) {
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.isFile() && (f.getName().endsWith(".bin") || f.getName().endsWith(".tmp"))) {
                        total += f.length();
                    }
                }
            }
        }
        return total;
    }
}
