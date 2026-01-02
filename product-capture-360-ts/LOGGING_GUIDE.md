# Production-Grade Logging System Guide

## Overview

The Product Capture 360 application includes a comprehensive production-grade logging system that tracks all actions, errors, and system state across both frontend and backend.

## Features

✅ **Multi-Level Logging** - DEBUG, INFO, WARN, ERROR, FATAL
✅ **Action Tracking** - Track operations with timing
✅ **File Rotation** - Daily log files with automatic cleanup
✅ **Structured Logging** - JSON format with context
✅ **Error Capturing** - Stack traces and error details
✅ **Performance Metrics** - Track operation duration
✅ **Frontend → Backend** - Critical logs sent to server
✅ **Log Viewer UI** - Web interface to view and search logs
✅ **Global Error Handling** - Captures unhandled errors

## Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| DEBUG | Detailed debugging information | "Loading image from URL", "Camera index: 0" |
| INFO | General information about operations | "Dataset loaded", "Camera connected" |
| WARN | Warning messages, non-critical issues | "Camera feed retry", "Empty dataset path" |
| ERROR | Error conditions that need attention | "Failed to load image", "API call failed" |
| FATAL | Severe errors that may crash the app | "Unhandled exception", "Critical system failure" |

## Backend Logging

### Location

Logs are stored in: `~/.product-capture-360/logs/`

Example: `~/.product-capture-360/logs/app-2026-01-01.log`

### Usage in Code

```typescript
import { logger, generateActionId } from './logger';

// Simple logging
logger.info('Server started', {}, { port: 5002 });
logger.error('Failed to connect', {}, {}, error);

// Action tracking with timing
const actionId = generateActionId();
logger.startAction(actionId, 'loadDataset', { path: '/path/to/dataset' });

try {
  // ... perform operation ...
  logger.endAction(actionId, 'loadDataset', true, { imageCount: 100 });
} catch (error) {
  logger.failAction(actionId, 'loadDataset', error, { path });
}
```

### Log Entry Format

```json
{
  "timestamp": "2026-01-01T12:34:56.789Z",
  "level": "INFO",
  "message": "Dataset loaded successfully",
  "context": {
    "path": "/Volumes/UBUNTU/images",
    "action": "loadDataset"
  },
  "metadata": {
    "totalFiles": 150,
    "imageFiles": 100
  },
  "duration": 1234
}
```

### API Endpoints

#### POST /api/logs/client
Receive logs from frontend
```javascript
fetch('/api/logs/client', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(logEntry)
});
```

#### GET /api/logs/recent?count=100
Get recent logs
```javascript
const response = await fetch('/api/logs/recent?count=200');
const { logs } = await response.json();
```

#### GET /api/logs/date/:date
Get logs for specific date
```javascript
const response = await fetch('/api/logs/date/2026-01-01');
const { logs } = await response.json();
```

#### POST /api/logs/search
Search logs
```javascript
const response = await fetch('/api/logs/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'error', date: '2026-01-01' })
});
```

#### GET /api/logs/directory
Get log directory path
```javascript
const response = await fetch('/api/logs/directory');
const { directory } = await response.json();
```

#### POST /api/logs/cleanup
Clean up old logs
```javascript
const response = await fetch('/api/logs/cleanup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ daysToKeep: 30 })
});
```

## Frontend Logging

### Usage

The logger is automatically initialized and available globally:

```javascript
// Simple logging
window.appLogger.info('User clicked button', { buttonId: 'submit' });
window.appLogger.error('API call failed', { endpoint: '/api/data' }, { error });

// Convenience functions
logInfo('Operation started');
logWarn('Deprecated feature used');
logError('Failed to save');

// Action tracking
const actionId = window.appLogger.startAction('uploadFile', { filename: 'test.jpg' });

try {
  // ... perform upload ...
  window.appLogger.endAction(actionId, true, { size: 12345 });
} catch (error) {
  window.appLogger.failAction(actionId, error);
}

// Performance tracking
window.appLogger.trackPerformance('pageLoadTime', 1234, { unit: 'ms' });

// API call tracking
window.appLogger.trackAPICall('GET', '/api/data', 200, 456);
```

### Global Error Capturing

The logger automatically captures:
- Unhandled JavaScript errors
- Unhandled promise rejections

These are logged as ERROR level and sent to backend.

### Local Storage

Frontend logs are buffered in localStorage for persistence (last 50 entries).

### Export Logs

```javascript
window.appLogger.exportLogs(); // Downloads logs as JSON file
```

### Clear Logs

```javascript
window.appLogger.clearLogs();
```

## Log Viewer UI

Access the log viewer at: `http://localhost:5002/logs.html`

### Features

1. **Real-time Updates** - Auto-refresh every 10 seconds
2. **Level Filtering** - Filter by DEBUG, INFO, WARN, ERROR, FATAL
3. **Search** - Search across all log fields
4. **Date Selection** - View logs for specific dates
5. **Statistics** - See counts by log level
6. **Export** - Download logs as JSON
7. **Color Coding** - Visual distinction by log level

### Usage

1. Open `http://localhost:5002/logs.html`
2. Select date or leave empty for today
3. Click "Refresh" to load logs
4. Use filter tags to filter by level
5. Use search box to find specific logs
6. Click "Export" to download logs

## Common Logging Patterns

### Pattern 1: API Call Logging

```javascript
const actionId = logger.startAction('apiCall', 'fetchUserData', { userId });

try {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();

  logger.endAction(actionId, 'fetchUserData', true, {
    userId,
    recordCount: data.length
  });

  return data;
} catch (error) {
  logger.failAction(actionId, 'fetchUserData', error, { userId });
  throw error;
}
```

### Pattern 2: File Operation Logging

```javascript
logger.info('Loading image', { path: imagePath });

try {
  const image = await loadImage(imagePath);
  logger.info('Image loaded successfully', {
    path: imagePath,
    width: image.width,
    height: image.height
  });
} catch (error) {
  logger.error('Failed to load image', { path: imagePath }, {}, error);
}
```

### Pattern 3: User Action Logging

```javascript
function handleButtonClick() {
  const actionId = window.appLogger.startAction('buttonClick', {
    button: 'exportData'
  });

  try {
    exportData();
    window.appLogger.endAction(actionId, true, {
      recordsExported: 100
    });
  } catch (error) {
    window.appLogger.failAction(actionId, error);
  }
}
```

## Log Maintenance

### Automatic Cleanup

Logs older than 30 days are automatically cleaned up on server start.

### Manual Cleanup

```bash
# Via API
curl -X POST http://localhost:5002/api/logs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"daysToKeep": 7}'

# Manual deletion
rm ~/.product-capture-360/logs/app-2025-*.log
```

### Viewing Logs via Terminal

```bash
# View today's logs
tail -f ~/.product-capture-360/logs/app-$(date +%Y-%m-%d).log

# View logs with jq for pretty printing
cat ~/.product-capture-360/logs/app-2026-01-01.log | jq

# Search for errors
grep '"level":"ERROR"' ~/.product-capture-360/logs/app-2026-01-01.log | jq

# Count logs by level
cat ~/.product-capture-360/logs/app-2026-01-01.log | jq -r .level | sort | uniq -c
```

## Environment Variables

```bash
# Set log level (DEBUG, INFO, WARN, ERROR, FATAL)
export LOG_LEVEL=DEBUG

# Production mode (no pretty printing)
export NODE_ENV=production
```

## Troubleshooting

### No Logs Appearing

1. Check log directory exists: `ls ~/.product-capture-360/logs/`
2. Check file permissions
3. Check LOG_LEVEL environment variable
4. Check browser console for frontend logs

### Logs Not Sending to Backend

1. Check network tab in browser dev tools
2. Verify `/api/logs/client` endpoint is accessible
3. Check for CORS errors
4. Verify logger is initialized: `console.log(window.appLogger)`

### Log Viewer Not Working

1. Ensure server is running
2. Check `/api/logs/recent` endpoint returns data
3. Check browser console for errors
4. Try manual API call: `fetch('/api/logs/recent').then(r => r.json())`

## Best Practices

1. **Use Appropriate Log Levels**
   - DEBUG for development only
   - INFO for normal operations
   - WARN for recoverable issues
   - ERROR for failures
   - FATAL for critical failures

2. **Include Context**
   - Always include relevant context (IDs, paths, etc.)
   - Use metadata for additional details
   - Include stack traces for errors

3. **Action Tracking**
   - Use for multi-step operations
   - Always call endAction or failAction
   - Include timing-sensitive operations

4. **Avoid Sensitive Data**
   - Don't log passwords, tokens, or API keys
   - Sanitize user data before logging
   - Use IDs instead of full objects

5. **Performance**
   - Frontend logs are async (non-blocking)
   - Only WARN/ERROR/FATAL sent to backend
   - Logs are buffered for efficiency

## Examples

See implementation examples in:
- `/Users/saumil/Desktop/360Photo/product-capture-360/product-capture-360-ts/src/logger.ts` - Backend logger
- `/Users/saumil/Desktop/360Photo/product-capture-360/product-capture-360-ts/public/logger.js` - Frontend logger
- `/Users/saumil/Desktop/360Photo/product-capture-360/product-capture-360-ts/public/annotator.js` - Usage examples

## Support

For issues or questions, check:
1. Log viewer UI: `http://localhost:5002/logs.html`
2. Log directory: `~/.product-capture-360/logs/`
3. Console output in development mode

---

**Version**: 1.0.0
**Last Updated**: 2026-01-01
