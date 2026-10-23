import React, { useState, useRef, useEffect } from 'react';
import {
  Camera as CameraIcon,
  Upload,
  Sparkles,
  Check,
  X,
  Loader2,
  Copy,
  RotateCcw,
  Key,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { GeminiApiService } from '../lib/geminiService';
import { SQLiteDatabase } from '../lib/storage';
import { OcrScanRecord } from '../types';
import { MediaRepository, SecureMediaRepository } from '../lib/MediaRepository';
import { UnlockSessionManager } from '../lib/UnlockSessionManager';
import { AiStudioKeyModal } from './AiStudioKeyModal';
import { CloudAiConsentModal } from './CloudAiConsentModal';
import { PrivacyManager, CloudAiConsentRequiredError } from '../lib/privacyManager';
import { useModalBackHandler } from '../lib/modalBackStack';
import { generatePrefixedId } from '../lib/uuid';
import { AppLogger } from '../lib/logger';
import { asErrorLike } from '../lib/errorLike';

interface OcrScannerModalProps {
  noteId: number;
  onOcrExtracted: (text: string, scanRecord: OcrScanRecord, mode: 'append' | 'replace') => void;
  onClose: () => void;
}

export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({
  noteId,
  onOcrExtracted,
  onClose,
}) => {
  useModalBackHandler(true, onClose, 'ocr-scanner-modal');
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [hasKeyError, setHasKeyError] = useState(false);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeFileInputRef = useRef<HTMLInputElement | null>(null);

  const startCameraStream = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Webcam streaming not supported in this browser. Please use native photo capture or file upload.'
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.warn(
        'OcrScannerModal',
        'Camera stream could not start, fallback to native camera intent:',
        e
      );
      setCameraActive(false);
      setCameraError(
        'Live viewfinder unavailable. Click "Take Photo with Camera" below to capture using your device camera.'
      );
    }
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Start / stop camera stream on web if in camera tab and no image is captured yet
  useEffect(() => {
    if (activeTab === 'camera' && !selectedImage && !Capacitor.isNativePlatform()) {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [activeTab, selectedImage]);

  // Native / Capacitor camera capture (works seamlessly in APK and mobile)
  const handleNativeCameraCapture = async () => {
    setCameraError(null);
    try {
      // 1. Try Capacitor Camera plugin first
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (photo?.dataUrl) {
        setSelectedImage(photo.dataUrl);
        stopCameraStream();
        return;
      }
    } catch (_err) {
      const err = asErrorLike(_err);
      AppLogger.warn(
        'OcrScannerModal',
        'Capacitor camera failed or dismissed, falling back to input capture:',
        err
      );
      // If permission was denied or cancelled, try native file capture input
      if (nativeFileInputRef.current) {
        nativeFileInputRef.current.click();
      }
    }
  };

  // Capture current frame from WebRTC video element
  const captureWebcamPhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setSelectedImage(dataUrl);
      stopCameraStream();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        stopCameraStream();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetake = () => {
    setSelectedImage(null);
    setOcrText('');
    setOcrStatus(null);
    if (activeTab === 'camera') {
      startCameraStream();
    }
  };

  const handleRunOcr = async () => {
    if (!selectedImage) return;

    if (!PrivacyManager.hasCloudAiConsent()) {
      setShowConsentModal(true);
      return;
    }

    setIsProcessing(true);
    setHasKeyError(false);
    setIsQuotaError(false);
    setOcrStatus('Extracting handwritten text with Gemini AI...');
    try {
      const res = await GeminiApiService.scanHandwrittenNote(selectedImage, 'image/jpeg');
      setOcrText(res.ocrText);
      setOcrStatus(`Extracted via ${res.source || 'Gemini AI'}`);
      setHasKeyError(false);
      setIsQuotaError(false);
    } catch (_err) {
      const err = asErrorLike(_err);
      AppLogger.error('OcrScannerModal', 'OCR scan failed', err);
      if (err instanceof CloudAiConsentRequiredError) {
        setOcrStatus('Privacy consent required before sending image to Cloud AI.');
        setShowConsentModal(true);
        return;
      }
      const msg = err.message || 'Failed to connect';
      const isQuota =
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('rate limit') ||
        msg.includes('429');

      if (isQuota) {
        setIsQuotaError(true);
        setHasKeyError(true);
        setOcrStatus(
          'Google Gemini quota limit reached. Please provide a custom API key or try again in a few moments.'
        );
      } else {
        setIsQuotaError(false);
        setOcrStatus(`Extraction error: ${msg}`);
        if (
          msg.includes('key') ||
          msg.includes('permission') ||
          msg.includes('unauthorized') ||
          msg.includes('403')
        ) {
          setHasKeyError(true);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = async (mode: 'append' | 'replace') => {
    if (!ocrText) return;
    try {
      let mediaKey: string | undefined = undefined;
      if (selectedImage) {
        mediaKey = `${generatePrefixedId('ocr')}.jpg`;
        const response = await fetch(selectedImage);
        const blob = await response.blob();

        const sessionKey = UnlockSessionManager.getSessionKey(noteId);
        if (sessionKey) {
          await SecureMediaRepository.putEncryptedWithKey(mediaKey, blob, sessionKey);
        } else {
          await MediaRepository.putBinary(mediaKey, blob);
        }
      }

      const scanRecord = SQLiteDatabase.addOcrScan({
        note_id: noteId,
        image_path: `/storage/notes/scans/ocr_${Date.now()}.jpg`,
        ocr_text: ocrText,
        created_at: new Date().toISOString(),
        media_key: mediaKey,
        confidence: 0.98,
      });

      onOcrExtracted(ocrText, scanRecord, mode);
      onClose();
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.error('OcrScannerModal', 'Failed to save OCR scan to database:', e);
      setOcrStatus(`Storage Error: ${e.message}`);
    }
  };

  const handleCopy = () => {
    if (!ocrText) return;
    navigator.clipboard.writeText(ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-xs">
      <div
        id="ocr-scanner-modal"
        className="w-full max-w-2xl bg-white dark:bg-[#111115] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-fade-in"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100">
              <CameraIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                Scan Document or Note
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Capture handwriting, print, or documents with camera and extract text via Gemini AI
              </p>
            </div>
          </div>
          <button
            id="close-ocr-modal-btn"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-2 border-b border-zinc-100 dark:border-zinc-800 text-xs">
          <button
            id="tab-camera-btn"
            onClick={() => {
              setActiveTab('camera');
              if (!selectedImage) startCameraStream();
            }}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'camera'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            <CameraIcon className="w-3.5 h-3.5" />
            Device Camera
          </button>
          <button
            id="tab-upload-btn"
            onClick={() => {
              setActiveTab('upload');
              stopCameraStream();
            }}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Image / Gallery
          </button>
        </div>

        {/* Hidden native camera capture input for Android fallback */}
        <input
          ref={nativeFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-minimal-scrollbar">
          {/* Viewfinder or Image Preview */}
          {selectedImage ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 flex items-center justify-center max-h-64 sm:max-h-72">
                <img
                  src={selectedImage}
                  alt="Captured Document"
                  referrerPolicy="no-referrer"
                  className="w-full h-full max-h-64 sm:max-h-72 object-contain"
                />
                <button
                  onClick={handleRetake}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-black/70 hover:bg-black text-white text-xs font-semibold rounded-xl backdrop-blur-md flex items-center gap-1.5 transition-all shadow-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retake Photo
                </button>
              </div>
            </div>
          ) : activeTab === 'camera' ? (
            <div className="space-y-3">
              {/* WebRTC Video preview or APK action container */}
              <div className="relative w-full h-56 sm:h-64 bg-zinc-950 rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-zinc-800">
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {!cameraActive && (
                  <div className="p-6 text-center space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center mx-auto">
                      <CameraIcon className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-zinc-200">Camera Ready</p>
                      <p className="text-xs text-zinc-400">
                        {cameraError ||
                          'Use your device camera to photograph notes, whiteboards, or documents.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {cameraActive && (
                  <button
                    onClick={captureWebcamPhoto}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-2"
                  >
                    <CameraIcon className="w-4 h-4" />
                    Snap Photo
                  </button>
                )}

                <button
                  id="native-camera-launch-btn"
                  onClick={handleNativeCameraCapture}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-2"
                >
                  <CameraIcon className="w-4 h-4" />
                  Take Photo with Camera
                </button>

                <button
                  onClick={() => nativeFileInputRef.current?.click()}
                  className="px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  Choose from Gallery
                </button>
              </div>
            </div>
          ) : (
            /* Upload tab */
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Select Document or Photo to Extract
                </p>
                <p className="text-xs text-zinc-400">
                  Supports JPEG, PNG, WEBP handwriting photos up to 15MB
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs cursor-pointer hover:bg-zinc-800 dark:hover:bg-white transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Browse Files / Gallery</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Extraction Action & Output Box */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Extracted Text Output
                </span>
                {ocrStatus && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                    • {ocrStatus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasKeyError && (
                  <button
                    onClick={() => setShowAiKeyModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs animate-pulse"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>{isQuotaError ? 'Add AI Key (Quota Full)' : 'Set AI Key'}</span>
                  </button>
                )}
                <button
                  id="run-ocr-extract-btn"
                  onClick={handleRunOcr}
                  disabled={isProcessing || !selectedImage}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs disabled:opacity-40 transition-all"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>
                    {isProcessing ? 'Extracting with Gemini AI...' : 'Extract Text with AI'}
                  </span>
                </button>
              </div>
            </div>

            <textarea
              id="ocr-text-result-box"
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Captured handwritten or printed text will appear here. You can review and edit before inserting into your note..."
              className="w-full h-32 p-3.5 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-mono leading-relaxed text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            onClick={handleCopy}
            disabled={!ocrText}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApply('append')}
              disabled={!ocrText}
              className="px-3.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              Append to Note
            </button>
            <button
              onClick={() => handleApply('replace')}
              disabled={!ocrText}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs disabled:opacity-40 transition-colors"
            >
              Replace Note Content
            </button>
          </div>
        </div>
      </div>

      {showAiKeyModal && (
        <AiStudioKeyModal
          isOpen={showAiKeyModal}
          onClose={() => setShowAiKeyModal(false)}
          onSuccess={() => {
            setShowAiKeyModal(false);
            setHasKeyError(false);
            setIsQuotaError(false);
            handleRunOcr();
          }}
          title={
            isQuotaError
              ? 'Google Gemini Quota Limit Reached'
              : 'AI Provider & Intelligence Backend'
          }
          description={
            isQuotaError
              ? 'The free shared Gemini API quota has been exhausted. You can add your own free Gemini API key from Google AI Studio to continue unlimited OCR scanning.'
              : undefined
          }
        />
      )}

      {showConsentModal && (
        <CloudAiConsentModal
          providerName="Google Gemini AI"
          operationDescription="Handwriting and Printed Document Optical Character Recognition (OCR) using Gemini Flash Vision"
          isOpen={showConsentModal}
          onConfirm={() => {
            setShowConsentModal(false);
            handleRunOcr();
          }}
          onCancel={() => {
            setShowConsentModal(false);
            setOcrStatus('OCR scanning cancelled: Cloud AI consent declined.');
          }}
        />
      )}
    </div>
  );
};
