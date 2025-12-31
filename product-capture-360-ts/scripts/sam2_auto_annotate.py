#!/usr/bin/env python3
"""
Auto-annotate using SAM2 (Segment Anything Model 2)
Alternative to Gemini API for accurate bottle detection
"""

import os
import sys
import json
import cv2
import numpy as np
from pathlib import Path
import torch

# Configuration
IMAGE_DIR = "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml"
OUTPUT_FILE = "annotations_yolo_sam2.json"

def check_sam2_installation():
    """Check if SAM2 is installed and provide installation instructions"""
    try:
        from sam2.build_sam import build_sam2
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
        return True
    except ImportError:
        print("\n" + "="*70)
        print("  ❌ SAM2 Not Installed")
        print("="*70 + "\n")
        print("To use SAM2 for auto-annotation, please install it:")
        print("")
        print("1. Clone SAM2 repository:")
        print("   git clone https://github.com/facebookresearch/segment-anything-2.git")
        print("   cd segment-anything-2")
        print("")
        print("2. Install dependencies:")
        print("   pip install -e .")
        print("")
        print("3. Download SAM2 checkpoint:")
        print("   wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt")
        print("")
        print("Alternative: Use YOLO auto-annotation:")
        print("   python scripts/yolo_auto_annotate.py")
        print("")
        print("Or use the Professional Annotator for manual annotation:")
        print("   http://localhost:5002/annotator.html")
        print("")
        return False

def auto_annotate_with_sam2():
    """Use SAM2 to detect and segment bottles"""

    if not check_sam2_installation():
        return

    from sam2.build_sam import build_sam2
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

    print(f"\n{'='*70}")
    print(f"  🎯 Auto-Annotation with SAM2")
    print(f"{'='*70}\n")

    # Check for SAM2 checkpoint
    checkpoint_path = "checkpoints/sam2_hiera_large.pt"
    config_path = "sam2_hiera_l.yaml"

    if not os.path.exists(checkpoint_path):
        print("❌ SAM2 checkpoint not found")
        print(f"   Expected: {checkpoint_path}")
        print("\nDownload with:")
        print("   mkdir -p checkpoints")
        print("   wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt -P checkpoints/")
        return

    # Initialize SAM2
    print("📦 Loading SAM2 model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"   Using device: {device}")

    sam2 = build_sam2(config_path, checkpoint_path, device=device)
    mask_generator = SAM2AutomaticMaskGenerator(sam2)
    print("✅ SAM2 loaded successfully\n")

    # Get all images
    image_dir = Path(IMAGE_DIR)
    if not image_dir.exists():
        print(f"❌ Directory not found: {IMAGE_DIR}")
        return

    image_files = list(image_dir.glob("*.jpg")) + list(image_dir.glob("*.png"))
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

        # Load image
        img = cv2.imread(str(img_path))
        if img is None:
            print("❌ Failed to load")
            continue

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        height, width = img.shape[:2]

        # Generate masks with SAM2
        masks = mask_generator.generate(img_rgb)

        # Filter masks to find bottle-like objects
        # Heuristics:
        # 1. Medium size (not too small, not too large)
        # 2. Vertical aspect ratio (taller than wide)
        # 3. Centered in image (bottles usually centered in 360 captures)

        bottle_masks = []
        for mask in masks:
            # Get bounding box
            bbox = mask['bbox']  # [x, y, w, h]
            x, y, w, h = bbox

            # Calculate properties
            area = w * h
            image_area = width * height
            area_ratio = area / image_area
            aspect_ratio = h / w if w > 0 else 0

            # Calculate center distance from image center
            center_x = x + w / 2
            center_y = y + h / 2
            img_center_x = width / 2
            img_center_y = height / 2
            dist_from_center = np.sqrt((center_x - img_center_x)**2 + (center_y - img_center_y)**2)
            max_dist = np.sqrt(img_center_x**2 + img_center_y**2)
            center_ratio = dist_from_center / max_dist

            # Filter criteria for bottles
            is_medium_size = 0.05 < area_ratio < 0.7  # 5-70% of image
            is_vertical = aspect_ratio > 1.2  # Taller than wide
            is_centered = center_ratio < 0.5  # Within center half
            has_high_confidence = mask.get('stability_score', 0) > 0.9

            if is_medium_size and is_vertical and is_centered and has_high_confidence:
                bottle_masks.append(mask)

        # Convert best mask to YOLO format
        boxes = []
        if bottle_masks:
            # Sort by stability score and take best one
            bottle_masks.sort(key=lambda m: m.get('stability_score', 0), reverse=True)
            best_mask = bottle_masks[0]

            bbox = best_mask['bbox']
            x, y, w, h = bbox

            # Convert to YOLO format (normalized center_x, center_y, width, height)
            center_x = (x + w / 2) / width
            center_y = (y + h / 2) / height
            bbox_width = w / width
            bbox_height = h / height

            yolo_line = f"0 {center_x:.6f} {center_y:.6f} {bbox_width:.6f} {bbox_height:.6f}"
            boxes.append(yolo_line)

        if boxes:
            annotations[filename] = boxes
            stats['detected'] += 1
            stats['total_boxes'] += len(boxes)
            print(f"✅ Bottle detected (score: {best_mask.get('stability_score', 0):.2f})")
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
    print("2. Review the SAM2 annotations:")
    print(f"   - File: {OUTPUT_FILE}")
    print("   - SAM2 uses segmentation for accurate boxes")
    print("   - Review and adjust as needed")
    print("")
    print("3. Export corrected annotations")
    print("")

if __name__ == '__main__':
    auto_annotate_with_sam2()
