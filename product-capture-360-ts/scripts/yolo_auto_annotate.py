#!/usr/bin/env python3
"""
Auto-annotate using pre-trained YOLO model
Alternative to Gemini API since quota is exceeded
"""

import os
import sys
import json
from pathlib import Path
import cv2
from ultralytics import YOLO

# Configuration
IMAGE_DIR = "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml"
OUTPUT_FILE = "annotations_yolo_auto.json"
CONFIDENCE_THRESHOLD = 0.3

# YOLO bottle class ID (in COCO dataset, bottle = 39)
BOTTLE_CLASS_ID = 39

def auto_annotate_with_yolo():
    """Use pre-trained YOLOv8 to detect bottles"""

    print(f"\n{'='*70}")
    print(f"  🤖 Auto-Annotation with YOLO")
    print(f"{'='*70}\n")

    # Load pre-trained YOLOv8 model
    print("📦 Loading YOLOv8n model...")
    try:
        model = YOLO('yolov8n.pt')  # Nano model (fastest)
        print("✅ Model loaded successfully\n")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        print("💡 Run: pip install ultralytics")
        return

    # Get all images
    image_dir = Path(IMAGE_DIR)
    if not image_dir.exists():
        print(f"❌ Directory not found: {IMAGE_DIR}")
        return

    image_files = list(image_dir.glob("*.jpg")) + list(image_dir.glob("*.png"))
    # Filter out hidden files (._*)
    image_files = [f for f in image_files if not f.name.startswith('._')]
    print(f"📁 Found {len(image_files)} images\n")

    annotations = {}
    stats = {
        'total': len(image_files),
        'detected': 0,
        'not_detected': 0,
        'total_boxes': 0
    }

    # Process each image
    for idx, img_path in enumerate(image_files, 1):
        filename = img_path.name
        print(f"[{idx}/{len(image_files)}] Processing {filename}...", end=" ")

        # Run YOLO detection
        results = model(str(img_path), verbose=False)

        # Filter for bottle class with confidence threshold
        boxes = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                # Check if it's a bottle and confidence is high enough
                if class_id == BOTTLE_CLASS_ID and confidence >= CONFIDENCE_THRESHOLD:
                    # Get bounding box coordinates (xyxy format)
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()

                    # Get image dimensions
                    img = cv2.imread(str(img_path))
                    height, width = img.shape[:2]

                    # Convert to YOLO format (normalized center_x, center_y, width, height)
                    center_x = ((x1 + x2) / 2) / width
                    center_y = ((y1 + y2) / 2) / height
                    bbox_width = (x2 - x1) / width
                    bbox_height = (y2 - y1) / height

                    # Format: "class_id center_x center_y width height"
                    yolo_line = f"0 {center_x:.6f} {center_y:.6f} {bbox_width:.6f} {bbox_height:.6f}"
                    boxes.append(yolo_line)

        if boxes:
            annotations[filename] = boxes
            stats['detected'] += 1
            stats['total_boxes'] += len(boxes)
            print(f"✅ {len(boxes)} bottle(s) detected")
        else:
            stats['not_detected'] += 1
            print("⚪ No bottle detected")

    # Save annotations
    print(f"\n{'='*70}")
    print(f"  📊 Statistics")
    print(f"{'='*70}\n")
    print(f"Total images:     {stats['total']}")
    print(f"Detected:         {stats['detected']} ({stats['detected']/stats['total']*100:.1f}%)")
    print(f"Not detected:     {stats['not_detected']} ({stats['not_detected']/stats['total']*100:.1f}%)")
    print(f"Total boxes:      {stats['total_boxes']}")
    print(f"Avg boxes/image:  {stats['total_boxes']/max(stats['detected'],1):.2f}")

    # Save to JSON
    output_path = Path(__file__).parent.parent / OUTPUT_FILE
    with open(output_path, 'w') as f:
        json.dump(annotations, f, indent=2)

    print(f"\n✅ Annotations saved: {output_path}")
    print(f"\n{'='*70}")
    print(f"  🎯 Next Steps")
    print(f"{'='*70}\n")
    print("1. Open Professional Annotator:")
    print("   http://localhost:5002/annotator.html")
    print("")
    print("2. Load the auto-generated annotations:")
    print(f"   - File: {OUTPUT_FILE}")
    print("   - Review each annotation")
    print("   - Fix incorrect boxes")
    print("   - Add missing annotations")
    print("")
    print("3. Export corrected annotations")
    print("")
    print("💡 YOLO pre-trained model is not product-specific,")
    print("   so you'll need to review and correct the boxes!")
    print("")

if __name__ == '__main__':
    auto_annotate_with_yolo()
