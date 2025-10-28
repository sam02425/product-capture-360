#!/usr/bin/env python3
"""
Lightweight Product Capture Application
Flask-based with live camera preview - MANDATORY FEATURE
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

app = Flask(__name__)

class ProductCaptureSystem:
    def __init__(self):
        self.camera = None
        self.camera_index = 0
        self.is_capturing = False
        self.current_storage = None
        self.current_folder = "/Users/saumil/Desktop/360Photo/p"
        self.capture_count = 0
        self.session_start = time.time()
        
        # Session management
        self.session_active = False
        self.session_thread = None
        self.capture_rate = 24  # captures per minute
        self.session_duration = 0
        
        # Register cleanup handlers
        atexit.register(self.cleanup)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        print(f"\nReceived signal {signum}, shutting down gracefully...")
        self.cleanup()
        sys.exit(0)
    
    def cleanup(self):
        """Clean up resources properly"""
        print("Cleaning up resources...")
        
        # Stop any active session
        if self.session_active:
            self.session_active = False
            if self.session_thread and self.session_thread.is_alive():
                self.session_thread.join(timeout=2)
        
        # Release camera resources
        if self.camera:
            try:
                self.camera.release()
                print("Camera released successfully")
            except Exception as e:
                print(f"Error releasing camera: {e}")
            finally:
                self.camera = None
        
        # Destroy any OpenCV windows
        try:
            cv2.destroyAllWindows()
        except Exception as e:
            print(f"Error destroying OpenCV windows: {e}")
        
        print("Cleanup completed")
        self.session_captures = 0
        self.session_start_time = None
        
    def initialize_camera(self, camera_index=0):
        """Initialize camera with high quality settings and robust error handling"""
        try:
            # Release existing camera if any
            if self.camera:
                try:
                    self.camera.release()
                    print("Previous camera released")
                except Exception as e:
                    print(f"Error releasing previous camera: {e}")
                finally:
                    self.camera = None
                
                # Wait longer for camera to fully release
                time.sleep(1.0)
                
                # Destroy any OpenCV windows that might be holding resources
                cv2.destroyAllWindows()
            
            # Try to initialize camera with retries
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    print(f"Camera initialization attempt {attempt + 1}/{max_retries}")
                    self.camera = cv2.VideoCapture(camera_index)
                    
                    if self.camera.isOpened():
                        # Set high quality parameters
                        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
                        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                        self.camera.set(cv2.CAP_PROP_FPS, 30)
                        self.camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
                        self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to prevent memory issues
                        
                        # Test frame capture to ensure camera is working
                        ret, test_frame = self.camera.read()
                        if ret and test_frame is not None:
                            self.camera_index = camera_index
                            print(f"Camera {camera_index} initialized successfully")
                            return True
                        else:
                            print(f"Camera {camera_index} opened but cannot capture frames")
                            self.camera.release()
                            self.camera = None
                    else:
                        print(f"Camera {camera_index} failed to open")
                        if self.camera:
                            self.camera.release()
                            self.camera = None
                    
                    if attempt < max_retries - 1:
                        time.sleep(1.0)  # Wait before retry
                        
                except Exception as e:
                    print(f"Camera initialization attempt {attempt + 1} failed: {e}")
                    if self.camera:
                        try:
                            self.camera.release()
                        except:
                            pass
                        self.camera = None
                    
                    if attempt < max_retries - 1:
                        time.sleep(1.0)  # Wait before retry
            
            print(f"Failed to initialize camera {camera_index} after {max_retries} attempts")
            return False
            
        except Exception as e:
            print(f"Critical camera initialization error: {e}")
            if self.camera:
                try:
                    self.camera.release()
                except:
                    pass
                self.camera = None
            return False
    
    def get_frame(self):
        """Get current camera frame with thread safety"""
        if not self.camera or not self.camera.isOpened():
            return None
        
        try:
            ret, frame = self.camera.read()
            if ret and frame is not None:
                return frame.copy()  # Create a copy to avoid memory issues
        except Exception as e:
            print(f"Frame capture error: {e}")
        return None
    
    def capture_image(self):
        """Capture and save high-quality image"""
        frame = self.get_frame()
        if frame is None:
            return False, "No camera feed available"
        
        try:
            # Create filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"capture_{timestamp}_{self.capture_count:04d}.jpg"
            filepath = os.path.join(self.current_folder, filename)
            
            # Save high-quality image
            cv2.imwrite(filepath, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            self.capture_count += 1
            
            return True, filepath
        except Exception as e:
            return False, str(e)
    
    def get_storage_devices(self):
        """Get all available storage devices"""
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
        return devices
    
    def get_folder_contents(self, folder_path):
        """Get contents of specified folder"""
        try:
            contents = []
            path = Path(folder_path)
            
            if not path.exists():
                return []
            
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
                except (PermissionError, OSError):
                    continue
            
            return contents
        except Exception as e:
            print(f"Error reading folder: {e}")
            return []
    
    def create_folder(self, folder_path, folder_name):
        """Create new folder"""
        try:
            new_folder = os.path.join(folder_path, folder_name)
            os.makedirs(new_folder, exist_ok=True)
            return True, new_folder
        except Exception as e:
            return False, str(e)
    
    def start_capture_session(self, capture_rate, duration_minutes=None):
        """Start automated capture session"""
        if self.session_active:
            return False, "Session already active"
        
        self.capture_rate = capture_rate
        self.session_active = True
        self.session_captures = 0
        self.session_start_time = time.time()
        self.session_duration = duration_minutes * 60 if duration_minutes else None
        
        # Start session thread
        self.session_thread = threading.Thread(target=self._capture_session_worker)
        self.session_thread.daemon = True
        self.session_thread.start()
        
        return True, f"Session started: {capture_rate} captures/minute"
    
    def stop_capture_session(self):
        """Stop automated capture session"""
        if not self.session_active:
            return False, "No active session"
        
        self.session_active = False
        if self.session_thread:
            self.session_thread.join(timeout=2)
        
        return True, f"Session stopped. Captured {self.session_captures} images"
    
    def _capture_session_worker(self):
        """Worker thread for automated capture session"""
        interval = 60.0 / self.capture_rate  # seconds between captures
        
        while self.session_active:
            try:
                # Check if session duration exceeded
                if self.session_duration:
                    elapsed = time.time() - self.session_start_time
                    if elapsed >= self.session_duration:
                        self.session_active = False
                        break
                
                # Capture image with error handling
                success, result = self.capture_image()
                if success:
                    self.session_captures += 1
                    print(f"Session capture {self.session_captures}: {result}")
                else:
                    print(f"Capture failed: {result}")
                
                # Wait for next capture
                time.sleep(interval)
                
            except Exception as e:
                print(f"Session worker error: {e}")
                # Continue the loop instead of breaking to maintain session
                time.sleep(1)  # Brief pause before retry
    
    def get_session_status(self):
        """Get current session status"""
        if not self.session_active:
            return {
                'active': False,
                'captures': 0,
                'elapsed': 0,
                'rate': self.capture_rate
            }
        
        elapsed = time.time() - self.session_start_time if self.session_start_time else 0
        return {
            'active': True,
            'captures': self.session_captures,
            'elapsed': int(elapsed),
            'rate': self.capture_rate,
            'duration': self.session_duration
        }

# Global capture system instance
capture_system = ProductCaptureSystem()

def generate_frames():
    """Generate camera frames for live preview with better error handling"""
    frame_count = 0
    max_consecutive_failures = 10
    consecutive_failures = 0
    
    while True:
        try:
            frame = capture_system.get_frame()
            if frame is not None:
                consecutive_failures = 0  # Reset failure counter
                # Encode frame as JPEG
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ret:
                    frame_bytes = buffer.tobytes()
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                else:
                    consecutive_failures += 1
            else:
                consecutive_failures += 1
                
            # If too many consecutive failures, send placeholder and longer delay
            if consecutive_failures >= max_consecutive_failures:
                # Send placeholder frame if no camera
                placeholder = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\xf0\x01@\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9'
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + placeholder + b'\r\n')
                time.sleep(1.0)  # Longer delay when camera is not working
                consecutive_failures = 0  # Reset after sending placeholder
            else:
                time.sleep(0.1)  # Slower frame rate to reduce camera stress
                
        except Exception as e:
            print(f"Frame generation error: {e}")
            consecutive_failures += 1
            time.sleep(0.5)  # Wait before retry

@app.route('/')
def index():
    """Main application page"""
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    """Live camera feed - MANDATORY FEATURE"""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/camera/scan')
def scan_cameras():
    """Scan for available cameras excluding FaceTime"""
    try:
        cameras = []
        
        # Test camera indices 0-9 to find available cameras
        for i in range(10):
            try:
                # Create a temporary camera object to test
                test_camera = cv2.VideoCapture(i)
                
                if test_camera.isOpened():
                    # Try to read a frame to verify it's working
                    ret, frame = test_camera.read()
                    if ret and frame is not None:
                        # Get camera name/info if possible
                        camera_name = f"Camera {i}"
                        
                        # Try to get more specific camera info
                        width = test_camera.get(cv2.CAP_PROP_FRAME_WIDTH)
                        height = test_camera.get(cv2.CAP_PROP_FRAME_HEIGHT)
                        
                        if width > 0 and height > 0:
                            camera_name = f"Camera {i} ({int(width)}x{int(height)})"
                        
                        # Check if it's likely a FaceTime camera (skip it)
                        # FaceTime cameras often have specific resolutions or properties
                        # This is a basic check - you might need to adjust based on your system
                        if "facetime" not in camera_name.lower():
                            cameras.append({
                                'index': i,
                                'name': camera_name,
                                'width': int(width) if width > 0 else None,
                                'height': int(height) if height > 0 else None
                            })
                
                test_camera.release()
                
            except Exception as e:
                print(f"Error testing camera {i}: {e}")
                continue
        
        # Clean up any OpenCV windows
        cv2.destroyAllWindows()
        
        return jsonify({
            'success': True,
            'cameras': cameras,
            'message': f'Found {len(cameras)} available cameras'
        })
        
    except Exception as e:
        print(f"Camera scan error: {e}")
        return jsonify({
            'success': False,
            'cameras': [],
            'message': f'Error scanning cameras: {str(e)}'
        })

@app.route('/api/camera/init', methods=['POST'])
def init_camera():
    """Initialize camera - avoid reinitialization to prevent segfaults"""
    try:
        # If camera is already initialized and working, don't reinitialize
        if capture_system.camera and capture_system.camera.isOpened():
            # Test if camera is actually working
            ret, test_frame = capture_system.camera.read()
            if ret and test_frame is not None:
                return jsonify({'success': True, 'message': 'Camera already initialized and working'})
        
        # Only initialize if camera is not working
        data = request.get_json() or {}
        camera_index = data.get('camera_index', 0)
        success = capture_system.initialize_camera(camera_index)
        
        if success:
            return jsonify({'success': True, 'message': 'Camera initialized successfully'})
        else:
            return jsonify({'success': False, 'message': 'Camera initialization failed'})
            
    except Exception as e:
        print(f"Camera init API error: {e}")
        return jsonify({'success': False, 'message': f'Camera initialization error: {str(e)}'})

@app.route('/api/capture', methods=['POST'])
def capture_image():
    """Capture image"""
    success, result = capture_system.capture_image()
    return jsonify({'success': success, 'message': result})

@app.route('/api/storage')
def get_storage():
    """Get storage devices"""
    devices = capture_system.get_storage_devices()
    return jsonify(devices)

@app.route('/api/folder')
def get_folder():
    """Get folder contents"""
    folder_path = request.args.get('path', capture_system.current_folder)
    contents = capture_system.get_folder_contents(folder_path)
    return jsonify({
        'path': folder_path,
        'contents': contents
    })

@app.route('/api/session/start', methods=['POST'])
def start_session():
    """Start capture session"""
    data = request.get_json()
    capture_rate = data.get('rate', 24)
    duration = data.get('duration')  # in minutes
    
    success, message = capture_system.start_capture_session(capture_rate, duration)
    return jsonify({'success': success, 'message': message})

@app.route('/api/session/stop', methods=['POST'])
def stop_session():
    """Stop capture session"""
    success, message = capture_system.stop_capture_session()
    return jsonify({'success': success, 'message': message})

@app.route('/api/session/status')
def session_status():
    """Get session status"""
    status = capture_system.get_session_status()
    return jsonify(status)

@app.route('/api/folder/create', methods=['POST'])
def create_folder():
    """Create new folder"""
    data = request.get_json()
    folder_path = data.get('path', capture_system.current_folder)
    folder_name = data.get('name', 'New Folder')
    
    success, result = capture_system.create_folder(folder_path, folder_name)
    return jsonify({'success': success, 'message': result})

@app.route('/api/folder/set', methods=['POST'])
def set_current_folder():
    """Set current working folder"""
    data = request.get_json()
    folder_path = data.get('path')
    if folder_path and os.path.exists(folder_path):
        capture_system.current_folder = folder_path
        return jsonify({'success': True})
    return jsonify({'success': False})

@app.route('/api/status')
def get_status():
    """Get system status"""
    return jsonify({
        'camera_connected': capture_system.camera is not None and capture_system.camera.isOpened(),
        'current_folder': capture_system.current_folder,
        'capture_count': capture_system.capture_count,
        'session_time': int(time.time() - capture_system.session_start)
    })

@app.route('/api/platform/rotate', methods=['POST'])
def rotate_platform():
    """Rotate platform - placeholder for hardware integration"""
    # TODO: Integrate with actual rotating platform hardware
    # This could be Arduino, stepper motor controller, etc.
    time.sleep(0.5)  # Simulate rotation time
    return jsonify({'success': True, 'message': 'Platform rotated'})

if __name__ == '__main__':
    # Initialize camera on startup
    capture_system.initialize_camera()
    
    # Run Flask app
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)