import { asErrorLike } from './errorLike';

/**
 * How a browser/device permission request failed.
 *
 * The DOMException names are the ones thrown by `getUserMedia` and the
 * Capacitor camera plugin. Keeping the classification here means the camera
 * and microphone surfaces give the same answer for the same failure, and it
 * can be unit-tested without rendering a modal.
 */
export type PermissionFailure = 'denied' | 'not-found' | 'unknown';

export function classifyPermissionFailure(error: unknown): PermissionFailure {
  const { name } = asErrorLike(error);
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'not-found';
    default:
      return 'unknown';
  }
}

export function cameraPermissionMessage(failure: PermissionFailure): string {
  switch (failure) {
    case 'denied':
      return 'Camera access was blocked by your browser. You can still use "Take Photo with Camera" or upload an image from your gallery.';
    case 'not-found':
      return 'No camera was found on this device. Use "Take Photo with Camera" or upload an image from your gallery.';
    default:
      return 'Live viewfinder unavailable. Click "Take Photo with Camera" below to capture using your device camera.';
  }
}

export function microphonePermissionMessage(failure: PermissionFailure): string {
  switch (failure) {
    case 'denied':
      return 'Microphone access was blocked. Allow microphone permission in your browser or device settings, then try again, or upload an audio file instead.';
    case 'not-found':
      return 'No microphone was found on this device. Connect a microphone or upload an audio file instead.';
    default:
      return 'Could not access microphone.';
  }
}
