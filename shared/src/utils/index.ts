/**
 * Shared utility functions
 */

import { randomBytes } from 'crypto';

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number = 32): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = generateRandomString(8);
  return `${timestamp}-${random}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoffFactor?: number;
    maxDelay?: number;
  } = {},
): Promise<T> {
  const { retries = 3, delay = 1000, backoffFactor = 2, maxDelay = 30000 } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === retries) {
        break;
      }

      const currentDelay = Math.min(delay * Math.pow(backoffFactor, attempt), maxDelay);
      await sleep(currentDelay);
    }
  }

  throw lastError!;
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key as keyof T] = deepMerge(targetValue as Record<string, any>, sourceValue as Record<string, any>) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Check if value is a plain object
 */
function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sanitize string for logging (remove sensitive data)
 */
export function sanitizeForLogging(str: string): string {
  return str
    .replace(/password['":\s]*['"]\w+['"]/gi, 'password:"***"')
    .replace(/token['":\s]*['"]\w+['"]/gi, 'token:"***"')
    .replace(/secret['":\s]*['"]\w+['"]/gi, 'secret:"***"')
    .replace(/key['":\s]*['"]\w+['"]/gi, 'key:"***"');
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

/**
 * Generate slug from string
 */
export function generateSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number = 100): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

/**
 * Parse pagination parameters
 */
export function parsePaginationParams(query: any): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}