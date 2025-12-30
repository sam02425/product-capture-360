#!/bin/bash

# Script to organize existing images into product-specific folders
# This script moves images from the root capture folder into product subfolders

CAPTURE_DIR="/Volumes/UBUNTU 24_0/360Photo_Captures"

echo "🔄 Organizing existing images into product folders..."
echo "📂 Capture directory: $CAPTURE_DIR"
echo ""

if [ ! -d "$CAPTURE_DIR" ]; then
  echo "❌ Capture directory not found: $CAPTURE_DIR"
  exit 1
fi

cd "$CAPTURE_DIR" || exit 1

# Count total images to process
total_images=$(find . -maxdepth 1 -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | wc -l | tr -d ' ')

if [ "$total_images" -eq 0 ]; then
  echo "ℹ️  No images found in root directory. All images are already organized!"
  exit 0
fi

echo "📸 Found $total_images images to organize"
echo ""

# Process each image file in the root directory
moved_count=0
skipped_count=0

# Use find to get all image files
find . -maxdepth 1 -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | while read -r filepath; do
  file=$(basename "$filepath")

  # Skip if file doesn't exist
  [ -f "$file" ] || continue

  # Extract product name from filename
  # Format: ProductName_capture_TIMESTAMP.jpg or ProductName_hires_capture_TIMESTAMP.jpg

  # Remove _hires_ if present
  clean_name="${file/_hires_/_}"

  # Extract product name (everything before _capture_)
  if [[ "$clean_name" =~ ^(.+)_capture_[0-9_]+\.(jpg|jpeg|png)$ ]]; then
    product_name="${BASH_REMATCH[1]}"

    # Create product folder if it doesn't exist
    if [ ! -d "$product_name" ]; then
      mkdir -p "$product_name"
      echo "📁 Created folder: $product_name"
    fi

    # Move file to product folder
    mv "$file" "$product_name/"
    ((moved_count++))

    # Show progress every 50 files
    if [ $((moved_count % 50)) -eq 0 ]; then
      echo "   Processed: $moved_count/$total_images images..."
    fi
  else
    echo "⚠️  Skipped (no product name): $file"
    ((skipped_count++))
  fi
done

echo ""
echo "✅ Organization complete!"
echo "   📦 Moved: $moved_count images"
echo "   ⏭️  Skipped: $skipped_count images"
echo ""

# Show folder summary
echo "📊 Product folders created:"
for dir in */; do
  if [ -d "$dir" ]; then
    dir_name="${dir%/}"
    image_count=$(find "$dir" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | wc -l | tr -d ' ')
    echo "   - $dir_name: $image_count images"
  fi
done

echo ""
echo "🎉 All images are now organized by product name!"
