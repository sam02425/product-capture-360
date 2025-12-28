#!/usr/bin/env python3
"""
Automatic segmentation using Segment Anything Model (SAM)
Install: pip install segment-anything torch torchvision
Download model: wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth
"""

import sys
import json
import cv2
import numpy as np
from pathlib import Path

try:
    from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
    import torch
except ImportError:
    print("ERROR: segment-anything not installed. Run: pip install segment-anything torch", file=sys.stderr)
    sys.exit(1)

def segment_with_sam(image_path, mask_output, polygon_output, model_type="vit_h", checkpoint=None):
    """
    Segment image using SAM and save mask + polygon
    """
    # Find SAM checkpoint
    if checkpoint is None:
        # Look for checkpoint in common locations
        possible_paths = [
            "sam_vit_h_4b8939.pth",
            "../models/sam_vit_h_4b8939.pth",
            str(Path.home() / "models" / "sam_vit_h_4b8939.pth"),
        ]
        for p in possible_paths:
            if Path(p).exists():
                checkpoint = p
                break

    if checkpoint is None or not Path(checkpoint).exists():
        print("ERROR: SAM checkpoint not found. Download from:", file=sys.stderr)
        print("https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth", file=sys.stderr)
        sys.exit(1)

    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"ERROR: Could not load image: {image_path}", file=sys.stderr)
        sys.exit(1)

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Initialize SAM
    device = "cuda" if torch.cuda.is_available() else "cpu"
    sam = sam_model_registry[model_type](checkpoint=checkpoint)
    sam.to(device=device)

    mask_generator = SamAutomaticMaskGenerator(
        model=sam,
        points_per_side=32,
        pred_iou_thresh=0.86,
        stability_score_thresh=0.92,
        crop_n_layers=1,
        crop_n_points_downscale_factor=2,
        min_mask_region_area=100,  # Filter small masks
    )

    # Generate masks
    masks = mask_generator.generate(image_rgb)

    if len(masks) == 0:
        print("WARNING: No masks detected", file=sys.stderr)
        sys.exit(1)

    # Find the largest mask (assuming it's the product)
    largest_mask = max(masks, key=lambda x: x['area'])

    # Create binary mask image
    binary_mask = (largest_mask['segmentation'] * 255).astype(np.uint8)

    # Save mask
    cv2.imwrite(mask_output, binary_mask)

    # Convert mask to polygon
    polygon_data = mask_to_polygon(binary_mask)

    # Save polygon
    with open(polygon_output, 'w') as f:
        json.dump(polygon_data, f, indent=2)

    print(f"SUCCESS: Segmented {image_path}", file=sys.stderr)
    print(f"  Mask: {mask_output}", file=sys.stderr)
    print(f"  Polygon: {polygon_output}", file=sys.stderr)

def mask_to_polygon(mask, min_area=1000):
    """Convert binary mask to polygon"""
    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) == 0:
        return None

    # Get largest contour
    largest_contour = max(contours, key=cv2.contourArea)

    # Simplify polygon
    epsilon = 0.002 * cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, epsilon, True)

    # Convert to list of points
    points = approx.reshape(-1, 2).tolist()

    # Calculate bounding box
    x, y, w, h = cv2.boundingRect(largest_contour)

    return {
        "points": points,
        "bbox": [int(x), int(y), int(w), int(h)],
        "confidence": 1.0,
        "area": int(cv2.contourArea(largest_contour))
    }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: sam_segment.py <input_image> <output_mask> <output_polygon>")
        sys.exit(1)

    image_path = sys.argv[1]
    mask_output = sys.argv[2]
    polygon_output = sys.argv[3]

    segment_with_sam(image_path, mask_output, polygon_output)
