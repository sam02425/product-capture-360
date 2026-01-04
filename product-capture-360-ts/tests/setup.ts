/**
 * Jest Test Setup
 * Global configuration and utilities for all tests
 */

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '5003'; // Use different port for tests

// Suppress console output during tests (optional)
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: console.error, // Keep errors visible
};

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        sleep: (ms: number) => Promise<void>;
        randomString: (length?: number) => string;
      };
    }
  }
}

global.testUtils = {
  /**
   * Sleep utility for async tests
   */
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate random string for test data
   */
  randomString: (length: number = 10) => {
    return Math.random().toString(36).substring(2, length + 2);
  }
};

// Cleanup after all tests
afterAll(async () => {
  // Add any global cleanup here
  await new Promise(resolve => setTimeout(resolve, 100));
});
