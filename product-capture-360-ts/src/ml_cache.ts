import crypto from 'crypto';
import { logger } from './logger';

/**
 * ML Model Result Cache
 *
 * In-memory cache for expensive ML operations (YOLO, SAM2)
 * Reduces redundant processing of the same images
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

export class MLCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize: number = 1000, ttlMinutes: number = 60) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;

    // Clean expired entries every 5 minutes
    setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(params: Record<string, any>): string {
    const sorted = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(sorted))
      .digest('hex');

    return hash;
  }

  /**
   * Get cached result
   */
  get(params: Record<string, any>): T | null {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      logger.debug('Cache entry expired', { key });
      return null;
    }

    // Update access count
    entry.accessCount++;
    logger.debug('Cache hit', { key, accessCount: entry.accessCount });

    return entry.data;
  }

  /**
   * Set cache entry
   */
  set(params: Record<string, any>, data: T): void {
    const key = this.generateKey(params);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 0
    });

    logger.debug('Cache set', { key, cacheSize: this.cache.size });
  }

  /**
   * Check if key exists in cache
   */
  has(params: Record<string, any>): boolean {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMinutes: number;
    entries: Array<{ key: string; age: number; accessCount: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Math.round((Date.now() - entry.timestamp) / 1000 / 60), // minutes
      accessCount: entry.accessCount
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMinutes: this.ttl / 60 / 1000,
      entries
    };
  }

  /**
   * Remove expired entries
   */
  private cleanExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned expired cache entries', { removed, remaining: this.cache.size });
    }
  }

  /**
   * Evict oldest entry (LRU-like)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Evicted oldest cache entry', { key: oldestKey });
    }
  }
}

// Singleton instances for different model types
export const yoloCache = new MLCache<any>(500, 30); // 500 entries, 30 min TTL
export const sam2Cache = new MLCache<any>(200, 60); // 200 entries, 60 min TTL (SAM2 is more expensive)
export const rembgCache = new MLCache<any>(300, 45); // 300 entries, 45 min TTL
