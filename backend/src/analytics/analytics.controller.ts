import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { DateRangeDto, TimeRange } from './dto/date-range.dto';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard overview with key metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard overview retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getDashboard(@CurrentWorkspace('id') workspaceId: string) {
    return this.analyticsService.getDashboardOverview(workspaceId);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales metrics and performance' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Sales metrics retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getSalesMetrics(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) dateRange: DateRangeDto,
  ) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    return this.analyticsService.getSalesMetrics(workspaceId, startDate, endDate);
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Get contacts metrics and trends' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Contacts metrics retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getContactsMetrics(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) dateRange: DateRangeDto,
  ) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    return this.analyticsService.getContactsMetrics(workspaceId, startDate, endDate);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Get tasks metrics and completion rates' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Tasks metrics retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getTasksMetrics(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) dateRange: DateRangeDto,
  ) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    return this.analyticsService.getTasksMetrics(workspaceId, startDate, endDate);
  }

  @Get('activity-trend')
  @ApiOperation({ summary: 'Get activity trends over time' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month'] })
  @ApiResponse({ status: 200, description: 'Activity trend retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getActivityTrend(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) dateRange: DateRangeDto,
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
  ) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    return this.analyticsService.getActivityTrend(workspaceId, startDate, endDate, groupBy || 'day');
  }

  @Get('revenue-forecast')
  @ApiOperation({ summary: 'Get revenue forecast for upcoming months' })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to forecast', type: Number })
  @ApiResponse({ status: 200, description: 'Revenue forecast retrieved' })
  @Roles('admin', 'user')
  async getRevenueForecast(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    return this.analyticsService.getRevenueForecast(workspaceId, months || 3);
  }

  @Get('team-performance')
  @ApiOperation({ summary: 'Get team performance metrics' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Team performance retrieved' })
  @Roles('admin', 'user')
  async getTeamPerformance(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) dateRange: DateRangeDto,
  ) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    return this.analyticsService.getTeamPerformance(workspaceId, startDate, endDate);
  }

  @Get('comprehensive')
  @ApiOperation({ summary: 'Get comprehensive dashboard with all analytics' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiResponse({ status: 200, description: 'Comprehensive dashboard retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getComprehensiveDashboard(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('range') range?: TimeRange,
  ) {
    return this.analyticsService.getComprehensiveDashboard(workspaceId, range);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get sales team leaderboard' })
  @ApiQuery({ name: 'metric', required: false, enum: ['revenue', 'deals', 'winRate'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved' })
  @Roles('admin', 'user', 'viewer')
  async getLeaderboard(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('metric') metric?: 'revenue' | 'deals' | 'winRate',
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.analyticsService.getLeaderboard(workspaceId, metric || 'revenue', limit || 10);
  }

  private getDateRange(dateRange: DateRangeDto): { startDate: Date; endDate: Date } {
    if (dateRange.startDate && dateRange.endDate) {
      return {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      };
    }

    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    switch (dateRange.range) {
      case TimeRange.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case TimeRange.YESTERDAY:
        startDate = new Date(now.setDate(now.getDate() - 1));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case TimeRange.LAST_7_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case TimeRange.LAST_30_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case TimeRange.LAST_90_DAYS:
        startDate = new Date(now.setDate(now.getDate() - 90));
        break;
      case TimeRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case TimeRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    return { startDate, endDate };
  }
}