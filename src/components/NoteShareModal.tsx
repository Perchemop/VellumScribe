import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  FileText,
  FileCode,
  QrCode,
  Printer,
  Download,
  CheckSquare,
  Sparkles,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { NoteRecord, EventRecord } from '../types';
import { NativeBridge } from '../lib/nativeBridge';
import { useModalBackHandler } from '../lib/modalBackStack';

interface NoteShareModalProps {
  note: NoteRecord;
  event?: EventRecord;
  onClose: () => void;
}

type ShareFormat = 'share_sheet' | 'markdown' | 'text' | 'qr' | 'json';

export const NoteShareModal: React.FC<NoteShareModalProps> = ({
  note,
  event,
  onClose,
}) => {
  useModalBackHandler(true, onClose, 'note-share-modal');
  const [activeFormat, setActiveFormat] = useState<ShareFormat>('share_sheet');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Generate plain text payload
  const formattedText = React.useMemo(() => {
    const lines: string[] = [];
    lines.push(`# ${note.title || 'Untitled Note'}`);
    if (event?.title) lines.push(`Category: ${event.title}`);
    if (note.tags && note.tags.length > 0) lines.push(`Tags: ${note.tags.join(', ')}`);
    lines.push(`Updated: ${new Date(note.updated_at || note.created_at).toLocaleString()}`);
    lines.push('');

    if (note.note_type === 'checklist' && note.checklist_items && note.checklist_items.length > 0) {
      lines.push('## Tasks');
      note.checklist_items.forEach((item) => {
        lines.push(`- [${item.completed ? 'x' : ' '}] ${item.text}`);
      });
      lines.push('');
    }

    if (note.body) {
      lines.push(note.body);
    }

    return lines.join('\n');
  }, [note, event]);

  // Generate Markdown payload
  const markdownText = React.useMemo(() => {
    return `---
title: "${note.title || 'Untitled Note'}"
category: "${event?.title || 'General'}"
date: "${note.created_at}"
tags: [${(note.tags || []).map((t) => `"${t}"`).join(', ')}]
type: "${note.note_type || 'text'}"
---

${formattedText}
`;
  }, [formattedText, note, event]);

  // Quick Action: Native Android Share Sheet
  const handleNativeShare = async () => {
    NativeBridge.hapticImpact('medium');
    const title = note.title || 'VellumScribe Note';
    const success = await NativeBridge.shareNoteText(title, formattedText);
    if (success) {
      setFeedback('Shared via Android system sheet.');
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Quick Action: Download or share Markdown file
  const handleShareMarkdownFile = async () => {
    const fileName = `${(note.title || 'note').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    const res = await NativeBridge.shareOrDownloadFile(
      fileName,
      markdownText,
      'text/markdown',
      `Share ${note.title || 'Note'}`
    );
    setFeedback(res.message);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Quick Action: Copy to clipboard
  const handleCopyText = async () => {
    const success = await NativeBridge.copyText(formattedText);
    if (success) {
      setCopied(true);
      setFeedback('Note copied to clipboard.');
      setTimeout(() => {
        setCopied(false);
        setFeedback(null);
      }, 2500);
    }
  };

  // Quick Action: JSON Export
  const handleShareJson = async () => {
    const jsonStr = JSON.stringify(note, null, 2);
    const fileName = `${(note.title || 'note').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const res = await NativeBridge.shareOrDownloadFile(
      fileName,
      jsonStr,
      'application/json',
      `Share Note JSON`
    );
    setFeedback(res.message);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Quick Action: Print
  const handlePrint = () => {
    NativeBridge.hapticImpact('light');
    window.print();
  };

  // QR Code payload (compact to ensure fast scannability)
  const qrPayload = React.useMemo(() => {
    const title = note.title || 'Note';
    let content = note.body;
    if (note.note_type === 'checklist' && note.checklist_items) {
      content = note.checklist_items.map((c) => `${c.completed ? '✓' : '○'} ${c.text}`).join('\n');
    }
    const combined = `${title}\n---\n${content}`;
    // Limit to 1200 chars for reliable camera scanning
    return combined.slice(0, 1200);
  }, [note]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div
        id="note-share-modal"
        className="w-full max-w-lg bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
              <Share2 className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                Share &amp; Export Note
              </h2>
              <p className="text-[11px] text-zinc-400">
                {note.title || 'Untitled Note'} &bull; {note.note_type === 'checklist' ? 'To-Do List' : 'Document'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex items-center gap-1.5 px-6 pt-3.5 pb-2 border-b border-zinc-100 dark:border-zinc-800/40 bg-zinc-50/30 dark:bg-zinc-900/20 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveFormat('share_sheet')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeFormat === 'share_sheet'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android Share</span>
          </button>

          <button
            onClick={() => setActiveFormat('qr')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeFormat === 'qr'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR Air-Drop</span>
          </button>

          <button
            onClick={() => setActiveFormat('markdown')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeFormat === 'markdown'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Markdown</span>
          </button>

          <button
            onClick={() => setActiveFormat('text')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeFormat === 'text'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Plain Text</span>
          </button>

          <button
            onClick={() => setActiveFormat('json')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              activeFormat === 'json'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="mx-6 mt-3 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fade-in">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto custom-minimal-scrollbar space-y-4">
          {activeFormat === 'share_sheet' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Direct System Share
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium">
                    Native Android Intent
                  </span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Send this note to any installed app (Gmail, Google Drive, WhatsApp, Messages, Slack, Keep, or local Files).
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleNativeShare}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-2 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Open Android Share Sheet</span>
                  </button>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleCopyText}
                  className="p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-left transition-colors flex items-center gap-3"
                >
                  <div className="p-2 rounded-xl bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {copied ? 'Copied!' : 'Copy Note'}
                    </div>
                    <div className="text-[10px] text-zinc-400">To clipboard</div>
                  </div>
                </button>

                <button
                  onClick={handlePrint}
                  className="p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-left transition-colors flex items-center gap-3"
                >
                  <div className="p-2 rounded-xl bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Print / PDF
                    </div>
                    <div className="text-[10px] text-zinc-400">System print view</div>
                  </div>
                </button>
              </div>

              {/* Text Preview */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-zinc-400">Document Excerpt</div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 text-xs text-zinc-700 dark:text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono">
                  {formattedText}
                </div>
              </div>
            </div>
          )}

          {activeFormat === 'qr' && (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-center">
                <QRCodeSVG
                  value={qrPayload}
                  size={190}
                  level="M"
                  includeMargin={true}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Instant Air-Gapped Device Scanning
                </div>
                <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                  Scan this code directly with another smartphone camera to transfer the note offline without internet, cloud, or pairing.
                </p>
              </div>
              <button
                onClick={handleCopyText}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Text' : 'Copy QR Payload'}</span>
              </button>
            </div>
          )}

          {activeFormat === 'markdown' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Standardized Markdown with frontmatter</span>
                <button
                  onClick={handleShareMarkdownFile}
                  className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Share .md File</span>
                </button>
              </div>
              <pre className="p-3 bg-zinc-900 text-zinc-200 dark:bg-black dark:text-zinc-300 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56">
                {markdownText}
              </pre>
            </div>
          )}

          {activeFormat === 'text' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Formatted plain text</span>
                <button
                  onClick={handleCopyText}
                  className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy to Clipboard'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={formattedText}
                rows={8}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-800 dark:text-zinc-200 font-mono resize-none focus:outline-hidden"
              />
            </div>
          )}

          {activeFormat === 'json' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Raw VellumScribe JSON record</span>
                <button
                  onClick={handleShareJson}
                  className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Share .json</span>
                </button>
              </div>
              <pre className="p-3 bg-zinc-900 text-emerald-400 dark:bg-black dark:text-emerald-400 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56">
                {JSON.stringify(note, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
