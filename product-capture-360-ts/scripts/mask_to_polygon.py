#!/usr/bin/env python3
"""
Convert binary mask to polygon
"""

import sys
import json
import cv2

def mask_to_polygon(mask_path, min_area=1000):
    """Convert binary mask to polygon and output JSON"""
    # Read mask
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return None

    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) == 0:
        return None

    # Get largest contour
    largest_contour = max(contours, key=cv2.contourArea)

    if cv2.contourArea(largest_contour) < min_area:
        return None

    # Simplify polygon (Douglas-Peucker algorithm)
    epsilon = 0.002 * cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, epsilon, True)

    # Convert to list of points
    points = approx.reshape(-1, 2).tolist()

    # Calculate bounding box
    x, y, w, h = cv2.boundingRect(largest_contour)

    result = {
        "points": points,
        "bbox": [int(x), int(y), int(w), int(h)],
        "confidence": 1.0,
        "area": int(cv2.contourArea(largest_contour))
    }

    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: mask_to_polygon.py <mask_path> [min_area]")
        sys.exit(1)

    mask_path = sys.argv[1]
    min_area = int(sys.argv[2]) if len(sys.argv) > 2 else 1000

    result = mask_to_polygon(mask_path, min_area)

    if result:
        print(json.dumps(result))
    else:
        print("{}", file=sys.stderr)
        sys.exit(1)
