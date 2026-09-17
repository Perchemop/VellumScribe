import React, { useState, useEffect } from 'react';
import { Bot, Info, ShieldCheck } from 'lucide-react';
import { AiProvenanceService, AiProvenanceRecord } from '../services/AiProvenanceService';

interface AiProvenanceBadgeProps {
  entityType: 'note' | 'checklist' | 'transcript' | 'summary';
  entityId: number;
  className?: string;
}

export const AiProvenanceBadge: React.FC<AiProvenanceBadgeProps> = ({
  entityType,
  entityId,
  className = '',
}) => {
  const [provenance, setProvenance] = useState<AiProvenanceRecord | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (entityId) {
      const rec = AiProvenanceService.getProvenance(entityType, entityId);
      setProvenance(rec);
    }
  }, [entityType, entityId]);

  if (!provenance) return null;

  const dateFormatted = new Date(provenance.generated_at).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 text-[10px] font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
        title="AI-assisted content. Click to view provenance."
      >
        <Bot className="w-3 h-3 text-indigo-500" />
        <span>AI Generated</span>
        <Info className="w-2.5 h-2.5 opacity-70" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            className="absolute top-full left-0 mt-1 w-64 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 text-xs text-zinc-700 dark:text-zinc-300 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Data Provenance</span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-400">Model:</span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200">{provenance.model_id}</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-400">Provider:</span>
                <span className="capitalize text-zinc-800 dark:text-zinc-200">{provenance.provider}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-zinc-400">Generated:</span>
                <span className="text-zinc-800 dark:text-zinc-200">{dateFormatted}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
