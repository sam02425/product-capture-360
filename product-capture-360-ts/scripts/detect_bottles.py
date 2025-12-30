#!/usr/bin/env python3
import argparse
import json
from ultralytics import YOLO

def detect_bottles(image_path, model_name='yolov8n', confidence=0.5, label='bottle'):
    """
    Detect bottles in image using YOLO
    """
    # Load pre-trained YOLO model
    model = YOLO(f'{model_name}.pt')

    # Run inference
    results = model(image_path, conf=confidence)

    detections = []

    for result in results:
        boxes = result.boxes
        for box in boxes:
            # Get bounding box coordinates (xyxy format)
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = box.conf[0].item()
            cls = int(box.cls[0].item())

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

    return detections

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to image')
    parser.add_argument('--model', default='yolov8n', help='Model name')
    parser.add_argument('--confidence', type=float, default=0.5, help='Confidence threshold')
    parser.add_argument('--label', default='bottle', help='Label for detections')

    args = parser.parse_args()

    detections = detect_bottles(args.image, args.model, args.confidence, args.label)
    print(json.dumps(detections))
