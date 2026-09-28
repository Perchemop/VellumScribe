import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Zap,
  Download,
  Share2,
  Sparkles,
  CheckCircle2,
  FileText,
  Mic,
  Shield,
  Cloud,
  ArrowRight,
  X,
  CheckSquare,
  Lock,
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { StorageManager } from '../lib/storage';
import { AndroidPwaManager } from '../lib/androidPwaManager';
import { useModalBackHandler } from '../lib/modalBackStack';

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

    const item = StorageManager.getItem<any>(STORAGE_KEY, null);
    if (item === true || item === 'true' || item === 1 || item === '1') return true;

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
    console.warn('Failed to write onboarding completion state:', err);
  }
}

export function resetOnboardingState(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SPLASH_SEEN_KEY);
    }
    StorageManager.removeItem(STORAGE_KEY);
  } catch {}
}

export const FirstTimeUserGuideModal: React.FC<FirstTimeUserGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const handleDismiss = () => {
    markOnboardingCompleted();
    onClose();
  };

  useModalBackHandler(isOpen, handleDismiss, 'first-time-user-guide');

  const [currentStep, setCurrentStep] = useState(0);
  const [canInstall, setCanInstall] = useState(() => AndroidPwaManager.canPromptInstall());
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    return AndroidPwaManager.subscribe((can) => {
      setCanInstall(can);
    });
  }, []);

  // Keyboard Escape listener to dismiss and mark as completed
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const res = await AndroidPwaManager.promptInstall();
    if (res.outcome === 'accepted') {
      setInstallSuccess(true);
    }
  };

  const isAndroid = AndroidPwaManager.isAndroid();
  const isStandalone = AndroidPwaManager.isStandalone();

  const steps = [
    {
      badge: 'Android Phone First',
      title: 'Crafted Primarily for Your Android Phone',
      description:
        'VellumScribe is tailored specifically as a responsive, high-performance Android mobile workstation for notes, checklists, voice memos, and sketches.',
      highlights: [
        {
          icon: Smartphone,
          title: 'Single-Thumb Navigation',
          desc: 'Bottom navigation bar, Android Material FAB with quick speed-dial, and edge-to-edge safe area support.',
        },
        {
          icon: Zap,
          title: 'Sub-Millisecond Speed',
          desc: 'On-device relational SQLite database with instant search, zero latency, and battery-friendly operation.',
        },
      ],
    },
    {
      badge: 'Android Home Screen',
      title: 'Add to Your Android Home Screen',
      description:
        'Install VellumScribe to your Android phone for a full-screen native experience without browser URL bars, instant offline launch, and home screen icon.',
      highlights: [
        {
          icon: Download,
          title: 'Full-Screen Standalone App',
          desc: isStandalone
            ? 'Currently running in Standalone Android App mode!'
            : 'Runs edge-to-edge like a native APK with Android system navigation & dark theme styling.',
        },
        {
          icon: Share2,
          title: 'Android Native Share Sheet',
          desc: 'Share notes, Markdown text, or audio directly to WhatsApp, Gmail, Messages, Drive, and Slack.',
        },
      ],
      showInstallAction: true,
    },
    {
      badge: '100% Offline & Private',
      title: 'On-Device Storage & Local Voice Transcription',
      description:
        'Your notes, voice recordings, and sketches never leave your phone without your permission. Fast offline speech transcription and local backups are ready immediately.',
      highlights: [
        {
          icon: Mic,
          title: 'Live Voice Memos & Transcription',
          desc: 'Capture audio recordings with on-device speech-to-text and live waveforms with zero cloud requirement.',
        },
        {
          icon: Shield,
          title: 'Local Privacy & Keystore',
          desc: 'No account needed. Optional PIN lock, AES encryption, and multi-cloud sync whenever you choose.',
        },
      ],
    },
    {
      badge: 'Offline AI vs Cloud AI',
      title: 'Privacy-Preserving On-Device Transcription',
      description:
        'Choose how you want AI to assist you: 100% on-device Whisper models with zero network traffic, or optional Cloud Gemini for multimodal documents.',
      highlights: [
        {
          icon: Mic,
          title: 'On-Device Whisper Models',
          desc: 'Download Tiny (~30MB) or Base (~55MB) models once to transcribe meetings and voice memos offline anywhere.',
        },
        {
          icon: Sparkles,
          title: 'Optional Gemini Cloud Assist',
          desc: 'High-order summaries, action item extraction, and handwriting OCR with client-side API key encryption.',
        },
      ],
    },
  ];

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleDismiss();
    }
  };

  return (
    <div
      id="first-time-user-guide-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs select-none animate-fade-in"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2.5">
            <AppLogo size="md" showText={false} />
            <div>
              <span className="text-xs font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                {step.badge}
              </span>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Android Quick Start
              </h2>
            </div>
          </div>

          <button
            id="onboarding-close-x-btn"
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            title="Close Guide"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 font-serif-editorial">
              {step.title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Highlights Grid */}
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

          {/* Step 1 Install Callout */}
          {step.showInstallAction && !isStandalone && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-indigo-950 dark:text-indigo-200 text-xs">
                  {canInstall ? 'Ready for One-Tap Install' : 'Install via Android Browser'}
                </p>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 truncate">
                  {canInstall
                    ? 'Add directly to your Android launcher now'
                    : 'Tap browser menu (⋮) -> "Add to Home screen"'}
                </p>
              </div>

              {canInstall ? (
                <button
                  type="button"
                  id="onboarding-install-pwa-btn"
                  onClick={handleInstallClick}
                  disabled={installSuccess}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shrink-0 transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  {installSuccess ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Installed</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Install App</span>
                    </>
                  )}
                </button>
              ) : (
                <span className="text-xs font-mono font-semibold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 rounded-lg shrink-0">
                  Android Chrome
                </span>
              )}
            </div>
          )}

          {/* Stepper Dots */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'w-6 bg-zinc-900 dark:bg-zinc-100'
                    : 'w-1.5 bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-zinc-50/50 dark:bg-[#0f0f12] border-t border-zinc-100 dark:border-zinc-850 flex items-center justify-between">
          <button
            id="onboarding-skip-intro-btn"
            onClick={handleDismiss}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Skip Intro
          </button>

          <button
            id="onboarding-next-btn"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
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
