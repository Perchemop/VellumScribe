import React from 'react';
import { Mic, Camera, PenTool, Trash2 } from 'lucide-react';
import { RecordingRecord, OcrScanRecord } from '../../types';

interface MediaAttachmentsProps {
  sketchData?: string;
  onOpenSketchModal: () => void;
  onRemoveSketch?: () => void;
  recordings: RecordingRecord[];
  onOpenAudioModal: () => void;
  ocrScans: OcrScanRecord[];
  onOpenOcrModal: () => void;
  readOnly?: boolean;
}

export const MediaAttachments: React.FC<MediaAttachmentsProps> = ({
  sketchData,
  onOpenSketchModal,
  onRemoveSketch,
  recordings,
  onOpenAudioModal,
  ocrScans,
  onOpenOcrModal,
  readOnly = false,
}) => {
  return (
    <div className="space-y-4">
      {/* Studio Action Launchers */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={onOpenAudioModal}
            className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition flex items-center gap-2"
          >
            <Mic className="w-4 h-4 text-emerald-500" />
            <span>Voice Memo &amp; Transcribe</span>
            {recordings.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                {recordings.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenOcrModal}
            className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition flex items-center gap-2"
          >
            <Camera className="w-4 h-4 text-cyan-500" />
            <span>Document Scan (OCR)</span>
            {ocrScans.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/10 text-cyan-400 font-mono text-[10px]">
                {ocrScans.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSketchModal}
            className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition flex items-center gap-2"
          >
            <PenTool className="w-4 h-4 text-amber-500" />
            <span>{sketchData ? 'Edit Sketch' : 'Draw Sketch'}</span>
          </button>
        </div>
      )}

      {/* Sketch Thumbnail Preview */}
      {sketchData && (
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={sketchData}
              alt="Hand-drawn sketch"
              className="w-16 h-12 object-contain bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer"
              onClick={onOpenSketchModal}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenSketchModal();
                }
              }}
            />
            <div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Hand-Drawn Sketch
              </div>
              <div className="text-[11px] text-zinc-400">Stored in encrypted media repository</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSketchModal}
              className="text-xs text-indigo-500 hover:underline font-medium"
            >
              Open
            </button>
            {!readOnly && onRemoveSketch && (
              <button
                type="button"
                onClick={onRemoveSketch}
                className="p-1.5 text-zinc-400 hover:text-rose-500 transition"
                title="Remove sketch"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
