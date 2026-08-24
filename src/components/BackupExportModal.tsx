import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  FileJson,
  FileText,
  Check,
  AlertCircle,
  Database,
  Copy,
  Share2,
} from 'lucide-react';
import { SQLiteDatabase } from '../lib/storage';
import { NativeBridge } from '../lib/nativeBridge';

interface BackupExportModalProps {
  onClose: () => void;
  onDataRestored: () => void;
}

export const BackupExportModal: React.FC<BackupExportModalProps> = ({
  onClose,
  onDataRestored,
}) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportJson = async () => {
    const backupJson = SQLiteDatabase.exportFullBackup();
    const fileName = `VellumScribe_Backup_${new Date().toISOString().split('T')[0]}.json`;
    const res = await NativeBridge.shareOrDownloadFile(
      fileName,
      backupJson,
      'application/json',
      'Share VellumScribe Backup'
    );
    setFeedback({
      type: res.success ? 'success' : 'error',
      message: res.message,
    });
  };

  const handleExportMarkdownZip = async () => {
    const notes = SQLiteDatabase.getNotes();
    const markdownContent = notes
      .map(
        (n) =>
          `# ${n.title || 'Untitled'}\n\n` +
          `*Category: ${n.event_id} | Created: ${n.created_at} | Tags: ${(n.tags || []).join(', ')}*\n\n` +
          `${n.body}`
      )
      .join('\n\n\n' + '='.repeat(40) + '\n\n\n');

    const fileName = `VellumScribe_Notes_${new Date().toISOString().split('T')[0]}.md`;
    const res = await NativeBridge.shareOrDownloadFile(
      fileName,
      markdownContent,
      'text/markdown',
      'Share Markdown Notes'
    );
    setFeedback({
      type: res.success ? 'success' : 'error',
      message: res.message,
    });
  };

  const handleCopyJson = async () => {
    const backupJson = SQLiteDatabase.exportFullBackup();
    const success = await NativeBridge.copyText(backupJson);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = SQLiteDatabase.importFullBackup(text);
        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          onDataRestored();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      } catch (err: any) {
        setFeedback({ type: 'error', message: `Failed to read file: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Backup &amp; Export
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Export Options */}
        <div className="space-y-2.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Export Data
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportJson}
              className="p-3 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl text-left space-y-1 transition-colors group"
            >
              <FileJson className="w-4 h-4 text-zinc-700 dark:text-zinc-300 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Full JSON Backup</p>
              <p className="text-[10px] text-zinc-400">All notes, audio, OCR &amp; tags</p>
            </button>

            <button
              onClick={handleExportMarkdownZip}
              className="p-3 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl text-left space-y-1 transition-colors group"
            >
              <FileText className="w-4 h-4 text-zinc-700 dark:text-zinc-300 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Markdown File</p>
              <p className="text-[10px] text-zinc-400">Clean formatted documents</p>
            </button>
          </div>

          <button
            onClick={handleCopyJson}
            className="w-full py-2 px-3 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl text-xs text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Raw Backup JSON'}</span>
          </button>
        </div>

        {/* Import Backup */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-850">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Import / Restore Backup
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-2xs transition-opacity"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Select Backup File (.json)</span>
          </button>
          <p className="text-[10px] text-zinc-400 text-center">
            Restoring merges imported data safely with existing records.
          </p>
        </div>
      </div>
    </div>
  );
};
