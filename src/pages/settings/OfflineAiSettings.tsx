import React, { useState, useEffect } from 'react';
import {
  Mic,
  Cpu,
  HardDrive,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Shield,
  WifiOff,
  Sparkles,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { OfflineAiManager, StorageBreakdown } from '../../services/OfflineAiManager';
import { SpeechModelProfile, AiCapabilities } from '../../types';

export const OfflineAiSettings: React.FC = () => {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [models, setModels] = useState<SpeechModelProfile[]>([]);
  const [storage, setStorage] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [installingModelId, setInstallingModelId] = useState<string | null>(null);

  // User preferences
  const [speechRecognitionEnabled, setSpeechRecognitionEnabled] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [speakerDetection, setSpeakerDetection] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [threadCount, setThreadCount] = useState(4);
  const [vadSensitivity, setVadSensitivity] = useState('medium');
  const [chunkDurationSec, setChunkDurationSec] = useState(20);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const mgr = OfflineAiManager.getInstance();
    const [caps, modelList, storageData] = await Promise.all([
      mgr.getDeviceCapabilities(),
      mgr.listSpeechModels(),
      mgr.getStorageBreakdown(),
    ]);
    setCapabilities(caps);
    setModels(modelList);
    setStorage(storageData);
    setLoading(false);
  };

  const handleInstallModel = async (modelId: string) => {
    setInstallingModelId(modelId);
    setActionFeedback(null);
    try {
      const res = await OfflineAiManager.getInstance().installModel(modelId);
      if (res.installed) {
        setActionFeedback(`Model '${modelId}' installed and SHA-256 verified successfully.`);
      } else {
        setActionFeedback(`Installation failed: ${res.error}`);
      }
      await loadData();
    } catch (err: any) {
      setActionFeedback(`Error installing model: ${err?.message}`);
    } finally {
      setInstallingModelId(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await OfflineAiManager.getInstance().deleteModel(modelId);
      setActionFeedback(`Model '${modelId}' removed.`);
      await loadData();
    } catch (err: any) {
      setActionFeedback(`Error deleting model: ${err?.message}`);
    }
  };

  const handleCleanTemporary = async () => {
    await OfflineAiManager.getInstance().cleanTemporaryFiles();
    const freshStorage = await OfflineAiManager.getInstance().getStorageBreakdown();
    setStorage(freshStorage);
    setActionFeedback('Temporary transcription cache cleaned.');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div id="offline-ai-settings-container" className="space-y-6 text-stone-800 dark:text-stone-200">
      {/* 1. Offline AI Status Header (Section 28) */}
      <div
        id="offline-ai-status-card"
        className={`p-5 rounded-2xl border ${
          capabilities?.isNativeEngineAvailable
            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
            : 'bg-stone-50 dark:bg-stone-900/60 border-stone-200 dark:border-stone-800'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <WifiOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                On-Device Speech Recognition
                {capabilities?.isNativeEngineAvailable ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-medium">
                    Native Android Active
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300 font-medium">
                    Android APK Target
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {capabilities?.isNativeEngineAvailable
                  ? 'Audio stays on your device. Zero cloud dependency, native whisper.cpp execution.'
                  : 'Native C++ whisper engine is compiled in the Android build. In web browser preview, offline transcription fails honestly without fabricating text.'}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {capabilities?.isNativeEngineAvailable ? 'Native Engine Ready' : 'Architecture Configured'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-stone-200 dark:border-stone-800">
          <div>
            <span className="text-stone-500 dark:text-stone-400 block">Speech Engine</span>
            <strong className="text-stone-900 dark:text-stone-100">whisper.cpp (NDK/FOSS)</strong>
          </div>
          <div>
            <span className="text-stone-500 dark:text-stone-400 block">Runtime Target</span>
            <strong className="text-stone-900 dark:text-stone-100">
              {capabilities?.isNativeEngineAvailable ? 'Android JNI' : 'Android App Container'}
            </strong>
          </div>
          <div>
            <span className="text-stone-500 dark:text-stone-400 block">Network Policy</span>
            <strong className="text-stone-900 dark:text-stone-100">Zero Fabricated Transcripts</strong>
          </div>
          <div>
            <span className="text-stone-500 dark:text-stone-400 block">Checkpointing</span>
            <strong className="text-stone-900 dark:text-stone-100">Durable SQLite</strong>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div
          id="offline-ai-feedback-banner"
          className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* 2. Device Capability Detection (Section 7 & 8) */}
      {capabilities && (
        <div
          id="device-capabilities-card"
          className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-2"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-stone-600 dark:text-stone-300" />
            Device Hardware Profile
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-stone-500 block">Available RAM</span>
              <strong className="text-stone-800 dark:text-stone-200">
                {capabilities.availableRamMb ? `${capabilities.availableRamMb} MB` : 'Available'}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block">CPU Cores</span>
              <strong className="text-stone-800 dark:text-stone-200">
                {capabilities.cpuCores ? `${capabilities.cpuCores} cores` : 'Multi-core'}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block">Storage</span>
              <strong className="text-stone-800 dark:text-stone-200">
                {capabilities.availableStorageMb ? `${capabilities.availableStorageMb} MB free` : 'Available'}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block">Recommended</span>
              <strong className="text-emerald-600 dark:text-emerald-400 capitalize">
                {capabilities.recommendedModelId.replace('-', ' ')}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 3. Model Manager (Section 5, 6, 29, 41) */}
      <div id="speech-models-section" className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Mic className="w-4 h-4 text-emerald-600" />
            Speech Recognition Models
          </h4>
          <span className="text-xs text-stone-500">Verified FOSS Models</span>
        </div>

        <div className="space-y-3">
          {models.map((m) => (
            <div
              key={m.id}
              id={`model-card-${m.id}`}
              className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h5 className="font-medium text-stone-900 dark:text-stone-100 text-sm">
                    {m.displayName}
                  </h5>
                  {m.installed ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Installed
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 font-medium">
                      Available
                    </span>
                  )}
                  {m.id === 'whisper-base' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400">{m.description}</p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400 pt-1">
                  <span>Size: {m.downloadBytes ? formatBytes(m.downloadBytes) : 'Bundled'}</span>
                  <span>•</span>
                  <span>Accuracy: {m.accuracyClass}</span>
                  <span>•</span>
                  <span>License: {m.license}</span>
                  <span>•</span>
                  <span className="font-mono text-[10px] truncate max-w-[120px]" title={m.sha256}>
                    SHA: {m.sha256.substring(0, 10)}...
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {m.installed ? (
                  m.id !== 'whisper-base' && (
                    <button
                      id={`btn-delete-model-${m.id}`}
                      onClick={() => handleDeleteModel(m.id)}
                      className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 hover:text-red-600 dark:text-stone-300 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )
                ) : (
                  <button
                    id={`btn-install-model-${m.id}`}
                    disabled={installingModelId === m.id}
                    onClick={() => handleInstallModel(m.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {installingModelId === m.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {installingModelId === m.id ? 'Installing...' : 'Download'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Storage Management (Section 30) */}
      {storage && (
        <div
          id="offline-storage-breakdown-card"
          className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-stone-600 dark:text-stone-300" />
              Offline AI Storage Footprint
            </h4>
            <button
              id="btn-clean-temp-cache"
              onClick={handleCleanTemporary}
              className="text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clean Temporary Cache
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/50">
              <span className="text-stone-500 block text-[11px]">Speech Models</span>
              <strong className="text-stone-900 dark:text-stone-100 text-sm">
                {formatBytes(storage.modelsBytes)}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/50">
              <span className="text-stone-500 block text-[11px]">Recordings</span>
              <strong className="text-stone-900 dark:text-stone-100 text-sm">
                {formatBytes(storage.recordingsBytes)}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/50">
              <span className="text-stone-500 block text-[11px]">Transcripts</span>
              <strong className="text-stone-900 dark:text-stone-100 text-sm">
                {formatBytes(storage.transcriptsBytes)}
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/50">
              <span className="text-stone-500 block text-[11px]">Total AI Data</span>
              <strong className="text-emerald-700 dark:text-emerald-400 text-sm">
                {formatBytes(storage.totalBytes)}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 5. Workflow & Automation Toggles (Section 60) */}
      <div id="offline-ai-preferences-section" className="space-y-3 pt-2">
        <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          Transcription Workflow
        </h4>

        <div className="space-y-2">
          <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 cursor-pointer">
            <div>
              <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block">
                Automatic Offline Transcription
              </span>
              <span className="text-[11px] text-stone-500">
                Immediately start local speech recognition when an audio recording finishes.
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoTranscribe}
              onChange={(e) => setAutoTranscribe(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 cursor-pointer">
            <div>
              <span className="text-xs font-medium text-stone-900 dark:text-stone-100 block">
                Speaker Detection & Diarization
              </span>
              <span className="text-[11px] text-stone-500">
                Identify distinct conversational speakers (Speaker 1, Speaker 2) across chunks.
              </span>
            </div>
            <input
              type="checkbox"
              checked={speakerDetection}
              onChange={(e) => setSpeakerDetection(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
          </label>
        </div>
      </div>

      {/* 6. Advanced Settings (Section 61) */}
      <div id="offline-ai-advanced-section" className="pt-2 border-t border-stone-200 dark:border-stone-800">
        <button
          id="btn-toggle-advanced-settings"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <Sliders className="w-4 h-4" />
          {showAdvanced ? 'Hide Advanced Speech Settings' : 'Show Advanced Speech Settings'}
        </button>

        {showAdvanced && (
          <div className="mt-3 p-4 rounded-xl bg-stone-50 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-500 mb-1">Inference Threads</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={threadCount}
                  onChange={(e) => setThreadCount(parseInt(e.target.value, 10) || 4)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="block text-stone-500 mb-1">VAD Sensitivity</label>
                <select
                  value={vadSensitivity}
                  onChange={(e) => setVadSensitivity(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  <option value="low">Conservative (Low)</option>
                  <option value="medium">Balanced (Medium)</option>
                  <option value="high">Aggressive (High)</option>
                </select>
              </div>
              <div>
                <label className="block text-stone-500 mb-1">Chunk Duration (Seconds)</label>
                <input
                  type="number"
                  min="10"
                  max="60"
                  value={chunkDurationSec}
                  onChange={(e) => setChunkDurationSec(parseInt(e.target.value, 10) || 20)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>
            <p className="text-[11px] text-stone-500 italic">
              Advanced parameters are automatically tuned for thermal stability and battery life.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
