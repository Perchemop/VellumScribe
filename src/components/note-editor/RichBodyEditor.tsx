import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Edit3, Eye } from 'lucide-react';

interface RichBodyEditorProps {
  body: string;
  onBodyChange: (newBody: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export const RichBodyEditor: React.FC<RichBodyEditorProps> = ({
  body,
  onBodyChange,
  placeholder = 'Start writing your notes in Markdown...',
  readOnly = false,
}) => {
  const [isPreview, setIsPreview] = useState(false);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const charCount = body.length;

  return (
    <div className="space-y-2">
      {/* Mode toggle bar */}
      <div className="flex items-center justify-between text-xs text-zinc-500 pb-1">
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700/80">
          <button
            type="button"
            onClick={() => setIsPreview(false)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              !isPreview
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setIsPreview(true)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              isPreview
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        </div>

        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
          {wordCount} words • {charCount} chars
        </div>
      </div>

      {/* Editor or Preview Pane */}
      {isPreview ? (
        <div className="min-h-[220px] p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 prose prose-zinc dark:prose-invert max-w-none text-sm">
          {body ? (
            <ReactMarkdown>{body}</ReactMarkdown>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400 italic">No note content to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={placeholder}
          disabled={readOnly}
          rows={12}
          className="w-full p-4 rounded-xl bg-transparent border border-zinc-200/80 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed resize-y custom-minimal-scrollbar"
          aria-label="Note content in Markdown"
        />
      )}
    </div>
  );
};
