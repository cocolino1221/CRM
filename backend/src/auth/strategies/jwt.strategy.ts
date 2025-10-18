import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../database/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JWT authentication strategy for protected routes
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('auth.jwtSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
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