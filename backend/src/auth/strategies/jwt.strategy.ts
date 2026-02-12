import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../database/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenBlacklistService } from '../token-blacklist/token-blacklist.service';

/**
 * JWT authentication strategy for protected routes
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Try to extract from httpOnly cookie first (more secure)
        (request) => request?.cookies?.accessToken,
        // Fallback to Authorization header (for backward compatibility and API clients)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get('auth.jwtSecret'),
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Check if token is blacklisted (logged out)
    if (payload.jti) {
      const [isTokenBlacklisted, isUserBlacklisted] = await Promise.all([
        this.tokenBlacklistService.isBlacklisted(payload.jti),
        this.tokenBlacklistService.isUserBlacklisted(payload.sub),
      ]);

      if (isTokenBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      if (isUserBlacklisted) {
        throw new UnauthorizedException('All user sessions have been invalidated');
      }
    }

    const user = await this.userRepository.findOne({
      where: {
        id: payload.sub,
        status: UserStatus.ACTIVE,
      },
      relations: ['workspace'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (user.isLocked) {
      throw new UnauthorizedException('Account is locked');
    }

    return user;
  }
}