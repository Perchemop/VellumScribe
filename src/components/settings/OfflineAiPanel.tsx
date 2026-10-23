import React, { useState, useEffect } from 'react';
import { Cpu, Download, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { OfflineAi, VERIFIED_SPEECH_MODELS } from '../../plugins/offline-ai';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { AiCapabilities, SpeechModelProfile } from '../../types';
import { AppLogger } from '../../lib/logger';
import { asErrorLike } from '../../lib/errorLike';

/** Compact on-device Whisper status + model install. */
export const OfflineAiPanel: React.FC = () => {
  const [caps, setCaps] = useState<AiCapabilities | null>(null);
  const [models, setModels] = useState<SpeechModelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const capabilities = await OfflineAi.getCapabilities();
      setCaps(capabilities);
      const installed = await OfflineAiManager.getInstance().listSpeechModels();
      const installedMap = new Map(installed.map((m) => [m.id, m]));
      setModels(
        VERIFIED_SPEECH_MODELS.map((model) => {
          const inst = installedMap.get(model.id);
          return {
            ...model,
            installed: !!inst?.installed,
            installedSizeBytes: inst?.installedSizeBytes,
          };
        })
      );
    } catch (_err) {
      const err = asErrorLike(_err);
      AppLogger.warn('OfflineAiPanel', 'Failed to load offline AI status', err);
      setErrorMessage(err.message || 'Could not query on-device AI.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadModel = async (model: SpeechModelProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDownloadingModelId(model.id);
    setDownloadProgress(25);
    try {
      const res = await OfflineAiManager.getInstance().installModel(model.id);
      if (!res.installed) throw new Error(res.error || 'Install failed');
      setSuccessMessage(`${model.displayName} installed`);
      await loadData();
    } catch (_err) {
      const err = asErrorLike(_err);
      setErrorMessage(err.message || 'Download failed');
    } finally {
      setDownloadingModelId(null);
      setDownloadProgress(0);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Remove this speech model?')) return;
    try {
      await OfflineAi.deleteSpeechModel({ modelId });
      setSuccessMessage('Model removed');
      await loadData();
    } catch (_err) {
      const err = asErrorLike(_err);
      setErrorMessage(err.message || 'Remove failed');
    }
  };

  const formatMb = (bytes: number | null | undefined) => ((bytes || 0) / (1024 * 1024)).toFixed(0);
  const isInferenceReady = Boolean(caps?.inferenceRuntimeReady);
  const isLibraryLoaded = Boolean(caps?.nativeLibraryLoaded);

  if (loading && !caps) {
    return (
      <div className="p-6 text-center text-zinc-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Checking on-device AI…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isInferenceReady
                  ? 'bg-emerald-500/15 text-emerald-600'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
              }`}
            >
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                On-device Whisper
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    isInferenceReady
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {isInferenceReady ? 'Ready' : isLibraryLoaded ? 'Limited' : 'Unavailable'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {isInferenceReady
                  ? 'Transcribes offline on this device.'
                  : 'Use live dictation while recording, or a native build with Whisper.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400 flex gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Models <span className="normal-case font-normal text-zinc-400">(Tiny recommended)</span>
        </h4>
        {models.map((model) => {
          const isInstalled = !!model.installed;
          const isDownloading = downloadingModelId === model.id;
          return (
            <div
              key={model.id}
              className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {model.displayName}
                  {isInstalled && (
                    <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                      Installed
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500">~{formatMb(model.downloadBytes)} MB</div>
              </div>
              {isDownloading ? (
                <span className="text-xs text-zinc-500 font-mono">{downloadProgress}%</span>
              ) : isInstalled ? (
                <button
                  type="button"
                  onClick={() => handleDeleteModel(model.id)}
                  className="px-2.5 py-1.5 text-xs rounded-lg text-rose-600 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDownloadModel(model)}
                  disabled={!isInferenceReady || downloadingModelId !== null}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
