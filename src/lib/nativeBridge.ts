import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export class NativeBridge {
  public static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public static isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /**
   * Haptic vibration feedback
   */
  public static async hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
    try {
      if (this.isNative()) {
        const impactMap = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy,
        };
        await Haptics.impact({ style: impactMap[style] });
      } else if (navigator.vibrate) {
        navigator.vibrate(style === 'heavy' ? 25 : style === 'medium' ? 15 : 8);
      }
    } catch {
      // Haptics not supported or permitted, silent fallback
    }
  }

  public static async hapticNotification(type: 'success' | 'warning' | 'error' = 'success') {
    try {
      if (this.isNative()) {
        const typeMap = {
          success: NotificationType.Success,
          warning: NotificationType.Warning,
          error: NotificationType.Error,
        };
        await Haptics.notification({ type: typeMap[type] });
      } else if (navigator.vibrate) {
        navigator.vibrate(type === 'error' ? [30, 50, 30] : [15, 30, 15]);
      }
    } catch {
      // Silent fallback
    }
  }

  /**
   * Copy to clipboard with native fallback
   */
  public static async copyText(text: string): Promise<boolean> {
    try {
      if (this.isNative()) {
        await Clipboard.write({ string: text });
        this.hapticImpact('light');
        return true;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.hapticImpact('light');
        return true;
      }
    } catch (e) {
      console.warn('Clipboard write failed, attempting textarea fallback', e);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.hapticImpact('light');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Native Android Share or web download fallback for text & files
   */
  public static async shareOrDownloadFile(
    fileName: string,
    fileContent: string,
    mimeType: string,
    dialogTitle = 'Share Document'
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (this.isNative()) {
        // Write file to Cache directory for sharing via Android Intent
        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: fileContent,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        // Trigger native Android Share Sheet
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: dialogTitle,
            text: `VellumScribe Document: ${fileName}`,
            url: writeResult.uri,
            dialogTitle,
          });
          this.hapticNotification('success');
          return { success: true, message: 'Shared successfully via Android share sheet.' };
        }
      }
    } catch (err: any) {
      console.warn('Native share failed, falling back to browser download', err);
    }

    // Web download fallback
    try {
      const blob = new Blob([fileContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.hapticImpact('light');
      return { success: true, message: `File "${fileName}" saved successfully.` };
    } catch (e: any) {
      return { success: false, message: `Download failed: ${e.message}` };
    }
  }

  /**
   * Share plain text or note
   */
  public static async shareNoteText(title: string, text: string): Promise<boolean> {
    try {
      if (this.isNative()) {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title,
            text: `${title}\n\n${text}`,
            dialogTitle: `Share "${title}"`,
          });
          this.hapticImpact('light');
          return true;
        }
      } else if (navigator.share) {
        await navigator.share({
          title,
          text: `${title}\n\n${text}`,
        });
        return true;
      }
    } catch (e) {
      console.warn('Share dismissed or failed', e);
    }

    // Fallback to clipboard
    return this.copyText(`${title}\n\n${text}`);
  }
}
