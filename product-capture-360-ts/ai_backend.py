"""
AI Backend for Annotation System
Provides YOLOv8/v11 detection and SAM2 segmentation

Requirements:
pip install fastapi uvicorn ultralytics opencv-python pillow numpy torch torchvision
pip install git+https://github.com/facebookresearch/segment-anything-2.git
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import cv2
import numpy as np
from PIL import Image
import io
import base64
import os
import json
import tempfile
from pathlib import Path

# Initialize FastAPI app with Swagger UI
app = FastAPI(
    title="Annotation AI Backend",
    version="2.0.0",
    description="""
    🤖 Professional AI-powered annotation backend with YOLOv8/v11 detection, SAM2 segmentation, and video processing.

    ## Features

    * **Object Detection**: YOLOv8/v11 models for automatic object detection
    * **Segmentation**: SAM2 (Segment Anything 2) for precise object segmentation
    * **Video Processing**: Frame extraction and object tracking across videos
    * **Export Formats**: YOLO, COCO, Pascal VOC support

    ## Quick Start

    1. Upload an image to `/detect` for automatic object detection
    2. Use `/segment` with SAM2 for precise segmentation
    3. Upload videos to `/track` for frame-by-frame tracking
    4. Extract video frames with `/extract-frames`

    ## Model Downloads

    Models are automatically downloaded on first use and cached locally.
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Detection", "description": "YOLO object detection endpoints"},
        {"name": "Segmentation", "description": "SAM2 segmentation endpoints"},
        {"name": "Video", "description": "Video processing and tracking"},
        {"name": "Utils", "description": "Utility endpoints"},
    ]
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model storage
YOLO_MODELS = {}
SAM2_MODEL = None


def load_yolo_model(model_name: str):
    """Load YOLO model (lazy loading)"""
    if model_name not in YOLO_MODELS:
        try:
            from ultralytics import YOLO
            YOLO_MODELS[model_name] = YOLO(f"{model_name}.pt")
            print(f"Loaded YOLO model: {model_name}")
        except Exception as e:
            print(f"Error loading YOLO model {model_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to load model: {model_name}")
    return YOLO_MODELS[model_name]


def load_sam2_model():
    """Load SAM2 model (lazy loading)"""
    global SAM2_MODEL
    if SAM2_MODEL is None:
        try:
            import torch
            print("SAM2 model loading...")

            # Try to import SAM2
            try:
                from sam2.build_sam import build_sam2
                from sam2.sam2_image_predictor import SAM2ImagePredictor

                # Download and load SAM2 checkpoint
                checkpoint = "./checkpoints/sam2_hiera_large.pt"
                model_cfg = "sam2_hiera_l.yaml"

                if not os.path.exists(checkpoint):
                    print("SAM2 checkpoint not found. Please download from:")
                    print("https://github.com/facebookresearch/segment-anything-2")
                    raise FileNotFoundError("SAM2 checkpoint not found")

                sam2_model = build_sam2(model_cfg, checkpoint)
                SAM2_MODEL = SAM2ImagePredictor(sam2_model)
                print("✓ SAM2 model loaded successfully")

            except ImportError:
                print("⚠ SAM2 not installed. Install with:")
                print("  pip install git+https://github.com/facebookresearch/segment-anything-2.git")
                print("Using fallback mode (returns placeholder data)")
                SAM2_MODEL = "placeholder"

        except Exception as e:
            print(f"Error loading SAM2: {e}")
            SAM2_MODEL = "placeholder"

    return SAM2_MODEL


def decode_image(file_bytes: bytes) -> np.ndarray:
    """Decode image from bytes to numpy array"""
    image = Image.open(io.BytesIO(file_bytes))
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def encode_image(image: np.ndarray) -> str:
    """Encode numpy array to base64 string"""
    _, buffer = cv2.imencode('.png', image)
    return base64.b64encode(buffer).decode('utf-8')


# API Models
class DetectionRequest(BaseModel):
    model: str = "yolov8n"
    confidence: float = 0.25
    iou: float = 0.45


class DetectionResult(BaseModel):
    bbox: List[float]  # [x, y, w, h]
    confidence: float
    class_id: int
    class_name: str


class SegmentationPoint(BaseModel):
    x: float
    y: float


class SegmentationRequest(BaseModel):
    points: List[SegmentationPoint]
    labels: List[int]  # 1 for foreground, 0 for background


# Endpoints
@app.get("/", tags=["Utils"])
async def root():
    """
    API Root - Health check and information

    Returns basic information about the API and available endpoints.
    """
    return {
        "name": "Annotation AI Backend",
        "version": "2.0.0",
        "status": "operational",
        "documentation": "/docs",
        "endpoints": {
            "detection": ["/detect"],
            "segmentation": ["/segment", "/segment-sam2"],
            "video": ["/track", "/extract-frames"],
            "utils": ["/models", "/health", "/validate"]
        },
        "swagger_ui": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health", tags=["Utils"])
async def health_check():
    """
    Health Check Endpoint

    Returns the health status of the API and loaded models.
    """
    return {
        "status": "healthy",
        "models_loaded": {
            "yolo": list(YOLO_MODELS.keys()),
            "sam2": SAM2_MODEL is not None and SAM2_MODEL != "placeholder"
        },
        "timestamp": str(np.datetime64('now'))
    }


@app.get("/models", tags=["Utils"])
async def list_models():
    """
    List Available Models

    Returns all available YOLO and SAM2 models, along with currently loaded models.
    """
    return {
        "yolo": {
            "v8": ["yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x"],
            "v11": ["yolov11n", "yolov11s", "yolov11m", "yolov11l", "yolov11x"],
            "description": {
                "n": "Nano - Fastest, smallest",
                "s": "Small - Fast, good balance",
                "m": "Medium - Balanced speed/accuracy",
                "l": "Large - Accurate, slower",
                "x": "Extra Large - Most accurate, slowest"
            }
        },
        "sam2": {
            "available": ["sam2-hiera-large", "sam2-hiera-base", "sam2-hiera-small"],
            "status": "loaded" if SAM2_MODEL and SAM2_MODEL != "placeholder" else "not_loaded"
        },
        "loaded": {
            "yolo": list(YOLO_MODELS.keys()),
            "sam2": SAM2_MODEL is not None
        }
    }


@app.post("/detect", tags=["Detection"])
async def detect_objects(
    file: UploadFile = File(..., description="Image file (JPG, PNG, etc.)"),
    model: str = Form("yolov8n", description="YOLO model name (yolov8n, yolov8s, yolov11n, etc.)"),
    confidence: float = Form(0.25, ge=0.0, le=1.0, description="Confidence threshold"),
    iou: float = Form(0.45, ge=0.0, le=1.0, description="IOU threshold for NMS")
):
    """
    🎯 **YOLO Object Detection**

    Detect objects in an image using YOLOv8 or YOLOv11 models.

    **Parameters:**
    - `file`: Image file (JPG, PNG, BMP, etc.)
    - `model`: YOLO model variant (n=nano, s=small, m=medium, l=large, x=xlarge)
    - `confidence`: Minimum confidence score for detections (0.0 to 1.0)
    - `iou`: IOU threshold for non-maximum suppression (0.0 to 1.0)

    **Returns:**
    - List of detected objects with bounding boxes, confidence scores, and class labels

    **Example:**
    ```python
    import requests

    files = {'file': open('image.jpg', 'rb')}
    data = {'model': 'yolov8n', 'confidence': 0.25}
    response = requests.post('http://localhost:8000/detect', files=files, data=data)
    print(response.json())
    ```
    """
    try:
        # Load model
        yolo = load_yolo_model(model)

        # Read and decode image
        contents = await file.read()
        image = decode_image(contents)
        height, width = image.shape[:2]

        # Run inference
        results = yolo(image, conf=confidence, iou=iou, verbose=False)

        # Parse results
        detections = []
        for result in results:
            boxes = result.boxes
            for i in range(len(boxes)):
                box = boxes.xyxy[i].cpu().numpy()  # [x1, y1, x2, y2]
                x1, y1, x2, y2 = box

                detections.append({
                    "bbox": [
                        float(x1),
                        float(y1),
                        float(x2 - x1),
                        float(y2 - y1)
                    ],
                    "confidence": float(boxes.conf[i].cpu().numpy()),
                    "class_id": int(boxes.cls[i].cpu().numpy()),
                    "class_name": yolo.names[int(boxes.cls[i].cpu().numpy())]
                })

        return {
            "success": True,
            "model": model,
            "image_width": width,
            "image_height": height,
            "detections": detections,
            "count": len(detections)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/segment")
async def segment_object(
    file: UploadFile = File(...),
    points: Optional[str] = None
):
    """
    Segment object using SAM2

    Args:
        file: Image file
        points: JSON string of points [{"x": 100, "y": 200, "label": 1}, ...]

    Returns:
        Segmentation mask as base64 encoded image
    """
    try:
        # For now, return placeholder response
        # TODO: Implement actual SAM2 integration
        return {
            "success": False,
            "message": "SAM2 segmentation will be implemented in Phase 2.1",
            "note": "SAM2 requires additional setup with segment-anything-2 package"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/track")
async def track_video(
    file: UploadFile = File(...),
    model: str = "yolov8n",
    confidence: float = 0.25
):
    """
    Track objects in video

    Args:
        file: Video file
        model: YOLO model name
        confidence: Confidence threshold

    Returns:
        Frame-by-frame tracking results
    """
    try:
        # Load model
        yolo = load_yolo_model(model)

        # Save uploaded video temporarily
        temp_video_path = f"/tmp/{file.filename}"
        with open(temp_video_path, "wb") as f:
            f.write(await file.read())

        # Open video
        cap = cv2.VideoCapture(temp_video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Track objects
        results = yolo.track(temp_video_path, conf=confidence, persist=True, verbose=False)

        # Parse tracking results
        tracks = []
        for frame_idx, result in enumerate(results):
            if result.boxes.id is not None:
                boxes = result.boxes.xyxy.cpu().numpy()
                track_ids = result.boxes.id.cpu().numpy()
                classes = result.boxes.cls.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()

                for i in range(len(boxes)):
                    x1, y1, x2, y2 = boxes[i]
                    tracks.append({
                        "frame": frame_idx,
                        "track_id": int(track_ids[i]),
                        "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                        "class_id": int(classes[i]),
                        "class_name": yolo.names[int(classes[i])],
                        "confidence": float(confs[i])
                    })

        # Cleanup
        cap.release()
        os.remove(temp_video_path)

        return {
            "success": True,
            "model": model,
            "fps": fps,
            "frame_count": frame_count,
            "tracks": tracks,
            "track_count": len(set([t["track_id"] for t in tracks]))
        }

    except Exception as e:
        # Cleanup on error
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("Starting AI Backend Server...")
    print("Endpoints:")
    print("  - POST /detect: YOLO object detection")
    print("  - POST /segment: SAM2 segmentation (Phase 2.1)")
    print("  - POST /track: Video object tracking")
    print("  - GET /models: List available models")
    print("\nRun with: uvicorn ai_backend:app --host 0.0.0.0 --port 8000 --reload")

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
