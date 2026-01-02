import fs from 'fs';
import path from 'path';

/**
 * Production-Grade Logging System
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, FATAL)
 * - File rotation (daily logs)
 * - Structured logging with context
 * - Action tracking with timing
 * - Error stack traces
 * - Performance metrics
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  action?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  duration?: number;
  metadata?: any;
}

class Logger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logDir: string;
  private currentLogFile: string = '';
  private actionTimers: Map<string, number> = new Map();

  constructor() {
    // Setup log directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    this.logDir = path.join(homeDir, '.product-capture-360', 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.rotateLogFile();

    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.logLevel = LogLevel[envLevel as keyof typeof LogLevel];
    }
  }

  private rotateLogFile() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.currentLogFile = path.join(this.logDir, `app-${date}.log`);
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(entry: LogEntry): string {
    return JSON.stringify(entry) + '\n';
  }

  private writeLog(entry: LogEntry) {
    // Check if we need to rotate log file (new day)
    const date = new Date().toISOString().split('T')[0];
    if (!this.currentLogFile.includes(date)) {
      this.rotateLogFile();
    }

    const formatted = this.formatLogEntry(entry);

    // Write to file asynchronously
    fs.appendFile(this.currentLogFile, formatted, (err) => {
      if (err) {
        console.error('Failed to write log:', err);
      }
    });

    // Also write to console in development
    if (process.env.NODE_ENV !== 'production') {
      const color = this.getColorForLevel(entry.level);
      console.log(color, formatted.trim(), '\x1b[0m');
    }
  }

  private getColorForLevel(level: string): string {
    switch (level) {
      case 'DEBUG': return '\x1b[36m'; // Cyan
      case 'INFO': return '\x1b[32m';  // Green
      case 'WARN': return '\x1b[33m';  // Yellow
      case 'ERROR': return '\x1b[31m'; // Red
      case 'FATAL': return '\x1b[35m'; // Magenta
      default: return '\x1b[0m';       // Reset
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, metadata?: any, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context,
      metadata,
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    this.writeLog(entry);
  }

  // Public logging methods
  debug(message: string, context?: LogContext, metadata?: any) {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  info(message: string, context?: LogContext, metadata?: any) {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  warn(message: string, context?: LogContext, metadata?: any) {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  error(message: string, context?: LogContext, metadata?: any, error?: Error) {
    this.log(LogLevel.ERROR, message, context, metadata, error);
  }

  fatal(message: string, context?: LogContext, metadata?: any, error?: Error) {
    this.log(LogLevel.FATAL, message, context, metadata, error);
  }

  // Action tracking with timing
  startAction(actionId: string, actionName: string, context?: LogContext) {
    this.actionTimers.set(actionId, Date.now());
    this.info(`Action started: ${actionName}`, {
      ...context,
      action: actionName,
      actionId,
    });
  }

  endAction(actionId: string, actionName: string, success: boolean, context?: LogContext, metadata?: any) {
    const startTime = this.actionTimers.get(actionId);
    const duration = startTime ? Date.now() - startTime : undefined;
    this.actionTimers.delete(actionId);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: success ? 'INFO' : 'ERROR',
      message: `Action ${success ? 'completed' : 'failed'}: ${actionName}`,
      context: {
        ...context,
        action: actionName,
        actionId,
      },
      duration,
      metadata,
    };

    this.writeLog(entry);
  }

  failAction(actionId: string, actionName: string, error: Error, context?: LogContext) {
    const startTime = this.actionTimers.get(actionId);
    const duration = startTime ? Date.now() - startTime : undefined;
    this.actionTimers.delete(actionId);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: `Action failed: ${actionName}`,
      context: {
        ...context,
        action: actionName,
        actionId,
      },
      duration,
      error: {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
    };

    this.writeLog(entry);
  }

  // Get logs for specific date
  getLogsForDate(date: string): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      const logFile = path.join(this.logDir, `app-${date}.log`);

      if (!fs.existsSync(logFile)) {
        resolve([]);
        return;
      }

      fs.readFile(logFile, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const lines = data.trim().split('\n');
        const entries: LogEntry[] = lines
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as LogEntry[];

        resolve(entries);
      });
    });
  }

  // Get recent logs (last N entries)
  getRecentLogs(count: number = 100): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.currentLogFile)) {
        resolve([]);
        return;
      }

      fs.readFile(this.currentLogFile, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const lines = data.trim().split('\n');
        const entries: LogEntry[] = lines
          .slice(-count)
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as LogEntry[];

        resolve(entries);
      });
    });
  }

  // Search logs
  searchLogs(query: string, date?: string): Promise<LogEntry[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const entries = await this.getLogsForDate(targetDate);

        const filtered = entries.filter(entry => {
          const searchText = JSON.stringify(entry).toLowerCase();
          return searchText.includes(query.toLowerCase());
        });

        resolve(filtered);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Get log directory for cleanup or viewing
  getLogDirectory(): string {
    return this.logDir;
  }

  // Clean up old logs (older than N days)
  cleanupOldLogs(daysToKeep: number = 30) {
    fs.readdir(this.logDir, (err, files) => {
      if (err) {
        this.error('Failed to read log directory for cleanup', {}, {}, err);
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        if (!file.startsWith('app-') || !file.endsWith('.log')) return;

        const filePath = path.join(this.logDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;

          if (stats.mtime < cutoffDate) {
            fs.unlink(filePath, (err) => {
              if (err) {
                this.error('Failed to delete old log file', {}, { file }, err);
              } else {
                this.info('Deleted old log file', {}, { file });
              }
            });
          }
        });
      });
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export helper for generating unique action IDs
export function generateActionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
