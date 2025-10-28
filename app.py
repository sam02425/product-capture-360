import streamlit as st
import cv2
import numpy as np
from datetime import datetime
import os
import json
import time
from pathlib import Path
import threading
from queue import Queue
from PIL import Image
import platform
import psutil
import shutil

# Page configuration with responsive design
st.set_page_config(
    page_title="360° Product Capture System",
    page_icon="📸",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Add responsive CSS for better mobile/tablet experience
st.markdown("""
<style>
    /* Responsive design improvements */
    @media (max-width: 768px) {
        .stSelectbox > div > div {
            font-size: 14px;
        }
        .stButton > button {
            width: 100%;
            margin-bottom: 5px;
        }
        .stMetric {
            font-size: 12px;
        }
        .stColumns {
            gap: 0.5rem;
        }
    }
    
    /* Enhanced visual indicators */
    .camera-status-live {
        animation: pulse 2s infinite;
        background: linear-gradient(45deg, #28a745, #20c997);
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }
    
    /* Recording indicator styles */
    .recording-indicator {
        background: linear-gradient(45deg, #dc3545, #c82333);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        animation: recording-pulse 1s infinite;
        box-shadow: 0 2px 8px rgba(220, 53, 69, 0.4);
        display: inline-block;
        margin: 5px 0;
    }
    
    @keyframes recording-pulse {
        0% { 
            opacity: 1; 
            transform: scale(1);
            box-shadow: 0 2px 8px rgba(220, 53, 69, 0.4);
        }
        50% { 
            opacity: 0.8; 
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.6);
        }
        100% { 
            opacity: 1; 
            transform: scale(1);
            box-shadow: 0 2px 8px rgba(220, 53, 69, 0.4);
        }
    }
    
    .ready-indicator {
        background: linear-gradient(45deg, #28a745, #20c997);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        display: inline-block;
        margin: 5px 0;
    }
    
    .session-timer {
        background: linear-gradient(45deg, #ffc107, #e0a800);
        color: #212529;
        padding: 6px 12px;
        border-radius: 15px;
        font-weight: bold;
        font-size: 14px;
        display: inline-block;
        margin: 5px 0;
        box-shadow: 0 2px 6px rgba(255, 193, 7, 0.3);
    }
    
    .capture-count {
        background: linear-gradient(45deg, #17a2b8, #138496);
        color: white;
        padding: 6px 12px;
        border-radius: 15px;
        font-weight: bold;
        font-size: 14px;
        display: inline-block;
        margin: 5px 0;
        box-shadow: 0 2px 6px rgba(23, 162, 184, 0.3);
    }
    
    .live-preview-container {
        border: 3px solid transparent;
        border-radius: 10px;
        padding: 5px;
        transition: all 0.3s ease;
    }
    
    .live-preview-recording {
        border-color: #dc3545;
        box-shadow: 0 0 20px rgba(220, 53, 69, 0.3);
        animation: border-pulse 2s infinite;
    }
    
    .live-preview-ready {
        border-color: #28a745;
        box-shadow: 0 0 15px rgba(40, 167, 69, 0.2);
    }
    
    @keyframes border-pulse {
        0% { 
            border-color: #dc3545;
            box-shadow: 0 0 20px rgba(220, 53, 69, 0.3);
        }
        50% { 
            border-color: #ff6b7a;
            box-shadow: 0 0 30px rgba(220, 53, 69, 0.5);
        }
        100% { 
            border-color: #dc3545;
            box-shadow: 0 0 20px rgba(220, 53, 69, 0.3);
        }
    }
    
    /* Improved button styling */
    .stButton > button[data-testid="baseButton-primary"] {
        background: linear-gradient(45deg, #007bff, #0056b3);
        border: none;
        box-shadow: 0 2px 4px rgba(0,123,255,0.3);
    }
    
    /* Better spacing for mobile */
    .element-container {
        margin-bottom: 0.5rem;
    }
    
    /* Playback controls styling */
    .playback-controls {
        background: rgba(0, 0, 0, 0.8);
        border-radius: 10px;
        padding: 10px;
        margin: 10px 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }
    
    .playback-button {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .playback-button:hover {
        background: rgba(255, 255, 255, 0.3);
        border-color: rgba(255, 255, 255, 0.5);
    }
</style>
""", unsafe_allow_html=True)

# Initialize session state variables
if 'capturing' not in st.session_state:
    st.session_state.capturing = False
if 'cameras' not in st.session_state:
    st.session_state.cameras = {}
if 'capture_count' not in st.session_state:
    st.session_state.capture_count = 0
if 'session_id' not in st.session_state:
    st.session_state.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
if 'product_configured' not in st.session_state:
    st.session_state.product_configured = False
if 'current_product_path' not in st.session_state:
    st.session_state.current_product_path = None
if 'selected_storage_path' not in st.session_state:
    st.session_state.selected_storage_path = str(Path.cwd() / "captures")
if 'camera_preview_mode' not in st.session_state:
    st.session_state.camera_preview_mode = False
if 'preview_camera_id' not in st.session_state:
    st.session_state.preview_camera_id = None
if 'preview_camera_cap' not in st.session_state:
    st.session_state.preview_camera_cap = None
if 'zoom_level' not in st.session_state:
    st.session_state.zoom_level = 1.0
# Camera locking mechanism
if 'camera_locks' not in st.session_state:
    st.session_state.camera_locks = {}
# Session timing
if 'capture_start_time' not in st.session_state:
    st.session_state.capture_start_time = None
if 'session_timeout' not in st.session_state:
    st.session_state.session_timeout = 60  # 1 minute in seconds

# Updated capture speed presets with frames per minute
SPEED_PRESETS = {
    "Slow (24 frames/min)": {
        "frames_per_min": 24,
        "interval_seconds": 2.5,
        "description": "Very slow capture for detailed inspection"
    },
    "Medium (36 frames/min)": {
        "frames_per_min": 36,
        "interval_seconds": 1.67,
        "description": "Balanced speed for most products"
    },
    "Fast (48 frames/min)": {
        "frames_per_min": 48,
        "interval_seconds": 1.25,
        "description": "Quick capture for simple products"
    },
    "Very Fast (72 frames/min)": {
        "frames_per_min": 72,
        "interval_seconds": 0.83,
        "description": "High-speed capture for previews"
    },
    "Ultra Fast (128 frames/min)": {
        "frames_per_min": 128,
        "interval_seconds": 0.47,
        "description": "Maximum speed capture"
    }
}

class DriveManager:
    """Manages external drive detection and storage location selection"""
    
    @staticmethod
    def get_available_drives():
        """Detect all available drives including external drives"""
        drives = []
        
        try:
            # Get all disk partitions
            partitions = psutil.disk_partitions()
            
            for partition in partitions:
                try:
                    # Skip system partitions that are typically read-only
                    if platform.system() == "Darwin":  # macOS
                        # Skip system partitions
                        if partition.mountpoint in ["/", "/System", "/private", "/usr"]:
                            continue
                        # Skip read-only partitions
                        if "ro" in partition.opts:
                            continue
                    elif platform.system() == "Windows":
                        # Skip system reserved partitions
                        if "System Reserved" in partition.device:
                            continue
                    elif platform.system() == "Linux":
                        # Skip system partitions
                        if partition.mountpoint in ["/", "/boot", "/sys", "/proc"]:
                            continue
                    
                    # Get partition usage
                    usage = psutil.disk_usage(partition.mountpoint)
                    
                    # Determine drive type
                    drive_type = "Internal"
                    if platform.system() == "Darwin":  # macOS
                        if "/Volumes/" in partition.mountpoint:
                            drive_type = "External"
                        elif partition.mountpoint == "/":
                            drive_type = "System"
                        else:
                            drive_type = "Internal"
                    elif platform.system() == "Windows":
                        if partition.fstype in ['NTFS', 'FAT32', 'exFAT'] and len(partition.device) == 3:
                            drive_type = "External" if partition.device[0] not in ['C'] else "Internal"
                    elif platform.system() == "Linux":
                        if "/media/" in partition.mountpoint or "/mnt/" in partition.mountpoint:
                            drive_type = "External"
                    
                    drives.append({
                        "name": partition.mountpoint,
                        "device": partition.device,
                        "fstype": partition.fstype,
                        "type": drive_type,
                        "total_gb": round(usage.total / (1024**3), 2),
                        "free_gb": round(usage.free / (1024**3), 2),
                        "used_percent": round((usage.used / usage.total) * 100, 1),
                        "opts": partition.opts
                    })
                except (PermissionError, OSError):
                    # Skip drives that can't be accessed
                    continue
                    
        except Exception as e:
            st.error(f"Error detecting drives: {e}")
            
        # Always add user's home directory as a safe fallback
        try:
            home_path = str(Path.home())
            home_usage = psutil.disk_usage(home_path)
            drives.append({
                "name": home_path,
                "device": "Home Directory",
                "fstype": "Local",
                "type": "Safe",
                "total_gb": round(home_usage.total / (1024**3), 2),
                "free_gb": round(home_usage.free / (1024**3), 2),
                "used_percent": round((home_usage.used / home_usage.total) * 100, 1),
                "opts": "rw"
            })
        except:
            pass
            
        return drives
    
    @staticmethod
    def format_drive_display(drive):
        """Format drive information for display"""
        if drive["type"] == "External":
            icon = "💾"
        elif drive["type"] == "Safe":
            icon = "🏠"
        elif drive["type"] == "System":
            icon = "💻"
        else:
            icon = "🖥️"
        
        return f"{icon} {drive['name']} ({drive['free_gb']:.1f}GB free / {drive['total_gb']:.1f}GB total)"
    
    @staticmethod
    def validate_storage_path(path):
        """Validate if the storage path is writable"""
        try:
            test_path = Path(path)
            
            # Check if path is absolute and not at root level
            if not test_path.is_absolute():
                return False, "Path must be absolute"
            
            # Prevent root level directories on Unix systems
            if platform.system() in ["Darwin", "Linux"] and len(test_path.parts) <= 2:
                return False, "Cannot create folders at root level"
            
            # Create directory structure
            test_path.mkdir(parents=True, exist_ok=True)
            
            # Test write permission
            test_file = test_path / "test_write.tmp"
            test_file.write_text("test")
            test_file.unlink()
            
            return True, "Path is valid and writable"
        except PermissionError:
            return False, "Permission denied - choose a different location"
        except OSError as e:
            if "Read-only file system" in str(e):
                return False, "Read-only file system - choose a writable location"
            return False, f"Cannot write to path: {e}"
        except Exception as e:
            return False, f"Path validation error: {e}"

class CameraManager:
    """Manages USB camera connections and image capture"""

    @staticmethod
    def detect_cameras(max_cameras=10):
        """Detect available USB cameras with better detection and backend handling"""
        available_cameras = []
        
        # Try different backends to avoid OBSENSOR issues
        backends_to_try = [
            cv2.CAP_AVFOUNDATION,  # macOS native
            cv2.CAP_V4L2,          # Linux
            cv2.CAP_DSHOW,         # Windows DirectShow
            cv2.CAP_ANY            # Fallback
        ]
        
        for i in range(max_cameras):
            cap = None
            working_backend = None
            
            # Try different backends until one works
            for backend in backends_to_try:
                try:
                    cap = cv2.VideoCapture(i, backend)
                    if cap.isOpened():
                        # Test if camera can actually capture frames
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            working_backend = backend
                            break
                        else:
                            cap.release()
                            cap = None
                    else:
                        if cap:
                            cap.release()
                        cap = None
                except Exception as e:
                    if cap:
                        cap.release()
                    cap = None
                    continue
            
            # If we found a working camera, get its properties
            if cap and working_backend is not None:
                try:
                    # Get camera properties
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    
                    # Get backend name for display
                    backend_names = {
                        cv2.CAP_AVFOUNDATION: "AVFoundation",
                        cv2.CAP_V4L2: "V4L2",
                        cv2.CAP_DSHOW: "DirectShow",
                        cv2.CAP_ANY: "Default"
                    }
                    backend_name = backend_names.get(working_backend, "Unknown")
                    
                    camera_info = {
                        "id": i,
                        "width": width,
                        "height": height,
                        "fps": fps,
                        "backend": backend_name,
                        "backend_id": working_backend,
                        "name": f"Camera {i} ({width}x{height})"
                    }
                    available_cameras.append(camera_info)
                except Exception as e:
                    print(f"Error getting camera {i} properties: {e}")
                finally:
                    cap.release()
                
        return available_cameras

    @staticmethod
    def initialize_camera(camera_id, resolution=(1920, 1080)):
        """Initialize camera with optimal settings and locking mechanism"""
        # Check if camera is already locked by another session
        camera_locks = st.session_state.get('camera_locks', {})
        if camera_id in camera_locks and camera_locks[camera_id]:
            st.error(f"❌ Camera {camera_id} is already in use by another session")
            return None
        
        # Try different backends for better compatibility
        backends_to_try = [
            cv2.CAP_AVFOUNDATION,  # macOS native
            cv2.CAP_V4L2,          # Linux
            cv2.CAP_DSHOW,         # Windows DirectShow
            cv2.CAP_ANY            # Fallback
        ]
        
        cap = None
        for backend in backends_to_try:
            try:
                cap = cv2.VideoCapture(camera_id, backend)
                if cap.isOpened():
                    # Test if camera can actually capture frames
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None:
                        break
                    else:
                        cap.release()
                        cap = None
                else:
                    if cap:
                        cap.release()
                    cap = None
            except Exception:
                if cap:
                    cap.release()
                cap = None
                continue
        
        if cap and cap.isOpened():
            # Lock the camera
            if 'camera_locks' not in st.session_state:
                st.session_state.camera_locks = {}
            st.session_state.camera_locks[camera_id] = True
            
            # Set resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
            
            # Set camera properties for better quality - be more careful with exposure
            try:
                # Enable autofocus if available
                cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
                
                # Set auto exposure to 0.75 (partial auto) instead of 1 (full auto)
                # This prevents completely black images on some cameras
                cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
                
                # Set reasonable default values
                cap.set(cv2.CAP_PROP_BRIGHTNESS, 0.0)  # Default brightness
                cap.set(cv2.CAP_PROP_CONTRAST, 1.0)    # Default contrast
                cap.set(cv2.CAP_PROP_SATURATION, 1.0)  # Default saturation
                cap.set(cv2.CAP_PROP_GAIN, 0.0)       # Default gain
                
                # Set exposure manually if auto exposure fails
                cap.set(cv2.CAP_PROP_EXPOSURE, -6)     # Manual exposure value
                
            except Exception as e:
                print(f"Warning: Could not set some camera properties: {e}")
            
            # Set buffer size to reduce latency for live preview
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            # Allow camera to warm up and stabilize with more frames
            print(f"Warming up camera {camera_id}...")
            for i in range(15):
                ret, frame = cap.read()
                if ret and frame is not None:
                    # Check if frame is not completely black
                    if frame.mean() > 10:  # If average pixel value > 10, it's not black
                        print(f"Camera {camera_id} warmed up successfully after {i+1} frames")
                        break
                time.sleep(0.1)
            
            # Final test to ensure camera is working
            ret, test_frame = cap.read()
            if ret and test_frame is not None and test_frame.mean() > 10:
                print(f"Camera {camera_id} initialized successfully")
                return cap
            else:
                print(f"Camera {camera_id} producing black frames, trying to fix...")
                # Try to fix black frame issue
                cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)  # Less auto exposure
                cap.set(cv2.CAP_PROP_EXPOSURE, -4)         # Different exposure
                cap.set(cv2.CAP_PROP_BRIGHTNESS, 0.1)      # Slight brightness boost
                
                # Test again after adjustment
                for _ in range(5):
                    ret, test_frame = cap.read()
                    if ret and test_frame is not None and test_frame.mean() > 10:
                        print(f"Camera {camera_id} fixed and working")
                        return cap
                    time.sleep(0.2)
                
                print(f"Camera {camera_id} still producing black frames")
                cap.release()
                return None
        
        print(f"Failed to initialize camera {camera_id}")
        return None

    @staticmethod
    def capture_image(cap):
        """Capture high-quality image with improved frame handling"""
        if cap and cap.isOpened():
            # Clear buffer first to get the most recent frame
            for _ in range(2):
                cap.read()
            
            # Capture multiple frames and use the best one
            best_frame = None
            best_brightness = 0
            
            for attempt in range(5):
                ret, frame = cap.read()
                if ret and frame is not None:
                    # Check frame quality (brightness/contrast)
                    frame_brightness = frame.mean()
                    
                    # Skip completely black frames
                    if frame_brightness < 5:
                        print(f"Skipping black frame (brightness: {frame_brightness:.2f})")
                        time.sleep(0.05)  # Small delay before next attempt
                        continue
                    
                    # Keep the frame with best brightness (not too dark, not overexposed)
                    if best_frame is None or (20 < frame_brightness < 200 and frame_brightness > best_brightness):
                        best_frame = frame.copy()
                        best_brightness = frame_brightness
                        
                    # If we have a good frame, use it
                    if 20 < frame_brightness < 200:
                        print(f"Captured good frame (brightness: {frame_brightness:.2f})")
                        return best_frame
                
                time.sleep(0.1)  # Wait between attempts
            
            # Return the best frame we found, even if not perfect
            if best_frame is not None:
                print(f"Using best available frame (brightness: {best_brightness:.2f})")
                return best_frame
            else:
                print("Failed to capture any valid frame")
        
        return None
    
    @staticmethod
    def get_camera_info(camera_id):
        """Get detailed camera information including resolution and capabilities"""
        try:
            cap = cv2.VideoCapture(camera_id)
            if not cap.isOpened():
                return None
            
            # Get camera properties
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            # Try to get camera name (may not work on all systems)
            backend = cap.getBackendName()
            
            # Test if camera can capture frames
            ret, frame = cap.read()
            cap.release()
            
            if ret and frame is not None:
                return {
                    'id': camera_id,
                    'width': width,
                    'height': height,
                    'fps': fps,
                    'backend': backend,
                    'resolution': f"{width}x{height}",
                    'aspect_ratio': width / height if height > 0 else 1.0,
                    'working': True
                }
            else:
                return None
                
        except Exception as e:
            print(f"Error getting camera {camera_id} info: {e}")
            return None

    @staticmethod
    def initialize_preview_camera(camera_id, resolution=(1920, 1080)):
        """Initialize camera specifically for preview with optimal settings and backend handling"""
        try:
            # Get the preferred backend from detected cameras if available
            available_cameras = st.session_state.get('available_cameras', [])
            preferred_backend = cv2.CAP_AVFOUNDATION  # Default for macOS
            
            # Find the backend that worked for this camera during detection
            for cam in available_cameras:
                if cam['id'] == camera_id and 'backend_id' in cam:
                    preferred_backend = cam['backend_id']
                    break
            
            # Try to initialize with the preferred backend first
            cap = cv2.VideoCapture(camera_id, preferred_backend)
            
            # If that fails, try other backends
            if not cap.isOpened():
                backends_to_try = [
                    cv2.CAP_AVFOUNDATION,  # macOS native
                    cv2.CAP_V4L2,          # Linux
                    cv2.CAP_DSHOW,         # Windows DirectShow
                    cv2.CAP_ANY            # Fallback
                ]
                
                for backend in backends_to_try:
                    if backend != preferred_backend:  # Skip already tried backend
                        try:
                            if cap:
                                cap.release()
                            cap = cv2.VideoCapture(camera_id, backend)
                            if cap.isOpened():
                                # Test if it can capture
                                ret, _ = cap.read()
                                if ret:
                                    break
                        except Exception:
                            continue
            
            if not cap.isOpened():
                return None
            
            # Set resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
            
            # Optimize for preview (faster frame rate, lower latency)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer for real-time
            cap.set(cv2.CAP_PROP_FPS, 30)  # Set to 30 FPS for smooth preview
            
            # Auto settings for better preview
            try:
                cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)  # Enable auto exposure
                cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)  # Enable autofocus if available
            except Exception:
                pass  # Some cameras don't support these properties
            
            # Warm up camera with a few frames
            for _ in range(5):
                ret, _ = cap.read()
                if not ret:
                    break
                time.sleep(0.1)
            
            return cap
            
        except Exception as e:
            print(f"Error initializing preview camera {camera_id}: {e}")
            return None

    @staticmethod
    def get_preview_frame_with_zoom(cap, zoom_level=1.0, max_width=800):
        """Get a preview frame with zoom functionality - optimized for performance"""
        try:
            if not cap or not cap.isOpened():
                return None
            
            # Skip buffer clearing for better performance during live preview
            ret, frame = cap.read()
            if not ret or frame is None:
                return None
            
            # Apply zoom if needed (optimized)
            if zoom_level != 1.0:
                h, w = frame.shape[:2]
                # Calculate crop area for zoom
                crop_h = int(h / zoom_level)
                crop_w = int(w / zoom_level)
                
                # Center the crop
                start_y = (h - crop_h) // 2
                start_x = (w - crop_w) // 2
                
                # Ensure crop boundaries are valid
                start_y = max(0, start_y)
                start_x = max(0, start_x)
                end_y = min(h, start_y + crop_h)
                end_x = min(w, start_x + crop_w)
                
                # Crop and resize back to original size
                cropped = frame[start_y:end_y, start_x:end_x]
                if cropped.size > 0:
                    frame = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)
            
            # Optimized resize for display performance
            h, w = frame.shape[:2]
            if w > max_width:
                aspect_ratio = h / w
                new_width = max_width
                new_height = int(new_width * aspect_ratio)
                # Use faster interpolation for live preview
                frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
            
            # Convert BGR to RGB for Streamlit (optimized)
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return frame_rgb
            
        except Exception as e:
            print(f"Error getting preview frame: {e}")
            return None

class FolderManager:
    """Manages hierarchical folder structure for products"""

    @staticmethod
    def create_product_path(category, subcategory, brand, product_name, session_id, base_dir=None):
        """Create hierarchical folder structure"""
        if base_dir is None:
            base_dir = st.session_state.selected_storage_path
            
        # Build path: base_dir/session/category/subcategory/brand/product_name
        parts = [base_dir, session_id]

        if category:
            parts.append(category)
        if subcategory:
            parts.append(subcategory)
        if brand:
            parts.append(brand)
        if product_name:
            parts.append(product_name)

        product_path = Path(*parts)
        product_path.mkdir(parents=True, exist_ok=True)

        return product_path

    @staticmethod
    def get_folder_stats(base_dir=None):
        """Get statistics about all captured folders"""
        if base_dir is None:
            base_dir = st.session_state.selected_storage_path
            
        base_path = Path(base_dir)
        if not base_path.exists():
            return {
                "total_sessions": 0,
                "total_folders": 0,
                "total_images": 0,
                "sessions": {}
            }

        stats = {
            "total_sessions": 0,
            "total_folders": 0,
            "total_images": 0,
            "sessions": {}
        }

        # Iterate through sessions
        for session_dir in base_path.iterdir():
            if session_dir.is_dir():
                stats["total_sessions"] += 1
                session_name = session_dir.name
                stats["sessions"][session_name] = {
                    "path": str(session_dir),
                    "folders": {},
                    "total_images": 0
                }

                # Recursively count folders and images
                def count_recursive(path, parent_key=""):
                    folder_count = 0
                    image_count = 0

                    for item in path.iterdir():
                        if item.is_dir():
                            folder_count += 1
                            sub_folder_count, sub_image_count = count_recursive(item, f"{parent_key}/{item.name}" if parent_key else item.name)
                            folder_count += sub_folder_count
                            image_count += sub_image_count

                            # Store folder info
                            stats["sessions"][session_name]["folders"][f"{parent_key}/{item.name}" if parent_key else item.name] = {
                                "path": str(item),
                                "image_count": sub_image_count,
                                "subfolders": sub_folder_count
                            }
                        elif item.suffix.lower() in ['.png', '.jpg', '.jpeg']:
                            image_count += 1

                    return folder_count, image_count

                folder_count, image_count = count_recursive(session_dir)
                stats["total_folders"] += folder_count
                stats["total_images"] += image_count
                stats["sessions"][session_name]["total_images"] = image_count

        return stats

    @staticmethod
    def get_images_in_folder(folder_path):
        """Get all images in a specific folder"""
        folder = Path(folder_path)
        if not folder.exists():
            return []

        images = []
        for ext in ['*.png', '*.jpg', '*.jpeg', '*.PNG', '*.JPG', '*.JPEG']:
            images.extend(folder.glob(ext))

        return sorted(images)

class ImageProcessor:
    """Handles image saving and metadata management"""

    @staticmethod
    def save_image(frame, product_path, camera_id, capture_num):
        """Save image in PNG format with validation"""
        if frame is None:
            print(f"Error: Cannot save None frame from camera {camera_id}")
            return None
            
        # Check if frame is valid (not completely black)
        frame_brightness = frame.mean()
        if frame_brightness < 5:
            print(f"Warning: Saving very dark frame (brightness: {frame_brightness:.2f}) from camera {camera_id}")
        else:
            print(f"Saving frame with brightness {frame_brightness:.2f} from camera {camera_id}")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"cam{camera_id}_{capture_num:04d}_{timestamp}.png"
        filepath = product_path / filename

        try:
            # Save as PNG for lossless quality
            success = cv2.imwrite(str(filepath), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
            
            if success:
                print(f"Successfully saved image: {filename}")
                return str(filepath)
            else:
                print(f"Failed to save image: {filename}")
                return None
                
        except Exception as e:
            print(f"Error saving image {filename}: {e}")
            return None

    @staticmethod
    def save_metadata(product_path, settings, image_paths, category_info):
        """Save capture session metadata"""
        metadata = {
            "session_id": st.session_state.session_id,
            "category_hierarchy": category_info,
            "capture_timestamp": datetime.now().isoformat(),
            "settings": settings,
            "total_images": len(image_paths),
            "image_files": [str(Path(p).name) for p in image_paths],
            "format": "PNG (lossless)",
            "purpose": "Object detection training (YOLOv11/DOLG/DEIM)"
        }

        metadata_file = product_path / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)

        return str(metadata_file)

def camera_preview_interface():
    """Dedicated camera preview interface with all requested features"""
    st.header("📹 Camera Preview & Selection")
    
    # Get available cameras - auto-detect if not already available
    available_cameras = st.session_state.get('available_cameras', [])
    
    if not available_cameras:
        st.info("🔍 Detecting cameras automatically...")
        with st.spinner("Scanning for available cameras..."):
            available_cameras = CameraManager.detect_cameras()
            st.session_state.available_cameras = available_cameras
        
        if not available_cameras:
            st.error("❌ No cameras detected on your system.")
            st.markdown("""
            **Troubleshooting:**
            - Make sure your camera is connected and not being used by another application
            - Try reconnecting your USB camera
            - Check if camera drivers are properly installed
            - Restart the application if needed
            """)
            
            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔄 Try Again", use_container_width=True):
                    st.rerun()
            with col2:
                if st.button("🔙 Back to Camera Setup", use_container_width=True):
                    st.session_state.camera_preview_mode = False
                    st.rerun()
            return
        else:
            st.success(f"✅ Found {len(available_cameras)} camera(s)!")
            time.sleep(1)  # Brief pause to show success message
            st.rerun()
    
    # Enhanced Camera Selection Interface
    st.subheader("📷 Select Camera for Preview")
    
    # Create responsive layout for camera selection
    selection_col1, selection_col2 = st.columns([3, 2])
    
    with selection_col1:
        # Dropdown menu for camera selection with detailed options
        camera_options = []
        current_idx = 0
        
        for i, cam in enumerate(available_cameras):
            # Create detailed option text with visual indicators
            status_icon = "🟢 ACTIVE" if cam['id'] == st.session_state.preview_camera_id else "⚪ Available"
            fps_info = f"({cam['fps']:.1f} FPS)" if 'fps' in cam else ""
            camera_options.append(f"{status_icon} Camera {cam['id']} {fps_info}")
            
            if cam['id'] == st.session_state.preview_camera_id:
                current_idx = i
        
        # Enhanced dropdown with clear labeling and help text
        selected_camera_option = st.selectbox(
            "🎯 Choose Camera:",
            options=camera_options,
            index=current_idx,
            key="main_camera_dropdown",
            help="Select a camera to preview its live feed. The preview will update instantly."
        )
        
        # Extract camera ID from selection with improved parsing
        try:
            # Parse camera ID more robustly - look for "Camera X" pattern
            import re
            match = re.search(r'Camera (\d+)', selected_camera_option)
            if match:
                selected_camera_id = int(match.group(1))
            else:
                # Fallback: use the index if parsing fails
                selected_camera_id = available_cameras[camera_options.index(selected_camera_option)]['id']
        except (ValueError, IndexError) as e:
            st.error(f"Error parsing camera selection: {e}")
            selected_camera_id = st.session_state.preview_camera_id or available_cameras[0]['id']
        
        # Handle camera switching with immediate preview update
        if selected_camera_id != st.session_state.preview_camera_id:
            # Release current camera
            if st.session_state.preview_camera_cap:
                st.session_state.preview_camera_cap.release()
            
            # Initialize new camera with loading indicator
            with st.spinner(f"🔄 Switching to Camera {selected_camera_id}..."):
                st.session_state.preview_camera_id = selected_camera_id
                st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(selected_camera_id)
                st.session_state.zoom_level = 1.0  # Reset zoom
                time.sleep(0.2)  # Minimal delay for faster switching
            
            if st.session_state.preview_camera_cap:
                st.success(f"✅ Now previewing Camera {selected_camera_id}")
            else:
                st.error(f"❌ Failed to initialize Camera {selected_camera_id}")
            time.sleep(0.3)
            st.rerun()
    
    with selection_col2:
        # Quick camera switching buttons for multiple cameras
        if len(available_cameras) > 1:
            st.markdown("**🚀 Quick Switch:**")
            for camera in available_cameras:
                is_active = camera['id'] == st.session_state.preview_camera_id
                button_style = "primary" if is_active else "secondary"
                icon = "🎥" if is_active else "📷"
                
                button_text = f"{icon} Cam {camera['id']}"
                if is_active:
                    button_text += " ✓"
                
                if st.button(
                    button_text,
                    key=f"quick_switch_{camera['id']}",
                    type=button_style,
                    use_container_width=True,
                    disabled=is_active,
                    help=f"Switch to Camera {camera['id']} instantly"
                ):
                    # Release current camera
                    if st.session_state.preview_camera_cap:
                        st.session_state.preview_camera_cap.release()
                    
                    # Initialize new camera
                    with st.spinner(f"Switching..."):
                        st.session_state.preview_camera_id = camera['id']
                        st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(camera['id'])
                        st.session_state.zoom_level = 1.0
                        time.sleep(0.2)
                    st.rerun()
        else:
            st.info("📷 Single camera mode")
            st.caption("Only one camera detected")
    
    # Auto-initialize first camera if none selected
    if st.session_state.preview_camera_id is None and available_cameras:
        first_camera = available_cameras[0]
        with st.spinner(f"🎥 Auto-initializing Camera {first_camera['id']}..."):
            st.session_state.preview_camera_id = first_camera['id']
            st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(first_camera['id'])
            st.session_state.zoom_level = 1.0
        
        if st.session_state.preview_camera_cap:
            st.success(f"✅ Camera {first_camera['id']} ready! Preview starting...")
            time.sleep(0.5)
            st.rerun()
    
    # Visual indicator for currently selected camera with enhanced info
    if st.session_state.preview_camera_id is not None:
        # Enhanced visual indicator with status badge
        status_col1, status_col2 = st.columns([3, 1])
        
        with status_col1:
            st.success(f"🎯 **Currently Previewing:** Camera {st.session_state.preview_camera_id}")
        
        with status_col2:
            # Live status badge
            st.markdown(
                """
                <div style="text-align: center; padding: 5px; background-color: #28a745; color: white; border-radius: 10px; font-size: 12px; font-weight: bold;">
                    🔴 LIVE
                </div>
                """,
                unsafe_allow_html=True
            )
        
        # Get and display camera information with enhanced layout
        camera_info = CameraManager.get_camera_info(st.session_state.preview_camera_id)
        if camera_info:
            info_col1, info_col2, info_col3, info_col4 = st.columns(4)
            with info_col1:
                st.metric("📐 Resolution", camera_info['resolution'])
            with info_col2:
                st.metric("🎬 Frame Rate", f"{camera_info['fps']:.1f} FPS")
            with info_col3:
                st.metric("📏 Aspect Ratio", f"{camera_info['aspect_ratio']:.2f}")
            with info_col4:
                st.caption(f"🔧 **Backend:** {camera_info['backend']}")
    
    st.divider()
    
    # Preview display section - only show if camera is selected and initialized
    if st.session_state.preview_camera_id is not None and st.session_state.preview_camera_cap:
        # Get detailed camera info for controls
        camera_info = CameraManager.get_camera_info(st.session_state.preview_camera_id)
        
        # Control panel with enhanced responsive design
        st.subheader("🎛️ Preview Controls")
        
        col1, col2, col3, col4 = st.columns([2, 2, 2, 2])
        
        with col1:
            # Enhanced zoom controls with prominent buttons
            st.markdown("**🔍 Zoom Control**")
            
            # Large zoom in/out buttons
            zoom_btn_col1, zoom_btn_col2, zoom_btn_col3 = st.columns([1, 1, 1])
            with zoom_btn_col1:
                if st.button("🔍➖ Zoom Out", key="zoom_out", use_container_width=True, help="Zoom out"):
                    st.session_state.zoom_level = max(1.0, st.session_state.zoom_level - 0.2)
                    st.rerun()
            with zoom_btn_col2:
                if st.button("🔍➕ Zoom In", key="zoom_in", use_container_width=True, help="Zoom in"):
                    st.session_state.zoom_level = min(3.0, st.session_state.zoom_level + 0.2)
                    st.rerun()
            with zoom_btn_col3:
                if st.button("🎯 Reset", key="zoom_reset", use_container_width=True, help="Reset zoom"):
                    st.session_state.zoom_level = 1.0
                    st.rerun()
            
            # Current zoom level display
            st.caption(f"Current Zoom: {st.session_state.zoom_level:.1f}x")
            
            # Fine adjustment slider (smaller)
            zoom_level = st.slider(
                "Fine Adjust",
                min_value=1.0,
                max_value=3.0,
                value=st.session_state.zoom_level,
                step=0.1,
                help="Fine-tune zoom level",
                label_visibility="collapsed"
            )
            st.session_state.zoom_level = zoom_level
        
        with col2:
            # Enhanced refresh and camera actions
            st.markdown("**🔄 Camera Actions**")
            if st.button("🔄 Refresh Frame", use_container_width=True, help="Refresh camera feed"):
                with st.spinner("Refreshing camera..."):
                    # Force camera refresh
                    if st.session_state.preview_camera_cap:
                        st.session_state.preview_camera_cap.release()
                    st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(
                        st.session_state.preview_camera_id
                    )
                    time.sleep(0.5)
                st.rerun()
            
            if st.button("🎯 Reset Zoom", use_container_width=True, help="Reset to normal zoom"):
                st.session_state.zoom_level = 1.0
                st.rerun()
        
        with col3:
            # Enhanced camera switching with visual indicators
            st.markdown("**📷 Camera Switch**")
            if len(available_cameras) > 1:
                current_idx = next((i for i, cam in enumerate(available_cameras) if cam['id'] == st.session_state.preview_camera_id), 0)
                
                # Create options with visual indicators
                camera_options = []
                for i, cam in enumerate(available_cameras):
                    indicator = "🟢" if cam['id'] == st.session_state.preview_camera_id else "⚪"
                    camera_options.append(f"{indicator} Camera {cam['id']}")
                
                selected_option = st.selectbox(
                    "Switch Camera",
                    options=camera_options,
                    index=current_idx,
                    key="quick_switch_camera",
                    help="Select a different camera"
                )
                
                # Extract camera ID and switch if different
                new_camera_id = int(selected_option.split()[-1])
                if new_camera_id != st.session_state.preview_camera_id:
                    # Release current camera
                    if st.session_state.preview_camera_cap:
                        st.session_state.preview_camera_cap.release()
                    
                    # Initialize new camera
                    with st.spinner(f"Switching to camera {new_camera_id}..."):
                        st.session_state.preview_camera_id = new_camera_id
                        st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(new_camera_id)
                        st.session_state.zoom_level = 1.0  # Reset zoom
                        time.sleep(0.5)
                    st.success(f"✅ Switched to Camera {new_camera_id}")
                    st.rerun()
            else:
                st.info("📷 Single camera mode")
        
        with col4:
            # Additional settings and options
            st.markdown("**⚙️ Settings**")
            
            # Aspect ratio toggle
            maintain_aspect = st.checkbox(
                "📐 Keep Aspect",
                value=True,
                help="Maintain original aspect ratio"
            )
            
            # Performance mode
            performance_mode = st.checkbox(
                "⚡ Performance Mode",
                value=False,
                help="Optimize for better performance"
            )
        
        # Camera specifications overlay
        if camera_info:
            with st.expander("📊 Camera Specifications", expanded=False):
                spec_col1, spec_col2 = st.columns(2)
                
                with spec_col1:
                    st.metric("Resolution", camera_info['resolution'])
                    st.metric("Frame Rate", f"{camera_info['fps']:.1f} FPS")
                
                with spec_col2:
                    st.metric("Aspect Ratio", f"{camera_info['aspect_ratio']:.2f}")
                    st.metric("Backend", camera_info['backend'])
        
        st.divider()
        
        # Live preview display
        st.subheader("📺 Live Preview")
        
        # Create placeholder for preview
        preview_placeholder = st.empty()
        
        # Error handling and loading indicators
        error_container = st.container()
        
        try:
            # Check camera connection first
            if not st.session_state.preview_camera_cap or not st.session_state.preview_camera_cap.isOpened():
                with error_container:
                    st.error("❌ Camera connection lost. Attempting to reconnect...")
                    
                    # Try to reconnect
                    with st.spinner("🔄 Reconnecting to camera..."):
                        if st.session_state.preview_camera_cap:
                            st.session_state.preview_camera_cap.release()
                        
                        st.session_state.preview_camera_cap = CameraManager.initialize_preview_camera(
                            st.session_state.preview_camera_id
                        )
                        
                        if st.session_state.preview_camera_cap and st.session_state.preview_camera_cap.isOpened():
                            st.success("✅ Camera reconnected successfully!")
                            time.sleep(1)
                            st.rerun()
                        else:
                            st.error("❌ Failed to reconnect. Please try a different camera.")
                            
                            # Provide fallback options
                            st.info("💡 **Troubleshooting Tips:**")
                            st.markdown("""
                            - Check if the camera is being used by another application
                            - Try unplugging and reconnecting the USB camera
                            - Switch to a different camera using the dropdown above
                            - Restart the application if the issue persists
                            """)
                            
                            if st.button("🔄 Try Reconnect", key="manual_reconnect"):
                                st.rerun()
                            
                            return
            
            # Continuous frame capture for live preview with optimized refresh
            frame = CameraManager.get_preview_frame_with_zoom(
                st.session_state.preview_camera_cap,
                zoom_level=st.session_state.zoom_level,
                max_width=800
            )
            
            if frame is not None:
                # Display the frame with overlay information
                with preview_placeholder.container():
                    # Responsive image display with optimized caching
                    st.image(
                        frame,
                        caption=f"📹 Camera {st.session_state.preview_camera_id} - Live Preview (Zoom: {st.session_state.zoom_level:.1f}x)",
                        use_column_width=True,
                        channels="RGB"
                    )
                    
                    # Add overlay information with responsive design
                    if camera_info:
                        overlay_col1, overlay_col2, overlay_col3, overlay_col4 = st.columns(4)
                        with overlay_col1:
                            st.caption(f"📐 {camera_info['resolution']}")
                        with overlay_col2:
                            st.caption(f"🎬 {camera_info['fps']:.1f} FPS")
                        with overlay_col3:
                            st.caption(f"🔍 {st.session_state.zoom_level:.1f}x Zoom")
                        with overlay_col4:
                            # Real-time status indicator
                            current_time = datetime.now().strftime("%H:%M:%S")
                            st.caption(f"🟢 Live @ {current_time}")
                    
                    # Performance indicator with refresh rate
                    refresh_rate = st.session_state.get('refresh_rate', 'Medium (2 FPS)')
                    st.caption(f"📡 Live feed active - {refresh_rate}")
                
                # Auto-refresh control - only refresh if explicitly requested
                if st.session_state.get('auto_refresh_preview', True):
                    # Add a small delay and refresh button instead of automatic refresh
                    col1, col2 = st.columns([3, 1])
                    with col2:
                        if st.button("🔄 Refresh", key="manual_refresh_preview"):
                            st.rerun()
                
            else:
                with error_container:
                    st.error("❌ Unable to capture frame from camera.")
                    st.warning("⚠️ This might be due to:")
                    st.markdown("""
                    - Camera hardware malfunction
                    - Insufficient lighting conditions
                    - Camera driver issues
                    - USB bandwidth limitations
                    """)
                    
                    # Retry mechanism
                    if st.button("🔄 Retry Capture", key="retry_capture"):
                        st.rerun()
                            
        except cv2.error as cv_error:
            with error_container:
                st.error(f"❌ OpenCV Error: {str(cv_error)}")
                st.info("💡 This is typically a camera driver or hardware issue.")
                
        except Exception as e:
            with error_container:
                st.error(f"❌ Unexpected error: {str(e)}")
                st.info("💡 Try switching to a different camera or refreshing the connection.")
                
                # Debug information for developers
                with st.expander("🔧 Debug Information", expanded=False):
                    st.code(f"Error Type: {type(e).__name__}\nError Details: {str(e)}")
                    st.code(f"Camera ID: {st.session_state.preview_camera_id}")
                    st.code(f"Camera Cap Status: {st.session_state.preview_camera_cap is not None}")
                    if st.session_state.preview_camera_cap:
                        st.code(f"Camera Opened: {st.session_state.preview_camera_cap.isOpened()}")
                
                if st.button("🔄 Reset Camera", key="reset_camera"):
                    # Clean reset
                    if st.session_state.preview_camera_cap:
                        st.session_state.preview_camera_cap.release()
                    st.session_state.preview_camera_cap = None
                    st.session_state.preview_camera_id = None
                    st.rerun()
        
        # Enhanced action buttons with streamlined workflow
        st.divider()
        
        # Make confirmation more prominent with clear next steps
        st.markdown("### 🎯 Camera Ready!")
        
        # Status summary
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("📹 Camera", f"ID {st.session_state.preview_camera_id}")
        with col2:
            st.metric("🔍 Zoom", f"{st.session_state.zoom_level:.1f}x")
        with col3:
            if camera_info:
                st.metric("📐 Resolution", camera_info['resolution'])
        
        # Primary action - large and prominent
        st.markdown("---")
        if st.button(
            "🚀 CONFIRM CAMERA & CONTINUE TO CAPTURE",
            type="primary",
            use_container_width=True,
            help="Confirm this camera setup and proceed to product capture",
            key="main_confirm_btn"
        ):
            # Add selected camera to session state
            if st.session_state.preview_camera_id not in st.session_state.get('selected_cameras', []):
                if 'selected_cameras' not in st.session_state:
                    st.session_state.selected_cameras = []
                st.session_state.selected_cameras = [st.session_state.preview_camera_id]
            
            # Release preview camera properly
            if st.session_state.preview_camera_cap:
                st.session_state.preview_camera_cap.release()
            
            # Exit preview mode
            st.session_state.camera_preview_mode = False
            st.session_state.preview_camera_cap = None
            st.session_state.preview_camera_id = None
            st.session_state.zoom_level = 1.0  # Reset zoom
            
            st.success("✅ Camera confirmed! Proceeding to capture setup...")
            time.sleep(1)
            st.rerun()
        
        # Secondary actions in expandable section
        with st.expander("⚙️ Additional Options", expanded=False):
            col1, col2 = st.columns(2)
            
            with col1:
                if st.button(
                    "📸 Test Capture",
                    use_container_width=True,
                    help="Take a test photo to verify camera quality"
                ):
                    if st.session_state.preview_camera_cap:
                        ret, frame = st.session_state.preview_camera_cap.read()
                        if ret:
                            # Save test image
                            test_path = Path("test_captures")
                            test_path.mkdir(exist_ok=True)
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            filename = f"test_cam_{st.session_state.preview_camera_id}_{timestamp}.jpg"
                            filepath = test_path / filename
                            cv2.imwrite(str(filepath), frame)
                            st.success(f"✅ Test image saved: {filename}")
                        else:
                            st.error("❌ Failed to capture test image")
            
            with col2:
                if st.button(
                    "🔙 Back to Setup",
                    use_container_width=True,
                    help="Return to camera setup without confirming"
                ):
                    # Clean exit without confirming
                    if st.session_state.preview_camera_cap:
                        st.session_state.preview_camera_cap.release()
                    st.session_state.camera_preview_mode = False
                    st.session_state.preview_camera_cap = None
                    st.session_state.preview_camera_id = None
                    st.session_state.zoom_level = 1.0
                    st.rerun()
            
            # Keyboard shortcuts info
            st.markdown("**⌨️ Keyboard Shortcuts:**")
            st.caption("• **Space** - Confirm & Continue")
            st.caption("• **T** - Test Capture")
            st.caption("• **Esc** - Back to Setup")
    
    else:
        # No camera selected or available
        st.warning("⚠️ No camera available for preview")
        if st.button("🔄 Refresh Camera List", use_container_width=True):
            st.rerun()
        
        # Performance optimization: Controlled refresh rate
        if not st.session_state.get('performance_mode', False):
            time.sleep(0.1)  # Standard refresh rate
        else:
            time.sleep(0.05)  # Faster refresh for performance mode
        
        st.rerun()
        
        # Back button when no camera selected
        if st.button("🔙 Back to Camera Setup", key="back_no_camera"):
            st.session_state.camera_preview_mode = False
            st.rerun()

def calculate_intervals(rotation_speed, images_per_rev):
    """Calculate capture interval based on rotation speed"""
    interval = rotation_speed / images_per_rev
    return round(interval, 3)

def capture_tab():
    """Main capture interface with storage selection and product configuration"""
    st.header("📸 360° Product Capture")
    
    # Storage Location Selection
    st.subheader("📁 Storage Location")
    
    # Get available drives
    drives = DriveManager.get_available_drives()
    
    if drives:
        # Create drive options
        drive_options = {}
        for drive in drives:
            display_name = DriveManager.format_drive_display(drive)
            drive_options[display_name] = drive["name"]
        
        # Drive selection
        selected_drive_display = st.selectbox(
            "Select Storage Drive:",
            options=list(drive_options.keys()),
            help="Choose where to store your 360° captures"
        )
        
        selected_drive_path = drive_options[selected_drive_display]
        
        # Custom folder within selected drive
        col1, col2 = st.columns([3, 1])
        with col1:
            custom_folder = st.text_input(
                "Custom Folder (within selected drive):",
                value="360_captures",
                help="Folder name to create within the selected drive"
            )
        
        with col2:
            if st.button("📁 Browse", help="Open file browser"):
                st.info("Use the folder input above to specify your capture folder")
        
        # Construct full storage path
        if custom_folder:
            # Ensure custom folder doesn't start with /
            custom_folder = custom_folder.lstrip('/')
            storage_path = str(Path(selected_drive_path) / custom_folder)
        else:
            storage_path = selected_drive_path
        
        # Validate storage path
        is_valid, validation_message = DriveManager.validate_storage_path(storage_path)
        
        if is_valid:
            st.success(f"✅ {validation_message}")
            st.session_state.selected_storage_path = storage_path
        else:
            st.error(f"❌ {validation_message}")
            # Fallback to home directory
            home_path = str(Path.home() / "360_captures")
            st.warning(f"Using fallback location: {home_path}")
            st.session_state.selected_storage_path = home_path
            storage_path = home_path
        
        # Display selected path
        st.info(f"📂 Storage Path: `{storage_path}`")
        
    else:
        st.error("No writable drives detected. Using home directory as fallback.")
        home_path = str(Path.home() / "360_captures")
        st.session_state.selected_storage_path = home_path
        storage_path = home_path

    # Product Configuration Section
    if not st.session_state.product_configured:
        st.markdown("### 📝 Product Configuration")
        st.info("👉 Configure product details before starting capture")

        with st.form("product_config_form"):
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("#### Hierarchy Structure")
                category = st.text_input(
                    "Category (Level 1)",
                    placeholder="e.g., Liquor, Electronics, Toys",
                    help="Main product category"
                )

                subcategory = st.text_input(
                    "Subcategory (Level 2) - Optional",
                    placeholder="e.g., Beer, Whiskey, Wine",
                    help="Product subcategory (optional)"
                )

                brand = st.text_input(
                    "Brand (Level 3) - Optional",
                    placeholder="e.g., Budweiser, Jack Daniels",
                    help="Brand name (optional)"
                )

            with col2:
                st.markdown("#### Product Details")
                product_name = st.text_input(
                    "Product Name *",
                    placeholder="e.g., Budweiser_500ml, iPhone_15_Pro",
                    help="Specific product name (required)"
                )

                st.markdown("#### Preview Structure")
                if product_name:
                    base_folder = Path(st.session_state.selected_storage_path).name
                    path_preview = f"📁 {base_folder}/\n└── 📁 {st.session_state.session_id}/"
                    if category:
                        path_preview += f"\n    └── 📁 {category}/"
                    if subcategory:
                        path_preview += f"\n        └── 📁 {subcategory}/"
                    if brand:
                        path_preview += f"\n            └── 📁 {brand}/"
                    path_preview += f"\n                └── 📁 **{product_name}/** ⭐"

                    st.code(path_preview, language="")
                else:
                    st.warning("Enter product name to see folder structure")

            submitted = st.form_submit_button("✅ Confirm Product Setup", type="primary", use_container_width=True)

            if submitted:
                if not product_name.strip():
                    st.error("❌ Product name is required!")
                else:
                    # Create folder structure
                    product_path = FolderManager.create_product_path(
                        category.strip() if category else None,
                        subcategory.strip() if subcategory else None,
                        brand.strip() if brand else None,
                        product_name.strip(),
                        st.session_state.session_id
                    )

                    st.session_state.product_configured = True
                    st.session_state.current_product_path = product_path
                    st.session_state.current_category_info = {
                        "category": category.strip() if category else None,
                        "subcategory": subcategory.strip() if subcategory else None,
                        "brand": brand.strip() if brand else None,
                        "product_name": product_name.strip()
                    }
                    st.session_state.capture_count = 0
                    st.success(f"✅ Product configured! Ready to capture images.")
                    st.info(f"📁 Images will be saved to: `{product_path}`")
                    st.rerun()

    else:
        # Show current product info with enhanced status indicators
        st.success(f"✅ Capturing: **{st.session_state.current_category_info['product_name']}**")

        # Enhanced status display with visual indicators
        status_col1, status_col2, status_col3, status_col4 = st.columns([2, 1, 1, 1])
        
        with status_col1:
            st.info(f"📁 Output: `{st.session_state.current_product_path}`")
        
        with status_col2:
            # Enhanced capture count with styling
            st.markdown(f'<div class="capture-count">📸 {st.session_state.capture_count} Images</div>', unsafe_allow_html=True)
        
        with status_col3:
            # Recording status indicator
            if st.session_state.capturing:
                st.markdown('<div class="recording-indicator">🔴 RECORDING</div>', unsafe_allow_html=True)
            else:
                st.markdown('<div class="ready-indicator">📹 READY</div>', unsafe_allow_html=True)
        
        with status_col4:
            # Session timer
            if st.session_state.get('capture_start_time'):
                elapsed_time = time.time() - st.session_state.capture_start_time
                session_timeout = st.session_state.get('session_timeout', 60)
                remaining_time = max(0, session_timeout - elapsed_time)
                st.markdown(f'<div class="session-timer">⏱️ {remaining_time:.0f}s</div>', unsafe_allow_html=True)

        col1, col2, col3 = st.columns([2, 2, 1])
        with col1:
            pass  # Status info moved above
        with col2:
            pass  # Metrics moved above
        with col3:
            if st.button("🔄 New Product", use_container_width=True):
                st.session_state.product_configured = False
                st.session_state.capturing = False
                st.session_state.capture_count = 0
                for cam_id, cap in st.session_state.cameras.items():
                    if cap:
                        cap.release()
                st.session_state.cameras = {}
                st.rerun()

        st.divider()

        # Main capture interface
        col1, col2 = st.columns([2, 1])

        with col1:
            st.subheader("📹 Live Camera Previews")

            # Get settings from sidebar
            num_cameras = st.session_state.get('num_cameras', 1)
            selected_cameras = st.session_state.get('selected_cameras', [0])

            # Camera preview placeholders
            if num_cameras == 1:
                preview_placeholder = st.empty()
            else:
                preview_cols = st.columns(num_cameras)
                preview_placeholders = [col.empty() for col in preview_cols]

        with col2:
            st.subheader("📊 Capture Status")

            # Display current capture rate settings
            preset_name = st.session_state.get('preset_name', 'Medium (36 frames/min)')
            preset = SPEED_PRESETS[preset_name]
            
            st.metric(
                "Capture Rate", 
                f"{preset['frames_per_min']} frames/min",
                help=preset['description']
            )
            
            st.metric(
                "Interval", 
                f"{preset['interval_seconds']:.2f} seconds",
                help="Time between each capture"
            )

            st.metric("Images This Session", st.session_state.capture_count)
            
            # Get images per revolution from session state or default
            images_per_rev = st.session_state.get('images_per_rev', 36)
            st.metric("Total Expected", f"{images_per_rev} per 360°")
            
            # Calculate rotation speed
            rotation_speed = images_per_rev * preset['interval_seconds']
            st.metric("Time for 360°", f"{rotation_speed:.1f}s")

            progress = min(st.session_state.capture_count / images_per_rev, 1.0)
            st.progress(progress)

            if progress >= 1.0:
                st.success("✅ Full 360° captured!")

        # Control Buttons
        st.divider()
        button_col1, button_col2, button_col3 = st.columns(3)

        with button_col1:
            start_button = st.button(
                "▶️ Start Capture",
                type="primary",
                disabled=st.session_state.capturing,
                use_container_width=True
            )

        with button_col2:
            stop_button = st.button(
                "⏹️ Stop Capture",
                disabled=not st.session_state.capturing,
                use_container_width=True
            )

        with button_col3:
            if st.button("📁 Open Folder", use_container_width=True):
                st.code(str(st.session_state.current_product_path.absolute()))

        # Capture Logic
        if start_button:
            st.session_state.capturing = True
            # Set capture start time for session timeout
            st.session_state.capture_start_time = time.time()

        if stop_button:
            st.session_state.capturing = False
            # Release camera locks when stopping
            for cam_id in selected_cameras:
                if cam_id in st.session_state.get('camera_locks', {}):
                    st.session_state.camera_locks[cam_id] = False

        # Check for session timeout (1 minute)
        if st.session_state.capturing and st.session_state.get('capture_start_time'):
            elapsed_time = time.time() - st.session_state.capture_start_time
            session_timeout = st.session_state.get('session_timeout', 60)  # 60 seconds default
            
            if elapsed_time >= session_timeout:
                st.session_state.capturing = False
                # Release camera locks
                for cam_id in selected_cameras:
                    if cam_id in st.session_state.get('camera_locks', {}):
                        st.session_state.camera_locks[cam_id] = False
                st.warning(f"⏰ Session ended automatically after {session_timeout} seconds")
                st.rerun()
            else:
                # Show remaining time
                remaining_time = session_timeout - elapsed_time
                st.info(f"⏱️ Session time remaining: {remaining_time:.0f} seconds")

        # Camera Preview and Capture Loop
        cameras = {}
        available_cameras = CameraManager.detect_cameras()

        # Initialize cameras
        for cam_id in selected_cameras:
            if cam_id not in st.session_state.cameras:
                res = st.session_state.get('resolution', (1920, 1080))
                cap = CameraManager.initialize_camera(cam_id, res)
                if cap:
                    cameras[cam_id] = cap
                    st.session_state.cameras[cam_id] = cap
                else:
                    st.error(f"❌ Failed to initialize camera {cam_id}")
            else:
                cameras[cam_id] = st.session_state.cameras[cam_id]

        # Show camera status
        if not cameras:
            st.error("❌ No cameras detected or initialized!")
            if available_cameras:
                st.info(f"Available cameras: {[cam['name'] for cam in available_cameras]}")
            else:
                st.warning("No USB cameras found. Please check camera connections.")
        else:
            st.success(f"✅ {len(cameras)} camera(s) ready")

        # Update preview and handle capture
        if cameras:
            # Get preview frames with live updates during capture
            preview_frames = {}
            capture_frames = {}
            
            for cam_id, cap in cameras.items():
                if cap and cap.isOpened():
                    # Always get fresh preview frame for live display
                    preview_frame = CameraManager.get_preview_frame_with_zoom(cap, zoom_level=1.0, max_width=640)
                    if preview_frame is not None:
                        preview_frames[cam_id] = preview_frame
                    
                    # If capturing, get high-quality frame
                    if st.session_state.capturing:
                        capture_frame = CameraManager.capture_image(cap)
                        if capture_frame is not None:
                            capture_frames[cam_id] = capture_frame

            # Display live previews with enhanced visual containers
            if preview_frames:
                if num_cameras == 1:
                    cam_id = list(preview_frames.keys())[0]
                    with preview_placeholder.container():
                        # Enhanced preview container with visual indicators
                        container_class = "live-preview-recording" if st.session_state.capturing else "live-preview-ready"
                        st.markdown(f'<div class="live-preview-container {container_class}">', unsafe_allow_html=True)
                        
                        st.image(
                            preview_frames[cam_id], 
                            caption=f"Camera {cam_id} - Live Preview {'🔴 CAPTURING' if st.session_state.capturing else '📹 READY'}",
                            use_column_width=True
                        )
                        
                        # Add immediate playback controls if images were captured recently
                        if st.session_state.capture_count > 0:
                            st.markdown('<div class="playback-controls">', unsafe_allow_html=True)
                            
                            playback_col1, playback_col2, playback_col3, playback_col4 = st.columns(4)
                            
                            with playback_col1:
                                if st.button("⏮️ First", key="first_frame", help="View first captured image"):
                                    st.session_state.playback_index = 0
                            
                            with playback_col2:
                                if st.button("⏪ Previous", key="prev_frame", help="View previous image"):
                                    current_idx = st.session_state.get('playback_index', st.session_state.capture_count - 1)
                                    st.session_state.playback_index = max(0, current_idx - 1)
                            
                            with playback_col3:
                                if st.button("⏩ Next", key="next_frame", help="View next image"):
                                    current_idx = st.session_state.get('playback_index', 0)
                                    st.session_state.playback_index = min(st.session_state.capture_count - 1, current_idx + 1)
                            
                            with playback_col4:
                                if st.button("⏭️ Latest", key="latest_frame", help="View latest captured image"):
                                    st.session_state.playback_index = st.session_state.capture_count - 1
                            
                            # Display playback image if requested
                            if 'playback_index' in st.session_state and st.session_state.playback_index >= 0:
                                try:
                                    # Find the image file for the selected index
                                    image_files = sorted([f for f in st.session_state.current_product_path.glob("*.png")])
                                    if image_files and st.session_state.playback_index < len(image_files):
                                        playback_image = Image.open(image_files[st.session_state.playback_index])
                                        st.image(playback_image, caption=f"Captured Image {st.session_state.playback_index + 1}/{st.session_state.capture_count}", use_column_width=True)
                                except Exception as e:
                                    st.warning(f"Could not load playback image: {e}")
                            
                            st.markdown('</div>', unsafe_allow_html=True)
                        
                        st.markdown('</div>', unsafe_allow_html=True)
                        
                        # Auto-refresh for live preview during capture
                        if st.session_state.capturing:
                            time.sleep(0.1)  # Small delay for smooth updates
                            st.rerun()
                            
                elif num_cameras > 1:
                    # Enhanced multi-camera preview with visual containers
                    for i, (cam_id, frame) in enumerate(preview_frames.items()):
                        if i < len(preview_placeholders):
                            with preview_placeholders[i].container():
                                # Enhanced preview container with visual indicators
                                container_class = "live-preview-recording" if st.session_state.capturing else "live-preview-ready"
                                st.markdown(f'<div class="live-preview-container {container_class}">', unsafe_allow_html=True)
                                
                                st.image(
                                    frame, 
                                    caption=f"Camera {cam_id} {'🔴 CAPTURING' if st.session_state.capturing else '📹 READY'}",
                                    use_column_width=True
                                )
                                
                                st.markdown('</div>', unsafe_allow_html=True)
                    
                    # Auto-refresh for live preview during capture
                    if st.session_state.capturing:
                        time.sleep(0.1)  # Small delay for smooth updates
                        st.rerun()
            else:
                # Show message when no preview frames are available
                if num_cameras == 1:
                    with preview_placeholder.container():
                        st.info("📹 Waiting for camera preview...")
                        if st.button("🔄 Refresh Camera", key="refresh_single"):
                            st.rerun()
                else:
                    for i in range(num_cameras):
                        if i < len(preview_placeholders):
                            with preview_placeholders[i].container():
                                st.info(f"📹 Camera {i+1} preview...")
                                if st.button(f"🔄 Refresh", key=f"refresh_{i}"):
                                    st.rerun()

            # Handle actual capture process
            if st.session_state.capturing and capture_frames:
                # Get current time for interval checking
                current_time = time.time()
                last_capture_time = st.session_state.get('last_capture_time', 0)
                interval = st.session_state.get('interval_seconds', 1.67)
                
                # Check if enough time has passed for next capture
                if current_time - last_capture_time >= interval:
                    # Save images from all cameras
                    image_paths = []
                    
                    for cam_id, frame in capture_frames.items():
                        try:
                            # Save the captured frame
                            image_path = ImageProcessor.save_image(
                                frame, 
                                st.session_state.current_product_path, 
                                cam_id, 
                                st.session_state.capture_count + 1
                            )
                            image_paths.append(image_path)
                            
                            # Show live capture feedback
                            st.success(f"📸 Captured frame {st.session_state.capture_count + 1} from camera {cam_id}")
                            
                        except Exception as e:
                            st.error(f"❌ Failed to save image from camera {cam_id}: {e}")
                    
                    if image_paths:
                        # Update capture count
                        st.session_state.capture_count += 1
                        st.session_state.last_capture_time = current_time
                        
                        # Save metadata
                        try:
                            ImageProcessor.save_metadata(
                                st.session_state.current_product_path,
                                {
                                    'preset': preset_name,
                                    'interval': interval,
                                    'resolution': st.session_state.get('resolution', (1920, 1080)),
                                    'cameras': list(cameras.keys())
                                },
                                image_paths,
                                st.session_state.current_category_info
                            )
                        except Exception as e:
                            st.warning(f"⚠️ Failed to save metadata: {e}")
                        
                        # Auto-refresh to update UI
                        time.sleep(0.1)
                        st.rerun()

        # Optimized auto-refresh for live preview with performance improvements
        if not st.session_state.capturing:
            # Reduce refresh rate when not capturing to save resources
            time.sleep(0.8)  # Increased from 0.5 to reduce CPU usage
            st.rerun()
        else:
            # During capture, use minimal delay for responsive UI
            time.sleep(0.05)  # Reduced from 0.1 for better responsiveness

def review_tab():
    """Review and browse captured images"""
    st.title("📂 Review Captured Images")

    # Get folder statistics
    stats = FolderManager.get_folder_stats()

    # Top-level statistics
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Sessions", stats["total_sessions"])
    with col2:
        st.metric("Total Products", stats["total_folders"])
    with col3:
        st.metric("Total Images", stats["total_images"])
    with col4:
        refresh_button = st.button("🔄 Refresh", use_container_width=True)
        if refresh_button:
            st.rerun()

    st.divider()

    if stats["total_sessions"] == 0:
        st.info("📭 No capture sessions yet. Start capturing images in the Capture tab!")
        return

    # Session selector
    col1, col2 = st.columns([1, 3])

    with col1:
        st.subheader("📅 Sessions")
        selected_session = st.radio(
            "Select Session",
            options=list(stats["sessions"].keys()),
            format_func=lambda x: f"{x} ({stats['sessions'][x]['total_images']} images)",
            label_visibility="collapsed"
        )

    with col2:
        if selected_session:
            st.subheader(f"📁 Session: {selected_session}")

            session_data = stats["sessions"][selected_session]

            st.metric("Images in Session", session_data["total_images"])

            # Folder tree view
            if session_data["folders"]:
                st.markdown("### 🌳 Folder Structure")

                # Build folder tree
                selected_folder = st.selectbox(
                    "Select Product Folder",
                    options=sorted(session_data["folders"].keys()),
                    format_func=lambda x: f"{'  ' * (x.count('/'))}{x.split('/')[-1]} ({session_data['folders'][x]['image_count']} images)"
                )

                if selected_folder:
                    folder_info = session_data["folders"][selected_folder]
                    folder_path = folder_info["path"]

                    st.divider()

                    # Folder details
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric("Images", folder_info["image_count"])
                    with col2:
                        st.metric("Subfolders", folder_info["subfolders"])
                    with col3:
                        st.code(folder_path, language="")

                    # Load images from folder
                    images = FolderManager.get_images_in_folder(folder_path)

                    if images:
                        st.markdown("### 🖼️ Image Gallery")

                        # Gallery options
                        col1, col2, col3 = st.columns([2, 2, 1])
                        with col1:
                            images_per_row = st.slider("Images per row", 2, 6, 4)
                        with col2:
                            sort_order = st.selectbox("Sort by", ["Name (A-Z)", "Name (Z-A)", "Date (Newest)", "Date (Oldest)"])
                        with col3:
                            show_names = st.checkbox("Show names", value=False)

                        # Sort images
                        if sort_order == "Name (Z-A)":
                            images = sorted(images, reverse=True)
                        elif sort_order == "Date (Newest)":
                            images = sorted(images, key=lambda x: x.stat().st_mtime, reverse=True)
                        elif sort_order == "Date (Oldest)":
                            images = sorted(images, key=lambda x: x.stat().st_mtime)
                        else:
                            images = sorted(images)

                        # Display images in grid
                        for i in range(0, len(images), images_per_row):
                            cols = st.columns(images_per_row)
                            for j, col in enumerate(cols):
                                if i + j < len(images):
                                    img_path = images[i + j]
                                    try:
                                        img = Image.open(img_path)
                                        with col:
                                            st.image(img, use_column_width=True)
                                            if show_names:
                                                st.caption(img_path.name)
                                    except Exception as e:
                                        st.error(f"Error loading {img_path.name}")

                        # Export options
                        st.divider()
                        st.markdown("### 📤 Export Options")

                        col1, col2, col3 = st.columns(3)
                        with col1:
                            if st.button("📋 Copy Path to Clipboard", use_container_width=True):
                                st.code(folder_path)
                        with col2:
                            if st.button("📄 View Metadata", use_container_width=True):
                                metadata_file = Path(folder_path) / "metadata.json"
                                if metadata_file.exists():
                                    with open(metadata_file, 'r') as f:
                                        metadata = json.load(f)
                                    st.json(metadata)
                                else:
                                    st.warning("No metadata file found")
                        with col3:
                            st.download_button(
                                "💾 Download Metadata",
                                data=json.dumps(session_data, indent=2),
                                file_name=f"session_{selected_session}_metadata.json",
                                mime="application/json",
                                use_container_width=True
                            )
                    else:
                        st.info("📭 No images found in this folder")
            else:
                st.info("📭 No product folders in this session")

def sidebar_config():
    """Sidebar configuration"""
    with st.sidebar:
        st.header("⚙️ Configuration")

        # Camera Setup
        st.subheader("📷 Camera Setup")
        
        # Camera detection with better feedback
        col1, col2 = st.columns([2, 1])
        with col1:
            if st.button("🔍 Detect Cameras", use_container_width=True):
                with st.spinner("Detecting cameras..."):
                    available = CameraManager.detect_cameras()
                    st.session_state.available_cameras = available
                    
        with col2:
            if st.button("🔄", help="Refresh", use_container_width=True):
                st.rerun()
        
        # Show detected cameras
        available_cameras = st.session_state.get('available_cameras', [])
        if available_cameras:
            st.success(f"✅ Found {len(available_cameras)} camera(s)")
            for cam in available_cameras:
                st.info(f"📹 {cam['name']} - {cam['fps']:.1f} FPS")
        else:
            st.warning("⚠️ No cameras detected. Click 'Detect Cameras' to scan.")

        # Camera selection
        num_cameras = st.selectbox(
            "Number of Cameras",
            options=[1, 2, 3],
            help="Select how many cameras to use simultaneously"
        )
        st.session_state.num_cameras = num_cameras

        # Camera ID selection with better options
        selected_cameras = []
        if available_cameras:
            # Use detected camera IDs
            camera_options = {cam['name']: cam['id'] for cam in available_cameras}
            
            for i in range(num_cameras):
                if len(available_cameras) > i:
                    default_name = available_cameras[i]['name']
                else:
                    default_name = list(camera_options.keys())[0] if camera_options else "No cameras"
                
                selected_name = st.selectbox(
                    f"Camera {i+1}",
                    options=list(camera_options.keys()) if camera_options else ["No cameras"],
                    index=min(i, len(camera_options) - 1) if camera_options else 0,
                    key=f"cam_select_{i}",
                    help=f"Select camera for position {i+1}"
                )
                
                if camera_options:
                    selected_cameras.append(camera_options[selected_name])
        else:
            # Fallback to manual ID input
            for i in range(num_cameras):
                cam_id = st.number_input(
                    f"Camera {i+1} ID",
                    min_value=0,
                    max_value=10,
                    value=i,
                    key=f"cam_manual_{i}",
                    help="Manual camera ID (use 'Detect Cameras' for automatic detection)"
                )
                selected_cameras.append(cam_id)
        
        st.session_state.selected_cameras = selected_cameras
        
        # Add camera preview button
        if available_cameras and st.button("📹 Preview Cameras", use_container_width=True, type="primary"):
            st.session_state.camera_preview_mode = True
            st.rerun()

        st.divider()

        # Capture Rate Settings
        st.subheader("📸 Capture Rate Settings")
        preset_name = st.selectbox(
            "Capture Speed Preset",
            options=list(SPEED_PRESETS.keys()),
            index=1,  # Default to Medium (36 frames/min)
            help="Select capture rate in frames per minute"
        )
        st.session_state.preset_name = preset_name

        preset = SPEED_PRESETS[preset_name]
        
        # Display preset details
        st.info(f"📊 **{preset['frames_per_min']} frames/min** - {preset['description']}")
        st.info(f"⏱️ **{preset['interval_seconds']:.2f}s** interval between captures")
        
        # Fine-tuning controls
        with st.expander("🎛️ Fine-tune Interval"):
            custom_interval = st.slider(
                "Custom Interval (seconds)",
                min_value=0.1,
                max_value=5.0,
                value=preset['interval_seconds'],
                step=0.1,
                help="Override preset interval with custom value"
            )
            st.session_state.interval_seconds = custom_interval
            
            if st.button("↩️ Reset to Preset", use_container_width=True):
                st.session_state.interval_seconds = preset['interval_seconds']
                st.rerun()
        
        # Calculate frames per revolution
        images_per_rev = st.number_input(
            "Images per 360° Revolution",
            min_value=12,
            max_value=360,
            value=36,
            step=6,
            help="Total number of images for complete 360° capture"
        )
        st.session_state.images_per_rev = images_per_rev
        
        # Calculate total time
        total_time = images_per_rev * st.session_state.get('interval_seconds', preset['interval_seconds'])
        st.metric("Total Capture Time", f"{total_time:.1f} seconds")

        st.divider()

        # Image Quality Settings
        st.subheader("🎨 Image Quality")
        resolution_options = {
            "4K (3840x2160)": (3840, 2160),
            "Full HD (1920x1080)": (1920, 1080),
            "HD (1280x720)": (1280, 720),
            "SD (640x480)": (640, 480)
        }
        
        resolution_name = st.selectbox(
            "Resolution",
            options=list(resolution_options.keys()),
            index=1,  # Default to Full HD
            help="Camera capture resolution"
        )
        st.session_state.resolution = resolution_options[resolution_name]
        st.session_state.resolution_name = resolution_name

        st.divider()

        # Session Management
        st.subheader("📋 Session Management")
        st.info(f"📅 **Session ID:** `{st.session_state.session_id}`")
        
        if st.button("🆕 New Session", use_container_width=True):
            # Reset session
            st.session_state.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
            st.session_state.product_configured = False
            st.session_state.capturing = False
            st.session_state.capture_count = 0
            st.session_state.current_product_path = None
            
            # Release cameras
            for cam_id, cap in st.session_state.cameras.items():
                if cap:
                    cap.release()
            st.session_state.cameras = {}
            
            st.success("✅ New session started!")
            st.rerun()

def file_browser_tab():
    """File browser and management interface"""
    st.header("📁 File Browser & Management")
    
    # Initialize file browser session state
    if 'fb_current_path' not in st.session_state:
        st.session_state.fb_current_path = str(Path.home())
    if 'fb_selected_file' not in st.session_state:
        st.session_state.fb_selected_file = None
    if 'fb_preview_enabled' not in st.session_state:
        st.session_state.fb_preview_enabled = True
    if 'fb_auto_refresh' not in st.session_state:
        st.session_state.fb_auto_refresh = True
    if 'fb_last_refresh' not in st.session_state:
        st.session_state.fb_last_refresh = time.time()
    
    # File browser configuration
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        st.subheader("📂 Navigation")
        
        # Current path display
        current_path = Path(st.session_state.fb_current_path)
        st.text_input("Current Directory:", value=str(current_path), key="path_display", disabled=True)
        
        # Navigation buttons
        nav_col1, nav_col2, nav_col3 = st.columns([1, 1, 2])
        
        with nav_col1:
            if st.button("⬆️ Up", help="Go to parent directory"):
                parent = current_path.parent
                if parent != current_path:  # Prevent going above root
                    st.session_state.fb_current_path = str(parent)
                    st.rerun()
        
        with nav_col2:
            if st.button("🏠 Home", help="Go to home directory"):
                st.session_state.fb_current_path = str(Path.home())
                st.rerun()
        
        with nav_col3:
            # Quick access to common directories
            quick_paths = {
                "Desktop": str(Path.home() / "Desktop"),
                "Documents": str(Path.home() / "Documents"),
                "Downloads": str(Path.home() / "Downloads"),
                "Captures": str(Path.cwd() / "captures")
            }
            
            selected_quick = st.selectbox(
                "Quick Access:",
                options=[""] + list(quick_paths.keys()),
                help="Jump to common directories"
            )
            
            if selected_quick and selected_quick in quick_paths:
                if Path(quick_paths[selected_quick]).exists():
                    st.session_state.fb_current_path = quick_paths[selected_quick]
                    st.rerun()
    
    with col2:
        st.subheader("⚙️ Settings")
        
        # Preview settings
        st.session_state.fb_preview_enabled = st.checkbox(
            "Enable Preview", 
            value=st.session_state.fb_preview_enabled,
            help="Show file previews in the right panel"
        )
        
        st.session_state.fb_auto_refresh = st.checkbox(
            "Auto Refresh", 
            value=st.session_state.fb_auto_refresh,
            help="Automatically refresh the file list"
        )
        
        if st.button("🔄 Refresh Now"):
            st.session_state.fb_last_refresh = time.time()
            st.rerun()
    
    with col3:
        st.subheader("📁 New Folder")
        
        # Folder creation
        new_folder_name = st.text_input(
            "Folder Name:",
            placeholder="Enter folder name",
            help="Create a new folder in the current directory"
        )
        
        if st.button("Create Folder", disabled=not new_folder_name):
            try:
                new_folder_path = current_path / new_folder_name
                new_folder_path.mkdir(exist_ok=False)
                st.success(f"✅ Created folder: {new_folder_name}")
                st.rerun()
            except FileExistsError:
                st.error(f"❌ Folder '{new_folder_name}' already exists")
            except Exception as e:
                st.error(f"❌ Error creating folder: {str(e)}")
    
    st.divider()
    
    # Main content area
    main_col1, main_col2 = st.columns([1, 1])
    
    with main_col1:
        st.subheader("📋 Directory Contents")
        
        try:
            # Get directory contents
            contents = []
            for item in current_path.iterdir():
                try:
                    stat = item.stat()
                    contents.append({
                        'name': item.name,
                        'type': '📁' if item.is_dir() else '📄',
                        'size': 'Directory' if item.is_dir() else f"{stat.st_size:,} bytes",
                        'modified': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M'),
                        'path': str(item)
                    })
                except (PermissionError, OSError):
                    continue
            
            # Sort: directories first, then files
            contents.sort(key=lambda x: (x['type'] != '📁', x['name'].lower()))
            
            if contents:
                # Display files in a more interactive way
                for item in contents:
                    col_icon, col_name, col_size, col_date, col_action = st.columns([0.5, 3, 1.5, 2, 1])
                    
                    with col_icon:
                        st.write(item['type'])
                    
                    with col_name:
                        st.write(item['name'])
                    
                    with col_size:
                        st.write(item['size'])
                    
                    with col_date:
                        st.write(item['modified'])
                    
                    with col_action:
                        if item['type'] == '📁':
                            if st.button("Open", key=f"open_{item['name']}"):
                                st.session_state.fb_current_path = item['path']
                                st.rerun()
                        else:
                            if st.button("Preview", key=f"preview_{item['name']}"):
                                st.session_state.fb_selected_file = item['path']
                                st.rerun()
            else:
                st.info("📭 Directory is empty")
                
        except PermissionError:
            st.error("❌ Permission denied - Cannot access this directory")
        except Exception as e:
            st.error(f"❌ Error reading directory: {str(e)}")
    
    with main_col2:
        st.subheader("👁️ Live Preview")
        
        if st.session_state.fb_preview_enabled and st.session_state.fb_selected_file:
            try:
                file_path = Path(st.session_state.fb_selected_file)
                
                if file_path.exists():
                    # File info
                    stat = file_path.stat()
                    st.info(f"**File:** {file_path.name}\n\n**Size:** {stat.st_size:,} bytes\n\n**Modified:** {datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')}")
                    
                    # Preview based on file type
                    suffix = file_path.suffix.lower()
                    
                    # Image preview
                    if suffix in {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}:
                        try:
                            image = Image.open(file_path)
                            st.image(image, caption=file_path.name, use_column_width=True)
                            st.write(f"**Dimensions:** {image.size[0]} x {image.size[1]} pixels")
                        except Exception as e:
                            st.error(f"Cannot preview image: {str(e)}")
                    
                    # SVG preview
                    elif suffix == '.svg':
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                svg_content = f.read()
                            st.markdown(svg_content, unsafe_allow_html=True)
                        except Exception as e:
                            st.error(f"Cannot preview SVG: {str(e)}")
                    
                    # Text file preview
                    elif suffix in {'.txt', '.py', '.js', '.html', '.css', '.json', '.xml', '.md', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf'}:
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                            
                            # Limit content length for performance
                            if len(content) > 10000:
                                content = content[:10000] + "\n\n... (truncated)"
                            
                            st.code(content, language=suffix[1:] if suffix[1:] in ['py', 'js', 'html', 'css', 'json', 'xml', 'md', 'yml', 'yaml'] else None)
                        except Exception as e:
                            st.error(f"Cannot preview text file: {str(e)}")
                    
                    # Data file preview
                    elif suffix in {'.csv', '.xlsx', '.xls'}:
                        try:
                            if suffix == '.csv':
                                df = pd.read_csv(file_path)
                            else:
                                df = pd.read_excel(file_path)
                            
                            st.write(f"**Shape:** {df.shape[0]} rows × {df.shape[1]} columns")
                            st.dataframe(df.head(20), use_container_width=True)
                            
                            if len(df) > 20:
                                st.info(f"Showing first 20 rows of {len(df)} total rows")
                        except Exception as e:
                            st.error(f"Cannot preview data file: {str(e)}")
                    
                    else:
                        st.info(f"Preview not available for {suffix} files")
                        
                else:
                    st.error("Selected file no longer exists")
                    
            except Exception as e:
                st.error(f"Preview error: {str(e)}")
        else:
            if not st.session_state.fb_preview_enabled:
                st.info("Preview is disabled. Enable it in settings above.")
            else:
                st.info("Select a file to see its preview here")
    
    # Auto-refresh functionality
    if st.session_state.fb_auto_refresh:
        current_time = time.time()
        if current_time - st.session_state.fb_last_refresh > 3:  # Refresh every 3 seconds
            st.session_state.fb_last_refresh = current_time
            st.rerun()

def main():
    """Main application"""
    
    # Check if we're in camera preview mode
    if st.session_state.get('camera_preview_mode', False):
        camera_preview_interface()
        return

    # Sidebar configuration
    sidebar_config()

    # Main tabs - Added Files tab
    tab1, tab2, tab3 = st.tabs(["📸 Capture", "📂 Review", "📁 Files"])

    with tab1:
        capture_tab()

    with tab2:
        review_tab()
    
    with tab3:
        file_browser_tab()

    # Footer
    st.divider()
    st.markdown("""
    <div style='text-align: center; color: gray; font-size: 0.8em;'>
        360° Product Capture System v1.0.0 | Production Ready | Made for AI Training
    </div>
    """, unsafe_allow_html=True)

if __name__ == "__main__":
    main()