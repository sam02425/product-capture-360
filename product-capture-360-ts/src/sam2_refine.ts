import { spawn } from 'child_process';
import path from 'path';

export interface Sam2Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Sam2RefineOptions {
  model?: string;
  config?: string;
  device?: string;
}

export interface Sam2TrackOptions extends Sam2RefineOptions {
  frameStep?: number;
  initFrame?: number;
  includeMasks?: boolean;
}

export interface Sam2RefineResult {
  bbox: Sam2Box;
  score?: number;
}

export interface Sam2TrackResult {
  frames: Array<{ frame_idx: number; bbox: number[] | null; tracked: boolean }>;
  frame_step: number;
  total_frames: number;
}

function runPython(scriptPath: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, ...args]);
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
        reject(new Error(stderr || 'SAM2 script failed'));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error('Failed to parse SAM2 output'));
      }
    });
  });
}

export async function runSam2Refine(
  imagePath: string,
  box: Sam2Box,
  options: Sam2RefineOptions = {}
): Promise<Sam2RefineResult> {
  const { model = 'checkpoints/sam2_hiera_small.pt', config = 'sam2_hiera_s.yaml', device = 'cpu' } = options;
  const pythonScript = path.join(__dirname, '../scripts/sam2_refine.py');

  const args = [
    '--image', imagePath,
    '--box', `${box.x},${box.y},${box.width},${box.height}`,
    '--checkpoint', model,
    '--config', config,
    '--device', device
  ];

  return runPython(pythonScript, args);
}

export async function runSam2Track(
  videoPath: string,
  initBox: Sam2Box,
  options: Sam2TrackOptions = {}
): Promise<Sam2TrackResult> {
  const {
    model = 'checkpoints/sam2_hiera_small.pt',
    config = 'sam2_hiera_s.yaml',
    device = 'cpu',
    frameStep = 1,
    initFrame = 0,
    includeMasks = false
  } = options;

  const pythonScript = path.join(__dirname, '../scripts/sam2_track_video.py');

  const args = [
    '--video', videoPath,
    '--box', `${initBox.x},${initBox.y},${initBox.width},${initBox.height}`,
    '--checkpoint', model,
    '--config', config,
    '--device', device,
    '--frame-step', frameStep.toString(),
    '--init-frame', initFrame.toString(),
  ];

  if (includeMasks) {
    args.push('--include-masks');
  }

  return runPython(pythonScript, args);
}
