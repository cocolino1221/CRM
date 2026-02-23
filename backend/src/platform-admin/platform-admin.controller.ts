import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PlatformAdminService } from './platform-admin.service';

@ApiTags('Platform Admin')
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(
    private readonly configService: ConfigService,
    private readonly platformAdminService: PlatformAdminService,
  ) {}

  @Public()
  @Get('overview')
  @ApiOperation({ summary: 'Platform owner overview for all SaaS companies (header key required)' })
  async getOverview(@Headers('x-platform-admin-key') key?: string) {
    const expected = String(this.configService.get<string>('PLATFORM_ADMIN_KEY') || '').trim();
    if (!expected || key !== expected) {
      throw new ForbiddenException('Invalid platform admin key');
    }
    return this.platformAdminService.getOverview();
  }
}

