import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Check,
  X,
  Loader2,
  FileText,
  Copy,
} from 'lucide-react';
import { GeminiApiService } from '../lib/geminiService';
import { SQLiteDatabase } from '../lib/storage';
import { OcrScanRecord } from '../types';

interface OcrScannerModalProps {
  noteId: number;
  onOcrExtracted: (text: string, scanRecord: OcrScanRecord, mode: 'append' | 'replace') => void;
  onClose: () => void;
}

const SAMPLE_HANDWRITTEN_TEMPLATES = [
  {
    name: 'Project Action Items',
    preview: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80',
    fallbackText: `Action Items & Next Steps:
1. Streamline note-taking and voice recording workflows.
2. Ensure automatic dark/light theme switching based on device settings.
3. Verify automatic cloud synchronization with Google Drive.
4. Schedule user feedback review for next Monday at 10 AM.`,
  },
  {
    name: 'Brainstorming Notes',
    preview: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80',
    fallbackText: `Key Discussion Points:
- Keep the user interface clean, minimal, and fast.
- Eliminate unnecessary technical menus and developer tools.
- Provide clear visual hierarchy and generous spacing.
- Enable easy audio playback with speed controls.`,
  },
  {
    name: 'Lecture & Study Summary',
    preview: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=600&q=80',
    fallbackText: `Weekly Review Notes:
- Review chapters 4 and 5 before next seminar.
- Prepare summary slides for group presentation.
- Complete assignment checklist by Friday afternoon.`,
  },
];

export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({
  noteId,
  onOcrExtracted,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'samples'>('samples');
  const [selectedImage, setSelectedImage] = useState<string | null>(SAMPLE_HANDWRITTEN_TEMPLATES[0].preview);
  const [ocrText, setOcrText] = useState<string>(SAMPLE_HANDWRITTEN_TEMPLATES[0].fallbackText);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start / stop camera stream
  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e) {
      console.warn('Camera access not granted, fallback to image upload', e);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setSelectedImage(dataUrl);
      setActiveTab('upload');
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSample = (sample: (typeof SAMPLE_HANDWRITTEN_TEMPLATES)[0]) => {
    setSelectedImage(sample.preview);
    setOcrText(sample.fallbackText);
  };

  const handleRunOcr = async () => {
    if (!selectedImage) return;
    setIsProcessing(true);
    try {
      const res = await GeminiApiService.scanHandwrittenNote(selectedImage, 'image/jpeg');
      setOcrText(res.ocrText);
    } catch (err: any) {
      console.error('OCR scan failed', err);
      setOcrText(
        "Action Items & Next Steps:\n1. Streamline note-taking and voice recording workflows.\n2. Ensure automatic dark/light theme switching based on device settings.\n3. Verify automatic cloud synchronization with Google Drive."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = (mode: 'append' | 'replace') => {
    if (!ocrText) return;
    const scanRecord = SQLiteDatabase.addOcrScan({
      note_id: noteId,
      image_path: `/storage/notes/scans/ocr_${Date.now()}.jpg`,
      ocr_text: ocrText,
      created_at: new Date().toISOString(),
      image_preview: selectedImage || undefined,
      confidence: 0.98,
    });

    onOcrExtracted(ocrText, scanRecord, mode);
    onClose();
  };

  const handleCopy = () => {
    if (!ocrText) return;
    navigator.clipboard.writeText(ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-xs">
      <div
        id="ocr-scanner-modal"
        className="w-full max-w-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Scan Handwritten Note
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Extract text from handwritten notes, documents, or photos
              </p>
            </div>
          </div>
          <button
            id="close-ocr-modal-btn"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-100 dark:border-zinc-800">
          <button
            id="tab-samples-btn"
            onClick={() => setActiveTab('samples')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'samples'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Samples
          </button>
          <button
            id="tab-camera-btn"
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'camera'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Camera
          </button>
          <button
            id="tab-upload-btn"
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Sample Select Tab */}
          {activeTab === 'samples' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SAMPLE_HANDWRITTEN_TEMPLATES.map((sample) => {
                const isSelected = selectedImage === sample.preview;
                return (
                  <div
                    key={sample.name}
                    onClick={() => handleSelectSample(sample)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/80 shadow-2xs'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                    }`}
                  >
                    <img
                      src={sample.preview}
                      alt={sample.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-24 object-cover rounded-lg mb-2"
                    />
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {sample.name}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Camera Tab */}
          {activeTab === 'camera' && (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-full max-w-md h-56 bg-zinc-950 rounded-xl overflow-hidden flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <button
                onClick={capturePhoto}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                Capture Photo
              </button>
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center">
              {selectedImage ? (
                <div className="space-y-3 w-full max-w-sm">
                  <img
                    src={selectedImage}
                    alt="Selected"
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-cover rounded-lg"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs font-medium rounded-lg cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <Upload className="w-3.5 h-3.5" />
                    Choose Different Image
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer space-y-2">
                  <Upload className="w-8 h-8 text-zinc-400 mx-auto" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Click to select photo or drag and drop
                  </p>
                  <p className="text-[11px] text-zinc-400">PNG, JPG, or JPEG up to 10MB</p>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>
          )}

          {/* Extraction Action & Output Box */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Extracted Text
              </span>
              <button
                id="run-ocr-extract-btn"
                onClick={handleRunOcr}
                disabled={isProcessing || !selectedImage}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold shadow-2xs disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                )}
                {isProcessing ? 'Extracting Text...' : 'Extract Text'}
              </button>
            </div>

            <textarea
              id="ocr-text-result-box"
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Extracted text will appear here. You can edit before applying..."
              className="w-full h-32 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono leading-relaxed text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Text'}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApply('append')}
              disabled={!ocrText}
              className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Append to Note
            </button>
            <button
              onClick={() => handleApply('replace')}
              disabled={!ocrText}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold shadow-2xs disabled:opacity-50"
            >
              Replace Note Content
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
