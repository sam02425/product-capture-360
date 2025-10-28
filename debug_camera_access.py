#!/usr/bin/env python3
"""
Comprehensive Camera Access Debug Script
Tests various camera scenarios to identify potential issues
"""

import cv2
import numpy as np
import time
import sys
import platform
import subprocess

def print_system_info():
    """Print system and environment information"""
    print("=" * 60)
    print("SYSTEM INFORMATION")
    print("=" * 60)
    print(f"Platform: {platform.platform()}")
    print(f"Python version: {sys.version}")
    print(f"OpenCV version: {cv2.__version__}")
    print(f"NumPy version: {np.__version__}")
    print()

def check_camera_permissions():
    """Check camera permissions on macOS"""
    print("=" * 60)
    print("CAMERA PERMISSIONS CHECK")
    print("=" * 60)
    
    if platform.system() == "Darwin":  # macOS
        try:
            # Check if camera permission is granted
            result = subprocess.run(
                ["system_profiler", "SPCameraDataType"], 
                capture_output=True, 
                text=True, 
                timeout=10
            )
            if result.returncode == 0:
                print("✅ Camera access appears to be available")
                print("Camera devices found:")
                print(result.stdout)
            else:
                print("❌ Camera access may be restricted")
        except Exception as e:
            print(f"⚠️  Could not check camera permissions: {e}")
    else:
        print("ℹ️  Permission check only available on macOS")
    print()

def test_camera_detection():
    """Test camera detection across multiple indices"""
    print("=" * 60)
    print("CAMERA DETECTION TEST")
    print("=" * 60)
    
    available_cameras = []
    
    for i in range(10):  # Test first 10 camera indices
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                height, width = frame.shape[:2]
                available_cameras.append({
                    'id': i,
                    'resolution': f"{width}x{height}",
                    'frame_shape': frame.shape
                })
                print(f"✅ Camera {i}: Available - {width}x{height}")
            else:
                print(f"⚠️  Camera {i}: Opened but no frame")
        else:
            print(f"❌ Camera {i}: Not available")
        cap.release()
    
    print(f"\nTotal available cameras: {len(available_cameras)}")
    return available_cameras

def test_camera_properties(camera_id):
    """Test camera properties and capabilities"""
    print("=" * 60)
    print(f"CAMERA {camera_id} PROPERTIES TEST")
    print("=" * 60)
    
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"❌ Cannot open camera {camera_id}")
        return False
    
    # Test various properties
    properties = {
        'CAP_PROP_FRAME_WIDTH': cv2.CAP_PROP_FRAME_WIDTH,
        'CAP_PROP_FRAME_HEIGHT': cv2.CAP_PROP_FRAME_HEIGHT,
        'CAP_PROP_FPS': cv2.CAP_PROP_FPS,
        'CAP_PROP_BRIGHTNESS': cv2.CAP_PROP_BRIGHTNESS,
        'CAP_PROP_CONTRAST': cv2.CAP_PROP_CONTRAST,
        'CAP_PROP_SATURATION': cv2.CAP_PROP_SATURATION,
        'CAP_PROP_EXPOSURE': cv2.CAP_PROP_EXPOSURE,
    }
    
    for prop_name, prop_id in properties.items():
        try:
            value = cap.get(prop_id)
            print(f"{prop_name}: {value}")
        except Exception as e:
            print(f"{prop_name}: Error - {e}")
    
    cap.release()
    return True

def test_frame_capture_performance(camera_id, num_frames=30):
    """Test frame capture performance"""
    print("=" * 60)
    print(f"FRAME CAPTURE PERFORMANCE TEST - Camera {camera_id}")
    print("=" * 60)
    
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"❌ Cannot open camera {camera_id}")
        return False
    
    # Warm up
    for _ in range(5):
        cap.read()
    
    # Performance test
    start_time = time.time()
    successful_frames = 0
    failed_frames = 0
    
    for i in range(num_frames):
        ret, frame = cap.read()
        if ret and frame is not None:
            successful_frames += 1
        else:
            failed_frames += 1
        
        if i % 10 == 0:
            print(f"Progress: {i}/{num_frames} frames")
    
    end_time = time.time()
    duration = end_time - start_time
    fps = successful_frames / duration if duration > 0 else 0
    
    print(f"\nResults:")
    print(f"✅ Successful frames: {successful_frames}")
    print(f"❌ Failed frames: {failed_frames}")
    print(f"⏱️  Duration: {duration:.2f} seconds")
    print(f"📊 Average FPS: {fps:.2f}")
    
    cap.release()
    return True

def test_different_backends():
    """Test different OpenCV backends"""
    print("=" * 60)
    print("OPENCV BACKENDS TEST")
    print("=" * 60)
    
    backends = [
        (cv2.CAP_ANY, "CAP_ANY"),
        (cv2.CAP_AVFOUNDATION, "CAP_AVFOUNDATION (macOS)"),
        (cv2.CAP_V4L2, "CAP_V4L2 (Linux)"),
        (cv2.CAP_DSHOW, "CAP_DSHOW (Windows)"),
    ]
    
    for backend_id, backend_name in backends:
        try:
            cap = cv2.VideoCapture(0, backend_id)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    print(f"✅ {backend_name}: Working")
                else:
                    print(f"⚠️  {backend_name}: Opened but no frame")
            else:
                print(f"❌ {backend_name}: Cannot open")
            cap.release()
        except Exception as e:
            print(f"❌ {backend_name}: Error - {e}")

def test_concurrent_access():
    """Test concurrent camera access"""
    print("=" * 60)
    print("CONCURRENT ACCESS TEST")
    print("=" * 60)
    
    caps = []
    try:
        # Try to open multiple instances
        for i in range(3):
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                caps.append(cap)
                print(f"✅ Instance {i+1}: Opened successfully")
            else:
                print(f"❌ Instance {i+1}: Failed to open")
                break
        
        # Test reading from all instances
        if caps:
            print("\nTesting frame capture from all instances:")
            for i, cap in enumerate(caps):
                ret, frame = cap.read()
                if ret and frame is not None:
                    print(f"✅ Instance {i+1}: Frame captured")
                else:
                    print(f"❌ Instance {i+1}: No frame")
    
    finally:
        # Clean up
        for cap in caps:
            cap.release()
        print(f"\nReleased {len(caps)} camera instances")

def main():
    """Main debug function"""
    print("🔍 CAMERA ACCESS DEBUG SCRIPT")
    print("This script will test various camera scenarios")
    print()
    
    # System info
    print_system_info()
    
    # Check permissions
    check_camera_permissions()
    
    # Test camera detection
    available_cameras = test_camera_detection()
    
    if not available_cameras:
        print("❌ No cameras detected. Exiting.")
        return
    
    # Test first available camera in detail
    first_camera = available_cameras[0]['id']
    
    # Test properties
    test_camera_properties(first_camera)
    
    # Test performance
    test_frame_capture_performance(first_camera)
    
    # Test backends
    test_different_backends()
    
    # Test concurrent access
    test_concurrent_access()
    
    print("=" * 60)
    print("DEBUG COMPLETE")
    print("=" * 60)
    print("If you're still experiencing issues:")
    print("1. Check camera permissions in System Preferences > Security & Privacy")
    print("2. Ensure no other applications are using the camera")
    print("3. Try restarting the application")
    print("4. Check for macOS camera access restrictions")

if __name__ == "__main__":
    main()