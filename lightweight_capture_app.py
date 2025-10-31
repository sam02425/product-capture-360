#!/usr/bin/env python3
"""
Lightweight Product Capture Application
Flask-based with live camera preview - MANDATORY FEATURE
Enhanced with production-grade logging and error handling
"""

import os
import cv2
import json
import time
import psutil
import threading
import signal
import sys
import atexit
import queue
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, Response, request, jsonify, send_from_directory
from PIL import Image
import base64
import io

# Import our enhanced logging and error handling
from logging_config import setup_logging, get_logger
from error_handlers import (
    handle_api_errors, handle_camera_errors, handle_storage_errors,
    validate_input, retry_on_error, ErrorContext,
    CameraError, StorageError, SessionError, ValidationError,
    is_valid_camera_index, is_valid_path, is_valid_capture_rate, is_valid_duration
)
from monitoring import health_monitor

# Initialize logging and monitoring
logger = setup_logging()

# Start health monitoring
health_monitor.start_monitoring(interval=30.0)

app = Flask(__name__)

# Global error handler for Flask
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({
        'success': False,
        'error': {
            'code': 'NOT_FOUND',
            'message': 'The requested resource was not found',
            'timestamp': datetime.utcnow().isoformat()
        }
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': {
            'code': 'INTERNAL_ERROR',
            'message': 'An internal server error occurred',
            'timestamp': datetime.utcnow().isoformat()
        }
    }), 500

class ProductCaptureSystem:
    def __init__(self):
        self.camera = None
        self.camera_index = 1
        self.is_capturing = False
        self.current_storage = None
        self.current_folder = "/Users/saumil/Desktop/360Photo/p"
        self.current_product = None  # Add product tracking
        self.capture_count = 0
        self.session_start = time.time()
        self.session_start_time = time.time()  # Add missing attribute
        
        # Session management
        self.session_active = False
        self.session_thread = None
        self.capture_rate = 72  # Default to 72 captures per minute (Very Fast)
        self.session_duration = 0
        
        # Real-time performance monitoring
        self.frame_count = 0
        self.fps_start_time = time.time()
        self.current_fps = 0
        self.frame_times = []
        self.max_frame_history = 30  # Keep last 30 frame times for averaging
        self.camera_resolution = (0, 0)
        self.last_frame_time = 0
        self.frame_latency = 0
        self.connection_errors = 0
        self.max_connection_errors = 5
        self.last_successful_frame = time.time()
        self.reconnection_attempts = 0
        self.max_reconnection_attempts = 3
        
        # Enhanced logging
        self.logger = get_logger()
        
        # Register cleanup handlers
        atexit.register(self.cleanup)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.logger.logger.info("ProductCaptureSystem initialized", extra={
            'context': {'current_folder': self.current_folder}
        })
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        self.logger.logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.cleanup()
        # Don't call sys.exit(0) as it terminates the Flask process
        # Let Flask handle the shutdown gracefully
    
    def cleanup(self):
        """Clean up resources properly"""
        with ErrorContext("system_cleanup"):
            self.logger.logger.info("Starting system cleanup...")
            
            # Stop any active session
            if self.session_active:
                self.session_active = False
                if self.session_thread and self.session_thread.is_alive():
                    self.session_thread.join(timeout=2)
            
            # Release camera resources
            if self.camera:
                try:
                    self.camera.release()
                    self.logger.logger.info("Camera released successfully")
                except Exception as e:
                    self.logger.log_error(e, {'operation': 'camera_release'})
                finally:
                    self.camera = None
            
            # Destroy any OpenCV windows
            try:
                cv2.destroyAllWindows()
            except Exception as e:
                self.logger.log_error(e, {'operation': 'opencv_cleanup'})
            
            self.logger.logger.info("System cleanup completed")
            self.capture_count = 0
            self.session_captures = 0
            self.session_start_time = None

    @handle_camera_errors
    @retry_on_error(max_retries=3, delay=1.0, exceptions=(CameraError,))
    @validate_input(camera_index=is_valid_camera_index)
    def initialize_camera(self, camera_index=1):
        """Initialize camera with enhanced USB camera detection and robust error handling"""
        with ErrorContext("camera_initialization", camera_index=camera_index):
            try:
                # Release existing camera if any
                if self.camera:
                    try:
                        self.camera.release()
                        self.logger.logger.info("Previous camera released")
                    except Exception as e:
                        self.logger.log_error(e, {'operation': 'previous_camera_release'})
                    finally:
                        self.camera = None
                    
                    # Wait longer for camera to fully release
                    time.sleep(1.0)
                    
                    # Destroy any OpenCV windows that might be holding resources
                    cv2.destroyAllWindows()
                
                # Enhanced USB camera detection with multiple backends
                self.logger.logger.info(f"Attempting to initialize camera {camera_index}")
                
                # Try different backends for better USB camera compatibility
                backends_to_try = [
                    cv2.CAP_AVFOUNDATION,  # macOS native - best for USB cameras
                    cv2.CAP_V4L2,          # Linux V4L2
                    cv2.CAP_DSHOW,         # Windows DirectShow
                    cv2.CAP_ANY            # Fallback
                ]
                
                camera_initialized = False
                for backend in backends_to_try:
                    try:
                        self.logger.logger.info(f"Trying backend {backend} for camera {camera_index}")
                        self.camera = cv2.VideoCapture(camera_index, backend)
                        
                        if self.camera.isOpened():
                            # Test frame capture to ensure camera is working
                            ret, test_frame = self.camera.read()
                            if ret and test_frame is not None:
                                self.logger.logger.info(f"Camera {camera_index} working with backend {backend}")
                                camera_initialized = True
                                break
                            else:
                                self.logger.logger.debug(f"Camera {camera_index} opened but no frame with backend {backend}")
                                self.camera.release()
                                self.camera = None
                        else:
                            self.logger.logger.debug(f"Camera {camera_index} failed to open with backend {backend}")
                            if self.camera:
                                self.camera.release()
                            self.camera = None
                    except Exception as e:
                        self.logger.logger.debug(f"Backend {backend} failed for camera {camera_index}: {str(e)}")
                        if self.camera:
                            self.camera.release()
                        self.camera = None
                        continue
                
                if not camera_initialized:
                    raise CameraError(f"Camera {camera_index} failed to initialize with any backend", camera_index)
                
                # Set camera parameters safely to prevent segmentation faults
                try:
                    # Set basic parameters with error checking
                    self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to prevent memory issues
                    
                    # Try to set resolution, but don't fail if not supported
                    try:
                        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)  # Lower resolution to prevent crashes
                        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    except Exception as e:
                        self.logger.logger.debug(f"Could not set resolution: {e}")
                    
                    # Try to set FPS, but don't fail if not supported
                    try:
                        self.camera.set(cv2.CAP_PROP_FPS, 15)  # Lower FPS to prevent crashes
                    except Exception as e:
                        self.logger.logger.debug(f"Could not set FPS: {e}")
                    
                    # Skip codec setting as it can cause segfaults on some systems
                    # self.camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
                    
                    # Skip auto exposure and autofocus as they can cause issues
                    # self.camera.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
                    # self.camera.set(cv2.CAP_PROP_AUTOFOCUS, 1)
                    
                except Exception as e:
                    self.logger.logger.warning(f"Some camera properties could not be set: {e}")
                    # Continue anyway as basic camera functionality might still work
                
                # Final test to ensure everything is working
                try:
                    ret, test_frame = self.camera.read()
                    if not ret or test_frame is None:
                        self.logger.logger.warning("Camera configured but cannot capture test frame")
                        # Don't fail here, just log the warning and continue
                        # Some cameras need time to warm up
                    else:
                        self.logger.logger.info(f"USB Camera {camera_index} initialized successfully with resolution {test_frame.shape}")
                except Exception as e:
                    self.logger.logger.warning(f"Test frame capture failed: {e}")
                    # Continue anyway as camera might work during actual operation
                
                self.camera_index = camera_index
                self.logger.logger.info(f"Camera {camera_index} initialization completed")
                return True
                
            except Exception as e:
                if self.camera:
                    try:
                        self.camera.release()
                    except:
                        pass
                    self.camera = None
                
                if isinstance(e, CameraError):
                    raise
                else:
                    raise CameraError(f"Unexpected error during camera initialization: {str(e)}", camera_index)

    def get_frame(self):
        """Get current camera frame with enhanced performance monitoring"""
        frame_start_time = time.time()
        
        if not self.camera or not self.camera.isOpened():
            self.connection_errors += 1
            return None
        
        try:
            ret, frame = self.camera.read()
            if ret and frame is not None:
                # Update performance metrics
                current_time = time.time()
                self.frame_count += 1
                self.last_successful_frame = current_time
                self.connection_errors = 0  # Reset error counter on success
                
                # Calculate frame latency
                self.frame_latency = (current_time - frame_start_time) * 1000  # ms
                
                # Update frame timing history
                if self.last_frame_time > 0:
                    frame_interval = current_time - self.last_frame_time
                    self.frame_times.append(frame_interval)
                    if len(self.frame_times) > self.max_frame_history:
                        self.frame_times.pop(0)
                
                self.last_frame_time = current_time
                
                # Calculate FPS every second
                if current_time - self.fps_start_time >= 1.0:
                    self.current_fps = self.frame_count / (current_time - self.fps_start_time)
                    self.frame_count = 0
                    self.fps_start_time = current_time
                
                # Store camera resolution
                if self.camera_resolution == (0, 0):
                    self.camera_resolution = (frame.shape[1], frame.shape[0])
                
                return frame.copy()  # Create a copy to avoid memory issues
            else:
                self.connection_errors += 1
        except Exception as e:
            self.connection_errors += 1
            self.logger.log_error(e, {'operation': 'frame_capture', 'camera_index': self.camera_index})
        
        return None

    @handle_camera_errors
    def capture_image(self):
        """Capture image with enhanced error handling"""
        with ErrorContext("image_capture", camera_index=self.camera_index):
            if not self.camera or not self.camera.isOpened():
                raise CameraError("Camera not initialized or not available")
            
            try:
                ret, frame = self.camera.read()
                if not ret or frame is None:
                    raise CameraError("Failed to capture frame from camera")
                
                # Generate filename
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"capture_{timestamp}_{self.capture_count:04d}.jpg"
                filepath = os.path.join(self.current_folder, filename)
                
                # Ensure directory exists
                os.makedirs(self.current_folder, exist_ok=True)
                
                # Save image
                success = cv2.imwrite(filepath, frame)
                if not success:
                    raise StorageError(f"Failed to save image to {filepath}")
                
                self.capture_count += 1
                self.logger.logger.info(f"Image captured successfully: {filename}")
                
                return True, f"Image saved as {filename}"
                
            except Exception as e:
                if isinstance(e, (CameraError, StorageError)):
                    raise
                else:
                    raise CameraError(f"Unexpected error during image capture: {str(e)}")

    @handle_storage_errors
    @validate_input(folder_path=is_valid_path, folder_name=is_valid_path)
    def create_folder(self, folder_path, folder_name):
        """Create a new folder with error handling"""
        with ErrorContext("folder_creation", folder_path=folder_path, folder_name=folder_name):
            try:
                new_folder_path = os.path.join(folder_path, folder_name)
                
                if os.path.exists(new_folder_path):
                    raise StorageError(f"Folder '{folder_name}' already exists", new_folder_path)
                
                os.makedirs(new_folder_path, exist_ok=True)
                self.logger.logger.info(f"Created folder: {new_folder_path}")
                return True, f"Folder '{folder_name}' created successfully"
                
            except OSError as e:
                raise StorageError(f"Failed to create folder '{folder_name}': {str(e)}", folder_path)

    def start_capture_session(self, capture_rate, duration_minutes=1):
        """Start automated capture session with precise 1-minute duration"""
        if self.session_active:
            return False, "Session already active"
        
        # Force 1-minute duration for all sessions
        duration_minutes = 1
        
        self.capture_rate = capture_rate
        self.session_active = True
        self.session_captures = 0
        self.session_start_time = time.time()
        self.session_duration = 60  # Always 60 seconds (1 minute)
        self.expected_captures = capture_rate  # Expected number of captures in 1 minute
        self.session_validation = {
            'start_time': self.session_start_time,
            'expected_duration': 60,
            'expected_captures': capture_rate,
            'actual_captures': 0,
            'timing_errors': []
        }
        
        # Start session thread
        self.session_thread = threading.Thread(target=self._capture_session_worker)
        self.session_thread.daemon = True
        self.session_thread.start()
        
        logger.logger.info(f"Starting 1-minute session: {capture_rate} captures expected")
        return True, f"1-minute session started: {capture_rate} captures expected"
    
    def stop_capture_session(self):
        """Stop automated capture session with validation"""
        if not self.session_active:
            return False, "No active session"
        
        # Calculate session metrics before stopping
        actual_duration = time.time() - self.session_start_time
        duration_error = abs(actual_duration - 60)  # Should be close to 60 seconds
        capture_error = abs(self.session_captures - self.expected_captures)
        
        self.session_active = False
        if self.session_thread:
            self.session_thread.join(timeout=2)
        
        # Validation results
        validation_result = {
            'expected_duration': 60,
            'actual_duration': round(actual_duration, 2),
            'duration_error': round(duration_error, 2),
            'expected_captures': self.expected_captures,
            'actual_captures': self.session_captures,
            'capture_error': capture_error,
            'success': duration_error <= 1.0 and capture_error <= 1  # Allow 1 second and 1 frame tolerance
        }
        
        logger.logger.info(f"Session completed - Duration: {actual_duration:.2f}s, Captures: {self.session_captures}/{self.expected_captures}")
        
        return True, f"Session completed: {self.session_captures}/{self.expected_captures} captures in {actual_duration:.1f}s", validation_result
    
    def _capture_session_worker(self):
        """Worker thread for automated capture session with precise timing"""
        # Calculate precise interval - for N captures in 60 seconds, we need N-1 intervals
        # This ensures the last capture happens just before 60 seconds
        if self.capture_rate == 1:
            interval = 60.0  # Single capture at start
        else:
            interval = 60.0 / (self.capture_rate - 1)  # Distribute captures evenly across 60 seconds
        
        logger.logger.info(f"Session worker started - Rate: {self.capture_rate}/min, Interval: {interval:.3f}s, Expected captures: {self.expected_captures}")
        
        # Pre-calculate all capture times for maximum precision
        capture_times = []
        for i in range(self.capture_rate):
            if self.capture_rate == 1:
                capture_time = self.session_start_time
            else:
                capture_time = self.session_start_time + (i * 60.0 / self.capture_rate)
            capture_times.append(capture_time)
        
        capture_index = 0
        
        while self.session_active and capture_index < len(capture_times):
            try:
                current_time = time.time()
                elapsed = current_time - self.session_start_time
                
                # Strict 1-minute session enforcement with small buffer for final capture
                if elapsed >= 60.1:  # 100ms buffer for final capture
                    logger.logger.info(f"Session completed - 1 minute elapsed. Captures: {self.session_captures}")
                    self.session_active = False
                    break
                
                # Check if it's time for the next scheduled capture
                if current_time >= capture_times[capture_index]:
                    # Capture image with error handling
                    success, result = self.capture_image()
                    if success:
                        self.capture_count += 1
                        self.session_captures += 1
                        self.session_validation['actual_captures'] = self.session_captures
                        
                        # Calculate timing accuracy against scheduled time
                        expected_time = capture_times[capture_index]
                        timing_error = abs(current_time - expected_time)
                        self.session_validation['timing_errors'].append(timing_error)
                        
                        logger.logger.info(f"Capture {self.session_captures}/{self.expected_captures} at {elapsed:.2f}s (scheduled: {expected_time - self.session_start_time:.2f}s, error: {timing_error:.3f}s)")
                    else:
                        logger.logger.warning(f"Capture failed: {result}")
                    
                    # Move to next scheduled capture
                    capture_index += 1
                
                # Sleep for a short time to avoid busy waiting
                time.sleep(0.005)  # 5ms precision for better timing
                
            except Exception as e:
                logger.logger.error(f"Session worker error: {e}")
                time.sleep(0.1)  # Brief pause before retry
        
        # Final validation check
        if self.session_captures < self.expected_captures:
            logger.logger.warning(f"Session ended with {self.session_captures}/{self.expected_captures} captures")
        
        self.session_active = False
    
    def get_session_status(self):
        """Get current session status with progress tracking"""
        if not self.session_active:
            return {
                'active': False,
                'captures': 0,
                'elapsed': 0,
                'remaining': 0,
                'progress': 0,
                'rate': self.capture_rate,
                'expected_captures': getattr(self, 'expected_captures', 0)
            }
        
        elapsed = time.time() - self.session_start_time if self.session_start_time else 0
        remaining = max(0, 60 - elapsed)  # Always 60 seconds total
        progress = min(100, (elapsed / 60) * 100)  # Progress percentage
        
        return {
            'active': True,
            'captures': self.session_captures,
            'elapsed': round(elapsed, 1),
            'remaining': round(remaining, 1),
            'progress': round(progress, 1),
            'rate': self.capture_rate,
            'expected_captures': getattr(self, 'expected_captures', 0),
            'duration': 60  # Always 1 minute
        }

# Global capture system instance
capture_system = ProductCaptureSystem()

def generate_frames():
    """Generate camera frames for live preview with enhanced performance monitoring and visual indicators"""
    frame_count = 0
    max_consecutive_failures = 10
    consecutive_failures = 0
    last_performance_log = time.time()
    performance_log_interval = 5.0  # Log performance every 5 seconds
    
    try:
        while True:
            try:
                frame_start = time.time()
                frame = capture_system.get_frame()
                
                if frame is not None:
                    consecutive_failures = 0  # Reset failure counter
                    
                    # Add performance overlay to frame
                    frame_with_overlay = add_performance_overlay(frame)
                    
                    # Encode frame as JPEG with optimized quality
                    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 85, cv2.IMWRITE_JPEG_OPTIMIZE, 1]
                    ret, buffer = cv2.imencode('.jpg', frame_with_overlay, encode_params)
                    
                    if ret:
                        frame_bytes = buffer.tobytes()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                        
                        # Log performance metrics periodically
                        current_time = time.time()
                        if current_time - last_performance_log >= performance_log_interval:
                            log_performance_metrics()
                            last_performance_log = current_time
                    else:
                        consecutive_failures += 1
                else:
                    consecutive_failures += 1
                    
                    # Check if we need to attempt reconnection
                    if capture_system.connection_errors >= capture_system.max_connection_errors:
                        attempt_camera_reconnection()
                    
                # If too many consecutive failures, send placeholder with status info
                if consecutive_failures >= max_consecutive_failures:
                    placeholder_frame = create_status_placeholder_frame()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + placeholder_frame + b'\r\n')
                    time.sleep(1.0)  # Longer delay when camera is not working
                    consecutive_failures = 0  # Reset after sending placeholder
                else:
                    # Adaptive frame rate based on performance
                    target_fps = 30
                    frame_time = time.time() - frame_start
                    target_frame_time = 1.0 / target_fps
                    sleep_time = max(0, target_frame_time - frame_time)
                    time.sleep(sleep_time)
                    
            except GeneratorExit:
                # Client disconnected, exit gracefully
                logger.logger.info("Video stream client disconnected")
                break
            except Exception as e:
                logger.log_error(e, {'operation': 'frame_generation', 'consecutive_failures': consecutive_failures})
                consecutive_failures += 1
                time.sleep(0.5)  # Wait before retry
                
                # If too many errors, break the loop to prevent infinite error generation
                if consecutive_failures >= max_consecutive_failures * 2:
                    logger.logger.error("Too many consecutive frame generation errors, stopping stream")
                    break
                    
    except Exception as e:
        logger.log_error(e, {'operation': 'generate_frames_outer'})
    finally:
        logger.logger.info("Video frame generation stopped")

# Flask Routes with Enhanced Error Handling
@app.route('/')
def index():
    """Main page with enhanced error handling"""
    try:
        logger.logger.info("Main page accessed")
        return render_template('index.html')
    except Exception as e:
        logger.log_error(e, {'route': 'index'})
        return jsonify({
            'success': False,
            'error': {
                'code': 'TEMPLATE_ERROR',
                'message': 'Failed to load main page',
                'timestamp': datetime.utcnow().isoformat()
            }
        }), 500

@app.route('/video_feed')
def video_feed():
    """Video streaming route with error handling"""
    try:
        logger.logger.info("Video feed requested")
        
        def safe_generate_frames():
            """Wrapper for generate_frames with additional safety"""
            try:
                for frame in generate_frames():
                    yield frame
            except GeneratorExit:
                logger.logger.info("Video feed generator exit")
                return
            except Exception as e:
                logger.log_error(e, {'route': 'video_feed_generator'})
                return
        
        return Response(safe_generate_frames(),
                       mimetype='multipart/x-mixed-replace; boundary=frame')
    except Exception as e:
        logger.log_error(e, {'route': 'video_feed'})
        return Response(status=500)

@app.route('/api/camera/scan', methods=['GET'])
@handle_api_errors
def scan_cameras():
    """Enhanced camera scanning with better USB camera detection"""
    with ErrorContext("camera_scan"):
        try:
            logger.logger.info("Starting enhanced camera scan")
            cameras = []
            
            # Try different backends for better USB camera detection
            backends_to_try = [
                ('AVFoundation', cv2.CAP_AVFOUNDATION),  # macOS native - best for USB cameras
                ('V4L2', cv2.CAP_V4L2),                  # Linux V4L2
                ('DirectShow', cv2.CAP_DSHOW),           # Windows DirectShow
                ('Default', cv2.CAP_ANY)                 # Fallback
            ]
            
            # Test camera indices 0-9 with multiple backends
            for i in range(10):
                camera_found = False
                best_backend = None
                best_resolution = None
                
                for backend_name, backend_id in backends_to_try:
                    try:
                        cap = cv2.VideoCapture(i, backend_id)
                        if cap.isOpened():
                            # Try to read a frame to verify the camera works
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                # Get camera properties
                                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                                
                                # Prefer higher resolution cameras and USB cameras
                                resolution_score = width * height
                                if not camera_found or resolution_score > (best_resolution[0] * best_resolution[1]):
                                    best_backend = backend_name
                                    best_resolution = (width, height)
                                    camera_found = True
                        
                        cap.release()
                        
                    except Exception as e:
                        logger.logger.debug(f"Camera {i} with backend {backend_name} failed: {str(e)}")
                        continue
                
                if camera_found:
                    camera_name = f"Camera {i} ({best_resolution[0]}x{best_resolution[1]}) - {best_backend}"
                    
                    # Skip built-in cameras if we're looking for USB cameras
                    # Built-in cameras often have lower indices and specific resolutions
                    is_likely_usb = i > 0 or best_resolution[0] >= 1280
                    
                    cameras.append({
                        'index': i,
                        'name': camera_name,
                        'width': best_resolution[0],
                        'height': best_resolution[1],
                        'backend': best_backend,
                        'is_usb_likely': is_likely_usb
                    })
                    logger.logger.info(f"Found camera {i}: {camera_name} (USB likely: {is_likely_usb})")
            
            cv2.destroyAllWindows()
            
            if not cameras:
                logger.logger.warning("No cameras found during scan")
                return jsonify({
                    'success': False,
                    'error': {
                        'code': 'NO_CAMERAS_FOUND',
                        'message': 'No available cameras detected. Please check USB connections and try again.',
                        'timestamp': datetime.utcnow().isoformat(),
                        'troubleshooting': [
                            'Ensure USB camera is properly connected',
                            'Check if camera is being used by another application',
                            'Try different USB ports',
                            'Restart the camera or computer if needed'
                        ]
                    }
                }), 404
            
            # Sort cameras to prioritize likely USB cameras
            cameras.sort(key=lambda x: (x['is_usb_likely'], x['width'] * x['height']), reverse=True)
            
            logger.logger.info(f"Enhanced camera scan completed, found {len(cameras)} cameras")
            return jsonify({
                'success': True,
                'cameras': cameras,
                'count': len(cameras),
                'usb_cameras': [cam for cam in cameras if cam['is_usb_likely']],
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            raise CameraError(f"Enhanced camera scan failed: {str(e)}")

@app.route('/api/camera/init', methods=['POST'])
@handle_api_errors
@validate_input(camera_index=is_valid_camera_index)
def init_camera():
    """Initialize camera with enhanced error handling"""
    with ErrorContext("camera_init_api"):
        try:
            data = request.get_json()
            if not data or 'camera_index' not in data:
                raise ValidationError("Missing camera_index in request")
            
            camera_index = data['camera_index']
            logger.logger.info(f"Camera initialization requested for index {camera_index}")
            
            success = capture_system.initialize_camera(camera_index)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': f'Camera {camera_index} initialized successfully',
                    'camera_index': camera_index,
                    'timestamp': datetime.utcnow().isoformat()
                })
            else:
                raise CameraError(f"Failed to initialize camera {camera_index}")
                
        except ValidationError as e:
            raise e
        except Exception as e:
            if isinstance(e, CameraError):
                raise
            else:
                raise CameraError(f"Unexpected error during camera initialization: {str(e)}")

@app.route('/api/capture', methods=['POST'])
@handle_api_errors
def capture_image():
    """Capture image with enhanced error handling"""
    with ErrorContext("image_capture_api"):
        try:
            logger.logger.info("Image capture requested")
            success, result = capture_system.capture_image()
            
            if success:
                return jsonify({
                    'success': True,
                    'message': result,
                    'capture_count': capture_system.capture_count,
                    'timestamp': datetime.utcnow().isoformat()
                })
            else:
                raise CameraError(f"Image capture failed: {result}")
                
        except Exception as e:
            if isinstance(e, (CameraError, StorageError)):
                raise
            else:
                raise CameraError(f"Unexpected error during image capture: {str(e)}")

@app.route('/api/storage/devices', methods=['GET'])
@handle_api_errors
def get_storage_devices():
    """Get storage devices with enhanced error handling"""
    with ErrorContext("storage_devices_api"):
        try:
            logger.logger.info("Storage devices requested")
            devices = []
            
            for partition in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    device_info = {
                        'device': partition.device,
                        'mountpoint': partition.mountpoint,
                        'fstype': partition.fstype,
                        'total': usage.total,
                        'used': usage.used,
                        'free': usage.free,
                        'percent': round((usage.used / usage.total) * 100, 1)
                    }
                    devices.append(device_info)
                except PermissionError:
                    continue
                except Exception as e:
                    logger.logger.warning(f"Error reading partition {partition.device}: {str(e)}")
                    continue
            
            return jsonify({
                'success': True,
                'devices': devices,
                'count': len(devices),
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            raise StorageError(f"Failed to retrieve storage devices: {str(e)}")

@app.route('/api/folder/contents', methods=['POST'])
@handle_api_errors
@validate_input(folder_path=is_valid_path)
def get_folder_contents():
    """Get folder contents with enhanced error handling"""
    with ErrorContext("folder_contents_api"):
        try:
            data = request.get_json()
            if not data or 'path' not in data:
                raise ValidationError("Missing path in request")
            
            folder_path = data['path']
            logger.logger.info(f"Folder contents requested for: {folder_path}")
            
            contents = []
            path = Path(folder_path)
            
            if not path.exists():
                raise StorageError(f"Path does not exist: {folder_path}", folder_path)
            
            if not path.is_dir():
                raise StorageError(f"Path is not a directory: {folder_path}", folder_path)
            
            for item in sorted(path.iterdir()):
                try:
                    stat = item.stat()
                    item_info = {
                        'name': item.name,
                        'path': str(item),
                        'is_dir': item.is_dir(),
                        'size': stat.st_size if not item.is_dir() else 0,
                        'modified': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                    }
                    contents.append(item_info)
                except (PermissionError, OSError) as e:
                    logger.logger.warning(f"Cannot access item {item}: {str(e)}")
                    continue
            
            return jsonify({
                'success': True,
                'contents': contents,
                'path': folder_path,
                'count': len(contents),
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except ValidationError as e:
            raise e
        except Exception as e:
            if isinstance(e, StorageError):
                raise
            else:
                raise StorageError(f"Failed to read folder contents: {str(e)}", folder_path)

@app.route('/api/folder/create', methods=['POST'])
@handle_api_errors
@validate_input(folder_path=is_valid_path, folder_name=is_valid_path)
def create_folder():
    """Create folder with enhanced error handling"""
    with ErrorContext("folder_create_api"):
        try:
            data = request.get_json()
            if not data or 'path' not in data or 'name' not in data:
                raise ValidationError("Missing path or name in request")
            
            folder_path = data['path']
            folder_name = data['name']
            
            logger.logger.info(f"Folder creation requested: {folder_name} in {folder_path}")
            
            success, result = capture_system.create_folder(folder_path, folder_name)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': result,
                    'path': os.path.join(folder_path, folder_name),
                    'timestamp': datetime.utcnow().isoformat()
                })
            else:
                raise StorageError(f"Failed to create folder: {result}")
                
        except ValidationError as e:
            raise e
        except Exception as e:
            if isinstance(e, StorageError):
                raise
            else:
                raise StorageError(f"Unexpected error during folder creation: {str(e)}")

@app.route('/api/folder/set', methods=['POST'])
@handle_api_errors
@validate_input(folder_path=is_valid_path)
def set_current_folder():
    """Set current folder with enhanced error handling"""
    with ErrorContext("folder_set_api"):
        try:
            data = request.get_json()
            if not data or 'path' not in data:
                raise ValidationError("Missing path in request")
            
            folder_path = data['path']
            
            if not os.path.exists(folder_path):
                raise StorageError(f"Folder does not exist: {folder_path}", folder_path)
            
            if not os.path.isdir(folder_path):
                raise StorageError(f"Path is not a directory: {folder_path}", folder_path)
            
            capture_system.current_folder = folder_path
            logger.logger.info(f"Current folder set to: {folder_path}")
            
            return jsonify({
                'success': True,
                'message': f'Current folder set to: {folder_path}',
                'current_folder': folder_path,
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except ValidationError as e:
            raise e
        except Exception as e:
            if isinstance(e, StorageError):
                raise
            else:
                raise StorageError(f"Failed to set current folder: {str(e)}")

@app.route('/api/status')
@handle_api_errors
def get_status():
    """Get system status with enhanced real-time performance metrics"""
    start_time = time.time()
    
    try:
        with ErrorContext("get_status"):
            # Calculate average frame time
            avg_frame_time = 0
            if capture_system.frame_times:
                avg_frame_time = sum(capture_system.frame_times) / len(capture_system.frame_times)
            
            # Calculate camera health score
            camera_health = calculate_camera_health_score()
            
            status = {
                'camera_connected': capture_system.camera is not None and capture_system.camera.isOpened(),
                'current_folder': capture_system.current_folder,
                'capture_count': capture_system.capture_count,
                'session_active': capture_system.session_active,
                'session_time': int(time.time() - capture_system.session_start_time) if capture_system.session_start_time else 0,
                'performance': {
                    'current_fps': round(capture_system.current_fps, 2),
                    'frame_latency_ms': round(capture_system.frame_latency, 2),
                    'avg_frame_time_ms': round(avg_frame_time * 1000, 2),
                    'camera_resolution': capture_system.camera_resolution,
                    'connection_errors': capture_system.connection_errors,
                    'last_successful_frame': capture_system.last_successful_frame,
                    'camera_health_score': camera_health,
                    'reconnection_attempts': capture_system.reconnection_attempts
                }
            }
            
            # Record API call metrics
            response_time = (time.time() - start_time) * 1000
            health_monitor.record_api_call('/api/status', response_time, 200)
            
            return jsonify(status)
            
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        health_monitor.record_api_call('/api/status', response_time, 500)
        health_monitor.record_error('API_ERROR', 'STATUS_FAILED', str(e), 
                                  {'endpoint': '/api/status'}, 'ERROR')
        raise

@app.route('/api/health')
@handle_api_errors
def get_health():
    """Get comprehensive health status"""
    start_time = time.time()
    
    try:
        with ErrorContext("get_health"):
            # Collect current metrics
            metrics = health_monitor.collect_system_metrics(capture_system)
            health_status = health_monitor.get_health_status()
            
            # Record API call metrics
            response_time = (time.time() - start_time) * 1000
            health_monitor.record_api_call('/api/health', response_time, 200)
            
            return jsonify(health_status)
            
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        health_monitor.record_api_call('/api/health', response_time, 500)
        health_monitor.record_error('API_ERROR', 'HEALTH_CHECK_FAILED', str(e), 
                                  {'endpoint': '/api/health'}, 'ERROR')
        raise

@app.route('/api/metrics/export')
@handle_api_errors
def export_metrics():
    """Export system metrics"""
    start_time = time.time()
    
    try:
        with ErrorContext("export_metrics"):
            hours = request.args.get('hours', 24, type=int)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'metrics_export_{timestamp}.json'
            filepath = os.path.join(capture_system.current_folder, filename)
            
            success = health_monitor.export_metrics(filepath, hours)
            
            # Record API call metrics
            response_time = (time.time() - start_time) * 1000
            status_code = 200 if success else 500
            health_monitor.record_api_call('/api/metrics/export', response_time, status_code)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': f'Metrics exported to {filename}',
                    'filepath': filepath,
                    'hours': hours
                })
            else:
                return jsonify({
                    'success': False,
                    'message': 'Failed to export metrics'
                }), 500
                
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        health_monitor.record_api_call('/api/metrics/export', response_time, 500)
        health_monitor.record_error('API_ERROR', 'METRICS_EXPORT_FAILED', str(e), 
                                  {'endpoint': '/api/metrics/export'}, 'ERROR')
        raise

@app.route('/api/product/set', methods=['POST'])
@handle_api_errors
def set_product():
    """Set product name and create product-specific folder"""
    with ErrorContext("product_set_api"):
        try:
            data = request.get_json()
            if not data or 'product_name' not in data:
                raise ValidationError("Missing product_name in request")
            
            product_name = data['product_name'].strip()
            if not product_name:
                raise ValidationError("Product name cannot be empty")
            
            # Sanitize product name for folder creation
            safe_product_name = "".join(c for c in product_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
            safe_product_name = safe_product_name.replace(' ', '_')
            
            # Create timestamp for unique session
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            # Create product folder path
            base_folder = capture_system.current_folder or "/Users/saumil/Desktop/360Photo/p"
            product_folder = os.path.join(base_folder, f"{safe_product_name}_{timestamp}")
            
            # Create the folder
            os.makedirs(product_folder, exist_ok=True)
            
            # Update current folder to the product folder
            capture_system.current_folder = product_folder
            capture_system.current_product = product_name
            
            logger.logger.info(f"Product set: {product_name}, folder: {product_folder}")
            
            return jsonify({
                'success': True,
                'message': f'Product "{product_name}" set successfully',
                'product_name': product_name,
                'folder_path': product_folder,
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except ValidationError as e:
            raise e
        except Exception as e:
            raise StorageError(f"Failed to set product: {str(e)}")

@app.route('/api/platform/rotate', methods=['POST'])
def rotate_platform():
    """Rotate platform - placeholder for hardware integration"""
    # TODO: Integrate with actual rotating platform hardware
    # This could be Arduino, stepper motor controller, etc.
    time.sleep(0.5)  # Simulate rotation time
    return jsonify({'success': True, 'message': 'Platform rotated'})

@app.route('/api/session/start', methods=['POST'])
def start_session():
    """Start automated capture session with precise 1-minute duration"""
    try:
        data = request.get_json() or {}
        capture_rate = data.get('captureRate', 24)
        
        # Validate capture rate
        if capture_rate not in [24, 36, 72]:
            return jsonify({
                'success': False,
                'message': 'Invalid capture rate. Must be 24, 36, or 72 frames per minute.'
            }), 400
        
        # Duration is always 1 minute (60 seconds)
        success, message = capture_system.start_capture_session(capture_rate, duration_minutes=1)
        
        if success:
            # Calculate precise intervals for validation
            interval = 60.0 / capture_rate
            return jsonify({
                'success': True,
                'message': message,
                'session_info': {
                    'duration': 60,  # Always 1 minute
                    'capture_rate': capture_rate,
                    'expected_captures': capture_rate,
                    'interval_seconds': round(interval, 3),
                    'validation_enabled': True
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.logger.error(f"Failed to start session: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to start session: {str(e)}'
        }), 500

@app.route('/api/session/stop', methods=['POST'])
def stop_session():
    """Stop automated capture session with validation results"""
    try:
        result = capture_system.stop_capture_session()
        
        if len(result) == 3:  # New format with validation
            success, message, validation = result
            if success:
                return jsonify({
                    'success': True,
                    'message': message,
                    'validation': validation
                })
            else:
                return jsonify({'success': False, 'message': message}), 400
        else:  # Fallback for old format
            success, message = result
            return jsonify({'success': success, 'message': message})
            
    except Exception as e:
        logger.logger.error(f"Failed to stop session: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to stop session: {str(e)}'
        }), 500

@app.route('/api/session/status', methods=['GET'])
def session_status():
    """Get current session status"""
    try:
        status = capture_system.get_session_status()
        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        logger.logger.error(f"Failed to get session status: {e}")
        return jsonify({
            'success': False,
            'message': f'Failed to get session status: {str(e)}'
        }), 500

def add_performance_overlay(frame):
    """Add real-time performance metrics overlay to frame"""
    try:
        overlay_frame = frame.copy()
        height, width = overlay_frame.shape[:2]
        
        # Create semi-transparent overlay area
        overlay = overlay_frame.copy()
        cv2.rectangle(overlay, (10, 10), (300, 120), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, overlay_frame, 0.3, 0, overlay_frame)
        
        # Add performance text
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        color = (0, 255, 0)  # Green
        thickness = 1
        
        # FPS
        fps_text = f"FPS: {capture_system.current_fps:.1f}"
        cv2.putText(overlay_frame, fps_text, (15, 30), font, font_scale, color, thickness)
        
        # Resolution
        res_text = f"Resolution: {capture_system.camera_resolution[0]}x{capture_system.camera_resolution[1]}"
        cv2.putText(overlay_frame, res_text, (15, 50), font, font_scale, color, thickness)
        
        # Latency
        latency_text = f"Latency: {capture_system.frame_latency:.1f}ms"
        cv2.putText(overlay_frame, latency_text, (15, 70), font, font_scale, color, thickness)
        
        # Connection status
        if capture_system.connection_errors > 0:
            status_color = (0, 165, 255)  # Orange
            status_text = f"Errors: {capture_system.connection_errors}"
        else:
            status_color = (0, 255, 0)  # Green
            status_text = "Status: OK"
        cv2.putText(overlay_frame, status_text, (15, 90), font, font_scale, status_color, thickness)
        
        # Timestamp
        timestamp = datetime.now().strftime("%H:%M:%S")
        cv2.putText(overlay_frame, timestamp, (15, 110), font, font_scale, (255, 255, 255), thickness)
        
        return overlay_frame
    except Exception as e:
        logger.log_error(e, {'operation': 'performance_overlay'})
        return frame

def log_performance_metrics():
    """Log detailed performance metrics"""
    try:
        avg_frame_time = 0
        if capture_system.frame_times:
            avg_frame_time = sum(capture_system.frame_times) / len(capture_system.frame_times)
        
        logger.logger.info("Real-time performance metrics", extra={
            'context': {
                'fps': round(capture_system.current_fps, 2),
                'frame_latency_ms': round(capture_system.frame_latency, 2),
                'avg_frame_time_ms': round(avg_frame_time * 1000, 2),
                'connection_errors': capture_system.connection_errors,
                'camera_resolution': capture_system.camera_resolution,
                'reconnection_attempts': capture_system.reconnection_attempts
            }
        })
    except Exception as e:
        logger.log_error(e, {'operation': 'performance_logging'})

def calculate_camera_health_score():
    """Calculate camera health score (0-100)"""
    try:
        score = 100
        
        # Deduct points for connection errors
        score -= min(capture_system.connection_errors * 10, 50)
        
        # Deduct points for low FPS
        if capture_system.current_fps < 15:
            score -= 20
        elif capture_system.current_fps < 25:
            score -= 10
        
        # Deduct points for high latency
        if capture_system.frame_latency > 100:
            score -= 20
        elif capture_system.frame_latency > 50:
            score -= 10
        
        # Deduct points for reconnection attempts
        score -= min(capture_system.reconnection_attempts * 15, 30)
        
        return max(0, score)
    except Exception:
        return 0

def attempt_camera_reconnection():
    """Attempt to reconnect to camera"""
    try:
        if capture_system.reconnection_attempts < capture_system.max_reconnection_attempts:
            capture_system.reconnection_attempts += 1
            logger.logger.info(f"Attempting camera reconnection #{capture_system.reconnection_attempts}")
            
            # Try to reinitialize camera
            if capture_system.initialize_camera(capture_system.camera_index):
                capture_system.connection_errors = 0
                capture_system.reconnection_attempts = 0
                logger.logger.info("Camera reconnection successful")
            else:
                logger.logger.warning(f"Camera reconnection attempt #{capture_system.reconnection_attempts} failed")
    except Exception as e:
        logger.log_error(e, {'operation': 'camera_reconnection'})

def create_status_placeholder_frame():
    """Create a placeholder frame with status information"""
    try:
        # Create a simple status image
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img.fill(50)  # Dark gray background
        
        # Add status text
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(img, "Camera Disconnected", (180, 200), font, 1, (0, 0, 255), 2)
        cv2.putText(img, "Attempting to reconnect...", (160, 250), font, 0.7, (255, 255, 0), 2)
        cv2.putText(img, f"Errors: {capture_system.connection_errors}", (250, 300), font, 0.6, (255, 255, 255), 1)
        cv2.putText(img, f"Attempts: {capture_system.reconnection_attempts}", (240, 330), font, 0.6, (255, 255, 255), 1)
        
        # Encode as JPEG
        ret, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ret:
            return buffer.tobytes()
        else:
            # Fallback minimal JPEG
            return b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\xf0\x01@\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
    except Exception as e:
        logger.log_error(e, {'operation': 'placeholder_frame_creation'})
        return b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\xf0\x01@\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'

if __name__ == '__main__':
    # Enhanced startup with better USB camera detection
    try:
        # Try to detect and initialize the best available USB camera
        logger.logger.info("Starting application with enhanced USB camera detection...")
        
        # First, scan for available cameras
        cameras = []
        backends_to_try = [
            ('AVFoundation', cv2.CAP_AVFOUNDATION),
            ('V4L2', cv2.CAP_V4L2),
            ('DirectShow', cv2.CAP_DSHOW),
            ('Default', cv2.CAP_ANY)
        ]
        
        for i in range(10):
            for backend_name, backend_id in backends_to_try:
                try:
                    cap = cv2.VideoCapture(i, backend_id)
                    if cap.isOpened():
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                            is_likely_usb = i > 0 or width >= 1280
                            cameras.append({
                                'index': i,
                                'backend': backend_name,
                                'resolution': (width, height),
                                'is_usb_likely': is_likely_usb
                            })
                            logger.logger.info(f"Detected camera {i} with {backend_name}: {width}x{height} (USB likely: {is_likely_usb})")
                            break
                    cap.release()
                except Exception:
                    continue
        
        # Try to initialize the best USB camera
        usb_cameras = [cam for cam in cameras if cam['is_usb_likely']]
        if usb_cameras:
            # Sort by resolution (higher is better)
            usb_cameras.sort(key=lambda x: x['resolution'][0] * x['resolution'][1], reverse=True)
            best_camera = usb_cameras[0]
            logger.logger.info(f"Attempting to initialize best USB camera: {best_camera['index']}")
            capture_system.initialize_camera(best_camera['index'])
            logger.logger.info("USB camera initialized successfully on startup")
        elif cameras:
            # Fallback to any available camera
            best_camera = max(cameras, key=lambda x: x['resolution'][0] * x['resolution'][1])
            logger.logger.info(f"No USB cameras found, using camera {best_camera['index']}")
            capture_system.initialize_camera(best_camera['index'])
            logger.logger.info("Camera initialized successfully on startup")
        else:
            logger.logger.warning("No cameras detected on startup")
            logger.logger.info("Application will continue without camera - use 'Scan Cameras' to detect later")
            
    except Exception as e:
        logger.logger.warning(f"Camera initialization failed on startup: {e}")
        logger.logger.info("Application will continue without camera - camera can be initialized later via API")
    
    # Run Flask app
    logger.logger.info("Starting Flask application on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)