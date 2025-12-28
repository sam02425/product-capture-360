# Annotation System - User Guide

Complete guide for using the advanced annotation system with AI-powered features.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Annotation Tools](#annotation-tools)
3. [AI-Powered Annotation](#ai-powered-annotation)
4. [Keyboard Shortcuts](#keyboard-shortcuts)
5. [Export Formats](#export-formats)
6. [Video Annotation](#video-annotation)
7. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### 1. Access the Annotation Tab

1. Open http://localhost:5002/image-collector.html
2. Click the **🏷️ Annotation** tab
3. You'll see a 3-column layout:
   - **Left**: Files, Labels, Tools, AI Assist
   - **Center**: Canvas for annotation
   - **Right**: Properties and Export

### 2. Upload Images

1. Click **📂 Upload Files** in the Files section
2. Select one or multiple images
3. Images appear as thumbnails in the file list
4. Click any thumbnail to load it on the canvas

### 3. Create Labels

1. Type a label name in the **Labels** section (e.g., "bottle", "cap", "logo")
2. Click the **+** button
3. Labels are automatically assigned colors from a palette
4. Select a label before creating annotations

---

## Annotation Tools

### 1. Bounding Box (B)

**Purpose**: Rectangular boxes for object detection

**How to Use**:
1. Press `B` or click the BBox tool
2. Click and drag on the image
3. Release to create the box
4. The box is automatically assigned to the selected label

**Best For**: Standard object detection (YOLO, COCO format)

### 2. Oriented Bounding Box (O)

**Purpose**: Rotated rectangles for objects at angles

**How to Use**:
1. Press `O` or click the OBB tool
2. Click and drag to create the box
3. Hold `Shift` while dragging to rotate
4. Release to finalize

**Best For**: Text detection, rotated objects, aerial imagery

### 3. Polygon (P)

**Purpose**: Irregular shapes with multiple points

**How to Use**:
1. Press `P` or click the Polygon tool
2. Click to add each point of the polygon
3. Click near the first point (within 10px) to close the polygon
   - OR press `Enter` to finish (minimum 3 points required)
4. Press `Escape` to cancel

**Best For**: Complex object boundaries, segmentation masks

### 4. Segmentation Brush (S)

**Purpose**: Paint-style segmentation for precise masks

**How to Use**:
1. Press `S` or click the Segmentation tool
2. Click and drag to paint on the object
3. Release and continue painting to add more strokes
4. Press `Enter` when finished
5. Press `Escape` to cancel

**Best For**: Instance segmentation, medical imaging, fine-grained masks

### 5. Select Tool (V)

**Purpose**: Select and inspect existing annotations

**How to Use**:
1. Press `V` or click the Select tool
2. Click on any annotation to select it
3. View properties in the right panel
4. Press `Delete` to remove selected annotation

### 6. Pan Tool (H)

**Purpose**: Navigate around the image

**How to Use**:
1. Press `H` or click the Pan tool
2. Click and drag to move the canvas
3. Use mouse wheel to zoom in/out

---

## AI-Powered Annotation

### Setup AI Backend

Before using AI features, start the Python backend:

```bash
# Install dependencies (first time only)
pip install -r requirements.txt

# Start the AI backend
python ai_backend.py
```

The backend will run on http://localhost:8000

### Auto-Annotate with YOLO

1. Load an image in the annotation tab
2. Select a YOLO model from the **🤖 AI Assist** dropdown:
   - `yolov8n` - Fastest, smallest
   - `yolov8s` - Fast, small
   - `yolov8m` - Balanced
   - `yolov11n` - Latest, nano
   - `yolov11s` - Latest, small
3. Click **✨ Auto-Annotate**
4. Wait for detection to complete
5. Review the detected annotations
6. Edit, delete, or add manual annotations as needed

**What Happens**:
- YOLOv8/v11 detects objects in the image
- Labels are automatically created for detected classes
- Bounding boxes are added to the canvas
- You can refine the AI-generated annotations

### Supported Detection Classes

YOLO models detect 80 COCO classes including:
- person, bicycle, car, motorcycle, airplane, bus, train, truck
- bottle, cup, fork, knife, spoon, bowl
- laptop, mouse, keyboard, cell phone, book
- And 60+ more common objects

### Video Tracking (Coming Soon)

Feature will support:
- Upload video files
- Frame-by-frame extraction
- Object tracking across frames
- Export annotations for all frames

---

## Keyboard Shortcuts

### Tools
| Key | Action |
|-----|--------|
| `B` | Bounding Box |
| `O` | Oriented Bounding Box |
| `P` | Polygon |
| `S` | Segmentation |
| `V` | Select |
| `H` | Pan |

### Actions
| Key | Action |
|-----|--------|
| `Enter` | Finish polygon/segmentation |
| `Escape` | Cancel current shape |
| `Delete` | Delete selected annotation |
| `T` | Toggle annotation visibility |
| `?` | Show keyboard shortcuts help |

### Zoom
| Key | Action |
|-----|--------|
| `0` | Reset zoom to 100% |
| `+` or `=` | Zoom in |
| `-` or `_` | Zoom out |
| Mouse Wheel | Zoom in/out at cursor |

### Undo/Redo
| Key | Action |
|-----|--------|
| `Ctrl+Z` (⌘+Z) | Undo last action |
| `Ctrl+Y` (⌘+Y) | Redo last undone action |

---

## Export Formats

### 1. YOLO Format (.txt)

**Format**: One `.txt` file per image with normalized coordinates

```
class_id center_x center_y width height
0 0.5 0.5 0.2 0.3
1 0.3 0.4 0.15 0.25
```

**Coordinates**: Normalized to 0-1 range
**Best For**: Training YOLO models

### 2. YOLO OBB Format (.txt)

**Format**: Oriented bounding boxes for YOLO-OBB

```
class_id cx cy width height angle
0 0.5 0.5 0.2 0.3 45
```

**Best For**: Rotated object detection

### 3. COCO Format (.json)

**Format**: Single JSON file with all annotations

```json
{
  "images": [...],
  "annotations": [...],
  "categories": [...]
}
```

**Best For**: Training Detectron2, Mask R-CNN

### 4. Pascal VOC (.xml)

**Format**: One XML file per image (Coming Soon)

**Best For**: Legacy computer vision models

### 5. Custom JSON

**Format**: Simple JSON with all annotations

```json
{
  "files": [...],
  "labels": [...]
}
```

**Best For**: Custom training pipelines

### How to Export

**Export Current Image**:
1. Select export format from dropdown
2. Click **📥 Export Current**
3. File downloads automatically

**Export All Images**:
1. Select export format
2. Click **📦 Export All**
3. All annotations download

---

## Video Annotation

### Phase 2.2 Feature (Coming Soon)

**Capabilities**:
1. Upload video files (.mp4, .avi, .mov)
2. Automatic frame extraction
3. Annotate key frames
4. Propagate annotations across frames
5. Object tracking with YOLO
6. Export frame-by-frame annotations

**Workflow**:
1. Upload video file
2. System extracts frames at configurable FPS
3. Annotate first frame
4. Run tracking to propagate annotations
5. Review and refine tracked annotations
6. Export all frame annotations

---

## Tips & Best Practices

### Annotation Quality

1. **Be Consistent**: Use the same label names across all images
2. **Avoid Overlap**: Minimize overlapping bounding boxes
3. **Tight Boxes**: Make boxes as tight as possible around objects
4. **Complete Objects**: Include the entire object, even if partially occluded

### Performance

1. **Use Appropriate Models**: Smaller models (yolov8n) for speed, larger (yolov8x) for accuracy
2. **Batch Process**: Annotate similar images together
3. **Save Frequently**: Annotations are saved automatically per file, but export periodically
4. **Zoom Strategically**: Zoom in for precision, zoom out for context

### AI-Assisted Workflow

1. **Start with AI**: Run auto-annotation first
2. **Review Carefully**: AI isn't perfect - check all detections
3. **Add Missing Objects**: AI may miss objects with low confidence
4. **Remove False Positives**: Delete incorrect detections
5. **Refine Boundaries**: Adjust boxes for better accuracy

### Label Management

1. **Hierarchical Labels**: Use consistent naming (e.g., "bottle_plastic", "bottle_glass")
2. **Limit Labels**: Too many labels can hurt model performance
3. **Balanced Dataset**: Ensure all labels have similar annotation counts
4. **Document Labels**: Keep a list of all labels and their meanings

### Export Strategy

1. **Test with Small Batch**: Export and test with a few images first
2. **Split Train/Val**: Separate images for training and validation
3. **Version Control**: Keep track of different annotation versions
4. **Backup Exports**: Save exports in multiple locations

---

## Troubleshooting

### AI Backend Not Connecting

**Problem**: "Auto-annotation failed" error

**Solution**:
1. Check if backend is running: http://localhost:8000
2. Start backend: `python ai_backend.py`
3. Install dependencies: `pip install -r requirements.txt`
4. Check firewall settings

### Slow Performance

**Problem**: Laggy canvas or slow annotation

**Solution**:
1. Use smaller model (yolov8n instead of yolov8x)
2. Reduce image resolution before uploading
3. Close other browser tabs
4. Use GPU acceleration (CUDA) for AI backend

### Missing Annotations

**Problem**: Annotations don't save or disappear

**Solution**:
1. Ensure file is loaded (check file list)
2. Select a label before annotating
3. Export frequently to backup
4. Check browser console for errors

### Export Issues

**Problem**: Export fails or format is incorrect

**Solution**:
1. Verify at least one annotation exists
2. Ensure labels are properly assigned
3. Check export format is supported
4. Try different export format

---

## Advanced Features

### Custom Brush Size (Segmentation)

Currently fixed at 20px. To adjust, modify `image-collector.js`:

```javascript
maskCtx.lineWidth = 20; // Change this value
```

### Custom Label Colors

Colors are assigned from a 12-color palette. To add custom colors, edit `image-collector.js`:

```javascript
const LABEL_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', // Add your colors here
];
```

### Annotation Confidence Threshold

AI-generated annotations include confidence scores. Filter by modifying:

```javascript
formData.append('confidence', '0.25'); // 0.0 to 1.0
```

---

## Support

For issues or feature requests:
1. Check this guide first
2. Review [ANNOTATION_SYSTEM_SPEC.md](ANNOTATION_SYSTEM_SPEC.md) for technical details
3. Check [AI_BACKEND_README.md](AI_BACKEND_README.md) for AI setup
4. Report issues on GitHub

---

**Happy Annotating! 🎨🤖**
