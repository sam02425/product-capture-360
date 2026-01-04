/**
 * Test Fixtures and Mock Data
 * Reusable test data for consistent testing
 */

import { Detection } from '../../src/bottle_detection';

/**
 * Mock YOLO Detections
 */
export const mockYoloDetections: Detection[] = [
  {
    x: 100,
    y: 150,
    width: 200,
    height: 400,
    confidence: 0.95,
    class: 'bottle'
  },
  {
    x: 350,
    y: 120,
    width: 180,
    height: 380,
    confidence: 0.89,
    class: 'bottle'
  }
];

/**
 * Mock Session Data
 */
export const mockSessionData = {
  sessionId: 'test-session-123',
  productName: 'Test Product',
  baseFolder: '/tmp/test-captures',
  startTime: Date.now(),
  captureCount: 0
};

/**
 * Mock Cache Keys
 */
export const mockCacheKeys = {
  yolo: {
    imagePath: '/tmp/test-image.jpg',
    mtime: Date.now(),
    size: 1024000,
    model: 'yolov8n',
    confidence: 0.85,
    targetClass: 'bottle'
  },
  sam2: {
    imagePath: '/tmp/test-image.jpg',
    bbox: { x: 100, y: 100, width: 200, height: 300 }
  }
};

/**
 * Mock Subprocess Results
 */
export const mockSubprocessResult = {
  stdout: JSON.stringify(mockYoloDetections),
  stderr: '',
  exitCode: 0
};

/**
 * Mock Batch Annotation Job
 */
export const mockBatchJob = {
  jobId: 'job-test-123',
  folderPath: '/tmp/test-folder',
  engine: 'yolo' as const,
  model: 'yolov8n',
  confidence: 0.5,
  targetClass: 'bottle',
  labelName: 'Product',
  status: 'processing' as const,
  startTime: Date.now(),
  totalImages: 10,
  processedImages: 5
};

/**
 * Mock API Responses
 */
export const mockApiResponses = {
  health: {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: 100,
    responseTime: 1,
    services: {
      camera: { status: 'healthy' },
      storage: { status: 'healthy', devices: 2 },
      session: { status: 'healthy', active: false }
    },
    cache: {
      yolo: { size: 10, maxSize: 500 },
      sam2: { size: 5, maxSize: 200 },
      rembg: { size: 2, maxSize: 300 }
    }
  },
  cacheStats: {
    success: true,
    caches: {
      yolo: {
        size: 10,
        maxSize: 500,
        ttlMinutes: 30,
        entries: []
      },
      sam2: {
        size: 5,
        maxSize: 200,
        ttlMinutes: 60,
        entries: []
      },
      rembg: {
        size: 2,
        maxSize: 300,
        ttlMinutes: 45,
        entries: []
      }
    }
  }
};

/**
 * Mock Validation Schemas Test Data
 */
export const mockValidationData = {
  validPath: '/Users/test/images',
  invalidPath: '../../../etc/passwd',
  validProductName: 'Test Product 123',
  invalidProductName: 'Test<script>alert(1)</script>',
  validBatchOptions: {
    folderPath: '/Users/test/images',
    engine: 'yolo' as const,
    model: 'yolov8n',
    confidence: 0.75,
    targetClass: 'bottle',
    labelName: 'Product'
  }
};

/**
 * Helper: Create mock file path
 */
export function createMockFilePath(filename: string): string {
  return `/tmp/test/${filename}`;
}

/**
 * Helper: Create mock detection with custom values
 */
export function createMockDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    x: 100,
    y: 100,
    width: 200,
    height: 300,
    confidence: 0.9,
    class: 'bottle',
    ...overrides
  };
}

/**
 * Helper: Create mock cache entry
 */
export function createMockCacheEntry<T>(data: T, ageMinutes: number = 0) {
  return {
    data,
    timestamp: Date.now() - (ageMinutes * 60 * 1000),
    accessCount: 0
  };
}
