import { generatePrefixedId } from './uuid';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

const MAX_LOGS = 250;
const inMemoryLogs: LogEntry[] = [];
const logListeners: Set<(entry: LogEntry) => void> = new Set();

/**
 * Redaction utility to ensure credentials, tokens, PINs, and keys never appear in logs
 */
const SENSITIVE_KEY_REGEX = /(pin|password|secret|token|apikey|api_key|auth|credential|access_token|refresh_token|bearer|private_key)/i;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_\-\.+=/]+/gi;
const APIKEY_PATTERN_REGEX = /(?:AIza[0-9A-Za-z-_]{35}|gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})/g;

function sanitizeValue(value: any, depth = 0): any {
  if (depth > 5 || value === null || value === undefined) return value;
  
  if (typeof value === 'string') {
    return value
      .replace(BEARER_REGEX, 'Bearer [REDACTED]')
      .replace(APIKEY_PATTERN_REGEX, 'AIza[REDACTED]');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        sanitizedObj[k] = '[REDACTED]';
      } else {
        sanitizedObj[k] = sanitizeValue(v, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return value;
}

export class AppLogger {
  private static addEntry(level: LogLevel, category: string, rawMessage: string, rawData?: any) {
    // Automatically redact sensitive information
    const message = typeof rawMessage === 'string'
      ? rawMessage
          .replace(BEARER_REGEX, 'Bearer [REDACTED]')
          .replace(APIKEY_PATTERN_REGEX, 'AIza[REDACTED]')
      : String(rawMessage);
    
    const data = rawData !== undefined ? sanitizeValue(rawData) : undefined;

    const entry: LogEntry = {
      id: generatePrefixedId('log'),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    inMemoryLogs.unshift(entry);
    if (inMemoryLogs.length > MAX_LOGS) {
      inMemoryLogs.pop();
    }

    // Console output with clean formatting
    const prefix = `[${entry.timestamp.split('T')[1].slice(0, 8)}] [${category}]`;
    if (level === 'ERROR') {
      console.error(prefix, message, data !== undefined ? data : '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, data !== undefined ? data : '');
    } else if (level === 'INFO') {
      console.info(prefix, message, data !== undefined ? data : '');
    } else {
      console.debug(prefix, message, data !== undefined ? data : '');
    }

    logListeners.forEach(listener => {
      try {
        listener(entry);
      } catch (e) {
        // Ignore listener error
      }
    });
  }

  public static debug(category: string, message: string, data?: any) {
    this.addEntry('DEBUG', category, message, data);
  }

  public static info(category: string, message: string, data?: any) {
    this.addEntry('INFO', category, message, data);
  }

  public static warn(category: string, message: string, data?: any) {
    this.addEntry('WARN', category, message, data);
  }

  public static error(category: string, message: string, data?: any) {
    this.addEntry('ERROR', category, message, data);
  }

  public static getLogs(): LogEntry[] {
    return [...inMemoryLogs];
  }

  public static clearLogs() {
    inMemoryLogs.length = 0;
  }

  public static subscribe(listener: (entry: LogEntry) => void): () => void {
    logListeners.add(listener);
    return () => {
      logListeners.delete(listener);
    };
  }

  public static exportLogsAsJson(): string {
    return JSON.stringify(inMemoryLogs, null, 2);
  }
}
