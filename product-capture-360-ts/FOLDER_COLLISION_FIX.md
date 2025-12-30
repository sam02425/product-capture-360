# Folder Collision Detection Fix

## Problem Statement

The folder collision detection was triggering at the wrong time:

❌ **Before**: Collision check happened when setting base storage location (`/360Photo_Captures`)
- Users couldn't reuse the same base folder for multiple products
- Error appeared when clicking "Use This Location"
- Base folder was treated as single-use only

✅ **After**: Collision check happens when starting a capture session with a product name
- Base `360Photo_Captures` folder can be reused for multiple products
- Only warns when a specific product name already has existing images
- Allows continuing with same product name (images are appended)

## Changes Made

### 1. Storage Location Setting ([src/storage.ts:148](src/storage.ts#L148))

**Removed** folder collision check from `setLocation()` method:

```typescript
setLocation = (basePath: string): [boolean, string] => {
  // ❌ REMOVED: Folder collision check
  // const collision = this.checkFolderCollision(target);
  // if (collision.exists && !allowExisting) { ... }

  // ✅ KEPT: Disk space validation
  const diskSpace = this.checkDiskSpace(target);
  if (!diskSpace.available) { ... }

  // ✅ KEPT: Write permission validation
  fs.mkdirSync(target, { recursive: true });
  const testFile = path.join(target, '.write_test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);

  this.currentPath = target;
  return [true, `✅ Storage ready: ${target} (${diskSpace.free_gb.toFixed(2)} GB free)`];
};
```

**Result**: Base folder can now be reused across multiple product capture sessions.

---

### 2. Product-Specific Collision Check ([src/storage.ts:83](src/storage.ts#L83))

**Added** new method `checkProductCollision()`:

```typescript
checkProductCollision = (productName: string): FolderCollisionInfo => {
  const info: FolderCollisionInfo = {
    exists: false,
    path: this.currentPath || '',
    imageCount: 0,
    totalSize: 0,
  };

  if (!this.currentPath) {
    return info;
  }

  try {
    if (!fs.existsSync(this.currentPath)) {
      return info;
    }

    // Look for files matching the product name pattern: {productName}_capture_*.jpg
    const pattern = new RegExp(`^${productName}_capture_.*\\.(jpg|jpeg|png|webp)$`, 'i');
    const entries = fs.readdirSync(this.currentPath);

    for (const entry of entries) {
      if (pattern.test(entry)) {
        info.exists = true;
        const fullPath = path.join(this.currentPath, entry);
        try {
          const entryStat = fs.statSync(fullPath);
          if (entryStat.isFile()) {
            info.imageCount++;
            info.totalSize += entryStat.size;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
  } catch {
    // If we can't read the folder, treat as not existing
    info.exists = false;
  }

  return info;
};
```

**Features**:
- Checks for images matching specific product name pattern
- Pattern: `{productName}_capture_*.jpg` (e.g., `whiskey_bottle_capture_20250129_143025123_001.jpg`)
- Counts existing images and calculates total size
- Case-insensitive matching
- Supports all image formats (jpg, jpeg, png, webp)

---

### 3. Pre-Flight Validation Update ([src/session.ts:182](src/session.ts#L182))

**Added** product collision check to pre-flight validation:

```typescript
// 7. Check for existing images with same product name (informational only)
const productCollision = this.storage.checkProductCollision(productName);
if (productCollision.exists) {
  const sizeMB = (productCollision.totalSize / (1024 * 1024)).toFixed(2);
  // Log warning but allow session to continue
  if (this.logger) {
    this.logger.warn({
      event: 'product_name_exists',
      product: productName,
      existing_images: productCollision.imageCount,
      total_size_mb: sizeMB,
    }, `⚠️  Product "${productName}" already has ${productCollision.imageCount} images (${sizeMB} MB). New captures will be added.`);
  } else {
    console.warn(`⚠️  Product "${productName}" already has ${productCollision.imageCount} images (${sizeMB} MB). New captures will be added.`);
  }
}

return [true, '✅ Pre-flight checks passed'];
```

**Important**: This is **informational only** - it logs a warning but does NOT block the session.

---

## Behavior Examples

### Scenario 1: First Time Using Base Folder

```
User Action: Click "Use This Location" → Select /Users/me/Desktop
Result: ✅ Storage ready: /Users/me/Desktop/360Photo_Captures (45.2 GB free)
```

No error! Base folder is created and ready.

---

### Scenario 2: Reusing Base Folder (Different Product)

```
Existing: /360Photo_Captures/whiskey_bottle_capture_*.jpg (120 images)
User Action: Click "Use This Location" → Select same /Users/me/Desktop
Result: ✅ Storage ready: /Users/me/Desktop/360Photo_Captures (45.2 GB free)

User Action: Start session with product name "vodka_bottle"
Result: ✅ Pre-flight checks passed
        🚀 Session started
```

No collision! Different product name means no conflict.

---

### Scenario 3: Same Product Name (Adding More Captures)

```
Existing: /360Photo_Captures/whiskey_bottle_capture_*.jpg (120 images, 240 MB)
User Action: Click "Use This Location" → Select /Users/me/Desktop
Result: ✅ Storage ready: /Users/me/Desktop/360Photo_Captures (45.2 GB free)

User Action: Start session with product name "whiskey_bottle"
Console: ⚠️  Product "whiskey_bottle" already has 120 images (240.00 MB). New captures will be added.
Result: ✅ Pre-flight checks passed
        🚀 Session started
```

**Allowed!** Warning is logged but session continues. New images are added to existing ones.

---

### Scenario 4: Structured Logs

When continuing with existing product name:

```json
{
  "level": 40,
  "event": "product_name_exists",
  "product": "whiskey_bottle",
  "existing_images": 120,
  "total_size_mb": "240.00",
  "msg": "⚠️  Product \"whiskey_bottle\" already has 120 images (240.00 MB). New captures will be added."
}
```

Easy to monitor and query!

---

## File Naming Still Prevents Collisions

Even when reusing product names, images **never overwrite** each other due to high-resolution timestamps:

```
Existing images:
  whiskey_bottle_capture_20250129_143025123_001.jpg
  whiskey_bottle_capture_20250129_143025456_002.jpg
  ...

New session (same product name):
  whiskey_bottle_capture_20250129_150000000_001.jpg  ← Different timestamp
  whiskey_bottle_capture_20250129_150000333_002.jpg
  ...
```

**Result**: All images coexist safely in the same folder.

---

## Benefits

### ✅ Reusable Base Folder
- One `/360Photo_Captures` folder for all products
- No need to delete or change locations
- Simplified workflow

### ✅ Product-Specific Detection
- Only warns when same product name is used
- Different products coexist without warnings
- Clear messaging about what will happen

### ✅ Non-Blocking Warnings
- Users can continue if they want to add more captures
- Informational logging for monitoring
- No unnecessary session blocks

### ✅ Safe File Naming
- High-resolution timestamps prevent overwrites
- Millisecond + sequence number precision
- No data loss even with same product name

---

## User Workflow

### Typical Multi-Product Session

1. **Set Storage Once**
   ```
   Click "Use This Location" → /Users/me/Desktop
   Result: ✅ Storage ready
   ```

2. **Capture Product 1**
   ```
   Product: whiskey_bottle
   Rate: 180/min, Duration: 60s
   Result: 180 images captured
   ```

3. **Capture Product 2 (Same Location!)**
   ```
   Click "Use This Location" → Same /Users/me/Desktop
   Result: ✅ Storage ready (reused!)

   Product: vodka_bottle
   Rate: 180/min, Duration: 60s
   Result: 180 images captured
   ```

4. **Add More to Product 1**
   ```
   Product: whiskey_bottle (same name as before)
   Result: ⚠️  120 existing images found. New captures will be added.
           ✅ Session continues
   ```

**Result**: One folder with all products organized by filename prefix!

```
/360Photo_Captures/
  ├── whiskey_bottle_capture_20250129_143025123_001.jpg
  ├── whiskey_bottle_capture_20250129_143025456_002.jpg
  ├── ... (120 images)
  ├── vodka_bottle_capture_20250129_150000000_001.jpg
  ├── vodka_bottle_capture_20250129_150000333_002.jpg
  ├── ... (180 images)
  ├── whiskey_bottle_capture_20250129_160000000_001.jpg  ← Additional captures
  └── ... (60 more images)
```

---

## Validation Checks Summary

### Storage Location Setting (setLocation)
✅ Disk space available (min 1 GB)
✅ Path is writable
❌ REMOVED: Folder collision check

### Session Start (validatePreFlight)
✅ Storage location set
✅ Storage path writable
✅ Camera initialized
✅ Camera receiving frames
✅ Sufficient disk space
✅ Product name provided
✅ **NEW**: Product collision check (warning only)

---

## Migration Notes

### No Breaking Changes
- Existing code works without modification
- API signatures unchanged
- All validation still present
- Only behavioral change: folder reuse is now allowed

### Recommended Actions
1. Test with multiple products in same folder
2. Monitor `product_name_exists` events in logs
3. Verify file naming prevents collisions
4. Check that warnings appear for same product names

---

## Summary

🎯 **What Changed**: Moved collision detection from storage location to session start

✅ **Result**:
- Base folder can be reused for multiple products
- Product-specific collision warning (non-blocking)
- Clean workflow for multi-product sessions
- Safe file naming prevents data loss

🚀 **User Experience**:
- Click "Use This Location" → Always works (if valid path)
- Start session → Warns if product name exists, but allows continuing
- New captures append to existing product images safely

**No more folder collision errors when setting storage location!** 🎉
