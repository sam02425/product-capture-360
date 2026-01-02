/**
 * Frontend Production-Grade Logger
 *
 * Features:
 * - Action tracking with timing
 * - Error capturing with stack traces
 * - Performance metrics
 * - Browser console integration
 * - Sends critical logs to backend
 * - Local storage buffering for offline scenarios
 */

class FrontendLogger {
  constructor() {
    this.actionTimers = new Map();
    this.logBuffer = [];
    this.maxBufferSize = 100;
    this.sessionId = this.generateSessionId();

    // Capture global errors
    this.setupGlobalErrorHandlers();
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateActionId() {
    return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setupGlobalErrorHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.error('Unhandled error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack,
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise,
      });
    });
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  createLogEntry(level, message, context = {}, metadata = {}) {
    return {
      timestamp: this.formatTimestamp(),
      level,
      message,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context,
      metadata,
    };
  }

  writeToConsole(level, entry) {
    const styles = {
      DEBUG: 'color: #00bcd4',
      INFO: 'color: #4caf50',
      WARN: 'color: #ff9800',
      ERROR: 'color: #f44336',
      FATAL: 'color: #9c27b0; font-weight: bold',
    };

    const style = styles[level] || '';
    console.log(`%c[${level}] ${entry.message}`, style, entry);
  }

  addToBuffer(entry) {
    this.logBuffer.push(entry);

    // Keep buffer size under limit
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Store in localStorage for persistence
    try {
      localStorage.setItem('appLogs', JSON.stringify(this.logBuffer.slice(-50)));
    } catch (e) {
      // localStorage might be full or disabled
    }
  }

  async sendToBackend(entry) {
    // Only send WARN, ERROR, FATAL to backend to reduce network traffic
    if (!['WARN', 'ERROR', 'FATAL'].includes(entry.level)) {
      return;
    }

    try {
      await fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      // Silently fail - don't want logging to break the app
      console.error('Failed to send log to backend:', error);
    }
  }

  // Core logging methods
  debug(message, context = {}, metadata = {}) {
    const entry = this.createLogEntry('DEBUG', message, context, metadata);
    this.writeToConsole('DEBUG', entry);
    this.addToBuffer(entry);
  }

  info(message, context = {}, metadata = {}) {
    const entry = this.createLogEntry('INFO', message, context, metadata);
    this.writeToConsole('INFO', entry);
    this.addToBuffer(entry);
  }

  warn(message, context = {}, metadata = {}) {
    const entry = this.createLogEntry('WARN', message, context, metadata);
    this.writeToConsole('WARN', entry);
    this.addToBuffer(entry);
    this.sendToBackend(entry);
  }

  error(message, context = {}, metadata = {}) {
    const entry = this.createLogEntry('ERROR', message, context, metadata);
    this.writeToConsole('ERROR', entry);
    this.addToBuffer(entry);
    this.sendToBackend(entry);
  }

  fatal(message, context = {}, metadata = {}) {
    const entry = this.createLogEntry('FATAL', message, context, metadata);
    this.writeToConsole('FATAL', entry);
    this.addToBuffer(entry);
    this.sendToBackend(entry);
  }

  // Action tracking
  startAction(actionName, context = {}) {
    const actionId = this.generateActionId();
    this.actionTimers.set(actionId, {
      startTime: Date.now(),
      actionName,
      context,
    });

    this.info(`Action started: ${actionName}`, {
      ...context,
      action: actionName,
      actionId,
    });

    return actionId;
  }

  endAction(actionId, success = true, metadata = {}) {
    const actionData = this.actionTimers.get(actionId);
    if (!actionData) {
      this.warn('Attempted to end unknown action', { actionId });
      return;
    }

    const duration = Date.now() - actionData.startTime;
    this.actionTimers.delete(actionId);

    const entry = this.createLogEntry(
      success ? 'INFO' : 'ERROR',
      `Action ${success ? 'completed' : 'failed'}: ${actionData.actionName}`,
      {
        ...actionData.context,
        action: actionData.actionName,
        actionId,
      },
      {
        ...metadata,
        duration,
        success,
      }
    );

    this.writeToConsole(entry.level, entry);
    this.addToBuffer(entry);

    if (!success) {
      this.sendToBackend(entry);
    }
  }

  failAction(actionId, error, metadata = {}) {
    const actionData = this.actionTimers.get(actionId);
    if (!actionData) {
      this.warn('Attempted to fail unknown action', { actionId });
      return;
    }

    const duration = Date.now() - actionData.startTime;
    this.actionTimers.delete(actionId);

    const entry = this.createLogEntry(
      'ERROR',
      `Action failed: ${actionData.actionName}`,
      {
        ...actionData.context,
        action: actionData.actionName,
        actionId,
      },
      {
        ...metadata,
        duration,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }
    );

    this.writeToConsole('ERROR', entry);
    this.addToBuffer(entry);
    this.sendToBackend(entry);
  }

  // Performance tracking
  trackPerformance(metricName, value, metadata = {}) {
    this.info(`Performance: ${metricName}`, {}, {
      metric: metricName,
      value,
      unit: metadata.unit || 'ms',
      ...metadata,
    });
  }

  // API call tracking
  trackAPICall(method, url, statusCode, duration, metadata = {}) {
    const level = statusCode >= 400 ? 'ERROR' : 'INFO';
    const entry = this.createLogEntry(
      level,
      `API ${method} ${url}`,
      {},
      {
        method,
        url,
        statusCode,
        duration,
        ...metadata,
      }
    );

    this.writeToConsole(level, entry);
    this.addToBuffer(entry);

    if (level === 'ERROR') {
      this.sendToBackend(entry);
    }
  }

  // Get logs from buffer
  getLogs(filterLevel = null) {
    if (filterLevel) {
      return this.logBuffer.filter(log => log.level === filterLevel);
    }
    return [...this.logBuffer];
  }

  // Export logs as JSON
  exportLogs() {
    const dataStr = JSON.stringify(this.logBuffer, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Clear logs
  clearLogs() {
    this.logBuffer = [];
    try {
      localStorage.removeItem('appLogs');
    } catch (e) {
      // Ignore
    }
    this.info('Logs cleared');
  }

  // Get session info
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      startTime: this.sessionId.split('-')[1],
      url: window.location.href,
      userAgent: navigator.userAgent,
      logCount: this.logBuffer.length,
      activeActions: this.actionTimers.size,
    };
  }
}

// Create global logger instance
window.appLogger = new FrontendLogger();

// Convenience global functions
window.logDebug = (msg, ctx, meta) => window.appLogger.debug(msg, ctx, meta);
window.logInfo = (msg, ctx, meta) => window.appLogger.info(msg, ctx, meta);
window.logWarn = (msg, ctx, meta) => window.appLogger.warn(msg, ctx, meta);
window.logError = (msg, ctx, meta) => window.appLogger.error(msg, ctx, meta);
window.logFatal = (msg, ctx, meta) => window.appLogger.fatal(msg, ctx, meta);

// Log page load
window.appLogger.info('Application loaded', {
  page: window.location.pathname,
});
