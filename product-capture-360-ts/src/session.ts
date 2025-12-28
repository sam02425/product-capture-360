import { StorageManager } from './storage';
import { CameraManager } from './camera';

export interface SessionStatus {
  active: boolean;
  startTs?: number;
  elapsedSec?: number;
  ratePerMin?: number;
  targetCount?: number;
  capturedCount?: number;
  remainingSec?: number | null;
}

export class SessionManager {
  private timer?: NodeJS.Timeout;
  private startTs: number = 0;
  private durationSec?: number;
  private captured = 0;
  private ratePerMin = 0;
  private productName?: string;
  private saveQueue: Array<{ buffer: Buffer; productName?: string }> = [];
  private activeSaves = 0;
  private readonly MAX_PARALLEL_SAVES = 50; // Increase to 50 parallel saves for high throughput

  constructor(private storage: StorageManager, private camera: CameraManager) {
    // Start multiple async save workers
    for (let i = 0; i < this.MAX_PARALLEL_SAVES; i++) {
      this.processSaveQueue();
    }
  }

  private async processSaveQueue() {
    while (true) {
      if (this.saveQueue.length > 0 && this.activeSaves < this.MAX_PARALLEL_SAVES) {
        const item = this.saveQueue.shift();
        if (item) {
          this.activeSaves++;
          // Process save without awaiting - fire and forget for maximum throughput
          this.storage.saveImageAsync(item.buffer, item.productName)
            .then(([ok, path]) => {
              if (ok) {
                this.captured += 1;
                const queueSize = this.saveQueue.length;
                if (this.captured % 10 === 0 || queueSize > 50) {
                  // Only log every 10th save or when queue is large to reduce overhead
                  console.log(`[Queue: ${queueSize}] Saved #${this.captured}: ${path.split('/').pop()}`);
                }
              } else {
                console.error(`Save failed: ${path}`);
              }
            })
            .catch(err => {
              console.error('Failed to save image:', err);
            })
            .finally(() => {
              this.activeSaves--;
            });
        }
      }
      // Remove delay for maximum processing speed
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  start = (ratePerMin: number, durationSec?: number, productName?: string): boolean => {
    this.stop();
    this.captured = 0;
    this.ratePerMin = ratePerMin;
    this.durationSec = durationSec;
    this.productName = productName;
    // Don't clear queue - let previous session finish saving first
    const intervalMs = Math.max(1, Math.round(60000 / Math.max(1, ratePerMin)));
    this.startTs = Date.now();

    console.log(`Session starting: rate=${ratePerMin}/min, interval=${intervalMs}ms, duration=${durationSec}s`);

    let framesQueued = 0;
    this.timer = setInterval(() => {
      const buf = this.camera.getLatestJPEG();
      if (buf) {
        // Queue the save operation instead of blocking
        this.saveQueue.push({ buffer: buf, productName: this.productName });
        framesQueued++;

        // Only log every 50 frames to reduce overhead
        if (framesQueued % 50 === 0) {
          const queueSize = this.saveQueue.length;
          console.log(`[Queued: ${framesQueued}, Saved: ${this.captured}, Pending: ${queueSize}]`);
        }
      } else {
        console.log('No camera frame available');
      }
      if (this.durationSec) {
        const elapsed = (Date.now() - this.startTs) / 1000;
        if (elapsed >= this.durationSec) {
          const remaining = this.saveQueue.length;
          console.log(`Session duration ${durationSec}s reached. Queued: ${framesQueued}, Saved: ${this.captured}, Pending: ${remaining}. Stopping capture, queue will continue processing.`);
          this.stop();
        }
      }
    }, intervalMs);
    return true;
  };

  stop = (): boolean => {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    return true;
  };

  status = (): SessionStatus => {
    const active = !!this.timer;
    const elapsedSec = active ? Math.round((Date.now() - this.startTs) / 1000) : 0;
    const remainingSec = this.durationSec ? Math.max(0, this.durationSec - elapsedSec) : null;
    return {
      active,
      startTs: this.startTs,
      elapsedSec,
      ratePerMin: this.ratePerMin,
      targetCount: this.durationSec ? Math.floor((this.durationSec * this.ratePerMin) / 60) : undefined,
      capturedCount: this.captured,
      remainingSec,
    };
  };
}