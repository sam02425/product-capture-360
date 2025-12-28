/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { PolygonMask } from './segmentation';

/**
 * Export dataset in multiple formats for different YOLO versions
 * - YOLOv5: txt format with normalized coordinates
 * - YOLOv8: same as v5 but with updated folder structure
 * - YOLOv11: latest format with enhanced annotations
 * - COCO: JSON format for broader compatibility
 */

export interface DatasetExportOptions {
  imagesDir: string;
  polygonsDir: string;
  outputDir: string;
  format: 'yolov5' | 'yolov8' | 'yolov11' | 'coco' | 'all';
  className: string;
  splitRatio?: number; // Train/val split (e.g., 0.8 for 80% train)
}

export interface ExportResult {
  success: boolean;
  formats: string[];
  trainCount?: number;
  valCount?: number;
  message?: string;
}

/**
 * Export dataset in specified format(s)
 */
export async function exportDataset(opts: DatasetExportOptions): Promise<ExportResult> {
  try {
    const { imagesDir, polygonsDir, outputDir, format, className, splitRatio = 0.8 } = opts;

    if (!fs.existsSync(imagesDir) || !fs.existsSync(polygonsDir)) {
      return { success: false, formats: [], message: 'Images or polygons directory not found' };
    }

    const images = fs.readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    if (images.length === 0) {
      return { success: false, formats: [], message: 'No images found' };
    }

    // Split into train/val
    const shuffled = [...images].sort(() => Math.random() - 0.5);
    const trainCount = Math.floor(images.length * splitRatio);
    const trainImages = shuffled.slice(0, trainCount);
    const valImages = shuffled.slice(trainCount);

    const formats: string[] = [];

    // Export based on format
    if (format === 'yolov5' || format === 'all') {
      await exportYOLOv5(imagesDir, polygonsDir, outputDir, trainImages, valImages, className);
      formats.push('yolov5');
    }

    if (format === 'yolov8' || format === 'all') {
      await exportYOLOv8(imagesDir, polygonsDir, outputDir, trainImages, valImages, className);
      formats.push('yolov8');
    }

    if (format === 'yolov11' || format === 'all') {
      await exportYOLOv11(imagesDir, polygonsDir, outputDir, trainImages, valImages, className);
      formats.push('yolov11');
    }

    if (format === 'coco' || format === 'all') {
      await exportCOCO(imagesDir, polygonsDir, outputDir, trainImages, valImages, className);
      formats.push('coco');
    }

    return {
      success: true,
      formats,
      trainCount: trainImages.length,
      valCount: valImages.length,
      message: `Exported in ${formats.join(', ')} format(s)`,
    };
  } catch (e: any) {
    return {
      success: false,
      formats: [],
      message: e?.message || 'Export failed',
    };
  }
}

/**
 * YOLOv5 format export
 * Structure:
 * yolov5/
 * ├── data.yaml
 * ├── train/
 * │   ├── images/
 * │   └── labels/
 * └── val/
 *     ├── images/
 *     └── labels/
 */
async function exportYOLOv5(
  imagesDir: string,
  polygonsDir: string,
  outputDir: string,
  trainImages: string[],
  valImages: string[],
  className: string
): Promise<void> {
  const yolov5Dir = path.join(outputDir, 'yolov5');

  // Create directory structure
  const trainImgDir = path.join(yolov5Dir, 'train', 'images');
  const trainLblDir = path.join(yolov5Dir, 'train', 'labels');
  const valImgDir = path.join(yolov5Dir, 'val', 'images');
  const valLblDir = path.join(yolov5Dir, 'val', 'labels');

  fs.mkdirSync(trainImgDir, { recursive: true });
  fs.mkdirSync(trainLblDir, { recursive: true });
  fs.mkdirSync(valImgDir, { recursive: true });
  fs.mkdirSync(valLblDir, { recursive: true });

  // Copy and convert train images
  for (const img of trainImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, trainImgDir, trainLblDir, img);
  }

  // Copy and convert val images
  for (const img of valImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, valImgDir, valLblDir, img);
  }

  // Create data.yaml
  const yamlContent = `# YOLOv5 Dataset Configuration
path: ${yolov5Dir}
train: train/images
val: val/images

nc: 1
names: ['${className}']
`;

  fs.writeFileSync(path.join(yolov5Dir, 'data.yaml'), yamlContent);
}

/**
 * YOLOv8 format export (similar to v5 with some enhancements)
 */
async function exportYOLOv8(
  imagesDir: string,
  polygonsDir: string,
  outputDir: string,
  trainImages: string[],
  valImages: string[],
  className: string
): Promise<void> {
  const yolov8Dir = path.join(outputDir, 'yolov8');

  // Same structure as YOLOv5
  const trainImgDir = path.join(yolov8Dir, 'train', 'images');
  const trainLblDir = path.join(yolov8Dir, 'train', 'labels');
  const valImgDir = path.join(yolov8Dir, 'val', 'images');
  const valLblDir = path.join(yolov8Dir, 'val', 'labels');

  fs.mkdirSync(trainImgDir, { recursive: true });
  fs.mkdirSync(trainLblDir, { recursive: true });
  fs.mkdirSync(valImgDir, { recursive: true });
  fs.mkdirSync(valLblDir, { recursive: true });

  for (const img of trainImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, trainImgDir, trainLblDir, img);
  }

  for (const img of valImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, valImgDir, valLblDir, img);
  }

  // YOLOv8 uses same yaml format
  const yamlContent = `# YOLOv8 Dataset Configuration
path: ${yolov8Dir}
train: train/images
val: val/images

nc: 1
names: ['${className}']

# YOLOv8 specific settings
task: detect
mode: train
`;

  fs.writeFileSync(path.join(yolov8Dir, 'data.yaml'), yamlContent);
}

/**
 * YOLOv11 format export
 */
async function exportYOLOv11(
  imagesDir: string,
  polygonsDir: string,
  outputDir: string,
  trainImages: string[],
  valImages: string[],
  className: string
): Promise<void> {
  const yolov11Dir = path.join(outputDir, 'yolov11');

  const trainImgDir = path.join(yolov11Dir, 'train', 'images');
  const trainLblDir = path.join(yolov11Dir, 'train', 'labels');
  const valImgDir = path.join(yolov11Dir, 'val', 'images');
  const valLblDir = path.join(yolov11Dir, 'val', 'labels');

  fs.mkdirSync(trainImgDir, { recursive: true });
  fs.mkdirSync(trainLblDir, { recursive: true });
  fs.mkdirSync(valImgDir, { recursive: true });
  fs.mkdirSync(valLblDir, { recursive: true });

  for (const img of trainImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, trainImgDir, trainLblDir, img, true);
  }

  for (const img of valImages) {
    await copyAndConvertYOLO(imagesDir, polygonsDir, valImgDir, valLblDir, img, true);
  }

  // YOLOv11 enhanced yaml
  const yamlContent = `# YOLOv11 Dataset Configuration
path: ${yolov11Dir}
train: train/images
val: val/images

nc: 1
names: ['${className}']

# YOLOv11 enhanced settings
task: detect
mode: train
model: yolov11n.pt
imgsz: 640
batch: 16
epochs: 100
`;

  fs.writeFileSync(path.join(yolov11Dir, 'data.yaml'), yamlContent);
}

/**
 * COCO format export
 */
async function exportCOCO(
  imagesDir: string,
  polygonsDir: string,
  outputDir: string,
  trainImages: string[],
  valImages: string[],
  className: string
): Promise<void> {
  const cocoDir = path.join(outputDir, 'coco');
  const trainImgDir = path.join(cocoDir, 'train2017');
  const valImgDir = path.join(cocoDir, 'val2017');
  const annDir = path.join(cocoDir, 'annotations');

  fs.mkdirSync(trainImgDir, { recursive: true });
  fs.mkdirSync(valImgDir, { recursive: true });
  fs.mkdirSync(annDir, { recursive: true });

  // Create COCO JSON annotations
  const trainCoco = createCOCOAnnotations(imagesDir, polygonsDir, trainImages, className, 1);
  const valCoco = createCOCOAnnotations(imagesDir, polygonsDir, valImages, className, trainImages.length + 1);

  // Copy images
  for (const img of trainImages) {
    fs.copyFileSync(path.join(imagesDir, img), path.join(trainImgDir, img));
  }

  for (const img of valImages) {
    fs.copyFileSync(path.join(imagesDir, img), path.join(valImgDir, img));
  }

  // Write annotations
  fs.writeFileSync(path.join(annDir, 'instances_train2017.json'), JSON.stringify(trainCoco, null, 2));
  fs.writeFileSync(path.join(annDir, 'instances_val2017.json'), JSON.stringify(valCoco, null, 2));
}

/**
 * Copy image and convert polygon to YOLO format
 */
async function copyAndConvertYOLO(
  imagesDir: string,
  polygonsDir: string,
  targetImgDir: string,
  targetLblDir: string,
  imgFile: string,
  useSegmentation: boolean = false
): Promise<void> {
  const baseName = path.parse(imgFile).name;
  const polygonPath = path.join(polygonsDir, `${baseName}.json`);

  // Copy image
  fs.copyFileSync(path.join(imagesDir, imgFile), path.join(targetImgDir, imgFile));

  // Convert polygon to YOLO format
  if (fs.existsSync(polygonPath)) {
    const polygonData = JSON.parse(fs.readFileSync(polygonPath, 'utf-8')) as PolygonMask;

    // Get image dimensions (read from file or assume square)
    const imgWidth = 640; // Assuming square images
    const imgHeight = 640;

    if (useSegmentation) {
      // YOLOv11 segmentation format: class x1 y1 x2 y2 ... xn yn
      const normalizedPoints = polygonData.points
        .map(([x, y]) => `${(x / imgWidth).toFixed(6)} ${(y / imgHeight).toFixed(6)}`)
        .join(' ');

      const yoloLine = `0 ${normalizedPoints}\n`;
      fs.writeFileSync(path.join(targetLblDir, `${baseName}.txt`), yoloLine);
    } else {
      // YOLOv5/v8 bbox format: class x_center y_center width height
      const [x, y, w, h] = polygonData.bbox;
      const xCenter = (x + w / 2) / imgWidth;
      const yCenter = (y + h / 2) / imgHeight;
      const normWidth = w / imgWidth;
      const normHeight = h / imgHeight;

      const yoloLine = `0 ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}\n`;
      fs.writeFileSync(path.join(targetLblDir, `${baseName}.txt`), yoloLine);
    }
  }
}

/**
 * Create COCO format annotations
 */
function createCOCOAnnotations(
  imagesDir: string,
  polygonsDir: string,
  imageFiles: string[],
  className: string,
  startId: number
): any {
  const coco = {
    info: {
      description: 'Product Detection Dataset',
      version: '1.0',
      year: new Date().getFullYear(),
      contributor: 'Product Capture 360',
      date_created: new Date().toISOString(),
    },
    licenses: [],
    images: [] as any[],
    annotations: [] as any[],
    categories: [
      {
        id: 1,
        name: className,
        supercategory: 'product',
      },
    ],
  };

  let imageId = startId;
  let annotationId = 1;

  for (const imgFile of imageFiles) {
    const baseName = path.parse(imgFile).name;
    const polygonPath = path.join(polygonsDir, `${baseName}.json`);

    // Add image
    coco.images.push({
      id: imageId,
      file_name: imgFile,
      width: 640,
      height: 640,
    });

    // Add annotation if polygon exists
    if (fs.existsSync(polygonPath)) {
      const polygonData = JSON.parse(fs.readFileSync(polygonPath, 'utf-8')) as PolygonMask;

      const [x, y, w, h] = polygonData.bbox;
      const segmentation = [polygonData.points.flat()];

      coco.annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: 1,
        bbox: [x, y, w, h],
        area: w * h,
        segmentation,
        iscrowd: 0,
      });
    }

    imageId++;
  }

  return coco;
}
