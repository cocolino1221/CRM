import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = this.extractHeaderValue(request.headers['x-platform-admin-key']);
    const platformSecret = this.configService.get<string>('PLATFORM_ADMIN_KEY') || '';

    // Allow platform admin key auth for owner tooling.
    if (platformSecret && key && key === platformSecret) {
      return true;
    }

    // Also allow authenticated SUPER_ADMIN users from dashboard/API clients.
    const jwtUser = await this.validateSuperAdminJwt(request);
    if (jwtUser) {
      request.user = jwtUser;
      return true;
    }

    throw new ForbiddenException('Invalid platform admin credentials');
  }

  private extractHeaderValue(raw: unknown): string {
    if (Array.isArray(raw)) return String(raw[0] || '').trim();
    return String(raw || '').trim();
  }

  private extractJwtToken(request: any): string {
    const cookieToken = String(request?.cookies?.accessToken || '').trim();
    if (cookieToken) return cookieToken;

    const authHeader = String(request?.headers?.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }

    return '';
  }

  private async validateSuperAdminJwt(request: any): Promise<User | null> {
    const token = this.extractJwtToken(request);
    if (!token) return null;

    const jwtSecret = this.configService.get<string>('auth.jwtSecret');
    if (!jwtSecret) return null;

    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      if (!payload?.sub) return null;

      const user = await this.userRepository.findOne({
        where: {
          id: payload.sub,
          status: UserStatus.ACTIVE,
        },
        relations: ['workspace'],
      });

      if (!user || user.isLocked) return null;
      if (user.role !== UserRole.SUPER_ADMIN) return null;
      return user;
    } catch {
      return null;
    }
  }
}
