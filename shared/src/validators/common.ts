import { z } from 'zod';

/**
 * Common validation schemas using Zod
 */

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['ASC', 'DESC']).default('ASC'),
});

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().max(255);

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  .optional();

export const urlSchema = z.string().url().max(2048);

export const customFieldsSchema = z.record(z.string(), z.any());

export const tagsSchema = z.array(z.string().max(50)).max(20);

export const currencySchema = z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);

export const timestampSchema = z.string().datetime();

// Common field validations
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters');

export const descriptionSchema = z
  .string()
  .max(5000, 'Description must be less than 5000 characters')
  .optional();

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(255, 'Title must be less than 255 characters');

// ID validation
export const createIdSchema = (name: string) =>
  z.string().uuid(`${name} ID must be a valid UUID`);