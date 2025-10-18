import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';
import { DealStage } from '../database/entities/deal.entity';

@ApiTags('Deals')
@Controller('deals')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all deals with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Deals retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) query: QueryDealsDto,
  ) {
    return this.dealsService.findAll(workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get deal statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Deal statistics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getStats(@CurrentWorkspace('id') workspaceId: string) {
    return this.dealsService.getStats(workspaceId);
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get deal pipeline view' })
  @ApiResponse({ status: 200, description: 'Pipeline data retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getPipeline(@CurrentWorkspace('id') workspaceId: string) {
    return this.dealsService.getPipeline(workspaceId);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Get deals forecast by month' })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to forecast', type: Number })
  @ApiResponse({ status: 200, description: 'Forecast data retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getForecast(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    return this.dealsService.getForecast(workspaceId, months);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deal by ID' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  @ApiQuery({ name: 'include', required: false, description: 'Relations to include (owner,contact,company,tasks,activities)' })
  @ApiResponse({ status: 200, description: 'Deal retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  @Roles('admin', 'user', 'viewer')
  async findOne(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('include') include?: string,
  ) {
    const relations = include ? include.split(',').filter(r => ['owner', 'contact', 'company', 'tasks', 'activities'].includes(r)) : [];
    return this.dealsService.findOne(workspaceId, id, relations);
  }

  @Post()
  @ApiOperation({ summary: 'Create new deal' })
  @ApiBody({ type: CreateDealDto })
  @ApiResponse({ status: 201, description: 'Deal created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @Roles('admin', 'user')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) createDealDto: CreateDealDto,
  ) {
    return this.dealsService.create(workspaceId, createDealDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update deal by ID' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  @ApiBody({ type: UpdateDealDto })
  @ApiResponse({ status: 200, description: 'Deal updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  @Roles('admin', 'user')
  async update(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateDealDto: UpdateDealDto,
  ) {
    return this.dealsService.update(workspaceId, id, updateDealDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete deal by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  @ApiResponse({ status: 204, description: 'Deal deleted successfully' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'user')
  async remove(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.dealsService.remove(workspaceId, id);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Update deal stage' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  @ApiBody({ schema: { type: 'object', properties: { stage: { enum: Object.values(DealStage) } } } })
  @ApiResponse({ status: 200, description: 'Deal stage updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid stage value' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  @Roles('admin', 'user')
  async updateStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stage') stage: DealStage,
  ) {
    if (!Object.values(DealStage).includes(stage)) {
      throw new BadRequestException('Invalid stage value');
    }
    return this.dealsService.updateStage(workspaceId, id, stage);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete deals' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } } })
  @ApiResponse({ status: 200, description: 'Deals deleted successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkDelete(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    return this.dealsService.bulkDelete(workspaceId, ids);
  }

  @Post('bulk/stage')
  @ApiOperation({ summary: 'Bulk update deal stage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        stage: { enum: Object.values(DealStage) }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Deal stages updated successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkUpdateStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
    @Body('stage') stage: DealStage,
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    if (!Object.values(DealStage).includes(stage)) {
      throw new BadRequestException('Invalid stage value');
    }
    return this.dealsService.bulkUpdateStage(workspaceId, ids, stage);
  }

  @Get('analytics/velocity')
  @ApiOperation({ summary: 'Get deal velocity metrics' })
  @ApiResponse({ status: 200, description: 'Velocity metrics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getVelocity(@CurrentWorkspace('id') workspaceId: string) {
    return this.dealsService.getVelocityMetrics(workspaceId);
  }

  @Get('analytics/conversion')
  @ApiOperation({ summary: 'Get conversion rates between stages' })
  @ApiResponse({ status: 200, description: 'Conversion rates retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getConversionRates(@CurrentWorkspace('id') workspaceId: string) {
    return this.dealsService.getConversionRates(workspaceId);
  }

  @Get('analytics/stages')
  @ApiOperation({ summary: 'Get comprehensive stage analytics' })
  @ApiResponse({ status: 200, description: 'Stage analytics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getStageAnalytics(@CurrentWorkspace('id') workspaceId: string) {
    return this.dealsService.getStageAnalytics(workspaceId);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move deal to a different stage' })
  @ApiParam({ name: 'id', description: 'Deal ID' })
  @ApiBody({ schema: { type: 'object', properties: { stage: { enum: Object.values(DealStage) } } } })
  @ApiResponse({ status: 200, description: 'Deal moved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid stage' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  @Roles('admin', 'user')
  async moveDealToStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stage') stage: DealStage,
  ) {
    if (!Object.values(DealStage).includes(stage)) {
      throw new BadRequestException('Invalid stage value');
    }
    return this.dealsService.moveToStage(workspaceId, id, stage);
  }
}