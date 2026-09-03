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

export class AppLogger {
  private static addEntry(level: LogLevel, category: string, message: string, data?: any) {
    const entry: LogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
