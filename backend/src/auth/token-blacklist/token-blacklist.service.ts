import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Token Blacklist Service
 *
 * Manages a Redis-based blacklist for invalidated JWT tokens.
 * When a user logs out or their token needs to be revoked,
 * the token's JTI (JWT ID) is added to the blacklist with a TTL
 * matching the token's expiration time.
 *
 * This prevents logged-out or compromised tokens from being used
 * even if they haven't expired yet.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'token:blacklist:';

  constructor(private configService: ConfigService) {
    // Initialize Redis connection
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
      db: redisDb,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for token blacklist');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  /**
   * Add a token to the blacklist
   *
   * @param jti - JWT ID (unique identifier for the token)
   * @param expiresIn - Time until token expires (in seconds)
   * @param reason - Optional reason for blacklisting (e.g., 'logout', 'security')
   */
  async blacklistToken(
    jti: string,
    expiresIn: number,
    reason: string = 'logout'
  ): Promise<void> {
    try {
      const key = `${this.keyPrefix}${jti}`;
      const value = JSON.stringify({
        blacklistedAt: new Date().toISOString(),
        reason,
      });

      // Set with TTL matching token expiration
      // After the token expires naturally, it will be removed from Redis
      await this.redis.setex(key, expiresIn, value);

      this.logger.log(`Token ${jti} blacklisted for ${expiresIn}s (reason: ${reason})`);
    } catch (error) {
      this.logger.error(`Failed to blacklist token ${jti}:`, error);
      throw new Error('Failed to blacklist token');
    }
  }

  /**
   * Check if a token is blacklisted
   *
   * @param jti - JWT ID to check
   * @returns true if token is blacklisted, false otherwise
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const key = `${this.keyPrefix}${jti}`;
      const exists = await this.redis.exists(key);

      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check blacklist for token ${jti}:`, error);
      // On Redis failure, reject the token (fail closed for security)
      return true;
    }
  }

  /**
   * Blacklist all tokens for a specific user
   *
   * This is useful for:
   * - "Logout from all devices" functionality
   * - Security incidents requiring immediate revocation
   * - Account compromise response
   *
   * @param userId - User ID whose tokens should be blacklisted
   * @param expiresIn - Maximum token expiration time (use longest possible token TTL)
   */
  async blacklistUserTokens(userId: string, expiresIn: number): Promise<void> {
    try {
      const key = `${this.keyPrefix}user:${userId}`;
      const value = JSON.stringify({
        blacklistedAt: new Date().toISOString(),
        reason: 'logout_all_devices',
      });

      // Store user-level blacklist entry
      await this.redis.setex(key, expiresIn, value);

      this.logger.log(`All tokens for user ${userId} blacklisted for ${expiresIn}s`);
    } catch (error) {
      this.logger.error(`Failed to blacklist user ${userId} tokens:`, error);
      throw new Error('Failed to blacklist user tokens');
    }
  }

  /**
   * Check if all of a user's tokens are blacklisted
   *
   * @param userId - User ID to check
   * @returns true if user has been logged out from all devices
   */
  async isUserBlacklisted(userId: string): Promise<boolean> {
    try {
      const key = `${this.keyPrefix}user:${userId}`;
      const exists = await this.redis.exists(key);

      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check user blacklist for ${userId}:`, error);
      // On Redis failure, reject (fail closed for security)
      return true;
    }
  }

  /**
   * Remove a token from the blacklist (rarely needed)
   *
   * @param jti - JWT ID to remove
   */
  async removeFromBlacklist(jti: string): Promise<void> {
    try {
      const key = `${this.keyPrefix}${jti}`;
      await this.redis.del(key);

      this.logger.log(`Token ${jti} removed from blacklist`);
    } catch (error) {
      this.logger.error(`Failed to remove token ${jti} from blacklist:`, error);
      throw new Error('Failed to remove token from blacklist');
    }
  }

  /**
   * Get blacklist statistics
   *
   * @returns Object containing blacklist metrics
   */
  async getStats(): Promise<{ totalBlacklisted: number; userBlacklisted: number }> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const userKeys = keys.filter(key => key.includes(':user:'));

      return {
        totalBlacklisted: keys.length,
        userBlacklisted: userKeys.length,
      };
    } catch (error) {
      this.logger.error('Failed to get blacklist stats:', error);
      return { totalBlacklisted: 0, userBlacklisted: 0 };
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }
}
