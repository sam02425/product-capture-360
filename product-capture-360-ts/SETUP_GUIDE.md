# Setup Guide - Auto-Segmentation Pipeline for YOLO Training

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
cd /Users/saumil/Desktop/360Photo/product-capture-360-ts

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install rembg[gpu] opencv-python numpy pillow ultralytics
```

### 2. Start Server

```bash
npm run dev
```

Server runs at: `http://localhost:5002`

### 3. Capture Images

1. Open browser → `http://localhost:5002`
2. Click **"Scan Cameras"** → Select USB camera → **"Connect"**
3. Create folder: `/Users/saumil/Desktop/captures/whiskey_bottle_001`
4. Point storage to that folder
5. **Auto-capture session**:
   - Product name: `whiskey_bottle_001`
   - Rate: `120` images/min
   - Duration: `60` seconds
   - **Start** → Rotate bottle slowly

### 4. Prepare Backgrounds

Download 3-5 liquor store/bar backgrounds:

```bash
mkdir -p ~/backgrounds/retail
# Download from Unsplash, Pexels, or photograph your own
```

### 5. Run Pipeline

```bash
curl -X POST http://localhost:5002/api/pipeline/quick \
  -H "Content-Type: application/json" \
  -d '{
    "product_folder": "/Users/saumil/Desktop/captures/whiskey_bottle_001",
    "product_name": "whiskey_bottle",
    "background_images": [
      "/Users/saumil/backgrounds/retail/shelf1.jpg",
      "/Users/saumil/backgrounds/retail/shelf2.jpg",
      "/Users/saumil/backgrounds/retail/shelf3.jpg"
    ]
  }'
```

**Wait 5-10 minutes**... Pipeline will:
- ✅ Auto-segment 120 images
- ✅ Generate 2,160 augmented variations
- ✅ Export to YOLOv5/v8/v11/COCO formats

### 6. Train Model

```python
from ultralytics import YOLO

model = YOLO('yolov11n.pt')
results = model.train(
    data='/Users/saumil/Desktop/captures/whiskey_bottle_dataset/whiskey_bottle/3_exports/yolov11/data.yaml',
    epochs=100,
    imgsz=640,
    batch=16
)
```

**Done!** 🎉

---

## Detailed Setup

### System Requirements

- **Node.js**: 18+ ([nodejs.org](https://nodejs.org))
- **Python**: 3.8+ ([python.org](https://python.org))
- **FFmpeg**: Latest ([ffmpeg.org](https://ffmpeg.org))
- **GPU**: Recommended (CUDA for faster processing)
- **Disk Space**: 5-10GB per product dataset
- **RAM**: 8GB minimum, 16GB recommended

### Installation Steps

#### 1. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

**Verify:**
```bash
ffmpeg -version
```

#### 2. Install Node.js Dependencies

```bash
cd product-capture-360-ts
npm install
```

**Dependencies installed:**
- `fastify` - Web server
- `@fastify/static` - Static file serving
- `@fastify/cors` - CORS support
- TypeScript tooling

#### 3. Install Python Dependencies

**Core (Required):**
```bash
pip install rembg[gpu] opencv-python numpy pillow
```

**For Training:**
```bash
pip install ultralytics torch torchvision
```

**Optional - SAM (Advanced Segmentation):**
```bash
pip install segment-anything
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth
mv sam_vit_h_4b8939.pth ~/models/
```

**Verify Python Setup:**
```bash
python3 -c "import rembg, cv2, numpy; print('✅ All imports successful')"
```

### Hardware Setup

#### Camera

- **USB webcam** (any resolution, 720p+ recommended)
- **Positioning**: 2-3 feet from product
- **Angle**: Eye-level with center of product
- **Lighting**: Even, diffused (avoid harsh shadows)

#### Green Screen (Optional but Recommended)

- **Color**: Chroma key green (#00ff00)
- **Size**: Large enough to fill camera frame behind product
- **Material**: Matte finish (avoid reflective)
- **Distance**: Keep product 1-2 feet away to avoid color spill

**Alternative:** Use white/neutral background and rely on AI segmentation (rembg/SAM)

### Directory Structure

```
product-capture-360-ts/
├── src/                    # TypeScript source
│   ├── server.ts          # Main server + API
│   ├── camera.ts          # Camera management
│   ├── segmentation.ts    # Auto-segmentation
│   ├── augmentation.ts    # Advanced augmentation
│   ├── dataset_export.ts  # YOLO format export
│   └── pipeline.ts        # Complete pipeline
├── scripts/               # Python segmentation scripts
│   ├── sam_segment.py
│   ├── rembg_segment.py
│   └── mask_to_polygon.py
├── public/                # Web UI
│   ├── index.html
│   └── app.js
├── package.json
├── tsconfig.json
└── README.md
```

### Environment Variables

Optional configuration in `.env`:

```bash
PORT=5002                  # Server port
CAPTURES_DIR=/path/to/captures
BACKGROUNDS_DIR=/path/to/backgrounds
DEFAULT_SEGMENTATION=rembg # rembg|sam|u2net
```

### Testing Setup

**Test camera:**
```bash
ffmpeg -f avfoundation -list_devices true -i ""
# macOS: Lists cameras

ffmpeg -f dshow -list_devices true -i dummy
# Windows: Lists cameras

v4l2-ctl --list-devices
# Linux: Lists cameras
```

**Test segmentation:**
```bash
cd scripts
python3 rembg_segment.py test_image.jpg output_mask.png output_polygon.json
```

**Test API:**
```bash
# Start server
npm run dev

# Test health
curl http://localhost:5002/api/camera/health
```

---

## Troubleshooting

### Camera Not Detected

**Issue:** "No cameras found"

**Solutions:**
1. Check USB connection
2. Grant camera permissions (macOS System Preferences)
3. Try different USB port
4. Restart server: `Ctrl+C` then `npm run dev`
5. Check FFmpeg can see camera:
   ```bash
   ffmpeg -f avfoundation -list_devices true -i ""
   ```

### Segmentation Fails

**Issue:** "No masks detected" or "Segmentation failed"

**Solutions:**
1. **Check Python install:**
   ```bash
   pip install --upgrade rembg opencv-python
   ```

2. **Try different model:**
   - `rembg` → Fast, good for solid objects
   - `sam` → Slower, works on anything
   - `u2net` → Middle ground

3. **Verify image quality:**
   - Good contrast with background
   - Product clearly visible
   - Not blurry

4. **Manual test:**
   ```bash
   python3 scripts/rembg_segment.py /path/to/test_image.jpg mask.png polygon.json
   ```

### Augmentation Slow

**Issue:** Takes too long to generate dataset

**Solutions:**
1. **Reduce augmentations:**
   ```json
   {
     "augmentations_per_bg": 3  // Instead of 5 or 10
   }
   ```

2. **Fewer backgrounds:**
   - Start with 2-3 backgrounds
   - Add more later if needed

3. **Use GPU:**
   ```bash
   pip install rembg[gpu]  # GPU acceleration
   ```

4. **Batch smaller sets:**
   - Process 30 images at a time instead of all 120

### Export Fails

**Issue:** "Export failed" or format not created

**Solutions:**
1. **Check disk space:**
   ```bash
   df -h  # Check available space
   ```

2. **Verify polygon files exist:**
   ```bash
   ls -la /path/to/output/1_segmentation/polygons/
   ```

3. **Try single format first:**
   ```json
   {
     "export_formats": ["yolov11"]  // Instead of "all"
   }
   ```

### Low Training Accuracy

**Issue:** Model mAP < 70%

**Solutions:**
1. **More diverse backgrounds** (5-10 retail scenes)
2. **More augmentations** (try 10 per background)
3. **More source images** (150-200 instead of 120)
4. **Better segmentation quality:**
   - Switch to SAM if using rembg
   - Check masks visually

5. **Training hyperparameters:**
   ```python
   model.train(
       data='data.yaml',
       epochs=150,      # More epochs
       patience=30,     # More patience
       batch=8,         # Smaller batch if OOM
       imgsz=640
   )
   ```

### Memory Issues

**Issue:** "Out of memory" or system crashes

**Solutions:**
1. **Reduce batch size:**
   ```python
   model.train(batch=4)  # Instead of 16
   ```

2. **Lower image resolution** (if camera supports):
   - Use 1280x720 instead of 1920x1080

3. **Process in chunks:**
   - Segment/augment 30 images at a time
   - Combine later

4. **Close other applications**

5. **Use CPU instead of GPU** (slower but more memory):
   ```python
   model.train(device='cpu')
   ```

---

## Performance Optimization

### Fast Pipeline (Testing)

For quick testing/prototyping:

```json
{
  "segmentation_model": "rembg",
  "augmentations_per_bg": 2,
  "export_formats": ["yolov11"]
}
```

**Result:** ~500 images in 2-3 minutes

### Balanced Pipeline (Recommended)

For good quality with reasonable speed:

```json
{
  "segmentation_model": "rembg",
  "augmentations_per_bg": 5,
  "background_images": ["bg1.jpg", "bg2.jpg", "bg3.jpg"],
  "export_formats": ["all"]
}
```

**Result:** ~2,000 images in 5-10 minutes

### High-Quality Pipeline (Production)

For maximum accuracy:

```json
{
  "segmentation_model": "sam",
  "augmentations_per_bg": 10,
  "background_images": ["bg1.jpg", ..., "bg10.jpg"],
  "export_formats": ["all"]
}
```

**Result:** ~14,000 images in 30-60 minutes

---

## Next Steps

1. ✅ **Complete setup above**
2. 📸 **Capture your first product** (120 images)
3. 🤖 **Run pipeline** with 3 backgrounds
4. 🎯 **Train initial model** (100 epochs)
5. 📊 **Evaluate** on test images
6. 🔄 **Iterate:**
   - Add more backgrounds if accuracy low
   - Capture more angles if missing detections
   - Tune augmentation parameters

## Support

- **Documentation**: See [NEW_WORKFLOW.md](NEW_WORKFLOW.md)
- **Issues**: Check error messages carefully
- **Logs**: Server logs show detailed pipeline progress

---

**You're ready to go! 🚀**
