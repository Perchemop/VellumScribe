import { App as CapApp } from '@capacitor/app';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { AppLogger } from './logger';
import { Capacitor } from '@capacitor/core';

/**
 * NativeLifecycle: Guarantees SQLite and media durability under Android process suspension and death.
 * Hooks into Capacitor App state changes (background/pause) and browser visibilitychange to trigger
 * WAL flush and persistent checkpoints.
 */
export function registerDurabilityHooks(): void {
  if (Capacitor.isPluginAvailable('App')) {
    CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) {
        try {
          const db = getDatabaseAdapter();
          if (db.flush) {
            await db.flush();
            AppLogger.info('NativeLifecycle', 'Flushed SQLite database on backgrounding');
          } else if (db.scheduleSave) {
            db.scheduleSave();
          }
        } catch (e) {
          AppLogger.warn('NativeLifecycle', 'Flush on background failed', e);
        }
      }
    }).catch((err) => {
      AppLogger.warn('NativeLifecycle', 'Could not attach appStateChange listener', err);
    });
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try {
          const db = getDatabaseAdapter();
          if (db.flush) {
            db.flush().catch((e) =>
              AppLogger.warn('NativeLifecycle', 'Web visibility flush warning', e)
            );
          }
        } catch (e) {
          AppLogger.warn('NativeLifecycle', 'Visibility change handler error', e);
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      try {
        const db = getDatabaseAdapter();
        if (db.flush) {
          db.flush().catch(() => {});
        }
      } catch {
        // Ignore on teardown
      }
    });
  }
}
