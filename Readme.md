# 360° Product Capture System - Production Ready

## 🚀 Quick Start

### Option 1: Easy Run (Recommended)
```bash
python3 run_app.py
```
This will automatically check dependencies and start the app.

### Option 2: Manual Run
```bash
# Install dependencies
pip3 install -r requirements_fixed.txt

# Run the app
python3 lightweight_capture_app_fixed.py
```

## 📸 Key Features Fixed

### ✅ Storage Selection
- **Fixed**: Now properly saves images to selected storage device
- Storage devices are automatically detected
- Creates "360Photo_Captures" folder in selected storage
- Shows current storage path in UI

### ✅ Session Status Updates
- **Fixed**: Real-time updates for capture sessions
- Live capture counter updates every second
- Shows elapsed time and remaining time
- Auto-stops when duration is reached

### ✅ Camera Management
- Automatic camera detection (excludes FaceTime on macOS)
- Proper camera initialization with error handling
- Live preview with optimized frame rate
- Thread-safe camera operations

### ✅ Folder Management
- Browse folders in selected storage
- Create new folders for organization
- Shows image files with file sizes
- Real-time folder content updates

## 🖥️ System Requirements

- Python 3.7 or higher
- USB webcam connected
- macOS, Windows, or Linux
- 4GB RAM minimum
- 10GB free storage space

## 📱 How to Use

### 1. Start the Application
```bash
python3 run_app.py
```

### 2. Access in Browser
Open your web browser and go to:
- http://localhost:5000
- Or: http://127.0.0.1:5000

### 3. Select Storage Device
1. Click "Refresh Storage" to see available drives
2. Select your preferred storage from dropdown
3. The app will create "360Photo_Captures" folder there

### 4. Connect Camera
1. Click "Scan Cameras" to detect available cameras
2. Select your camera from the dropdown
3. Click "Connect Camera"
4. You should see live preview immediately

### 5. Manual Capture
- Click the large "CAPTURE IMAGE" button
- Image is saved to selected storage location

### 6. Automated Session
1. Select capture rate (12-60 per minute)
2. Optionally set duration (1-60 minutes)
3. Click "Start Session"
4. Watch real-time status updates:
   - Active/Inactive status
   - Capture count
   - Elapsed time
   - Remaining time (if duration set)
5. Click "Stop Session" or wait for auto-stop

## 🔧 Troubleshooting

### Camera Not Working
```bash
# Test camera manually
python3 -c "import cv2; print(cv2.VideoCapture(0).isOpened())"
```

### Permission Errors on macOS
- Go to System Preferences → Security & Privacy → Camera
- Allow Terminal/Python access to camera

### Storage Not Saving Correctly
- Ensure selected storage has write permissions
- Check free space on selected drive
- Try selecting a different storage location

### Session Status Not Updating
- Check browser console for errors (F12)
- Ensure JavaScript is enabled
- Try refreshing the page

## 📁 File Structure

```
360Photo/
├── lightweight_capture_app_fixed.py  # Main application
├── requirements_fixed.txt            # Dependencies
├── run_app.py                        # Startup script
├── README_FIXED.md                   # This file
└── 360Photo_Captures/               # Created in selected storage
    └── capture_0001_timestamp.jpg   # Captured images
```

## 🛠️ Advanced Configuration

### Change Default Port
Edit `lightweight_capture_app_fixed.py`:
```python
app.run(host='0.0.0.0', port=5000, ...)  # Change 5000 to desired port
```

### Network Access
To access from other devices on network:
```python
app.run(host='0.0.0.0', ...)  # Already set for network access
```

### Camera Settings
Adjust in `initialize_camera()` method:
```python
self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)   # Resolution
self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
self.camera.set(cv2.CAP_PROP_FPS, 30)             # Frame rate
```

## 📊 Performance

- Live preview: 15 FPS (optimized for performance)
- Capture quality: 95% JPEG compression
- Session captures: Up to 60 per minute
- Storage detection: Instant
- Status updates: Every 1 second

## 🐛 Debug Mode

To enable debug logging:
```python
# In lightweight_capture_app_fixed.py
logging.basicConfig(level=logging.DEBUG)  # Change INFO to DEBUG
```

## 💡 Tips

1. **For best results**: Use good lighting and stable USB connection
2. **Storage**: Select external drive for large capture sessions
3. **Organization**: Create folders for different products
4. **Performance**: Close other camera apps before starting
5. **Quality**: Images are saved at 1920x1080 resolution

## 🆘 Support

If issues persist after trying troubleshooting steps:

1. Check console output in terminal
2. Check browser console (F12) for JavaScript errors
3. Verify all dependencies are installed
4. Ensure camera works in other applications
5. Try a different browser (Chrome/Firefox recommended)

## ✨ What's Fixed

- ✅ Storage selection now properly saves to selected location
- ✅ Session status updates in real-time
- ✅ Camera initialization improved for macOS
- ✅ Thread-safe operations prevent crashes
- ✅ Proper cleanup on exit
- ✅ Better error handling throughout
- ✅ Folder browsing shows actual captured images
- ✅ Auto-stop when session duration reached
- ✅ Live preview optimization
- ✅ Cross-platform compatibility

## 📝 License

MIT License - Free for commercial use

---
**Version**: 2.0.0 (Production Ready)
**Last Updated**: January 2025
**Status**: ✅ All Major Issues Fixed