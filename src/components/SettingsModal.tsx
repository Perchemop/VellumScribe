import React, { useState, useRef } from 'react';
import {
  X,
  Sparkles,
  Key,
  ExternalLink,
  Upload,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Shield,
  Database,
  RefreshCw,
  HardDrive,
  WifiOff,
  FileText,
  Check,
  Cpu,
  Lock,
  Radio,
  FileCode,
  Info,
  Trash2,
} from 'lucide-react';
import { AiSettingsManager, AiIntegrationSettings } from '../lib/aiSettings';
import { CloudSyncEngine, BackupFrequency } from '../lib/cloudSync';
import { SQLiteDatabase } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';

interface SettingsModalProps {
  initialTab?: 'ai' | 'backup' | 'security';
  onClose: () => void;
  onSettingsUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  initialTab = 'ai',
  onClose,
  onSettingsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'backup' | 'security'>(initialTab === 'security' ? 'security' : initialTab === 'backup' ? 'backup' : 'ai');

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<AiIntegrationSettings>(() => AiSettingsManager.getSettings());
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => AiSettingsManager.getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fileUploadFeedback, setFileUploadFeedback] = useState<string | null>(null);

  // Backup & Storage state
  const [backupFrequency, setBackupFrequency] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [stats, setStats] = useState(() => SQLiteDatabase.getStorageStats());

  // Keystore secrets
  const [secrets, setSecrets] = useState(() => AndroidKeystoreManager.listSecrets());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save API Key when changed
  const handleSaveApiKey = () => {
    AiSettingsManager.setApiKey(apiKeyInput);
    setVerifyResult(null);
    setFileUploadFeedback('API key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
    onSettingsUpdated?.();
  };

  const handleClearApiKey = () => {
    AiSettingsManager.clearApiKey();
    setApiKeyInput('');
    setVerifyResult(null);
    setFileUploadFeedback('API key cleared from local storage.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
    onSettingsUpdated?.();
  };

  // Test API Key
  const handleTestApiKey = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await AiSettingsManager.testApiKey(apiKeyInput.trim());
      setVerifyResult(res);
    } catch (err: any) {
      setVerifyResult({
        success: false,
        message: err?.message || 'Verification request failed.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Upload key file (.env, .json, .txt)
  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const extracted = AiSettingsManager.extractApiKeyFromFile(content);
      if (extracted.key) {
        setApiKeyInput(extracted.key);
        AiSettingsManager.setApiKey(extracted.key);
        setFileUploadFeedback(`Successfully extracted and loaded API key from ${file.name}!`);
        setVerifyResult(null);
        onSettingsUpdated?.();
      } else {
        setFileUploadFeedback(extracted.error || 'Failed to find a valid API key in file.');
      }
    };
    reader.readAsText(file);
  };

  // Backup frequency toggle
  const handleFrequencyChange = (freq: BackupFrequency) => {
    setBackupFrequency(freq);
    CloudSyncEngine.setBackupFrequency(freq);
    if (freq === 'never') {
      setBackupFeedback('Fully offline mode enabled. All cloud backup operations are disabled.');
    } else {
      setBackupFeedback(`Backup frequency set to: ${freq}`);
    }
    setTimeout(() => setBackupFeedback(null), 3500);
    onSettingsUpdated?.();
  };

  const isAirGapped = backupFrequency === 'never';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        id="app-settings-modal"
        className="w-full max-w-2xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                Settings &amp; Preferences
              </h2>
              <p className="text-[11px] text-zinc-400">
                AI Studio key configuration, local backup options, and encryption
              </p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-[#101014]/50">
          <button
            id="tab-settings-ai-btn"
            onClick={() => setActiveTab('ai')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'ai'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Studio Key
          </button>

          <button
            id="tab-settings-backup-btn"
            onClick={() => setActiveTab('backup')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Export &amp; Offline
          </button>

          <button
            id="tab-settings-security-btn"
            onClick={() => setActiveTab('security')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Security &amp; Keystore
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-minimal-scrollbar text-xs">
          {/* TAB 1: AI STUDIO KEY */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              {/* Zero Server-Side Storage Disclaimer */}
              <div className="p-3.5 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-start gap-2.5 text-emerald-900 dark:text-emerald-300">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-xs">Private &amp; Local Key Storage</p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-400/90 leading-relaxed">
                    Your Gemini API key is stored <strong>strictly on your local device</strong> in browser secure storage. It is never logged on any server.
                  </p>
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Gemini API Key</span>
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>Get API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    id="settings-api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {apiKeyInput && (
                      <button
                        type="button"
                        onClick={handleClearApiKey}
                        title="Clear Key"
                        className="p-1 text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Verification result badge */}
                {verifyResult && (
                  <div
                    className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                      verifyResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    {verifyResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    )}
                    <span>{verifyResult.message}</span>
                  </div>
                )}

                {/* Upload or Action feedback */}
                {fileUploadFeedback && (
                  <p className="text-[11px] text-zinc-500 font-medium">{fileUploadFeedback}</p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-zinc-600 dark:text-zinc-300 text-xs font-medium"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .env / json file</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".env,.json,.txt"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      id="test-api-key-btn"
                      type="button"
                      onClick={handleTestApiKey}
                      disabled={!apiKeyInput.trim() || isVerifying}
                      className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
                    >
                      {isVerifying ? 'Verifying...' : 'Test Connection'}
                    </button>
                    <button
                      id="save-api-key-btn"
                      type="button"
                      onClick={handleSaveApiKey}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs"
                    >
                      Save Key
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXPORT & OFFLINE */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              <div className="p-4 border border-zinc-200/70 dark:border-zinc-800/70 rounded-2xl space-y-3 bg-zinc-50/50 dark:bg-[#101014]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>Offline Mode</span>
                      {isAirGapped && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-medium">
                          Air-Gapped
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Disable all background cloud sync operations
                    </p>
                  </div>

                  <select
                    value={backupFrequency}
                    onChange={(e) => handleFrequencyChange(e.target.value as BackupFrequency)}
                    className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                  >
                    <option value="never">Never (Fully Offline)</option>
                    <option value="5m">Every 5 minutes</option>
                    <option value="15m">Every 15 minutes</option>
                    <option value="1h">Every 1 hour</option>
                    <option value="daily">Daily</option>
                    <option value="manual">Manual Only</option>
                  </select>
                </div>
                {backupFeedback && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    {backupFeedback}
                  </p>
                )}
              </div>

              {/* Manual Backup & Export */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Data Backup &amp; Export
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      const json = SQLiteDatabase.exportFullBackup();
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `VellumScribe_Backup_${new Date().toISOString().split('T')[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-3.5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216]"
                  >
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Export JSON Backup</p>
                    <p className="text-[11px] text-zinc-400">Full structured backup of notes, sketches, and categories</p>
                  </button>

                  <button
                    onClick={() => {
                      const notes = SQLiteDatabase.getNotes();
                      const md = notes.length > 0 
                        ? notes.map((n) => `# ${n.title || 'Untitled'}\n\n${n.body}`).join('\n\n---\n\n')
                        : '# VellumScribe Notes\n\nNo notes currently saved.';
                      const blob = new Blob([md], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `VellumScribe_Notes_${new Date().toISOString().split('T')[0]}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-3.5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216]"
                  >
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Export Markdown Archive</p>
                    <p className="text-[11px] text-zinc-400">Clean Markdown text files readable in any editor</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & KEYSTORE */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 rounded-2xl text-white border border-zinc-850 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold tracking-wider text-zinc-200 uppercase">
                      Hardware Keystore Encryption
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                    AES-256-GCM
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Cryptographic keys, token aliases, and locked note master credentials are protected inside your device hardware security container.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Enrolled Security Keys ({secrets.length})
                </h4>
                <div className="space-y-2">
                  {secrets.map((s) => (
                    <div
                      key={s.alias}
                      className="p-3 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex items-center justify-between bg-white dark:bg-[#101014]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Key className="w-3.5 h-3.5 text-zinc-500" />
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.alias}</p>
                          <p className="font-mono text-[10px] text-zinc-400">{s.masked_value}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {s.algorithm}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-500" />
            <span>VellumScribe v1.5.0</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
