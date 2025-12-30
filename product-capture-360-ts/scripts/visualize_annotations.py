#!/usr/bin/env python3
"""
YOLO Annotation Visualizer
Shows images with bounding boxes overlaid for verification
"""

import os
import sys
import json
import cv2
import argparse
from pathlib import Path
import random

def draw_yolo_boxes(image_path: str, label_path: str, class_name: str = "Product"):
    """
    Draw YOLO format bounding boxes on image
    """
    # Read image
    img = cv2.imread(str(image_path))
    if img is None:
        return None

    h, w = img.shape[:2]

    # Read label file
    if not os.path.exists(label_path):
        return img  # No annotations

    with open(label_path, 'r') as f:
        lines = f.readlines()

    # Draw each bounding box
    for line in lines:
        parts = line.strip().split()
        if len(parts) < 5:
            continue

        class_id = int(parts[0])
        center_x = float(parts[1])
        center_y = float(parts[2])
        bbox_w = float(parts[3])
        bbox_h = float(parts[4])

        # Convert to pixel coordinates
        x1 = int((center_x - bbox_w/2) * w)
        y1 = int((center_y - bbox_h/2) * h)
        x2 = int((center_x + bbox_w/2) * w)
        y2 = int((center_y + bbox_h/2) * h)

        # Draw rectangle
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # Draw label
        label = f"{class_name}"
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.rectangle(img, (x1, y1-text_h-10), (x1+text_w, y1), (0, 255, 0), -1)
        cv2.putText(img, label, (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)

    return img

def visualize_dataset(dataset_dir: str, class_name: str = "Product", num_samples: int = 10, split: str = "train"):
    """
    Visualize random samples from dataset
    """
    dataset_path = Path(dataset_dir)
    images_dir = dataset_path / "images" / split
    labels_dir = dataset_path / "labels" / split

    if not images_dir.exists():
        print(f"❌ Images directory not found: {images_dir}")
        return

    if not labels_dir.exists():
        print(f"❌ Labels directory not found: {labels_dir}")
        return

    # Get all images
    image_files = list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.jpeg")) + list(images_dir.glob("*.png"))

    if len(image_files) == 0:
        print(f"❌ No images found in {images_dir}")
        return

    print(f"📸 Found {len(image_files)} images in {split} set")

    # Sample random images
    sample_images = random.sample(image_files, min(num_samples, len(image_files)))

    print(f"\n🔍 Visualizing {len(sample_images)} random samples...")
    print(f"   Press 'q' to quit, any other key for next image\n")

    for idx, img_path in enumerate(sample_images, 1):
        # Get corresponding label file
        label_path = labels_dir / f"{img_path.stem}.txt"

        # Draw boxes
        img_with_boxes = draw_yolo_boxes(str(img_path), str(label_path), class_name)

        if img_with_boxes is None:
            print(f"❌ Failed to read: {img_path.name}")
            continue

        # Add image info overlay
        info_text = f"[{idx}/{len(sample_images)}] {img_path.name}"
        cv2.putText(img_with_boxes, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Resize if too large
        max_height = 800
        if img_with_boxes.shape[0] > max_height:
            scale = max_height / img_with_boxes.shape[0]
            new_width = int(img_with_boxes.shape[1] * scale)
            img_with_boxes = cv2.resize(img_with_boxes, (new_width, max_height))

        # Show image
        cv2.imshow("YOLO Annotations Verification", img_with_boxes)

        print(f"   [{idx}/{len(sample_images)}] {img_path.name}")

        # Wait for key
        key = cv2.waitKey(0)
        if key == ord('q') or key == 27:  # q or ESC
            break

    cv2.destroyAllWindows()
    print(f"\n✅ Visualization complete")

def create_html_gallery(dataset_dir: str, class_name: str = "Product", output_path: str = None, max_images: int = 50):
    """
    Create HTML gallery for web-based annotation verification
    """
    dataset_path = Path(dataset_dir)

    if output_path is None:
        output_path = dataset_path / "annotation_gallery.html"

    # Collect images from both train and val
    all_images = []

    for split in ['train', 'val']:
        images_dir = dataset_path / "images" / split
        labels_dir = dataset_path / "labels" / split

        if not images_dir.exists():
            continue

        image_files = list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.jpeg"))
        image_files = random.sample(image_files, min(max_images//2, len(image_files)))

        for img_path in image_files:
            label_path = labels_dir / f"{img_path.stem}.txt"
            all_images.append({
                'image': str(img_path.relative_to(dataset_path)),
                'label': str(label_path.relative_to(dataset_path)) if label_path.exists() else None,
                'split': split
            })

    # Create HTML
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YOLO Annotations Verification - {class_name}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f1419;
            color: #fff;
            padding: 2rem;
        }}

        header {{
            text-align: center;
            margin-bottom: 2rem;
        }}

        h1 {{
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }}

        .stats {{
            display: flex;
            gap: 2rem;
            justify-content: center;
            margin: 1rem 0;
            flex-wrap: wrap;
        }}

        .stat {{
            background: #1a1f2e;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            border: 1px solid #2a3544;
        }}

        .stat-value {{
            font-size: 1.5rem;
            font-weight: bold;
            color: #3b82f6;
        }}

        .stat-label {{
            font-size: 0.875rem;
            color: #9ca3af;
        }}

        .gallery {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }}

        .image-card {{
            background: #1a1f2e;
            border-radius: 0.5rem;
            overflow: hidden;
            border: 1px solid #2a3544;
            transition: transform 0.2s, box-shadow 0.2s;
        }}

        .image-card:hover {{
            transform: translateY(-4px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
        }}

        .image-wrapper {{
            position: relative;
            width: 100%;
            padding-top: 75%; /* 4:3 aspect ratio */
            background: #000;
            overflow: hidden;
        }}

        .image-card img {{
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
        }}

        .image-info {{
            padding: 1rem;
        }}

        .image-name {{
            font-size: 0.875rem;
            color: #e5e7eb;
            word-break: break-all;
            margin-bottom: 0.5rem;
        }}

        .image-split {{
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #3b82f6;
            color: white;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            font-weight: 600;
        }}

        .image-split.val {{
            background: #10b981;
        }}

        canvas {{
            display: block;
        }}

        .loading {{
            text-align: center;
            padding: 2rem;
            color: #9ca3af;
        }}
    </style>
</head>
<body>
    <header>
        <h1>🏷️ YOLO Annotations Verification</h1>
        <p style="color: #9ca3af; margin-top: 0.5rem;">{class_name}</p>
        <div class="stats">
            <div class="stat">
                <div class="stat-value" id="totalImages">0</div>
                <div class="stat-label">Total Images</div>
            </div>
            <div class="stat">
                <div class="stat-value" id="trainImages">0</div>
                <div class="stat-label">Train Set</div>
            </div>
            <div class="stat">
                <div class="stat-value" id="valImages">0</div>
                <div class="stat-label">Val Set</div>
            </div>
        </div>
    </header>

    <div class="gallery" id="gallery">
        <div class="loading">Loading images...</div>
    </div>

    <script>
        const images = {json.dumps(all_images, indent=8)};

        const gallery = document.getElementById('gallery');
        const className = "{class_name}";

        // Update stats
        const trainCount = images.filter(img => img.split === 'train').length;
        const valCount = images.filter(img => img.split === 'val').length;

        document.getElementById('totalImages').textContent = images.length;
        document.getElementById('trainImages').textContent = trainCount;
        document.getElementById('valImages').textContent = valCount;

        // Draw bounding boxes on canvas
        function drawBoxes(canvas, img, labelPath) {{
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            // Load labels
            if (!labelPath) return;

            fetch(labelPath)
                .then(r => r.text())
                .then(text => {{
                    const lines = text.trim().split('\\n');

                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 3;
                    ctx.font = '16px Arial';
                    ctx.fillStyle = '#00ff00';

                    lines.forEach(line => {{
                        const parts = line.split(' ');
                        if (parts.length < 5) return;

                        const centerX = parseFloat(parts[1]);
                        const centerY = parseFloat(parts[2]);
                        const width = parseFloat(parts[3]);
                        const height = parseFloat(parts[4]);

                        const x1 = (centerX - width/2) * canvas.width;
                        const y1 = (centerY - height/2) * canvas.height;
                        const x2 = (centerX + width/2) * canvas.width;
                        const y2 = (centerY + height/2) * canvas.height;

                        ctx.strokeRect(x1, y1, x2-x1, y2-y1);

                        ctx.fillStyle = '#00ff00';
                        ctx.fillRect(x1, y1-25, 200, 25);
                        ctx.fillStyle = '#000';
                        ctx.fillText(className, x1+5, y1-7);
                    }});
                }})
                .catch(err => console.log('No labels:', err));
        }}

        // Create gallery
        gallery.innerHTML = '';

        images.forEach((item, idx) => {{
            const card = document.createElement('div');
            card.className = 'image-card';

            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';

            const canvas = document.createElement('canvas');
            wrapper.appendChild(canvas);

            const info = document.createElement('div');
            info.className = 'image-info';

            const name = document.createElement('div');
            name.className = 'image-name';
            name.textContent = item.image.split('/').pop();

            const split = document.createElement('span');
            split.className = `image-split ${{item.split}}`;
            split.textContent = item.split.toUpperCase();

            info.appendChild(name);
            info.appendChild(split);

            card.appendChild(wrapper);
            card.appendChild(info);
            gallery.appendChild(card);

            // Load image
            const img = new Image();
            img.onload = () => {{
                drawBoxes(canvas, img, item.label);
            }};
            img.src = item.image;
        }});
    </script>
</body>
</html>
"""

    with open(output_path, 'w') as f:
        f.write(html_content)

    print(f"✅ Created HTML gallery: {output_path}")
    print(f"   Open in browser to verify annotations")
    print(f"   file://{os.path.abspath(output_path)}")

def main():
    parser = argparse.ArgumentParser(description='Visualize YOLO Annotations')
    parser.add_argument('--dataset', required=True, help='Dataset directory')
    parser.add_argument('--class-name', default='Product', help='Class name to display')
    parser.add_argument('--samples', type=int, default=10, help='Number of samples to show')
    parser.add_argument('--split', default='train', choices=['train', 'val'], help='Dataset split')
    parser.add_argument('--mode', default='opencv', choices=['opencv', 'html'], help='Visualization mode')
    parser.add_argument('--max-html', type=int, default=50, help='Max images in HTML gallery')

    args = parser.parse_args()

    print(f"")
    print(f"{'='*70}")
    print(f"  🏷️ YOLO Annotation Visualizer")
    print(f"{'='*70}")
    print(f"")
    print(f"📁 Dataset: {args.dataset}")
    print(f"🏷️  Class:   {args.class_name}")
    print(f"📊 Mode:    {args.mode}")
    print(f"")

    if args.mode == 'opencv':
        visualize_dataset(args.dataset, args.class_name, args.samples, args.split)
    else:
        create_html_gallery(args.dataset, args.class_name, max_images=args.max_html)

if __name__ == '__main__':
    main()
