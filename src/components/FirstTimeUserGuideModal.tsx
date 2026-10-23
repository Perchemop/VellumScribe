import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Share2,
  Sparkles,
  CheckCircle2,
  Mic,
  Shield,
  ArrowRight,
  X,
  Plus,
  MoreVertical,
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { StorageManager } from '../lib/storage';
import { AndroidPwaManager } from '../lib/androidPwaManager';
import { useModalBackHandler } from '../lib/modalBackStack';
import { OfflineAiManager } from '../services/OfflineAiManager';
import { AppLogger } from '../lib/logger';

interface FirstTimeUserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'vellumscribe_onboarding_completed_v1';
const SPLASH_SEEN_KEY = 'vellumscribe_splash_seen_v1';

export function hasCompletedOnboarding(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const direct = localStorage.getItem(STORAGE_KEY);
      if (direct === 'true' || direct === '1') return true;
      const secondary = localStorage.getItem(SPLASH_SEEN_KEY);
      if (secondary === 'true' || secondary === '1') return true;
    }
    if (typeof sessionStorage !== 'undefined') {
      const sess = sessionStorage.getItem(STORAGE_KEY);
      if (sess === 'true' || sess === '1') return true;
    }
    const item = StorageManager.getItem<unknown>(STORAGE_KEY, null);
    if (item === true || item === 'true' || item === 1 || item === '1') return true;
    // Returning installs: any existing notes means skip the first-run tour
    try {
      const notes = StorageManager.getNotes();
      if (Array.isArray(notes) && notes.length > 0) {
        markOnboardingCompleted();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(SPLASH_SEEN_KEY, 'true');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      sessionStorage.setItem(SPLASH_SEEN_KEY, 'true');
    }
    StorageManager.setItem(STORAGE_KEY, 'true');
  } catch (err) {
    AppLogger.warn('FirstTimeUserGuideModal', 'Failed to write onboarding completion state:', err);
  }
}

export function resetOnboardingState(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SPLASH_SEEN_KEY);
    }
    StorageManager.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const FirstTimeUserGuideModal: React.FC<FirstTimeUserGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const handleDismiss = useCallback(() => {
    markOnboardingCompleted();
    onClose();
  }, [onClose]);

  useModalBackHandler(isOpen, handleDismiss, 'first-time-user-guide');

  const [currentStep, setCurrentStep] = useState(0);
  const [canInstall, setCanInstall] = useState(() => AndroidPwaManager.canPromptInstall());
  const [installSuccess, setInstallSuccess] = useState(false);
  const [isWhisperRuntimeReady, setIsWhisperRuntimeReady] = useState(false);

  useEffect(() => {
    OfflineAiManager.getInstance()
      .getDeviceCapabilities()
      .then((caps) => {
        setIsWhisperRuntimeReady(Boolean(caps.inferenceRuntimeReady));
      })
      .catch(() => setIsWhisperRuntimeReady(false));
  }, []);

  useEffect(() => {
    return AndroidPwaManager.subscribe((can) => {
      setCanInstall(can);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDismiss]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const res = await AndroidPwaManager.promptInstall();
    if (res.outcome === 'accepted') setInstallSuccess(true);
  };

  const isStandalone = AndroidPwaManager.isStandalone();

  const steps = [
    {
      badge: 'Write First',
      title: 'Open a Note and Just Write',
      description:
        'The editor stays clean so you can capture thoughts immediately. Tools stay one tap away — not a row of icons.',
      highlights: [
        {
          icon: Plus,
          title: 'Attach (+)',
          desc: 'Checklist, voice memo, sketch, and document scan live under the + button.',
        },
        {
          icon: MoreVertical,
          title: 'More (⋮)',
          desc: 'Pin, reminder, lock, share, AI summary, and settings — without cluttering the top bar.',
        },
      ],
    },
    {
      badge: 'Android Home Screen',
      title: 'Add to Your Android Home Screen',
      description:
        'Install VellumScribe for a full-screen experience without browser chrome, with offline launch and a home screen icon.',
      highlights: [
        {
          icon: Download,
          title: 'Full-Screen Standalone App',
          desc: isStandalone
            ? 'Currently running in Standalone Android App mode!'
            : 'Runs edge-to-edge like a native app with system navigation support.',
        },
        {
          icon: Share2,
          title: 'Android Native Share Sheet',
          desc: 'Share notes and audio to WhatsApp, Gmail, Messages, Drive, and more.',
        },
      ],
      showInstallAction: true,
    },
    {
      badge: '100% Offline & Private',
      title: 'On-Device Storage & Private Voice Memos',
      description:
        'Notes, voice recordings, and sketches stay on your phone unless you choose cloud backup or AI.',
      highlights: [
        {
          icon: Mic,
          title: 'Live Voice Memos & Dictation',
          desc: 'Record with real-time on-device speech-to-text while you speak — no cloud required.',
        },
        {
          icon: Shield,
          title: 'Local Privacy & Keystore',
          desc: 'Optional PIN lock, encryption, and multi-cloud sync only when you enable them.',
        },
      ],
    },
    {
      badge: 'Voice & AI',
      title: isWhisperRuntimeReady
        ? 'Privacy-Preserving On-Device Transcription'
        : 'Voice Memos That Stay on Your Phone',
      description: isWhisperRuntimeReady
        ? 'Download on-device Whisper models, or use optional Cloud Gemini when you allow network.'
        : 'Use live dictation while recording, or optional cloud transcription when you allow network. Full offline Whisper needs the on-device runtime in the Android build.',
      highlights: [
        {
          icon: Mic,
          title: isWhisperRuntimeReady
            ? 'On-Device Whisper Models'
            : 'Real-Time Microphone Dictation',
          desc: isWhisperRuntimeReady
            ? 'Download Tiny or Base models once to transcribe offline.'
            : 'Speech recognition while you speak — zero cloud traffic.',
        },
        {
          icon: Sparkles,
          title: 'Optional Gemini Cloud Assist',
          desc: 'Summaries and OCR with your own API key and explicit consent.',
        },
      ],
    },
  ];

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
    else handleDismiss();
  };

  return (
    <div
      id="first-time-user-guide-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs select-none animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleDismiss();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 pb-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2.5">
            <AppLogo size="md" showText={false} />
            <div>
              <span className="text-xs font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                {step.badge}
              </span>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Quick Start
              </h2>
            </div>
          </div>
          <button
            id="onboarding-close-x-btn"
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {step.title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {step.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {step.highlights.map((h, i) => {
              const Icon = h.icon;
              return (
                <div
                  key={i}
                  className="p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 rounded-2xl space-y-1.5"
                >
                  <div className="w-7 h-7 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {h.title}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
                    {h.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {step.showInstallAction && !isStandalone && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-indigo-950 dark:text-indigo-200 text-xs">
                  {canInstall ? 'Ready for One-Tap Install' : 'Install via Android Browser'}
                </p>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 truncate">
                  {canInstall
                    ? 'Add directly to your Android launcher now'
                    : 'Browser menu (⋮) → Add to Home screen'}
                </p>
              </div>
              {canInstall ? (
                <button
                  type="button"
                  id="onboarding-install-pwa-btn"
                  onClick={handleInstallClick}
                  disabled={installSuccess}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shrink-0"
                >
                  {installSuccess ? 'Installed' : 'Install App'}
                </button>
              ) : (
                <span className="text-xs font-mono font-semibold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 rounded-lg shrink-0">
                  Chrome
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 pt-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-zinc-900 dark:bg-zinc-100'
                    : 'w-1.5 bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-50/50 dark:bg-[#0f0f12] border-t border-zinc-100 dark:border-zinc-850 flex items-center justify-between">
          <button
            id="onboarding-skip-intro-btn"
            onClick={handleDismiss}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Skip Intro
          </button>
          <button
            id="onboarding-next-btn"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl"
          >
            <span>{currentStep === steps.length - 1 ? 'Get Started' : 'Next'}</span>
            {currentStep === steps.length - 1 ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
