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
  // Frame buffer to handle high capture rates when camera FPS < capture rate
  private frameBuffer: Buffer[] = [];
  private readonly MAX_FRAME_BUFFER = 10; // Keep last 10 unique frames
  private lastCapturedFrameHash?: string;

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

  /**
   * Production-grade pre-flight validation before starting session
   * Validates all prerequisites to prevent mid-session failures
   */
  private validatePreFlight = (productName?: string): [boolean, string] => {
    // 1. Storage path must be set
    if (!this.storage.currentPath) {
      return [false, '❌ PRE-FLIGHT FAILED: No storage location set\n   💡 Set storage location before starting capture'];
    }

    // 2. Storage path must be writable
    const fs = require('fs');
    const path = require('path');
    try {
      const testFile = path.join(this.storage.currentPath, '.preflight_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (e: any) {
      return [false, `❌ PRE-FLIGHT FAILED: Storage path not writable\n   🔒 Path: ${this.storage.currentPath}\n   💡 Check permissions`];
    }

    // 3. Camera must be initialized
    const cameraMetrics = this.camera.getMetrics();
    if (!cameraMetrics.connected) {
      return [false, '❌ PRE-FLIGHT FAILED: Camera not initialized\n   📸 Initialize camera before starting capture'];
    }

    // 4. Camera must have recent frames
    if (cameraMetrics.lastFrameAgeMs > 5000 || cameraMetrics.lastFrameAgeMs === -1) {
      return [false, '❌ PRE-FLIGHT FAILED: Camera not receiving frames\n   📸 Last frame age: ' + (cameraMetrics.lastFrameAgeMs === -1 ? 'never' : cameraMetrics.lastFrameAgeMs + 'ms') + '\n   💡 Check camera connection'];
    }

    // 5. Check disk space
    const diskSpace = this.storage.checkDiskSpace(this.storage.currentPath);
    if (!diskSpace.available) {
      return [false, `❌ PRE-FLIGHT FAILED: Insufficient disk space\n   💾 Available: ${diskSpace.free_gb.toFixed(2)} GB\n   💡 Free up space or choose different location`];
    }

    // 6. Validate product name
    if (!productName || productName.trim() === '') {
      return [false, '❌ PRE-FLIGHT FAILED: Product name required\n   🏷️  Provide a product name for this capture session'];
    }

    return [true, '✅ Pre-flight checks passed'];
  };

  start = (ratePerMin: number, durationSec?: number, productName?: string): boolean => {
    // Production-grade pre-flight validation
    const [valid, message] = this.validatePreFlight(productName);
    if (!valid) {
      if (this.logger) {
        this.logger.error({
          event: 'session_preflight_failed',
          product: productName || 'unknown',
          error: message,
        }, 'Pre-flight validation failed');
      } else {
        console.error(message);
      }
      return false;
    }

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
    let missedFrames = 0;
    let duplicateFrames = 0;

    this.timer = setInterval(() => {
      const buf = this.camera.getLatestJPEG();

      if (buf) {
        // Create a simple hash to detect duplicate frames
        const frameHash = buf.slice(0, 100).toString('base64'); // Hash first 100 bytes for speed

        // Check if this is a new unique frame
        const isNewFrame = frameHash !== this.lastCapturedFrameHash;

        if (isNewFrame) {
          // NEW UNIQUE FRAME - Add to buffer and queue immediately
          this.frameBuffer.push(buf);
          if (this.frameBuffer.length > this.MAX_FRAME_BUFFER) {
            this.frameBuffer.shift(); // Remove oldest frame
          }
          this.lastCapturedFrameHash = frameHash;

          this.saveQueue.push({ buffer: buf, productName: this.productName });
          framesQueued++;
        } else {
          // DUPLICATE FRAME - Camera hasn't produced a new frame yet
          // Use the oldest frame from buffer to maintain capture rate
          if (this.frameBuffer.length > 1) {
            // Use oldest buffered frame (will be slightly different angle)
            const oldFrame = this.frameBuffer[0];
            this.saveQueue.push({ buffer: oldFrame, productName: this.productName });
            framesQueued++;
            duplicateFrames++;
          } else if (this.frameBuffer.length === 1) {
            // Only one frame available, reuse it to maintain rate
            this.saveQueue.push({ buffer: buf, productName: this.productName });
            framesQueued++;
            duplicateFrames++;
          } else {
            // No frames in buffer at all (shouldn't happen but handle it)
            missedFrames++;
          }
        }

        // Only log every 50 frames to reduce overhead
        if (framesQueued % 50 === 0) {
          const queueSize = this.saveQueue.length;
          const frameRate = framesQueued / ((Date.now() - this.startTs) / 1000);
          const uniquePercent = ((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(1);
          console.log(`[Queued: ${framesQueued}, Saved: ${this.captured}, Pending: ${queueSize}, Rate: ${frameRate.toFixed(1)}/s, Unique: ${uniquePercent}%, Dupes: ${duplicateFrames}]`);
        }
      } else {
        // NO FRAME AT ALL from camera - use buffer if available
        if (this.frameBuffer.length > 0) {
          // Use oldest frame from buffer to maintain capture rate
          const bufferedFrame = this.frameBuffer[0];
          this.saveQueue.push({ buffer: bufferedFrame, productName: this.productName });
          framesQueued++;
          duplicateFrames++;
        } else {
          // No frames available anywhere - this is a real miss
          missedFrames++;

          if (missedFrames % 10 === 0) {
            if (this.logger) {
              this.logger.warn({
                event: 'camera_frame_miss',
                product: this.productName || 'unknown',
                missed_count: missedFrames,
                queued_count: framesQueued,
                capture_rate: ratePerMin,
              }, `⚠️  Camera not keeping up: ${missedFrames} missed frames at ${ratePerMin}/min rate`);
            } else {
              console.warn(`⚠️  No camera frames available (${missedFrames} real misses). Increase camera FPS or reduce capture rate.`);
            }
          }
        }
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
              unique_frames: framesQueued - duplicateFrames,
              duplicate_frames: duplicateFrames,
              missed_frames: missedFrames,
              unique_percentage: framesQueued > 0 ? ((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(2) + '%' : 'N/A',
              total_success: this.metrics.totalSuccess,
              total_failed: this.metrics.totalFailed,
              success_rate: this.metrics.totalAttempts > 0
                ? ((this.metrics.totalSuccess / this.metrics.totalAttempts) * 100).toFixed(2) + '%'
                : 'N/A',
              storage_path: this.storage.currentPath || 'NOT_SET',
            }, `🏁 Session completed: ${this.captured} images saved, ${remaining} pending, ${framesQueued - duplicateFrames} unique frames (${((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(1)}%)`);
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
          buffer_frames: this.frameBuffer.length,
        }, `⏹️  Session stopped: ${this.captured} images captured`);
      }
      clearInterval(this.timer);
    }
    this.timer = undefined;
    // Clear frame buffer when stopping
    this.frameBuffer = [];
    this.lastCapturedFrameHash = undefined;
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