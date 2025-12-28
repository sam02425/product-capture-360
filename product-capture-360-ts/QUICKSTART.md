# 🚀 Quick Start Guide - Liquor Bottle YOLOv11 Training

Get from product photos to trained model in 30 minutes.

## Step 1: Install & Run (2 min)

```bash
cd product-capture-360-ts
npm install
npm run dev
```

Open: `http://localhost:5002`

## Step 2: Setup Camera (2 min)

1. Connect USB camera
2. Click **"🔍 Scan Cameras"**
3. Select your camera from dropdown
4. Click **"🔌 Connect"**
5. Verify live preview appears

## Step 3: Capture Product Images (10 min)

### Setup:
- Place liquor bottle on green screen backdrop
- Position camera to capture full bottle
- Ensure even lighting

### Capture Options:

**Option A: Manual (for precise control)**
1. Enter product name: `whiskey_bottle`
2. Click **"📸 Capture Image"**
3. Rotate bottle ~10°
4. Repeat 36 times (full 360°)

**Option B: Auto-Session (recommended)**
1. Enter product name: `whiskey_bottle`
2. Set rate: `180` clicks/min (3 per second)
3. Set duration: `60` seconds
4. Click **"▶️ Start"**
5. **Slowly rotate bottle** continuously for 60 seconds
6. System captures ~180 images automatically

## Step 4: Prepare Backgrounds (5 min)

Download or photograph 3-5 retail shelf backgrounds:

**Quick Option:** Use free stock photos
- [Unsplash Shelves](https://unsplash.com/s/photos/retail-shelf)
- [Pexels Liquor Store](https://www.pexels.com/search/liquor%20store/)

Save them to: `/Users/you/backgrounds/`

Example paths:
```
/Users/you/backgrounds/shelf1.jpg
/Users/you/backgrounds/shelf2.jpg
/Users/you/backgrounds/shelf3.jpg
```

## Step 5: Generate Training Dataset (5 min)

1. Scroll to **"🎯 YOLOv11 Training Dataset"** section

2. Configure settings:
   - **Key color**: Green (click canvas to sample if needed)
   - **Tolerance**: `0.25`
   - **Softness**: `0.15`
   - **Target size**: `640`
   - **Augment count**: `3`
   - **Retail backgrounds**: Paste your paths:
     ```
     /Users/you/backgrounds/shelf1.jpg, /Users/you/backgrounds/shelf2.jpg, /Users/you/backgrounds/shelf3.jpg
     ```

3. Click **"🚀 Generate YOLO Dataset"**

4. Wait for processing...
   - With 180 input images × 3 backgrounds × 3 augmentations
   - **Total: ~1,620 training images!**

## Step 6: Label Images (5-10 min)

### Install LabelImg:
```bash
pip install labelimg
labelimg
```

### Label Your Dataset:
1. Open: `yolo_dataset/images/`
2. Draw bounding boxes around bottles
3. Save annotations to: `yolo_dataset/labels/`
4. Or use auto-generated placeholders as starting point

**Pro tip:** Template annotations are created - just adjust them!

## Step 7: Train YOLOv11 (Variable)

Create `data.yaml`:
```yaml
path: /path/to/yolo_dataset
train: images
val: images  # Split appropriately
nc: 1
names: ['liquor_bottle']
```

Train:
```python
from ultralytics import YOLO

model = YOLO('yolov11n.pt')
results = model.train(
    data='data.yaml',
    epochs=100,
    imgsz=640,
    batch=16
)
```

## 🎯 Expected Results

With this setup:
- **Dataset size**: 1,500-2,000 images
- **Training time**: 15-30 min (on GPU)
- **mAP@50**: 85-95% (after 100 epochs)
- **Inference speed**: 100+ FPS (on GPU)

## 💡 Pro Tips

### For Better Results:
1. **Capture more angles**: 360+ images for complex products
2. **Vary lighting**: Capture same bottle under different lights
3. **More backgrounds**: 5-10 different retail scenes
4. **Higher augmentation**: 5 variations per background
5. **Manual annotation**: Spend time on accurate boxes

### Common Gotchas:
- ✅ Keep bottle centered in frame
- ✅ Avoid green bottle caps (chroma key conflict)
- ✅ Use even lighting on green screen
- ✅ 1-2 feet distance from backdrop
- ✅ Check first few augmented images for quality

### Troubleshooting:
- **Green fringe on bottle?** → Increase tolerance to 0.30
- **Bottle edges clipped?** → Decrease tolerance to 0.20
- **Camera disconnects?** → Click "Reconnect" button
- **Slow processing?** → Reduce augment count or backgrounds

## 📊 Dataset Structure

After generation:
```
yolo_dataset/
├── images/
│   ├── whiskey_bottle_bg0.jpg          # Background 1
│   ├── whiskey_bottle_bg0_aug0.jpg     # Augmentation 1
│   ├── whiskey_bottle_bg0_aug1.jpg     # Augmentation 2
│   ├── whiskey_bottle_bg0_aug2.jpg     # Augmentation 3
│   ├── whiskey_bottle_bg1.jpg          # Background 2
│   └── ...
├── labels/
│   ├── whiskey_bottle_bg0.txt          # YOLO format
│   └── ...
└── classes.txt                          # Class names
```

## 🎬 Next Steps

1. **Split dataset**: 80% train, 20% validation
2. **Train model**: Use GPU for faster training
3. **Evaluate**: Check mAP on validation set
4. **Fine-tune**: Adjust hyperparameters
5. **Deploy**: Export to ONNX/TensorRT for production

## 🆘 Need Help?

Check [README.md](README.md) for:
- Full API reference
- Advanced configuration
- Architecture details
- Troubleshooting guide

---

**You're ready to go! 🍾🎯**
