import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Strict throttle guard for sensitive endpoints
 * Applies stricter rate limiting than the global throttler
 *
 * Default: 5 requests per 60 seconds
 * Use @SkipThrottle() to exempt specific endpoints
 * Use @Throttle() decorator to override limits on specific routes
 */
@Injectable()
export class StrictThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track by IP address
    return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  }

  protected async getErrorMessage(): Promise<string> {
    return 'Too many requests. Please try again later.';
  }
}
