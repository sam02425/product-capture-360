# Installation Guide

Complete installation instructions for the 360° Product Capture System across all platforms.

## 📑 Table of Contents

- [Quick Install (Recommended)](#quick-install-recommended)
- [Method 1: UV Package Manager](#method-1-uv-package-manager-fastest)
- [Method 2: Traditional pip](#method-2-traditional-pip)
- [Method 3: Make Commands](#method-3-make-commands-linux-mac)
- [Platform-Specific Instructions](#platform-specific-instructions)
- [Troubleshooting](#troubleshooting)

---

## Quick Install (Recommended)

### Linux / macOS
```bash
chmod +x quickstart.sh
./quickstart.sh
```

### Windows
```batch
quickstart.bat
```

These scripts will:
1. ✅ Check Python version
2. ✅ Offer to install UV (10-100x faster)
3. ✅ Create virtual environment
4. ✅ Install all dependencies
5. ✅ Detect cameras
6. ✅ Launch the application

---

## Method 1: UV Package Manager (Fastest)

**UV is the modern, fast Python package installer - 10 to 100x faster than pip!**

### Step 1: Install UV

#### Linux / macOS
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### Windows (PowerShell)
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### Alternative: Install via pip
```bash
pip install uv
```

### Step 2: Install Project

```bash
# Clone or download the project
cd product-capture-360

# Install dependencies (automatic virtual environment creation)
uv sync

# Run the application
uv run streamlit run app.py
```

### UV Quick Commands

```bash
# Install optional features
uv sync --extra enhanced        # AI features
uv sync --extra cloud           # Cloud storage
uv sync --extra all             # Everything

# Add new packages
uv add opencv-contrib-python

# Update all packages
uv sync --upgrade

# Use specific Python version
uv python install 3.11
uv venv --python 3.11
```

---

## Method 2: Traditional pip

### Step 1: Create Virtual Environment

#### Linux / macOS
```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### Windows
```batch
python -m venv .venv
.venv\Scripts\activate.bat
```

### Step 2: Install Dependencies

```bash
# Install from pyproject.toml
pip install -e .

# Or install optional features
pip install -e ".[enhanced]"    # AI features
pip install -e ".[cloud]"       # Cloud storage
pip install -e ".[all]"         # Everything
```

### Step 3: Run Application

```bash
streamlit run app.py
```

---

## Method 3: Make Commands (Linux / Mac)

If you have `make` installed:

```bash
# One command install and run
make quickstart

# Or step by step
make install          # Auto-detect UV or pip
make run              # Start application

# With specific package manager
make install-uv       # Force UV installation
make install-pip      # Force pip installation

# Install with features
make install-enhanced # With AI features
make install-all      # With everything
```

View all commands:
```bash
make help
```

---

## Platform-Specific Instructions

### Ubuntu / Debian Linux

```bash
# Update system
sudo apt update

# Install Python and dependencies
sudo apt install python3 python3-venv python3-pip

# Install USB camera libraries
sudo apt install libusb-1.0-0 v4l-utils

# Add user to video group (for camera access)
sudo usermod -a -G video $USER
# Log out and back in for this to take effect

# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install project
uv sync

# Run application
uv run streamlit run app.py
```

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.11

# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install project
uv sync

# Run application
uv run streamlit run app.py
```

### Windows

```batch
REM 1. Download and install Python from:
REM    https://www.python.org/downloads/
REM    ⚠️ IMPORTANT: Check "Add Python to PATH" during installation

REM 2. Open Command Prompt or PowerShell

REM 3. Install UV
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

REM 4. Restart Command Prompt/PowerShell

REM 5. Navigate to project directory
cd product-capture-360

REM 6. Install dependencies
uv sync

REM 7. Run application
uv run streamlit run app.py
```

### Raspberry Pi

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip

# Install camera dependencies
sudo apt install python3-opencv v4l-utils

# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Enable camera
sudo raspi-config
# Navigate to: Interfacing Options -> Camera -> Enable

# Install project
uv sync

# Run application
uv run streamlit run app.py --server.address 0.0.0.0
```

---

## Docker Installation

### Build Image

```bash
docker build -t product-capture:latest .
```

### Run Container

#### Linux
```bash
docker run -p 8501:8501 \
  --device=/dev/video0 \
  --device=/dev/video1 \
  --device=/dev/video2 \
  -v $(pwd)/captures:/app/captures \
  product-capture:latest
```

#### Windows (PowerShell)
```powershell
docker run -p 8501:8501 `
  -v ${PWD}/captures:/app/captures `
  product-capture:latest
```

**Note**: Camera passthrough to Docker containers on Windows requires WSL2 and may have limitations.

---

## Verification

After installation, verify everything works:

### 1. Check Python Version
```bash
python --version  # Should be 3.8+
```

### 2. Check UV Installation (if using UV)
```bash
uv --version
```

### 3. Check Installed Packages
```bash
# With UV
uv pip list

# With pip
pip list
```

Expected packages:
- streamlit (>=1.31.0)
- opencv-python (>=4.9.0)
- numpy (>=1.26.4)
- pillow (>=10.2.0)

### 4. Test Camera Access

```python
python -c "import cv2; cap = cv2.VideoCapture(0); print('Camera 0:', cap.isOpened()); cap.release()"
```

Should output: `Camera 0: True`

### 5. Launch Application

```bash
# With UV
uv run streamlit run app.py

# With pip (activate venv first)
streamlit run app.py
```

Application should open at: `http://localhost:8501`

---

## Troubleshooting

### Python Not Found

**Linux/Mac:**
```bash
# Install Python
sudo apt install python3 python3-venv  # Ubuntu/Debian
brew install python@3.11                # macOS
```

**Windows:**
- Download from https://www.python.org/downloads/
- **Important**: Check "Add Python to PATH" during installation
- Restart Command Prompt after installation

### UV Not in PATH

**Linux/Mac:**
```bash
# Add to PATH manually
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Windows:**
```batch
REM UV installer should add to PATH automatically
REM If not, restart Command Prompt/PowerShell
REM Or add manually: %USERPROFILE%\.cargo\bin
```

### Camera Not Detected

**Linux:**
```bash
# Check camera devices
ls /dev/video*

# Test camera
ffplay /dev/video0

# Add user to video group
sudo usermod -a -G video $USER
# Log out and log back in
```

**Windows:**
```batch
REM Check Device Manager for camera
REM Update camera drivers if needed
REM Disable camera access restrictions in Windows Privacy settings
```

**macOS:**
```bash
# Grant camera permissions
# System Preferences -> Security & Privacy -> Camera
# Enable for Terminal or your IDE
```

### Virtual Environment Issues

```bash
# Remove existing environment
rm -rf .venv venv

# Recreate
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate.bat # Windows

# Reinstall
pip install -e .
```

### Streamlit Won't Start

```bash
# Clear Streamlit cache
streamlit cache clear

# Try different port
uv run streamlit run app.py --server.port 8502

# Check if port is already in use
netstat -an | grep 8501  # Linux/Mac
netstat -an | findstr 8501  # Windows
```

### OpenCV Installation Issues

```bash
# Remove opencv-python
pip uninstall opencv-python opencv-contrib-python

# Reinstall
pip install opencv-python==4.9.0.80

# If still failing, try headless version
pip install opencv-python-headless
```

### Permission Errors

**Linux:**
```bash
# Fix ownership
sudo chown -R $USER:$USER .

# Fix permissions
chmod -R u+rw .
```

**Windows:**
- Run Command Prompt as Administrator
- Or check antivirus isn't blocking Python

---

## Uninstallation

### Remove Project

```bash
# With UV
rm -rf .venv uv.lock

# With pip
rm -rf .venv

# Remove project
rm -rf product-capture-360
```

### Uninstall UV

```bash
# Linux/Mac
rm -rf ~/.cargo/bin/uv

# Windows
# Remove from: %USERPROFILE%\.cargo\bin\uv.exe
```

---

## Next Steps

After successful installation:

1. **Configure cameras**: Click "Detect Cameras" in the app
2. **Set turntable speed**: Match your actual hardware
3. **Choose capture preset**: Start with "Medium (72 imgs/rev)"
4. **Read the README**: For complete usage instructions
5. **Run a test capture**: Try with a sample product

---

## Support

If you encounter issues not covered here:

1. Check the main [README.md](README.md)
2. Review [Configuration](config.py) options
3. Enable debug mode: `uv run streamlit run app.py --logger.level=debug`
4. Open an issue on GitHub with:
   - OS and version
   - Python version
   - UV version (if using)
   - Error messages
   - Steps to reproduce

---

**Last Updated**: January 2025
**Compatibility**: Python 3.8+ | Windows 10+ | Ubuntu 20.04+ | macOS 12+