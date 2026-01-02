#!/usr/bin/env python3
import argparse
import json
from ultralytics import YOLO

def detect_bottles(image_path, model_name='yolov8n', confidence=0.85, label='bottle', target_class='bottle'):
    """
    Detect bottles in image using YOLO
    """
    # Skip macOS metadata files
    if os.path.basename(image_path).startswith('._'):
        return []
    # Load pre-trained YOLO model
    model = YOLO(f'{model_name}.pt')

    # Run inference
    results = model(image_path, conf=confidence)

    detections = []

    target = (target_class or '').strip().lower()
    if target in ('all', '*'):
        target = ''

    model_classes = {str(name).lower() for name in model.names.values()}
    if target and target not in model_classes:
        # Unknown class name from UI; skip filtering to avoid empty results.
        target = ''
    for result in results:
        boxes = result.boxes
        for box in boxes:
            # Get bounding box coordinates (xyxy format)
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = box.conf[0].item()
            cls = int(box.cls[0].item())
            class_name = str(model.names.get(cls, '')).lower()

            if target and class_name != target:
                continue

            # Convert to xywh format
            x = x1
            y = y1
            width = x2 - x1
            height = y2 - y1

            detections.append({
                'x': x,
                'y': y,
                'width': width,
                'height': height,
                'confidence': conf,
                'class': label
            })

    detections.sort(key=lambda d: d.get('confidence', 0), reverse=True)
    return detections

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to image')
    parser.add_argument('--model', default='yolov8n', help='Model name')
    parser.add_argument('--confidence', type=float, default=0.85, help='Confidence threshold')
    parser.add_argument('--label', default='bottle', help='Label for detections')
    parser.add_argument('--target-class', default='bottle', help='Target class name to keep from the model')

    args = parser.parse_args()

    detections = detect_bottles(args.image, args.model, args.confidence, args.label, args.target_class)
    print(json.dumps(detections))
