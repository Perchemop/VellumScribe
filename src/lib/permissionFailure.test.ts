import { describe, expect, it } from 'vitest';
import {
  cameraPermissionMessage,
  classifyPermissionFailure,
  microphonePermissionMessage,
} from './permissionFailure';

describe('classifyPermissionFailure', () => {
  it('treats a blocked permission prompt as denied', () => {
    expect(classifyPermissionFailure({ name: 'NotAllowedError' })).toBe('denied');
    expect(classifyPermissionFailure({ name: 'PermissionDeniedError' })).toBe('denied');
    expect(classifyPermissionFailure({ name: 'SecurityError' })).toBe('denied');
  });

  it('treats a missing device as not-found', () => {
    expect(classifyPermissionFailure({ name: 'NotFoundError' })).toBe('not-found');
    expect(classifyPermissionFailure({ name: 'DevicesNotFoundError' })).toBe('not-found');
  });

  it('falls back to unknown for other failures', () => {
    expect(classifyPermissionFailure(new Error('boom'))).toBe('unknown');
    expect(classifyPermissionFailure(undefined)).toBe('unknown');
  });
});

describe('cameraPermissionMessage', () => {
  it('explains the blocked state and keeps the gallery path open', () => {
    expect(cameraPermissionMessage('denied')).toContain('blocked');
    expect(cameraPermissionMessage('denied')).toContain('gallery');
  });

  it('explains a missing camera', () => {
    expect(cameraPermissionMessage('not-found')).toContain('No camera');
  });

  it('keeps the generic fallback for other failures', () => {
    expect(cameraPermissionMessage('unknown')).toContain('Live viewfinder unavailable');
  });
});

describe('microphonePermissionMessage', () => {
  it('explains the blocked state and suggests the upload fallback', () => {
    expect(microphonePermissionMessage('denied')).toContain('blocked');
    expect(microphonePermissionMessage('denied')).toContain('upload an audio file');
  });

  it('explains a missing microphone', () => {
    expect(microphonePermissionMessage('not-found')).toContain('No microphone');
  });

  it('keeps the generic fallback for other failures', () => {
    expect(microphonePermissionMessage('unknown')).toContain('Could not access microphone');
  });
});
