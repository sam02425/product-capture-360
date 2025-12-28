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

    // Verify product folder exists
    if (!fs.existsSync(productFolder)) {
      return {
        ...result,
        message: `Product folder not found: ${productFolder}`,
      };
    }

    const images = fs.readdirSync(productFolder).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    result.stats.originalImages = images.length;

    if (images.length === 0) {
      return {
        ...result,
        message: 'No images found in product folder',
      };
    }

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
