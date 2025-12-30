# Visualization Tab - User Guide

## Quick Start

### Step 1: Access the Visualization Tab

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser to: `http://localhost:5002`

3. Click the **🔍 Visualize Dataset** tab at the top

### Step 2: Load Your Dataset

**Dataset Path Input**
```
/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100
```

- The path is pre-filled with your current dataset
- Click **📁 Load Dataset** button
- Wait for "Dataset loaded successfully" message

### Step 3: View Dataset Information

After loading, you'll see:

```
Dataset Information
┌─────────────┬─────────────┬─────────────┬──────────┐
│ Train Images│  Val Images │ Total Images│  Classes │
│    1,250    │     384     │    1,634    │    1     │
└─────────────┴─────────────┴─────────────┴──────────┘
```

### Step 4: Navigate Images

**Controls Available:**
- **Dataset Split**: Dropdown to select Train Set or Validation Set
- **Image**: Dropdown showing all images in selected split
- **◀️ Prev**: Go to previous image
- **Next ▶️**: Go to next image

**Display Options:**
- ☑️ Show Bounding Boxes - Toggle green boxes on/off
- ☑️ Show Labels - Toggle class name labels on/off

### Step 5: Verify Annotations

**Canvas Display**
- Image is displayed at full resolution
- Green bounding boxes show detected products
- Class name label appears above each box

**Annotation Details Panel**
Shows all bounding boxes in current image:
```
Annotations
┌────────────────────────────────────────┐
│ Abasolo Whiskey 750ml                  │
│ (0.512, 0.487, 0.245, 0.678)          │
└────────────────────────────────────────┘
```

Format: `(center_x, center_y, width, height)` - all normalized 0.0-1.0

## What You're Looking For

### ✅ Good Annotations

- Bounding box tightly surrounds the bottle
- No significant parts of bottle are cut off
- Box doesn't include too much background
- Class name is correct

### ❌ Bad Annotations (Need Fixing)

- Box is too small (missing parts of bottle)
- Box is too large (includes lots of background)
- Box is offset (doesn't center on bottle)
- Multiple boxes on same bottle
- No box when bottle is clearly visible

## Dataset Statistics

**Your Current Dataset:**
```
Product: Abasolo Whiskey 750ml
Version: v1.0_20251230_122100
Created: 2025-12-30

📸 Image Statistics:
   Original Images:         278
   Images with Detections:  245  (88.1%)
   Images Excluded:         33   (11.9%)

🎨 Augmentation:
   Augmented Images:        1,634
   Augmentation Factor:     5x
   Methods:                 brightness, rotation, blur, noise, contrast

📊 Dataset Split:
   Train Images:            1,250  (77%)
   Val Images:              384    (23%)
   Total:                   1,634

🏷️ Classes:
   1. Abasolo Whiskey 750ml

✅ Ready for Training: Yes
```

## Understanding YOLO Format

**Annotation File Format (labels/train/image_001.txt)**
```
0 0.512 0.487 0.245 0.678
```

Where:
- `0` = Class ID (0 = Abasolo Whiskey 750ml)
- `0.512` = Center X (normalized, 0.0-1.0)
- `0.487` = Center Y (normalized, 0.0-1.0)
- `0.245` = Width (normalized, 0.0-1.0)
- `0.678` = Height (normalized, 0.0-1.0)

**Why Normalized?**
- Works with any image resolution
- Standard YOLO format
- Training model can handle different sizes

## Tips for Verification

### 1. Check Multiple Images
Don't just look at one image. Sample randomly across:
- Different rotations
- Different augmentations
- Original vs augmented versions

### 2. Check Both Splits
Verify annotations in:
- **Train Set** (1,250 images)
- **Val Set** (384 images)

### 3. Look for Patterns
If annotations are bad:
- Are they consistently too small?
- Are they consistently too large?
- Are they offset in a specific direction?

### 4. Validate Class Names
Make sure the class name matches your product:
- Should be: "Abasolo Whiskey 750ml"
- Not: "bottle" or "product" or generic name

## Troubleshooting

### Problem: "Failed to load dataset"
**Solution**: Check that dataset path exists and contains `version_info.json`

### Problem: "No images found in train set"
**Solution**:
- Check that dataset has `images/train/` directory
- Verify images are .jpg, .jpeg, or .png format

### Problem: Image displays but no bounding boxes
**Solutions**:
- Check "Show Bounding Boxes" checkbox is enabled
- Verify corresponding label file exists in `labels/train/`
- Check label file is not empty

### Problem: Bounding boxes look wrong
**Solutions**:
- This indicates detection quality issues
- May need to adjust detection confidence threshold
- May need to re-run pipeline with different settings

### Problem: Canvas is blank
**Solutions**:
- Image file may be corrupted
- Check browser console for errors
- Try next/previous image

## Next Steps After Verification

### ✅ If Annotations Look Good
Your dataset is ready for training!

**To train YOLO model:**
```bash
yolo train data=/Volumes/UBUNTU\ 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100/dataset.yaml model=yolov8n.pt epochs=50 imgsz=640
```

### ❌ If Annotations Need Improvement

**Option 1: Adjust Detection Settings**
Re-run pipeline with:
- Lower confidence threshold (more detections)
- Higher confidence threshold (fewer, better detections)

**Option 2: Manual Annotation**
Use tools like:
- labelImg
- CVAT
- Roboflow

**Option 3: Filter Dataset**
Remove images with poor annotations:
- Navigate to problem images
- Note their filenames
- Delete both image and label files

## Keyboard Shortcuts

Currently no keyboard shortcuts. Navigate using:
- Mouse clicks on dropdown
- Click Previous/Next buttons

**Future Enhancement**: Arrow keys for navigation

## Performance Notes

- Loading large datasets (1000+ images) may take a few seconds
- Canvas rendering is instant
- Each image loads on-demand (not pre-loaded)
- Smooth navigation between images

## Dataset File Structure

```
Abasolo_Whiskey_750ml_dataset_20251230_122100/
│
├── version_info.json          # Metadata (what you see in "Dataset Information")
├── dataset.yaml               # YOLO training config
├── README.md                  # Dataset documentation
├── annotation_gallery.html    # Standalone web gallery (alternative viewer)
│
├── images/
│   ├── train/                 # 1,250 training images
│   │   ├── IMG_001.jpg
│   │   ├── IMG_001_aug1.jpg
│   │   ├── IMG_001_aug2.jpg
│   │   └── ...
│   └── val/                   # 384 validation images
│       ├── IMG_150.jpg
│       └── ...
│
└── labels/
    ├── train/                 # 1,250 YOLO label files
    │   ├── IMG_001.txt
    │   ├── IMG_001_aug1.txt
    │   ├── IMG_001_aug2.txt
    │   └── ...
    └── val/                   # 384 YOLO label files
        ├── IMG_150.txt
        └── ...
```

## Alternative Visualization Methods

Besides the web app, you can also use:

### 1. Python Script (OpenCV Viewer)
```bash
python3 scripts/visualize_annotations.py \
  --dataset /Volumes/UBUNTU\ 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100 \
  --class-name "Abasolo Whiskey 750ml" \
  --samples 10 \
  --split train \
  --mode opencv
```

### 2. HTML Gallery (Static)
```bash
python3 scripts/visualize_annotations.py \
  --dataset /Volumes/UBUNTU\ 24_0/360Photo_Captures/Abasolo_Whiskey_750ml_dataset_20251230_122100 \
  --class-name "Abasolo Whiskey 750ml" \
  --mode html \
  --max-html 100
```

Then open `annotation_gallery.html` in your browser.

## Summary

The visualization tab provides:
- ✅ Quick dataset loading
- ✅ Easy navigation through images
- ✅ Real-time bounding box rendering
- ✅ Annotation coordinate display
- ✅ Train/Val split selection
- ✅ Toggle-able display options

Use it to verify your YOLO dataset quality before training to ensure the best possible model performance!
