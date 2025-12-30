/// <reference types="node" />
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';

export interface StorageDevice {
  device: string;
  mountpoint: string;
  free_gb?: number;
}

export interface FolderCollisionInfo {
  exists: boolean;
  path: string;
  imageCount: number;
  totalSize: number;
}

export interface DiskSpaceInfo {
  available: boolean;
  free_bytes: number;
  free_gb: number;
  path: string;
}

export class StorageManager {
  currentPath: string | null = null;
  rootFolderName = '360Photo_Captures';
  private sequenceCounter = 0;
  private lastTimestamp = '';
  private readonly MIN_FREE_SPACE_GB = 1.0; // Minimum 1GB free space required

  /**
   * Check if a folder exists and count images inside it
   * Production-grade collision detection
   */
  checkFolderCollision = (targetPath: string): FolderCollisionInfo => {
    const info: FolderCollisionInfo = {
      exists: false,
      path: targetPath,
      imageCount: 0,
      totalSize: 0,
    };

    try {
      if (!fs.existsSync(targetPath)) {
        return info;
      }

      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return info;
      }

      info.exists = true;

      // Count images and calculate total size
      const entries = fs.readdirSync(targetPath);
      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry);
        try {
          const entryStat = fs.statSync(fullPath);
          if (entryStat.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(entry)) {
            info.imageCount++;
            info.totalSize += entryStat.size;
          }
        } catch {
          // Skip files we can't read
        }
      }
    } catch {
      // If we can't read the folder, treat as not existing
      info.exists = false;
    }

    return info;
  };

  /**
   * Check for existing images with the same product name
   * Used during session start to detect product-specific collisions
   */
  checkProductCollision = (productName: string): FolderCollisionInfo => {
    const info: FolderCollisionInfo = {
      exists: false,
      path: this.currentPath || '',
      imageCount: 0,
      totalSize: 0,
    };

    if (!this.currentPath) {
      return info;
    }

    try {
      if (!fs.existsSync(this.currentPath)) {
        return info;
      }

      // Look for files matching the product name pattern: {productName}_capture_*.jpg
      const pattern = new RegExp(`^${productName}_capture_.*\\.(jpg|jpeg|png|webp)$`, 'i');
      const entries = fs.readdirSync(this.currentPath);

      for (const entry of entries) {
        if (pattern.test(entry)) {
          info.exists = true;
          const fullPath = path.join(this.currentPath, entry);
          try {
            const entryStat = fs.statSync(fullPath);
            if (entryStat.isFile()) {
              info.imageCount++;
              info.totalSize += entryStat.size;
            }
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // If we can't read the folder, treat as not existing
      info.exists = false;
    }

    return info;
  };

  /**
   * Check available disk space at given path
   * Production-grade disk space validation
   */
  checkDiskSpace = (targetPath: string): DiskSpaceInfo => {
    const info: DiskSpaceInfo = {
      available: false,
      free_bytes: 0,
      free_gb: 0,
      path: targetPath,
    };

    try {
      // Use statfs to get filesystem stats (macOS/Linux)
      const { execSync } = require('child_process');
      const parentDir = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);

      if (process.platform === 'darwin' || process.platform === 'linux') {
        const output = execSync(`df -k "${parentDir}"`, { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          const availableKB = parseInt(parts[3], 10);
          info.free_bytes = availableKB * 1024;
          info.free_gb = info.free_bytes / (1024 * 1024 * 1024);
          info.available = info.free_gb >= this.MIN_FREE_SPACE_GB;
        }
      } else if (process.platform === 'win32') {
        // Windows implementation
        const drive = path.parse(parentDir).root;
        const output = execSync(`fsutil volume diskfree "${drive}"`, { encoding: 'utf8' });
        const match = output.match(/Total # of free bytes\s+:\s+(\d+)/);
        if (match) {
          info.free_bytes = parseInt(match[1], 10);
          info.free_gb = info.free_bytes / (1024 * 1024 * 1024);
          info.available = info.free_gb >= this.MIN_FREE_SPACE_GB;
        }
      }
    } catch {
      // If we can't determine disk space, assume unavailable
      info.available = false;
    }

    return info;
  };

  listDevices = (): StorageDevice[] => {
    const devices: StorageDevice[] = [];
    if (process.platform === 'darwin') {
      const volPath = '/Volumes';
      if (fs.existsSync(volPath)) {
        for (const entry of fs.readdirSync(volPath)) {
          const mp = path.join(volPath, entry);
          try {
            const stat = fs.statSync(mp);
            if (stat.isDirectory()) {
              devices.push({ device: entry, mountpoint: mp });
            }
          } catch {}
        }
      }
    }
    // Common paths
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    devices.push({ device: 'Home', mountpoint: home });
    devices.push({ device: 'Workspace', mountpoint: process.cwd() });
    return devices;
  };

  setLocation = (basePath: string): [boolean, string] => {
    try {
      // If path already ends with rootFolderName, don't add it again
      const target = basePath.endsWith(this.rootFolderName)
        ? basePath
        : path.join(basePath, this.rootFolderName);

      // Production-grade disk space validation
      const diskSpace = this.checkDiskSpace(target);
      if (!diskSpace.available) {
        return [
          false,
          `❌ INSUFFICIENT DISK SPACE: Only ${diskSpace.free_gb.toFixed(2)} GB available at "${target}"\n` +
          `   💾 Minimum ${this.MIN_FREE_SPACE_GB} GB required for safe operation\n` +
          `   💡 Please free up space or choose a different location`
        ];
      }

      // Create directory and validate it's writable
      fs.mkdirSync(target, { recursive: true });

      // Test write permissions by creating and deleting a test file
      const testFile = path.join(target, '.write_test');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (e: any) {
        return [
          false,
          `❌ PERMISSION DENIED: Cannot write to "${target}"\n` +
          `   🔒 Error: ${e?.message || 'Unknown error'}\n` +
          `   💡 Check folder permissions or choose a different location`
        ];
      }

      this.currentPath = target;
      return [true, `✅ Storage ready: ${target} (${diskSpace.free_gb.toFixed(2)} GB free)`];
    } catch (e: any) {
      return [false, `❌ Failed to set storage: ${e?.message || 'Unknown error'}`];
    }
  };

  /**
   * Generate high-resolution timestamp with milliseconds and sequence number
   * Prevents collisions even at 180/min (3 FPS)
   * Format: YYYYMMDD_HHMMSSmmm_SEQ (e.g., 20250129_143025123_001)
   */
  private generateTimestamp = (): string => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 17); // YYYYMMDDHHMMSSmmm

    // If same millisecond, increment sequence counter
    if (timestamp === this.lastTimestamp) {
      this.sequenceCounter++;
    } else {
      this.lastTimestamp = timestamp;
      this.sequenceCounter = 0;
    }

    // Format: YYYYMMDD_HHMMSSmmm_SEQ
    const datepart = timestamp.slice(0, 8);
    const timepart = timestamp.slice(8, 17);
    const seq = this.sequenceCounter.toString().padStart(3, '0');
    return `${datepart}_${timepart}_${seq}`;
  };

  saveImage = (jpg: Buffer, productName?: string, highRes?: boolean): [boolean, string] => {
    if (!this.currentPath) return [false, 'No storage selected'];
    try {
      // Create product-specific subfolder if productName is provided
      let targetPath = this.currentPath;
      if (productName) {
        const sanitizedName = productName.replace(/\s+/g, '_');
        targetPath = path.join(this.currentPath, sanitizedName);

        // Create folder if it doesn't exist
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
      }

      const ts = this.generateTimestamp();
      const namePart = productName ? productName.replace(/\s+/g, '_') + '_' : '';
      const resPart = highRes ? 'hires_' : '';
      const fname = `${namePart}${resPart}capture_${ts}.jpg`;
      const fpath = path.join(targetPath, fname);
      fs.writeFileSync(fpath, jpg);
      return [true, fpath];
    } catch (e: any) {
      return [false, e?.message || 'Failed to save'];
    }
  };

  saveImageAsync = async (jpg: Buffer, productName?: string, highRes?: boolean): Promise<[boolean, string]> => {
    if (!this.currentPath) return [false, 'No storage selected'];
    try {
      // Create product-specific subfolder if productName is provided
      let targetPath = this.currentPath;
      if (productName) {
        const sanitizedName = productName.replace(/\s+/g, '_');
        targetPath = path.join(this.currentPath, sanitizedName);

        // Create folder if it doesn't exist
        if (!fs.existsSync(targetPath)) {
          await fsPromises.mkdir(targetPath, { recursive: true });
        }
      }

      const ts = this.generateTimestamp();
      const namePart = productName ? productName.replace(/\s+/g, '_') + '_' : '';
      const resPart = highRes ? 'hires_' : '';
      const fname = `${namePart}${resPart}capture_${ts}.jpg`;
      const fpath = path.join(targetPath, fname);
      await fsPromises.writeFile(fpath, jpg);
      return [true, fpath];
    } catch (e: any) {
      return [false, e?.message || 'Failed to save'];
    }
  };

  listFolder = (p?: string) => {
    const base = p || this.currentPath || process.cwd();
    const items = [] as { name: string; is_dir: boolean; size?: number; }[];
    let parent: string | null = null;
    try {
      const stat = fs.statSync(base);
      if (!stat.isDirectory()) throw new Error('Path is not a directory');
      parent = path.dirname(base);
      for (const entry of fs.readdirSync(base)) {
        const fp = path.join(base, entry);
        const st = fs.statSync(fp);
        items.push({ name: entry, is_dir: st.isDirectory(), size: st.isFile() ? st.size : undefined });
      }
    } catch (e) {}
    return { path: base, parent, items };
  };
}