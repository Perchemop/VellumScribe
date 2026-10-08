#!/usr/bin/env python3
"""Patch NoteEditorChrome, AudioRecordingManager, NoteEditorWriteFirst for upload-to-transcribe."""
from pathlib import Path
import re

def patch_chrome():
    p = Path('src/components/NoteEditorChrome.tsx')
    c = p.read_text()
    c2 = re.sub(
        r'\n\s*/\* Quick Voice memo[\s\S]*?id="note-voice-quick-btn"[\s\S]*?</button>\n',
        '\n',
        c,
        count=1,
    )
    c = c2
    if 'Upload' not in c.split("from 'lucide-react'")[0]:
        c = c.replace('  Camera,\n', '  Camera,\n  Upload,\n', 1)
    if 'note-upload-audio-btn' not in c:
        marker = '<span>Voice memo / recording</span>'
        if marker not in c:
            marker = '<span>Voice memo</span>'
        # Find the button containing marker and insert after its closing button
        idx = c.find(marker)
        if idx < 0:
            print('chrome: voice marker not found')
            return False
        end = c.find('</button>', idx)
        if end < 0:
            return False
        end += len('</button>')
        upload = '''
              <button
                type="button"
                id="note-upload-audio-btn"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                onClick={() => {
                  setShowAttachSheet(false);
                  try {
                    (window as any).__vellumScribePickAudio?.();
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <Upload className="w-5 h-5 text-zinc-500" />
                <span>Upload audio to transcribe</span>
              </button>'''
        c = c[:end] + upload + c[end:]
    p.write_text(c)
    print('chrome ok', 'note-upload-audio-btn' in c, 'note-voice-quick-btn' not in c)
    return True

def patch_manager():
    p = Path('src/services/AudioRecordingManager.ts')
    t = p.read_text()
    if 'importAudioFile' in t:
        print('manager already has importAudioFile')
        return True
    method = '''
  /**
   * Import a pre-recorded audio file and persist as a Recording for transcription.
   */
  public async importAudioFile(
    noteId: number,
    file: File | Blob,
    originalName?: string,
    onProgress?: (percent: number, status: string) => void
  ): Promise<RecordedAudioResult> {
    onProgress?.(5, 'Reading audio file…');
    const mimeType = (file as File).type || 'audio/mpeg';
    let finalBlob: Blob = file;
    let wasConverted = false;
    let pcmWavBlob: Blob | undefined;

    try {
      onProgress?.(20, 'Converting to 16kHz mono WAV…');
      pcmWavBlob = await this.convertTo16kHzMonoWavAsync(file, (pct) => {
        onProgress?.(20 + Math.round(pct * 0.4), 'Encoding speech audio…');
      });
      if (pcmWavBlob && pcmWavBlob.size > 0) {
        finalBlob = pcmWavBlob;
        wasConverted = true;
      }
    } catch (e) {
      AppLogger.warn('AudioRecordingManager', 'Import WAV conversion fallback', e);
    }

    onProgress?.(70, 'Computing checksum…');
    const arrayBuffer = await finalBlob.arrayBuffer();
    const checksum = await this.calculateSha256(arrayBuffer);
    const base64 = await this.blobToBase64(finalBlob);

    let durationSeconds = 1;
    let durationMs = 1000;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        durationSeconds = Math.max(1, Math.round(decoded.duration));
        durationMs = Math.round(decoded.duration * 1000);
        await ctx.close();
      }
    } catch {
      /* defaults */
    }

    onProgress?.(85, 'Saving to on-device storage…');
    const nameHint = originalName || (file as File).name || 'audio';
    const ext = wasConverted ? 'wav' : (nameHint.split('.').pop() || 'bin');
    const mediaKey = `${generatePrefixedId('imp')}.${ext}`;
    const fileName = nameHint.includes('.') ? nameHint : `import_${Date.now()}.${ext}`;
    await MediaRepository.saveBinary(mediaKey, finalBlob, finalBlob.type || mimeType, noteId);

    const recording = RecordingRepository.save({
      note_id: noteId,
      file_path: fileName,
      media_key: mediaKey,
      duration_seconds: durationSeconds,
      duration_ms: durationMs,
      file_size: finalBlob.size,
      sample_rate: wasConverted ? 16000 : undefined,
      channels: wasConverted ? 1 : undefined,
      checksum,
      mime_type: finalBlob.type || mimeType,
      status: 'ready',
    });

    onProgress?.(100, 'Import complete');
    return {
      recording,
      blob: finalBlob,
      base64,
      durationSeconds,
      durationMs,
      fileSizeBytes: finalBlob.size,
      mimeType: finalBlob.type || mimeType,
      checksum,
      wavBlob: pcmWavBlob,
      wasConverted,
    };
  }

'''
    marker = '  private cleanup(): void {'
    if marker not in t:
        print('manager: cleanup marker missing')
        return False
    t = t.replace(marker, method + marker, 1)
    p.write_text(t)
    print('manager ok')
    return True

def patch_editor():
    p = Path('src/components/NoteEditorWriteFirst.tsx')
    n = p.read_text()
    if "from '../services/AudioRecordingManager'" not in n:
        n = n.replace(
            "import { StorageManager } from '../lib/storage';",
            "import { StorageManager } from '../lib/storage';\nimport { AudioRecordingManager } from '../services/AudioRecordingManager';\nimport { TranscriptionOrchestrator } from '../services/TranscriptionOrchestrator';",
            1,
        )
    if 'audioFileInputRef' not in n:
        n = n.replace(
            '  const debounceTimerRef = useRef<number | null>(null);',
            '''  const debounceTimerRef = useRef<number | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportingAudio, setIsImportingAudio] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);''',
            1,
        )
    if 'handleUploadAudioFile' not in n:
        helper = '''
  const handleUploadAudioFile = async (file: File) => {
    if (!file) return;
    setIsImportingAudio(true);
    setImportStatus('Importing audio…');
    try {
      const mgr = new AudioRecordingManager();
      const result = await mgr.importAudioFile(note.id, file, file.name, (pct, status) => {
        setImportStatus(status || `Importing… ${pct}%`);
      });
      refreshRecordings();
      if (result.recording) {
        setImportStatus('Transcribing…');
        const policy = PrivacyManager.isNetworkAllowed() ? 'local_first' : 'offline_only';
        try {
          const tr = await TranscriptionOrchestrator.getInstance().orchestrate(
            {
              recordingId: result.recording.id,
              noteId: note.id,
              audioBlob: result.blob,
              mediaKey: result.recording.media_key,
              mimeType: result.mimeType,
              durationSeconds: result.durationSeconds,
            },
            {
              policy,
              onProgress: (p) => setImportStatus(p.status || `Transcribing… ${p.percent}%`),
            }
          );
          if (tr?.transcript) {
            const newBody = body ? `${body}\n\n${tr.transcript}` : tr.transcript;
            setBody(newBody);
            persistText(title, newBody);
          }
        } catch (txErr: any) {
          setImportStatus(txErr?.message || 'Transcription failed — recording was saved.');
          setShowRecoverySheet(true);
        }
      }
      const refreshed = StorageManager.getNoteById(note.id);
      if (refreshed) onNoteUpdated(refreshed);
      refreshRecordings();
      setImportStatus(null);
    } catch (e: any) {
      setImportStatus(e?.message || 'Could not import audio file');
    } finally {
      setIsImportingAudio(false);
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  useEffect(() => {
    (window as any).__vellumScribePickAudio = () => {
      audioFileInputRef.current?.click();
    };
    return () => {
      try {
        delete (window as any).__vellumScribePickAudio;
      } catch {
        /* ignore */
      }
    };
  }, []);

'''
        n = n.replace('  const refreshRecordings = () => {\n', helper + '  const refreshRecordings = () => {\n', 1)
    if 'note-audio-file-input' not in n:
        needle = 'className="h-full flex flex-col bg-white dark:bg-[#0c0c0e] overflow-hidden select-text relative"\n    >'
        inject = needle + '''
      <input
        id="note-audio-file-input"
        ref={audioFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAudioFile(f);
        }}
      />
      {importStatus && (
        <div role="status" className="px-4 py-2 text-xs bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 shrink-0">
          {importStatus}
        </div>
      )}'''
        if needle in n:
            n = n.replace(needle, inject, 1)
        else:
            print('editor: container needle missing')
    p.write_text(n)
    print('editor ok', 'handleUploadAudioFile' in n)
    return True

if __name__ == '__main__':
    ok = all([patch_chrome(), patch_manager(), patch_editor()])
    raise SystemExit(0 if ok else 1)
