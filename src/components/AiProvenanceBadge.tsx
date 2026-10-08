import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { AiProvenanceService, AiProvenanceRecord } from '../services/AiProvenanceService';

interface AiProvenanceBadgeProps {
  entityType: 'note' | 'checklist' | 'transcript' | 'summary';
  entityId: number;
  className?: string;
}

/** Minimal AI marker — details only on long-press/title, no popup. */
export const AiProvenanceBadge: React.FC<AiProvenanceBadgeProps> = ({
  entityType,
  entityId,
  className = '',
}) => {
  const [provenance, setProvenance] = useState<AiProvenanceRecord | null>(null);

  useEffect(() => {
    if (entityId) {
      setProvenance(AiProvenanceService.getProvenance(entityType, entityId));
    }
  }, [entityType, entityId]);

  if (!provenance) return null;

  const title = `${provenance.provider || 'AI'} · ${provenance.model_id || 'model'} · ${new Date(
    provenance.generated_at
  ).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-medium ${className}`}
      title={title}
    >
      <Bot className="w-3 h-3 opacity-70" />
      <span>AI</span>
    </span>
  );
};
