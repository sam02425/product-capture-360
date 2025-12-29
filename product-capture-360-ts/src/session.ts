import { StorageManager } from './storage';
import { CameraManager } from './camera';
import type { FastifyBaseLogger } from 'fastify';

export interface SessionStatus {
  active: boolean;
  startTs?: number;
  elapsedSec?: number;
  ratePerMin?: number;
  targetCount?: number;
  capturedCount?: number;
  remainingSec?: number | null;
}

// Production-grade metrics tracking
interface CaptureMetrics {
  totalAttempts: number;
  totalSuccess: number;
  totalFailed: number;
  failureReasons: Map<string, number>;
  lastProductName?: string;
  sessionStartTime?: number;
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
  private logger?: FastifyBaseLogger;
  private metrics: CaptureMetrics = {
    totalAttempts: 0,
    totalSuccess: 0,
    totalFailed: 0,
    failureReasons: new Map(),
  };

  constructor(private storage: StorageManager, private camera: CameraManager, logger?: FastifyBaseLogger) {
    this.logger = logger;
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
          this.metrics.totalAttempts++;

          // Process save without awaiting - fire and forget for maximum throughput
          this.storage.saveImageAsync(item.buffer, item.productName)
            .then(([ok, path]) => {
              if (ok) {
                this.captured += 1;
                this.metrics.totalSuccess++;
                const queueSize = this.saveQueue.length;
                const filename = path.split('/').pop();

                if (this.captured % 10 === 0 || queueSize > 50) {
                  // Production-grade structured logging
                  if (this.logger) {
                    this.logger.info({
                      event: 'image_captured',
                      product: item.productName || 'unknown',
                      filename,
                      filepath: path,
                      capture_number: this.captured,
                      queue_size: queueSize,
                      active_saves: this.activeSaves,
                      total_success: this.metrics.totalSuccess,
                      total_failed: this.metrics.totalFailed,
                      success_rate: ((this.metrics.totalSuccess / this.metrics.totalAttempts) * 100).toFixed(2) + '%',
                    }, `✅ Captured #${this.captured}: ${filename}`);
                  } else {
                    console.log(`[Queue: ${queueSize}] Saved #${this.captured}: ${filename}`);
                  }
                }
              } else {
                this.metrics.totalFailed++;
                const reason = path || 'unknown_error';
                this.metrics.failureReasons.set(reason, (this.metrics.failureReasons.get(reason) || 0) + 1);

                // Production-grade error logging
                if (this.logger) {
                  this.logger.error({
                    event: 'image_save_failed',
                    product: item.productName || 'unknown',
                    error: path,
                    capture_attempt: this.metrics.totalAttempts,
                    total_failed: this.metrics.totalFailed,
                    queue_size: this.saveQueue.length,
                    failure_reasons: Object.fromEntries(this.metrics.failureReasons),
                  }, `❌ Save failed: ${path}`);
                } else {
                  console.error(`Save failed: ${path}`);
                }
              }
            })
            .catch(err => {
              this.metrics.totalFailed++;
              const reason = err?.message || 'exception';
              this.metrics.failureReasons.set(reason, (this.metrics.failureReasons.get(reason) || 0) + 1);

              if (this.logger) {
                this.logger.error({
                  event: 'image_save_exception',
                  product: item.productName || 'unknown',
                  error: err?.message || String(err),
                  stack: err?.stack,
                  total_failed: this.metrics.totalFailed,
                }, 'Failed to save image');
              } else {
                console.error('Failed to save image:', err);
              }
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
    this.metrics.sessionStartTime = this.startTs;
    this.metrics.lastProductName = productName;

    const targetImages = durationSec ? Math.floor((durationSec * ratePerMin) / 60) : undefined;

    if (this.logger) {
      this.logger.info({
        event: 'session_started',
        product: productName || 'unknown',
        rate_per_minute: ratePerMin,
        interval_ms: intervalMs,
        duration_seconds: durationSec,
        target_images: targetImages,
        storage_path: this.storage.currentPath || 'NOT_SET',
      }, `🚀 Session started: ${productName || 'unnamed'} - ${ratePerMin}/min for ${durationSec}s (target: ${targetImages} images)`);
    } else {
      console.log(`Session starting: rate=${ratePerMin}/min, interval=${intervalMs}ms, duration=${durationSec}s`);
    }

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
          const sessionDurationMs = Date.now() - this.startTs;

          if (this.logger) {
            this.logger.info({
              event: 'session_completed',
              product: this.productName || 'unknown',
              duration_seconds: durationSec,
              actual_duration_ms: sessionDurationMs,
              frames_queued: framesQueued,
              frames_saved: this.captured,
              frames_pending: remaining,
              total_success: this.metrics.totalSuccess,
              total_failed: this.metrics.totalFailed,
              success_rate: this.metrics.totalAttempts > 0
                ? ((this.metrics.totalSuccess / this.metrics.totalAttempts) * 100).toFixed(2) + '%'
                : 'N/A',
              storage_path: this.storage.currentPath || 'NOT_SET',
            }, `🏁 Session completed: ${this.captured} images saved, ${remaining} pending`);
          } else {
            console.log(`Session duration ${durationSec}s reached. Queued: ${framesQueued}, Saved: ${this.captured}, Pending: ${remaining}. Stopping capture, queue will continue processing.`);
          }
          this.stop();
        }
      }
    }, intervalMs);
    return true;
  };

  stop = (): boolean => {
    if (this.timer) {
      if (this.logger && this.startTs > 0) {
        const elapsed = (Date.now() - this.startTs) / 1000;
        this.logger.info({
          event: 'session_stopped',
          product: this.productName || 'unknown',
          elapsed_seconds: elapsed.toFixed(2),
          images_captured: this.captured,
          queue_remaining: this.saveQueue.length,
        }, `⏹️  Session stopped: ${this.captured} images captured`);
      }
      clearInterval(this.timer);
    }
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