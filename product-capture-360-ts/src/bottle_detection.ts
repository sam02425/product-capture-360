import path from 'path';
import fs from 'fs/promises';
import { runPythonScript, parseSubprocessJSON } from './subprocess_utils';
import { yoloCache } from './ml_cache';

export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
}

export interface DetectionOptions {
  model?: string;
  confidence?: number;
  label?: string;
  targetClass?: string;
}

/**
 * Generate cache key based on image hash and options
 */
async function getCacheKey(imagePath: string, options: DetectionOptions): Promise<Record<string, any>> {
  // Get file modification time and size for quick cache invalidation
  const stats = await fs.stat(imagePath);

  return {
    imagePath,
    mtime: stats.mtimeMs,
    size: stats.size,
    model: options.model || 'yolov8-bottle',
    confidence: options.confidence || 0.85,
    targetClass: options.targetClass || 'bottle'
  };
}

/**
 * Run bottle detection using YOLO with timeout protection and caching
 */
export async function runBottleDetection(
  imagePath: string,
  options: DetectionOptions = {}
): Promise<Detection[]> {
  const { model = 'yolov8-bottle', confidence = 0.85, label = 'bottle', targetClass = 'bottle' } = options;

  // Check cache first
  const cacheKey = await getCacheKey(imagePath, options);
  const cached = yoloCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Sanitize parameters to prevent command injection
  const sanitizeParam = (param: string) => param.replace(/[;&|`$()]/g, '');

  const pythonScript = path.join(__dirname, '../scripts/detect_bottles.py');

  const args = [
    '--image', imagePath, // Path already validated by caller
    '--model', sanitizeParam(model),
    '--confidence', Math.max(0, Math.min(1, confidence)).toString(),
    '--label', sanitizeParam(label),
    '--target-class', sanitizeParam(targetClass)
  ];

  // Run with 30 second timeout
  const result = await runPythonScript(
    pythonScript,
    args,
    30000,
    'YOLO detection'
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Detection failed');
  }

  const detections = parseSubprocessJSON<Detection[]>(result.stdout, 'YOLO detection');

  // Cache the result
  yoloCache.set(cacheKey, detections);

  return detections;
}
