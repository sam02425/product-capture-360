/// <reference types="node" />
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';

export interface StorageDevice {
  device: string;
  mountpoint: string;
  free_gb?: number;
}

export class StorageManager {
  currentPath: string | null = null;
  rootFolderName = '360Photo_Captures';

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
      fs.mkdirSync(target, { recursive: true });
      this.currentPath = target;
      return [true, target];
    } catch (e: any) {
      return [false, e?.message || 'Failed to set storage'];
    }
  };

  saveImage = (jpg: Buffer, productName?: string, highRes?: boolean): [boolean, string] => {
    if (!this.currentPath) return [false, 'No storage selected'];
    try {
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      const namePart = productName ? productName.replace(/\s+/g, '_') + '_' : '';
      const resPart = highRes ? 'hires_' : '';
      const fname = `${namePart}${resPart}capture_${ts}.jpg`;
      const fpath = path.join(this.currentPath, fname);
      fs.writeFileSync(fpath, jpg);
      return [true, fpath];
    } catch (e: any) {
      return [false, e?.message || 'Failed to save'];
    }
  };

  saveImageAsync = async (jpg: Buffer, productName?: string, highRes?: boolean): Promise<[boolean, string]> => {
    if (!this.currentPath) return [false, 'No storage selected'];
    try {
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      const namePart = productName ? productName.replace(/\s+/g, '_') + '_' : '';
      const resPart = highRes ? 'hires_' : '';
      const fname = `${namePart}${resPart}capture_${ts}.jpg`;
      const fpath = path.join(this.currentPath, fname);
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