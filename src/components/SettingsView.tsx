import React, { useState } from 'react';
import { Cloud, Sparkles, Shield } from 'lucide-react';
import { SimpleSettingsPanel } from './settings/SimpleSettingsPanel';

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'security'>('cloud');

  return (
    <div id="dedicated-settings-view" className="h-full flex flex-col bg-[#fafaf9] dark:bg-[#0c0c0e] overflow-hidden">
      {/* Simple subtab navigation */}
      <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] flex items-center gap-2 flex-wrap">
        {[
          { id: 'cloud', label: 'Cloud', icon: <Cloud className="w-4 h-4" /> },
          { id: 'ai', label: 'AI', icon: <Sparkles className="w-4 h-4" /> },
          { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`subtab-${tab.id}-btn`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === tab.id
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-minimal-scrollbar p-6 space-y-6">
        {activeTab === 'cloud' && <SimpleSettingsPanel />}
        {activeTab === 'ai' && (
          <div id="panel-ai-studio" role="tabpanel" aria-labelledby="subtab-ai-key-btn" className="max-w-5xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Cloud AI transcription
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    Transcribe voice recordings using Google AI Studio (Gemini).
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/40">
                {!PrivacyManager.hasCloudAiConsent() ? (
                  <>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Cloud AI transcription is off
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Enable cloud AI to transcribe using Google AI Studio (Gemini). Your voice
                          data is sent to Google for processing.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-2xs"
                    >
                      Enable cloud AI
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          Cloud AI transcription is on
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Recordings are transcribed using Google AI Studio (Gemini).
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'security' && (
          <div id="panel-security" role="tabpanel" aria-labelledby="subtab-security-btn" className="max-w-5xl mx-auto space-y-6">
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
                <button
                  type="button"
                  className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors flex items-center gap-2"
                >
                  <Lock className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
                  <span>Set note PIN</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsView;