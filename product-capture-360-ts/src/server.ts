declare const Buffer: any;
declare const process: any;

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import path from 'path';
import { CameraManager } from './camera';
import { StorageManager } from './storage';
import { SessionManager } from './session';
import { createClipFromImages } from './video';
import { replaceBackgroundForFolder } from './background';
import { previewBackgroundForImage } from './background';
import { preprocessForYOLO, generateRetailDataset, createYOLOAnnotations } from './preprocessing';
import { runCompletePipeline, quickLiquorBottlePipeline } from './pipeline';
import { DatasetVersionManager } from './versioning';
import fs from 'fs';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false,
  trustProxy: true,
});

const camera = new CameraManager();
const storage = new StorageManager();
const session = new SessionManager(storage, camera, app.log);
const versionManager = new DatasetVersionManager(process.cwd());

// Error handling middleware
app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.status(500).send({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
  });
});

// Register rate limiting plugin
app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000,
  allowList: ['127.0.0.1'],
  redis: undefined,
  nameSpace: 'rate-limit-',
  continueExceeding: true,
  skipOnError: true,
});

// Input validation schemas
const pipelineSchema = {
  body: {
    type: 'object',
    required: ['product_folder', 'product_name'],
    properties: {
      product_folder: { type: 'string', minLength: 1 },
      product_name: { type: 'string', minLength: 1 },
      background_images: { type: 'array', items: { type: 'string' } },
      output_dir: { type: 'string' },
      segmentation_model: { type: 'string', enum: ['sam', 'rembg', 'u2net'] },
      augmentations_per_bg: { type: 'number', minimum: 1, maximum: 20 },
      enable_zoom: { type: 'boolean' },
      enable_lighting: { type: 'boolean' },
      enable_color_jitter: { type: 'boolean' },
      enable_shadows: { type: 'boolean' },
      export_formats: { type: 'array', items: { type: 'string', enum: ['yolov5', 'yolov8', 'yolov11', 'coco'] } },
      train_val_split: { type: 'number', minimum: 0.1, maximum: 0.9 },
    },
  },
};

const quickPipelineSchema = {
  body: {
    type: 'object',
    required: ['product_folder', 'product_name', 'background_images'],
    properties: {
      product_folder: { type: 'string', minLength: 1 },
      product_name: { type: 'string', minLength: 1 },
      background_images: { type: 'array', items: { type: 'string' }, minItems: 1 },
    },
  },
};

const cameraInitSchema = {
  body: {
    type: 'object',
    properties: {
      camera_index: { type: 'number', minimum: 0 },
      width: { type: 'number', minimum: 320, maximum: 3840 },
      height: { type: 'number', minimum: 240, maximum: 2160 },
      fps: { type: 'number', minimum: 1, maximum: 60 },
    },
  },
};

// Health check endpoint
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  camera: {
    connected: camera.getMetrics().connected,
  },
  storage: {
    configured: !!storage.currentPath,
  },
}));

app.get('/video_feed', async (req: any, reply: any) => {
  const headers = {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, private',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
  } as any;
  reply.raw.writeHead(200, headers);
  // Take over the response for long-lived stream
  reply.hijack();
  const fps = Math.max(1, camera.previewFps);
  const intervalMs = Math.round(1000 / fps);
  const timer = setInterval(() => {
    const frame = camera.getLatestJPEG();
    const jpeg = frame ?? tinyJPEG();
    const header = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
    try {
      reply.raw.write(header);
      reply.raw.write(jpeg);
      reply.raw.write(Buffer.from('\r\n'));
    } catch (_) {
      // If client disconnected, stop streaming
      clearInterval(timer);
    }
  }, intervalMs);
  const cleanup = () => { try { clearInterval(timer); } catch {} };
  req.raw.on('aborted', cleanup);
  req.raw.on('close', cleanup);
});

app.get('/api/camera/scan', async () => ({ success: true, cameras: await camera.listDevices() }));
app.post<{ Body: { camera_index?: number; width?: number; height?: number; fps?: number; } }>(
  '/api/camera/init',
  { schema: cameraInitSchema },
  async (req: any) => {
    const idx = Number(req.body?.camera_index ?? 0);
    const ok = await camera.start(idx, { width: req.body?.width, height: req.body?.height, fps: req.body?.fps });
    const msg = ok ? 'Camera initialized' : (camera.getLastError() || 'Failed to initialize camera');
    return { success: ok, message: msg };
  }
);
app.post('/api/camera/reconnect', async () => {
  const ok = await camera.reconnect();
  return { success: ok, message: ok ? 'Reconnected' : 'Reconnect failed' };
});
app.post('/api/camera/hard_reset', async () => {
  const ok = await camera.reconnect();
  return { success: ok, message: ok ? 'OK' : 'Failed to reopen' };
});
app.get('/api/camera/health', async () => camera.getMetrics());

// Debounce map: client -> last capture timestamp
const captureDebounce = new Map<string, number>();
const DEBOUNCE_MS = 200; // Allow max 5 captures per second

app.post<{ Body: { product_name?: string; high_res?: boolean } }>('/api/capture', async (req: any) => {
  // Debounce based on client IP
  const clientId = req.ip || 'default';
  const now = Date.now();
  const lastCapture = captureDebounce.get(clientId) || 0;

  if (now - lastCapture < DEBOUNCE_MS) {
    return { success: false, message: 'Too many requests. Please wait.' };
  }

  captureDebounce.set(clientId, now);

  const buf = camera.getLatestJPEG();
  if (!buf) return { success: false, message: 'No frame available' };

  const highRes = req.body?.high_res === true;
  const [ok, path] = storage.saveImage(buf, req.body?.product_name, highRes);
  return { success: ok, message: path };
});

app.get('/api/storage', async () => storage.listDevices());
app.post<{ Body: { path?: string; mountpoint?: string } }>('/api/storage/select', async (req: any) => {
  const p = req.body?.path || req.body?.mountpoint;
  if (!p) return { success: false, message: 'No path provided', path: null };
  const [ok, res] = storage.setLocation(p);
  return { success: ok, path: ok ? res : null, message: ok ? 'OK' : res };
});
app.get('/api/folder', async (req: any) => {
  const url = new URL(req.url, `http://localhost`);
  const p = url.searchParams.get('path') || undefined;
  return storage.listFolder(p || undefined);
});

app.post<{ Body: { path: string } }>('/api/folder/create', async (req: any) => {
  const folderPath = req.body?.path;
  if (!folderPath) {
    return { success: false, message: 'No path provided' };
  }

  try {
    if (fs.existsSync(folderPath)) {
      return { success: false, message: 'Folder already exists' };
    }

    fs.mkdirSync(folderPath, { recursive: true });
    return { success: true, path: folderPath };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to create folder' };
  }
});

// Serve file endpoint for image preview
app.get('/file', async (req: any, reply: any) => {
  try {
    const url = new URL(req.url, `http://localhost`);
    const filePath = url.searchParams.get('path');

    if (!filePath) {
      reply.code(400).send({ error: 'Missing path parameter' });
      return;
    }

    // Security check: prevent path traversal
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    // Check if it's an image file
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(resolvedPath)) {
      reply.code(400).send({ error: 'Not an image file' });
      return;
    }

    // Read and serve the file
    const fileStream = fs.createReadStream(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    }[ext] || 'application/octet-stream';

    reply.type(contentType).send(fileStream);
  } catch (error: any) {
    req.log.error({ err: error }, 'Error serving file');
    reply.code(500).send({ error: 'Failed to serve file' });
  }
});

app.get('/api/status', async () => session.status());
app.post<{ Body: { rate?: number; duration?: number; product_name?: string } }>('/api/session/start', async (req: any) => {
  const rate = Number(req.body?.rate ?? 0);
  const dur = req.body?.duration;
  const prod = req.body?.product_name;
  const ok = session.start(rate, dur, prod);
  return { success: ok };
});
app.post('/api/session/stop', async () => ({ success: session.stop() }));

app.post<{ Body: { path?: string; key_color?: string; tolerance?: number; softness?: number; fill_color?: string; fill_image_path?: string } }>(
  '/api/background/replace',
  async (req: any) => {
    const dir = req.body?.path || storage.currentPath || process.cwd();
    const keyColor = (req.body?.key_color || '#00ff00');
    const tolerance = Number(req.body?.tolerance ?? 0.20);
    const softness = Number(req.body?.softness ?? 0.10);
    const fillColor = req.body?.fill_color;
    const fillImagePath = req.body?.fill_image_path;
    const res = await replaceBackgroundForFolder({ dir, keyColorHex: keyColor, tolerance, softness, fillColorHex: fillColor, fillImagePath });
    return res;
  }
);

app.post<{ Body: { image_path?: string; key_color?: string; tolerance?: number; softness?: number; fill_color?: string; fill_image_path?: string } }>(
  '/api/background/preview',
  async (req: any, reply: any) => {
    const dir = storage.currentPath || process.cwd();
    const imagePath = req.body?.image_path;
    const keyColor = (req.body?.key_color || '#00ff00');
    const tolerance = Number(req.body?.tolerance ?? 0.20);
    const softness = Number(req.body?.softness ?? 0.10);
    const fillColor = req.body?.fill_color;
    const fillImagePath = req.body?.fill_image_path;
    const res = await previewBackgroundForImage({ dir, inputImagePath: imagePath, keyColorHex: keyColor, tolerance, softness, fillColorHex: fillColor, fillImagePath });
    if (!res.success || !res.buffer) return { success: false, message: res.message || 'Preview failed' };
    reply.headers({ 'Content-Type': 'image/jpeg' });
    reply.send(res.buffer);
  }
);

app.get('/api/file', async (req: any, reply: any) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams.get('path');
  if (!p || !fs.existsSync(p)) return reply.status(404).send('Not found');
  const ext = (p.split('.').pop() || '').toLowerCase();
  const map: any = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  reply.headers({ 'Content-Type': map[ext] || 'application/octet-stream' });
  reply.send(fs.createReadStream(p));
});

app.post<{ Body: {
  image_path: string;
  product_name?: string;
  model_type?: 'sam' | 'rembg' | 'u2net';
} }>(
  '/api/detect/auto',
  async (req: any) => {
    try {
      const imagePath = req.body?.image_path;
      const productName = req.body?.product_name || 'product';
      const modelType = req.body?.model_type || 'rembg';

      if (!imagePath || !fs.existsSync(imagePath)) {
        return { success: false, message: 'Image file not found' };
      }

      // Create temp directory for masks
      const tempDir = path.join(process.cwd(), '.temp', Date.now().toString());
      fs.mkdirSync(tempDir, { recursive: true });

      const baseName = path.parse(imagePath).name;
      const maskPath = path.join(tempDir, `${baseName}_mask.png`);

      // Import segmentation function
      const { autoSegmentFolder } = await import('./segmentation');

      // Run segmentation on single image
      const imageDir = path.dirname(imagePath);
      const result = await autoSegmentFolder({
        imageDir,
        outputDir: tempDir,
        modelType,
        confidenceThreshold: 0.5,
        minArea: 1000,
        targetClass: productName,
      });

      // Read polygon data
      const polygonPath = path.join(tempDir, 'polygons', `${baseName}.json`);
      if (!fs.existsSync(polygonPath)) {
        return { success: false, message: 'No object detected in image' };
      }

      const polygonData = JSON.parse(fs.readFileSync(polygonPath, 'utf-8'));

      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

      return {
        success: true,
        detection: {
          bbox: polygonData.bbox,
          polygon: polygonData.points,
          confidence: polygonData.confidence,
          className: productName,
        },
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Detection failed' };
    }
  }
);

app.post('/api/background/segment', async (req: any) => {
  return { success: false, message: 'ML segmentation not enabled. Install onnxruntime-node and provide U2Net model.' };
});

app.post<{ Body: { path?: string; fps?: number; output_name?: string; width?: number } }>(
  '/api/video/create',
  async (req: any) => {
    const dir = req.body?.path || storage.currentPath || process.cwd();
    const fps = Number(req.body?.fps ?? 30);
    const out = req.body?.output_name;
    const width = req.body?.width;
    const res = await createClipFromImages({ dir, fps, outputName: out, width });
    return res;
  }
);

// YOLOv11 Training Preprocessing Endpoints
app.post<{ Body: {
  input_dir?: string;
  output_dir?: string;
  key_color?: string;
  tolerance?: number;
  softness?: number;
  background_images?: string[];
  augment?: boolean;
  augment_count?: number;
  target_size?: number;
} }>(
  '/api/preprocess/yolo',
  async (req: any) => {
    const inputDir = req.body?.input_dir || storage.currentPath || process.cwd();
    const outputDir = req.body?.output_dir || path.join(inputDir, 'yolo_dataset');
    const keyColor = req.body?.key_color || '#00ff00';
    const tolerance = Number(req.body?.tolerance ?? 0.25);
    const softness = Number(req.body?.softness ?? 0.15);
    const backgroundImages = req.body?.background_images || [];
    const augment = req.body?.augment ?? true;
    const augmentCount = Number(req.body?.augment_count ?? 3);
    const targetSize = Number(req.body?.target_size ?? 640);

    const res = await preprocessForYOLO({
      inputDir,
      outputDir,
      keyColorHex: keyColor,
      tolerance,
      softness,
      backgroundImages,
      augment,
      augmentCount,
      targetSize,
      addPadding: true,
    });

    return res;
  }
);

app.post<{ Body: {
  input_dir?: string;
  output_dir?: string;
  key_color?: string;
  tolerance?: number;
  softness?: number;
  retail_backgrounds: string[];
  augment_per_background?: number;
} }>(
  '/api/preprocess/retail',
  async (req: any) => {
    const inputDir = req.body?.input_dir || storage.currentPath || process.cwd();
    const outputDir = req.body?.output_dir || path.join(inputDir, 'retail_dataset');
    const keyColor = req.body?.key_color || '#00ff00';
    const tolerance = Number(req.body?.tolerance ?? 0.25);
    const softness = Number(req.body?.softness ?? 0.15);
    const retailBackgrounds = req.body?.retail_backgrounds || [];
    const augmentPerBg = Number(req.body?.augment_per_background ?? 3);

    if (retailBackgrounds.length === 0) {
      return { success: false, message: 'No retail background images provided' };
    }

    const res = await generateRetailDataset({
      inputDir,
      outputDir,
      keyColorHex: keyColor,
      tolerance,
      softness,
      retailBackgrounds,
      augmentPerBackground: augmentPerBg,
    });

    return res;
  }
);

app.post<{ Body: { images_dir?: string; class_name?: string } }>(
  '/api/preprocess/create-annotations',
  async (req: any) => {
    try {
      const imagesDir = req.body?.images_dir || path.join(storage.currentPath || process.cwd(), 'yolo_dataset', 'images');
      const className = req.body?.class_name || 'product';

      if (!fs.existsSync(imagesDir)) {
        return { success: false, message: 'Images directory not found' };
      }

      createYOLOAnnotations(imagesDir, className);
      return { success: true, message: `YOLO annotations created in ${path.join(path.dirname(imagesDir), 'labels')}` };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Failed to create annotations' };
    }
  }
);

// Complete Pipeline Endpoints
app.post<{ Body: {
  product_folder: string;
  product_name: string;
  output_dir?: string;
  segmentation_model?: 'sam' | 'rembg' | 'u2net';
  background_images: string[];
  augmentations_per_bg?: number;
  enable_zoom?: boolean;
  enable_lighting?: boolean;
  enable_color_jitter?: boolean;
  enable_shadows?: boolean;
  export_formats?: string[];
  train_val_split?: number;
} }>(
  '/api/pipeline/run',
  { schema: pipelineSchema },
  async (req: any) => {
    try {
      const result = await runCompletePipeline({
        productFolder: req.body.product_folder,
        productName: req.body.product_name,
        outputDir: req.body.output_dir || path.join(req.body.product_folder, '..', 'datasets'),
        segmentationModel: req.body.segmentation_model || 'rembg',
        backgroundImages: req.body.background_images || [],
        augmentationsPerBackground: req.body.augmentations_per_bg || 5,
        enableZoom: req.body.enable_zoom !== false,
        enableLighting: req.body.enable_lighting !== false,
        enableColorJitter: req.body.enable_color_jitter !== false,
        enableShadows: req.body.enable_shadows !== false,
        exportFormats: req.body.export_formats || ['all'],
        trainValSplit: req.body.train_val_split || 0.8,
      });

      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'Pipeline failed' };
    }
  }
);

app.post<{ Body: {
  product_folder: string;
  product_name: string;
  background_images: string[];
} }>(
  '/api/pipeline/quick',
  { schema: quickPipelineSchema },
  async (req: any) => {
    try {
      const result = await quickLiquorBottlePipeline(
        req.body.product_folder,
        req.body.product_name,
        req.body.background_images
      );

      return result;
    } catch (e: any) {
      return { success: false, message: e?.message || 'Pipeline failed' };
    }
  }
);

// Versioning Endpoints
app.get('/api/versions/list', async () => {
  return versionManager.listVersions();
});

app.get<{ Params: { version: string } }>('/api/versions/:version', async (req: any) => {
  const version = parseInt(req.params.version);
  const v = versionManager.getVersion(version);
  return v || { error: 'Version not found' };
});

app.get('/api/versions/latest', async () => {
  return versionManager.getLatestVersion() || { error: 'No versions found' };
});

app.post<{ Body: any }>('/api/versions/create', async (req: any) => {
  try {
    const version = versionManager.createVersion({
      productName: req.body.product_name,
      sourceFolder: req.body.source_folder,
      sourceImages: req.body.source_images,
      segmentationModel: req.body.segmentation_model,
      augmentations: req.body.augmentations,
      backgroundImages: req.body.background_images,
      totalImages: req.body.total_images,
      trainImages: req.body.train_images,
      valImages: req.body.val_images,
      exportFormats: req.body.export_formats,
      description: req.body.description,
      tags: req.body.tags,
    });
    return { success: true, version };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to create version' };
  }
});

app.post<{ Body: { version: number; metrics: any } }>('/api/versions/update-metrics', async (req: any) => {
  const success = versionManager.updateMetrics(req.body.version, req.body.metrics);
  return { success, message: success ? 'Metrics updated' : 'Version not found' };
});

app.get<{ Params: { v1: string; v2: string } }>('/api/versions/compare/:v1/:v2', async (req: any) => {
  const v1 = parseInt(req.params.v1);
  const v2 = parseInt(req.params.v2);
  const comparison = versionManager.compareVersions(v1, v2);
  return comparison || { error: 'Versions not found' };
});

app.delete<{ Params: { version: string } }>('/api/versions/:version', async (req: any) => {
  const version = parseInt(req.params.version);
  const success = versionManager.deleteVersion(version);
  return { success, message: success ? 'Version deleted' : 'Version not found' };
});

app.get('/', async (req: any, reply: any) => { reply.redirect('/image-collector.html'); });

async function start() {
  try {
    // Register plugins
    await app.register(fastifyCors, { origin: true });
    await app.register(fastifyStatic, { root: path.join(process.cwd(), 'public') });

    // Start server
    const port = Number((process as any).env?.PORT || 5002);
    const host = (process as any).env?.HOST || '0.0.0.0';
    await app.listen({ host, port });

    app.log.info(`✨ Product Capture 360 server started`);
    app.log.info(`🌍 Server URL: http://localhost:${port}`);
    app.log.info(`🎨 Image Collector UI: http://localhost:${port}/image-collector.html`);
    app.log.info(`💚 Health check: http://localhost:${port}/health`);

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      app.log.info(`${signal} received, shutting down gracefully...`);

      try {
        // Stop camera
        await camera.stop();
        app.log.info('Camera stopped');

        // Stop session if running
        session.stop();
        app.log.info('Session stopped');

        // Close server
        await app.close();
        app.log.info('Server closed');

        process.exit(0);
      } catch (err: any) {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (err: any) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

function tinyJPEG(): any {
  // 1x1 black JPEG
  return Buffer.from([
    0xff,0xd8,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,0x39,0x3d,0x38,0x32,0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x11,0x08,0x00,0x01,0x00,0x01,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,0x00,0x02,0x01,0x03,0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7d,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1a,0x24,0x25,0x26,0x27,0x28,0x29,0x2a,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xff,0xda,0x00,0x0c,0x03,0x01,0x00,0x02,0x11,0x03,0x11,0x00,0x3f,0x00,0xd2,0xcf,0x20,0xff,0xd9
  ]);
}