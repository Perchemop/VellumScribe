package com.vellumscribe.app.offlineai;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.vellumscribe.app.offlineai.models.ModelManager;
import com.vellumscribe.app.offlineai.audio.AudioProcessor;
import com.vellumscribe.app.offlineai.whisper.WhisperEngine;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;

@RunWith(AndroidJUnit4.class)
public class OfflineAiIntegrationTest {

    private Context context;
    private ModelManager modelManager;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        modelManager = new ModelManager(context);
    }

    @Test
    public void testModelDirectoryCreationAndManifest() {
        assertNotNull(modelManager);
        File baseDir = modelManager.getModelsDir();
        assertNotNull(baseDir);
        assertTrue(baseDir.exists() || baseDir.mkdirs());

        var profiles = modelManager.listProfiles();
        assertNotNull(profiles);
        assertTrue(profiles.size() >= 3);

        boolean hasBase = false;
        for (var p : profiles) {
            if ("whisper-base".equals(p.id)) {
                hasBase = true;
                assertEquals("ggml-base-q5_1.bin", p.fileName);
                assertEquals(64, p.sha256.length());
            }
        }
        assertTrue("Whisper Base profile must be present in manifest", hasBase);
    }

    @Test
    public void testAudioProcessorTemporaryDirectory() {
        AudioProcessor processor = new AudioProcessor(context);
        assertNotNull(processor);

        File cacheDir = new File(context.getCacheDir(), "audio_processing");
        assertTrue(cacheDir.exists() || cacheDir.mkdirs());
        assertTrue(cacheDir.isDirectory());
    }

    @Test
    public void testWhisperEngineInstanceCreation() {
        WhisperEngine engine = new WhisperEngine();
        assertNotNull(engine);
        // Engine starts in uninitialized state
        assertFalse(engine.isLoaded());
    }
}
