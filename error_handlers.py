#!/usr/bin/env python3
"""
Production-grade error handling system for Product Capture Application
Implements multi-layered error handling with proper HTTP status codes
"""

import functools
import traceback
from typing import Dict, Any, Optional, Callable, Tuple
from flask import jsonify, request
from datetime import datetime
import inspect
import time

from logging_config import get_logger

# Custom Exception Classes
class ProductCaptureError(Exception):
    """Base exception for Product Capture Application"""
    def __init__(self, message: str, error_code: str = "UNKNOWN", context: Optional[Dict] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.context = context or {}
        self.timestamp = datetime.utcnow()

class CameraError(ProductCaptureError):
    """Camera-related errors"""
    def __init__(self, message: str, camera_index: Optional[int] = None, context: Optional[Dict] = None):
        error_context = context or {}
        if camera_index is not None:
            error_context['camera_index'] = camera_index
        super().__init__(message, "CAMERA_ERROR", error_context)

class StorageError(ProductCaptureError):
    """Storage-related errors"""
    def __init__(self, message: str, path: Optional[str] = None, context: Optional[Dict] = None):
        error_context = context or {}
        if path:
            error_context['path'] = path
        super().__init__(message, "STORAGE_ERROR", error_context)

class SessionError(ProductCaptureError):
    """Session management errors"""
    def __init__(self, message: str, session_state: Optional[str] = None, context: Optional[Dict] = None):
        error_context = context or {}
        if session_state:
            error_context['session_state'] = session_state
        super().__init__(message, "SESSION_ERROR", error_context)

class ValidationError(ProductCaptureError):
    """Input validation errors"""
    def __init__(self, message: str, field: Optional[str] = None, value: Any = None, context: Optional[Dict] = None):
        error_context = context or {}
        if field:
            error_context['field'] = field
        if value is not None:
            error_context['invalid_value'] = str(value)
        super().__init__(message, "VALIDATION_ERROR", error_context)

class ConfigurationError(ProductCaptureError):
    """Configuration-related errors"""
    def __init__(self, message: str, config_key: Optional[str] = None, context: Optional[Dict] = None):
        error_context = context or {}
        if config_key:
            error_context['config_key'] = config_key
        super().__init__(message, "CONFIG_ERROR", error_context)

# Error Code Mappings
ERROR_HTTP_MAPPING = {
    "CAMERA_ERROR": 503,  # Service Unavailable
    "STORAGE_ERROR": 500,  # Internal Server Error
    "SESSION_ERROR": 409,  # Conflict
    "VALIDATION_ERROR": 400,  # Bad Request
    "CONFIG_ERROR": 500,  # Internal Server Error
    "UNKNOWN": 500,  # Internal Server Error
}

class ErrorHandler:
    """Centralized error handling system"""
    
    def __init__(self):
        self.logger = get_logger()
        self.error_counts = {}
        
    def handle_error(self, error: Exception, context: Optional[Dict] = None) -> Tuple[Dict[str, Any], int]:
        """Handle any error and return appropriate response"""
        
        # Determine error type and details
        if isinstance(error, ProductCaptureError):
            error_code = error.error_code
            message = error.message
            error_context = error.context
            http_status = ERROR_HTTP_MAPPING.get(error_code, 500)
        else:
            error_code = "UNEXPECTED_ERROR"
            message = f"Unexpected error: {str(error)}"
            error_context = {"error_type": type(error).__name__}
            http_status = 500
        
        # Add additional context
        if context:
            error_context.update(context)
            
        # Add request context if available
        try:
            if request:
                error_context.update({
                    'endpoint': request.endpoint,
                    'method': request.method,
                    'url': request.url,
                    'remote_addr': request.remote_addr,
                    'user_agent': request.headers.get('User-Agent', 'Unknown')
                })
        except RuntimeError:
            # Outside request context
            pass
        
        # Log the error
        self.logger.log_error(error, error_context, message)
        
        # Track error for monitoring
        self.error_counts[error_code] = self.error_counts.get(error_code, 0) + 1
        
        # Create response
        response = {
            'success': False,
            'error': {
                'code': error_code,
                'message': message,
                'timestamp': datetime.utcnow().isoformat(),
            }
        }
        
        # Add context in debug mode or for certain error types
        if error_code in ["VALIDATION_ERROR", "CAMERA_ERROR"] or self._is_debug_mode():
            response['error']['context'] = error_context
            
        return response, http_status
    
    def _is_debug_mode(self) -> bool:
        """Check if application is in debug mode"""
        # This could be determined by environment variables or config
        import os
        return os.getenv('DEBUG', 'False').lower() == 'true'
    
    def get_error_summary(self) -> Dict[str, Any]:
        """Get summary of handled errors"""
        return {
            'error_counts': self.error_counts,
            'total_errors': sum(self.error_counts.values()),
            'timestamp': datetime.utcnow().isoformat()
        }

# Global error handler instance
_error_handler = ErrorHandler()

def get_error_handler() -> ErrorHandler:
    """Get the global error handler instance"""
    return _error_handler

# Decorators for error handling

def handle_api_errors(func: Callable) -> Callable:
    """Decorator to handle API errors and return proper JSON responses"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            start_time = time.time()
            result = func(*args, **kwargs)
            
            # Log performance
            duration = time.time() - start_time
            get_logger().log_performance(
                operation=f"{func.__module__}.{func.__name__}",
                duration=duration,
                context={'endpoint': getattr(request, 'endpoint', 'unknown')}
            )
            
            return result
            
        except ProductCaptureError as e:
            response, status_code = _error_handler.handle_error(e)
            return jsonify(response), status_code
            
        except Exception as e:
            response, status_code = _error_handler.handle_error(e)
            return jsonify(response), status_code
    
    return wrapper

def handle_camera_errors(func: Callable) -> Callable:
    """Decorator specifically for camera operations"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            # Convert generic exceptions to CameraError for better handling
            if "camera" in str(e).lower() or "capture" in str(e).lower():
                raise CameraError(f"Camera operation failed: {str(e)}")
            raise
    return wrapper

def handle_storage_errors(func: Callable) -> Callable:
    """Decorator specifically for storage operations"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (OSError, IOError, PermissionError) as e:
            raise StorageError(f"Storage operation failed: {str(e)}")
        except Exception as e:
            if "file" in str(e).lower() or "directory" in str(e).lower():
                raise StorageError(f"Storage operation failed: {str(e)}")
            raise
    return wrapper

def validate_input(**validators) -> Callable:
    """Decorator to validate input parameters"""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Get function signature
            sig = inspect.signature(func)
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
            
            # Validate each parameter
            for param_name, validator in validators.items():
                if param_name in bound_args.arguments:
                    value = bound_args.arguments[param_name]
                    try:
                        if not validator(value):
                            raise ValidationError(
                                f"Invalid value for parameter '{param_name}'",
                                field=param_name,
                                value=value
                            )
                    except Exception as e:
                        if isinstance(e, ValidationError):
                            raise
                        raise ValidationError(
                            f"Validation failed for parameter '{param_name}': {str(e)}",
                            field=param_name,
                            value=value
                        )
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def retry_on_error(max_retries: int = 3, delay: float = 1.0, 
                  exceptions: Tuple = (Exception,)) -> Callable:
    """Decorator to retry operations on specific errors"""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries:
                        get_logger().logger.warning(
                            f"Attempt {attempt + 1} failed for {func.__name__}: {str(e)}. Retrying in {delay}s..."
                        )
                        time.sleep(delay)
                    else:
                        get_logger().logger.error(
                            f"All {max_retries + 1} attempts failed for {func.__name__}"
                        )
                        
            # Re-raise the last exception
            raise last_exception
        return wrapper
    return decorator

# Validation functions
def is_valid_camera_index(value: Any) -> bool:
    """Validate camera index"""
    return isinstance(value, int) and 0 <= value <= 10

def is_valid_path(value: Any) -> bool:
    """Validate file path"""
    return isinstance(value, str) and len(value) > 0

def is_valid_capture_rate(value: Any) -> bool:
    """Validate capture rate"""
    return isinstance(value, (int, float)) and 1 <= value <= 120

def is_valid_duration(value: Any) -> bool:
    """Validate session duration"""
    return value is None or (isinstance(value, (int, float)) and value > 0)

# Context managers for error handling

class ErrorContext:
    """Context manager for error handling with additional context"""
    
    def __init__(self, operation: str, **context):
        self.operation = operation
        self.context = context
        self.start_time = None
        
    def __enter__(self):
        self.start_time = time.time()
        get_logger().logger.info(f"Starting operation: {self.operation}", extra={
            'context': self.context
        })
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        
        if exc_type is None:
            # Success
            get_logger().log_performance(self.operation, duration, self.context)
            get_logger().logger.info(f"Completed operation: {self.operation}", extra={
                'context': {**self.context, 'duration_ms': round(duration * 1000, 2)}
            })
        else:
            # Error occurred
            error_context = {**self.context, 'duration_ms': round(duration * 1000, 2)}
            get_logger().log_error(exc_val, error_context, f"Failed operation: {self.operation}")
            
        return False  # Don't suppress exceptions