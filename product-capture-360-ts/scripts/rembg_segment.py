#!/usr/bin/env python3
"""
Simple background removal using rembg
Install: pip install rembg[gpu] opencv-python
"""

import sys
import json
import cv2
import numpy as np
from pathlib import Path

try:
    from rembg import remove
    from PIL import Image
except ImportError:
    print("ERROR: rembg not installed. Run: pip install rembg[gpu]", file=sys.stderr)
    sys.exit(1)

def segment_with_rembg(input_path, mask_output, polygon_output):
    """
    Remove background using rembg and extract polygon
    """
    # Load image
    input_image = Image.open(input_path)

    # Remove background
    output_image = remove(input_image)

    # Convert to numpy for mask extraction
    output_np = np.array(output_image)

    # Extract alpha channel as mask
    if output_np.shape[2] == 4:
        alpha = output_np[:, :, 3]
    else:
        # If no alpha, create mask from non-black pixels
        gray = cv2.cvtColor(output_np, cv2.COLOR_RGB2GRAY)
        _, alpha = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)

    # Save mask
    cv2.imwrite(mask_output, alpha)

    # Convert to polygon
    polygon_data = mask_to_polygon(alpha)

    if polygon_data:
        with open(polygon_output, 'w') as f:
            json.dump(polygon_data, f, indent=2)
        print(f"SUCCESS: Segmented {input_path}", file=sys.stderr)
    else:
        print(f"WARNING: Could not extract polygon from {input_path}", file=sys.stderr)

def mask_to_polygon(mask, min_area=1000):
    """Convert binary mask to polygon"""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) == 0:
        return None

    # Get largest contour
    largest_contour = max(contours, key=cv2.contourArea)

    if cv2.contourArea(largest_contour) < min_area:
        return None

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
        print("Usage: rembg_segment.py <input_image> <output_mask> <output_polygon>")
        sys.exit(1)

    input_path = sys.argv[1]
    mask_output = sys.argv[2]
    polygon_output = sys.argv[3]

    segment_with_rembg(input_path, mask_output, polygon_output)
