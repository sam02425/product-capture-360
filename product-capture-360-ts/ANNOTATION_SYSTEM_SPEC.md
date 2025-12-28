# 🎯 Annotation System - Complete Specification
## Image Collector - Powered by EyeAI

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Features & Capabilities](#features--capabilities)
4. [Technical Stack](#technical-stack)
5. [Implementation Phases](#implementation-phases)
6. [API Specifications](#api-specifications)
7. [UI/UX Design](#uiux-design)
8. [File Formats](#file-formats)

---

## 🎯 Overview

The Annotation System is a **local, web-based annotation tool** inspired by CVAT and Roboflow, designed to provide:
- Multi-type annotations (BBox, OBB, Polygon, Segmentation)
- AI-assisted annotation using pretrained models (YOLOv8, YOLOv11, SAM2)
- Video annotation with frame extraction
- Real-time visualization and validation
- Export to multiple formats (YOLO, COCO, Pascal VOC)

### Key Differentiators
- **100% Local** - No cloud dependencies, all processing on-device
- **AI-Assisted** - Leverage pretrained models for faster annotation
- **User-Friendly** - Roboflow-style intuitive interface
- **Production-Ready** - Export annotations ready for training

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Annotation  │  │    Canvas    │  │    Video     │      │
│  │   Toolbar    │  │    Engine    │  │    Player    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Label Manager & Export Controls             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Node.js/TypeScript)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Fastify    │  │     File     │  │     Video    │      │
│  │   Server     │  │   Manager    │  │   Processor  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Annotation Storage & Export               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           AI Models (Python Services)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   YOLOv8/    │  │     SAM2     │  │   Custom     │      │
│  │    v11       │  │  Segmentation│  │   Models     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features & Capabilities

### 1. Annotation Types

#### A. Bounding Box (BBox)
- **Use Case**: Standard object detection
- **Format**: `[x, y, width, height]` or `[x1, y1, x2, y2]`
- **Features**:
  - Click & drag to create
  - Resize handles (8 points)
  - Move by dragging
  - Label assignment
  - Confidence score (for AI-generated)

#### B. Oriented Bounding Box (OBB)
- **Use Case**: Rotated objects (aerial imagery, documents)
- **Format**: `[cx, cy, w, h, angle]`
- **Features**:
  - Rotation handle
  - All BBox features
  - Angle display (0-360°)

#### C. Polygon
- **Use Case**: Irregular shapes, precise boundaries
- **Format**: `[[x1, y1], [x2, y2], ..., [xn, yn]]`
- **Features**:
  - Click to add points
  - Drag points to adjust
  - Auto-close polygon
  - Simplification algorithm (Douglas-Peucker)
  - Minimum 3 points

#### D. Segmentation Mask
- **Use Case**: Pixel-perfect segmentation
- **Format**: Binary mask or RLE (Run-Length Encoding)
- **Features**:
  - Brush tool (adjustable size)
  - Eraser tool
  - Magic wand (threshold-based)
  - Polygon-to-mask conversion
  - Mask-to-polygon conversion

#### E. Multi-Object Annotation
- **Features**:
  - Unlimited objects per image/frame
  - Object grouping
  - Object relationships
  - Instance segmentation support

---

### 2. AI-Assisted Annotation

#### A. YOLOv8/v11 Detection
```python
# Auto-detect objects
POST /api/annotation/detect
{
  "image_path": "/path/to/image.jpg",
  "model": "yolov8n.pt",  # or yolov11n.pt
  "confidence": 0.3,
  "classes": [0, 1, 2],  # Optional: filter specific classes
  "iou_threshold": 0.45
}

Response:
{
  "detections": [
    {
      "bbox": [x1, y1, x2, y2],
      "class": 0,
      "class_name": "person",
      "confidence": 0.85,
      "id": "det_001"
    }
  ]
}
```

#### B. SAM2 Segmentation
```python
# Interactive segmentation with prompts
POST /api/annotation/segment
{
  "image_path": "/path/to/image.jpg",
  "prompts": {
    "points": [[x1, y1], [x2, y2]],  # Positive points
    "neg_points": [[x3, y3]],        # Negative points
    "bbox": [x1, y1, x2, y2]         # Optional bbox prompt
  },
  "model": "sam2_hiera_base_plus"
}

Response:
{
  "masks": [
    {
      "mask": "base64_encoded_mask",
      "area": 12500,
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.92
    }
  ]
}
```

#### C. Video Tracking
```python
# Track object through video frames
POST /api/annotation/track-video
{
  "video_path": "/path/to/video.mp4",
  "init_frame": 0,
  "init_bbox": [x1, y1, x2, y2],
  "model": "sam2",
  "frame_step": 5  # Track every 5th frame
}

Response:
{
  "tracking_id": "track_001",
  "frames": {
    "0": {"bbox": [...]},
    "5": {"bbox": [...]},
    "10": {"bbox": [...]}
  }
}
```

---

### 3. Video Annotation Features

#### A. Video Upload & Processing
- **Supported Formats**: MP4, AVI, MOV, MKV
- **Frame Extraction**:
  - Every Nth frame extraction
  - Key frame detection
  - Custom frame selection
  - Thumbnail generation

#### B. Video Player
- **Playback Controls**:
  - Play/Pause/Stop
  - Frame-by-frame navigation (← →)
  - Jump to frame (input box)
  - Playback speed control (0.25x - 2x)
  - Timeline scrubber

#### C. Frame Annotation
- **Features**:
  - Annotate individual frames
  - Copy annotations to next frame
  - Propagate annotations (tracking)
  - Interpolation between keyframes
  - Bulk operations (delete all, copy all)

#### D. Visualization
- **Annotation Overlay**:
  - Color-coded by class
  - Opacity control
  - Show/hide annotations
  - Object ID persistence across frames
  - Confidence score display

---

### 4. Label Management

#### Class/Label System
```javascript
{
  "classes": [
    {
      "id": 0,
      "name": "person",
      "color": "#FF5733",
      "supercategory": "human",
      "metadata": {}
    },
    {
      "id": 1,
      "name": "bottle",
      "color": "#33FF57",
      "supercategory": "product",
      "metadata": {
        "brand": "cognac",
        "size": "750ml"
      }
    }
  ]
}
```

**Features**:
- Add/Edit/Delete classes
- Color picker per class
- Hierarchical categories
- Custom metadata fields
- Import/Export class definitions

---

### 5. Export Formats

#### A. YOLO Format (txt)
```
# <class_id> <x_center> <y_center> <width> <height>
0 0.5 0.5 0.3 0.4
1 0.2 0.3 0.1 0.2
```

#### B. YOLO OBB Format
```
# <class_id> <x1> <y1> <x2> <y2> <x3> <y3> <x4> <y4>
0 100 100 200 100 200 200 100 200
```

#### C. COCO Format (json)
```json
{
  "images": [...],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [x, y, w, h],
      "area": 12500,
      "segmentation": [[x1,y1, x2,y2, ...]],
      "iscrowd": 0
    }
  ],
  "categories": [...]
}
```

#### D. Pascal VOC (xml)
```xml
<annotation>
  <object>
    <name>bottle</name>
    <bndbox>
      <xmin>100</xmin>
      <ymin>100</ymin>
      <xmax>200</xmax>
      <ymax>200</ymax>
    </bndbox>
  </object>
</annotation>
```

#### E. Custom JSON Format
```json
{
  "image": "image.jpg",
  "width": 1920,
  "height": 1080,
  "annotations": [
    {
      "id": "ann_001",
      "type": "bbox",
      "class": "bottle",
      "class_id": 1,
      "bbox": [100, 100, 200, 200],
      "confidence": 0.95,
      "metadata": {}
    }
  ]
}
```

---

## 🛠️ Technical Stack

### Frontend
- **Framework**: Vanilla JavaScript (lightweight, no framework overhead)
- **Canvas**: HTML5 Canvas API + Fabric.js (for advanced shape manipulation)
- **Video**: HTML5 Video API + Custom frame extraction
- **UI**: CSS Grid/Flexbox (matches existing Image Collector style)

### Backend
- **Server**: Fastify (Node.js/TypeScript) - Already in use
- **File Processing**: Sharp (images), FFmpeg (videos)
- **Storage**: File system with JSON metadata

### AI Models (Python)
- **Framework**: FastAPI (Python microservice)
- **Models**:
  - Ultralytics YOLOv8/v11
  - SAM2 (Segment Anything 2)
  - Optional: Custom trained models
- **Communication**: HTTP REST API

---

## 📅 Implementation Phases

### **Phase 1: Foundation** (Week 1)
- [ ] Create annotation tab UI structure
- [ ] Implement file browser for images
- [ ] Basic canvas setup with zoom/pan
- [ ] Simple bounding box drawing
- [ ] Label selector dropdown
- [ ] Save annotations to JSON

### **Phase 2: Core Annotation Tools** (Week 2)
- [ ] Implement all annotation types (BBox, OBB, Polygon, Segmentation)
- [ ] Annotation editing (move, resize, delete)
- [ ] Keyboard shortcuts
- [ ] Undo/Redo functionality
- [ ] Label management UI
- [ ] Color coding by class

### **Phase 3: Video Support** (Week 3)
- [ ] Video upload & frame extraction
- [ ] Custom video player with timeline
- [ ] Frame-by-frame navigation
- [ ] Annotation propagation across frames
- [ ] Video export with annotations

### **Phase 4: AI Integration** (Week 4)
- [ ] Set up Python FastAPI service
- [ ] Integrate YOLOv8/v11 detection
- [ ] Integrate SAM2 segmentation
- [ ] Auto-annotation workflow
- [ ] Confidence threshold controls
- [ ] Review & correct AI annotations

### **Phase 5: Export & Advanced Features** (Week 5)
- [ ] Implement all export formats
- [ ] Batch export functionality
- [ ] Annotation statistics dashboard
- [ ] Search & filter annotations
- [ ] Annotation quality metrics

### **Phase 6: Polish & Optimization** (Week 6)
- [ ] Performance optimization (large videos)
- [ ] Error handling & validation
- [ ] User documentation
- [ ] Keyboard shortcut reference
- [ ] Tutorial/onboarding

---

## 🔌 API Specifications

### Annotation CRUD APIs

#### GET /api/annotations/list
List all annotated images/videos
```json
Response: {
  "items": [
    {
      "path": "/path/to/image.jpg",
      "type": "image",
      "annotation_count": 5,
      "last_modified": "2024-01-01T00:00:00Z",
      "status": "completed"
    }
  ]
}
```

#### GET /api/annotations/get?path=...
Get annotations for specific file
```json
Response: {
  "file_path": "/path/to/image.jpg",
  "annotations": [...],
  "metadata": {...}
}
```

#### POST /api/annotations/save
Save annotations
```json
Request: {
  "file_path": "/path/to/image.jpg",
  "annotations": [...],
  "metadata": {...}
}
```

#### POST /api/annotations/export
Export annotations in specific format
```json
Request: {
  "format": "yolo",  // yolo, coco, voc, custom
  "filter": {
    "classes": [0, 1],
    "min_confidence": 0.5
  },
  "output_dir": "/path/to/export"
}
```

### Video Processing APIs

#### POST /api/video/upload
Upload and process video

#### POST /api/video/extract-frames
Extract frames from video

#### GET /api/video/frame?video=...&frame=...
Get specific frame from video

---

## 🎨 UI/UX Design

### Layout Structure
```
┌────────────────────────────────────────────────────────────┐
│  Header: Image Collector - Annotation Tool                 │
├────────────┬───────────────────────────────────────────────┤
│            │                                                │
│  Sidebar   │           Canvas Area                          │
│            │                                                │
│  - Files   │     [Image/Video with annotations]            │
│  - Labels  │                                                │
│  - Tools   │                                                │
│  - AI      │                                                │
│            │                                                │
├────────────┴───────────────────────────────────────────────┤
│  Bottom Panel: Properties & Timeline (for video)           │
└────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts
- `B` - BBox tool
- `O` - OBB tool
- `P` - Polygon tool
- `S` - Segmentation tool
- `Delete` - Delete selected annotation
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+C` - Copy annotation
- `Ctrl+V` - Paste annotation
- `Space` - Play/Pause (video)
- `←/→` - Previous/Next frame (video)
- `1-9` - Quick class selection

---

## 💾 File Formats

### Annotation Storage Format
```json
{
  "version": "1.0.0",
  "file_path": "/path/to/image.jpg",
  "file_type": "image",
  "width": 1920,
  "height": 1080,
  "created_at": "2024-01-01T00:00:00Z",
  "modified_at": "2024-01-01T00:00:00Z",
  "annotator": "user",
  "annotations": [
    {
      "id": "ann_001",
      "type": "bbox",
      "class_id": 0,
      "class_name": "bottle",
      "bbox": [100, 100, 200, 200],
      "confidence": 1.0,
      "source": "manual",
      "metadata": {
        "reviewed": true,
        "notes": ""
      }
    }
  ],
  "video_metadata": {
    "total_frames": 300,
    "fps": 30,
    "duration": 10,
    "frame_annotations": {
      "0": [...],
      "5": [...],
      "10": [...]
    }
  }
}
```

---

## 🚀 Getting Started (After Implementation)

### 1. Start Backend Services
```bash
# Start Node.js server
npm run dev

# Start Python AI service (in separate terminal)
cd scripts/ai_service
python3 app.py
```

### 2. Access Annotation Tool
```
http://localhost:5002/image-collector.html
Navigate to "Annotation" tab
```

### 3. Workflow
1. Upload images/videos
2. Select annotation type
3. Create annotations (manual or AI-assisted)
4. Review and correct
5. Export in desired format

---

## 📚 Additional Resources

### Model Downloads
- YOLOv8: `yolo export model=yolov8n.pt format=onnx`
- YOLOv11: Auto-download from Ultralytics
- SAM2: Download checkpoints from Meta AI

### Performance Tips
- Use smaller YOLO models (n/s) for faster inference
- Reduce SAM2 resolution for large videos
- Extract every Nth frame for long videos
- Use GPU acceleration when available

---

**Document Version**: 1.0.0
**Last Updated**: December 28, 2024
**Maintained by**: EyeAI - Image Collector Team
