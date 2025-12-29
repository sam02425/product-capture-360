/// <reference types="node" />
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export type CameraBackend = 'avfoundation' | 'dshow' | 'v4l2';

export interface CameraInfo {
  index: number;
  name: string;
  backend: CameraBackend;
}

export interface CameraMetrics {
  connected: boolean;
  index: number | null;
  width: number | null;
  height: number | null;
  fps: number;
  lastFrameAgeMs: number;
  previewFps: number;
  reconnects: number;
}

export class CameraManager {
  private ffmpeg?: ChildProcessWithoutNullStreams;
  private backend: CameraBackend = process.platform === 'darwin' ? 'avfoundation' : (process.platform === 'win32' ? 'dshow' : 'v4l2');
  private deviceIndex: number | null = null;
  private devices: CameraInfo[] = [];
  private latestFrame?: Buffer;
  private lastFrameTs = 0;
  private reconnectCount = 0;
  private lastErrorMsg: string | null = null;
  previewFps = 30; // Increased from 10 to 30 for smoother preview

  listDevices = async (): Promise<CameraInfo[]> => {
    const be = this.backend;
    const args = be === 'avfoundation'
      ? ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']
      : (be === 'dshow'
        ? ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy']
        : ['-f', 'v4l2', '-list_devices', 'true', '-i', 'dummy']);

    // Retry up to 3 times for USB device detection
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        await new Promise<void>((res) => proc.on('close', () => res()));
        const lines = stderr.split(/\r?\n/);
        const cams: CameraInfo[] = [];

        if (be === 'avfoundation') {
          for (const l of lines) {
            const m = l.match(/\[AVFoundation (?:input device|indev).*?\]\s*\[(\d+)\]\s*(.+)$/);
            if (m) {
              const idx = parseInt(m[1], 10);
              const name = m[2].trim();
              // Filter out non-camera devices
              if (!name.toLowerCase().includes('capture screen')) {
                cams.push({ index: idx, name, backend: be });
              }
            }
          }
        } else if (be === 'dshow') {
          // DirectShow lists devices in quotes; assign indices incrementally
          let idx = 0;
          let inVideoSection = false;
          for (const l of lines) {
            if (l.includes('DirectShow video devices')) inVideoSection = true;
            if (l.includes('DirectShow audio devices')) inVideoSection = false;

            const m = l.match(/^\s*"(.+?)"\s*$/);
            if (m && inVideoSection) {
              cams.push({ index: idx++, name: m[1].trim(), backend: be });
            }
          }
        } else {
          // v4l2: scan /dev/video* with better filtering
          try {
            const fs = await import('fs');
            const devs = (fs.readdirSync('/dev') || []).filter((n: string) => /^video\d+$/.test(n));
            for (const n of devs) {
              const num = parseInt(n.replace('video',''), 10);
              const devPath = `/dev/${n}`;
              // Check if device is accessible
              try {
                fs.accessSync(devPath, fs.constants.R_OK);
                cams.push({ index: num, name: devPath, backend: be });
              } catch {}
            }
          } catch {}
        }

        this.devices = cams;
        if (cams.length > 0) {
          return cams;
        }

        // If no cameras found, wait and retry
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (e) {
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // Return default fallback after all retries
    return [{ index: 0, name: 'default', backend: be }];
  };

  start = async (index: number, options?: { width?: number; height?: number; fps?: number; }): Promise<boolean> => {
    await this.stop();
    this.deviceIndex = index;
    this.lastErrorMsg = null;
    const fps = options?.fps ?? 30; // Increased default from 10 to 30 FPS
    this.previewFps = fps;
    // Use 1280x720 for better performance (was 1920x1080)
    const size = `${options?.width ?? 1280}x${options?.height ?? 720}`;
    const be = this.backend;
    let srcArg = '';
    if (be === 'avfoundation') {
      // Prefer explicit video:audio mapping; audio 'none' disables audio
      srcArg = `${index}:none`;
    } else if (be === 'dshow') {
      const dev = this.devices[index];
      const name = dev?.name || 'default';
      const quoted = name.includes(' ') ? `"${name}"` : name;
      srcArg = `video=${quoted}`;
    } else {
      srcArg = `/dev/video${index}`;
    }
    const args = be === 'avfoundation'
      ? ['-hide_banner', '-f', 'avfoundation', '-framerate', String(fps), '-video_size', size, '-i', srcArg, '-vf', `fps=${fps}`, '-f', 'mjpeg', '-q:v', '2', '-']
      : (be === 'dshow'
        ? ['-hide_banner', '-f', 'dshow', '-video_size', size, '-framerate', String(fps), '-i', srcArg, '-vf', `fps=${fps}`, '-f', 'mjpeg', '-q:v', '2', '-']
        : ['-hide_banner', '-f', 'v4l2', '-framerate', String(fps), '-video_size', size, '-i', srcArg, '-vf', `fps=${fps}`, '-f', 'mjpeg', '-q:v', '2', '-']);

    const ok = await this.tryStart(args);
    if (!ok && be === 'avfoundation') {
      // Fallback 1: try 1280x720
      const fbArgs = ['-hide_banner', '-f', 'avfoundation', '-framerate', String(fps), '-video_size', '1280x720', '-i', `${index}:none`, '-vf', `fps=${fps}`, '-f', 'mjpeg', '-q:v', '2', '-'];
      const ok2 = await this.tryStart(fbArgs);
      if (ok2) return true;
      // Fallback 2: no video_size constraint
      const fbArgs2 = ['-hide_banner', '-f', 'avfoundation', '-framerate', String(Math.max(5, fps)), '-i', `${index}:none`, '-f', 'mjpeg', '-q:v', '2', '-'];
      const ok3 = await this.tryStart(fbArgs2);
      if (ok3) return true;
      // Fallback 3: explicit pixel format to improve compatibility
      const fbArgs3 = ['-hide_banner', '-f', 'avfoundation', '-framerate', String(Math.max(5, fps)), '-pixel_format', 'uyvy422', '-i', `${index}:none`, '-f', 'mjpeg', '-q:v', '2', '-'];
      return await this.tryStart(fbArgs3);
    }
    return ok;
  };

  stop = async () => {
    if (this.ffmpeg) {
      try { this.ffmpeg.kill('SIGTERM'); } catch {}
      this.ffmpeg = undefined;
    }
  };

  reconnect = async (): Promise<boolean> => {
    this.reconnectCount += 1;
    const idx = this.deviceIndex ?? 0;
    return this.start(idx, { fps: this.previewFps });
  };

  getMetrics = (): CameraMetrics => {
    const age = this.lastFrameTs ? (Date.now() - this.lastFrameTs) : -1;
    return {
      connected: !!this.ffmpeg,
      index: this.deviceIndex,
      width: null,
      height: null,
      fps: this.previewFps,
      lastFrameAgeMs: age,
      previewFps: this.previewFps,
      reconnects: this.reconnectCount,
    };
  };

  getLatestJPEG = (): Buffer | undefined => this.latestFrame;

  getLastError = (): string | null => this.lastErrorMsg;

  private tryStart = async (args: string[]): Promise<boolean> => {
    try {
      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      this.ffmpeg = proc;
      let chunks: Buffer[] = [];
      let gotFrame = false;
      let stderrBuf = '';
      const onData = (d: Buffer) => {
        chunks.push(d);
        const buf = Buffer.concat(chunks);
        const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
        const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (soi !== -1 && eoi !== -1) {
          const frame = buf.subarray(soi, eoi + 2);
          this.latestFrame = frame;
          this.lastFrameTs = Date.now();
          chunks = [];
          gotFrame = true;
        } else if (buf.length > 2 * 1024 * 1024) {
          chunks = [];
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', (d: Buffer) => {
        const s = d.toString();
        stderrBuf += s;
        // Keep the buffer reasonably small
        if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
      });
      const result = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(gotFrame), 4000);
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (!gotFrame) {
            // Extract last few lines of stderr for debugging
            const lines = stderrBuf.split(/\r?\n/).filter(Boolean);
            const tail = lines.slice(-6).join('\n');
            this.lastErrorMsg = tail || `FFmpeg exited with code ${code}`;
          } else {
            this.lastErrorMsg = null;
          }
          resolve(gotFrame);
          this.ffmpeg = undefined;
        });
      });
      return result;
    } catch {
      this.lastErrorMsg = 'Failed to start FFmpeg process';
      return false;
    }
  };
}