import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Token Blacklist Service
 *
 * Manages a Redis-based blacklist for invalidated JWT tokens.
 * Gracefully degrades when Redis is unavailable (skips blacklist checks).
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private redis: Redis | null = null;
  private redisAvailable = false;
  private readonly keyPrefix = 'token:blacklist:';

  constructor(private configService: ConfigService) {
    const redisHost = this.configService.get<string>('REDIS_HOST', '');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    const redisDb = this.configService.get<number>('REDIS_DB', 0);

    // Only connect to Redis if REDIS_HOST is explicitly configured
    if (!redisHost || redisHost === 'localhost' || redisHost === '127.0.0.1') {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      if (nodeEnv === 'production') {
        this.logger.warn(
          'Redis not configured (REDIS_HOST not set). Token blacklist disabled. ' +
          'Set REDIS_HOST to enable token revocation (e.g., Upstash Redis).'
        );
        return;
      }
    }

    if (!redisHost) {
      this.logger.warn('Redis not configured. Token blacklist disabled.');
      return;
    }

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
      db: redisDb,
      retryStrategy: (times) => {
        if (times > 5) {
          this.logger.warn('Redis connection failed after 5 retries. Token blacklist disabled.');
          this.redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      },
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      this.redisAvailable = true;
      this.logger.log('Connected to Redis for token blacklist');
    });

    this.redis.on('error', (error) => {
      this.redisAvailable = false;
      this.logger.warn(`Redis unavailable: ${error.message}. Token blacklist disabled.`);
    });

    // Attempt connection (non-blocking)
    this.redis.connect().catch(() => {
      this.redisAvailable = false;
    });
  }

  async blacklistToken(jti: string, expiresIn: number, reason: string = 'logout'): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    try {
      const key = `${this.keyPrefix}${jti}`;
      const value = JSON.stringify({ blacklistedAt: new Date().toISOString(), reason });
      await this.redis.setex(key, expiresIn, value);
      this.logger.log(`Token ${jti} blacklisted for ${expiresIn}s (reason: ${reason})`);
    } catch (error) {
      this.logger.error(`Failed to blacklist token ${jti}:`, error);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    if (!this.redis || !this.redisAvailable) return false; // No Redis = no blacklist

    try {
      const key = `${this.keyPrefix}${jti}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check blacklist for token ${jti}:`, error);
      return false; // Fail open when Redis errors
    }
  }

  async blacklistUserTokens(userId: string, expiresIn: number): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    try {
      const key = `${this.keyPrefix}user:${userId}`;
      const value = JSON.stringify({ blacklistedAt: new Date().toISOString(), reason: 'logout_all_devices' });
      await this.redis.setex(key, expiresIn, value);
      this.logger.log(`All tokens for user ${userId} blacklisted for ${expiresIn}s`);
    } catch (error) {
      this.logger.error(`Failed to blacklist user ${userId} tokens:`, error);
    }
  }

  async isUserBlacklisted(userId: string): Promise<boolean> {
    if (!this.redis || !this.redisAvailable) return false; // No Redis = no blacklist

    try {
      const key = `${this.keyPrefix}user:${userId}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check user blacklist for ${userId}:`, error);
      return false; // Fail open when Redis errors
    }
  }

  async removeFromBlacklist(jti: string): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    try {
      const key = `${this.keyPrefix}${jti}`;
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to remove token ${jti} from blacklist:`, error);
    }
  }

  async getStats(): Promise<{ totalBlacklisted: number; userBlacklisted: number }> {
    if (!this.redis || !this.redisAvailable) return { totalBlacklisted: 0, userBlacklisted: 0 };

    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const userKeys = keys.filter(key => key.includes(':user:'));
      return { totalBlacklisted: keys.length, userBlacklisted: userKeys.length };
    } catch {
      return { totalBlacklisted: 0, userBlacklisted: 0 };
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
