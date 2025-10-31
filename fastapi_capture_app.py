#!/usr/bin/env python3
"""
FastAPI-based Product Capture Application
High-performance backend for 360-degree product photography
"""

import asyncio
import cv2
import json
import logging
import os
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import base64
import shutil

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
try:
    import psutil
except ImportError:
    psutil = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global variables
camera = None
camera_lock = threading.Lock()
current_session = None
performance_metrics = {
    'fps': 0,
    'frame_latency_ms': 0,
    'connection_errors': 0,
    'reconnection_attempts': 0,
    'camera_resolution': [0, 0],
    'last_successful_frame': 0,
    'avg_frame_time_ms': 0,
    'camera_health_score': 0
}

# Track an active session task for cancellation and lifecycle
session_task = None

# Pydantic models
class CameraInfo(BaseModel):
    index: int
    name: str
    backend: str

class ProductInfo(BaseModel):
    name: str
    description: str = ""
    category: str = ""

class SessionConfig(BaseModel):
    product_name: str
    capture_rate: float = 1.0
    session_duration: int = 30
    output_folder: str = ""

class StatusResponse(BaseModel):
    camera_connected: bool
    session_active: bool
    capture_count: int
    session_time: int
    current_folder: str
    performance: Dict[str, Any]

# FastAPI app initialization
app = FastAPI(
    title="Product Capture 360 API",
    description="High-performance FastAPI backend for 360-degree product photography",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Camera management functions
def initialize_camera(camera_index: int = 0) -> bool:
    """Initialize camera with enhanced error handling and multiple backend support"""
    global camera, performance_metrics
    
    with camera_lock:
        try:
            # Release existing camera
            if camera is not None:
                camera.release()
                camera = None
                cv2.destroyAllWindows()
                time.sleep(0.5)
            
            # Try different backends in order of preference
            backends = [
                cv2.CAP_AVFOUNDATION,  # macOS
                cv2.CAP_V4L2,          # Linux
                cv2.CAP_DSHOW,         # Windows
                cv2.CAP_ANY            # Fallback
            ]
            
            for backend in backends:
                try:
                    logger.info(f"Attempting to initialize camera {camera_index} with backend {backend}")
                    test_camera = cv2.VideoCapture(camera_index, backend)
                    
                    if not test_camera.isOpened():
                        test_camera.release()
                        continue
                    
                    # Set camera parameters safely
                    try:
                        test_camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        test_camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                        test_camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                        test_camera.set(cv2.CAP_PROP_FPS, 15)
                    except Exception as e:
                        logger.warning(f"Could not set camera parameters: {e}")
                    
                    # Test frame capture
                    try:
                        ret, test_frame = test_camera.read()
                        if ret and test_frame is not None:
                            camera = test_camera
                            height, width = test_frame.shape[:2]
                            performance_metrics['camera_resolution'] = [width, height]
                            logger.info(f"Camera {camera_index} initialized successfully with resolution {width}x{height}")
                            return True
                        else:
                            logger.warning("Camera test frame capture failed, but continuing...")
                            camera = test_camera
                            return True
                    except Exception as e:
                        logger.warning(f"Camera test failed: {e}, but camera seems functional")
                        camera = test_camera
                        return True
                        
                except Exception as e:
                    logger.error(f"Backend {backend} failed: {e}")
                    continue
            
            logger.error("All camera backends failed")
            return False
            
        except Exception as e:
            logger.error(f"Camera initialization failed: {e}")
            return False

def create_placeholder_frame() -> Optional[bytes]:
    """Create a placeholder frame when camera is not available"""
    try:
        import numpy as np
        
        # Create a simple placeholder image
        height, width = 480, 640
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:] = (64, 64, 64)  # Dark gray background
        
        # Add text
        cv2.putText(frame, "Camera Unavailable", (width//2 - 120, height//2 - 20), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, "Reconnecting...", (width//2 - 80, height//2 + 20), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        
        # Encode as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if ret:
            return buffer.tobytes()
    except Exception as e:
        logger.error(f"Failed to create placeholder frame: {e}")
    return None

def get_frame() -> Optional[bytes]:
    """Capture a frame from the camera with error handling"""
    global camera, performance_metrics
    
    if camera is None:
        return None
    
    try:
        with camera_lock:
            ret, frame = camera.read()
            
        if not ret or frame is None:
            return None
        
        # Update performance metrics
        performance_metrics['last_successful_frame'] = time.time()
        
        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buffer.tobytes()
        
    except Exception as e:
        logger.error(f"Frame capture error: {e}")
        performance_metrics['connection_errors'] += 1
        return None

def scan_cameras() -> List[CameraInfo]:
    """Scan for available cameras"""
    cameras = []
    
    for i in range(10):  # Check first 10 camera indices
        try:
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                cameras.append(CameraInfo(
                    index=i,
                    name=f"Camera {i}",
                    backend="OpenCV"
                ))
                cap.release()
        except Exception:
            continue
    
    return cameras

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_frame(self, data: bytes):
        disconnected = []
        for connection in self.active_connections:
            try:
                # Send frame as base64 encoded data
                frame_data = base64.b64encode(data).decode('utf-8')
                await connection.send_text(json.dumps({
                    "type": "frame",
                    "data": frame_data
                }))
            except WebSocketDisconnect:
                disconnected.append(connection)
            except Exception as e:
                logger.error(f"Error sending frame: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

manager = ConnectionManager()

# API Routes
@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve the main HTML page"""
    try:
        with open("/Users/saumil/Desktop/360Photo/product-capture-360/templates/index.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head><title>Product Capture 360</title></head>
        <body>
            <h1>Product Capture 360 - FastAPI Backend</h1>
            <p>FastAPI backend is running successfully!</p>
            <p>Connect to WebSocket at: ws://localhost:8000/ws/video</p>
        </body>
        </html>
        """)

@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    """Get current system status"""
    global current_session, performance_metrics
    
    try:
        # Update performance metrics
        if camera:
            with camera_lock:
                if camera.isOpened():
                    performance_metrics['camera_health_score'] = 100
                    performance_metrics['last_successful_frame'] = time.time()
                else:
                    performance_metrics['camera_health_score'] = 0
        
        session_time = 0
        capture_count = 0
        
        if current_session:
            session_time = int(time.time() - current_session["start_time"])
            capture_count = current_session["capture_count"]
        
        current_folder = (
            current_session.get("output_path")
            if isinstance(current_session, dict) and "output_path" in current_session
            else "/Users/saumil/Desktop/360Photo/p"
        )
        return StatusResponse(
            camera_connected=camera is not None and camera.isOpened(),
            session_active=current_session is not None,
            capture_count=capture_count,
            session_time=session_time,
            current_folder=str(current_folder),
            performance=performance_metrics
        )
    except Exception as e:
        logger.error(f"Error in get_status: {e}")
        # Return a basic status even if there's an error
        current_folder = (current_session.get("output_path") if isinstance(current_session, dict) and "output_path" in current_session else "/Users/saumil/Desktop/360Photo/p")
        return StatusResponse(
            camera_connected=False,
            session_active=False,
            capture_count=0,
            session_time=0,
            current_folder=str(current_folder),
            performance=performance_metrics
        )

@app.get("/api/camera/scan")
async def scan_available_cameras():
    """Scan for available cameras"""
    cameras = scan_cameras()
    return {
        "success": True,
        "cameras": [camera.dict() for camera in cameras],
        "count": len(cameras)
    }

@app.post("/api/camera/connect/{camera_index}")
async def connect_camera(camera_index: int):
    """Connect to a specific camera"""
    success = initialize_camera(camera_index)
    if success:
        return {"success": True, "message": f"Connected to camera {camera_index}"}
    else:
        raise HTTPException(status_code=400, detail=f"Failed to connect to camera {camera_index}")

@app.post("/api/camera/disconnect")
async def disconnect_camera():
    """Disconnect current camera"""
    global camera
    
    with camera_lock:
        if camera is not None:
            camera.release()
            camera = None
            cv2.destroyAllWindows()
    
    return {"success": True, "message": "Camera disconnected"}

@app.post("/api/camera/init")
async def init_camera(request: dict):
    """Initialize camera with specific index (for frontend compatibility)"""
    camera_index = request.get("camera_index", 0)
    success = initialize_camera(camera_index)
    
    if success:
        return {"success": True, "message": f"Camera {camera_index} initialized successfully"}
    else:
        raise HTTPException(status_code=400, detail=f"Failed to initialize camera {camera_index}")

@app.get("/video_feed")
async def video_feed():
    """HTTP video streaming endpoint"""
    def generate_frames():
        consecutive_failures = 0
        max_failures = 10
        
        while True:
            frame_data = get_frame()
            if frame_data:
                consecutive_failures = 0
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
            else:
                consecutive_failures += 1
                if consecutive_failures >= max_failures:
                    # Create a placeholder frame when camera fails
                    placeholder = create_placeholder_frame()
                    if placeholder:
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + placeholder + b'\r\n')
                time.sleep(0.1)  # Prevent busy waiting
    
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.websocket("/ws/video")
async def websocket_video_endpoint(websocket: WebSocket):
    """WebSocket video streaming endpoint"""
    await manager.connect(websocket)
    try:
        while True:
            frame_data = get_frame()
            if frame_data:
                await manager.send_frame(frame_data)
            await asyncio.sleep(1/30)  # 30 FPS
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/product/set")
async def set_product_info(data: dict):
    """Set product information"""
    global current_session
    
    product_name = data.get("product_name")
    if not product_name:
        return {"success": False, "message": "Product name not provided"}

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder_name = f"{product_name}_{timestamp}"
    
    # Use the current session's output_path if available (from storage selection),
    # otherwise fall back to the default path
    if current_session and 'output_path' in current_session:
        base_path = Path(current_session['output_path'])
    else:
        base_path = Path("/Users/saumil/Desktop/360Photo/p")
    
    output_path = base_path / folder_name
    output_path.mkdir(parents=True, exist_ok=True)
    
    if not current_session:
        current_session = {}

    current_session['output_path'] = str(output_path)
    current_session['product_name'] = product_name

    return {"success": True, "message": f"Product set to {product_name}", "folder_path": str(output_path), "product_name": product_name}

@app.post("/api/session/start")
async def start_session(config: SessionConfig):
    """Start a capture session"""
    global current_session, session_task

    # Determine base output directory
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        folder_name = f"{config.product_name}_{timestamp}"

        # Prefer an explicitly selected folder from current_session
        base_output = None
        if isinstance(current_session, dict) and current_session.get("output_path"):
            # If current_session has an output_path, use it as the base directory
            # This could be a storage device mount point or a previously set folder
            base_output = Path(current_session["output_path"])
            # If it's already a product-specific folder (contains timestamp), use its parent
            if "_" in base_output.name and any(char.isdigit() for char in base_output.name):
                base_output = base_output.parent
        elif config.output_folder:
            base_output = Path(config.output_folder)
        else:
            # Fallback to local project path
            base_output = Path("/Users/saumil/Desktop/360Photo/p")

        output_path = base_output / folder_name
        output_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {e}")

    current_session = {
        "config": config.dict(),
        "output_path": str(output_path),
        "start_time": time.time(),
        "capture_count": 0
    }

    # Start background task to track session duration; frontend will call /api/capture
    # so this task just marks the session active for the fixed duration
    async def _session_timer(duration_seconds: int):
        global current_session
        try:
            end_time = time.time() + max(1, duration_seconds)
            while time.time() < end_time and current_session is not None:
                await asyncio.sleep(0.5)
            # End session automatically when timer elapses
            if current_session is not None:
                logger.info("Session timer elapsed; ending session")
                current_session = None
        except asyncio.CancelledError:
            logger.info("Session timer cancelled")
            return

    # Cancel any previous session task
    if session_task and not session_task.done():
        session_task.cancel()
    session_task = asyncio.create_task(_session_timer(int(config.session_duration)))

    return {"success": True, "message": "Session started", "output_path": str(output_path)}
@app.post("/api/session/stop")
async def stop_session():
    """Stop current capture session"""
    global current_session, session_task

    if current_session:
        session_data = current_session
        current_session = None
        # Cancel background timer if running
        if session_task and not session_task.done():
            session_task.cancel()
        return {"success": True, "message": "Session stopped", "session_data": session_data}
    else:
        return {"success": False, "message": "No active session"}
@app.post("/api/folder/contents")
async def get_folder_contents(request: dict):
    """Get folder contents aligned to frontend expectations"""
    path = request.get("path", str(Path.home()))
    try:
        folder_path = Path(path)
        if not folder_path.exists():
            raise HTTPException(status_code=404, detail="Path does not exist")

        if not folder_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")

        contents = []
        for item in folder_path.iterdir():
            contents.append({
                "name": item.name,
                "path": str(item),
                "is_dir": item.is_dir(),
                "size": item.stat().st_size if item.is_file() else 0,
                "modified": item.stat().st_mtime
            })

        # Return keys expected by the frontend: 'path' and 'contents'
        return {"success": True, "contents": contents, "path": str(folder_path)}

    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/capture")
async def capture_image():
    """Capture a single image"""
    global current_session
    
    frame_data = get_frame()
    if not frame_data:
        raise HTTPException(status_code=500, detail="Failed to capture frame")
    
    # Save image
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Prefer selected output folder even if no active session
    selected_folder = None
    if isinstance(current_session, dict) and "output_path" in current_session:
        selected_folder = current_session["output_path"]

    if current_session and "output_path" in current_session and "capture_count" in current_session:
        output_path = Path(current_session["output_path"])  
        capture_count = current_session["capture_count"]
        filename = f"capture_{timestamp}_{capture_count:04d}.jpg"
        current_session["capture_count"] += 1
    else:
        output_path = Path(selected_folder or "/Users/saumil/Desktop/360Photo/p")
        # Ensure fallback path exists
        output_path.mkdir(parents=True, exist_ok=True)
        filename = f"capture_{timestamp}.jpg"
    
    file_path = output_path / filename
    
    with open(file_path, "wb") as f:
        f.write(frame_data)
    
    return {"success": True, "message": f"Image captured as {filename}", "filename": filename, "path": str(file_path)}

@app.get("/api/storage/devices")
async def get_storage_devices():
    """Get available storage devices"""
    devices = []
    try:
        if psutil is None:
            # Fallback: provide default local path
            devices.append({
                "device": "Local Storage",
                "mountpoint": "/Users/saumil/Desktop/360Photo/p",
                "fstype": "",
                "total": 0,
                "used": 0,
                "free": 100 * 1024**3,
                "percent": 0.0
            })
        else:
            # Enumerate disk partitions and usage (macOS friendly)
            for partition in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    devices.append({
                        "device": partition.device,
                        "mountpoint": partition.mountpoint,
                        "fstype": partition.fstype,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": round((usage.used / max(usage.total, 1)) * 100, 1)
                    })
                except PermissionError:
                    continue
                except Exception as e:
                    logger.warning(f"Error reading partition {partition.device}: {str(e)}")
                    continue
        return {"success": True, "devices": devices, "count": len(devices)}
    except Exception as e:
        logger.error(f"Failed to retrieve storage devices: {e}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Failed to retrieve storage devices: {str(e)}"})

@app.get("/api/storage/health")
async def get_storage_health(path: Optional[str] = None):
    """Return storage usage and a simple severity indicator for the given path.

    If no path is provided, use the current session output path or a sane default.
    """
    try:
        global current_session
        if path:
            base_path = Path(path)
        else:
            base_path = Path(current_session["output_path"]) if current_session and "output_path" in current_session else Path("/Users/saumil/Desktop/360Photo/p")

        # Ensure the path exists (create default if missing)
        try:
            base_path.mkdir(parents=True, exist_ok=True)
        except Exception:
            # Ignore mkdir errors if the path should not be created; fall back to its parent or root
            pass

        # Compute disk usage for the path's mount
        usage = shutil.disk_usage(str(base_path))
        total_bytes = int(usage.total)
        used_bytes = int(usage.used)
        free_bytes = int(usage.free)
        free_percent = round((free_bytes / max(total_bytes, 1)) * 100, 1)
        total_gb = round(total_bytes / (1024 ** 3), 1)
        free_gb = round(free_bytes / (1024 ** 3), 1)

        # Simple severity heuristic
        if free_percent < 10 or free_gb < 5:
            severity = "red"
            reason = "Critically low storage"
        elif free_percent < 25 or free_gb < 20:
            severity = "orange"
            reason = "Low storage"
        else:
            severity = "green"
            reason = "Healthy"

        return {
            "success": True,
            "path": str(base_path),
            "total_bytes": total_bytes,
            "used_bytes": used_bytes,
            "free_bytes": free_bytes,
            "free_percent": free_percent,
            "total_gb": total_gb,
            "free_gb": free_gb,
            "severity": severity,
            "reason": reason
        }
    except Exception as e:
        logger.error(f"Failed to compute storage health for {path}: {e}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Failed to compute storage health: {str(e)}"})

@app.post("/api/folder/create")
async def create_folder(request: dict):
    """Create a new folder"""
    path = request.get("path", "/Users/saumil/Desktop/360Photo/p")
    name = request.get("name")

    if not name:
        raise HTTPException(status_code=400, detail="Folder name not provided")

    try:
        folder_path = Path(path) / name
        folder_path.mkdir(parents=True, exist_ok=True)
        return {"success": True, "message": f"Folder '{name}' created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/platform/rotate")
async def rotate_platform():
    """Stub endpoint to rotate platform (placeholder for hardware control)."""
    try:
        # Simulate a short rotation delay
        await asyncio.sleep(0.2)
        return {"success": True, "message": "Platform rotated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/folder/set")
async def set_folder(request: dict):
    """Set the current working folder"""
    path = request.get("path")

    if not path:
        raise HTTPException(status_code=400, detail="Path not provided")

    # Validate that the path exists and is a directory
    folder_path = Path(path)
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    global current_session
    if not current_session:
        current_session = {}

    current_session['output_path'] = str(folder_path)
    return {"success": True, "message": f"Folder set to '{folder_path}'", "current_folder": str(folder_path)}

@app.get("/api/session/status")
async def get_session_status():
    """Get current session status"""
    global current_session
    
    if current_session:
        return {
            "active": True,
            "config": current_session["config"],
            "start_time": current_session["start_time"],
            "capture_count": current_session["capture_count"],
            "output_path": current_session["output_path"]
        }
    else:
        return {"active": False}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": time.time()}

# Background task for performance monitoring
async def monitor_performance():
    """Background task to monitor performance metrics"""
    while True:
        try:
            # Update FPS and other metrics
            current_time = time.time()
            if performance_metrics['last_successful_frame'] > 0:
                time_since_last_frame = current_time - performance_metrics['last_successful_frame']
                if time_since_last_frame < 5:  # Recent frame
                    performance_metrics['fps'] = 1.0 / max(time_since_last_frame, 0.001)
                else:
                    performance_metrics['fps'] = 0
            
            # Calculate camera health score
            health_score = 100
            if performance_metrics['connection_errors'] > 0:
                health_score -= min(performance_metrics['connection_errors'] * 10, 50)
            if performance_metrics['fps'] < 10:
                health_score -= 20
            
            performance_metrics['camera_health_score'] = max(health_score, 0)
            
        except Exception as e:
            logger.error(f"Performance monitoring error: {e}")
        
        await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("FastAPI Product Capture application starting...")
    
    # Start performance monitoring
    asyncio.create_task(monitor_performance())
    
    # Try to initialize default camera
    initialize_camera(0)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global camera
    
    logger.info("FastAPI Product Capture application shutting down...")
    
    if camera is not None:
        camera.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    uvicorn.run(
        "fastapi_capture_app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )