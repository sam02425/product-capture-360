#!/usr/bin/env python3
"""
Lightweight Product Capture Application
Features:
- Live camera preview
- Rotating platform integration
- Storage device detection
- Folder browsing and management
- Image capture and organization
"""

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
import subprocess

# Page configuration
st.set_page_config(
    page_title="Product Capture System",
    page_icon="📸",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better UI
st.markdown("""
<style>
    .main-header {
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        padding: 1rem;
        border-radius: 10px;
        color: white;
        text-align: center;
        margin-bottom: 2rem;
    }
    
    .live-preview-container {
        border: 3px solid #28a745;
        border-radius: 10px;
        padding: 10px;
        background: #f8f9fa;
    }
    
    .capture-button {
        background: linear-gradient(45deg, #ff6b6b, #ee5a24);
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 25px;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
    }
    
    .storage-info {
        background: #e3f2fd;
        padding: 15px;
        border-radius: 8px;
        border-left: 4px solid #2196f3;
        margin: 10px 0;
    }
    
    .folder-item {
        padding: 8px;
        margin: 2px 0;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .folder-item:hover {
        background-color: #f0f0f0;
    }
    
    .status-indicator {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
    }
    
    .status-connected {
        background-color: #28a745;
        animation: pulse 2s infinite;
    }
    
    .status-disconnected {
        background-color: #dc3545;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>
""", unsafe_allow_html=True)

class ProductCaptureSystem:
    def __init__(self):
        self.camera = None
        self.is_capturing = False
        self.capture_count = 0
        self.session_start_time = time.time()
        
    def initialize_camera(self, camera_index=0):
        """Initialize camera connection"""
        try:
            if self.camera is not None:
                self.camera.release()
            
            self.camera = cv2.VideoCapture(camera_index)
            if not self.camera.isOpened():
                return False
                
            # Set camera properties for better quality
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            self.camera.set(cv2.CAP_PROP_FPS, 30)
            
            return True
        except Exception as e:
            st.error(f"Camera initialization failed: {str(e)}")
            return False
    
    def get_frame(self):
        """Get current camera frame"""
        if self.camera is None or not self.camera.isOpened():
            return None
            
        ret, frame = self.camera.read()
        if ret:
            return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return None
    
    def capture_image(self, save_path):
        """Capture and save image"""
        frame = self.get_frame()
        if frame is not None:
            image = Image.fromarray(frame)
            image.save(save_path, quality=95)
            self.capture_count += 1
            return True
        return False
    
    def release_camera(self):
        """Release camera resources"""
        if self.camera is not None:
            self.camera.release()
            self.camera = None

class StorageManager:
    @staticmethod
    def get_storage_devices():
        """Get all available storage devices"""
        devices = []
        
        try:
            # Get all disk partitions
            partitions = psutil.disk_partitions()
            
            for partition in partitions:
                try:
                    # Get disk usage
                    usage = psutil.disk_usage(partition.mountpoint)
                    
                    # Convert bytes to GB
                    total_gb = usage.total / (1024**3)
                    free_gb = usage.free / (1024**3)
                    used_gb = usage.used / (1024**3)
                    
                    device_info = {
                        'device': partition.device,
                        'mountpoint': partition.mountpoint,
                        'fstype': partition.fstype,
                        'total_gb': round(total_gb, 2),
                        'free_gb': round(free_gb, 2),
                        'used_gb': round(used_gb, 2),
                        'usage_percent': round((used_gb / total_gb) * 100, 1)
                    }
                    
                    devices.append(device_info)
                    
                except PermissionError:
                    continue
                    
        except Exception as e:
            st.error(f"Error getting storage devices: {str(e)}")
            
        return devices
    
    @staticmethod
    def get_folder_contents(path):
        """Get contents of a folder"""
        try:
            path_obj = Path(path)
            if not path_obj.exists():
                return []
                
            contents = []
            for item in path_obj.iterdir():
                try:
                    stat = item.stat()
                    contents.append({
                        'name': item.name,
                        'path': str(item),
                        'is_dir': item.is_dir(),
                        'size': stat.st_size if not item.is_dir() else 0,
                        'modified': datetime.fromtimestamp(stat.st_mtime)
                    })
                except (PermissionError, OSError):
                    continue
                    
            # Sort: directories first, then files
            contents.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
            return contents
            
        except Exception as e:
            st.error(f"Error reading folder: {str(e)}")
            return []

def initialize_session_state():
    """Initialize Streamlit session state variables"""
    if 'capture_system' not in st.session_state:
        st.session_state.capture_system = ProductCaptureSystem()
    
    if 'current_storage_path' not in st.session_state:
        st.session_state.current_storage_path = str(Path.home())
    
    if 'selected_storage_device' not in st.session_state:
        st.session_state.selected_storage_device = None
    
    if 'camera_connected' not in st.session_state:
        st.session_state.camera_connected = False
    
    if 'auto_preview' not in st.session_state:
        st.session_state.auto_preview = True
    
    if 'capture_folder' not in st.session_state:
        st.session_state.capture_folder = str(Path.home() / "ProductCaptures")

def main():
    initialize_session_state()
    
    # Header
    st.markdown("""
    <div class="main-header">
        <h1>📸 Product Capture System</h1>
        <p>Lightweight application for rotating platform product photography</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Sidebar for settings and storage
    with st.sidebar:
        st.header("⚙️ System Settings")
        
        # Camera settings
        st.subheader("📹 Camera")
        camera_index = st.selectbox("Camera Device", options=[0, 1, 2], index=0)
        
        if st.button("🔌 Connect Camera"):
            if st.session_state.capture_system.initialize_camera(camera_index):
                st.session_state.camera_connected = True
                st.success("✅ Camera connected!")
            else:
                st.session_state.camera_connected = False
                st.error("❌ Camera connection failed!")
        
        # Camera status
        status_class = "status-connected" if st.session_state.camera_connected else "status-disconnected"
        status_text = "Connected" if st.session_state.camera_connected else "Disconnected"
        
        st.markdown(f"""
        <div>
            <span class="status-indicator {status_class}"></span>
            Camera Status: {status_text}
        </div>
        """, unsafe_allow_html=True)
        
        st.divider()
        
        # Storage management
        st.subheader("💾 Storage Devices")
        
        if st.button("🔄 Refresh Storage"):
            st.rerun()
        
        storage_devices = StorageManager.get_storage_devices()
        
        if storage_devices:
            for device in storage_devices:
                with st.expander(f"📱 {device['device']} ({device['total_gb']} GB)"):
                    st.write(f"**Mount Point:** {device['mountpoint']}")
                    st.write(f"**File System:** {device['fstype']}")
                    st.write(f"**Free Space:** {device['free_gb']} GB")
                    st.write(f"**Used:** {device['usage_percent']}%")
                    
                    if st.button(f"Select {device['device']}", key=f"select_{device['device']}"):
                        st.session_state.selected_storage_device = device
                        st.session_state.current_storage_path = device['mountpoint']
                        st.rerun()
        
        st.divider()
        
        # Capture settings
        st.subheader("📸 Capture Settings")
        
        st.session_state.auto_preview = st.checkbox("Auto Preview", value=st.session_state.auto_preview)
        
        # Capture folder selection
        st.text_input("Capture Folder", value=st.session_state.capture_folder, key="capture_folder_input")
        
        if st.button("📁 Create Capture Folder"):
            try:
                Path(st.session_state.capture_folder).mkdir(parents=True, exist_ok=True)
                st.success("✅ Folder created!")
            except Exception as e:
                st.error(f"❌ Error: {str(e)}")
    
    # Main content area
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.header("👁️ Live Preview")
        
        if st.session_state.camera_connected and st.session_state.auto_preview:
            # Live preview container
            preview_placeholder = st.empty()
            
            # Get current frame
            frame = st.session_state.capture_system.get_frame()
            
            if frame is not None:
                with preview_placeholder.container():
                    st.markdown('<div class="live-preview-container">', unsafe_allow_html=True)
                    st.image(frame, channels="RGB", use_column_width=True)
                    st.markdown('</div>', unsafe_allow_html=True)
            else:
                st.error("❌ No camera feed available")
        else:
            st.info("📷 Connect camera and enable auto preview to see live feed")
        
        # Capture controls
        st.header("🎯 Capture Controls")
        
        col_capture1, col_capture2, col_capture3 = st.columns([1, 1, 1])
        
        with col_capture1:
            if st.button("📸 Capture Image", disabled=not st.session_state.camera_connected):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"product_{timestamp}.jpg"
                save_path = Path(st.session_state.capture_folder) / filename
                
                # Ensure capture folder exists
                save_path.parent.mkdir(parents=True, exist_ok=True)
                
                if st.session_state.capture_system.capture_image(str(save_path)):
                    st.success(f"✅ Image saved: {filename}")
                else:
                    st.error("❌ Capture failed!")
        
        with col_capture2:
            if st.button("🔄 Rotate Platform"):
                st.info("🔄 Platform rotation command sent")
                # Here you would integrate with your rotating platform hardware
                # For now, just showing a placeholder
        
        with col_capture3:
            capture_count = st.session_state.capture_system.capture_count
            session_time = int(time.time() - st.session_state.capture_system.session_start_time)
            st.metric("Images Captured", capture_count)
            st.metric("Session Time", f"{session_time}s")
    
    with col2:
        st.header("📂 Storage Browser")
        
        # Current path
        st.text_input("Current Path", value=st.session_state.current_storage_path, key="current_path_display", disabled=True)
        
        # Navigation buttons
        nav_col1, nav_col2 = st.columns([1, 1])
        
        with nav_col1:
            if st.button("⬆️ Up"):
                parent = Path(st.session_state.current_storage_path).parent
                if parent != Path(st.session_state.current_storage_path):
                    st.session_state.current_storage_path = str(parent)
                    st.rerun()
        
        with nav_col2:
            if st.button("🏠 Home"):
                st.session_state.current_storage_path = str(Path.home())
                st.rerun()
        
        # Folder contents
        st.subheader("📋 Contents")
        
        contents = StorageManager.get_folder_contents(st.session_state.current_storage_path)
        
        if contents:
            for item in contents:
                icon = "📁" if item['is_dir'] else "📄"
                size_text = "Folder" if item['is_dir'] else f"{item['size']:,} bytes"
                
                col_icon, col_name, col_action = st.columns([0.5, 2, 1])
                
                with col_icon:
                    st.write(icon)
                
                with col_name:
                    st.write(f"**{item['name']}**")
                    st.caption(f"{size_text} | {item['modified'].strftime('%Y-%m-%d %H:%M')}")
                
                with col_action:
                    if item['is_dir']:
                        if st.button("Open", key=f"open_{item['name']}"):
                            st.session_state.current_storage_path = item['path']
                            st.rerun()
                    else:
                        # Show preview for images
                        if item['name'].lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp')):
                            if st.button("👁️", key=f"preview_{item['name']}"):
                                try:
                                    image = Image.open(item['path'])
                                    st.image(image, caption=item['name'], width=200)
                                except Exception as e:
                                    st.error(f"Cannot preview: {str(e)}")
        else:
            st.info("📭 Folder is empty")
        
        # Storage info
        if st.session_state.selected_storage_device:
            device = st.session_state.selected_storage_device
            st.markdown(f"""
            <div class="storage-info">
                <h4>💾 Selected Storage</h4>
                <p><strong>Device:</strong> {device['device']}</p>
                <p><strong>Free Space:</strong> {device['free_gb']} GB</p>
                <p><strong>Usage:</strong> {device['usage_percent']}%</p>
            </div>
            """, unsafe_allow_html=True)
    
    # Auto-refresh for live preview
    if st.session_state.auto_preview and st.session_state.camera_connected:
        time.sleep(0.1)  # Small delay to prevent excessive CPU usage
        st.rerun()

if __name__ == "__main__":
    main()