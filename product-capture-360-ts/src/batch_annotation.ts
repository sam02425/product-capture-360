import fs from 'fs';
import path from 'path';
import { logger, generateActionId } from './logger';
import { runBottleDetection, Detection } from './bottle_detection';
import { getImageSize } from './image_utils';
import { runSam2Refine } from './sam2_refine';

/**
 * Batch Annotation Service
 *
 * Automatically annotates entire folders of images using YOLO11 or SAM2
 * Provides progress tracking and result management
 */

export interface BatchJobOptions {
  folderPath: string;
  engine: 'yolo' | 'sam2';
  model?: string;
  confidence?: number;
  targetClass?: string;
  labelName?: string;
}

export interface BatchJobProgress {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalImages: number;
  processedImages: number;
  currentImage: string;
  startTime: number;
  endTime?: number;
  results: BatchAnnotationResult[];
  error?: string;
}

export interface BatchAnnotationResult {
  imagePath: string;
  filename: string;
  annotations: Annotation[];
  status: 'success' | 'failed';
  error?: string;
  processedAt: number;
}

export interface Annotation {
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  labelName: string;
  confidence: number;
  polygon?: Array<{x: number; y: number}>;
}

class BatchAnnotationService {
  private jobs: Map<string, BatchJobProgress> = new Map();
  private activeJobs: Set<string> = new Set();

  /**
   * Start a new batch annotation job
   */
  async startBatchJob(options: BatchJobOptions): Promise<string> {
    const jobId = generateActionId();
    const actionId = generateActionId();

    logger.startAction(actionId, 'startBatchJob', {
      jobId,
      folderPath: options.folderPath,
      engine: options.engine
    });

    try {
      // Validate folder exists
      if (!fs.existsSync(options.folderPath)) {
        throw new Error(`Folder not found: ${options.folderPath}`);
      }

      // Get all image files
      const files = fs.readdirSync(options.folderPath);
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];
      const imageFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return imageExtensions.includes(ext) && !f.startsWith('._');
      });

      if (imageFiles.length === 0) {
        throw new Error('No image files found in folder');
      }

      logger.info('Batch job initialized', {
        jobId,
        totalImages: imageFiles.length,
        engine: options.engine
      });

      // Create job progress tracker
      const job: BatchJobProgress = {
        jobId,
        status: 'pending',
        totalImages: imageFiles.length,
        processedImages: 0,
        currentImage: '',
        startTime: Date.now(),
        results: []
      };

      this.jobs.set(jobId, job);

      // Start processing asynchronously
      this.processImagesAsync(jobId, options, imageFiles);

      logger.endAction(actionId, 'startBatchJob', true, { jobId }, {
        totalImages: imageFiles.length
      });

      return jobId;
    } catch (error) {
      logger.failAction(actionId, 'startBatchJob', error as Error, { jobId });
      throw error;
    }
  }

  /**
   * Process images asynchronously
   */
  private async processImagesAsync(
    jobId: string,
    options: BatchJobOptions,
    imageFiles: string[]
  ) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const actionId = generateActionId();
    logger.startAction(actionId, 'processImagesAsync', {
      jobId,
      totalImages: imageFiles.length
    });

    try {
      job.status = 'running';
      this.activeJobs.add(jobId);

      for (let i = 0; i < imageFiles.length; i++) {
        const filename = imageFiles[i];
        const imagePath = path.join(options.folderPath, filename);

        job.currentImage = filename;
        job.processedImages = i;

        logger.info('Processing image', {
          jobId,
          filename,
          progress: `${i + 1}/${imageFiles.length}`
        });

        try {
          const annotations = await this.annotateImage(imagePath, options);

          job.results.push({
            imagePath,
            filename,
            annotations,
            status: 'success',
            processedAt: Date.now()
          });

          logger.info('Image processed successfully', {
            jobId,
            filename,
            annotationCount: annotations.length
          });
        } catch (error) {
          logger.error('Failed to process image', {
            jobId,
            filename
          }, {}, error as Error);

          job.results.push({
            imagePath,
            filename,
            annotations: [],
            status: 'failed',
            error: (error as Error).message,
            processedAt: Date.now()
          });
        }
      }

      job.status = 'completed';
      job.processedImages = imageFiles.length;
      job.endTime = Date.now();
      this.activeJobs.delete(jobId);

      const successCount = job.results.filter(r => r.status === 'success').length;
      const failCount = job.results.filter(r => r.status === 'failed').length;

      logger.endAction(actionId, 'processImagesAsync', true, { jobId }, {
        totalImages: imageFiles.length,
        successCount,
        failCount,
        duration: job.endTime - job.startTime
      });
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.endTime = Date.now();
      this.activeJobs.delete(jobId);

      logger.failAction(actionId, 'processImagesAsync', error as Error, { jobId });
    }
  }

  /**
   * Annotate a single image
   */
  private async annotateImage(
    imagePath: string,
    options: BatchJobOptions
  ): Promise<Annotation[]> {
    if (options.engine === 'yolo') {
      return this.annotateWithYOLO(imagePath, options);
    } else if (options.engine === 'sam2') {
      return this.annotateWithSAM2(imagePath, options);
    } else {
      throw new Error(`Unknown engine: ${options.engine}`);
    }
  }

  /**
   * Annotate using YOLO
   */
  private async annotateWithYOLO(
    imagePath: string,
    options: BatchJobOptions
  ): Promise<Annotation[]> {
    const model = options.model || 'yolov8n';
    const confidence = options.confidence || 0.5;
    const targetClass = options.targetClass || 'bottle';

    let detections: Detection[] = [];
    try {
      detections = await runBottleDetection(imagePath, {
        model,
        confidence,
        targetClass,
        label: options.labelName || targetClass
      });
    } catch (error) {
      logger.warn('YOLO detection failed, using fallback box', {
        imagePath,
        model,
        targetClass
      }, { error: (error as Error).message });
      return this.createFallbackAnnotation(imagePath, options);
    }

    if (!detections || detections.length === 0) {
      logger.warn('YOLO returned no detections, using fallback box', {
        imagePath,
        model,
        targetClass
      });
      return this.createFallbackAnnotation(imagePath, options);
    }

    // Convert to annotation format
    return detections.map((d: Detection) => ({
      bbox: {
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height
      },
      labelName: options.labelName || d.class || targetClass,
      confidence: d.confidence
    }));
  }

  private createFallbackAnnotation(
    imagePath: string,
    options: BatchJobOptions
  ): Annotation[] {
    try {
      const { width, height } = getImageSize(imagePath);
      const boxWidth = Math.round(width * 0.45);
      const boxHeight = Math.round(height * 0.7);
      const x = Math.round((width - boxWidth) / 2);
      const y = Math.round((height - boxHeight) / 2);
      const labelName = options.labelName || options.targetClass || 'Object';

      return [{
        bbox: {
          x,
          y,
          width: Math.max(1, boxWidth),
          height: Math.max(1, boxHeight)
        },
        labelName,
        confidence: 0.01
      }];
    } catch (error) {
      logger.error('Fallback bbox failed', { imagePath }, { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Annotate using SAM2
   * For batch mode, we'll use YOLO first to get rough boxes, then refine with SAM2
   */
  private async annotateWithSAM2(
    imagePath: string,
    options: BatchJobOptions
  ): Promise<Annotation[]> {
    // First get rough detections with YOLO
    const yoloAnnotations = await this.annotateWithYOLO(imagePath, options);

    if (yoloAnnotations.length === 0) {
      return [];
    }

    // Refine each detection with SAM2
    const refinedAnnotations: Annotation[] = [];

    for (const yoloAnn of yoloAnnotations) {
      try {
        const result = await runSam2Refine(imagePath, yoloAnn.bbox);

        if (result && result.bbox) {
          // Use SAM2 refined bbox
          refinedAnnotations.push({
            bbox: result.bbox,
            labelName: yoloAnn.labelName,
            confidence: result.score || yoloAnn.confidence
          });
        } else {
          // Fallback to YOLO bbox if SAM2 fails
          refinedAnnotations.push(yoloAnn);
        }
      } catch (error) {
        logger.warn('SAM2 refinement failed, using YOLO bbox', {
          imagePath
        }, { error: (error as Error).message });
        refinedAnnotations.push(yoloAnn);
      }
    }

    return refinedAnnotations;
  }

  /**
   * Get job progress
   */
  getJobProgress(jobId: string): BatchJobProgress | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BatchJobProgress[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Cancel a running job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running') {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      job.endTime = Date.now();
      this.activeJobs.delete(jobId);

      logger.warn('Batch job cancelled', { jobId });
      return true;
    }

    return false;
  }

  /**
   * Delete job data
   */
  deleteJob(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    this.activeJobs.delete(jobId);

    if (deleted) {
      logger.info('Batch job deleted', { jobId });
    }

    return deleted;
  }
}

// Export singleton instance
export const batchAnnotationService = new BatchAnnotationService();
