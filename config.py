"""
Advanced Configuration File for 360° Product Capture System
Edit these settings to customize behavior for your specific hardware and needs
"""

# ================================
# CAMERA SETTINGS
# ================================

# XPCAM Model N5 Optimal Settings
CAMERA_CONFIG = {
    "default_resolution": (1920, 1080),  # 1080p
    "max_resolution": (3840, 2160),      # 4K if supported
    "fps": 30,
    "autofocus": True,
    "auto_exposure": True,
    "warmup_frames": 5,                  # Frames to discard on startup
    "exposure_compensation": 0,           # -2 to +2
    "brightness": 128,                   # 0-255
    "contrast": 128,                     # 0-255
    "saturation": 128,                   # 0-255
    "sharpness": 128,                    # 0-255
}

# Multi-camera positioning guides
CAMERA_POSITIONS = {
    "single": {
        "cam0": {"height": "center", "angle": 0, "description": "Front-center view"}
    },
    "dual": {
        "cam0": {"height": "center", "angle": 0, "description": "Front-center view"},
        "cam1": {"height": "top", "angle": 45, "description": "Top-down 45° view"}
    },
    "triple": {
        "cam0": {"height": "top", "angle": 45, "description": "Top-down 45° view"},
        "cam1": {"height": "center", "angle": 0, "description": "Front-center view"},
        "cam2": {"height": "bottom", "angle": -30, "description": "Bottom-up 30° view"}
    }
}

# ================================
# TURNTABLE SETTINGS
# ================================

TURNTABLE_CONFIG = {
    "min_speed": 20.0,        # Minimum seconds per revolution
    "max_speed": 40.0,        # Maximum seconds per revolution
    "default_speed": 30.0,    # Default rotation speed
    "acceleration_time": 2.0,  # Time to reach full speed (seconds)
    "deceleration_time": 2.0,  # Time to stop (seconds)
}

# ================================
# CAPTURE PRESETS
# ================================

# Custom capture presets (add your own!)
CUSTOM_PRESETS = {
    "Quick Preview (12 imgs)": {
        "images_per_rev": 12,
        "angle_step": 30.0,
        "description": "Very fast preview, large angle steps"
    },
    "E-commerce Standard": {
        "images_per_rev": 48,
        "angle_step": 7.5,
        "description": "Ideal for online product listings"
    },
    "AI Training Optimal": {
        "images_per_rev": 90,
        "angle_step": 4.0,
        "description": "Balanced for most AI training tasks"
    },
    "Research Grade": {
        "images_per_rev": 360,
        "angle_step": 1.0,
        "description": "Maximum detail, 1° per image"
    },
}

# ================================
# IMAGE PROCESSING
# ================================

IMAGE_CONFIG = {
    # Output formats
    "formats": {
        "png": {
            "extension": ".png",
            "compression": 3,              # 0-9 (0=none, 9=max)
            "quality": 100,
            "lossless": True
        },
        "jpeg": {
            "extension": ".jpg",
            "quality": 95,                 # 0-100
            "optimize": True,
            "progressive": True
        },
        "webp": {  # Alternative format
            "extension": ".webp",
            "quality": 95,
            "lossless": False
        }
    },

    # Default format
    "default_format": "png",

    # Image enhancements (applied before saving)
    "auto_enhance": False,                # Auto-adjust brightness/contrast
    "denoise": False,                     # Apply noise reduction
    "sharpen": False,                     # Apply sharpening filter
    "background_removal": False,          # Remove background (requires rembg)
}

# ================================
# FILE MANAGEMENT
# ================================

FILE_CONFIG = {
    "base_directory": "captures",
    "organize_by_date": True,             # Create date folders
    "organize_by_product": True,          # Create product subfolders

    # Naming convention for images
    "filename_template": "cam{cam_id}_{seq:04d}_{timestamp}",

    # Metadata
    "save_metadata": True,
    "metadata_format": "json",            # json or yaml
    "include_thumbnails": False,          # Save thumbnail previews
    "thumbnail_size": (320, 240),

    # Backup
    "auto_backup": False,
    "backup_directory": "backups",
}

# ================================
# PERFORMANCE SETTINGS
# ================================

PERFORMANCE_CONFIG = {
    "thread_pool_size": 4,                # Parallel image processing threads
    "buffer_size": 10,                    # Image buffer for smoother capture
    "max_memory_usage": 2048,             # MB - limit memory usage
    "gpu_acceleration": False,            # Use GPU for processing (if available)
    "compression_threads": 2,             # Threads for image compression
}

# ================================
# UI CUSTOMIZATION
# ================================

UI_CONFIG = {
    "theme": "dark",                      # dark or light
    "preview_size": "large",              # small, medium, large
    "show_histogram": False,              # Show image histogram
    "show_grid_overlay": True,            # Grid on preview
    "show_fps_counter": True,             # Display capture FPS
    "language": "en",                     # en, es, fr, de, etc.
}

# ================================
# TRAINING PLATFORM INTEGRATION
# ================================

TRAINING_PLATFORMS = {
    "cvat": {
        "enabled": False,
        "api_url": "",
        "api_key": "",
        "auto_upload": False,
        "project_name": ""
    },
    "roboflow": {
        "enabled": False,
        "api_key": "",
        "workspace": "",
        "project": "",
        "auto_upload": False
    },
    "labelbox": {
        "enabled": False,
        "api_key": "",
        "dataset_id": "",
        "auto_upload": False
    }
}

# ================================
# ADVANCED FEATURES
# ================================

ADVANCED_CONFIG = {
    # HDR Capture
    "hdr_mode": False,
    "hdr_exposure_stops": [-1, 0, 1],     # Exposure bracketing

    # Focus Stacking
    "focus_stacking": False,
    "focus_steps": 5,

    # Time-lapse
    "timelapse_mode": False,
    "timelapse_interval": 5.0,            # Seconds

    # Batch Processing
    "batch_mode": False,
    "products_per_session": 1,
    "pause_between_products": 10.0,       # Seconds

    # Quality Control
    "auto_qc": False,                     # Automatic quality check
    "blur_threshold": 100.0,              # Reject blurry images
    "brightness_range": (50, 200),        # Acceptable brightness range
    "discard_bad_images": False,
}

# ================================
# HARDWARE SPECIFIC
# ================================

HARDWARE_PROFILES = {
    "xpcam_n5": {
        "name": "XPCAM Model N5",
        "resolution": (1920, 1080),
        "usb_version": "3.0",
        "optimal_lighting": "Soft diffused, 5000-6500K",
        "recommended_distance": "50-100cm from subject",
    },
    "logitech_c920": {
        "name": "Logitech C920",
        "resolution": (1920, 1080),
        "usb_version": "2.0",
        "optimal_lighting": "Bright, direct lighting",
        "recommended_distance": "40-80cm from subject",
    },
    # Add more camera profiles as needed
}

ACTIVE_CAMERA_PROFILE = "xpcam_n5"      # Change to your camera model

# ================================
# VALIDATION & SAFETY
# ================================

VALIDATION_CONFIG = {
    "check_disk_space": True,
    "min_free_space_gb": 5.0,             # Minimum free space required
    "max_session_duration": 3600,         # Maximum capture session (seconds)
    "max_images_per_session": 1000,       # Safety limit
    "confirm_before_overwrite": True,
}

# ================================
# LOGGING & DEBUGGING
# ================================

LOGGING_CONFIG = {
    "enable_logging": True,
    "log_level": "INFO",                  # DEBUG, INFO, WARNING, ERROR
    "log_file": "capture_system.log",
    "log_rotation": True,
    "max_log_size_mb": 10,
    "backup_count": 5,
}

# ================================
# HELPER FUNCTIONS
# ================================

def get_optimal_interval(rotation_speed, images_per_rev):
    """Calculate optimal capture interval"""
    return round(rotation_speed / images_per_rev, 3)

def get_camera_settings(profile_name=None):
    """Get camera settings for specific profile"""
    profile = profile_name or ACTIVE_CAMERA_PROFILE
    return HARDWARE_PROFILES.get(profile, HARDWARE_PROFILES["xpcam_n5"])

def validate_configuration():
    """Validate configuration settings"""
    errors = []

    if TURNTABLE_CONFIG["min_speed"] >= TURNTABLE_CONFIG["max_speed"]:
        errors.append("Turntable min_speed must be less than max_speed")

    if VALIDATION_CONFIG["min_free_space_gb"] < 1.0:
        errors.append("min_free_space_gb should be at least 1.0 GB")

    if PERFORMANCE_CONFIG["thread_pool_size"] < 1:
        errors.append("thread_pool_size must be at least 1")

    return errors

# Run validation on import
_validation_errors = validate_configuration()
if _validation_errors:
    print("⚠️  Configuration Warnings:")
    for error in _validation_errors:
        print(f"  - {error}")