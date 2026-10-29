import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Sparkles,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  FileText,
} from 'lucide-react';
import { CloudSyncEngine } from '../../lib/cloudSync';
import { AiSettingsManager } from '../../lib/aiSettings';
import { PrivacyManager } from '../../lib/privacyManager';
import { AppLogger } from '../../lib/logger';
import { AndroidKeystoreManager } from '../../lib/keystore';
import { UnlockSessionManager } from '../../lib/UnlockSessionManager';
import { CloudConnectModal } from '../../components/CloudConnectModal';
import { CloudAiConsentModal } from '../../components/CloudAiConsentModal';
import { AiStudioKeyModal } from '../../components/AiStudioKeyModal';

export const SimpleSettingsPanel: React.FC = () => {
  const [accounts, setAccounts] = useState(() => CloudSyncEngine.getAccounts());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [googleKey, setGoogleKey] = useState(() => AiSettingsManager.getGoogleApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const hasCloudConsent = PrivacyManager.hasCloudAiConsent();
  const hasCloudKey = Boolean(AiSettingsManager.getGoogleApiKey());
  const hasCloudAccount = accounts.length > 0;

  const loadAccounts = () => setAccounts(CloudSyncEngine.getAccounts());

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleConnectCloud = async () => {
    setShowCloudModal(true);
  };

  const handleDisconnectCloud = async () => {
    setIsSyncing(true);
    try {
      for (const acc of accounts) {
        await CloudSyncEngine.removeAccount(acc.provider);
      }
      setAccounts([]);
      setSyncFeedback('Cloud disconnected.');
    } catch (_err) {
      setSyncFeedback('Could not disconnect.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBackupNow = async () => {
    if (!hasCloudAccount) {
      setSyncFeedback('Connect a cloud destination first.');
      return;
    }
    setIsSyncing(true);
    setSyncFeedback('Backing up…');
    try {
      await CloudSyncEngine.triggerSync({ onProgress: () => {} });
      setSyncFeedback('Backup complete.');
      setAccounts(CloudSyncEngine.getAccounts());
    } catch (_e) {
      setSyncFeedback('Backup failed.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  const handleGrantConsent = () => {
    setShowConsentModal(true);
  };

  const handleSaveGoogleKey = async () => {
    const trimmed = googleKey.trim();
    if (!trimmed) return;
    setIsVerifying(true);
    try {
      AiSettingsManager.setGoogleApiKey(trimmed);
      setShowAiKeyModal(false);
      setGoogleKey(trimmed);
      setShowKeyInput(false);
      setIsVerifying(false);
    } catch (_e) {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cloud Backup */}
      <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Cloud Backup
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Encrypted off-device backups across your devices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasCloudAccount ? (
              <button
                type="button"
                onClick={handleBackupNow}
                disabled={isSyncing}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Backing up…' : 'Back up now'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectCloud}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-2xs flex items-center gap-1.5"
              >
                <Cloud className="w-4 h-4" />
                <span>Connect cloud</span>
              </button>
            )}
            {hasCloudAccount && (
              <button
                type="button"
                onClick={handleDisconnectCloud}
                disabled={isSyncing}
                className="px-3 py-1.5 text-zinc-500 hover:text-red-600 dark:hover:text-rose-400 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
        {syncFeedback && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1.5">
            {syncFeedback}
          </p>
        )}
      </div>

      {/* AI / Transcription */}
      <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              AI transcription
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Convert voice recordings to text on-device or with cloud AI.
            </p>
          </div>
        </div>

        {/* Cloud AI Consent Gate */}
        {!hasCloudConsent && (
          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/40">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Cloud AI transcription is off
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Enable cloud AI to transcribe using Google AI Studio (Gemini). Your voice data is
                  sent to Google for processing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGrantConsent}
              className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-2xs"
            >
              Enable cloud AI
            </button>
          </div>
        )}

        {!hasCloudConsent ? null : (
          <>
            {/* API Key Input */}
            {!hasCloudKey ? (
              <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Google AI Studio API key
                  </label>
                  <input
                    type="password"
                    value={googleKey}
                    onChange={(e) => setGoogleKey(e.target.value)}
                    placeholder="AIzaSy…"
                    className="w-full px-3 py-2 bg-zinc-900 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGoogleKey}
                    disabled={isVerifying}
                    className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isVerifying ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>Save key</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    Google AI Studio key configured
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleKey('');
                    AiSettingsManager.setGoogleApiKey('');
                  }}
                  className="text-xs text-zinc-600 hover:text-red-600 dark:hover:text-rose-400 underline"
                >
                  Remove key
                </button>
              </div>
            )}

            {/* Local transcription toggle */}
            <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                    <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      On-device transcription
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Transcribe recordings without sending them anywhere. Works offline.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900/40 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </>
          </>
        )}
      </div>

      {/* Security */}
      <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Note lock
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Optional PIN to protect your notes.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors flex items-center gap-2"
        >
          <Lock className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
          <span>Set note PIN</span>
        </button>
      </div>
    </div>
  );
};

export default SimpleSettingsPanel;