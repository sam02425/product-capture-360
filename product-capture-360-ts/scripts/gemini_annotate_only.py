#!/usr/bin/env python3
"""
Gemini Annotation Only - Focus on Accuracy
Just annotates images, no augmentation
"""

import os
import sys
import json
import cv2
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict
from tqdm import tqdm
import argparse

# Gemini imports
try:
    import google.generativeai as genai
    from PIL import Image
except ImportError:
    print("⚠️  Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "google-generativeai", "Pillow"])
    import google.generativeai as genai
    from PIL import Image


class GeminiAnnotator:
    def __init__(self, image_folder: str, product_name: str, output_dir: str, api_key: str):
        self.image_folder = Path(image_folder)
        self.product_name = product_name
        self.output_dir = Path(output_dir)
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Output for annotations
        self.annotations_file = self.output_dir / f"{product_name}_annotations_{self.timestamp}.json"

        # Initialize Gemini
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro-vision')

        # Stats
        self.stats = {
            "total_images": 0,
            "successfully_annotated": 0,
            "failed": 0,
            "annotations": {}
        }

    def detect_bottle_with_gemini(self, image_path: Path) -> Optional[Dict]:
        """
        Use Gemini Vision to detect bottle and get bounding box
        Returns normalized YOLO format coordinates
        """
        try:
            # Read image
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            height, width = img.shape[:2]

            # Convert to RGB for PIL
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(img_rgb)

            # Create detailed prompt for Gemini
            prompt = f"""You are a precise object detection system. Analyze this image and detect the bottle/product.

Product: {self.product_name}

Your task:
1. Locate the main bottle/product in the image
2. Provide a tight bounding box around it
3. Return coordinates as pixel values

Image dimensions: {width} x {height} pixels

Return ONLY a JSON object (no markdown, no explanation):
{{
    "detected": true/false,
    "bbox": {{
        "x_min": <left edge in pixels>,
        "y_min": <top edge in pixels>,
        "x_max": <right edge in pixels>,
        "y_max": <bottom edge in pixels>
    }},
    "confidence": <0.0 to 1.0>,
    "notes": "<brief description of what you see>"
}}

Rules:
- If NO bottle is clearly visible, return {{"detected": false}}
- Bounding box should be TIGHT around the bottle (not loose)
- Include the entire bottle (cap to bottom)
- Exclude excessive background
- All coordinates must be integers within image bounds
"""

            # Call Gemini API
            response = self.model.generate_content([prompt, pil_image])
            response_text = response.text.strip()

            # Clean markdown if present
            if '```' in response_text:
                # Extract JSON from markdown code block
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start >= 0 and end > start:
                    response_text = response_text[start:end]

            # Parse JSON
            result = json.loads(response_text)

            if not result.get('detected', False):
                print(f"   No bottle detected in {image_path.name}")
                return None

            bbox = result['bbox']

            # Validate pixel coordinates
            x_min = int(bbox['x_min'])
            y_min = int(bbox['y_min'])
            x_max = int(bbox['x_max'])
            y_max = int(bbox['y_max'])

            # Ensure coordinates are within bounds
            x_min = max(0, min(x_min, width - 1))
            y_min = max(0, min(y_min, height - 1))
            x_max = max(0, min(x_max, width - 1))
            y_max = max(0, min(y_max, height - 1))

            # Ensure valid box
            if x_max <= x_min or y_max <= y_min:
                print(f"   Invalid bbox for {image_path.name}")
                return None

            # Convert to YOLO format (normalized: center_x, center_y, width, height)
            center_x = ((x_min + x_max) / 2) / width
            center_y = ((y_min + y_max) / 2) / height
            bbox_width = (x_max - x_min) / width
            bbox_height = (y_max - y_min) / height

            return {
                'image': image_path.name,
                'image_path': str(image_path),
                'width': width,
                'height': height,
                'bbox_pixels': {
                    'x_min': x_min,
                    'y_min': y_min,
                    'x_max': x_max,
                    'y_max': y_max
                },
                'bbox_yolo': {
                    'class_id': 0,
                    'center_x': center_x,
                    'center_y': center_y,
                    'width': bbox_width,
                    'height': bbox_height
                },
                'confidence': result.get('confidence', 0.9),
                'notes': result.get('notes', ''),
                'annotated_at': datetime.now().isoformat()
            }

        except json.JSONDecodeError as e:
            print(f"   ❌ JSON parse error for {image_path.name}: {e}")
            print(f"      Response was: {response_text[:200]}")
            return None
        except Exception as e:
            print(f"   ❌ Error for {image_path.name}: {e}")
            return None

    def annotate_all(self) -> Dict:
        """
        Annotate all images in the folder
        """
        print(f"\n🤖 Gemini Annotation Process")
        print(f"{'='*70}")
        print(f"Product: {self.product_name}")
        print(f"Input:   {self.image_folder}")
        print(f"Output:  {self.annotations_file}")
        print(f"{'='*70}\n")

        # Get all images
        image_files = []
        for ext in ['*.jpg', '*.jpeg', '*.png', '*.JPG', '*.JPEG', '*.PNG']:
            image_files.extend(self.image_folder.glob(ext))

        # Filter out hidden/system files
        image_files = [f for f in image_files if not f.name.startswith('._') and not f.name.startswith('.')]
        image_files = sorted(image_files)

        self.stats["total_images"] = len(image_files)
        print(f"📸 Found {len(image_files)} images\n")

        if len(image_files) == 0:
            print("❌ No images found!")
            return self.stats

        # Annotate each image
        annotations = {}

        for img_path in tqdm(image_files, desc="Annotating", unit="img"):
            annotation = self.detect_bottle_with_gemini(img_path)

            if annotation:
                annotations[img_path.name] = annotation
                self.stats["successfully_annotated"] += 1
            else:
                self.stats["failed"] += 1

        self.stats["annotations"] = annotations

        # Save annotations to JSON
        self.output_dir.mkdir(parents=True, exist_ok=True)

        output_data = {
            "metadata": {
                "product_name": self.product_name,
                "created_at": datetime.now().isoformat(),
                "detection_method": "Gemini Vision AI (gemini-1.5-flash)",
                "total_images": self.stats["total_images"],
                "successfully_annotated": self.stats["successfully_annotated"],
                "failed": self.stats["failed"],
                "success_rate": f"{(self.stats['successfully_annotated'] / self.stats['total_images'] * 100):.1f}%" if self.stats['total_images'] > 0 else "0%"
            },
            "annotations": annotations
        }

        with open(self.annotations_file, 'w') as f:
            json.dump(output_data, f, indent=2)

        return self.stats

    def print_summary(self):
        """Print summary of annotation results"""
        print(f"\n{'='*70}")
        print(f"  ✅ Annotation Complete!")
        print(f"{'='*70}\n")
        print(f"📊 Results:")
        print(f"   Total Images:        {self.stats['total_images']}")
        print(f"   Successfully Annotated: {self.stats['successfully_annotated']}")
        print(f"   Failed:              {self.stats['failed']}")

        if self.stats["total_images"] > 0:
            success_rate = (self.stats["successfully_annotated"] / self.stats["total_images"]) * 100
            print(f"   Success Rate:        {success_rate:.1f}%")

        print(f"\n📁 Output:")
        print(f"   {self.annotations_file}")
        print(f"\n💡 Next Steps:")
        print(f"   1. Review annotations using visualization tool")
        print(f"   2. If quality is good, proceed to augmentation")
        print(f"   3. Generate final YOLO dataset")
        print(f"\n{'='*70}\n")


def main():
    parser = argparse.ArgumentParser(description='Gemini Annotation Only - No Augmentation')
    parser.add_argument('--input', required=True, help='Input folder with images')
    parser.add_argument('--product', required=True, help='Product name')
    parser.add_argument('--output', required=True, help='Output directory for annotations')
    parser.add_argument('--api-key', help='Gemini API key (or set GEMINI_API_KEY env var)')

    args = parser.parse_args()

    # Get API key
    api_key = args.api_key or os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print("❌ Gemini API key required!")
        print("   Use --api-key or set GEMINI_API_KEY environment variable")
        sys.exit(1)

    # Run annotation
    annotator = GeminiAnnotator(args.input, args.product, args.output, api_key)
    annotator.annotate_all()
    annotator.print_summary()


if __name__ == '__main__':
    main()
