import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  FileText,
  Mic,
  Shield,
  Cloud,
  Layers,
  ArrowRight,
  X,
  CheckSquare,
  Lock,
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { StorageManager } from '../lib/storage';

interface FirstTimeUserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'vellumscribe_onboarding_completed_v1';

export function hasCompletedOnboarding(): boolean {
  return StorageManager.getItem<string>(STORAGE_KEY, 'false') === 'true';
}

export function markOnboardingCompleted(): void {
  StorageManager.setItem(STORAGE_KEY, 'true');
}

export const FirstTimeUserGuideModal: React.FC<FirstTimeUserGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      badge: 'Welcome to VellumScribe',
      title: 'Distraction-Free, Private & Fast Note Taking',
      description:
        'VellumScribe is designed from the ground up to give you full ownership of your notes, voice memos, and sketches with offline-first local storage.',
      highlights: [
        {
          icon: FileText,
          title: 'Markdown & Checklists',
          desc: 'Rich Markdown editing, interactive to-do lists, and touch sketch canvas.',
        },
        {
          icon: Shield,
          title: 'Private & Local by Default',
          desc: 'Your data stays on your device with optional PIN protection and hardware Keystore encryption.',
        },
      ],
    },
    {
      badge: 'Key Capabilities',
      title: 'Voice Notes, OCR & Cloud Integration',
      description:
        'Everything you create is saved locally and can optionally sync to your favorite cloud storage provider with conflict-free version tracking.',
      highlights: [
        {
          icon: Mic,
          title: 'Voice Memos & Transcripts',
          desc: 'Capture crystal-clear AAC voice recordings with automatic AI transcription when enabled.',
        },
        {
          icon: Cloud,
          title: 'Multi-Cloud Backup Support',
          desc: 'Sync to Google Drive, Dropbox, Microsoft OneDrive, iCloud, Nextcloud, or AWS S3.',
        },
      ],
    },
    {
      badge: 'You Are All Set',
      title: 'Start Writing Immediately',
      description:
        'You are currently in a fresh, clean workspace. Click the "+" button anytime to create your first note, event folder, or checklist.',
      highlights: [
        {
          icon: CheckSquare,
          title: 'Organize Your Way',
          desc: 'Group notes by events/categories, archive finished tasks, and search in milliseconds.',
        },
        {
          icon: Lock,
          title: '100% Privacy',
          desc: 'No tracking, no telemetry trackers, and full local backup/export to JSON or Markdown.',
        },
      ],
    },
  ];

  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      markOnboardingCompleted();
      onClose();
    }
  };

  const handleSkip = () => {
    markOnboardingCompleted();
    onClose();
  };

  return (
    <div
      id="first-time-user-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs select-none animate-fade-in"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2.5">
            <AppLogo size="md" showText={false} />
            <div>
              <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                {step.badge}
              </span>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Getting Started Guide
              </h2>
            </div>
          </div>

          <button
            onClick={handleSkip}
            title="Skip Guide"
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 font-serif-editorial">
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
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    {h.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
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
            onClick={handleSkip}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Skip Intro
          </button>

          <button
            id="onboarding-next-btn"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-colors"
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
