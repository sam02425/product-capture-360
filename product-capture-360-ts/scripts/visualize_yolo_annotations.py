#!/usr/bin/env python3
"""
Visualize YOLO auto-annotations to review accuracy
Press arrow keys to navigate, ESC to exit
"""

import os
import sys
import json
import cv2
import numpy as np
from pathlib import Path

# Configuration
ANNOTATIONS_FILE = "annotations_yolo_auto.json"
IMAGE_DIR = "/Volumes/UBUNTU 24_0/360Photo_Captures/Abasolo_Whiskey_750ml"

def load_annotations():
    """Load YOLO annotations from JSON"""
    annotations_path = Path(__file__).parent.parent / ANNOTATIONS_FILE

    if not annotations_path.exists():
        print(f"❌ Annotations file not found: {annotations_path}")
        print("\nRun YOLO auto-annotation first:")
        print("   python scripts/yolo_auto_annotate.py")
        return None

    with open(annotations_path, 'r') as f:
        return json.load(f)

def yolo_to_bbox(yolo_line, img_width, img_height):
    """Convert YOLO format to bounding box coordinates"""
    parts = yolo_line.split()
    class_id = int(parts[0])
    center_x = float(parts[1]) * img_width
    center_y = float(parts[2]) * img_height
    width = float(parts[3]) * img_width
    height = float(parts[4]) * img_height

    x1 = int(center_x - width / 2)
    y1 = int(center_y - height / 2)
    x2 = int(center_x + width / 2)
    y2 = int(center_y + height / 2)

    return (x1, y1, x2, y2)

def draw_annotations(img, yolo_lines):
    """Draw bounding boxes on image"""
    height, width = img.shape[:2]

    for yolo_line in yolo_lines:
        x1, y1, x2, y2 = yolo_to_bbox(yolo_line, width, height)

        # Draw green box
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 3)

        # Add label
        label = "Bottle (YOLO)"
        label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)

        # Draw label background
        cv2.rectangle(img,
                     (x1, y1 - label_size[1] - 10),
                     (x1 + label_size[0], y1),
                     (0, 255, 0), -1)

        # Draw label text
        cv2.putText(img, label,
                   (x1, y1 - 5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

    return img

def add_info_panel(img, filename, current_idx, total_images, has_annotation):
    """Add information panel at the top"""
    # Create info panel
    panel_height = 80
    panel = np.zeros((panel_height, img.shape[1], 3), dtype=np.uint8)
    panel[:] = (40, 40, 40)  # Dark gray background

    # Add text
    status = "✓ ANNOTATED" if has_annotation else "✗ NO ANNOTATION"
    color = (0, 255, 0) if has_annotation else (0, 0, 255)

    cv2.putText(panel, f"Image {current_idx + 1}/{total_images}",
               (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(panel, filename,
               (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    cv2.putText(panel, status,
               (img.shape[1] - 200, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

    # Combine panel with image
    return np.vstack([panel, img])

def add_controls_panel(img):
    """Add controls panel at the bottom"""
    panel_height = 60
    panel = np.zeros((panel_height, img.shape[1], 3), dtype=np.uint8)
    panel[:] = (40, 40, 40)  # Dark gray background

    # Add controls text
    controls = "← → : Navigate  |  SPACE: Toggle annotated only  |  S: Save screenshot  |  ESC: Exit"
    cv2.putText(panel, controls,
               (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    return np.vstack([img, panel])

def visualize_annotations():
    """Main visualization function"""
    print(f"\n{'='*70}")
    print(f"  👁️  YOLO Annotation Reviewer")
    print(f"{'='*70}\n")

    # Load annotations
    annotations = load_annotations()
    if annotations is None:
        return

    # Get all images
    image_dir = Path(IMAGE_DIR)
    if not image_dir.exists():
        print(f"❌ Image directory not found: {IMAGE_DIR}")
        return

    all_images = sorted(list(image_dir.glob("*.jpg")) + list(image_dir.glob("*.png")))
    all_images = [f for f in all_images if not f.name.startswith('._')]

    print(f"📁 Found {len(all_images)} images")
    print(f"📊 YOLO detected {len(annotations)} bottles")
    print(f"📈 Detection rate: {len(annotations)/len(all_images)*100:.1f}%\n")
    print("🎮 Controls:")
    print("   ← → : Navigate between images")
    print("   SPACE: Toggle showing only annotated images")
    print("   S: Save current view as screenshot")
    print("   ESC: Exit\n")

    # Create window
    window_name = "YOLO Annotation Review"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1200, 800)

    current_idx = 0
    show_only_annotated = False

    while True:
        # Get current image
        img_path = all_images[current_idx]
        filename = img_path.name

        # Load image
        img = cv2.imread(str(img_path))
        if img is None:
            print(f"❌ Failed to load: {filename}")
            current_idx = (current_idx + 1) % len(all_images)
            continue

        # Check if annotated
        has_annotation = filename in annotations

        # Skip if showing only annotated and this one isn't
        if show_only_annotated and not has_annotation:
            current_idx = (current_idx + 1) % len(all_images)
            if current_idx == 0:  # Wrapped around without finding annotated
                print("⚠️  No more annotated images")
                show_only_annotated = False
            continue

        # Draw annotations if available
        display_img = img.copy()
        if has_annotation:
            yolo_lines = annotations[filename]
            display_img = draw_annotations(display_img, yolo_lines)

        # Add info panels
        display_img = add_info_panel(display_img, filename, current_idx, len(all_images), has_annotation)
        display_img = add_controls_panel(display_img)

        # Show image
        cv2.imshow(window_name, display_img)

        # Handle keyboard input
        key = cv2.waitKey(0) & 0xFF

        if key == 27:  # ESC
            break
        elif key == 81 or key == 2:  # Left arrow
            current_idx = (current_idx - 1) % len(all_images)
        elif key == 83 or key == 3:  # Right arrow
            current_idx = (current_idx + 1) % len(all_images)
        elif key == 32:  # SPACE
            show_only_annotated = not show_only_annotated
            mode = "annotated only" if show_only_annotated else "all images"
            print(f"🔄 Showing: {mode}")
        elif key == ord('s') or key == ord('S'):  # Save screenshot
            screenshot_path = Path(__file__).parent.parent / f"review_screenshot_{filename}"
            cv2.imwrite(str(screenshot_path), display_img)
            print(f"💾 Screenshot saved: {screenshot_path}")

    cv2.destroyAllWindows()
    print("\n✅ Review complete!")
    print(f"\nSummary:")
    print(f"  Total images: {len(all_images)}")
    print(f"  Annotated: {len(annotations)} ({len(annotations)/len(all_images)*100:.1f}%)")
    print(f"  Missing: {len(all_images) - len(annotations)} ({(len(all_images)-len(annotations))/len(all_images)*100:.1f}%)")
    print(f"\n💡 Next step: Use Professional Annotator to complete missing annotations")
    print(f"   http://localhost:5002/annotator.html\n")

if __name__ == '__main__':
    try:
        visualize_annotations()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        cv2.destroyAllWindows()
