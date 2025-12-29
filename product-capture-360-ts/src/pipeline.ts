/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { autoSegmentFolder } from './segmentation';
import { applyAdvancedAugmentations } from './augmentation';
import { exportDataset } from './dataset_export';

/**
 * Complete pipeline for YOLOv11 training dataset generation
 *
 * Steps:
 * 1. Auto-segment product images (detect bottle, create masks)
 * 2. Apply advanced augmentations (backgrounds, zoom, lighting)
 * 3. Export in desired format (YOLOv5/v8/v11/COCO)
 */

export interface PipelineOptions {
  productFolder: string; // Folder with 120 captured images
  productName: string;   // e.g., "whiskey_bottle"
  outputDir: string;     // Base output directory

  // Segmentation options
  segmentationModel: 'sam' | 'rembg' | 'u2net';

  // Augmentation options
  backgroundImages: string[]; // Retail shelf images
  augmentationsPerBackground?: number;
  enableZoom?: boolean;
  enablePerspective?: boolean;
  enableLighting?: boolean;
  enableColorJitter?: boolean;
  enableShadows?: boolean;

  // Export options
  exportFormats: ('yolov5' | 'yolov8' | 'yolov11' | 'coco' | 'all')[];
  trainValSplit?: number; // 0.8 = 80% train, 20% val
}

export interface PipelineResult {
  success: boolean;
  steps: {
    segmentation?: { success: boolean; count: number; message?: string };
    augmentation?: { success: boolean; count: number; message?: string };
    export?: { success: boolean; formats: string[]; message?: string };
  };
  outputDirs: {
    masks?: string;
    augmented?: string;
    exports?: string[];
  };
  stats: {
    originalImages: number;
    maskedImages: number;
    augmentedImages: number;
    trainImages: number;
    valImages: number;
  };
  message?: string;
}

/**
 * Production-grade input validation for pipeline
 */
function validatePipelineInputs(opts: PipelineOptions): [boolean, string] {
  const {
    productFolder,
    productName,
    outputDir,
    backgroundImages,
    augmentationsPerBackground = 5,
    trainValSplit = 0.8,
  } = opts;

  // 1. Product folder must exist
  if (!fs.existsSync(productFolder)) {
    return [false, `❌ VALIDATION FAILED: Product folder does not exist\n   📁 Path: ${productFolder}\n   💡 Check the path and try again`];
  }

  // 2. Product folder must be readable
  try {
    fs.accessSync(productFolder, fs.constants.R_OK);
  } catch {
    return [false, `❌ VALIDATION FAILED: Cannot read product folder\n   🔒 Path: ${productFolder}\n   💡 Check folder permissions`];
  }

  // 3. Must contain images
  let images: string[] = [];
  try {
    images = fs.readdirSync(productFolder).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  } catch (e: any) {
    return [false, `❌ VALIDATION FAILED: Cannot read images from folder\n   📁 Path: ${productFolder}\n   Error: ${e?.message}`];
  }

  if (images.length === 0) {
    return [false, `❌ VALIDATION FAILED: No images found in product folder\n   📁 Path: ${productFolder}\n   💡 Add .jpg, .jpeg, or .png images to the folder`];
  }

  if (images.length < 10) {
    return [false, `❌ VALIDATION FAILED: Insufficient images for training\n   📸 Found: ${images.length} images\n   💡 Minimum 10 images recommended, 120+ for production datasets`];
  }

  // 4. Product name validation
  if (!productName || productName.trim() === '') {
    return [false, '❌ VALIDATION FAILED: Product name required\n   🏷️  Provide a valid product name'];
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(productName)) {
    return [false, `❌ VALIDATION FAILED: Invalid product name\n   🏷️  Name: "${productName}"\n   💡 Use only letters, numbers, hyphens, and underscores`];
  }

  // 5. Output directory validation
  const outputParent = path.dirname(outputDir);
  if (!fs.existsSync(outputParent)) {
    return [false, `❌ VALIDATION FAILED: Output parent directory does not exist\n   📂 Path: ${outputParent}\n   💡 Create the parent directory first`];
  }

  // 6. Check if output directory already exists
  if (fs.existsSync(outputDir)) {
    try {
      const entries = fs.readdirSync(outputDir);
      const hasContent = entries.length > 0;
      if (hasContent) {
        return [false, `❌ VALIDATION FAILED: Output directory already exists with content\n   📂 Path: ${outputDir}\n   📁 Contains: ${entries.length} items\n   💡 Delete the directory or choose a different output path`];
      }
    } catch (e: any) {
      return [false, `❌ VALIDATION FAILED: Cannot read output directory\n   🔒 Path: ${outputDir}\n   Error: ${e?.message}`];
    }
  }

  // 7. Validate background images
  if (!backgroundImages || backgroundImages.length === 0) {
    return [false, '❌ VALIDATION FAILED: No background images provided\n   🖼️  Background images are required for augmentation\n   💡 Provide at least 5 retail shelf/environment images'];
  }

  for (const bg of backgroundImages) {
    if (!fs.existsSync(bg)) {
      return [false, `❌ VALIDATION FAILED: Background image not found\n   🖼️  Path: ${bg}\n   💡 Check all background image paths`];
    }
  }

  if (backgroundImages.length < 3) {
    return [false, `❌ VALIDATION FAILED: Insufficient background images\n   🖼️  Found: ${backgroundImages.length}\n   💡 Minimum 3 backgrounds recommended, 10+ for diverse datasets`];
  }

  // 8. Validate augmentation parameters
  if (augmentationsPerBackground < 1 || augmentationsPerBackground > 20) {
    return [false, `❌ VALIDATION FAILED: Invalid augmentations per background\n   🔢 Value: ${augmentationsPerBackground}\n   💡 Must be between 1 and 20`];
  }

  // 9. Validate train/val split
  if (trainValSplit < 0.5 || trainValSplit > 0.95) {
    return [false, `❌ VALIDATION FAILED: Invalid train/val split ratio\n   🔢 Value: ${trainValSplit}\n   💡 Must be between 0.5 (50%) and 0.95 (95%)`];
  }

  // 10. Check disk space for output
  try {
    const { execSync } = require('child_process');
    const outputDisk = fs.existsSync(outputDir) ? outputDir : outputParent;

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const dfOutput = execSync(`df -k "${outputDisk}"`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        const availableKB = parseInt(parts[3], 10);
        const availableGB = availableKB / (1024 * 1024);

        // Estimate: each image ~2MB original + ~5MB per augmentation
        const estimatedGB = (images.length * 2 + images.length * backgroundImages.length * augmentationsPerBackground * 5) / 1024;

        if (availableGB < estimatedGB + 1) {
          return [false, `❌ VALIDATION FAILED: Insufficient disk space\n   💾 Available: ${availableGB.toFixed(2)} GB\n   💾 Estimated need: ${estimatedGB.toFixed(2)} GB\n   💡 Free up space or reduce augmentations`];
        }
      }
    }
  } catch {
    // If we can't check disk space, continue
  }

  return [true, `✅ Validation passed: ${images.length} images, ${backgroundImages.length} backgrounds`];
}

/**
 * Run complete pipeline
 */
export async function runCompletePipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const result: PipelineResult = {
    success: false,
    steps: {},
    outputDirs: {},
    stats: {
      originalImages: 0,
      maskedImages: 0,
      augmentedImages: 0,
      trainImages: 0,
      valImages: 0,
    },
  };

  try {
    // Production-grade input validation
    const [valid, validationMessage] = validatePipelineInputs(opts);
    if (!valid) {
      console.error(validationMessage);
      return {
        ...result,
        message: validationMessage,
      };
    }

    console.log(validationMessage);

    const {
      productFolder,
      productName,
      outputDir,
      segmentationModel,
      backgroundImages,
      augmentationsPerBackground = 5,
      enableZoom = true,
      enablePerspective = true,
      enableLighting = true,
      enableColorJitter = true,
      enableShadows = true,
      exportFormats,
      trainValSplit = 0.8,
    } = opts;

    const images = fs.readdirSync(productFolder).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    result.stats.originalImages = images.length;

    console.log(`\n🚀 Starting pipeline for ${productName}`);
    console.log(`📁 Input: ${productFolder} (${images.length} images)`);
    console.log(`📂 Output: ${outputDir}\n`);

    // Create output directory structure
    const pipelineDir = path.join(outputDir, productName);
    const segmentationDir = path.join(pipelineDir, '1_segmentation');
    const augmentationDir = path.join(pipelineDir, '2_augmentation');
    const exportDir = path.join(pipelineDir, '3_exports');

    fs.mkdirSync(pipelineDir, { recursive: true });

    // ==========================================
    // STEP 1: Auto-Segmentation
    // ==========================================
    console.log('📍 Step 1/3: Auto-Segmentation');
    console.log(`   Model: ${segmentationModel}`);

    const segResult = await autoSegmentFolder({
      imageDir: productFolder,
      outputDir: segmentationDir,
      modelType: segmentationModel,
      confidenceThreshold: 0.5,
      minArea: 1000,
      targetClass: productName,
    });

    result.steps.segmentation = {
      success: segResult.success,
      count: segResult.processedCount || 0,
      message: segResult.message,
    };

    if (!segResult.success || !segResult.processedCount) {
      return {
        ...result,
        message: `Segmentation failed: ${segResult.message}`,
      };
    }

    result.stats.maskedImages = segResult.processedCount;
    result.outputDirs.masks = segResult.masksDir;

    console.log(`   ✅ Segmented ${segResult.processedCount} images`);
    console.log(`   📂 Masks: ${segResult.masksDir}\n`);

    // ==========================================
    // STEP 2: Advanced Augmentation
    // ==========================================
    console.log('📍 Step 2/3: Advanced Augmentation');
    console.log(`   Backgrounds: ${backgroundImages.length}`);
    console.log(`   Augmentations per bg: ${augmentationsPerBackground}`);

    const augResult = await applyAdvancedAugmentations({
      inputDir: productFolder,
      masksDir: segResult.masksDir!,
      outputDir: augmentationDir,
      backgroundImages,
      augmentationsPerImage: augmentationsPerBackground,
      enableZoomVariations: enableZoom,
      enablePerspective,
      enableLightingVariations: enableLighting,
      enableColorJitter,
      enableShadows,
      targetSize: 640,
    });

    result.steps.augmentation = {
      success: augResult.success,
      count: augResult.generatedCount || 0,
      message: augResult.message,
    };

    if (!augResult.success || !augResult.generatedCount) {
      return {
        ...result,
        message: `Augmentation failed: ${augResult.message}`,
      };
    }

    result.stats.augmentedImages = augResult.generatedCount;
    result.outputDirs.augmented = augResult.outputDir;

    console.log(`   ✅ Generated ${augResult.generatedCount} augmented images`);
    console.log(`   📂 Images: ${augResult.outputDir}\n`);

    // ==========================================
    // STEP 3: Export to Training Formats
    // ==========================================
    console.log('📍 Step 3/3: Export to Training Formats');
    console.log(`   Formats: ${exportFormats.join(', ')}`);

    const polygonsDir = path.join(segmentationDir, 'polygons');
    const exportedFormats: string[] = [];

    for (const format of exportFormats) {
      const expResult = await exportDataset({
        imagesDir: augResult.outputDir!,
        polygonsDir,
        outputDir: exportDir,
        format,
        className: productName,
        splitRatio: trainValSplit,
      });

      if (expResult.success) {
        exportedFormats.push(...expResult.formats);
        result.stats.trainImages = expResult.trainCount || 0;
        result.stats.valImages = expResult.valCount || 0;
      }
    }

    result.steps.export = {
      success: exportedFormats.length > 0,
      formats: exportedFormats,
      message: `Exported to ${exportedFormats.length} format(s)`,
    };

    result.outputDirs.exports = exportedFormats.map(fmt => path.join(exportDir, fmt));

    console.log(`   ✅ Exported to: ${exportedFormats.join(', ')}`);
    console.log(`   📂 Output: ${exportDir}\n`);

    // ==========================================
    // Pipeline Complete
    // ==========================================
    result.success = true;
    result.message = 'Pipeline completed successfully';

    console.log('🎉 Pipeline Complete!');
    console.log('');
    console.log('📊 Statistics:');
    console.log(`   Original images: ${result.stats.originalImages}`);
    console.log(`   Segmented: ${result.stats.maskedImages}`);
    console.log(`   Augmented: ${result.stats.augmentedImages}`);
    console.log(`   Train: ${result.stats.trainImages}`);
    console.log(`   Val: ${result.stats.valImages}`);
    console.log('');
    console.log('📁 Output Directories:');
    console.log(`   Masks: ${result.outputDirs.masks}`);
    console.log(`   Augmented: ${result.outputDirs.augmented}`);
    result.outputDirs.exports?.forEach((dir, idx) => {
      console.log(`   Export ${idx + 1}: ${dir}`);
    });
    console.log('');

    return result;
  } catch (e: any) {
    return {
      ...result,
      success: false,
      message: e?.message || 'Pipeline failed',
    };
  }
}

/**
 * Quick pipeline with sane defaults for liquor bottles
 */
export async function quickLiquorBottlePipeline(
  productFolder: string,
  productName: string,
  backgroundImages: string[]
): Promise<PipelineResult> {
  const outputDir = path.join(path.dirname(productFolder), `${productName}_dataset`);

  return runCompletePipeline({
    productFolder,
    productName,
    outputDir,
    segmentationModel: 'rembg', // Fast and good for bottles
    backgroundImages,
    augmentationsPerBackground: 5,
    enableZoom: true,
    enablePerspective: true,
    enableLighting: true,
    enableColorJitter: true,
    enableShadows: true,
    exportFormats: ['all'],
    trainValSplit: 0.8,
  });
}
