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

# Page configuration
st.set_page_config(
    page_title="360° Product Capture System",
    page_icon="📸",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize session state
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

# Capture speed presets
SPEED_PRESETS = {
    "Ultra Fast (24 imgs/rev)": {
        "images_per_rev": 24,
        "angle_step": 15.0,
        "interval_20sec": 0.83,
        "interval_40sec": 1.67
    },
    "Fast (36 imgs/rev)": {
        "images_per_rev": 36,
        "angle_step": 10.0,
        "interval_20sec": 0.56,
        "interval_40sec": 1.11
    },
    "Medium (72 imgs/rev)": {
        "images_per_rev": 72,
        "angle_step": 5.0,
        "interval_20sec": 0.28,
        "interval_40sec": 0.56
    },
    "Detailed (120 imgs/rev)": {
        "images_per_rev": 120,
        "angle_step": 3.0,
        "interval_20sec": 0.17,
        "interval_40sec": 0.33
    },
    "Ultra Detailed (180 imgs/rev)": {
        "images_per_rev": 180,
        "angle_step": 2.0,
        "interval_20sec": 0.11,
        "interval_40sec": 0.22
    }
}

class CameraManager:
    """Manages USB camera connections and image capture"""

    @staticmethod
    def detect_cameras(max_cameras=5):
        """Detect available USB cameras"""
        available_cameras = []
        for i in range(max_cameras):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret:
                    available_cameras.append(i)
                cap.release()
        return available_cameras

    @staticmethod
    def initialize_camera(camera_id, resolution=(1920, 1080)):
        """Initialize camera with optimal settings"""
        cap = cv2.VideoCapture(camera_id)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, resolution[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, resolution[1])
            cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)

            # Allow camera to warm up
            for _ in range(5):
                cap.read()

            return cap
        return None

    @staticmethod
    def capture_image(cap):
        """Capture high-quality image"""
        if cap and cap.isOpened():
            ret, frame = cap.read()
            if ret:
                return frame
        return None

class FolderManager:
    """Manages hierarchical folder structure for products"""

    @staticmethod
    def create_product_path(category, subcategory, brand, product_name, session_id, base_dir="captures"):
        """Create hierarchical folder structure"""
        # Build path: captures/session/category/subcategory/brand/product_name
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
    def get_folder_stats(base_dir="captures"):
        """Get statistics about all captured folders"""
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
        """Save image in PNG format"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"cam{camera_id}_{capture_num:04d}_{timestamp}.png"
        filepath = product_path / filename

        # Save as PNG for lossless quality
        cv2.imwrite(str(filepath), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])

        return str(filepath)

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

def calculate_intervals(rotation_speed, images_per_rev):
    """Calculate capture interval based on rotation speed"""
    interval = rotation_speed / images_per_rev
    return round(interval, 3)

def capture_tab():
    """Main capture interface"""
    st.title("📸 Capture Images")

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
                    path_preview = f"📁 captures/\n└── 📁 {st.session_state.session_id}/"
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
        # Show current product info
        st.success(f"✅ Capturing: **{st.session_state.current_category_info['product_name']}**")

        col1, col2, col3 = st.columns([2, 2, 1])
        with col1:
            st.info(f"📁 Output: `{st.session_state.current_product_path}`")
        with col2:
            st.metric("Images Captured", st.session_state.capture_count)
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

            preset_name = st.session_state.get('preset_name', 'Medium (72 imgs/rev)')
            preset = SPEED_PRESETS[preset_name]
            rotation_speed = st.session_state.get('rotation_speed', 30.0)

            st.metric("Images This Session", st.session_state.capture_count)
            st.metric("Total Expected", f"{preset['images_per_rev']} per 360°")
            st.metric("Time for 360°", f"{rotation_speed:.1f}s")

            progress = min(st.session_state.capture_count / preset['images_per_rev'], 1.0)
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

        if stop_button:
            st.session_state.capturing = False

        # Camera Preview and Capture Loop
        cameras = {}

        # Initialize cameras
        for cam_id in selected_cameras:
            if cam_id not in st.session_state.cameras:
                res = st.session_state.get('resolution', (1920, 1080))
                cap = CameraManager.initialize_camera(cam_id, res)
                if cap:
                    cameras[cam_id] = cap
                    st.session_state.cameras[cam_id] = cap
            else:
                cameras[cam_id] = st.session_state.cameras[cam_id]

        # Update preview
        if cameras:
            frames = {}
            for cam_id, cap in cameras.items():
                frame = CameraManager.capture_image(cap)
                if frame is not None:
                    frames[cam_id] = frame

            # Display previews
            if num_cameras == 1 and frames:
                frame = list(frames.values())[0]
                preview_placeholder.image(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
                    caption=f"Camera {selected_cameras[0]}",
                    use_column_width=True
                )
            elif num_cameras > 1:
                for idx, cam_id in enumerate(selected_cameras):
                    if cam_id in frames:
                        preview_placeholders[idx].image(
                            cv2.cvtColor(frames[cam_id], cv2.COLOR_BGR2RGB),
                            caption=f"Camera {cam_id}",
                            use_column_width=True
                        )

            # Capture images if capturing is active
            if st.session_state.capturing:
                final_interval = st.session_state.get('final_interval', 0.5)
                time.sleep(final_interval)

                image_paths = []
                for cam_id, frame in frames.items():
                    filepath = ImageProcessor.save_image(
                        frame,
                        st.session_state.current_product_path,
                        cam_id,
                        st.session_state.capture_count
                    )
                    image_paths.append(filepath)

                st.session_state.capture_count += 1

                # Save metadata periodically
                if st.session_state.capture_count % 10 == 0:
                    settings = {
                        "preset": preset_name,
                        "rotation_speed": rotation_speed,
                        "capture_interval": final_interval,
                        "cameras": selected_cameras,
                        "resolution": st.session_state.get('resolution_name', '1920x1080'),
                    }
                    ImageProcessor.save_metadata(
                        st.session_state.current_product_path,
                        settings,
                        image_paths,
                        st.session_state.current_category_info
                    )

                st.rerun()

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
        if st.button("🔍 Detect Cameras", use_container_width=True):
            with st.spinner("Detecting cameras..."):
                available = CameraManager.detect_cameras()
                if available:
                    st.success(f"Found {len(available)} camera(s): {available}")
                    st.session_state.available_cameras = available
                else:
                    st.error("No cameras detected!")

        num_cameras = st.selectbox(
            "Number of Cameras",
            options=[1, 2, 3],
            help="Select how many cameras to use simultaneously"
        )
        st.session_state.num_cameras = num_cameras

        selected_cameras = []
        for i in range(num_cameras):
            cam_id = st.number_input(
                f"Camera {i+1} ID",
                min_value=0,
                max_value=10,
                value=i,
                key=f"cam_{i}"
            )
            selected_cameras.append(cam_id)
        st.session_state.selected_cameras = selected_cameras

        st.divider()

        # Turntable Settings
        st.subheader("🔄 Turntable Settings")
        rotation_speed = st.slider(
            "Rotation Speed (sec/revolution)",
            min_value=20.0,
            max_value=40.0,
            value=30.0,
            step=0.5,
            help="How long it takes for one complete rotation"
        )
        st.session_state.rotation_speed = rotation_speed

        st.divider()

        # Capture Settings
        st.subheader("📸 Capture Settings")
        preset_name = st.selectbox(
            "Capture Speed Preset",
            options=list(SPEED_PRESETS.keys()),
            index=2  # Default to Medium
        )
        st.session_state.preset_name = preset_name

        preset = SPEED_PRESETS[preset_name]

        st.info(f"""
        **{preset_name}**
        - Images per revolution: {preset['images_per_rev']}
        - Angle between shots: {preset['angle_step']}°
        - Calculated interval: {calculate_intervals(rotation_speed, preset['images_per_rev'])}s
        """)

        # Manual adjustment
        st.subheader("🎛️ Fine-tune Interval")
        col1, col2 = st.columns(2)

        if 'interval_adjustment' not in st.session_state:
            st.session_state.interval_adjustment = 0

        with col1:
            if st.button("➖ Slower", use_container_width=True):
                st.session_state.interval_adjustment += 0.05

        with col2:
            if st.button("➕ Faster", use_container_width=True):
                st.session_state.interval_adjustment -= 0.05

        base_interval = calculate_intervals(rotation_speed, preset['images_per_rev'])
        final_interval = max(0.1, base_interval + st.session_state.interval_adjustment)
        st.session_state.final_interval = final_interval

        st.metric(
            "Final Capture Interval",
            f"{final_interval:.3f}s",
            delta=f"{st.session_state.interval_adjustment:+.3f}s"
        )

        if st.button("🔄 Reset", use_container_width=True):
            st.session_state.interval_adjustment = 0
            st.rerun()

        st.divider()

        # Image Quality
        st.subheader("🎨 Image Quality")
        resolution_name = st.selectbox(
            "Resolution",
            options=["1920x1080 (Full HD)", "1280x720 (HD)", "3840x2160 (4K)"],
            index=0
        )
        st.session_state.resolution_name = resolution_name

        resolution_map = {
            "1920x1080 (Full HD)": (1920, 1080),
            "1280x720 (HD)": (1280, 720),
            "3840x2160 (4K)": (3840, 2160)
        }
        st.session_state.resolution = resolution_map[resolution_name]

        st.divider()

        # Session Info
        st.subheader("📊 Session Info")
        st.info(f"**Session ID:** {st.session_state.session_id}")

        if st.button("🔄 New Session", use_container_width=True):
            st.session_state.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
            st.session_state.product_configured = False
            st.session_state.capture_count = 0
            st.session_state.capturing = False
            for cam_id, cap in st.session_state.cameras.items():
                if cap:
                    cap.release()
            st.session_state.cameras = {}
            st.success("✅ New session started!")
            st.rerun()

def main():
    """Main application"""

    # Sidebar configuration
    sidebar_config()

    # Main tabs
    tab1, tab2 = st.tabs(["📸 Capture", "📂 Review"])

    with tab1:
        capture_tab()

    with tab2:
        review_tab()

    # Footer
    st.divider()
    st.markdown("""
    <div style='text-align: center; color: gray; font-size: 0.8em;'>
        360° Product Capture System v1.0.0 | Production Ready | Made for AI Training
    </div>
    """, unsafe_allow_html=True)

if __name__ == "__main__":
    main()