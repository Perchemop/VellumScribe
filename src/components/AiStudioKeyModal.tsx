import React, { useState, useRef, useEffect } from 'react';
import {
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Upload,
  Clipboard,
  X,
  Sparkles,
  Shield,
  Trash2,
} from 'lucide-react';
import { AiSettingsManager } from '../lib/aiSettings';

interface AiStudioKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export const AiStudioKeyModal: React.FC<AiStudioKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Google AI Studio Key Authentication',
  description = 'Power intelligent meeting summaries, action item extraction, OCR, and audio transcription using your free Google AI Studio key.',
}) => {
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [fileFeedback, setFileFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(AiSettingsManager.getApiKey());
      setVerifyStatus(null);
      setFileFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const extracted = AiSettingsManager.extractApiKeyFromFile(text);
          if (extracted.key) {
            setApiKeyInput(extracted.key);
            setFileFeedback('Pasted API key from clipboard.');
          } else {
            setApiKeyInput(text.trim());
          }
        }
      }
    } catch {
      setFileFeedback('Could not access clipboard. Please paste manually.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const extracted = AiSettingsManager.extractApiKeyFromFile(content);
      if (extracted.key) {
        setApiKeyInput(extracted.key);
        setFileFeedback(`Extracted API key from "${file.name}"`);
        setVerifyStatus(null);
      } else {
        setFileFeedback(extracted.error || 'Could not locate API key in file.');
      }
    };
    reader.readAsText(file);
  };

  const handleAuthenticate = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setVerifyStatus({
        success: false,
        message: 'Please paste your Google AI Studio API key.',
      });
      return;
    }

    setIsVerifying(true);
    setVerifyStatus(null);

    try {
      const res = await AiSettingsManager.testApiKey(trimmed);
      if (res.success) {
        AiSettingsManager.setApiKey(trimmed);
        setVerifyStatus({
          success: true,
          message: res.message || 'Key authenticated successfully! Connected to Gemini 3.7 Flash.',
        });
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1200);
      } else {
        setVerifyStatus({
          success: false,
          message: res.message || 'Authentication failed. Please verify the key string and permissions.',
        });
      }
    } catch (err: any) {
      setVerifyStatus({
        success: false,
        message: err.message || 'Network error verifying key.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
    AiSettingsManager.clearApiKey();
    setApiKeyInput('');
    setVerifyStatus({
      success: false,
      message: 'API key removed from local browser keystore.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#131317] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                {description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
          {/* Free Tier Callout */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-xs text-amber-800 dark:text-amber-300">
                100% Free Forever via Google AI Studio
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400/90 leading-relaxed">
                Google provides free API keys with generous quotas (15 requests/min, 1,500 requests/day). No credit card required.
              </p>
            </div>
          </div>

          {/* Step 1: External Link */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-[10px]">
                1
              </span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Get your key in 30 seconds
              </span>
            </div>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-[11px] flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <span>Get Free Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Step 2: Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-[10px]">
                  2
                </span>
                <span>Paste API Key</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setVerifyStatus(null);
                }}
                placeholder="AIzaSy..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                {apiKeyInput && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    title="Remove key"
                    className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* File Upload Option */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1.5"
            >
              <Upload className="w-3 h-3" />
              <span>Import from .env or JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,.json,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {fileFeedback && (
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
              {fileFeedback}
            </p>
          )}

          {/* Verification Status Banner */}
          {verifyStatus && (
            <div
              className={`p-3 rounded-2xl flex items-start gap-2 text-xs ${
                verifyStatus.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              {verifyStatus.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              )}
              <span className="leading-snug">{verifyStatus.message}</span>
            </div>
          )}

          {/* Privacy Footnote */}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
            Your key remains stored locally on your device in browser storage. It is only passed via encrypted headers to Google AI Studio for processing your notes.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAuthenticate}
            disabled={!apiKeyInput.trim() || isVerifying}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {isVerifying ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Key className="w-3.5 h-3.5" />
                <span>Authenticate &amp; Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
