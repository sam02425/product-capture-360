#!/usr/bin/env python3
"""
Production-grade logging configuration for Product Capture Application
Implements structured logging with rotation, monitoring, and error tracking
"""

import os
import sys
import json
import logging
import logging.handlers
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
from collections import defaultdict, deque
import threading
import time

class StructuredFormatter(logging.Formatter):
    """Custom formatter for structured JSON logging"""
    
    def __init__(self):
        super().__init__()
        
    def format(self, record):
        """Format log record as structured JSON"""
        log_entry = {
            'timestamp': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
            'thread': record.thread,
            'thread_name': record.threadName,
        }
        
        # Add exception information if present
        if record.exc_info:
            log_entry['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': traceback.format_exception(*record.exc_info)
            }
        
        # Add extra fields if present
        if hasattr(record, 'extra_data'):
            log_entry['extra'] = record.extra_data
            
        # Add context information
        if hasattr(record, 'context'):
            log_entry['context'] = record.context
            
        return json.dumps(log_entry, ensure_ascii=False)

class ErrorTracker:
    """Track error patterns and rates for monitoring"""
    
    def __init__(self, window_size=100):
        self.error_counts = defaultdict(int)
        self.error_history = deque(maxlen=window_size)
        self.critical_errors = deque(maxlen=50)
        self.lock = threading.Lock()
        self.start_time = time.time()
        
    def record_error(self, error_type: str, message: str, level: str):
        """Record an error for tracking"""
        with self.lock:
            timestamp = time.time()
            error_entry = {
                'timestamp': timestamp,
                'type': error_type,
                'message': message,
                'level': level
            }
            
            self.error_counts[error_type] += 1
            self.error_history.append(error_entry)
            
            if level in ['CRITICAL', 'ERROR']:
                self.critical_errors.append(error_entry)
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Get error statistics"""
        with self.lock:
            current_time = time.time()
            uptime = current_time - self.start_time
            
            # Calculate error rate (errors per hour)
            recent_errors = [e for e in self.error_history 
                           if current_time - e['timestamp'] < 3600]  # Last hour
            error_rate = len(recent_errors)
            
            return {
                'total_errors': len(self.error_history),
                'error_rate_per_hour': error_rate,
                'error_types': dict(self.error_counts),
                'critical_errors_count': len(self.critical_errors),
                'uptime_seconds': uptime,
                'recent_critical_errors': list(self.critical_errors)[-5:]  # Last 5 critical errors
            }
    
    def should_alert(self) -> bool:
        """Determine if an alert should be triggered"""
        with self.lock:
            current_time = time.time()
            
            # Alert if more than 10 errors in the last 5 minutes
            recent_errors = [e for e in self.error_history 
                           if current_time - e['timestamp'] < 300]  # Last 5 minutes
            
            if len(recent_errors) > 10:
                return True
                
            # Alert if any critical errors in the last minute
            recent_critical = [e for e in self.critical_errors 
                             if current_time - e['timestamp'] < 60]  # Last minute
            
            return len(recent_critical) > 0

class ProductCaptureLogger:
    """Production-grade logger for the Product Capture Application"""
    
    def __init__(self, log_dir: str = "logs", app_name: str = "product_capture"):
        self.log_dir = Path(log_dir)
        self.app_name = app_name
        self.error_tracker = ErrorTracker()
        
        # Create log directory
        self.log_dir.mkdir(exist_ok=True)
        
        # Setup loggers
        self._setup_loggers()
        
        # Get main logger
        self.logger = logging.getLogger(app_name)
        self.performance_logger = logging.getLogger(f"{app_name}.performance")
        
    def _setup_loggers(self):
        """Setup structured logging with rotation"""
        
        # Main application logger
        app_logger = logging.getLogger(self.app_name)
        app_logger.setLevel(logging.DEBUG)
        
        # Remove existing handlers to avoid duplicates
        app_logger.handlers.clear()
        
        # Console handler with colored output for development
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(console_formatter)
        app_logger.addHandler(console_handler)
        
        # File handler with JSON structured logging
        log_file = self.log_dir / f"{self.app_name}.log"
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(StructuredFormatter())
        app_logger.addHandler(file_handler)
        
        # Error-only file handler
        error_file = self.log_dir / f"{self.app_name}_errors.log"
        error_handler = logging.handlers.RotatingFileHandler(
            error_file,
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=3,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(StructuredFormatter())
        app_logger.addHandler(error_handler)
        
        # Performance logger for monitoring
        perf_logger = logging.getLogger(f"{self.app_name}.performance")
        perf_logger.setLevel(logging.INFO)
        perf_file = self.log_dir / f"{self.app_name}_performance.log"
        perf_handler = logging.handlers.RotatingFileHandler(
            perf_file,
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=2,
            encoding='utf-8'
        )
        perf_handler.setFormatter(StructuredFormatter())
        perf_logger.addHandler(perf_handler)
        
        # Prevent propagation to root logger
        app_logger.propagate = False
        perf_logger.propagate = False
    
    def log_with_context(self, level: str, message: str, context: Optional[Dict] = None, 
                        extra_data: Optional[Dict] = None):
        """Log with additional context and structured data"""
        record = logging.LogRecord(
            name=self.logger.name,
            level=getattr(logging, level.upper()),
            pathname="",
            lineno=0,
            msg=message,
            args=(),
            exc_info=None
        )
        
        if context:
            record.context = context
        if extra_data:
            record.extra_data = extra_data
            
        self.logger.handle(record)
        
        # Track errors
        if level.upper() in ['ERROR', 'CRITICAL']:
            self.error_tracker.record_error(
                error_type=context.get('error_type', 'Unknown') if context else 'Unknown',
                message=message,
                level=level.upper()
            )
    
    def log_error(self, error: Exception, context: Optional[Dict] = None, 
                  message: Optional[str] = None):
        """Log an error with full context and stack trace"""
        error_message = message or f"Error occurred: {str(error)}"
        error_context = context or {}
        error_context.update({
            'error_type': type(error).__name__,
            'error_class': error.__class__.__module__ + '.' + error.__class__.__name__
        })
        
        # Create log record with exception info
        self.logger.error(error_message, exc_info=True, extra={
            'context': error_context
        })
        
        # Track the error
        self.error_tracker.record_error(
            error_type=type(error).__name__,
            message=error_message,
            level='ERROR'
        )
    
    def log_performance(self, operation: str, duration: float, context: Optional[Dict] = None):
        """Log performance metrics"""
        perf_logger = logging.getLogger(f"{self.app_name}.performance")
        perf_context = {
            'operation': operation,
            'duration_ms': round(duration * 1000, 2),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        if context:
            perf_context.update(context)
            
        perf_logger.info(f"Performance: {operation} took {duration:.3f}s", extra={
            'context': perf_context
        })
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get application health status including error metrics"""
        error_stats = self.error_tracker.get_error_stats()
        
        # Determine health status
        health_status = "healthy"
        if error_stats['critical_errors_count'] > 0:
            health_status = "critical"
        elif error_stats['error_rate_per_hour'] > 50:
            health_status = "degraded"
        elif error_stats['error_rate_per_hour'] > 20:
            health_status = "warning"
            
        return {
            'status': health_status,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'error_metrics': error_stats,
            'should_alert': self.error_tracker.should_alert()
        }

# Global logger instance
_logger_instance = None

def get_logger() -> ProductCaptureLogger:
    """Get the global logger instance"""
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = ProductCaptureLogger()
    return _logger_instance

def setup_logging(log_dir: str = "logs", app_name: str = "product_capture") -> ProductCaptureLogger:
    """Setup and return the global logger instance"""
    global _logger_instance
    _logger_instance = ProductCaptureLogger(log_dir, app_name)
    return _logger_instance