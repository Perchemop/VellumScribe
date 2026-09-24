import React, { useState } from 'react';
import { Sparkles, Check, X, AlertTriangle, ArrowRight, Tag, Clock, Calendar, CheckSquare, FileText } from 'lucide-react';
import { AiMutationProposal, ProposedAction, UniversalCaptureService } from '../services/UniversalCaptureService';

interface AiProposalPreviewModalProps {
  proposal: AiMutationProposal | null;
  isOpen: boolean;
  onClose: () => void;
  onExecuted: (result: { createdNoteIds: number[]; modifiedNoteIds: number[] }) => void;
}

export const AiProposalPreviewModal: React.FC<AiProposalPreviewModalProps> = ({
  proposal,
  isOpen,
  onClose,
  onExecuted,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeActions, setActiveActions] = useState<ProposedAction[]>(proposal?.actions || []);

  if (!isOpen || !proposal) return null;

  const handleToggleAction = (actionId: string) => {
    setActiveActions((prev) =>
      prev.some((a) => a.id === actionId)
        ? prev.filter((a) => a.id !== actionId)
        : [...prev, ...(proposal.actions.filter((a) => a.id === actionId))]
    );
  };

  const handleApprove = async () => {
    setIsExecuting(true);
    try {
      const approvedProposal: AiMutationProposal = {
        ...proposal,
        actions: activeActions,
      };
      const result = await UniversalCaptureService.executeProposal(approvedProposal);
      if (result.success) {
        onExecuted({
          createdNoteIds: result.createdNoteIds,
          modifiedNoteIds: result.modifiedNoteIds,
        });
        onClose();
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const renderActionIcon = (type: ProposedAction['type']) => {
    switch (type) {
      case 'create_reminder':
        return <Calendar className="w-4 h-4 text-amber-500" />;
      case 'create_checklist':
        return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      case 'delete_note':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                AI Intake Proposal
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Confidence: {Math.round(proposal.confidence * 100)}% • Source: {proposal.source}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explanation */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl text-xs text-zinc-700 dark:text-zinc-300">
          <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">Understanding</p>
          <p>{proposal.explanation}</p>
        </div>

        {/* Inferred Tags */}
        {proposal.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-zinc-400">Tags:</span>
            {proposal.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] rounded-md font-medium"
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Proposed Actions List */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Proposed Actions ({activeActions.length})
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {proposal.actions.map((action) => {
              const isSelected = activeActions.some((a) => a.id === action.id);
              return (
                <div
                  key={action.id}
                  onClick={() => handleToggleAction(action.id)}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50'
                      : 'bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{renderActionIcon(action.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {action.description}
                    </p>
                    {action.requiresConfirmation && (
                      <span className="inline-block mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                        Requires explicit confirmation
                      </span>
                    )}
                  </div>
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={activeActions.length === 0 || isExecuting}
            onClick={handleApprove}
            className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 transition-all"
          >
            {isExecuting ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Approve & Save</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
