import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
  HealthCheck,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';

/**
 * Health check controller for monitoring application status
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check application health status' })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'Application is unhealthy',
  })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Public()
  @Get('readiness')
  @ApiOperation({ summary: 'Check application readiness' })
  readiness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SlackCRM API',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('liveness')
  @ApiOperation({ summary: 'Check application liveness' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('metrics')
  @ApiOperation({ summary: 'Get application metrics' })
  async metrics() {
    const memUsage = process.memoryUsage();

    return {
      uptime: process.uptime(),
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      },
      cpu: {
        user: process.cpuUsage().user,
        system: process.cpuUsage().system,
      },
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }
}