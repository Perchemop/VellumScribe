import re

with open('src/lib/audioRecorder.ts', 'r') as f:
    content = f.read()

# Fix startRecording
content = re.sub(
    r"\} catch \(err\) \{\s*console\.warn\('Microphone stream access unavailable; using software audio container\.', err\);\s*this\.isRecording = true;\s*this\.startTime = Date\.now\(\);\s*return true;\s*\}",
    """} catch (err) {
      console.error('Microphone stream access unavailable.', err);
      return false;
    }""",
    content
)

# Fix stopRecording fake blob 1
content = re.sub(
    r"const syntheticBlob = new Blob\(\['RIFF\.\.\.\.WAVEfmt\.\.\.\.data\.\.\.\.'\], \{ type: 'audio/mp4' \}\);\s*resolve\(\{\s*blob: syntheticBlob,\s*base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',\s*durationSeconds,\s*fileSizeBytes: estimatedAacSize,\s*mimeType: 'audio/mp4',\s*\}\);",
    """resolve({
            blob: new Blob([]),
            base64: '',
            durationSeconds: 0,
            fileSizeBytes: 0,
            mimeType: 'audio/mp4',
          });""",
    content
)

with open('src/lib/audioRecorder.ts', 'w') as f:
    f.write(content)
