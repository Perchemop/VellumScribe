import React, { useState, useEffect } from 'react';
import {
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  
  Clipboard,
  X,
  Sparkles,
  Shield,
  Trash2,
  Zap,
  Mic,
  Check,
  
  ChevronDown,
  ChevronUp} from 'lucide-react';
import { AiSettingsManager } from '../lib/aiSettings';
import { useModalBackHandler } from '../lib/modalBackStack';
import { asErrorLike } from '../lib/errorLike';

interface AiStudioKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
  initialProvider?: 'google' | 'groq' | 'deepgram' | 'offline_rules';
}

export const AiStudioKeyModal: React.FC<AiStudioKeyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'AI Provider & Intelligence Backend',
  description = 'Choose your preferred intelligence engine: use free BYOK cloud keys or 100% offline private processing.',
  initialProvider = 'google',
}) => {
  useModalBackHandler(isOpen, onClose, 'ai-studio-key-modal');
  const isAdvancedProvider = ['groq', 'deepgram'].includes(initialProvider);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'groq' | 'deepgram' | 'offline_rules'>(initialProvider);
  const [showAdvancedProviders, setShowAdvancedProviders] = useState(isAdvancedProvider);
  const [keyInput, setKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [, setFileFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const settings = AiSettingsManager.getSettings();
      setSelectedProvider(initialProvider);
      loadProviderKey(initialProvider, settings);
      setVerifyStatus(null);
      setFileFeedback(null);
    }
  }, [isOpen, initialProvider]);

  const loadProviderKey = (provider: 'google' | 'groq' | 'deepgram' | 'offline_rules', currentSettings = AiSettingsManager.getSettings()) => {
    if (provider === 'google') {
      setKeyInput(currentSettings.googleApiKey || currentSettings.apiKey || '');
    } else if (provider === 'groq') {
      setKeyInput(currentSettings.groqApiKey || '');
    } else if (provider === 'deepgram') {
      setKeyInput(currentSettings.deepgramApiKey || '');
    } else {
      setKeyInput('');
    }
  };

  const handleSelectTab = (prov: 'google' | 'groq' | 'deepgram' | 'offline_rules') => {
    if (['groq', 'deepgram'].includes(prov)) {
      setShowAdvancedProviders(true);
    }
    setSelectedProvider(prov);
    setVerifyStatus(null);
    setFileFeedback(null);
    loadProviderKey(prov);
  };

  const handleSwitchToOfflineRules = () => {
    AiSettingsManager.updateSettings({
      primaryLlmProvider: 'offline_rules',
      primaryTranscriptionProvider: 'browser_speech',
    });
    setVerifyStatus({
      success: true,
      message: '100% Offline Rule Engine activated. Notes summaries and action items will process locally on-device without network requests or API keys.',
    });
    setTimeout(() => {
      if (onSuccess) onSuccess();
      onClose();
    }, 1200);
  };

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const extracted = AiSettingsManager.extractApiKeyFromFile(text);
          if (extracted.key) {
            setKeyInput(extracted.key);
            setFileFeedback('Pasted API key from clipboard.');
          } else {
            setKeyInput(text.trim());
          }
        }
      }
    } catch {
      setFileFeedback('Could not access clipboard. Please paste manually.');
    }
  };

  const handleAuthenticate = async () => {
    if (selectedProvider === 'offline_rules') {
      handleSwitchToOfflineRules();
      return;
    }

    setIsVerifying(true);
    setVerifyStatus(null);

    try {
      if (selectedProvider === 'google') {
        const trimmed = keyInput.trim();
        if (!trimmed) {
          setVerifyStatus({ success: false, message: 'Please paste your Google AI Studio key.' });
          setIsVerifying(false);
          return;
        }
        const res = await AiSettingsManager.testApiKey(trimmed);
        if (res.success) {
          AiSettingsManager.setGoogleApiKey(trimmed);
          AiSettingsManager.updateSettings({ primaryLlmProvider: 'google' });
          setVerifyStatus({ success: true, message: res.message || 'Connected to Google AI Studio!' });
          setTimeout(() => { if (onSuccess) onSuccess(); onClose(); }, 1000);
        } else {
          setVerifyStatus({ success: false, message: res.message || 'Google AI Studio verification failed.' });
        }
      } else if (selectedProvider === 'groq') {
        const trimmed = keyInput.trim();
        if (!trimmed) {
          setVerifyStatus({ success: false, message: 'Please paste your Groq API key.' });
          setIsVerifying(false);
          return;
        }
        const res = await AiSettingsManager.testGroqKey(trimmed);
        if (res.success) {
          AiSettingsManager.setGroqApiKey(trimmed);
          AiSettingsManager.updateSettings({ primaryLlmProvider: 'groq', primaryTranscriptionProvider: 'groq_whisper' });
          setVerifyStatus({ success: true, message: res.message || 'Connected to Groq Cloud!' });
          setTimeout(() => { if (onSuccess) onSuccess(); onClose(); }, 1000);
        } else {
          setVerifyStatus({ success: false, message: res.message || 'Groq key verification failed.' });
        }
      } else if (selectedProvider === 'deepgram') {
        const trimmed = keyInput.trim();
        if (!trimmed) {
          setVerifyStatus({ success: false, message: 'Please paste your Deepgram API key.' });
          setIsVerifying(false);
          return;
        }
        const res = await AiSettingsManager.testDeepgramKey(trimmed);
        if (res.success) {
          AiSettingsManager.setDeepgramApiKey(trimmed);
          AiSettingsManager.updateSettings({ primaryTranscriptionProvider: 'deepgram' });
          setVerifyStatus({ success: true, message: res.message || 'Connected to Deepgram!' });
          setTimeout(() => { if (onSuccess) onSuccess(); onClose(); }, 1000);
        } else {
          setVerifyStatus({ success: false, message: res.message || 'Deepgram key verification failed.' });
        }
      }
    } catch (_err) {
      const err = asErrorLike(_err);
      setVerifyStatus({ success: false, message: err.message || 'Error communicating with provider.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
    if (selectedProvider === 'google') AiSettingsManager.setGoogleApiKey('');
    if (selectedProvider === 'groq') AiSettingsManager.setGroqApiKey('');
    if (selectedProvider === 'deepgram') AiSettingsManager.setDeepgramApiKey('');
    setKeyInput('');
    setVerifyStatus({ success: false, message: 'Key removed from local browser keystore.' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#131317] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                {description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex items-center border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 px-5 pt-3 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleSelectTab('google')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap min-h-[44px] ${
              selectedProvider === 'google'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131317]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Google AI (Recommended)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab('offline_rules')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap min-h-[44px] ${
              selectedProvider === 'offline_rules'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131317]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>Offline Engine (No Keys)</span>
          </button>

          {showAdvancedProviders || ['groq', 'deepgram'].includes(selectedProvider) ? (
            <>
              <button
                type="button"
                onClick={() => handleSelectTab('groq')}
                className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap min-h-[44px] ${
                  selectedProvider === 'groq'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131317]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Groq</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('deepgram')}
                className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-colors flex items-center gap-1.5 border-b-2 whitespace-nowrap min-h-[44px] ${
                  selectedProvider === 'deepgram'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#131317]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Deepgram</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAdvancedProviders(false);
                  if (['groq', 'deepgram'].includes(selectedProvider)) {
                    handleSelectTab('google');
                  }
                }}
                className="ml-auto px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap min-h-[36px]"
                title="Hide developer and self-hosted providers"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Fewer</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdvancedProviders(true)}
              className="ml-auto px-2.5 py-1.5 text-xs text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap min-h-[36px]"
              title="Show developer & self-hosted options (Groq, Deepgram)"
            >
              <span>+ More Providers</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Provider Specific Information */}
          {selectedProvider === 'google' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-xs text-amber-800 dark:text-amber-300">
                  Google AI Studio (Gemini 3.7 / 3.6 / OCR)
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                  Free tier provides 15 RPM / 1,500 RPD for multimodal summaries, audio transcription, and handwritten notes OCR.
                </p>
              </div>
            </div>
          )}

          {selectedProvider === 'groq' && (
            <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-900 dark:text-orange-300 flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-xs text-orange-800 dark:text-orange-300">
                  Groq Cloud (Llama 3.3 70B &amp; Whisper Large v3)
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-400/90 leading-relaxed">
                  Ultra-fast LPU inference with generous free tier credits for Llama 3.3 70B text synthesis and Whisper audio transcription.
                </p>
              </div>
            </div>
          )}

          {selectedProvider === 'deepgram' && (
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-900 dark:text-cyan-300 flex items-start gap-2.5">
              <Mic className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-xs text-cyan-800 dark:text-cyan-300">
                  Deepgram Speech Intelligence
                </p>
                <p className="text-xs text-cyan-700 dark:text-cyan-400/90 leading-relaxed">
                  Provides $200 free credit upon signup for Nova-3 automated speech-to-text with word-level accuracy.
                </p>
              </div>
            </div>
          )}

          {selectedProvider === 'offline_rules' && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-300 space-y-3">
              <div className="flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">
                    Zero Setup Built-in Offline Engine
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400/90 leading-relaxed">
                    No API keys or network connection required. Extracts action items, meeting minutes, and executive summaries directly inside the browser using deterministic natural language heuristics.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSwitchToOfflineRules}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-2xs min-h-[44px]"
              >
                <Check className="w-4 h-4" />
                <span>Activate Built-in Offline Engine Now</span>
              </button>
            </div>
          )}

          {/* External Key Link for Cloud Providers */}
          {selectedProvider !== 'offline_rules' && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <span className="font-medium text-xs text-zinc-800 dark:text-zinc-200">
                  Get your free API key
                </span>
              </div>
              <a
                href={
                  selectedProvider === 'google'
                    ? 'https://aistudio.google.com/app/apikey'
                    : selectedProvider === 'groq'
                    ? 'https://console.groq.com/keys'
                    : 'https://console.deepgram.com/'
                }
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-colors min-h-[44px]"
              >
                <span>Open {selectedProvider === 'google' ? 'AI Studio' : selectedProvider === 'groq' ? 'Groq Console' : 'Deepgram'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Input field for keys */}
          {selectedProvider !== 'offline_rules' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs">
                    2
                  </span>
                  <span>Paste {selectedProvider === 'google' ? 'AIzaSy...' : selectedProvider === 'groq' ? 'gsk_...' : 'Deepgram'} Key</span>
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setVerifyStatus(null);
                  }}
                  placeholder={
                    selectedProvider === 'google'
                      ? 'AIzaSy...'
                      : selectedProvider === 'groq'
                      ? 'gsk_...'
                      : 'Paste Deepgram key...'
                  }
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
                  {keyInput && (
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
          ) : null}

          {/* Verification Status Banner & Instant Recovery Actions */}
          {verifyStatus && (
            <div
              className={`p-3.5 rounded-2xl flex flex-col gap-2 text-xs ${
                verifyStatus.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {verifyStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <span className="leading-snug">{verifyStatus.message}</span>
              </div>

            </div>
          )}

          {/* Privacy Footnote */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
            All API keys are strictly retained on your local device in encrypted browser storage. Zero keys are logged or stored on remote servers.
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
            disabled={isVerifying || (selectedProvider !== 'offline_rules' && !keyInput.trim())}
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
                <span>
                  {selectedProvider === 'offline_rules'
                    ? 'Activate Offline Engine'
                    : 'Authenticate & Save'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

