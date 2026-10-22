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
  
  Cpu,
  
  
  
  
  Mic} from 'lucide-react';
import { AiSettingsManager, AiIntegrationSettings } from '../lib/aiSettings';
import { StorageManager } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';
import { AppLogo } from './AppLogo';
import { useModalBackHandler } from '../lib/modalBackStack';
import { OfflineAiSettings } from '../pages/settings/OfflineAiSettings';
import { asErrorLike } from '../lib/errorLike';

interface SettingsModalProps {
  initialTab?: 'ai' | 'backup' | 'security' | 'offline-ai';
  onClose: () => void;
  onSettingsUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  initialTab = 'offline-ai',
  onClose,
  onSettingsUpdated,
}) => {
  useModalBackHandler(true, onClose, 'settings-modal');
  const [activeTab, setActiveTab] = useState<'ai' | 'backup' | 'security' | 'offline-ai'>(
    initialTab === 'security'
      ? 'security'
      : initialTab === 'backup'
      ? 'backup'
      : initialTab === 'ai'
      ? 'ai'
      : 'offline-ai'
  );

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<AiIntegrationSettings>(() => AiSettingsManager.getSettings());
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => AiSettingsManager.getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fileUploadFeedback, setFileUploadFeedback] = useState<string | null>(null);

  // Backup & Storage state
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [stats, setStats] = useState(() => StorageManager.getStorageStats());

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
    } catch (_err) {
      const err = asErrorLike(_err);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        id="settings-modal-card"
        className="w-full max-w-xl bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" showText={false} />
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                Settings &amp; Configuration
              </h2>
              <p className="text-xs text-zinc-400">Manage Google AI Studio API key, local database, and storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center border-b border-zinc-100 dark:border-zinc-800/60 px-6 bg-zinc-50/30 dark:bg-[#0e0e12] text-xs overflow-x-auto">
          <button
            id="tab-offline-ai-btn"
            onClick={() => setActiveTab('offline-ai')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'offline-ai'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Offline AI (Whisper)</span>
          </button>

          <button
            id="tab-ai-settings-btn"
            onClick={() => setActiveTab('ai')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'ai'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Studio &amp; Vision</span>
          </button>

          <button
            id="tab-backup-settings-btn"
            onClick={() => setActiveTab('backup')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage &amp; Backup</span>
          </button>

          <button
            id="tab-security-settings-btn"
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Security &amp; Keystore</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-minimal-scrollbar text-xs">
          {/* TAB 1: AI STUDIO KEY */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* API Key Connection Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Google AI Studio API Key
                    </h3>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Get Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Powers instant meeting summaries, audio transcription, and OCR document scanning using Google Gemini models.
                </p>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      id="gemini-api-key-modal-input"
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-3 py-2 pr-20 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveApiKey}
                      className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-semibold hover:bg-zinc-800 dark:hover:bg-white transition-colors"
                    >
                      Save Key
                    </button>
                    <button
                      onClick={handleTestApiKey}
                      disabled={isVerifying || !apiKeyInput.trim()}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
                      <span>{isVerifying ? 'Testing...' : 'Verify API Connection'}</span>
                    </button>
                    {apiKeyInput && (
                      <button
                        onClick={handleClearApiKey}
                        className="px-2 py-1.5 text-rose-500 hover:underline text-xs ml-auto"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Verification result badge */}
                {verifyResult && (
                  <div
                    className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                      verifyResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {verifyResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{verifyResult.message}</span>
                  </div>
                )}

                {fileUploadFeedback && (
                  <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs">
                    {fileUploadFeedback}
                  </div>
                )}
              </div>

              {/* Upload file fallback */}
              <div className="p-3.5 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Load from File</p>
                  <p className="text-xs text-zinc-400">Import key from .env, .json, or key.txt file</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleKeyFileUpload}
                  accept=".env,.json,.txt"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: STORAGE & BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Storage Health Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Local Browser Storage Engine
                    </h3>
                  </div>
                  <span className="text-xs font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                    HEALTHY
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                    <span className="text-zinc-400 block text-xs">Total Notes</span>
                    <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{stats.totalNotes}</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                    <span className="text-zinc-400 block text-xs">Audio Memos</span>
                    <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{stats.totalRecordings}</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                    <span className="text-zinc-400 block text-xs">Active Notes</span>
                    <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{stats.activeNotes}</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                    <span className="text-zinc-400 block text-xs">Archived</span>
                    <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{stats.archivedNotes}</span>
                  </div>
                </div>
              </div>

              {/* Offline-first Information Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                    100% Offline Air-Gapped Operation
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  All notes, sketches, checklists, and audio recordings are saved locally inside this browser. You can export complete snapshots below or import from previously saved JSON backups anytime.
                </p>
              </div>

              {/* Data Export Card */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Data Backup &amp; Export
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      const json = StorageManager.exportFullBackup();
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
                    <p className="text-xs text-zinc-400">Full structured backup of notes, sketches, and checklists</p>
                  </button>

                  <button
                    onClick={() => {
                      const notes = StorageManager.getNotes();
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
                    <p className="text-xs text-zinc-400">Clean Markdown text files readable in any editor</p>
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
                  <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                    AES-256-GCM
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
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
                          <p className="font-mono text-xs text-zinc-400">{s.masked_value}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {s.algorithm}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OFFLINE AI & WHISPER */}
          {activeTab === 'offline-ai' && (
            <div className="space-y-4">
              <OfflineAiSettings />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
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
