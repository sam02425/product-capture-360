/// <reference types="node" />
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface PreprocessOptions {
  inputDir: string;
  outputDir: string;
  keyColorHex?: string; // For chroma key background removal
  tolerance?: number;
  softness?: number;
  // Augmentation options
  backgroundImages?: string[]; // Paths to retail background images
  augment?: boolean; // Enable data augmentation
  augmentCount?: number; // Number of variations per image
  // YOLOv11 preprocessing
  targetSize?: number; // Square size for YOLO (default 640)
  normalizeImages?: boolean; // Normalize to 0-1 range
  addPadding?: boolean; // Add padding to maintain aspect ratio
}

export interface PreprocessResult {
  success: boolean;
  processedCount: number;
  outputDir?: string;
  message?: string;
}

/**
 * Preprocess images for YOLOv11 training
 * - Remove background using chroma key
 * - Apply multiple retail backgrounds
 * - Augment dataset (rotation, brightness, contrast)
 * - Resize to YOLO format (square with padding)
 */
export async function preprocessForYOLO(opts: PreprocessOptions): Promise<PreprocessResult> {
  try {
    const {
      inputDir,
      outputDir,
      keyColorHex = '#00ff00',
      tolerance = 0.25,
      softness = 0.15,
      backgroundImages = [],
      augment = false,
      augmentCount = 3,
      targetSize = 640,
      normalizeImages = false,
      addPadding = true,
    } = opts;

    if (!fs.existsSync(inputDir)) {
      return { success: false, processedCount: 0, message: 'Input directory not found' };
    }

    // Create output directory structure
    const baseOut = outputDir;
    const imagesOut = path.join(baseOut, 'images');
    fs.mkdirSync(imagesOut, { recursive: true });

    // Get all JPG images
    const files = fs.readdirSync(inputDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    if (files.length === 0) {
      return { success: false, processedCount: 0, message: 'No images found in input directory' };
    }

    let processedCount = 0;
    const keyColor = hexToFFmpegColor(keyColorHex);

    // Process each input image
    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const baseName = path.parse(file).name;

      // If no background images specified, just preprocess original
      if (backgroundImages.length === 0) {
        const outputPath = path.join(imagesOut, `${baseName}_processed.jpg`);
        const success = await processImage({
          inputPath,
          outputPath,
          keyColor,
          tolerance,
          softness,
          targetSize,
          addPadding,
          backgroundColor: '#ffffff',
        });
        if (success) processedCount++;
      } else {
        // Apply each background
        for (let bgIdx = 0; bgIdx < backgroundImages.length; bgIdx++) {
          const bgPath = backgroundImages[bgIdx];
          if (!fs.existsSync(bgPath)) continue;

          const outputPath = path.join(imagesOut, `${baseName}_bg${bgIdx}.jpg`);
          const success = await processImage({
            inputPath,
            outputPath,
            keyColor,
            tolerance,
            softness,
            targetSize,
            addPadding,
            backgroundImage: bgPath,
          });
          if (success) processedCount++;

          // Augmentation: create variations
          if (augment) {
            for (let augIdx = 0; augIdx < augmentCount; augIdx++) {
              const augOutputPath = path.join(imagesOut, `${baseName}_bg${bgIdx}_aug${augIdx}.jpg`);
              const augSuccess = await processImageWithAugmentation({
                inputPath,
                outputPath: augOutputPath,
                keyColor,
                tolerance,
                softness,
                targetSize,
                addPadding,
                backgroundImage: bgPath,
                augmentationSeed: augIdx,
              });
              if (augSuccess) processedCount++;
            }
          }
        }
      }
    }

    return {
      success: true,
      processedCount,
      outputDir: baseOut,
      message: `Processed ${processedCount} images for YOLOv11 training`,
    };
  } catch (e: any) {
    return {
      success: false,
      processedCount: 0,
      message: e?.message || 'Preprocessing failed',
    };
  }
}

interface ProcessImageOptions {
  inputPath: string;
  outputPath: string;
  keyColor: string;
  tolerance: number;
  softness: number;
  targetSize: number;
  addPadding: boolean;
  backgroundColor?: string;
  backgroundImage?: string;
}

async function processImage(opts: ProcessImageOptions): Promise<boolean> {
  const {
    inputPath,
    outputPath,
    keyColor,
    tolerance,
    softness,
    targetSize,
    addPadding,
    backgroundColor,
    backgroundImage,
  } = opts;

  try {
    const args: string[] = ['-y', '-i', inputPath];

    // Add background source
    if (backgroundImage) {
      args.push('-i', backgroundImage);
    } else {
      const bgColor = (backgroundColor || '#ffffff').replace('#', '');
      args.push('-f', 'lavfi', '-i', `color=c=#${bgColor}:s=${targetSize}x${targetSize}`);
    }

    // Build filter chain
    let filterChain = '';

    if (backgroundImage) {
      // Scale background to target size
      filterChain += `[1:v]scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:-1:-1:color=white[bg];`;
    } else {
      filterChain += '[1:v][bg];';
    }

    // Remove green screen from foreground and scale to fit
    if (addPadding) {
      filterChain += `[0:v]colorkey=${keyColor}:${tolerance}:${softness},scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:-1:-1:color=0x00000000[fg];`;
    } else {
      filterChain += `[0:v]colorkey=${keyColor}:${tolerance}:${softness},scale=${targetSize}:${targetSize}[fg];`;
    }

    // Overlay foreground on background
    filterChain += '[bg][fg]overlay=format=auto,format=yuv420p[out]';

    args.push('-filter_complex', filterChain, '-map', '[out]', '-q:v', '2', outputPath);

    const code = await runFFmpeg(args);
    return code === 0;
  } catch {
    return false;
  }
}

interface ProcessImageWithAugmentationOptions extends ProcessImageOptions {
  augmentationSeed: number;
}

async function processImageWithAugmentation(opts: ProcessImageWithAugmentationOptions): Promise<boolean> {
  const {
    inputPath,
    outputPath,
    keyColor,
    tolerance,
    softness,
    targetSize,
    addPadding,
    backgroundImage,
    augmentationSeed,
  } = opts;

  try {
    const args: string[] = ['-y', '-i', inputPath];

    // Add background source
    if (backgroundImage) {
      args.push('-i', backgroundImage);
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=#ffffff:s=${targetSize}x${targetSize}`);
    }

    // Augmentation parameters based on seed
    const rotations = [0, 5, -5, 10, -10];
    const brightness = [0, 0.05, -0.05, 0.10, -0.10];
    const contrast = [1.0, 1.1, 0.9, 1.15, 0.85];
    const saturation = [1.0, 1.1, 0.9, 1.2, 0.8];

    const rotation = rotations[augmentationSeed % rotations.length];
    const bright = brightness[augmentationSeed % brightness.length];
    const contr = contrast[augmentationSeed % contrast.length];
    const sat = saturation[augmentationSeed % saturation.length];

    // Build filter chain with augmentation
    let filterChain = '';

    if (backgroundImage) {
      filterChain += `[1:v]scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:-1:-1:color=white[bg];`;
    } else {
      filterChain += '[1:v][bg];';
    }

    // Apply augmentation: chroma key, rotate, adjust colors, scale
    let fgFilters = `[0:v]colorkey=${keyColor}:${tolerance}:${softness}`;

    if (rotation !== 0) {
      fgFilters += `,rotate=${rotation * (Math.PI / 180)}:c=none`;
    }

    fgFilters += `,eq=brightness=${bright}:contrast=${contr}:saturation=${sat}`;

    if (addPadding) {
      fgFilters += `,scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:-1:-1:color=0x00000000[fg]`;
    } else {
      fgFilters += `,scale=${targetSize}:${targetSize}[fg]`;
    }

    filterChain += fgFilters + ';';
    filterChain += '[bg][fg]overlay=format=auto,format=yuv420p[out]';

    args.push('-filter_complex', filterChain, '-map', '[out]', '-q:v', '2', outputPath);

    const code = await runFFmpeg(args);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Generate dataset with multiple retail backgrounds
 */
export async function generateRetailDataset(opts: {
  inputDir: string;
  outputDir: string;
  keyColorHex?: string;
  tolerance?: number;
  softness?: number;
  retailBackgrounds: string[]; // Paths to retail shelf/store backgrounds
  augmentPerBackground?: number;
}): Promise<PreprocessResult> {
  return preprocessForYOLO({
    inputDir: opts.inputDir,
    outputDir: opts.outputDir,
    keyColorHex: opts.keyColorHex,
    tolerance: opts.tolerance,
    softness: opts.softness,
    backgroundImages: opts.retailBackgrounds,
    augment: true,
    augmentCount: opts.augmentPerBackground || 3,
    targetSize: 640,
    addPadding: true,
  });
}

/**
 * Create YOLO-format annotation template
 * This creates empty annotation files - you'll need to label them manually or with a tool
 */
export function createYOLOAnnotations(imagesDir: string, className: string = 'product'): void {
  const labelsDir = path.join(path.dirname(imagesDir), 'labels');
  fs.mkdirSync(labelsDir, { recursive: true });

  const imageFiles = fs.readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  // Create classes.txt
  fs.writeFileSync(path.join(path.dirname(imagesDir), 'classes.txt'), className);

  // Create empty label files (YOLO format: class_id x_center y_center width height)
  for (const imgFile of imageFiles) {
    const baseName = path.parse(imgFile).name;
    const labelPath = path.join(labelsDir, `${baseName}.txt`);
    // Create placeholder - assumes object is centered and takes 80% of image
    // Format: class_id x_center y_center width height (normalized 0-1)
    fs.writeFileSync(labelPath, '0 0.5 0.5 0.8 0.8\n');
  }
}

function hexToFFmpegColor(hex: string): string {
  const h = hex.replace('#', '');
  return '0x' + h.toLowerCase();
}

async function runFFmpeg(args: string[]): Promise<number> {
  return new Promise<number>((resolve) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.on('close', (code) => resolve(code ?? 1));
  });
}
