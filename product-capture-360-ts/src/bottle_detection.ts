import { spawn } from 'child_process';
import path from 'path';

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
}

/**
 * Run bottle detection using YOLO
 */
export async function runBottleDetection(
  imagePath: string,
  options: DetectionOptions = {}
): Promise<Detection[]> {
  const { model = 'yolov8-bottle', confidence = 0.5, label = 'bottle' } = options;

  return new Promise((resolve, reject) => {
    // Use Python script to run YOLO detection
    const pythonScript = path.join(__dirname, '../scripts/detect_bottles.py');

    const proc = spawn('python3', [
      pythonScript,
      '--image', imagePath,
      '--model', model,
      '--confidence', confidence.toString(),
      '--label', label
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'Detection failed'));
        return;
      }

      try {
        const detections = JSON.parse(stdout);
        resolve(detections);
      } catch (error) {
        reject(new Error('Failed to parse detection results'));
      }
    });
  });
}
