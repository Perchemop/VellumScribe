import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Trash2,
  Check,
  PenTool,
  Eraser,
  Download,
} from 'lucide-react';

interface SketchCanvasModalProps {
  initialDataUrl?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

const COLOR_PALETTE = [
  '#09090b', // Ink Black
  '#71717a', // Zinc Gray
  '#3b82f6', // Blueprint Blue
  '#ef4444', // Crimson Red
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
];

export const SketchCanvasModal: React.FC<SketchCanvasModalProps> = ({
  initialDataUrl,
  onSave,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#09090b');
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [history, setHistory] = useState<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high DPI canvas resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill clean off-white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        saveHistoryState();
      };
      img.src = initialDataUrl;
    } else {
      saveHistoryState();
    }
  }, []);

  const saveHistoryState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-15), snapshot]);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : strokeColor;
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistoryState();
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHist = [...history];
    newHist.pop(); // Remove current
    const previous = newHist[newHist.length - 1];
    if (previous) {
      ctx.putImageData(previous, 0, 0);
      setHistory(newHist);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistoryState();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Sketch Note Canvas
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={history.length <= 1}
              title="Undo stroke"
              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClear}
              title="Clear canvas"
              className="p-1.5 text-zinc-500 hover:text-rose-600 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Toolbar */}
        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-[#16161a] border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tool mode */}
          <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-zinc-800 p-0.5 rounded-lg">
            <button
              onClick={() => setTool('pen')}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                tool === 'pen'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <PenTool className="w-3 h-3" />
              <span>Pen</span>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                tool === 'eraser'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Eraser className="w-3 h-3" />
              <span>Eraser</span>
            </button>
          </div>

          {/* Color palette */}
          <div className="flex items-center gap-1.5">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setStrokeColor(color);
                  setTool('pen');
                }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  strokeColor === color && tool === 'pen'
                    ? 'scale-125 ring-2 ring-offset-1 ring-zinc-500'
                    : 'hover:scale-110 opacity-80'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Line width */}
          <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
            <span>Size</span>
            <input
              type="range"
              min="1"
              max="12"
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="w-20 accent-zinc-800 dark:accent-zinc-200 cursor-pointer"
            />
          </div>
        </div>

        {/* Drawing Surface */}
        <div className="p-4 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-80 bg-white rounded-xl shadow-xs cursor-crosshair touch-none border border-zinc-200/80 dark:border-zinc-800/80"
          />
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 bg-zinc-50/50 dark:bg-[#121215] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">
            Draw ideas, diagrams, handwritten annotations
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-2xs transition-opacity"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Attach Sketch</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
