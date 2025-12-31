#!/usr/bin/env python3
"""
Test Gemini 2.0 on a single image to verify it works
Then visualize the annotation
"""

import os
import sys
import json
import cv2
from pathlib import Path

# Try new Gemini SDK first
try:
    import google.genai as genai
    NEW_SDK = True
    print("✅ Using NEW google.genai SDK")
except ImportError:
    import google.generativeai as genai
    NEW_SDK = False
    print("⚠️  Using DEPRECATED google.generativeai SDK")

from PIL import Image

# Configuration
API_KEY = "AIzaSyBVyghW_1dYODp0zezm2nhHiqEAupTgxgo"
IMAGE_PATH = "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml/capture_003400_20251104_201515_966.jpg"
PRODUCT_NAME = "Abasolo_Whiskey_750ml"

def annotate_with_gemini_new(image_path, product_name):
    """Use new Gemini 2.0 SDK"""
    client = genai.Client(api_key=API_KEY)

    # Read image
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"❌ Failed to load image: {image_path}")
        return None

    height, width = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(img_rgb)

    # Create prompt
    prompt = f"""Analyze this image and detect the bottle/product.

Product: {product_name}

Return ONLY a JSON object (no markdown, no explanation):
{{
    "detected": true/false,
    "bbox": {{
        "x_min": <left pixel>,
        "y_min": <top pixel>,
        "x_max": <right pixel>,
        "y_max": <bottom pixel>
    }},
    "confidence": <0.0-1.0>
}}

Rules:
- If NO bottle is clearly visible, return {{"detected": false}}
- Bounding box should be TIGHT around the bottle
- All coordinates must be integers within image bounds (width={width}, height={height})
"""

    try:
        # Try Gemini 2.0 Flash
        response = client.models.generate_content(
            model='gemini-2.0-flash-exp',
            contents=[prompt, pil_image]
        )

        response_text = response.text.strip()
        print(f"✅ Gemini 2.0 Flash response received")

        # Clean markdown
        if '```' in response_text:
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start >= 0 and end > start:
                response_text = response_text[start:end]

        result = json.loads(response_text)

        if result.get('detected'):
            bbox = result['bbox']
            # Convert to YOLO format
            center_x = ((bbox['x_min'] + bbox['x_max']) / 2) / width
            center_y = ((bbox['y_min'] + bbox['y_max']) / 2) / height
            bbox_width = (bbox['x_max'] - bbox['x_min']) / width
            bbox_height = (bbox['y_max'] - bbox['y_min']) / height

            return {
                'bbox_pixels': bbox,
                'bbox_yolo': [0, center_x, center_y, bbox_width, bbox_height],
                'confidence': result.get('confidence', 0.9),
                'width': width,
                'height': height
            }
        else:
            print("❌ No bottle detected")
            return None

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def annotate_with_gemini_old(image_path, product_name):
    """Use old Gemini SDK"""
    genai.configure(api_key=API_KEY)

    # Try different models
    models_to_try = [
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro-vision'
    ]

    for model_name in models_to_try:
        try:
            print(f"🔄 Trying {model_name}...")
            model = genai.GenerativeModel(model_name)

            # Read image
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            height, width = img.shape[:2]
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(img_rgb)

            prompt = f"""Analyze this image and detect the bottle/product.

Product: {product_name}

Return ONLY a JSON object (no markdown):
{{
    "detected": true/false,
    "bbox": {{
        "x_min": <left pixel>,
        "y_min": <top pixel>,
        "x_max": <right pixel>,
        "y_max": <bottom pixel>
    }},
    "confidence": <0.0-1.0>
}}

Image dimensions: {width}x{height} pixels
"""

            response = model.generate_content([prompt, pil_image])
            response_text = response.text.strip()

            print(f"✅ {model_name} response received")

            # Clean markdown
            if '```' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start >= 0 and end > start:
                    response_text = response_text[start:end]

            result = json.loads(response_text)

            if result.get('detected'):
                bbox = result['bbox']
                center_x = ((bbox['x_min'] + bbox['x_max']) / 2) / width
                center_y = ((bbox['y_min'] + bbox['y_max']) / 2) / height
                bbox_width = (bbox['x_max'] - bbox['x_min']) / width
                bbox_height = (bbox['y_max'] - bbox['y_min']) / height

                print(f"✅ SUCCESS with {model_name}!")
                return {
                    'model': model_name,
                    'bbox_pixels': bbox,
                    'bbox_yolo': [0, center_x, center_y, bbox_width, bbox_height],
                    'confidence': result.get('confidence', 0.9),
                    'width': width,
                    'height': height
                }
            else:
                print(f"⚠️  {model_name}: No bottle detected")

        except Exception as e:
            print(f"❌ {model_name} failed: {e}")
            continue

    return None

def visualize_annotation(image_path, annotation):
    """Draw bounding box on image and save"""
    img = cv2.imread(str(image_path))
    if img is None or annotation is None:
        return

    bbox = annotation['bbox_pixels']

    # Draw box
    cv2.rectangle(img,
                  (int(bbox['x_min']), int(bbox['y_min'])),
                  (int(bbox['x_max']), int(bbox['y_max'])),
                  (0, 255, 0), 3)

    # Add label
    label = f"Abasolo Whiskey ({annotation['confidence']:.2f})"
    cv2.putText(img, label,
                (int(bbox['x_min']), int(bbox['y_min']) - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # Save
    output_path = "/tmp/gemini_annotation_test.jpg"
    cv2.imwrite(output_path, img)
    print(f"\n✅ Visualization saved: {output_path}")
    print(f"   Open this file to see the AI annotation!")

    # Also save YOLO annotation
    yolo_path = "/tmp/gemini_annotation_test.txt"
    yolo_line = " ".join(map(str, annotation['bbox_yolo']))
    with open(yolo_path, 'w') as f:
        f.write(yolo_line)
    print(f"✅ YOLO annotation saved: {yolo_path}")
    print(f"   Format: class_id center_x center_y width height")
    print(f"   Content: {yolo_line}")

def main():
    print(f"\n{'='*70}")
    print(f"  🤖 Gemini AI Annotation Test")
    print(f"{'='*70}\n")
    print(f"Image: {IMAGE_PATH}")
    print(f"Product: {PRODUCT_NAME}\n")

    # Check if image exists
    if not os.path.exists(IMAGE_PATH):
        print(f"❌ Image not found: {IMAGE_PATH}")
        return

    # Try annotation
    if NEW_SDK:
        annotation = annotate_with_gemini_new(IMAGE_PATH, PRODUCT_NAME)
    else:
        annotation = annotate_with_gemini_old(IMAGE_PATH, PRODUCT_NAME)

    if annotation:
        print(f"\n{'='*70}")
        print(f"  ✅ SUCCESS!")
        print(f"{'='*70}\n")
        print(f"Model: {annotation.get('model', 'Gemini 2.0')}")
        print(f"Confidence: {annotation['confidence']:.2f}")
        print(f"Bounding Box (pixels):")
        print(f"  x_min: {annotation['bbox_pixels']['x_min']}")
        print(f"  y_min: {annotation['bbox_pixels']['y_min']}")
        print(f"  x_max: {annotation['bbox_pixels']['x_max']}")
        print(f"  y_max: {annotation['bbox_pixels']['y_max']}")
        print(f"\nYOLO Format:")
        print(f"  {' '.join(map(str, annotation['bbox_yolo']))}")

        # Visualize
        visualize_annotation(IMAGE_PATH, annotation)

        print(f"\n{'='*70}")
        print(f"  🎉 You can now use Gemini for auto-annotation!")
        print(f"{'='*70}\n")
    else:
        print(f"\n{'='*70}")
        print(f"  ❌ FAILED - No annotation created")
        print(f"{'='*70}\n")
        print(f"Possible issues:")
        print(f"  1. API key invalid")
        print(f"  2. Model not available")
        print(f"  3. Image quality too low")
        print(f"  4. No bottle visible in image")

if __name__ == '__main__':
    main()
