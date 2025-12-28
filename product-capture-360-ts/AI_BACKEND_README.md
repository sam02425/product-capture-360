# AI Backend for Annotation System

Python FastAPI backend providing AI-powered annotation capabilities using YOLOv8/v11 and SAM2.

## Features

- **Object Detection**: YOLOv8 and YOLOv11 models for automatic object detection
- **Video Tracking**: Track objects across video frames
- **Segmentation** (Coming Soon): SAM2 for precise object segmentation

## Setup

### 1. Install Python Dependencies

```bash
# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Start the AI Backend

```bash
# Method 1: Direct Python
python ai_backend.py

# Method 2: Using uvicorn
uvicorn ai_backend:app --host 0.0.0.0 --port 8000 --reload
```

The backend will start on `http://localhost:8000`

## API Endpoints

### 1. GET `/` - Health Check
Returns API information and available endpoints.

### 2. GET `/models` - List Available Models
Returns all available YOLO and SAM2 models.

**Response:**
```json
{
  "yolo": ["yolov8n", "yolov8s", "yolov8m", "yolov11n", ...],
  "sam2": ["sam2-hiera-large", ...],
  "loaded": ["yolov8n"]
}
```

### 3. POST `/detect` - Object Detection
Detect objects in an image using YOLO.

**Parameters:**
- `file`: Image file (multipart/form-data)
- `model`: YOLO model name (default: "yolov8n")
- `confidence`: Confidence threshold 0.0-1.0 (default: 0.25)
- `iou`: IOU threshold for NMS (default: 0.45)

**Example Request:**
```bash
curl -X POST "http://localhost:8000/detect" \
  -F "file=@image.jpg" \
  -F "model=yolov8n" \
  -F "confidence=0.25"
```

**Response:**
```json
{
  "success": true,
  "model": "yolov8n",
  "image_width": 1920,
  "image_height": 1080,
  "detections": [
    {
      "bbox": [100, 200, 150, 300],
      "confidence": 0.89,
      "class_id": 0,
      "class_name": "person"
    }
  ],
  "count": 1
}
```

### 4. POST `/track` - Video Object Tracking
Track objects across video frames.

**Parameters:**
- `file`: Video file (multipart/form-data)
- `model`: YOLO model name (default: "yolov8n")
- `confidence`: Confidence threshold (default: 0.25)

**Response:**
```json
{
  "success": true,
  "model": "yolov8n",
  "fps": 30,
  "frame_count": 300,
  "tracks": [
    {
      "frame": 0,
      "track_id": 1,
      "bbox": [100, 200, 150, 300],
      "class_id": 0,
      "class_name": "person",
      "confidence": 0.89
    }
  ],
  "track_count": 5
}
```

### 5. POST `/segment` - SAM2 Segmentation (Coming Soon)
Segment objects using SAM2.

## Available YOLO Models

### YOLOv8
- `yolov8n` - Nano (fastest, smallest)
- `yolov8s` - Small
- `yolov8m` - Medium
- `yolov8l` - Large
- `yolov8x` - Extra Large (slowest, most accurate)

### YOLOv11
- `yolov11n` - Nano
- `yolov11s` - Small
- `yolov11m` - Medium
- `yolov11l` - Large
- `yolov11x` - Extra Large

## Model Download

Models are automatically downloaded on first use by Ultralytics. They will be cached in:
- **Linux/Mac**: `~/.cache/ultralytics/`
- **Windows**: `C:\Users\<username>\AppData\Local\Ultralytics\cache\`

## Performance Tips

1. **Use smaller models for speed**: `yolov8n` or `yolov11n` for real-time performance
2. **Use larger models for accuracy**: `yolov8x` or `yolov11x` for best results
3. **Adjust confidence threshold**: Lower values detect more objects (more false positives)
4. **GPU acceleration**: Install CUDA-enabled PyTorch for faster inference

## Usage from Frontend

The frontend automatically connects to the AI backend at `http://localhost:8000`.

1. Upload an image in the Annotation tab
2. Select a YOLO model from the dropdown
3. Click "✨ Auto-Annotate"
4. Review and edit the detected annotations

## Troubleshooting

### CORS Errors
The backend has CORS enabled for all origins. If you still face issues, check your browser console.

### Model Loading Errors
- Ensure you have internet connection for first-time model download
- Check disk space (models are ~6MB to ~200MB)
- Verify Python version (3.8+ required)

### Performance Issues
- Install GPU-accelerated PyTorch for CUDA support
- Use smaller models (yolov8n, yolov11n)
- Reduce image resolution before detection

## Development

### Running Tests
```bash
# Install test dependencies
pip install pytest httpx

# Run tests
pytest test_ai_backend.py
```

### Adding Custom Models
Edit `ai_backend.py` and modify the `list_models()` endpoint to include your custom trained models.

## License

This backend integrates with:
- **Ultralytics YOLO**: AGPL-3.0 License
- **SAM2**: Apache 2.0 License

Ensure compliance with respective licenses when deploying.
