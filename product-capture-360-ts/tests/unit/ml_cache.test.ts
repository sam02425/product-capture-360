/**
 * Unit Tests: ML Cache
 * Tests for the ML result caching system
 */

import { MLCache } from '../../src/ml_cache';
import { createMockCacheEntry, createMockDetection } from '../fixtures/mock-data';

describe('MLCache', () => {
  let cache: MLCache<any>;

  beforeEach(() => {
    // Create fresh cache for each test
    cache = new MLCache(100, 5); // 100 entries, 5 min TTL
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Basic Operations', () => {
    test('should store and retrieve data', () => {
      const params = { imagePath: '/test/image.jpg', model: 'yolov8n' };
      const data = [createMockDetection()];

      cache.set(params, data);
      const retrieved = cache.get(params);

      expect(retrieved).toEqual(data);
    });

    test('should return null for non-existent keys', () => {
      const params = { imagePath: '/nonexistent.jpg' };
      const result = cache.get(params);

      expect(result).toBeNull();
    });

    test('should handle complex parameters', () => {
      const params = {
        imagePath: '/test/image.jpg',
        model: 'yolov8n',
        confidence: 0.85,
        targetClass: 'bottle',
        nested: { key: 'value' }
      };
      const data = { result: 'test' };

      cache.set(params, data);
      const retrieved = cache.get(params);

      expect(retrieved).toEqual(data);
    });

    test('should generate consistent keys for same parameters', () => {
      const params1 = { a: 1, b: 2, c: 3 };
      const params2 = { c: 3, a: 1, b: 2 }; // Different order

      cache.set(params1, 'data1');
      const result = cache.get(params2);

      expect(result).toBe('data1'); // Should find data despite different param order
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should return cached data within TTL', () => {
      const params = { key: 'value' };
      const data = 'test-data';

      cache.set(params, data);

      // Immediately should be available
      expect(cache.get(params)).toBe(data);
    });

    test('should expire data after TTL', async () => {
      const shortCache = new MLCache(100, 0.01); // 0.01 minutes = 600ms
      const params = { key: 'value' };
      const data = 'test-data';

      shortCache.set(params, data);

      // Should be available immediately
      expect(shortCache.get(params)).toBe(data);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 700));

      // Should be expired
      expect(shortCache.get(params)).toBeNull();

      shortCache.clear();
    });

    test('should update access count on retrieval', () => {
      const params = { key: 'value' };
      cache.set(params, 'data');

      cache.get(params);
      cache.get(params);
      cache.get(params);

      const stats = cache.getStats();
      const entry = stats.entries[0];

      expect(entry.accessCount).toBe(3);
    });
  });

  describe('Size Management', () => {
    test('should enforce max size', () => {
      const smallCache = new MLCache(3, 60);

      smallCache.set({ key: '1' }, 'data1');
      smallCache.set({ key: '2' }, 'data2');
      smallCache.set({ key: '3' }, 'data3');

      expect(smallCache.getStats().size).toBe(3);

      // Adding 4th item should evict oldest
      smallCache.set({ key: '4' }, 'data4');

      expect(smallCache.getStats().size).toBe(3);
      expect(smallCache.get({ key: '1' })).toBeNull(); // Oldest should be evicted

      smallCache.clear();
    });

    test('should evict least recently used entry', () => {
      const smallCache = new MLCache(3, 60);

      smallCache.set({ key: '1' }, 'data1');
      smallCache.set({ key: '2' }, 'data2');
      smallCache.set({ key: '3' }, 'data3');

      // Access key '1' to make it more recent
      smallCache.get({ key: '1' });

      // Add 4th item - should evict key '2' (oldest unused)
      smallCache.set({ key: '4' }, 'data4');

      expect(smallCache.get({ key: '1' })).toBe('data1'); // Should still exist
      expect(smallCache.get({ key: '2' })).toBeNull(); // Should be evicted

      smallCache.clear();
    });
  });

  describe('has() Method', () => {
    test('should return true for existing non-expired entries', () => {
      const params = { key: 'value' };
      cache.set(params, 'data');

      expect(cache.has(params)).toBe(true);
    });

    test('should return false for non-existent entries', () => {
      expect(cache.has({ key: 'nonexistent' })).toBe(false);
    });

    test('should return false for expired entries', async () => {
      const shortCache = new MLCache(100, 0.01);
      const params = { key: 'value' };

      shortCache.set(params, 'data');
      expect(shortCache.has(params)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 700));
      expect(shortCache.has(params)).toBe(false);

      shortCache.clear();
    });
  });

  describe('clear() Method', () => {
    test('should remove all entries', () => {
      cache.set({ key: '1' }, 'data1');
      cache.set({ key: '2' }, 'data2');
      cache.set({ key: '3' }, 'data3');

      expect(cache.getStats().size).toBe(3);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get({ key: '1' })).toBeNull();
    });
  });

  describe('getStats() Method', () => {
    test('should return correct statistics', () => {
      cache.set({ key: '1' }, 'data1');
      cache.set({ key: '2' }, 'data2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
      expect(stats.ttlMinutes).toBe(5);
      expect(stats.entries).toHaveLength(2);
    });

    test('should include entry metadata', () => {
      cache.set({ key: 'test' }, 'data');
      cache.get({ key: 'test' }); // Access once

      const stats = cache.getStats();
      const entry = stats.entries[0];

      expect(entry).toHaveProperty('key');
      expect(entry).toHaveProperty('age');
      expect(entry).toHaveProperty('accessCount');
      expect(entry.accessCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty parameters', () => {
      cache.set({}, 'data');
      expect(cache.get({})).toBe('data');
    });

    test('should handle null values', () => {
      cache.set({ key: 'null' }, null);
      expect(cache.get({ key: 'null' })).toBeNull();
    });

    test('should handle undefined values', () => {
      cache.set({ key: 'undefined' }, undefined);
      expect(cache.get({ key: 'undefined' })).toBeUndefined();
    });

    test('should handle array values', () => {
      const arrayData = [1, 2, 3, 4, 5];
      cache.set({ key: 'array' }, arrayData);
      expect(cache.get({ key: 'array' })).toEqual(arrayData);
    });

    test('should handle nested object values', () => {
      const nestedData = {
        level1: {
          level2: {
            level3: 'deep value'
          }
        }
      };
      cache.set({ key: 'nested' }, nestedData);
      expect(cache.get({ key: 'nested' })).toEqual(nestedData);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple rapid sets', () => {
      for (let i = 0; i < 50; i++) {
        cache.set({ key: `rapid-${i}` }, `data-${i}`);
      }

      expect(cache.getStats().size).toBe(50);
    });

    test('should handle multiple rapid gets', () => {
      cache.set({ key: 'rapid' }, 'data');

      for (let i = 0; i < 100; i++) {
        expect(cache.get({ key: 'rapid' })).toBe('data');
      }

      const stats = cache.getStats();
      expect(stats.entries[0].accessCount).toBe(100);
    });
  });
});
