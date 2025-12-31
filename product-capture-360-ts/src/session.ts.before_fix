import { StorageManager } from './storage';
import { CameraManager } from './camera';
import { DataLedger } from './ledger';
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
  // Direct capture - no buffering for lightning-fast performance
  private lastCapturedFrameHash?: string;
  private lastSavedFrame?: Buffer; // Keep reference to last frame for duplicates only
  // Session log file for detailed tracking
  private sessionLogPath?: string;
  private sessionLog: any[] = [];
  // Data ledger for crystal-clear tracking
  private ledger?: DataLedger;
  private currentSessionId?: string;

  constructor(private storage: StorageManager, private camera: CameraManager, logger?: FastifyBaseLogger) {
    this.logger = logger;
    // Start multiple async save workers
    for (let i = 0; i < this.MAX_PARALLEL_SAVES; i++) {
      this.processSaveQueue();
    }
  }

  private writeSessionLog(entry: any) {
    this.sessionLog.push({ timestamp: new Date().toISOString(), ...entry });
    if (this.sessionLogPath) {
      const fs = require('fs');
      try {
        fs.writeFileSync(this.sessionLogPath, JSON.stringify(this.sessionLog, null, 2));
      } catch (e) {
        console.error('Failed to write session log:', e);
      }
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

    // 7. Check for existing images with same product name (informational only)
    const productCollision = this.storage.checkProductCollision(productName);
    if (productCollision.exists) {
      const sizeMB = (productCollision.totalSize / (1024 * 1024)).toFixed(2);
      // Log warning but allow session to continue
      if (this.logger) {
        this.logger.warn({
          event: 'product_name_exists',
          product: productName,
          existing_images: productCollision.imageCount,
          total_size_mb: sizeMB,
        }, `⚠️  Product "${productName}" already has ${productCollision.imageCount} images (${sizeMB} MB). New captures will be added.`);
      } else {
        console.warn(`⚠️  Product "${productName}" already has ${productCollision.imageCount} images (${sizeMB} MB). New captures will be added.`);
      }
    }

    return [true, '✅ Pre-flight checks passed'];
  };

  start = (ratePerMin: number, durationSec?: number, productName?: string): boolean => {
    // FORCE STOP any existing session immediately - no waiting
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // Kill any zombie processes before starting session
    try {
      const { execSync } = require('child_process');

      // Kill zombie FFmpeg camera processes
      try {
        execSync('pkill -9 -f "ffmpeg.*avfoundation"', { encoding: 'utf8' });
        if (this.logger) {
          this.logger.info({ event: 'zombie_cleanup' }, 'Killed zombie FFmpeg processes');
        }
      } catch (e) {
        // No zombie processes found
      }

      // Kill zombie Node server processes (except current)
      try {
        const currentPid = process.pid;
        const psOutput = execSync('ps aux | grep "node dist/server.js" | grep -v grep', { encoding: 'utf8' });
        const lines = psOutput.trim().split('\n');

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1]);

          if (pid !== currentPid) {
            try {
              process.kill(pid, 'SIGKILL');
              if (this.logger) {
                this.logger.info({ event: 'zombie_cleanup', pid }, `Killed zombie server process: ${pid}`);
              }
            } catch (e) {
              // Process already dead
            }
          }
        }
      } catch (e) {
        // No zombie server processes found
      }

      // NO WAIT - proceed immediately for lightning-fast start
    } catch (err) {
      if (this.logger) {
        this.logger.warn({ err, event: 'zombie_cleanup_failed' }, 'Failed to clean up zombie processes');
      }
    }

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

    // Clear old session data immediately for lightning-fast new session start
    this.saveQueue.length = 0; // Clear save queue instantly
    this.lastSavedFrame = undefined; // Clear reference
    this.lastCapturedFrameHash = undefined;
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

    // Create session log file in product folder
    const path = require('path');
    const sessionId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Initialize ledger if not already done
    if (!this.ledger && this.storage.currentPath) {
      this.ledger = new DataLedger(this.storage.currentPath);
    }

    // Save session log in same folder as images
    if (productName && this.storage.currentPath) {
      const sanitizedName = productName.replace(/\s+/g, '_');
      const productFolder = path.join(this.storage.currentPath, sanitizedName);
      this.sessionLogPath = path.join(productFolder, `session_${sessionId}.json`);

      // Start ledger session
      if (this.ledger) {
        this.ledger.startSession(productName, ratePerMin, durationSec || 0, productFolder)
          .then(id => { this.currentSessionId = id; })
          .catch(err => console.error('Failed to start ledger session:', err));
      }
    } else {
      this.sessionLogPath = path.join(this.storage.currentPath || '.', `session_${sessionId}.json`);
    }
    this.sessionLog = [];

    // Log session start
    this.writeSessionLog({
      event: 'session_started',
      product: productName,
      rate_per_minute: ratePerMin,
      duration_seconds: durationSec,
      target_images: targetImages,
      interval_ms: intervalMs,
      storage_path: this.storage.currentPath,
    });

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
    let expectedNextCapture = this.startTs + intervalMs;
    let isRunning = true;
    const maxCaptures = targetImages || Number.MAX_SAFE_INTEGER;

    // Use high-precision recursive setTimeout with drift compensation
    // This ensures EXACT timing even when system is busy
    const scheduleNextCapture = () => {
      if (!isRunning) return;

      // Check if we've reached target count BEFORE capturing
      if (framesQueued >= maxCaptures) {
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
          }, `🏁 Session completed: ${this.captured} images saved, ${remaining} pending, ${framesQueued - duplicateFrames} unique frames (${framesQueued > 0 ? ((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(1) : '0'}%)`);
        } else {
          console.log(`Session duration ${durationSec}s reached. Queued: ${framesQueued}, Saved: ${this.captured}, Pending: ${remaining}. Stopping capture, queue will continue processing.`);
        }

        // Log session completion to session file
        this.writeSessionLog({
          event: 'session_completed',
          frames_queued: framesQueued,
          frames_saved: this.captured,
          frames_pending: remaining,
          unique_frames: framesQueued - duplicateFrames,
          duplicate_frames: duplicateFrames,
          missed_frames: missedFrames,
          unique_percentage: framesQueued > 0 ? ((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(2) : 0,
          actual_duration_ms: sessionDurationMs,
          queue_status: this.saveQueue.map(item => ({ product: item.productName, size: item.buffer.length })),
        });

        // Complete ledger session
        if (this.ledger && this.currentSessionId) {
          this.ledger.completeSession(this.currentSessionId, {
            imagesQueued: framesQueued,
            imagesSaved: this.captured,
            imagesFailed: this.metrics.totalFailed,
            uniqueImages: framesQueued - duplicateFrames,
            duplicateImages: duplicateFrames,
            missedFrames: missedFrames,
          }).catch(err => console.error('Failed to complete ledger session:', err));
        }

        isRunning = false;
        this.stop();
        return;
      }

      // DIRECT CAPTURE - Get frame and copy immediately, no buffering for lightning-fast performance
      const buf = this.camera.getLatestJPEG();

      if (buf) {
        // Create immediate COPY of buffer - this is the secret to lightning-fast capture
        const frameCopy = Buffer.from(buf);

        // Quick hash to detect duplicate frames (only first 100 bytes for speed)
        const frameHash = buf.subarray(0, 100).toString('base64');
        const isNewFrame = frameHash !== this.lastCapturedFrameHash;

        if (isNewFrame) {
          // NEW UNIQUE FRAME - Direct copy and queue immediately
          this.lastCapturedFrameHash = frameHash;
          this.lastSavedFrame = frameCopy;

          this.saveQueue.push({ buffer: frameCopy, productName: this.productName });
          framesQueued++;
        } else {
          // DUPLICATE FRAME - Use last saved frame to maintain exact capture rate
          if (this.lastSavedFrame) {
            const duplicateCopy = Buffer.from(this.lastSavedFrame);
            this.saveQueue.push({ buffer: duplicateCopy, productName: this.productName });
            framesQueued++;
            duplicateFrames++;
          } else {
            // First frame edge case
            this.lastSavedFrame = frameCopy;
            this.saveQueue.push({ buffer: frameCopy, productName: this.productName });
            framesQueued++;
          }
        }
      } else {
        // NO FRAME from camera - use last saved frame
        if (this.lastSavedFrame) {
          const fallbackCopy = Buffer.from(this.lastSavedFrame);
          this.saveQueue.push({ buffer: fallbackCopy, productName: this.productName });
          framesQueued++;
          duplicateFrames++;
        } else {
          // No frames at all - waiting for camera startup
          missedFrames++;

          this.writeSessionLog({ event: 'frame_missed', count: missedFrames, queued: framesQueued });
          if (missedFrames === 1) {
            if (this.logger) {
              this.logger.warn({
                event: 'waiting_for_first_frame',
                product: this.productName || 'unknown',
                message: 'Waiting for camera to provide first frame...',
              }, '⏳ Waiting for first camera frame...');
            } else {
              console.warn('⏳ Waiting for camera to provide first frame...');
            }
          }
        }
      }

      // Log every 50 frames to reduce overhead
      if (framesQueued % 50 === 0 && framesQueued > 0) {
        const queueSize = this.saveQueue.length;
        const actualElapsed = (Date.now() - this.startTs) / 1000;
        const actualRate = framesQueued / actualElapsed;
        const targetRate = ratePerMin / 60;
        const uniquePercent = framesQueued > 0 ? ((framesQueued - duplicateFrames) / framesQueued * 100).toFixed(1) : '0.0';
        const progress = targetImages ? `${framesQueued}/${targetImages}` : `${framesQueued}`;

        this.writeSessionLog({
          event: 'progress',
          frames_queued: framesQueued,
          frames_saved: this.captured,
          pending: queueSize,
          unique_frames: framesQueued - duplicateFrames,
          duplicate_frames: duplicateFrames,
          missed_frames: missedFrames,
          actual_rate: parseFloat(actualRate.toFixed(2)),
          target_rate: parseFloat(targetRate.toFixed(2)),
          unique_percentage: parseFloat(uniquePercent),
        });

        console.log(`[Progress: ${progress}, Saved: ${this.captured}, Pending: ${queueSize}, Rate: ${actualRate.toFixed(2)}/s (target: ${targetRate.toFixed(2)}/s), Unique: ${uniquePercent}%, Dupes: ${duplicateFrames}]`);
      }

      // Calculate drift compensation for next capture
      const now = Date.now();
      expectedNextCapture += intervalMs;
      const drift = expectedNextCapture - now;

      // Schedule next capture with drift compensation
      // Minimum 1ms to prevent busy loop
      const nextDelay = Math.max(1, drift);

      // Only schedule next if still running
      if (isRunning) {
        this.timer = setTimeout(scheduleNextCapture, nextDelay) as any;
      }
    };

    // Start the capture loop
    this.timer = setTimeout(scheduleNextCapture, intervalMs) as any;
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
      clearTimeout(this.timer as any);
    }
    this.timer = undefined;
    // Clear references when stopping
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