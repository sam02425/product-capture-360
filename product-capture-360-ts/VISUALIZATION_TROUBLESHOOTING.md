# Visualization Tab - Troubleshooting Guide

## Common Issues and Solutions

### Issue: "Failed to load image"

**Possible Causes:**
1. Image file path is incorrect
2. Image file doesn't exist in dataset
3. File permissions issue
4. Browser CORS or security issue

**Solutions:**

#### 1. Verify Dataset Path
Check that the dataset path is correct:
```
/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100
```

**Test in Terminal:**
```bash
ls "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/images/train/"
```

Should show image files.

#### 2. Check File Permissions
```bash
# Make sure files are readable
chmod -R 755 "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100"
```

#### 3. Check Browser Console
Open browser DevTools (F12) and check Console tab for errors:
- Look for 404 errors (file not found)
- Look for CORS errors
- Look for network errors

#### 4. Test API Endpoint Directly
Test the read-file endpoint:
```bash
curl -X POST http://localhost:5002/api/read-file \
  -H "Content-Type: application/json" \
  -d '{"path": "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/version_info.json"}'
```

Should return JSON with dataset info.

### Issue: "Directory not found"

**Solution:**
The dataset might be on an external drive that's not mounted.

**Check if volume is mounted:**
```bash
ls /Volumes/
```

Should show "UBUNTU 24_0" in the list.

**If not mounted:**
- Plug in the external drive
- Wait for it to mount
- Refresh the page

### Issue: Images load but no bounding boxes

**Possible Causes:**
1. Label files don't exist
2. Label files are empty
3. "Show Bounding Boxes" checkbox is unchecked

**Solutions:**

#### 1. Check Label Files
```bash
ls "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/labels/train/"
```

Should show .txt files matching image names.

#### 2. Check Label File Content
```bash
cat "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/labels/train/IMG_001.txt"
```

Should show YOLO format:
```
0 0.512 0.487 0.245 0.678
```

#### 3. Verify Checkbox
Make sure "Show Bounding Boxes" is checked in the UI.

### Issue: Server not responding

**Solutions:**

#### 1. Check Server is Running
```bash
curl http://localhost:5002/health
```

Should return:
```json
{"status":"ok","timestamp":"...","uptime":...}
```

#### 2. Restart Server
```bash
# Stop the server (Ctrl+C in terminal)
# Then restart:
npm start
```

#### 3. Check Port
Make sure port 5002 isn't blocked:
```bash
lsof -i :5002
```

Should show node process.

### Issue: Slow image loading

**Possible Causes:**
1. Large image files
2. External drive is slow
3. Network issue (if using remote drive)

**Solutions:**

#### 1. Check Image Sizes
```bash
du -h "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/images/train/" | head -10
```

If images are very large (>10MB), consider resizing them.

#### 2. Copy Dataset Locally
For faster access:
```bash
cp -r "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100" ~/Desktop/
```

Then use local path in visualization tab:
```
/Users/yourusername/Desktop/Abasolo_Whiskey_750ml_dataset_20251230_122100
```

### Issue: "No images found in train set"

**Solutions:**

#### 1. Check Directory Structure
```bash
tree -L 3 "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100"
```

Should show:
```
dataset/
├── images/
│   ├── train/
│   └── val/
└── labels/
    ├── train/
    └── val/
```

#### 2. Check Image Extensions
The system looks for: .jpg, .jpeg, .png

Make sure your images have these extensions.

#### 3. Verify Dataset Was Created Correctly
Check version_info.json:
```bash
cat "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/version_info.json"
```

Should show train_images > 0.

## Testing Checklist

Use this checklist to verify everything is working:

- [ ] Server is running at http://localhost:5002
- [ ] Can access main page: http://localhost:5002/image-collector.html
- [ ] Visualization tab is visible
- [ ] Dataset path is correct
- [ ] "Load Dataset" button works
- [ ] Dataset statistics appear (train/val counts)
- [ ] Can select "Train Set" or "Validation Set"
- [ ] Image dropdown is populated
- [ ] Can select an image from dropdown
- [ ] Image displays on canvas
- [ ] Bounding boxes appear (green rectangles)
- [ ] Labels appear on boxes (if enabled)
- [ ] Annotation details panel shows coordinates
- [ ] Previous/Next buttons work
- [ ] Can toggle bounding boxes on/off
- [ ] Can toggle labels on/off

## Debug Mode

### Enable Verbose Logging

**In Browser Console (F12):**
```javascript
// Add this before using visualization
window.DEBUG_VISUALIZATION = true;
```

Then watch the console for detailed logs.

### Check API Responses

**In Browser Console:**
```javascript
// Test dataset loading
fetch('/api/read-file', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/version_info.json'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);

// Test directory listing
fetch('/api/list-directory', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/images/train'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

## Server Logs

The server logs show successful API calls:
```
{"reqId":"req-a","req":{"method":"POST","url":"/api/read-file",...},"msg":"incoming request"}
{"reqId":"req-a","res":{"statusCode":200},"responseTime":3.34,"msg":"request completed"}
```

**200 status = Success**
**404 status = File not found**
**500 status = Server error**

Check server terminal for any error messages.

## Known Limitations

1. **External Drive Speed**: Loading from USB 2.0 drives may be slow
2. **Large Datasets**: 10,000+ images may need pagination
3. **Image Size**: Very large images (>20MB) may be slow to render
4. **Browser Memory**: Chrome/Firefox may struggle with 1000+ images in memory

## Alternative Visualization Methods

If web visualization has issues, use these alternatives:

### 1. Python OpenCV Viewer
```bash
python3 scripts/visualize_annotations.py \
  --dataset "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100" \
  --class-name "Abasolo Whiskey 750ml" \
  --samples 10 \
  --split train \
  --mode opencv
```

### 2. HTML Gallery (Offline)
```bash
python3 scripts/visualize_annotations.py \
  --dataset "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100" \
  --class-name "Abasolo Whiskey 750ml" \
  --mode html \
  --max-html 100

# Then open the generated file
open "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/annotation_gallery.html"
```

### 3. Manual File Inspection
```bash
# View an image with Preview
open "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/images/train/IMG_001.jpg"

# Check its label file
cat "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/labels/train/IMG_001.txt"
```

## Getting Help

If you're still having issues:

1. **Check Documentation:**
   - [VISUALIZATION_GUIDE.md](VISUALIZATION_GUIDE.md) - User guide
   - [VISUALIZATION_TAB_COMPLETE.md](VISUALIZATION_TAB_COMPLETE.md) - Technical docs

2. **Check Server Logs:**
   - Look at the terminal where `npm start` is running
   - Check for error messages

3. **Check Browser Console:**
   - Press F12 to open DevTools
   - Look at Console tab for JavaScript errors
   - Look at Network tab for failed requests

4. **Verify Dataset:**
   - Run pipeline again if dataset seems corrupted
   - Check that all files were created successfully

## Quick Fix Commands

```bash
# Restart everything
pkill node                    # Stop server
cd /Users/saumil/Desktop/360Photo/product-capture-360/product-capture-360-ts
npm start                     # Restart server

# Verify dataset exists
ls -lah "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/"

# Check file counts
echo "Train images: $(ls "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/images/train/" | wc -l)"
echo "Train labels: $(ls "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/labels/train/" | wc -l)"

# Test API
curl http://localhost:5002/health
```

## Success Indicators

You'll know it's working when:
- ✅ Server starts without errors
- ✅ Health check returns {"status":"ok"}
- ✅ Visualization tab loads
- ✅ Dataset statistics appear
- ✅ Images display on canvas
- ✅ Green bounding boxes appear
- ✅ Navigation works smoothly

---

**Note**: The server logs show the visualization is working correctly. The "stream closed prematurely" message is normal - it occurs when the browser finishes reading the image stream.
