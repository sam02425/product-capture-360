#!/bin/bash
# Example workflow script for YOLOv11 dataset generation
# This demonstrates the complete pipeline via API calls

set -e

# Configuration
API_URL="http://localhost:5002"
INPUT_DIR="/path/to/your/captures"  # Change this to your capture folder
OUTPUT_DIR="/path/to/yolo_dataset"  # Change this to your desired output

# Retail background images (comma-separated)
BACKGROUNDS=(
  "/path/to/backgrounds/shelf1.jpg"
  "/path/to/backgrounds/shelf2.jpg"
  "/path/to/backgrounds/shelf3.jpg"
)

# Join backgrounds array into comma-separated string
BG_JSON=$(printf ',"%s"' "${BACKGROUNDS[@]}")
BG_JSON="[${BG_JSON:1}]"

echo "🚀 Starting YOLOv11 dataset generation..."
echo "Input: $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Step 1: Generate retail dataset with augmentation
echo "📦 Step 1: Generating retail dataset with background synthesis..."
curl -X POST "$API_URL/api/preprocess/retail" \
  -H "Content-Type: application/json" \
  -d "{
    \"input_dir\": \"$INPUT_DIR\",
    \"output_dir\": \"$OUTPUT_DIR\",
    \"key_color\": \"#00ff00\",
    \"tolerance\": 0.25,
    \"softness\": 0.15,
    \"retail_backgrounds\": $BG_JSON,
    \"augment_per_background\": 3
  }" | jq '.'

echo ""

# Step 2: Create YOLO annotations
echo "📝 Step 2: Creating YOLO annotation templates..."
curl -X POST "$API_URL/api/preprocess/create-annotations" \
  -H "Content-Type: application/json" \
  -d "{
    \"images_dir\": \"$OUTPUT_DIR/images\",
    \"class_name\": \"liquor_bottle\"
  }" | jq '.'

echo ""
echo "✅ Dataset generation complete!"
echo ""
echo "📂 Output location: $OUTPUT_DIR"
echo "   ├── images/     (processed images)"
echo "   ├── labels/     (annotation templates)"
echo "   └── classes.txt (class names)"
echo ""
echo "📌 Next steps:"
echo "1. Review generated images in: $OUTPUT_DIR/images/"
echo "2. Adjust annotations using LabelImg or similar tool"
echo "3. Split dataset into train/val sets (80/20)"
echo "4. Create data.yaml for YOLO training"
echo "5. Train model: python train.py"
echo ""
echo "🎯 Happy training!"
