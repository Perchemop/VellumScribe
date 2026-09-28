import React from 'react';
import { ShieldCheck, BookOpen, ExternalLink, Smartphone, Lock, HardDrive, CheckCircle2 } from 'lucide-react';
import { CURRENT_APP_VERSION } from '../../lib/appUpdateManager';

interface AboutPanelProps {
  onOpenOnboardingGuide?: () => void;
}

export const AboutPanel: React.FC<AboutPanelProps> = ({ onOpenOnboardingGuide }) => {
  return (
    <div className="space-y-6">
      {/* Brand Header */}
      <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 text-center sm:text-left flex flex-col sm:flex-row items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-emerald-500/10">
          V
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h3 className="text-xl font-bold text-zinc-100">VellumScribe</h3>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              v{CURRENT_APP_VERSION}
            </span>
          </div>
          <p className="text-xs text-zinc-400 max-w-md">
            Offline-first multimodal note-taking studio with hardware-backed encryption, relational SQLite persistence,
            and privacy-preserving AI assistance.
          </p>
        </div>
      </div>

      {/* Quick Launchers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {onOpenOnboardingGuide && (
          <button
            onClick={onOpenOnboardingGuide}
            className="p-4 rounded-xl bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 text-left transition flex items-center gap-3.5 group"
          >
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-200">First-Time User Guide</div>
              <div className="text-xs text-zinc-400">Replay onboarding checklist & features</div>
            </div>
          </button>
        )}

        <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-200">Open-Source & FOSS</div>
            <div className="text-xs text-zinc-400">Licensed under the MIT License</div>
          </div>
        </div>
      </div>

      {/* Architecture Highlights */}
      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
        <h4 className="text-sm font-semibold text-zinc-200">Core Architecture Pillars</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-400">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span><strong>Relational SQLite:</strong> Authoritative local storage with 12 schema migrations and full-text search.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span><strong>Zero-Knowledge Encryption:</strong> AES-256-GCM + 600k PBKDF2 note locking.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span><strong>Vendored Whisper Engine:</strong> On-device speech recognition via native C++ NDK library.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span><strong>Durable Process-Death Recovery:</strong> Background chunk checkpoints and automatic WAL flushes.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
