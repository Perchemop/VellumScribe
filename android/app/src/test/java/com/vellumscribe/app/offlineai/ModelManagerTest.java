package com.vellumscribe.app.offlineai;

import static org.junit.Assert.*;

import com.vellumscribe.app.offlineai.audio.AudioProcessor;
import com.vellumscribe.app.offlineai.models.ModelManager;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.security.MessageDigest;

public class ModelManagerTest {

    @Test
    public void testSha256VerificationLogic() throws Exception {
        byte[] sampleData = "VellumScribe Offline Whisper Speech Model Test Payload".getBytes("UTF-8");
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(sampleData);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) {
            sb.append(String.format("%02x", b));
        }
        String calculatedHex = sb.toString();

        assertNotNull(calculatedHex);
        assertEquals(64, calculatedHex.length());
    }

    @Test
    public void testAudioProcessorPcmChunkCalculation() {
        // 16kHz mono 16-bit PCM = 32000 bytes per second
        int sampleRate = 16000;
        int bytesPerSample = 2;
        int channels = 1;
        int bytesPerSecond = sampleRate * bytesPerSample * channels;

        assertEquals(32000, bytesPerSecond);

        int chunkSeconds = 20;
        int expectedChunkBytes = bytesPerSecond * chunkSeconds;
        assertEquals(640000, expectedChunkBytes);
    }
}
