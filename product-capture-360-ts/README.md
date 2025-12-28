# 360° Product Capture System for YOLOv11 Training

A professional TypeScript/Fastify application for capturing high-quality product images with automated background removal and preprocessing for YOLOv11 object detection training.

## 🎯 Perfect for Retail Product Training

This system is optimized for capturing liquor bottles and retail products with:
- **Automated background removal** using chroma key (green screen)
- **Multi-background synthesis** for diverse retail scenarios
- **Dataset augmentation** (rotation, brightness, contrast variations)
- **YOLO-format preprocessing** (640x640 with padding)
- **High-resolution capture** (up to 1920x1080)
- **Robust USB camera detection** with automatic retry

## 🚀 Features

### Photo Capture
- **Debounced capture**: Handles rapid clicks (120+ clicks/sec) with 200ms debounce
- **Session-based auto-capture**: Configure rate (e.g., 180/min, 250/min) and duration
- **Real-time preview**: MJPEG video stream at 10 FPS
- **High-resolution mode**: 1920x1080 for training images (fallback to 1280x720)

### Camera Support
- **Multi-platform**: macOS (AVFoundation), Windows (DirectShow), Linux (V4L2)
- **USB camera detection**: 3-retry mechanism with 500ms intervals
- **Automatic reconnection**: Handles camera disconnects gracefully
- **Device filtering**: Excludes screen capture devices

### YOLOv11 Preprocessing Pipeline

#### Background Removal
- **Chroma key masking**: Configurable color, tolerance, and softness
- **High-quality output**: FFmpeg with `-q:v 2` quality setting
- **Batch processing**: Process entire folders in one operation

#### Dataset Augmentation
For each input image and background combination:
1. **Rotation variations**: 0°, ±5°, ±10°
2. **Brightness adjustment**: 0, ±5%, ±10%
3. **Contrast adjustment**: 1.0, 1.1, 0.9, 1.15, 0.85
4. **Saturation adjustment**: 1.0, 1.1, 0.9, 1.2, 0.8

#### Retail Background Synthesis
- Apply multiple retail shelf/store backgrounds to a single product
- Automatically scale and position products on backgrounds
- Maintain aspect ratio with intelligent padding
- Generate hundreds of training variations from dozens of source images

#### YOLO Format
- **Square format**: 640x640 pixels (configurable)
- **Aspect ratio preservation**: Intelligent padding to prevent distortion
- **Annotation templates**: Auto-generated placeholder annotations
- **Directory structure**:
  ```
  yolo_dataset/
  ├── images/
  │   ├── product_bg0.jpg
  │   ├── product_bg0_aug0.jpg
  │   ├── product_bg0_aug1.jpg
  │   └── ...
  ├── labels/
  │   ├── product_bg0.txt
  │   ├── product_bg0_aug0.txt
  │   └── ...
  └── classes.txt
  ```

## 📋 Requirements

- **Node.js** 18+ and npm
- **FFmpeg** (must be in PATH)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org)
- **USB Camera** (optional, for live capture)
- **Green screen setup** (for best background removal)

## 🛠️ Installation

```bash
cd product-capture-360-ts
npm install
```

## 🎬 Usage

### Start the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

The web interface will be available at `http://localhost:5002`

### Workflow for YOLOv11 Training

#### 1. **Setup Camera & Storage**
- Click "🔍 Scan Cameras" to detect USB cameras
- Select your camera and click "🔌 Connect"
- Choose storage location (USB drive, folder, etc.)

#### 2. **Capture Product Images**
Two methods:

**Manual Capture:**
- Enter product name (e.g., "whiskey_bottle")
- Click "📸 Capture Image" for each angle
- Rotate product manually between captures

**Session Auto-Capture:**
- Set rate (e.g., 180 clicks/min = 3/sec)
- Set duration (e.g., 60 seconds)
- Click "▶️ Start" and rotate product smoothly
- System captures automatically at specified rate

#### 3. **Prepare Retail Backgrounds**
Collect or download retail environment images:
- Store shelves with similar products
- Different lighting conditions
- Various angles and perspectives
- Save paths: `/path/to/shelf1.jpg, /path/to/shelf2.jpg, ...`

#### 4. **Generate YOLOv11 Dataset**
- Navigate to "🎯 YOLOv11 Training Dataset" section
- Configure settings:
  - **Key color**: Select green (or click canvas to sample)
  - **Tolerance**: 0.20-0.30 (higher = more aggressive removal)
  - **Softness**: 0.10-0.20 (edge feathering)
  - **Target size**: 640 (YOLO standard)
  - **Augment count**: 3-5 variations per background
  - **Retail backgrounds**: Paste comma-separated paths

- Click "🚀 Generate YOLO Dataset"
- Wait for processing (creates `yolo_dataset/` folder)

#### 5. **Create Annotations**
- Click "📝 Create Annotations"
- Placeholder annotations created in `labels/` folder
- **Important**: Edit these annotations using a labeling tool:
  - [LabelImg](https://github.com/heartexlabs/labelImg)
  - [CVAT](https://github.com/opencv/cvat)
  - [Roboflow](https://roboflow.com)

#### 6. **Train YOLOv11**
```python
from ultralytics import YOLO

# Load a model
model = YOLO('yolov11n.pt')  # nano model

# Train the model
results = model.train(
    data='/path/to/yolo_dataset/data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    name='liquor_bottle_detector'
)
```

Create `data.yaml`:
```yaml
path: /path/to/yolo_dataset
train: images
val: images  # Split your data appropriately
nc: 1  # number of classes
names: ['product']  # or specific like ['liquor_bottle']
```

## 🔧 API Reference

### Camera Endpoints
- `GET /api/camera/scan` - List available cameras
- `POST /api/camera/init` - Initialize camera
  ```json
  {
    "camera_index": 0,
    "width": 1920,
    "height": 1080,
    "fps": 10
  }
  ```
- `GET /api/camera/health` - Camera metrics
- `POST /api/camera/reconnect` - Reconnect camera

### Capture Endpoints
- `POST /api/capture` - Capture single image (debounced 200ms)
  ```json
  {
    "product_name": "whiskey_bottle",
    "high_res": true
  }
  ```
- `POST /api/session/start` - Start auto-capture session
  ```json
  {
    "rate": 180,
    "duration": 60,
    "product_name": "whiskey_bottle"
  }
  ```
- `POST /api/session/stop` - Stop session

### Preprocessing Endpoints

#### Generate YOLO Dataset
```http
POST /api/preprocess/yolo
Content-Type: application/json

{
  "input_dir": "/path/to/captures",
  "output_dir": "/path/to/yolo_dataset",
  "key_color": "#00ff00",
  "tolerance": 0.25,
  "softness": 0.15,
  "background_images": ["/path/to/bg1.jpg", "/path/to/bg2.jpg"],
  "augment": true,
  "augment_count": 3,
  "target_size": 640
}
```

#### Generate Retail Dataset
```http
POST /api/preprocess/retail
Content-Type: application/json

{
  "input_dir": "/path/to/captures",
  "output_dir": "/path/to/retail_dataset",
  "key_color": "#00ff00",
  "tolerance": 0.25,
  "softness": 0.15,
  "retail_backgrounds": [
    "/path/to/shelf1.jpg",
    "/path/to/shelf2.jpg",
    "/path/to/shelf3.jpg"
  ],
  "augment_per_background": 3
}
```

#### Create Annotations
```http
POST /api/preprocess/create-annotations
Content-Type: application/json

{
  "images_dir": "/path/to/yolo_dataset/images",
  "class_name": "liquor_bottle"
}
```

### Background Removal Endpoints
- `POST /api/background/replace` - Batch background replacement
- `POST /api/background/preview` - Preview single image

## 💡 Tips for Best Results

### Photography Setup
1. **Green screen**: Use a solid green backdrop (chroma key green #00ff00)
2. **Lighting**: Even, diffused lighting to avoid shadows
3. **Distance**: Keep product 1-2 feet from green screen
4. **Camera**: Use highest resolution your USB camera supports
5. **Rotation**: Smooth, consistent rotation for 360° coverage

### Background Removal Tuning
- **Tolerance** too low → Green fringe remains
- **Tolerance** too high → Product edges get removed
- **Softness** → Controls edge feathering (0.10-0.20 works well)
- Use the preview feature to test settings on one image first

### Dataset Quality
- **Diversity**: Use 5-10 different retail backgrounds
- **Augmentation**: 3-5 variations per background
- **Quantity**: Aim for 500+ images for good YOLO performance
- **Manual review**: Check generated images for artifacts
- **Annotation accuracy**: Spend time on accurate bounding boxes

### Common Issues

**Camera not detected:**
- Unplug/replug USB camera
- Click "🔍 Scan Cameras" again (3-retry mechanism)
- Check camera permissions (macOS System Preferences)
- Verify FFmpeg is installed: `ffmpeg -version`

**Background removal quality:**
- Adjust tolerance/softness values
- Ensure even green screen lighting
- Keep product away from green screen
- Use preview mode to test settings

**Slow processing:**
- Reduce augment_count (try 2-3 instead of 5)
- Use fewer background images initially
- Process in smaller batches
- FFmpeg quality is set to `-q:v 2` (high quality)

## 🏗️ Architecture

```
product-capture-360-ts/
├── src/
│   ├── server.ts          # Fastify server + routes
│   ├── camera.ts          # Camera management (FFmpeg)
│   ├── storage.ts         # File storage management
│   ├── session.ts         # Auto-capture sessions
│   ├── background.ts      # Background removal (FFmpeg)
│   ├── preprocessing.ts   # YOLOv11 preprocessing pipeline
│   └── video.ts           # Video clip creation
├── public/
│   ├── index.html         # Web UI
│   └── app.js             # Frontend JavaScript
└── dist/                  # Compiled TypeScript
```

## 📦 Dependencies

- **fastify**: High-performance web server
- **@fastify/static**: Static file serving
- **@fastify/cors**: CORS support
- **execa**: Process execution utilities

## 🔬 Advanced Usage

### Custom Augmentation
Edit [src/preprocessing.ts](src/preprocessing.ts) to customize augmentation parameters:
- Rotation angles
- Brightness/contrast ranges
- Saturation adjustments
- Additional filters (blur, noise, etc.)

### Batch Processing Script
```javascript
const response = await fetch('http://localhost:5002/api/preprocess/retail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input_dir: '/Users/you/captures',
    retail_backgrounds: [
      '/Users/you/backgrounds/shelf1.jpg',
      '/Users/you/backgrounds/shelf2.jpg',
      '/Users/you/backgrounds/shelf3.jpg'
    ],
    augment_per_background: 5,
    tolerance: 0.30,
    softness: 0.15
  })
});

const result = await response.json();
console.log(`Generated ${result.processedCount} images`);
```

## 📄 License

MIT License - Feel free to use for commercial projects

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Additional augmentation techniques
- ML-based background segmentation (U2-Net, SAM)
- Auto-annotation using pre-trained models
- Batch progress indicators
- Multi-camera support

## 📞 Support

For issues or questions:
1. Check this README
2. Review FFmpeg logs in terminal
3. Test with preview mode first
4. Open an issue with screenshots/logs

---

**Happy training! 🎯📸**
