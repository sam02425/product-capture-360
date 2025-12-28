/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Dataset Versioning System - Image Collector by EyeAI
 *
 * Features:
 * - Version tracking (v1, v2, v3...)
 * - Preprocessing history
 * - Augmentation settings
 * - Train/val/test splits
 * - Version comparison
 * - Rollback capability
 */

export interface DatasetVersion {
  version: number;
  name: string;
  created: string;
  productName: string;

  // Source info
  sourceImages: number;
  sourceFolder: string;

  // Processing info
  segmentationModel: string;
  augmentations: AugmentationConfig;
  backgroundImages: string[];

  // Output info
  totalImages: number;
  trainImages: number;
  valImages: number;
  testImages?: number;

  // Export formats
  exportFormats: string[];

  // Metadata
  description?: string;
  tags?: string[];
  metrics?: TrainingMetrics;
}

export interface AugmentationConfig {
  zoom: boolean;
  zoomRange?: [number, number];
  lighting: boolean;
  colorJitter: boolean;
  shadows: boolean;
  rotation: boolean;
  rotationDegrees?: number;
  flip: boolean;
  blur: boolean;
  noise: boolean;
  augmentationsPerBackground: number;
}

export interface TrainingMetrics {
  mAP50?: number;
  mAP5095?: number;
  precision?: number;
  recall?: number;
  trainedEpochs?: number;
  trainedAt?: string;
}

export interface VersionComparison {
  version1: DatasetVersion;
  version2: DatasetVersion;
  differences: {
    sourceImages: number;
    totalImages: number;
    augmentationChanges: string[];
    backgroundChanges: {
      added: string[];
      removed: string[];
    };
  };
}

export class DatasetVersionManager {
  private versionsDir: string;

  constructor(baseDir: string) {
    this.versionsDir = path.join(baseDir, '.versions');
    fs.mkdirSync(this.versionsDir, { recursive: true });
  }

  /**
   * Create a new dataset version
   */
  createVersion(opts: {
    productName: string;
    sourceFolder: string;
    sourceImages: number;
    segmentationModel: string;
    augmentations: AugmentationConfig;
    backgroundImages: string[];
    totalImages: number;
    trainImages: number;
    valImages: number;
    exportFormats: string[];
    description?: string;
    tags?: string[];
  }): DatasetVersion {
    const versions = this.listVersions();
    const nextVersion = versions.length > 0
      ? Math.max(...versions.map(v => v.version)) + 1
      : 1;

    const version: DatasetVersion = {
      version: nextVersion,
      name: `v${nextVersion}`,
      created: new Date().toISOString(),
      productName: opts.productName,
      sourceImages: opts.sourceImages,
      sourceFolder: opts.sourceFolder,
      segmentationModel: opts.segmentationModel,
      augmentations: opts.augmentations,
      backgroundImages: opts.backgroundImages,
      totalImages: opts.totalImages,
      trainImages: opts.trainImages,
      valImages: opts.valImages,
      exportFormats: opts.exportFormats,
      description: opts.description,
      tags: opts.tags || [],
    };

    // Save version metadata
    const versionFile = path.join(this.versionsDir, `v${nextVersion}.json`);
    fs.writeFileSync(versionFile, JSON.stringify(version, null, 2));

    // Update latest version pointer
    const latestFile = path.join(this.versionsDir, 'latest.json');
    fs.writeFileSync(latestFile, JSON.stringify({ version: nextVersion }, null, 2));

    return version;
  }

  /**
   * Get a specific version
   */
  getVersion(version: number): DatasetVersion | null {
    const versionFile = path.join(this.versionsDir, `v${version}.json`);
    if (!fs.existsSync(versionFile)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
  }

  /**
   * Get latest version
   */
  getLatestVersion(): DatasetVersion | null {
    const latestFile = path.join(this.versionsDir, 'latest.json');
    if (!fs.existsSync(latestFile)) {
      return null;
    }
    const latest = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
    return this.getVersion(latest.version);
  }

  /**
   * List all versions
   */
  listVersions(): DatasetVersion[] {
    if (!fs.existsSync(this.versionsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.versionsDir)
      .filter(f => f.startsWith('v') && f.endsWith('.json'))
      .sort();

    return files.map(f => {
      const content = fs.readFileSync(path.join(this.versionsDir, f), 'utf-8');
      return JSON.parse(content);
    });
  }

  /**
   * Update version with training metrics
   */
  updateMetrics(version: number, metrics: TrainingMetrics): boolean {
    const versionData = this.getVersion(version);
    if (!versionData) {
      return false;
    }

    versionData.metrics = metrics;

    const versionFile = path.join(this.versionsDir, `v${version}.json`);
    fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));

    return true;
  }

  /**
   * Compare two versions
   */
  compareVersions(version1: number, version2: number): VersionComparison | null {
    const v1 = this.getVersion(version1);
    const v2 = this.getVersion(version2);

    if (!v1 || !v2) {
      return null;
    }

    // Calculate differences
    const augChanges: string[] = [];

    if (v1.augmentations.zoom !== v2.augmentations.zoom) {
      augChanges.push(`Zoom: ${v1.augmentations.zoom} → ${v2.augmentations.zoom}`);
    }
    if (v1.augmentations.lighting !== v2.augmentations.lighting) {
      augChanges.push(`Lighting: ${v1.augmentations.lighting} → ${v2.augmentations.lighting}`);
    }
    if (v1.augmentations.colorJitter !== v2.augmentations.colorJitter) {
      augChanges.push(`Color Jitter: ${v1.augmentations.colorJitter} → ${v2.augmentations.colorJitter}`);
    }
    if (v1.augmentations.shadows !== v2.augmentations.shadows) {
      augChanges.push(`Shadows: ${v1.augmentations.shadows} → ${v2.augmentations.shadows}`);
    }
    if (v1.augmentations.augmentationsPerBackground !== v2.augmentations.augmentationsPerBackground) {
      augChanges.push(`Aug/BG: ${v1.augmentations.augmentationsPerBackground} → ${v2.augmentations.augmentationsPerBackground}`);
    }

    // Background changes
    const bg1Set = new Set(v1.backgroundImages);
    const bg2Set = new Set(v2.backgroundImages);

    const added = v2.backgroundImages.filter(bg => !bg1Set.has(bg));
    const removed = v1.backgroundImages.filter(bg => !bg2Set.has(bg));

    return {
      version1: v1,
      version2: v2,
      differences: {
        sourceImages: v2.sourceImages - v1.sourceImages,
        totalImages: v2.totalImages - v1.totalImages,
        augmentationChanges: augChanges,
        backgroundChanges: { added, removed },
      },
    };
  }

  /**
   * Delete a version
   */
  deleteVersion(version: number): boolean {
    const versionFile = path.join(this.versionsDir, `v${version}.json`);
    if (!fs.existsSync(versionFile)) {
      return false;
    }

    fs.unlinkSync(versionFile);

    // Update latest if needed
    const latest = this.getLatestVersion();
    if (latest && latest.version === version) {
      const versions = this.listVersions();
      if (versions.length > 0) {
        const newLatest = Math.max(...versions.map(v => v.version));
        const latestFile = path.join(this.versionsDir, 'latest.json');
        fs.writeFileSync(latestFile, JSON.stringify({ version: newLatest }, null, 2));
      }
    }

    return true;
  }

  /**
   * Get version summary for display
   */
  getVersionSummary(version: number): string {
    const v = this.getVersion(version);
    if (!v) {
      return 'Version not found';
    }

    const lines = [
      `Version: v${v.version}`,
      `Created: ${new Date(v.created).toLocaleString()}`,
      `Product: ${v.productName}`,
      ``,
      `Source: ${v.sourceImages} images`,
      `Generated: ${v.totalImages} images (${v.trainImages} train, ${v.valImages} val)`,
      ``,
      `Segmentation: ${v.segmentationModel}`,
      `Backgrounds: ${v.backgroundImages.length}`,
      `Augmentations/BG: ${v.augmentations.augmentationsPerBackground}`,
      ``,
      `Enabled Augmentations:`,
      `  - Zoom: ${v.augmentations.zoom ? '✓' : '✗'}`,
      `  - Lighting: ${v.augmentations.lighting ? '✓' : '✗'}`,
      `  - Color Jitter: ${v.augmentations.colorJitter ? '✓' : '✗'}`,
      `  - Shadows: ${v.augmentations.shadows ? '✓' : '✗'}`,
      `  - Rotation: ${v.augmentations.rotation ? '✓' : '✗'}`,
    ];

    if (v.metrics) {
      lines.push('');
      lines.push('Training Metrics:');
      if (v.metrics.mAP50) lines.push(`  - mAP@50: ${(v.metrics.mAP50 * 100).toFixed(2)}%`);
      if (v.metrics.mAP5095) lines.push(`  - mAP@50-95: ${(v.metrics.mAP5095 * 100).toFixed(2)}%`);
      if (v.metrics.precision) lines.push(`  - Precision: ${(v.metrics.precision * 100).toFixed(2)}%`);
      if (v.metrics.recall) lines.push(`  - Recall: ${(v.metrics.recall * 100).toFixed(2)}%`);
    }

    return lines.join('\n');
  }
}
