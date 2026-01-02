# AI Batch Annotation System - User Guide

## Overview

The AI Batch Annotation System automatically annotates entire folders of images using YOLO11 or SAM2 models, allowing you to quickly generate bounding boxes for large datasets and then review/edit the results.

## Features

- **Automatic Annotation**: Process hundreds of images with one click
- **Two AI Engines**:
  - YOLO (Fast detection)
  - SAM2 (Precise segmentation with YOLO + SAM2 refinement)
- **Real-time Progress Tracking**: See live updates as images are processed
- **Review & Edit**: Open results in the Professional Annotator to refine annotations
- **YOLO Format Export**: Save annotations in YOLO training format
- **Job Management**: Track multiple annotation jobs

## Quick Start

### 1. Access the Batch Annotator

- Open the Professional Annotator: `http://localhost:5002/annotator.html`
- Click the **"AI Batch Annotator"** button in the top-right header
- Or navigate directly to: `http://localhost:5002/batch-annotator.html`

### 2. Configure Annotation Settings

**Required Settings:**
- **Folder Path**: Path to images (e.g., `/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml`)
- **AI Engine**: Choose YOLO or SAM2
  - YOLO: Fast, good for clear objects
  - SAM2: Slower but more precise, refines YOLO detections

**Optional Settings:**
- **Model**: Select YOLO model size (nano, small, medium)
  - yolov8n (fastest, least accurate)
  - yolov8s (balanced)
  - yolov8m (slower, more accurate)
  - yolo11n / yolo11s (newer models)
- **Confidence Threshold**: 0.0 - 1.0 (default: 0.5)
  - Higher = fewer but more confident detections
  - Lower = more detections but may include false positives
- **Target Class**: Object type to detect (default: "bottle")
- **Label Name**: Name for annotations (default: "Product")

### 3. Start Batch Annotation

1. Click **"Start Batch Annotation"**
2. Watch the progress bar update in real-time
3. See statistics:
   - Status (Pending → Running → Completed)
   - Progress (X / Y images)
   - Current image being processed
   - Elapsed time

### 4. Review Results

When complete:
- View thumbnail grid of all processed images
- Green border = successful detection
- Red border = failed
- Badge shows number of bounding boxes detected

### 5. Edit Annotations

Click **"Review & Edit in Annotator"** to:
- Open the folder in Professional Annotator
- View/edit each annotation
- Delete incorrect boxes
- Add missing annotations
- Adjust box positions

### 6. Export Dataset

Click **"Export YOLO Format"** to:
- Save annotations to `{folder}/labels/` directory
- Each image gets a `.txt` file with YOLO format annotations
- Ready for YOLO training

## API Endpoints

The batch annotation system exposes these REST endpoints:

### Start Batch Job
```bash
POST /api/batch-annotate
Content-Type: application/json

{
  "folderPath": "/path/to/images",
  "engine": "yolo",
  "model": "yolov8n",
  "confidence": 0.5,
  "targetClass": "bottle",
  "labelName": "Product"
}

Response:
{
  "success": true,
  "jobId": "1234567890-abc123",
  "message": "Batch annotation job started"
}
```

### Get Job Status
```bash
GET /api/batch-annotate/status/{jobId}

Response:
{
  "success": true,
  "progress": {
    "jobId": "1234567890-abc123",
    "status": "running",
    "totalImages": 150,
    "processedImages": 75,
    "currentImage": "image_075.jpg",
    "startTime": 1704067200000,
    "results": [...]
  }
}
```

### Get All Jobs
```bash
GET /api/batch-annotate/jobs

Response:
{
  "success": true,
  "jobs": [...]
}
```

### Cancel Job
```bash
POST /api/batch-annotate/cancel/{jobId}

Response:
{
  "success": true,
  "message": "Job cancelled"
}
```

### Delete Job
```bash
DELETE /api/batch-annotate/job/{jobId}

Response:
{
  "success": true,
  "message": "Job deleted"
}
```

### Save Annotations
```bash
POST /api/batch-annotate/save
Content-Type: application/json

{
  "jobId": "1234567890-abc123",
  "annotations": [...],
  "outputFolder": "/path/to/output/labels"
}

Response:
{
  "success": true,
  "message": "Saved 150 annotation files to /path/to/output/labels",
  "savedCount": 150
}
```

## How It Works

### YOLO Engine Workflow

1. **Detection**: Runs YOLOv8/YOLO11 on each image
2. **Filtering**: Filters by target class and confidence threshold
3. **Conversion**: Converts detections to annotation format
4. **Storage**: Stores results for review

### SAM2 Engine Workflow

1. **YOLO Detection**: First runs YOLO to get rough bounding boxes
2. **SAM2 Refinement**: For each YOLO box, runs SAM2 to refine the mask
3. **Bbox Extraction**: Extracts refined bounding box from SAM2 mask
4. **Fallback**: If SAM2 fails, uses original YOLO box

### Progress Tracking

- Backend processes images asynchronously
- Frontend polls `/api/batch-annotate/status/{jobId}` every second
- Progress updates in real-time:
  - Progress bar (0-100%)
  - Image counter (X / Y)
  - Current image filename
  - Elapsed time

## File Structure

### Backend Components

```
src/
├── batch_annotation.ts       # Batch annotation service
└── server.ts                  # API endpoints (lines 1079-1278)
```

**Key Classes:**
- `BatchAnnotationService`: Manages batch jobs
  - `startBatchJob()`: Start new annotation job
  - `processImagesAsync()`: Process images in background
  - `annotateImage()`: Annotate single image
  - `annotateWithYOLO()`: YOLO detection
  - `annotateWithSAM2()`: SAM2 refinement
  - `getJobProgress()`: Get job status

### Frontend Components

```
public/
└── batch-annotator.html      # Batch annotation UI
```

**Key Functions:**
- `startBatchAnnotation()`: Submit job
- `startProgressPolling()`: Poll for updates
- `updateProgress()`: Update UI
- `showResults()`: Display completed results
- `reviewAnnotations()`: Open in annotator
- `exportAnnotations()`: Save to YOLO format

## YOLO Annotation Format

Exported files follow standard YOLO format:

```
# Each line: class_id x_center y_center width height
# Coordinates are normalized (0.0 - 1.0)

0 0.5 0.5 0.2 0.3
0 0.7 0.6 0.15 0.25
```

**Directory Structure:**
```
/path/to/images/
├── image_001.jpg
├── image_002.jpg
└── labels/
    ├── image_001.txt
    └── image_002.txt
```

## Performance Tips

### YOLO Engine
- **Faster**: Use yolov8n or yolo11n
- **More Accurate**: Use yolov8s or yolov8m
- **Recommended**: yolov8s (good balance)

### SAM2 Engine
- **Much Slower**: Processes YOLO + SAM2 for each detection
- **More Accurate**: Better boundary refinement
- **Use When**: Objects have complex shapes or need precise masks
- **Tip**: Run YOLO first, then use SAM2 only on difficult images

### Confidence Threshold
- **High Precision** (0.7 - 0.9): Fewer detections, more accurate
- **High Recall** (0.3 - 0.5): More detections, may need cleanup
- **Recommended**: 0.5 (balance)

### Batch Size
- Process 100-200 images at a time
- For larger datasets, split into folders
- Monitor memory usage for SAM2 engine

## Troubleshooting

### No Detections Found

**Possible Causes:**
- Confidence threshold too high
- Target class not in YOLO training data
- Images too dark/blurry
- Objects too small

**Solutions:**
- Lower confidence to 0.3
- Verify target class (common: person, bottle, car, etc.)
- Improve image quality
- Try SAM2 engine for difficult objects

### Job Fails/Errors

**Check:**
1. Folder path is correct and accessible
2. Images are valid format (jpg, png, bmp, webp)
3. Python environment has required packages:
   - `ultralytics` (for YOLO)
   - `sam2` (for SAM2)
4. Check logs: `http://localhost:5002/logs.html`
5. Check server console for Python errors

### Slow Performance

**YOLO:**
- Switch to smaller model (yolov8n)
- Reduce image resolution
- Use GPU if available (requires CUDA setup)

**SAM2:**
- SAM2 is inherently slower
- Consider using YOLO for initial pass
- Manually refine difficult images with SAM2 in annotator

### Incorrect Detections

**Too Many False Positives:**
- Increase confidence threshold (0.6 - 0.8)
- Review and delete in annotator

**Missing Objects:**
- Lower confidence threshold (0.3 - 0.4)
- Add manual annotations in annotator
- Consider fine-tuning YOLO on your dataset

## Logging

All batch annotation operations are logged:

- **View Logs**: `http://localhost:5002/logs.html`
- **Log Location**: `~/.product-capture-360/logs/app-YYYY-MM-DD.log`
- **Logged Events**:
  - Batch job start/complete
  - Each image processed
  - YOLO detections count
  - SAM2 refinement results
  - Errors and warnings

## Best Practices

1. **Start Small**: Test on 10-20 images first
2. **Verify Settings**: Check target class and confidence
3. **Review Results**: Always review before exporting
4. **Export Incrementally**: Export batches as you verify them
5. **Keep Backups**: Save original images separately
6. **Log Everything**: Check logs for errors/warnings
7. **GPU Acceleration**: Use GPU for large datasets (requires setup)

## Example Workflow

### Scenario: Annotate 500 bottle images

1. **Initial Test** (10 images):
   - Set folder: `/data/bottles/test_10`
   - Engine: YOLO
   - Model: yolov8n
   - Confidence: 0.5
   - Start job → Review results → Adjust settings

2. **Batch 1** (100 images):
   - Apply best settings from test
   - Start job → Monitor progress
   - Review & edit in annotator
   - Export to labels folder

3. **Batch 2-5** (400 images):
   - Use same settings
   - Process in batches of 100
   - Export each batch after review

4. **Final Dataset**:
   - All images in `/data/bottles/images/`
   - All labels in `/data/bottles/labels/`
   - Ready for YOLO training

## Integration with Professional Annotator

The batch annotator seamlessly integrates with the manual annotator:

**From Batch → Manual:**
- Click "Review & Edit in Annotator"
- Loads folder in annotator
- All AI annotations visible
- Edit/delete/add annotations

**From Manual → Batch:**
- Click "AI Batch Annotator" in header
- Pre-fills folder path
- Run batch on remaining images

**Workflow:**
1. Use batch annotator for bulk processing
2. Review in manual annotator
3. Run batch again on new images
4. Export combined dataset

## API Usage Examples

### JavaScript/Frontend
```javascript
// Start batch job
const response = await fetch('/api/batch-annotate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    folderPath: '/path/to/images',
    engine: 'yolo',
    model: 'yolov8n',
    confidence: 0.5,
    targetClass: 'bottle',
    labelName: 'Product'
  })
});

const { jobId } = await response.json();

// Poll for progress
const pollInterval = setInterval(async () => {
  const status = await fetch(`/api/batch-annotate/status/${jobId}`);
  const { progress } = await status.json();

  console.log(`${progress.processedImages}/${progress.totalImages}`);

  if (progress.status === 'completed') {
    clearInterval(pollInterval);
    console.log('Done!', progress.results);
  }
}, 1000);
```

### Python/CLI
```python
import requests
import time

# Start job
response = requests.post('http://localhost:5002/api/batch-annotate', json={
    'folderPath': '/path/to/images',
    'engine': 'yolo',
    'model': 'yolov8n',
    'confidence': 0.5,
    'targetClass': 'bottle',
    'labelName': 'Product'
})

job_id = response.json()['jobId']

# Poll for completion
while True:
    status = requests.get(f'http://localhost:5002/api/batch-annotate/status/{job_id}')
    progress = status.json()['progress']

    print(f"{progress['processedImages']}/{progress['totalImages']}")

    if progress['status'] in ['completed', 'failed']:
        break

    time.sleep(1)

# Save annotations
requests.post('http://localhost:5002/api/batch-annotate/save', json={
    'jobId': job_id,
    'annotations': progress['results'],
    'outputFolder': '/path/to/labels'
})
```

## Support

For issues or questions:
1. Check logs: `http://localhost:5002/logs.html`
2. Review this guide
3. Check YOLO/SAM2 model installation
4. Verify Python environment

---

**Version**: 1.0.0
**Last Updated**: 2026-01-01
**Part of**: Product Capture 360 TypeScript Edition
