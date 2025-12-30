#!/usr/bin/env python3
"""
Complete Production Pipeline for YOLO Dataset Creation
Handles: Detection → Annotation → Augmentation → Dataset Export → Versioning
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Dict
import cv2
import numpy as np
from ultralytics import YOLO
from tqdm import tqdm

class YOLODatasetPipeline:
    def __init__(self, image_folder: str, product_name: str, output_base: str):
        self.image_folder = Path(image_folder)
        self.product_name = product_name
        self.output_base = Path(output_base)
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Output directories
        self.output_dir = self.output_base / f"{product_name}_dataset_{self.timestamp}"
        self.images_dir = self.output_dir / "images"
        self.labels_dir = self.output_dir / "labels"
        self.train_images = self.images_dir / "train"
        self.val_images = self.images_dir / "val"
        self.train_labels = self.labels_dir / "train"
        self.val_labels = self.labels_dir / "val"

        # Stats
        self.stats = {
            "original_images": 0,
            "detected_images": 0,
            "augmented_images": 0,
            "train_images": 0,
            "val_images": 0,
            "total_images": 0
        }

    def setup_directories(self):
        """Create output directory structure"""
        print(f"📁 Creating output directories...")
        for dir_path in [self.train_images, self.val_images, self.train_labels, self.val_labels]:
            dir_path.mkdir(parents=True, exist_ok=True)
        print(f"✅ Output: {self.output_dir}")

    def detect_and_annotate(self, confidence: float = 0.5) -> Dict:
        """
        Step 1: Detect bottles using YOLO and create annotations
        """
        print(f"\n🔍 Step 1: Detecting bottles in images...")
        print(f"   Product: {self.product_name}")
        print(f"   Confidence: {confidence}")

        # Load YOLO model
        print("   Loading YOLOv8n model...")
        model = YOLO('yolov8n.pt')  # Pre-trained COCO model

        # Get all images
        image_files = list(self.image_folder.glob("*.jpg")) + \
                     list(self.image_folder.glob("*.jpeg")) + \
                     list(self.image_folder.glob("*.png"))

        # Filter out metadata files
        image_files = [f for f in image_files if not f.name.startswith('._')]
        self.stats["original_images"] = len(image_files)

        print(f"   Found {len(image_files)} images")

        annotations = {}
        detected_count = 0

        for img_path in tqdm(image_files, desc="Detecting"):
            # Read image
            img = cv2.imread(str(img_path))
            if img is None:
                continue

            height, width = img.shape[:2]

            # Run detection
            results = model(img, conf=confidence, verbose=False)

            # Extract detections (class 39 is bottle in COCO dataset)
            detections = []
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    cls = int(box.cls[0].item())
                    # Bottle class or accept any detected object
                    if cls == 39 or True:  # Accept all detections for now
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = box.conf[0].item()

                        # Convert to YOLO format (center_x, center_y, width, height) - normalized
                        center_x = ((x1 + x2) / 2) / width
                        center_y = ((y1 + y2) / 2) / height
                        bbox_width = (x2 - x1) / width
                        bbox_height = (y2 - y1) / height

                        detections.append({
                            'class_id': 0,  # Single class: bottle/product
                            'bbox': [center_x, center_y, bbox_width, bbox_height],
                            'confidence': conf
                        })

            if detections:
                annotations[img_path.name] = detections
                detected_count += 1

        self.stats["detected_images"] = detected_count
        print(f"✅ Detected bottles in {detected_count}/{len(image_files)} images")

        return annotations

    def augment_images(self, annotations: Dict, augmentation_factor: int = 5) -> None:
        """
        Step 2: Apply augmentations to create training variations
        """
        print(f"\n🎨 Step 2: Applying augmentations (x{augmentation_factor})...")

        augmentation_methods = [
            self._augment_brightness,
            self._augment_rotation,
            self._augment_blur,
            self._augment_noise,
            self._augment_contrast,
        ]

        augmented_count = 0

        for img_name, detections in tqdm(list(annotations.items()), desc="Augmenting"):
            img_path = self.image_folder / img_name
            img = cv2.imread(str(img_path))
            if img is None:
                continue

            # Save original
            base_name = img_path.stem
            self._save_image_and_label(img, detections, base_name, "original")
            augmented_count += 1

            # Apply augmentations
            for i in range(augmentation_factor):
                # Randomly choose augmentation method
                aug_method = augmentation_methods[i % len(augmentation_methods)]
                aug_img = aug_method(img.copy())

                # Save augmented version
                aug_name = f"{base_name}_aug{i+1}"
                self._save_image_and_label(aug_img, detections, aug_name, f"aug_{i+1}")
                augmented_count += 1

        self.stats["augmented_images"] = augmented_count
        print(f"✅ Created {augmented_count} augmented images")

    def _augment_brightness(self, img: np.ndarray) -> np.ndarray:
        """Adjust brightness"""
        factor = np.random.uniform(0.7, 1.3)
        return np.clip(img * factor, 0, 255).astype(np.uint8)

    def _augment_rotation(self, img: np.ndarray) -> np.ndarray:
        """Slight rotation"""
        angle = np.random.uniform(-10, 10)
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w/2, h/2), angle, 1.0)
        return cv2.warpAffine(img, M, (w, h))

    def _augment_blur(self, img: np.ndarray) -> np.ndarray:
        """Add slight blur"""
        kernel_size = np.random.choice([3, 5])
        return cv2.GaussianBlur(img, (kernel_size, kernel_size), 0)

    def _augment_noise(self, img: np.ndarray) -> np.ndarray:
        """Add noise"""
        noise = np.random.normal(0, 10, img.shape).astype(np.uint8)
        return np.clip(img + noise, 0, 255).astype(np.uint8)

    def _augment_contrast(self, img: np.ndarray) -> np.ndarray:
        """Adjust contrast"""
        factor = np.random.uniform(0.8, 1.2)
        mean = img.mean()
        return np.clip((img - mean) * factor + mean, 0, 255).astype(np.uint8)

    def _save_image_and_label(self, img: np.ndarray, detections: List, name: str, aug_type: str) -> None:
        """Save image and corresponding YOLO label"""
        # Determine train/val split (80/20)
        is_train = np.random.random() < 0.8

        img_dir = self.train_images if is_train else self.val_images
        lbl_dir = self.train_labels if is_train else self.val_labels

        # Save image
        img_file = img_dir / f"{name}.jpg"
        cv2.imwrite(str(img_file), img)

        # Save label (YOLO format: class_id center_x center_y width height)
        lbl_file = lbl_dir / f"{name}.txt"
        with open(lbl_file, 'w') as f:
            for det in detections:
                class_id = det['class_id']
                bbox = det['bbox']
                f.write(f"{class_id} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}\n")

        if is_train:
            self.stats["train_images"] += 1
        else:
            self.stats["val_images"] += 1

    def create_dataset_yaml(self) -> None:
        """
        Step 3: Create dataset.yaml for YOLO training
        """
        print(f"\n📝 Step 3: Creating dataset.yaml...")

        yaml_content = f"""# YOLO Dataset Configuration
# Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
# Product: {self.product_name}

path: {self.output_dir.absolute()}
train: images/train
val: images/val

# Classes
names:
  0: {self.product_name.replace('_', ' ')}

# Dataset info
nc: 1  # number of classes
"""

        yaml_file = self.output_dir / "dataset.yaml"
        with open(yaml_file, 'w') as f:
            f.write(yaml_content)

        print(f"✅ Created {yaml_file}")

    def create_version_info(self) -> None:
        """
        Step 4: Create versioning information
        """
        print(f"\n📦 Step 4: Creating version metadata...")

        version_info = {
            "version": f"v1.0_{self.timestamp}",
            "product_name": self.product_name,
            "created_at": datetime.now().isoformat(),
            "statistics": {
                "original_images": self.stats["original_images"],
                "detected_images": self.stats["detected_images"],
                "augmented_images": self.stats["augmented_images"],
                "train_images": self.stats["train_images"],
                "val_images": self.stats["val_images"],
                "total_images": self.stats["train_images"] + self.stats["val_images"]
            },
            "augmentations": {
                "factor": 5,
                "methods": ["brightness", "rotation", "blur", "noise", "contrast"]
            },
            "format": "YOLOv8",
            "class_names": [self.product_name.replace('_', ' ')],
            "train_val_split": "80/20"
        }

        self.stats["total_images"] = self.stats["train_images"] + self.stats["val_images"]

        version_file = self.output_dir / "version_info.json"
        with open(version_file, 'w', indent=2) as f:
            json.dump(version_info, f, indent=2)

        print(f"✅ Created {version_file}")

    def print_summary(self) -> None:
        """Print final summary"""
        print(f"\n{'='*70}")
        print(f"  🎉 Pipeline Complete!")
        print(f"{'='*70}")
        print(f"")
        print(f"📊 Statistics:")
        print(f"   Original Images:    {self.stats['original_images']}")
        print(f"   Detected:           {self.stats['detected_images']}")
        print(f"   With Augmentations: {self.stats['augmented_images']}")
        print(f"   Train Set:          {self.stats['train_images']}")
        print(f"   Val Set:            {self.stats['val_images']}")
        print(f"   Total Dataset:      {self.stats['total_images']}")
        print(f"")
        print(f"📁 Output Directory:")
        print(f"   {self.output_dir}")
        print(f"")
        print(f"📝 Files Created:")
        print(f"   dataset.yaml        - YOLO training config")
        print(f"   version_info.json   - Dataset metadata")
        print(f"   images/train/       - Training images")
        print(f"   images/val/         - Validation images")
        print(f"   labels/train/       - Training labels")
        print(f"   labels/val/         - Validation labels")
        print(f"")
        print(f"🚀 Ready to train YOLO:")
        print(f"   yolo train data={self.output_dir}/dataset.yaml model=yolov8n.pt epochs=50")
        print(f"")
        print(f"{'='*70}")

    def run(self, confidence: float = 0.5, augmentation_factor: int = 5) -> bool:
        """Run complete pipeline"""
        try:
            # Setup
            self.setup_directories()

            # Step 1: Detect and annotate
            annotations = self.detect_and_annotate(confidence)

            if len(annotations) == 0:
                print(f"❌ No bottles detected in any images!")
                print(f"   Try lowering the confidence threshold or checking image quality")
                return False

            # Step 2: Augment
            self.augment_images(annotations, augmentation_factor)

            # Step 3: Create dataset.yaml
            self.create_dataset_yaml()

            # Step 4: Create version info
            self.create_version_info()

            # Summary
            self.print_summary()

            return True

        except Exception as e:
            print(f"❌ Pipeline failed: {e}")
            import traceback
            traceback.print_exc()
            return False


def main():
    parser = argparse.ArgumentParser(description='Complete YOLO Dataset Pipeline')
    parser.add_argument('--input', required=True, help='Input folder with images')
    parser.add_argument('--product', required=True, help='Product name (e.g., Abasolo_Whiskey_750ml)')
    parser.add_argument('--output', required=True, help='Output base directory')
    parser.add_argument('--confidence', type=float, default=0.3, help='Detection confidence (default: 0.3)')
    parser.add_argument('--augment', type=int, default=5, help='Augmentation factor (default: 5)')

    args = parser.parse_args()

    print(f"")
    print(f"{'='*70}")
    print(f"  🤖 YOLO Dataset Pipeline - Production Grade")
    print(f"{'='*70}")
    print(f"")
    print(f"📸 Input:       {args.input}")
    print(f"🏷️  Product:     {args.product}")
    print(f"📁 Output:      {args.output}")
    print(f"🎯 Confidence:  {args.confidence}")
    print(f"🎨 Augment:     x{args.augment}")
    print(f"")

    pipeline = YOLODatasetPipeline(args.input, args.product, args.output)
    success = pipeline.run(args.confidence, args.augment)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
