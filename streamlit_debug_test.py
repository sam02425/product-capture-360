#!/usr/bin/env python3
"""
Streamlit Live Preview Debug Test
Focused test to identify auto-refresh issues
"""

import streamlit as st
import cv2
import time
import threading
from datetime import datetime

st.set_page_config(page_title="Live Preview Debug", layout="wide")

st.title("🔍 Streamlit Live Preview Debug Test")

# Initialize session state
if 'debug_camera_cap' not in st.session_state:
    st.session_state.debug_camera_cap = None
if 'debug_running' not in st.session_state:
    st.session_state.debug_running = False
if 'frame_count' not in st.session_state:
    st.session_state.frame_count = 0
if 'last_frame_time' not in st.session_state:
    st.session_state.last_frame_time = None

def get_debug_frame():
    """Get frame with detailed debugging"""
    try:
        if st.session_state.debug_camera_cap is None:
            st.session_state.debug_camera_cap = cv2.VideoCapture(0)
            if not st.session_state.debug_camera_cap.isOpened():
                return None, "Camera failed to open"
        
        if not st.session_state.debug_camera_cap.isOpened():
            return None, "Camera not opened"
        
        ret, frame = st.session_state.debug_camera_cap.read()
        if not ret or frame is None:
            return None, "Failed to read frame"
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Update counters
        st.session_state.frame_count += 1
        st.session_state.last_frame_time = datetime.now()
        
        return frame_rgb, "Success"
    
    except Exception as e:
        return None, f"Exception: {str(e)}"

# Camera initialization
st.subheader("📹 Camera Initialization")
col1, col2, col3 = st.columns(3)

with col1:
    if st.button("🎥 Initialize Camera"):
        if st.session_state.debug_camera_cap:
            st.session_state.debug_camera_cap.release()
        st.session_state.debug_camera_cap = cv2.VideoCapture(0)
        if st.session_state.debug_camera_cap.isOpened():
            st.success("✅ Camera initialized!")
        else:
            st.error("❌ Camera initialization failed!")

with col2:
    if st.button("🔄 Release Camera"):
        if st.session_state.debug_camera_cap:
            st.session_state.debug_camera_cap.release()
            st.session_state.debug_camera_cap = None
            st.session_state.frame_count = 0
            st.success("✅ Camera released!")

with col3:
    if st.button("📊 Reset Counters"):
        st.session_state.frame_count = 0
        st.session_state.last_frame_time = None
        st.success("✅ Counters reset!")

# Debug information
st.subheader("🔧 Debug Information")
debug_col1, debug_col2, debug_col3 = st.columns(3)

with debug_col1:
    camera_status = "✅ Initialized" if (st.session_state.debug_camera_cap and st.session_state.debug_camera_cap.isOpened()) else "❌ Not initialized"
    st.metric("Camera Status", camera_status)

with debug_col2:
    st.metric("Frame Count", st.session_state.frame_count)

with debug_col3:
    last_frame = st.session_state.last_frame_time.strftime("%H:%M:%S.%f")[:-3] if st.session_state.last_frame_time else "Never"
    st.metric("Last Frame", last_frame)

st.divider()

# Test different refresh methods
st.subheader("🧪 Live Preview Tests")

# Method 1: Manual button refresh
st.write("**Method 1: Manual Button Refresh**")
if st.button("📸 Capture Single Frame"):
    frame, status = get_debug_frame()
    if frame is not None:
        st.image(frame, caption=f"Manual capture - Status: {status}", use_column_width=True)
        st.success(f"✅ Frame captured successfully! Shape: {frame.shape}")
    else:
        st.error(f"❌ Frame capture failed: {status}")

st.divider()

# Method 2: Checkbox-controlled auto-refresh
st.write("**Method 2: Checkbox Auto-refresh**")
auto_refresh_checkbox = st.checkbox("🔄 Enable Auto-refresh (Checkbox)")

if auto_refresh_checkbox:
    frame, status = get_debug_frame()
    
    if frame is not None:
        st.image(frame, caption=f"Auto-refresh (Checkbox) - Status: {status} - Frame #{st.session_state.frame_count}", use_column_width=True)
        st.success(f"✅ Live preview active - {status}")
    else:
        st.error(f"❌ Auto-refresh failed: {status}")
    
    # Auto-refresh with rerun
    time.sleep(0.1)
    st.rerun()

st.divider()

# Method 3: Session state controlled auto-refresh
st.write("**Method 3: Session State Auto-refresh**")
col1, col2 = st.columns(2)

with col1:
    if st.button("▶️ Start Live Preview"):
        st.session_state.debug_running = True
        st.success("✅ Live preview started!")

with col2:
    if st.button("⏹️ Stop Live Preview"):
        st.session_state.debug_running = False
        st.success("✅ Live preview stopped!")

if st.session_state.debug_running:
    frame, status = get_debug_frame()
    
    if frame is not None:
        st.image(frame, caption=f"Session State Auto-refresh - Status: {status} - Frame #{st.session_state.frame_count}", use_column_width=True)
        st.info(f"🟢 Live preview running - {status}")
    else:
        st.error(f"❌ Session state refresh failed: {status}")
    
    # Auto-refresh with rerun
    time.sleep(0.1)
    st.rerun()

st.divider()

# Method 4: Placeholder-based refresh
st.write("**Method 4: Placeholder Auto-refresh**")
placeholder_refresh = st.checkbox("🔄 Enable Placeholder Refresh")

if placeholder_refresh:
    placeholder = st.empty()
    
    frame, status = get_debug_frame()
    
    with placeholder.container():
        if frame is not None:
            st.image(frame, caption=f"Placeholder refresh - Status: {status} - Frame #{st.session_state.frame_count}", use_column_width=True)
            st.success(f"✅ Placeholder method active - {status}")
        else:
            st.error(f"❌ Placeholder method failed: {status}")
    
    # Auto-refresh with rerun
    time.sleep(0.1)
    st.rerun()

st.divider()

# Method 5: Timer-based refresh
st.write("**Method 5: Timer-based Refresh (No rerun)**")
timer_refresh = st.checkbox("⏰ Enable Timer Refresh")

if timer_refresh:
    # This method doesn't use st.rerun() - just displays current frame
    frame, status = get_debug_frame()
    
    if frame is not None:
        st.image(frame, caption=f"Timer refresh (no rerun) - Status: {status} - Frame #{st.session_state.frame_count}", use_column_width=True)
        st.info(f"🔵 Timer method (static) - {status}")
    else:
        st.error(f"❌ Timer method failed: {status}")

# Performance metrics
st.divider()
st.subheader("📊 Performance Metrics")

perf_col1, perf_col2, perf_col3 = st.columns(3)

with perf_col1:
    st.metric("OpenCV Version", cv2.__version__)

with perf_col2:
    st.metric("Streamlit Version", st.__version__)

with perf_col3:
    current_time = datetime.now().strftime("%H:%M:%S")
    st.metric("Current Time", current_time)

# Cleanup on app close
if st.session_state.debug_camera_cap:
    # Note: This won't actually run on app close, but it's good practice
    pass