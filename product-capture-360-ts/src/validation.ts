import { z } from 'zod';

/**
 * Validation Schemas
 *
 * Centralized input validation for all API endpoints using Zod
 */

// Common schemas
export const PathSchema = z.string()
  .min(1, 'Path cannot be empty')
  .refine(path => !path.includes('..'), 'Path cannot contain ..')
  .refine(path => path.startsWith('/'), 'Path must be absolute');

export const ProductNameSchema = z.string()
  .min(1, 'Product name cannot be empty')
  .max(100, 'Product name too long')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Product name contains invalid characters');

// Batch Annotation schemas
export const BatchAnnotationOptionsSchema = z.object({
  folderPath: PathSchema,
  engine: z.enum(['yolo', 'sam2']),
  model: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  targetClass: z.string().optional(),
  labelName: z.string().optional()
});

export const BatchJobIdSchema = z.string().uuid('Invalid job ID format');

// Camera schemas
export const CameraCaptureSchema = z.object({
  sessionId: z.string(),
  productName: ProductNameSchema.optional(),
  captureInterval: z.number().min(100).max(10000).optional()
});

// Storage schemas
export const ListDirectorySchema = z.object({
  path: PathSchema
});

export const FilePathSchema = z.object({
  path: PathSchema
});

// Auto-annotation schemas
export const AutoAnnotateSchema = z.object({
  image_path: PathSchema,
  model: z.string().min(1).max(50),
  confidence: z.number().min(0).max(1),
  label: z.string().min(1).max(100),
  target_class: z.string().min(1).max(100).optional()
});

// SAM2 refinement schemas
export const Sam2RefineSchema = z.object({
  image_path: PathSchema,
  bbox: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(1),
    height: z.number().min(1)
  })
});

// Background removal schemas
export const RemoveBackgroundSchema = z.object({
  input_path: PathSchema,
  output_path: PathSchema.optional(),
  model: z.enum(['u2net', 'u2net_human_seg', 'u2netp', 'silueta']).optional()
});

// Session schemas
export const CreateSessionSchema = z.object({
  productName: ProductNameSchema,
  baseFolder: PathSchema.optional()
});

export const SessionIdSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID')
});

// Dataset generation schemas
export const GenerateDatasetSchema = z.object({
  product_name: ProductNameSchema,
  source_folder: PathSchema,
  background_images: z.array(PathSchema),
  augmentations: z.object({
    zoom: z.boolean().optional(),
    lighting: z.boolean().optional(),
    colorJitter: z.boolean().optional(),
    shadows: z.boolean().optional(),
    rotation: z.boolean().optional(),
    flip: z.boolean().optional(),
    blur: z.boolean().optional(),
    noise: z.boolean().optional(),
    augmentationsPerBackground: z.number().min(0).max(100).optional()
  }),
  segmentation_model: z.string().optional(),
  export_formats: z.array(z.enum(['yolo', 'coco', 'voc'])).optional()
});

// Version management schemas
export const CreateVersionSchema = z.object({
  product_name: ProductNameSchema,
  source_folder: PathSchema,
  source_images: z.number().min(0),
  segmentation_model: z.string(),
  augmentations: z.object({
    zoom: z.boolean(),
    lighting: z.boolean(),
    colorJitter: z.boolean(),
    shadows: z.boolean(),
    rotation: z.boolean(),
    flip: z.boolean(),
    blur: z.boolean(),
    noise: z.boolean(),
    augmentationsPerBackground: z.number()
  }),
  background_images: z.array(PathSchema),
  total_images: z.number().min(0),
  train_images: z.number().min(0),
  val_images: z.number().min(0),
  export_formats: z.array(z.string()),
  description: z.string().optional(),
  tags: z.array(z.string()).optional()
});

/**
 * Validation helper function
 * Validates data against a schema and returns parsed result or throws error
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation helper
 * Returns { success: true, data } or { success: false, error }
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
