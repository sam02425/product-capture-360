/**
 * Unit Tests: Validation
 * Tests for input validation using Zod schemas
 */

import {
  PathSchema,
  ProductNameSchema,
  BatchAnnotationOptionsSchema,
  validate,
  safeParse
} from '../../src/validation';

describe('Validation Schemas', () => {
  describe('PathSchema', () => {
    test('should accept valid absolute paths', () => {
      const validPaths = [
        '/Users/test/images',
        '/tmp/test',
        '/var/log/app',
        '/home/user/documents'
      ];

      validPaths.forEach(path => {
        expect(() => PathSchema.parse(path)).not.toThrow();
      });
    });

    test('should reject paths with .. (directory traversal)', () => {
      const invalidPaths = [
        '../../../etc/passwd',
        '/users/test/../../../etc',
        '/tmp/./../../root'
      ];

      invalidPaths.forEach(path => {
        expect(() => PathSchema.parse(path)).toThrow();
      });
    });

    test('should reject relative paths', () => {
      const relativePaths = [
        'relative/path',
        './relative',
        'test/path'
      ];

      relativePaths.forEach(path => {
        expect(() => PathSchema.parse(path)).toThrow();
      });
    });

    test('should reject empty paths', () => {
      expect(() => PathSchema.parse('')).toThrow();
    });
  });

  describe('ProductNameSchema', () => {
    test('should accept valid product names', () => {
      const validNames = [
        'Test Product',
        'Product123',
        'My-Product_v2',
        'PRODUCT NAME'
      ];

      validNames.forEach(name => {
        expect(() => ProductNameSchema.parse(name)).not.toThrow();
      });
    });

    test('should reject names with special characters', () => {
      const invalidNames = [
        '<script>alert(1)</script>',
        'Product & Co',
        'Test@Product',
        'Name$Value',
        'Test\\Product'
      ];

      invalidNames.forEach(name => {
        expect(() => ProductNameSchema.parse(name)).toThrow();
      });
    });

    test('should reject empty names', () => {
      expect(() => ProductNameSchema.parse('')).toThrow();
    });

    test('should reject names longer than 100 characters', () => {
      const longName = 'a'.repeat(101);
      expect(() => ProductNameSchema.parse(longName)).toThrow();
    });

    test('should accept names up to 100 characters', () => {
      const maxName = 'a'.repeat(100);
      expect(() => ProductNameSchema.parse(maxName)).not.toThrow();
    });
  });

  describe('BatchAnnotationOptionsSchema', () => {
    const validOptions = {
      folderPath: '/Users/test/images',
      engine: 'yolo' as const,
      model: 'yolov8n',
      confidence: 0.75,
      targetClass: 'bottle',
      labelName: 'Product'
    };

    test('should accept valid batch annotation options', () => {
      expect(() => BatchAnnotationOptionsSchema.parse(validOptions)).not.toThrow();
    });

    test('should accept minimal options (required fields only)', () => {
      const minimalOptions = {
        folderPath: '/Users/test/images',
        engine: 'yolo' as const
      };

      expect(() => BatchAnnotationOptionsSchema.parse(minimalOptions)).not.toThrow();
    });

    test('should reject invalid engine', () => {
      const invalidOptions = {
        ...validOptions,
        engine: 'invalid-engine'
      };

      expect(() => BatchAnnotationOptionsSchema.parse(invalidOptions)).toThrow();
    });

    test('should reject confidence outside 0-1 range', () => {
      const options1 = { ...validOptions, confidence: -0.1 };
      const options2 = { ...validOptions, confidence: 1.5 };

      expect(() => BatchAnnotationOptionsSchema.parse(options1)).toThrow();
      expect(() => BatchAnnotationOptionsSchema.parse(options2)).toThrow();
    });

    test('should accept confidence at boundaries', () => {
      const options1 = { ...validOptions, confidence: 0 };
      const options2 = { ...validOptions, confidence: 1 };

      expect(() => BatchAnnotationOptionsSchema.parse(options1)).not.toThrow();
      expect(() => BatchAnnotationOptionsSchema.parse(options2)).not.toThrow();
    });

    test('should reject invalid folderPath', () => {
      const invalidOptions = {
        ...validOptions,
        folderPath: '../../../etc/passwd'
      };

      expect(() => BatchAnnotationOptionsSchema.parse(invalidOptions)).toThrow();
    });

    test('should accept SAM2 engine', () => {
      const sam2Options = {
        ...validOptions,
        engine: 'sam2' as const
      };

      expect(() => BatchAnnotationOptionsSchema.parse(sam2Options)).not.toThrow();
    });
  });

  describe('validate() Helper', () => {
    test('should return parsed data on success', () => {
      const input = '/Users/test/path';
      const result = validate(PathSchema, input);

      expect(result).toBe(input);
    });

    test('should throw error on validation failure', () => {
      const invalid = '../invalid/path';

      expect(() => validate(PathSchema, invalid)).toThrow();
    });

    test('should work with complex schemas', () => {
      const options = {
        folderPath: '/Users/test/images',
        engine: 'yolo' as const,
        confidence: 0.85
      };

      const result = validate(BatchAnnotationOptionsSchema, options);

      expect(result.folderPath).toBe(options.folderPath);
      expect(result.engine).toBe(options.engine);
    });
  });

  describe('safeParse() Helper', () => {
    test('should return success object on valid data', () => {
      const input = '/Users/test/path';
      const result = safeParse(PathSchema, input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(input);
      }
    });

    test('should return error object on invalid data', () => {
      const invalid = '../invalid/path';
      const result = safeParse(PathSchema, invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.issues).toBeDefined();
      }
    });

    test('should not throw on validation failure', () => {
      const invalid = '<script>alert(1)</script>';

      expect(() => safeParse(ProductNameSchema, invalid)).not.toThrow();
    });
  });

  describe('Security Tests', () => {
    test('should block SQL injection attempts', () => {
      const sqlInjection = "'; DROP TABLE users; --";

      expect(() => ProductNameSchema.parse(sqlInjection)).toThrow();
    });

    test('should block XSS attempts', () => {
      const xssAttempts = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<svg/onload=alert(1)>'
      ];

      xssAttempts.forEach(xss => {
        expect(() => ProductNameSchema.parse(xss)).toThrow();
      });
    });

    test('should block path traversal attempts', () => {
      const traversalAttempts = [
        '../../../../etc/passwd',
        '/etc/../etc/passwd',
        'C:\\Windows\\..\\..\\sensitive',
        '/tmp/./../../root/.ssh'
      ];

      traversalAttempts.forEach(path => {
        expect(() => PathSchema.parse(path)).toThrow();
      });
    });

    test('should block command injection attempts', () => {
      const commandInjection = [
        'test; rm -rf /',
        'test`whoami`',
        'test$(whoami)',
        'test|cat /etc/passwd'
      ];

      commandInjection.forEach(cmd => {
        expect(() => ProductNameSchema.parse(cmd)).toThrow();
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle Unicode characters in product names', () => {
      const unicodeNames = [
        'Product 日本語',
        'Tëst Prödüct',
        'Продукт'
      ];

      unicodeNames.forEach(name => {
        // Should fail because regex only allows alphanumeric, spaces, hyphens, underscores
        expect(() => ProductNameSchema.parse(name)).toThrow();
      });
    });

    test('should handle very long paths', () => {
      const longPath = '/Users/' + 'a'.repeat(1000) + '/test';

      expect(() => PathSchema.parse(longPath)).not.toThrow();
    });

    test('should handle null and undefined', () => {
      expect(() => PathSchema.parse(null)).toThrow();
      expect(() => PathSchema.parse(undefined)).toThrow();
    });

    test('should handle numbers as input', () => {
      expect(() => PathSchema.parse(123 as any)).toThrow();
    });

    test('should handle objects as input', () => {
      expect(() => PathSchema.parse({ path: '/test' } as any)).toThrow();
    });
  });
});
