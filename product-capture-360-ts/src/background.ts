/// <reference types="node" />
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface BgReplaceOptions {
  dir: string;
  keyColorHex: string; // e.g. #00ff00
  tolerance?: number; // 0..1
  softness?: number; // 0..1
  fillColorHex?: string; // e.g. #ffffff
  fillImagePath?: string; // path to background image
}

function hexToFFmpegColor(hex: string): string {
  const h = hex.replace('#', '');
  return '0x' + h.toLowerCase();
}

export async function replaceBackgroundForFolder(opts: BgReplaceOptions): Promise<{ success: boolean; outputDir?: string; message?: string }>{
  try {
    const { dir, keyColorHex, tolerance = 0.20, softness = 0.10, fillColorHex, fillImagePath } = opts;
    if (!fs.existsSync(dir)) return { success: false, message: 'Directory not found' };
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.jpg'));
    if (files.length === 0) return { success: false, message: 'No JPG images in folder' };
    const outDir = path.join(dir, 'masked');
    fs.mkdirSync(outDir, { recursive: true });
    const keyColor = hexToFFmpegColor(keyColorHex);

    for (const f of files) {
      const inPath = path.join(dir, f);
      const outPath = path.join(outDir, f);
      const args: string[] = [];

      if (fillImagePath && fs.existsSync(fillImagePath)) {
        args.push('-y', '-i', inPath, '-i', fillImagePath,
          '-filter_complex',
          `[1:v][0:v]scale2ref[bg][fg];[fg]colorkey=${keyColor}:${tolerance}:${softness}[m];[bg][m]overlay=format=auto,format=yuv420p[out]`,
          '-map', '[out]', outPath);
      } else {
        const fillColor = (fillColorHex || '#ffffff').replace('#','');
        args.push('-y', '-i', inPath, '-f', 'lavfi', '-i', `color=c=#${fillColor}:s=16x16`,
          '-filter_complex',
          `[1:v][0:v]scale2ref[bg][fg];[fg]colorkey=${keyColor}:${tolerance}:${softness}[m];[bg][m]overlay=format=auto,format=yuv420p[out]`,
          '-map', '[out]', outPath);
      }

      const code = await runFfmpeg(args, dir);
      if (code !== 0) return { success: false, message: `ffmpeg failed on ${f}` };
    }

    return { success: true, outputDir: outDir };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Unexpected error in background replace' };
  }
}

async function runFfmpeg(args: string[], cwd: string): Promise<number> {
  return await new Promise<number>((resolve) => {
    const proc = spawn('ffmpeg', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

export async function previewBackgroundForImage(opts: BgReplaceOptions & { inputImagePath: string }): Promise<{ success: boolean; buffer?: Buffer; message?: string }>{
  try {
    const { dir, inputImagePath, keyColorHex, tolerance = 0.20, softness = 0.10, fillColorHex, fillImagePath } = opts;
    const keyColor = hexToFFmpegColor(keyColorHex);
    if (!fs.existsSync(inputImagePath)) return { success: false, message: 'Input image not found' };
    const args: string[] = [];
    if (fillImagePath) {
      args.push('-y', '-i', inputImagePath, '-i', fillImagePath,
        '-filter_complex',
        `[1:v][0:v]scale2ref[bg][fg];[fg]colorkey=${keyColor}:${tolerance}:${softness}[m];[bg][m]overlay=format=auto,format=yuv420p[out]`,
        '-map', '[out]', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1');
    } else {
      const fillColor = (fillColorHex || '#ffffff').replace('#','');
      args.push('-y', '-i', inputImagePath, '-f', 'lavfi', '-i', `color=c=#${fillColor}:s=16x16`,
        '-filter_complex',
        `[1:v][0:v]scale2ref[bg][fg];[fg]colorkey=${keyColor}:${tolerance}:${softness}[m];[bg][m]overlay=format=auto,format=yuv420p[out]`,
        '-map', '[out]', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1');
    }
    const buf = await runFfmpegToBuffer(args, dir);
    if (!buf) return { success: false, message: 'ffmpeg failed to produce preview' };
    return { success: true, buffer: buf };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Unexpected error in preview' };
  }
}

async function runFfmpegToBuffer(args: string[], cwd: string): Promise<Buffer | null> {
  return await new Promise<Buffer | null>((resolve) => {
    const chunks: Buffer[] = [];
    const proc = spawn('ffmpeg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks)); else resolve(null);
    });
  });
}