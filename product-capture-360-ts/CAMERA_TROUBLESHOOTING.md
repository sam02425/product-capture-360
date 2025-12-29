# USB Camera Connection Troubleshooting Guide

## Problem
USB Camera not connecting when clicking "Connect Camera" button in Image Collector.

## Your System Info
- **USB Camera**: UVC Camera (VendorID_3141 ProductID_25451)
- **Built-in**: FaceTime HD Camera
- **Platform**: macOS
- **Server**: Running on port 5002
- **FFmpeg**: Detecting cameras correctly

## Step-by-Step Solutions

### Solution 1: Grant macOS Camera Permissions ⭐ (Most Common Fix)

1. **Open System Settings**
   - Click Apple menu → **System Settings** (or System Preferences on older macOS)

2. **Navigate to Privacy & Security**
   - Click **Privacy & Security** in sidebar
   - Scroll down to **Camera**

3. **Grant Terminal Access**
   - Look for **Terminal** in the list
   - **Enable** the toggle next to Terminal
   - If Terminal isn't listed, you may need to trigger the permission request first

4. **Alternative: Grant Access to Node**
   - If you see **Node** or **node** in the list, enable it as well

5. **Restart the Server**
   ```bash
   # Stop current server (Ctrl+C)
   # Then restart
   npm run start
   ```

### Solution 2: Test with Built-in Camera First

Sometimes the USB camera has specific driver issues. Test with FaceTime camera first:

1. Open `http://localhost:5002/image-collector.html`
2. In **Capture** tab, select **Camera**: `1: FaceTime HD Camera`
3. Click **🔌 Connect**
4. Check if preview appears

If FaceTime works but USB doesn't, it's a USB camera driver issue.

### Solution 3: Check USB Camera Driver

1. **Verify Camera Detection**:
   ```bash
   system_profiler SPCameraDataType
   ```
   Should show: `USB Camera: UVC Camera VendorID_3141 ProductID_25451`

2. **Test with QuickTime** (simplest test):
   - Open **QuickTime Player**
   - File → **New Movie Recording**
   - Click dropdown next to record button
   - Select **USB Camera**
   - If this doesn't work, the camera has a hardware/driver issue

3. **Test with FFmpeg directly**:
   ```bash
   ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -A 5 "video devices"
   ```
   Should list: `[0] USB Camera`

### Solution 4: Reset Camera Connections

1. **Unplug and Replug USB Camera**
   - Disconnect USB camera
   - Wait 5 seconds
   - Reconnect to a different USB port
   - Restart server

2. **Kill Any Processes Using Camera**:
   ```bash
   sudo killall VDCAssistant
   sudo killall AppleCameraAssistant
   ```

3. **Restart Core Media Services** (if nothing else works):
   ```bash
   sudo killall coreaudiod
   ```

### Solution 5: Use Different Camera Index

The app scans for cameras and assigns indices. Try each camera manually:

1. Open browser console (F12 or Cmd+Option+I)
2. Go to Console tab
3. Try each camera index:
   ```javascript
   // Try camera 0 (USB Camera)
   fetch('http://localhost:5002/api/camera/init', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({camera_index: 0})
   }).then(r => r.json()).then(console.log)

   // Try camera 1 (FaceTime)
   fetch('http://localhost:5002/api/camera/init', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({camera_index: 1})
   }).then(r => r.json()).then(console.log)
   ```

4. Check response for success or error messages

### Solution 6: Check Server Logs for Detailed Errors

When you click "Connect Camera", check the terminal where server is running. Look for error messages like:

- `Error opening video device`
- `Permission denied`
- `Device busy`
- `Input/output error`

Copy the exact error message for better diagnosis.

### Solution 7: Test Camera with Simple Script

Create a test file to isolate the issue:

```bash
# test_camera.sh
ffmpeg -f avfoundation -framerate 30 -video_size 640x480 -i "0" \
  -frames:v 1 -y /tmp/test_frame.jpg

# Check if frame captured
ls -lh /tmp/test_frame.jpg
open /tmp/test_frame.jpg  # Opens in Preview
```

Run:
```bash
chmod +x test_camera.sh
./test_camera.sh
```

If this works, the camera is fine and the issue is in the Node.js code.

## Debugging Checklist

- [ ] Camera appears in System Settings → Privacy & Security → Camera
- [ ] Terminal/Node has camera permission enabled
- [ ] Camera works in QuickTime Player
- [ ] FFmpeg can list the camera (`ffmpeg -f avfoundation -list_devices true -i ""`)
- [ ] No other app is using the camera (check Activity Monitor)
- [ ] USB cable is good (try different cable/port)
- [ ] Camera LED turns on when connecting
- [ ] Server logs don't show "permission denied"

## Common Error Messages & Fixes

### Error: "Input/output error"
**Cause**: Camera permission denied or camera busy
**Fix**: Grant camera permissions in System Settings, restart server

### Error: "Device busy"
**Cause**: Another app is using the camera
**Fix**: Close all camera apps (Zoom, Skype, QuickTime), run `sudo killall VDCAssistant`

### Error: "No such device"
**Cause**: Wrong camera index or camera unplugged
**Fix**: Run camera scan, check USB connection, try different index

### Error: "Permission denied"
**Cause**: macOS camera permissions not granted
**Fix**: System Settings → Privacy & Security → Camera → Enable Terminal

## Advanced: Check Camera Backend Code

If all else fails, check the camera initialization code:

```bash
# View camera.ts source
cat src/camera.ts | grep -A 30 "async init"
```

The code should use `-f avfoundation` for macOS and proper video size settings.

## Still Not Working?

If you've tried everything above:

1. **Try the old 360° Product Capture interface**:
   ```
   http://localhost:5002/index.html
   ```
   This uses a simpler camera connection method.

2. **Check if it's a UVC driver issue**:
   Some USB cameras require specific UVC drivers. Check manufacturer's website.

3. **Test on different macOS version**:
   Camera APIs changed between macOS versions. Check macOS compatibility.

4. **Use iPhone Continuity Camera**:
   Your iPhone is detected as `[2] saumil's iPhone Camera`. Try that as alternative:
   - Select camera index 2
   - Make sure iPhone and Mac are on same WiFi
   - iPhone should show camera continuity prompt

## Quick Test Commands

```bash
# List all cameras
ffmpeg -f avfoundation -list_devices true -i "" 2>&1

# Test USB Camera (index 0)
ffmpeg -f avfoundation -i "0" -frames:v 1 -y /tmp/test.jpg && open /tmp/test.jpg

# Test FaceTime Camera (index 1)
ffmpeg -f avfoundation -i "1" -frames:v 1 -y /tmp/test.jpg && open /tmp/test.jpg

# Check camera processes
ps aux | grep -i camera

# Kill camera services
sudo killall VDCAssistant AppleCameraAssistant
```

## Success Indicators

When camera connects successfully, you should see:
- ✅ Green "🟢 Connected" badge in header
- ✅ Live video preview in the capture tab
- ✅ Camera LED turns on (if camera has LED)
- ✅ Server logs show "Camera initialized successfully"
- ✅ Frame rate updates in preview

## Next Steps After Connection

Once connected:
1. Select storage location
2. Set product name
3. Click "📸 Capture" for single image
4. Or set rate and click "▶️ Start" for automated session

---

**Still having issues?** Share:
1. Exact error message from server logs
2. Browser console errors (F12 → Console)
3. Result of camera test commands above
4. macOS version (`sw_vers`)
