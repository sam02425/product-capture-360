import streamlit as st
import cv2
import numpy as np
import time

st.set_page_config(page_title="Camera Test", layout="wide")

st.title("🔍 Streamlit Camera Test")

# Initialize session state
if 'camera_cap' not in st.session_state:
    st.session_state.camera_cap = None
if 'camera_id' not in st.session_state:
    st.session_state.camera_id = 0

def get_frame():
    """Get a single frame from camera"""
    try:
        if st.session_state.camera_cap is None:
            st.session_state.camera_cap = cv2.VideoCapture(st.session_state.camera_id)
        
        if not st.session_state.camera_cap.isOpened():
            return None, "Camera not opened"
        
        ret, frame = st.session_state.camera_cap.read()
        if not ret or frame is None:
            return None, "Failed to read frame"
        
        # Convert BGR to RGB for Streamlit
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return frame_rgb, "Success"
    
    except Exception as e:
        return None, f"Error: {str(e)}"

# Camera controls
col1, col2, col3 = st.columns(3)

with col1:
    if st.button("🎥 Initialize Camera"):
        if st.session_state.camera_cap:
            st.session_state.camera_cap.release()
        st.session_state.camera_cap = cv2.VideoCapture(st.session_state.camera_id)
        if st.session_state.camera_cap.isOpened():
            st.success("Camera initialized!")
        else:
            st.error("Failed to initialize camera")

with col2:
    if st.button("📸 Capture Frame"):
        frame, status = get_frame()
        if frame is not None:
            st.success(f"Frame captured: {frame.shape}")
        else:
            st.error(f"Capture failed: {status}")

with col3:
    if st.button("🔄 Release Camera"):
        if st.session_state.camera_cap:
            st.session_state.camera_cap.release()
            st.session_state.camera_cap = None
            st.success("Camera released")

# Live preview section
st.subheader("📺 Live Preview Test")

# Method 1: Manual refresh
st.write("**Method 1: Manual Refresh**")
if st.button("🔄 Get Single Frame"):
    frame, status = get_frame()
    if frame is not None:
        st.image(frame, caption=f"Frame: {frame.shape}", use_column_width=True)
        st.success(f"Status: {status}")
    else:
        st.error(f"Failed: {status}")

# Method 2: Auto-refresh with placeholder
st.write("**Method 2: Auto-refresh (5 seconds)**")
auto_refresh = st.checkbox("Enable Auto-refresh")

if auto_refresh:
    placeholder = st.empty()
    
    for i in range(5):
        frame, status = get_frame()
        
        with placeholder.container():
            if frame is not None:
                st.image(frame, caption=f"Auto-refresh {i+1}/5 - {status}", use_column_width=True)
                st.write(f"Frame shape: {frame.shape}, Status: {status}")
            else:
                st.error(f"Frame {i+1}: {status}")
        
        time.sleep(1)
    
    placeholder.empty()
    st.success("Auto-refresh test completed")

# Method 3: Continuous with rerun
st.write("**Method 3: Continuous with st.rerun()**")
continuous = st.checkbox("Enable Continuous Preview")

if continuous:
    frame, status = get_frame()
    
    if frame is not None:
        st.image(frame, caption=f"Continuous - {status}", use_column_width=True)
        st.write(f"Frame: {frame.shape}, Time: {time.strftime('%H:%M:%S')}")
    else:
        st.error(f"Continuous failed: {status}")
    
    # Auto-rerun for continuous preview
    time.sleep(0.1)
    st.rerun()

# Debug information
st.subheader("🔧 Debug Information")
col1, col2 = st.columns(2)

with col1:
    st.write("**Camera Status:**")
    if st.session_state.camera_cap:
        st.write(f"- Camera object exists: ✅")
        st.write(f"- Camera opened: {'✅' if st.session_state.camera_cap.isOpened() else '❌'}")
    else:
        st.write("- Camera object: ❌ None")

with col2:
    st.write("**System Info:**")
    st.write(f"- OpenCV version: {cv2.__version__}")
    st.write(f"- Streamlit version: {st.__version__}")
    st.write(f"- Camera ID: {st.session_state.camera_id}")
