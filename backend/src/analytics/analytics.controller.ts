import { BadRequestException, Controller, Get, ParseIntPipe, Query, UseGuards, ValidationPipe } from '@nestjs/common';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DateRangeDto, TimeRange } from './dto/date-range.dto';

/** A quarter and a bit: enough for any report anyone reads, bounded enough
 * that the per-day fan-out cannot exhaust the connection pool. */
const MAX_TREND_DAYS = 120;

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard overview with key metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard overview retrieved' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getDashboard(@CurrentWorkspace('id') workspaceId: string) {
    return this.analyticsService.getDashboardOverview(workspaceId);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales metrics and performance' })
  @ApiQuery({ name: 'range', required: false, enum: TimeRange })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Sales metrics retrieved' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager')
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
  @Roles('admin', 'manager')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getLeaderboard(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('metric') metric?: 'revenue' | 'deals' | 'winRate',
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.analyticsService.getLeaderboard(workspaceId, metric || 'revenue', limit || 10);
  }

  @Get('system-logs')
  @ApiOperation({ summary: 'Get unified system logs (admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of logs (20-500)' })
  @ApiResponse({ status: 200, description: 'System logs retrieved' })
  @Roles('admin')
  async getSystemLogs(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.analyticsService.getSystemLogs(workspaceId, limit || 200);
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

  @Get('kpis/daily')
  @ApiOperation({ summary: 'Get daily KPIs' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Daily KPIs retrieved' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getDailyKPIs(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('userId') userId?: string,
  ) {
    const targetDate = date ? new Date(date) : undefined;
    // A manager may ask about anyone; everyone else gets their own numbers
    // whatever they ask for, so the report cannot be used to read the team's.
    const isManager = ['admin', 'manager'].includes(user?.role);
    const scoped = isManager ? userId || undefined : user?.id;
    return this.analyticsService.getDailyKPIs(workspaceId, targetDate, scoped);
  }

  @Get('kpis/trend')
  @ApiOperation({ summary: 'Get KPI trend over time' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'KPI trend retrieved' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getKPITrend(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    // This endpoint fans out one set of queries per day in the range, all at
    // once. Unvalidated it answered a request with no dates by throwing a
    // RangeError, and a decade-wide range by issuing thousands of concurrent
    // queries — enough to starve every other request, from any role.
    const start = this.parseReportDate(startDate, 'startDate');
    const end = this.parseReportDate(endDate, 'endDate');

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must not be later than endDate');
    }

    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > MAX_TREND_DAYS) {
      throw new BadRequestException(
        `Intervalul este prea mare (${days} zile). Maxim ${MAX_TREND_DAYS}.`,
      );
    }

    return this.analyticsService.getKPITrend(workspaceId, start, end);
  }

  private parseReportDate(value: string | undefined, field: string): Date {
    if (!value) {
      throw new BadRequestException(`${field} is required`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} is not a valid date`);
    }
    return date;
  }

  @Get('eod-report')
  @ApiOperation({ summary: 'Generate End of Day report' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'EOD report generated' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
  async getEODReport(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: any,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : undefined;
    // Managers and admins see the whole workspace; everyone else sees their own
    // day. Without this the report would leak the team's numbers to a caller.
    const isManager = ['admin', 'manager'].includes(user?.role);
    return this.analyticsService.generateEODReport(
      workspaceId,
      targetDate,
      isManager ? undefined : user?.id,
    );
  }
}
