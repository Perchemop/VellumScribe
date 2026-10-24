import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDurabilityHooks } from './NativeLifecycle';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { App as CapApp } from '@capacitor/app';

vi.mock('./sqlite/databaseAdapter');
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: vi.fn(() => true),
    isNativePlatform: vi.fn(() => false),
  },
}));

const appListenerCalls: Array<{
  event: string;
  handler: (payload: { isActive: boolean }) => void;
}> = [];

describe('NativeLifecycle durability hooks (R-1.3)', () => {
  let mockFlush: ReturnType<typeof vi.fn>;
  let mockScheduleSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    appListenerCalls.length = 0;

    mockFlush = vi.fn();
    mockScheduleSave = vi.fn();
    vi.mocked(getDatabaseAdapter).mockReturnValue({
      flush: mockFlush,
      scheduleSave: mockScheduleSave,
    });
    vi.mocked(CapApp.addListener).mockImplementation((event: string, handler: any) => {
      appListenerCalls.push({ event, handler });
      return { remove: vi.fn() };
    });
  });

  it('registers an appStateChange listener when the App plugin is available', () => {
    registerDurabilityHooks();
    expect(appListenerCalls.some((c) => c.event === 'appStateChange')).toBe(true);
  });

  it('flushes SQLite when the app is backgrounded (isActive false)', () => {
    registerDurabilityHooks();
    const handler = appListenerCalls.find((c) => c.event === 'appStateChange')?.handler;
    expect(handler).toBeDefined();

    handler({ isActive: false });

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  it('does not flush when the app is foregrounded (isActive true)', () => {
    registerDurabilityHooks();
    const handler = appListenerCalls.find((c) => c.event === 'appStateChange')?.handler;
    expect(handler).toBeDefined();

    handler({ isActive: true });

    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('falls back to scheduleSave when the adapter has no flush method', () => {
    vi.mocked(getDatabaseAdapter).mockReturnValue({
      scheduleSave: mockScheduleSave,
    } as never);
    registerDurabilityHooks();
    const handler = appListenerCalls.find((c) => c.event === 'appStateChange')?.handler;
    expect(handler).toBeDefined();

    handler({ isActive: false });

    expect(mockScheduleSave).toHaveBeenCalledTimes(1);
    expect(mockFlush).not.toHaveBeenCalled();
  });
});
