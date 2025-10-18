import { SetMetadata } from '@nestjs/common';

/**
 * Public decorator to mark routes as accessible without authentication
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);