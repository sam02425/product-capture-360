/// <reference types="node" />
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Advanced augmentation for retail product training
 * - Background replacement with retail scenes
 * - Zoom variations (product near/far)
 * - Perspective transforms
 * - Lighting variations
 * - Realistic shadows
 * - Color jitter
 */

export interface AugmentationOptions {
  inputDir: string; // Directory with original images
  masksDir: string; // Directory with segmentation masks
  outputDir: string;
  backgroundImages: string[]; // Retail background images
  augmentationsPerImage?: number;
  enableZoomVariations?: boolean;
  enablePerspective?: boolean;
  enableLightingVariations?: boolean;
  enableColorJitter?: boolean;
  enableShadows?: boolean;
  targetSize?: number; // Output size (e.g., 640 for YOLO)
}

export interface AugmentationResult {
  success: boolean;
  generatedCount: number;
  outputDir?: string;
  message?: string;
}

/**
 * Apply advanced augmentations to create diverse training dataset
 */
export async function applyAdvancedAugmentations(opts: AugmentationOptions): Promise<AugmentationResult> {
  try {
    const {
      inputDir,
      masksDir,
      outputDir,
      backgroundImages,
      augmentationsPerImage = 5,
      enableZoomVariations = true,
      enablePerspective = true,
      enableLightingVariations = true,
      enableColorJitter = true,
      enableShadows = true,
      targetSize = 640,
    } = opts;

    // Verify directories
    if (!fs.existsSync(inputDir) || !fs.existsSync(masksDir)) {
      return { success: false, generatedCount: 0, message: 'Input or masks directory not found' };
    }

    // Create output directory
    const imagesOut = path.join(outputDir, 'images');
    fs.mkdirSync(imagesOut, { recursive: true });

    const images = fs.readdirSync(inputDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    if (images.length === 0) {
      return { success: false, generatedCount: 0, message: 'No images found' };
    }

    let generatedCount = 0;

    // Process each image
    for (const imgFile of images) {
      const imgPath = path.join(inputDir, imgFile);
      const baseName = path.parse(imgFile).name;
      const maskPath = path.join(masksDir, `${baseName}_mask.png`);

      if (!fs.existsSync(maskPath)) {
        console.warn(`Mask not found for ${imgFile}, skipping`);
        continue;
      }

      // For each background
      for (let bgIdx = 0; bgIdx < backgroundImages.length; bgIdx++) {
        const bgPath = backgroundImages[bgIdx];
        if (!fs.existsSync(bgPath)) continue;

        // Generate base image with background
        const baseOutput = path.join(imagesOut, `${baseName}_bg${bgIdx}.jpg`);
        const baseSuccess = await compositeWithBackground(imgPath, maskPath, bgPath, baseOutput, {
          targetSize,
          zoom: 1.0,
          brightness: 1.0,
          contrast: 1.0,
          saturation: 1.0,
        });

        if (baseSuccess) generatedCount++;

        // Generate augmented variations
        for (let augIdx = 0; augIdx < augmentationsPerImage; augIdx++) {
          const augOutput = path.join(imagesOut, `${baseName}_bg${bgIdx}_aug${augIdx}.jpg`);

          // Random augmentation parameters
          const params = generateAugmentationParams(augIdx, {
            enableZoomVariations,
            enablePerspective,
            enableLightingVariations,
            enableColorJitter,
            enableShadows,
          });

          const success = await compositeWithBackground(imgPath, maskPath, bgPath, augOutput, {
            targetSize,
            ...params,
          });

          if (success) generatedCount++;
        }
      }
    }

    return {
      success: true,
      generatedCount,
      outputDir: imagesOut,
      message: `Generated ${generatedCount} augmented images`,
    };
  } catch (e: any) {
    return {
      success: false,
      generatedCount: 0,
      message: e?.message || 'Augmentation failed',
    };
  }
}

interface CompositeParams {
  targetSize: number;
  zoom?: number; // 0.5 = far away, 1.0 = normal, 1.5 = close up
  brightness?: number; // 0.5-1.5
  contrast?: number; // 0.5-1.5
  saturation?: number; // 0.5-1.5
  rotation?: number; // degrees
  perspective?: boolean;
  addShadow?: boolean;
  hue?: number; // -30 to 30
}

/**
 * Composite product onto background with augmentations
 */
async function compositeWithBackground(
  productPath: string,
  maskPath: string,
  backgroundPath: string,
  outputPath: string,
  params: CompositeParams
): Promise<boolean> {
  const {
    targetSize,
    zoom = 1.0,
    brightness = 1.0,
    contrast = 1.0,
    saturation = 1.0,
    rotation = 0,
    perspective = false,
    addShadow = false,
    hue = 0,
  } = params;

  try {
    // Calculate product size based on zoom
    // zoom=0.5 means product takes 30% of image (far)
    // zoom=1.0 means product takes 60% of image (normal)
    // zoom=1.5 means product takes 90% of image (close)
    const productRatio = 0.3 + (zoom * 0.4);
    const productSize = Math.floor(targetSize * productRatio);

    const args = ['-y'];

    // Input: product image
    args.push('-i', productPath);

    // Input: mask (alpha channel)
    args.push('-i', maskPath);

    // Input: background
    args.push('-i', backgroundPath);

    // Build complex filter chain
    let filterChain = '';

    // 1. Scale background to target size
    filterChain += `[2:v]scale=${targetSize}:${targetSize}:force_original_aspect_ratio=increase,crop=${targetSize}:${targetSize}[bg];`;

    // 2. Process product: apply mask, color adjustments, scale
    filterChain += `[0:v][1:v]alphamerge[masked];`;

    // Color adjustments
    let colorFilter = `eq=brightness=${brightness - 1.0}:contrast=${contrast}:saturation=${saturation}`;
    if (hue !== 0) {
      colorFilter += `,hue=h=${hue}`;
    }
    filterChain += `[masked]${colorFilter}[colored];`;

    // Rotation
    if (rotation !== 0) {
      const rad = rotation * (Math.PI / 180);
      filterChain += `[colored]rotate=${rad}:c=none[rotated];`;
      filterChain += `[rotated]scale=${productSize}:${productSize}:force_original_aspect_ratio=decrease[scaled];`;
    } else {
      filterChain += `[colored]scale=${productSize}:${productSize}:force_original_aspect_ratio=decrease[scaled];`;
    }

    // 3. Add shadow (optional)
    if (addShadow) {
      // Create shadow by blurring a copy and darkening it
      filterChain += `[scaled]split[fg][shadow_src];`;
      filterChain += `[shadow_src]colorchannelmixer=aa=0.4,boxblur=10:10[shadow];`;

      // Offset shadow slightly
      const shadowOffset = Math.floor(productSize * 0.05);
      filterChain += `[bg][shadow]overlay=x=(W-w)/2+${shadowOffset}:y=(H-h)/2+${shadowOffset}[bg_shadow];`;
      filterChain += `[bg_shadow][fg]overlay=x=(W-w)/2:y=(H-h)/2:format=auto[out]`;
    } else {
      // 4. Overlay on background (centered)
      filterChain += `[bg][scaled]overlay=x=(W-w)/2:y=(H-h)/2:format=auto[out]`;
    }

    args.push('-filter_complex', filterChain);
    args.push('-map', '[out]');
    args.push('-q:v', '2'); // High quality
    args.push(outputPath);

    const code = await runFFmpeg(args);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Generate random augmentation parameters
 */
function generateAugmentationParams(
  seed: number,
  options: {
    enableZoomVariations?: boolean;
    enablePerspective?: boolean;
    enableLightingVariations?: boolean;
    enableColorJitter?: boolean;
    enableShadows?: boolean;
  }
): Partial<CompositeParams> {
  const params: Partial<CompositeParams> = {};

  // Zoom variations: far, normal, close
  if (options.enableZoomVariations) {
    const zoomLevels = [0.5, 0.7, 0.9, 1.0, 1.2, 1.4];
    params.zoom = zoomLevels[seed % zoomLevels.length];
  }

  // Lighting variations
  if (options.enableLightingVariations) {
    const brightnessLevels = [0.7, 0.85, 1.0, 1.15, 1.3];
    const contrastLevels = [0.8, 0.9, 1.0, 1.1, 1.2];
    params.brightness = brightnessLevels[seed % brightnessLevels.length];
    params.contrast = contrastLevels[(seed + 1) % contrastLevels.length];
  }

  // Color jitter
  if (options.enableColorJitter) {
    const saturationLevels = [0.7, 0.85, 1.0, 1.15, 1.3];
    const hueLevels = [-10, -5, 0, 5, 10];
    params.saturation = saturationLevels[seed % saturationLevels.length];
    params.hue = hueLevels[(seed + 2) % hueLevels.length];
  }

  // Rotation (small angles)
  const rotationAngles = [-8, -5, -3, 0, 3, 5, 8];
  params.rotation = rotationAngles[seed % rotationAngles.length];

  // Shadows (50% chance)
  if (options.enableShadows) {
    params.addShadow = seed % 2 === 0;
  }

  return params;
}

async function runFFmpeg(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', () => resolve(1));
  });
}
