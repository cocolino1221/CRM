import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-platform-admin-key'];
    const secret = this.configService.get<string>('PLATFORM_ADMIN_KEY');

    if (!secret) {
      throw new ForbiddenException('Platform admin key not configured');
    }
    if (!key || key !== secret) {
      throw new ForbiddenException('Invalid platform admin key');
    }
    return true;
  }
}
