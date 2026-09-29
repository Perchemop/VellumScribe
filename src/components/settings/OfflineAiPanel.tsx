import React, { useState, useEffect } from 'react';
import { Cpu, Download, Trash2, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { OfflineAi, VERIFIED_SPEECH_MODELS } from '../../plugins/offline-ai';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { AiCapabilities, SpeechModelProfile } from '../../types';
import { AppLogger } from '../../lib/logger';

interface OfflineAiPanelProps {
  onOpenModelInstallModal?: () => void;
}

export const OfflineAiPanel: React.FC<OfflineAiPanelProps> = () => {
  const [caps, setCaps] = useState<AiCapabilities | null>(null);
  const [models, setModels] = useState<SpeechModelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [storageBreakdown, setStorageBreakdown] = useState<{
    modelsBytes: number;
    recordingsBytes: number;
    transcriptsBytes: number;
    totalBytes: number;
  }>({
    modelsBytes: 0,
    recordingsBytes: 0,
    transcriptsBytes: 0,
    totalBytes: 0,
  });
  const [preferBattery, setPreferBattery] = useState<boolean>(() => {
    return localStorage.getItem('vellum_prefer_battery_transcription') === 'true';
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const capabilities = await OfflineAi.getCapabilities();
      setCaps(capabilities);

      const installed = await OfflineAiManager.getInstance().listSpeechModels();
      const installedMap = new Map<string, SpeechModelProfile>(installed.map((m) => [m.id, m]));

      const fullList: SpeechModelProfile[] = VERIFIED_SPEECH_MODELS.map((model) => {
        const inst = installedMap.get(model.id);
        return {
          ...model,
          installed: !!inst?.installed,
          installedSizeBytes: inst?.installedSizeBytes,
        };
      });
      setModels(fullList);

      const storage = await OfflineAiManager.getInstance().getStorageBreakdown();
      setStorageBreakdown(storage);
    } catch (err: any) {
      AppLogger.warn('OfflineAiPanel', 'Failed to load offline AI status', err);
      setErrorMessage(err.message || 'Could not query on-device AI capabilities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleBatteryPreference = (enabled: boolean) => {
    setPreferBattery(enabled);
    localStorage.setItem('vellum_prefer_battery_transcription', enabled ? 'true' : 'false');
  };

  const handleDownloadModel = async (model: SpeechModelProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const availableStorageMb = caps?.availableStorageMb ?? caps?.freeSpaceMb ?? 0;
    const modelBytes = model.downloadBytes || 30 * 1024 * 1024;
    const neededMb = Math.ceil(modelBytes / (1024 * 1024)) + 50;

    if (availableStorageMb > 0 && availableStorageMb < neededMb) {
      setErrorMessage(`Not enough free storage (${availableStorageMb} MB available, need ~${neededMb} MB including safety headroom). Free up disk space and try again.`);
      return;
    }

    setDownloadingModelId(model.id);
    setDownloadProgress(25);

    try {
      const res = await OfflineAiManager.getInstance().installModel(model.id);
      if (!res.installed) {
        throw new Error(res.error || 'Model installation could not be completed.');
      }
      setSuccessMessage(`Successfully installed ${model.displayName}! Speech transcription is now available offline.`);
      await loadData();
    } catch (err: any) {
      AppLogger.error('OfflineAiPanel', `Failed to install model ${model.id}`, err);
      setErrorMessage(err.message || 'Failed to download and verify speech model.');
    } finally {
      setDownloadingModelId(null);
      setDownloadProgress(0);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Remove this offline speech model from your device? You will need to download it again to transcribe offline.')) {
      return;
    }
    try {
      await OfflineAi.deleteSpeechModel({ modelId });
      setSuccessMessage('Model removed from device.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove speech model.');
    }
  };

  const handleCleanTemporary = async () => {
    try {
      await OfflineAiManager.getInstance().cleanTemporaryFiles();
      const freshStorage = await OfflineAiManager.getInstance().getStorageBreakdown();
      setStorageBreakdown(freshStorage);
      setSuccessMessage('Temporary audio transcription cache cleared.');
    } catch {
      setErrorMessage('Could not clean temporary transcription cache.');
    }
  };

  const formatMb = (bytes: number | null | undefined) => (((bytes || 0) / (1024 * 1024)).toFixed(1));

  const isLibraryLoaded = Boolean(caps?.nativeLibraryLoaded);
  const isInferenceReady = Boolean(caps?.inferenceRuntimeReady);
  const freeStorageMb = caps?.availableStorageMb ?? (caps as any)?.freeSpaceMb ?? 0;

  if (loading && !caps) {
    return (
      <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
        <p className="text-sm">Querying on-device AI capabilities...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header status card */}
      <div className="p-5 rounded-2xl bg-zinc-900/40 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isInferenceReady ? 'bg-emerald-500/10 text-emerald-500' : isLibraryLoaded ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-800 text-zinc-400'}`}>
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                On-Device Speech-to-Text (Whisper)
                {isInferenceReady ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Engine Ready
                  </span>
                ) : isLibraryLoaded ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Native Linked (Tensor Pending)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                    Unavailable on Web
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {isInferenceReady
                  ? 'High-performance offline audio transcription powered by vendored whisper.cpp.'
                  : isLibraryLoaded
                  ? 'Native library libwhisper.so is linked. Full GGML tensor engine execution is being compiled.'
                  : 'On-device Whisper requires the Android native APK build. Web environment supports real-time live microphone dictation.'}
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* System telemetry pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/80 text-xs">
          <div>
            <span className="text-zinc-400 block">Native Library</span>
            <span className="font-medium text-zinc-200">{isLibraryLoaded ? '✓ Loaded' : 'Not Loaded'}</span>
          </div>
          <div>
            <span className="text-zinc-400 block">Tensor Runtime</span>
            <span className="font-medium text-zinc-200">{isInferenceReady ? '✓ Active' : 'Pending GGML'}</span>
          </div>
          <div>
            <span className="text-zinc-400 block">Free Storage</span>
            <span className="font-mono font-medium text-zinc-200">{freeStorageMb} MB</span>
          </div>
          <div>
            <span className="text-zinc-400 block">Models Footprint</span>
            <span className="font-mono font-medium text-zinc-200">{formatMb(storageBreakdown.modelsBytes)} MB</span>
          </div>
          <div>
            <span className="text-zinc-400 block">Transcripts &amp; Audio</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-zinc-200">{formatMb(storageBreakdown.recordingsBytes + storageBreakdown.transcriptsBytes)} MB</span>
              {(storageBreakdown.recordingsBytes + storageBreakdown.transcriptsBytes) > 0 && (
                <button
                  onClick={handleCleanTemporary}
                  className="text-amber-500 hover:underline"
                  title="Purge temporary audio cache"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Battery-Aware Preference Switch */}
      <div className="p-4 rounded-xl bg-zinc-900/30 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Prefer Battery Over Speed</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Clamps Whisper transcription to 1 background thread to prevent thermal heating and minimize battery drain.
            </div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={preferBattery}
            onChange={(e) => handleToggleBatteryPreference(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* Informational Callout when tensor runtime is pending (T-P1.4 / T-P0.2) */}
      {!isInferenceReady && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-200">Offline Whisper Tensor Runtime Status</div>
            <p className="text-zinc-400 dark:text-zinc-300">
              {isLibraryLoaded
                ? 'The native libwhisper.so library is linked, but the full GGML tensor inference runtime is not compiled into this binary. Model downloads are disabled to prevent downloading models that cannot yet run.'
                : 'Offline Whisper model inference requires the Android native APK build with compiled GGML tensor support.'}
              {' '}Real-time offline microphone dictation (live speech recognition) and Cloud Gemini AI remain fully functional.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Models List */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <span>Available Quantized Speech Models</span>
          <span className="text-xs text-zinc-500 font-normal">Quantized Q5_1 GGML</span>
        </h4>

        <div className="grid gap-3">
          {models.map((model) => {
            const isInstalled = !!model.installed;
            const isDownloading = downloadingModelId === model.id;

            return (
              <div
                key={model.id}
                className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-100 text-sm">{model.displayName}</span>
                    {isInstalled && (
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 max-w-xl">{model.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 pt-1">
                    <span>Size: ~{formatMb(model.downloadBytes)} MB</span>
                    <span>•</span>
                    <span>Min RAM: {model.minimumRamMb} MB</span>
                    <span>•</span>
                    <span className="capitalize">Speed: {model.accuracyClass}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isDownloading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 font-mono">{downloadProgress}%</span>
                    </div>
                  ) : isInstalled ? (
                    <button
                      onClick={() => handleDeleteModel(model.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownloadModel(model)}
                      disabled={!isInferenceReady || downloadingModelId !== null}
                      title={!isInferenceReady ? 'Requires compiled GGML tensor inference engine' : undefined}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download ({formatMb(model.downloadBytes)} MB)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
