#!/usr/bin/env python3
"""
Minimal Camera Test - Isolate the exact issue
"""

import streamlit as st
import cv2
import time
import numpy as np

st.set_page_config(page_title="Minimal Camera Test", layout="wide")

st.title("🎯 Minimal Camera Test")

# Initialize session state
if 'camera' not in st.session_state:
    st.session_state.camera = None
if 'running' not in st.session_state:
    st.session_state.running = False

def init_camera():
    """Initialize camera"""
    if st.session_state.camera is None:
        st.session_state.camera = cv2.VideoCapture(0)
    return st.session_state.camera.isOpened()

def get_frame():
    """Get a single frame"""
    if st.session_state.camera is None:
        return None
    
    ret, frame = st.session_state.camera.read()
    if ret:
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return None

# Controls
col1, col2, col3 = st.columns(3)

with col1:
    if st.button("🎥 Init Camera"):
        if init_camera():
            st.success("✅ Camera ready!")
        else:
            st.error("❌ Camera failed!")

with col2:
    if st.button("▶️ Start Live"):
        st.session_state.running = True

with col3:
    if st.button("⏹️ Stop Live"):
        st.session_state.running = False

# Display area
st.write("---")

if st.session_state.running:
    if init_camera():
        frame = get_frame()
        if frame is not None:
            st.image(frame, caption="Live Preview", use_column_width=True)
            st.success("🟢 Live preview active")
        else:
            st.error("❌ No frame captured")
    else:
        st.error("❌ Camera not available")
    
    # This is the key line - auto-refresh
    time.sleep(0.1)
    st.rerun()

# Status
st.write("---")
st.write(f"**Camera Status:** {'✅ Ready' if (st.session_state.camera and st.session_state.camera.isOpened()) else '❌ Not ready'}")
st.write(f"**Live Preview:** {'🟢 Running' if st.session_state.running else '🔴 Stopped'}")
st.write(f"**OpenCV Version:** {cv2.__version__}")
st.write(f"**Streamlit Version:** {st.__version__}")