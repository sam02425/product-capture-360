# Quick Start Guide - Production 360° Product Capture System

## 🚀 Complete Workflow

```
📸 Capture → 🎨 Augment → 🏷️ Annotate → ⚙️ Export → 📦 Version
```

---

## 1️⃣ Capture Phase (📸)

### Start the Server
```bash
cd product-capture-360-ts
npm install
npm run build
npm start
```

Server runs at: `http://localhost:3000`

### Capture Images

1. **Open Browser**: Navigate to `http://localhost:3000`

2. **Set Storage Location**:
   - Click "Select Storage"
   - Choose a folder (e.g., Desktop, External Drive)
   - System creates `/360Photo_Captures` folder
   - ✅ Validates: disk space, write permissions, no existing content

3. **Initialize Camera**:
   - Click "Camera" dropdown
   - Select your camera device
   - Click "Start Camera"
   - Wait for green "Camera Ready" status
   - ✅ Validates: camera permissions, frame reception

4. **Start Capture Session**:
   - Enter product name (e.g., "whiskey_bottle")
   - Set capture rate (e.g., 180/min for 3 FPS)
   - Set duration (e.g., 60 seconds)
   - Click "Start Session"
   - ✅ Pre-flight checks run automatically

5. **Monitor Progress**:
   - Watch real-time counter
   - Check save queue status
   - View structured logs in console
   - Target: 120-180 images for production

**Example Session**:
```
Product: whiskey_bottle
Rate: 180/min (3 FPS)
Duration: 60 seconds
Result: 180 images captured
```

---

## 2️⃣ Augmentation Pipeline (🎨 + 🏷️ + ⚙️)

### Prepare Background Images

Collect 10-20 retail shelf/environment images:
```
backgrounds/
  ├── retail_shelf_1.jpg
  ├── retail_shelf_2.jpg
  ├── retail_shelf_3.jpg
  └── ... (10-20 total)
```

### Run Complete Pipeline

**Option A: API (Recommended)**

```typescript
import { runCompletePipeline } from './src/pipeline';

const result = await runCompletePipeline({
  // Input
  productFolder: '/path/to/360Photo_Captures',
  productName: 'whiskey_bottle',

  // Output
  outputDir: '/path/to/datasets',

  // Segmentation
  segmentationModel: 'rembg', // 'rembg' | 'sam' | 'u2net'

  // Augmentation
  backgroundImages: [
    '/path/to/backgrounds/shelf_1.jpg',
    '/path/to/backgrounds/shelf_2.jpg',
    '/path/to/backgrounds/shelf_3.jpg',
    // ... add all backgrounds
  ],
  augmentationsPerBackground: 5,
  enableZoom: true,
  enablePerspective: true,
  enableLighting: true,
  enableColorJitter: true,
  enableShadows: true,

  // Export
  exportFormats: ['all'], // Exports YOLOv5, v8, v11, COCO
  trainValSplit: 0.8, // 80% train, 20% validation
});

if (result.success) {
  console.log(`✅ Pipeline complete!`);
  console.log(`📊 Generated ${result.stats.augmentedImages} training images`);
  console.log(`📁 Train: ${result.stats.trainImages}, Val: ${result.stats.valImages}`);
} else {
  console.error(`❌ Pipeline failed: ${result.message}`);
}
```

**Option B: Quick Liquor Bottle Pipeline**

```typescript
import { quickLiquorBottlePipeline } from './src/pipeline';

const result = await quickLiquorBottlePipeline(
  '/path/to/360Photo_Captures',
  'whiskey_bottle',
  [
    '/path/to/backgrounds/shelf_1.jpg',
    '/path/to/backgrounds/shelf_2.jpg',
    '/path/to/backgrounds/shelf_3.jpg',
    // ... all backgrounds
  ]
);
```

### Pipeline Output Structure

```
datasets/
└── whiskey_bottle/
    ├── 1_segmentation/
    │   ├── masks/          ← Binary masks for each image
    │   └── polygons/       ← Polygon annotations
    ├── 2_augmentation/
    │   ├── images/         ← Augmented training images
    │   └── labels/         ← Corresponding annotations
    └── 3_exports/
        ├── yolov5/         ← YOLOv5 format (train/val split)
        ├── yolov8/         ← YOLOv8 format
        ├── yolov11/        ← YOLOv11 format
        └── coco/           ← COCO JSON format
```

---

## 3️⃣ Training Your Model (⚙️)

### YOLOv11 Training

```bash
# Install Ultralytics
pip install ultralytics

# Train YOLOv11
yolo task=detect \
  mode=train \
  model=yolo11n.pt \
  data=/path/to/datasets/whiskey_bottle/3_exports/yolov11/data.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16
```

### Verify Dataset

```python
from ultralytics import YOLO

# Load dataset
model = YOLO('yolo11n.pt')

# Verify data.yaml
import yaml
with open('/path/to/data.yaml') as f:
    data = yaml.safe_load(f)
    print(f"Classes: {data['names']}")
    print(f"Train images: {len(os.listdir(data['train']))}")
    print(f"Val images: {len(os.listdir(data['val']))}")
```

---

## 4️⃣ Versioning & Management (📦)

### Dataset Versioning

```typescript
import { createDatasetVersion } from './src/versioning';

// Create a version snapshot
const version = await createDatasetVersion({
  datasetPath: '/path/to/datasets/whiskey_bottle',
  versionTag: 'v1.0.0',
  description: 'Initial production dataset - 120 images × 10 backgrounds',
  metadata: {
    captureDate: '2025-01-29',
    captureRate: 180,
    totalImages: 120,
    augmentationsPerBg: 5,
    backgrounds: 10,
  }
});

console.log(`Version created: ${version.tag}`);
```

### List Versions

```typescript
import { listDatasetVersions } from './src/versioning';

const versions = await listDatasetVersions('/path/to/datasets/whiskey_bottle');
versions.forEach(v => {
  console.log(`${v.tag}: ${v.description} (${v.timestamp})`);
});
```

---

## 🛡️ Production Checklist

### Before Capture
- [ ] Sufficient disk space (> 1 GB free)
- [ ] Camera permissions granted (macOS: System Settings → Privacy → Camera)
- [ ] Storage location writable
- [ ] Product name chosen (alphanumeric, hyphens, underscores only)
- [ ] No existing folder with same name

### Before Pipeline
- [ ] Minimum 10 captured images (120+ recommended)
- [ ] Minimum 3 background images (10+ recommended)
- [ ] Output directory parent exists
- [ ] Output directory name doesn't exist
- [ ] Sufficient disk space for augmentations
- [ ] Product name is valid

### After Pipeline
- [ ] Verify augmented image count matches expectations
- [ ] Check train/val split ratios
- [ ] Validate exported formats (data.yaml exists)
- [ ] Spot-check augmented images for quality

---

## 📊 Expected Performance

### Capture
- **Rate**: 180 images/minute (3 FPS)
- **Duration**: 60 seconds for 180 images
- **Quality**: 1280×720 @ 30 FPS preview

### Pipeline
| Step | Time (120 images) | Output |
|------|------------------|--------|
| Segmentation | 2-4 minutes | 120 masks |
| Augmentation (5×10) | 8-12 minutes | 6,000 images |
| Export (all formats) | 1-2 minutes | 4 format dirs |
| **Total** | **12-18 minutes** | **6,000 training images** |

### Disk Space
- **Captured**: 120 images × 2 MB = 240 MB
- **Augmented**: 6,000 images × 5 MB = 30 GB
- **Total**: ~31 GB for complete dataset

---

## 🚨 Common Issues

### "Folder already exists"
```bash
# Delete existing folder
rm -rf /path/to/360Photo_Captures

# Or choose different location/product name
```

### "Camera not receiving frames"
```bash
# macOS: Grant camera permissions
System Settings → Privacy & Security → Camera → Terminal (enable)

# Kill zombie FFmpeg processes
killall ffmpeg

# Restart application
```

### "Insufficient disk space"
```bash
# Check available space
df -h /path/to/storage

# Free up space or choose different location
```

### "No images found in product folder"
```bash
# Verify images exist
ls -lh /path/to/360Photo_Captures/*.jpg

# Check file permissions
chmod 644 /path/to/360Photo_Captures/*.jpg
```

---

## 💡 Pro Tips

### 1. **Optimize Capture**
- Use external SSD for faster saves
- Close unnecessary applications during capture
- Monitor save queue (should stay < 50)

### 2. **Optimize Augmentation**
- Use diverse backgrounds (different lighting, angles, clutter)
- Start with 5 augmentations/bg, increase if needed
- Enable all transformations for robust training

### 3. **Optimize Training**
- Use minimum 120 captured images
- 80/20 train/val split is standard
- Larger batch size = faster training (if GPU allows)

### 4. **Monitor Quality**
```bash
# View structured logs
tail -f logs.json | jq 'select(.event == "image_captured")'

# Check success rate
tail -f logs.json | jq 'select(.event == "session_completed") | .success_rate'

# Find failures
tail -f logs.json | jq 'select(.event == "image_save_failed")'
```

---

## 📞 Next Steps

1. **Capture**: Follow section 1️⃣ to capture 120-180 product images
2. **Process**: Run pipeline (section 2️⃣) to generate training dataset
3. **Train**: Train YOLOv11 model (section 3️⃣)
4. **Iterate**: Capture more products, build model library

**Full Documentation**: See `PRODUCTION_FEATURES.md` for detailed API reference and advanced features.

---

## 🎯 Example: Complete Workflow

```bash
# 1. Start server
npm start

# 2. Capture (in browser)
# - Set storage: /Users/me/Desktop
# - Start camera
# - Capture: whiskey_bottle, 180/min, 60s
# - Result: 180 images in /Users/me/Desktop/360Photo_Captures

# 3. Run pipeline (in code)
const result = await quickLiquorBottlePipeline(
  '/Users/me/Desktop/360Photo_Captures',
  'whiskey_bottle',
  ['/Users/me/backgrounds/shelf_1.jpg', /* ... */]
);

# 4. Train model
yolo task=detect mode=train \
  model=yolo11n.pt \
  data=/Users/me/Desktop/datasets/whiskey_bottle/3_exports/yolov11/data.yaml \
  epochs=100 imgsz=640 batch=16

# 5. Deploy model
# Use trained weights from runs/detect/train/weights/best.pt
```

**Result**: Production-ready object detection model for whiskey bottles! 🎉
