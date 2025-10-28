import cv2
import numpy as np
import time

def test_camera():
    print("Testing camera functionality...")
    
    # Test camera detection
    print("\n1. Testing camera detection:")
    cameras_found = []
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                cameras_found.append(i)
                print(f"   ✅ Camera {i}: Working ({frame.shape})")
            else:
                print(f"   ❌ Camera {i}: Detected but no frame")
            cap.release()
        else:
            print(f"   ⚪ Camera {i}: Not available")
    
    if not cameras_found:
        print("❌ No working cameras found!")
        return False
    
    # Test first working camera
    camera_id = cameras_found[0]
    print(f"\n2. Testing Camera {camera_id} functionality:")
    
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"❌ Failed to open camera {camera_id}")
        return False
    
    # Test frame capture
    for i in range(5):
        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"   Frame {i+1}: ✅ {frame.shape} - {frame.dtype}")
        else:
            print(f"   Frame {i+1}: ❌ Failed to capture")
        time.sleep(0.1)
    
    cap.release()
    print("\n✅ Camera test completed successfully!")
    return True

if __name__ == "__main__":
    test_camera()
