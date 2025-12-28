/// <reference types="node" />
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Auto-segmentation using Segment Anything Model (SAM) or similar
 * This module handles automatic bottle detection and mask generation
 */

export interface SegmentationResult {
  success: boolean;
  masks: PolygonMask[];
  message?: string;
}

export interface PolygonMask {
  points: [number, number][]; // Array of [x, y] coordinates
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number;
  area: number;
}

export interface SegmentationOptions {
  imageDir: string;
  outputDir: string;
  modelType: 'sam' | 'rembg' | 'u2net'; // Segmentation model
  confidenceThreshold?: number;
  minArea?: number; // Minimum mask area to filter noise
  targetClass?: string; // e.g., 'bottle'
}

/**
 * Auto-segment all images in a product folder
 * Uses SAM (Segment Anything Model) via Python subprocess
 */
export async function autoSegmentFolder(opts: SegmentationOptions): Promise<{
  success: boolean;
  processedCount: number;
  masksDir?: string;
  message?: string;
}> {
  try {
    const { imageDir, outputDir, modelType = 'rembg', confidenceThreshold = 0.5, minArea = 1000 } = opts;

    if (!fs.existsSync(imageDir)) {
      return { success: false, processedCount: 0, message: 'Image directory not found' };
    }

    const images = fs.readdirSync(imageDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    if (images.length === 0) {
      return { success: false, processedCount: 0, message: 'No images found' };
    }

    // Create output directories
    const masksDir = path.join(outputDir, 'masks');
    const polygonsDir = path.join(outputDir, 'polygons');
    fs.mkdirSync(masksDir, { recursive: true });
    fs.mkdirSync(polygonsDir, { recursive: true });

    let processedCount = 0;

    // Process each image
    for (const imgFile of images) {
      const imgPath = path.join(imageDir, imgFile);
      const baseName = path.parse(imgFile).name;
      const maskPath = path.join(masksDir, `${baseName}_mask.png`);
      const polygonPath = path.join(polygonsDir, `${baseName}.json`);

      // Run segmentation based on model type
      let success = false;
      if (modelType === 'rembg') {
        success = await segmentWithRembg(imgPath, maskPath);
      } else if (modelType === 'sam') {
        success = await segmentWithSAM(imgPath, maskPath, polygonPath);
      } else if (modelType === 'u2net') {
        success = await segmentWithU2Net(imgPath, maskPath);
      }

      if (success) {
        // Convert mask to polygon
        const polygon = await maskToPolygon(maskPath, minArea);
        if (polygon) {
          fs.writeFileSync(polygonPath, JSON.stringify(polygon, null, 2));
          processedCount++;
        }
      }
    }

    return {
      success: true,
      processedCount,
      masksDir,
      message: `Segmented ${processedCount} images`
    };
  } catch (e: any) {
    return {
      success: false,
      processedCount: 0,
      message: e?.message || 'Segmentation failed'
    };
  }
}

/**
 * Segment using rembg (simple background removal)
 * Install: pip install rembg opencv-python pillow
 */
async function segmentWithRembg(inputPath: string, outputPath: string): Promise<boolean> {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'rembg_segment.py');
  const polygonPath = outputPath.replace('_mask.png', '_polygon.json');

  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, inputPath, outputPath, polygonPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log('rembg success:', stderr);
        resolve(true);
      } else {
        console.error('rembg failed:', stderr);
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.error('rembg spawn error:', err);
      resolve(false);
    });
  });
}

/**
 * Segment using SAM (Segment Anything Model)
 * Requires Python script with SAM
 */
async function segmentWithSAM(inputPath: string, maskPath: string, polygonPath: string): Promise<boolean> {
  // We'll create a Python script that uses SAM
  const scriptPath = path.join(__dirname, '..', 'scripts', 'sam_segment.py');

  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, inputPath, maskPath, polygonPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.on('close', (code) => {
      resolve(code === 0 && fs.existsSync(maskPath));
    });

    proc.on('error', () => resolve(false));
  });
}

/**
 * Segment using U2-Net
 */
async function segmentWithU2Net(inputPath: string, outputPath: string): Promise<boolean> {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'u2net_segment.py');

  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, inputPath, outputPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.on('close', (code) => {
      resolve(code === 0 && fs.existsSync(outputPath));
    });

    proc.on('error', () => resolve(false));
  });
}

/**
 * Convert binary mask to polygon using OpenCV contours
 */
async function maskToPolygon(maskPath: string, minArea: number = 1000): Promise<PolygonMask | null> {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'mask_to_polygon.py');

  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, maskPath, String(minArea)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

/**
 * Alternative: Use FFmpeg for simple background removal (faster but less accurate)
 */
export async function simpleBackgroundRemoval(
  inputPath: string,
  outputPath: string,
  keyColor: string = '#00ff00',
  tolerance: number = 0.3
): Promise<boolean> {
  const color = keyColor.replace('#', '0x');

  return new Promise((resolve) => {
    const args = [
      '-y', '-i', inputPath,
      '-vf', `colorkey=${color}:${tolerance}:0.1`,
      '-f', 'png', outputPath
    ];

    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    proc.on('close', (code) => {
      resolve(code === 0 && fs.existsSync(outputPath));
    });

    proc.on('error', () => resolve(false));
  });
}
