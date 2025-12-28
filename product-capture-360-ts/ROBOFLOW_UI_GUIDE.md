# 🎨 Roboflow-Style UI - User Guide

## ✅ System Verified Working!

**Your setup has been tested and confirmed:**
- ✅ **USB Camera** detected: "USB Camera" (index 1)
- ✅ **Pendrive** detected: "UBUNTU 24_0" at `/Volumes/UBUNTU 24_0`
- ✅ **Server** running at: `http://localhost:5002`

## 🚀 Access the New UI

Open in your browser:
```
http://localhost:5002/roboflow.html
```

Or just:
```
http://localhost:5002/
```
(Automatically redirects to Roboflow UI)

---

## 📸 Complete Workflow

### **Tab 1: Capture** (10 minutes)

1. **Camera Setup**
   - Select camera: **"USB Camera"** from dropdown
   - Click **"Connect Camera"**
   - Live preview should appear

2. **Storage Setup**
   - Select storage: **"UBUNTU 24_0"** (your pendrive)
   - Click **"Use Selected Storage"**
   - Creates folder: `/Volumes/UBUNTU 24_0/360Photo_Captures`

3. **Capture Images**
   - **Product Name**: `whiskey_bottle_001`

   **Option A - Manual:**
   - Click **"📸 Capture"** 120 times
   - Rotate bottle ~3° between each shot

   **Option B - Auto Session (Recommended):**
   - Click **"▶️ Auto Session"**
   - Rate: `120` images/min (2 per second)
   - Duration: `60` seconds
   - Click **Start**
   - Slowly rotate bottle continuously
   - System captures automatically!

4. **Monitor Progress**
   - Watch "Images Captured" counter increase
   - Session Status shows "Active" → "Idle" when done

---

### **Tab 2: Augmentation** (5 minutes)

1. **Select Augmentations**

   **Enabled by default (recommended for bottles):**
   - ✅ 🔍 Zoom Variations (0.5x - 1.5x)
   - ✅ 💡 Lighting Adjustments
   - ✅ 🎨 Color Jitter
   - ✅ 🌑 Realistic Shadows
   - ✅ 🔄 Rotation (±8°)

   **Optional (click to enable):**
   - ↔️ Horizontal Flip
   - 🌫️ Slight Blur
   - 📡 Noise

2. **Configure Settings**
   - **Augmentations Per Background**: `5` (default)
     - Higher = More variety, slower processing
     - Recommended: 3-10

   - **Segmentation Model**: `rembg` (default)
     - **rembg**: Fast, perfect for bottles
     - **SAM**: Slower, works on anything
     - **U2-Net**: Balanced

3. **Upload Backgrounds**

   **Click the upload area:**
   - Select 3-5 retail shelf/store images
   - Formats: JPEG, PNG
   - Recommended resolution: 1920x1080+

   **Example backgrounds:**
   - Liquor store shelf
   - Bar backdrop
   - Restaurant display
   - Retail counter
   - Warehouse shelf

   **Preview thumbnails appear below**
   - Click ❌ to remove unwanted backgrounds

4. **Preview Augmentations** (Optional)
   - Select source image from dropdown
   - Click **"Generate Preview"**
   - See 8 augmentation variations:
     - Original
     - Zoom 0.5x (far)
     - Zoom 1.5x (close)
     - Bright +30%
     - Dark -30%
     - High Contrast
     - Saturated
     - Desaturated

---

### **Tab 3: Generate Dataset** (10 minutes processing)

1. **Review Statistics**
   - **Source Images**: 120 (from capture)
   - **Backgrounds**: 3 (uploaded)
   - **Estimated Output**: 2,160 images
     - Formula: 120 × 3 × (1 + 5) = 2,160

2. **Select Export Formats**

   **All enabled by default:**
   - ✅ YOLOv5 (bbox format)
   - ✅ YOLOv8 (enhanced)
   - ✅ YOLOv11 (segmentation)
   - ✅ COCO (JSON)

   **Uncheck formats you don't need**

3. **Train/Val Split**
   - Default: `80%` (80% train, 20% validation)
   - Recommended: 70-85%

4. **Add Version Description** (Optional)
   ```
   Example:
   Initial dataset with 3 retail backgrounds.
   Using rembg segmentation, 5 augmentations per background.
   ```

5. **Generate!**
   - Click **"🚀 Generate Dataset"**
   - Progress bar appears
   - Steps:
     1. Auto-segmentation (2-3 min)
     2. Augmentation (5-7 min)
     3. Export (1-2 min)

6. **Wait for Completion**
   - Don't close browser
   - Progress updates in real-time
   - Success message when done

---

### **Tab 4: Versions** (Dataset Management)

**Roboflow-style versioning!**

1. **View All Versions**
   - Listed in reverse chronological order
   - Latest version has **"Latest"** badge

2. **Version Cards Show:**
   - Version number (v1, v2, v3...)
   - Product name
   - Creation date
   - Total images
   - Export formats

3. **Click a Version** to see details:
   - **Statistics:**
     - Source images
     - Total images generated
     - Train/Val split

   - **Configuration:**
     - Product name
     - Segmentation model
     - Number of backgrounds
     - Active augmentations

   - **Export formats**

   - **Description** (if provided)

   - **Training metrics** (if added later)

4. **Download Dataset**
   - Click **"📥 Download Dataset"**
   - Downloads zipped dataset in all formats

5. **Compare Versions** (Coming soon)
   - Select two versions
   - See differences in:
     - Image counts
     - Augmentation settings
     - Backgrounds added/removed

---

## 📊 Expected Results

### From 120 Source Images with 3 Backgrounds:

| Metric | Value |
|--------|-------|
| **Source Images** | 120 |
| **Backgrounds** | 3 |
| **Augmentations/BG** | 5 |
| **Total Dataset** | 2,160 |
| **Train (80%)** | 1,728 |
| **Val (20%)** | 432 |

### Processing Time:
- **Segmentation**: 2-3 minutes (rembg)
- **Augmentation**: 5-7 minutes
- **Export**: 1-2 minutes
- **Total**: ~10 minutes

### Output Location:
```
/Volumes/UBUNTU 24_0/360Photo_Captures/whiskey_bottle_001_dataset/
└── whiskey_bottle_001/
    ├── 1_segmentation/
    │   ├── masks/           # 120 PNG masks
    │   └── polygons/        # 120 JSON polygons
    ├── 2_augmentation/
    │   └── images/          # 2,160 JPEG images
    └── 3_exports/
        ├── yolov5/          # Ready to train
        │   ├── data.yaml
        │   ├── train/
        │   └── val/
        ├── yolov8/
        ├── yolov11/
        └── coco/
```

---

## 🎯 Tips for Best Results

### Photography
- ✅ **Even lighting** on green screen
- ✅ **Bottle centered** in frame
- ✅ **1-2 feet** from backdrop
- ✅ **Slow rotation** during auto-capture

### Backgrounds
- ✅ **5-10 different scenes** for variety
- ✅ **High resolution** (1920x1080+)
- ✅ **Realistic retail settings**
- ✅ **Different lighting** conditions

### Augmentation
- ✅ **Start with defaults** (all enabled)
- ✅ **5 augmentations/bg** is sweet spot
- ✅ **Preview first** before full generation
- ✅ **Use rembg** for bottles (fast + accurate)

---

## 🔧 Troubleshooting

### Camera Not Showing
```bash
# Refresh camera list
Click "Select Camera" dropdown again
```

### Storage Not Detected
```bash
# Check if pendrive is mounted
ls /Volumes/
# Should show "UBUNTU 24_0"
```

### Segmentation Fails
- **Try different model**: Switch from rembg → SAM
- **Check image quality**: Good contrast with background?
- **Install dependencies**:
  ```bash
  pip install rembg[gpu] opencv-python numpy
  ```

### Augmentation Slow
- **Reduce augmentations**: Try 3 instead of 5
- **Fewer backgrounds**: Start with 2-3
- **Use GPU**: Install `pip install rembg[gpu]`

---

## 🎓 Next Steps After Generation

### 1. Verify Dataset
```bash
cd /Volumes/UBUNTU\ 24_0/360Photo_Captures/whiskey_bottle_001_dataset/whiskey_bottle_001/3_exports/yolov11

# Check image count
ls train/images | wc -l     # Should be ~1,728
ls val/images | wc -l       # Should be ~432

# Check labels exist
ls train/labels | wc -l     # Should match images
```

### 2. Train YOLOv11
```python
from ultralytics import YOLO

model = YOLO('yolov11n.pt')
results = model.train(
    data='data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0  # GPU
)
```

### 3. Evaluate
```python
metrics = model.val()
print(f"mAP@50: {metrics.box.map50:.4f}")
print(f"mAP@50-95: {metrics.box.map:.4f}")
```

### 4. Create New Version
If accuracy is low:
- Add more backgrounds (Tab 2)
- Increase augmentations (Tab 2)
- Capture more angles (Tab 1)
- Click **"Generate Dataset"** again
- New version (v2) created automatically!

---

## 📝 Version History Example

After multiple iterations:

```
v1: Initial dataset
    - 120 source images
    - 3 backgrounds
    - 2,160 total
    - mAP@50: 85%

v2: Added more backgrounds
    - 120 source images
    - 5 backgrounds  ← Changed
    - 3,600 total
    - mAP@50: 91%    ← Improved!

v3: More augmentations
    - 120 source images
    - 5 backgrounds
    - 7,200 total    ← Changed
    - mAP@50: 93%    ← Better!
```

---

## 🎉 You're Ready!

1. **Open**: `http://localhost:5002/`
2. **Follow tabs** 1 → 2 → 3 → 4
3. **Train** your model
4. **Iterate** with new versions

**The UI guides you through every step!**

**Questions?** Check the main [README_COMPLETE.md](README_COMPLETE.md)

---

**Built with ❤️ inspired by Roboflow** 🚀
