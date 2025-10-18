/**
 * Jest setup for unit tests
 */

import { jest } from '@jest/globals';
import { setupTestEnvironment, testConfig } from './config/test.config';

// Set test timeout
jest.setTimeout(testConfig.timeouts.unit);

// Setup test environment
setupTestEnvironment('unit');

// Global test utilities
global.console = {
  ...console,
  // Suppress debug logs in tests
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error logs for debugging test failures
  error: console.error,
};

// Mock external services
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

jest.mock('@slack/bolt', () => ({
  App: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    message: jest.fn(),
    command: jest.fn(),
    event: jest.fn(),
  })),
}));

// Global test helpers
global.testConfig = testConfig;