# Product Folder Organization

## Overview

**NEW**: Each product now gets its own subfolder within the capture directory!

## Folder Structure

### Before (Old Behavior)
```
360Photo_Captures/
├── Seagrams_Peach_Twisted_Gin_750ml_capture_20250129_143025123_001.jpg
├── Seagrams_Peach_Twisted_Gin_750ml_capture_20250129_143025456_002.jpg
├── Hendricks_Gin_750ml_capture_20250129_150125123_001.jpg
├── Hendricks_Gin_750ml_capture_20250129_150125456_002.jpg
├── Plymouth_Gin_750ml_capture_20250129_153025123_001.jpg
└── ... (all images mixed together)
```

**Problem**: All images mixed in one folder, hard to find specific products

### After (New Behavior)
```
360Photo_Captures/
├── Seagrams_Peach_Twisted_Gin_750ml/
│   ├── Seagrams_Peach_Twisted_Gin_750ml_capture_20250129_143025123_001.jpg
│   ├── Seagrams_Peach_Twisted_Gin_750ml_capture_20250129_143025456_002.jpg
│   └── ... (125 images)
├── Hendricks_Gin_750ml/
│   ├── Hendricks_Gin_750ml_capture_20250129_150125123_001.jpg
│   ├── Hendricks_Gin_750ml_capture_20250129_150125456_002.jpg
│   └── ... (308 images)
├── Plymouth_Gin_750ml/
│   ├── Plymouth_Gin_750ml_capture_20250129_153025123_001.jpg
│   └── ... (94 images)
└── Beefeater_Gin_750ml/
    └── ... (209 images)
```

**Benefit**: Each product in its own folder, easy to find and manage!

## How It Works

### Automatic Folder Creation ([storage.ts:265-275, 292-302](src/storage.ts))

When you enter a product name and start capturing:

1. **Sanitize product name**: Spaces replaced with underscores
   - "Hendrick's Gin 750ml" → "Hendricks_Gin_750ml"

2. **Create subfolder**: `{capture_dir}/{product_name}/`
   - Example: `~/Desktop/360Photo_Captures/Hendricks_Gin_750ml/`

3. **Save images to subfolder**: All images for that product go into its folder
   - No more mixed images!

### Code Changes

**Before**:
```typescript
const fpath = path.join(this.currentPath, fname);
// Saves directly to root: 360Photo_Captures/Product_capture_123.jpg
```

**After**:
```typescript
let targetPath = this.currentPath;
if (productName) {
  const sanitizedName = productName.replace(/\s+/g, '_');
  targetPath = path.join(this.currentPath, sanitizedName);

  // Create folder if it doesn't exist
  if (!fs.existsSync(targetPath)) {
    await fsPromises.mkdir(targetPath, { recursive: true });
  }
}

const fpath = path.join(targetPath, fname);
// Saves to subfolder: 360Photo_Captures/Product/Product_capture_123.jpg
```

## Organizing Existing Images

If you have existing images from before this fix, use the organize script:

```bash
./organize_existing_images.sh
```

**What it does**:
1. Scans `~/Desktop/360Photo_Captures/` for all `.jpg/.jpeg/.png` files
2. Extracts product name from filename (part before `_capture_`)
3. Creates product folders
4. Moves images into respective folders
5. Shows summary of organized images

**Example output**:
```
🔄 Organizing existing images into product folders...
📂 Capture directory: /Users/you/Desktop/360Photo_Captures

📸 Found 736 images to organize

📁 Created folder: Seagrams_Peach_Twisted_Gin_750ml
📁 Created folder: Hendricks_Gin_750ml
📁 Created folder: Plymouth_Gin_750ml
   Processed: 50/736 images...
   Processed: 100/736 images...
   ...

✅ Organization complete!
   📦 Moved: 736 images
   ⏭️  Skipped: 0 images

📊 Product folders created:
   - Seagrams_Peach_Twisted_Gin_750ml: 125 images
   - Hendricks_Gin_750ml: 308 images
   - Plymouth_Gin_750ml: 94 images
   - Beefeater_Gin_750ml: 209 images

🎉 All images are now organized by product name!
```

## Benefits

### 1. Easy Product Management
```bash
# Find all images for one product
ls ~/Desktop/360Photo_Captures/Hendricks_Gin_750ml/

# Count images for one product
ls ~/Desktop/360Photo_Captures/Hendricks_Gin_750ml/ | wc -l

# Delete all images for one product
rm -rf ~/Desktop/360Photo_Captures/Hendricks_Gin_750ml/
```

### 2. Better Organization
- Each product session creates its own folder
- No more searching through 1000+ mixed images
- Easy to archive or move specific products

### 3. Clear Status
- Folder name = Product name
- Image count per folder visible at a glance
- Easy to see which products need more captures

### 4. Pipeline Ready
- Each folder can be processed independently
- Easier to run augmentation per product
- Better for batch processing

## File Naming

Images are still named with product prefix for clarity:

```
Hendricks_Gin_750ml/
├── Hendricks_Gin_750ml_capture_20250129_143025123_001.jpg
└── Hendricks_Gin_750ml_capture_20250129_143025456_002.jpg
```

This ensures:
- Files are self-documenting (name contains product)
- No filename collisions even if moved
- Easy to identify product from filename alone

## Edge Cases

### Product Name with Spaces
**Input**: "Hendrick's Grand Cabernet Gin 750ml"
**Folder**: `Hendricks_Grand_Cabernet_Gin_750ml/`
**Files**: `Hendricks_Grand_Cabernet_Gin_750ml_capture_*.jpg`

### Special Characters
**Input**: "Empress 1908 Elderflower & Rose Gin"
**Folder**: `Empress_1908_Elderflower_&_Rose_Gin/`
**Files**: `Empress_1908_Elderflower_&_Rose_Gin_capture_*.jpg`

### No Product Name
**Input**: (empty)
**Folder**: Root directory (`360Photo_Captures/`)
**Files**: `capture_20250129_*.jpg`

## Backward Compatibility

✅ **Fully backward compatible**:
- Old images without product names still work
- Can still capture without product name (saves to root)
- Organize script safely handles mixed scenarios

## Quick Commands

**Organize existing images**:
```bash
./organize_existing_images.sh
```

**Count images per product**:
```bash
cd ~/Desktop/360Photo_Captures
for dir in */; do echo -n "$dir: "; ls "$dir" | wc -l; done
```

**Total disk usage per product**:
```bash
du -sh ~/Desktop/360Photo_Captures/*/
```

**Archive a product**:
```bash
tar -czf Hendricks_Gin.tar.gz ~/Desktop/360Photo_Captures/Hendricks_Gin_750ml/
```

## Summary

✅ **NEW**: Each product gets its own subfolder
✅ **Automatic**: Folder created on first capture
✅ **Organized**: Easy to find and manage products
✅ **Compatible**: Works with existing images via organize script

**No more searching through mixed images!** 🎉
