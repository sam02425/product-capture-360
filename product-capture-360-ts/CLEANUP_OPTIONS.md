# Cleanup Options

## Current State

### Documentation Files: 33 total (lots of duplication)
```
✅ Essential (Keep):
  - README.md (16K) - Main documentation
  - LIGHTNING_FAST_CAPTURE.md (8.3K) - Performance optimizations
  - PRODUCT_FOLDER_ORGANIZATION.md (6.1K) - Folder structure
  - ZOMBIE_PROCESS_PREVENTION.md (4.5K) - Process management
  - OPTIMIZATION_SUMMARY.md (5.1K) - Quick reference

⚠️ Outdated/Duplicate (Can archive):
  - CURRENT_STATUS.md - Outdated status
  - CAMERA_FRAME_ISSUE.md - Old issue, now fixed
  - CAPTURE_COUNT_FIX.md - Old fix, superseded
  - INFINITE_LOOP_FIX.md - Old fix, superseded
  - READY_TO_TEST.md - Testing docs
  - SESSION_LOGGING.md - Covered in main docs
  - FOLDER_COLLISION_FIX.md - Covered in main docs
  - CAPTURE_RATE_GUARANTEE.md - Covered in optimization docs
  - And 20+ more duplicates/outdated docs...
```

### Source Code: All needed (keep everything)
```
✅ Core capture system:
  - src/camera.ts (9.8K) - Camera management
  - src/session.ts (21K) - Session management ⚡
  - src/storage.ts (11K) - Storage + folders 📁
  - src/server.ts (25K) - API server

✅ Future features (keep for later use):
  - src/video.ts (1.5K) - Video creation
  - src/background.ts (4.5K) - Background replacement
  - src/preprocessing.ts (10K) - YOLO preprocessing
  - src/pipeline.ts (14K) - Complete pipeline
  - src/augmentation.ts (8.8K) - Data augmentation
  - src/segmentation.ts (6.6K) - Object segmentation
  - src/dataset_export.ts (11K) - Dataset export
  - src/versioning.ts (8.7K) - Version management
```

## Cleanup Script

### Option 1: Archive Old Documentation (Recommended)

Run the cleanup script to archive outdated docs:

```bash
./cleanup.sh
```

**What it does**:
- Keeps 5 essential documentation files
- Archives 28 outdated/duplicate docs to `.archive/old_docs/`
- You can delete `.archive/` later if you don't need them

**Result**:
- Clean root directory with only essential docs
- Old docs preserved in archive (safe)
- Easy to find current documentation

### Option 2: Manual Cleanup

Delete individual files you don't need:

```bash
# Remove old status/issue docs
rm CURRENT_STATUS.md CAMERA_FRAME_ISSUE.md CAMERA_FEED_FIX.md

# Remove old fix docs (superseded by optimization docs)
rm CAPTURE_COUNT_FIX.md INFINITE_LOOP_FIX.md FOLDER_COLLISION_FIX.md

# Remove duplicate guides
rm QUICK_START.md QUICKSTART.md  # Duplicates of README.md
rm README_COMPLETE.md  # Duplicate of README.md

# Keep going...
```

### Option 3: Keep Everything (Current State)

Do nothing - all files remain as-is.

**Pros**: Nothing breaks, all history preserved
**Cons**: Cluttered, hard to find current docs

## Recommended Action

**Run the cleanup script** to archive old docs:

```bash
./cleanup.sh
```

Then you'll have a clean directory with only essential current documentation:

```
📂 Root directory (clean):
  ✅ README.md - Main documentation
  ✅ LIGHTNING_FAST_CAPTURE.md - Performance guide
  ✅ PRODUCT_FOLDER_ORGANIZATION.md - Folder structure
  ✅ ZOMBIE_PROCESS_PREVENTION.md - Process management
  ✅ OPTIMIZATION_SUMMARY.md - Quick reference

📂 .archive/old_docs/ (archived):
  📦 28 old documentation files (preserved, safe to delete later)
```

## Summary

**Documentation**: 28 out of 33 files can be archived (85% reduction)
**Source Code**: Keep all 12 source files (future features needed)
**Scripts**: Keep all scripts (restart.sh, organize_existing_images.sh, cleanup.sh)

**Recommendation**: Run `./cleanup.sh` to clean up documentation while preserving all code.
