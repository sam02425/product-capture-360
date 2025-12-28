/// <reference types="node" />
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function createClipFromImages(opts: { dir: string; fps?: number; outputName?: string; width?: number }): Promise<{ success: boolean; path?: string; message?: string }> {
  try {
    const dir = opts.dir;
    const fps = Math.max(1, Math.floor(opts.fps ?? 30));
    const width = opts.width ?? 1280;
    if (!fs.existsSync(dir)) return { success: false, message: 'Directory not found' };
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.jpg'));
    if (files.length < 2) return { success: false, message: 'Need at least 2 images to create a clip' };
    const out = opts.outputName?.trim() || `clip_${Date.now()}.mp4`;
    const outPath = path.join(dir, out);
    const args = ['-y', '-framerate', String(fps), '-pattern_type', 'glob', '-i', '*.jpg', '-vf', `scale=${width}:-2`, '-pix_fmt', 'yuv420p', out];
    const proc = spawn('ffmpeg', args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    const code: number = await new Promise((resolve) => proc.on('close', (c) => resolve(c ?? 1)));
    if (code === 0 && fs.existsSync(outPath)) {
      return { success: true, path: outPath };
    }
    return { success: false, message: err || 'ffmpeg failed to create clip' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Unexpected error' };
  }
}