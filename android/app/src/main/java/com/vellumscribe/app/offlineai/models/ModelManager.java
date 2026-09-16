package com.vellumscribe.app.offlineai.models;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

/**
 * Model Manager for on-device speech models (whisper.cpp)
 * Stored strictly in app-private storage: filesDir/models/whisper/<model-id>/
 */
public class ModelManager {
    private final Context context;

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

    public File getModelFile(String modelId) {
        return new File(getModelsDir(), modelId + ".bin");
    }

    public boolean isModelInstalled(String modelId) {
        File f = getModelFile(modelId);
        return f.exists() && f.length() > 0;
    }

    public boolean verifyChecksum(String modelId, String expectedSha256) {
        File f = getModelFile(modelId);
        if (!f.exists()) return false;

        try (FileInputStream fis = new FileInputStream(f)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
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
}
