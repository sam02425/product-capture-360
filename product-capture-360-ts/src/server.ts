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
import { logger, generateActionId } from './logger';
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

// Helper function to validate file paths (prevent path traversal)
function isPathSafe(requestedPath: string, baseDir: string): boolean {
  const resolved = path.resolve(baseDir, requestedPath);
  const base = path.resolve(baseDir);
  // Path must start with base directory and not escape via ../ or symlinks
  const relative = path.relative(base, resolved);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Helper function to sanitize product names
function sanitizeProductName(name: string): string {
  // Allow only alphanumeric, spaces, hyphens, underscores
  return name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().substring(0, 100);
}

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

// Health check endpoint
app.get('/api/health', async () => {
  const startTime = Date.now();

  try {
    // Check camera status
    let cameraStatus = 'healthy';
    try {
      await camera.getMetrics();
    } catch {
      cameraStatus = 'degraded';
    }

    // Check storage
    let storageDevices = 0;
    try {
      const devices = await storage.listDevices();
      storageDevices = devices.length;
    } catch {
      storageDevices = 0;
    }

    // Check session manager
    const sessionStatus = session.status();

    // Get ML cache stats
    const { yoloCache, sam2Cache, rembgCache } = await import('./ml_cache');
    const cacheStats = {
      yolo: yoloCache.getStats(),
      sam2: sam2Cache.getStats(),
      rembg: rembgCache.getStats()
    };

    const responseTime = Date.now() - startTime;
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    const health = {
      status: cameraStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      responseTime,
      services: {
        camera: { status: cameraStatus },
        storage: { status: storageDevices > 0 ? 'healthy' : 'no_devices', devices: storageDevices },
        session: { status: 'healthy', active: sessionStatus.active || false }
      },
      cache: {
        yolo: { size: cacheStats.yolo.size, maxSize: cacheStats.yolo.maxSize },
        sam2: { size: cacheStats.sam2.size, maxSize: cacheStats.sam2.maxSize },
        rembg: { size: cacheStats.rembg.size, maxSize: cacheStats.rembg.maxSize }
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    return health;
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    };
  }
});

// Cache statistics endpoint
app.get('/api/cache/stats', async () => {
  const { yoloCache, sam2Cache, rembgCache } = await import('./ml_cache');

  return {
    success: true,
    caches: {
      yolo: yoloCache.getStats(),
      sam2: sam2Cache.getStats(),
      rembg: rembgCache.getStats()
    }
  };
});

// Clear cache endpoint
app.post('/api/cache/clear', async (req: any) => {
  const { yoloCache, sam2Cache, rembgCache } = await import('./ml_cache');
  const cacheType = req.body?.cache || 'all';

  if (cacheType === 'all' || cacheType === 'yolo') {
    yoloCache.clear();
  }
  if (cacheType === 'all' || cacheType === 'sam2') {
    sam2Cache.clear();
  }
  if (cacheType === 'all' || cacheType === 'rembg') {
    rembgCache.clear();
  }

  return { success: true, message: `Cleared ${cacheType} cache(s)` };
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
app.post('/api/camera/stop', async () => {
  await camera.stop();
  return { success: true, message: 'Camera stopped' };
});
app.get('/api/camera/health', async () => camera.getMetrics());

// Camera preview/feed endpoint
app.get('/api/camera/preview', async (_req: any, reply: any) => {
  const frame = camera.getLatestJPEG();
  if (!frame) {
    reply.code(503).send({ error: 'No frame available' });
    return;
  }

  reply.type('image/jpeg').send(frame);
});

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

    // CRITICAL SECURITY: Prevent path traversal attacks
    // Allow paths from external volumes (/Volumes/) or configured storage
    const storageBase = storage.currentPath || process.cwd();
    const isExternalVolume = filePath.startsWith('/Volumes/');
    const isInStorage = isPathSafe(filePath, storageBase);

    if (!isExternalVolume && !isInStorage) {
      req.log.warn({ requestedPath: filePath, base: storageBase }, 'Path traversal attempt blocked');
      reply.code(403).send({ error: 'Access denied - path outside allowed directory' });
      return;
    }

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
  const prod = req.body?.product_name ? sanitizeProductName(req.body.product_name) : undefined;

  // Validate rate
  if (rate < 0 || rate > 500) {
    return { success: false, message: 'Invalid rate (must be 0-500)' };
  }

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

  if (!p) {
    return reply.status(400).send({ error: 'Missing path parameter' });
  }

  // CRITICAL SECURITY: Prevent path traversal attacks
  // Block any path containing .. sequences to prevent directory traversal
  if (p.includes('..')) {
    req.log.warn({ requestedPath: p }, 'Path traversal attempt blocked (.. detected)');
    return reply.status(403).send({ error: 'Access denied' });
  }

  // Ensure path is absolute (prevents relative path exploits)
  if (!path.isAbsolute(p)) {
    req.log.warn({ requestedPath: p }, 'Relative path blocked');
    return reply.status(403).send({ error: 'Only absolute paths allowed' });
  }

  if (!fs.existsSync(p)) {
    return reply.status(404).send({ error: 'File not found' });
  }

  // Check if it's an image file
  const ext = (p.split('.').pop() || '').toLowerCase();
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!allowedExtensions.includes(ext)) {
    return reply.status(400).send({ error: 'Not an image file' });
  }

  const map: any = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  reply.header('Content-Type', map[ext] || 'application/octet-stream');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Access-Control-Allow-Origin', '*');
  return reply.send(fs.createReadStream(p));
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

// ==================== DATA LEDGER API ====================

// Get ledger report
app.get<{ Querystring: { product?: string; start_date?: string; end_date?: string } }>(
  '/api/ledger/report',
  async (req: any) => {
    try {
      if (!storage.currentPath) {
        return { success: false, error: 'Storage not set' };
      }

      const { DataLedger } = await import('./ledger');
      const ledger = new DataLedger(storage.currentPath);

      const report = await ledger.generateReport({
        productName: req.query.product,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
      });

      return { success: true, report };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to generate report' };
    }
  }
);

// Get all sessions
app.get('/api/ledger/sessions', async () => {
  try {
    if (!storage.currentPath) {
      return { success: false, error: 'Storage not set' };
    }

    const { DataLedger } = await import('./ledger');
    const ledger = new DataLedger(storage.currentPath);
    const sessions = await ledger.getAllSessions();

    return { success: true, sessions };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to get sessions' };
  }
});

// Get sessions for a product
app.get<{ Params: { product: string } }>('/api/ledger/sessions/:product', async (req: any) => {
  try {
    if (!storage.currentPath) {
      return { success: false, error: 'Storage not set' };
    }

    const { DataLedger } = await import('./ledger');
    const ledger = new DataLedger(storage.currentPath);
    const sessions = await ledger.getProductSessions(req.params.product);

    return { success: true, sessions };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to get product sessions' };
  }
});

// Get product summaries
app.get('/api/ledger/products', async () => {
  try {
    if (!storage.currentPath) {
      return { success: false, error: 'Storage not set' };
    }

    const { DataLedger } = await import('./ledger');
    const ledger = new DataLedger(storage.currentPath);
    const products = await ledger.getAllProductSummaries();

    return { success: true, products };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to get products' };
  }
});

// Get daily summaries
app.get('/api/ledger/daily', async () => {
  try {
    if (!storage.currentPath) {
      return { success: false, error: 'Storage not set' };
    }

    const { DataLedger } = await import('./ledger');
    const ledger = new DataLedger(storage.currentPath);
    const daily = await ledger.getAllDailySummaries();

    return { success: true, daily };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to get daily summaries' };
  }
});

// Export ledger to CSV
app.post<{ Body: { output_path: string } }>('/api/ledger/export', async (req: any) => {
  try {
    if (!storage.currentPath) {
      return { success: false, error: 'Storage not set' };
    }

    const { DataLedger } = await import('./ledger');
    const ledger = new DataLedger(storage.currentPath);
    await ledger.exportToCSV(req.body.output_path);

    return { success: true, path: req.body.output_path };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to export ledger' };
  }
});

// Auto-annotation endpoint
app.post<{ Body: {
  image_path: string;
  model?: string;
  confidence?: number;
  label?: string;
  target_class?: string;
}}>('/api/auto-annotate', async (req: any) => {
  try {
    const { image_path, model = 'yolov8-bottle', confidence = 0.85, label = 'bottle', target_class = 'bottle' } = req.body;

    if (!image_path) {
      return { success: false, error: 'Image path required' };
    }

    // Use YOLO to detect bottles
    const { runBottleDetection } = await import('./bottle_detection');
    const detections = await runBottleDetection(image_path, {
      model,
      confidence,
      label,
      targetClass: target_class
    });

    return {
      success: true,
      detections,
      count: detections.length
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Auto-annotation failed' };
  }
});

app.post<{ Body: {
  image_path: string;
  box: { x: number; y: number; width: number; height: number };
  model?: string;
  config?: string;
  device?: string;
} }>('/api/segment/sam2', async (req: any) => {
  try {
    const { image_path, box, model, config, device } = req.body || {};
    if (!image_path || !box) {
      return { success: false, error: 'image_path and box are required' };
    }

    const storageBase = storage.currentPath || process.cwd();
    if (!isPathSafe(image_path, storageBase)) {
      return { success: false, error: 'Access denied' };
    }

    if (!fs.existsSync(image_path)) {
      return { success: false, error: 'Image file not found' };
    }

    const { runSam2Refine } = await import('./sam2_refine');
    const result = await runSam2Refine(image_path, box, { model, config, device });
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error?.message || 'SAM2 refinement failed' };
  }
});

app.post<{ Body: {
  video_path: string;
  init_box: { x: number; y: number; width: number; height: number };
  model?: string;
  config?: string;
  device?: string;
  frame_step?: number;
  init_frame?: number;
  include_masks?: boolean;
} }>('/api/track/sam2', async (req: any) => {
  try {
    const { video_path, init_box, model, config, device, frame_step, init_frame, include_masks } = req.body || {};
    if (!video_path || !init_box) {
      return { success: false, error: 'video_path and init_box are required' };
    }

    const storageBase = storage.currentPath || process.cwd();
    if (!isPathSafe(video_path, storageBase)) {
      return { success: false, error: 'Access denied' };
    }

    if (!fs.existsSync(video_path)) {
      return { success: false, error: 'Video file not found' };
    }

    const { runSam2Track } = await import('./sam2_refine');
    const result = await runSam2Track(video_path, init_box, {
      model,
      config,
      device,
      frameStep: Number(frame_step ?? 1),
      initFrame: Number(init_frame ?? 0),
      includeMasks: Boolean(include_masks)
    });

    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error?.message || 'SAM2 tracking failed' };
  }
});

// Visualization support endpoints
app.post<{ Body: { path: string; binary?: boolean } }>('/api/read-file', async (req: any, reply: any) => {
  try {
    const filePath = req.body?.path;

    if (!filePath) {
      return reply.status(400).send({ error: 'Missing path parameter' });
    }

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Read file
    if (req.body?.binary) {
      // Return binary file (images)
      const ext = path.extname(filePath).toLowerCase();
      const contentType = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      }[ext] || 'application/octet-stream';

      // Read entire file into buffer (better for CORS/blob handling)
      const fileBuffer = fs.readFileSync(filePath);
      reply.type(contentType).send(fileBuffer);
    } else {
      // Return text file (JSON, TXT, YAML)
      const content = fs.readFileSync(filePath, 'utf-8');

      // Try to parse JSON files
      if (filePath.endsWith('.json')) {
        try {
          const json = JSON.parse(content);
          return reply.send(json);
        } catch (e) {
          return reply.send(content);
        }
      }

      return reply.send(content);
    }
  } catch (error: any) {
    req.log.error({ err: error }, 'Error reading file');
    return reply.status(500).send({ error: 'Failed to read file' });
  }
});

app.post<{ Body: { path: string } }>('/api/list-directory', async (req: any, reply: any) => {
  try {
    const dirPath = req.body?.path;

    if (!dirPath) {
      return reply.status(400).send({ error: 'Missing path parameter' });
    }

    if (!fs.existsSync(dirPath)) {
      return reply.status(404).send({ error: 'Directory not found' });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return reply.status(400).send({ error: 'Path is not a directory' });
    }

    // List files in directory with type information
    const files = fs.readdirSync(dirPath);

    // Filter out hidden files and system files, and include directory info
    const filesWithInfo = files
      .filter(f => !f.startsWith('.') && !f.startsWith('_'))
      .map(f => {
        const fullPath = path.join(dirPath, f);
        try {
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            isDirectory: stats.isDirectory()
          };
        } catch (e) {
          return {
            name: f,
            isDirectory: false
          };
        }
      });

    return reply.send(filesWithInfo);
  } catch (error: any) {
    req.log.error({ err: error }, 'Error listing directory');
    return reply.status(500).send({ error: 'Failed to list directory' });
  }
});

app.get('/', async (req: any, reply: any) => { reply.redirect('/image-collector.html'); });

// ============================================================================
// LOGGING API ENDPOINTS
// ============================================================================

// Receive client-side logs
app.post<{ Body: any }>('/api/logs/client', async (req: any, reply: any) => {
  const clientLog = req.body;

  // Log client-side errors/warnings to backend with [CLIENT] prefix
  const message = `[CLIENT] ${clientLog.message}`;
  const context = {
    sessionId: clientLog.sessionId,
    url: clientLog.url,
    userAgent: clientLog.userAgent,
    ...clientLog.context,
  };

  switch (clientLog.level) {
    case 'WARN':
      logger.warn(message, context, clientLog.metadata);
      break;
    case 'ERROR':
      logger.error(message, context, clientLog.metadata);
      break;
    case 'FATAL':
      logger.fatal(message, context, clientLog.metadata);
      break;
    default:
      logger.info(message, context, clientLog.metadata);
  }

  return reply.send({ success: true });
});

// Get recent logs
app.get('/api/logs/recent', async (req: any, reply: any) => {
  try {
    const count = parseInt(req.query?.count || '100');
    const logs = await logger.getRecentLogs(count);
    return reply.send({ success: true, logs });
  } catch (error: any) {
    logger.error('Failed to fetch recent logs', {}, {}, error);
    return reply.status(500).send({ error: 'Failed to fetch logs' });
  }
});

// Get logs for specific date
app.get('/api/logs/date/:date', async (req: any, reply: any) => {
  try {
    const { date } = req.params;
    const logs = await logger.getLogsForDate(date);
    return reply.send({ success: true, logs, date });
  } catch (error: any) {
    logger.error('Failed to fetch logs for date', { date: req.params.date }, {}, error);
    return reply.status(500).send({ error: 'Failed to fetch logs' });
  }
});

// Search logs
app.post<{ Body: { query: string; date?: string } }>('/api/logs/search', async (req: any, reply: any) => {
  try {
    const { query, date } = req.body;
    const logs = await logger.searchLogs(query, date);
    return reply.send({ success: true, logs, query, date });
  } catch (error: any) {
    logger.error('Failed to search logs', {}, { query: req.body?.query }, error);
    return reply.status(500).send({ error: 'Failed to search logs' });
  }
});

// Get log directory path
app.get('/api/logs/directory', async (req: any, reply: any) => {
  const directory = logger.getLogDirectory();
  return reply.send({ success: true, directory });
});

// Cleanup old logs
app.post<{ Body: { daysToKeep?: number } }>('/api/logs/cleanup', async (req: any, reply: any) => {
  try {
    const daysToKeep = req.body?.daysToKeep || 30;
    logger.cleanupOldLogs(daysToKeep);
    logger.info('Log cleanup initiated', {}, { daysToKeep });
    return reply.send({ success: true, message: `Cleaning up logs older than ${daysToKeep} days` });
  } catch (error: any) {
    logger.error('Failed to cleanup logs', {}, {}, error);
    return reply.status(500).send({ error: 'Failed to cleanup logs' });
  }
});

// ========================================
// BATCH ANNOTATION API
// ========================================

import { batchAnnotationService } from './batch_annotation';

app.post('/api/batch-annotate', async (req, reply) => {
  const actionId = generateActionId();
  logger.startAction(actionId, 'batchAnnotate', { endpoint: '/api/batch-annotate' });

  try {
    const { folderPath, engine, model, confidence, targetClass, labelName } = req.body as any;

    if (!folderPath) {
      return reply.status(400).send({ error: 'folderPath is required' });
    }

    if (!engine || (engine !== 'yolo' && engine !== 'sam2')) {
      return reply.status(400).send({ error: 'engine must be "yolo" or "sam2"' });
    }

    const jobId = await batchAnnotationService.startBatchJob({
      folderPath,
      engine,
      model,
      confidence,
      targetClass,
      labelName
    });

    logger.endAction(actionId, 'batchAnnotate', true, {}, { jobId });

    return reply.send({
      success: true,
      jobId,
      message: 'Batch annotation job started'
    });
  } catch (error: any) {
    logger.failAction(actionId, 'batchAnnotate', error);
    return reply.status(500).send({
      error: error.message || 'Failed to start batch annotation'
    });
  }
});

app.get('/api/yolo/check', async (req, reply) => {
  try {
    const { execFile } = await import('child_process');
    const scriptPath = path.join(process.cwd(), 'scripts', 'yolo_health_check.py');

    const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile('python3', [scriptPath], { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    const payload = JSON.parse(output.stdout || '{}');
    return reply.send(payload);
  } catch (error: any) {
    return reply.status(500).send({ ok: false, error: error.message || 'YOLO check failed' });
  }
});

app.get('/api/batch-annotate/status/:jobId', async (req, reply) => {
  try {
    const { jobId } = req.params as any;

    const progress = batchAnnotationService.getJobProgress(jobId);

    if (!progress) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send({
      success: true,
      progress
    });
  } catch (error: any) {
    logger.error('Failed to get batch job status', {}, {}, error);
    return reply.status(500).send({
      error: 'Failed to get job status'
    });
  }
});

app.get('/api/batch-annotate/jobs', async (req, reply) => {
  try {
    const jobs = batchAnnotationService.getAllJobs();

    return reply.send({
      success: true,
      jobs
    });
  } catch (error: any) {
    logger.error('Failed to get batch jobs', {}, {}, error);
    return reply.status(500).send({
      error: 'Failed to get jobs'
    });
  }
});

app.post('/api/batch-annotate/cancel/:jobId', async (req, reply) => {
  try {
    const { jobId } = req.params as any;

    const cancelled = batchAnnotationService.cancelJob(jobId);

    if (!cancelled) {
      return reply.status(404).send({ error: 'Job not found or not running' });
    }

    logger.info('Batch job cancelled', { jobId });

    return reply.send({
      success: true,
      message: 'Job cancelled'
    });
  } catch (error: any) {
    logger.error('Failed to cancel batch job', {}, {}, error);
    return reply.status(500).send({
      error: 'Failed to cancel job'
    });
  }
});

app.delete('/api/batch-annotate/job/:jobId', async (req, reply) => {
  try {
    const { jobId } = req.params as any;

    const deleted = batchAnnotationService.deleteJob(jobId);

    if (!deleted) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send({
      success: true,
      message: 'Job deleted'
    });
  } catch (error: any) {
    logger.error('Failed to delete batch job', {}, {}, error);
    return reply.status(500).send({
      error: 'Failed to delete job'
    });
  }
});

app.post('/api/batch-annotate/save', async (req, reply) => {
  const actionId = generateActionId();
  logger.startAction(actionId, 'saveBatchAnnotations', { endpoint: '/api/batch-annotate/save' });

  try {
    const { jobId, annotations, outputFolder } = req.body as any;

    if (!jobId || !annotations || !outputFolder) {
      return reply.status(400).send({
        error: 'jobId, annotations, and outputFolder are required'
      });
    }

    // Create output folder if it doesn't exist
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Save annotations in YOLO format
    let savedCount = 0;

    for (const result of annotations) {
      if (result.annotations && result.annotations.length > 0) {
        const imageName = path.basename(result.imagePath, path.extname(result.imagePath));
        const labelPath = path.join(outputFolder, `${imageName}.txt`);

        const lines = result.annotations.map((ann: any) => {
          const { bbox, labelName, polygon } = ann;

          // For now, use class ID 0 (can be enhanced later with label mapping)
          const classId = 0;

          if (polygon && polygon.length > 0) {
            // Polygon format: class_id x1 y1 x2 y2 x3 y3 ...
            const points = polygon.map((p: any) => `${p.x} ${p.y}`).join(' ');
            return `${classId} ${points}`;
          } else {
            // Bbox format: class_id x_center y_center width height (normalized)
            // Note: These should already be normalized, but we'll assume they're in pixel coordinates
            // and need image dimensions for normalization (will be handled by frontend)
            const x_center = bbox.x + bbox.width / 2;
            const y_center = bbox.y + bbox.height / 2;
            return `${classId} ${x_center} ${y_center} ${bbox.width} ${bbox.height}`;
          }
        });

        fs.writeFileSync(labelPath, lines.join('\n'));
        savedCount++;
      }
    }

    logger.endAction(actionId, 'saveBatchAnnotations', true, { jobId }, {
      savedCount,
      outputFolder
    });

    return reply.send({
      success: true,
      message: `Saved ${savedCount} annotation files to ${outputFolder}`,
      savedCount
    });
  } catch (error: any) {
    logger.failAction(actionId, 'saveBatchAnnotations', error);
    return reply.status(500).send({
      error: error.message || 'Failed to save annotations'
    });
  }
});

async function start() {
  // Initialize logger
  logger.info('Starting Product Capture 360 server', {}, {
    nodeVersion: process.version,
    platform: process.platform,
    env: process.env.NODE_ENV || 'development',
  });
  try {
    // Kill any existing server processes before starting
    try {
      const { execSync } = require('child_process');
      const currentPid = process.pid;

      // Find all node processes running dist/server.js
      try {
        const psOutput = execSync('ps aux | grep "node dist/server.js" | grep -v grep', { encoding: 'utf8' });
        const lines = psOutput.trim().split('\n');

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1]);

          // Don't kill ourselves
          if (pid !== currentPid) {
            try {
              process.kill(pid, 'SIGTERM');
              app.log.info(`Killed old server process: PID ${pid}`);
            } catch (e) {
              // Process might already be dead
            }
          }
        }
      } catch (e) {
        // No existing processes found (grep returns non-zero if no match)
      }

      // Wait a bit for processes to die
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err: any) {
      app.log.warn({ err }, 'Failed to clean up old server processes');
    }

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
