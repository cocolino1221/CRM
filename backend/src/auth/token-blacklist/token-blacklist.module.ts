import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';

/**
 * Token Blacklist Module
 *
 * Provides token revocation functionality using Redis.
 * Import this module in AuthModule to enable logout token invalidation.
 */
@Module({
  imports: [ConfigModule],
  providers: [TokenBlacklistService],
  exports: [TokenBlacklistService],
})
export class TokenBlacklistModule {}
