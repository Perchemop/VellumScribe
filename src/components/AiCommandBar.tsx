import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight, X, AlertTriangle, Check, Search, Calendar, CheckSquare, FileText } from 'lucide-react';
import { AiAction, AiCommandResult } from '../types';
import { AiCommandService } from '../services/AiCommandService';
import { PrivacyBadge } from './PrivacyBadge';

interface AiCommandBarProps {
  placeholder?: string;
  onExecuteAction: (action: AiAction) => void | Promise<void>;
  onSearchQuery?: (query: string) => void;
  className?: string;
}

export const AiCommandBar: React.FC<AiCommandBarProps> = ({
  placeholder = 'Tell VellumScribe what you want to capture…',
  onExecuteAction,
  onSearchQuery,
  className = '',
}) => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingResult, setPendingResult] = useState<AiCommandResult | null>(null);
  const [confirmationAction, setConfirmationAction] = useState<AiAction | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isProcessing) return;

    setIsProcessing(true);
    try {
      const result = await AiCommandService.parseCommand(text);
      setPendingResult(result);

      if (result.actions.length > 0) {
        const firstAction = result.actions[0];
        if (firstAction.requiresConfirmation) {
          setConfirmationAction(firstAction);
        } else {
          // Direct execution
          await handleExecute(firstAction);
          setInput('');
          setPendingResult(null);
          setIsExpanded(false);
        }
      }
    } catch (err) {
      console.error('AiCommandBar error', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecute = async (action: AiAction) => {
    if (action.type === 'search_notes' && onSearchQuery) {
      onSearchQuery(action.payload.query);
    } else {
      await onExecuteAction(action);
    }
    setConfirmationAction(null);
    setPendingResult(null);
    setInput('');
    setIsExpanded(false);
  };

  const renderActionIcon = (type: AiAction['type']) => {
    switch (type) {
      case 'create_reminder':
        return <Calendar className="w-4 h-4 text-amber-500" />;
      case 'create_checklist':
        return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      case 'search_notes':
        return <Search className="w-4 h-4 text-indigo-500" />;
      case 'delete_note':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-500" />;
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center bg-white dark:bg-[#151518] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs focus-within:border-zinc-400 dark:focus-within:border-zinc-600 focus-within:ring-2 focus-within:ring-zinc-200/50 dark:focus-within:ring-zinc-800/50 transition-all"
      >
        <div className="pl-3.5 pr-2 py-2 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
          <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (!isExpanded && e.target.value) setIsExpanded(true);
          }}
          onFocus={() => setIsExpanded(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-hidden min-h-[44px]"
        />

        <div className="flex items-center gap-1.5 pr-2 shrink-0">
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                setPendingResult(null);
                setConfirmationAction(null);
              }}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
              aria-label="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <PrivacyBadge mode="local" size="sm" />

          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="min-h-[36px] px-3 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-all"
            aria-label="Submit command"
          >
            {isProcessing ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span className="hidden sm:inline">Capture</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Confirmation Guardrail Modal for Destructive Actions */}
      {confirmationAction && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3.5 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-900 rounded-xl shadow-lg z-30 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-rose-900 dark:text-rose-200">
                Confirmation Required
              </p>
              <p className="text-rose-700 dark:text-rose-300 mt-0.5">
                {confirmationAction.description}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => handleExecute(confirmationAction)}
                  className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors text-xs flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmationAction(null)}
                  className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
