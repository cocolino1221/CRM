/**
 * Jest setup for E2E tests
 */

import { DataSource } from 'typeorm';
import { jest } from '@jest/globals';
import { setupTestEnvironment, testConfig } from './config/test.config';
import { createTestDatabase, cleanDatabase, waitForDatabase } from './utils/database';

// Set test timeout for E2E tests
jest.setTimeout(testConfig.timeouts.e2e);

// Setup test environment
setupTestEnvironment('e2e');

// Global test database connection
let dataSource: DataSource;

// Setup database before all tests
beforeAll(async () => {
  try {
    dataSource = await createTestDatabase();
    await waitForDatabase(dataSource);
    console.log('✅ Test database connected successfully');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    process.exit(1);
  }
});

// Cleanup database after all tests
afterAll(async () => {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    console.log('✅ Test database connection closed');
  }
});

// Clean up database before each test
beforeEach(async () => {
  if (dataSource && dataSource.isInitialized) {
    await cleanDatabase(dataSource);
  }
});

// Global error handlers for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in tests, just log
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit in tests, just log
});

// Mock external services for E2E tests
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

export { dataSource };