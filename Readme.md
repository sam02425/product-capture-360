# 360° Product Image Capture System

> **Production-grade image capture for AI model training** | YOLOv11 | DOLG | DEIM | CVAT | Roboflow

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![UV](https://img.shields.io/badge/package%20manager-UV-yellow)](https://github.com/astral-sh/uv)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Professional image capture system for 360° product photography, optimized for training computer vision models. Supports 1-3 USB cameras with automated capture synchronized to rotating turntables.

## ✨ Features

- 🎥 **Multi-camera support** - Capture with 1-3 cameras simultaneously
- ⚡ **Smart capture presets** - 5 speed options from 24 to 180 images/revolution
- 🎛️ **Fine-tune controls** - Manual ±0.05s interval adjustment
- 📸 **High quality** - PNG lossless output, 1080p/4K support
- 🔄 **Turntable sync** - Auto-calculated intervals for 20-40 sec/rev rotation
- 📊 **Real-time preview** - Live feed from all cameras
- 💾 **Auto-metadata** - JSON export with complete capture settings
- 🎯 **Training-ready** - Optimized for YOLOv11, DOLG, DEIM models

## 🚀 Quick Start (1 Minute Setup)

### Automated Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd product-capture-360

# Run the launcher (auto-installs everything)
python launch.py
```

The launcher will:
1. ✅ Check Python version
2. ✅ Install UV (if not present)
3. ✅ Create virtual environment
4. ✅ Install all dependencies
5. ✅ Detect cameras
6. ✅ Launch the application

### Manual Installation with UV (Recommended)

**UV is 10-100x faster than pip!**

```bash
# 1. Install UV package manager
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows PowerShell:
# powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 2. Create virtual environment and install dependencies
uv sync

# 3. Run the application
uv run streamlit run app.py
```

### Traditional pip Installation

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -e .

# 3. Run the application
streamlit run app.py
```

## 📋 Hardware Requirements

### Recommended Setup
- **Cameras**: XPCAM Model N5 Webcam 1080P HD (1-3 units)
- **Turntable**: 360° rotating platform (20-40 sec/revolution)
- **Computer**:
  - CPU: Intel i5/AMD Ryzen 5 or better
  - RAM: 8GB minimum, 16GB recommended
  - USB: 3.0 ports for each camera
  - Storage: 10GB+ free space per session
- **OS**: Windows 10/11, Linux (Ubuntu 20.04+), macOS 12+

### Camera Compatibility
Works with most USB webcams, but optimized for:
- XPCAM Model N5 1080P
- Logitech C920/C922
- Any UVC-compatible USB camera

## 🎮 Usage Guide

### 1. Basic Workflow

```
Connect Cameras → Configure Settings → Start Capture → Export Images
```

### 2. Capture Speed Presets

Choose based on your use case:

| Preset | Images/Rev | Angle Step | Use Case |
|--------|-----------|------------|----------|
| **Ultra Fast** | 24 | 15° | Quick preview/testing |
| **Fast** | 36 | 10° | E-commerce photography |
| **Medium** ⭐ | 72 | 5° | YOLOv11 training (recommended) |
| **Detailed** | 120 | 3° | DOLG/DEIM embeddings |
| **Ultra Detailed** | 180 | 2° | Research/maximum coverage |

### 3. Recommendations by Model Type

**YOLOv11 Object Detection:**
- Preset: Medium or Detailed (72-120 images)
- Format: PNG (lossless)
- Cameras: 1-2 (front + top view)

**DOLG/DEIM Feature Embeddings:**
- Preset: Detailed or Ultra Detailed (120-180 images)
- Format: PNG
- Cameras: 2-3 (multiple angles)

**CVAT/Roboflow Annotation:**
- Preset: Fast or Medium (36-72 images)
- Format: PNG or JPEG
- Cameras: 1-2

### 4. Multi-Camera Positioning

**Single Camera:**
- Position at product center height, directly facing

**Dual Cameras:**
- Camera 0: Front-center view
- Camera 1: Top-down 45° angle

**Triple Cameras:**
- Camera 0: Top-down 45° angle
- Camera 1: Front-center view
- Camera 2: Bottom-up 30° angle

## 📁 Output Structure

```
captures/
└── 20250115_143022/              # Session timestamp
    └── product_widget_001/        # Product name/ID
        ├── cam0_0001_20250115_143025_123.png
        ├── cam0_0002_20250115_143025_540.png
        ├── cam1_0001_20250115_143025_123.png
        ├── cam1_0002_20250115_143025_540.png
        └── metadata.json          # Capture settings & image list
```

### Metadata Structure

```json
{
  "session_id": "20250115_143022",
  "product_name": "widget_001",
  "capture_timestamp": "2025-01-15T14:30:22",
  "settings": {
    "preset": "Medium (72 imgs/rev)",
    "rotation_speed": 30.0,
    "capture_interval": 0.417,
    "cameras": [0, 1],
    "resolution": "1920x1080",
    "format": "PNG (Lossless)"
  },
  "total_images": 144,
  "image_files": ["cam0_0001_...", "cam1_0001_...", ...]
}
```

## 🔧 Advanced Usage

### Install Optional Features

```bash
# Background removal capability
uv sync --extra enhanced

# Cloud storage support (AWS, GCP, Azure)
uv sync --extra cloud

# All features
uv sync --extra all
```

### UV Quick Commands

```bash
# Start application
uv run streamlit run app.py

# Add new package
uv add <package-name>

# Update all packages
uv sync --upgrade

# Run with different Python version
uv python install 3.11
uv venv --python 3.11

# Remove package
uv remove <package-name>

# Show installed packages
uv pip list
```

### Configuration

Edit `config.py` for advanced settings:
- Camera parameters (exposure, focus, etc.)
- Custom capture presets
- Image enhancement options
- Cloud storage integration
- Performance tuning

## 🎨 Image Quality Optimization

### Lighting Setup
1. Use soft, diffused lighting
2. Position lights at 45° angles
3. Avoid harsh shadows
4. Color temperature: 5000-6500K (daylight)

### Camera Settings
1. Let cameras warm up for 30 seconds
2. Use auto-focus mode
3. Clean lenses before capture
4. Keep cameras stable (use tripods)

### Background
1. **White background**: Best for most products
2. **Green screen**: For easy background removal
3. **Gradient background**: For premium look
4. Keep background consistent across captures

## 📊 Performance Benchmarks

### Capture Speed
- **Single camera**: 0.1-2 seconds per frame
- **Triple cameras**: Simultaneous capture (same timing)
- **Full 360° session**: 20-40 seconds (turntable dependent)

### Storage Requirements (per session)
| Preset | Images | PNG (~4MB each) | JPEG (~1MB each) |
|--------|--------|-----------------|------------------|
| Fast | 36 | 144 MB | 36 MB |
| Medium | 72 | 288 MB | 72 MB |
| Detailed | 120 | 480 MB | 120 MB |

*Multiply by number of cameras*

## 🔗 Integration Examples

### Export to CVAT

```bash
# 1. Capture images with app
# 2. Upload to CVAT
cd captures/[session_id]/[product_name]
# Upload all PNG files to CVAT project
```

### Export to Roboflow

```python
from roboflow import Roboflow

rf = Roboflow(api_key="YOUR_API_KEY")
project = rf.workspace().project("product-detection")

# Upload images from capture session
project.upload(
    image_path="captures/20250115_143022/product_001",
    batch_name="product_001_360"
)
```

### Train YOLOv11

```python
from ultralytics import YOLO

# After annotation in CVAT/Roboflow
model = YOLO('yolov11n.pt')
model.train(
    data='dataset.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0  # GPU
)
```

## 🐛 Troubleshooting

### Camera Not Detected

```bash
# Test camera access
python -c "import cv2; cap = cv2.VideoCapture(0); print(f'Camera 0: {cap.isOpened()}'); cap.release()"

# Linux: Add user to video group
sudo usermod -a -G video $USER
# Log out and back in

# Windows: Check Device Manager for camera drivers
```

### UV Installation Issues

```bash
# If UV install fails, use pip fallback
pip install uv

# Or use the app without UV
pip install -e .
streamlit run app.py
```

### Poor Image Quality

1. **Blurry images**: Increase capture interval (slower rotation)
2. **Dark images**: Improve lighting, adjust camera exposure
3. **Inconsistent colors**: Check white balance, use consistent lighting
4. **Motion blur**: Reduce turntable speed or increase interval

### Application Won't Start

```bash
# Clear cache and reinstall
rm -rf .venv uv.lock
uv sync

# Or with pip
rm -rf .venv
python -m venv .venv
pip install -e .
```

## 🚢 Deployment Options

### Local Production Server

```bash
# Run on custom port
uv run streamlit run app.py --server.port 8080

# Allow network access
uv run streamlit run app.py --server.address 0.0.0.0
```

### Systemd Service (Linux)

Create `/etc/systemd/system/product-capture.service`:

```ini
[Unit]
Description=360 Product Capture System
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/product-capture-360
ExecStart=/path/to/.venv/bin/streamlit run app.py --server.headless true
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable product-capture
sudo systemctl start product-capture
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

# Install UV
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app
COPY pyproject.toml .
COPY app.py config.py ./

RUN uv sync --no-dev

EXPOSE 8501
CMD ["uv", "run", "streamlit", "run", "app.py", "--server.address", "0.0.0.0"]
```

Build and run:
```bash
docker build -t product-capture .
docker run -p 8501:8501 --device=/dev/video0 product-capture
```

## 📚 Project Structure

```
product-capture-360/
├── app.py                 # Main Streamlit application
├── config.py              # Configuration settings
├── launch.py              # Easy launcher script
├── pyproject.toml         # Project dependencies (UV/pip)
├── .python-version        # Python version for UV
├── README.md              # This file
├── captures/              # Output directory (auto-created)
├── logs/                  # Application logs (auto-created)
└── backups/               # Backup storage (auto-created)
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `uv run pytest`
5. Format code: `uv run black .`
6. Submit a pull request

## 📝 Best Practices

### Session Management
- Start new session for each product type
- Use descriptive product IDs: `category_model_date`
- Backup captures regularly
- Keep metadata files for traceability

### Data Organization
```
project/
├── raw_captures/          # Original captures from app
├── annotated/             # After CVAT/Roboflow annotation
├── training_data/         # Prepared datasets
│   ├── train/
│   ├── val/
│   └── test/
└── models/                # Trained model checkpoints
```

### Quality Control Checklist
- [ ] Camera lenses are clean
- [ ] Lighting is consistent and adequate
- [ ] Background is clean and appropriate
- [ ] Turntable speed matches app settings
- [ ] First 10 images reviewed for quality
- [ ] Focus and exposure are correct
- [ ] Product is centered on turntable

## 🆘 Support

- **Documentation**: This README
- **Issues**: [GitHub Issues](https://github.com/yourorg/product-capture-360/issues)
- **UV Help**: https://github.com/astral-sh/uv
- **Streamlit Docs**: https://docs.streamlit.io/

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **UV** by Astral - Fast Python package installer
- **Streamlit** - Web framework for ML/AI apps
- **OpenCV** - Computer vision library
- **YOLOv11** by Ultralytics - Object detection
- **XPCAM** - Quality webcam hardware

---

**Version**: 1.0.0
**Last Updated**: January 2025
**Status**: Production Ready ✅

**Made with ❤️ for the computer vision community**