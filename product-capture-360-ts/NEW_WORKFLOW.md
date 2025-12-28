# Complete Auto-Segmentation Pipeline for YOLO Training

## Overview

This system provides a **fully automated pipeline** from product photos to training-ready YOLO datasets:

1. **Capture** 120 images of product (liquor bottles)
2. **Auto-segment** using AI models (SAM/rembg)
3. **Auto-generate** polygon masks
4. **Advanced augmentation** with zoom, backgrounds, lighting
5. **Export** in YOLOv5/v8/v11/COCO formats

## Workflow

### Step 1: Capture Product Images

Create a folder for your product and capture 120 images:

```bash
# Create product folder
mkdir -p ~/captures/whiskey_bottle_001

# Start the server
npm run dev
```

Open `http://localhost:5002`:

1. **Scan & Connect Camera**
2. **Select Storage** → Point to `~/captures/whiskey_bottle_001`
3. **Capture Session**:
   - Product name: `whiskey_bottle_001`
   - Rate: `120` images/min (2 per second)
   - Duration: `60` seconds
   - Click **Start** and slowly rotate bottle

Result: **120 images** in `~/captures/whiskey_bottle_001/`

### Step 2: Run Complete Pipeline

#### Option A: Quick Pipeline (Recommended for Liquor Bottles)

```bash
curl -X POST http://localhost:5002/api/pipeline/quick \
  -H "Content-Type: application/json" \
  -d '{
    "product_folder": "/Users/you/captures/whiskey_bottle_001",
    "product_name": "whiskey_bottle",
    "background_images": [
      "/Users/you/backgrounds/liquor_shelf_1.jpg",
      "/Users/you/backgrounds/liquor_shelf_2.jpg",
      "/Users/you/backgrounds/bar_backdrop.jpg"
    ]
  }'
```

**What it does:**
- Auto-segments using `rembg` (fast, accurate for bottles)
- Generates 5 augmentations per background
- Exports to ALL formats (YOLOv5, v8, v11, COCO)
- 80/20 train/val split

**Output:**
```
~/captures/whiskey_bottle_dataset/
├── whiskey_bottle/
│   ├── 1_segmentation/
│   │   ├── masks/              # 120 binary masks
│   │   └── polygons/           # 120 polygon JSONs
│   ├── 2_augmentation/
│   │   └── images/             # 2,160 augmented images
│   │       ├── whiskey_bottle_bg0.jpg
│   │       ├── whiskey_bottle_bg0_aug0.jpg
│   │       ├── whiskey_bottle_bg0_aug1.jpg
│   │       └── ... (120 × 3 backgrounds × 6 variations = 2,160)
│   └── 3_exports/
│       ├── yolov5/
│       │   ├── data.yaml
│       │   ├── train/ (1,728 images + labels)
│       │   └── val/ (432 images + labels)
│       ├── yolov8/
│       ├── yolov11/
│       └── coco/
```

#### Option B: Custom Pipeline

```bash
curl -X POST http://localhost:5002/api/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{
    "product_folder": "/Users/you/captures/whiskey_bottle_001",
    "product_name": "whiskey_bottle",
    "segmentation_model": "rembg",
    "background_images": [
      "/path/to/bg1.jpg",
      "/path/to/bg2.jpg"
    ],
    "augmentations_per_bg": 10,
    "enable_zoom": true,
    "enable_lighting": true,
    "enable_color_jitter": true,
    "enable_shadows": true,
    "export_formats": ["yolov11", "coco"],
    "train_val_split": 0.8
  }'
```

### Step 3: Train YOLO Model

Navigate to your exported dataset:

```bash
cd ~/captures/whiskey_bottle_dataset/whiskey_bottle/3_exports/yolov11
```

Train:

```python
from ultralytics import YOLO

model = YOLO('yolov11n.pt')
results = model.train(
    data='data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0
)
```

## Segmentation Models

### rembg (Recommended for Bottles)
- **Pros**: Fast, accurate for objects with clear edges
- **Cons**: Can struggle with transparent glass
- **Install**: `pip install rembg[gpu]`
- **Use when**: Clear product edges, solid backgrounds

### SAM (Segment Anything Model)
- **Pros**: State-of-the-art, works on anything
- **Cons**: Slower, requires large model download (2.4GB)
- **Install**: `pip install segment-anything torch`
- **Download**: `wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth`
- **Use when**: Complex products, varied backgrounds

### U2-Net
- **Pros**: Good balance of speed/accuracy
- **Cons**: Requires training for best results
- **Use when**: Middle ground needed

## Augmentation Details

### Zoom Variations
- **0.5x**: Product far away (30% of image)
- **1.0x**: Normal distance (60% of image)
- **1.5x**: Close-up (90% of image)

Creates realistic retail scenarios (shelf distance variations)

### Lighting Variations
- **Brightness**: ±30% (store lighting differences)
- **Contrast**: 0.8-1.2 (display case vs open shelf)
- **Saturation**: 0.7-1.3 (color temperature variations)

### Color Jitter
- **Hue shift**: ±10° (lighting color differences)

### Shadows
- **Dynamic shadows**: Soft drop shadows based on product position
- **50% probability**: Not all retail scenarios have strong shadows

### Rotation
- **±8°**: Small perspective variations
- **Realistic**: Mimics slightly tilted shelf placement

## Expected Dataset Size

**From 120 source images:**

| Backgrounds | Aug/BG | Total Images | Train (80%) | Val (20%) |
|-------------|--------|--------------|-------------|-----------|
| 3           | 5      | 2,160        | 1,728       | 432       |
| 5           | 5      | 3,600        | 2,880       | 720       |
| 10          | 5      | 7,200        | 5,760       | 1,440     |
| 10          | 10     | 14,400       | 11,520      | 2,880     |

Formula: `120 × backgrounds × (1 + augmentations_per_bg)`

## Training Performance

With this pipeline, expect:

- **mAP@50**: 90-95% (single product class)
- **mAP@50-95**: 75-85%
- **Training time**: 15-30 minutes (GPU)
- **Inference**: 100+ FPS (GPU), 10-20 FPS (CPU)

## Python Requirements

```bash
# Core (required)
pip install rembg[gpu] opencv-python numpy pillow

# Optional: SAM for advanced segmentation
pip install segment-anything torch torchvision

# Optional: YOLOv11 training
pip install ultralytics
```

## Example: Complete Workflow Script

```bash
#!/bin/bash
# Complete pipeline from capture to training

PRODUCT="whiskey_bottle_001"
CAPTURES_DIR="$HOME/captures/$PRODUCT"
BACKGROUNDS_DIR="$HOME/backgrounds/liquor_store"

# 1. Ensure backgrounds exist
if [ ! -d "$BACKGROUNDS_DIR" ]; then
    echo "❌ Download retail backgrounds first!"
    exit 1
fi

# 2. Check captures
IMAGE_COUNT=$(ls -1 "$CAPTURES_DIR"/*.jpg 2>/dev/null | wc -l)
if [ $IMAGE_COUNT -lt 100 ]; then
    echo "❌ Need at least 100 images. Found: $IMAGE_COUNT"
    exit 1
fi

echo "✅ Found $IMAGE_COUNT images"

# 3. Prepare background list
BG_LIST=$(ls -1 "$BACKGROUNDS_DIR"/*.jpg | jq -R . | jq -s .)

# 4. Run pipeline
echo "🚀 Running complete pipeline..."
curl -X POST http://localhost:5002/api/pipeline/quick \
  -H "Content-Type: application/json" \
  -d "{
    \"product_folder\": \"$CAPTURES_DIR\",
    \"product_name\": \"whiskey_bottle\",
    \"background_images\": $BG_LIST
  }" | jq '.'

echo "✅ Pipeline complete!"
echo "📂 Check: ${CAPTURES_DIR}_dataset/"
```

## Troubleshooting

### "No masks detected"
- Try different segmentation model
- Check if product is clearly visible in images
- Ensure good contrast with background

### "Augmentation failed"
- Verify background images exist and are readable
- Check disk space (augmented dataset can be large)
- Ensure FFmpeg is installed

### "Low training accuracy"
- Increase number of backgrounds (5-10 recommended)
- Add more augmentations (try 10 per background)
- Capture more angles (180+ images)
- Check that backgrounds are realistic retail scenes

### "Slow processing"
- Use `rembg` instead of `sam` (10x faster)
- Reduce augmentations_per_bg
- Use GPU for segmentation: `pip install rembg[gpu]`

## API Reference

### POST /api/pipeline/quick
Quick pipeline with sane defaults

**Request:**
```json
{
  "product_folder": "/path/to/captures",
  "product_name": "product_name",
  "background_images": ["/path/to/bg1.jpg", "/path/to/bg2.jpg"]
}
```

**Response:**
```json
{
  "success": true,
  "steps": {
    "segmentation": { "success": true, "count": 120 },
    "augmentation": { "success": true, "count": 2160 },
    "export": { "success": true, "formats": ["yolov5", "yolov8", "yolov11", "coco"] }
  },
  "stats": {
    "originalImages": 120,
    "maskedImages": 120,
    "augmentedImages": 2160,
    "trainImages": 1728,
    "valImages": 432
  },
  "outputDirs": {
    "masks": "/path/to/output/1_segmentation/masks",
    "augmented": "/path/to/output/2_augmentation/images",
    "exports": ["/path/to/output/3_exports/yolov5", "..."]
  }
}
```

### POST /api/pipeline/run
Custom pipeline with full control

See Option B above for full parameters.

---

**Ready to start training! 🚀🎯**
