import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NoteRecord } from '../types';
import { AppLogger } from '../lib/logger';

export class ReminderService {
  private static permissionsRequested = false;

  /**
   * Request notification permissions from the OS or browser
   */
  public static async requestPermission(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') return true;
        const req = await LocalNotifications.requestPermissions();
        return req.display === 'granted';
      } else if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
          const res = await Notification.requestPermission();
          return res === 'granted';
        }
      }
    } catch (e) {
      AppLogger.warn('ReminderService', 'Failed to request notification permission', e);
    }
    return false;
  }

  /**
   * Schedules an authoritative OS notification for a note
   */
  public static async scheduleReminder(note: NoteRecord): Promise<void> {
    if (!note.reminder_at) return;
    const reminderDate = new Date(note.reminder_at);
    if (isNaN(reminderDate.getTime()) || reminderDate.getTime() <= Date.now()) {
      return;
    }

    try {
      const hasPerm = await this.requestPermission();
      if (!hasPerm) {
        AppLogger.warn(
          'ReminderService',
          'Notification permission not granted; scheduled reminder may not show at OS level.'
        );
      }

      if (Capacitor.isNativePlatform()) {
        // Cancel any previous reminder for this note first
        await this.cancelReminder(note.id);

        const bodySnippet = note.body
          ? note.body
              .replace(/[#*`_~]/g, '')
              .trim()
              .slice(0, 120)
          : 'You have a scheduled note reminder in VellumScribe';

        await LocalNotifications.schedule({
          notifications: [
            {
              id: note.id,
              title: note.title ? `Reminder: ${note.title}` : 'VellumScribe Note Reminder',
              body: bodySnippet,
              schedule: {
                at: reminderDate,
                allowWhileIdle: true,
              },
              sound: 'beep.wav',
              extra: {
                noteId: note.id,
              },
            },
          ],
        });
        AppLogger.info(
          'ReminderService',
          `Scheduled OS-level reminder for note ${note.id} at ${reminderDate.toISOString()}`
        );
      }
    } catch (err) {
      AppLogger.error(
        'ReminderService',
        `Failed to schedule native reminder for note ${note.id}`,
        err
      );
    }
  }

  /**
   * Cancels any scheduled notification for a note
   */
  public static async cancelReminder(noteId: number): Promise<void> {
    if (!noteId) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.cancel({
          notifications: [{ id: noteId }],
        });
        AppLogger.info('ReminderService', `Cancelled native reminder for note ${noteId}`);
      }
    } catch (err) {
      AppLogger.warn('ReminderService', `Error cancelling reminder for note ${noteId}`, err);
    }
  }

  /**
   * Reconciles all future note reminders on application startup
   */
  public static async reconcileReminders(notes: NoteRecord[]): Promise<void> {
    try {
      const now = Date.now();
      const futureNotes = notes.filter(
        (n) =>
          n.reminder_at &&
          new Date(n.reminder_at).getTime() > now &&
          n.status !== 'archived' &&
          n.status !== 'trash'
      );

      if (Capacitor.isNativePlatform()) {
        // Check existing pending notifications
        const pending = await LocalNotifications.getPending();
        const pendingIds = new Set(pending.notifications.map((p) => p.id));

        for (const note of futureNotes) {
          if (!pendingIds.has(note.id)) {
            await this.scheduleReminder(note);
          }
        }
      }
      AppLogger.info('ReminderService', `Reconciled ${futureNotes.length} future reminder(s)`);
    } catch (err) {
      AppLogger.error('ReminderService', 'Failed to reconcile reminders on startup', err);
    }
  }
}
